<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Department;
use App\Support\Access;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DepartmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['departments' => Department::when($request->integer('branch_id'), fn ($q, $id) => $q->whereIn('id', DB::table('branch_department')->where('branch_id', $id)->select('department_id')))->orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'sort_order', 'is_active'])]);
    }

    public function assign(Request $request, Branch $branch, Department $department): JsonResponse
    {
        abort_unless(Access::allowsBranch($request->user(), 'departments.manage', $branch->id), 403);
        DB::table('branch_department')->insertOrIgnore(['branch_id' => $branch->id, 'department_id' => $department->id]);
        Audit::log('branch.department_assigned', $branch, null, ['department_id' => $department->id]);

        return response()->json(['ok' => true]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:60', Rule::unique('departments', 'name')->whereNull('deleted_at')],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        $branch = $request->validate(['branch_id' => ['sometimes', 'integer', Rule::exists('branches', 'id')->whereNull('deleted_at')]])['branch_id'] ?? null;
        if ($branch) {
            abort_unless(Access::allowsBranch($request->user(), 'departments.manage', $branch), 403);
        }
        $dep = DB::transaction(function () use ($data, $branch) {
            $dep = Department::create($data);
            if ($branch) {
                DB::table('branch_department')->insert(['branch_id' => $branch, 'department_id' => $dep->id]);
            }

            return $dep;
        });
        Audit::log('department.created', $dep, null, $data);

        return response()->json(['department' => $dep], 201);
    }

    public function update(Request $request, Department $department): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:60', Rule::unique('departments', 'name')->whereNull('deleted_at')->ignore($department->id)],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        $department->fill($data)->save();
        [$old, $new] = Audit::diff($department);
        if ($new) {
            Audit::log('department.updated', $department, $old, $new);
        }

        return response()->json(['department' => $department]);
    }

    public function destroy(Department $department): JsonResponse
    {
        $department->delete();
        Audit::log('department.deleted', $department, $department->only('name'));

        return response()->json(['ok' => true]);
    }
}
