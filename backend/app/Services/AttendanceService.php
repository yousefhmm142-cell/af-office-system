<?php

namespace App\Services;

use App\Models\AttendanceDay;
use App\Models\AttendancePoint;
use App\Models\AttendancePunch;
use App\Models\BranchModule;
use App\Models\Holiday;
use App\Models\User;
use App\Models\WorkSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * The attendance rules, kept in one place:
 *  - two punches a day at most: the first is «in», the second «out»;
 *  - «out» is not recorded before an hour after «in» (the answer is «wait» with the time);
 *  - a second scan within two minutes is the same scan («repeat»);
 *  - a QR sheet only works for its own branch, from the office internet once the branch manager
 *    approved it, and within a distance of the office if one was set; «punch anywhere» people skip both;
 *  - the in-app button works from anywhere, and even without internet: the phone sends it later
 *    with the time it was pressed (flagged as offline, accepted up to two days back).
 * Late and overtime minutes follow the person's work schedule (or the branch's default one).
 */
class AttendanceService
{
    public function tz(): string
    {
        return config('app.business_timezone');
    }

    public function now(): CarbonImmutable
    {
        return CarbonImmutable::now($this->tz());
    }

    /**
     * @param  array{method:string, code?:?string, ip?:?string, lat?:?float, lng?:?float, acc?:?float, device_time?:?string, offline?:bool, uuid?:?string, peek?:bool}  $o
     * @return array{status:string, message:string, day?:AttendanceDay|null, wait_until?:string|null, kind?:string}
     */
    public function punch(User $user, array $o): array
    {
        $cfg = config('access.attendance');
        $user->loadMissing('employee', 'branch');
        $emp = $user->employee;

        if (! empty($o['uuid'])) {
            $done = AttendancePunch::where('uuid', $o['uuid'])->first();
            if ($done) {
                abort_unless($done->user_id === $user->id, 409, 'رقم العملية مستعمل.');

                return $this->result('duplicate', $done->kind, AttendanceDay::find($done->attendance_day_id));
            }
        }

        if (! $user->branch_id) {
            return $this->fail('no_branch', 'حسابك مش مربوط بفرع، فما بيسجّل حضور.');
        }
        if (! $emp || ! $emp->tracks_attendance || $emp->status === 'terminated') {
            return $this->fail('not_tracked', 'حسابك ما بيسجّل حضور. راجع شؤون الموظفين.');
        }
        if (! $this->moduleOn($user->branch_id)) {
            return $this->fail('module_off', 'الحضور مسكّر بهاد الفرع.');
        }

        $point = null;
        if ($o['method'] === 'qr') {
            $point = AttendancePoint::where('code', (string) ($o['code'] ?? ''))->first();
            if (! $point || ! $point->is_active) {
                return $this->fail('bad_code', 'ورقة الـQR هاي مش شغّالة. اطلب الورقة الجديدة من مدير الفرع.');
            }
            if ($point->branch_id !== $user->branch_id) {
                return $this->fail('wrong_branch', 'هاي ورقة فرع ثاني. امسح ورقة فرعك.');
            }
            if (! $emp->punch_anywhere) {
                $ips = $point->allowed_ips ?? [];
                if ($point->network_required && $ips && ! in_array($o['ip'] ?? '', $ips, true)) {
                    return $this->fail('wrong_network', 'لازم تكون على إنترنت المكتب (الواي فاي) عشان الـQR يسجّل.');
                }
                if ($point->lat !== null && $point->lng !== null) {
                    if (! isset($o['lat'], $o['lng'])) {
                        return $this->fail('location_needed', 'اسمح للموقع بالجوال عشان يتأكد إنك بالمكتب.');
                    }
                    $slack = min((float) ($o['acc'] ?? $cfg['gps_slack_m']), $cfg['gps_slack_m']);
                    if ($this->distance($point->lat, $point->lng, (float) $o['lat'], (float) $o['lng']) > $point->radius_m + $slack) {
                        return $this->fail('too_far', 'إنت بعيد عن المكتب. امسح الورقة من جوا المكتب.');
                    }
                }
            }
        }

        // When it happened: now, or the time on the phone for a button press saved without internet.
        $at = CarbonImmutable::now();
        $offline = false;
        if ($o['method'] === 'app' && ! empty($o['offline']) && ! empty($o['device_time'])) {
            // Stored in UTC like every other time (the phone sends its own offset).
            $device = CarbonImmutable::parse($o['device_time'])->utc();
            if ($device->isAfter($at->addMinutes(2)) || $device->isBefore($at->subHours($cfg['offline_max_hours']))) {
                return $this->fail('bad_time', 'وقت التسجيل اللي على الجوال مش منطقي. سجّل من جديد.');
            }
            $at = $device->min($at);
            $offline = true;
        }
        $date = $at->setTimezone($this->tz())->toDateString();

        return DB::transaction(function () use ($user, $o, $at, $date, $point, $offline, $cfg) {
            // One punch at a time per person.
            User::whereKey($user->id)->lockForUpdate()->first();
            $day = AttendanceDay::where('user_id', $user->id)->where('date', $date)->first();

            $next = $this->nextStep($day, $at, $cfg);
            if (! empty($o['peek'])) {
                return $next + ['day' => $day];
            }
            if (! in_array($next['status'], ['in', 'out'], true)) {
                return $next + ['day' => $day];
            }

            $day ??= AttendanceDay::create(['user_id' => $user->id, 'branch_id' => $user->branch_id, 'date' => $date]);
            AttendancePunch::create([
                'uuid' => $o['uuid'] ?? null,
                'user_id' => $user->id, 'branch_id' => $user->branch_id, 'attendance_day_id' => $day->id,
                'kind' => $next['status'], 'at' => $at, 'method' => $o['method'], 'point_id' => $point?->id,
                'ip' => $o['ip'] ?? null, 'lat' => $o['lat'] ?? null, 'lng' => $o['lng'] ?? null,
                'device_time' => $offline ? $at : null, 'recorded_offline' => $offline,
            ]);
            $day->fill($next['status'] === 'in' ? ['check_in' => $at] : ['check_out' => $at]);
            $day->recorded_offline = $day->recorded_offline || $offline;
            $this->recompute($day, $user);
            $day->save();

            return $this->result($next['status'], $next['status'], $day);
        });
    }

