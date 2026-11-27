<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Assistant\Assistant;
use App\Services\Assistant\Gateway;
use Tests\TestCase;

class AssistantTest extends TestCase
{
    public function test_it_is_off_without_a_key(): void
    {
        config(['assistant.api_key' => null]);
        $this->actAs('hr');
        $this->getJson('/api/assistant')->assertOk()->assertJsonPath('enabled', false);
        $this->postJson('/api/assistant', ['messages' => [['role' => 'user', 'content' => 'مرحبا']]])->assertStatus(503);
    }

    public function test_lookups_run_with_the_askers_permissions(): void
    {
        $branch = $this->makeBranch();
        $hr = $this->makeUser('hr');
        $worker = $this->makeUser('employee', $branch, ['name' => 'سامي عبد الله']);
        $worker->employee->update(['national_id' => '401234567', 'account_number' => '0599123456']);
        $gateway = app(Gateway::class);

        // HR sees the file, but the sensitive numbers never reach the model.
        $file = $gateway->get($hr, "employees/{$worker->id}");
        $this->assertStringContainsString('سامي عبد الله', $file);
        $this->assertStringNotContainsString('401234567', $file);
        $this->assertStringNotContainsString('0599123456', $file);

        // An employee cannot read payroll batches or someone else's file through the assistant.
        $this->assertStringStartsWith('ممنوع', $gateway->get($worker, 'payroll/batches'));
        $this->assertStringStartsWith('ممنوع', $gateway->get($worker, "employees/{$hr->id}"));

        // Only the listed read-only paths are reachable.
        $this->assertStringContainsString('غير متاح', $gateway->get($hr, 'users/1/reset-password'));
        $this->assertStringContainsString('غير متاح', $gateway->get($hr, 'branch-setup/backup'));
    }

    public function test_a_question_is_answered_after_looking_things_up(): void
    {
        config(['assistant.api_key' => 'test-key']);
        $branch = $this->makeBranch();
        $this->makeUser('employee', $branch, ['name' => 'رامي خليل']);
        $hr = $this->actAs('hr');

        $fake = new class(app(Gateway::class)) extends Assistant {
            public array $seen = [];

            protected function call(User $user, array $messages, bool $mustAnswer): object
            {
                $this->seen[] = $messages;
                if (count($messages) === 1) {
                    return (object) ['stopReason' => 'tool_use', 'content' => [
                        (object) ['type' => 'tool_use', 'id' => 'tu_1', 'name' => 'query_system', 'input' => ['path' => 'users?search=رامي']],
                    ]];
                }

                return (object) ['stopReason' => 'end_turn', 'content' => [(object) ['type' => 'text', 'text' => 'نعم، رامي خليل موظف في فرع مخيم 2.']]];
            }
        };
        $this->app->instance(Assistant::class, $fake);

        $this->postJson('/api/assistant', ['messages' => [['role' => 'user', 'content' => 'هل رامي موظف عندنا؟']]])
            ->assertOk()->assertJsonPath('answer', 'نعم، رامي خليل موظف في فرع مخيم 2.');

        $toolResult = $fake->seen[1][2]['content'][0]['content'];
        $this->assertStringContainsString('رامي خليل', $toolResult);
        $this->assertDatabaseHas('audit_logs', ['action' => 'assistant.asked', 'user_id' => $hr->id]);
    }
}
