<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class AttendancePoint extends Model
{
    protected $fillable = ['branch_id', 'name', 'code', 'is_active', 'network_required', 'allowed_ips', 'lat', 'lng', 'radius_m'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'network_required' => 'boolean',
            'allowed_ips' => 'array',
            'lat' => 'float',
            'lng' => 'float',
            'radius_m' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (AttendancePoint $p) {
            $p->code ??= self::newCode();
        });
    }

    public static function newCode(): string
    {
        return Str::lower(Str::random(32));
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
