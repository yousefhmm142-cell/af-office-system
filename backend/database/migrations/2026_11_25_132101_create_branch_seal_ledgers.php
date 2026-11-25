<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branch_seal_ledgers', function (Blueprint $table) {
            $table->foreignId('branch_id')->primary()->constrained()->cascadeOnDelete();
            $table->json('records');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('branch_seal_ledgers');
    }
};
