<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Holiday;
use App\Support\Access;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class HolidayController extends Controller
{
    /** Company-wide holidays plus those of the branches the user can see. */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $scope = Access::scope($user, 'schedules.view');
        $year = $request->integer('year') ?: (int) now(config('app.business_timezone'))->year;

        $q = Holiday::query()->whereYear('date', $year)->where(function ($q) use ($scope, $user) {
            $q->whereNull('branch_id');
            if ($scope === 'all') {
                $q->orWhereNotNull('branch_id');
            } elseif ($user->branch_id) {
                $q->orWhere('branch_id', $user->branch_id);
            }
        })->orderBy('date');

        return response()->json(['holidays' => $q->get(['id', 'branch_id', 'date', 'name'])]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')->whereNull('deleted_at')],
            'date' => ['required', 'date_format:Y-m-d'],
            'name' => ['required', 'string', 'min:2', 'max:80'],
        ]);
        $branchId = $data['branch_id'] ?? null;
        abort_unless(Access::allowsBranch($request->user(), 'holidays.manage', $branchId), 403, 'ليست لديك صلاحية لإضافة هذه العطلة.');
        if (Holiday::where('date', $data['date'])->where('branch_id', $branchId)->exists()) {
            throw ValidationException::withMessages(['date' => 'توجد عطلة مسجّلة في اليوم نفسه.']);
        }
        $holiday = Holiday::create($data);
        Audit::log('holiday.created', $holiday, null, $data);

        return response()->json(['holiday' => $holiday], 201);
    }

    public function destroy(Request $request, Holiday $holiday): JsonResponse
    {
        abort_unless(Access::allowsBranch($request->user(), 'holidays.manage', $holiday->branch_id), 403, 'ليست لديك صلاحية لحذف هذه العطلة.');
        $holiday->delete();
        Audit::log('holiday.deleted', $holiday, $holiday->only('date', 'name', 'branch_id'));

        return response()->json(['ok' => true]);
    }
}
