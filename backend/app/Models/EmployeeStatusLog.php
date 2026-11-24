<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeStatusLog extends Model
{
    public $timestamps = false;

    protected $table = 'employee_status_log';

    protected $fillable = ['employee_id', 'from_status', 'to_status', 'reason', 'changed_by', 'changed_at'];

    protected function casts(): array
    {
        return ['changed_at' => 'datetime'];
    }

    public function changer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
