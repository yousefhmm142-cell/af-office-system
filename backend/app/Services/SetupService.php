<?php

namespace App\Services;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\AccessSeeder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * The very first account. On an empty system anyone who opens the site can create the
 * super admin once (like "تجهيز النظام" in the old system), so shared hosting without
 * SSH still works. After that it is closed for good.
 */
class SetupService
{
    public function needed(): bool
    {
        return ! User::withTrashed()->exists();
    }

    public function createSuperAdmin(string $name, string $username, string $password): User
    {
        return Cache::lock('first-setup', 10)->block(5, function () use ($name, $username, $password) {
            return DB::transaction(function () use ($name, $username, $password) {
                if (! $this->needed()) {
                    throw new RuntimeException('already_set_up');
                }
                (new AccessSeeder)->run();

                return User::create([
                    'name' => trim($name),
                    'username' => User::normalizeUsername($username),
                    'password' => $password,
                    'role_id' => Role::where('key', Role::SUPER_ADMIN)->value('id'),
                    'branch_id' => null,
                    'is_active' => true,
                    'must_change_password' => false,
                ]);
            });
        });
    }
}
