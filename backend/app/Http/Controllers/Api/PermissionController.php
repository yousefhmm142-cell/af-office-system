<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Support\Access;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * The permissions screen: grants per role, and personal exceptions per user.
 * Nobody can hand out more than they have themselves (except the super admin).
 */
class PermissionController extends Controller
{
    private const RANK = ['own' => 1, 'branch' => 2, 'all' => 3];

    public function index(): JsonResponse
    {
        $perms = Permission::orderBy('sort_order')->get(['id', 'key', 'name', 'group']);
        $grants = DB::table('role_permissions')->join('permissions', 'permissions.id', '=', 'permission_id')
            ->get(['role_id', 'permissions.key', 'scope'])->groupBy('role_id');
        $roles = Role::orderByDesc('level')->get()->map(fn ($r) => [
            'id' => $r->id, 'key' => $r->key, 'name' => $r->name, 'level' => $r->level,
            'locked' => $r->key === Role::SUPER_ADMIN,
            'grants' => $r->key === Role::SUPER_ADMIN
                ? $perms->mapWithKeys(fn ($p) => [$p->key => 'all'])
                : ($grants[$r->id] ?? collect())->mapWithKeys(fn ($g) => [$g->key => $g->scope]),
        ]);

        return response()->json(['permissions' => $perms, 'roles' => $roles, 'scopes' => Access::SCOPES]);
    }

    public function updateRole(Request $request, Role $role): JsonResponse
    {
        $actor = $request->user();
        abort_if($role->key === Role::SUPER_ADMIN, 403, 'صلاحيات السوبر أدمن كاملة دائماً ولا تتغير.');
        abort_unless($actor->isSuperAdmin() || $role->level < $actor->level(), 403, 'لا يمكنك تعديل صلاحيات دور في مستواك أو أعلى منه.');
        $data = $request->validate([
            'grants' => ['present', 'array'],
            'grants.*' => ['nullable', Rule::in(Access::SCOPES)],
        ]);
        $perms = Permission::pluck('id', 'key');
        $grants = array_filter($data['grants']);
        $this->assertKnown($data['grants'], $perms->all());
        $editable = $actor->isSuperAdmin() ? $perms->keys()->all() : array_keys(Access::effective($actor));
        if ($request->isMethod('PATCH')) {
            $editable = array_keys($data['grants']);
            if (! $actor->isSuperAdmin() && array_diff($editable, array_keys(Access::effective($actor)))) {
                throw ValidationException::withMessages(['grants' => 'لا يمكنك تعديل صلاحية لا تملكها.']);
            }
        }
        $this->assertWithinOwn($actor, $grants);

        $old = DB::table('role_permissions')->join('permissions', 'permissions.id', '=', 'permission_id')
            ->where('role_id', $role->id)->pluck('scope', 'permissions.key')->all();

        DB::transaction(function () use ($role, $grants, $perms, $editable) {
            Role::whereKey($role->id)->lockForUpdate()->firstOrFail();
            DB::table('role_permissions')->where('role_id', $role->id)
                ->whereIn('permission_id', $perms->only($editable)->values())->delete();
            foreach ($grants as $key => $scope) {
                DB::table('role_permissions')->insert([
                    'role_id' => $role->id, 'permission_id' => $perms[$key], 'scope' => $scope,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        });
        $new = DB::table('role_permissions')->join('permissions', 'permissions.id', '=', 'permission_id')
            ->where('role_id', $role->id)->pluck('scope', 'permissions.key')->all();
        Audit::log('permissions.role', $role, $old, $new);

        return $this->index();
    }

    public function showUser(Request $request, User $user): JsonResponse
    {
        UserController::assertCanManage($request->user(), $user->role, $user->branch_id);

        return response()->json($this->userPayload($user));
    }

    public function updateUser(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        abort_if($actor->id === $user->id, 403, 'لا يمكنك تعديل صلاحياتك بنفسك.');
        UserController::assertCanManage($actor, $user->role, $user->branch_id);
        abort_if($user->isSuperAdmin(), 403, 'يملك السوبر أدمن جميع الصلاحيات دائماً.');
        $data = $request->validate([
            'overrides' => ['present', 'array'],
            'overrides.*.key' => ['required', 'string', 'distinct'],
            'overrides.*.effect' => ['required', Rule::in(['allow', 'deny'])],
            'overrides.*.scope' => ['nullable', Rule::in(Access::SCOPES)],
        ]);
        $perms = Permission::pluck('id', 'key');
        $rows = collect($data['overrides']);
        $this->assertKnown($rows->pluck('key', 'key')->all(), $perms->all());
        $allows = $rows->where('effect', 'allow')->mapWithKeys(fn ($o) => [$o['key'] => $o['scope'] ?? 'branch'])->all();
        $this->assertWithinOwn($actor, $allows);
        if (! $actor->isSuperAdmin()) {
            $mine = array_keys(Access::effective($actor));
            if ($rows->pluck('key')->diff($mine)->isNotEmpty()) {
                throw ValidationException::withMessages(['overrides' => 'لا يمكنك تعديل صلاحية لا تملكها.']);
            }
        }

        $old = $this->userPayload($user)['overrides'];
        DB::transaction(function () use ($user, $rows, $perms, $actor) {
            $editable = $actor->isSuperAdmin() ? $perms->values() : $perms->only(array_keys(Access::effective($actor)))->values();
            DB::table('user_permissions')->where('user_id', $user->id)->whereIn('permission_id', $editable)->delete();
            foreach ($rows as $o) {
                DB::table('user_permissions')->insert([
                    'user_id' => $user->id, 'permission_id' => $perms[$o['key']], 'effect' => $o['effect'],
                    'scope' => $o['effect'] === 'allow' ? ($o['scope'] ?? 'branch') : null,
                    'granted_by' => $actor->id, 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        });
        Access::forget($user);
        $payload = $this->userPayload($user);
        Audit::log('permissions.user', $user, ['overrides' => $old], ['overrides' => $payload['overrides']]);

        return response()->json($payload);
    }

    private function userPayload(User $user): array
    {
        $overrides = DB::table('user_permissions')->join('permissions', 'permissions.id', '=', 'permission_id')
            ->where('user_id', $user->id)->orderBy('permissions.sort_order')
            ->get(['permissions.key', 'effect', 'scope'])->map(fn ($o) => (array) $o)->all();
        $roleGrants = DB::table('role_permissions')->join('permissions', 'permissions.id', '=', 'permission_id')
            ->where('role_id', $user->role_id)->pluck('scope', 'permissions.key')->all();
        Access::forget($user);

        return [
            'user_id' => $user->id,
            'role_grants' => $user->isSuperAdmin() ? Access::effective($user) : $roleGrants,
            'overrides' => $overrides,
            'effective' => Access::effective($user),
        ];
    }

    private function assertKnown(array $byKey, array $known): void
    {
        $unknown = array_diff(array_keys($byKey), array_keys($known));
        if ($unknown) {
            throw ValidationException::withMessages(['grants' => 'صلاحية غير معروفة: '.implode('، ', $unknown)]);
        }
    }

    /** @param array<string,string> $grants key => scope being handed out */
    private function assertWithinOwn(User $actor, array $grants): void
    {
        if ($actor->isSuperAdmin()) {
            return;
        }
        $mine = Access::effective($actor);
        foreach ($grants as $key => $scope) {
            if (! isset($mine[$key]) || self::RANK[$scope] > self::RANK[$mine[$key]]) {
                throw ValidationException::withMessages(['grants' => 'لا يمكنك منح صلاحية أوسع من صلاحيتك.']);
            }
        }
    }
}
