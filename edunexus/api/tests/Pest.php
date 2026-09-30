<?php

use App\Models\AcademicSession;
use App\Models\ApplicationSetting;
use App\Models\Faculty;
use App\Models\Programme;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

pest()->extend(Tests\TestCase::class)->in('Feature')->beforeEach(function () {
    // The test DB is migrated but not seeded — ensure RBAC roles exist so
    // role: middleware and hasRole() checks behave like production.
    foreach ([
        'SUPER_ADMIN', 'REGISTRAR', 'ADMISSIONS_OFFICER', 'ACADEMIC_OFFICER',
        'BURSARY_OFFICER', 'HOD', 'LECTURER', 'STUDENT', 'APPLICANT',
    ] as $roleName) {
        Role::firstOrCreate(['name' => $roleName], ['description' => $roleName]);
    }
});

/**
 * Create an admission window that is open right now.
 */
function seedAdmissionWindow(): array
{
    $session = AcademicSession::create([
        'name' => 'TEST/'.now()->format('Y').'/'.uniqid(),
        'start_date' => now()->subMonth(),
        'end_date' => now()->addYear(),
        'is_current' => true,
        'status' => 'ACTIVE',
    ]);

    $setting = ApplicationSetting::create([
        'academic_session_id' => $session->id,
        'application_fee' => 5500,
        'opens_at' => now()->subDay(),
        'closes_at' => now()->addMonth(),
        'registration_closes_at' => now()->addMonths(2),
        'is_active' => true,
        'allowed_types' => ['UTME', 'DIRECT_ENTRY', 'NCE', 'DIPLOMA', 'PART_TIME', 'LONG_VACATION', 'PRE_NCE', 'PRE_DIPLOMA'],
    ]);

    return [$session, $setting];
}

function seedProgramme(): Programme
{
    $faculty = Faculty::create(['name' => 'Test Faculty '.uniqid(), 'code' => 'TF'.random_int(100, 999)]);
    $dept = \App\Models\Department::create(['faculty_id' => $faculty->id, 'name' => 'Test Dept', 'code' => 'TD'.random_int(100, 999)]);

    return Programme::create(['department_id' => $dept->id, 'name' => 'Test Programme', 'code' => 'TP'.random_int(100, 999), 'award' => 'NCE']);
}

/**
 * Register + login an applicant; returns [user, token].
 */
function makeApplicant(array $overrides = []): array
{
    $suffix = random_int(100000, 999999);
    $payload = array_merge([
        'surname' => 'Test', 'firstName' => 'Applicant',
        'email' => "app{$suffix}@test.local",
        'phone' => '070'.$suffix.random_int(10, 99),
        'password' => 'Passw0rd123', 'passwordConfirmation' => 'Passw0rd123',
    ], $overrides);

    unset($payload['passwordConfirmation']);
    $user = User::create([
        'name' => $payload['surname'].' '.$payload['firstName'],
        'email' => $payload['email'],
        'phone' => $payload['phone'],
        'password' => Hash::make($payload['password']),
        'status' => 'ACTIVE',
    ]);
    $user->roles()->attach(\App\Models\Role::where('name', 'APPLICANT')->value('id'));
    \App\Models\Applicant::create([
        'user_id' => $user->id,
        'application_number' => 'EDU/'.now()->format('Y').'/'.$suffix,
        'surname' => $payload['surname'], 'first_name' => $payload['firstName'],
    ]);

    $token = $user->createToken('test')->plainTextToken;

    return [$user, $token, $payload];
}

function makeStaff(string $role, ?string $email = null): array
{
    $suffix = random_int(100000, 999999);
    $user = User::create([
        'name' => ucfirst(strtolower($role)).' Staff',
        'email' => $email ?? strtolower($role).".{$suffix}@test.local",
        'phone' => '071'.$suffix,
        'password' => Hash::make('Passw0rd123'),
        'status' => 'ACTIVE',
    ]);
    $user->roles()->attach(\App\Models\Role::where('name', $role)->value('id'));

    return [$user, $user->createToken('test')->plainTextToken];
}

/**
 * Full paid application ready for admin actions.
 */
function makePaidApplication(): array
{
    [$session] = seedAdmissionWindow();
    $programme = seedProgramme();
    [$user, $token] = makeApplicant();

    $applicant = $user->applicant;
    $application = \App\Models\Application::create([
        'application_number' => $applicant->application_number.'-1',
        'applicant_id' => $applicant->id,
        'academic_session_id' => $session->id,
        'programme_id' => $programme->id,
        'application_type' => 'NCE',
        'status' => 'SUBMITTED',
        'payment_status' => 'SUCCESSFUL',
        'submitted_at' => now(),
    ]);

    \App\Models\ApplicationPayment::create([
        'application_id' => $application->id,
        'reference' => 'APP-TEST'.strtoupper(\Illuminate\Support\Str::random(8)),
        'amount' => 5500, 'gateway' => 'mock', 'status' => 'SUCCESSFUL', 'paid_at' => now(),
    ]);

    return [$application, $user, $token];
}
