<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Role;
use App\Models\WorkSchedule;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RosterTest extends TestCase
{
    public function test_friday_assignments_drive_board_overnight_punch_and_next_week_copy(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-25 12:00', 'Asia/Gaza'));
        $branch = $this->makeBranch();
        $hr = $this->actAs(Role::HR);
        $morning = $this->makeUser(Role::EMPLOYEE, $branch);
        $night = $this->makeUser(Role::EMPLOYEE, $branch);
        $rest = $this->makeUser(Role::EMPLOYEE, $branch);
        $dayShift = WorkSchedule::create(['branch_id' => $branch->id, 'name' => 'صباحي', 'start_time' => '08:00', 'end_time' => '16:00', 'work_days' => [1, 2, 3, 4, 6, 7], 'is_default' => true]);
        $nightId = $this->postJson('/api/schedules', ['branch_id' => $branch->id, 'name' => 'ليلي', 'start_time' => '22:00', 'end_time' => '06:00', 'overnight' => true, 'work_days' => [5]])->assertCreated()->json('schedule.id');
        foreach ([[$morning, $dayShift->id], [$night, $nightId], [$rest, 'rest']] as [$person, $choice]) {
            $this->putJson("/api/branches/$branch->id/roster/$person->id", ['days' => [['date' => '2026-11-27', 'value' => $choice]]])->assertOk();
        }
        $this->patchJson("/api/schedules/$nightId", ['start_time' => '20:00'])->assertOk();
        $rows = collect($this->getJson("/api/attendance/board?branch_id=$branch->id&date=2026-11-27")->assertOk()->json('rows'))->keyBy('user.id');
        $this->assertSame('off', $rows[$rest->id]['state']);
        $this->assertSame('08:00–16:00', $rows[$morning->id]['schedule']);
        $this->assertSame('22:00–06:00', $rows[$night->id]['schedule']);
        $this->getJson("/api/branches/$branch->id/roster/$rest->id?start=2026-11-28")->assertOk()->assertJsonPath('days.6.previous', 'rest');
        $this->putJson("/api/branches/$branch->id/roster/$rest->id", ['days' => [['date' => '2026-11-27', 'value' => $dayShift->id, 'version' => 'none']]])->assertConflict();
        Sanctum::actingAs($night);
        $this->putJson("/api/branches/$branch->id/roster/$rest->id", ['days' => []])->assertForbidden();
        $this->travelTo(CarbonImmutable::parse('2026-11-27 22:00', 'Asia/Gaza'));
        $this->postJson('/api/attendance/punch', ['method' => 'app'])->assertOk()->assertJsonPath('status', 'in');
        $this->travelTo(CarbonImmutable::parse('2026-11-28 06:00', 'Asia/Gaza'));
        $this->postJson('/api/attendance/punch', ['method' => 'app'])->assertOk()->assertJsonPath('status', 'out')->assertJsonPath('day.worked_minutes', 480)->assertJsonPath('day.late_minutes', 0);
        $this->postJson('/api/attendance/punch', ['method' => 'app'])->assertOk()->assertJsonPath('status', 'full');
        Sanctum::actingAs($hr);
        $this->putJson("/api/branches/$branch->id/roster/$night->id", ['days' => [['date' => '2026-11-27', 'value' => 'rest']]])->assertUnprocessable();
    }

    public function test_hiring_only_accepts_a_department_assigned_to_the_selected_branch(): void
    {
        $branch = $this->makeBranch();
        $other = $this->makeBranch('الثاني');
        $this->actAs(Role::HR);
        $dep = Department::create(['name' => 'التدقيق']);
        $this->putJson("/api/branches/$branch->id/departments/$dep->id")->assertOk();
        $account = ['name' => 'موظف الفرع', 'username' => 'branch.auditor', 'password' => 'abc12345', 'role_id' => Role::where('key', Role::EMPLOYEE)->value('id'), 'department_id' => $dep->id, 'salary_type' => 'weekly', 'salary_amount' => 425];
        $this->postJson('/api/users', $account + ['branch_id' => $other->id])->assertUnprocessable();
        $response = $this->postJson('/api/users', $account + ['branch_id' => $branch->id])->assertCreated()->assertJsonPath('user.needs_profile_completion', true);
        $this->assertDatabaseHas('employees', ['user_id' => $response->json('user.id'), 'department_id' => $dep->id, 'salary_type' => 'weekly', 'salary_amount' => 425]);
    }
}
