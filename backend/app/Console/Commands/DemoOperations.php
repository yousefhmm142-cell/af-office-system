<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\DistributionController;
use App\Http\Controllers\Api\GenerationController;
use App\Http\Controllers\Api\LeaveController;
use App\Http\Controllers\Api\SealController;
use App\Models\Branch;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Three weeks of generation reports, distribution sheets and seals for the demo branches, made
 * through the same server functions the pages call (save, submit, approve), so they look real.
 */
class DemoOperations extends Command
{
    protected $signature = 'app:demo-operations {--days=21}';

    protected $description = 'بيانات تجريبية للتوليد والتوزيع والأختام في فروع العرض';

    public function handle(): int
    {
        $today = CarbonImmutable::now(config('app.business_timezone'))->startOfDay();
        $days = (int) $this->option('days');
        $branches = Branch::whereNotNull('manager_user_id')->orderBy('id')->get();
        if ($branches->isEmpty()) {
            $this->error('شغّل php artisan app:demo أولاً.');

            return self::FAILURE;
        }
        mt_srand(7);
        foreach ($branches as $branch) {
            if (DB::table('generation_reports')->where('branch_id', $branch->id)->exists()) {
                continue;
            }
            $manager = User::find($branch->manager_user_id);
            $gens = DB::table('generation_generators')->where('branch_id', $branch->id)->orderBy('id')->get();
            $fuels = DB::table('generation_fuel_types')->where('branch_id', $branch->id)->orderBy('id')->pluck('id');
            $zones = DB::table('distribution_zones')->where('branch_id', $branch->id)->orderBy('id')->pluck('id');
            $closing = 3200.0;
            for ($i = $days; $i >= 1; $i--) {
                $date = $today->subDays($i)->toDateString();
                // Generation: diesel in, used and left; who ran and when; loads; sometimes a maintenance.
                $received = $i % 3 === 0 ? 3000.0 : 0.0;
                $used = (float) mt_rand(930, 1060);
                $left = max(150.0, $closing + $received - $used);
                $fuel = [['id' => (string) Str::uuid(), 'fuelTypeId' => $fuels[0], 'openingBalance' => $i === $days ? $closing : null, 'receivedQty' => $received ?: null,
                    'closingBalance' => $left, 'shipmentNo' => $received ? 'SH-'.mt_rand(1000, 9999) : null, 'supplier' => $received ? 'مورّد الوقود' : null, 'unitPrice' => null, 'notes' => null]];
                $closing = $left;
                $plans = [[['06:00', '14:00'], ['18:00', '02:00']], [['14:00', '18:00']], [['02:00', '06:00']]];
                $generators = [];
                foreach ($gens as $k => $g) {
                    $runs = $plans[$k] ?? [];
                    $amp = (int) round(((float) $g->capacity_kva ?: 300) * (mt_rand(40, 62) / 100));
                    $ran = $runs !== [];
                    $generators[] = ['id' => (string) Str::uuid(), 'generatorId' => $g->id, 'didRun' => $ran,
                        'runs' => array_map(fn ($r, $n) => ['id' => (string) Str::uuid(), 'runNo' => $n + 1, 'start' => $r[0], 'end' => $r[1]], $runs, array_keys($runs)),
                        'loadUnit' => 'A', 'loads' => $ran ? [$amp, max(0, $amp - mt_rand(5, 20)), max(0, $amp - mt_rand(0, 15))] : [null, null, null],
                        'bandLoads' => array_map(fn () => $ran ? mt_rand((int) ($amp * 0.6), $amp) : null, range(1, 7)),
                        'temperatureC' => $ran ? mt_rand(80, 92) : null, 'oilPressure' => $ran ? mt_rand(30, 42) / 10 : null, 'oilPressureUnit' => 'bar', 'notes' => null];
                }
                $maintenance = $i % 9 === 0 ? [['id' => (string) Str::uuid(), 'generatorId' => $gens[0]->id, 'oilNewLiters' => 40, 'oilUsedLiters' => 38, 'types' => ['oil_change', 'oil_filter'], 'description' => 'تغيير زيت وفلتر']] : [];
                $this->call_($manager, fn (Request $r) => app(GenerationController::class)->save($r, $date), 'PUT', ['version' => 0, 'fuel' => $fuel, 'generators' => $generators, 'maintenance' => $maintenance, 'generalNotes' => null]);
                $this->call_($manager, fn (Request $r) => app(GenerationController::class)->transition($r, $date, 'submit'), 'POST', ['version' => 1]);
                if ($i > 1) {
                    $this->call_($manager, fn (Request $r) => app(GenerationController::class)->transition($r, $date, 'approve'), 'POST', ['version' => 2]);
                }

                // Distribution: every zone fed in two runs, three phase readings per band.
                $sheetZones = [];
                foreach ($zones as $z => $zoneId) {
                    $base = mt_rand(70, 140);
                    $supplied = ! ($i % 7 === 0 && $z === 5);
                    $sheetZones[] = ['id' => (string) Str::uuid(), 'zoneId' => $zoneId, 'supplied' => $supplied,
                        'runs' => [
                            ['id' => (string) Str::uuid(), 'runNo' => 1, 'start' => $supplied ? '06:00' : null, 'end' => $supplied ? '12:00' : null, 'loadUnit' => 'A', 'loads' => [$base, $base - 6, $base + 4], 'extra' => []],
                            ['id' => (string) Str::uuid(), 'runNo' => 2, 'start' => $supplied ? '17:00' : null, 'end' => $supplied ? '23:00' : null, 'loadUnit' => 'A', 'loads' => [$base + 10, $base, $base + 7], 'extra' => []],
                        ],
                        'bands' => array_map(fn () => $supplied ? [mt_rand($base - 20, $base + 20), mt_rand($base - 20, $base + 20), mt_rand($base - 20, $base + 20)] : [null, null, null], range(1, 6))];
                }
                $this->call_($manager, fn (Request $r) => app(DistributionController::class)->save($r, $date), 'PUT', ['version' => 0, 'zones' => $sheetZones, 'notes' => null]);
                $this->call_($manager, fn (Request $r) => app(DistributionController::class)->transition($r, $date, 'submit'), 'POST', ['version' => 1]);
                if ($i > 1) {
                    $this->call_($manager, fn (Request $r) => app(DistributionController::class)->transition($r, $date, 'approve'), 'POST', ['version' => 2]);
                }
            }

            // Seals: two rolls, a batch for each technician, a few recorded as used.
            $techs = User::where('branch_id', $branch->id)->whereHas('employee', fn ($q) => $q->where('job_title', 'like', '%فني%'))->orderBy('id')->pluck('id');
            $start = 223000 + $branch->id * 1000;
            $this->call_($manager, fn (Request $r) => app(SealController::class)->update($r, 'add-roll'), 'POST', ['from' => $start, 'to' => $start + 99, 'date' => $today->subDays(20)->toDateString()]);
            $this->call_($manager, fn (Request $r) => app(SealController::class)->update($r, 'add-roll'), 'POST', ['from' => $start + 100, 'to' => $start + 199, 'date' => $today->subDays(6)->toDateString()]);
            $n = $start;
            foreach ($techs as $k => $tech) {
                $seals = range($n, $n + 7);
                $n += 8;
                $this->call_($manager, fn (Request $r) => app(SealController::class)->update($r, 'issue'), 'POST', ['technician' => $tech, 'date' => $today->subDays(16 - $k * 4)->toDateString(), 'seals' => $seals]);
                foreach (array_slice($seals, 0, 4 - $k) as $j => $seal) {
                    $this->call_($manager, fn (Request $r) => app(SealController::class)->update($r, 'record'), 'POST', ['number' => $seal, 'status' => 'used', 'date' => $today->subDays(14 - $k * 4 - $j)->toDateString(), 'details' => ['تركيب اشتراك', 'تبديل ساعة', 'إعادة شبك', 'فصل خط'][$j], 'board' => (string) mt_rand(300, 380)]);
                }
            }

            // Leave and permission requests through the leave system: one waiting, one decided.
            $staff = User::where('branch_id', $branch->id)->whereHas('employee', fn ($q) => $q->where('job_title', 'like', '%محصّل%'))->orderBy('id')->get();
            $hr = User::where('username', 'hr.demo')->first();
            if ($staff->count() >= 2 && $hr) {
                $next = $today->addDays(3)->toDateString();
                $this->call_($staff[0], fn (Request $r) => app(LeaveController::class)->store($r), 'POST', ['kind' => 'sick', 'starts' => $today->addDay()->toDateString(), 'ends' => $today->addDays(2)->toDateString(), 'reason' => 'مراجعة طبية وراحة بأمر الطبيب.']);
                $this->call_($staff[1], fn (Request $r) => app(LeaveController::class)->store($r), 'POST', ['kind' => 'permission', 'starts' => $next, 'ends' => $next, 'from_time' => '10:00', 'to_time' => '12:00', 'reason' => 'موعد في دائرة الأحوال المدنية.']);
                $id = DB::table('leave_requests')->where('user_id', $staff[1]->id)->value('id');
                $this->call_($hr, fn (Request $r) => app(LeaveController::class)->decide($r, $id), 'PATCH', ['action' => 'approved']);
            }
            $this->line("✓ {$branch->name}: {$days} تقريراً وكشفاً، ورولا أختام");
        }

        return self::SUCCESS;
    }

    /** Runs one controller action as the given person, like a request from the page. */
    private function call_(User $as, callable $action, string $method, array $body): void
    {
        $request = Request::create('/', $method, $body);
        $request->setUserResolver(fn () => $as);
        app()->instance('request', $request);
        Auth::setUser($as);
        $action($request);
    }
}
