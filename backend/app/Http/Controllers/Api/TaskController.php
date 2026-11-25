<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\BranchModule;
use App\Models\Task;
use App\Models\TaskType;
use App\Models\User;
use App\Models\Zone;
use App\Services\TaskService;
use App\Support\Access;
use App\Support\Audit;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TaskController extends Controller
{
    private const DISK = 'local';

    public function __construct(private TaskService $svc) {}

    // ---------------- The office ----------------

    /** One branch's tasks: the open ones, and those finished or cancelled on the chosen day. */
    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer'],
            'day' => ['nullable', 'date_format:Y-m-d'],
            'search' => ['nullable', 'string', 'max:80'],
        ]);
        $branchId = $this->branchFor($actor, $data['branch_id'] ?? null, 'tasks.view');
        $tz = config('app.business_timezone');
        $day = CarbonImmutable::parse($data['day'] ?? CarbonImmutable::now($tz)->toDateString(), $tz);
        [$from, $to] = [$day->startOfDay()->utc(), $day->endOfDay()->utc()];
        $search = trim($data['search'] ?? '');

        $q = Task::where('branch_id', $branchId)->with('assignees:id,name', 'type:id,name', 'zone:id,name');
        if ($search !== '') {
            $q->where(fn ($w) => $w->where('number', ltrim($search, '#'))->orWhere('subscriber_name', 'like', "%{$search}%")
                ->orWhere('subscriber_phone', 'like', "%{$search}%")->orWhere('details', 'like', "%{$search}%")
                ->orWhere('location_text', 'like', "%{$search}%")
                ->orWhereHas('assignees', fn ($a) => $a->where('name', 'like', "%{$search}%")));
            $q->orderByDesc('number')->limit(100);
        } else {
            $isToday = $day->isSameDay(CarbonImmutable::now($tz));
            $q->where(function ($w) use ($from, $to, $isToday) {
                $w->whereBetween('created_at', [$from, $to])->orWhereBetween('completed_at', [$from, $to])->orWhereBetween('cancelled_at', [$from, $to]);
                if ($isToday) {
                    $w->orWhereIn('status', Task::OPEN);
                }
            })->orderByDesc('number');
        }

        return response()->json([
            'branch_id' => $branchId,
            'day' => $day->toDateString(),
            'tasks' => $q->get()->map(fn ($t) => $this->present($t)),
            'can_manage' => Access::allowsBranch($actor, 'tasks.manage', $branchId),
        ]);
    }

    public function archive(Request $request): JsonResponse
    {
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer'],
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        $branch = $this->branchFor($request->user(), $data['branch_id'] ?? null, 'tasks.view');
        $tz = config('app.business_timezone');
        $from = CarbonImmutable::parse($data['from'], $tz)->startOfDay()->utc();
        $to = CarbonImmutable::parse($data['to'], $tz)->endOfDay()->utc();

        $tasks = Task::where('branch_id', $branch)
            ->where(fn ($q) => $q->whereBetween('completed_at', [$from, $to])->orWhereBetween('cancelled_at', [$from, $to]))
            ->with('assignees:id,name', 'type:id,name', 'zone:id,name')->orderByDesc('number')->get();

        return response()->json([
            'from' => $data['from'], 'to' => $data['to'],
            'tasks' => $tasks->map(fn ($task) => $this->present($task)),
        ]);
    }

    public function subscribers(Request $request): JsonResponse
    {
        $data = $request->validate(['branch_id' => ['nullable', 'integer']]);
        $branch = $this->subscriberBranch($request, $data['branch_id'] ?? null);
        $subscribers = DB::table('task_subscribers')->where('branch_id', $branch)->orderBy('id')->get(['n', 'a', 'b', 'p']);

        return response()->json(['subscribers' => $subscribers]);
    }

    public function importSubscribers(Request $request): JsonResponse
    {
        $data = $request->validate(['branch_id' => ['nullable', 'integer']]);
        $branch = $this->subscriberBranch($request, $data['branch_id'] ?? null);
        $data = $request->validate([
            'subscribers' => ['required', 'array', 'list', 'max:10000'],
            'subscribers.*' => ['array:n,a,b,p'],
            'subscribers.*.n' => ['required', 'string', 'min:2', 'max:120'],
            'subscribers.*.a' => ['nullable', 'string', 'max:160'],
            'subscribers.*.b' => ['nullable', 'string', 'max:80'],
            'subscribers.*.p' => ['nullable', 'string', 'regex:/^[0-9]{1,24}$/'],
        ]);
        DB::transaction(function () use ($branch, $data): void {
            Branch::whereKey($branch)->lockForUpdate()->firstOrFail();
            DB::table('task_subscribers')->where('branch_id', $branch)->delete();
            foreach (array_chunk($data['subscribers'], 150) as $chunk) {
                DB::table('task_subscribers')->insert(array_map(fn (array $row) => [
                    'branch_id' => $branch, 'n' => $row['n'], 'a' => $row['a'] ?? null, 'b' => $row['b'] ?? null, 'p' => $row['p'] ?? null,
                ], $chunk));
            }
            Audit::log('tasks.subscribers.import', null, null, ['count' => count($data['subscribers'])], null, $branch);
        });

        return response()->json(['count' => count($data['subscribers'])]);
    }

    private function subscriberBranch(Request $request, ?int $requested): int
    {
        $branch = $this->branchFor($request->user(), $requested, 'tasks.manage');
        $enabled = BranchModule::where('branch_id', $branch)->where('module', 'tasks')->value('is_enabled');
        abort_if($enabled !== null && ! $enabled, 422, 'قسم المهام مغلق في هذا الفرع.');

        return $branch;
    }

    public function show(Request $request, Task $task): JsonResponse
    {
        $this->authorizeView($request->user(), $task);
        $task->load('assignees.employee', 'type', 'zone', 'creator:id,name', 'events.actor:id,name');

        return response()->json(['task' => $this->present($task, true), 'can_manage' => $this->office($request->user(), $task)]);
    }

    public function store(Request $request): JsonResponse
    {
        $actor = $request->user();
        $data = $this->validated($request);
        $branchId = $this->branchFor($actor, $data['branch_id'] ?? null, 'tasks.manage');
        abort_unless(Access::allowsBranch($actor, 'tasks.manage', $branchId), 403, 'ليست لديك صلاحية على مهام هذا الفرع.');
        $mod = BranchModule::where('branch_id', $branchId)->where('module', 'tasks')->first();
        abort_if($mod && ! $mod->is_enabled, 422, 'قسم المهام مغلق في هذا الفرع.');
        $this->assertRefs($branchId, $data);
        $ids = $data['assignees'] ?? [];
        if ($ids) {
            $this->svc->assertTechnicians($branchId, $ids);
        }

        $task = DB::transaction(function () use ($data, $branchId, $actor, $ids) {
            $t = Task::create([
                'branch_id' => $branchId, 'number' => $this->svc->nextNumber($branchId), 'task_type_id' => $data['task_type_id'],
                'created_by' => $actor->id, 'details' => $data['details'] ?? null, 'subscriber_name' => $data['subscriber_name'] ?? null,
                'subscriber_phone' => $data['subscriber_phone'] ?? null, 'zone_id' => $data['zone_id'] ?? null,
                'location_text' => $data['location_text'] ?? null, 'priority' => $data['priority'] ?? 'normal',
                'expected_minutes' => $data['expected_minutes'] ?? 60, 'status' => 'new',
            ]);
            $t->assignees()->sync($ids);
            $this->svc->log($t, 'created', $actor, CarbonImmutable::now(), false);

            return $t;
        });
        if (! empty($data['send']) && $ids) {
            $task = $this->svc->step($task, 'send', $actor, true, ['channel' => $data['send']]);
        }

        return response()->json(['task' => $this->present($task->fresh(['assignees.employee', 'type', 'zone', 'events.actor']), true)], 201);
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        $actor = $request->user();
        abort_unless($this->office($actor, $task), 403, 'ليست لديك صلاحية على هذه المهمة.');
        abort_unless($task->isOpen(), 422, 'لا يمكن تعديل مهمة منتهية.');
        $data = $this->validated($request, true);
        $this->assertRefs($task->branch_id, $data);
        if (array_key_exists('assignees', $data)) {
            $this->svc->reassign($task, $data['assignees'] ?? [], $actor);
        }
        $fields = array_intersect_key($data, array_flip(['task_type_id', 'details', 'subscriber_name', 'subscriber_phone', 'zone_id', 'location_text', 'priority', 'expected_minutes']));
        if ($fields) {
            $task->refresh()->fill($fields)->save();
            if ($task->wasChanged()) {
                $this->svc->log($task, 'edited', $actor, CarbonImmutable::now(), false, [], ['fields' => array_keys($task->getChanges())]);
            }
        }

        return response()->json(['task' => $this->present($task->fresh(['assignees.employee', 'type', 'zone', 'events.actor']), true)]);
    }

    /** send | seen | start | complete | cancel — by the office or by the technician. */
    public function act(Request $request, Task $task, string $action): JsonResponse
    {
        abort_unless(in_array($action, ['send', 'seen', 'start', 'complete', 'cancel'], true), 404);
        $actor = $request->user();
        $this->authorizeView($actor, $task);
        $data = $request->validate([
            'channel' => ['nullable', Rule::in(['whatsapp', 'app'])],
            'notes' => ['nullable', 'string', 'max:2000'],
            'reason' => ['nullable', 'string', 'max:300'],
            'operation' => ['nullable', 'uuid'],
            'device_time' => ['nullable', 'date'],
            'offline' => ['sometimes', 'boolean'],
            'photo' => ['nullable', 'file', 'image', 'max:8192'],
        ]);
        if ($request->hasFile('photo')) {
            $data['photo_path'] = $request->file('photo')->store("tasks/{$task->id}", self::DISK);
        }
        unset($data['photo']);
        $task = $this->svc->step($task, $action, $actor, $this->office($actor, $task), $data);

        return response()->json(['task' => $this->present($task, true)]);
    }

    public function photo(Request $request, Task $task): StreamedResponse
    {
        $this->authorizeView($request->user(), $task);
        abort_unless($task->photo_path, 404);

        return Storage::disk(self::DISK)->response($task->photo_path, "task-{$task->number}.jpg", ['Cache-Control' => 'private, no-store']);
    }

    // ---------------- The technician ----------------

    /** My open tasks, and what I finished today. */
    public function mine(Request $request): JsonResponse
    {
        $me = $request->user();
        $today = CarbonImmutable::now(config('app.business_timezone'))->startOfDay()->utc();
        $tasks = Task::whereHas('assignees', fn ($q) => $q->where('users.id', $me->id))
            ->where(fn ($q) => $q->whereIn('status', ['sent', 'seen', 'in_progress'])->orWhere('completed_at', '>=', $today))
            ->with('assignees:id,name', 'type:id,name', 'zone:id,name')
            ->orderByRaw("case priority when 'emergency' then 0 when 'urgent' then 1 else 2 end")->orderBy('sent_at')->get();

        return response()->json([
            'tasks' => $tasks->map(fn ($t) => $this->present($t)),
            'new' => $tasks->where('status', 'sent')->count(),
        ]);
    }

    // ---------------- Types and zones ----------------

    public function options(Request $request): JsonResponse
    {
        $actor = $request->user();
        $branchId = $this->branchFor($actor, $request->integer('branch_id') ?: null, 'tasks.view');

        return response()->json([
            'types' => TaskType::where(fn ($q) => $q->whereNull('branch_id')->orWhere('branch_id', $branchId))->orderBy('sort_order')->orderBy('name')->get(),
            'zones' => Zone::where('branch_id', $branchId)->orderBy('sort_order')->orderBy('name')->get(),
            'technicians' => User::where('branch_id', $branchId)->where('is_active', true)->with('employee:id,user_id,job_title,phone,wa_code,department_id', 'employee.department:id,name')
                ->orderBy('name')->get()->map(fn ($u) => [
                    'id' => $u->id, 'name' => $u->name, 'job_title' => $u->employee?->job_title, 'department' => $u->employee?->department?->name,
                    'phone' => $u->employee?->phone, 'wa_code' => $u->employee?->wa_code ?? 970,
                    'open' => Task::whereIn('status', Task::OPEN)->whereHas('assignees', fn ($a) => $a->where('users.id', $u->id))->count(),
                ]),
            'branch_id' => $branchId,
        ]);
    }

    public function saveType(Request $request, ?TaskType $type = null): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate([
            'name' => [$type ? 'sometimes' : 'required', 'string', 'min:2', 'max:60'],
            'default_minutes' => ['sometimes', 'integer', 'between:5,1440'],
            'is_active' => ['sometimes', 'boolean'],
            'branch_id' => ['nullable', 'integer'],
        ]);
        $branchId = $type ? $type->branch_id : ($data['branch_id'] ?? null);
        abort_unless($branchId === null ? Access::scope($actor, 'tasks.manage') === 'all' : Access::allowsBranch($actor, 'tasks.manage', $branchId), 403, 'ليست لديك صلاحية على أنواع المهام هذه.');
        $type ??= new TaskType(['branch_id' => $branchId, 'sort_order' => (int) TaskType::max('sort_order') + 1]);
        $type->fill(array_diff_key($data, ['branch_id' => 1]))->save();

        return response()->json(['type' => $type], $type->wasRecentlyCreated ? 201 : 200);
    }

    public function saveZone(Request $request, ?Zone $zone = null): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate([
            'name' => [$zone ? 'sometimes' : 'required', 'string', 'min:2', 'max:80'],
            'is_active' => ['sometimes', 'boolean'],
            'branch_id' => [$zone ? 'prohibited' : 'required', 'integer', Rule::exists('branches', 'id')],
        ]);
        $branchId = $zone?->branch_id ?? $data['branch_id'];
        abort_unless(Access::allowsBranch($actor, 'tasks.manage', $branchId), 403, 'ليست لديك صلاحية على مناطق هذا الفرع.');
        if (isset($data['name']) && Zone::where('branch_id', $branchId)->where('name', trim($data['name']))->when($zone, fn ($q) => $q->where('id', '!=', $zone->id))->exists()) {
            throw ValidationException::withMessages(['name' => 'هذه المنطقة موجودة.']);
        }
        $zone ??= new Zone(['branch_id' => $branchId, 'sort_order' => (int) Zone::where('branch_id', $branchId)->max('sort_order') + 1]);
        $zone->fill(array_diff_key($data, ['branch_id' => 1]))->save();

        return response()->json(['zone' => $zone], $zone->wasRecentlyCreated ? 201 : 200);
    }

    // ---------------- Helpers ----------------

    private function validated(Request $request, bool $update = false): array
    {
        $req = $update ? 'sometimes' : 'required';

        return $request->validate([
            'branch_id' => ['nullable', 'integer'],
            'task_type_id' => [$req, 'integer', Rule::exists('task_types', 'id')],
            'assignees' => ['sometimes', 'array', 'max:20'],
            'assignees.*' => ['integer', 'distinct'],
            'details' => ['nullable', 'string', 'max:2000'],
            'subscriber_name' => ['nullable', 'string', 'max:120'],
            'subscriber_phone' => ['nullable', 'string', 'regex:/^05[0-9]{8}$/'],
            'zone_id' => ['nullable', 'integer'],
            'location_text' => ['nullable', 'string', 'max:200'],
            'priority' => ['sometimes', Rule::in(['normal', 'urgent', 'emergency'])],
            'expected_minutes' => ['sometimes', 'integer', 'between:5,1440'],
            'send' => ['nullable', Rule::in(['whatsapp', 'app'])],
        ]);
    }

    private function assertRefs(int $branchId, array $data): void
    {
        if (! empty($data['task_type_id']) && ! TaskType::whereKey($data['task_type_id'])->where(fn ($q) => $q->whereNull('branch_id')->orWhere('branch_id', $branchId))->exists()) {
            throw ValidationException::withMessages(['task_type_id' => 'نوع المهمة غير متاح لهذا الفرع.']);
        }
        if (! empty($data['zone_id']) && ! Zone::whereKey($data['zone_id'])->where('branch_id', $branchId)->exists()) {
            throw ValidationException::withMessages(['zone_id' => 'المنطقة ليست من مناطق هذا الفرع.']);
        }
    }

    private function branchFor(User $actor, ?int $requested, string $permission): int
    {
        $branchId = $requested ?: $actor->branch_id;
        abort_unless($branchId && Access::allowsBranch($actor, $permission, (int) $branchId), 403, 'اختر فرعاً لديك صلاحية على مهامه.');

        return (int) $branchId;
    }

    private function office(User $actor, Task $task): bool
    {
        return Access::allowsBranch($actor, 'tasks.manage', $task->branch_id);
    }

    private function authorizeView(User $actor, Task $task): void
    {
        $mine = $task->assignees()->where('users.id', $actor->id)->exists();
        abort_unless($mine || Access::allowsBranch($actor, 'tasks.view', $task->branch_id) || $this->office($actor, $task), 404);
    }

    public function present(Task $t, bool $full = false): array
    {
        $out = [
            'id' => $t->id, 'number' => $t->number, 'branch_id' => $t->branch_id, 'type' => $t->type?->only('id', 'name'),
            'details' => $t->details, 'subscriber_name' => $t->subscriber_name, 'subscriber_phone' => $t->subscriber_phone,
            'zone' => $t->zone?->only('id', 'name'), 'location_text' => $t->location_text, 'priority' => $t->priority,
            'expected_minutes' => $t->expected_minutes, 'status' => $t->status, 'late' => $t->isLate(),
            'assignees' => $t->assignees->map(fn ($u) => ['id' => $u->id, 'name' => $u->name])->values(),
            'created_at' => $t->created_at?->toIso8601String(), 'sent_at' => $t->sent_at?->toIso8601String(),
            'seen_at' => $t->seen_at?->toIso8601String(), 'started_at' => $t->started_at?->toIso8601String(),
            'completed_at' => $t->completed_at?->toIso8601String(), 'cancelled_at' => $t->cancelled_at?->toIso8601String(),
            'actual_minutes' => $t->started_at && $t->completed_at ? intdiv((int) $t->started_at->diffInSeconds($t->completed_at), 60) : null,
            'completion_notes' => $t->completion_notes, 'cancel_reason' => $t->cancel_reason, 'has_photo' => $t->photo_path !== null,
            'recorded_offline' => $t->recorded_offline,
        ];
        if ($full) {
            $out['link_token'] = $t->link_token;
            $out['created_by'] = $t->creator?->name;
            $out['assignees'] = $t->assignees->map(fn ($u) => [
                'id' => $u->id, 'name' => $u->name, 'phone' => $u->employee?->phone, 'wa_code' => $u->employee?->wa_code ?? 970,
            ])->values();
            $out['events'] = $t->events->sortBy('at')->values()->map(fn ($e) => [
                'event' => $e->event, 'actor' => $e->actor?->name, 'at' => $e->at?->toIso8601String(), 'offline' => $e->recorded_offline, 'meta' => $e->meta,
            ]);
        }

        return $out;
    }
}
