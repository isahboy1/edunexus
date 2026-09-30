# EduNexus Laravel scheduler launcher (Windows).
#
#   scheduler.ps1            start "php artisan schedule:work" if not already running
#   scheduler.ps1 -Stop      stop the scheduler instance started by this script
#   scheduler.ps1 -Install   register a per-user scheduled task that runs this
#                            script at logon (no admin rights needed)
#   scheduler.ps1 -Status    show whether the scheduler is running
#
# schedule:work keeps the scheduler ticking every minute while the machine is
# on, so the weekly "admissions:refresh-window" (Mon 06:00) and the daily
# incomplete-application nudger (09:00) actually fire. Output is appended to
# storage/logs/scheduler-*.log.

param(
    [switch]$Stop,
    [switch]$Install,
    [switch]$Status
)

$ErrorActionPreference = "Stop"

# PHP 8.4+ is required by composer.json (XAMPP ships 8.0 and fails the
# platform check). Primary path first, then the tools-dir fallback.
$phpCandidates = @(
    "C:\Users\isahb\tools\php84\php.exe",
    (Join-Path $env:LOCALAPPDATA "tools\php84\php.exe")
)
$php = $phpCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $php) { throw "php.exe not found (looked in: $($phpCandidates -join ', '))" }

$apiDir  = Split-Path -Parent $PSScriptRoot   # this file lives in api/scripts
$pidFile = Join-Path $apiDir "storage\scheduler.pid"
$logDir  = Join-Path $apiDir "storage\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Get-SchedulerProcess {
    if (Test-Path $pidFile) {
        return Get-Process -Id (Get-Content $pidFile) -ErrorAction SilentlyContinue
    }
    return $null
}

if ($Install) {
    $argString = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $PSCommandPath + '"'
    $action   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argString
    $trigger  = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName "EduNexus Scheduler" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
    Write-Output "Scheduled task 'EduNexus Scheduler' registered - starts the Laravel scheduler at logon."
    exit 0
}

if ($Status) {
    $proc = Get-SchedulerProcess
    if ($proc) { Write-Output "Scheduler running (PID $($proc.Id), php $php)." }
    else       { Write-Output "Scheduler NOT running." }
    exit 0
}

if ($Stop) {
    $proc = Get-SchedulerProcess
    if ($proc) {
        Stop-Process -Id $proc.Id -Force
        Write-Output "Scheduler stopped (PID $($proc.Id))."
    } else {
        Write-Output "Scheduler was not running (no live PID file)."
    }
    if (Test-Path $pidFile) { Remove-Item $pidFile -ErrorAction SilentlyContinue }
    exit 0
}

# Default: start if not already running (idempotent).
$proc = Get-SchedulerProcess
if ($proc) {
    Write-Output "Scheduler already running (PID $($proc.Id))."
    exit 0
}

$outLog = Join-Path $logDir "scheduler.out.log"
$errLog = Join-Path $logDir "scheduler.err.log"
$started = Start-Process -FilePath $php -ArgumentList "artisan", "schedule:work" -WorkingDirectory $apiDir -WindowStyle Hidden -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog
Set-Content -Path $pidFile -Value $started.Id
Write-Output "Scheduler started (PID $($started.Id)). Logs: storage/logs/scheduler-*.log"
