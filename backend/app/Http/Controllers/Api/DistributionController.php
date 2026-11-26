<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\BranchModule;
use App\Support\Access;
use App\Support\Audit;
use App\Support\DistributionLoads;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use stdClass;

class DistributionController extends Controller
{
    public function show(Request $request, string $date): JsonResponse
    {
        $branch = $this->branch($request, 'view');
        $this->validateDate($date);
        $report = $this->reports($branch)->where('sheet_date', $date)->first();
        $previous = $this->reports($branch)->where('sheet_date', '<', $date)->whereIn('status', ['submitted', 'approved'])
            ->orderByDesc('sheet_date')->first();

        return response()->json([
            'branch_name' => $branch->name,
            'sheet' => $report ? $this->present($report) : null,
            'previous' => $previous ? $this->present($previous) : null,
            'zones' => DB::table('distribution_zones')->where('branch_id', $branch->id)->orderBy('id')->get()
                ->map(fn ($row) => ['id' => $row->id, 'name' => $row->name, 'isActive' => (bool) $row->is_active, 'sortOrder' => $row->id]),
            'generatorLoads' => $this->generatorLoads($branch->id, $date),
            'history' => $this->reports($branch)->orderByDesc('sheet_date')->limit(60)->get(['sheet_date', 'status', 'figures'])
                ->map(function ($row) {
                    $zones = array_filter(json_decode($row->figures, true, flags: JSON_THROW_ON_ERROR)['zones'], fn ($zone) => $zone['supplied']);

                    return [
                        'sheet_date' => $row->sheet_date, 'status' => $row->status,
                        'hours' => array_sum(array_column($zones, 'supplyHours')),
                        'runs' => array_sum(array_map(fn ($zone) => count(array_filter($zone['runs'], fn ($run) => $run['start'] || $run['end'])), $zones)),
                    ];
                }),
            'can' => [
                'fill' => Access::allowsBranch($request->user(), 'distribution.fill', $branch->id),
                'approve' => Access::allowsBranch($request->user(), 'distribution.approve', $branch->id),
            ],
        ]);
    }

