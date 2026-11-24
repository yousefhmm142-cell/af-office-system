# مخطط قاعدة البيانات (مسودة 2) — النظام الجديد

> مسودة للمراجعة. ما في كود. MySQL / MariaDB، Laravel.
> النظام القديم (مخيم 2) مرجع فقط، ما بنلمسه. هون بدء نظيف وفاضي.
> المرحلة 3 مبنية على قراءة `mukhayyam-2/supabase/setup.sql` (الشكل النهائي بعد 53 تحديث) من فرع `claude/youthful-bell-qnhys0`.

## 1. قرارات اتأكدت من يوسف (24 تشرين الثاني)
| الموضوع | القرار |
|---|---|
| المنطق | نسخة جديدة كاملة بـLaravel، مش مبنية على Supabase. |
| البيانات | نبدأ نظيف. بعد ما النظام يكمل، بنحط داتا مخيم 2. |
| أقسام القديم | **كلها بتدخل بالتفصيل، بدون تخمين.** |
| الجمعة | يوم دوام عادي. |
| الحضور | زر من جوا النظام (**من أي مكان**) + QR. لكل فرع QR خاص. |
| قواعد الحضور القديمة | بتضل: مسحتين باليوم كحد أقصى، والانصراف بعد 60 دقيقة من الحضور، ومسحتين خلال دقيقتين = تكرار. |
| شبكة المكتب | للـQR بس، ومدير الفرع هو الوحيد اللي بيعتمدها لفرعه. |
| الأقسام | كل الفروع الـ9 عندها توليد وتوزيع وأختام وقراءات. الإدارة والسوبر أدمن بيفتحوا ويسكّروا الأقسام والصلاحيات لكل فرع/شخص. |
| الحساب | كل موظف إله حساب، حتى لو ما معه جوال أو لاب. |
| الدخول | **اسم مستخدم + رمز.** وأي موظف بيغيّر رمزه من بياناته. |
| المحفظة/البنك | رقم الحساب + اسم صاحبه + هويته + جواله، كلهم. |
| الاستضافة | مشتركة غالباً. نفترض: ما في Reverb، تحديث كل كم ثانية. نكتب Laravel عادي بيشتغل على أي استضافة PHP. |

## 2. قواعد عامة لكل الجداول
- **`id` رقمي + `uuid`** (يتولد من الجهاز). السجل اللي بينعمل بدون نت إله رقم قبل ما يوصل السيرفر، فما في «أرقام مؤقتة tmp-» زي القديم.
- **`branch_id`** بكل جدول بيانات فرع. أي استعلام بينحصر بالفرع تلقائياً، والأعلى بيشوف الكل.
- **`created_at`, `updated_at`, `deleted_at`** (حذف ناعم). `updated_at` أساس المزامنة.
- **كل وقت من السيرفر** (توقيت `Asia/Gaza`). العملية اللي انعملت بدون نت بتنحفظ معها `device_time` و`recorded_offline` (زي القديم).
- **عملية بدون نت ما بتتكرر:** كل عملية من الجهاز إلها `operation_id`، والسيرفر بيحفظ إيصال، فلو انبعتت مرتين بتنحسب مرة.
- **سجل تدقيق `audit_logs`** لأي تعديل حساس: الجدول، السجل، مين، متى، القديم، الجديد، السبب.
- **MySQL ما فيه arrays** زي Postgres. اللي كان array بالقديم بيصير جدول ربط (مثلاً فنيين المهمة) أو JSON (مثلاً الأحمال حسب الساعة).

## 3. المرحلة 1: الأساس

### `branches` (الفروع)
`name`, `code`, `manager_user_id`, `is_active`.

### `branch_modules` (الأقسام المفتوحة لكل فرع)
`branch_id`, `module` (generation, distribution, tasks, seals, readings, attendance, sms...)، `is_enabled`.

### `work_schedules` (الدوامات، لكل فرع أكثر من دوام)
`branch_id`, `name` (عادي، بطالة...)، `start_time`, `end_time`, `grace_minutes` (10)، `absent_after` (10:00)، `overtime_min_minutes` (15)، `overtime_round_minutes` (15)، `work_days` (JSON، **الافتراضي كل الأسبوع مع الجمعة**).
> القديم كان فيه دوام عادي ودوام «بطالة» (8 لـ2). كل موظف بيتربط بدوام.

### `holidays` (العطل الرسمية)
`date`, `name`, `branch_id` (فاضي = لكل الشركة).

