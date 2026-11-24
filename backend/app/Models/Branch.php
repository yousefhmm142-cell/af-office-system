<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Branch extends Model
{
    use HasUuid, SoftDeletes;

    protected $fillable = ['uuid', 'name', 'code', 'manager_user_id', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'manager_user_id');
    }

    public function modules(): HasMany
    {
        return $this->hasMany(BranchModule::class);
    }

    public function schedules(): HasMany
    {
        return $this->hasMany(WorkSchedule::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }
}
