<?php

use App\Http\Controllers\Api\AccountHandoffController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AttendancePointController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\BranchOperationsController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DepartmentController;
use App\Http\Controllers\Api\DistributionController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\GenerationController;
use App\Http\Controllers\Api\HolidayController;
use App\Http\Controllers\Api\LeaveController;
use App\Http\Controllers\Api\MessageController;
use App\Http\Controllers\Api\PayrollController;
use App\Http\Controllers\Api\PermissionController;
use App\Http\Controllers\Api\RosterController;
use App\Http\Controllers\Api\SealController;
use App\Http\Controllers\Api\SetupController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TaskLinkController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WorkScheduleController;
use Illuminate\Support\Facades\Route;

// ---- Open: first setup and sign-in ----
Route::get('setup', [SetupController::class, 'status']);
Route::post('setup', [SetupController::class, 'store'])->middleware('throttle:10,1');
Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:30,1');
// A technician's private task link (from WhatsApp), without signing in.
Route::get('t/{token}', [TaskLinkController::class, 'show'])->middleware('throttle:60,1');
Route::post('t/{token}/{action}', [TaskLinkController::class, 'act'])->middleware('throttle:30,1');

Route::middleware(['auth:sanctum', 'active'])->group(function () {
    // Always reachable, even before the first password change.
    Route::get('me', [AuthController::class, 'me']);
    Route::post('me/password', [AuthController::class, 'changePassword'])->middleware('throttle:10,1');
    Route::post('auth/logout', [AuthController::class, 'logout']);

    Route::middleware('password.changed:profile')->group(function () {
        Route::get('employees/{user}', [EmployeeController::class, 'show']);
        Route::patch('employees/{user}/personal', [EmployeeController::class, 'updatePersonal']);
        Route::post('employees/{user}/attachments', [EmployeeController::class, 'uploadAttachment'])->middleware('throttle:30,1');
        Route::get('employees/{user}/attachments/{attachment}', [EmployeeController::class, 'downloadAttachment']);
        Route::delete('employees/{user}/attachments/{attachment}', [EmployeeController::class, 'deleteAttachment']);
    });

    Route::middleware('password.changed')->group(function () {
        Route::put('employees/{user}/leave-allowance', [LeaveController::class, 'allowance']);
        Route::get('leaves', [LeaveController::class, 'index']);
        Route::post('leaves', [LeaveController::class, 'store']);
        Route::post('leaves/{id}/read', [LeaveController::class, 'read'])->whereNumber('id');
        Route::patch('leaves/{id}', [LeaveController::class, 'decide'])->whereNumber('id');
        Route::get('employees/{user}/overview', [EmployeeController::class, 'overview']);
        Route::put('employees/{user}/field-report', [EmployeeController::class, 'saveFieldReport']);
        Route::get('dashboard', [DashboardController::class, 'show']);
        Route::get('branches', [BranchController::class, 'index'])->middleware('perm:branches.view');
        Route::post('branches', [BranchController::class, 'store'])->middleware('perm:branches.manage');
        Route::get('branches/{branch}/account-handoff', [AccountHandoffController::class, 'index']);
        Route::post('branches/{branch}/account-handoff', [AccountHandoffController::class, 'send'])->middleware('throttle:15,1');
        Route::get('messages/{message}/account-handoff', [AccountHandoffController::class, 'received']);
        Route::get('branches/{branch}', [BranchController::class, 'show'])->middleware('perm:branches.view');
        Route::patch('branches/{branch}', [BranchController::class, 'update'])->middleware('perm:branches.manage');
        Route::put('branches/{branch}/modules', [BranchController::class, 'updateModules'])->middleware('perm:branches.manage');
        Route::delete('branches/{branch}', [BranchController::class, 'destroy'])->middleware('perm:branches.manage');

        Route::get('branches/{branch}/roster/{user}', [RosterController::class, 'week'])->middleware('perm:schedules.manage');
        Route::put('branches/{branch}/roster/{user}', [RosterController::class, 'save'])->middleware('perm:schedules.manage');
        Route::put('branches/{branch}/departments/{department}', [DepartmentController::class, 'assign'])->middleware('perm:departments.manage');
        Route::get('schedules', [WorkScheduleController::class, 'index'])->middleware('perm:schedules.view');
        Route::post('schedules', [WorkScheduleController::class, 'store'])->middleware('perm:schedules.manage');
        Route::patch('schedules/{schedule}', [WorkScheduleController::class, 'update'])->middleware('perm:schedules.manage');
        Route::delete('schedules/{schedule}', [WorkScheduleController::class, 'destroy'])->middleware('perm:schedules.manage');

        Route::get('holidays', [HolidayController::class, 'index']);
        Route::post('holidays', [HolidayController::class, 'store'])->middleware('perm:holidays.manage');
        Route::delete('holidays/{holiday}', [HolidayController::class, 'destroy'])->middleware('perm:holidays.manage');

        Route::get('departments', [DepartmentController::class, 'index']);
        Route::post('departments', [DepartmentController::class, 'store'])->middleware('perm:departments.manage');
        Route::patch('departments/{department}', [DepartmentController::class, 'update'])->middleware('perm:departments.manage');
        Route::delete('departments/{department}', [DepartmentController::class, 'destroy'])->middleware('perm:departments.manage');

        Route::get('roles', [UserController::class, 'roles'])->middleware('perm:users.view,users.manage,permissions.manage');
        Route::get('users', [UserController::class, 'index'])->middleware('perm:users.view');
        Route::post('users', [UserController::class, 'store'])->middleware('perm:users.manage');
        Route::get('users/{user}', [UserController::class, 'show']);
        Route::patch('users/{user}', [UserController::class, 'update'])->middleware('perm:users.manage');
        Route::post('users/{user}/reset-password', [UserController::class, 'resetPassword'])->middleware('perm:users.manage');
        Route::delete('users/{user}', [UserController::class, 'destroy'])->middleware('perm:users.manage');

        Route::get('settings/branch/pages', [PermissionController::class, 'branchPages'])->middleware('perm:permissions.branch_manage');
        Route::put('settings/branch/users/{user}/page', [PermissionController::class, 'updateBranchPage'])->middleware('perm:permissions.branch_manage');
        Route::get('permissions', [PermissionController::class, 'index'])->middleware('perm:permissions.manage');
        Route::match(['put', 'patch'], 'roles/{role}/permissions', [PermissionController::class, 'updateRole'])->middleware('perm:permissions.manage');
        Route::get('users/{user}/permissions', [PermissionController::class, 'showUser'])->middleware('perm:permissions.manage');
        Route::put('users/{user}/permissions', [PermissionController::class, 'updateUser'])->middleware('perm:permissions.manage');

        Route::get('audit', [AuditController::class, 'index'])->middleware('perm:audit.view');

        // The employee file: the person themselves, or within the viewer's permissions (checked inside).
        Route::patch('employees/{user}/job', [EmployeeController::class, 'updateJob'])->middleware('perm:employees.manage');
        Route::post('employees/{user}/status', [EmployeeController::class, 'setStatus'])->middleware('perm:employees.manage');

        // Attendance: everyone punches and sees their own; managers see and fix their branch.
        Route::post('attendance/punch', [AttendanceController::class, 'punch'])->middleware('throttle:30,1');
        Route::post('generation/equipment/{kind}', [GenerationController::class, 'equipment'])->whereIn('kind', ['generator', 'fuel']);
        Route::get('generation/{date}', [GenerationController::class, 'show']);
        Route::put('generation/{date}', [GenerationController::class, 'save']);
        Route::post('generation/{date}/{action}', [GenerationController::class, 'transition'])->whereIn('action', ['submit', 'approve', 'return']);

        Route::post('distribution/zones', [DistributionController::class, 'zone']);
        Route::patch('distribution/zones/{zone}', [\App\Http\Controllers\Api\BranchSetupController::class, 'saveZone'])->whereNumber('zone');
        Route::get('branch-setup', [\App\Http\Controllers\Api\BranchSetupController::class, 'show']);
        Route::put('branch-setup/maintenance-plan', [\App\Http\Controllers\Api\BranchSetupController::class, 'savePlan']);
        Route::get('branch-setup/backup', [\App\Http\Controllers\Api\BranchSetupController::class, 'backup']);
        Route::get('dashboard/branch-operations', BranchOperationsController::class);
        Route::get('distribution/{date}', [DistributionController::class, 'show']);
        Route::put('distribution/{date}', [DistributionController::class, 'save']);
        Route::post('distribution/{date}/{action}', [DistributionController::class, 'transition'])->whereIn('action', ['submit', 'approve', 'return']);
        Route::get('seals', [SealController::class, 'show']);
        Route::get('seals/{number}/tasks', [SealController::class, 'tasks'])->whereNumber('number');
        Route::get('seals/history', [SealController::class, 'history']);
        Route::post('seals/import', [SealController::class, 'import']);
        Route::post('seals/{action}', [SealController::class, 'update'])
            ->whereIn('action', ['add-roll', 'update-roll', 'delete-roll', 'issue', 'assign-batch', 'update-batch', 'add-to-batch', 'delete-batch', 'record', 'return-to-stock']);
        Route::get('attendance/me', [AttendanceController::class, 'me']);
        Route::get('attendance/days/{day}/history', [AttendanceController::class, 'history']);
        Route::get('attendance/overview', [AttendanceController::class, 'overview'])->middleware('perm:attendance.view');
        Route::get('attendance/board', [AttendanceController::class, 'board'])->middleware('perm:attendance.view');
        Route::get('attendance/days', [AttendanceController::class, 'days'])->middleware('perm:attendance.view');
        Route::put('attendance/days', [AttendanceController::class, 'setDay'])->middleware('perm:attendance.manage');
        Route::post('attendance/approve', [AttendanceController::class, 'approve'])->middleware('perm:attendance.manage');
        Route::get('attendance/points', [AttendancePointController::class, 'index'])->middleware('perm:attendance.points');
        Route::post('attendance/points', [AttendancePointController::class, 'store'])->middleware('perm:attendance.points');
        Route::patch('attendance/points/{point}', [AttendancePointController::class, 'update'])->middleware('perm:attendance.points');
        Route::post('attendance/points/{point}/network', [AttendancePointController::class, 'addNetwork'])->middleware('perm:attendance.points');
        Route::delete('attendance/points/{point}/network', [AttendancePointController::class, 'removeNetwork'])->middleware('perm:attendance.points');
        Route::put('attendance/points/{point}/location', [AttendancePointController::class, 'setLocation'])->middleware('perm:attendance.points');
        Route::post('attendance/points/{point}/rotate', [AttendancePointController::class, 'rotate'])->middleware('perm:attendance.points');

        // Payroll: settings, deductions and bonuses, advances, pay batches; everyone sees their own pay.
        Route::get('payroll/mine', [PayrollController::class, 'mine']);
        Route::get('payroll/settings', [PayrollController::class, 'settings'])->middleware('perm:payroll.manage');
        Route::post('payroll/settings', [PayrollController::class, 'storeSetting'])->middleware('perm:payroll.manage');
        Route::get('payroll/adjustments', [PayrollController::class, 'adjustments'])->middleware('perm:payroll.manage');
        Route::post('payroll/adjustments', [PayrollController::class, 'storeAdjustment'])->middleware('perm:payroll.manage');
        Route::delete('payroll/adjustments/{adjustment}', [PayrollController::class, 'destroyAdjustment'])->middleware('perm:payroll.manage');
        Route::get('payroll/advances', [PayrollController::class, 'advances'])->middleware('perm:payroll.manage');
        Route::post('payroll/advances', [PayrollController::class, 'storeAdvance'])->middleware('perm:payroll.manage');
        Route::delete('payroll/advances/{advance}', [PayrollController::class, 'destroyAdvance'])->middleware('perm:payroll.manage');
        Route::get('payroll/plan', [PayrollController::class, 'plan'])->middleware('perm:payroll.manage');
        Route::get('payroll/batches', [PayrollController::class, 'batches'])->middleware('perm:payroll.view,payroll.manage');
        Route::post('payroll/batches', [PayrollController::class, 'storeBatch'])->middleware('perm:payroll.manage');
        Route::get('payroll/batches/{batch}', [PayrollController::class, 'showBatch'])->middleware('perm:payroll.view,payroll.manage');
        Route::post('payroll/batches/{batch}/recalculate', [PayrollController::class, 'recalculate'])->middleware('perm:payroll.manage');
        Route::post('payroll/batches/{batch}/approve', [PayrollController::class, 'approve'])->middleware('perm:payroll.approve');
        Route::post('payroll/batches/{batch}/paid', [PayrollController::class, 'markPaid'])->middleware('perm:payroll.manage');
        Route::delete('payroll/batches/{batch}', [PayrollController::class, 'destroyBatch'])->middleware('perm:payroll.manage');
        Route::get('payroll/batches/{batch}/export', [PayrollController::class, 'export'])->middleware('perm:payroll.view,payroll.manage');

        // Field tasks: the office plans and follows; technicians start and finish their own.
        Route::get('tasks/mine', [TaskController::class, 'mine']);
        Route::get('tasks/options', [TaskController::class, 'options'])->middleware('perm:tasks.view,tasks.manage');
        Route::get('tasks', [TaskController::class, 'index'])->middleware('perm:tasks.view,tasks.manage');
        Route::post('tasks', [TaskController::class, 'store'])->middleware('perm:tasks.manage');
        Route::post('task-types', [TaskController::class, 'saveType'])->middleware('perm:tasks.manage');
        Route::patch('task-types/{type}', [TaskController::class, 'saveType'])->middleware('perm:tasks.manage');
        Route::post('zones', [TaskController::class, 'saveZone'])->middleware('perm:tasks.manage');
        Route::patch('zones/{zone}', [TaskController::class, 'saveZone'])->middleware('perm:tasks.manage');
        Route::get('tasks/archive', [TaskController::class, 'archive'])->middleware('perm:tasks.view');
        Route::get('tasks/subscribers', [TaskController::class, 'subscribers'])->middleware('perm:tasks.manage');
        Route::put('tasks/subscribers', [TaskController::class, 'importSubscribers'])->middleware('perm:tasks.manage');
        Route::get('tasks/{task}', [TaskController::class, 'show']);
        Route::patch('tasks/{task}', [TaskController::class, 'update'])->middleware('perm:tasks.manage');
        Route::get('tasks/{task}/photo', [TaskController::class, 'photo']);
        Route::post('tasks/{task}/{action}', [TaskController::class, 'act'])->middleware('throttle:60,1');

        // Internal mail: everyone, within who-may-write-to-whom.
        Route::get('messages', [MessageController::class, 'index']);
        Route::get('messages/unread', [MessageController::class, 'unread']);
        Route::get('messages/recipients', [MessageController::class, 'recipients']);
        Route::post('messages', [MessageController::class, 'store'])->middleware('throttle:60,1');
        Route::get('messages/{message}', [MessageController::class, 'show']);
        Route::post('messages/{message}/sms', [MessageController::class, 'smsReply'])->middleware('throttle:5,1');
        Route::post('messages/{message}/archive', [MessageController::class, 'archive']);
        Route::post('messages/{message}/unread', [MessageController::class, 'markUnread']);
        Route::get('messages/{message}/attachments/{attachment}', [MessageController::class, 'attachment']);
    });
});
