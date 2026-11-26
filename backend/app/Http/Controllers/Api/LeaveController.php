<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Services\AttendanceService;
use App\Support\Access;
use App\Support\Audit;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class LeaveController extends Controller
{
    public function __construct(private AttendanceService $attendance) {}

    public static function annualUsed(int $userId, int $year): int
    {
        return DB::table('leave_days as d')->join('leave_requests as l', 'l.id', '=', 'd.request_id')->where('l.user_id', $userId)
            ->where('l.kind', 'annual')->where('l.status', 'approved')->whereYear('d.date', $year)->count();
    }

    public function allowance(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        abort_unless($user->id !== $actor->id && Access::allowsBranch($actor, 'leaves.decide', $user->branch_id), 403);
        $data = $request->validate(['year' => ['required', 'integer', 'between:2000,2100'], 'days' => ['required', 'integer', 'between:0,366']]);
        DB::transaction(function () use ($user, $data) {
            User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_if($data['days'] < self::annualUsed($user->id, $data['year']), 422, 'الرصيد أقل من الأيام المعتمدة.');
            DB::table('annual_leave_allowances')->updateOrInsert(['user_id' => $user->id, 'year' => $data['year']], ['days' => $data['days']]);
            Audit::log('leave.allowance', $user, null, $data);
        });

        return response()->json(['ok' => true]);
    }

    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();
        $query = $this->visibleRequests($actor)
            ->selectSub(DB::table('leave_request_reads')->selectRaw('count(*)')->whereColumn('leave_request_id', 'l.id')->where('user_id', $actor->id), 'read');

        return response()->json(['requests' => $query->orderByDesc('l.id')->get()]);
    }

    public function read(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        abort_unless($this->visibleRequests($actor)->where('l.id', $id)->exists(), 404);
        DB::table('leave_request_reads')->insertOrIgnore(['leave_request_id' => $id, 'user_id' => $actor->id]);

        return response()->json(['ok' => true]);
    }

    private function visibleRequests(User $actor): Builder
    {
        $query = DB::table('leave_requests as l')->join('users as u', 'l.user_id', '=', 'u.id')->select('l.*', 'u.name')
            ->selectSub(DB::table('leave_days')->selectRaw('count(*)')->whereColumn('request_id', 'l.id'), 'days');
        $final = Access::scope($actor, 'leaves.final');
        $decide = Access::scope($actor, 'leaves.decide');
        $query->where(function ($q) use ($actor, $final, $decide) {
            $q->where('l.user_id', $actor->id);
            if ($final === 'all') {
                $q->orWhere('l.status', 'escalated');
            } elseif ($final === 'branch') {
                $q->orWhere(fn ($w) => $w->where('l.status', 'escalated')->where('l.branch_id', $actor->branch_id));
            }
            if ($decide === 'all') {
                $q->orWhereNotNull('l.branch_id');
            } elseif ($decide === 'branch') {
                $q->orWhere('l.branch_id', $actor->branch_id);
            }
        });

        return $query;
    }

    public function store(Request $request): JsonResponse
    {
        $actor = $request->user();
        abort_unless($actor->branch_id, 422, 'يلزم تحديد الفرع في ملف الموظف.');
        $data = $request->validate([
            'kind' => ['required', Rule::in(['annual', 'sick', 'other', 'permission'])],
            'starts' => ['required', 'date_format:Y-m-d'],
            'ends' => ['required', 'date_format:Y-m-d', 'after_or_equal:starts'],
            'from_time' => ['required_if:kind,permission', 'prohibited_unless:kind,permission', 'date_format:H:i'],
            'to_time' => ['required_if:kind,permission', 'prohibited_unless:kind,permission', 'date_format:H:i'],
            'reason' => ['required', 'string', 'max:300'],
        ]);
        $id = DB::transaction(function () use ($actor, $data) {
            User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
            $days = $this->scheduledDays($actor, $data);
            abort_if(DB::table('leave_requests')->where('user_id', $actor->id)->whereIn('status', ['pending', 'escalated', 'approved'])
                ->where('starts', '<=', $data['ends'])->where('ends', '>=', $data['starts'])->exists(), 422, 'يوجد طلب قائم في هذه الفترة.');
            $id = DB::table('leave_requests')->insertGetId($data + ['user_id' => $actor->id, 'branch_id' => $actor->branch_id, 'created_at' => now(), 'updated_at' => now()]);
            $this->saveDays($id, $days);
            Audit::log('leave.requested', $actor, null, ['request_id' => $id]);

            return $id;
        });

        return response()->json(['id' => $id], 201);
    }

    private function scheduledDays(User $user, array $data): array
    {
        $start = CarbonImmutable::parse($data['starts'], $this->attendance->tz());
        $end = CarbonImmutable::parse($data['ends'], $this->attendance->tz());
        abort_if($start->diffInDays($end) > 365, 422, 'أقصى فترة للطلب سنة.');
        $permission = $data['kind'] === 'permission';
        abort_if($permission && ! $start->equalTo($end), 422, 'الإذن يكون في يوم واحد.');
        $days = [];
        for ($day = $start; $day->lte($end); $day = $day->addDay()) {
            $schedule = $this->attendance->scheduleFor($user, $day);
            abort_unless($schedule, 422, 'يجب تحديد دوام الموظف أولاً.');
            if (! $this->attendance->isWorkDay($schedule, $day, $user->branch_id)) {
                continue;
            }
            if ($permission) {
                $shiftStart = $day->setTimeFromTimeString($schedule->start_time);
                $shiftEnd = $day->setTimeFromTimeString($schedule->end_time);
                $from = $day->setTimeFromTimeString($data['from_time']);
                $to = $day->setTimeFromTimeString($data['to_time']);
                if ($shiftEnd->lt($shiftStart)) {
                    $shiftEnd = $shiftEnd->addDay();
                    if ($from->lt($shiftStart)) {
                        $from = $from->addDay();
                    }
                    if ($to->lt($shiftStart)) {
                        $to = $to->addDay();
                    }
                }
                abort_if($from->lt($shiftStart) || $to->gt($shiftEnd) || $to->lte($from), 422, 'يجب أن تكون ساعات الإذن ضمن الدوام.');
            }
            $days[] = $day->toDateString();
        }
        abort_unless($days, 422, 'الفترة المحددة تقع ضمن أيام الراحة.');

        return $days;
    }

    private function saveDays(int $id, array $days): void
    {
        DB::table('leave_days')->where('request_id', $id)->delete();
        DB::table('leave_days')->insert(array_map(fn ($day) => ['request_id' => $id, 'date' => $day], $days));
    }

    public function decide(Request $request, int $id): JsonResponse
    {
        $actor = $request->user();
        $action = $request->validate(['action' => ['required', Rule::in(['approved', 'rejected', 'cancelled', 'escalated'])]])['action'];
        DB::transaction(function () use ($id, $actor, $action) {
            $row = DB::table('leave_requests')->where('id', $id)->lockForUpdate()->first();
            abort_unless($row, 404);
            $own = $row->user_id == $actor->id;
            $hr = $row->user_id !== $actor->id && Access::allowsBranch($actor, 'leaves.decide', $row->branch_id);
            $management = $row->status === 'escalated' && Access::allowsBranch($actor, 'leaves.final', $row->branch_id);
            $allowed = $own ? $action === 'cancelled' && in_array($row->status, ['pending', 'escalated']) :
                (($hr && (($row->status === 'pending') || ($row->status === 'approved' && $action === 'cancelled'))) ||
                ($management && in_array($action, ['approved', 'rejected'])));
            abort_unless($allowed, 403, 'هذا الإجراء غير متاح.');
            $target = User::whereKey($row->user_id)->lockForUpdate()->firstOrFail();
            if ($action === 'approved') {
                abort_unless($target->branch_id == $row->branch_id, 422, 'تغيّر فرع الموظف منذ تقديم الطلب.');
                $dates = $this->scheduledDays($target, (array) $row);
                if ($row->kind === 'annual') {
                    foreach (collect($dates)->countBy(fn ($date) => substr($date, 0, 4)) as $year => $count) {
                        $allowance = DB::table('annual_leave_allowances')->where('user_id', $target->id)->where('year', $year)->value('days');
                        abort_if($allowance === null, 422, 'حدّد رصيد الإجازة السنوية للموظف لسنة '.$year.' قبل الاعتماد.');
                        abort_if(self::annualUsed($target->id, $year) + $count > $allowance, 422, 'رصيد الإجازة السنوية غير كافٍ.');
                    }
                }
                $this->saveDays($id, $dates);
            }
            DB::table('leave_requests')->where('id', $id)->update(['status' => $action, 'updated_at' => now()]);
            DB::table('leave_request_reads')->where('leave_request_id', $id)->where('user_id', '!=', $actor->id)->delete();
            Audit::log('leave.decision', $target, ['status' => $row->status], ['request_id' => $id, 'status' => $action]);
        });

        return response()->json(['ok' => true]);
    }
}
