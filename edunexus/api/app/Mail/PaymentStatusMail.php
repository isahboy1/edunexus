<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Transactional payment-status email. Renders the plain-text body written by
 * NotificationService inside a minimal wrapper view. The body is written once
 * and shared by the in-app row and this email so both channels stay in sync.
 */
class PaymentStatusMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $subjectLine, public string $bodyText)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subjectLine);
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'emails.payment-status',
            with: ['bodyText' => $this->bodyText],
        );
    }
}
