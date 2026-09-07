# Backs up the One Touch database, keeps 30 days of history, and
# copies the file to a second local-drive location if one is configured.
#
# Run manually:   powershell -File scripts\backup-database.ps1
# Run on schedule: registered in Windows Task Scheduler, every 4 hours
# (see scripts/register-backup-task.ps1).

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root "backend\.env"
$backupDir = Join-Path $root "backups"
$logFile = Join-Path $backupDir "backup.log"
$pgDump = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"

# A second location for the copy. Point this at an external/second drive
# once one is plugged in — e.g. "E:\OneTouchBackups". Left as a local
# folder for now so backups still run without one attached.
$secondaryDir = Join-Path $root "backups-secondary"

$retentionDays = 30

function Write-Log($message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
New-Item -ItemType Directory -Force -Path $secondaryDir | Out-Null

# Pull DATABASE_URL out of backend/.env rather than hardcoding
# credentials here a second time — one source of truth.
$envLine = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL=' }
if (-not $envLine) {
    Write-Log "ERROR: DATABASE_URL not found in backend/.env"
    exit 1
}
$url = ($envLine -replace '^DATABASE_URL="?', '') -replace '"?$', ''
if ($url -notmatch 'postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?]+)') {
    Write-Log "ERROR: could not parse DATABASE_URL"
    exit 1
}
$dbUser = $Matches[1]
$dbPassword = $Matches[2]
$dbHost = $Matches[3]
$dbPort = $Matches[4]
$dbName = $Matches[5]

$timestamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$fileName = "onetouch-$timestamp.sql"
$filePath = Join-Path $backupDir $fileName

Write-Log "Starting backup of '$dbName' -> $fileName"

$env:PGPASSWORD = $dbPassword
try {
    & $pgDump --host=$dbHost --port=$dbPort --username=$dbUser --format=plain --file=$filePath $dbName
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump exited with code $LASTEXITCODE"
    }
} finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

$sizeKb = [math]::Round((Get-Item $filePath).Length / 1KB, 1)
Write-Log "Backup written: $filePath ($sizeKb KB)"

# Copy to the secondary location.
Copy-Item -Path $filePath -Destination $secondaryDir -Force
Write-Log "Copied to secondary location: $secondaryDir\$fileName"

# Clean up backups older than the retention window, in both locations.
foreach ($dir in @($backupDir, $secondaryDir)) {
    Get-ChildItem -Path $dir -Filter "onetouch-*.sql" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$retentionDays) } |
        ForEach-Object {
            Write-Log "Deleting old backup: $($_.FullName)"
            Remove-Item $_.FullName -Force
        }
}

Write-Log "Backup complete."
