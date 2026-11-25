<?php

namespace Tests\Feature;

use App\Models\AttendanceDay;
use App\Models\Branch;
use App\Models\PayrollItem;
use App\Models\PayrollSetting;
use App\Models\Role;
use App\Models\User;
use App\Models\WorkSchedule;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PayrollTest extends TestCase
{
    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();
        $this->branch = $this->makeBranch('مخيم 2');
        WorkSchedule::create(['branch_id' => $this->branch->id, 'name' => 'عادي', 'start_time' => '08:00', 'end_time' => '16:00', 'work_days' => WorkSchedule::ALL_DAYS, 'is_default' => true]);
        $this->travelTo(CarbonImmutable::parse('2026-11-05 10:00', 'Asia/Gaza'));
    }

    /** An employee with a salary and an October of attendance: 29 days present (2 absent), 60 late minutes, 120 extra minutes. */
    private function employee(string $type = 'monthly', float $salary = 3000): User
    {
        $u = $this->makeUser(Role::EMPLOYEE, $this->branch, ['name' => 'أحمد']);
        $u->employee->update(['salary_type' => $type, 'salary_amount' => $salary, 'daily_hours' => 8, 'hire_date' => '2026-01-01',
            'payment_method' => 'wallet', 'provider' => 'PalPay', 'account_number' => '0599123456', 'national_id' => '401234567']);
        for ($d = 1; $d <= 29; $d++) {
            AttendanceDay::create([
                'user_id' => $u->id, 'branch_id' => $this->branch->id, 'date' => sprintf('2026-10-%02d', $d),
                'check_in' => CarbonImmutable::parse(sprintf('2026-10-%02d 08:00', $d), 'Asia/Gaza')->utc(),
                'check_out' => CarbonImmutable::parse(sprintf('2026-10-%02d 16:00', $d), 'Asia/Gaza')->utc(),
                'worked_minutes' => 480, 'late_minutes' => $d <= 2 ? 30 : 0, 'overtime_minutes' => $d === 3 ? 120 : 0,
                'is_work_day' => true, 'approval_status' => 'approved',
            ]);
        }

        return $u;
    }

    private function settings(): void
    {
        $this->postJson('/api/payroll/settings', [
            'effective_from' => '2026-01-01', 'late_mode' => 'wage', 'late_value' => 1,
            'absence_mode' => 'wage', 'absence_value' => 1, 'overtime_mode' => 'wage', 'overtime_value' => 1.5,
        ])->assertCreated();
    }

    public function test_two_batches_of_a_month_add_up_with_attendance_settled_in_the_last(): void
    {
        $emp = $this->employee();
        $this->actAs(Role::HR);
        $this->settings();
        PayrollSetting::query()->update(['late_mode' => 'wage', 'late_value' => 1, 'absence_mode' => 'wage', 'absence_value' => 1]);
        $this->postJson('/api/payroll/adjustments', ['user_id' => $emp->id, 'type' => 'bonus', 'month' => '2026-10', 'amount' => 100, 'reason' => 'مكافأة'])->assertCreated();
        $this->postJson('/api/payroll/adjustments', ['user_id' => $emp->id, 'type' => 'deduction', 'month' => '2026-10', 'amount' => 50, 'reason' => 'غرامة'])->assertCreated();
        $this->postJson('/api/payroll/advances', ['user_id' => $emp->id, 'amount' => 500, 'installment' => 200, 'start_month' => '2026-10'])->assertCreated();

        // First half: base only, plus the month's manual items and one instalment.
        $b1 = $this->postJson('/api/payroll/batches', ['month' => '2026-10', 'percent' => 50, 'branch_id' => $this->branch->id])
            ->assertCreated()->assertJsonPath('batch.is_final', false)->json('batch.id');
        $line = $this->getJson("/api/payroll/batches/{$b1}")->assertOk()->json('items.0');
        $this->assertEquals([1500, 0, 100, 0, 50, 0, 1550], [$line['base'], $line['auto_deductions'], $line['bonuses'], $line['overtime'], $line['manual_deductions'], $line['advance_deduction'], $line['net']]);
        $this->assertSame('PalPay', $line['payment']['provider']);

        $this->getJson('/api/payroll/plan?month=2026-10&branch_id='.$this->branch->id)->assertJsonPath('left', 50);
        $this->postJson('/api/payroll/batches', ['month' => '2026-10', 'percent' => 60, 'branch_id' => $this->branch->id])->assertStatus(422);

        // Second half completes the month: late (1 h), absence (2 days) and extra time (2 h × 1.5) at 3000 ÷ (31 × 8) an hour.
        $b2 = $this->postJson('/api/payroll/batches', ['month' => '2026-10', 'percent' => 50, 'branch_id' => $this->branch->id])
            ->assertCreated()->assertJsonPath('batch.is_final', true)->json('batch.id');
        $line = $this->getJson("/api/payroll/batches/{$b2}")->json('items.0');
        $this->assertEquals(1500, $line['base']);
        $this->assertEquals(0, $line['auto_deductions']);
        $this->assertEqualsWithDelta(36.29, $line['overtime'], 0.01);
        $this->assertEquals(0, $line['bonuses']); // already paid by the first batch
        $this->assertEquals(0, $line['advance_deduction']);
        $this->assertEqualsWithDelta(1536.29, $line['net'], 0.02);
        $this->assertSame(2, $line['details']['absent_days']);
    }

    public function test_old_draft_with_automatic_deduction_requires_review_before_approval(): void
    {
        $this->employee();
        $this->actAs(Role::HR);
        $id = $this->postJson('/api/payroll/batches', ['month' => '2026-10', 'percent' => 100, 'branch_id' => $this->branch->id])->assertCreated()->json('batch.id');
        PayrollItem::where('batch_id', $id)->update(['auto_deductions' => 25, 'net' => 2975]);
        $this->actAs(Role::MANAGEMENT);
        $this->postJson("/api/payroll/batches/$id/approve")->assertUnprocessable();
        $this->actAs(Role::HR);
        $this->postJson("/api/payroll/batches/$id/recalculate")->assertOk()->assertJsonPath('items.0.auto_deductions', 0);
        $this->actAs(Role::MANAGEMENT);
        $this->postJson("/api/payroll/batches/$id/approve")->assertOk()->assertJsonPath('batch.total_net', 3000);
    }

    public function test_daily_wage_follows_days_attended(): void
    {
        $this->employee('daily', 100);
        $this->actAs(Role::HR);
        $id = $this->postJson('/api/payroll/batches', ['month' => '2026-10', 'percent' => 50, 'branch_id' => $this->branch->id])->json('batch.id');
        $this->assertEquals(1450, $this->getJson("/api/payroll/batches/{$id}")->json('items.0.base'));
    }

    public function test_advance_instalment_shrinks_when_net_is_not_enough(): void
    {
        $emp = $this->employee('monthly', 300);
        $this->actAs(Role::HR);
        $advance = $this->postJson('/api/payroll/advances', ['user_id' => $emp->id, 'amount' => 1000, 'installment' => 400, 'start_month' => '2026-10'])->assertCreated()->json('advance.id');
        $id = $this->postJson('/api/payroll/batches', ['advance_ids' => [$advance], 'month' => '2026-10', 'percent' => 50, 'branch_id' => $this->branch->id])->json('batch.id');
        $line = $this->getJson("/api/payroll/batches/{$id}")->json('items.0');
        $this->assertEquals([150, 150, 0], [$line['base'], $line['advance_deduction'], $line['net']]);
        $this->assertNotEmpty($line['details']['notes']);
    }

    public function test_approval_locks_the_batch_and_the_employee_sees_it(): void
    {
        $emp = $this->employee();
        $this->actAs(Role::HR);
        $id = $this->postJson('/api/payroll/batches', ['month' => '2026-10', 'percent' => 100, 'branch_id' => $this->branch->id])->json('batch.id');

        Sanctum::actingAs($emp);
        $this->getJson('/api/payroll/mine')->assertOk()->assertJsonCount(0, 'items');
        $this->getJson('/api/payroll/batches')->assertForbidden();

        $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $this->postJson("/api/payroll/batches/{$id}/approve")->assertForbidden();

        $this->actAs(Role::MANAGEMENT);
        $this->postJson("/api/payroll/batches/{$id}/approve")->assertOk()->assertJsonPath('batch.status', 'approved');

        $this->actAs(Role::HR);
        $this->postJson("/api/payroll/batches/{$id}/recalculate")->assertStatus(422);
        $this->deleteJson("/api/payroll/batches/{$id}")->assertStatus(422);
        $this->postJson("/api/payroll/batches/{$id}/paid")->assertOk()->assertJsonPath('batch.status', 'paid');
        $csv = $this->get("/api/payroll/batches/{$id}/export")->assertOk()->streamedContent();
        $this->assertStringContainsString('أحمد', $csv);
        $this->assertStringContainsString('401234567', $csv);

        Sanctum::actingAs($emp);
        $this->getJson('/api/payroll/mine')->assertOk()->assertJsonCount(1, 'items')->assertJsonPath('items.0.batch.status', 'paid');
    }

    public function test_deleting_a_draft_frees_its_manual_items_and_settings_cannot_reach_back(): void
    {
        $emp = $this->employee();
        $this->actAs(Role::HR);
        $adj = $this->postJson('/api/payroll/adjustments', ['user_id' => $emp->id, 'type' => 'bonus', 'month' => '2026-10', 'amount' => 70, 'reason' => 'x x'])->json('adjustment.id');
        $id = $this->postJson('/api/payroll/batches', ['month' => '2026-10', 'percent' => 100, 'branch_id' => $this->branch->id])->json('batch.id');
        $this->assertDatabaseHas('payroll_adjustments', ['id' => $adj, 'batch_id' => $id]);
        $this->deleteJson("/api/payroll/batches/{$id}")->assertOk();
        $this->assertDatabaseHas('payroll_adjustments', ['id' => $adj, 'batch_id' => null]);

        $id = $this->postJson('/api/payroll/batches', ['month' => '2026-10', 'percent' => 100, 'branch_id' => $this->branch->id])->json('batch.id');
        $this->actAs(Role::MANAGEMENT);
        $this->postJson("/api/payroll/batches/{$id}/approve")->assertOk();
        $this->actAs(Role::HR);
        $this->postJson('/api/payroll/settings', ['effective_from' => '2026-10-01', 'late_mode' => 'none', 'late_value' => 0, 'absence_mode' => 'none', 'absence_value' => 0, 'overtime_mode' => 'none', 'overtime_value' => 0])
            ->assertStatus(422)->assertJsonValidationErrors('effective_from');
        $this->deleteJson("/api/payroll/adjustments/{$adj}")->assertStatus(422);
    }

    public function test_terminated_and_unpaid_people_are_left_out(): void
    {
        $emp = $this->employee();
        $this->makeUser(Role::EMPLOYEE, $this->branch); // no salary set
        $this->actAs(Role::HR);
        $this->postJson("/api/employees/{$emp->id}/status", ['status' => 'terminated', 'reason' => 'انتهى العقد'])->assertOk();
        $this->postJson('/api/payroll/batches', ['month' => '2026-10', 'percent' => 100, 'branch_id' => $this->branch->id])->assertJsonPath('batch.employees_count', 0);
    }
}
