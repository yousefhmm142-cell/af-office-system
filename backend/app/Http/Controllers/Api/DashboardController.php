<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceDay;
use App\Models\Branch;
use App\Models\Employee;
use App\Models\MessageRecipient;
use App\Models\PayrollBatch;
use App\Models\PayrollItem;
use App\Models\Task;
use App\Models\User;
use App\Services\AttendanceService;
use App\Support\Access;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The home page, by role: what the person needs to see first today. Each part is included only
 * when the user may see it (the same permissions as the pages it links to).
 */
class DashboardController extends Controller
{
    public function __construct(private AttendanceService $attendance) {}

    public function show(Request $request): JsonResponse
    {
        $me = $request->user();
        $tz = config('app.business_timezone');
        $now = CarbonImmutable::now($tz);
        $today = $now->toDateString();
        $out = ['today' => $today];

        // ---- Me ----
        $lastPay = PayrollItem::where('user_id', $me->id)->whereHas('batch', fn ($q) => $q->whereIn('status', ['approved', 'paid']))
            ->with('batch:id,title,status,month')->latest('id')->first();
        $out['me'] = [
            'unread' => MessageRecipient::where('user_id', $me->id)->whereNull('read_at')->whereNull('archived_at')->count(),
            'open_tasks' => Task::whereIn('status', ['sent', 'seen', 'in_progress'])->whereHas('assignees', fn ($q) => $q->where('users.id', $me->id))->count(),
            'last_pay' => $lastPay ? ['net' => $lastPay->net, 'title' => $lastPay->batch->title, 'status' => $lastPay->batch->status] : null,
            'month' => $this->monthSummary($me, $now),
        ];

        // ---- Branch rows (own branch, or every branch for company-wide roles) ----
        $wide = in_array('all', [Access::scope($me, 'attendance.view'), Access::scope($me, 'branches.view'), Access::scope($me, 'users.view')], true);
        $branchIds = $wide ? Branch::where('is_active', true)->orderBy('name')->pluck('id')->all() : array_filter([$me->branch_id]);
        $canAttendance = fn ($id) => Access::allowsBranch($me, 'attendance.view', $id);
        $canTasks = fn ($id) => Access::allowsBranch($me, 'tasks.view', $id) || Access::allowsBranch($me, 'tasks.manage', $id);

        $rows = [];
        foreach ($branchIds as $id) {
            if (! $canAttendance($id) && ! $canTasks($id)) {
                continue;
            }
            $rows[] = $this->branchRow($id, $today, $now, $canAttendance($id), $canTasks($id));
        }
        $out['branches'] = $rows;

        // The branch manager's own detail: who has not come in yet.
        if (! $wide && $me->branch_id && $canAttendance($me->branch_id)) {
            $out['branch_detail'] = $this->notIn($me->branch_id, $today, $now);
        }

        // ---- Company figures ----
        if (Access::scope($me, 'users.view') === 'all' || Access::scope($me, 'employees.view') === 'all') {
            $statuses = Employee::whereHas('user', fn ($q) => $q->whereNull('deleted_at'))->selectRaw('status, count(*) c')->groupBy('status')->pluck('c', 'status');
            $out['company'] = [
                'branches' => Branch::where('is_active', true)->count(),
                'employees' => (int) $statuses->sum(),
                'profiles_pending' => Access::scope($me, 'users.manage') === 'all'
                    ? User::where('is_active', true)->where('needs_profile_completion', true)->count()
                    : null,
                'by_status' => ['active' => (int) ($statuses['active'] ?? 0), 'trainee' => (int) ($statuses['trainee'] ?? 0), 'suspended' => (int) ($statuses['suspended'] ?? 0), 'terminated' => (int) ($statuses['terminated'] ?? 0)],
            ];
        }

        // ---- Payroll ----
        $payScope = Access::scope($me, 'payroll.view') ?? Access::scope($me, 'payroll.manage');
        if ($payScope) {
            $q = fn () => PayrollBatch::query()->when($payScope !== 'all', fn ($w) => $w->where('branch_id', $me->branch_id));
            $month = $now->format('Y-m');
            $prev = $now->subMonthNoOverflow()->format('Y-m');
            $out['payroll'] = [
                'this_month' => (float) $q()->where('month', $month)->whereIn('status', ['approved', 'paid'])->sum('total_net'),
                'last_month' => (float) $q()->where('month', $prev)->whereIn('status', ['approved', 'paid'])->sum('total_net'),
                'drafts' => $q()->where('status', 'draft')->count(),
                'to_pay' => $q()->where('status', 'approved')->count(),
                'can_approve' => Access::allows($me, 'payroll.approve'),
            ];
        }

        // ---- Things waiting for this person ----
        $attention = [];
        if ($payScope && ($out['payroll']['drafts'] ?? 0) > 0 && $out['payroll']['can_approve']) {
            $attention[] = ['kind' => 'payroll_draft', 'count' => $out['payroll']['drafts'], 'link' => '/payroll'];
        }
        if ($payScope && ($out['payroll']['to_pay'] ?? 0) > 0 && Access::allows($me, 'payroll.manage')) {
            $attention[] = ['kind' => 'payroll_to_pay', 'count' => $out['payroll']['to_pay'], 'link' => '/payroll'];
        }
        if (Access::allows($me, 'attendance.manage')) {
            $pending = Access::limit(AttendanceDay::query(), $me, 'attendance.manage')->where('approval_status', 'pending')->where('date', '<', $today)->count();
            if ($pending > 0) {
                $attention[] = ['kind' => 'attendance_pending', 'count' => $pending, 'link' => '/attendance'];
            }
        }
        $lateTasks = array_sum(array_column($rows, 'late_tasks'));
        if ($lateTasks > 0) {
            $attention[] = ['kind' => 'tasks_late', 'count' => $lateTasks, 'link' => '/tasks'];
        }
        if ($out['me']['unread'] > 0) {
            $attention[] = ['kind' => 'messages', 'count' => $out['me']['unread'], 'link' => '/messages'];
        }
        $out['attention'] = $attention;

        return response()->json($out);
    }

