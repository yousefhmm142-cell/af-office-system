<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PayrollBatch extends Model
{
    use HasUuid;

    protected $fillable = [
        'advance_ids', 'uuid', 'branch_id', 'month', 'percent', 'is_final', 'title', 'status', 'total_net', 'employees_count',
        'created_by', 'approved_by', 'approved_at', 'paid_by', 'paid_at', 'calculated_at',
    ];

    protected function casts(): array
    {
        return [
            'advance_ids' => 'array',
            'percent' => 'float',
            'is_final' => 'boolean',
            'total_net' => 'float',
            'employees_count' => 'integer',
            'approved_at' => 'datetime',
            'paid_at' => 'datetime',
            'calculated_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(PayrollItem::class, 'batch_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
