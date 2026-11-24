<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Advance extends Model
{
    use HasUuid;

    protected $fillable = ['uuid', 'user_id', 'branch_id', 'amount', 'installment', 'start_month', 'reason', 'created_by'];

    protected function casts(): array
    {
        return ['amount' => 'float', 'installment' => 'float'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(AdvancePayment::class);
    }

    /** What is still owed, counting instalments already placed in any batch (drafts included). */
    public function remaining(?int $exceptBatchId = null): float
    {
        $paid = (float) $this->payments()->when($exceptBatchId, fn ($q) => $q->where('batch_id', '!=', $exceptBatchId))->sum('amount');

        return round(max(0, $this->amount - $paid), 2);
    }
}
