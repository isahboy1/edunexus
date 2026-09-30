<?php

namespace App\Console\Commands;

use App\Services\IncompleteApplicationNudger;
use Illuminate\Console\Command;

class NudgeIncompleteApplications extends Command
{
    protected $signature = 'applications:nudge-incomplete
        {--days= : Only nudge applications at least this many days old (default: all configured thresholds)}
        {--dry-run : Report what would be sent without sending}';

    protected $description = 'Email applicants whose applications are still missing submission requirements';

    public function handle(IncompleteApplicationNudger $nudger): int
    {
        $days = $this->option('days') !== null ? (int) $this->option('days') : null;
        $dryRun = (bool) $this->option('dry-run');

        $result = $nudger->nudge($days, $dryRun);

        $this->info(($dryRun ? '[DRY RUN] ' : '')."{$result['notified']} nudge(s) sent, {$result['skipped']} skipped.");
        foreach ($result['details'] as $d) {
            $this->line("  • {$d['application']} → {$d['email']} (day threshold {$d['threshold']}, {$d['daysOld']} days old)");
            foreach ($d['missing'] as $m) {
                $this->line("      - {$m}");
            }
        }

        return self::SUCCESS;
    }
}
