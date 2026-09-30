<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * role:SUPER_ADMIN,REGISTRAR — allows any of the listed roles.
 * Super Admin passes everything.
 */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();
        abort_unless($user, 401, 'Unauthenticated.');

        if ($user->hasRole('SUPER_ADMIN') || $user->hasRole(...$roles)) {
            return $next($request);
        }

        abort(403, 'You do not have permission to access this resource.');
    }
}