    public function save(Request $request, string $date): JsonResponse
    {
        $branch = $this->branch($request, 'fill');
        $this->validateDate($date);
        $number = ['nullable', 'numeric', 'min:0', 'max:99999999'];
        $clock = ['nullable', 'date_format:H:i'];
        $data = $request->validate([
            'edit_closed' => ['sometimes', 'boolean'],
            'version' => ['required', 'integer', 'min:0'],
            'zones' => ['present', 'array', 'list', 'max:100'],
            'zones.*' => ['array:id,zoneId,supplied,runs,bands'],
            'zones.*.id' => ['required', 'uuid', 'distinct'],
            'zones.*.zoneId' => ['required', 'integer', 'distinct', Rule::exists('distribution_zones', 'id')->where('branch_id', $branch->id)],
            'zones.*.supplied' => ['required', 'boolean'],
            'zones.*.runs' => ['required', 'array', 'list', 'min:1', 'max:6'],
            'zones.*.runs.*' => ['array:id,runNo,start,end,loadUnit,loads,extra'],
            'zones.*.runs.*.id' => ['required', 'uuid', 'distinct'],
            'zones.*.runs.*.runNo' => ['required', 'integer', 'between:1,6'],
            'zones.*.runs.*.start' => $clock,
            'zones.*.runs.*.end' => $clock,
            'zones.*.runs.*.loadUnit' => ['required', Rule::in(['A', 'kW'])],
            'zones.*.runs.*.loads' => ['required', 'array', 'list', 'size:3'],
            'zones.*.runs.*.loads.*' => $number,
            'zones.*.runs.*.extra' => ['present', 'array', 'list', 'max:30'],
            'zones.*.runs.*.extra.*' => $number,
            'zones.*.bands' => ['required', 'array', 'list', 'size:6'],
            'zones.*.bands.*' => ['required', 'array', 'list', 'size:3'],
            'zones.*.bands.*.*' => $number,
            'generatorLoadEdits' => ['sometimes', 'array', 'list', 'max:50'],
            'generatorLoadEdits.*' => ['array:generator_id,load_unit,band_loads'],
            'generatorLoadEdits.*.generator_id' => ['required', 'integer', 'distinct', Rule::exists('generation_generators', 'id')->where('branch_id', $branch->id)],
            'generatorLoadEdits.*.load_unit' => ['required', Rule::in(['A', 'kW'])],
            'generatorLoadEdits.*.band_loads' => ['required', 'array', 'list', 'size:7'],
            'generatorLoadEdits.*.band_loads.*' => ['nullable', 'numeric', 'min:0', 'max:5000'],
            'notes' => ['nullable', 'string', 'max:4000'],
        ]);

        $editClosed = $request->boolean('edit_closed');
        abort_if($editClosed && ! Access::allowsBranch($request->user(), 'distribution.approve', $branch->id), 403);

        $report = DB::transaction(function () use ($branch, $date, $data, $request, $editClosed) {
            Branch::whereKey($branch->id)->lockForUpdate()->firstOrFail();
            $query = $this->reports($branch)->where('sheet_date', $date);
            $current = $query->first();
            abort_if((int) ($current->version ?? 0) !== (int) $data['version'], 409, 'حُدّث الكشف. أعد فتحه قبل الحفظ.');
            $closed = $current && in_array($current->status, ['submitted', 'approved'], true);
            abort_if($closed && ! $editClosed, 409, 'الكشف مغلق. أعد فتحه قبل التعديل.');
            abort_if($editClosed && ! $closed, 409, 'تغيّرت حالة السجل. افتحه مرة أخرى.');
            foreach ($data['generatorLoadEdits'] ?? [] as $row) {
                DistributionLoads::query($branch->id)->updateOrInsert(
                    ['branch_id' => $branch->id, 'date' => $date, 'generator_id' => $row['generator_id']],
                    ['load_unit' => $row['load_unit'], 'band_loads' => json_encode($row['band_loads'], JSON_THROW_ON_ERROR)]
                );
            }
            $figures = $this->figures($data);
            $values = ['figures' => json_encode($figures, JSON_THROW_ON_ERROR), 'version' => $data['version'] + 1, 'updated_at' => now()];
            if ($current) {
                $query->update($values);
                if ($editClosed) {
                    Audit::log('distribution.edit_closed', null, ['version' => $current->version],
                        ['date' => $date, 'version' => $values['version'], 'status' => $current->status], null, $branch->id);
                }
            } else {
                DB::table('distribution_sheets')->insert($values + [
                    'branch_id' => $branch->id, 'sheet_date' => $date, 'created_by' => $request->user()->id, 'created_at' => now(),
                ]);
            }

            return $this->reports($branch)->where('sheet_date', $date)->first();
        });

        return response()->json(['sheet' => $this->present($report)]);
    }

    public function transition(Request $request, string $date, string $action): JsonResponse
    {
        $branch = $this->branch($request, $action === 'submit' ? 'fill' : 'approve');
        $this->validateDate($date);
        $data = $request->validate([
            'version' => ['required', 'integer', 'min:1'],
            'reason' => [Rule::requiredIf($action === 'return'), 'nullable', 'string', 'max:500'],
        ]);
        $report = DB::transaction(function () use ($branch, $date, $action, $data, $request) {
            Branch::whereKey($branch->id)->lockForUpdate()->firstOrFail();
            $query = $this->reports($branch)->where('sheet_date', $date);
            $current = $query->first();
            abort_unless($current, 404);
            abort_if((int) $current->version !== (int) $data['version'], 409, 'حُدّث الكشف. أعد فتحه قبل المتابعة.');
            $user = $request->user()->id;
            $now = now();
            $changes = match ($action) {
                'submit' => ['status' => 'submitted', 'submitted_by' => $user, 'submitted_at' => $now, 'returned_reason' => null],
                'approve' => ['status' => 'approved', 'approved_by' => $user, 'approved_at' => $now],
                'return' => ['status' => 'returned', 'returned_reason' => $data['reason'], 'approved_by' => null, 'approved_at' => null],
            };
            $allowed = match ($action) {
                'submit' => ['draft', 'returned'],
                'approve' => ['submitted'],
                'return' => ['submitted', 'approved'],
            };
            abort_unless(in_array($current->status, $allowed, true), 409, 'لا يمكن تنفيذ هذا الإجراء في حالة الكشف الحالية.');
            $query->update($changes + ['version' => $current->version + 1, 'updated_at' => $now]);
            Audit::log('distribution.'.$action, null, ['status' => $current->status], ['date' => $date, 'status' => $changes['status']], $data['reason'] ?? null, $branch->id);

            return $this->reports($branch)->where('sheet_date', $date)->first();
        });

        return response()->json(['sheet' => $this->present($report)]);
    }

