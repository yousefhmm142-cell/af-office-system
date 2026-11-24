<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BranchModule extends Model
{
    protected $fillable = ['branch_id', 'module', 'is_enabled'];

    protected function casts(): array
    {
        return ['is_enabled' => 'boolean'];
    }
}
