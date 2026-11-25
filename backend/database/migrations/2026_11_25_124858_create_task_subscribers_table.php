<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_subscribers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->string('n', 160);
            $table->string('a', 160)->nullable();
            $table->string('b', 80)->nullable();
            $table->string('p', 24)->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_subscribers');
    }
};
