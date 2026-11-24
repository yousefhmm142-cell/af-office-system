<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** A user given a temporary password must choose their own before anything else. */
class PasswordChanged
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->must_change_password) {
            return response()->json([
                'message' => 'لازم تغيّر رمزك أول مرة قبل ما تكمل.',
                'code' => 'must_change_password',
            ], 403);
        }

        return $next($request);
    }
}
