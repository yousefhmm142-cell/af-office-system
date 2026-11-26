<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceDay;
use App\Models\Task;
use App\Models\User;
use App\Support\Access;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * What the frame around every page needs: the small counters next to the sidebar pages,
 * and the global search (Ctrl+K) across tasks, subscribers and people.
 */
class ShellController extends Controller
{
    /** Amber = waits for the manager, red = late. Only for the person's own branch. */
    public function counts(Request $request): JsonResponse
    {
        $me = $request->user();
        $branch = $me->branch_id;
        $out = [];
        if ($branch && Access::allowsBranch($me, 'generation.approve', $branch)) {
            $out['/generation'] = ['n' => DB::table('generation_reports')->where('branch_id', $branch)->where('status', 'submitted')->count(), 'tone' => 'amber', 'title' => 'بانتظار اعتمادك'];
        }
        if ($branch && Access::allowsBranch($me, 'distribution.approve', $branch)) {
            $out['/distribution'] = ['n' => DB::table('distribution_sheets')->where('branch_id', $branch)->where('status', 'submitted')->count(), 'tone' => 'amber', 'title' => 'بانتظار اعتمادك'];
        }
        if ($branch && (Access::allowsBranch($me, 'tasks.view', $branch) || Access::allowsBranch($me, 'tasks.manage', $branch))) {
            $late = Task::where('branch_id', $branch)->whereIn('status', Task::OPEN)->get()->filter(fn (Task $t) => $t->isLate())->count();
            $out['/tasks'] = ['n' => $late, 'tone' => 'red', 'title' => 'تجاوزت وقتها'];
        }

        return response()->json(['counts' => $out]);
    }

    public function search(Request $request): JsonResponse
    {
        $data = $request->validate(['q' => ['required', 'string', 'max:80']]);
        $me = $request->user();
        $q = trim(strtr($data['q'], ['٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9']));
        $number = preg_match('/^#?\s*(\d+)$/', $q, $m) ? $m[1] : null;
        $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $q).'%';
        $out = ['tasks' => [], 'subscribers' => [], 'people' => []];

        $taskScope = Access::scope($me, 'tasks.view') ?? Access::scope($me, 'tasks.manage');
        if ($taskScope) {
            $tasks = Task::with('type:id,name', 'branch:id,name')
                ->when($taskScope !== 'all', fn ($w) => $w->where('branch_id', $me->branch_id))
                ->when($number, fn ($w) => $w->where('number', $number), fn ($w) => $w->where(fn ($x) => $x->where('subscriber_name', 'like', $like)
                    ->orWhere('details', 'like', $like)->orWhere('location_text', 'like', $like)))
                ->orderByDesc('id')->limit(5)->get();
            $out['tasks'] = $tasks->map(fn (Task $t) => [
                'id' => $t->id, 'number' => $t->number, 'type' => $t->type?->name, 'branch' => $taskScope === 'all' ? $t->branch?->name : null,
                'hint' => collect([$t->subscriber_name, $t->details])->filter()->implode(' · '),
            ]);
            if (! $number && mb_strlen($q) >= 2) {
                $out['subscribers'] = DB::table('task_subscribers')
                    ->when($taskScope !== 'all', fn ($w) => $w->where('branch_id', $me->branch_id))
                    ->where('n', 'like', $like)->orderBy('n')->limit(5)->get(['n', 'a', 'b', 'p']);
            }
        }

