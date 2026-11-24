<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Present;
use App\Models\Branch;
use App\Models\BranchModule;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Support\Access;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class BranchController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $branches = Access::limit(Branch::query(), $request->user(), 'branches.view', 'id')
            ->withCount('users')->with('manager', 'modules')->orderBy('name')->get();

        return response()->json(['branches' => $branches->map(fn ($b) => Present::branch($b))]);
    }

    public function show(Request $request, Branch $branch): JsonResponse
    {
        abort_unless(Access::allowsBranch($request->user(), 'branches.view', $branch->id), 403, 'ما عندك صلاحية على هاد الفرع.');
        $branch->loadCount('users');

        return response()->json([
            'branch' => Present::branch($branch),
            'schedules' => $branch->schedules()->orderByDesc('is_default')->orderBy('name')->get()->map(fn ($s) => Present::schedule($s)),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless(Access::scope($request->user(), 'branches.manage') === 'all', 403, 'إضافة الفروع للإدارة العليا بس.');
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:80', Rule::unique('branches', 'name')],
            'code' => ['nullable', 'string', 'max:20', Rule::unique('branches', 'code')],
            'is_active' => ['boolean'],
            'start_time' => ['nullable', 'date_format:H:i'],
            'work_hours' => ['nullable', 'integer', 'min:1', 'max:16'],
            'modules' => ['nullable', 'array'],
            'modules.*' => [Rule::in(array_keys(config('access.modules')))],
        ]);

        $branch = DB::transaction(function () use ($data) {
            $branch = Branch::create([
                'name' => trim($data['name']),
                'code' => $data['code'] ?? null,
                'is_active' => $data['is_active'] ?? true,
            ]);
            $on = $data['modules'] ?? array_keys(config('access.modules'));
            foreach (array_keys(config('access.modules')) as $m) {
                BranchModule::create(['branch_id' => $branch->id, 'module' => $m, 'is_enabled' => in_array($m, $on, true)]);
            }
            $start = $data['start_time'] ?? '08:00';
            $hours = $data['work_hours'] ?? 8;
            WorkSchedule::create([
                'branch_id' => $branch->id,
                'name' => 'الدوام العادي',
                'start_time' => $start,
                'end_time' => now()->setTimeFromTimeString($start)->addHours($hours)->format('H:i'),
                'work_days' => WorkSchedule::ALL_DAYS,
                'is_default' => true,
            ]);

            return $branch;
        });
        Audit::log('branch.created', $branch, null, $branch->only('name', 'code', 'is_active'), null, $branch->id);

        return response()->json(['branch' => Present::branch($branch->fresh())], 201);
    }

    public function update(Request $request, Branch $branch): JsonResponse
    {
        abort_unless(Access::allowsBranch($request->user(), 'branches.manage', $branch->id), 403, 'ما عندك صلاحية على هاد الفرع.');
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:80', Rule::unique('branches', 'name')->ignore($branch->id)],
            'code' => ['sometimes', 'nullable', 'string', 'max:20', Rule::unique('branches', 'code')->ignore($branch->id)],
            'is_active' => ['sometimes', 'boolean'],
            'manager_user_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')->whereNull('deleted_at')],
        ]);
        if (! empty($data['manager_user_id']) && User::find($data['manager_user_id'])?->branch_id !== $branch->id) {
            throw ValidationException::withMessages(['manager_user_id' => 'مدير الفرع لازم يكون من موظفين نفس الفرع.']);
        }

        $branch->fill($data)->save();
        [$old, $new] = Audit::diff($branch);
        if ($new) {
            Audit::log('branch.updated', $branch, $old, $new, null, $branch->id);
        }

        return response()->json(['branch' => Present::branch($branch->fresh())]);
    }

    public function updateModules(Request $request, Branch $branch): JsonResponse
    {
        abort_unless(Access::allowsBranch($request->user(), 'branches.manage', $branch->id), 403, 'ما عندك صلاحية على هاد الفرع.');
        $keys = array_keys(config('access.modules'));
        $data = $request->validate(['modules' => ['required', 'array']] + collect($keys)->mapWithKeys(fn ($k) => ["modules.$k" => ['sometimes', 'boolean']])->all());

        $old = $branch->modules()->pluck('is_enabled', 'module')->map(fn ($v) => (bool) $v)->all();
        foreach (array_intersect_key($data['modules'], array_flip($keys)) as $module => $on) {
            BranchModule::updateOrCreate(['branch_id' => $branch->id, 'module' => $module], ['is_enabled' => (bool) $on]);
        }
        $new = $branch->modules()->pluck('is_enabled', 'module')->map(fn ($v) => (bool) $v)->all();
        Audit::log('branch.modules', $branch, $old, $new, null, $branch->id);

        return response()->json(['branch' => Present::branch($branch->fresh())]);
    }

    public function destroy(Request $request, Branch $branch): JsonResponse
    {
        abort_unless(Access::scope($request->user(), 'branches.manage') === 'all', 403, 'حذف الفروع للإدارة العليا بس.');
        if ($branch->users()->exists()) {
            return response()->json(['message' => 'ما بنقدر نحذف فرع فيه موظفين. انقلهم أو احذفهم أول.', 'code' => 'branch_has_users'], 422);
        }
        $branch->delete();
        Audit::log('branch.deleted', $branch, $branch->only('name', 'code'), null, null, $branch->id);

        return response()->json(['ok' => true]);
    }
}
