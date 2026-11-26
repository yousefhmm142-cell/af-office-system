<?php

namespace Tests\Feature;

use App\Models\AttendanceDay;
use App\Models\Role;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ReportsTest extends TestCase
{
    public function test_branch_manager_gets_the_period_of_own_branch_only(): void
    {
        $mine = $this->makeBranch('أ');
        $other = $this->makeBranch('ب');
        $me = $this->actAs(Role::BRANCH_MANAGER, $mine);
        foreach ([[$mine, '2026-11-10', 'approved'], [$mine, '2026-11-11', 'draft'], [$other, '2026-11-10', 'approved']] as [$b, $d, $s]) {
            DB::table('generation_reports')->insert(['branch_id' => $b->id, 'report_date' => $d, 'status' => $s, 'version' => 1,
                'figures' => json_encode(['fuel' => [], 'generators' => [], 'maintenance' => [], 'generalNotes' => '']), 'created_by' => $me->id, 'created_at' => now(), 'updated_at' => now()]);
        }

        $res = $this->getJson('/api/reports?from=2026-11-08&to=2026-11-14')->assertOk();
        $this->assertSame(['2026-11-10'], array_column($res->json('reports'), 'reportDate'));
        $this->getJson("/api/reports?from=2026-11-08&to=2026-11-14&branch_id={$other->id}")->assertForbidden();
    }

    public function test_attendance_summary_counts_present_and_absent_days(): void
    {
        $branch = $this->makeBranch();
        $worker = $this->makeUser(Role::EMPLOYEE, $branch, ['name' => 'موظف']);
        $worker->employee->update(['tracks_attendance' => true]);
        \App\Models\WorkSchedule::create(['branch_id' => $branch->id, 'name' => 'عادي', 'start_time' => '07:30', 'end_time' => '15:30', 'work_days' => \App\Models\WorkSchedule::ALL_DAYS, 'is_default' => true]);
        AttendanceDay::create(['user_id' => $worker->id, 'branch_id' => $branch->id, 'date' => '2026-11-10', 'check_in' => '2026-11-10 05:30:00', 'check_out' => '2026-11-10 13:30:00', 'overtime_minutes' => 15]);
        $this->actAs(Role::BRANCH_MANAGER, $branch);

        $row = collect($this->getJson('/api/reports?from=2026-11-10&to=2026-11-12')->assertOk()->json('attendance'))->firstWhere('name', 'موظف');
        $this->assertSame(['present' => 1, 'absent' => 2, 'overtime' => 15, 'hours' => 8], ['present' => $row['present'], 'absent' => $row['absent'], 'overtime' => $row['overtime'], 'hours' => $row['hours']]);
    }

    public function test_employee_cannot_open_reports(): void
    {
        $this->actAs(Role::EMPLOYEE, $this->makeBranch());
        $this->getJson('/api/reports?from=2026-11-08&to=2026-11-14')->assertForbidden();
    }
}
