<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;

class AttendancePunch extends Model
{
    use HasUuid;

    public const UPDATED_AT = null;

    protected $fillable = [
        'uuid', 'user_id', 'branch_id', 'attendance_day_id', 'kind', 'at', 'method', 'point_id', 'recorded_by',
        'reason', 'ip', 'lat', 'lng', 'device_time', 'recorded_offline',
    ];

    protected function casts(): array
    {
        return ['at' => 'datetime', 'device_time' => 'datetime', 'recorded_offline' => 'boolean'];
    }
}
