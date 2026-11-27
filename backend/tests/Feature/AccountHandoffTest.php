<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AccountHandoffTest extends TestCase
{
    public function test_hiring_and_delivering_a_branch_roster(): void
    {
        $branch = $this->makeBranch();
        $other = $this->makeBranch('الفرع الثاني');
        $hr = $this->actAs(Role::HR);
        $account = ['branch_id'=>$branch->id, 'role_id'=>Role::where('key',Role::EMPLOYEE)->value('id'),
            'name'=>'موظف التحصيل','department_name'=>'التحصيل الميداني','password'=>'543219'];
        $first = $this->postJson('/api/users',$account+['username'=>'collector.one'])->assertCreated()->json('user.id');
        $this->postJson('/api/users',$account+['username'=>'collector.two'])->assertCreated();
        $this->assertSame(1,Department::where('name',$account['department_name'])->count());
        $this->assertDatabaseHas('branch_department',['branch_id'=>$branch->id,'department_id'=>Department::where('name',$account['department_name'])->value('id')]);
        $this->assertNotSame($account['password'],DB::table('users')->where('id',$first)->value('handoff_code'));
        $this->makeUser(Role::EMPLOYEE,$other);
        $path="/api/branches/{$branch->id}/account-handoff";
        $this->postJson($path)->assertUnprocessable();
        $manager=$this->makeUser(Role::BRANCH_MANAGER,$branch);
        $this->getJson($path)->assertOk()->assertJsonCount(2,'rows')->assertJsonPath('rows.0.code',$account['password']);
        $message=$this->postJson($path)->assertCreated()->json('message_id');
        $this->postJson('/api/users',$account+['username'=>'collector.three'])->assertCreated();
        $receipt="/api/messages/$message/account-handoff";
        $this->actAs(Role::BRANCH_MANAGER,$other);
        $this->getJson($receipt)->assertForbidden();
        Sanctum::actingAs($manager);
        $this->getJson($path)->assertForbidden();
        $this->getJson($receipt)->assertOk()->assertJsonCount(2,'rows');
        Sanctum::actingAs($hr);
        $this->postJson("/api/users/$first/reset-password",['password'=>'864201'])->assertOk();
        $this->getJson($receipt)->assertOk()->assertJsonPath('rows.0.code','864201');
        Sanctum::actingAs(User::findOrFail($first));
        $this->postJson('/api/me/password',['current_password'=>'864201','password'=>'975310','password_confirmation'=>'975310'])->assertOk();
        Sanctum::actingAs($manager);
        $this->getJson($receipt)->assertOk()->assertJsonPath('rows.0.code',null);
        $this->assertDatabaseHas('users',['id'=>$first,'handoff_code'=>null]);
    }
}
