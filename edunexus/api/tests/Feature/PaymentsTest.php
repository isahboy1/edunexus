<?php

use App\Models\ApplicationPayment;
use App\Models\Invoice;
use App\Models\Student;
use App\Services\PaymentService;
use Illuminate\Support\Facades\Http;

use function Pest\Laravel\postJson;

uses(Illuminate\Foundation\Testing\RefreshDatabase::class);

function signPayload(array $payload): string
{
    return hash_hmac('sha512', json_encode($payload), config('services.payment.webhook_secret'));
}

function makePendingPayment(): array
{
    [$application, $user, $token] = makePaidApplication();
    $payment = ApplicationPayment::create([
        'application_id' => $application->id,
        'reference' => 'APP-TEST'.strtoupper(\Illuminate\Support\Str::random(8)),
        'amount' => 5500, 'gateway' => 'mock', 'status' => 'PENDING',
    ]);
    // Reset application to PAID-not-yet (simulate pre-webhook state)
    $application->update(['payment_status' => 'PROCESSING', 'status' => 'DRAFT']);
    $payment->update(['status' => 'PENDING', 'paid_at' => null]);

    return [$application, $payment, $token];
}

it('rejects unsigned webhooks with 401', function () {
    [$application, $payment] = makePendingPayment();

    $this->postJson('/api/v1/payments/webhook', [
        'reference' => $payment->reference, 'status' => 'SUCCESSFUL',
    ])->assertStatus(401);

    expect($payment->fresh()->status)->toBe('PENDING');
});

it('rejects forged signatures with 401', function () {
    [$application, $payment] = makePendingPayment();

    $this->postJson('/api/v1/payments/webhook', [
        'reference' => $payment->reference, 'status' => 'SUCCESSFUL',
    ], ['X-EduNexus-Signature' => str_repeat('a', 128)])
        ->assertStatus(401);

    expect($payment->fresh()->status)->toBe('PENDING');
});

it('accepts a correctly signed webhook and marks payment SUCCESSFUL', function () {
    [$application, $payment, $token] = makePendingPayment();

    $payload = ['reference' => $payment->reference, 'status' => 'SUCCESSFUL'];

    $this->postJson('/api/v1/payments/webhook', $payload, ['X-EduNexus-Signature' => signPayload($payload)])
        ->assertOk();

    expect($payment->fresh()->status)->toBe('SUCCESSFUL')
        ->and($application->fresh()->payment_status)->toBe('SUCCESSFUL')
        ->and($application->fresh()->status)->toBe('PAID');
});

it('is idempotent: replayed webhooks do not double-apply', function () {
    [$application, $payment] = makePendingPayment();

    $payload = ['reference' => $payment->reference, 'status' => 'SUCCESSFUL'];
    $headers = ['X-EduNexus-Signature' => signPayload($payload)];

    $this->postJson('/api/v1/payments/webhook', $payload, $headers)->assertOk();
    $this->postJson('/api/v1/payments/webhook', $payload, $headers)->assertOk();

    expect($payment->fresh()->status)->toBe('SUCCESSFUL')
        ->and($application->fresh()->status)->toBe('PAID');
});

it('records FAILED status from webhook', function () {
    [$application, $payment] = makePendingPayment();

    $payload = ['reference' => $payment->reference, 'status' => 'FAILED'];
    $this->postJson('/api/v1/payments/webhook', $payload, ['X-EduNexus-Signature' => signPayload($payload)])
        ->assertOk();

    expect($payment->fresh()->status)->toBe('FAILED')
        ->and($application->fresh()->payment_status)->toBe('FAILED');
});

it('rejects unknown payment references', function () {
    $payload = ['reference' => 'APP-DOESNOTEXIST', 'status' => 'SUCCESSFUL'];
    $this->postJson('/api/v1/payments/webhook', $payload, ['X-EduNexus-Signature' => signPayload($payload)])
        ->assertStatus(404);
});

it('updates invoice balance on student payment webhook', function () {
    [$session] = seedAdmissionWindow();
    $programme = seedProgramme();
    [$user, $token] = makeApplicant();

    $student = Student::create([
        'user_id' => $user->id, 'matric_number' => 'EDU/'.now()->format('Y').'/'.random_int(10000, 99999),
        'applicant_id' => $user->applicant->id, 'current_programme_id' => $programme->id,
        'current_level_value' => 100, 'status' => 'ACTIVE',
    ]);
    $user->roles()->syncWithoutDetaching([\App\Models\Role::where('name', 'STUDENT')->value('id')]);

    $invoice = Invoice::create([
        'invoice_number' => 'INV-TEST-'.random_int(100000, 999999), 'student_id' => $student->id,
        'invoice_type' => 'SCHOOL_FEES', 'academic_session_id' => $session->id,
        'total_amount' => 50000, 'amount_paid' => 0, 'balance' => 50000,
    ]);
    $payment = App\Models\Payment::create([
        'invoice_id' => $invoice->id, 'student_id' => $student->id,
        'reference' => 'PAY-TEST'.strtoupper(\Illuminate\Support\Str::random(8)),
        'amount' => 20000, 'gateway' => 'mock', 'status' => 'PENDING',
    ]);

    $payload = ['reference' => $payment->reference, 'status' => 'SUCCESSFUL'];
    $this->postJson('/api/v1/payments/webhook', $payload, ['X-EduNexus-Signature' => signPayload($payload)])
        ->assertOk();

    $invoice->refresh();
    expect((float) $invoice->amount_paid)->toBe(20000.0)
        ->and((float) $invoice->balance)->toBe(30000.0)
        ->and($invoice->status)->toBe('PARTIALLY_PAID');
});

it('lets bursary confirm a bank payment and audit it', function () {
    [$application, $payment] = makePendingPayment();
    [$bursaryUser, $bursaryToken] = makeStaff('BURSARY_OFFICER');

    $this->withToken($bursaryToken)
        ->postJson("/api/v1/bursary/payments/{$payment->reference}/confirm")
        ->assertOk();

    expect($payment->fresh()->status)->toBe('SUCCESSFUL')
        ->and($application->fresh()->payment_status)->toBe('SUCCESSFUL');

    $this->assertDatabaseHas('audit_logs', [
        'user_id' => $bursaryUser->id, 'action' => 'PAYMENT_CONFIRMED_BURSARY',
    ]);
});

it('prevents double confirmation', function () {
    [$application, $payment] = makePendingPayment();
    [, $bursaryToken] = makeStaff('BURSARY_OFFICER');

    $this->withToken($bursaryToken)->postJson("/api/v1/bursary/payments/{$payment->reference}/confirm")->assertOk();
    $this->withToken($bursaryToken)->postJson("/api/v1/bursary/payments/{$payment->reference}/confirm")->assertStatus(422);
});

it('generates a sandbox RRR when Remita is not configured', function () {
    [$application] = makePaidApplication();

    // Gateway defaults to mock in tests; exercise the Remita gateway directly.
    $service = app(PaymentService::class);
    $payment = ApplicationPayment::create([
        'application_id' => $application->id,
        'reference' => 'APP-REMITA'.strtoupper(\Illuminate\Support\Str::random(6)),
        'amount' => 5500, 'gateway' => 'remita', 'status' => 'PENDING',
    ]);
    $init = $service->gatewayFor('remita')->initialize($payment);

    expect($init['rrr'])->toStartWith('RRR')
        ->and($init['mode'])->toBe('sandbox')
        ->and($payment->fresh()->rrr)->toBe($init['rrr'])
        ->and($payment->fresh()->status)->toBe('PROCESSING');
});
