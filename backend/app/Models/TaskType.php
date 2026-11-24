<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskType extends Model
{
    protected $fillable = ['branch_id', 'name', 'default_minutes', 'is_active', 'sort_order'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'default_minutes' => 'integer', 'sort_order' => 'integer'];
    }
}
