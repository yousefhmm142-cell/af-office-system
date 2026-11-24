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
            ->with(['user:id,name', 'branch:id,name'])
            ->when($data['branch_id'] ?? null, fn ($q, $v) => $q->where('branch_id', $v))
            ->when($data['user_id'] ?? null, fn ($q, $v) => $q->where('user_id', $v))
            ->when($data['action'] ?? null, fn ($q, $v) => $q->where('action', 'like', $v.'%'))
            ->when($data['from'] ?? null, fn ($q, $v) => $q->where('created_at', '>=', \Illuminate\Support\Carbon::parse($v, $tz)->startOfDay()->utc()))
            ->when($data['to'] ?? null, fn ($q, $v) => $q->where('created_at', '<=', \Illuminate\Support\Carbon::parse($v, $tz)->endOfDay()->utc()))
            ->orderByDesc('created_at')->orderByDesc('id');

        $page = $q->paginate(50);

        // A readable name for what each line is about (a person, a branch, a batch…).
        $names = [];
        foreach ($page->getCollection()->groupBy('subject_type') as $type => $rows) {
            $class = 'App\\Models\\'.$type;
            if (! $type || ! class_exists($class)) {
                continue;
            }
            $model = new $class;
            $col = match (true) {
                $model->isFillable('name') => 'name',
                $model->isFillable('title') => 'title',
                default => null,
            };
            if (! $col) {
                continue;
            }
            $found = $class::query()->when(method_exists($model, 'bootSoftDeletes'), fn ($w) => $w->withTrashed())
                ->whereIn($model->getKeyName(), $rows->pluck('subject_id')->filter()->unique())->pluck($col, $model->getKeyName());
            foreach ($found as $id => $name) {
                $names[$type.':'.$id] = $name;
            }
        }
        $page->getCollection()->transform(function (AuditLog $log) use ($names) {
            $log->setAttribute('subject_name', $names[$log->subject_type.':'.$log->subject_id] ?? null);

            return $log;
        });

        return response()->json($page);
    }
}
