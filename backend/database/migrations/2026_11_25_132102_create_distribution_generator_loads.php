<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('distribution_generator_loads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('generator_id')->constrained('generation_generators')->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('load_unit', 2);
            $table->json('band_loads');
            $table->unique(['branch_id', 'date', 'generator_id'], 'distribution_generator_day_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('distribution_generator_loads');
    }
};
