<?php

namespace App\Console\Commands;

use App\Models\Advance;
use App\Models\AttendanceDay;
use App\Models\AuditLog;
use App\Models\AttendancePoint;
use App\Models\Branch;
use App\Models\BranchModule;
use App\Models\Department;
use App\Models\Message;
use App\Models\MessageRecipient;
use App\Models\PayrollAdjustment;
use App\Models\PayrollBatch;
use App\Models\PayrollSetting;
use App\Models\Role;
use App\Models\Task;
use App\Models\TaskType;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Models\Zone;
use App\Services\AttendanceService;
use App\Services\PayrollService;
use App\Services\TaskService;
use Carbon\CarbonImmutable;
use Database\Seeders\AccessSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Fills the system with made-up data to try it out: the nine branches, people in every role,
 * two months of attendance, payroll, tasks and messages. All names are invented.
 * Every demo account signs in with the password 123456. Never run it on the real system.
 */
class DemoData extends Command
{
    protected $signature = 'app:demo {--all-roles : Include a demo administrator in a dedicated demo database}';

    protected $description = 'Fill the system with invented demo data (branches, people, attendance, payroll, tasks, messages)';

    private const PASSWORD = '123456';

    /** The company's branches: name => username prefix. */
    private const BRANCHES = [
        'غزة' => 'gaza', 'النصيرات' => 'nuseirat', 'المخيم الجديد' => 'newcamp', 'مخيم 2' => 'camp2', 'السوارحة' => 'sawarha',
        'الزوايدة' => 'zawayda', 'المغازي' => 'maghazi', 'دير البلح' => 'deir', 'البريج' => 'bureij',
    ];

    private const FIRST = ['أحمد', 'محمد', 'محمود', 'خالد', 'سامي', 'يوسف', 'إبراهيم', 'عمر', 'علي', 'حسن', 'مصطفى', 'رامي', 'وسيم', 'أنس', 'طارق', 'فادي', 'نضال', 'باسل', 'معتز', 'حمزة', 'إياد', 'سعيد', 'كمال', 'جهاد'];
    private const LAST = ['أبو شمالة', 'الأغا', 'النجار', 'أبو حسنة', 'شاهين', 'الكحلوت', 'أبو عودة', 'البطش', 'عاشور', 'الشافعي', 'المصري', 'حمدان', 'أبو سمرة', 'الفرا', 'أبو ندى', 'السقا', 'الهندي', 'عوض'];
    private const ZONES = ['البلوك الشرقي', 'الشارع العام', 'قرب المسجد الكبير', 'السوق', 'حي الشهداء'];

