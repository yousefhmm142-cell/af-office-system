<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\Task;
use App\Models\TaskType;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ShellTest extends TestCase
{
    private function task(int $branch, int $number, string $subscriber, string $status = 'sent', int $minutesAgo = 10): Task
    {
        $type = TaskType::firstOrCreate(['name' => 'فحص ساعة', 'branch_id' => null], ['default_minutes' => 30]);

        return Task::create(['branch_id' => $branch, 'number' => $number, 'task_type_id' => $type->id, 'subscriber_name' => $subscriber,
            'expected_minutes' => 30, 'status' => $status, 'priority' => 'normal', 'sent_at' => now()->subMinutes($minutesAgo)]);
    }

    public function test_search_finds_tasks_subscribers_and_people_of_own_branch_only(): void
    {
        $mine = $this->makeBranch('أ');
        $other = $this->makeBranch('ب');
        $this->makeUser(Role::EMPLOYEE, $mine, ['name' => 'خالد الفني']);
        $this->makeUser(Role::EMPLOYEE, $other, ['name' => 'خالد آخر']);
        $this->task($mine->id, 35, 'أبو محمد');
        $this->task($other->id, 36, 'أبو محمد الآخر');
        DB::table('task_subscribers')->insert([['branch_id' => $mine->id, 'n' => 'محمد الشافعي', 'a' => null, 'b' => '4', 'p' => null], ['branch_id' => $other->id, 'n' => 'محمد غريب', 'a' => null, 'b' => null, 'p' => null]]);
        $this->actAs(Role::BRANCH_MANAGER, $mine);

        $this->getJson('/api/shell/search?q=35')->assertOk()->assertJsonPath('tasks.0.number', 35)->assertJsonCount(0, 'people');
        $this->getJson('/api/shell/search?q=36')->assertOk()->assertJsonCount(0, 'tasks');
        $res = $this->getJson('/api/shell/search?q=محمد')->assertOk();
        $this->assertCount(1, $res->json('tasks'));
        $this->assertSame(['محمد الشافعي'], array_column($res->json('subscribers'), 'n'));
        $this->assertSame(['خالد الفني'], array_column($this->getJson('/api/shell/search?q=خالد')->json('people'), 'name'));
    }

    public function test_counts_show_late_tasks_and_waiting_reports(): void
    {
        $branch = $this->makeBranch();
        $this->task($branch->id, 1, 'x', 'sent', 120);
        $this->task($branch->id, 2, 'y', 'sent', 5);
        $me = $this->actAs(Role::BRANCH_MANAGER, $branch);
        DB::table('generation_reports')->insert(['branch_id' => $branch->id, 'report_date' => '2026-11-20', 'status' => 'submitted', 'version' => 1, 'figures' => '{}', 'created_by' => $me->id, 'created_at' => now(), 'updated_at' => now()]);

        $res = $this->getJson('/api/shell/counts')->assertOk();
        $this->assertSame(1, $res->json('counts./tasks.n'));
        $this->assertSame(1, $res->json('counts./generation.n'));
    }

    public function test_employee_gets_no_counts_or_task_results(): void
    {
        $branch = $this->makeBranch();
        $this->task($branch->id, 7, 'x');
        $this->actAs(Role::EMPLOYEE, $branch);
        $this->assertSame([], $this->getJson('/api/shell/counts')->json('counts'));
        $this->getJson('/api/shell/search?q=7')->assertOk()->assertJsonCount(0, 'tasks');
    }

    public function test_feed_lists_recent_task_steps_and_arrivals_for_the_manager_only(): void
    {
        $branch = $this->makeBranch();
        $tech = $this->makeUser(Role::EMPLOYEE, $branch, ['name' => 'قصي']);
        $task = $this->task($branch->id, 9, 'x');
        DB::table('task_events')->insert(['task_id' => $task->id, 'event' => 'completed', 'actor_id' => $tech->id, 'at' => now()->subHour()]);
        \App\Models\AttendanceDay::create(['user_id' => $tech->id, 'branch_id' => $branch->id, 'date' => now()->toDateString(), 'check_in' => now()->subHours(3), 'late_minutes' => 12]);
        $this->actAs(Role::BRANCH_MANAGER, $branch);

        $events = $this->getJson('/api/shell/feed')->assertOk()->json('events');
        $this->assertSame(['أنجز المهمة رقم 9', 'سجّل حضوره (تأخر 12 د)'], array_column($events, 'text'));

        $this->actAs(Role::EMPLOYEE, $branch);
        $this->getJson('/api/shell/feed')->assertForbidden();
    }
}
