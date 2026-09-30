<?php

use App\Models\User;
use Illuminate\Support\Facades\Hash;

use function Pest\Laravel\postJson;

uses(Illuminate\Foundation\Testing\RefreshDatabase::class);

it('rejects duplicate applicant registration', function () {
    seedAdmissionWindow();
    [$user, $token, $payload] = makeApplicant();

    $this->postJson('/api/v1/auth/register', [
        'surname' => 'Dup', 'firstName' => 'User',
        'email' => $payload['email'],
        'phone' => '082'.random_int(10000000, 99999999),
        'password' => 'Passw0rd123', 'passwordConfirmation' => 'Passw0rd123',
    ])->assertStatus(422)
        ->assertJsonValidationErrors(['email']);
});

it('locks an account after 5 failed logins', function () {
    [, , $payload] = makeApplicant();

    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/v1/auth/login', [
            'email' => $payload['email'], 'password' => 'WrongPass1',
        ])->assertStatus(422);
    }

    // 6th attempt with the CORRECT password is still blocked by the lock
    $this->postJson('/api/v1/auth/login', [
        'email' => $payload['email'], 'password' => $payload['password'],
    ])->assertStatus(422)
        ->assertJsonPath('errors.email.0', fn ($v) => str_contains($v, 'locked'));

    $user = User::where('email', $payload['email'])->first();
    expect($user->isLocked())->toBeTrue();
});

it('issues a token on successful login and revokes on logout', function () {
    [, , $payload] = makeApplicant();

    $res = $this->postJson('/api/v1/auth/login', [
        'email' => $payload['email'], 'password' => $payload['password'],
    ])->assertOk()->assertJsonPath('ok', true);

    $token = $res->json('data.token');

    $this->withToken($token)->getJson('/api/v1/auth/me')
        ->assertOk()->assertJsonPath('data.email', $payload['email']);

    $this->withToken($token)->postJson('/api/v1/auth/logout')->assertOk();

    $this->withToken($token)->getJson('/api/v1/auth/me')->assertStatus(401);
});

it('enforces RBAC: applicant cannot access admin endpoints', function () {
    [, $token] = makeApplicant();

    $this->withToken($token)->getJson('/api/v1/admin/applications')->assertStatus(403);
    $this->withToken($token)->getJson('/api/v1/admin/stats')->assertStatus(403);
    $this->withToken($token)->postJson('/api/v1/admin/users', [])->assertStatus(403);
});

it('enforces RBAC: admissions officer cannot create users', function () {
    [, $token] = makeStaff('ADMISSIONS_OFFICER');

    $this->withToken($token)->postJson('/api/v1/admin/users', [
        'name' => 'New Staff', 'email' => 'x'.random_int(1, 99999).'@test.local',
        'password' => 'Passw0rd123', 'role' => 'BURSARY_OFFICER',
    ])->assertStatus(403);
});

it('allows only bursary into bursary endpoints', function () {
    [, $officerToken] = makeStaff('ADMISSIONS_OFFICER');
    [, $bursaryToken] = makeStaff('BURSARY_OFFICER');

    $this->withToken($officerToken)->getJson('/api/v1/bursary/payments')->assertStatus(403);
    $this->withToken($bursaryToken)->getJson('/api/v1/bursary/payments')->assertOk();
});

it('rejects unauthenticated access to protected routes', function () {
    $this->getJson('/api/v1/auth/me')->assertStatus(401);
    $this->getJson('/api/v1/student/me')->assertStatus(401);
});
