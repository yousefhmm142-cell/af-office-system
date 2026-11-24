<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\Role;
use App\Models\User;
use App\Support\Access;
use Illuminate\Database\Eloquent\Builder;

/**
 * Who may write to whom (from the requirements):
 *  - an employee: their branch manager and HR only (not management directly);
 *  - a branch manager: the people of their branch, HR, management and the super admin;
 *  - HR, management and the super admin: everyone.
 * Anyone may answer a message they received. Sending to a whole group (branch, department,
 * everyone) needs the messages.groups permission.
 */
class MessagingRules
{
    private const OPEN = [Role::SUPER_ADMIN, Role::MANAGEMENT, Role::HR];

    /** Everyone this user may start a conversation with. */
    public function reachable(User $user): Builder
    {
        $user->loadMissing('role');
        $q = User::query()->where('is_active', true)->where('id', '!=', $user->id);
        $key = $user->role?->key;

        if (in_array($key, self::OPEN, true)) {
            return $q;
        }
        if ($key === Role::BRANCH_MANAGER) {
            return $q->where(fn ($w) => $w->where('branch_id', $user->branch_id)
                ->orWhereHas('role', fn ($r) => $r->whereIn('key', self::OPEN)));
        }
        // Employee: the branch manager (as set on the branch, or by role in the same branch) and HR.
        $managerId = $user->branch_id ? Branch::whereKey($user->branch_id)->value('manager_user_id') : null;

        return $q->where(function ($w) use ($user, $managerId) {
            $w->whereHas('role', fn ($r) => $r->where('key', Role::HR))
                ->orWhere(fn ($m) => $m->where('branch_id', $user->branch_id)->whereNotNull('branch_id')
                    ->whereHas('role', fn ($r) => $r->where('key', Role::BRANCH_MANAGER)));
            if ($managerId) {
                $w->orWhere('id', $managerId);
            }
        });
    }

    public function canReach(User $from, int $toId): bool
    {
        return $this->reachable($from)->whereKey($toId)->exists();
    }

    /** Groups the user may send to: null = none; 'all' = any; 'branch' = own branch only. */
    public function groupScope(User $user): ?string
    {
        return Access::scope($user, 'messages.groups');
    }
}
