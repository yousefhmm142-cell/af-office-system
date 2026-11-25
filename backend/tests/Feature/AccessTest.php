<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Support\Access;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AccessTest extends TestCase
{
    public function test_branch_manager_sees_only_their_branch(): void
    {
        $a = $this->makeBranch('فرع أ');
        $b = $this->makeBranch('فرع ب');
        $this->makeUser(Role::EMPLOYEE, $a, ['name' => 'موظف أ']);
        $this->makeUser(Role::EMPLOYEE, $b, ['name' => 'موظف ب']);
        $this->actAs(Role::BRANCH_MANAGER, $a);

        $names = collect($this->getJson('/api/users')->assertOk()->json('users'))->pluck('name');
        $this->assertTrue($names->contains('موظف أ'));
        $this->assertFalse($names->contains('موظف ب'));

        $this->assertSame([$a->id], collect($this->getJson('/api/branches')->json('branches'))->pluck('id')->all());
        $this->getJson("/api/branches/{$b->id}")->assertForbidden();
    }

    public function test_management_and_hr_see_every_branch(): void
    {
        $this->makeBranch('فرع أ');
        $this->makeBranch('فرع ب');
        foreach ([Role::MANAGEMENT, Role::HR] as $role) {
            $this->actAs($role);
            $this->assertCount(2, $this->getJson('/api/branches')->assertOk()->json('branches'));
        }
    }

    public function test_employee_cannot_open_admin_pages(): void
    {
        $this->actAs(Role::EMPLOYEE, $this->makeBranch());
        $this->getJson('/api/users')->assertForbidden();
        $this->getJson('/api/branches')->assertForbidden();
        $this->getJson('/api/permissions')->assertForbidden();
        $this->getJson('/api/me')->assertOk()->assertJsonPath('user.permissions', []);
    }

    public function test_personal_override_beats_the_role(): void
    {
        $branch = $this->makeBranch();
        $user = $this->makeUser(Role::BRANCH_MANAGER, $branch);
        $perm = fn ($k) => Permission::where('key', $k)->value('id');

        DB::table('user_permissions')->insert([
            ['user_id' => $user->id, 'permission_id' => $perm('users.view'), 'effect' => 'deny', 'scope' => null],
            ['user_id' => $user->id, 'permission_id' => $perm('audit.view'), 'effect' => 'allow', 'scope' => 'branch'],
        ]);
        $access = Access::effective($user->fresh());

        $this->assertArrayNotHasKey('users.view', $access);
        $this->assertSame('branch', $access['audit.view']);
        $this->assertSame('branch', $access['branches.view']);
    }

    public function test_super_admin_always_has_everything(): void
    {
        $user = $this->makeUser(Role::SUPER_ADMIN);
        DB::table('user_permissions')->insert([
            'user_id' => $user->id, 'permission_id' => Permission::where('key', 'users.view')->value('id'), 'effect' => 'deny',
        ]);
        $access = Access::effective(User::find($user->id));
        $this->assertSame(Permission::count(), count($access));
        $this->assertSame('all', $access['users.view']);
    }

    public function test_branch_manager_grants_only_local_page_access_to_employees(): void
    {
        $branch = $this->makeBranch('فرع أ');
        $other = $this->makeBranch('فرع ب');
        $worker = $this->makeUser(Role::EMPLOYEE, $branch);
        $outside = $this->makeUser(Role::EMPLOYEE, $other);
        $manager = $this->actAs(Role::BRANCH_MANAGER, $branch);

        $this->getJson('/api/settings/branch/pages')->assertOk()
            ->assertJsonPath('people.0.id', $worker->id)->assertJsonCount(1, 'people');
        $this->putJson("/api/settings/branch/users/{$outside->id}/page", ['key' => 'tasks.view', 'enabled' => true])->assertForbidden();
        $this->putJson("/api/settings/branch/users/{$manager->id}/page", ['key' => 'tasks.view', 'enabled' => true])->assertForbidden();
        $this->putJson("/api/settings/branch/users/{$worker->id}/page", ['key' => 'payroll.view', 'enabled' => true])->assertUnprocessable();

        $path = "/api/settings/branch/users/{$worker->id}/page";
        $this->putJson($path, ['key' => 'tasks.view', 'enabled' => true])->assertOk();
        $this->putJson($path, ['key' => 'tasks.view', 'enabled' => true])->assertOk();
        $this->assertSame('branch', Access::scope($worker->fresh(), 'tasks.view'));
        $this->assertDatabaseCount('branch_page_grants', 1);

        $worker->update(['branch_id' => $other->id]);
        $this->assertNull(Access::scope($worker->fresh(), 'tasks.view'));
        $worker->update(['branch_id' => $branch->id]);
        $this->putJson($path, ['key' => 'tasks.view', 'enabled' => false])->assertOk();
        $this->assertNull(Access::scope($worker->fresh(), 'tasks.view'));

        DB::table('user_permissions')->insert([
            'user_id' => $worker->id, 'permission_id' => Permission::where('key', 'tasks.view')->value('id'),
            'effect' => 'deny', 'scope' => null,
        ]);
        $this->getJson('/api/settings/branch/pages')->assertOk()
            ->assertJsonPath('people.0.locked.0.key', 'tasks.view')->assertJsonPath('people.0.locked.0.enabled', false);
        $this->putJson($path, ['key' => 'tasks.view', 'enabled' => true])->assertForbidden();
    }

    public function test_changing_one_role_permission_retains_the_other_grants(): void
    {
        $this->actAs(Role::SUPER_ADMIN);
        $role = Role::where('key', Role::FINANCE)->firstOrFail();
        $attendance = Permission::where('key', 'attendance.view')->firstOrFail();

        $this->patchJson("/api/roles/{$role->id}/permissions", ['grants' => ['attendance.view' => 'all']])->assertOk();
        $this->assertDatabaseHas('role_permissions', ['role_id' => $role->id, 'permission_id' => $attendance->id, 'scope' => 'all']);

        $this->patchJson("/api/roles/{$role->id}/permissions", ['grants' => ['attendance.view' => null]])->assertOk();
        $this->assertDatabaseMissing('role_permissions', ['role_id' => $role->id, 'permission_id' => $attendance->id]);
        $this->assertSame(['payroll.view' => 'all'], $role->permissions()->pluck('scope', 'key')->all());
    }

    public function test_permissions_screen_cannot_hand_out_more_than_you_have(): void
    {
        // HR gets the permissions screen with a branch-less "all" on users only.
        $hr = $this->makeUser(Role::HR);
        $permId = Permission::where('key', 'permissions.manage')->value('id');
        DB::table('role_permissions')->insert(['role_id' => $hr->role_id, 'permission_id' => $permId, 'scope' => 'all']);
        \Laravel\Sanctum\Sanctum::actingAs($hr);
        $managerRole = Role::where('key', Role::BRANCH_MANAGER)->first();

        // audit.view is not HR's to give.
        $this->putJson("/api/roles/{$managerRole->id}/permissions", ['grants' => ['audit.view' => 'branch']])->assertStatus(422);
        // Management sits above HR.
        $mgmt = Role::where('key', Role::MANAGEMENT)->first();
        $this->putJson("/api/roles/{$mgmt->id}/permissions", ['grants' => []])->assertForbidden();
        // The super admin role never changes.
        $super = Role::where('key', Role::SUPER_ADMIN)->first();
        $this->putJson("/api/roles/{$super->id}/permissions", ['grants' => []])->assertForbidden();

        // Allowed: give branch managers user management in their own branch.
        $this->putJson("/api/roles/{$managerRole->id}/permissions", ['grants' => ['branches.view' => 'branch', 'schedules.view' => 'branch', 'users.view' => 'branch', 'users.manage' => 'branch']])
            ->assertOk();
        $this->assertDatabaseHas('role_permissions', ['role_id' => $managerRole->id, 'permission_id' => Permission::where('key', 'users.manage')->value('id'), 'scope' => 'branch']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'permissions.role', 'user_id' => $hr->id]);
    }

    public function test_super_admin_sets_personal_exceptions(): void
    {
        $branch = $this->makeBranch();
        $emp = $this->makeUser(Role::EMPLOYEE, $branch);
        $this->actAs(Role::SUPER_ADMIN);

        $this->putJson("/api/users/{$emp->id}/permissions", ['overrides' => [
            ['key' => 'users.view', 'effect' => 'allow', 'scope' => 'branch'],
        ]])->assertOk();
        $this->assertSame(['users.view' => 'branch'], $this->getJson("/api/users/{$emp->id}/permissions")->json('effective'));

        $this->putJson("/api/users/{$emp->id}/permissions", ['overrides' => []])->assertOk()->assertJsonPath('effective', []);
    }
}
