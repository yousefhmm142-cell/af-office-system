<?php

namespace Tests\Feature;

use App\Models\Role;
use Tests\TestCase;

class CommandTest extends TestCase
{
    public function test_hr_sees_everyone_today_and_a_quick_file(): void
    {
        $a = $this->makeBranch('غزة');
        $b = $this->makeBranch('البريج');
        $one = $this->makeUser(Role::EMPLOYEE, $a, ['name' => 'سامي']);
        $one->employee->update(['tracks_attendance' => true]);
        $two = $this->makeUser(Role::EMPLOYEE, $b, ['name' => 'رامي']);
        $two->employee->update(['tracks_attendance' => true]);
        $this->actAs(Role::HR);

        $res = $this->getJson('/api/command/attendance?from=2026-11-01&to=2026-11-07')->assertOk();
        $this->assertEqualsCanonicalizing(['سامي', 'رامي'], collect($res->json('rows'))->pluck('user.name')->all());
        $this->assertCount(2, $res->json('branches'));
        $this->getJson("/api/command/people/{$one->id}")->assertOk()->assertJsonStructure(['tasks', 'leaves']);
    }

    public function test_a_branch_manager_sees_only_their_branch_and_an_employee_nothing(): void
    {
        $a = $this->makeBranch('غزة');
        $b = $this->makeBranch('البريج');
        foreach ([$a, $b] as $branch) {
            $this->makeUser(Role::EMPLOYEE, $branch)->employee->update(['tracks_attendance' => true]);
        }
        $this->actAs(Role::BRANCH_MANAGER, $a);
        $rows = $this->getJson('/api/command/attendance')->assertOk()->json('rows');
        $this->assertTrue(collect($rows)->every(fn ($r) => $r['user']['branch_id'] === $a->id));

        $this->actAs(Role::EMPLOYEE, $a);
        $this->getJson('/api/command/attendance')->assertForbidden();
    }
}
