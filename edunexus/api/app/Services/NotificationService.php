<?php

namespace App\Services;

use App\Mail\PaymentStatusMail;
use App\Models\Notification;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Mail;

/**
 * Central notification dispatcher (SRS §35). Every notification is stored
 * in-app (channel = IN_APP) AND queued as an email row (channel = EMAIL,
 * status PENDING → SENT/FAILED). The configured mailer (MAIL_MAILER=log in
 * development) delivers synchronously so no queue worker is required; the
 * EMAIL row records the delivery outcome either way.
 *
 * Two audiences exist:
 *  - USER  — a personal row (user_id set), e.g. "your payment was confirmed".
 *  - STAFF — one shared row (user_id NULL) every staff member sees in their
 *    bell, e.g. "payment awaiting confirmation". Read state is shared.
 */
class NotificationService
{
    private const STAFF_ROLES = [
        'SUPER_ADMIN', 'ADMIN', 'REGISTRAR', 'ADMISSIONS_OFFICER',
        'ACADEMIC_OFFICER', 'BURSARY_OFFICER', 'HOD',
    ];

    /**
     * Personal notification for one user: in-app row + email.
     * Accepts null (e.g. a student row whose user relation failed to load) and
     * no-ops instead of blowing up mid-action — notifications are best-effort
     * side effects and must never fail the primary operation.
     */
    public static function notifyUser(?User $user, string $subject, string $body, array $meta = []): void
    {
        if (! $user) {
            return;
        }
        self::inAppRow($user->id, 'USER', $subject, $body, $meta);
        self::queueEmail($user->email, $subject, $body);
    }

    /** Broadcast to the staff portal bell (single shared row + one email per staff). */
    public static function notifyStaff(string $subject, string $body, array $meta = []): void
    {
        self::inAppRow(null, 'STAFF', $subject, $body, $meta);

        foreach (self::staffUsers() as $staff) {
            self::queueEmail($staff->email, $subject, $body);
        }
    }

    /** Convenience: notify the payer of a school-fee payment. */
    public static function notifyStudentPayment(Payment $payment, string $subject, string $body, array $meta = []): void
    {
        $user = $payment->student->user ?? User::find($payment->student()->value('user_id'));
        if ($user) {
            self::notifyUser($user, $subject, $body, $meta);
        }
    }

    public static function staffUsers(): Collection
    {
        return User::whereHas('roles', fn ($q) => $q->whereIn('name', self::STAFF_ROLES))
            ->orderBy('email')
            ->get(['id', 'email']);
    }

    private static function inAppRow(?string $userId, string $audience, string $subject, string $body, array $meta): void
    {
        Notification::create([
            'user_id' => $userId,
            'audience' => $audience,
            'channel' => 'IN_APP',
            'subject' => $subject,
            'body' => $body,
            'status' => 'SENT',
            'sent_at' => now(),
            'meta' => $meta,
            'created_at' => now(),
        ]);
    }

    /**
     * Record the email, deliver it through the configured mailer, and persist
     * the outcome on the row (SENT / FAILED with the transport error).
     */
    private static function queueEmail(string $to, string $subject, string $body): void
    {
        $row = Notification::create([
            'user_id' => null,
            'audience' => 'USER',
            'channel' => 'EMAIL',
            'subject' => $subject,
            'body' => $body,
            'status' => 'PENDING',
            'meta' => ['to' => $to],
            'created_at' => now(),
        ]);

        try {
            Mail::to($to)->send(new PaymentStatusMail($subject, $body));
            $row->update(['status' => 'SENT', 'sent_at' => now()]);
        } catch (\Throwable $e) {
            $row->update([
                'status' => 'FAILED',
                'meta' => array_merge($row->meta ?? [], ['error' => substr($e->getMessage(), 0, 300)]),
            ]);
        }
    }
}
