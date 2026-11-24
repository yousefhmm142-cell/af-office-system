<?php

namespace App\Services;

use App\Models\Task;
use App\Models\TaskEvent;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The steps of a field task, the same as in Mukhayyam 2:
 *   new → sent → seen (the technician opened it) → in_progress (started) → done, or cancelled before done.
 * - The office sends, re-assigns (only before work starts), cancels, and may finish a task for a
 *   technician without a phone. A task shared by several technicians is finished by the office.
 * - A technician opens, starts and finishes their own task, from the app or from the private link,
 *   even without internet: the phone sends the time it was pressed (up to two days back), once.
 */
class TaskService
{
    /** Who did it and when: the phone's time for an action saved offline, otherwise now. */
    private function when(array $o): array
    {
        $now = CarbonImmutable::now();
        if (! empty($o['offline']) && ! empty($o['device_time'])) {
            $t = CarbonImmutable::parse($o['device_time'])->utc();
            if ($t->isAfter($now->addMinutes(2)) || $t->isBefore($now->subHours(48))) {
                throw ValidationException::withMessages(['device_time' => 'وقت العملية المحفوظ في الجوال غير صحيح.']);
            }

            return [$t, true];
        }

        return [$now, false];
    }

    /** Runs one step once: the same operation id sent again does nothing. */
    public function step(Task $task, string $action, ?User $actor, bool $office, array $o = []): Task
    {
        if (! empty($o['operation']) && TaskEvent::where('operation', $o['operation'])->exists()) {
            return $task->fresh();
        }
        [$at, $offline] = $this->when($o);

        return DB::transaction(function () use ($task, $action, $actor, $office, $o, $at, $offline) {
            $task = Task::whereKey($task->id)->lockForUpdate()->with('assignees:id')->first();
            $members = $task->assignees->pluck('id');
            $mine = $actor && $members->contains($actor->id);
            $shared = $members->count() > 1;
            $deny = fn (string $msg) => throw ValidationException::withMessages(['task' => $msg]);

            switch ($action) {
                case 'seen':
                    if (in_array($task->status, ['new', 'sent'], true)) {
                        $task->fill(['status' => 'seen', 'seen_at' => $at]);
                        $this->log($task, 'seen', $actor, $at, $offline, $o);
                    }
                    break;

                case 'start':
                    if (! $office && ! $mine && $actor) {
                        $deny('هذه المهمة ليست لك.');
                    }
                    if (! in_array($task->status, ['new', 'sent', 'seen'], true)) {
                        $task->status === 'in_progress' ? null : $deny('لا يمكن بدء مهمة منتهية أو ملغاة.');
                        break;
                    }
                    if ($members->isEmpty()) {
                        $deny('اختر الفني أولاً.');
                    }
                    $task->fill(['status' => 'in_progress', 'seen_at' => $task->seen_at ?? $at, 'started_at' => $at]);
                    $this->log($task, 'started', $actor, $at, $offline, $o);
                    break;

                case 'complete':
                    if (! $task->isOpen()) {
                        $task->status === 'done' ? null : $deny('المهمة ملغاة.');
                        break;
                    }
                    if ($members->isEmpty()) {
                        $deny('اختر الفني أولاً.');
                    }
                    if (! $office) {
                        if ($actor && ! $mine) {
                            $deny('هذه المهمة ليست لك.');
                        }
                        if ($shared) {
                            $deny('المهمة مشتركة بين عدة فنيين، ويُنهيها المكتب.');
                        }
                    }
                    $started = $task->started_at ? CarbonImmutable::instance($task->started_at) : $at->min(CarbonImmutable::instance($task->seen_at ?? $task->sent_at ?? $at));
                    $task->fill([
                        'status' => 'done', 'started_at' => $started, 'completed_at' => $at->max($started),
                        'completion_notes' => trim((string) ($o['notes'] ?? '')) ?: $task->completion_notes,
                    ]);
                    if (! empty($o['photo_path'])) {
                        $task->photo_path = $o['photo_path'];
                    }
                    $this->log($task, 'completed', $actor, $at, $offline, $o, ['by_office' => $office && ! $mine]);
                    break;

                case 'cancel':
                    if (! $office) {
                        $deny('الإلغاء من صلاحية المكتب.');
                    }
                    if (! $task->isOpen()) {
                        $deny('لا يمكن إلغاء مهمة منتهية.');
                    }
                    $task->fill(['status' => 'cancelled', 'cancelled_at' => $at, 'cancel_reason' => trim((string) ($o['reason'] ?? '')) ?: null]);
                    $this->log($task, 'cancelled', $actor, $at, $offline, $o);
                    break;

                case 'send':
                    if (! $office) {
                        $deny('الإرسال من صلاحية المكتب.');
                    }
                    if ($members->isEmpty()) {
                        $deny('اختر الفني قبل الإرسال.');
                    }
                    if (! $task->isOpen()) {
                        $deny('المهمة منتهية.');
                    }
                    if ($task->status === 'new') {
                        $task->fill(['status' => 'sent', 'sent_at' => $at]);
                    }
                    $channel = ($o['channel'] ?? 'app') === 'whatsapp' ? 'sent_whatsapp' : 'sent_app';
                    $this->log($task, $channel, $actor, $at, $offline, $o);
                    break;
            }
            $task->recorded_offline = $task->recorded_offline || $offline;
            $task->save();

            return $task->fresh(['assignees', 'type', 'zone', 'events.actor']);
        });
    }

