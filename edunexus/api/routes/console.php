<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Daily 09:00 — nudge applicants whose applications are incomplete.
// Dedupe lives in IncompleteApplicationNudger: an identical missing-fields
// list is only reminded once per day-threshold (3 / 7 / 14 days).
Schedule::command('applications:nudge-incomplete')->dailyAt('09:00');

// Weekly (Mon 06:00) — re-anchor demo admission windows to today so the
// application deadline never slips into the past. The command only touches
// windows expiring within 30 days, so weekly cadence is a safe margin and
// admin-configured far-future windows are never modified.
Schedule::command('admissions:refresh-window')->weeklyOn(1, '06:00');
