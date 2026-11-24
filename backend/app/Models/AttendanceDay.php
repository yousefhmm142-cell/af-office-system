<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AttendanceDay extends Model
{
    protected $fillable = [
        'user_id', 'branch_id', 'date', 'work_schedule_id', 'check_in', 'check_out', 'worked_minutes', 'late_minutes',
        'overtime_minutes', 'is_work_day', 'recorded_offline', 'manually_edited', 'approval_status', 'approved_by', 'approved_at',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'check_in' => 'datetime',
            'check_out' => 'datetime',
            'approved_at' => 'datetime',
            'is_work_day' => 'boolean',
            'recorded_offline' => 'boolean',
            'manually_edited' => 'boolean',
            'worked_minutes' => 'integer',
            'late_minutes' => 'integer',
            'overtime_minutes' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function punches(): HasMany
    {
        return $this->hasMany(AttendancePunch::class);
    }
}
