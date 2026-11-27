<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Advance;
use App\Models\PayrollAdjustment;
use App\Models\PayrollBatch;
use App\Models\PayrollItem;
use App\Models\PayrollSetting;
use App\Models\Role;
use App\Models\User;
use App\Services\PayrollService;
use App\Support\Access;
use App\Support\Audit;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PayrollController extends Controller
{
    public function __construct(private PayrollService $svc) {}

    // ---------------- Settings ----------------

    public function settings(Request $request): JsonResponse
    {
        $actor = $request->user();
        $all = Access::scope($actor, 'payroll.manage') === 'all';
        $rows = PayrollSetting::query()
            ->when(! $all, fn ($q) => $q->where(fn ($w) => $w->whereNull('branch_id')->orWhere('branch_id', $actor->branch_id)))
            ->orderByDesc('effective_from')->orderByDesc('id')->limit(100)->get();
        $month = CarbonImmutable::now($this->svc->tz())->format('Y-m');

        return response()->json([
            'settings' => $rows->map(fn ($s) => $this->presentSetting($s)),
            'current' => $this->presentSetting($this->svc->settingsFor($request->integer('branch_id') ?: null, $month)),
        ]);
    }

    public function storeSetting(Request $request): JsonResponse
    {
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')->whereNull('deleted_at')],
            'effective_from' => ['required', 'date_format:Y-m-d'],
            'late_mode' => ['required', Rule::in(PayrollSetting::MODES)],
            'late_value' => ['required', 'numeric', 'min:0', 'max:100000'],
            'absence_mode' => ['required', Rule::in(PayrollSetting::MODES)],
            'absence_value' => ['required', 'numeric', 'min:0', 'max:100000'],
            'overtime_mode' => ['required', Rule::in(PayrollSetting::MODES)],
            'overtime_value' => ['required', 'numeric', 'min:0', 'max:100000'],
            'overtime_cap_hours' => ['nullable', 'integer', 'min:0', 'max:744'],
        ]);
        $this->authorizeBranch($request, 'payroll.manage', $data['branch_id'] ?? null);
        // A change never reaches back into months already approved.
        $locked = PayrollBatch::whereIn('status', ['approved', 'paid'])->where('is_final', true)
            ->where('month', '>=', substr($data['effective_from'], 0, 7))
            ->when($data['branch_id'] ?? null, fn ($q, $b) => $q->where(fn ($w) => $w->whereNull('branch_id')->orWhere('branch_id', $b)))
            ->exists();
        if ($locked) {
            throw ValidationException::withMessages(['effective_from' => 'يوجد شهر معتمد بعد هذا التاريخ. اختر تاريخاً بعد آخر شهر معتمد.']);
        }
        $data['late_mode'] = $data['absence_mode'] = 'none';
        $data['late_value'] = $data['absence_value'] = 0;
        $setting = PayrollSetting::create($data + ['created_by' => $request->user()->id]);
        Audit::log('payroll.settings', $setting, null, $data, null, $setting->branch_id);

        return response()->json(['setting' => $this->presentSetting($setting)], 201);
    }

    // ---------------- Deductions and bonuses ----------------

    public function adjustments(Request $request): JsonResponse
    {
        $data = $request->validate(['month' => ['nullable', 'date_format:Y-m'], 'user_id' => ['nullable', 'integer']]);
        $q = Access::limit(PayrollAdjustment::query(), $request->user(), 'payroll.manage')
            ->with('user:id,name', 'batch:id,title,status')
            ->when($data['month'] ?? null, fn ($q, $m) => $q->where('month', $m))
            ->when($data['user_id'] ?? null, fn ($q, $u) => $q->where('user_id', $u))
            ->orderByDesc('id')->limit(500);

        return response()->json(['adjustments' => $q->get()->map(fn ($a) => $this->presentAdjustment($a))]);
    }

    public function storeAdjustment(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')->whereNull('deleted_at')],
            'type' => ['required', Rule::in(['deduction', 'bonus'])],
            'month' => ['required', 'date_format:Y-m'],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:1000000'],
            'reason' => ['required', 'string', 'min:2', 'max:300'],
        ]);
        $target = User::findOrFail($data['user_id']);
        $this->authorizeBranch($request, 'payroll.manage', $target->branch_id);
        if ($data['type'] === 'deduction') {
            abort_unless(Access::allowsBranch($request->user(), 'payroll.deductions', $target->branch_id), 403, 'قرار الخصم لمن يملك صلاحية خصومات الرواتب.');
        }
        $adj = PayrollAdjustment::create($data + ['branch_id' => $target->branch_id, 'created_by' => $request->user()->id]);
        Audit::log('payroll.adjustment_added', $target, null, ['type' => $adj->type, 'amount' => $adj->amount, 'month' => $adj->month], $adj->reason, $target->branch_id);

        return response()->json(['adjustment' => $this->presentAdjustment($adj->load('user:id,name'))], 201);
    }

    public function destroyAdjustment(Request $request, PayrollAdjustment $adjustment): JsonResponse
    {
        $this->authorizeBranch($request, 'payroll.manage', $adjustment->branch_id);
        if ($adjustment->batch && $adjustment->batch->status !== 'draft') {
            abort(422, 'هذا البند صُرف ضمن دفعة معتمدة ولا يمكن حذفه.');
        }
        $adjustment->delete();
        Audit::log('payroll.adjustment_deleted', $adjustment, ['type' => $adjustment->type, 'amount' => $adjustment->amount], null, null, $adjustment->branch_id);

        return response()->json(['ok' => true]);
    }

    // ---------------- Advances ----------------

    public function advances(Request $request): JsonResponse
    {
        $q = Access::limit(Advance::query(), $request->user(), 'payroll.manage')->with('user:id,name')->orderByDesc('id')->limit(500);

        return response()->json(['advances' => $q->get()->map(fn ($a) => $this->presentAdvance($a))]);
    }

    public function storeAdvance(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')->whereNull('deleted_at')],
            'amount' => ['required', 'numeric', 'min:1', 'max:1000000'],
            'installment' => ['required', 'numeric', 'min:1', 'lte:amount'],
            'start_month' => ['required', 'date_format:Y-m'],
            'reason' => ['nullable', 'string', 'max:300'],
        ]);
        $target = User::findOrFail($data['user_id']);
        $this->authorizeBranch($request, 'payroll.manage', $target->branch_id);
        $adv = Advance::create($data + ['branch_id' => $target->branch_id, 'created_by' => $request->user()->id]);
        Audit::log('payroll.advance_added', $target, null, ['amount' => $adv->amount, 'installment' => $adv->installment], $adv->reason, $target->branch_id);

        return response()->json(['advance' => $this->presentAdvance($adv->load('user:id,name'))], 201);
    }

    public function destroyAdvance(Request $request, Advance $advance): JsonResponse
    {
        $this->authorizeBranch($request, 'payroll.manage', $advance->branch_id);
        $locked = $advance->payments()->whereHas('batch', fn ($q) => $q->where('status', '!=', 'draft'))->exists();
        if ($locked) {
            abort(422, 'بدأ تسديد هذه السلفة في دفعة معتمدة، فلا يمكن حذفها.');
        }
        $advance->delete();
        Audit::log('payroll.advance_deleted', $advance, ['amount' => $advance->amount], null, null, $advance->branch_id);

        return response()->json(['ok' => true]);
    }

    // ---------------- Batches ----------------

    public function batches(Request $request): JsonResponse
    {
        $q = Access::limit(PayrollBatch::query(), $request->user(), 'payroll.view')
            ->with('branch:id,name', 'creator:id,name', 'approver:id,name')
            ->when($request->query('month'), fn ($q, $m) => $q->where('month', $m))
            ->orderByDesc('month')->orderByDesc('id')->limit(200);

        return response()->json(['batches' => $q->get()->map(fn ($b) => $this->presentBatch($b))]);
    }

    /** How much of a month is already planned, so the screen can suggest the rest. */
    public function plan(Request $request): JsonResponse
    {
        $data = $request->validate(['month' => ['required', 'date_format:Y-m'], 'branch_id' => ['nullable', 'integer']]);
        $used = $this->usedPercent($data['month'], $data['branch_id'] ?? null);
        $draft = new PayrollBatch(['month' => $data['month'], 'branch_id' => $data['branch_id'] ?? null, 'percent' => 100]);

        $people = $this->svc->eligible($draft);
        $fixed = $people->filter(fn ($u) => in_array($u->employee->salary_type, ['monthly', 'contract'], true));

        return response()->json([
            'used' => $used, 'left' => max(0, 100 - $used), 'employees' => $people->count(),
            // For the summary: the full month of fixed salaries (a batch pays its share of this),
            // and how many are paid by attendance, which only the calculation can tell.
            'fixed_total' => round((float) $fixed->sum(fn ($u) => (float) $u->employee->salary_amount), 2),
            'by_attendance' => $people->count() - $fixed->count(),
        ]);
    }

    public function storeBatch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'month' => ['required', 'date_format:Y-m'],
            'advance_ids' => ['sometimes', 'array'],
            'advance_ids.*' => ['integer', 'distinct', Rule::exists('advances', 'id')],
            'percent' => ['required', 'numeric', 'min:1', 'max:100'],
            'branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')->whereNull('deleted_at')],
            'title' => ['nullable', 'string', 'max:120'],
        ]);
        $this->authorizeBranch($request, 'payroll.manage', $data['branch_id'] ?? null);
        $used = $this->usedPercent($data['month'], $data['branch_id'] ?? null);
        if ($used + $data['percent'] > 100.001) {
            throw ValidationException::withMessages(['percent' => 'مجموع دفعات هذا الشهر يتجاوز 100%. المتبقي: '.max(0, 100 - $used).'%.']);
        }
        $ids = $data['advance_ids'] ?? [];
        if ($ids) {
            abort_unless(Access::allowsBranch($request->user(), 'payroll.deductions', $data['branch_id'] ?? null), 403, 'اختيار أقساط السلف لمن يملك صلاحية خصومات الرواتب.');
            $valid = Advance::whereIn('id', $ids)->where('start_month', '<=', $data['month'])
                ->when($data['branch_id'] ?? null, fn ($q, $id) => $q->where('branch_id', $id))->count();
            abort_unless($valid === count($ids), 422, 'تأكد من شهر السلفة وفرع الموظف.');
        }
        $final = abs($used + $data['percent'] - 100) < 0.001;
        $n = PayrollBatch::where('month', $data['month'])->where('branch_id', $data['branch_id'] ?? null)->count() + 1;
        $batch = PayrollBatch::create([
            'month' => $data['month'], 'percent' => $data['percent'], 'branch_id' => $data['branch_id'] ?? null, 'is_final' => $final, 'status' => 'draft',
            'advance_ids' => $ids, 'title' => ($data['title'] ?? null) ?: 'رواتب '.$this->monthName($data['month'])." · الدفعة {$n}", 'created_by' => $request->user()->id,
        ]);
        $batch = $this->svc->calculate($batch);
        Audit::log('payroll.batch_created', $batch, null, ['month' => $batch->month, 'percent' => $batch->percent, 'total' => $batch->total_net], null, $batch->branch_id);

        return response()->json(['batch' => $this->presentBatch($batch->load('branch:id,name', 'creator:id,name'))], 201);
    }

    public function showBatch(Request $request, PayrollBatch $batch): JsonResponse
    {
        $this->authorizeBranch($request, 'payroll.view', $batch->branch_id, true);
        $items = $batch->items()->with('user:id,name')->get()->sortBy('user.name')->values();

        return response()->json([
            'batch' => $this->presentBatch($batch->load('branch:id,name', 'creator:id,name', 'approver:id,name')),
            'items' => $items->map(fn ($i) => $this->presentItem($i)),
            'can' => [
                'manage' => $this->allowed($request, 'payroll.manage', $batch->branch_id),
                'approve' => $this->allowed($request, 'payroll.approve', $batch->branch_id),
            ],
        ]);
    }

    public function recalculate(Request $request, PayrollBatch $batch): JsonResponse
    {
        $this->authorizeBranch($request, 'payroll.manage', $batch->branch_id);
        $this->svc->calculate($batch);

        return $this->showBatch($request, $batch->fresh());
    }

    public function approve(Request $request, PayrollBatch $batch): JsonResponse
    {
        $this->authorizeBranch($request, 'payroll.approve', $batch->branch_id);
        abort_unless($batch->status === 'draft', 422, 'الدفعة معتمدة من قبل.');
        DB::transaction(function () use ($batch, $request) {
            $batch = PayrollBatch::whereKey($batch->id)->lockForUpdate()->firstOrFail();
            abort_unless($batch->status === 'draft', 422, 'الدفعة معتمدة.');
            abort_if($batch->items()->where(function ($q) use ($batch) {
                $q->where('auto_deductions', '>', 0);
                if (! $batch->advance_ids) {
                    $q->orWhere('advance_deduction', '>', 0);
                }
            })->exists(), 422, 'الدفعة تحتوي على خصم تلقائي سابق. أعد حسابها ثم راجع الصافي للاعتماد.');
            $batch->forceFill(['status' => 'approved', 'approved_by' => $request->user()->id, 'approved_at' => now()])->save();
            Audit::log('payroll.batch_approved', $batch, ['status' => 'draft'], ['status' => 'approved', 'total' => $batch->total_net], null, $batch->branch_id);

        });

        return $this->showBatch($request, $batch->fresh());
    }

    public function markPaid(Request $request, PayrollBatch $batch): JsonResponse
    {
        $this->authorizeBranch($request, 'payroll.manage', $batch->branch_id);
        abort_unless($batch->status === 'approved', 422, 'يجب اعتماد الدفعة قبل تسجيل صرفها.');
        $batch->forceFill(['status' => 'paid', 'paid_by' => $request->user()->id, 'paid_at' => now()])->save();
        Audit::log('payroll.batch_paid', $batch, ['status' => 'approved'], ['status' => 'paid'], null, $batch->branch_id);

        return $this->showBatch($request, $batch);
    }

    public function destroyBatch(Request $request, PayrollBatch $batch): JsonResponse
    {
        $this->authorizeBranch($request, 'payroll.manage', $batch->branch_id);
        abort_unless($batch->status === 'draft', 422, 'لا يمكن حذف دفعة معتمدة.');
        DB::transaction(function () use ($batch) {
            PayrollAdjustment::where('batch_id', $batch->id)->update(['batch_id' => null]);
            $batch->delete();
        });
        Audit::log('payroll.batch_deleted', $batch, ['title' => $batch->title], null, null, $batch->branch_id);

        return response()->json(['ok' => true]);
    }

    /** The transfer sheet for Excel (CSV with Arabic-safe encoding). */
    public function export(Request $request, PayrollBatch $batch): StreamedResponse
    {
        $this->authorizeBranch($request, 'payroll.view', $batch->branch_id, true);
        $items = $batch->items()->with('user:id,name')->get()->sortBy('user.name');
        $name = "payroll-{$batch->month}-{$batch->id}.csv";

        return response()->streamDownload(function () use ($items) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, ['الاسم', 'رقم الهوية', 'رقم الجوال', 'طريقة الصرف', 'المحفظة / البنك', 'رقم الحساب', 'اسم صاحب الحساب', 'هوية صاحب الحساب', 'جوال صاحب الحساب', 'الأساسي', 'الإضافي', 'المكافآت', 'خصم الحضور', 'خصومات أخرى', 'قسط السلفة', 'الصافي (شيكل)']);
            foreach ($items as $i) {
                $p = $i->payment ?? [];
                fputcsv($out, [
                    $i->user?->name, $p['national_id'] ?? '', $p['phone'] ?? '',
                    ($p['method'] ?? '') === 'bank' ? 'حساب بنكي' : (($p['method'] ?? '') === 'wallet' ? 'محفظة' : ''),
                    $p['provider'] ?? '', $p['account_number'] ?? '', $p['holder_name'] ?? '', $p['holder_national_id'] ?? '', $p['holder_phone'] ?? '',
                    $i->base, $i->overtime, $i->bonuses, $i->auto_deductions, $i->manual_deductions, $i->advance_deduction, $i->net,
                ]);
            }
            fclose($out);
        }, $name, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    // ---------------- The employee's own pay ----------------

    public function mine(Request $request): JsonResponse
    {
        $items = PayrollItem::where('user_id', $request->user()->id)
            ->whereHas('batch', fn ($q) => $q->whereIn('status', ['approved', 'paid']))
            ->with('batch')->get()->sortByDesc(fn ($i) => $i->batch->month.sprintf('%010d', $i->batch->id))->values();
        $advances = Advance::where('user_id', $request->user()->id)->get()->map(fn ($a) => $this->presentAdvance($a))->filter(fn ($a) => $a['remaining'] > 0)->values();

        return response()->json([
            'items' => $items->map(fn ($i) => $this->presentItem($i) + ['batch' => $this->presentBatch($i->batch)]),
            'advances' => $advances,
        ]);
    }

    // ---------------- Helpers ----------------

    /** 2026-10 → «أكتوبر 2026». */
    private function monthName(string $month): string
    {
        $names = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        [$y, $m] = explode('-', $month);

        return $names[(int) $m - 1].' '.$y;
    }

    private function usedPercent(string $month, ?int $branchId): float
    {
        return (float) PayrollBatch::where('month', $month)->where('branch_id', $branchId)->sum('percent');
    }

    private function allowed(Request $request, string $permission, ?int $branchId): bool
    {
        $scope = Access::scope($request->user(), $permission);

        return $scope === 'all' || ($scope === 'branch' && $branchId !== null && $branchId === $request->user()->branch_id);
    }

    private function authorizeBranch(Request $request, string $permission, ?int $branchId, bool $view = false): void
    {
        abort_unless($this->allowed($request, $permission, $branchId) || ($view && $this->allowed($request, 'payroll.manage', $branchId)), 403, 'ليست لديك صلاحية على رواتب هذا الفرع.');
    }

    private function presentSetting(PayrollSetting $s): array
    {
        return [
            'id' => $s->id, 'branch_id' => $s->branch_id, 'effective_from' => $s->effective_from?->format('Y-m-d'),
            'late_mode' => $s->late_mode, 'late_value' => (float) $s->late_value,
            'absence_mode' => $s->absence_mode, 'absence_value' => (float) $s->absence_value,
            'overtime_mode' => $s->overtime_mode, 'overtime_value' => (float) $s->overtime_value,
            'overtime_cap_hours' => $s->overtime_cap_hours,
        ];
    }

    private function presentAdjustment(PayrollAdjustment $a): array
    {
        return [
            'id' => $a->id, 'user' => $a->user?->only('id', 'name'), 'type' => $a->type, 'month' => $a->month,
            'amount' => $a->amount, 'reason' => $a->reason,
            'batch' => $a->batch ? ['id' => $a->batch->id, 'title' => $a->batch->title, 'status' => $a->batch->status] : null,
            'created_at' => $a->created_at?->toIso8601String(),
        ];
    }

    private function presentAdvance(Advance $a): array
    {
        $paid = round($a->amount - $a->remaining(), 2);

        return [
            'id' => $a->id, 'user' => $a->user?->only('id', 'name'), 'amount' => $a->amount, 'installment' => $a->installment,
            'branch_id' => $a->branch_id, 'start_month' => $a->start_month, 'reason' => $a->reason, 'paid' => $paid, 'remaining' => $a->remaining(),
            'created_at' => $a->created_at?->toIso8601String(),
        ];
    }

    private function presentBatch(PayrollBatch $b): array
    {
        return [
            'id' => $b->id, 'title' => $b->title, 'month' => $b->month, 'percent' => $b->percent, 'is_final' => $b->is_final,
            'branch' => $b->branch?->only('id', 'name'), 'status' => $b->status, 'total_net' => $b->total_net,
            'employees_count' => $b->employees_count,
            'created_by' => $b->relationLoaded('creator') ? $b->creator?->name : null,
            'approved_by' => $b->relationLoaded('approver') ? $b->approver?->name : null,
            'approved_at' => $b->approved_at?->toIso8601String(), 'paid_at' => $b->paid_at?->toIso8601String(),
            'calculated_at' => $b->calculated_at?->toIso8601String(), 'created_at' => $b->created_at?->toIso8601String(),
        ];
    }

    private function presentItem(PayrollItem $i): array
    {
        return [
            'id' => $i->id, 'user' => $i->user?->only('id', 'name'), 'salary_type' => $i->salary_type, 'salary_amount' => $i->salary_amount,
            'base' => $i->base, 'overtime' => $i->overtime, 'bonuses' => $i->bonuses, 'auto_deductions' => $i->auto_deductions,
            'manual_deductions' => $i->manual_deductions, 'advance_deduction' => $i->advance_deduction, 'net' => $i->net,
            'details' => $i->details, 'payment' => $i->payment,
        ];
    }
}
