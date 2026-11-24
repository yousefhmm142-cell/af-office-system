<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Tests\TestCase;

class AuthTest extends TestCase
{
    public function test_first_setup_creates_the_super_admin_once(): void
    {
        $this->getJson('/api/setup')->assertJson(['needed' => true]);

        $this->postJson('/api/setup', [
            'name' => 'يوسف', 'username' => 'Yousef', 'password' => 'secret123', 'password_confirmation' => 'secret123',
        ])->assertCreated()->assertJsonPath('user.role.key', Role::SUPER_ADMIN)->assertJsonPath('user.username', 'yousef');

        $this->getJson('/api/setup')->assertJson(['needed' => false]);
        $this->postJson('/api/setup', [
            'name' => 'غريب', 'username' => 'other', 'password' => 'secret123', 'password_confirmation' => 'secret123',
        ])->assertStatus(409);
        $this->assertSame(1, User::count());
    }

    public function test_login_with_username_and_password(): void
    {
        $this->makeUser(Role::EMPLOYEE, $this->makeBranch(), ['username' => 'ahmad']);

        $this->postJson('/api/auth/login', ['username' => ' Ahmad ', 'password' => 'secret123'])
            ->assertOk()->assertJsonStructure(['token', 'user' => ['permissions', 'modules']]);

        $this->postJson('/api/auth/login', ['username' => 'ahmad', 'password' => 'wrong'])
            ->assertStatus(422)->assertJsonPath('errors.username.0', 'اسم المستخدم أو الرمز غلط.');
        $this->postJson('/api/auth/login', ['username' => 'nobody', 'password' => 'secret123'])->assertStatus(422);
    }

    public function test_account_locks_after_five_wrong_tries(): void
    {
        $this->makeUser(Role::EMPLOYEE, $this->makeBranch(), ['username' => 'ahmad']);
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['username' => 'ahmad', 'password' => 'wrong'])->assertStatus(422);
        }
        // Even the right password waits until the lock ends.
        $this->postJson('/api/auth/login', ['username' => 'ahmad', 'password' => 'secret123'])->assertStatus(423)->assertJsonPath('code', 'locked');

        $this->travel(16)->minutes();
        $this->postJson('/api/auth/login', ['username' => 'ahmad', 'password' => 'secret123'])->assertOk();
    }

    public function test_inactive_user_cannot_login_or_use_a_saved_token(): void
    {
        $user = $this->makeUser(Role::EMPLOYEE, $this->makeBranch(), ['username' => 'ahmad']);
        $token = $user->createToken('phone')->plainTextToken;
        $user->update(['is_active' => false]);

        $this->postJson('/api/auth/login', ['username' => 'ahmad', 'password' => 'secret123'])->assertStatus(422);
        $this->withToken($token)->getJson('/api/me')->assertStatus(401)->assertJsonPath('code', 'inactive');
    }

    public function test_temporary_password_must_be_changed_first(): void
    {
        $user = $this->makeUser(Role::HR, null, ['must_change_password' => true]);
        $token = $user->createToken('phone')->plainTextToken;
        $other = $user->createToken('laptop')->plainTextToken;

        $this->withToken($token)->getJson('/api/branches')->assertStatus(403)->assertJsonPath('code', 'must_change_password');
        $this->withToken($token)->getJson('/api/me')->assertOk();

        $this->withToken($token)->postJson('/api/me/password', [
            'current_password' => 'secret123', 'password' => 'secret123', 'password_confirmation' => 'secret123',
        ])->assertStatus(422);
        $this->withToken($token)->postJson('/api/me/password', [
            'current_password' => 'secret123', 'password' => 'newpass99', 'password_confirmation' => 'newpass99',
        ])->assertOk()->assertJsonPath('user.must_change_password', false);

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/branches')->assertOk();
        // The other device was signed out.
        $this->assertSame(1, $user->tokens()->count());
        $this->app['auth']->forgetGuards();
        $this->withToken($other)->getJson('/api/me')->assertStatus(401);
    }

    public function test_logout_revokes_the_token(): void
    {
        $user = $this->makeUser(Role::EMPLOYEE, $this->makeBranch());
        $token = $user->createToken('phone')->plainTextToken;
        $this->withToken($token)->postJson('/api/auth/logout')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/me')->assertStatus(401);
    }
}