        if (! $number && Access::allows($me, 'users.view')) {
            $out['people'] = Access::limit(User::query(), $me, 'users.view')->where('name', 'like', $like)->with('employee:user_id,job_title')
                ->orderBy('name')->limit(5)->get(['id', 'name', 'branch_id'])
                ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'title' => $u->employee?->job_title]);
        }

        return response()->json($out);
    }

    /** The branch's latest movements (two days): who came and left, task steps, sheets sent. */
    public function feed(Request $request): JsonResponse
    {
        $me = $request->user();
        $branch = $me->branch_id;
        abort_unless($branch && Access::allowsBranch($me, 'permissions.branch_manage', $branch), 403);
        $since = now()->subDays(2);
        $events = collect();

        if (Access::allowsBranch($me, 'attendance.view', $branch)) {
            $days = AttendanceDay::with('user:id,name')->where('branch_id', $branch)
                ->where(fn ($w) => $w->where('check_in', '>=', $since)->orWhere('check_out', '>=', $since))->get();
            foreach ($days as $d) {
                foreach (['check_in' => 'سجّل حضوره', 'check_out' => 'سجّل انصرافه'] as $col => $text) {
                    if ($d->{$col} && $d->{$col}->gte($since)) {
                        $events->push(['id' => "a{$d->id}{$col}", 'kind' => 'attendance', 'at' => $d->{$col}->toISOString(), 'who' => $d->user?->name ?? '—',
                            'text' => $text.($col === 'check_in' && $d->late_minutes ? " (تأخر {$d->late_minutes} د)" : ''), 'route' => '/attendance', 'tone' => $col === 'check_in' && $d->late_minutes ? 'warn' : null]);
                    }
                }
            }
        }
        if (Access::allowsBranch($me, 'tasks.view', $branch) || Access::allowsBranch($me, 'tasks.manage', $branch)) {
            $labels = ['created' => 'أنشأ المهمة', 'sent_app' => 'أرسل المهمة', 'sent_whatsapp' => 'أرسل المهمة عبر واتساب', 'seen' => 'فتح المهمة',
                'started' => 'بدأ العمل في المهمة', 'completed' => 'أنجز المهمة', 'cancelled' => 'ألغى المهمة', 'reassigned' => 'غيّر فني المهمة'];
            $rows = DB::table('task_events')->join('tasks', 'tasks.id', '=', 'task_events.task_id')->leftJoin('users', 'users.id', '=', 'task_events.actor_id')
                ->where('tasks.branch_id', $branch)->where('task_events.at', '>=', $since)->whereIn('task_events.event', array_keys($labels))
                ->orderByDesc('task_events.at')->limit(60)->get(['task_events.id', 'task_events.event', 'task_events.at', 'users.name', 'tasks.number', 'tasks.id as task_id']);
            foreach ($rows as $r) {
                $events->push(['id' => "t{$r->id}", 'kind' => 'task', 'at' => \Illuminate\Support\Carbon::parse($r->at)->toISOString(), 'who' => $r->name ?? 'الفني عبر الرابط',
                    'text' => $labels[$r->event].' رقم '.$r->number, 'reference' => '#'.$r->number, 'route' => '/tasks?open='.$r->task_id, 'tone' => $r->event === 'completed' ? 'ok' : null]);
            }
        }
        foreach (['generation' => ['generation_reports', 'report_date', 'أرسل تقرير التوليد'], 'distribution' => ['distribution_sheets', 'sheet_date', 'أرسل كشف التوزيع']] as $kind => [$table, $date, $text]) {
            if (! Access::allowsBranch($me, $kind.'.view', $branch)) {
                continue;
            }
            $rows = DB::table($table)->leftJoin('users', 'users.id', '=', "{$table}.submitted_by")->where("{$table}.branch_id", $branch)
                ->where("{$table}.submitted_at", '>=', $since)->get(["{$table}.id", "{$table}.{$date} as day", "{$table}.submitted_at", 'users.name']);
            foreach ($rows as $r) {
                $events->push(['id' => "{$kind}{$r->id}", 'kind' => $kind === 'generation' ? 'report' : 'sheet', 'at' => \Illuminate\Support\Carbon::parse($r->submitted_at)->toISOString(),
                    'who' => $r->name ?? '—', 'text' => "{$text} ليوم {$r->day}", 'route' => "/{$kind}/{$r->day}", 'tone' => 'info']);
            }
        }

        return response()->json(['events' => $events->sortByDesc('at')->take(80)->values()]);
    }
}