    /** What the next scan would do. */
    private function nextStep(?AttendanceDay $day, CarbonImmutable $at, array $cfg): array
    {
        if (! $day || ! $day->check_in) {
            return ['status' => 'in', 'kind' => 'in', 'message' => 'تسجيل حضور'];
        }
        if ($day->check_out) {
            return ['status' => 'full', 'message' => 'سجّلت حضورك وانصرافك اليوم. بكرة إن شاء الله.'];
        }
        $since = $day->check_in->diffInSeconds($at, false) / 60;
        $until = CarbonImmutable::instance($day->check_in)->addMinutes($cfg['out_after_minutes'])->toIso8601String();
        if ($since < $cfg['repeat_minutes']) {
            return ['status' => 'repeat', 'message' => 'حضورك مسجّل من شوي.', 'wait_until' => $until];
        }
        if ($since < $cfg['out_after_minutes']) {
            return ['status' => 'wait', 'message' => 'الانصراف بيفتح بعد ساعة من الحضور.', 'wait_until' => $until];
        }

        return ['status' => 'out', 'kind' => 'out', 'message' => 'تسجيل انصراف'];
    }

    /** Late, worked and overtime minutes for a day, from its schedule. */
    public function recompute(AttendanceDay $day, ?User $user = null): void
    {
        $user ??= $day->user;
        $schedule = $this->scheduleFor($user);
        $date = CarbonImmutable::parse($day->date->format('Y-m-d'), $this->tz());
        $workDay = $schedule ? $this->isWorkDay($schedule, $date, $user->branch_id) : true;

        $day->work_schedule_id = $schedule?->id;
        $day->is_work_day = $workDay;
        $in = $day->check_in ? CarbonImmutable::instance($day->check_in) : null;
        $out = $day->check_out ? CarbonImmutable::instance($day->check_out) : null;

        $worked = $in && $out && $out->greaterThan($in) ? intdiv((int) $in->diffInSeconds($out), 60) : 0;
        $late = 0;
        $overtime = 0;
        if ($schedule && $workDay) {
            $start = $date->setTimeFromTimeString((string) $schedule->start_time);
            $end = $date->setTimeFromTimeString((string) $schedule->end_time);
            if ($in && $in->greaterThan($start->addMinutes($schedule->grace_minutes))) {
                $late = intdiv((int) $start->diffInSeconds($in), 60);
            }
            $extra = $worked - intdiv((int) $start->diffInSeconds($end), 60);
            if ($out && $extra >= $schedule->overtime_min_minutes) {
                $overtime = intdiv($extra, $schedule->overtime_round_minutes) * $schedule->overtime_round_minutes;
            }
        } elseif ($schedule && ! $workDay && $worked > 0) {
            // A day off worked counts fully as extra time.
            $overtime = intdiv($worked, $schedule->overtime_round_minutes) * $schedule->overtime_round_minutes;
        }
        $day->worked_minutes = min($worked, 65535);
        $day->late_minutes = min($late, 65535);
        $day->overtime_minutes = min($overtime, 65535);
    }

    public function scheduleFor(User $user): ?WorkSchedule
    {
        $user->loadMissing('employee');
        if ($user->employee?->work_schedule_id) {
            $s = WorkSchedule::find($user->employee->work_schedule_id);
            if ($s) {
                return $s;
            }
        }

        return $user->branch_id ? WorkSchedule::where('branch_id', $user->branch_id)->orderByDesc('is_default')->orderBy('id')->first() : null;
    }

    public function isWorkDay(WorkSchedule $schedule, CarbonImmutable $date, ?int $branchId): bool
    {
        if (! in_array($date->dayOfWeekIso, $schedule->work_days ?? [], true)) {
            return false;
        }

        return ! Holiday::where('date', $date->toDateString())
            ->where(fn ($q) => $q->whereNull('branch_id')->orWhere('branch_id', $branchId))->exists();
    }

    public function moduleOn(int $branchId): bool
    {
        $row = BranchModule::where('branch_id', $branchId)->where('module', 'attendance')->first();

        return $row ? $row->is_enabled : true;
    }

    /** Great-circle distance in metres. */
    public function distance(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return 2 * $r * asin(min(1, sqrt($a)));
    }

    private function fail(string $status, string $message): array
    {
        return ['status' => $status, 'message' => $message, 'day' => null];
    }

    private function result(string $status, string $kind, ?AttendanceDay $day): array
    {
        $message = match ($status) {
            'in' => 'تم تسجيل حضورك',
            'out' => 'تم تسجيل انصرافك',
            default => $kind === 'out' ? 'انصرافك مسجّل' : 'حضورك مسجّل',
        };

        return ['status' => $status, 'kind' => $kind, 'message' => $message, 'day' => $day];
    }
}
