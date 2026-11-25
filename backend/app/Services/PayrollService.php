<?php

namespace App\Services;

use App\Models\Advance;
use App\Models\AdvancePayment;
use App\Models\AttendanceDay;
use App\Models\Holiday;
use App\Models\PayrollAdjustment;
use App\Models\PayrollBatch;
use App\Models\PayrollItem;
use App\Models\PayrollSetting;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * How a pay batch is worked out, for each employee:
 *
 *   base       monthly / contract: salary × percent
 *              daily:  days attended × daily wage × percent
 *              weekly: days attended × (weekly wage ÷ work days a week) × percent
 *   attendance only in the batch that completes the month (100%), from the settings in force:
 *              attendance is recorded for review, extra hours are added
 *   manual     deductions and bonuses of that month not yet paid by another batch
 *   advances   only instalments selected by HR for this batch
 *   net        base + overtime + bonuses − deductions − advance instalment (never below zero:
 *              the instalment is reduced first)
 */
class PayrollService
{
    public function __construct(private AttendanceService $attendance) {}

    public function tz(): string
    {
        return config('app.business_timezone');
    }

    /** The rules in force for a branch in a month: the branch's own, else the company's, else nothing automatic. */
    public function settingsFor(?int $branchId, string $month): PayrollSetting
    {
        $end = CarbonImmutable::parse("{$month}-01")->endOfMonth()->toDateString();
        $pick = fn ($q) => $q->where('effective_from', '<=', $end)->orderByDesc('effective_from')->orderByDesc('id')->first();

        return ($branchId ? $pick(PayrollSetting::where('branch_id', $branchId)) : null)
            ?? $pick(PayrollSetting::whereNull('branch_id'))
            ?? new PayrollSetting(['late_mode' => 'none', 'absence_mode' => 'none', 'overtime_mode' => 'none', 'late_value' => 1, 'absence_value' => 1, 'overtime_value' => 1]);
    }

    /** People paid by a batch: active or trainee, with a salary set, hired by the end of the month. */
    public function eligible(PayrollBatch $batch): Collection
    {
        $end = CarbonImmutable::parse("{$batch->month}-01")->endOfMonth()->toDateString();

        return User::query()->with('employee')
            ->when($batch->branch_id, fn ($q) => $q->where('branch_id', $batch->branch_id))
            ->whereHas('employee', fn ($q) => $q->whereIn('status', ['active', 'trainee'])
                ->whereNotNull('salary_type')->where('salary_amount', '>', 0)
                ->where(fn ($h) => $h->whereNull('hire_date')->orWhere('hire_date', '<=', $end)))
            ->orderBy('name')->get();
    }

    /** (Re)works out every line of a draft batch. */
    public function calculate(PayrollBatch $batch): PayrollBatch
    {
        abort_unless($batch->status === 'draft', 422, 'لا يمكن إعادة حساب دفعة معتمدة.');

        return DB::transaction(function () use ($batch) {
            $batch = PayrollBatch::whereKey($batch->id)->lockForUpdate()->firstOrFail();
            abort_unless($batch->status === 'draft', 422, 'الدفعة معتمدة.');
            $batch->items()->delete();
            PayrollAdjustment::where('batch_id', $batch->id)->update(['batch_id' => null]);
            AdvancePayment::where('batch_id', $batch->id)->delete();

            $total = 0.0;
            $count = 0;
            foreach ($this->eligible($batch) as $user) {
                $item = $this->line($batch, $user);
                $total += $item->net;
                $count++;
            }
            $batch->forceFill(['total_net' => round($total, 2), 'employees_count' => $count, 'calculated_at' => now()])->save();

            return $batch->fresh();
        });
    }

