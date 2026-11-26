<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Message;
use App\Models\Role;
use App\Models\User;
use App\Support\Access;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AccountHandoffController extends Controller
{
    private function staff(Branch $branch, string $role): Builder
    {
        return User::where('branch_id', $branch->id)->whereHas('role', fn ($q) => $q->where('key', $role));
    }

    private function authorizeHr(User $actor, Branch $branch): void
    {
        abort_unless(($actor->role->key === Role::HR || $actor->isSuperAdmin()) && Access::allowsBranch($actor, 'users.manage', $branch->id), 403);
    }

    private function report(Branch $branch, ?array $ids = null): JsonResponse
    {
        $rows = $this->staff($branch, Role::EMPLOYEE)->when($ids !== null, fn ($q) => $q->whereIn('users.id', $ids))
            ->with('employee.department')->orderBy('name')->orderBy('id')->get()->map(fn ($u) => [
                'name' => $u->name, 'username' => $u->username, 'department' => $u->employee?->department?->name,
                'code' => $u->is_active && $u->must_change_password ? $u->handoff_code : null,
                'status' => ! $u->is_active ? 'موقوف' : (! $u->must_change_password ? 'كلمة مرور شخصية' : ($u->handoff_code ? 'رمز مؤقت' : 'يتطلب إصدار رمز مؤقت')),
            ]);
        return response()->json(['branch' => $branch->name, 'rows' => $rows])->header('Cache-Control', 'private, no-store');
    }

    public function index(Request $request, Branch $branch): JsonResponse
    {
        $this->authorizeHr($request->user(), $branch);
        return $this->report($branch);
    }

    public function send(Request $request, Branch $branch): JsonResponse
    {
        $actor = $request->user();
        $this->authorizeHr($actor, $branch);
        $message = DB::transaction(function () use ($actor, $branch) {
            $managers = $this->staff($branch, Role::BRANCH_MANAGER)->where('is_active', true)->pluck('id');
            abort_if($managers->isEmpty(), 422, 'لا يوجد مدير فعّال لهذا الفرع.');
            $ids = $this->staff($branch, Role::EMPLOYEE)->pluck('id');
            abort_if($ids->isEmpty(), 422, 'لا توجد حسابات موظفين في هذا الفرع.');
            $message = new Message(['sender_id' => $actor->id, 'kind' => 'message',
                'subject' => 'كشف تسليم الحسابات · '.$branch->name, 'body' => 'حسابات موظفي الفرع للتوزيع. افتح الكشف لتنزيل الجدول.']);
            $message->account_handoff = ['branch_id' => $branch->id, 'user_ids' => $ids->all()];
            $message->save();
            foreach ($managers as $id) {
                $message->recipients()->create(['user_id' => $id]);
            }
            return $message;
        });
        return response()->json(['message_id' => $message->id], 201);
    }

    public function received(Request $request, Message $message): JsonResponse
    {
        $handoff = $message->account_handoff;
        abort_unless($handoff, 404);
        $branch = Branch::findOrFail($handoff['branch_id']);
        $actor = $request->user();
        if ($message->sender_id === $actor->id) {
            $this->authorizeHr($actor, $branch);
        } else {
            abort_unless($actor->role->key === Role::BRANCH_MANAGER && $actor->branch_id === $branch->id
                && $message->recipients()->where('user_id', $actor->id)->exists(), 403);
        }
        return $this->report($branch, $handoff['user_ids']);
    }
}
