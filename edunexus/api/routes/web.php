<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// The API is the app's only surface — there is no web login route. Without a
// named `login` route, Laravel's Authenticate middleware tries to redirect
// unauthenticated web-style requests (no Accept: application/json) to
// route('login') and dies with RouteNotFoundException → HTTP 500. Returning
// JSON 401 here is the correct API-first behaviour.
Route::get('/login', function () {
    return response()->json(['message' => 'Unauthenticated.'], 401);
})->name('login');
