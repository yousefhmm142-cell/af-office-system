<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MessagesTest extends TestCase
{
    private Branch $a;
    private User $emp;
    private User $manager;
    private User $hr;
    private User $mgmt;
    private User $otherManager;

    protected function setUp(): void
    {
        parent::setUp();
        $this->a = $this->makeBranch('أ');
        $b = $this->makeBranch('ب');
        $this->emp = $this->makeUser(Role::EMPLOYEE, $this->a, ['name' => 'موظف']);
        $this->manager = $this->makeUser(Role::BRANCH_MANAGER, $this->a, ['name' => 'مدير أ']);
        $this->a->update(['manager_user_id' => $this->manager->id]);
        $this->otherManager = $this->makeUser(Role::BRANCH_MANAGER, $b, ['name' => 'مدير ب']);
        $this->hr = $this->makeUser(Role::HR, null, ['name' => 'شؤون']);
        $this->mgmt = $this->makeUser(Role::MANAGEMENT, null, ['name' => 'إدارة']);
    }

    private function send(array $body)
    {
        return $this->postJson('/api/messages', $body + ['subject' => 'موضوع', 'body' => 'نص']);
    }

    public function test_employee_writes_to_branch_manager_and_hr_only(): void
    {
        Sanctum::actingAs($this->emp);
        $names = collect($this->getJson('/api/messages/recipients')->json('people'))->pluck('name')->sort()->values()->all();
        $this->assertSame(['شؤون', 'مدير أ'], $names);
        $this->assertSame([], $this->getJson('/api/messages/recipients')->json('groups'));

        $this->send(['to' => [$this->hr->id, $this->manager->id]])->assertCreated();
        $this->send(['to' => [$this->mgmt->id]])->assertStatus(422);
        $this->send(['to' => [$this->otherManager->id]])->assertStatus(422);
        $this->send(['groups' => [['type' => 'branch', 'id' => $this->a->id]]])->assertStatus(422);
    }

    public function test_branch_manager_reaches_branch_hr_and_management(): void
    {
        Sanctum::actingAs($this->manager);
        $this->send(['to' => [$this->emp->id, $this->hr->id, $this->mgmt->id]])->assertCreated();
        $this->send(['to' => [$this->otherManager->id]])->assertStatus(422);
    }

    public function test_anyone_can_answer_a_message_they_received(): void
    {
        Sanctum::actingAs($this->mgmt);
        $id = $this->send(['to' => [$this->emp->id]])->json('message.id');

        Sanctum::actingAs($this->emp);
        $this->getJson('/api/messages/unread')->assertJsonPath('unread', 1);
        $this->getJson("/api/messages/{$id}")->assertOk()->assertJsonPath('unread', 0);
        $reply = $this->send(['to' => [$this->mgmt->id], 'reply_to' => $id, 'subject' => 'رد: موضوع'])->assertCreated();
        $this->assertSame($id, $reply->json('message.thread_id'));

        Sanctum::actingAs($this->mgmt);
        $this->assertCount(2, $this->getJson("/api/messages/{$id}")->json('thread'));
    }

    public function test_hr_forwards_a_leave_request_to_management_with_its_attachment(): void
    {
        Storage::fake('local');
        Sanctum::actingAs($this->emp);
        $res = $this->post('/api/messages', [
            'to' => [$this->hr->id], 'subject' => 'طلب إجازة', 'body' => 'أرجو الموافقة', 'kind' => 'leave_request',
            'meta' => ['from' => '2026-12-01', 'to' => '2026-12-03'],
            'files' => [UploadedFile::fake()->create('report.pdf', 50, 'application/pdf')],
        ], ['Accept' => 'application/json'])->assertCreated();
        $id = $res->json('message.id');
        $att = $res->json('message.attachments.0.id');
        $this->assertSame('leave_request', $res->json('message.kind'));

        // Management cannot open it before HR forwards it.
        Sanctum::actingAs($this->mgmt);
        $this->getJson("/api/messages/{$id}")->assertNotFound();

        Sanctum::actingAs($this->hr);
        $fw = $this->send(['to' => [$this->mgmt->id], 'forward_of' => $id, 'subject' => 'رفع: طلب إجازة', 'body' => 'للاطلاع والموافقة'])->assertCreated();

        Sanctum::actingAs($this->mgmt);
        $this->getJson('/api/messages/'.$fw->json('message.id'))->assertOk()->assertJsonPath('thread.0.forwarded.kind', 'leave_request')
            ->assertJsonPath('thread.0.forwarded.meta.from', '2026-12-01');
        $this->get("/api/messages/{$id}/attachments/{$att}")->assertOk();

        // The other branch manager still sees nothing.
        Sanctum::actingAs($this->otherManager);
        $this->getJson("/api/messages/{$id}")->assertNotFound();
    }

    public function test_hr_sends_to_a_whole_branch(): void
    {
        Sanctum::actingAs($this->hr);
        $groups = collect($this->getJson('/api/messages/recipients')->json('groups'))->pluck('type')->unique()->values()->all();
        $this->assertContains('branch', $groups);
        $this->send(['groups' => [['type' => 'branch', 'id' => $this->a->id]]])->assertCreated()->assertJsonPath('message.recipients_count', 2)
            ->assertJsonPath('message.groups_label', 'فرع أ');
        Sanctum::actingAs($this->emp);
        $this->getJson('/api/messages')->assertJsonPath('messages.0.to', 'فرع أ')->assertJsonPath('messages.0.read', false);
    }

    public function test_archive_and_folders(): void
    {
        Sanctum::actingAs($this->hr);
        $id = $this->send(['to' => [$this->emp->id]])->json('message.id');
        $this->getJson('/api/messages?folder=sent')->assertJsonCount(1, 'messages');

        Sanctum::actingAs($this->emp);
        $this->postJson("/api/messages/{$id}/archive")->assertOk();
        $this->getJson('/api/messages')->assertJsonCount(0, 'messages');
        $this->getJson('/api/messages?folder=archive')->assertJsonCount(1, 'messages');
        $this->postJson("/api/messages/{$id}/archive", ['archive' => false]);
        $this->getJson('/api/messages?search=نص')->assertJsonCount(1, 'messages');
    }
}