### `departments` (محصّلين، فنيين...)
`name`. عامة للشركة، بيديرها السوبر أدمن.

### `users` (الدخول)
`username` (فريد)، `password` (مشفّر)، `role_id`، `branch_id` (فاضي للإدارة/السوبر أدمن/HR)، `is_active`، `must_change_password`، `last_login_at`، `failed_logins`, `locked_until`.

### الصلاحيات (مش ثابتة بالكود)
- `roles`: super_admin, management, hr, branch_manager, employee (+ finance للتأكيد).
- `permissions`: مفاتيح لكل صفحة وعملية، مثل `attendance.view`, `attendance.edit`, `payroll.approve`, `seals.manage`, `seal_work.view`, `readings.admin`, `readings.enter`, `generation.fill`, `distribution.fill`, `sheets.approve`, `tasks.manage`, `sms.send`, `evaluations.create`...
- `role_permissions`: `role_id`, `permission_id`, **`scope`** = `own` | `branch` | `all`.
- `user_permissions`: استثناء لشخص معيّن (سماح أو منع) بنفس الـscope.
> هاي بتحل محل `pages`، `can_seals`، `has_page()`، `is_manager()` بالقديم. السوبر أدمن بيوزّع من شاشة، ومدير الفرع بيضل محصور بفرعه.

## 4. المرحلة 2: شؤون الموظفين

### `employees` (ملف الموظف) — مرتبط بـ`users` واحد لواحد
**شخصي (الموظف بيعدّله):** `full_name` (رباعي)، `national_id` (فريد)، `phone`، `wa_code` (970 أو 972، للواتساب)، `address`، `education_level`، `specialty`، `gender`.
**وظيفي (HR بس):** `branch_id`، `department_id`، `job_title`، `work_schedule_id`، `tracks_attendance`، `punch_anywhere` (QR بدون قيد شبكة)، `salary_type` (monthly/weekly/daily/contract)، `salary_amount`، `daily_hours`، `hire_date`، `status` (active/trainee/suspended/terminated)، `termination_reason`.
**المحفظة/البنك:** `payment_method` (wallet/bank)، `provider` (PalPay، اسم البنك...)، `account_number`، `account_holder_name`، `account_holder_national_id`، `account_holder_phone`.
**الأختام:** `seals_sheet` (اسم ورقة الفني بملف الأختام، للاستيراد والتصدير).

### `employee_attachments`
`employee_id`, `type` (id_photo, specialty_cert, experience_cert)، `file_path`.

### `employee_status_log`
`employee_id`, `from_status`, `to_status`, `reason`, `changed_by`, `changed_at`.

### الحضور
- `attendance_points` (QR لكل فرع): `branch_id`, `name`, `code` (فريد)، `is_active`, `revoked_at`، `network_required`، `free_punch`، `allowed_ips` (JSON، حد أقصى 5، **يعتمدها مدير الفرع بس**)، `lat`, `lng`, `radius_m` (100، من 20 لـ1000، اختياري).
- `attendance_punches` (كل مسحة أو ضغطة): `employee_id`, `branch_id`, `kind` (in/out)، `at`، `method` (qr/app/manual)، `point_id`، `recorded_by`, `reason` (اختياري)، `ip`, `lat`, `lng`، `device_time`, `recorded_offline`.
- `attendance_days` (ملخص اليوم، يتحسب من المسحات): `employee_id`, `branch_id`, `date`, `check_in`, `check_out`, `worked_minutes`, `late_minutes`, `overtime_minutes`, `is_absent`, `approval_status` (pending/approved)، `approved_by`. فريد على (`employee_id`, `date`).
- `attendance_edits`: كل تعديل يدوي: القديم والجديد والسبب ومين عدّل.
> الـQR بيسجّل للشخص الداخل على حسابه بجواله. اللي ما معه جهاز: مدير الفرع بيسجّله يدوي (`method=manual`)، السبب مش إجباري، وبينحفظ مين سجّل.

### الإعدادات (يحددها السوبر أدمن/HR، مش قوانين بالكود)
- `payroll_settings`: بنسخ حسب التاريخ. `scope` (global/branch)، `branch_id`، `effective_from`، `auto_deduction_enabled`، `late_deduction_type/value`، `absence_deduction`، `overtime_enabled`، `overtime_rate_type/value`، `overtime_monthly_cap`.
  > التغيير بيسري من `effective_from` وما بيمسّ الرواتب المعتمدة قبله.
