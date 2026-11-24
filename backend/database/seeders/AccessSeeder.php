<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Syncs roles and permissions from config/access.php. Safe to run again:
 * a default grant is only added for a role or a permission that did not exist before,
 * so changes made from the permissions screen are never overwritten.
 */
class AccessSeeder extends Seeder
{
    public function run(): void
    {
        $cfg = config('access');
        $newRoles = [];
        $newPerms = [];

        foreach ($cfg['roles'] as $key => $r) {
            $role = Role::firstOrNew(['key' => $key]);
            if (! $role->exists) {
                $newRoles[] = $key;
            }
            $role->fill(['name' => $r['name'], 'level' => $r['level'], 'is_system' => true])->save();
        }

        $order = 0;
        foreach ($cfg['permissions'] as $key => [$name, $group]) {
            $perm = Permission::firstOrNew(['key' => $key]);
            if (! $perm->exists) {
                $newPerms[] = $key;
            }
            $perm->fill(['name' => $name, 'group' => $group, 'sort_order' => $order += 10])->save();
        }

        $roles = Role::pluck('id', 'key');
        $perms = Permission::pluck('id', 'key');

        foreach ($cfg['defaults'] as $roleKey => $grants) {
            foreach ($grants as $permKey => $scope) {
                if (! in_array($roleKey, $newRoles, true) && ! in_array($permKey, $newPerms, true)) {
                    continue;
                }
                DB::table('role_permissions')->insertOrIgnore([
                    'role_id' => $roles[$roleKey],
                    'permission_id' => $perms[$permKey],
                    'scope' => $scope,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }
}
