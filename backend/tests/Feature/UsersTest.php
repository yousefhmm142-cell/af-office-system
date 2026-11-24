<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class UsersTest extends TestCase
{
    private function roleId(string $key): int
    {
        return Role::where('key', $key)->value('id');
    }

    public function test_hr_creates_an_employee_who_must_change_the_password(): void
    {
        $branch = $this->makeBranch();
        $this->actAs(Role::HR);

        $res = $this->postJson('/api/users', [
            'name' => 'أحمد محمد علي حسن', 'username' => 'Ahmad.H', 'password' => 'temp1234',
            'role_id' => $this->roleId(Role::EMPLOYEE), 'branch_id' => $branch->id,
        ])->assertCreated()->assertJsonPath('user.username', 'ahmad.h')->assertJsonPath('user.must_change_password', true);

        $this->assertDatabaseHas('audit_logs', ['action' => 'user.created', 'subject_id' => $res->json('user.id')]);
        $this->assertStringNotContainsString('temp1234', (string) DB::table('audit_logs')->value('new_values'));
    }

    public function test_arabic_usernames_and_duplicates(): void
    {
        $branch = $this->makeBranch();
        $this->actAs(Role::SUPER_ADMIN);
        $body = ['name' => 'محمد', 'password' => 'temp1234', 'role_id' => $this->roleId(Role::EMPLOYEE), 'branch_id' => $branch->id];

        $this->postJson('/api/users', $body + ['username' => 'محمد.ش'])->assertCreated();
        $this->postJson('/api/users', $body + ['username' => 'محمد.ش'])->assertStatus(422)->assertJsonPath('errors.username.0', 'اسم المستخدم مستخدم من قبل. اختر اسماً آخر.');
        $this->postJson('/api/users', $body + ['username' => 'فيه فراغ'])->assertStatus(422);
        $this->postJson('/api/users', $body + ['username' => 'ab'])->assertStatus(422);
    }

    public function test_employee_and_branch_manager_need_a_branch(): void
    {
        $this->actAs(Role::SUPER_ADMIN);
        $this->postJson('/api/users', [
            'name' => 'محمد', 'username' => 'mohd', 'password' => 'temp1234', 'role_id' => $this->roleId(Role::EMPLOYEE),
        ])->assertStatus(422)->assertJsonValidationErrors('branch_id');
    }

    public function test_nobody_creates_an_account_at_or_above_their_level(): void
    {
        $this->actAs(Role::HR);
        foreach ([Role::HR, Role::MANAGEMENT, Role::SUPER_ADMIN] as $role) {
            $this->postJson('/api/users', [
                'name' => 'سامي', 'username' => 'up_'.$role, 'password' => 'temp1234', 'role_id' => $this->roleId($role),
            ])->assertForbidden();
        }
    }

    public function test_branch_scoped_manager_only_manages_own_branch(): void
    {
        $a = $this->makeBranch('فرع أ');
        $b = $this->makeBranch('فرع ب');
        $manager = $this->makeUser(Role::BRANCH_MANAGER, $a);
        DB::table('role_permissions')->insert([
            'role_id' => $manager->role_id, 'permission_id' => Permission::where('key', 'users.manage')->value('id'), 'scope' => 'branch',
        ]);
        \Laravel\Sanctum\Sanctum::actingAs($manager);
        $body = ['name' => 'سامي', 'password' => 'temp1234', 'role_id' => $this->roleId(Role::EMPLOYEE)];

        $this->postJson('/api/users', $body + ['username' => 'in_a', 'branch_id' => $a->id])->assertCreated();
        $this->postJson('/api/users', $body + ['username' => 'in_b', 'branch_id' => $b->id])->assertForbidden();

        $other = $this->makeUser(Role::EMPLOYEE, $b);
        $this->patchJson("/api/users/{$other->id}", ['name' => 'تغيير'])->assertForbidden();
        $mine = User::where('username', 'in_a')->first();
        // Cannot move one of theirs into another branch either.
        $this->patchJson("/api/users/{$mine->id}", ['branch_id' => $b->id])->assertForbidden();
        $this->patchJson("/api/users/{$mine->id}", ['name' => 'اسم جديد'])->assertOk();
    }

    public function test_cannot_change_own_role_or_stop_own_account(): void
    {
        $me = $this->actAs(Role::SUPER_ADMIN);
        $this->patchJson("/api/users/{$me->id}", ['is_active' => false])->assertForbidden();
        $this->patchJson("/api/users/{$me->id}", ['role_id' => $this->roleId(Role::EMPLOYEE)])->assertForbidden();
        $this->deleteJson("/api/users/{$me->id}")->assertForbidden();
        $this->patchJson("/api/users/{$me->id}", ['name' => 'يوسف مروان'])->assertOk();
    }

    public function test_reset_password_unlocks_and_signs_out(): void
    {
        $branch = $this->makeBranch();
        $emp = $this->makeUser(Role::EMPLOYEE, $branch, ['username' => 'ahmad']);
        $emp->forceFill(['locked_until' => now()->addMinutes(10)])->save();
        $emp->createToken('phone');
        $this->actAs(Role::HR);

        $this->postJson("/api/users/{$emp->id}/reset-password", ['password' => 'fresh1234'])->assertOk()->assertJsonPath('user.is_locked', false);
        $this->assertSame(0, $emp->tokens()->count());

        $this->postJson('/api/auth/login', ['username' => 'ahmad', 'password' => 'fresh1234'])->assertOk()->assertJsonPath('user.must_change_password', true);
    }

    public function test_stopping_a_user_signs_them_out_everywhere(): void
    {
        $branch = $this->makeBranch();
        $emp = $this->makeUser(Role::EMPLOYEE, $branch);
        $emp->createToken('phone');
        $this->actAs(Role::HR);
        $this->patchJson("/api/users/{$emp->id}", ['is_active' => false])->assertOk();
        $this->assertSame(0, $emp->tokens()->count());
    }

    public function test_deleted_username_stays_reserved(): void
    {
        $branch = $this->makeBranch();
        $emp = $this->makeUser(Role::EMPLOYEE, $branch, ['username' => 'ahmad']);
        $this->actAs(Role::HR);
        $this->deleteJson("/api/users/{$emp->id}")->assertOk();
        $this->assertSoftDeleted($emp);
        $this->postJson('/api/users', [
            'name' => 'سامي', 'username' => 'ahmad', 'password' => 'temp1234', 'role_id' => $this->roleId(Role::EMPLOYEE), 'branch_id' => $branch->id,
        ])->assertStatus(422);
    }
}
