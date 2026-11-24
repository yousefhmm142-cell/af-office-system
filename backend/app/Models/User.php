<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, HasUuid, SoftDeletes;

    protected $fillable = [
        'uuid', 'name', 'username', 'password', 'role_id', 'branch_id', 'is_active', 'must_change_password',
    ];

    protected $hidden = ['password', 'failed_logins', 'locked_until'];

    /** Effective permissions for this request: key => scope (filled by App\Support\Access). */
    public ?array $accessCache = null;

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'is_active' => 'boolean',
            'must_change_password' => 'boolean',
            'failed_logins' => 'integer',
            'locked_until' => 'datetime',
            'last_login_at' => 'datetime',
            'password_changed_at' => 'datetime',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function permissionOverrides(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'user_permissions')->withPivot('effect', 'scope', 'granted_by')->withTimestamps();
    }

    public function isSuperAdmin(): bool
    {
        return $this->role?->key === Role::SUPER_ADMIN;
    }

    public function level(): int
    {
        return (int) ($this->role?->level ?? 0);
    }

    /** Usernames are compared trimmed and lower-cased (Latin letters); Arabic letters stay as typed. */
    public static function normalizeUsername(string $username): string
    {
        return mb_strtolower(trim($username));
    }
}
