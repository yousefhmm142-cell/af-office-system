<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Field tasks: an order from the office to one or more technicians, followed step by step
 * (sent, opened, started, done or cancelled), each step kept in the task's log.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->cascadeOnDelete(); // null = every branch
            $table->string('name', 60);
            $table->unsignedSmallInteger('default_minutes')->default(60);
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('zones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->string('name', 80);
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->unique(['branch_id', 'name']);
        });

        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->unsignedInteger('number');
            $table->foreignId('task_type_id')->constrained('task_types');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('details')->nullable();
            $table->string('subscriber_name', 120)->nullable();
            $table->string('subscriber_phone', 15)->nullable();
            $table->foreignId('zone_id')->nullable()->constrained('zones')->nullOnDelete();
            $table->string('location_text', 200)->nullable();
            $table->enum('priority', ['normal', 'urgent', 'emergency'])->default('normal');
            $table->unsignedSmallInteger('expected_minutes')->default(60);
            $table->enum('status', ['new', 'sent', 'seen', 'in_progress', 'done', 'cancelled'])->default('new');
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('seen_at')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->text('completion_notes')->nullable();
            $table->string('cancel_reason', 300)->nullable();
            $table->string('photo_path')->nullable();
            // The private link a technician opens from WhatsApp, without signing in.
            $table->string('link_token', 40)->unique();
            $table->boolean('recorded_offline')->default(false);
            $table->timestamps();
            $table->unique(['branch_id', 'number']);
            $table->index(['branch_id', 'status']);
        });

        Schema::create('task_assignees', function (Blueprint $table) {
            $table->foreignId('task_id')->constrained('tasks')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->primary(['task_id', 'user_id']);
        });

        Schema::create('task_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained('tasks')->cascadeOnDelete();
            // created | sent_whatsapp | sent_app | seen | started | completed | cancelled | reassigned | edited
            $table->string('event', 30);
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('at');
            $table->boolean('recorded_offline')->default(false);
            // The phone's own id for an action sent again after a cut connection.
            $table->uuid('operation')->nullable()->unique();
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['task_id', 'at']);
        });
    }

    public function down(): void
    {
        foreach (['task_events', 'task_assignees', 'tasks', 'zones', 'task_types'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
