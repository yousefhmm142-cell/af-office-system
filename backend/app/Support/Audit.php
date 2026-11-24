<?php

namespace App\Support;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;

/**
 * One line for every sensitive change: who, when, what it was, what it became, and why.
 */
class Audit
{
    /** Never written to the log. */
    private const SECRET = ['password', 'remember_token'];

    public static function log(string $action, ?Model $subject = null, ?array $old = null, ?array $new = null, ?string $reason = null, ?int $branchId = null): AuditLog
    {
        $request = request();
        $user = $request?->user();

        return AuditLog::create([
            'user_id' => $user?->id,
            'branch_id' => $branchId ?? ($subject?->getAttribute('branch_id')),
            'action' => $action,
            'subject_type' => $subject ? class_basename($subject) : null,
            'subject_id' => $subject?->getKey(),
            'old_values' => self::clean($old),
            'new_values' => self::clean($new),
            'reason' => $reason,
            'ip' => $request?->ip(),
        ]);
    }

    /** The fields that changed on a model that was just updated: [old, new]. */
    public static function diff(Model $model): array
    {
        $new = array_diff_key($model->getChanges(), array_flip(['updated_at']));
        $old = array_intersect_key($model->getOriginal(), $new);

        return [$old, $new];
    }

    private static function clean(?array $values): ?array
    {
        if ($values === null) {
            return null;
        }
        foreach (self::SECRET as $k) {
            if (array_key_exists($k, $values)) {
                $values[$k] = '••••';
            }
        }

        return $values;
    }
}
