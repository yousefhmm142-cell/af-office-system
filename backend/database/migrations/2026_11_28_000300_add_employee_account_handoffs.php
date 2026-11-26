<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->text('handoff_code')->nullable());
        Schema::table('messages', fn (Blueprint $table) => $table->json('account_handoff')->nullable());
    }

    public function down(): void
    {
        Schema::table('messages', fn (Blueprint $table) => $table->dropColumn('account_handoff'));
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('handoff_code'));
    }
};
