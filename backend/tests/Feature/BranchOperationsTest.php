<?php

namespace Tests\Feature;

use App\Models\BranchModule;
use App\Models\Role;
use App\Models\TaskType;
use Illuminate\Support\Str;
use Tests\TestCase;

class BranchOperationsTest extends TestCase
{
    public function test_distribution_calculates_cross_midnight_hours_and_enforces_branch_and_version(): void
    {
        $branch = $this->makeBranch();
        $elsewhere = $this->makeBranch('فرع آخر');
        $this->actAs(Role::BRANCH_MANAGER, $branch);
        $date = now(config('app.business_timezone'))->toDateString();
        $url = "/api/distribution/{$date}";
        $zone = $this->postJson('/api/distribution/zones', ['name' => 'المنطقة الأولى'])->assertCreated()->json('id');
        $body = ['version' => 0, 'notes' => 'اختبار', 'zones' => [[
            'id' => Str::uuid()->toString(), 'zoneId' => $zone, 'supplied' => true,
            'runs' => [['id' => Str::uuid()->toString(), 'runNo' => 1, 'start' => '22:30', 'end' => '01:00', 'loadUnit' => 'A', 'loads' => [null, null, null], 'extra' => []]],
            'bands' => array_fill(0, 6, [null, null, null]),
        ]]];
        $this->putJson($url, $body)->assertOk()->assertJsonPath('sheet.zones.0.supplyHours', 2.5);
        $this->putJson($url, $body)->assertConflict();
        $this->postJson("{$url}/submit", ['version' => 1])->assertOk();
        $this->getJson('/api/dashboard/branch-operations')->assertOk()->assertJsonPath('sheets.0.status', 'submitted');
        $this->postJson("{$url}/approve", ['version' => 2])->assertOk()->assertJsonPath('sheet.status', 'approved');
        $this->getJson("{$url}?branch_id={$elsewhere->id}")->assertForbidden();
        BranchModule::updateOrCreate(['branch_id' => $branch->id, 'module' => 'distribution'], ['is_enabled' => false]);
        $this->getJson($url)->assertForbidden();
        $this->getJson('/api/dashboard/branch-operations')->assertOk()->assertJsonCount(0, 'sheets');
    }

    public function test_loads_entered_in_distribution_are_visible_in_the_generation_report(): void
    {
        $branch = $this->makeBranch();
        $this->actAs(Role::BRANCH_MANAGER, $branch);
        $date = now(config('app.business_timezone'))->toDateString();
        $generator = $this->postJson('/api/generation/equipment/generator', ['name' => 'مولد تجريبي', 'brand' => 'Perkins', 'isActive' => true])
            ->assertOk()->json('id');
        $bands = [400, null, 360, null, null, null, null];
        $url = "/api/distribution/{$date}";
        $this->putJson($url, ['version' => 0, 'zones' => [], 'generatorLoadEdits' => [[
            'generator_id' => $generator, 'load_unit' => 'A', 'band_loads' => $bands,
        ]]])->assertOk();
        $this->getJson($url)->assertOk()->assertJsonPath('generatorLoads.0.band_loads.0', 400);
        $this->putJson("/api/generation/{$date}", ['version' => 0, 'fuel' => [], 'maintenance' => [], 'generators' => [[
            'id' => Str::uuid()->toString(), 'generatorId' => $generator, 'didRun' => true, 'runs' => [],
            'loads' => [20, 22, 24], 'loadUnit' => 'kW', 'bandLoads' => array_fill(0, 7, null), 'oilPressureUnit' => 'bar',
        ]]])->assertOk()->assertJsonPath('report.generators.0.bandLoads', $bands)
            ->assertJsonPath('report.generators.0.storedLoads.loads', [20, 22, 24]);
    }

    public function test_legacy_seal_import_preserves_names_and_skips_existing_rolls(): void
    {
        $this->actAs(Role::BRANCH_MANAGER, $this->makeBranch());
        $date = now(config('app.business_timezone'))->toDateString();
        $body = [
            'rolls' => [[
                'from' => 880001, 'to' => 880003, 'received_on' => $date, 'damaged' => [880003],
                'batches' => [['date' => $date, 'tech' => 'فني سابق', 'seals' => [880001, 880002], 'label' => 'الأولى']],
            ]],
            'usage' => [['no' => 880001, 'status' => 'used', 'used_on' => $date, 'details' => 'طبلون 18', 'sheet' => 'فني سابق']],
        ];
        $this->postJson('/api/seals/import', $body)->assertOk()->assertJsonPath('used', 1);
        $this->postJson('/api/seals/import', $body)->assertOk()->assertJsonPath('skipped', 1);
        $this->getJson('/api/seals')->assertOk()->assertJsonCount(1, 'rolls')->assertJsonPath('seals.0.boardNo', '18')
            ->assertJsonPath('seals.2.status', 'damaged')->assertJsonCount(1, 'historicalNames');
    }

