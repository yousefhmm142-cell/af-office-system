<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\User;
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
}
