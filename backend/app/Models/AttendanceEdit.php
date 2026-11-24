<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceEdit extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['attendance_day_id', 'edited_by', 'old_values', 'new_values', 'reason'];

    protected function casts(): array
    {
        return ['old_values' => 'array', 'new_values' => 'array'];
    }
}
