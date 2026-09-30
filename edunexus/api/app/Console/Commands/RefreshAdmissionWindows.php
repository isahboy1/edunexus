<?php

namespace App\Console\Commands;

use App\Models\ApplicationSetting;
use Illuminate\Console\Command;

class RefreshAdmissionWindows extends Command
{
    protected $signature = 'admissions:refresh-window
        {--open-days=30 : How many days ago the refreshed window should have opened}
        {--days=120 : How many days from today the refreshed window should close}
        {--dry-run : Report what would change without writing}';

    protected $description = 'Re-anchor active admission windows to today so application deadlines never expire (mirrors the relative dates in DatabaseSeeder)';

    public function handle(): int
    {
        $openDays = max(0, (int) $this->option('open-days'));
        $closeDays = max(1, (int) $this->option('days'));

        $opensAt = now()->subDays($openDays)->startOfDay();
        $closesAt = now()->addDays($closeDays)->endOfDay();
        // Registration stays open 7 days past the application close date,
        // matching the seeder's +120/+127 pairing.
        $registrationClosesAt = $closesAt->copy()->addDays(7)->endOfDay();

        // Only windows that are active AND carry a deadline that has already
        // passed (or expires within 30 days). Windows with explicit far-future
        // dates — e.g. a real session configured by an admin — are untouched,
        // which also makes repeated runs idempotent.
        $windows = ApplicationSetting::query()
            ->with('academicSession')
            ->where('is_active', true)
            ->whereNotNull('closes_at')
            ->where('closes_at', '<', now()->addDays(30))
            ->get();

        if ($windows->isEmpty()) {
            $this->info('No active admission windows need refreshing.');

            return self::SUCCESS;
        }

        foreach ($windows as $window) {
            $session = $window->academicSession?->name ?? $window->academic_session_id;
            $this->line("  • {$session}: closes ".($window->closes_at?->format('Y-m-d H:i') ?? '—').' → '.$closesAt->format('Y-m-d H:i'));

            if (! $this->option('dry-run')) {
                $window->fill([
                    'opens_at' => $opensAt,
                    'closes_at' => $closesAt,
                    'registration_closes_at' => $registrationClosesAt,
                ])->save();
            }
        }

        $this->info(
            ($this->option('dry-run') ? '[DRY RUN] ' : '')
            .$windows->count().' window(s) refreshed — now closes '.$closesAt->format('Y-m-d H:i').'.'
        );

        return self::SUCCESS;
    }
}
