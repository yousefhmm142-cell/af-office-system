<?php

namespace Tests\Feature;

use App\Models\Role;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    public function test_branch_manager_sees_only_own_branch(): void
    {
        $a = $this->makeBranch('أ');
        $this->makeBranch('ب');
        $this->actAs(Role::BRANCH_MANAGER, $a);

        $res = $this->getJson('/api/dashboard')->assertOk();
        $this->assertCount(1, $res->json('branches'));
        $this->assertSame('أ', $res->json('branches.0.name'));
        $this->assertArrayNotHasKey('company', $res->json());
        $this->assertArrayHasKey('branch_detail', $res->json());
    }

    public function test_management_sees_every_branch_and_company_figures(): void
    {
        $this->makeBranch('أ');
        $this->makeBranch('ب');
        $this->actAs(Role::MANAGEMENT);

        $res = $this->getJson('/api/dashboard')->assertOk();
        $this->assertCount(2, $res->json('branches'));
        $this->assertSame(2, $res->json('company.branches'));
        $this->assertArrayHasKey('payroll', $res->json());
    }

    public function test_employee_sees_only_personal_figures(): void
    {
        $this->actAs(Role::EMPLOYEE, $this->makeBranch());

        $res = $this->getJson('/api/dashboard')->assertOk();
        $this->assertSame([], $res->json('branches'));
        $this->assertArrayNotHasKey('company', $res->json());
        $this->assertArrayNotHasKey('payroll', $res->json());
        $this->assertSame(0, $res->json('me.unread'));
    }

    public function test_audit_lines_carry_subject_name(): void
    {
        $this->actAs(Role::SUPER_ADMIN);
        $this->postJson('/api/branches', ['name' => 'فرع جديد'])->assertCreated();

        $this->getJson('/api/audit')->assertOk()->assertJsonPath('data.0.subject_name', 'فرع جديد');
    }
}
