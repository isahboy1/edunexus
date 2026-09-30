<?php

namespace App\Http\Controllers\Student;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Payment;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * School-fee payment lifecycle for enrolled students (SRS §33/§55):
 *   initialize → gateway checkout/RRR → signed webhook (or bursary confirm)
 *   → PaymentService::markStudentPaymentSuccessful → invoice settlement.
 * The webhook is the ONLY path that marks a payment SUCCESSFUL; the browser
 * is never trusted (SRS §43).
 */
class StudentPaymentController extends Controller
{
    public function __construct(private PaymentService $payments)
    {
    }

    /**
     * GET /api/v1/student/invoices — own invoices with itemised fee lines.
     */
    public function invoices(Request $request): JsonResponse
    {
        $student = $request->user()->student()->firstOrFail();

        $invoices = Invoice::with('academicSession:id,name')
            ->where('student_id', $student->id)
            ->where('status', '!=', 'CANCELLED')
            ->orderByDesc('created_at')
            ->get();

        return $this->ok($invoices->map(fn ($i) => [
            'id' => $i->id,
            'invoiceNumber' => $i->invoice_number,
            'type' => $i->invoice_type,
            'session' => $i->academicSession?->name,
            'total' => (float) $i->total_amount,
            'paid' => (float) $i->amount_paid,
            'balance' => (float) $i->balance,
            'status' => $i->status,
            'dueDate' => $i->due_date?->toDateString(),
        ]));
    }

    /**
     * POST /api/v1/student/invoices/{invoice}/payments — start a fee payment.
     * Body (optional): { amount } — defaults to the outstanding balance
     * (partial payments allowed). Reuses an in-flight PENDING/PROCESSING
     * payment instead of creating duplicates; only FAILED spawns a new one.
     */
    public function initialize(Request $request, string $invoice): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['nullable', 'numeric', 'min:1'],
        ]);

        $student = $request->user()->student()->firstOrFail();

        $invoiceModel = Invoice::where('student_id', $student->id)->findOrFail($invoice);

        abort_if($invoiceModel->status === 'CANCELLED', 422, 'This invoice has been cancelled.');
        abort_if((float) $invoiceModel->balance <= 0, 422, 'This invoice is already fully settled.');

        $amount = isset($data['amount'])
            ? round((float) $data['amount'], 2)
            : (float) $invoiceModel->balance;
        abort_if($amount > (float) $invoiceModel->balance + 0.001, 422, 'Payment amount exceeds the invoice balance.');

        // Reuse the in-flight payment (PENDING/PROCESSING): repeated clicks
        // re-issue the same checkout/RRR instead of creating duplicate rows.
        $inflight = $invoiceModel->payments()
            ->where('student_id', $student->id)
            ->whereIn('status', ['PENDING', 'PROCESSING'])
            ->orderByDesc('created_at')
            ->first();

        if ($inflight) {
            $inflight->update([
                'gateway_response' => $this->payments->gatewayFor($inflight->gateway)->initialize($inflight),
            ]);

            return $this->ok($inflight->fresh(), 'Payment initialised.');
        }

        $payment = Payment::create([
            'invoice_id' => $invoiceModel->id,
            'student_id' => $student->id,
            'reference' => 'PAY-'.strtoupper(Str::random(16)),
            'amount' => $amount,
            'currency' => 'NGN',
            'gateway' => config('services.payment.gateway', 'mock'),
            'status' => 'PENDING',
        ]);

        $init = $this->payments->gatewayFor($payment->gateway)->initialize($payment);
        $payment->gateway_response = $init;
        $payment->save();

        $this->audit($request->user(), 'PAYMENT_INITIALIZED', 'Payment', $payment->id, null, [
            'reference' => $payment->reference,
            'invoice' => $invoiceModel->invoice_number,
            'amount' => $amount,
        ]);

        return $this->ok($payment->fresh(), 'Payment initialised.', 201);
    }

    /**
     * GET /api/v1/student/payments/{reference} — own payment incl. invoice
     * (used by the pending-payment banner on /student/fees to resume checkout).
     */
    public function show(Request $request, string $reference): JsonResponse
    {
        $student = $request->user()->student()->firstOrFail();

        $payment = Payment::with('invoice:id,invoice_number,invoice_type,balance')
            ->where('student_id', $student->id)
            ->where(fn ($q) => $q->where('reference', $reference)->orWhere('rrr', $reference))
            ->firstOrFail();

        return $this->ok([
            'reference' => $payment->reference,
            'rrr' => $payment->rrr,
            'amount' => (float) $payment->amount,
            'currency' => $payment->currency,
            'gateway' => $payment->gateway,
            'status' => $payment->status,
            'paidAt' => $payment->paid_at?->toIso8601String(),
            'invoiceId' => $payment->invoice?->id,
            'invoiceNumber' => $payment->invoice?->invoice_number,
            'invoiceBalance' => (float) ($payment->invoice?->balance ?? 0),
            'checkoutUrl' => $payment->gateway_response['checkout_url'] ?? null,
            'instructionUrl' => $payment->gateway_response['instruction_url'] ?? null,
        ]);
    }
}
