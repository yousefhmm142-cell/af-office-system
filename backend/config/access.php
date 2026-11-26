<?php

/*
|--------------------------------------------------------------------------
| Roles, permissions and branch sections
|--------------------------------------------------------------------------
| The source of truth for what exists. `php artisan db:seed --class=AccessSeeder`
| syncs these into the database. The super admin changes who gets what from the
| permissions screen; the defaults below only apply when a role is first created.
*/

return [

    'roles' => [
        'super_admin' => ['name' => 'السوبر أدمن', 'level' => 100],
        'management' => ['name' => 'الإدارة', 'level' => 80],
        'finance' => ['name' => 'المالية', 'level' => 50],
        'hr' => ['name' => 'شؤون الموظفين', 'level' => 60],
        'branch_manager' => ['name' => 'مدير فرع', 'level' => 40],
        'employee' => ['name' => 'موظف', 'level' => 10],
    ],

    // key => [name, group]
    'permissions' => [
        'branches.view' => ['عرض الفروع', 'الفروع'],
        'branches.manage' => ['إضافة وتعديل الفروع وأقسامها', 'الفروع'],
        'schedules.view' => ['عرض الدوامات', 'الدوام'],
        'schedules.manage' => ['إضافة وتعديل الدوامات', 'الدوام'],
        'holidays.manage' => ['العطل الرسمية', 'الدوام'],
        'departments.manage' => ['الأقسام (محصّلين، فنيين…)', 'الموظفين'],
        'users.view' => ['عرض المستخدمين', 'الموظفين'],
        'employees.view' => ['عرض ملفات الموظفين (مع الراتب)', 'الموظفين'],
        'employees.manage' => ['تعديل ملفات الموظفين وحالتهم', 'الموظفين'],
        'users.manage' => ['إضافة وتعديل المستخدمين وتغيير رموزهم', 'الموظفين'],
        'attendance.view' => ['عرض حضور الموظفين', 'الحضور'],
        'attendance.manage' => ['اعتماد الحضور وتعديله وإدخاله يدوياً', 'الحضور'],
        'attendance.points' => ['أوراق الـQR وشبكة المكتب', 'الحضور'],
        'generation.view' => ['عرض تقارير التوليد', 'التوليد'],
        'generation.fill' => ['تعبئة تقارير التوليد وإعداد معدات الفرع', 'التوليد'],
        'generation.approve' => ['اعتماد تقارير التوليد وإعادة فتحها', 'التوليد'],
        'distribution.view' => ['عرض كشوف التوزيع', 'التوزيع'],
        'distribution.fill' => ['تعبئة الكشوف وإعداد مناطق التوزيع', 'التوزيع'],
        'distribution.approve' => ['اعتماد كشوف التوزيع وإعادة فتحها', 'التوزيع'],
        'seals.view' => ['عرض سجل الأختام', 'الأختام'],
        'seals.manage' => ['صرف الأختام وتسجيل استخدامها', 'الأختام'],
        'tasks.view' => ['عرض المهام الميدانية', 'المهام'],
        'tasks.manage' => ['إنشاء المهام وإرسالها وإدارتها (والأنواع والمناطق)', 'المهام'],
        'payroll.view' => ['عرض دفعات الرواتب', 'الرواتب'],
        'payroll.manage' => ['إعداد الرواتب والخصومات والسلف والدفعات', 'الرواتب'],
        'payroll.approve' => ['اعتماد دفعات الرواتب', 'الرواتب'],
        'payroll.deductions' => ['قرار الخصومات واختيار أقساط السلف في الدفعة', 'الرواتب'],
        'leaves.decide' => ['قرار طلبات الإجازة وتحديد أرصدتها', 'الإجازات'],
        'leaves.final' => ['القرار في الإجازات المرفوعة للإدارة', 'الإجازات'],
        'messages.groups' => ['المراسلة الجماعية (فرع أو قسم أو الجميع)', 'المراسلات'],
        'permissions.branch_manage' => ['فتح صفحات للموظفين داخل الفرع', 'النظام'],
        'permissions.manage' => ['توزيع الصلاحيات', 'النظام'],
        'audit.view' => ['سجل الحركات', 'النظام'],
    ],

    // Default grants per role: permission => scope (own | branch | all).
    // The super admin always has everything in every branch, whatever is stored.
    'defaults' => [
        'management' => [
            'tasks.view' => 'all',
            'payroll.view' => 'all',
            'payroll.approve' => 'all',
            'leaves.final' => 'all',
            'messages.groups' => 'all',
            'attendance.view' => 'all',
            'employees.view' => 'all',
            'branches.view' => 'all',
            'schedules.view' => 'all',
            'users.view' => 'all',
            'audit.view' => 'all',
        ],
        'hr' => [
            'branches.view' => 'all',
            'schedules.view' => 'all',
            'schedules.manage' => 'all',
            'holidays.manage' => 'all',
            'departments.manage' => 'all',
            'users.view' => 'all',
            'users.manage' => 'all',
            'employees.view' => 'all',
            'employees.manage' => 'all',
            'attendance.view' => 'all',
            'attendance.manage' => 'all',
            'payroll.view' => 'all',
            'payroll.manage' => 'all',
            'payroll.approve' => 'all',
            'payroll.deductions' => 'all',
            'leaves.decide' => 'all',
            'messages.groups' => 'all',
        ],
        'branch_manager' => [
            'branches.view' => 'branch',
            'schedules.view' => 'branch',
            'users.manage' => 'branch',
            'permissions.branch_manage' => 'branch',
            'users.view' => 'branch',
            'employees.view' => 'branch',
            'attendance.view' => 'branch',
            'attendance.manage' => 'branch',
            'attendance.points' => 'branch',
            'generation.view' => 'branch',
            'generation.fill' => 'branch',
            'generation.approve' => 'branch',
            'distribution.view' => 'branch',
            'distribution.fill' => 'branch',
            'distribution.approve' => 'branch',
            'seals.view' => 'branch',
            'seals.manage' => 'branch',
            'tasks.view' => 'branch',
            'tasks.manage' => 'branch',
        ],
        'finance' => ['payroll.view' => 'all'],
        'employee' => [],
    ],

    // Sections a branch can have switched on or off.
    'modules' => [
        'attendance' => 'الحضور',
        'generation' => 'التوليد',
        'distribution' => 'التوزيع والأحمال',
        'tasks' => 'المهام الميدانية',
        'seals' => 'الأختام',
        'readings' => 'القراءات',
        'sms' => 'رسائل SMS',
    ],

    'login' => [
        'max_failures' => 5,
        'lock_minutes' => 15,
        'password_min' => 6,
    ],

    // Attendance rules (the same as Mukhayyam 2).
    'attendance' => [
        'max_punches' => 2,          // in and out, once each per day
        'out_after_minutes' => 60,   // leaving is not recorded before an hour after arriving
        'repeat_minutes' => 2,       // a second scan within two minutes is the same scan
        'offline_max_hours' => 48,   // a punch saved on a phone without internet is accepted up to two days later
        'max_ips' => 5,
        'gps_slack_m' => 50,         // the phone's own accuracy allowance
    ],
];
