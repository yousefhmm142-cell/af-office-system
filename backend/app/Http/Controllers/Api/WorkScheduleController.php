<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Present;
use App\Models\WorkSchedule;
use App\Support\Access;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WorkScheduleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = Access::limit(WorkSchedule::query(), $request->user(), 'schedules.view')
            ->when($request->integer('branch_id'), fn ($q, $b) => $q->where('branch_id', $b))
            ->orderBy('branch_id')->orderByDesc('is_default')->orderBy('name');

        return response()->json(['schedules' => $q->get()->map(fn ($s) => Present::schedule($s))]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, null);
        abort_unless(Access::allowsBranch($request->user(), 'schedules.manage', $data['branch_id']), 403, 'ليست لديك صلاحية على دوامات هذا الفرع.');

        $schedule = DB::transaction(function () use ($data) {
            $s = WorkSchedule::create($data);
            $this->keepOneDefault($s);

            return $s;
        });
        Audit::log('schedule.created', $schedule, null, Present::schedule($schedule));

        return response()->json(['schedule' => Present::schedule($schedule->fresh())], 201);
    }

    public function update(Request $request, WorkSchedule $schedule): JsonResponse
    {
        abort_unless(Access::allowsBranch($request->user(), 'schedules.manage', $schedule->branch_id), 403, 'ليست لديك صلاحية على دوامات هذا الفرع.');
        $data = $this->validated($request, $schedule);
        unset($data['branch_id']);
        $before = Present::schedule($schedule);

        DB::transaction(function () use ($schedule, $data) {
            $schedule->fill($data)->save();
            $this->keepOneDefault($schedule);
        });
        Audit::log('schedule.updated', $schedule, $before, Present::schedule($schedule->fresh()));

        return response()->json(['schedule' => Present::schedule($schedule->fresh())]);
    }

    public function destroy(Request $request, WorkSchedule $schedule): JsonResponse
    {
        abort_unless(Access::allowsBranch($request->user(), 'schedules.manage', $schedule->branch_id), 403, 'ليست لديك صلاحية على دوامات هذا الفرع.');
        if ($schedule->is_default) {
            return response()->json(['message' => 'هذا هو الدوام الأساسي للفرع. اجعل دواماً آخر أساسياً قبل حذفه.', 'code' => 'default_schedule'], 422);
        }
        $schedule->delete();
        Audit::log('schedule.deleted', $schedule, Present::schedule($schedule));

        return response()->json(['ok' => true]);
    }

    private function validated(Request $request, ?WorkSchedule $schedule): array
    {
        $branchId = $schedule?->branch_id ?? $request->integer('branch_id');
        $req = $schedule ? 'sometimes' : 'required';

        $data = $request->validate([
            'branch_id' => [$schedule ? 'prohibited' : 'required', 'integer', Rule::exists('branches', 'id')->whereNull('deleted_at')],
            'name' => [$req, 'string', 'min:2', 'max:60', Rule::unique('work_schedules', 'name')->where('branch_id', $branchId)->whereNull('deleted_at')->ignore($schedule?->id)],
            'start_time' => [$req, 'date_format:H:i'],
            'end_time' => [$req, 'date_format:H:i'],
            'grace_minutes' => ['sometimes', 'integer', 'min:0', 'max:120'],
            'absent_after' => ['sometimes', 'nullable', 'date_format:H:i'],
            'overtime_min_minutes' => ['sometimes', 'integer', 'min:0', 'max:240'],
            'overtime_round_minutes' => ['sometimes', 'integer', 'min:1', 'max:60'],
            'work_days' => [$req, 'array', 'min:1'],
            'work_days.*' => ['integer', 'distinct', 'between:1,7'],
            'is_default' => ['sometimes', 'boolean'],
        ]);

        $start = $data['start_time'] ?? substr((string) $schedule?->start_time, 0, 5);
        $end = $data['end_time'] ?? substr((string) $schedule?->end_time, 0, 5);
        $overnight = $request->validate(['overnight' => ['sometimes', 'boolean']])['overnight'] ?? ($schedule && $schedule->end_time < $schedule->start_time);
        if ($end === $start || (($end < $start) !== (bool) $overnight)) {
            throw ValidationException::withMessages(['end_time' => 'تحقق من وقت النهاية وخيار الانصراف في اليوم التالي.']);
        }
        if (isset($data['work_days'])) {
            $data['work_days'] = collect($data['work_days'])->map(fn ($d) => (int) $d)->sort()->values()->all();
        }

        return $data;
    }

    /** Exactly one default schedule per branch. */
    private function keepOneDefault(WorkSchedule $s): void
    {
        if ($s->is_default) {
            WorkSchedule::where('branch_id', $s->branch_id)->where('id', '!=', $s->id)->update(['is_default' => false]);
        } elseif (! WorkSchedule::where('branch_id', $s->branch_id)->where('is_default', true)->exists()) {
            $s->forceFill(['is_default' => true])->save();
        }
    }
}
