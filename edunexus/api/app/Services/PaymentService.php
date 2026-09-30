<?php

namespace App\Services;

use App\Models\Application;
use App\Models\ApplicationPayment;
use App\Models\Payment;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * PaymentGateway — adapter interface (SRS §55).
 * Swap providers without touching the finance/admission logic.
 */
interface PaymentGateway
{
    /** Create a remote payment (returns checkout/instruction data for the client). */
    public function initialize(ApplicationPayment|Payment $payment): array;

    /** Verify a transaction server-side. NEVER trust the browser (SRS §43). */
    public function verify(ApplicationPayment|Payment $payment): array;
}

/**
 * MockGateway — local development/testing provider. Its webhook endpoint is
 * called exactly like a real provider (HMAC-signed) by the mock checkout page.
 */
class MockGateway implements PaymentGateway
{
    public function initialize(ApplicationPayment|Payment $payment): array
    {
        return [
            'gateway' => 'mock',
            'checkout_url' => env('FRONTEND_URL', 'http://localhost:3000').'/payments/mock?reference='.$payment->reference.'&amount='.(float) $payment->amount.'&next='.self::returnPath($payment),
            'reference' => $payment->reference,
        ];
    }

    /** Where the checkout page should send the payer after payment. */
    private static function returnPath(ApplicationPayment|Payment $payment): string
    {
        return $payment instanceof Payment ? '/student/fees' : '/applicant/dashboard';
    }

    public function verify(ApplicationPayment|Payment $payment): array
    {
        // The webhook already stored the authoritative response server-side.
        return ['status' => $payment->status, 'reference' => $payment->reference];
    }
}

/**
 * RemitaGateway — the RRR flow the real AKCILS portal uses
 * (Registration_proceedure.pdf): generate RRR → applicant pays at bank/ATM/
 * internet banking → Remita notifies → bursary/API verifies server-side.
 *
 * Implements Remita's "Generate RRR" (biller) + "Transaction Status" APIs.
 * In sandbox mode (REMITA_SANDBOX=true) a deterministic fake RRR is generated
 * so the complete flow is exercisable without live credentials.
 */
class RemitaGateway implements PaymentGateway
{
    private function configured(): bool
    {
        return filled(config('services.remita.merchant_id'))
            && filled(config('services.remita.api_key'))
            && filled(config('services.remita.api_token'));
    }

    public function initialize(ApplicationPayment|Payment $payment): array
    {
        if (! $this->configured()) {
            // Sandbox: deterministic pseudo-RRR so the full flow works offline.
            $rrr = 'RRR'.strtoupper(Str::random(9));
            $payment->update(['rrr' => $rrr, 'status' => 'PROCESSING']);

            return [
                'gateway' => 'remita',
                'mode' => 'sandbox',
                'rrr' => $rrr,
                'amount' => (float) $payment->amount,
                'instruction_url' => env('FRONTEND_URL', 'http://localhost:3000')
                    .'/payments/remita-instruction?reference='.$payment->reference.'&next='.($payment instanceof Payment ? '/student/fees' : '/applicant/dashboard'),
                'message' => 'RRR generated (sandbox). Pay at any bank branch, ATM or Remita, then bursary confirms.',
            ];
        }

        // Live: POST /remita/exapp/api/ecomm/split-payment/{merchantId}
        $response = Http::withHeaders([
            'Authorization' => 'remitaConsumerKey='.config('services.remita.merchant_id')
                .',remitaConsumerToken='.config('services.remita.api_token'),
            'Content-Type' => 'application/json',
        ])->timeout(20)->post(
            rtrim((string) config('services.remita.base_url'), '/').'/remita/exapp/api/ecomm/split-payment/'.config('services.remita.merchant_id'),
            [[
                'lineItems' => [[
                    'beneficiaryName' => config('services.remita.beneficiary', 'EduNexus College'),
                    'beneficiaryAccount' => config('services.remita.account'),
                    'beneficiaryBank' => config('services.remita.bank'),
                    'deductFeeFrom' => 'MAIN',
                    'lineItemsId' => 'EDUFEE',
                    'sessionId' => $payment->reference,
                    'amount' => (float) $payment->amount,
                ]],
                'amount' => (float) $payment->amount,
                'payerName' => $payment->reference,
                'payerEmail' => config('services.remita.payer_email_fallback', 'payments@edunexus.edu.ng'),
                'payerPhone' => config('services.remita.payer_phone_fallback', '00000000000'),
                'orderId' => $payment->reference,
                'description' => 'EduNexus application/school fee payment',
            ]]
        );

        $body = $response->json();
        $statuscode = $body['statuscode'] ?? $body['status'] ?? null;

        if (! $response->successful() || ! in_array($statuscode, ['040', '00', 0], true)) {
            $payment->update(['status' => 'FAILED', 'gateway_response' => $body]);

            return [
                'gateway' => 'remita',
                'error' => $body['statusmsg'] ?? 'RRR generation failed',
            ];
        }

        $rrr = $body['RRR'] ?? $body['rrr'] ?? null;
        $payment->update(['rrr' => $rrr, 'status' => 'PROCESSING', 'gateway_response' => $body]);

        return [
            'gateway' => 'remita',
            'mode' => 'live',
            'rrr' => $rrr,
            'amount' => (float) $payment->amount,
            'instruction_url' => env('FRONTEND_URL', 'http://localhost:3000')
                .'/payments/remita-instruction?reference='.$payment->reference.'&next='.($payment instanceof Payment ? '/student/fees' : '/applicant/dashboard'),
            'message' => 'RRR generated. Pay at any bank branch, ATM or remita.net with this RRR.',
        ];
    }

