<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branch_page_grants', function (Blueprint $table) {
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('permission_id')->constrained()->cascadeOnDelete();
            $table->primary(['user_id', 'branch_id', 'permission_id']);
        });

        $manager = DB::table('roles')->where('key', 'branch_manager')->value('id');
        $permission = DB::table('permissions')->where('key', 'users.manage')->value('id');
        if ($manager && $permission) {
            DB::table('role_permissions')->insertOrIgnore([
                'role_id' => $manager,
                'permission_id' => $permission,
                'scope' => 'branch',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('branch_page_grants');
    }
};
