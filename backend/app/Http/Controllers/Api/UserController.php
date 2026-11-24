<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Present;
use App\Models\Role;
use App\Models\User;
use App\Support\Access;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class UserController extends Controller
{
    /** Letters (Arabic or English), digits, dot, dash, underscore. 3 to 40, no spaces. */
    public const USERNAME_RULE = '/^[\p{L}\p{N}._-]{3,40}$/u';

    /** Roles that always sit inside one branch. */
    private const BRANCH_ROLES = [Role::BRANCH_MANAGER, Role::EMPLOYEE];

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer'],
            'role' => ['nullable', 'string'],
            'search' => ['nullable', 'string', 'max:60'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
        ]);
        $q = Access::limit(User::query(), $request->user(), 'users.view', 'branch_id', 'id')
            ->with('role', 'branch')
            ->when($data['branch_id'] ?? null, fn ($q, $v) => $q->where('branch_id', $v))
            ->when($data['role'] ?? null, fn ($q, $v) => $q->whereHas('role', fn ($r) => $r->where('key', $v)))
            ->when(($data['status'] ?? null) === 'active', fn ($q) => $q->where('is_active', true))
            ->when(($data['status'] ?? null) === 'inactive', fn ($q) => $q->where('is_active', false))
            ->when($data['search'] ?? null, fn ($q, $v) => $q->where(fn ($w) => $w->where('name', 'like', "%{$v}%")->orWhere('username', 'like', "%{$v}%")))
            ->orderBy('name');

        return response()->json(['users' => $q->get()->map(fn ($u) => Present::user($u))]);
    }

    public function show(Request $request, User $user): JsonResponse
    {
        $this->authorizeView($request->user(), $user);

        return response()->json(['user' => Present::user($user)]);
    }

    public function store(Request $request): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'username' => ['required', 'string', 'regex:'.self::USERNAME_RULE],
            'password' => ['required', 'string', 'min:'.config('access.login.password_min'), 'max:100'],
            'role_id' => ['required', 'integer', Rule::exists('roles', 'id')],
            'branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')->whereNull('deleted_at')],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        $data['username'] = User::normalizeUsername($data['username']);
        $this->assertUsernameFree($data['username']);
        $role = Role::findOrFail($data['role_id']);
        $data['branch_id'] = $this->branchFor($role, $data['branch_id'] ?? null);
        $this->assertCanManage($actor, $role, $data['branch_id']);

        // The person sets their own password the first time they sign in.
        $user = User::create($data + ['must_change_password' => true]);
        Audit::log('user.created', $user, null, $user->only('name', 'username', 'role_id', 'branch_id', 'is_active'));

        return response()->json(['user' => Present::user($user->fresh())], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        $this->assertCanManage($actor, $user->role, $user->branch_id);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:120'],
            'username' => ['sometimes', 'string', 'regex:'.self::USERNAME_RULE],
            'role_id' => ['sometimes', 'integer', Rule::exists('roles', 'id')],
            'branch_id' => ['sometimes', 'nullable', 'integer', Rule::exists('branches', 'id')->whereNull('deleted_at')],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if ($actor->id === $user->id && array_intersect(array_keys($data), ['role_id', 'branch_id', 'is_active'])) {
            abort(403, 'ما بتقدر تغيّر دورك أو فرعك أو توقف حسابك بنفسك.');
        }
        if (isset($data['username'])) {
            $data['username'] = User::normalizeUsername($data['username']);
            $this->assertUsernameFree($data['username'], $user->id);
        }
        $role = isset($data['role_id']) ? Role::findOrFail($data['role_id']) : $user->role;
        $branchId = $this->branchFor($role, array_key_exists('branch_id', $data) ? $data['branch_id'] : $user->branch_id);
        $this->assertCanManage($actor, $role, $branchId);
        $data['branch_id'] = $branchId;

        $user->fill($data)->save();
        [$old, $new] = Audit::diff($user);
        if ($new) {
            Audit::log('user.updated', $user, $old, $new);
        }
        if (($new['is_active'] ?? null) === false || array_key_exists('role_id', $new) || array_key_exists('branch_id', $new)) {
            // A stopped or moved account signs in again so the phone gets the new access.
            $user->tokens()->delete();
        }
        // A manager moved out of a branch no longer manages it.
        if (array_key_exists('branch_id', $new) || array_key_exists('role_id', $new) || ($new['is_active'] ?? null) === false) {
            \App\Models\Branch::where('manager_user_id', $user->id)->where('id', '!=', $user->branch_id ?? 0)->update(['manager_user_id' => null]);
        }

        return response()->json(['user' => Present::user($user->fresh())]);
    }

    /** Give a temporary password (also unlocks the account). The person must change it at next sign-in. */
    public function resetPassword(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        abort_if($actor->id === $user->id, 403, 'لتغيير رمزك استعمل «تغيير الرمز» من حسابك.');
        $this->assertCanManage($actor, $user->role, $user->branch_id);
        $data = $request->validate([
            'password' => ['required', 'string', 'min:'.config('access.login.password_min'), 'max:100'],
        ]);
        $user->forceFill([
            'password' => $data['password'],
            'must_change_password' => true,
            'failed_logins' => 0,
            'locked_until' => null,
        ])->save();
        $user->tokens()->delete();
        Audit::log('user.password_reset', $user);

        return response()->json(['user' => Present::user($user->fresh())]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        abort_if($actor->id === $user->id, 403, 'ما بتقدر تحذف حسابك بنفسك.');
        $this->assertCanManage($actor, $user->role, $user->branch_id);
        $user->tokens()->delete();
        \App\Models\Branch::where('manager_user_id', $user->id)->update(['manager_user_id' => null]);
        $user->delete();
        Audit::log('user.deleted', $user, $user->only('name', 'username', 'role_id', 'branch_id'));

        return response()->json(['ok' => true]);
    }

    public function roles(Request $request): JsonResponse
    {
        $actor = $request->user();
        $roles = Role::orderByDesc('level')->get(['id', 'key', 'name', 'level'])
            ->map(fn ($r) => $r->toArray() + [
                'needs_branch' => in_array($r->key, self::BRANCH_ROLES, true),
                'assignable' => $actor->isSuperAdmin() || $r->level < $actor->level(),
            ]);

        return response()->json(['roles' => $roles]);
    }

    private function authorizeView(User $actor, User $target): void
    {
        $ok = match (Access::scope($actor, 'users.view')) {
            'all' => true,
            'branch' => $target->branch_id !== null && $target->branch_id === $actor->branch_id,
            'own' => $target->id === $actor->id,
            default => false,
        };
        abort_unless($ok || $actor->id === $target->id, 403, 'ما عندك صلاحية على هاد الموظف.');
    }

    /**
     * The actor needs users.manage for the branch, and may only manage roles below their own
     * (the super admin manages everyone). Company-wide accounts need an "all" grant.
     */
    public static function assertCanManage(User $actor, ?Role $role, ?int $branchId): void
    {
        if ($actor->isSuperAdmin()) {
            return;
        }
        abort_unless(Access::allowsBranch($actor, 'users.manage', $branchId), 403, 'ما عندك صلاحية على موظفين هاد الفرع.');
        abort_unless($role && $role->level < $actor->level(), 403, 'ما بتقدر تدير حساب بنفس مستواك أو أعلى.');
    }

    private function branchFor(Role $role, ?int $branchId): ?int
    {
        if (in_array($role->key, self::BRANCH_ROLES, true) && ! $branchId) {
            throw ValidationException::withMessages(['branch_id' => 'اختار الفرع لهاد الموظف.']);
        }

        return $branchId;
    }

    private function assertUsernameFree(string $username, ?int $ignoreId = null): void
    {
        $taken = User::withTrashed()->where('username', $username)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->exists();
        if ($taken) {
            throw ValidationException::withMessages(['username' => 'اسم المستخدم مستعمل. اختار اسم ثاني.']);
        }
    }
}