- `leave_types`: `name`, `yearly_balance`, `is_paid`. (القديم: سنوية، مرضية، طارئة، أخرى).
- `leave_balances`: `employee_id`, `leave_type_id`, `year`, `balance`.
- `leaves`: `employee_id`, `leave_type_id`, `from_date`, `to_date`, `notes`, `status`, `approved_by`, `message_id` (لو إجت من المراسلات).

### الرواتب
- `payroll_batches`: `branch_id` (أو فاضي للشركة)، `month`، `percent` (مثلاً 50)، `status` (draft/reviewed/approved)، `created_by`, `approved_by`.
- `payroll_items`: سطر لكل موظف: `base_amount`، `auto_deductions`، `manual_deductions`، `advance_deduction`، `bonuses`، `net`، **ولقطة من بيانات المحفظة وقت الإنشاء** (لو تغيّرت بعدين، الكشف القديم ما يتغير).
- `manual_deductions`: `employee_id`, `amount`, `reason`, `date`, `batch_id`.
- `advances` + `advance_installments`: سلفة بتنخصم من دفعة أو أكثر.
- `bonuses`: `employee_id`, `amount`, `reason`, `batch_id`.
- كشف الصرف (Excel/PDF) بيتولد من `payroll_items`.

### المراسلات
- `messages`: `sender_id`, `subject`, `body`, `thread_id`, `parent_id`, `forwarded_from_id`.
- `message_recipients`: `message_id`, `user_id`, `read_at`, `folder`, `deleted_at`.
- `message_attachments`.
- قيود «مين بيراسل مين» حسب الدور، وإرسال لمجموعة (فرع/قسم) بيتحوّل لأفراد وقت الإرسال.

### التقييمات (مؤقتة لحد ما يتحدد الشكل)
`evaluations`: `employee_id`, `evaluator_id`, `period`, `data` (JSON)، `notes`.

## 5. المرحلة 3: أقسام النظام القديم (كلها، مع `branch_id`)

### 5.1 إعدادات التشغيل لكل فرع — `branch_settings`
(كانت `app_settings` بالقديم، صف واحد للمكتب. هلأ صف لكل فرع.)
- **المحروقات:** `fuel_days_warn` (2)، `fuel_days_danger` (1)، `consumption_warn_pct` (20)، `consumption_danger_pct` (40)، `expected_warn_pct` (15)، `expected_danger_pct` (30).
- **المولد:** `temp_warn_c` (95)، `temp_danger_c` (100)، `oil_warn_bar` (2.0)، `oil_danger_bar` (1.5)، `load_warn_pct` (80)، `load_danger_pct` (90)، `imbalance_warn_pct` (20)، `imbalance_danger_pct` (35)، `phase_voltage` (230).
- **الصيانة:** `oil_change_warn_hours` (230)، `oil_change_due_hours` (250)، `maintenance_plan` (JSON: فلتر زيت 250 ساعة، فلتر سولار 500، فلتر هوا 500، تبريد 30 يوم، بطارية 60، سير 90).
- **التأخير:** `report_late_warn` (10:00)، `report_late_danger` (12:00).
- **تنبيهات SMS من السيرفر:** `alert_sms` (مطفي)، `alert_phones` (JSON).
- **التواقيع:** اسم «اعتماد مدير المكتب» الثابت (بالقديم كان مكتوب بالكود)، ومدير الموقع.

### 5.2 التوليد
- `generators`: `branch_id`, `name`, `brand`, `model`, `capacity_kva`, `liters_per_hour`, `is_active`, `sort_order`.
- `fuel_types`: `branch_id`, `name`, `is_active`, `sort_order`.
- `site_reports` (تقرير اليوم): `branch_id`, `report_date`، `status` (draft/submitted/returned/approved)، `general_notes`، `created_by`, `submitted_by`, `submitted_at`, `approved_by`, `approved_at`, `returned_reason`, `device_time`, `recorded_offline`. فريد على (`branch_id`, `report_date`).
- `site_report_fuel`: `report_id`, `fuel_type_id`، `opening_balance`, `received_qty`, `total_qty`, `closing_balance`, `consumption`، `shipment_no`, `supplier`, `unit_price`, `notes`.
- `generator_day_logs`: `report_id`, `generator_id`، `did_run`، `run_hours`، `load_unit` (A/kW)، `load_l1/l2/l3` (للأيام القديمة)، `band_loads` (JSON، 7 خانات)، `temperature_c`، `oil_pressure`, `oil_pressure_unit` (bar/psi)، `notes`.
- `generator_runs`: `log_id`, `run_no` (1 لـ6)، `start_time`, `end_time`.
- `maintenance_logs`: `report_id`, `line_no`, `generator_id`، `oil_new_liters`, `oil_used_liters`، `maintenance_types` (JSON: oil_change, oil_filter, fuel_filter, air_filter, cooling, battery, belt, electrical, other)، `description`.

