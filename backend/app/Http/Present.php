<?php

namespace App\Http;

use App\Models\Branch;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Support\Access;

/** The JSON shapes the app receives. Times are ISO-8601 with offset (stored in UTC). */
class Present
{
    public static function user(User $u, bool $withAccess = false): array
    {
        $u->loadMissing('role', 'branch');
        $out = [
            'id' => $u->id,
            'uuid' => $u->uuid,
            'name' => $u->name,
            'username' => $u->username,
            'role' => $u->role ? ['id' => $u->role->id, 'key' => $u->role->key, 'name' => $u->role->name, 'level' => $u->role->level] : null,
            'branch' => $u->branch ? ['id' => $u->branch->id, 'name' => $u->branch->name] : null,
            'is_active' => $u->is_active,
            'status' => $u->relationLoaded('employee') ? $u->employee?->status : null,
            'job_title' => $u->relationLoaded('employee') ? $u->employee?->job_title : null,
            'must_change_password' => $u->must_change_password,
            'needs_profile_completion' => (bool) $u->needs_profile_completion,
            'is_locked' => $u->locked_until?->isFuture() ?? false,
            'last_login_at' => $u->last_login_at?->toIso8601String(),
            'created_at' => $u->created_at?->toIso8601String(),
        ];
        if ($withAccess) {
            // The signed-in person: their own record decides which personal pages they get.
            $u->loadMissing('employee');
            $out['status'] = $u->employee?->status;
            $out['job_title'] = $u->employee?->job_title;
            $out['field_worker'] = $u->employee && (str_contains((string) $u->employee->job_title, 'فني')
                || \Illuminate\Support\Facades\DB::table('task_assignees')->where('user_id', $u->id)->exists());
            $out['permissions'] = Access::effective($u);
            $out['modules'] = $u->branch
                ? $u->branch->modules()->where('is_enabled', true)->pluck('module')->values()->all()
                : array_keys(config('access.modules'));
        }

        return $out;
    }

    public static function branch(Branch $b): array
    {
        $b->loadMissing('manager', 'modules');
        $enabled = $b->modules->pluck('is_enabled', 'module');

        return [
            'id' => $b->id,
            'uuid' => $b->uuid,
            'name' => $b->name,
            'code' => $b->code,
            'is_active' => $b->is_active,
            'manager' => $b->manager ? ['id' => $b->manager->id, 'name' => $b->manager->name] : null,
            'modules' => collect(config('access.modules'))->map(fn ($name, $key) => [
                'key' => $key, 'name' => $name, 'enabled' => (bool) ($enabled[$key] ?? false),
            ])->values()->all(),
            'users_count' => $b->users_count ?? $b->users()->count(),
            'updated_at' => $b->updated_at?->toIso8601String(),
        ];
    }

    public static function schedule(WorkSchedule $s): array
    {
        return [
            'id' => $s->id,
            'uuid' => $s->uuid,
            'branch_id' => $s->branch_id,
            'name' => $s->name,
            'start_time' => substr((string) $s->start_time, 0, 5),
            'end_time' => substr((string) $s->end_time, 0, 5),
            'grace_minutes' => $s->grace_minutes,
            'absent_after' => $s->absent_after ? substr((string) $s->absent_after, 0, 5) : null,
            'overtime_min_minutes' => $s->overtime_min_minutes,
            'overtime_round_minutes' => $s->overtime_round_minutes,
            'work_days' => array_values($s->work_days ?? []),
            'is_default' => $s->is_default,
        ];
    }
}
