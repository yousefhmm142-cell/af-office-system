<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Internal mail: a message, its recipients (each with read / archived marks), and attachments.
 * Replies share a thread; a forward ("رفع") points at the message it carries.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('sender_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedBigInteger('thread_id')->nullable()->index();
            $table->foreignId('parent_id')->nullable()->constrained('messages')->nullOnDelete();
            $table->foreignId('forwarded_from_id')->nullable()->constrained('messages')->nullOnDelete();
            // message | leave_request | permission_request
            $table->string('kind', 30)->default('message');
            $table->string('subject', 200);
            $table->text('body');
            $table->json('meta')->nullable();
            $table->string('groups_label', 300)->nullable();
            $table->timestamps();
        });

        Schema::create('message_recipients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained('messages')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('read_at')->nullable();
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();
            $table->unique(['message_id', 'user_id']);
            $table->index(['user_id', 'read_at']);
        });

        Schema::create('message_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained('messages')->cascadeOnDelete();
            $table->string('path');
            $table->string('name', 200);
            $table->string('mime', 100);
            $table->unsignedInteger('size');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('message_attachments');
        Schema::dropIfExists('message_recipients');
        Schema::dropIfExists('messages');
    }
};
