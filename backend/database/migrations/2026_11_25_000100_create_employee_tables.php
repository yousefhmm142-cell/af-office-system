<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The employee file: one row per user account (every employee has an account).
 * The full name stays on users.name; everything else about the person is here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();

            // Personal (the employee edits these).
            $table->string('national_id', 20)->nullable()->unique();
            $table->string('phone', 15)->nullable();
            $table->unsignedSmallInteger('wa_code')->default(970);
            $table->string('address', 200)->nullable();
            $table->enum('education_level', ['none', 'primary', 'preparatory', 'secondary', 'diploma', 'bachelor', 'master', 'phd'])->nullable();
            $table->string('specialty', 100)->nullable();
            $table->enum('gender', ['male', 'female'])->nullable();

            // Wallet or bank account for salary payments (the employee edits these).
            $table->enum('payment_method', ['wallet', 'bank'])->nullable();
            $table->string('provider', 60)->nullable();
            $table->string('account_number', 40)->nullable();
            $table->string('account_holder_name', 120)->nullable();
            $table->string('account_holder_national_id', 20)->nullable();
            $table->string('account_holder_phone', 15)->nullable();

            // Job (HR decides these).
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->string('job_title', 60)->nullable();
            $table->foreignId('work_schedule_id')->nullable()->constrained('work_schedules')->nullOnDelete();
            $table->boolean('tracks_attendance')->default(true);
            // QR works from any network or place for this person (technicians in the field).
            $table->boolean('punch_anywhere')->default(false);
            $table->enum('salary_type', ['monthly', 'weekly', 'daily', 'contract'])->nullable();
            $table->decimal('salary_amount', 10, 2)->nullable();
            $table->decimal('daily_hours', 4, 2)->default(8);
            $table->date('hire_date')->nullable();
            $table->enum('status', ['active', 'trainee', 'suspended', 'terminated'])->default('active');
            $table->string('termination_reason', 500)->nullable();

            $table->timestamps();
        });

        Schema::create('employee_attachments', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->enum('type', ['id_photo', 'specialty_cert', 'experience_cert', 'other']);
            $table->string('path');
            $table->string('original_name', 200);
            $table->string('mime', 100);
            $table->unsignedInteger('size');
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('employee_status_log', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20);
            $table->string('reason', 500)->nullable();
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('changed_at')->useCurrent();
        });

        // Accounts made before this step get their (empty) file now.
        $now = now();
        DB::table('users')->orderBy('id')->pluck('id')->each(fn ($id) => DB::table('employees')->insertOrIgnore([
            'user_id' => $id, 'created_at' => $now, 'updated_at' => $now,
        ]));
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_status_log');
        Schema::dropIfExists('employee_attachments');
        Schema::dropIfExists('employees');
    }
};
