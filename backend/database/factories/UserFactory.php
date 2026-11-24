<?php

namespace Database\Factories;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<User> */
class UserFactory extends Factory
{
    protected $model = User::class;

    public function definition(): array
    {
        return [
            'name' => 'موظف '.Str::random(5),
            'username' => 'user_'.Str::lower(Str::random(8)),
            'password' => 'secret123',
            'role_id' => fn () => Role::where('key', Role::EMPLOYEE)->value('id'),
            'branch_id' => null,
            'is_active' => true,
            'must_change_password' => false,
        ];
    }
}
