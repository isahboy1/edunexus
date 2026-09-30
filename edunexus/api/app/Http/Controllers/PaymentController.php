<?php

namespace App\Http\Controllers;

use App\Models\ApplicationPayment;
use App\Models\Payment;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function __construct(private PaymentService $payments)
    {
    }

    /**
     * POST /api/v1/payments/webhook — the ONLY path that marks payments
     * SUCCESSFUL. HMAC-SHA512 signature verified with the shared secret;
     * unsigned or forged requests are rejected with 401 (SRS §43/§14).
     */
    public function webhook(Request $request): JsonResponse
    {
        $secret = config('services.payment.webhook_secret');
        $signature = (string) $request->header('X-EduNexus-Signature', '');

        abort_if(empty($secret), 500, 'Webhook secret not configured.');
        abort_if($signature === '', 401, 'Missing signature.');
        abort_if(! hash_equals(hash_hmac('sha512', $request->getContent(), $secret), $signature), 401, 'Invalid signature.');

        $event = $request->json()->all();
        $reference = $event['reference'] ?? null;
        $status = strtoupper((string) ($event['status'] ?? ''));

        abort_unless($reference, 422, 'Reference required.');

        $appPayment = ApplicationPayment::where('reference', $reference)->first();
        $feePayment = $appPayment ? null : Payment::where('reference', $reference)->first();
        abort_unless($appPayment || $feePayment, 404, 'Unknown payment reference.');

        $payment = $appPayment ?? $feePayment;

        if ($status === 'SUCCESSFUL' || $status === 'SUCCESS') {
            if ($appPayment) {
                $this->payments->markApplicationPaymentSuccessful($appPayment, $event);
            } else {
                $this->payments->markStudentPaymentSuccessful($feePayment, $event);
            }
            $this->audit(null, 'PAYMENT_SUCCESSFUL', class_basename($payment), $payment->id, null, ['reference' => $reference]);
        } elseif (in_array($status, ['FAILED', 'CANCELLED'], true)) {
            if ($appPayment) {
                $this->payments->markApplicationPaymentFailed($appPayment, $event);
            } else {
                $feePayment->update(['status' => $status]);
                // SRS §35: the payer learns about the failed transaction in-app + email.
                \App\Services\NotificationService::notifyStudentPayment($feePayment, 'Fee payment not completed', sprintf(
                    'Your fee payment of ₦%s (reference %s) was reported %s by the gateway. No amount was deducted from your invoice — please start the payment again from Fees & Payments.',
                    number_format((float) $feePayment->amount, 2),
                    $feePayment->reference,
                    strtolower($status),
                ), [
                    'payment_id' => $feePayment->id,
                    'reference' => $feePayment->reference,
                    'amount' => (float) $feePayment->amount,
                    'gateway_status' => $status,
                ]);
            }
        }

        return response()->json(['ok' => true, 'message' => 'Webhook processed.']);
    }

    /**
     * GET /api/v1/payments/{reference} — server-side verification endpoint.
     * A payment only reads as SUCCESSFUL here after the webhook verified it.
     */
    public function show(Request $request, string $reference): JsonResponse
    {
        $payment = ApplicationPayment::where('reference', $reference)
            ->when($request->user()?->applicant, fn ($q, $a) => $q->whereHas('application', fn ($q2) => $q2->where('applicant_id', $a->id)))
            ->first();

        if (! $payment) {
            $payment = Payment::with(['invoice:id,invoice_number,invoice_type,academic_session_id', 'student.user:id,name'])
                ->where('reference', $reference)
                ->when($request->user()?->student, fn ($q, $s) => $q->where('student_id', $s->id))
                ->firstOrFail();
        }

        // Printable-receipt context: invoice number + payer identity when the
        // caller owns the school-fee payment (application payments omit these).
        $student = $payment instanceof Payment ? $payment->student : null;

        return $this->ok([
            'reference' => $payment->reference,
            'amount' => $payment->amount,
            'currency' => $payment->currency,
            'gateway' => $payment->gateway,
            'rrr' => $payment->rrr,
            'status' => $payment->status,
            'paidAt' => $payment->paid_at?->toIso8601String(),
            'invoiceNumber' => $payment instanceof Payment ? $payment->invoice?->invoice_number : null,
            'invoiceType' => $payment instanceof Payment ? $payment->invoice?->invoice_type : null,
            'payerName' => $student?->user?->name,
            'matricNumber' => $student?->matric_number,
        ]);
    }

    /** GET /api/v1/programmes — public catalogue */
    public function programmes(): JsonResponse
    {
        $programmes = \App\Models\Programme::with(['department.faculty'])
            ->where('status', 'ACTIVE')
            ->orderBy('name')
            ->get()
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'code' => $p->code,
                'award' => $p->award,
                'durationYears' => $p->duration_years,
                'department' => $p->department?->name,
                'faculty' => $p->department?->faculty?->name,
            ]);

        return $this->ok($programmes);
    }

    /** GET /api/v1/public/admission-info — window, fee, deadlines for the homepage */
    public function admissionInfo(): JsonResponse
    {
        $setting = \App\Models\ApplicationSetting::where('is_active', true)
            ->orderByDesc('created_at')
            ->first();

        if (! $setting) {
            return $this->ok(null);
        }

        return $this->ok([
            'fee' => (float) $setting->application_fee,
            'currency' => $setting->currency,
            'opensAt' => $setting->opens_at?->toIso8601String(),
            'closesAt' => $setting->closes_at?->toIso8601String(),
            'registrationClosesAt' => $setting->registration_closes_at?->toIso8601String(),
            'isOpen' => $setting->applicationOpen(),
            'allowedTypes' => $setting->allowed_types,
        ]);
    }

    /** GET /api/v1/public/news */
    public function news(): JsonResponse
    {
        return $this->ok(\App\Models\News::published()->limit(20)->get());
    }

    /** GET /api/v1/public/announcements */
    public function announcements(): JsonResponse
    {
        return $this->ok(\App\Models\Announcement::live()->limit(10)->get());
    }
}
