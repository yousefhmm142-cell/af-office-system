<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Present;
use App\Models\AttendanceDay;
use App\Models\Branch;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Services\AttendanceService;
use App\Support\Access;
use App\Support\Audit;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class RosterController extends Controller
{
    public function week(Request $request, Branch $branch, User $user, AttendanceService $attendance): JsonResponse
    {
        abort_unless(Access::allowsBranch($request->user(), 'schedules.manage', $branch->id) && $user->branch_id === $branch->id, 403);
        $data = $request->validate(['start' => ['required', 'date_format:Y-m-d']]);
        $start = CarbonImmutable::parse($data['start'], $attendance->tz());
        $previous = $start->subWeek();
        $rows = DB::table('employee_shifts')->where('branch_id', $branch->id)->where('user_id', $user->id)
            ->whereBetween('date', [$previous->toDateString(), $start->addDays(6)->toDateString()])->get()->keyBy('date');
        $days = [];
        foreach (range(0, 6) as $offset) {
            $date = $start->addDays($offset)->toDateString();
            $values = [];
            foreach ([$date, $previous->addDays($offset)->toDateString()] as $key) {
                $row = $rows->get($key);
                $snapshot = $row ? json_decode($row->schedule, true) : null;
                $values[] = $row ? ($row->is_rest ? 'rest' : (string) $snapshot['id']) : '';
            }
            $current = $rows->get($date);
            $details = $current ? json_decode($current->schedule, true) : null;
            $days[] = ['date' => $date, 'value' => $values[0], 'previous' => $values[1],
                'label' => $current && ! $current->is_rest ? $details['name'].' ('.$details['start_time'].' – '.$details['end_time'].')' : null,
                'version' => $current ? hash('sha256', $current->schedule) : 'none'];

        }

        return response()->json(['days' => $days, 'today' => $attendance->now()->toDateString()]);
    }

    public function save(Request $request, Branch $branch, User $user, AttendanceService $attendance): JsonResponse
    {
        abort_unless(Access::allowsBranch($request->user(), 'schedules.manage', $branch->id) && $user->branch_id === $branch->id, 403);
        $data = $request->validate([
            'days' => ['required', 'array', 'min:1', 'max:7'],
            'days.*.date' => ['required', 'distinct', 'date_format:Y-m-d', 'after_or_equal:'.$attendance->now()->toDateString()],
            'days.*.version' => ['sometimes', 'required', 'string', 'max:64'],
            'days.*.value' => ['present', 'nullable', Rule::in(['rest', ...WorkSchedule::where('branch_id', $branch->id)->pluck('id')->all()])],
        ]);
        DB::transaction(function () use ($data, $user, $branch, $attendance) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_unless($locked->branch_id === $branch->id, 403);
            foreach ($data['days'] as $day) {
                $key = ['user_id' => $user->id, 'date' => $day['date']];
                if (isset($day['version'])) {
                    $current = DB::table('employee_shifts')->where($key)->value('schedule');
                    abort_if($day['version'] !== ($current ? hash('sha256', $current) : 'none'), 409, 'عُدّل الجدول من جهاز آخر. أعد تحميل الأسبوع قبل الحفظ.');
                }
                if (AttendanceDay::where($key)->exists()) {
                    throw ValidationException::withMessages(['days' => 'سُجّل حضور لهذا اليوم. تعذّر تغيير المناوبة.']);
                }
                if ($day['value'] === null) {
                    DB::table('employee_shifts')->where($key)->delete();

                    continue;
                }
                $rest = $day['value'] === 'rest';
                $s = $rest ? $attendance->baseSchedule($user) : WorkSchedule::where('branch_id', $branch->id)->findOrFail($day['value']);
                $snapshot = $s ? Present::schedule($s) : ['branch_id' => $branch->id, 'overtime_round_minutes' => 1];
                if ($rest) {
                    $snapshot['name'] = 'راحة أسبوعية';
                }
                $snapshot['work_days'] = $rest ? [] : WorkSchedule::ALL_DAYS;
                DB::table('employee_shifts')->updateOrInsert($key, [
                    'branch_id' => $branch->id, 'is_rest' => $rest, 'schedule' => json_encode($snapshot, JSON_THROW_ON_ERROR),
                ]);
            }
            Audit::log('employee.roster', $user, null, $data);
        });

        return response()->json(['ok' => true]);
    }
}