    public function test_linking_a_seal_completes_a_prepared_task_only_if_the_seal_can_be_saved(): void
    {
        $branch = $this->makeBranch();
        $this->actAs(Role::BRANCH_MANAGER, $branch);
        $technician = $this->makeUser(Role::EMPLOYEE, $branch);
        $technician->employee()->update(['job_title' => 'فني كهرباء']);
        $today = now(config('app.business_timezone'))->toDateString();
        $task = $this->postJson('/api/tasks', ['task_type_id' => TaskType::create(['name' => 'تفتيش'])->id])->assertCreated()->json('task.id');
        $this->postJson('/api/seals/add-roll', ['from' => 880001, 'to' => 880001, 'date' => $today])->assertOk();
        $this->postJson('/api/seals/issue', ['technician' => $technician->id, 'date' => $today, 'seals' => [880001]])->assertOk();
        $this->getJson('/api/seals/880001/tasks')->assertOk()->assertJsonPath('tasks.0.id', (string) $task);
        $body = ['number' => 880001, 'task_id' => $task, 'status' => 'used', 'details' => 'تفتيش الطبلون', 'board' => '301'];
        $yesterday = now(config('app.business_timezone'))->subDay()->toDateString();
        $this->postJson('/api/seals/record', $body + ['date' => $yesterday])->assertUnprocessable();
        $this->getJson("/api/tasks/{$task}")->assertOk()->assertJsonPath('task.status', 'new');
        $this->postJson('/api/seals/record', $body + ['date' => $today])->assertOk();
        $this->getJson("/api/tasks/{$task}")->assertOk()->assertJsonPath('task.status', 'done')->assertJsonPath('task.assignees.0.id', $technician->id);
        $this->getJson('/api/seals')->assertOk()->assertJsonPath('seals.0.taskId', (string) $task);
    }

    public function test_seal_stock_and_batch_changes_are_atomic_and_branch_scoped(): void
    {
        $branch = $this->makeBranch();
        $other = $this->makeBranch('فرع آخر');
        $date = now(config('app.business_timezone'))->toDateString();
        $this->actAs(Role::BRANCH_MANAGER, $branch);
        $roll = $this->postJson('/api/seals/add-roll', ['from' => 880001, 'to' => 880003, 'date' => $date])->assertOk()->json('result');
        $this->postJson('/api/seals/add-roll', ['from' => 880003, 'to' => 880004, 'date' => $date])->assertUnprocessable();
        $batch = $this->postJson('/api/seals/issue', ['date' => $date, 'seals' => [880001, 880002]])
            ->assertOk()->json('result.batch_id');
        $this->postJson('/api/seals/update-batch', ['id' => $batch, 'date' => $date, 'add' => [990001], 'remove' => [880001]])->assertUnprocessable();
        $this->getJson('/api/seals')->assertOk()->assertJsonPath('seals.0.status', 'issued')->assertJsonCount(3, 'seals');
        $this->postJson('/api/seals/update-batch', ['id' => $batch, 'date' => $date, 'add' => [880003], 'remove' => [880001]])->assertOk();
        $this->getJson('/api/seals')->assertOk()->assertJsonPath('seals.0.status', 'in_stock')->assertJsonPath('seals.2.batchId', $batch);
        $this->getJson('/api/seals/history?record='.$batch)->assertOk()->assertJsonCount(2, 'events');

        $this->actAs(Role::BRANCH_MANAGER, $other);
        $this->getJson('/api/seals')->assertOk()->assertJsonCount(0, 'rolls');
        $this->postJson('/api/seals/delete-roll', ['id' => $roll])->assertNotFound();
        $this->actAs(Role::EMPLOYEE, $branch);
        $this->getJson('/api/seals')->assertForbidden();
        $this->getJson('/api/dashboard/branch-operations')->assertForbidden();
    }
}
