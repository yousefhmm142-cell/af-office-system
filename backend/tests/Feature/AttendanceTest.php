<?php

namespace Tests\Feature;

use App\Models\AttendancePoint;
use App\Models\Branch;
use App\Models\BranchModule;
use App\Models\Holiday;
use App\Models\Role;
use App\Models\User;
use App\Models\WorkSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceTest extends TestCase
{
    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();
        $this->branch = $this->makeBranch('مخيم 2');
        WorkSchedule::create([
            'branch_id' => $this->branch->id, 'name' => 'عادي', 'start_time' => '07:30', 'end_time' => '15:30',
            'grace_minutes' => 10, 'work_days' => WorkSchedule::ALL_DAYS, 'is_default' => true,
        ]);
    }

    private function at(string $when): void
    {
        $this->travelTo(CarbonImmutable::parse($when, 'Asia/Gaza'));
    }

    private function press(array $extra = [])
    {
        return $this->postJson('/api/attendance/punch', ['method' => 'app'] + $extra)->assertOk();
    }

    public function test_company_overview_uses_the_selected_day_and_branch_attendance_rules(): void
    {
        $holidayBranch = $this->makeBranch('فرع العطلة');
        $closedBranch = $this->makeBranch('فرع بلا حضور');
        BranchModule::create(['branch_id' => $closedBranch->id, 'module' => 'attendance', 'is_enabled' => false]);
        Holiday::create(['branch_id' => $holidayBranch->id, 'date' => '2026-11-26', 'name' => 'عطلة الفرع']);
        $this->makeUser(Role::EMPLOYEE, $holidayBranch);
        $this->makeUser(Role::EMPLOYEE, $closedBranch);
        $this->makeUser(Role::EMPLOYEE, $this->branch);
        $laterHire = $this->makeUser(Role::EMPLOYEE, $this->branch);
        $laterHire->employee->update(['hire_date' => '2026-11-27']);

        $this->actAs(Role::EMPLOYEE, $this->branch);
        $this->at('2026-11-26 08:00');
        $this->press()->assertJsonPath('status', 'in');
        $this->at('2026-11-27 10:00');
        $manager = $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $manager->employee->update(['tracks_attendance' => false]);
        $this->getJson('/api/attendance/overview?date=2026-11-26')->assertForbidden();

        $this->actAs(Role::HR);
        $overview = $this->getJson('/api/attendance/overview?date=2026-11-26')
            ->assertOk()->assertJsonPath('date', '2026-11-26')->assertJsonCount(2, 'branches');
        $branches = collect($overview->json('branches'))->keyBy('id');
        $this->assertEquals([
            'expected' => 2, 'present' => 1, 'late' => 1, 'absent' => 1, 'pending' => 1,
        ], collect($branches->get($this->branch->id))->except(['id', 'name'])->all());
        $this->assertSame(0, $branches->get($holidayBranch->id)['expected']);
        $this->assertFalse($branches->has($closedBranch->id));
        $this->getJson('/api/attendance/overview?date=invalid')->assertUnprocessable();
    }

    public function test_button_in_then_out_with_the_rules(): void
    {
        $this->actAs(Role::EMPLOYEE, $this->branch);

        $this->at('2026-11-26 07:35');
        $this->press()->assertJsonPath('status', 'in')->assertJsonPath('day.check_in', '07:35')->assertJsonPath('day.late_minutes', 0);
        $this->at('2026-11-26 07:36');
        $this->press()->assertJsonPath('status', 'repeat')->assertJsonPath('ok', false);
        $this->at('2026-11-26 08:00');
        $this->press()->assertJsonPath('status', 'wait')->assertJsonPath('ok', false);
        $this->at('2026-11-26 15:40');
        $this->press()->assertJsonPath('status', 'out')->assertJsonPath('day.check_out', '15:40')->assertJsonPath('day.worked_minutes', 485);
        $this->at('2026-11-26 16:00');
        $this->press()->assertJsonPath('status', 'full');
        $this->assertDatabaseCount('attendance_punches', 2);
    }

    public function test_late_and_overtime_follow_the_schedule(): void
    {
        $this->actAs(Role::EMPLOYEE, $this->branch);
        $this->at('2026-11-26 07:50');
        $this->press()->assertJsonPath('day.late_minutes', 20);
        $this->at('2026-11-26 16:30');
        // Worked 520 minutes, the day is 480: 40 extra, counted in steps of 15 → 30.
        $this->press()->assertJsonPath('day.worked_minutes', 520)->assertJsonPath('day.overtime_minutes', 30);
    }

    public function test_friday_is_a_work_day_and_a_holiday_is_not(): void
    {
        $this->actAs(Role::EMPLOYEE, $this->branch);
        $this->at('2026-11-27 07:45'); // Friday
        $this->press()->assertJsonPath('day.is_work_day', true)->assertJsonPath('day.late_minutes', 15);

        Holiday::create(['date' => '2026-11-28', 'name' => 'عطلة']);
        $this->at('2026-11-28 09:00');
        $this->press()->assertJsonPath('day.is_work_day', false)->assertJsonPath('day.late_minutes', 0);
    }

    public function test_qr_rules_branch_network_and_anywhere(): void
    {
        $other = $this->makeBranch('فرع ثاني');
        $mine = AttendancePoint::create(['branch_id' => $this->branch->id, 'name' => 'المكتب', 'allowed_ips' => ['10.0.0.1']]);
        $theirs = AttendancePoint::create(['branch_id' => $other->id, 'name' => 'المكتب']);
        $user = $this->actAs(Role::EMPLOYEE, $this->branch);
        $this->at('2026-11-26 07:30');

        $this->postJson('/api/attendance/punch', ['method' => 'qr', 'code' => $theirs->code])->assertJsonPath('status', 'wrong_branch');
        $this->postJson('/api/attendance/punch', ['method' => 'qr', 'code' => 'nope'])->assertJsonPath('status', 'bad_code');
        // Tests come from 127.0.0.1, not the approved office address.
        $this->postJson('/api/attendance/punch', ['method' => 'qr', 'code' => $mine->code])->assertJsonPath('status', 'wrong_network');

        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.1'])
            ->postJson('/api/attendance/punch', ['method' => 'qr', 'code' => $mine->code])->assertJsonPath('status', 'in');

        // A technician allowed to punch anywhere skips the network check.
        $tech = $this->makeUser(Role::EMPLOYEE, $this->branch);
        $tech->employee->update(['punch_anywhere' => true]);
        Sanctum::actingAs($tech);
        $this->postJson('/api/attendance/punch', ['method' => 'qr', 'code' => $mine->code])->assertJsonPath('status', 'in');

        // The in-app button works from anywhere.
        Sanctum::actingAs($this->makeUser(Role::EMPLOYEE, $this->branch));
        $this->press()->assertJsonPath('status', 'in');
    }

    public function test_qr_location_when_set(): void
    {
        $point = AttendancePoint::create(['branch_id' => $this->branch->id, 'name' => 'المكتب', 'network_required' => false, 'lat' => 31.5, 'lng' => 34.46, 'radius_m' => 100]);
        $this->actAs(Role::EMPLOYEE, $this->branch);
        $this->postJson('/api/attendance/punch', ['method' => 'qr', 'code' => $point->code])->assertJsonPath('status', 'location_needed');
        $this->postJson('/api/attendance/punch', ['method' => 'qr', 'code' => $point->code, 'lat' => 31.51, 'lng' => 34.46, 'acc' => 10])->assertJsonPath('status', 'too_far');
        $this->postJson('/api/attendance/punch', ['method' => 'qr', 'code' => $point->code, 'lat' => 31.5003, 'lng' => 34.46, 'acc' => 20])->assertJsonPath('status', 'in');
    }

    public function test_offline_button_press_is_accepted_once_with_its_time(): void
    {
        $this->actAs(Role::EMPLOYEE, $this->branch);
        $this->at('2026-11-26 11:00');
        $uuid = (string) Str::uuid();
        $pressed = CarbonImmutable::parse('2026-11-26 07:40', 'Asia/Gaza')->toIso8601String();

        $this->press(['offline' => true, 'device_time' => $pressed, 'uuid' => $uuid])
            ->assertJsonPath('status', 'in')->assertJsonPath('day.check_in', '07:40')->assertJsonPath('day.recorded_offline', true);
        // Sent again after a cut connection: counted once.
        $this->press(['offline' => true, 'device_time' => $pressed, 'uuid' => $uuid])->assertJsonPath('status', 'duplicate')->assertJsonPath('ok', true);
        $this->assertDatabaseCount('attendance_punches', 1);

        $this->press(['offline' => true, 'device_time' => CarbonImmutable::parse('2026-11-23 08:00', 'Asia/Gaza')->toIso8601String(), 'uuid' => (string) Str::uuid()])
            ->assertJsonPath('status', 'bad_time');
    }

    public function test_attendance_off_in_branch_or_not_tracked(): void
    {
        $user = $this->actAs(Role::EMPLOYEE, $this->branch);
        BranchModule::create(['branch_id' => $this->branch->id, 'module' => 'attendance', 'is_enabled' => false]);
        $this->press()->assertJsonPath('status', 'module_off');
        BranchModule::where('branch_id', $this->branch->id)->update(['is_enabled' => true]);
        $user->employee->update(['tracks_attendance' => false]);
        $this->press()->assertJsonPath('status', 'not_tracked');
    }

    public function test_branch_manager_enters_and_fixes_days_and_it_is_logged(): void
    {
        $emp = $this->makeUser(Role::EMPLOYEE, $this->branch, ['name' => 'بلا جوال']);
        $manager = $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $this->at('2026-11-26 18:00');

        $this->putJson('/api/attendance/days', ['user_id' => $emp->id, 'date' => '2026-11-25', 'check_in' => '07:30', 'check_out' => '15:30'])
            ->assertOk()->assertJsonPath('day.worked_minutes', 480)->assertJsonPath('day.approval_status', 'approved')->assertJsonPath('day.manually_edited', true);
        $id = $this->putJson('/api/attendance/days', ['user_id' => $emp->id, 'date' => '2026-11-25', 'check_in' => '08:00', 'check_out' => '15:30', 'reason' => 'تصحيح'])
            ->assertOk()->assertJsonPath('day.late_minutes', 30)->json('day.id');

        $history = $this->getJson("/api/attendance/days/{$id}/history")->assertOk();
        $this->assertCount(2, $history->json('edits'));
        $this->assertSame('07:30', $history->json('edits.1.old.check_in'));
        $this->assertSame($manager->name, $history->json('edits.1.by'));

        $this->putJson('/api/attendance/days', ['user_id' => $emp->id, 'date' => '2026-11-30', 'check_in' => '08:00'])->assertStatus(422);
        $this->putJson('/api/attendance/days', ['user_id' => $manager->id, 'date' => '2026-11-25', 'check_in' => '08:00'])->assertForbidden();

        $outsider = $this->makeUser(Role::EMPLOYEE, $this->makeBranch('ثاني'));
        $this->putJson('/api/attendance/days', ['user_id' => $outsider->id, 'date' => '2026-11-25', 'check_in' => '08:00'])->assertForbidden();
    }

    public function test_employee_cannot_edit_or_see_the_board(): void
    {
        $this->actAs(Role::EMPLOYEE, $this->branch);
        $this->getJson('/api/attendance/board')->assertForbidden();
        $this->putJson('/api/attendance/days', ['user_id' => 1, 'date' => '2026-11-25', 'check_in' => '08:00'])->assertForbidden();
        $this->getJson('/api/attendance/me')->assertOk()->assertJsonPath('next.status', 'in');
    }

    public function test_board_states_and_approval(): void
    {
        $here = $this->makeUser(Role::EMPLOYEE, $this->branch, ['name' => 'أ حاضر']);
        $away = $this->makeUser(Role::EMPLOYEE, $this->branch, ['name' => 'ب غايب']);
        $this->at('2026-11-26 07:40');
        Sanctum::actingAs($here);
        $this->press();

        $manager = $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $this->at('2026-11-26 09:00');
        $board = $this->getJson('/api/attendance/board')->assertOk();
        $states = collect($board->json('rows'))->pluck('state', 'user.name');
        $this->assertSame('present', $states['أ حاضر']);
        $this->assertSame('not_yet', $states['ب غايب']);

        $this->at('2026-11-26 16:00');
        $board = $this->getJson('/api/attendance/board')->assertOk();
        $this->assertSame('absent', collect($board->json('rows'))->pluck('state', 'user.name')['ب غايب']);
        $this->assertSame(1, $board->json('summary.pending'));

        $this->postJson('/api/attendance/approve', ['branch_id' => $this->branch->id, 'date' => '2026-11-26'])->assertOk()->assertJsonPath('approved', 1);
        $this->assertSame(0, $this->getJson('/api/attendance/board')->json('summary.pending'));
    }

    public function test_only_the_branch_manager_approves_the_office_network(): void
    {
        $point = AttendancePoint::create(['branch_id' => $this->branch->id, 'name' => 'المكتب']);
        $this->actAs(Role::HR);
        $this->postJson("/api/attendance/points/{$point->id}/network")->assertForbidden();
        $this->actAs(Role::BRANCH_MANAGER, $this->makeBranch('ثاني'));
        $this->postJson("/api/attendance/points/{$point->id}/network")->assertForbidden();

        $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $this->withServerVariables(['REMOTE_ADDR' => '10.9.8.7'])->postJson("/api/attendance/points/{$point->id}/network")
            ->assertOk()->assertJsonPath('point.allowed_ips', ['10.9.8.7']);
        $old = $point->code;
        $this->postJson("/api/attendance/points/{$point->id}/rotate")->assertOk();
        $this->assertNotSame($old, $point->fresh()->code);
    }
}
