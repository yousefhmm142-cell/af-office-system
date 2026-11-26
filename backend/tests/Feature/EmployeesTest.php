<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\WorkSchedule;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeesTest extends TestCase
{
    public function test_monthly_file_and_field_reports_respect_branch_and_edit_scope(): void
    {
        $branch = $this->makeBranch();
        $employee = $this->makeUser(Role::EMPLOYEE, $branch);
        $form = ['date' => '2026-11-27', 'kind' => 'collection', 'collected' => 200, 'target' => 400, 'bills' => 4, 'meters' => 10, 'zones' => 'الوسط'];
        $this->actAs(Role::HR);
        $this->putJson("/api/employees/$employee->id/field-report", $form)->assertOk();
        $this->getJson("/api/employees/$employee->id/overview?month=2026-11")->assertOk()
            ->assertJsonCount(30, 'calendar')->assertJsonPath('reports.0.metrics.meters', 10);
        Sanctum::actingAs($employee);
        $this->putJson("/api/employees/$employee->id/field-report", $form)->assertForbidden();
        $this->actAs(Role::BRANCH_MANAGER, $branch);
        $this->getJson("/api/employees/$employee->id/overview?month=2026-11")->assertOk()->assertJsonPath('pay', null);
        $this->actAs(Role::BRANCH_MANAGER, $this->makeBranch('فرع آخر'));
        $this->getJson("/api/employees/$employee->id/overview?month=2026-11")->assertForbidden();
    }

    public function test_every_account_gets_an_employee_file(): void
    {
        $user = $this->makeUser(Role::EMPLOYEE, $this->makeBranch());
        $this->assertNotNull($user->employee);
        $this->assertSame('active', $user->employee->fresh()->status);
    }

    public function test_employee_edits_own_personal_data_and_wallet_but_not_job(): void
    {
        $branch = $this->makeBranch();
        $me = $this->actAs(Role::EMPLOYEE, $branch);

        $this->patchJson("/api/employees/{$me->id}/personal", [
            'name' => 'أحمد محمد علي حسن', 'national_id' => '401234567', 'phone' => '0599123456', 'gender' => 'male',
            'education_level' => 'bachelor', 'payment_method' => 'wallet', 'provider' => 'PalPay',
            'account_number' => '0599123456', 'account_holder_name' => 'أحمد محمد', 'account_holder_national_id' => '401234567', 'account_holder_phone' => '0599123456',
        ])->assertOk()->assertJsonPath('personal.provider', 'PalPay')->assertJsonPath('user.name', 'أحمد محمد علي حسن');

        $this->patchJson("/api/employees/{$me->id}/personal", ['national_id' => '123'])->assertStatus(422)->assertJsonPath('errors.national_id.0', 'رقم الهوية 9 أرقام.');
        $this->patchJson("/api/employees/{$me->id}/job", ['salary_amount' => 9999])->assertForbidden();
        $this->postJson("/api/employees/{$me->id}/status", ['status' => 'active'])->assertForbidden();

        // Sees the own salary, cannot edit it.
        $this->getJson("/api/employees/{$me->id}")->assertOk()->assertJsonPath('can.edit_job', false)->assertJsonPath('can.edit_personal', true);
    }

    public function test_employee_cannot_see_a_colleague(): void
    {
        $branch = $this->makeBranch();
        $other = $this->makeUser(Role::EMPLOYEE, $branch);
        $this->actAs(Role::EMPLOYEE, $branch);
        $this->getJson("/api/employees/{$other->id}")->assertForbidden();
        $this->patchJson("/api/employees/{$other->id}/personal", ['address' => 'غزة'])->assertForbidden();
    }

    public function test_hr_sets_job_data_and_schedule_must_be_from_the_branch(): void
    {
        $a = $this->makeBranch('أ');
        $b = $this->makeBranch('ب');
        $schA = WorkSchedule::create(['branch_id' => $a->id, 'name' => 'عادي', 'start_time' => '07:30', 'end_time' => '15:30', 'work_days' => WorkSchedule::ALL_DAYS]);
        $schB = WorkSchedule::create(['branch_id' => $b->id, 'name' => 'عادي', 'start_time' => '08:00', 'end_time' => '16:00', 'work_days' => WorkSchedule::ALL_DAYS]);
        $emp = $this->makeUser(Role::EMPLOYEE, $a);
        $this->actAs(Role::HR);

        $this->patchJson("/api/employees/{$emp->id}/job", ['work_schedule_id' => $schB->id])->assertStatus(422);
        $this->patchJson("/api/employees/{$emp->id}/job", [
            'job_title' => 'محصّل', 'salary_type' => 'monthly', 'salary_amount' => 1200, 'daily_hours' => 8,
            'hire_date' => '2026-01-01', 'work_schedule_id' => $schA->id,
        ])->assertOk()->assertJsonPath('job.salary_amount', '1200.00')->assertJsonPath('job.hire_date', '2026-01-01')->assertJsonPath('job.schedule.id', $schA->id);
        $this->assertDatabaseHas('audit_logs', ['action' => 'employee.job', 'subject_id' => $emp->id]);
    }

    public function test_branch_manager_views_own_branch_files_only(): void
    {
        $a = $this->makeBranch('أ');
        $b = $this->makeBranch('ب');
        $mine = $this->makeUser(Role::EMPLOYEE, $a);
        $theirs = $this->makeUser(Role::EMPLOYEE, $b);
        $this->actAs(Role::BRANCH_MANAGER, $a);

        $this->getJson("/api/employees/{$mine->id}")->assertOk()->assertJsonPath('can.edit_job', false);
        $this->getJson("/api/employees/{$theirs->id}")->assertForbidden();
        $this->patchJson("/api/employees/{$mine->id}/job", ['job_title' => 'x'])->assertForbidden();
    }

    public function test_status_changes_are_logged_and_termination_stops_the_account(): void
    {
        $emp = $this->makeUser(Role::EMPLOYEE, $this->makeBranch());
        $emp->createToken('phone');
        $hr = $this->actAs(Role::HR);

        $this->postJson("/api/employees/{$emp->id}/status", ['status' => 'terminated'])->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->postJson("/api/employees/{$emp->id}/status", ['status' => 'trainee'])->assertOk()->assertJsonPath('status', 'trainee');
        $this->postJson("/api/employees/{$emp->id}/status", ['status' => 'terminated', 'reason' => 'غياب متكرر'])
            ->assertOk()->assertJsonPath('status', 'terminated')->assertJsonPath('user.is_active', false)
            ->assertJsonPath('status_log.0.reason', 'غياب متكرر')->assertJsonPath('status_log.0.by', $hr->name);
        $this->assertSame(0, $emp->tokens()->count());

        // Back to work: the account opens again.
        $this->postJson("/api/employees/{$emp->id}/status", ['status' => 'active'])->assertOk()->assertJsonPath('user.is_active', true);
        $this->assertCount(3, $this->getJson("/api/employees/{$emp->id}")->json('status_log'));
    }

    public function test_attachments_upload_download_delete(): void
    {
        Storage::fake('local');
        $branch = $this->makeBranch();
        $me = $this->actAs(Role::EMPLOYEE, $branch);

        $id = $this->post("/api/employees/{$me->id}/attachments", [
            'type' => 'id_photo', 'file' => UploadedFile::fake()->image('hawiya.jpg', 800, 500),
        ], ['Accept' => 'application/json'])->assertCreated()->json('attachment.id');

        $this->post("/api/employees/{$me->id}/attachments", [
            'type' => 'other', 'file' => UploadedFile::fake()->create('virus.exe', 10),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->get("/api/employees/{$me->id}/attachments/{$id}")->assertOk()->assertHeader('Content-Type', 'image/jpeg');

        // A colleague cannot open it; HR can.
        $this->actAs(Role::EMPLOYEE, $branch);
        $this->getJson("/api/employees/{$me->id}/attachments/{$id}")->assertForbidden();
        $this->actAs(Role::HR);
        $this->get("/api/employees/{$me->id}/attachments/{$id}")->assertOk();
        $this->deleteJson("/api/employees/{$me->id}/attachments/{$id}")->assertOk();
        $this->assertCount(0, Storage::disk('local')->allFiles());
    }

    public function test_new_employee_attaches_certificates_before_completing_personal_data(): void
    {
        Storage::fake('local');
        $branch = $this->makeBranch();
        $employee = $this->actAs(Role::EMPLOYEE, $branch, ['needs_profile_completion' => true]);
        $path = "/api/employees/{$employee->id}/attachments";
        foreach (['id_photo', 'specialty_cert', 'experience_cert', 'experience_cert'] as $type) {
            $id = $this->postJson($path, ['type' => $type, 'file' => UploadedFile::fake()->image('document.jpg')])
                ->assertCreated()->json('attachment.id');
        }
        $this->getJson("/api/employees/{$employee->id}")->assertOk()->assertJsonCount(4, 'attachments');
        $this->get("$path/$id")->assertOk();
        $this->deleteJson("$path/$id")->assertOk();
        $this->actAs(Role::HR, null, ['needs_profile_completion' => true]);
        $this->postJson($path)->assertForbidden();
    }

    public function test_national_id_is_unique(): void
    {
        $branch = $this->makeBranch();
        $first = $this->makeUser(Role::EMPLOYEE, $branch);
        $first->employee->update(['national_id' => '401234567']);
        $me = $this->actAs(Role::EMPLOYEE, $branch);
        $this->patchJson("/api/employees/{$me->id}/personal", ['national_id' => '401234567'])->assertStatus(422);
    }
}