    public function handle(AttendanceService $attendance, PayrollService $payroll, TaskService $tasks): int
    {
        if (! app()->environment('local', 'testing')) {
            $this->error('تتوفر البيانات التجريبية في بيئة التطوير والاختبار فقط.');

            return self::FAILURE;
        }
        $allRoles = (bool) $this->option('all-roles');
        if ($allRoles && (! str_ends_with(DB::connection()->getDatabaseName(), '_demo') || User::withTrashed()->exists())) {
            $this->error('استخدم قاعدة بيانات تجريبية فارغة ينتهي اسمها بـ _demo.');

            return self::FAILURE;
        }

        if (User::where('username', 'hr.demo')->exists()) {
            $this->warn('البيانات التجريبية موجودة من قبل.');

            return self::SUCCESS;
        }
        mt_srand(2026);
        (new AccessSeeder)->run();
        $tz = config('app.business_timezone');
        $today = CarbonImmutable::now($tz)->startOfDay();
        $prevMonth = $today->subMonthNoOverflow()->startOfMonth();
        $role = fn (string $k) => Role::where('key', $k)->value('id');

        $months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        $monthName = $months[$prevMonth->month - 1].' '.$prevMonth->year;

        DB::transaction(function () use ($role, $attendance, $payroll, $tasks, $today, $prevMonth, $monthName, $allRoles) {
            $deps = collect(['المحصّلون', 'الفنيون', 'الإدارة'])->mapWithKeys(fn ($n, $i) => [$n => Department::firstOrCreate(['name' => $n], ['sort_order' => $i])->id]);

            $hr = $this->person('هبة أبو شمالة', 'hr.demo', $role(Role::HR), null, 'شؤون الموظفين', 2200, $deps['الإدارة']);
            $mgmt = $this->person('رامي أبو عجوة', 'mgmt.demo', $role(Role::MANAGEMENT), null, 'مدير المكاتب', 3500, $deps['الإدارة']);
            $this->person('مسؤول المالية التجريبي', 'finance.demo', $role(Role::FINANCE), null, 'المالية', 0, $deps['الإدارة']);
            if ($allRoles) {
                $this->person('مدير النظام التجريبي', 'admin.demo', $role(Role::SUPER_ADMIN), null, 'مدير النظام', 0, $deps['الإدارة']);
            }
            $this->line('✓ شؤون الموظفين والإدارة والمالية');

            // Rules for payroll, from the beginning of the year.
            PayrollSetting::firstOrCreate(['branch_id' => null, 'effective_from' => $today->startOfYear()->toDateString()], [
                'late_mode' => 'wage', 'late_value' => 1, 'absence_mode' => 'wage', 'absence_value' => 1,
                'overtime_mode' => 'wage', 'overtime_value' => 1.5, 'overtime_cap_hours' => 40, 'created_by' => $hr->id,
            ]);

            $types = TaskType::whereNull('branch_id')->pluck('id', 'name');
            $allPeople = [];
            foreach (self::BRANCHES as $name => $slug) {
                $branch = Branch::firstOrCreate(['name' => $name]);
                foreach (array_keys(config('access.modules')) as $m) {
                    BranchModule::firstOrCreate(['branch_id' => $branch->id, 'module' => $m], ['is_enabled' => true]);
                }
                if (! WorkSchedule::where('branch_id', $branch->id)->exists()) {
                    WorkSchedule::create(['branch_id' => $branch->id, 'name' => 'الدوام العادي', 'start_time' => '07:30', 'end_time' => '15:30', 'work_days' => WorkSchedule::ALL_DAYS, 'is_default' => true]);
                }
                AttendancePoint::firstOrCreate(['branch_id' => $branch->id, 'name' => 'ورقة المكتب']);
                $zones = collect(self::ZONES)->map(fn ($z, $i) => Zone::firstOrCreate(['branch_id' => $branch->id, 'name' => $z], ['sort_order' => $i])->id);

                // The branch's equipment, as the manager sets it in the settings.
                foreach ([['المولد 1', 'Perkins', '2806A', 500, 60], ['المولد 2', 'Cummins', 'QSX15', 400, 48], ['المولد 3', 'Volvo Penta', 'TAD734', 250, 30]] as [$g, $brand, $model, $kva, $lph]) {
                    DB::table('generation_generators')->insertOrIgnore(['branch_id' => $branch->id, 'name' => $g, 'brand' => $brand, 'model' => $model,
                        'capacity_kva' => $kva, 'liters_per_hour' => $lph, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
                }
                foreach (['سولار صناعي', 'سولار إسرائيلي'] as $fuel) {
                    DB::table('generation_fuel_types')->insertOrIgnore(['branch_id' => $branch->id, 'name' => $fuel, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
                }
                foreach (['المخيم القديم', 'المخيم الجديد', 'الرازي', 'الأبراج', 'شوافع القديم', 'شوافع الجديد'] as $dz) {
                    DB::table('distribution_zones')->insertOrIgnore(['branch_id' => $branch->id, 'name' => $dz, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
                }

                $manager = $this->person($this->name(), "{$slug}.manager", $role(Role::BRANCH_MANAGER), $branch->id, 'مدير الفرع', 2000, $deps['الإدارة']);
                $branch->update(['manager_user_id' => $manager->id]);
                $people = [
                    $this->person($this->name(), "{$slug}.c1", $role(Role::EMPLOYEE), $branch->id, 'محصّل', 1300, $deps['المحصّلون']),
                    $this->person($this->name(), "{$slug}.c2", $role(Role::EMPLOYEE), $branch->id, 'محصّل', 1250, $deps['المحصّلون']),
                    $t1 = $this->person($this->name(), "{$slug}.t1", $role(Role::EMPLOYEE), $branch->id, 'فني كهرباء', 1600, $deps['الفنيون']),
                    $t2 = $this->person($this->name(), "{$slug}.t2", $role(Role::EMPLOYEE), $branch->id, 'فني كهرباء', 1500, $deps['الفنيون']),
                    $t3 = $this->person($this->name(), "{$slug}.t3", $role(Role::EMPLOYEE), $branch->id, 'فني (يومية)', 60, $deps['الفنيون'], 'daily'),
                    $this->person($this->name(), "{$slug}.trainee", $role(Role::EMPLOYEE), $branch->id, 'متدرب', 600, $deps['المحصّلون'], 'monthly', 'trainee'),
                ];
                $t3->employee->update(['punch_anywhere' => true]);

                // Two months of attendance: mostly on time, some late, a few absent, some overtime.
                foreach ([$manager, ...$people] as $u) {
                    for ($d = $prevMonth; $d->lt($today); $d = $d->addDay()) {
                        $r = mt_rand(1, 100);
                        if ($r <= 6) {
                            continue; // absent
                        }
                        $late = $r <= 22 ? mt_rand(12, 55) : mt_rand(0, 8);
                        $extra = mt_rand(1, 100) <= 12 ? mt_rand(30, 120) : mt_rand(-5, 10);
                        $in = $d->setTime(7, 30)->addMinutes($late);
                        $out = $d->setTime(15, 30)->addMinutes($extra);
                        $day = new AttendanceDay([
                            'user_id' => $u->id, 'branch_id' => $branch->id, 'date' => $d->toDateString(),
                            'check_in' => $in->utc(), 'check_out' => $out->utc(),
                            'approval_status' => $d->lt($today->subDays(3)) ? 'approved' : 'pending',
                        ]);
                        $attendance->recompute($day, $u);
                        $day->save();
                    }
                }
                // Today: some have come in already.
                foreach (array_slice($people, 0, 4) as $i => $u) {
                    $in = $today->setTime(7, 30)->addMinutes([2, 0, 25, 6][$i]);
                    $day = new AttendanceDay(['user_id' => $u->id, 'branch_id' => $branch->id, 'date' => $today->toDateString(), 'check_in' => $in->utc()]);
                    $attendance->recompute($day, $u);
                    $day->save();
                }

                // Field tasks of today, in every state.
                $mk = function (string $type, array $who, string $status, int $startedAgo, int $expected, string $priority, ?string $sub, string $details) use ($branch, $manager, $types, $zones, $tasks, $today) {
                    $now = CarbonImmutable::now();
                    $t = Task::create([
                        'branch_id' => $branch->id, 'number' => $tasks->nextNumber($branch->id), 'task_type_id' => $types[$type] ?? $types->first(),
                        'created_by' => $manager->id, 'details' => $details, 'subscriber_name' => $sub, 'subscriber_phone' => null,
                        'zone_id' => $zones->random(), 'priority' => $priority, 'expected_minutes' => $expected, 'status' => $status,
                        'sent_at' => $status !== 'new' ? $now->subMinutes($startedAgo + 20) : null,
                        'seen_at' => in_array($status, ['seen', 'in_progress', 'done'], true) ? $now->subMinutes($startedAgo + 10) : null,
                        'started_at' => in_array($status, ['in_progress', 'done'], true) ? $now->subMinutes($startedAgo) : null,
                        'completed_at' => $status === 'done' ? $now->subMinutes(max(0, $startedAgo - $expected + 10)) : null,
                        'completion_notes' => $status === 'done' ? 'أُنجز العمل وفُحص الخط' : null,
                    ]);
                    $t->assignees()->sync(array_map(fn ($u) => $u->id, $who));
                    $tasks->log($t, 'created', $manager, CarbonImmutable::instance($t->created_at), false);
                    foreach (['sent_at' => 'sent_app', 'seen_at' => 'seen', 'started_at' => 'started', 'completed_at' => 'completed'] as $col => $ev) {
                        if ($t->{$col}) {
                            $tasks->log($t, $ev, $ev === 'sent_app' ? $manager : $who[0], CarbonImmutable::instance($t->{$col}), false);
                        }
                    }
                };
                $mk('تبديل ساعة', [$t1], 'done', 90, 45, 'urgent', 'أبو محمد '.self::LAST[mt_rand(0, 17)], 'الساعة متوقفة منذ الصباح');
                $mk('فحص ساعة', [$t2], 'in_progress', 25, 45, 'normal', 'أم خالد '.self::LAST[mt_rand(0, 17)], 'قراءة مرتفعة على غير العادة');
                $mk('شد وتوصيل كوابل', [$t1, $t3], 'in_progress', 150, 120, 'emergency', null, 'كابل مقطوع بعد الرياح');
                $mk('تركيب اشتراك', [$t2], 'sent', 0, 60, 'normal', 'مشترك جديد', 'تركيب اشتراك 5 أمبير');
                $mk('تفتيش', [$t3], 'seen', 0, 30, 'normal', null, 'تفتيش على الطبلون الرئيسي');
                $mk('تعديل أحمال', [], 'new', 0, 60, 'normal', 'شكوى جار', 'تحضير: اتصل المشترك، يُسند لاحقاً');

                $allPeople[$slug] = ['branch' => $branch, 'manager' => $manager, 'people' => $people];
            }
            $this->line('✓ الفروع التسعة: المدراء والموظفون والحضور والمهام');

            // Payroll: a few manual items and advances, last month's first half paid, second half waiting.
            $camp = $allPeople['camp2'];
            PayrollAdjustment::create(['user_id' => $camp['people'][2]->id, 'branch_id' => $camp['branch']->id, 'type' => 'bonus', 'month' => $prevMonth->format('Y-m'), 'amount' => 150, 'reason' => 'مكافأة إنجاز المهام', 'created_by' => $hr->id]);
            PayrollAdjustment::create(['user_id' => $camp['people'][0]->id, 'branch_id' => $camp['branch']->id, 'type' => 'deduction', 'month' => $prevMonth->format('Y-m'), 'amount' => 50, 'reason' => 'نقص في التحصيل', 'created_by' => $hr->id]);
            Advance::create(['user_id' => $camp['people'][1]->id, 'branch_id' => $camp['branch']->id, 'amount' => 600, 'installment' => 200, 'start_month' => $prevMonth->format('Y-m'), 'reason' => 'ظرف طارئ', 'created_by' => $hr->id]);
            Advance::create(['user_id' => $allPeople['gaza']['people'][3]->id, 'branch_id' => $allPeople['gaza']['branch']->id, 'amount' => 400, 'installment' => 100, 'start_month' => $prevMonth->format('Y-m'), 'created_by' => $hr->id]);
            foreach (['camp2', 'gaza', 'nuseirat'] as $slug) {
                $b = $allPeople[$slug]['branch'];
                $first = $payroll->calculate(PayrollBatch::create(['branch_id' => $b->id, 'month' => $prevMonth->format('Y-m'), 'percent' => 50, 'is_final' => false, 'status' => 'draft', 'title' => "رواتب {$monthName} · الدفعة 1", 'created_by' => $hr->id]));
                $first->forceFill(['status' => 'paid', 'approved_by' => $mgmt->id, 'approved_at' => now(), 'paid_by' => $hr->id, 'paid_at' => now()])->save();
                $payroll->calculate(PayrollBatch::create(['branch_id' => $b->id, 'month' => $prevMonth->format('Y-m'), 'percent' => 50, 'is_final' => true, 'status' => 'draft', 'title' => "رواتب {$monthName} · الدفعة 2", 'created_by' => $hr->id]));
            }
            $this->line('✓ الرواتب: قواعد، وخصومات، ومكافآت، وسلف، ودفعات (مصروفة ومسودة)');

            // Messages: requests to HR, one raised to management, and a notice to a whole branch.
            $send = function (User $from, array $to, string $subject, string $body, string $kind = 'message', ?array $meta = null, ?Message $forward = null, ?string $group = null) {
                $m = Message::create(['sender_id' => $from->id, 'subject' => $subject, 'body' => $body, 'kind' => $kind, 'meta' => $meta, 'forwarded_from_id' => $forward?->id, 'groups_label' => $group]);
                foreach ($to as $u) {
                    MessageRecipient::create(['message_id' => $m->id, 'user_id' => $u->id]);
                }

                return $m;
            };
            $leave = $send($camp['people'][0], [$hr], 'طلب إجازة', 'ظرف عائلي، أرجو الموافقة.', 'leave_request', ['from' => $today->addDays(3)->toDateString(), 'to' => $today->addDays(5)->toDateString()]);
            $send($allPeople['gaza']['people'][2], [$hr, $allPeople['gaza']['manager']], 'طلب إذن', 'موعد عند الطبيب.', 'permission_request', ['date' => $today->addDay()->toDateString(), 'from_time' => '10:00', 'to_time' => '12:00']);
            $send($hr, [$mgmt], 'رفع: طلب إجازة', 'للاطلاع والموافقة.', 'message', null, $leave);
            $send($camp['manager'], [$hr], 'نقص في الفنيين', 'نحتاج فنياً إضافياً في الفترة المسائية بسبب كثرة الأعطال.');
            $send($hr, [...$camp['people'], $camp['manager']], 'تنبيه بخصوص الحضور', 'نرجو الالتزام بمواعيد الدوام، وتسجيل الحضور من الزر أو ورقة الـQR.', 'message', null, null, 'فرع مخيم 2');
            $this->line('✓ المراسلات');

            // A sample of the movements log, as if made over the last days.
            $log = function (User $by, string $action, $subject, ?array $new, int $hoursAgo, ?string $reason = null) {
                AuditLog::forceCreate([
                    'user_id' => $by->id, 'branch_id' => $subject?->getAttribute('branch_id') ?? ($subject instanceof Branch ? $subject->id : null),
                    'action' => $action, 'subject_type' => $subject ? class_basename($subject) : null, 'subject_id' => $subject?->getKey(),
                    'new_values' => $new, 'reason' => $reason, 'ip' => '127.0.0.1', 'created_at' => now()->subHours($hoursAgo),
                ]);
            };
            $h = 200;
            foreach ($allPeople as $slug => $row) {
                $log($mgmt, 'branch.created', $row['branch'], ['name' => $row['branch']->name], $h--);
                $log($hr, 'user.created', $row['manager'], ['name' => $row['manager']->name], $h--);
                foreach ($row['people'] as $u) {
                    $log($row['manager'], 'user.created', $u, ['name' => $u->name], $h--);
                }
                $log($row['manager'], 'attendance.point_created', AttendancePoint::where('branch_id', $row['branch']->id)->first(), ['name' => 'ورقة المكتب'], $h--);
            }
            $log($hr, 'payroll.settings', null, null, 60);
            $log($hr, 'payroll.adjustment_added', $camp['people'][2], ['amount' => 150], 50, 'مكافأة إنجاز المهام');
            $log($hr, 'payroll.advance_added', $camp['people'][1], ['amount' => 600], 49, 'ظرف طارئ');
            foreach (PayrollBatch::with('branch')->get() as $b) {
                $log($hr, 'payroll.batch_created', $b, ['title' => $b->title], 40);
                if ($b->status === 'paid') {
                    $log($mgmt, 'payroll.batch_approved', $b, null, 30);
                    $log($hr, 'payroll.batch_paid', $b, null, 20);
                }
            }
            $log($camp['manager'], 'attendance.edited', $camp['people'][3], null, 6, 'نسي تسجيل الخروج');
            $log($camp['manager'], 'attendance.approved', null, ['count' => 7], 5);
            $log($hr, 'employee.status', $camp['people'][5], ['status' => 'trainee'], 4);
            $this->line('✓ سجل الحركات');
        });

        $this->newLine();
        $this->info('تمت إضافة البيانات التجريبية. كلمة السر لجميع الحسابات التجريبية: '.self::PASSWORD);
        $this->table(['الدور', 'اسم المستخدم'], [
            ...($allRoles ? [['مدير النظام', 'admin.demo']] : []),
            ['المالية', 'finance.demo'],
            ['شؤون الموظفين', 'hr.demo'], ['الإدارة', 'mgmt.demo'], ['مدير فرع مخيم 2', 'camp2.manager'],
            ['محصّل (مخيم 2)', 'camp2.c1'], ['فني (مخيم 2)', 'camp2.t1'], ['مدير فرع غزة', 'gaza.manager'],
            ['باقي الفروع', 'nuseirat / newcamp / sawarha / zawayda / maghazi / deir / bureij + .manager .c1 .c2 .t1 .t2 .t3 .trainee'],
        ]);

        return self::SUCCESS;
    }

    private function name(): string
    {
        return self::FIRST[mt_rand(0, count(self::FIRST) - 1)].' '.self::FIRST[mt_rand(0, count(self::FIRST) - 1)].' '.self::LAST[mt_rand(0, count(self::LAST) - 1)];
    }

    private function person(string $name, string $username, int $roleId, ?int $branchId, string $title, float $salary, int $dep, string $type = 'monthly', string $status = 'active'): User
    {
        $user = User::firstOrCreate(['username' => $username], [
            'name' => $name, 'password' => self::PASSWORD, 'role_id' => $roleId, 'branch_id' => $branchId,
            'is_active' => true, 'must_change_password' => false,
        ]);
        $user->employee->update([
            'job_title' => $title, 'department_id' => $dep, 'salary_type' => $type, 'salary_amount' => $salary, 'daily_hours' => 8,
            'hire_date' => CarbonImmutable::now()->startOfYear()->toDateString(), 'status' => $status, 'gender' => 'male',
            'education_level' => 'secondary', 'payment_method' => 'wallet', 'provider' => 'PalPay',
            'account_number' => 'DEMO-'.str_pad((string) $user->id, 5, '0', STR_PAD_LEFT),
            'account_holder_name' => $name,
            // Clearly fake identity numbers (start with 0000) and the branch area as the address.
            'national_id' => '0000'.str_pad((string) $user->id, 5, '0', STR_PAD_LEFT),
            'account_holder_national_id' => '0000'.str_pad((string) $user->id, 5, '0', STR_PAD_LEFT),
            'address' => $branchId ? Branch::find($branchId)?->name : 'دير البلح',
            'specialty' => str_contains($title, 'فني') ? 'كهرباء' : 'إدارة أعمال',
        ]);

        return $user;
    }
}
