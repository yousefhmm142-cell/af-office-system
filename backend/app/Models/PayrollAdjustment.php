<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollAdjustment extends Model
{
    use HasUuid;

    protected $fillable = ['uuid', 'user_id', 'branch_id', 'type', 'month', 'amount', 'reason', 'batch_id', 'created_by'];

    protected function casts(): array
    {
        return ['amount' => 'float'];
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