### 5.3 التوزيع
- `zones` (المناطق): `branch_id`, `name`, `is_active`, `sort_order`.
- `distribution_sheets`: نفس شكل `site_reports` (حالة، إرسال، اعتماد، إرجاع). فريد على (`branch_id`, `sheet_date`).
- `zone_day_entries`: `sheet_id`, `zone_id`، `supplied`، `supply_hours`، `band_loads` (JSON: 6 ساعات × 3 قراءات).
- `zone_runs`: `entry_id`, `run_no` (1 لـ6)، `start_time`, `end_time`, `load_unit`, `load_l1/l2/l3`, `load_extra` (JSON).
- `generator_load_entries` (أحمال المولدات، **بتتعبّى من التوزيع**): `branch_id`, `load_date`, `generator_id`, `report_id`, `load_unit`, `band_loads` (JSON، 7 خانات مع 12–3 الفجر)، `updated_by`. فريد على (`branch_id`, `load_date`, `generator_id`).
> الساعات: 7–9، 9–12، 12–3، 3–6، 6–9، 9–12 ليلاً، والسابعة للمولدات 12–3 الفجر.

### 5.4 المهام الميدانية
- `task_types`: `branch_id` (أو عام)، `name`, `is_active`, `sort_order`.
- `tasks`: `branch_id`، `number` (كل فرع بيبدأ من 1، فريد على `branch_id`+`number`)، `task_type_id`، `created_by`، `details`، `subscriber_name`, `subscriber_phone`، `zone_id`, `location_text`، `priority` (normal/urgent/emergency)، `expected_minutes` (5 لـ1440)، `status` (new/sent/seen/in_progress/done/cancelled)، `sent_at`, `seen_at`, `started_at`, `completed_at`, `cancelled_at`، `completion_notes`, `completed_work`, `cancel_reason`, `photo_path`، `link_token` (رابط خاص للفني)، `device_time`, `recorded_offline`.
- `task_assignees` (بدل `assignee_ids`): `task_id`, `employee_id`, `is_primary`. حد أقصى 20 فني (مهمة مشتركة).
- `task_events`: `task_id`, `event` (created, sent_sms, sent_whatsapp, seen, started, completed, cancelled, reassigned)، `actor_id`, `at`, `recorded_offline`, `meta`.
- `task_completion_receipts`: إيصالات منع التكرار.
- **قواعد بتنتقل للكود:** خطوات الحالة المسموحة (الفني: شاف ← بلّش ← خلّص، المكتب: أرسل/ألغى/أنهى عن فني بلا جوال)، ما بيتغير الفني بعد ما يبلّش، المهمة المشتركة بيسكّرها المكتب، الإنهاء مع الأختام بعملية وحدة (يا كلها يا ولا اشي)، البحث بالحروف العربية الموحّدة، كشف اليوم.

### 5.5 الأختام
- `seal_rolls` (الرول): `branch_id`, `from_no`, `to_no` (أقل من 1000 ختم)، `received_on`, `note`، `header_text`, `sheet_label`, `sheet_pos`, `sheet_col`, `sheet_width`, `sheet_tab` (لترتيب ملف الإكسل زي ملف المحاسبة)، `created_by`.
- `seal_batches` (الدفعة): `roll_id`, `batch_no`، `technician_id` (فاضي = «بدون اسم»)، `issued_on`, `note`، `original_seals` (JSON)، `block_from`, `block_ord`, `label`, `usage_ord`, `usage_fill`.
- `seals` (الختم): `branch_id`, `seal_no` (فريد داخل الفرع، كل فرع منفصل)، `roll_id`، `status` (in_stock/issued/used/damaged/lost)، `batch_id`, `batch_pos`، `technician_id`، `issued_on`, `used_on`، `details` (≤500)، `board_no`، `task_id`، `updated_by`.
- `seal_completion_receipts`: منع التكرار.
- **قواعد بتنتقل للكود:** الصرف، الإرجاع للمخزون، الإضافة لدفعة، تسجيل الاستخدام، ربط الختم بالمهمة (يدوي، وتلقائي لما اليوم والفني والمشترك والعمل يتطابقوا بالزبط)، كشف أعمال الأختام، الأختام غير المسجّلة، الاستيراد والتصدير من ملفات المحاسبة.

