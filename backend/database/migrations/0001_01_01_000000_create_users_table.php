<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 1 core: branches, roles, permissions and the login accounts.
 *
 * Every user signs in with a username and a password (no e-mail, no phone login).
 * A user belongs to one branch, or to none when they work for the whole company
 * (super admin, management, HR).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('key', 40)->unique();
            $table->string('name', 80);
            // Higher level = higher in the hierarchy. Nobody manages a user at or above their own level.
            $table->unsignedSmallInteger('level');
            $table->boolean('is_system')->default(true);
            $table->timestamps();
        });

        Schema::create('branches', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('name', 80)->unique();
            $table->string('code', 20)->nullable()->unique();
            $table->foreignId('manager_user_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('name', 120);
            $table->string('username', 40)->unique();
            $table->string('password');
            $table->foreignId('role_id')->constrained('roles');
            $table->foreignId('branch_id')->nullable()->constrained('branches');
            $table->boolean('is_active')->default(true);
            $table->boolean('must_change_password')->default(true);
            $table->unsignedSmallInteger('failed_logins')->default(0);
            $table->timestamp('locked_until')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->timestamp('password_changed_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::table('branches', function (Blueprint $table) {
            $table->foreign('manager_user_id')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::table('branches', fn (Blueprint $table) => $table->dropForeign(['manager_user_id']));
        Schema::dropIfExists('users');
        Schema::dropIfExists('branches');
        Schema::dropIfExists('roles');
    }
};
