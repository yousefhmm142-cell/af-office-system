<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Organisation: which sections each branch uses, its work schedules, public holidays,
 * the company departments, the permission tables and the audit log.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branch_modules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->string('module', 40);
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();
            $table->unique(['branch_id', 'module']);
        });

        Schema::create('work_schedules', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->string('name', 60);
            $table->time('start_time');
            $table->time('end_time');
            $table->unsignedSmallInteger('grace_minutes')->default(10);
            $table->time('absent_after')->nullable();
            $table->unsignedSmallInteger('overtime_min_minutes')->default(15);
            $table->unsignedSmallInteger('overtime_round_minutes')->default(15);
            // ISO days 1 = Monday ... 7 = Sunday. Friday (5) is a work day by default.
            $table->json('work_days');
            $table->boolean('is_default')->default(false);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['branch_id', 'name']);
        });

        Schema::create('holidays', function (Blueprint $table) {
            $table->id();
            // Null = the whole company.
            $table->foreignId('branch_id')->nullable()->constrained('branches')->cascadeOnDelete();
            $table->date('date');
            $table->string('name', 80);
            $table->timestamps();
            $table->index('date');
        });

        Schema::create('departments', function (Blueprint $table) {
            $table->id();
            $table->string('name', 60)->unique();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('permissions', function (Blueprint $table) {
            $table->id();
            $table->string('key', 60)->unique();
            $table->string('name', 120);
            $table->string('group', 40);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('role_permissions', function (Blueprint $table) {
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            $table->foreignId('permission_id')->constrained('permissions')->cascadeOnDelete();
            // own = only their own records, branch = their branch, all = every branch.
            $table->enum('scope', ['own', 'branch', 'all']);
            $table->timestamps();
            $table->primary(['role_id', 'permission_id']);
        });

        Schema::create('user_permissions', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('permission_id')->constrained('permissions')->cascadeOnDelete();
            $table->enum('effect', ['allow', 'deny']);
            $table->enum('scope', ['own', 'branch', 'all'])->nullable();
            $table->foreignId('granted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->primary(['user_id', 'permission_id']);
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->string('action', 60);
            $table->string('subject_type', 60)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('reason', 500)->nullable();
            $table->string('ip', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['subject_type', 'subject_id']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        foreach (['audit_logs', 'user_permissions', 'role_permissions', 'permissions', 'departments', 'holidays', 'work_schedules', 'branch_modules'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
