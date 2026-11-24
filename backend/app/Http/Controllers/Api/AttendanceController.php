<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceDay;
use App\Models\AttendanceEdit;
use App\Models\AttendancePunch;
use App\Models\User;
use App\Services\AttendanceService;
use App\Support\Access;
use App\Support\Audit;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AttendanceController extends Controller
{
    public function __construct(private AttendanceService $svc) {}

    /** The in-app button or a QR scan. Always answers 200 with a status, so a phone queue can tell «retry» from «refused». */
    public function punch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'method' => ['required', Rule::in(['qr', 'app'])],
            'code' => ['required_if:method,qr', 'nullable', 'string', 'max:64'],
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
            'acc' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'device_time' => ['nullable', 'date'],
            'offline' => ['sometimes', 'boolean'],
            'uuid' => ['nullable', 'uuid'],
            'peek' => ['sometimes', 'boolean'],
        ]);
        $res = $this->svc->punch($request->user(), $data + ['ip' => $request->ip()]);

        return response()->json([
            'ok' => in_array($res['status'], ['in', 'out', 'duplicate'], true),
            'status' => $res['status'],
            'message' => $res['message'],
            'wait_until' => $res['wait_until'] ?? null,
            'day' => $res['day'] ? $this->day($res['day']) : null,
        ]);
    }

    /** My month: days, totals, and what the button does now. */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        $month = $request->validate(['month' => ['nullable', 'date_format:Y-m']])['month'] ?? $this->svc->now()->format('Y-m');
        [$from, $to] = $this->monthRange($month);
        $days = AttendanceDay::where('user_id', $user->id)->whereBetween('date', [$from, $to])->orderByDesc('date')->get();
        $next = $this->svc->punch($user, ['method' => 'app', 'peek' => true]);
        $schedule = $this->svc->scheduleFor($user);

        return response()->json([
            'month' => $month,
            'today' => $this->svc->now()->toDateString(),
            'next' => ['status' => $next['status'], 'message' => $next['message'], 'wait_until' => $next['wait_until'] ?? null],
            'today_day' => $next['day'] ? $this->day($next['day']) : null,
            'schedule' => $schedule ? \App\Http\Present::schedule($schedule) : null,
            'days' => $days->map(fn ($d) => $this->day($d)),
            'totals' => $this->totals($days),
        ]);
    }

    /** One branch, one day: everyone who should attend and where they stand. */
    public function board(Request $request): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate(['branch_id' => ['nullable', 'integer'], 'date' => ['nullable', 'date_format:Y-m-d']]);
        $branchId = $data['branch_id'] ?? $actor->branch_id;
        abort_unless($branchId && Access::allowsBranch($actor, 'attendance.view', (int) $branchId), 403, 'ليست لديك صلاحية على حضور هذا الفرع.');
        $date = $data['date'] ?? $this->svc->now()->toDateString();
        $d = CarbonImmutable::parse($date, $this->svc->tz());
        $now = $this->svc->now();

        $people = User::where('branch_id', $branchId)->where('is_active', true)->with('employee', 'role')
            ->whereHas('employee', fn ($q) => $q->where('tracks_attendance', true)->where('status', '!=', 'terminated'))
            ->orderBy('name')->get();
        $days = AttendanceDay::where('date', $date)->whereIn('user_id', $people->pluck('id'))->get()->keyBy('user_id');

        $rows = $people->map(function (User $u) use ($days, $d, $now) {
            $day = $days[$u->id] ?? null;
            $schedule = $this->svc->scheduleFor($u);
            $work = $schedule ? $this->svc->isWorkDay($schedule, $d, $u->branch_id) : true;
            $state = match (true) {
                $day && $day->check_out !== null => 'left',
                $day && $day->check_in !== null => $day->late_minutes > 0 ? 'late' : 'present',
                ! $work => 'off',
                $this->isAbsent($d, $now, $schedule) => 'absent',
                default => 'not_yet',
            };

            return [
                'user' => ['id' => $u->id, 'name' => $u->name, 'job_title' => $u->employee?->job_title ?? $u->role?->name],
                'state' => $state,
                'schedule' => $schedule ? substr((string) $schedule->start_time, 0, 5).'–'.substr((string) $schedule->end_time, 0, 5) : null,
                'day' => $day ? $this->day($day) : null,
            ];
        });
        $count = fn ($s) => $rows->where('state', $s)->count();

        return response()->json([
            'date' => $date,
            'branch_id' => (int) $branchId,
            'rows' => $rows->values(),
            'summary' => [
                'expected' => $rows->where('state', '!=', 'off')->count(),
                'present' => $count('present') + $count('late') + $count('left'),
                'late' => $rows->filter(fn ($r) => ($r['day']['late_minutes'] ?? 0) > 0)->count(),
                'absent' => $count('absent'),
                'pending' => $rows->filter(fn ($r) => ($r['day']['approval_status'] ?? null) === 'pending')->count(),
            ],
            'can_manage' => Access::allowsBranch($actor, 'attendance.manage', (int) $branchId),
        ]);
    }

    /** A table of days, filtered by branch, person and dates. */
    public function days(Request $request): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer'],
            'user_id' => ['nullable', 'integer'],
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        if (CarbonImmutable::parse($data['from'])->diffInDays(CarbonImmutable::parse($data['to'])) > 92) {
            throw ValidationException::withMessages(['to' => 'أقصى مدة ثلاثة أشهر.']);
        }
        $q = Access::limit(AttendanceDay::query(), $actor, 'attendance.view', 'branch_id', 'user_id')
            ->with('user:id,name')
            ->whereBetween('date', [$data['from'], $data['to']])
            ->when($data['branch_id'] ?? null, fn ($q, $v) => $q->where('branch_id', $v))
            ->when($data['user_id'] ?? null, fn ($q, $v) => $q->where('user_id', $v))
            ->orderByDesc('date')->orderBy('user_id');
        $days = $q->limit(3000)->get();

        return response()->json(['days' => $days->map(fn ($d) => $this->day($d) + ['user' => $d->user?->only('id', 'name')]), 'totals' => $this->totals($days)]);
    }

    /** The branch manager enters or corrects a day (also for someone without a phone). Every change is kept. */
    public function setDay(Request $request): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')],
            'date' => ['required', 'date_format:Y-m-d'],
            'check_in' => ['nullable', 'date_format:H:i'],
            'check_out' => ['nullable', 'date_format:H:i'],
            'reason' => ['nullable', 'string', 'max:300'],
        ]);
        $target = User::with('role', 'employee')->findOrFail($data['user_id']);
        abort_if($actor->id === $target->id && ! $actor->isSuperAdmin(), 403, 'لا يمكنك تعديل حضورك بنفسك.');
        UserController::assertCanManage($actor, $target->role, $target->branch_id, 'attendance.manage');
        if ($data['date'] > $this->svc->now()->toDateString()) {
            throw ValidationException::withMessages(['date' => 'لا يمكن تسجيل يوم لم يأتِ بعد.']);
        }
        if (! $data['check_in'] && $data['check_out']) {
            throw ValidationException::withMessages(['check_in' => 'أدخل وقت الحضور قبل الانصراف.']);
        }
        $tz = $this->svc->tz();
        $in = $data['check_in'] ? CarbonImmutable::parse("{$data['date']} {$data['check_in']}", $tz)->utc() : null;
        $out = $data['check_out'] ? CarbonImmutable::parse("{$data['date']} {$data['check_out']}", $tz)->utc() : null;
        if ($in && $out && $out->lessThanOrEqualTo($in)) {
            throw ValidationException::withMessages(['check_out' => 'يجب أن يكون الانصراف بعد الحضور.']);
        }

        $day = DB::transaction(function () use ($target, $data, $in, $out, $actor, $tz) {
            $day = AttendanceDay::firstOrNew(['user_id' => $target->id, 'date' => $data['date']]);
            $old = $day->exists ? ['check_in' => $this->hm($day->check_in), 'check_out' => $this->hm($day->check_out)] : null;
            $day->branch_id ??= $target->branch_id;
            $day->check_in = $in;
            $day->check_out = $out;
            $day->manually_edited = true;
            $day->approval_status = 'approved';
            $day->approved_by = $actor->id;
            $day->approved_at = now();
            $this->svc->recompute($day, $target);
            $day->save();

            foreach (['in' => $in, 'out' => $out] as $kind => $at) {
                if ($at && ! $day->punches()->where('kind', $kind)->where('at', $at)->exists()) {
                    AttendancePunch::create([
                        'user_id' => $target->id, 'branch_id' => $day->branch_id, 'attendance_day_id' => $day->id, 'kind' => $kind,
                        'at' => $at, 'method' => 'manual', 'recorded_by' => $actor->id, 'reason' => $data['reason'] ?? null,
                    ]);
                }
            }
            AttendanceEdit::create([
                'attendance_day_id' => $day->id, 'edited_by' => $actor->id, 'old_values' => $old,
                'new_values' => ['check_in' => $data['check_in'], 'check_out' => $data['check_out']], 'reason' => $data['reason'] ?? null,
            ]);
            Audit::log('attendance.edited', $target, $old, ['date' => $data['date'], 'check_in' => $data['check_in'], 'check_out' => $data['check_out']], $data['reason'] ?? null, $day->branch_id);

            return $day;
        });

        return response()->json(['day' => $this->day($day->fresh())]);
    }

    public function approve(Request $request): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate([
            'ids' => ['required_without:date', 'array', 'max:2000'],
            'ids.*' => ['integer'],
            'branch_id' => ['required_with:date', 'nullable', 'integer'],
            'date' => ['nullable', 'date_format:Y-m-d'],
        ]);
        $q = AttendanceDay::query()->where('approval_status', 'pending');
        if (! empty($data['ids'])) {
            $q->whereIn('id', $data['ids']);
        } else {
            $q->where('branch_id', $data['branch_id'])->where('date', $data['date']);
        }
        $days = $q->get()->filter(fn ($d) => Access::allowsBranch($actor, 'attendance.manage', $d->branch_id) && $d->user_id !== $actor->id);
        AttendanceDay::whereIn('id', $days->pluck('id'))->update(['approval_status' => 'approved', 'approved_by' => $actor->id, 'approved_at' => now()]);
        if ($days->isNotEmpty()) {
            Audit::log('attendance.approved', null, null, ['count' => $days->count(), 'date' => $data['date'] ?? null], null, $days->first()->branch_id);
        }

        return response()->json(['approved' => $days->count()]);
    }

    public function history(Request $request, AttendanceDay $day): JsonResponse
    {
        abort_unless(
            $day->user_id === $request->user()->id || Access::allowsBranch($request->user(), 'attendance.view', $day->branch_id),
            403, 'ليست لديك صلاحية.'
        );
        $punches = $day->punches()->orderBy('at')->get()->map(fn ($p) => [
            'kind' => $p->kind, 'at' => $p->at->toIso8601String(), 'method' => $p->method, 'offline' => $p->recorded_offline,
            'by' => $p->recorded_by ? User::find($p->recorded_by)?->name : null, 'reason' => $p->reason,
        ]);
        $edits = AttendanceEdit::where('attendance_day_id', $day->id)->orderBy('id')->get()->map(fn ($e) => [
            'old' => $e->old_values, 'new' => $e->new_values, 'reason' => $e->reason,
            'by' => $e->edited_by ? User::find($e->edited_by)?->name : null, 'at' => $e->created_at?->toIso8601String(),
        ]);

        return response()->json(['punches' => $punches, 'edits' => $edits]);
    }

    private function isAbsent(CarbonImmutable $date, CarbonImmutable $now, $schedule): bool
    {
        if ($date->toDateString() < $now->toDateString()) {
            return true;
        }
        if ($date->toDateString() > $now->toDateString() || ! $schedule) {
            return false;
        }
        $cut = $schedule->absent_after ?: $schedule->end_time;

        return $now->format('H:i:s') >= (string) $cut;
    }

    private function monthRange(string $month): array
    {
        $start = CarbonImmutable::parse("{$month}-01");

        return [$start->toDateString(), $start->endOfMonth()->toDateString()];
    }

    private function totals($days): array
    {
        return [
            'days' => $days->whereNotNull('check_in')->count(),
            'worked_minutes' => (int) $days->sum('worked_minutes'),
            'late_minutes' => (int) $days->sum('late_minutes'),
            'overtime_minutes' => (int) $days->sum('overtime_minutes'),
            'late_days' => $days->where('late_minutes', '>', 0)->count(),
        ];
    }

    private function hm($t): ?string
    {
        return $t ? CarbonImmutable::instance($t)->setTimezone($this->svc->tz())->format('H:i') : null;
    }

    private function day(AttendanceDay $d): array
    {
        return [
            'id' => $d->id,
            'user_id' => $d->user_id,
            'date' => $d->date->format('Y-m-d'),
            'check_in' => $this->hm($d->check_in),
            'check_out' => $this->hm($d->check_out),
            'worked_minutes' => $d->worked_minutes,
            'late_minutes' => $d->late_minutes,
            'overtime_minutes' => $d->overtime_minutes,
            'is_work_day' => $d->is_work_day,
            'recorded_offline' => $d->recorded_offline,
            'manually_edited' => $d->manually_edited,
            'approval_status' => $d->approval_status,
        ];
    }
}
