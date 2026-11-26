<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceDay;
use App\Models\Branch;
use App\Models\Task;
use App\Models\TaskType;
use App\Models\User;
use App\Services\AttendanceService;
use App\Support\Access;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The weekly or monthly report of a branch: everything recorded in the period (and the period
 * before, for the comparison). The page sums it into sections for the screen, Excel and paper.
 */
class ReportsController extends Controller
{
    public function __construct(private AttendanceService $attendance) {}

    public function show(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'since' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:from'],
            'branch_id' => ['nullable', 'integer'],
        ]);
        $me = $request->user();
        $branchId = (int) ($data['branch_id'] ?? $me->branch_id);
        $can = fn (string $p) => Access::allowsBranch($me, $p, $branchId);
        abort_unless($branchId && ($can('permissions.branch_manage') || $can('generation.view') || $can('tasks.view')), 403, 'ليست لديك صلاحية تقارير هذا الفرع.');
        abort_if(CarbonImmutable::parse($data['from'])->diffInDays(CarbonImmutable::parse($data['to'])) > 62, 422, 'الفترة طويلة جداً.');
        $branch = Branch::findOrFail($branchId);
        $since = $data['since'] ?? $data['from'];
        $tz = config('app.business_timezone');

        $sheet = fn (string $table, string $col, string $key) => DB::table($table)->where('branch_id', $branchId)->where('status', '!=', 'draft')
            ->whereBetween($col, [$since, $data['to']])->orderBy($col)->get()
            ->map(fn ($r) => [$key => $r->{$col}, 'status' => $r->status] + json_decode($r->figures, true));

        $from = CarbonImmutable::parse($since, $tz)->startOfDay()->utc();
        $to = CarbonImmutable::parse($data['to'], $tz)->endOfDay()->utc();
        $tasks = $can('tasks.view') || $can('tasks.manage') ? Task::where('branch_id', $branchId)->where('status', '!=', 'cancelled')
            ->where(fn ($w) => $w->whereBetween('created_at', [$from, $to])->orWhereBetween('completed_at', [$from, $to]))
            ->with('assignees:id')->get()->map(fn (Task $t) => [
                'id' => $t->id, 'status' => $t->status, 'typeId' => $t->task_type_id, 'assignees' => $t->assignees->pluck('id'),
                'createdAt' => $t->created_at?->toISOString(), 'completedAt' => $t->completed_at?->toISOString(),
            ]) : collect();

        return response()->json([
            'branch' => ['id' => $branch->id, 'name' => $branch->name],
            'reports' => $can('generation.view') ? $sheet('generation_reports', 'report_date', 'reportDate') : [],
            'sheets' => $can('distribution.view') ? $sheet('distribution_sheets', 'sheet_date', 'sheetDate') : [],
            'tasks' => $tasks,
            'attendance' => $can('attendance.view') ? $this->attendanceRows($branchId, $data['from'], $data['to']) : [],
            'technicians' => User::where('branch_id', $branchId)->with('employee:id,user_id,job_title')->orderBy('name')->get()
                ->filter(fn (User $u) => str_contains((string) $u->employee?->job_title, 'فني') || $tasks->contains(fn ($t) => $t['assignees']->contains($u->id)))
                ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'active' => (bool) $u->is_active])->values(),
            'generators' => DB::table('generation_generators')->where('branch_id', $branchId)->orderBy('id')->get()
                ->map(fn ($g) => ['id' => $g->id, 'name' => $g->name, 'brand' => $g->brand, 'litersPerHour' => $g->liters_per_hour === null ? null : (float) $g->liters_per_hour]),
            'fuelTypes' => DB::table('generation_fuel_types')->where('branch_id', $branchId)->orderBy('id')->get(['id', 'name']),
            'zones' => DB::table('distribution_zones')->where('branch_id', $branchId)->orderBy('id')->get(['id', 'name']),
            'taskTypes' => TaskType::where(fn ($q) => $q->whereNull('branch_id')->orWhere('branch_id', $branchId))->orderBy('sort_order')->get(['id', 'name']),
        ]);
    }

    /** Per person who records attendance: days present, absent, on leave, overtime and hours worked. */
    private function attendanceRows(int $branchId, string $from, string $to): array
    {
        $tz = config('app.business_timezone');
        $today = CarbonImmutable::now($tz)->startOfDay();
        $people = User::where('branch_id', $branchId)->where('is_active', true)->with('employee')
            ->whereHas('employee', fn ($q) => $q->where('tracks_attendance', true))->orderBy('name')->get();
        $days = AttendanceDay::whereIn('user_id', $people->pluck('id'))->whereBetween('date', [$from, $to])->get()->groupBy('user_id');
        $leave = DB::table('leave_days as d')->join('leave_requests as l', 'l.id', '=', 'd.request_id')->where('l.status', 'approved')
            ->whereIn('l.user_id', $people->pluck('id'))->whereBetween('d.date', [$from, $to])->get(['l.user_id', 'd.date'])
            ->groupBy('user_id')->map(fn ($rows) => $rows->pluck('date')->flip());
        $rows = [];
        foreach ($people as $u) {
            $schedule = $this->attendance->scheduleFor($u);
            $mine = ($days[$u->id] ?? collect())->keyBy(fn ($d) => $d->date->toDateString());
            $present = $absent = $onLeave = 0;
            $overtime = $worked = 0;
            for ($d = CarbonImmutable::parse($from, $tz); $d->lte(CarbonImmutable::parse($to, $tz)) && $d->lt($today); $d = $d->addDay()) {
                $day = $mine[$d->toDateString()] ?? null;
                if ($day?->check_in) {
                    $present++;
                    $overtime += (int) $day->overtime_minutes;
                    if ($day->check_out) {
                        $worked += $day->check_in->diffInMinutes($day->check_out);
                    }
                } elseif (isset($leave[$u->id][$d->toDateString()])) {
                    $onLeave++;
                } elseif ($schedule && $this->attendance->isWorkDay($schedule, $d, $branchId)) {
                    $absent++;
                }
            }
            $rows[] = ['name' => $u->name, 'schedule' => $schedule?->name, 'present' => $present, 'absent' => $absent, 'leave' => $onLeave,
                'overtime' => $overtime, 'hours' => round($worked / 60, 1)];
        }

        return $rows;
    }
}
