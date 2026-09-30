<?php

namespace App\Services;

use App\Models\Application;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * IncompleteApplicationNudger — emails applicants whose applications are
 * still missing submission requirements after N days. Dedupe: one nudge per
 * application per day-threshold, recorded as an EMAIL Notification row
 * (meta.application_id + meta.threshold_days + meta.missing_hash) so repeated
 * runs don't spam; a NEW nudge is sent only when the missing-fields list
 * changes or the next threshold is crossed.
 */
class IncompleteApplicationNudger
{
    /** Thresholds (days since creation) that trigger a nudge. */
    public const THRESHOLDS = [3, 7, 14];

    public function __construct(private ApplicationCompletenessService $completeness)
    {
    }

    /**
     * @return array{notified: int, skipped: int, details: array<int, array{application: string, email: string, missing: string[], threshold: int}>}
     */
    public function nudge(?int $minDays = null, bool $dryRun = false): array
    {
        $thresholds = $minDays !== null ? [$minDays] : self::THRESHOLDS;

        $candidates = Application::with(['applicant.user', 'payments'])
            ->incomplete()
            ->whereDoesntHave('admission') // admitted/decided apps never nudged
            ->whereNull('submitted_at')
            ->where('created_at', '>=', now()->subDays(max($thresholds) + 21)) // hard cutoff
            ->get();

        $notified = 0;
        $skipped = 0;
        $details = [];

        foreach ($candidates as $application) {
            $daysOld = (int) $application->created_at->diffInDays(now());
            $applicable = array_values(array_filter(
                $thresholds,
                fn ($t) => $daysOld >= $t
            ));
            if ($applicable === []) {
                $skipped++;
                continue;
            }
            $threshold = max($applicable);

            $report = $this->completeness->describe($application);
            $missing = collect($report['sections'])
                ->flatMap(fn ($s) => array_map(fn ($m) => "{$s['label']}: {$m}", $s['missing']))
                ->values()
                ->all();
            if ($missing === []) {
                $skipped++;
                continue;
            }

            // Dedupe: same application + threshold + identical missing list.
            $hash = md5(implode('|', $missing));
            $already = Notification::where('user_id', $application->applicant->user_id)
                ->where('channel', 'EMAIL')
                ->whereJsonContains('meta->application_id', $application->id)
                ->whereJsonContains('meta->threshold_days', $threshold)
                ->whereJsonContains('meta->missing_hash', $hash)
                ->exists();
            if ($already) {
                $skipped++;
                continue;
            }

            $user = $application->applicant->user;
            if (! $user) {
                $skipped++;
                continue;
            }

            if (! $dryRun) {
                $this->send($user, $application, $missing, $daysOld, $threshold);
            }

            $details[] = [
                'application' => $application->application_number,
                'email' => $user->email,
                'missing' => $missing,
                'threshold' => $threshold,
                'daysOld' => $daysOld,
            ];
            $notified++;
        }

        return ['notified' => $notified, 'skipped' => $skipped, 'details' => $details];
    }

    /**
     * Deliver the nudge: an EMAIL notification row (portal audit trail) plus
     * a Mail::raw through the log/SMTP mailer for actual delivery.
     */
    private function send(User $user, Application $application, array $missing, int $daysOld, int $threshold): void
    {
        $list = collect($missing)->map(fn ($m) => "  • {$m}")->implode("\n");
        $subject = 'Action needed: your application '.$application->application_number.' is incomplete';
        $portalUrl = rtrim((string) config('app.url', url('/')), '/');

        $body = <<<TXT
        Dear {$user->name},

        Your application {$application->application_number} ({$application->created_at->format('j M Y')}) has been incomplete for {$daysOld} days. To be considered for admission, please complete the following on the applicant portal:

        {$list}

        Log in at {$portalUrl} to finish your application. Your form unlocks only after the application fee is paid.

        — {$this->instName()} Admissions Office
        TXT;

        // 1. Portal notification trail (in-app + audit).
        Notification::create([
            'user_id' => $user->id,
            'channel' => 'EMAIL',
            'subject' => $subject,
            'body' => $body,
            'status' => 'PENDING',
            'meta' => [
                'application_id' => $application->id,
                'threshold_days' => $threshold,
                'missing_hash' => md5(implode('|', $missing)),
                'missing' => $missing,
                'days_old' => $daysOld,
            ],
            'created_at' => now(),
        ]);

        // 2. Actual mail delivery (log driver in dev; SMTP in production).
        \Illuminate\Support\Facades\Mail::raw($body, function ($m) use ($user, $subject) {
            $m->to($user->email)->subject($subject);
        });
    }

    private function instName(): string
    {
        return (string) config('app.name', 'EduNexus');
    }
}
