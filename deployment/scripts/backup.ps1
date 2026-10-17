<#
.SYNOPSIS
    Uniflow IMS - Automated Database Backup Script (Windows PowerShell)
.DESCRIPTION
    Performs consistent, zero-downtime database backups for PostgreSQL (pg_dump)
    or SQLite (online backup API). Manages rotation by retaining the latest snapshots.
#>

[CmdletBinding()]
param (
    [string]$BackupDir = "backups",
    [int]$RetentionCount = 10
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..\..").Path
$targetBackupDir = Join-Path $rootDir $BackupDir

if (-not (Test-Path $targetBackupDir)) {
    New-Item -ItemType Directory -Path $targetBackupDir -Force | Out-Null
}

# 1. Detect Python Interpreter
$venvPython = "$rootDir\.venv\Scripts\python.exe"
if (Test-Path $venvPython) {
    $pythonCmd = $venvPython
} else {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) {
        $pythonCmd = $cmd.Source
    } else {
        Write-Error "Python 3.12+ was not found."
    }
}

# 2. Extract Active Database Configuration via Django
Write-Host "Detecting active database engine..." -ForegroundColor Cyan

$pythonSnippet = @"
import sys, os
sys.path.insert(0, os.path.join(r'$rootDir', 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', os.getenv('DJANGO_SETTINGS_MODULE', 'config.settings.local'))
import django
django.setup()
from django.conf import settings
db = settings.DATABASES['default']
print('|'.join([str(db.get('ENGINE')), str(db.get('NAME')), str(db.get('USER', '')), str(db.get('HOST', '')), str(db.get('PORT', ''))]))
"@

$dbInfoRaw = & $pythonCmd -c $pythonSnippet
if ($LASTEXITCODE -ne 0 -or -not $dbInfoRaw) {
    Write-Error "Failed to retrieve Django database settings."
}

$dbParts = $dbInfoRaw.Trim().Split("|")
$engine = $dbParts[0]
$dbName = $dbParts[1]
$dbUser = $dbParts[2]
$dbHost = $dbParts[3]
$dbPort = $dbParts[4]

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  UNIFLOW IMS - Database Backup Utility                   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Timestamp: $timestamp" -ForegroundColor Gray
Write-Host "Database Engine: $engine" -ForegroundColor Gray

# 3. Perform Backup
if ($engine -like "*sqlite*") {
    $backupFile = Join-Path $targetBackupDir "uniflow-sqlite3-$timestamp.db"
    Write-Host "Creating consistent SQLite snapshot via Online Backup API..." -ForegroundColor Cyan

    $sqliteSnippet = "import sqlite3; src = sqlite3.connect(r'$dbName'); dst = sqlite3.connect(r'$backupFile'); src.backup(dst); dst.close(); src.close(); print('SUCCESS')"

    $res = & $pythonCmd -c $sqliteSnippet
    if ($LASTEXITCODE -ne 0 -or $res -notlike "*SUCCESS*") {
        Write-Error "SQLite online backup failed."
    }

    $rawSize = (Get-Item $backupFile).Length / 1024
    $roundedSize = [Math]::Round($rawSize, 2)
    Write-Host ("[OK] SQLite backup created: " + $backupFile + " (" + $roundedSize + " KB)") -ForegroundColor Green

} elseif ($engine -like "*postgres*") {
    $backupFile = Join-Path $targetBackupDir "uniflow-postgres-$timestamp.dump"
    Write-Host "Running PostgreSQL pg_dump..." -ForegroundColor Cyan

    $pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
    if (-not $pgDump) {
        Write-Error "pg_dump command not found in PATH. Please install PostgreSQL client tools."
    }

    $pgArgs = @("-Fc", "-d", $dbName, "-f", $backupFile)
    if ($dbHost) { $pgArgs += @("-h", $dbHost) }
    if ($dbPort) { $pgArgs += @("-p", $dbPort) }
    if ($dbUser) { $pgArgs += @("-U", $dbUser) }

    & pg_dump $pgArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Error "PostgreSQL pg_dump failed."
    }

    $rawSize = (Get-Item $backupFile).Length / 1024
    $roundedSize = [Math]::Round($rawSize, 2)
    Write-Host ("[OK] PostgreSQL backup created: " + $backupFile + " (" + $roundedSize + " KB)") -ForegroundColor Green
} else {
    Write-Error "Unsupported database engine: $engine"
}

# 4. Rotation Policy: Retain newest N snapshots
$existingBackups = Get-ChildItem -Path $targetBackupDir -Filter "uniflow-*" | Sort-Object CreationTime -Descending
if ($existingBackups.Count -gt $RetentionCount) {
    Write-Host "`nApplying retention policy (keeping latest $RetentionCount backups)..." -ForegroundColor Yellow
    $toDelete = $existingBackups | Select-Object -Skip $RetentionCount
    foreach ($item in $toDelete) {
        Write-Host "  Removing expired backup: $($item.Name)" -ForegroundColor Gray
        Remove-Item $item.FullName -Force
    }
}

Write-Host "`nBackup completed successfully.`n" -ForegroundColor Green
