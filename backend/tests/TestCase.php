<?php

namespace Tests;

use App\Models\Branch;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AccessSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Laravel\Sanctum\Sanctum;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessSeeder::class);
    }

    protected function makeUser(string $role, ?Branch $branch = null, array $attrs = []): User
    {
        return User::factory()->create($attrs + [
            'role_id' => Role::where('key', $role)->value('id'),
            'branch_id' => $branch?->id,
        ]);
    }

    protected function actAs(string $role, ?Branch $branch = null, array $attrs = []): User
    {
        $user = $this->makeUser($role, $branch, $attrs);
        Sanctum::actingAs($user);

        return $user;
    }

    protected function makeBranch(string $name = 'مخيم 2'): Branch
    {
        return Branch::create(['name' => $name]);
    }
}
