@echo off
rem EduNexus: start the Laravel scheduler at logon (no admin rights needed).
rem Calls scripts/scheduler.ps1, which is idempotent - it exits immediately
rem if a scheduler instance is already running (see storage/scheduler.pid).
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\isahb\Pictures\My Project\EDUNEXUS\edunexus\api\scripts\scheduler.ps1"
