<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Employee extends Model
{
    public const PERSONAL = [
        'national_id', 'phone', 'wa_code', 'address', 'education_level', 'specialty', 'gender',
        'payment_method', 'provider', 'account_number', 'account_holder_name', 'account_holder_national_id', 'account_holder_phone',
    ];

    public const JOB = [
        'department_id', 'job_title', 'work_schedule_id', 'tracks_attendance', 'punch_anywhere',
        'salary_type', 'salary_amount', 'daily_hours', 'hire_date',
    ];

    public const STATUSES = ['active', 'trainee', 'suspended', 'terminated'];

    protected $fillable = ['user_id', ...self::PERSONAL, ...self::JOB, 'status', 'termination_reason'];

    protected function casts(): array
    {
        return [
            'tracks_attendance' => 'boolean',
            'punch_anywhere' => 'boolean',
            'wa_code' => 'integer',
            'salary_amount' => 'decimal:2',
            'daily_hours' => 'decimal:2',
            'hire_date' => 'date:Y-m-d',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function schedule(): BelongsTo
    {
        return $this->belongsTo(WorkSchedule::class, 'work_schedule_id');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(EmployeeAttachment::class);
    }

    public function statusLog(): HasMany
    {
        return $this->hasMany(EmployeeStatusLog::class);
    }
}
