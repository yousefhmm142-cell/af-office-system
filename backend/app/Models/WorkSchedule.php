<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class WorkSchedule extends Model
{
    use HasUuid, SoftDeletes;

    /** ISO days: 1 Monday ... 7 Sunday. The whole week, Friday included. */
    public const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

    protected $fillable = [
        'uuid', 'branch_id', 'name', 'start_time', 'end_time', 'grace_minutes', 'absent_after',
        'overtime_min_minutes', 'overtime_round_minutes', 'work_days', 'is_default',
    ];

    protected function casts(): array
    {
        return [
            'work_days' => 'array',
            'is_default' => 'boolean',
            'grace_minutes' => 'integer',
            'overtime_min_minutes' => 'integer',
            'overtime_round_minutes' => 'integer',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
