<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Payroll: the rules (set by HR, each from a date), manual deductions and bonuses,
 * advances paid back in instalments, and pay batches (a share of the month, e.g. 50%).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payroll_settings', function (Blueprint $table) {
            $table->id();
            // Null = the whole company; a branch row wins over the company one.
            $table->foreignId('branch_id')->nullable()->constrained('branches')->cascadeOnDelete();
            $table->date('effective_from');
            // none | wage (minutes × hourly wage × factor) | fixed (amount per hour or per day)
            $table->enum('late_mode', ['none', 'wage', 'fixed'])->default('none');
            $table->decimal('late_value', 10, 2)->default(1);
            $table->enum('absence_mode', ['none', 'wage', 'fixed'])->default('none');
            $table->decimal('absence_value', 10, 2)->default(1);
            $table->enum('overtime_mode', ['none', 'wage', 'fixed'])->default('none');
            $table->decimal('overtime_value', 10, 2)->default(1);
            $table->unsignedSmallInteger('overtime_cap_hours')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['branch_id', 'effective_from']);
        });

        Schema::create('payroll_batches', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->char('month', 7); // YYYY-MM
            $table->decimal('percent', 5, 2);
            $table->boolean('is_final')->default(false); // completes the month: attendance amounts are settled here
            $table->string('title', 120);
            $table->enum('status', ['draft', 'approved', 'paid'])->default('draft');
            $table->decimal('total_net', 12, 2)->default(0);
            $table->unsignedInteger('employees_count')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('paid_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('calculated_at')->nullable();
            $table->timestamps();
            $table->index(['month', 'branch_id']);
        });

        Schema::create('payroll_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('batch_id')->constrained('payroll_batches')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->string('salary_type', 20);
            $table->decimal('salary_amount', 10, 2);
            $table->decimal('base', 10, 2)->default(0);
            $table->decimal('overtime', 10, 2)->default(0);
            $table->decimal('bonuses', 10, 2)->default(0);
            $table->decimal('auto_deductions', 10, 2)->default(0);
            $table->decimal('manual_deductions', 10, 2)->default(0);
            $table->decimal('advance_deduction', 10, 2)->default(0);
            $table->decimal('net', 10, 2)->default(0);
            $table->json('details')->nullable();
            // A copy of how to pay the person at the time of the batch.
            $table->json('payment')->nullable();
            $table->timestamps();
            $table->unique(['batch_id', 'user_id']);
        });

        Schema::create('payroll_adjustments', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->enum('type', ['deduction', 'bonus']);
            $table->char('month', 7);
            $table->decimal('amount', 10, 2);
            $table->string('reason', 300);
            // The batch that pays it; empty until the next batch of that month takes it.
            $table->foreignId('batch_id')->nullable()->constrained('payroll_batches')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['month', 'user_id']);
        });

        Schema::create('advances', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->decimal('amount', 10, 2);
            $table->decimal('installment', 10, 2);
            $table->char('start_month', 7);
            $table->string('reason', 300)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('advance_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('advance_id')->constrained('advances')->cascadeOnDelete();
            $table->foreignId('batch_id')->constrained('payroll_batches')->cascadeOnDelete();
            $table->decimal('amount', 10, 2);
            $table->timestamps();
            $table->unique(['advance_id', 'batch_id']);
        });
    }

    public function down(): void
    {
        foreach (['advance_payments', 'advances', 'payroll_adjustments', 'payroll_items', 'payroll_batches', 'payroll_settings'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
