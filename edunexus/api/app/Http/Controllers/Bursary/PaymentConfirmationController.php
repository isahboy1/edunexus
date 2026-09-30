<?php

namespace App\Http\Controllers\Bursary;

use App\Http\Controllers\Controller;
use App\Models\ApplicationPayment;
use App\Models\Payment;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Bursary checkpoints from the AKCILS registration procedure:
 * the applicant/student pays the RRR at a bank/ATM, the bursary officer
 * confirms the payment in the system (or the Remita webhook arrives first —
 * both paths are idempotent and end in the same server-verified SUCCESSFUL
 * state). Covers BOTH payment kinds: application fees (ApplicationPayment)
 * and school fees (Payment against an invoice).
 */
class PaymentConfirmationController extends Controller
{
    public function __construct(private PaymentService $payments)
    {
    }

    /**
     * GET /api/v1/bursary/payments?status=PENDING&q=RRR|reference
     * Unified queue of payments awaiting confirmation (application fees +
     * school-fee payments). Rows are tagged with `kind` for the UI.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'BURSARY_OFFICER', 'REGISTRAR');

        $status = $request->filled('status') ? strtoupper($request->string('status')) : null;
        $term = $request->filled('q') ? '%'.$request->string('q').'%' : null;

        $appQuery = ApplicationPayment::query()->with(['application.applicant', 'application.programme']);
        $feeQuery = Payment::query()->with(['student.user:id,name', 'invoice:id,invoice_number,invoice_type']);

        foreach ([$appQuery, $feeQuery] as $q) {
            if ($status !== null) {
                $q->where('status', $status);
            }
            if ($term !== null) {
                $q->where(fn ($w) => $w->where('reference', 'like', $term)->orWhere('rrr', 'like', $term));
            }
        }

        $appRows = $appQuery->orderByDesc('created_at')->get()
            ->map(fn (ApplicationPayment $p) => $this->applicationRow($p));
        $feeRows = $feeQuery->orderByDesc('created_at')->get()
            ->map(fn (Payment $p) => $this->feeRow($p));

        $merged = $appRows->concat($feeRows)
            ->sortByDesc('createdAt')
            ->values();

        $total = $merged->count();
        $perPage = max(1, (int) $request->query('perPage', '25'));
        $page = max(1, (int) $request->query('page', '1'));
        $rows = $merged->forPage($page, $perPage)->values();

        return $this->ok([
            'data' => $rows,
            'total' => $total,
            'current_page' => $page,
            'last_page' => (int) ceil(max($total, 1) / $perPage),
        ]);
    }

    /**
     * GET /api/v1/bursary/payments/{reference} — single payment with gateway
     * verification (re-queries Remita transaction.status when configured).
     * Looks up both payment kinds.
     */
    public function show(Request $request, string $reference): JsonResponse
    {
        $this->authorizeRoles($request->user(), 'SUPER_ADMIN', 'BURSARY_OFFICER', 'REGISTRAR');

        $payment = $this->findPayment($reference);

        $verified = $this->payments->gatewayFor($payment->gateway)->verify($payment);

        return $this->ok([
            'payment' => $payment->fresh(),
            'gatewayVerification' => $verified,
        ]);
    }

