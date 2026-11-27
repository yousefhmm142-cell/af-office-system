<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Role;
use Tests\TestCase;

class BranchesTest extends TestCase
{
    public function test_super_admin_creates_a_branch_with_sections_and_a_default_schedule(): void
    {
        $this->actAs(Role::SUPER_ADMIN);
        $res = $this->postJson('/api/branches', [
            'name' => 'مخيم 2', 'start_time' => '07:30', 'work_hours' => 8, 'modules' => ['attendance', 'generation', 'tasks'],
        ])->assertCreated();

        $modules = collect($res->json('branch.modules'))->pluck('enabled', 'key');
        $this->assertTrue($modules['generation']);
        $this->assertFalse($modules['seals']);

        $id = $res->json('branch.id');
        $schedule = $this->getJson("/api/branches/{$id}")->assertOk()->json('schedules.0');
        $this->assertSame(['07:30', '15:30', true], [$schedule['start_time'], $schedule['end_time'], $schedule['is_default']]);
        // Friday (5) is a work day.
        $this->assertSame([1, 2, 3, 4, 5, 6, 7], $schedule['work_days']);
    }

    public function test_branch_manager_cannot_create_branches(): void
    {
        $this->actAs(Role::BRANCH_MANAGER, $this->makeBranch());
        $this->postJson('/api/branches', ['name' => 'جديد'])->assertForbidden();
    }

    public function test_switching_sections_off_and_on(): void
    {
        $this->actAs(Role::SUPER_ADMIN);
        $id = $this->postJson('/api/branches', ['name' => 'فرع'])->json('branch.id');

        $this->putJson("/api/branches/{$id}/modules", ['modules' => ['seals' => false]])->assertOk();
        $modules = collect($this->getJson("/api/branches/{$id}")->json('branch.modules'))->pluck('enabled', 'key');
        $this->assertFalse($modules['seals']);
        $this->assertTrue($modules['tasks']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'branch.modules']);
    }

    public function test_manager_must_belong_to_the_branch(): void
    {
        $a = $this->makeBranch('فرع أ');
        $b = $this->makeBranch('فرع ب');
        $outsider = $this->makeUser(Role::BRANCH_MANAGER, $b);
        $insider = $this->makeUser(Role::BRANCH_MANAGER, $a);
        $this->actAs(Role::SUPER_ADMIN);

        $this->patchJson("/api/branches/{$a->id}", ['manager_user_id' => $outsider->id])->assertStatus(422);
        $this->patchJson("/api/branches/{$a->id}", ['manager_user_id' => $insider->id])->assertOk()->assertJsonPath('branch.manager.id', $insider->id);
    }

    public function test_branch_with_employees_cannot_be_deleted(): void
    {
        $branch = $this->makeBranch();
        $this->makeUser(Role::EMPLOYEE, $branch);
        $this->actAs(Role::SUPER_ADMIN);
        $this->deleteJson("/api/branches/{$branch->id}")->assertStatus(422)->assertJsonPath('code', 'branch_has_users');
        $empty = $this->makeBranch('فاضي');
        $this->deleteJson("/api/branches/{$empty->id}")->assertOk();
        $this->assertSoftDeleted(Branch::withTrashed()->find($empty->id));
    }

    public function test_schedules_keep_one_default_and_check_times(): void
    {
        $this->actAs(Role::HR);
        $branch = $this->makeBranch();
        $first = $this->postJson('/api/schedules', [
            'branch_id' => $branch->id, 'name' => 'الدوام العادي', 'start_time' => '08:00', 'end_time' => '16:00', 'work_days' => [1, 2, 3, 4, 5, 6, 7],
        ])->assertCreated()->json('schedule');
        $this->assertTrue($first['is_default']);

        $second = $this->postJson('/api/schedules', [
            'branch_id' => $branch->id, 'name' => 'بطالة', 'start_time' => '08:00', 'end_time' => '14:00', 'work_days' => [6, 7, 1, 2, 3], 'is_default' => true,
        ])->assertCreated()->json('schedule');
        $this->assertTrue($second['is_default']);
        $this->assertSame([1, 2, 3, 6, 7], $second['work_days']);
        $this->assertFalse(collect($this->getJson('/api/schedules?branch_id='.$branch->id)->json('schedules'))->firstWhere('id', $first['id'])['is_default']);

        $this->postJson('/api/schedules', [
            'branch_id' => $branch->id, 'name' => 'غلط', 'start_time' => '16:00', 'end_time' => '08:00', 'work_days' => [1],
        ])->assertStatus(422)->assertJsonValidationErrors('end_time');
        $this->deleteJson("/api/schedules/{$second['id']}")->assertStatus(422);
        $this->deleteJson("/api/schedules/{$first['id']}")->assertOk();
    }

    public function test_holidays_company_wide_and_per_branch(): void
    {
        $branch = $this->makeBranch();
        $this->actAs(Role::HR);
        $this->postJson('/api/holidays', ['date' => '2026-12-25', 'name' => 'عطلة عامة'])->assertCreated();
        $this->postJson('/api/holidays', ['date' => '2026-12-25', 'name' => 'مكرر'])->assertStatus(422);
        $this->postJson('/api/holidays', ['date' => '2026-12-26', 'name' => 'للفرع', 'branch_id' => $branch->id])->assertCreated();

        $this->actAs(Role::BRANCH_MANAGER, $this->makeBranch('ثاني'));
        $this->assertSame(['عطلة عامة'], collect($this->getJson('/api/holidays?year=2026')->json('holidays'))->pluck('name')->all());
    }
}
