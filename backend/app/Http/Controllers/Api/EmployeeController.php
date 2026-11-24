<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeAttachment;
use App\Models\EmployeeStatusLog;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Support\Access;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The employee file. The person sees their own file and edits the personal part and
 * their wallet; HR (employees.manage) edits everything; viewers see within their scope.
 */
class EmployeeController extends Controller
{
    private const DISK = 'local';

    public function show(Request $request, User $user): JsonResponse
    {
        $this->authorizeView($request->user(), $user);

        return response()->json($this->payload($request->user(), $user));
    }

    public function updatePersonal(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        $this->authorizeEdit($actor, $user);
        $emp = $this->fileOf($user);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:120'],
            'national_id' => ['sometimes', 'nullable', 'string', 'regex:/^[0-9]{9}$/', Rule::unique('employees', 'national_id')->ignore($emp->id)],
            'phone' => ['sometimes', 'nullable', 'string', 'regex:/^05[0-9]{8}$/'],
            'wa_code' => ['sometimes', Rule::in([970, 972])],
            'address' => ['sometimes', 'nullable', 'string', 'max:200'],
            'education_level' => ['sometimes', 'nullable', Rule::in(['none', 'primary', 'preparatory', 'secondary', 'diploma', 'bachelor', 'master', 'phd'])],
            'specialty' => ['sometimes', 'nullable', 'string', 'max:100'],
            'gender' => ['sometimes', 'nullable', Rule::in(['male', 'female'])],
            'payment_method' => ['sometimes', 'nullable', Rule::in(['wallet', 'bank'])],
            'provider' => ['sometimes', 'nullable', 'string', 'max:60'],
            'account_number' => ['sometimes', 'nullable', 'string', 'max:40'],
            'account_holder_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'account_holder_national_id' => ['sometimes', 'nullable', 'string', 'regex:/^[0-9]{9}$/'],
            'account_holder_phone' => ['sometimes', 'nullable', 'string', 'regex:/^05[0-9]{8}$/'],
        ]);

        DB::transaction(function () use ($data, $user, $emp) {
            if (array_key_exists('name', $data)) {
                $user->fill(['name' => trim($data['name'])])->save();
                [$old, $new] = Audit::diff($user);
                if ($new) {
                    Audit::log('employee.personal', $user, $old, $new);
                }
                unset($data['name']);
            }
            $emp->fill($data)->save();
            [$old, $new] = Audit::diff($emp);
            if ($new) {
                Audit::log('employee.personal', $user, $old, $new);
            }
        });

        return response()->json($this->payload($actor, $user->fresh()));
    }

    public function updateJob(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        UserController::assertCanManage($actor, $user->role, $user->branch_id, 'employees.manage');
        abort_if($actor->id === $user->id && ! $actor->isSuperAdmin(), 403, 'تحدد شؤون الموظفين بياناتك الوظيفية.');
        $emp = $this->fileOf($user);

        $data = $request->validate([
            'department_id' => ['sometimes', 'nullable', 'integer', Rule::exists('departments', 'id')->whereNull('deleted_at')],
            'job_title' => ['sometimes', 'nullable', 'string', 'max:60'],
            'work_schedule_id' => ['sometimes', 'nullable', 'integer'],
            'tracks_attendance' => ['sometimes', 'boolean'],
            'punch_anywhere' => ['sometimes', 'boolean'],
            'salary_type' => ['sometimes', 'nullable', Rule::in(['monthly', 'weekly', 'daily', 'contract'])],
            'salary_amount' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:99999999'],
            'daily_hours' => ['sometimes', 'numeric', 'min:1', 'max:16'],
            'hire_date' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
        ]);
        if (! empty($data['work_schedule_id'])) {
            $ok = WorkSchedule::whereKey($data['work_schedule_id'])->where('branch_id', $user->branch_id)->exists();
            if (! $ok) {
                throw ValidationException::withMessages(['work_schedule_id' => 'يجب أن يكون الدوام من دوامات فرع الموظف.']);
            }
        }

        $emp->fill($data)->save();
        [$old, $new] = Audit::diff($emp);
        if ($new) {
            Audit::log('employee.job', $user, $old, $new);
        }

        return response()->json($this->payload($actor, $user->fresh()));
    }

    /** Active, trainee, suspended or terminated, always with who, when and why. A terminated account can no longer sign in. */
    public function setStatus(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        abort_if($actor->id === $user->id, 403, 'لا يمكنك تغيير حالتك بنفسك.');
        UserController::assertCanManage($actor, $user->role, $user->branch_id, 'employees.manage');
        $data = $request->validate([
            'status' => ['required', Rule::in(Employee::STATUSES)],
            'reason' => [Rule::requiredIf(fn () => in_array($request->input('status'), ['suspended', 'terminated'], true)), 'nullable', 'string', 'max:500'],
        ]);
        $emp = $this->fileOf($user);
        if ($emp->status === $data['status']) {
            return response()->json($this->payload($actor, $user));
        }

        DB::transaction(function () use ($emp, $data, $actor, $user) {
            EmployeeStatusLog::create([
                'employee_id' => $emp->id, 'from_status' => $emp->status, 'to_status' => $data['status'],
                'reason' => $data['reason'] ?? null, 'changed_by' => $actor->id, 'changed_at' => now(),
            ]);
            $old = $emp->status;
            $emp->forceFill([
                'status' => $data['status'],
                'termination_reason' => $data['status'] === 'terminated' ? $data['reason'] : null,
            ])->save();
            if ($data['status'] === 'terminated') {
                $user->forceFill(['is_active' => false])->save();
                $user->tokens()->delete();
            } elseif ($old === 'terminated') {
                $user->forceFill(['is_active' => true])->save();
            }
            Audit::log('employee.status', $user, ['status' => $old], ['status' => $data['status']], $data['reason'] ?? null);
        });

        return response()->json($this->payload($actor, $user->fresh()));
    }

    public function uploadAttachment(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        $this->authorizeEdit($actor, $user);
        $data = $request->validate([
            'type' => ['required', Rule::in(EmployeeAttachment::TYPES)],
            'file' => ['required', 'file', 'max:6144', 'mimes:jpg,jpeg,png,webp,heic,pdf'],
        ]);
        $emp = $this->fileOf($user);
        if ($emp->attachments()->count() >= 30) {
            throw ValidationException::withMessages(['file' => 'بلغت الحد الأقصى (30 مرفقاً). احذف القديم أولاً.']);
        }
        $file = $data['file'];
        $path = $file->store("employees/{$emp->id}", self::DISK);
        $att = $emp->attachments()->create([
            'type' => $data['type'], 'path' => $path, 'original_name' => mb_substr($file->getClientOriginalName(), 0, 200),
            'mime' => $file->getMimeType() ?? 'application/octet-stream', 'size' => $file->getSize(), 'uploaded_by' => $actor->id,
        ]);
        Audit::log('employee.attachment_added', $user, null, ['type' => $att->type, 'name' => $att->original_name]);

        return response()->json(['attachment' => $this->attachment($att)], 201);
    }

    public function downloadAttachment(Request $request, User $user, EmployeeAttachment $attachment): StreamedResponse
    {
        $this->authorizeView($request->user(), $user);
        abort_unless($attachment->employee_id === $user->employee?->id, 404);

        return Storage::disk(self::DISK)->response($attachment->path, $attachment->original_name, [
            'Content-Type' => $attachment->mime,
            'Cache-Control' => 'private, no-store',
        ], 'inline');
    }

    public function deleteAttachment(Request $request, User $user, EmployeeAttachment $attachment): JsonResponse
    {
        $this->authorizeEdit($request->user(), $user);
        abort_unless($attachment->employee_id === $user->employee?->id, 404);
        Storage::disk(self::DISK)->delete($attachment->path);
        $attachment->delete();
        Audit::log('employee.attachment_deleted', $user, ['type' => $attachment->type, 'name' => $attachment->original_name]);

        return response()->json(['ok' => true]);
    }

    private function fileOf(User $user): Employee
    {
        return $user->employee ?? Employee::firstOrCreate(['user_id' => $user->id]);
    }

    private function authorizeView(User $actor, User $target): void
    {
        if ($actor->id === $target->id || $actor->isSuperAdmin()) {
            return;
        }
        $ok = match (Access::scope($actor, 'employees.view')) {
            'all' => true,
            'branch' => $target->branch_id !== null && $target->branch_id === $actor->branch_id,
            default => false,
        } || $this->canManage($actor, $target);
        abort_unless($ok, 403, 'ليست لديك صلاحية لعرض ملف هذا الموظف.');
    }

    /** The person themselves, or someone who manages employees above them in rank. */
    private function authorizeEdit(User $actor, User $target): void
    {
        if ($actor->id === $target->id) {
            return;
        }
        UserController::assertCanManage($actor, $target->role, $target->branch_id, 'employees.manage');
    }

    private function canManage(User $actor, User $target): bool
    {
        try {
            UserController::assertCanManage($actor, $target->role, $target->branch_id, 'employees.manage');

            return true;
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException) {
            return false;
        }
    }

    private function payload(User $actor, User $user): array
    {
        $user->loadMissing('role', 'branch');
        $emp = $this->fileOf($user)->load('department', 'schedule', 'attachments', 'statusLog.changer');
        $manage = $actor->id !== $user->id || $actor->isSuperAdmin() ? $this->canManage($actor, $user) : false;

        return [
            'user' => \App\Http\Present::user($user),
            'personal' => $emp->only(Employee::PERSONAL),
            'job' => ['hire_date' => $emp->hire_date?->format('Y-m-d')] + $emp->only(Employee::JOB) + [
                'department' => $emp->department?->only('id', 'name'),
                'schedule' => $emp->schedule ? ['id' => $emp->schedule->id, 'name' => $emp->schedule->name] : null,
            ],
            'status' => $emp->status,
            'termination_reason' => $emp->termination_reason,
            'attachments' => $emp->attachments->sortByDesc('id')->values()->map(fn ($a) => $this->attachment($a)),
            'status_log' => $emp->statusLog->sortByDesc('id')->values()->map(fn ($l) => [
                'from' => $l->from_status, 'to' => $l->to_status, 'reason' => $l->reason,
                'by' => $l->changer?->name, 'at' => $l->changed_at?->toIso8601String(),
            ]),
            'can' => [
                'edit_personal' => $actor->id === $user->id || $manage,
                'edit_job' => $manage,
                'set_status' => $manage && $actor->id !== $user->id,
            ],
        ];
    }

    private function attachment(EmployeeAttachment $a): array
    {
        return [
            'id' => $a->id, 'type' => $a->type, 'name' => $a->original_name, 'mime' => $a->mime,
            'size' => $a->size, 'created_at' => $a->created_at?->toIso8601String(),
        ];
    }
}