    /** Change who does it. Only before anyone has started; the task goes back to «not sent». */
    public function reassign(Task $task, array $userIds, User $actor): Task
    {
        return DB::transaction(function () use ($task, $userIds, $actor) {
            $task = Task::whereKey($task->id)->lockForUpdate()->with('assignees:id')->first();
            $old = $task->assignees->pluck('id')->sort()->values()->all();
            $new = collect($userIds)->map(fn ($v) => (int) $v)->unique()->sort()->values()->all();
            if ($old === $new) {
                return $task;
            }
            if (! in_array($task->status, ['new', 'sent', 'seen'], true)) {
                throw ValidationException::withMessages(['assignees' => 'لا يمكن تغيير الفني بعد بدء العمل أو انتهاء المهمة.']);
            }
            $this->assertTechnicians($task->branch_id, $new);
            $task->assignees()->sync($new);
            if ($old) {
                $task->fill(['status' => 'new', 'sent_at' => null, 'seen_at' => null])->save();
            }
            $this->log($task, 'reassigned', $actor, CarbonImmutable::now(), false, [], ['from' => $old, 'to' => $new]);

            return $task;
        });
    }

    public function assertTechnicians(int $branchId, array $ids): void
    {
        if (count($ids) > 20) {
            throw ValidationException::withMessages(['assignees' => 'الحد الأقصى 20 فنياً للمهمة الواحدة.']);
        }
        $ok = User::whereIn('id', $ids)->where('branch_id', $branchId)->where('is_active', true)->count();
        if ($ok !== count($ids)) {
            throw ValidationException::withMessages(['assignees' => 'اختر فنيين فعّالين من موظفي الفرع نفسه.']);
        }
    }

    public function nextNumber(int $branchId): int
    {
        return (int) Task::where('branch_id', $branchId)->lockForUpdate()->max('number') + 1;
    }

    public function log(Task $task, string $event, ?User $actor, CarbonImmutable $at, bool $offline, array $o = [], array $meta = []): void
    {
        TaskEvent::create([
            'task_id' => $task->id, 'event' => $event, 'actor_id' => $actor?->id, 'at' => $at, 'recorded_offline' => $offline,
            'operation' => $o['operation'] ?? null, 'meta' => ($meta + array_filter(['via_link' => $o['via_link'] ?? null])) ?: null,
        ]);
    }
}
