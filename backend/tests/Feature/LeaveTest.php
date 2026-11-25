<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\WorkSchedule;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaveTest extends TestCase
{
    public function test_annual_leave_uses_only_workdays_on_final_approval_and_cancellation_restores_balance(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-28 12:00', 'Asia/Gaza'));
        $branch = $this->makeBranch();
        WorkSchedule::create(['branch_id' => $branch->id, 'name' => 'عادي', 'start_time' => '08:00', 'end_time' => '16:00', 'work_days' => [1, 2, 3, 4, 6, 7], 'is_default' => true]);
        $employee = $this->actAs(Role::EMPLOYEE, $branch);
        $id = $this->postJson('/api/leaves', ['kind' => 'annual', 'starts' => '2026-11-26', 'ends' => '2026-11-27', 'reason' => 'سفر'])->assertCreated()->json('id');
        $this->patchJson("/api/leaves/$id", ['action' => 'approved'])->assertForbidden();
        $this->actAs(Role::EMPLOYEE, $branch);
        $this->getJson('/api/leaves')->assertJsonCount(0, 'requests');
        $this->actAs(Role::MANAGEMENT);
        $this->patchJson("/api/leaves/$id", ['action' => 'approved'])->assertForbidden();
        $hr = $this->actAs(Role::HR);
        $this->putJson("/api/employees/$employee->id/leave-allowance", ['year' => 2026, 'days' => 3])->assertOk();
        $this->getJson('/api/leaves')->assertJsonPath('requests.0.days', 1);
        $this->patchJson("/api/leaves/$id", ['action' => 'escalated'])->assertOk();
        $this->actAs(Role::MANAGEMENT);
        $this->patchJson("/api/leaves/$id", ['action' => 'approved'])->assertOk();
        Sanctum::actingAs($hr);
        $this->getJson("/api/employees/$employee->id")->assertOk()->assertJsonPath('annual_leave.used', 1);
        $rows = $this->getJson("/api/attendance/board?branch_id=$branch->id&date=2026-11-26")->assertOk()->json('rows');
        $this->assertSame('leave', collect($rows)->firstWhere('user.id', $employee->id)['state']);
        $this->patchJson("/api/leaves/$id", ['action' => 'cancelled'])->assertOk();
        $this->getJson("/api/employees/$employee->id")->assertJsonPath('annual_leave.used', 0);
    }

    public function test_hourly_permission_must_fit_the_overnight_shift(): void
    {
        $branch = $this->makeBranch();
        WorkSchedule::create(['branch_id' => $branch->id, 'name' => 'ليلي', 'start_time' => '22:00', 'end_time' => '06:00', 'work_days' => [5], 'is_default' => true]);
        $this->actAs(Role::EMPLOYEE, $branch);
        $form = ['kind' => 'permission', 'starts' => '2026-11-27', 'ends' => '2026-11-27', 'reason' => 'مراجعة'];
        $this->postJson('/api/leaves', $form + ['from_time' => '07:00', 'to_time' => '08:00'])->assertUnprocessable();
        $id = $this->postJson('/api/leaves', $form + ['from_time' => '23:00', 'to_time' => '01:00'])->assertCreated()->json('id');
        $this->actAs(Role::HR);
        $this->patchJson("/api/leaves/$id", ['action' => 'approved'])->assertOk();
        $this->getJson("/api/attendance/board?branch_id=$branch->id&date=2026-11-27")->assertJsonPath('rows.0.permission', '23:00–01:00');
    }
}
