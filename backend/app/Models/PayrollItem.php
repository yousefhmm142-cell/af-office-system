<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollItem extends Model
{
    protected $fillable = [
        'batch_id', 'user_id', 'branch_id', 'salary_type', 'salary_amount', 'base', 'overtime', 'bonuses',
        'auto_deductions', 'manual_deductions', 'advance_deduction', 'net', 'details', 'payment',
    ];

    protected function casts(): array
    {
        return [
            'salary_amount' => 'float', 'base' => 'float', 'overtime' => 'float', 'bonuses' => 'float',
            'auto_deductions' => 'float', 'manual_deductions' => 'float', 'advance_deduction' => 'float', 'net' => 'float',
            'details' => 'array', 'payment' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(PayrollBatch::class, 'batch_id');
    }
}
