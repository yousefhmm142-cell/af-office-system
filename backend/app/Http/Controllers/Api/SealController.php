<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\BranchModule;
use App\Models\Task;
use App\Models\User;
use App\Services\TaskService;
use App\Support\Access;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class SealController extends Controller
{
    public function __construct(private TaskService $taskService) {}

    public function show(Request $request): JsonResponse
    {
        $branch = $this->branch($request, 'view');
        $ledger = $this->ledger($branch);

        return response()->json([
            'rolls' => array_values($ledger['rolls']),
            'batches' => array_values($ledger['batches']),
            'seals' => array_values($ledger['seals']),
            'historicalNames' => (object) ($ledger['historicalNames'] ?? []),
            'sheetNames' => (object) ($ledger['sheetNames'] ?? []),
            'people' => User::where('branch_id', $branch)->orderBy('name')->with('employee:id,user_id,job_title')->get(['id', 'name', 'is_active'])
                ->map(fn (User $user) => ['id' => (string) $user->id, 'name' => $user->name, 'is_active' => $user->is_active,
                    'field_worker' => str_contains((string) $user->employee?->job_title, 'فني')]),
        ]);
    }

    public function tasks(Request $request, int $number): JsonResponse
    {
        $branch = $this->branch($request, 'manage');
        abort_unless(Access::allowsBranch($request->user(), 'tasks.view', $branch), 403);
        $this->assertTasksEnabled($branch);
        $data = $request->validate(['q' => ['nullable', 'string', 'max:160']]);
        $seal = $this->ledger($branch)['seals'][$number] ?? null;
        abort_unless($seal, 404);
        $holder = $seal['technicianId'];
        if (! $holder || ! ctype_digit($holder)) {
            return response()->json(['number' => $number, 'tasks' => []]);
        }

        $canComplete = Access::allowsBranch($request->user(), 'tasks.manage', $branch);
        $search = trim($data['q'] ?? '');
        $query = Task::where('branch_id', $branch)->where(function ($query) use ($holder, $canComplete) {
            $query->whereHas('assignees', fn ($query) => $query->where('users.id', $holder));
            if ($canComplete) {
                $query->orWhere(fn ($query) => $query->where('status', 'new')->whereDoesntHave('assignees'));
            }
        })->whereIn('status', $canComplete ? [...Task::OPEN, 'done'] : ['done'])->with('assignees:id', 'type:id,name');
        if ($search !== '') {
            $query->where(function ($query) use ($search) {
                $query->where('subscriber_name', 'like', '%'.$search.'%')->orWhere('details', 'like', '%'.$search.'%')
                    ->orWhere('location_text', 'like', '%'.$search.'%')->orWhereHas('type', fn ($query) => $query->where('name', 'like', '%'.$search.'%'));
                $number = ltrim($search, '#');
                if (ctype_digit($number)) {
                    $query->orWhere('number', $number);
                }
            });
        } else {
            $since = now()->subDays(7);
            $query->where(fn ($query) => $query->where('created_at', '>=', $since)->orWhere('completed_at', '>=', $since));
        }
        $tasks = $query->orderByDesc('id')->limit(30)->get();
        $tz = config('app.business_timezone');

        return response()->json(['number' => $number, 'tasks' => $tasks->map(function (Task $task) use ($holder, $tz) {
            preg_match('/(?:^|\s)طبلون\s+(.+)$/u', $task->location_text ?? '', $match);

            return [
                'id' => (string) $task->id, 'number' => $task->number, 'task_status' => $task->status,
                'subscriber' => $task->subscriber_name ?? '', 'work' => $task->completion_notes ?? $task->type?->name ?? $task->details ?? '',
                'board' => $match[1] ?? '', 'technician_id' => $task->assignees->isEmpty() ? null : $holder,
                'completed_at' => $task->completed_at?->toISOString(), 'completed_on' => $task->completed_at?->copy()->timezone($tz)->toDateString(),
                'task_on' => $task->created_at?->copy()->timezone($tz)->toDateString(),
                'is_prepared' => $task->status === 'new' && $task->assignees->isEmpty(),
            ];
        })]);
    }

    private function linkTask(int $branch, array $data, array $ledger, User $actor): void
    {
        abort_unless(Access::allowsBranch($actor, 'tasks.manage', $branch), 403);
        $this->assertTasksEnabled($branch);
        $seal = $ledger['seals'][$data['number']] ?? null;
        abort_unless($data['status'] === 'used' && $seal && $seal['technicianId'] && ctype_digit($seal['technicianId']), 422, 'الختم غير متاح للربط.');
        $task = Task::where('branch_id', $branch)->whereKey($data['task_id'])->lockForUpdate()->with('assignees:id')->firstOrFail();
        $holder = (int) $seal['technicianId'];
        if ($task->assignees->isEmpty() && $task->status === 'new') {
            $this->taskService->reassign($task, [$holder], $actor);
        } else {
            abort_unless($task->assignees->contains('id', $holder), 422, 'صاحب الختم غير مسند إلى هذه المهمة.');
        }
        $tz = config('app.business_timezone');
        $date = $data['date'] ?? null;
        if ($task->status === 'done') {
            abort_unless($date === $task->completed_at?->copy()->timezone($tz)->toDateString(), 422, 'اختر تاريخ إنجاز المهمة.');
        } else {
            abort_unless($task->isOpen() && $date === now($tz)->toDateString() && ! empty($data['details']), 422, 'يمكن إغلاق مهمة مفتوحة بختم سُجّل اليوم مع وصف العمل.');
            $this->taskService->step($task, 'complete', $actor, true, ['notes' => $data['details']]);
        }
    }

    private function assertTasksEnabled(int $branch): void
    {
        $enabled = BranchModule::where('branch_id', $branch)->where('module', 'tasks')->value('is_enabled');
        abort_if($enabled !== null && ! $enabled, 403, 'قسم المهام مغلق في هذا الفرع.');
    }

    public function history(Request $request): JsonResponse
    {
        $branch = $this->branch($request, 'view');
        $filter = $request->validate(['record' => ['nullable', 'string', 'max:36']]);
        $logs = AuditLog::where('branch_id', $branch)->where('action', 'like', 'seals.%')
            ->when($filter['record'] ?? null, fn ($query, $record) => $query->where('new_values->record', $record))
            ->latest('id')->with('user:id,name')->limit(100)->get();

        return response()->json(['events' => $logs->map(fn (AuditLog $log) => [
            'id' => $log->id, 'action' => $log->action, 'actor' => $log->user?->name, 'at' => $log->created_at->toISOString(),
        ])]);
    }

    public function import(Request $request): JsonResponse
    {
        $branch = $this->branch($request, 'manage');
        $data = $request->validate(['rolls' => ['required', 'array', 'list', 'max:200'], 'usage' => ['present', 'array', 'list', 'max:20000']]);
        $date = ['required', 'date_format:Y-m-d', 'before_or_equal:'.now(config('app.business_timezone'))->toDateString()];
        $number = ['required', 'integer', 'between:10000,9999999'];
        $rolls = array_map(fn ($row) => validator(is_array($row) ? $row : [], [
            'from' => $number, 'to' => [...$number, 'gte:from'],
            'received_on' => $date, 'header_text' => ['nullable', 'string', 'max:200'],
            'sheet_label' => ['nullable', 'string', 'max:31'], 'sheet_pos' => ['nullable', 'integer', 'min:0'],
            'sheet_col' => ['nullable', 'integer', 'between:1,100'], 'sheet_width' => ['nullable', 'numeric', 'between:1,200'],
            'sheet_tab' => ['nullable', 'regex:/^[a-fA-F0-9]{8}$/'],
            'batches' => ['present', 'array', 'list', 'max:1000'],
            'damaged' => ['present', 'array', 'list', 'max:1000'], 'damaged.*' => $number,
        ])->validate(), $data['rolls']);

        $summary = DB::transaction(function () use ($branch, $rolls, $data, $date, $number) {
            Branch::whereKey($branch)->lockForUpdate()->firstOrFail();
            $ledger = $this->ledger($branch);
            $people = User::where('branch_id', $branch)->get(['id', 'name'])->groupBy('name');
            $newRolls = [];
            $newSeals = [];
            $skipped = 0;
            $batches = 0;
            $used = 0;
            $ignored = 0;
            foreach ($rolls as $index => $roll) {
                $first = $ledger['seals'][$roll['from']] ?? null;
                $existing = $first ? ($ledger['rolls'][$first['rollId']] ?? null) : null;
                if ($existing && $existing['fromNo'] === (int) $roll['from'] && $existing['toNo'] === (int) $roll['to']) {
                    $skipped++;

                    continue;
                }
                $id = $this->roll('add-roll', ['from' => $roll['from'], 'to' => $roll['to'], 'date' => $roll['received_on']], $ledger);
                $newRolls[$index] = $id;
                foreach (range($roll['from'], $roll['to']) as $seal) {
                    $newSeals[$seal] = true;
                }
                $ledger['rolls'][$id] = array_replace($ledger['rolls'][$id], [
                    'headerText' => $roll['header_text'] ?? null, 'sheetLabel' => $roll['sheet_label'] ?? null,
                    'sheetPos' => $roll['sheet_pos'] ?? null, 'sheetCol' => $roll['sheet_col'] ?? null,
                    'sheetWidth' => $roll['sheet_width'] ?? null, 'sheetTab' => $roll['sheet_tab'] ?? null,
                ]);
            }
            foreach ($newRolls as $index => $rollId) {
                $roll = $rolls[$index];
                foreach ($roll['batches'] as $raw) {
                    $batch = validator(is_array($raw) ? $raw : [], [
                        'date' => $date, 'tech' => ['nullable', 'string', 'max:160'],
                        'seals' => ['required', 'array', 'list', 'max:1000'], 'seals.*' => [...$number, 'distinct'],
                        'label' => ['nullable', 'string', 'max:80'], 'block_from' => ['nullable', 'integer', 'between:10000,9999999'],
                        'ord' => ['nullable', 'integer', 'min:0'], 'usage_ord' => ['nullable', 'integer', 'min:0'],
                        'fill' => ['nullable', 'regex:/^[a-fA-F0-9]{8}$/'],
                    ])->validate();
                    $byRoll = [];
                    foreach ($batch['seals'] as $seal) {
                        if (! isset($newSeals[$seal]) || $ledger['seals'][$seal]['status'] !== 'in_stock') {
                            $ignored++;

                            continue;
                        }
                        $byRoll[$ledger['seals'][$seal]['rollId']][] = $seal;
                    }
                    $name = $batch['tech'] ?? null;
                    $person = $name ? $people->get($name) : null;
                    $technician = $name ? ($person?->count() === 1 ? (string) $person->first()->id : 'legacy-'.hash('sha256', $name)) : null;
                    if ($technician && str_starts_with($technician, 'legacy-')) {
                        $ledger['historicalNames'][$technician] = $name;
                    }
                    foreach ($byRoll as $sourceRoll => $numbers) {
                        $result = $this->batch('issue', [
                            'technician' => $technician, 'date' => max($batch['date'], $ledger['rolls'][$sourceRoll]['receivedOn']),
                            'seals' => $numbers,
                        ], $ledger);
                        $id = $result['batch_id'];
                        $ledger['batches'][$id] = array_replace($ledger['batches'][$id], [
                            'originalSeals' => array_map('intval', $numbers),
                            'blockFrom' => $batch['block_from'] ?? ($sourceRoll !== $rollId ? (int) $roll['from'] : null),
                            'blockOrd' => $batch['ord'] ?? null, 'label' => $batch['label'] ?? null,
                            'usageOrd' => $batch['usage_ord'] ?? null, 'usageFill' => $batch['fill'] ?? null,
                        ]);
                        $batches++;
                    }
                }
                foreach ($roll['damaged'] as $numberToDamage) {
                    if (isset($newSeals[$numberToDamage]) && $ledger['seals'][$numberToDamage]['status'] === 'in_stock') {
                        $ledger['seals'][$numberToDamage]['status'] = 'damaged';
                    } else {
                        $ignored++;
                    }
                }
            }
            foreach ($data['usage'] as $raw) {
                $item = validator(is_array($raw) ? $raw : [], [
                    'no' => $number, 'status' => ['required', Rule::in(['used', 'damaged', 'lost'])],
                    'used_on' => ['nullable', ...array_slice($date, 1)], 'details' => ['nullable', 'string', 'max:1000'],
                    'sheet' => ['nullable', 'string', 'max:31'],
                ])->validate();
                $seal = $ledger['seals'][$item['no']] ?? null;
                if (! isset($newSeals[$item['no']]) || ! $seal['technicianId']) {
                    $ignored++;

                    continue;
                }
                $details = $item['details'] ?? '';
                preg_match('/^طبلون(?:ات)?\s*(?:رقم\s*)?([^\s]+)/u', $details, $match);
                $this->record('record', [
                    'number' => $item['no'], 'status' => $item['status'], 'details' => $details,
                    'date' => max($item['used_on'] ?? '', $seal['issuedOn']), 'board' => $match[1] ?? '',
                ], $ledger);
                if (! empty($item['sheet'])) {
                    $ledger['sheetNames'][$seal['technicianId']] = $item['sheet'];
                }
                $used++;
            }
            $result = ['rolls' => count($newRolls), 'batches' => $batches, 'used' => $used, 'skipped' => $skipped, 'ignored' => $ignored];
            DB::table('branch_seal_ledgers')->updateOrInsert(['branch_id' => $branch], ['records' => json_encode($ledger, JSON_THROW_ON_ERROR)]);
            Audit::log('seals.import', null, null, $result, null, $branch);

            return $result;
        });

        return response()->json($summary);
    }

    public function update(Request $request, string $action): JsonResponse
    {
        $branch = $this->branch($request, 'manage');
        $date = ['required', 'date_format:Y-m-d', 'before_or_equal:'.now(config('app.business_timezone'))->toDateString()];
        $ids = ['required', 'array', 'list', 'min:1', 'max:1000'];
        $number = ['required', 'integer', 'between:10000,9999999'];
        $id = ['required', 'uuid'];
        $person = ['nullable', 'integer', Rule::exists('users', 'id')->where(fn ($query) => $query->where([
            'branch_id' => $branch, 'is_active' => true,
        ]))];
        $note = ['nullable', 'string', 'max:1000'];
        $data = $request->validate(match ($action) {
            'add-roll' => ['from' => $number, 'to' => ['nullable', 'integer', 'between:10000,9999999'], 'date' => $date, 'note' => $note],
            'update-roll' => ['id' => $id, 'date' => $date, 'note' => $note],
            'delete-roll', 'delete-batch' => ['id' => $id],
            'issue' => ['technician' => $person, 'date' => $date, 'seals' => $ids, 'seals.*' => [...$number, 'distinct'], 'note' => $note],
            'add-to-batch' => ['id' => $id, 'seals' => $ids, 'seals.*' => [...$number, 'distinct']],
            'update-batch' => ['id' => $id, 'technician' => $person, 'date' => $date,
                'add' => ['sometimes', 'array', 'list', 'max:1000'], 'add.*' => [...$number, 'distinct'],
                'remove' => ['sometimes', 'array', 'list', 'max:1000'], 'remove.*' => [...$number, 'distinct']],
            'assign-batch' => ['id' => $id, 'technician' => [...$person, 'required']],
            'record' => ['number' => $number, 'status' => ['required', Rule::in(['issued', 'used', 'damaged', 'lost'])], 'date' => ['nullable', ...array_slice($date, 1)], 'details' => $note, 'board' => ['nullable', 'string', 'max:80'], 'task_id' => ['nullable', 'integer']],
            'return-to-stock' => ['seals' => $ids, 'seals.*' => [...$number, 'distinct']],
        });
        $actor = $request->user();
        $result = DB::transaction(function () use ($branch, $action, $data, $actor) {
            Branch::whereKey($branch)->lockForUpdate()->firstOrFail();
            $ledger = $this->ledger($branch);
            if (isset($data['technician'])) {
                $technician = User::with('employee')->find($data['technician']);
                abort_unless($technician && str_contains((string) $technician->employee?->job_title, 'فني'), 422, 'اختر فنيًا فعّالًا من الفرع.');
            }
            if ($action === 'record' && isset($data['task_id'])) {
                $this->linkTask($branch, $data, $ledger, $actor);
            }
            $result = match ($action) {
                'add-roll', 'update-roll', 'delete-roll' => $this->roll($action, $data, $ledger),
                'issue', 'add-to-batch', 'update-batch', 'assign-batch', 'delete-batch' => $this->batch($action, $data, $ledger),
                'record', 'return-to-stock' => $this->record($action, $data, $ledger),
            };
            DB::table('branch_seal_ledgers')->updateOrInsert(['branch_id' => $branch], ['records' => json_encode($ledger, JSON_THROW_ON_ERROR)]);
            $record = $data['id'] ?? $data['number'] ?? (is_array($result) ? $result['batch_id'] : (is_string($result) ? $result : null));
            Audit::log('seals.'.$action, null, null, ['record' => $record === null ? null : (string) $record], null, $branch);

            return $result;
        });

        return response()->json(['result' => $result]);
    }

    private function roll(string $action, array $data, array &$ledger): ?string
    {
        $id = $data['id'] ?? Str::uuid()->toString();
        if ($action === 'add-roll') {
            $from = (int) $data['from'];
            $to = (int) ($data['to'] ?? $from + 99);
            abort_if($to < $from || $to > 9999999 || $to - $from > 999, 422, 'نطاق الرول غير صالح. الحد الأقصى 1000 ختم.');
            foreach (range($from, $to) as $number) {
                abort_if(isset($ledger['seals'][$number]), 422, "الختم {$number} مسجل من قبل.");
                $ledger['seals'][$number] = $this->stockSeal($number, $id);
            }
            $ledger['rolls'][$id] = ['id' => $id, 'fromNo' => $from, 'toNo' => $to, 'receivedOn' => $data['date'], 'note' => $data['note'] ?? '',
                'headerText' => null, 'sheetLabel' => null, 'sheetPos' => null, 'sheetCol' => null, 'sheetWidth' => null, 'sheetTab' => null];

            return $id;
        }
        abort_unless(isset($ledger['rolls'][$id]), 404, 'الرول غير موجود.');
        if ($action === 'update-roll') {
            foreach ($ledger['batches'] as $batch) {
                abort_if($batch['rollId'] === $id && $batch['issuedOn'] < $data['date'], 422, 'تاريخ الاستلام يأتي بعد صرف إحدى دفعات الرول.');
            }
            $ledger['rolls'][$id]['receivedOn'] = $data['date'];
            $ledger['rolls'][$id]['note'] = $data['note'] ?? '';

            return null;
        }
        foreach ($ledger['seals'] as $number => $seal) {
            if ($seal['rollId'] === $id) {
                abort_unless($seal['status'] === 'in_stock', 422, 'لا يمكن حذف رول خرجت منه أختام.');
                unset($ledger['seals'][$number]);
            }
        }
        unset($ledger['rolls'][$id]);

        return null;
    }

    private function batch(string $action, array $data, array &$ledger): array|int|null
    {
        $id = $data['id'] ?? Str::uuid()->toString();
        if ($action === 'issue' || $action === 'add-to-batch') {
            $numbers = array_map('intval', $data['seals']);
            $roll = $ledger['seals'][$numbers[0]]['rollId'] ?? null;
            abort_unless($roll, 422, 'الختم غير مسجل.');
            foreach ($numbers as $number) {
                $seal = $ledger['seals'][$number] ?? null;
                abort_unless($seal && $seal['rollId'] === $roll && $seal['status'] === 'in_stock', 422, "الختم {$number} غير متاح من الرول المحدد.");
            }
            if ($action === 'issue') {
                $batchNo = 1;
                foreach ($ledger['batches'] as $other) {
                    if ($other['rollId'] === $roll) {
                        $batchNo = max($batchNo, $other['batchNo'] + 1);
                    }
                }
                $ledger['batches'][$id] = ['id' => $id, 'rollId' => $roll, 'batchNo' => $batchNo,
                    'technicianId' => isset($data['technician']) ? (string) $data['technician'] : null, 'issuedOn' => $data['date'],
                    'note' => $data['note'] ?? '', 'originalSeals' => null, 'blockFrom' => null, 'blockOrd' => null,
                    'label' => null, 'usageOrd' => null, 'usageFill' => null];
            }
            $batch = $ledger['batches'][$id] ?? null;
            abort_if($batch && $batch['issuedOn'] < $ledger['rolls'][$roll]['receivedOn'], 422, 'تاريخ الصرف يسبق تاريخ الاستلام.');
            abort_unless($batch && $batch['rollId'] === $roll, 422, 'الدفعة والأختام من رولين مختلفين.');
            $position = 0;
            foreach ($ledger['seals'] as $seal) {
                if ($seal['batchId'] === $id) {
                    $position = max($position, $seal['batchPos']);
                }
            }
            foreach ($numbers as $number) {
                $ledger['seals'][$number] = array_replace($ledger['seals'][$number], [
                    'status' => 'issued', 'batchId' => $id, 'batchPos' => ++$position,
                    'technicianId' => $batch['technicianId'], 'issuedOn' => $batch['issuedOn'],
                ]);
            }

            return $action === 'issue' ? ['batch_id' => $id, 'batch_no' => $batch['batchNo'], 'roll_id' => $roll, 'count' => count($numbers)] : count($numbers);
        }
        abort_unless(isset($ledger['batches'][$id]), 404, 'الدفعة غير موجودة.');
        if ($action === 'delete-batch') {
            $count = 0;
            foreach ($ledger['seals'] as $number => $seal) {
                if ($seal['batchId'] === $id) {
                    abort_unless($seal['status'] === 'issued', 422, 'الدفعة تحتوي على أختام سُجّل استخدامها.');
                    $ledger['seals'][$number] = $this->stockSeal($number, $seal['rollId']);
                    $count++;
                }
            }
            unset($ledger['batches'][$id]);

            return $count;
        }
        $technician = isset($data['technician']) ? (string) $data['technician'] : $ledger['batches'][$id]['technicianId'];
        $remove = $data['remove'] ?? [];
        foreach ($remove as $number) {
            $seal = $ledger['seals'][$number] ?? null;
            abort_unless($seal && $seal['batchId'] === $id && $seal['status'] === 'issued', 422, 'لا يمكن إزالة ختم مسجل أو ختم من دفعة أخرى.');
        }
        if (! empty($data['add'])) {
            $this->batch('add-to-batch', ['id' => $id, 'seals' => $data['add']], $ledger);
        }
        foreach ($remove as $number) {
            $ledger['seals'][$number] = $this->stockSeal((int) $number, $ledger['batches'][$id]['rollId']);
        }
        abort_unless(in_array($id, array_column($ledger['seals'], 'batchId'), true), 422, 'اترك ختمًا في الدفعة أو احذف الدفعة كاملة.');
        $date = $data['date'] ?? $ledger['batches'][$id]['issuedOn'];
        abort_if($date < $ledger['rolls'][$ledger['batches'][$id]['rollId']]['receivedOn'], 422, 'تاريخ الصرف يسبق تاريخ الاستلام.');
        foreach ($ledger['seals'] as &$seal) {
            if ($seal['batchId'] === $id) {
                abort_if($seal['status'] !== 'issued' && ($seal['technicianId'] !== $technician || $seal['issuedOn'] !== $date), 422, 'الدفعة تحتوي على أختام مسجّلة.');
                $seal['technicianId'] = $technician;
                $seal['issuedOn'] = $date;
            }
        }
        unset($seal);
        $ledger['batches'][$id]['technicianId'] = $technician;
        $ledger['batches'][$id]['issuedOn'] = $date;

        return null;
    }

    private function record(string $action, array $data, array &$ledger): ?int
    {
        if ($action === 'return-to-stock') {
            foreach ($data['seals'] as $number) {
                $seal = $ledger['seals'][$number] ?? null;
                abort_unless($seal && $seal['status'] !== 'in_stock', 422, "الختم {$number} غير مصروف.");
                $ledger['seals'][$number] = $this->stockSeal((int) $number, $seal['rollId']);
                $batch = $seal['batchId'];
                if ($batch && ! in_array($batch, array_column($ledger['seals'], 'batchId'), true)) {
                    unset($ledger['batches'][$batch]);
                }
            }

            return count($data['seals']);
        }
        $number = (int) $data['number'];
        $seal = $ledger['seals'][$number] ?? null;
        abort_unless($seal && $seal['batchId'] && $seal['technicianId'], 422, 'اصرف الختم لفني قبل تسجيله.');
        $open = $data['status'] === 'issued';
        abort_if(! $open && empty($data['date']), 422, 'تاريخ التسجيل مطلوب.');
        abort_if(! $open && $data['date'] < $seal['issuedOn'], 422, 'تاريخ التسجيل يسبق تاريخ الصرف.');
        $ledger['seals'][$number] = array_replace($seal, [
            'taskId' => $data['status'] === 'used'
                ? (array_key_exists('task_id', $data) ? (isset($data['task_id']) ? (string) $data['task_id'] : null) : $seal['taskId'])
                : null,
            'status' => $data['status'], 'usedOn' => $open ? null : $data['date'],
            'details' => $open ? '' : ($data['details'] ?? ''), 'boardNo' => $open ? '' : ($data['board'] ?? ''),
        ]);

        return null;
    }

    private function stockSeal(int $number, string $roll): array
    {
        return ['sealNo' => $number, 'rollId' => $roll, 'status' => 'in_stock', 'batchId' => null, 'batchPos' => null,
            'technicianId' => null, 'issuedOn' => null, 'usedOn' => null, 'details' => '', 'boardNo' => '', 'taskId' => null];
    }

    private function ledger(int $branch): array
    {
        $json = DB::table('branch_seal_ledgers')->where('branch_id', $branch)->value('records');

        return $json ? json_decode($json, true, flags: JSON_THROW_ON_ERROR) : ['rolls' => [], 'batches' => [], 'seals' => []];
    }

    private function branch(Request $request, string $permission): int
    {
        $actor = $request->user();
        $branch = (int) $actor->branch_id;
        abort_unless($branch && Access::allowsBranch($actor, 'seals.'.$permission, $branch), 403);
        $enabled = BranchModule::where('branch_id', $branch)->where('module', 'seals')->value('is_enabled');
        abort_if($enabled !== null && ! $enabled, 403, 'قسم الأختام مغلق في هذا الفرع.');

        return $branch;
    }
}
