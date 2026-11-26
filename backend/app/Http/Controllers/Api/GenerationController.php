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

class GenerationController extends Controller
{
    public function show(Request $request, string $date): JsonResponse
    {
        $branch = $this->branch($request, 'view');
        $this->validateDate($date);
        $report = $this->reports($branch)->where('report_date', $date)->first();
        $previous = $this->reports($branch)->where('report_date', '<', $date)->whereIn('status', ['submitted', 'approved'])
            ->orderByDesc('report_date')->first();

        return response()->json([
            'branch_name' => $branch->name,
            'report' => $report ? $this->present($report) : null,
            'previous' => $previous ? $this->present($previous) : null,
            'generators' => DB::table('generation_generators')->where('branch_id', $branch->id)->orderBy('id')->get()->map(fn ($row) => [
                'id' => $row->id, 'name' => $row->name, 'brand' => $row->brand, 'model' => $row->model,
                'capacityKva' => $row->capacity_kva === null ? null : (float) $row->capacity_kva,
                'litersPerHour' => $row->liters_per_hour === null ? null : (float) $row->liters_per_hour,
                'isActive' => (bool) $row->is_active, 'sortOrder' => $row->id,
            ]),
            'fuel_types' => DB::table('generation_fuel_types')->where('branch_id', $branch->id)->orderBy('id')->get()
                ->map(fn ($row) => ['id' => $row->id, 'name' => $row->name, 'isActive' => (bool) $row->is_active, 'sortOrder' => $row->id]),
            'history' => $this->reports($branch)->orderByDesc('report_date')->limit(60)->get(['report_date', 'status']),
            'can' => [
                'fill' => Access::allowsBranch($request->user(), 'generation.fill', $branch->id),
                'approve' => Access::allowsBranch($request->user(), 'generation.approve', $branch->id),
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
            'fuel' => ['present', 'array', 'list', 'max:50'],
            'fuel.*' => ['array:id,fuelTypeId,openingBalance,receivedQty,closingBalance,shipmentNo,supplier,unitPrice,notes'],
            'fuel.*.id' => ['required', 'uuid', 'distinct'],
            'fuel.*.fuelTypeId' => ['required', 'integer', 'distinct', Rule::exists('generation_fuel_types', 'id')->where('branch_id', $branch->id)],
            'fuel.*.openingBalance' => $number,
            'fuel.*.receivedQty' => $number,
            'fuel.*.closingBalance' => $number,
            'fuel.*.unitPrice' => $number,
            'fuel.*.shipmentNo' => ['nullable', 'string', 'max:120'],
            'fuel.*.supplier' => ['nullable', 'string', 'max:120'],
            'fuel.*.notes' => ['nullable', 'string', 'max:1000'],
            'generators' => ['present', 'array', 'list', 'max:50'],
            'generators.*' => ['array:id,generatorId,didRun,runs,loadUnit,loads,bandLoads,temperatureC,oilPressure,oilPressureUnit,notes'],
            'generators.*.id' => ['required', 'uuid', 'distinct'],
            'generators.*.generatorId' => ['required', 'integer', 'distinct', Rule::exists('generation_generators', 'id')->where('branch_id', $branch->id)],
            'generators.*.didRun' => ['required', 'boolean'],
            'generators.*.runs' => ['present', 'array', 'list', 'max:3'],
            'generators.*.runs.*' => ['array:id,runNo,start,end'],
            'generators.*.runs.*.id' => ['required', 'uuid', 'distinct'],
            'generators.*.runs.*.runNo' => ['required', 'integer', 'between:1,3'],
            'generators.*.runs.*.start' => $clock,
            'generators.*.runs.*.end' => $clock,
            'generators.*.loadUnit' => ['required', Rule::in(['A', 'kW'])],
            'generators.*.loads' => ['required', 'array', 'list', 'size:3'],
            'generators.*.loads.*' => $number,
            'generators.*.bandLoads' => ['required', 'array', 'list', 'size:7'],
            'generators.*.bandLoads.*' => $number,
            'generators.*.temperatureC' => $number,
            'generators.*.oilPressure' => $number,
            'generators.*.oilPressureUnit' => ['required', Rule::in(['bar', 'psi'])],
            'generators.*.notes' => ['nullable', 'string', 'max:1000'],
            'maintenance' => ['present', 'array', 'list', 'max:100'],
            'maintenance.*' => ['array:id,generatorId,oilNewLiters,oilUsedLiters,types,description'],
            'maintenance.*.id' => ['required', 'uuid', 'distinct'],
            'maintenance.*.generatorId' => ['nullable', 'integer', Rule::exists('generation_generators', 'id')->where('branch_id', $branch->id)],
            'maintenance.*.oilNewLiters' => $number,
            'maintenance.*.oilUsedLiters' => $number,
            'maintenance.*.types' => ['present', 'array', 'list', 'max:9'],
            'maintenance.*.types.*' => [Rule::in(['oil_change', 'oil_filter', 'fuel_filter', 'air_filter', 'cooling', 'battery', 'belt', 'electrical', 'other'])],
            'maintenance.*.description' => ['nullable', 'string', 'max:1000'],
            'generalNotes' => ['nullable', 'string', 'max:4000'],
        ]);

        $editClosed = $request->boolean('edit_closed');
        abort_if($editClosed && ! Access::allowsBranch($request->user(), 'generation.approve', $branch->id), 403);

        $report = DB::transaction(function () use ($branch, $date, $data, $request, $editClosed) {
            Branch::whereKey($branch->id)->lockForUpdate()->firstOrFail();
            $query = $this->reports($branch)->where('report_date', $date);
            $current = $query->first();
            abort_if((int) ($current->version ?? 0) !== (int) $data['version'], 409, 'حُدّث التقرير. أعد فتحه قبل الحفظ.');
            $closed = $current && in_array($current->status, ['submitted', 'approved'], true);
            abort_if($closed && ! $editClosed, 409, 'التقرير مغلق. أعد فتحه قبل التعديل.');
            abort_if($editClosed && ! $closed, 409, 'تغيّرت حالة السجل. افتحه مرة أخرى.');
            $previous = $this->reports($branch)->where('report_date', '<', $date)->whereIn('status', ['submitted', 'approved'])
                ->orderByDesc('report_date')->first();
            $figures = $this->figures($data, $previous);
            $values = ['figures' => json_encode($figures, JSON_THROW_ON_ERROR), 'version' => $data['version'] + 1, 'updated_at' => now()];
            if ($current) {
                $query->update($values);
                if ($editClosed) {
                    Audit::log('generation.edit_closed', null, ['version' => $current->version],
                        ['date' => $date, 'version' => $values['version'], 'status' => $current->status], null, $branch->id);
                }
            } else {
                DB::table('generation_reports')->insert($values + [
                    'branch_id' => $branch->id, 'report_date' => $date, 'created_by' => $request->user()->id, 'created_at' => now(),
                ]);
            }

            return $this->reports($branch)->where('report_date', $date)->first();
        });

        return response()->json(['report' => $this->present($report)]);
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
            $query = $this->reports($branch)->where('report_date', $date);
            $current = $query->first();
            abort_unless($current, 404);
            abort_if((int) $current->version !== (int) $data['version'], 409, 'حُدّث التقرير. أعد فتحه قبل المتابعة.');
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
            abort_unless(in_array($current->status, $allowed, true), 409, 'لا يمكن تنفيذ هذا الإجراء في حالة التقرير الحالية.');
            $query->update($changes + ['version' => $current->version + 1, 'updated_at' => $now]);
            Audit::log('generation.'.$action, null, ['status' => $current->status], ['date' => $date, 'status' => $changes['status']], $data['reason'] ?? null, $branch->id);

            return $this->reports($branch)->where('report_date', $date)->first();
        });

