<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** A stopped account loses access at once, even with a token still on the phone. */
class ActiveUser
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user && ! $user->is_active) {
            $user->currentAccessToken()?->delete();

            return response()->json(['message' => 'حسابك موقوف. راجع الإدارة.', 'code' => 'inactive'], 401);
        }

        return $next($request);
    }
}
