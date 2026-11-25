<?php

namespace Tests\Feature;

use App\Models\Role;
use Illuminate\Support\Str;
use Tests\TestCase;

class GenerationTest extends TestCase
{
    public function test_branch_report_recalculates_figures_and_controls_its_workflow(): void
    {
        $branch = $this->makeBranch();
        $other = $this->makeBranch('فرع آخر');
        $this->actAs(Role::BRANCH_MANAGER, $branch);
        $date = now(config('app.business_timezone'))->toDateString();
        $url = "/api/generation/{$date}";

        $fuel = $this->postJson('/api/generation/equipment/fuel', ['name' => 'سولار', 'isActive' => true])->assertOk()->json('id');
        $generator = $this->postJson('/api/generation/equipment/generator', [
            'name' => 'المولد الأول', 'brand' => 'Perkins', 'isActive' => true,
        ])->assertOk()->json('id');

        $body = [
            'version' => 0,
            'fuel' => [[
                'id' => (string) Str::uuid(), 'fuelTypeId' => $fuel, 'openingBalance' => 100, 'receivedQty' => 30, 'closingBalance' => 102,
            ]],
            'generators' => [[
                'id' => (string) Str::uuid(), 'generatorId' => $generator, 'didRun' => true,
                'runs' => [['id' => (string) Str::uuid(), 'runNo' => 1, 'start' => '23:30', 'end' => '01:00']],
                'loadUnit' => 'A', 'loads' => [null, null, null], 'bandLoads' => array_fill(0, 7, null), 'oilPressureUnit' => 'bar',
            ]],
            'maintenance' => [],
        ];
        $this->putJson($url, $body)->assertOk()
            ->assertJsonPath('report.fuel.0.consumption', 28)
            ->assertJsonPath('report.generators.0.runHours', 1.5);
        $this->putJson($url, $body)->assertConflict();
        $this->postJson("{$url}/submit", ['version' => 1])->assertOk()->assertJsonPath('report.status', 'submitted');
        $this->postJson("{$url}/approve", ['version' => 2])->assertOk()->assertJsonPath('report.status', 'approved');
        $this->postJson("{$url}/return", ['version' => 3])->assertUnprocessable();
        $this->postJson("{$url}/return", ['version' => 3, 'reason' => 'مراجعة الرصيد'])->assertOk()
            ->assertJsonPath('report.status', 'returned');
        $this->getJson("{$url}?branch_id={$other->id}")->assertForbidden();
        $this->actAs(Role::EMPLOYEE, $branch);
        $this->getJson($url)->assertForbidden();
    }
}
