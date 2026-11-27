<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** The readings section is not part of this system (the owner's decision). */
    public function up(): void
    {
        DB::table('branch_modules')->where('module', 'readings')->delete();
    }

    public function down(): void {}
};
