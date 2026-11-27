<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceDay;
use App\Models\Branch;
use App\Models\BranchModule;
use App\Models\PayrollBatch;
use App\Models\Task;
use App\Models\User;
use App\Services\AttendanceService;
use Carbon\CarbonImmutable;
use App\Support\Access;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** What the command board's quick file needs beyond the employee file: their field tasks and leave requests. */
class CommandController extends Controller
{
    public function person(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        abort_unless(Access::allowsBranch($actor, 'users.view', $user->branch_id), 403, 'ليست لديك صلاحية على هذا الموظف.');

        $tasks = null;
        if (Access::allowsBranch($actor, 'tasks.view', $user->branch_id) || Access::allowsBranch($actor, 'tasks.manage', $user->branch_id)) {
            $tasks = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $user->id))
                ->where('created_at', '>=', now()->subDays(30))->with('type:id,name')->latest('id')->limit(12)->get()
                ->map(fn (Task $t) => [
                    'id' => $t->id, 'number' => $t->number, 'type' => $t->type?->name, 'status' => $t->status,
                    'subscriber' => $t->subscriber_name, 'expected_minutes' => $t->expected_minutes,
                    'minutes' => $t->started_at && $t->completed_at ? (int) $t->started_at->diffInMinutes($t->completed_at) : null,
                    'late' => $t->expected_minutes && $t->started_at && ! $t->completed_at && $t->started_at->diffInMinutes(now()) > $t->expected_minutes,
                    'sent_at' => $t->sent_at?->toIso8601String(), 'completed_at' => $t->completed_at?->toIso8601String(),
                ]);
        }

        $leaves = null;
        if (Access::allowsBranch($actor, 'leaves.decide', $user->branch_id) || Access::allowsBranch($actor, 'leaves.final', $user->branch_id)) {
            $leaves = DB::table('leave_requests as l')->where('l.user_id', $user->id)->latest('l.id')->limit(8)
                ->select('l.id', 'l.kind', 'l.status', 'l.starts', 'l.ends', 'l.reason', 'l.from_time', 'l.to_time')
                ->selectSub(DB::table('leave_days as d')->whereColumn('d.request_id', 'l.id')->selectRaw('count(*)'), 'days')->get();
        }

        return response()->json(['tasks' => $tasks, 'leaves' => $leaves]);
    }

    /**
     * The decision centre and the live branch map: only what needs a decision, what is going wrong,
     * how the week compares with the last, and how each branch stands right now.
     */
    public function center(Request $request, AttendanceService $svc, AttendanceController $attendance): JsonResponse
    {
        $actor = $request->user();
        $scope = Access::scope($actor, 'attendance.view');
        abort_unless($scope === 'all' || ($scope === 'branch' && $actor->branch_id), 403, 'ليست لديك صلاحية.');
        $tz = $svc->tz();
        $now = $svc->now();
        $today = $now->toDateString();
        $branches = Branch::where('is_active', true)->when($scope !== 'all', fn ($q) => $q->where('id', $actor->branch_id))
            ->with('manager:id,name')->orderBy('name')->get();
        $ids = $branches->modelKeys();
        $closed = fn (string $module) => BranchModule::where('module', $module)->where('is_enabled', false)->pluck('branch_id')->all();
        $names = $branches->pluck('name', 'id');

        // ——— decisions ———
        $leaves = collect();
        $canDecide = Access::scope($actor, 'leaves.decide');
        $canFinal = Access::scope($actor, 'leaves.final');
        if ($canDecide || $canFinal) {
            $leaves = DB::table('leave_requests as l')->join('users as u', 'u.id', '=', 'l.user_id')
                ->where('l.user_id', '!=', $actor->id)
                ->where(fn ($q) => $q->when($canDecide, fn ($w) => $w->orWhere('l.status', 'pending'))->when($canFinal, fn ($w) => $w->orWhere('l.status', 'escalated')))
                ->when(($canDecide ?? $canFinal) !== 'all', fn ($q) => $q->where('l.branch_id', $actor->branch_id))
                ->orderBy('l.starts')->limit(10)
                ->select('l.id', 'l.kind', 'l.status', 'l.starts', 'l.ends', 'l.reason', 'l.from_time', 'l.to_time', 'l.branch_id', 'u.id as user_id', 'u.name')
                ->selectSub(DB::table('leave_days as d')->whereColumn('d.request_id', 'l.id')->selectRaw('count(*)'), 'days')->get()
                ->map(fn ($l) => (array) $l + ['branch' => $names[$l->branch_id] ?? null]);
        }
        $batches = Access::scope($actor, 'payroll.approve') ? PayrollBatch::where('status', 'draft')->with('branch:id,name')->orderBy('month')->limit(6)->get()
            ->filter(fn ($b) => Access::allowsBranch($actor, 'payroll.approve', $b->branch_id))
            ->map(fn ($b) => ['id' => $b->id, 'title' => $b->title, 'month' => $b->month, 'branch' => $b->branch?->name, 'total_net' => (float) $b->total_net, 'employees_count' => $b->employees_count])->values() : collect();
        $pendingDays = Access::scope($actor, 'attendance.manage') ? AttendanceDay::whereIn('branch_id', $ids)->where('approval_status', 'pending')->where('date', '<', $today)
            ->selectRaw('branch_id, count(*) as n, min(date) as since')->groupBy('branch_id')->get()
            ->map(fn ($r) => ['branch_id' => $r->branch_id, 'branch' => $names[$r->branch_id] ?? '', 'count' => (int) $r->n, 'since' => (string) $r->since])->values() : collect();

        // ——— alerts ———
        $monthStart = $now->startOfMonth()->toDateString();
        $lateRepeat = AttendanceDay::whereIn('branch_id', $ids)->whereBetween('date', [$monthStart, $today])->where('late_minutes', '>', 0)
            ->selectRaw('user_id, count(*) as n, sum(late_minutes) as m')->groupBy('user_id')->having('n', '>=', 3)->orderByDesc('n')->limit(8)->get();
        $people = User::whereIn('id', $lateRepeat->pluck('user_id'))->get(['id', 'name', 'branch_id'])->keyBy('id');
        $lateRepeat = $lateRepeat->map(fn ($r) => ['user_id' => $r->user_id, 'name' => $people[$r->user_id]->name ?? '—', 'branch' => $names[$people[$r->user_id]->branch_id ?? 0] ?? '', 'times' => (int) $r->n, 'minutes' => (int) $r->m])->values();

        // Absent on each of the last two working days.
        $absent = collect();
        $workDays = [];
        for ($d = $now->subDay(); count($workDays) < 2 && $d->greaterThan($now->subDays(10)); $d = $d->subDay()) {
            $states = $attendance->boardRows($ids, $d->toDateString())->flatten(1);
            if ($states->contains(fn ($r) => $r['state'] !== 'off')) $workDays[] = $states->keyBy(fn ($r) => $r['user']['id']);
        }
        if (count($workDays) === 2) {
            $absent = $workDays[0]->filter(fn ($r, $id) => $r['state'] === 'absent' && ($workDays[1][$id]['state'] ?? null) === 'absent')
                ->map(fn ($r) => ['user_id' => $r['user']['id'], 'name' => $r['user']['name'], 'branch' => $names[$r['user']['branch_id']] ?? ''])->values()->take(8);
        }

        $taskIds = array_values(array_diff($ids, $closed('tasks')));
        // Field work is followed by HR (and the system admin); management is spared the detail.
        $role = $actor->role?->key;
        $canTasks = $role !== 'management' && ($role === 'hr' || (bool) (Access::scope($actor, 'tasks.view') ?? Access::scope($actor, 'tasks.manage')));
        $open = $canTasks ? Task::whereIn('branch_id', $taskIds)->whereIn('status', Task::OPEN)->with('assignees:id,name', 'type:id,name')->get() : collect();
        $overdue = $open->map(function (Task $t) use ($now) {
            $since = $t->started_at ?? $t->sent_at ?? $t->created_at;
            $limit = $t->expected_minutes ?: 240;
            $over = (int) $since->diffInMinutes($now) - $limit;

            return $over > 0 ? ['id' => $t->id, 'number' => $t->number, 'type' => $t->type?->name, 'status' => $t->status, 'branch_id' => $t->branch_id, 'over' => $over, 'who' => $t->assignees->pluck('name')->implode('، ')] : null;
        })->filter()->sortByDesc('over')->values();

        // ——— the week against the one before ———
        $week = fn (CarbonImmutable $from, CarbonImmutable $to) => AttendanceDay::whereIn('branch_id', $ids)->whereBetween('date', [$from->toDateString(), $to->toDateString()])->whereNotNull('check_in')->get();
        $thisWeek = $week($now->subDays(6), $now);
        $lastWeek = $week($now->subDays(13), $now->subDays(7));
        $sum = fn ($days) => [
            'arrivals' => $days->count(),
            'on_time' => $days->count() ? round($days->where('late_minutes', 0)->count() / $days->count() * 100) : null,
            'hours' => round($days->sum('worked_minutes') / 60),
            'overtime' => round($days->sum('overtime_minutes') / 60),
            'late_minutes' => (int) $days->sum('late_minutes'),
        ];
        $byBranch = $thisWeek->groupBy('branch_id')->map(fn ($days, $b) => ['branch' => $names[$b] ?? '', 'on_time' => round($days->where('late_minutes', 0)->count() / max(1, $days->count()) * 100)])->sortByDesc('on_time')->values();

        // ——— the branches right now ———
        $board = $attendance->boardRows($ids, $today);
        $gen = DB::table('generation_reports')->whereIn('branch_id', $ids)->where('report_date', $today)->pluck('status', 'branch_id');
        $dist = DB::table('distribution_sheets')->whereIn('branch_id', $ids)->where('sheet_date', $today)->pluck('status', 'branch_id');
        $waiting = DB::table('generation_reports')->whereIn('branch_id', $ids)->where('status', 'submitted')->selectRaw('branch_id, count(*) n')->groupBy('branch_id')->pluck('n', 'branch_id');
        $lastGen = DB::table('generation_reports')->whereIn('branch_id', $ids)->whereIn('status', ['submitted', 'approved'])->orderByDesc('report_date')->get(['branch_id', 'report_date', 'figures'])->unique('branch_id')->keyBy('branch_id');
        $off = ['generation' => $closed('generation'), 'distribution' => $closed('distribution'), 'attendance' => $closed('attendance'), 'tasks' => $closed('tasks')];
        $inField = $open->where('status', 'in_progress');

        $branchCards = $branches->map(function (Branch $b) use ($canTasks, $board, $gen, $dist, $waiting, $lastGen, $off, $open, $inField, $overdue, $now, $tz) {
            $rows = $board->get($b->id, collect());
            $fuel = null;
            if ($row = $lastGen->get($b->id)) {
                $f = json_decode($row->figures, true)['fuel'] ?? [];
                $left = array_sum(array_map(fn ($x) => (float) ($x['closingBalance'] ?? 0), $f));
                $use = array_sum(array_map(fn ($x) => (float) ($x['consumption'] ?? 0), $f));
                $fuel = ['litres' => round($left), 'days' => $use > 0 ? round($left / $use, 1) : null, 'as_of' => $row->report_date];
            }
            $mine = $open->where('branch_id', $b->id);

            return [
                'id' => $b->id, 'name' => $b->name, 'manager' => $b->manager?->name,
                'attendance' => in_array($b->id, $off['attendance']) ? null : [
                    'expected' => $rows->whereNotIn('state', ['off', 'leave'])->count(),
                    'present' => $rows->whereIn('state', ['present', 'late', 'left'])->count(),
                    'late' => $rows->filter(fn ($r) => ($r['day']['late_minutes'] ?? 0) > 0)->count(),
                    'absent' => $rows->where('state', 'absent')->count(),
                ],
                'generation' => in_array($b->id, $off['generation']) ? null : ($gen[$b->id] ?? 'none'),
                'distribution' => in_array($b->id, $off['distribution']) ? null : ($dist[$b->id] ?? 'none'),
                'waiting' => (int) ($waiting[$b->id] ?? 0),
                'fuel' => in_array($b->id, $off['generation']) ? null : $fuel,
                'tasks' => (! $canTasks || in_array($b->id, $off['tasks'])) ? null : ['open' => $mine->count(), 'in_field' => $inField->where('branch_id', $b->id)->count(), 'overdue' => $overdue->where('branch_id', $b->id)->count()],
            ];
        })->values();

        // Who is out on a job, and who is in but free.
        $busy = $inField->map(fn (Task $t) => ['task' => $t->number, 'type' => $t->type?->name, 'branch' => $t->branch_id, 'since' => $t->started_at?->toIso8601String(), 'expected' => $t->expected_minutes,
            'people' => $t->assignees->map(fn ($p) => ['id' => $p->id, 'name' => $p->name])])->values();
        $busyIds = $inField->flatMap(fn ($t) => $t->assignees->pluck('id'))->unique();
        $technicians = $canTasks ? DB::table('task_assignees')->select('user_id')->distinct()->pluck('user_id') : collect();
        $free = $board->flatten(1)->filter(fn ($r) => in_array($r['state'], ['present', 'late']) && $technicians->contains($r['user']['id']) && ! $busyIds->contains($r['user']['id']))
            ->map(fn ($r) => ['id' => $r['user']['id'], 'name' => $r['user']['name'], 'branch' => $r['user']['branch_id']])->values();

        return response()->json([
            'now' => $now->toIso8601String(),
            'decisions' => ['leaves' => $leaves->values(), 'batches' => $batches, 'attendance' => $pendingDays],
            'alerts' => ['late_repeat' => $lateRepeat, 'absent_streak' => $absent, 'overdue_tasks' => $overdue->take(8), 'overdue_count' => $overdue->count()],
            'week' => ['this' => $sum($thisWeek), 'last' => $sum($lastWeek), 'branches' => $byBranch],
            'branches' => $branchCards,
            'field' => ['busy' => $busy, 'free' => $free],
            'branch_names' => $names,
        ]);
    }
}
