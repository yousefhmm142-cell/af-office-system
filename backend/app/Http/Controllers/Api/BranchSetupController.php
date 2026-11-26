<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Support\Access;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The branch's own lists, set by its manager from «الإعدادات»: generators, fuel types,
 * distribution zones, the maintenance schedule, and a backup of the branch's data.
 */
class BranchSetupController extends Controller
{
    /** How often each maintenance is due when the branch has not set its own. */
    public const DEFAULT_PLAN = [
        'oil_filter' => ['hours' => 250], 'fuel_filter' => ['hours' => 500], 'air_filter' => ['hours' => 500],
        'cooling' => ['days' => 30], 'battery' => ['days' => 60], 'belt' => ['days' => 90],
    ];

    public function show(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $me = $request->user();
        $settings = DB::table('branch_settings')->where('branch_id', $branch->id)->first();

        return response()->json([
            'branch' => ['id' => $branch->id, 'name' => $branch->name],
            'generators' => DB::table('generation_generators')->where('branch_id', $branch->id)->orderBy('id')->get()->values()->map(fn ($g, $i) => [
                'id' => $g->id, 'name' => $g->name, 'brand' => $g->brand, 'model' => $g->model,
                'capacityKva' => $g->capacity_kva === null ? null : (float) $g->capacity_kva,
                'litersPerHour' => $g->liters_per_hour === null ? null : (float) $g->liters_per_hour,
                'isActive' => (bool) $g->is_active, 'sortOrder' => $i + 1,
            ]),
            'fuelTypes' => DB::table('generation_fuel_types')->where('branch_id', $branch->id)->orderBy('id')->get()->values()
                ->map(fn ($f, $i) => ['id' => $f->id, 'name' => $f->name, 'isActive' => (bool) $f->is_active, 'sortOrder' => $i + 1]),
            'zones' => DB::table('distribution_zones')->where('branch_id', $branch->id)->orderBy('id')->get()->values()
                ->map(fn ($z, $i) => ['id' => $z->id, 'name' => $z->name, 'isActive' => (bool) $z->is_active, 'sortOrder' => $i + 1]),
            'maintenancePlan' => self::plan($branch->id),
            'lastBackupAt' => $settings?->last_backup_at,
            'can' => [
                'generation' => Access::allowsBranch($me, 'generation.fill', $branch->id),
                'distribution' => Access::allowsBranch($me, 'distribution.fill', $branch->id),
            ],
        ]);
    }

    public function savePlan(Request $request): JsonResponse
    {
        $branch = $this->branch($request, 'generation.fill');
        $kinds = array_keys(self::DEFAULT_PLAN);
        $data = $request->validate([
            'plan' => ['present', 'array'],
            'plan.*' => ['array:hours,days'],
            'plan.*.hours' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'plan.*.days' => ['nullable', 'integer', 'min:1', 'max:10000'],
        ]);
        $plan = [];
        foreach ($data['plan'] as $kind => $every) {
            abort_unless(in_array($kind, $kinds, true), 422, 'نوع صيانة غير معروف.');
            $every = array_filter($every ?? [], fn ($v) => $v !== null && $v > 0);
            if ($every) {
                $plan[$kind] = array_map('intval', $every);
            }
        }
        DB::table('branch_settings')->updateOrInsert(['branch_id' => $branch->id], ['maintenance_plan' => json_encode($plan), 'updated_at' => now(), 'created_at' => now()]);
        Audit::log('branch.maintenance_plan', null, null, $plan, null, $branch->id);

        return response()->json(['maintenancePlan' => $plan]);
    }

    public function saveZone(Request $request, ?int $zone = null): JsonResponse
    {
        $branch = $this->branch($request, 'distribution.fill');
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80', Rule::unique('distribution_zones')->where('branch_id', $branch->id)->ignore($zone)],
            'isActive' => ['required', 'boolean'],
        ]);
        $row = ['name' => trim($data['name']), 'is_active' => $data['isActive'], 'updated_at' => now()];
        if ($zone) {
            $found = DB::table('distribution_zones')->where('branch_id', $branch->id)->where('id', $zone);
            abort_unless($found->exists(), 404);
            $found->update($row);
        } else {
            $zone = DB::table('distribution_zones')->insertGetId($row + ['branch_id' => $branch->id, 'created_at' => now()]);
        }
        Audit::log('distribution.zone', null, null, ['id' => $zone, 'name' => $row['name'], 'active' => $row['is_active']], null, $branch->id);

        return response()->json(['id' => $zone]);
    }

    /** Everything the branch wrote, in one file to keep somewhere safe. */
    public function backup(Request $request): StreamedResponse
    {
        $branch = $this->branch($request, 'branches.view');
        $tables = [
            'generation_generators', 'generation_fuel_types', 'generation_reports', 'distribution_zones', 'distribution_sheets',
            'attendance_days', 'tasks', 'zones', 'task_types',
        ];
        DB::table('branch_settings')->updateOrInsert(['branch_id' => $branch->id], ['last_backup_at' => now(), 'updated_at' => now(), 'created_at' => now()]);
        Audit::log('branch.backup', null, null, ['tables' => count($tables)], null, $branch->id);
        $name = 'backup-branch-'.$branch->id.'-'.now(config('app.business_timezone'))->format('Y-m-d').'.json';

        return response()->streamDownload(function () use ($tables, $branch) {
            $out = ['branch' => $branch->only(['id', 'name']), 'created_at' => now()->toIso8601String(), 'data' => []];
            foreach ($tables as $t) {
                if (\Illuminate\Support\Facades\Schema::hasTable($t)) {
                    $out['data'][$t] = DB::table($t)->where('branch_id', $branch->id)->get();
                }
            }
            $out['data']['employees'] = DB::table('users')->where('branch_id', $branch->id)->whereNull('deleted_at')->get(['id', 'name', 'username', 'is_active']);
            echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        }, $name, ['Content-Type' => 'application/json']);
    }

    public static function plan(int $branchId): array
    {
        $saved = DB::table('branch_settings')->where('branch_id', $branchId)->value('maintenance_plan');

        return $saved === null ? self::DEFAULT_PLAN : json_decode($saved, true);
    }

    private function branch(Request $request, ?string $permission = null): Branch
    {
        $data = $request->validate(['branch_id' => ['nullable', 'integer']]);
        $me = $request->user();
        $id = (int) ($data['branch_id'] ?? $me->branch_id);
        $allowed = $permission
            ? Access::allowsBranch($me, $permission, $id)
            : (Access::allowsBranch($me, 'generation.fill', $id) || Access::allowsBranch($me, 'distribution.fill', $id) || Access::allowsBranch($me, 'branches.view', $id));
        abort_unless($id && $allowed, 403, 'ليست لديك صلاحية إعدادات هذا الفرع.');

        return Branch::findOrFail($id);
    }
}
