<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/** The task types used in Mukhayyam 2, for every branch (each branch can add its own). */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::table('task_types')->exists()) {
            return;
        }
        $names = ['شد وتوصيل كوابل', 'تفتيش', 'تركيب اشتراك', 'تبديل ساعة', 'رفع وتنزيل قدرة', 'فحص ساعة', 'تعديل أحمال', 'نقل اشتراك',
            'فصل ووصل', 'صيانات عامة', 'إضافة مشترك', 'إعادة شبك', 'فك ساعة فحص', 'تركيب ساعة فحص', 'فصل خط', 'تغذية طبلون'];
        $now = now();
        DB::table('task_types')->insert(array_map(fn ($n, $i) => [
            'name' => $n, 'sort_order' => $i + 1, 'default_minutes' => 60, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
        ], $names, array_keys($names)));
    }

    public function down(): void
    {
    }
};
