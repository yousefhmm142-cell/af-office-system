<?php

namespace App\Models;

use App\Models\Concerns\HasUuid;
use Illuminate\Database\Eloquent\Model;

class EmployeeAttachment extends Model
{
    use HasUuid;

    public const TYPES = ['id_photo', 'specialty_cert', 'experience_cert', 'other'];

    protected $fillable = ['uuid', 'employee_id', 'type', 'path', 'original_name', 'mime', 'size', 'uploaded_by'];

    protected $hidden = ['path'];
}
