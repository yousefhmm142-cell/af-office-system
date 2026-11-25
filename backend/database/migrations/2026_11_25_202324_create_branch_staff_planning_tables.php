<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branch_department', function (Blueprint $table) {
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('department_id')->constrained()->cascadeOnDelete();
            $table->primary(['branch_id', 'department_id']);
        });
        DB::table('branch_department')->insertUsing(['branch_id', 'department_id'],
            DB::table('employees')->join('users', 'users.id', '=', 'employees.user_id')
                ->whereNotNull('users.branch_id')->whereNotNull('employees.department_id')
                ->distinct()->select('users.branch_id', 'employees.department_id'));
        Schema::create('employee_shifts', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->boolean('is_rest');
            $table->json('schedule');
            $table->primary(['user_id', 'date']);
            $table->index(['branch_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_shifts');
        Schema::dropIfExists('branch_department');
    }
};
