<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_requests', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained();
            $t->foreignId('branch_id')->constrained();
            $t->string('kind', 16);
            $t->date('starts');
            $t->date('ends');
            $t->time('from_time')->nullable();
            $t->time('to_time')->nullable();
            $t->string('reason', 300);
            $t->string('status', 16)->default('pending');
            $t->timestamps();
            $t->index(['user_id', 'starts', 'ends']);
        });
        Schema::create('leave_days', function (Blueprint $t) {
            $t->foreignId('request_id')->constrained('leave_requests')->cascadeOnDelete();
            $t->date('date');
            $t->primary(['request_id', 'date']);
        });
        Schema::create('annual_leave_allowances', function (Blueprint $t) {
            $t->foreignId('user_id')->constrained();
            $t->unsignedSmallInteger('year');
            $t->unsignedSmallInteger('days');
            $t->primary(['user_id', 'year']);
        });
        Schema::table('payroll_batches', fn (Blueprint $t) => $t->json('advance_ids')->nullable());
    }

    public function down(): void
    {
        Schema::table('payroll_batches', fn (Blueprint $t) => $t->dropColumn('advance_ids'));
        Schema::dropIfExists('annual_leave_allowances');
        Schema::dropIfExists('leave_days');
        Schema::dropIfExists('leave_requests');
    }
};