### 5.6 القراءات الأسبوعية
- `subscribers`: `branch_id`, `full_name`, `area`, `board`, `phone`.
- `reading_batches` (الأسبوع): `branch_id`, `title`, `period_from`, `period_to`، `status` (open/approved)، `archived_at`, `archived_digest`، `created_by`.
- `reading_files` (ملفات الأسبوع، ~36): `batch_id`, `file_name`، **الملف نفسه بيتخزن كملف على السيرفر** (بالقديم كان نص base64 بالقاعدة)، `current_col` (4)، `rows_count`, `archived_at`, `archived_digest`.
- `reading_rows`: `batch_id`, `file_id`, `sheet`, `ord`, `sheet_row`، `code`, `area`, `board`, `fak`, `subscriber`, `phone`، `prev`، `mode` (app/paper)، `assignee_id`، `reading` (ما بتقل عن السابقة)، `state` (disconnected/no_meter/other/unknown)، `note`, `source`, `entered_by`, `entered_at`.
- `reading_changes`: سجل كل تعديل قراءة.

### 5.7 الرسائل SMS
- `sms_config` (**اشتراك واحد لكل الشركة**): اسم المستخدم وكلمة السر **مشفّرين**، واسم المرسل. ما بيرجعوا للواجهة أبداً.
- `outgoing_messages`: `branch_id`, `task_id`، `channel` (sms/whatsapp)، `to_phone`, `body`، `status` (opened/pending/sent/failed)، `provider`, `provider_ref`, `error`, `created_by`, `sent_at`.
- `alerts_sent`: كل تنبيه بينبعت مرة (`kind`, `ref`).
- **تنبيهات السيرفر كل 30 دقيقة** (Laravel Scheduler): تقرير ما انبعت بالوقت، مهمة تأخرت، سولار رح يخلص، نسخة احتياطية ما انعملت.

### 5.8 الإشعارات والحركات والنسخ والأعطال
- `audit_logs`: بيغطي «آخر الحركات» و«سجل الأختام».
- `client_issues`: أخطاء الواجهة اللي بتوصل من الأجهزة (`employee_id`, `kind`, `code`, `route`, `location`, `build`).
- النسخ الاحتياطي: **ملف على السيرفر** بأمر Laravel مجدول، مش جدول بالقاعدة زي القديم.
- محاولات الدخول: من Laravel نفسه (حد للمحاولات)، مش جدول خاص.

### 5.9 اللي ما رح ينتقل
- **المخزن** (`stock_items`, `stock_moves`): انشال بطلبك بالقديم.
- `attendance_codes` و`attendance_devices` (رمز 4 أرقام لكل جوال): بالجديد كل واحد إله يوزر، فالـQR بيسجّل للشخص الداخل على حسابه.

## 6. المزامنة بدون نت
- الجهاز بيحفظ محلياً (IndexedDB) ويحط العمليات بطابور، وبيرسلها لما يرجع النت.
- كل سجل جديد إله `uuid` من الجهاز، وكل عملية إلها `operation_id` حتى ما تتكرر.
- السيرفر بيتحقق من الصلاحية والفرع بكل عملية، وبيرد بـ`updated_at`.
- السحب: «أعطيني كل اشي تغيّر بعد وقت كذا» لكل قسم.
- التحديث الحي: سحب كل كم ثانية (مش Reverb) بسبب الاستضافة المشتركة.
- الحضور والرواتب المعتمدة ما بتتعدل بالمزامنة، بس بعملية صريحة وبسجل.

## 7. قرارات إضافية (24 تشرين الثاني)
- الـQR بيسجّل للداخل على حسابه، والتسجيل اليدوي من مدير الفرع بدون سبب إجباري.
- كل فرع منفصل بيوزراته وصلاحياته وبياناته، وأرقام الأختام فريدة داخل الفرع.
- الدوامات زي ما هي بالمخطط.
- SMS: اشتراك واحد لكل الشركة.
- رقم المهمة: كل فرع بيبدأ من 1.

## 8. لسا مفتوح (ما بيوقّف البدء)
المالية (دور منفصل؟)، المهام الإدارية العامة، شكل التقييم.