    /**
     * POST /api/v1/bursary/payments/{reference}/confirm — the bursary
     * checkpoint. Marks the payment SUCCESSFUL after teller confirmation;
     * every confirm lands in the audit log. For school fees the invoice
     * balance is settled atomically by PaymentService.
     */
    public function confirm(Request $request, string $reference): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'BURSARY_OFFICER', 'REGISTRAR');

        $payment = $this->findPayment($reference);

        abort_if($payment->status === 'SUCCESSFUL', 422, 'Payment is already confirmed.');

        if ($payment instanceof ApplicationPayment) {
            $this->payments->markApplicationPaymentSuccessful($payment, [
                'confirmed_by' => $user->email,
                'confirmed_at' => now()->toIso8601String(),
                'channel' => 'bursary',
            ]);
            $this->audit($user, 'PAYMENT_CONFIRMED_BURSARY', 'ApplicationPayment', $payment->id, null, [
                'reference' => $payment->reference,
                'rrr' => $payment->rrr,
                'amount' => $payment->amount,
            ]);
        } else {
            $this->payments->markStudentPaymentSuccessful($payment, [
                'confirmed_by' => $user->email,
                'confirmed_at' => now()->toIso8601String(),
                'channel' => 'bursary',
            ]);
            $this->audit($user, 'PAYMENT_CONFIRMED_BURSARY', 'Payment', $payment->id, null, [
                'reference' => $payment->reference,
                'rrr' => $payment->rrr,
                'amount' => $payment->amount,
                'invoice' => $payment->invoice?->invoice_number,
            ]);
        }

        return $this->ok($payment->fresh(), 'Payment confirmed and receipt generated.');
    }

    /**
     * POST /api/v1/bursary/payments/{reference}/verify — re-query the gateway
     * and apply the outcome (used before confirming large payments).
     */
    public function verifyWithGateway(Request $request, string $reference): JsonResponse
    {
        $user = $request->user();
        $this->authorizeRoles($user, 'SUPER_ADMIN', 'BURSARY_OFFICER', 'REGISTRAR');

        $payment = $this->findPayment($reference);

        $verified = $this->payments->gatewayFor($payment->gateway)->verify($payment);

        if (($verified['status'] ?? null) === 'SUCCESSFUL' && $payment->status !== 'SUCCESSFUL') {
            if ($payment instanceof ApplicationPayment) {
                $this->payments->markApplicationPaymentSuccessful($payment, [
                    'verified_by' => $user->email,
                    'channel' => 'gateway-verify',
                ]);
            } else {
                $this->payments->markStudentPaymentSuccessful($payment, [
                    'verified_by' => $user->email,
                    'channel' => 'gateway-verify',
                ]);
            }
            $this->audit($user, 'PAYMENT_VERIFIED_GATEWAY', class_basename($payment), $payment->id);
        }

        return $this->ok([
            'payment' => $payment->fresh(),
            'gatewayVerification' => $verified,
        ], 'Gateway verification complete.');
    }

    /* ── Helpers ──────────────────────────────────────────────────── */

    private function findPayment(string $reference): ApplicationPayment|Payment
    {
        $payment = ApplicationPayment::where('reference', $reference)
            ->orWhere('rrr', $reference)
            ->first();

        if (! $payment) {
            $payment = Payment::where('reference', $reference)
                ->orWhere('rrr', $reference)
                ->first();
        }

        return $payment ?? abort(404, 'Payment not found.');
    }

    private function applicationRow(ApplicationPayment $p): array
    {
        return [
            'kind' => 'APPLICATION_FEE',
            'id' => $p->id,
            'reference' => $p->reference,
            'rrr' => $p->rrr,
            'amount' => $p->amount,
            'currency' => $p->currency,
            'gateway' => $p->gateway,
            'status' => $p->status,
            'createdAt' => $p->created_at?->toIso8601String(),
            'payer' => trim(($p->application?->applicant?->surname ?? '').' '.
                ($p->application?->applicant?->firstName ?? '')) ?: null,
            'context' => $p->application?->applicationNumber,
            'programme' => $p->application?->programme?->code,
        ];
    }

    private function feeRow(Payment $p): array
    {
        return [
            'kind' => 'SCHOOL_FEES',
            'id' => $p->id,
            'reference' => $p->reference,
            'rrr' => $p->rrr,
            'amount' => $p->amount,
            'currency' => $p->currency,
            'gateway' => $p->gateway,
            'status' => $p->status,
            'createdAt' => $p->created_at?->toIso8601String(),
            'payer' => $p->student?->user?->name,
            'context' => $p->invoice?->invoice_number,
            'programme' => $p->invoice?->invoice_type,
        ];
    }
}
