<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Task extends Model
{
    use HasUuid;

    public const OPEN = ['new', 'sent', 'seen', 'in_progress'];

    protected $fillable = [
        'uuid', 'branch_id', 'number', 'task_type_id', 'created_by', 'details', 'subscriber_name', 'subscriber_phone', 'zone_id',
        'location_text', 'priority', 'expected_minutes', 'status', 'sent_at', 'seen_at', 'started_at', 'completed_at', 'cancelled_at',
        'completion_notes', 'cancel_reason', 'photo_path', 'link_token', 'recorded_offline',
    ];

    protected $hidden = ['photo_path'];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime', 'seen_at' => 'datetime', 'started_at' => 'datetime', 'completed_at' => 'datetime',
            'cancelled_at' => 'datetime', 'expected_minutes' => 'integer', 'recorded_offline' => 'boolean', 'number' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Task $t) {
            $t->link_token ??= Str::lower(Str::random(32));
        });
    }

    public function type(): BelongsTo
    {
        return $this->belongsTo(TaskType::class, 'task_type_id');
    }

    public function zone(): BelongsTo
    {
        return $this->belongsTo(Zone::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function assignees(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'task_assignees')->withTimestamps();
    }

    public function events(): HasMany
    {
        return $this->hasMany(TaskEvent::class);
    }

    public function isOpen(): bool
    {
        return in_array($this->status, self::OPEN, true);
    }

    /** Past its expected time: counted from the start, or from sending while not started. */
    public function isLate(): bool
    {
        if (! $this->isOpen()) {
            return false;
        }
        $from = $this->started_at ?? $this->sent_at;

        return $from !== null && $from->copy()->addMinutes($this->expected_minutes)->isPast();
    }
}