    public function verify(ApplicationPayment|Payment $payment): array
    {
        if (blank($payment->rrr)) {
            return ['status' => $payment->status, 'rrr' => null];
        }

        if (! $this->configured()) {
            // Sandbox: status only advances through the signed webhook or the
            // bursary confirm endpoint — exactly like real bank confirmation.
            return ['status' => $payment->status, 'rrr' => $payment->rrr];
        }

        // Live: GET /remita/exapp/api/v1.0/ECOMM/{merchantId}/{rrr}/{apiKey}/transaction.status
        $hash = hash_hmac('sha512', $payment->rrr.config('services.remita.api_key').config('services.remita.merchant_id'), config('services.remita.api_key'));
        $response = Http::withHeaders([
            'Authorization' => 'remitaConsumerKey='.config('services.remita.merchant_id')
                .',remitaConsumerToken='.config('services.remita.api_token'),
            'Content-Type' => 'application/json',
        ])->timeout(20)->get(
            rtrim((string) config('services.remita.base_url'), '/')
                ."/remita/exapp/api/v1.0/ECOMM/".config('services.remita.merchant_id')
                ."/{$payment->rrr}/".config('services.remita.api_key').'/transaction.status',
            ['hash' => $hash]
        );

        $body = $response->json();
        $status = match (strtoupper((string) ($body['status'] ?? ''))) {
            '00', 'SUCCESSFUL', 'COMPLETED', 'PAID' => 'SUCCESSFUL',
            '021', 'PENDING', 'PROCESSING', 'IN-PROGRESS' => 'PROCESSING',
            default => 'FAILED',
        };

        return ['status' => $status, 'rrr' => $payment->rrr, 'gateway_response' => $body];
    }
}

class PaymentService
{
    public function gatewayFor(string $gateway): PaymentGateway
    {
        return match ($gateway) {
            'remita' => new RemitaGateway(),
            default => new MockGateway(),
        };
    }

    /**
     * Create a PENDING payment for an application fee and initialise it
     * with the configured gateway.
     */
    public function initializeApplicationPayment(Application $application): ApplicationPayment
    {
        $setting = \App\Models\ApplicationSetting::where('academic_session_id', $application->academic_session_id)->firstOrFail();

        $payment = ApplicationPayment::create([
            'application_id' => $application->id,
            'reference' => 'APP-'.strtoupper(Str::random(14)),
            'amount' => $setting->application_fee,
            'currency' => $setting->currency,
            'gateway' => config('services.payment.gateway', 'mock'),
            'status' => 'PENDING',
        ]);

        $init = $this->gatewayFor($payment->gateway)->initialize($payment);
        $payment->gateway_response = $init;
        $payment->save();

        if ($application->payment_status === 'PENDING') {
            $application->update(['payment_status' => 'PROCESSING']);
        }

        return $payment;
    }

