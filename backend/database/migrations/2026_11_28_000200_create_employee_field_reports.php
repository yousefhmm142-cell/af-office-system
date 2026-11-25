<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_attachments', fn (Blueprint $table) => $table->string('type', 32)->change());
        Schema::create('leave_request_reads', function (Blueprint $table) {
            $table->foreignId('leave_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->primary(['leave_request_id', 'user_id']);
        });
        Schema::create('employee_field_reports', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained();
            $table->date('date');
            $table->string('kind', 20);
            $table->json('metrics');
            $table->primary(['user_id', 'date', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_field_reports');
        Schema::dropIfExists('leave_request_reads');
        DB::table('employee_attachments')->where('type', 'contract')->update(['type' => 'other']);
        Schema::table('employee_attachments', fn (Blueprint $table) => $table->enum('type', ['id_photo', 'specialty_cert', 'experience_cert', 'other'])->change());
    }
};
