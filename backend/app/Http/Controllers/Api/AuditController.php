<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Support\Access;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer'],
            'user_id' => ['nullable', 'integer'],
            'action' => ['nullable', 'string', 'max:60'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ]);
        $tz = config('app.business_timezone');
        $q = Access::limit(AuditLog::query(), $request->user(), 'audit.view')
            ->with('user:id,name')
            ->when($data['branch_id'] ?? null, fn ($q, $v) => $q->where('branch_id', $v))
            ->when($data['user_id'] ?? null, fn ($q, $v) => $q->where('user_id', $v))
            ->when($data['action'] ?? null, fn ($q, $v) => $q->where('action', 'like', $v.'%'))
            ->when($data['from'] ?? null, fn ($q, $v) => $q->where('created_at', '>=', \Illuminate\Support\Carbon::parse($v, $tz)->startOfDay()->utc()))
            ->when($data['to'] ?? null, fn ($q, $v) => $q->where('created_at', '<=', \Illuminate\Support\Carbon::parse($v, $tz)->endOfDay()->utc()))
            ->orderByDesc('id');

        return response()->json($q->paginate(50));
    }
}
