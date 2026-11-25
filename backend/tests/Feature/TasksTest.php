<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Role;
use App\Models\Task;
use App\Models\TaskType;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TasksTest extends TestCase
{
    private Branch $branch;
    private User $tech;
    private User $tech2;
    private int $type;

    protected function setUp(): void
    {
        parent::setUp();
        $this->branch = $this->makeBranch('مخيم 2');
        $this->tech = $this->makeUser(Role::EMPLOYEE, $this->branch, ['name' => 'قصي']);
        $this->tech2 = $this->makeUser(Role::EMPLOYEE, $this->branch, ['name' => 'مجد']);
        $this->type = TaskType::create(['name' => 'تبديل ساعة'])->id;
    }

    private function newTask(array $extra = []): array
    {
        return $this->postJson('/api/tasks', $extra + [
            'task_type_id' => $this->type, 'assignees' => [$this->tech->id], 'subscriber_name' => 'أبو محمد', 'subscriber_phone' => '0599111222',
            'details' => 'الساعة لا تعمل', 'priority' => 'urgent', 'expected_minutes' => 45,
        ])->assertCreated()->json('task');
    }

    public function test_subscriber_import_is_validated_and_scoped_to_the_branch(): void
    {
        $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $other = $this->makeBranch('فرع آخر');
        $body = ['subscribers' => [['n' => 'مشترك تجريبي', 'a' => 'حي تجريبي', 'b' => '17', 'p' => null]]];
        $this->putJson('/api/tasks/subscribers', $body)->assertOk()->assertJsonPath('count', 1);
        $this->putJson('/api/tasks/subscribers', ['subscribers' => [['n' => '']]])->assertUnprocessable();
        $this->getJson('/api/tasks/subscribers')->assertOk()->assertJsonPath('subscribers.0.n', 'مشترك تجريبي');
        $this->putJson('/api/tasks/subscribers', $body + ['branch_id' => $other->id])->assertForbidden();
        $this->actAs(Role::BRANCH_MANAGER, $other);
        $this->getJson('/api/tasks/subscribers')->assertOk()->assertJsonCount(0, 'subscribers');
        Sanctum::actingAs($this->tech);
        $this->getJson('/api/tasks/subscribers')->assertForbidden();
    }

    public function test_full_life_of_a_task_numbered_per_branch(): void
    {
        $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $t = $this->newTask();
        $this->assertSame(1, $t['number']);
        $this->assertSame(2, $this->newTask()['number']);
        $this->assertSame(1, $this->postJson('/api/tasks', ['task_type_id' => $this->type, 'branch_id' => $this->makeBranch('آخر')->id])->assertForbidden()->json('number') ?? 1);

        $this->postJson("/api/tasks/{$t['id']}/send", ['channel' => 'whatsapp'])->assertOk()->assertJsonPath('task.status', 'sent');

        Sanctum::actingAs($this->tech);
        $this->getJson('/api/tasks/mine')->assertOk()->assertJsonPath('new', 2 - 1);
        $this->postJson("/api/tasks/{$t['id']}/start")->assertOk()->assertJsonPath('task.status', 'in_progress');
        $this->travel(30)->minutes();
        $this->postJson("/api/tasks/{$t['id']}/complete", ['notes' => 'تم التبديل'])->assertOk()
            ->assertJsonPath('task.status', 'done')->assertJsonPath('task.actual_minutes', 30)->assertJsonPath('task.completion_notes', 'تم التبديل');

        $events = collect($this->getJson("/api/tasks/{$t['id']}")->json('task.events'))->pluck('event')->all();
        $this->assertSame(['created', 'sent_whatsapp', 'started', 'completed'], $events);
    }

    public function test_archive_uses_completion_date_and_branch_scope(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-23 10:00:00', config('app.business_timezone')));
        $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $task = $this->newTask();
        Task::whereKey($task['id'])->update(['status' => 'done', 'completed_at' => now()->addDay()]);

        $this->getJson('/api/tasks/archive?from=2026-11-24&to=2026-11-25')
            ->assertOk()->assertJsonPath('tasks.0.id', $task['id']);
        $this->getJson('/api/tasks/archive?from=2026-11-23&to=2026-11-23')->assertOk()->assertJsonCount(0, 'tasks');
        $this->getJson('/api/tasks/archive?from=2026-11-25&to=2026-11-24')->assertUnprocessable();
        $other = $this->makeBranch('فرع آخر');
        $this->getJson("/api/tasks/archive?from=2026-11-24&to=2026-11-25&branch_id={$other->id}")->assertForbidden();
    }

    public function test_technician_cannot_touch_another_task_or_cancel(): void
    {
        $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $t = $this->newTask();
        Sanctum::actingAs($this->tech2);
        $this->postJson("/api/tasks/{$t['id']}/start")->assertNotFound();
        Sanctum::actingAs($this->tech);
        $this->postJson("/api/tasks/{$t['id']}/cancel")->assertStatus(422);
        $this->getJson('/api/tasks')->assertForbidden();
    }

    public function test_shared_task_is_finished_by_the_office_and_reassign_only_before_start(): void
    {
        $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $t = $this->newTask(['assignees' => [$this->tech->id, $this->tech2->id], 'send' => 'app']);
        $this->assertSame('sent', $t['status']);

        Sanctum::actingAs($this->tech);
        $this->postJson("/api/tasks/{$t['id']}/start")->assertOk();
        $this->postJson("/api/tasks/{$t['id']}/complete")->assertStatus(422)->assertJsonPath('errors.task.0', 'المهمة مشتركة بين عدة فنيين، ويُنهيها المكتب.');

        $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $this->patchJson("/api/tasks/{$t['id']}", ['assignees' => [$this->tech->id]])->assertStatus(422);
        $this->postJson("/api/tasks/{$t['id']}/complete")->assertOk()->assertJsonPath('task.status', 'done');

        // Before the start, changing the technician sends the task back to «not sent».
        $t2 = $this->newTask(['send' => 'app']);
        $this->patchJson("/api/tasks/{$t2['id']}", ['assignees' => [$this->tech2->id]])->assertOk()
            ->assertJsonPath('task.status', 'new')->assertJsonPath('task.assignees.0.id', $this->tech2->id);
    }

    public function test_prepared_task_without_technician_cannot_be_sent(): void
    {
        $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $t = $this->newTask(['assignees' => []]);
        $this->postJson("/api/tasks/{$t['id']}/send")->assertStatus(422);
        $this->postJson("/api/tasks/{$t['id']}/cancel", ['reason' => 'المشترك ألغى'])->assertOk()->assertJsonPath('task.cancel_reason', 'المشترك ألغى');
    }

    public function test_private_link_works_without_signing_in(): void
    {
        $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $t = $this->newTask(['send' => 'whatsapp']);
        $token = $this->getJson("/api/tasks/{$t['id']}")->json('task.link_token');
        $this->app['auth']->forgetGuards();
        $this->app['auth']->guard('sanctum')->forgetUser();

        $this->getJson("/api/t/{$token}")->assertOk()->assertJsonPath('task.status', 'seen')->assertJsonPath('task.subscriber_name', 'أبو محمد');
        $this->postJson("/api/t/{$token}/start")->assertOk()->assertJsonPath('task.status', 'in_progress');
        $this->postJson("/api/t/{$token}/complete", ['notes' => 'تم'])->assertOk()->assertJsonPath('task.status', 'done');
        $this->getJson('/api/t/notarealtoken')->assertNotFound();
        $this->postJson("/api/t/{$token}/cancel")->assertNotFound();
    }

    public function test_offline_completion_keeps_its_time_and_counts_once(): void
    {
        $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $t = $this->newTask(['send' => 'app']);
        Sanctum::actingAs($this->tech);
        $this->travelTo(CarbonImmutable::parse('2026-11-26 10:00', 'Asia/Gaza'));
        $this->postJson("/api/tasks/{$t['id']}/start")->assertOk();
        $this->travelTo(CarbonImmutable::parse('2026-11-26 13:00', 'Asia/Gaza'));
        $op = (string) Str::uuid();
        $body = ['operation' => $op, 'offline' => true, 'device_time' => CarbonImmutable::parse('2026-11-26 10:40', 'Asia/Gaza')->toIso8601String()];
        $this->postJson("/api/tasks/{$t['id']}/complete", $body)->assertOk()->assertJsonPath('task.actual_minutes', 40)->assertJsonPath('task.recorded_offline', true);
        $this->postJson("/api/tasks/{$t['id']}/complete", $body)->assertOk();
        $this->assertSame(1, Task::find($t['id'])->events()->where('event', 'completed')->count());
    }

    public function test_completion_photo_and_late_flag(): void
    {
        Storage::fake('local');
        $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $t = $this->newTask(['send' => 'app', 'expected_minutes' => 15]);
        $this->travel(20)->minutes();
        $this->assertTrue($this->getJson("/api/tasks/{$t['id']}")->json('task.late'));

        Sanctum::actingAs($this->tech);
        $this->post("/api/tasks/{$t['id']}/complete", ['photo' => UploadedFile::fake()->image('meter.jpg')], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('task.has_photo', true)->assertJsonPath('task.late', false);
        $this->get("/api/tasks/{$t['id']}/photo")->assertOk();
    }

    public function test_options_types_and_zones(): void
    {
        $this->actAs(Role::BRANCH_MANAGER, $this->branch);
        $this->postJson('/api/zones', ['branch_id' => $this->branch->id, 'name' => 'المخيم الجديد'])->assertCreated();
        $this->postJson('/api/zones', ['branch_id' => $this->branch->id, 'name' => 'المخيم الجديد'])->assertStatus(422);
        $this->postJson('/api/task-types', ['branch_id' => $this->branch->id, 'name' => 'تركيب عداد ذكي'])->assertCreated();
        $this->postJson('/api/task-types', ['name' => 'لكل الفروع'])->assertForbidden();
        $opts = $this->getJson('/api/tasks/options')->assertOk();
        $this->assertContains('تركيب عداد ذكي', collect($opts->json('types'))->pluck('name')->all());
        $this->assertContains('شد وتوصيل كوابل', collect($opts->json('types'))->pluck('name')->all());
        $this->assertSame('المخيم الجديد', $opts->json('zones.0.name'));
        $this->assertContains('قصي', collect($opts->json('technicians'))->pluck('name')->all());
    }
}