    public function zone(Request $request): JsonResponse
    {
        $branch = $this->branch($request, 'fill');
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80', Rule::unique('distribution_zones')->where('branch_id', $branch->id)],
        ]);
        $id = DB::table('distribution_zones')->insertGetId([
            'branch_id' => $branch->id, 'name' => $data['name'], 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        Audit::log('distribution.zone', null, null, ['id' => $id, 'name' => $data['name']], null, $branch->id);

        return response()->json(['id' => $id], 201);
    }

    private function branch(Request $request, string $permission): Branch
    {
        $data = $request->validate(['branch_id' => ['nullable', 'integer']]);
        $actor = $request->user();
        $id = (int) ($data['branch_id'] ?? $actor->branch_id);
        abort_unless($id && Access::allowsBranch($actor, 'distribution.'.$permission, $id), 403, 'ليست لديك صلاحية التوزيع في هذا الفرع.');
        $branch = Branch::findOrFail($id);
        $enabled = BranchModule::where('branch_id', $id)->where('module', 'distribution')->value('is_enabled');
        abort_if($enabled !== null && ! $enabled, 403, 'قسم التوزيع مغلق في هذا الفرع.');

        return $branch;
    }

    private function validateDate(string $date): void
    {
        validator(['date' => $date], ['date' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.CarbonImmutable::now(config('app.business_timezone'))->toDateString()]])->validate();
    }

    private function reports(Branch $branch): Builder
    {
        return DB::table('distribution_sheets')->where('branch_id', $branch->id);
    }

    private function present(stdClass $row): array
    {
        return [
            'id' => (string) $row->id, 'version' => (int) $row->version, 'sheetDate' => $row->sheet_date,
            'status' => $row->status, 'createdBy' => (string) $row->created_by,
            'submittedBy' => $row->submitted_by === null ? null : (string) $row->submitted_by,
            'approvedBy' => $row->approved_by === null ? null : (string) $row->approved_by,
            'submittedAt' => $row->submitted_at, 'approvedAt' => $row->approved_at,
            'returnedReason' => $row->returned_reason, 'recordedOffline' => false, 'updatedAt' => $row->updated_at,
        ] + json_decode($row->figures, true, flags: JSON_THROW_ON_ERROR);
    }

    private function generatorLoads(int $branch, string $date): array
    {
        $shared = DistributionLoads::query($branch)->where('date', $date)->get()->keyBy('generator_id');
        $figures = DB::table('generation_reports')->where('branch_id', $branch)->where('report_date', $date)->value('figures');
        $reported = $figures ? collect(json_decode($figures, true, flags: JSON_THROW_ON_ERROR)['generators'])->keyBy('generatorId') : collect();

        return DB::table('generation_generators')->where('branch_id', $branch)->where('is_active', true)->orderBy('id')->get()
            ->map(function ($generator) use ($shared, $reported) {
                $reading = $shared->get($generator->id);
                $report = $reported->get($generator->id);

                return [
                    'generator_id' => $generator->id, 'name' => $generator->name, 'brand' => $generator->brand,
                    'capacity_kva' => $generator->capacity_kva !== null ? (float) $generator->capacity_kva : null,
                    'load_unit' => $reading?->load_unit ?? $report['loadUnit'] ?? 'A',
                    'band_loads' => $reading ? DistributionLoads::values($reading) : ($report['bandLoads'] ?? array_fill(0, 7, null)),
                ];
            })->all();
    }

    private function figures(array $data): array
    {
        $minutes = static fn (string $clock): int => (int) substr($clock, 0, 2) * 60 + (int) substr($clock, 3, 2);
        $zones = array_map(function (array $zone) use ($minutes): array {
            $duration = null;
            foreach ($zone['runs'] as &$run) {
                $run['start'] ??= '';
                $run['end'] ??= '';
                if ($run['start'] !== '' && $run['end'] !== '' && $run['start'] !== $run['end']) {
                    $duration = ($duration ?? 0) + ($minutes($run['end']) - $minutes($run['start']) + 1440) % 1440;
                }
            }
            unset($run);
            $zone['supplied'] = (bool) $zone['supplied'];
            $zone['supplyHours'] = $zone['supplied'] && $duration !== null ? round($duration / 60, 2) : null;

            return $zone;
        }, $data['zones']);

        return ['zones' => $zones, 'notes' => $data['notes'] ?? ''];
    }
}