    /**
     * The ONLY place a payment becomes SUCCESSFUL — called from the signed
     * webhook or bursary confirmation. Also finalises the application status.
     */
    public function markApplicationPaymentSuccessful(ApplicationPayment $payment, array $response = []): void
    {
        if ($payment->status === 'SUCCESSFUL') {
            return; // idempotent: double webhook is safe
        }

        $payment->update([
            'status' => 'SUCCESSFUL',
            'paid_at' => now(),
            'gateway_response' => array_merge($payment->gateway_response ?? [], $response),
        ]);

        $application = $payment->application()->first();
        if ($application && $application->payment_status !== 'SUCCESSFUL') {
            $application->update(['payment_status' => 'SUCCESSFUL']);
            if ($application->status === 'DRAFT') {
                $application->update(['status' => 'PAID']);
            }
        }
    }

    public function markApplicationPaymentFailed(ApplicationPayment $payment, array $response = []): void
    {
        $payment->update([
            'status' => 'FAILED',
            'gateway_response' => array_merge($payment->gateway_response ?? [], $response),
        ]);
        $payment->application()->first()?->update(['payment_status' => 'FAILED']);
    }

    /**
     * School-fees payments (students) — invoice balance updates atomically.
     * A successful settlement also raises an in-app notification for the
     * student (SRS §35) so the portal reflects the confirmation immediately.
     */
    public function markStudentPaymentSuccessful(Payment $payment, array $response = []): void
    {
        if ($payment->status === 'SUCCESSFUL') {
            return;
        }

        \Illuminate\Support\Facades\DB::transaction(function () use ($payment, $response) {
            $payment->update([
                'status' => 'SUCCESSFUL',
                'paid_at' => now(),
                'gateway_response' => array_merge($payment->gateway_response ?? [], $response),
            ]);

            $invoice = $payment->invoice()->lockForUpdate()->first();
            if ($invoice) {
                $invoice->amount_paid = (float) $invoice->amount_paid + (float) $payment->amount;
                $invoice->balance = max(0, (float) $invoice->total_amount - (float) $invoice->amount_paid);
                $invoice->status = $invoice->balance <= 0 ? 'PAID' : 'PARTIALLY_PAID';
                $invoice->save();
            }
        });

        \App\Services\NotificationService::notifyStudentPayment($payment, 'Fee payment confirmed', sprintf(
            'Your payment of ₦%s for invoice %s was confirmed%s. Reference %s%s. View your printable receipt in Fees & Payments.',
            number_format((float) $payment->amount, 2),
            $payment->invoice?->invoice_number ?? '—',
            $payment->invoice && (float) $payment->invoice->balance <= 0 ? ' and the invoice is fully settled' : ' (partial payment — balance remains)',
            $payment->reference,
            filled($payment->rrr) ? ', RRR '.$payment->rrr : '',
        ), [
            'payment_id' => $payment->id,
            'reference' => $payment->reference,
            'rrr' => $payment->rrr,
            'amount' => (float) $payment->amount,
            'invoice_number' => $payment->invoice?->invoice_number,
            'receipt_url' => '/student/receipts/'.$payment->reference,
        ]);

        // Bursary bell: a fee payment just settled (webhook or teller confirm).
        \App\Services\NotificationService::notifyStaff('Fee payment confirmed', sprintf(
            '%s paid ₦%s on invoice %s%s (%s).',
            $payment->student?->user?->name ?? 'A student',
            number_format((float) $payment->amount, 2),
            $payment->invoice?->invoice_number ?? '—',
            (float) ($payment->invoice?->balance ?? 0) > 0 ? ' — balance ₦'.number_format((float) $payment->invoice->balance, 2).' remains' : '',
            $payment->reference,
        ), [
            'kind' => 'PAYMENT_CONFIRMED',
            'reference' => $payment->reference,
            'amount' => (float) $payment->amount,
        ]);
    }

    /**
     * Legacy in-app hook retained for callers that only need the student row
     * (delegates to the central NotificationService which also queues email).
     */
    public function notifyStudent(Payment $payment, string $subject, string $body, array $meta = []): void
    {
        \App\Services\NotificationService::notifyStudentPayment($payment, $subject, $body, $meta);
    }
}
