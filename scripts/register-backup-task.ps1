# Registers the database backup script to run automatically every 4
# hours, all day and night, via Windows Task Scheduler.
# Run once, as Administrator: powershell -File scripts\register-backup-task.ps1

$ErrorActionPreference = "Stop"
$taskName = "OneTouch Database Backup"
$scriptPath = Join-Path (Split-Path -Parent $PSScriptRoot) "scripts\backup-database.ps1"

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -File `"$scriptPath`""

# Every 4 hours, starting at midnight today, repeating indefinitely.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date -Hour 0 -Minute 0 -Second 0) `
    -RepetitionInterval (New-TimeSpan -Hours 4) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Description "Backs up the One Touch database every 4 hours." `
    -Force

Write-Host "Scheduled task '$taskName' registered - runs every 4 hours."
