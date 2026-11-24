<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PayrollSetting extends Model
{
    public const MODES = ['none', 'wage', 'fixed'];

    protected $fillable = [
        'branch_id', 'effective_from', 'late_mode', 'late_value', 'absence_mode', 'absence_value',
        'overtime_mode', 'overtime_value', 'overtime_cap_hours', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'effective_from' => 'date:Y-m-d',
            'late_value' => 'float',
            'absence_value' => 'float',
            'overtime_value' => 'float',
            'overtime_cap_hours' => 'integer',
        ];
    }
}
