<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['task_id', 'event', 'actor_id', 'at', 'recorded_offline', 'operation', 'meta'];

    protected function casts(): array
    {
        return ['at' => 'datetime', 'recorded_offline' => 'boolean', 'meta' => 'array'];
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
