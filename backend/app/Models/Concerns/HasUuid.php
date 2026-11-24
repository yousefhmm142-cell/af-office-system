<?php

namespace App\Models\Concerns;

use Illuminate\Support\Str;

/**
 * A public id that a device can create before it reaches the server (offline work).
 */
trait HasUuid
{
    public static function bootHasUuid(): void
    {
        static::creating(function ($model) {
            if (empty($model->uuid)) {
                $model->uuid = (string) Str::uuid();
            }
        });
    }
}
