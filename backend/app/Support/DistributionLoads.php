<?php

namespace App\Support;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class DistributionLoads
{
    public static function query(int $branch): Builder
    {
        return DB::table('distribution_generator_loads')->where('branch_id', $branch);
    }

    public static function values(object $row): array
    {
        return array_map(fn ($value) => $value === null ? null : (float) $value, json_decode($row->band_loads, true, flags: JSON_THROW_ON_ERROR));
    }

    /** Apply this day's shared loads without discarding the report's original readings. */
    public static function apply(array $figures, iterable $readings): array
    {
        $byGenerator = collect($readings)->keyBy('generator_id');
        foreach ($figures['generators'] as &$generator) {
            $shared = $byGenerator->get($generator['generatorId']);
            if ($shared) {
                $generator['storedLoads'] = array_intersect_key($generator, array_flip(['bandLoads', 'loads', 'loadUnit']));
                $generator['bandLoads'] = self::values($shared);
                $generator['loads'] = [null, null, null];
                $generator['loadUnit'] = $shared->load_unit;
            }
        }
        unset($generator);

        return $figures;
    }
}
