<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Services\TaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The private link sent to a technician in WhatsApp (/t/<token>): no sign-in. Opening it marks the
 * task as seen; two big buttons start and finish it. The link shows only this one task.
 */
class TaskLinkController extends Controller
{
    public function __construct(private TaskService $svc) {}

    public function show(string $token): JsonResponse
    {
        $task = $this->find($token);
        if (in_array($task->status, ['new', 'sent'], true) && $task->assignees()->exists()) {
            $task = $this->svc->step($task, 'seen', null, false, ['via_link' => true]);
        }

        return response()->json(['task' => $this->present($task)]);
    }

    public function act(Request $request, string $token, string $action): JsonResponse
    {
        abort_unless(in_array($action, ['start', 'complete'], true), 404);
        $data = $request->validate([
            'notes' => ['nullable', 'string', 'max:2000'],
            'operation' => ['nullable', 'uuid'],
            'device_time' => ['nullable', 'date'],
            'offline' => ['sometimes', 'boolean'],
        ]);
        $task = $this->svc->step($this->find($token), $action, null, false, $data + ['via_link' => true]);

        return response()->json(['task' => $this->present($task)]);
    }

    private function find(string $token): Task
    {
        abort_unless(preg_match('/^[a-z0-9]{32}$/', $token) === 1, 404);

        return Task::where('link_token', $token)->firstOrFail();
    }

    private function present(Task $t): array
    {
        $t->loadMissing('assignees:id,name', 'type:id,name', 'zone:id,name');

        return [
            'number' => $t->number, 'type' => $t->type?->name, 'details' => $t->details,
            'subscriber_name' => $t->subscriber_name, 'subscriber_phone' => $t->subscriber_phone,
            'zone' => $t->zone?->name, 'location_text' => $t->location_text, 'priority' => $t->priority,
            'expected_minutes' => $t->expected_minutes, 'status' => $t->status,
            'assignees' => $t->assignees->pluck('name'), 'shared' => $t->assignees->count() > 1,
            'started_at' => $t->started_at?->toIso8601String(), 'completed_at' => $t->completed_at?->toIso8601String(),
        ];
    }
}
