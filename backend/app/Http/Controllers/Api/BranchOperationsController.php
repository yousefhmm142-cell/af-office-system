<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceDay;
use App\Models\BranchModule;
use App\Models\Task;
use App\Models\User;
use App\Support\Access;
use App\Support\DistributionLoads;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BranchOperationsController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $actor = $request->user();
        $branch = $actor->branch_id;
        abort_unless($branch && Access::allowsBranch($actor, 'permissions.branch_manage', $branch), 403);
        $modules = BranchModule::where('branch_id', $branch)->pluck('is_enabled', 'module');
        $allowed = fn (string $module) => ($modules[$module] ?? true) && Access::allowsBranch($actor, $module.'.view', $branch);
        $tz = config('app.business_timezone');
        $today = CarbonImmutable::today($tz);
        $month = $today->startOfMonth()->toDateString();
        $reports = collect();
        $generators = collect();
        if ($allowed('generation')) {
            $stored = DB::table('generation_reports')->where('branch_id', $branch)->whereIn('status', ['submitted', 'approved'])
                ->orderByDesc('report_date')->limit(366)->get(['report_date', 'status', 'figures']);
            $shared = DistributionLoads::query($branch)->whereIn('date', $stored->pluck('report_date'))
                ->get()->groupBy('date');
            $reports = $stored->map(fn ($row) => ['reportDate' => $row->report_date, 'status' => $row->status]
                + DistributionLoads::apply(json_decode($row->figures, true, flags: JSON_THROW_ON_ERROR), $shared->get($row->report_date, [])));
            $generators = DB::table('generation_generators')->where('branch_id', $branch)->get()->map(fn ($row) => [
                'id' => $row->id, 'name' => $row->name, 'brand' => $row->brand,
                'capacityKva' => $row->capacity_kva === null ? null : (float) $row->capacity_kva,
            ]);
        }
        $sheets = $allowed('distribution') ? DB::table('distribution_sheets')->where('branch_id', $branch)
            ->where(fn ($query) => $query->where('sheet_date', '>=', $month)->orWhere('status', 'submitted'))->orderByDesc('sheet_date')->get(['sheet_date', 'status']) : collect();
        $waitingReports = $allowed('generation') ? DB::table('generation_reports')->where('branch_id', $branch)->where('status', 'submitted')
            ->orderBy('report_date')->pluck('report_date') : collect();
        $tasks = $allowed('tasks') ? Task::where('branch_id', $branch)
            ->where(fn ($query) => $query->whereIn('status', Task::OPEN)
                ->orWhere('created_at', '>=', $today->subDays(30)->utc())
                ->orWhere('completed_at', '>=', $today->subDays(7)->utc()))
            ->with(['type:id,name', 'assignees:id,name'])->get() : collect();
        $attendance = $allowed('attendance') ? AttendanceDay::where('branch_id', $branch)
            ->whereBetween('date', [$today->subDay()->toDateString(), $today->toDateString()])
            ->with('user:id,name')->get() : collect();
        $team = Access::allowsBranch($actor, 'users.view', $branch)
            ? User::where('branch_id', $branch)->where('is_active', true)->with('employee:id,user_id,job_title')
                ->orderBy('name')->get(['id', 'name'])->map(fn (User $person) => [
                    'id' => $person->id, 'name' => $person->name, 'title' => $person->employee?->job_title,
                ]) : collect();
        $activeIds = DB::table('personal_access_tokens')->where('tokenable_type', (new User)->getMorphClass())
            ->whereIn('tokenable_id', $team->pluck('id'))->where('last_used_at', '>=', now()->subMinutes(5))->distinct()->pluck('tokenable_id');
        $events = $attendance->filter(fn ($day) => $day->date->toDateString() === $today->toDateString())
            ->flatMap(function ($day) {
                $events = [];
                foreach (['check_in' => 'حضر', 'check_out' => 'انصرف'] as $field => $text) {
                    if ($day->{$field}) {
                        $events[] = [
                            'id' => $day->id.'-'.$field, 'kind' => 'attendance', 'at' => $day->{$field}->toISOString(),
                            'who' => $day->user?->name ?? '—', 'text' => $text, 'route' => '/attendance',
                        ];
                    }
                }

                return $events;
            })->values();

        $taskEvents = $tasks->filter(fn (Task $task) => $task->completed_at?->copy()->timezone($tz)->isSameDay($today))
            ->map(fn (Task $task) => [
                'id' => 'task-'.$task->id, 'kind' => 'task', 'at' => $task->completed_at->toISOString(),
                'who' => $task->assignees->pluck('name')->implode('، ') ?: 'الفريق',
                'text' => 'أنجز المهمة رقم '.$task->number, 'route' => '/tasks?status=done',
            ]);
        $events = $events->concat($taskEvents)->values();

        return response()->json([
            'reports' => $reports, 'generators' => $generators, 'sheets' => $sheets, 'waitingReports' => $waitingReports,
            'tasks' => $tasks->map(fn (Task $task) => [
                'id' => $task->id, 'status' => $task->status, 'type' => $task->type?->name,
                'createdAt' => $task->created_at?->toISOString(), 'startedAt' => $task->started_at?->toISOString(),
                'completedAt' => $task->completed_at?->toISOString(), 'assignees' => $task->assignees->pluck('id'),
            ]),
            'presentYesterday' => $attendance->filter(fn ($day) => $day->date->toDateString() === $today->subDay()->toDateString() && $day->check_in)->count(),
            'team' => $team, 'active' => $team->filter(fn ($person) => $activeIds->contains($person['id']))->values(),
            'events' => $events,
        ]);
    }
}
