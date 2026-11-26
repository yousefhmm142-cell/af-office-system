<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Per-branch settings the branch manager sets: for now the generator maintenance schedule. */
    public function up(): void
    {
        Schema::create('branch_settings', function (Blueprint $table) {
            $table->foreignId('branch_id')->primary()->constrained()->cascadeOnDelete();
            $table->json('maintenance_plan')->nullable();
            $table->timestamp('last_backup_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('branch_settings');
    }
};
