<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('generation_generators', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->string('brand', 80);
            $table->string('model', 80)->nullable();
            $table->decimal('capacity_kva', 10, 2)->nullable();
            $table->decimal('liters_per_hour', 10, 2)->nullable();
            $table->boolean('is_active')->default(true);
            $table->unique(['branch_id', 'name']);
            $table->timestamps();
        });

        Schema::create('generation_fuel_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->boolean('is_active')->default(true);
            $table->unique(['branch_id', 'name']);
            $table->timestamps();
        });

        Schema::create('generation_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->date('report_date');
            $table->string('status', 20)->default('draft');
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('created_by')->constrained('users');
            $table->foreignId('submitted_by')->nullable()->constrained('users');
            $table->foreignId('approved_by')->nullable()->constrained('users');
            $table->dateTime('submitted_at')->nullable();
            $table->dateTime('approved_at')->nullable();
            $table->string('returned_reason', 500)->nullable();
            $table->json('figures');
            $table->timestamps();
            $table->unique(['branch_id', 'report_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('generation_reports');
        Schema::dropIfExists('generation_fuel_types');
        Schema::dropIfExists('generation_generators');
    }
};
