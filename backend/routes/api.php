<?php

use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\DepartmentController;
use App\Http\Controllers\Api\HolidayController;
use App\Http\Controllers\Api\PermissionController;
use App\Http\Controllers\Api\SetupController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WorkScheduleController;
use Illuminate\Support\Facades\Route;

// ---- Open: first setup and sign-in ----
Route::get('setup', [SetupController::class, 'status']);
Route::post('setup', [SetupController::class, 'store'])->middleware('throttle:10,1');
Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:30,1');

Route::middleware(['auth:sanctum', 'active'])->group(function () {
    // Always reachable, even before the first password change.
    Route::get('me', [AuthController::class, 'me']);
    Route::post('me/password', [AuthController::class, 'changePassword'])->middleware('throttle:10,1');
    Route::post('auth/logout', [AuthController::class, 'logout']);

    Route::middleware('password.changed')->group(function () {
        Route::get('branches', [BranchController::class, 'index'])->middleware('perm:branches.view');
        Route::post('branches', [BranchController::class, 'store'])->middleware('perm:branches.manage');
        Route::get('branches/{branch}', [BranchController::class, 'show'])->middleware('perm:branches.view');
        Route::patch('branches/{branch}', [BranchController::class, 'update'])->middleware('perm:branches.manage');
        Route::put('branches/{branch}/modules', [BranchController::class, 'updateModules'])->middleware('perm:branches.manage');
        Route::delete('branches/{branch}', [BranchController::class, 'destroy'])->middleware('perm:branches.manage');

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

        Route::get('permissions', [PermissionController::class, 'index'])->middleware('perm:permissions.manage');
        Route::put('roles/{role}/permissions', [PermissionController::class, 'updateRole'])->middleware('perm:permissions.manage');
        Route::get('users/{user}/permissions', [PermissionController::class, 'showUser'])->middleware('perm:permissions.manage');
        Route::put('users/{user}/permissions', [PermissionController::class, 'updateUser'])->middleware('perm:permissions.manage');

        Route::get('audit', [AuditController::class, 'index'])->middleware('perm:audit.view');
    });
});
