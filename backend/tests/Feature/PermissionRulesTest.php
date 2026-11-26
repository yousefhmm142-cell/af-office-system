<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Decisions follow the permissions (and so the «الصلاحيات» page), not the name of the role. */
class PermissionRulesTest extends TestCase
{
    private function leave($branch): array
    {
        \App\Models\WorkSchedule::create(['branch_id' => $branch->id, 'name' => 'عادي', 'start_time' => '07:30', 'end_time' => '15:30', 'work_days' => \App\Models\WorkSchedule::ALL_DAYS, 'is_default' => true]);
        $worker = $this->makeUser(Role::EMPLOYEE, $branch);
        Sanctum::actingAs($worker);
        $id = $this->postJson('/api/leaves', ['kind' => 'sick', 'starts' => '2026-12-01', 'ends' => '2026-12-01', 'reason' => 'مرض'])->assertSuccessful()->json('id');

        return [$worker, $id ?? DB::table('leave_requests')->value('id')];
    }

    public function test_super_admin_and_hr_decide_but_a_branch_manager_does_not(): void
    {
        $branch = $this->makeBranch();
        [, $id] = $this->leave($branch);
        $this->actAs(Role::BRANCH_MANAGER, $branch);
        $this->patchJson("/api/leaves/{$id}", ['action' => 'approved'])->assertForbidden();
        $this->actAs(Role::SUPER_ADMIN);
        $this->patchJson("/api/leaves/{$id}", ['action' => 'rejected'])->assertOk();
    }

    public function test_granting_the_permission_lets_another_role_decide(): void
    {
        $branch = $this->makeBranch();
        [, $id] = $this->leave($branch);
        $manager = $this->actAs(Role::BRANCH_MANAGER, $branch);
        DB::table('user_permissions')->insert(['user_id' => $manager->id, 'permission_id' => Permission::where('key', 'leaves.decide')->value('id'), 'scope' => 'branch', 'effect' => 'allow', 'created_at' => now(), 'updated_at' => now()]);
        $manager->accessCache = null;
        $this->patchJson("/api/leaves/{$id}", ['action' => 'approved'])->assertOk();
    }

    public function test_deductions_need_the_payroll_deductions_permission(): void
    {
        $branch = $this->makeBranch();
        $worker = $this->makeUser(Role::EMPLOYEE, $branch);
        $this->actAs(Role::SUPER_ADMIN);
        $this->postJson('/api/payroll/adjustments', ['user_id' => $worker->id, 'type' => 'deduction', 'month' => '2026-11', 'amount' => 20, 'reason' => 'تجربة'])->assertSuccessful();
        $this->actAs(Role::MANAGEMENT);
        $this->postJson('/api/payroll/adjustments', ['user_id' => $worker->id, 'type' => 'deduction', 'month' => '2026-11', 'amount' => 20, 'reason' => 'تجربة'])->assertForbidden();
    }
}
