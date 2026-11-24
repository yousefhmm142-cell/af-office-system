<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DepartmentController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['departments' => Department::orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'sort_order', 'is_active'])]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:60', Rule::unique('departments', 'name')->whereNull('deleted_at')],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        $dep = Department::create($data);
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
