<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Role extends Model
{
    public const SUPER_ADMIN = 'super_admin';
    public const MANAGEMENT = 'management';
    public const HR = 'hr';
    public const BRANCH_MANAGER = 'branch_manager';
    public const EMPLOYEE = 'employee';

    protected $fillable = ['key', 'name', 'level', 'is_system'];

    protected function casts(): array
    {
        return ['level' => 'integer', 'is_system' => 'boolean'];
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'role_permissions')->withPivot('scope')->withTimestamps();
    }
}
