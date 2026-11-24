<?php

namespace App\Providers;

use Database\Seeders\AccessSeeder;
use Illuminate\Database\Events\MigrationsEnded;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // After every `php artisan migrate`, roles and permissions follow config/access.php,
        // so an update never needs a separate seeding step. Grants changed on screen are kept.
        Event::listen(MigrationsEnded::class, function (MigrationsEnded $event) {
            if ($event->method === 'up' && Schema::hasTable('role_permissions')) {
                (new AccessSeeder)->run();
            }
        });
    }
}
