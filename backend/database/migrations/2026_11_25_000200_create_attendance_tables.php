<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance: a QR sheet per branch, every punch (QR, the in-app button, or entered by the
 * branch manager), one summary line per person per day, and a log of manual edits.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_points', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->string('name', 60);
            $table->string('code', 40)->unique();
            $table->boolean('is_active')->default(true);
            // QR only works from the office internet once the branch manager approved it (up to 5 addresses).
            $table->boolean('network_required')->default(true);
            $table->json('allowed_ips')->nullable();
            // Optional: QR only works within this distance of the office.
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->unsignedSmallInteger('radius_m')->default(100);
            $table->timestamps();
        });

        Schema::create('attendance_days', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->date('date');
            $table->foreignId('work_schedule_id')->nullable()->constrained('work_schedules')->nullOnDelete();
            $table->timestamp('check_in')->nullable();
            $table->timestamp('check_out')->nullable();
            $table->unsignedSmallInteger('worked_minutes')->default(0);
            $table->unsignedSmallInteger('late_minutes')->default(0);
            $table->unsignedSmallInteger('overtime_minutes')->default(0);
            $table->boolean('is_work_day')->default(true);
            $table->boolean('recorded_offline')->default(false);
            $table->boolean('manually_edited')->default(false);
            $table->enum('approval_status', ['pending', 'approved'])->default('pending');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'date']);
            $table->index(['branch_id', 'date']);
        });

        Schema::create('attendance_punches', function (Blueprint $table) {
            $table->id();
            // The phone's own id for the punch, so one sent twice (bad connection) counts once.
            $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->foreignId('attendance_day_id')->constrained('attendance_days')->cascadeOnDelete();
            $table->enum('kind', ['in', 'out']);
            $table->timestamp('at');
            $table->enum('method', ['qr', 'app', 'manual']);
            $table->foreignId('point_id')->nullable()->constrained('attendance_points')->nullOnDelete();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reason', 300)->nullable();
            $table->string('ip', 45)->nullable();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->timestamp('device_time')->nullable();
            $table->boolean('recorded_offline')->default(false);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['user_id', 'at']);
        });

        Schema::create('attendance_edits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attendance_day_id')->constrained('attendance_days')->cascadeOnDelete();
            $table->foreignId('edited_by')->nullable()->constrained('users')->nullOnDelete();
            $table->json('old_values')->nullable();
            $table->json('new_values');
            $table->string('reason', 300)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        foreach (['attendance_edits', 'attendance_punches', 'attendance_days', 'attendance_points'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
