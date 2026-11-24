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
        'permissions.manage' => ['توزيع الصلاحيات', 'النظام'],
        'audit.view' => ['سجل الحركات', 'النظام'],
    ],

    // Default grants per role: permission => scope (own | branch | all).
    // The super admin always has everything in every branch, whatever is stored.
    'defaults' => [
        'management' => [
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
        ],
        'branch_manager' => [
            'branches.view' => 'branch',
            'schedules.view' => 'branch',
            'users.view' => 'branch',
            'employees.view' => 'branch',
            'attendance.view' => 'branch',
            'attendance.manage' => 'branch',
            'attendance.points' => 'branch',
        ],
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
