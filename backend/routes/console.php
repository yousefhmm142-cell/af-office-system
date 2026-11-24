<?php

use App\Models\Role;
use App\Models\User;
use Database\Seeders\AccessSeeder;
use Illuminate\Support\Facades\Artisan;

/*
 * Create (or restore access for) a super admin from the server's command line.
 * The password is asked for and never typed on the command line itself.
 */
Artisan::command('app:super-admin {username} {--name=}', function (string $username) {
    (new AccessSeeder)->run();
    $username = User::normalizeUsername($username);
    $password = $this->secret('الرمز (6 خانات على الأقل)');
    if (mb_strlen((string) $password) < config('access.login.password_min')) {
        $this->error('الرمز قصير جداً.');

        return 1;
    }
    $user = User::withTrashed()->firstOrNew(['username' => $username]);
    $user->fill([
        'name' => $this->option('name') ?: ($user->name ?: $username),
        'password' => $password,
        'role_id' => Role::where('key', Role::SUPER_ADMIN)->value('id'),
        'branch_id' => null,
        'is_active' => true,
        'must_change_password' => false,
    ]);
    $user->deleted_at = null;
    $user->failed_logins = 0;
    $user->locked_until = null;
    $user->save();
    $this->info("تم: أصبح {$username} سوبر أدمن.");
})->purpose('Create or restore a super admin account');
