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
        'users.manage' => ['إضافة وتعديل المستخدمين وتغيير رموزهم', 'الموظفين'],
        'permissions.manage' => ['توزيع الصلاحيات', 'النظام'],
        'audit.view' => ['سجل الحركات', 'النظام'],
    ],

    // Default grants per role: permission => scope (own | branch | all).
    // The super admin always has everything in every branch, whatever is stored.
    'defaults' => [
        'management' => [
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
        ],
        'branch_manager' => [
            'branches.view' => 'branch',
            'schedules.view' => 'branch',
            'users.view' => 'branch',
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
];
