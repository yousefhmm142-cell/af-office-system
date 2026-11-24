<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdvancePayment extends Model
{
    protected $fillable = ['advance_id', 'batch_id', 'amount'];

    protected function casts(): array
    {
        return ['amount' => 'float'];
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(PayrollBatch::class, 'batch_id');
    }
}
