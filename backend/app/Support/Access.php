<?php

namespace App\Support;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Who may do what, and in which branches.
 *
 * A permission resolves to a scope:
 *   all    → every branch
 *   branch → only the user's own branch
 *   own    → only the user's own records
 *   null   → not allowed
 *
 * Order: the super admin always gets "all"; then a personal override (deny wins, allow sets
 * its scope); then the role's grant. Everything else is denied.
 */
class Access
{
    public const SCOPES = ['own', 'branch', 'all'];

    /** @return array<string,string> permission key => scope */
    public static function effective(User $user): array
    {
        if ($user->accessCache !== null) {
            return $user->accessCache;
        }

        $user->loadMissing('role');

        if ($user->isSuperAdmin()) {
            return $user->accessCache = Permission::query()->pluck('key')->mapWithKeys(fn ($k) => [$k => 'all'])->all();
        }

        $map = DB::table('role_permissions')
            ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
            ->where('role_permissions.role_id', $user->role_id)
            ->pluck('role_permissions.scope', 'permissions.key')
            ->all();

        if ($user->branch_id !== null && $user->role?->key === Role::EMPLOYEE) {
            $branchPages = DB::table('branch_page_grants')
                ->join('permissions', 'permissions.id', '=', 'branch_page_grants.permission_id')
                ->where('branch_page_grants.user_id', $user->id)
                ->where('branch_page_grants.branch_id', $user->branch_id)
                ->pluck('permissions.key');
            foreach ($branchPages as $key) {
                if (($map[$key] ?? null) !== 'all') {
                    $map[$key] = 'branch';
                }
            }
        }

        $overrides = DB::table('user_permissions')
            ->join('permissions', 'permissions.id', '=', 'user_permissions.permission_id')
            ->where('user_permissions.user_id', $user->id)
            ->get(['permissions.key', 'user_permissions.effect', 'user_permissions.scope']);

        foreach ($overrides as $o) {
            if ($o->effect === 'deny') {
                unset($map[$o->key]);
            } else {
                $map[$o->key] = $o->scope ?: ($map[$o->key] ?? 'branch');
            }
        }

        // A "branch" grant means nothing to someone who has no branch.
        if ($user->branch_id === null) {
            $map = array_filter($map, fn ($scope) => $scope !== 'branch');
        }

        ksort($map);

        return $user->accessCache = $map;
    }

    public static function scope(User $user, string $permission): ?string
    {
        return self::effective($user)[$permission] ?? null;
    }

    public static function allows(User $user, string $permission): bool
    {
        return self::scope($user, $permission) !== null;
    }

    /** May the user act on something that belongs to this branch (null = company-wide record)? */
    public static function allowsBranch(User $user, string $permission, ?int $branchId): bool
    {
        return match (self::scope($user, $permission)) {
            'all' => true,
            'branch' => $branchId !== null && $branchId === $user->branch_id,
            default => false,
        };
    }

    /**
     * Narrow a query to what the user may see.
     * $ownColumn is the column that points at the user for "own" grants (null = "own" sees nothing).
     */
    public static function limit(Builder $query, User $user, string $permission, string $branchColumn = 'branch_id', ?string $ownColumn = null): Builder
    {
        return match (self::scope($user, $permission)) {
            'all' => $query,
            'branch' => $query->where($branchColumn, $user->branch_id),
            'own' => $ownColumn ? $query->where($ownColumn, $user->id) : $query->whereRaw('1 = 0'),
            default => $query->whereRaw('1 = 0'),
        };
    }

    public static function forget(User $user): void
    {
        $user->accessCache = null;
    }
}
