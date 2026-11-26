<?php

namespace Tests\Feature;

use App\Models\Role;
use Tests\TestCase;

class BranchSetupTest extends TestCase
{
    public function test_branch_manager_manages_own_lists_and_plan(): void
    {
        $branch = $this->makeBranch();
        $this->actAs(Role::BRANCH_MANAGER, $branch);

        $this->postJson('/api/generation/equipment/generator', ['name' => 'المولد 1', 'brand' => 'Perkins', 'isActive' => true])->assertOk();
        $this->postJson('/api/generation/equipment/fuel', ['name' => 'سولار', 'isActive' => true])->assertOk();
        $zone = $this->postJson('/api/distribution/zones', ['name' => 'الرازي'])->assertCreated()->json('id');
        $this->patchJson("/api/distribution/zones/{$zone}", ['name' => 'الرازي الجديد', 'isActive' => false])->assertOk();
        $this->putJson('/api/branch-setup/maintenance-plan', ['plan' => ['oil_filter' => ['hours' => 300], 'belt' => ['days' => null]]])->assertOk();

        $res = $this->getJson('/api/branch-setup')->assertOk();
        $this->assertSame('المولد 1', $res->json('generators.0.name'));
        $this->assertSame('سولار', $res->json('fuelTypes.0.name'));
        $this->assertSame(['id' => $zone, 'name' => 'الرازي الجديد', 'isActive' => false, 'sortOrder' => 1], $res->json('zones.0'));
        $this->assertSame(['oil_filter' => ['hours' => 300]], $res->json('maintenancePlan'));
        $this->assertTrue($res->json('can.generation'));
    }

    public function test_cannot_touch_another_branch(): void
    {
        $mine = $this->makeBranch('أ');
        $other = $this->makeBranch('ب');
        $this->actAs(Role::BRANCH_MANAGER, $mine);
        $this->getJson("/api/branch-setup?branch_id={$other->id}")->assertForbidden();
        $this->putJson("/api/branch-setup/maintenance-plan?branch_id={$other->id}", ['plan' => []])->assertForbidden();
    }

    public function test_employee_cannot_open_settings(): void
    {
        $this->actAs(Role::EMPLOYEE, $this->makeBranch());
        $this->getJson('/api/branch-setup')->assertForbidden();
    }

    public function test_backup_downloads_branch_data(): void
    {
        $this->actAs(Role::BRANCH_MANAGER, $this->makeBranch());
        $this->postJson('/api/generation/equipment/fuel', ['name' => 'سولار', 'isActive' => true])->assertOk();
        $res = $this->get('/api/branch-setup/backup')->assertOk();
        $this->assertStringContainsString('سولار', $res->streamedContent());
        $this->assertNotNull($this->getJson('/api/branch-setup')->json('lastBackupAt'));
    }
}
