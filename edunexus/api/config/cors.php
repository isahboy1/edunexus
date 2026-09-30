<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) — EDUNEXUS API
    |--------------------------------------------------------------------------
    | The Next.js frontend runs on a different origin (localhost:3000 or the
    | preview port), so browser requests to /api/v1 need CORS headers. Only
    | the frontend origins are allowed; credentials are never sent (we use
    | Sanctum Bearer tokens in the Authorization header).
    */

    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter(array_map('trim', explode(',', (string) env('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000')))),

    'allowed_origins_patterns' => [],

    'exposed_headers' => ['Content-Disposition'],

    'max_age' => 0,

    'supports_credentials' => false,

];
