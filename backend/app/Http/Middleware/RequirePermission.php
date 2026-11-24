<?php

namespace App\Http\Middleware;

use App\Support\Access;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Route guard: `->middleware('perm:users.view')`. Branch limits are checked inside the controller. */
class RequirePermission
{
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();
        foreach ($permissions as $p) {
            if ($user && Access::allows($user, $p)) {
                return $next($request);
            }
        }
        abort(403, 'ليست لديك صلاحية لهذه الصفحة.');
    }
}