    private function line(PayrollBatch $batch, User $user): PayrollItem
    {
        $emp = $user->employee;
        $pct = $batch->percent / 100;
        $salary = (float) $emp->salary_amount;
        $type = $emp->salary_type;
        $att = $this->attendanceSummary($user, $batch->month);
        $notes = [];

        $daysPerWeek = max(1, count($att['schedule']?->work_days ?? [1, 2, 3, 4, 5, 6, 7]));
        $base = match ($type) {
            'daily' => ($att['present_days'] + $att['leave_days_without_punch']) * $salary * $pct,
            'weekly' => ($att['present_days'] + $att['leave_days_without_punch']) * ($salary / $daysPerWeek) * $pct,
            default => $salary * $pct,
        };
        $hourly = match ($type) {
            'monthly' => $att['month_work_days'] > 0 ? $salary / ($att['month_work_days'] * (float) $emp->daily_hours) : 0,
            'weekly' => $salary / ($daysPerWeek * (float) $emp->daily_hours),
            'daily' => $salary / (float) $emp->daily_hours,
            default => 0,
        };

        $overtime = 0.0;
        if ($batch->is_final && $emp->tracks_attendance && $type !== 'contract') {
            $s = $this->settingsFor($user->branch_id, $batch->month);
            $otHours = $att['overtime_minutes'] / 60;
            if ($s->overtime_cap_hours !== null) {
                $otHours = min($otHours, $s->overtime_cap_hours);
            }
            $overtime = match ($s->overtime_mode) {
                'wage' => $otHours * $hourly * $s->overtime_value,
                'fixed' => $otHours * $s->overtime_value,
                default => 0,
            };
            if ($att['pending_days'] > 0) {
                $notes[] = "{$att['pending_days']} يوم حضور لم يُعتمد بعد";
            }
        }

        // Manual deductions and bonuses of this month that no other batch has paid.
        $adjustments = PayrollAdjustment::where('user_id', $user->id)->where('month', $batch->month)->whereNull('batch_id')->get();
        PayrollAdjustment::whereIn('id', $adjustments->pluck('id'))->update(['batch_id' => $batch->id]);
        $bonuses = (float) $adjustments->where('type', 'bonus')->sum('amount');
        $manual = (float) $adjustments->where('type', 'deduction')->sum('amount');

        $gross = round($base + $overtime + $bonuses - $manual, 2);

        // One instalment of each open advance, never more than what is left to pay.
        $advanceTotal = 0.0;
        $advances = Advance::whereIn('id', $batch->advance_ids ?? [])->where('user_id', $user->id)->where('start_month', '<=', $batch->month)->orderBy('id')->lockForUpdate()->get();
        foreach ($advances as $adv) {
            $want = min($adv->installment, $adv->remaining($batch->id));
            $due = round(min($want, max(0, $gross - $advanceTotal)), 2);
            if ($due > 0) {
                AdvancePayment::create(['advance_id' => $adv->id, 'batch_id' => $batch->id, 'amount' => $due]);
                $advanceTotal += $due;
            }
            if ($due < $want) {
                $notes[] = 'خُفّض قسط السلفة لأن الصافي لا يكفي';
            }
        }

        $net = round($gross - $advanceTotal, 2);
        if ($net < 0) {
            $notes[] = 'الخصومات أكبر من المستحق؛ الصافي صفر';
            $net = 0;
        }

        $e = $emp;

        return PayrollItem::create([
            'batch_id' => $batch->id, 'user_id' => $user->id, 'branch_id' => $user->branch_id,
            'salary_type' => $type, 'salary_amount' => $salary,
            'base' => round($base, 2), 'overtime' => round($overtime, 2), 'bonuses' => round($bonuses, 2),
            'auto_deductions' => 0, 'manual_deductions' => round($manual, 2),
            'advance_deduction' => round($advanceTotal, 2), 'net' => $net,
            'details' => [
                'present_days' => $att['present_days'], 'absent_days' => $att['absent_days'],
                'late_minutes' => $att['late_minutes'], 'overtime_minutes' => $att['overtime_minutes'],
                'late_amount' => 0, 'absence_amount' => 0,
                'hourly' => round($hourly, 2), 'adjustments' => $adjustments->map(fn ($a) => ['type' => $a->type, 'amount' => $a->amount, 'reason' => $a->reason])->values(),
                'notes' => $notes,
            ],
            'payment' => [
                'national_id' => $e->national_id, 'phone' => $e->phone, 'method' => $e->payment_method, 'provider' => $e->provider,
                'account_number' => $e->account_number, 'holder_name' => $e->account_holder_name,
                'holder_national_id' => $e->account_holder_national_id, 'holder_phone' => $e->account_holder_phone,
            ],
        ]);
    }

    /** A month of attendance for one person, in Gaza days. */
    public function attendanceSummary(User $user, string $month): array
    {
        $tz = $this->tz();
        $start = CarbonImmutable::parse("{$month}-01", $tz);
        $end = $start->endOfMonth();
        $today = CarbonImmutable::now($tz)->startOfDay();
        $schedule = $this->attendance->baseSchedule($user);
        $hire = $user->employee?->hire_date ? CarbonImmutable::parse($user->employee->hire_date->format('Y-m-d'), $tz) : null;

        $holidays = Holiday::whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->where(fn ($q) => $q->whereNull('branch_id')->orWhere('branch_id', $user->branch_id))
            ->pluck('date')->map(fn ($d) => $d->format('Y-m-d'))->flip();
        $workDays = $schedule?->work_days ?? [1, 2, 3, 4, 5, 6, 7];

        $days = AttendanceDay::where('user_id', $user->id)->whereBetween('date', [$start->toDateString(), $end->toDateString()])->get()
            ->keyBy(fn ($d) => $d->date->format('Y-m-d'));

        $shifts = DB::table('employee_shifts')->where('user_id', $user->id)->where('branch_id', $user->branch_id)
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])->pluck('is_rest', 'date');
        $leave = DB::table('leave_days as d')->join('leave_requests as l', 'l.id', '=', 'd.request_id')
            ->where('l.user_id', $user->id)->where('l.status', 'approved')->where('l.kind', '!=', 'permission')
            ->whereBetween('d.date', [$start->toDateString(), $end->toDateString()])->pluck('d.date')->flip();
        $monthWork = 0;
        $absent = 0;
        for ($d = $start; $d->lte($end); $d = $d->addDay()) {
            $isWork = ($shifts->has($d->toDateString()) ? ! $shifts[$d->toDateString()] : in_array($d->dayOfWeekIso, $workDays, true)) && ! isset($holidays[$d->toDateString()]);
            if (! $isWork) {
                continue;
            }
            $monthWork++;
            $counts = $d->lt($today) && (! $hire || $d->gte($hire));
            if ($counts && ! $leave->has($d->toDateString()) && ! (isset($days[$d->toDateString()]) && $days[$d->toDateString()]->check_in)) {
                $absent++;
            }
        }
        $present = $days->filter(fn ($d) => $d->check_in !== null);

        return [
            'schedule' => $schedule,
            'month_work_days' => $monthWork,
            'present_days' => $present->count(),
            'leave_days_without_punch' => $leave->keys()->filter(fn ($date) => $date <= $today->toDateString() && (! $hire || $date >= $hire->toDateString()) && ! $present->has($date))->count(),
            'absent_days' => $absent,
            'late_minutes' => (int) $present->sum('late_minutes'),
            'overtime_minutes' => (int) $present->sum('overtime_minutes'),
            'pending_days' => $present->where('approval_status', 'pending')->count(),
        ];
    }
}
