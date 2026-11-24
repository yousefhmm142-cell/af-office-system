<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Message extends Model
{
    use HasUuid;

    public const KINDS = ['message', 'leave_request', 'permission_request'];

    protected $fillable = ['uuid', 'sender_id', 'thread_id', 'parent_id', 'forwarded_from_id', 'kind', 'subject', 'body', 'meta', 'groups_label'];

    protected function casts(): array
    {
        return ['meta' => 'array'];
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function recipients(): HasMany
    {
        return $this->hasMany(MessageRecipient::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(MessageAttachment::class);
    }

    public function forwardedFrom(): BelongsTo
    {
        return $this->belongsTo(Message::class, 'forwarded_from_id');
    }
}