        return response()->json(['report' => $this->present($report)]);
    }

    public function equipment(Request $request, string $kind): JsonResponse
    {
        $branch = $this->branch($request, 'fill');
        $table = $kind === 'generator' ? 'generation_generators' : 'generation_fuel_types';
        $data = $request->validate([
            'id' => ['nullable', 'integer', Rule::exists($table, 'id')->where('branch_id', $branch->id)],
            'name' => ['required', 'string', 'max:80', Rule::unique($table, 'name')->where('branch_id', $branch->id)->ignore(
                $request->integer('id') ?: null
            )],
            'isActive' => ['required', 'boolean'],
            ...($kind === 'generator' ? [
                'brand' => ['required', 'string', 'max:80'],
                'model' => ['nullable', 'string', 'max:80'],
                'capacityKva' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
                'litersPerHour' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            ] : []),
        ]);
        $row = ['name' => $data['name'], 'is_active' => $data['isActive'], 'updated_at' => now()];
        if ($kind === 'generator') {
            $row += ['brand' => $data['brand'], 'model' => $data['model'] ?? null,
                'capacity_kva' => $data['capacityKva'] ?? null, 'liters_per_hour' => $data['litersPerHour'] ?? null];
        }
        $id = $data['id'] ?? null;
        if ($id) {
            DB::table($table)->where('branch_id', $branch->id)->where('id', $id)->update($row);
        } else {
            $id = DB::table($table)->insertGetId($row + ['branch_id' => $branch->id, 'created_at' => now()]);
        }
        Audit::log('generation.equipment', null, null, ['kind' => $kind, 'id' => $id, 'name' => $data['name']], null, $branch->id);

        return response()->json(['id' => $id]);
    }

    private function branch(Request $request, string $permission): Branch
    {
        $data = $request->validate(['branch_id' => ['nullable', 'integer']]);
        $actor = $request->user();
        $id = (int) ($data['branch_id'] ?? $actor->branch_id);
        abort_unless($id && Access::allowsBranch($actor, 'generation.'.$permission, $id), 403, 'ليست لديك صلاحية التوليد في هذا الفرع.');
        $branch = Branch::findOrFail($id);
        $enabled = BranchModule::where('branch_id', $id)->where('module', 'generation')->value('is_enabled');
        abort_if($enabled !== null && ! $enabled, 403, 'قسم التوليد مغلق في هذا الفرع.');

        return $branch;
    }

    private function validateDate(string $date): void
    {
        validator(['date' => $date], ['date' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.CarbonImmutable::now(config('app.business_timezone'))->toDateString()]])->validate();
    }

    private function reports(Branch $branch): Builder
    {
        return DB::table('generation_reports')->where('branch_id', $branch->id);
    }

    private function present(stdClass $row): array
    {
        $figures = json_decode($row->figures, true, flags: JSON_THROW_ON_ERROR);
        $shared = DistributionLoads::query($row->branch_id)->where('date', $row->report_date)->get();

        return [
            'id' => (string) $row->id, 'version' => (int) $row->version, 'reportDate' => $row->report_date,
            'status' => $row->status, 'createdBy' => (string) $row->created_by,
            'submittedBy' => $row->submitted_by === null ? null : (string) $row->submitted_by,
            'approvedBy' => $row->approved_by === null ? null : (string) $row->approved_by,
            'submittedAt' => $row->submitted_at, 'approvedAt' => $row->approved_at,
            'returnedReason' => $row->returned_reason, 'recordedOffline' => false, 'updatedAt' => $row->updated_at,
        ] + DistributionLoads::apply($figures, $shared);
    }

    private function figures(array $data, ?stdClass $previous): array
    {
        $priorFuel = $previous ? collect($this->present($previous)['fuel'])->keyBy('fuelTypeId') : collect();
        $fuel = array_map(function (array $line) use ($priorFuel): array {
            $prior = $priorFuel->get($line['fuelTypeId']);
            $line['openingBalance'] = $prior['closingBalance'] ?? $line['openingBalance'] ?? null;
            $line['receivedQty'] ??= null;
            $line['closingBalance'] ??= null;
            $line['totalQty'] = $line['openingBalance'] === null && $line['receivedQty'] === null ? null
                : round(($line['openingBalance'] ?? 0) + ($line['receivedQty'] ?? 0), 2);
            $line['consumption'] = $line['totalQty'] === null || $line['closingBalance'] === null ? null
                : round($line['totalQty'] - $line['closingBalance'], 1);
            foreach (['shipmentNo', 'supplier', 'notes'] as $key) {
                $line[$key] ??= '';
            }
            $line['unitPrice'] ??= null;

            return $line;
        }, $data['fuel']);

        $generators = array_map(function (array $log): array {
            $duration = null;
            foreach ($log['runs'] as &$run) {
                $run['start'] ??= '';
                $run['end'] ??= '';
                if ($run['start'] !== '' && $run['end'] !== '') {
                    $minutes = fn (string $time) => (int) substr($time, 0, 2) * 60 + (int) substr($time, 3, 2);
                    $duration = ($duration ?? 0) + ($minutes($run['end']) - $minutes($run['start']) + 1440) % 1440;
                }
            }
            unset($run);
            $log['didRun'] = (bool) $log['didRun'];
            $log['runHours'] = $log['didRun'] && $duration !== null ? round($duration / 60, 1) : null;
            $log['temperatureC'] ??= null;
            $log['oilPressure'] ??= null;
            $log['notes'] ??= '';

            return $log;
        }, $data['generators']);
        $maintenance = array_map(fn (array $entry) => array_replace([
            'generatorId' => null, 'oilNewLiters' => null, 'oilUsedLiters' => null,
        ], $entry, ['description' => $entry['description'] ?? '']), $data['maintenance']);

        return ['fuel' => $fuel, 'generators' => $generators, 'maintenance' => $maintenance, 'generalNotes' => $data['generalNotes'] ?? ''];
    }
}
