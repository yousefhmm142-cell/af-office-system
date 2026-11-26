<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'perm' => \App\Http\Middleware\RequirePermission::class,
            'active' => \App\Http\Middleware\ActiveUser::class,
            'password.changed' => \App\Http\Middleware\PasswordChanged::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        // Messages people see stay in Arabic, also for the framework's own errors.
        $exceptions->render(function (\Symfony\Component\HttpKernel\Exception\NotFoundHttpException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                $message = $e->getPrevious() instanceof \Illuminate\Database\Eloquent\ModelNotFoundException || str_starts_with($e->getMessage(), 'The route')
                    || $e->getMessage() === '' ? 'غير موجود، أو حُذف.' : $e->getMessage();

                return response()->json(['message' => $message], 404);
            }
        });
        // An abort() without its own words gets a plain Arabic one by its status.
        $exceptions->render(function (\Symfony\Component\HttpKernel\Exception\HttpException $e, Request $request) {
            if (($request->is('api/*') || $request->expectsJson()) && $e->getMessage() === '') {
                $words = [403 => 'ليست لديك صلاحية لهذا الإجراء.', 409 => 'تغيّرت البيانات. حدّث الصفحة وحاول مرة أخرى.', 422 => 'البيانات غير صحيحة.'];
                if (isset($words[$e->getStatusCode()])) {
                    return response()->json(['message' => $words[$e->getStatusCode()]], $e->getStatusCode(), $e->getHeaders());
                }
            }
        });
        $exceptions->render(function (\Illuminate\Http\Exceptions\ThrottleRequestsException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json(['message' => 'محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.'], 429, $e->getHeaders());
            }
        });
    })->create();
