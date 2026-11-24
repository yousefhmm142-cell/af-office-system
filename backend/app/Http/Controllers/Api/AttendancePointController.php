<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendancePoint;
use App\Support\Access;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * QR sheets per branch. The office internet is approved by pressing a button while on the office
 * Wi-Fi (the server keeps the address it sees), only by whoever holds attendance.points for the branch.
 */
class AttendancePointController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();
        $branchId = $request->integer('branch_id') ?: $actor->branch_id;
        abort_unless($branchId && Access::allowsBranch($actor, 'attendance.points', $branchId), 403, 'ليست لديك صلاحية على أوراق هذا الفرع.');

        return response()->json([
            'points' => AttendancePoint::where('branch_id', $branchId)->orderBy('id')->get()->map(fn ($p) => $this->present($p)),
            'my_ip' => $request->ip(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'branch_id' => ['required', 'integer', Rule::exists('branches', 'id')->whereNull('deleted_at')],
            'name' => ['required', 'string', 'min:2', 'max:60'],
        ]);
        $this->authorizeBranch($request, $data['branch_id']);
        $point = AttendancePoint::create($data);
        Audit::log('attendance.point_created', $point, null, ['name' => $point->name]);

        return response()->json(['point' => $this->present($point)], 201);
    }

    public function update(Request $request, AttendancePoint $point): JsonResponse
    {
        $this->authorizeBranch($request, $point->branch_id);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:60'],
            'is_active' => ['sometimes', 'boolean'],
            'network_required' => ['sometimes', 'boolean'],
        ]);
        $point->fill($data)->save();
        [$old, $new] = Audit::diff($point);
        if ($new) {
            Audit::log('attendance.point_updated', $point, $old, $new);
        }

        return response()->json(['point' => $this->present($point)]);
    }

    /** Press it while on the office Wi-Fi: the address the server sees becomes allowed. */
    public function addNetwork(Request $request, AttendancePoint $point): JsonResponse
    {
        $this->authorizeBranch($request, $point->branch_id);
        $ip = (string) $request->ip();
        $ips = $point->allowed_ips ?? [];
        if (! in_array($ip, $ips, true)) {
            if (count($ips) >= config('access.attendance.max_ips')) {
                throw ValidationException::withMessages(['ip' => 'توجد خمس شبكات معتمدة. احذف إحداها أولاً.']);
            }
            $ips[] = $ip;
            $point->forceFill(['allowed_ips' => $ips])->save();
            Audit::log('attendance.network_added', $point, null, ['ip' => $ip]);
        }

        return response()->json(['point' => $this->present($point)]);
    }

    public function removeNetwork(Request $request, AttendancePoint $point): JsonResponse
    {
        $this->authorizeBranch($request, $point->branch_id);
        $ip = (string) $request->validate(['ip' => ['required', 'string', 'max:45']])['ip'];
        $point->forceFill(['allowed_ips' => array_values(array_diff($point->allowed_ips ?? [], [$ip]))])->save();
        Audit::log('attendance.network_removed', $point, ['ip' => $ip]);

        return response()->json(['point' => $this->present($point)]);
    }

    /** Optional: «my location now» from a phone inside the office, or clear it. */
    public function setLocation(Request $request, AttendancePoint $point): JsonResponse
    {
        $this->authorizeBranch($request, $point->branch_id);
        $data = $request->validate([
            'lat' => ['nullable', 'numeric', 'between:-90,90', 'required_with:lng'],
            'lng' => ['nullable', 'numeric', 'between:-180,180', 'required_with:lat'],
            'radius_m' => ['sometimes', 'integer', 'between:20,1000'],
        ]);
        $point->forceFill(['lat' => $data['lat'] ?? null, 'lng' => $data['lng'] ?? null, 'radius_m' => $data['radius_m'] ?? $point->radius_m])->save();
        Audit::log('attendance.location', $point, null, ['set' => $point->lat !== null, 'radius_m' => $point->radius_m]);

        return response()->json(['point' => $this->present($point)]);
    }

    /** A new code: the old printed sheet stops working (if it was photographed and shared). */
    public function rotate(Request $request, AttendancePoint $point): JsonResponse
    {
        $this->authorizeBranch($request, $point->branch_id);
        $point->forceFill(['code' => AttendancePoint::newCode()])->save();
        Audit::log('attendance.code_rotated', $point);

        return response()->json(['point' => $this->present($point)]);
    }

    private function authorizeBranch(Request $request, int $branchId): void
    {
        abort_unless(Access::allowsBranch($request->user(), 'attendance.points', $branchId), 403, 'ليست لديك صلاحية على أوراق هذا الفرع.');
    }

    private function present(AttendancePoint $p): array
    {
        return [
            'id' => $p->id, 'branch_id' => $p->branch_id, 'name' => $p->name, 'code' => $p->code, 'is_active' => $p->is_active,
            'network_required' => $p->network_required, 'allowed_ips' => array_values($p->allowed_ips ?? []),
            'has_location' => $p->lat !== null, 'radius_m' => $p->radius_m,
        ];
    }
}