    private function branchRow(int $id, string $today, CarbonImmutable $now, bool $att, bool $tasks): array
    {
        $branch = Branch::find($id);
        $staff = User::where('branch_id', $id)->where('is_active', true)
            ->whereHas('employee', fn ($q) => $q->where('tracks_attendance', true)->whereIn('status', ['active', 'trainee']))->pluck('id');
        $days = $att ? AttendanceDay::where('date', $today)->whereIn('user_id', $staff)->get() : collect();
        $open = $tasks ? Task::where('branch_id', $id)->whereIn('status', Task::OPEN)->get() : collect();

        return [
            'id' => $id, 'name' => $branch?->name,
            'staff' => $staff->count(),
            'present' => $att ? $days->whereNotNull('check_in')->count() : null,
            'late' => $att ? $days->where('late_minutes', '>', 0)->count() : null,
            'not_in' => $att ? count($this->notIn($id, $today, $now)['not_in']) : null,
            'open_tasks' => $tasks ? $open->count() : null,
            'late_tasks' => $tasks ? $open->filter(fn ($t) => $t->isLate())->count() : 0,
            'done_today' => $tasks ? Task::where('branch_id', $id)->where('status', 'done')->where('completed_at', '>=', $now->startOfDay()->utc())->count() : null,
        ];
    }

    /** People of the branch who have not come in today, with their start time. */
    private function notIn(int $branchId, string $today, CarbonImmutable $now): array
    {
        $users = User::where('branch_id', $branchId)->where('is_active', true)->with('employee')
            ->whereHas('employee', fn ($q) => $q->where('tracks_attendance', true)->whereIn('status', ['active', 'trainee']))->orderBy('name')->get();
        $in = AttendanceDay::where('date', $today)->whereIn('user_id', $users->pluck('id'))->whereNotNull('check_in')->pluck('user_id')->flip();
        $list = [];
        foreach ($users as $u) {
            if (isset($in[$u->id])) {
                continue;
            }
            $s = $this->attendance->scheduleFor($u);
            if ($s && ! $this->attendance->isWorkDay($s, $now->startOfDay(), $branchId)) {
                continue;
            }
            $list[] = ['id' => $u->id, 'name' => $u->name, 'job_title' => $u->employee?->job_title, 'start' => $s ? substr((string) $s->start_time, 0, 5) : null];
        }

        return ['not_in' => $list, 'trainees' => $users->where('employee.status', 'trainee')->count()];
    }

    private function monthSummary(User $me, CarbonImmutable $now): ?array
    {
        if (! $me->branch_id) {
            return null;
        }
        $days = AttendanceDay::where('user_id', $me->id)->whereBetween('date', [$now->startOfMonth()->toDateString(), $now->toDateString()])->get();

        return ['days' => $days->whereNotNull('check_in')->count(), 'late_minutes' => (int) $days->sum('late_minutes'), 'overtime_minutes' => (int) $days->sum('overtime_minutes')];
    }
}
