<?php

return [

    'payment' => [
        // 'mock' today; 'remita' when credentials are live.
        'gateway' => env('PAYMENT_GATEWAY', 'mock'),
        // HMAC-SHA512 shared secret between gateway and this API.
        // Webhooks without a valid signature are rejected (401).
        'webhook_secret' => env('PAYMENT_WEBHOOK_SECRET', 'dev-webhook-secret-change-me'),
    ],

    'registration' => [
        // SRS §57: "Student must satisfy financial requirements if configured."
        // Set false to let students submit course registration before paying.
        'require_fee_clearance' => env('REQUIRE_FEE_CLEARANCE', true),
    ],

    'remita' => [
        'base_url' => env('REMITA_BASE_URL', 'https://login.remita.net'),
        'merchant_id' => env('REMITA_MERCHANT_ID'),
        'api_key' => env('REMITA_API_KEY'),
        'api_token' => env('REMITA_API_TOKEN'),
        'account' => env('REMITA_ACCOUNT'),
        'bank' => env('REMITA_BANK'),
        'beneficiary' => env('REMITA_BENEFICIARY', 'EduNexus College of Islamic and Legal Studies'),
    ],

];
