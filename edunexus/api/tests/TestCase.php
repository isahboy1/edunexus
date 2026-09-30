<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * The application instance persists across requests within a single test,
     * but Sanctum's RequestGuard caches the user it resolved for the first
     * request (setRequest() does not clear the cached user). Without this,
     * a second request carrying a *different* Bearer token would still be
     * authenticated as the first request's user — breaking any test that
     * switches tokens. Production is unaffected (fresh app per request).
     */
    public function call(
        $method,
        $uri,
        $parameters = [],
        $cookies = [],
        $files = [],
        $server = [],
        $content = null
    ) {
        $this->app?->make('auth')->forgetGuards();

        return parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
    }
}
