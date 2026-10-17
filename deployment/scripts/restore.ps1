<#
.SYNOPSIS
    Uniflow IMS - Automated Database Restoration & Verification Script (Windows PowerShell)
.DESCRIPTION
    Restores database from a designated snapshot (.dump for PostgreSQL or .db for SQLite)
    and executes post-restore verification:
      1. Database connection check
      2. Table row count audits
      3. Ledger reconciliation check (StockBalance.current_quantity == Sum(StockMovement.quantity))
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$BackupFile,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..\..").Path

# Resolve backup file path
if (-not (Test-Path $BackupFile)) {
    $altPath = Join-Path $rootDir $BackupFile
    if (Test-Path $altPath) {
        $BackupFile = (Resolve-Path $altPath).Path
    } else {
        Write-Error "Backup file not found: $BackupFile"
    }
} else {
    $BackupFile = (Resolve-Path $BackupFile).Path
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

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  UNIFLOW IMS - Database Restore & Verification           " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Backup Source:   $BackupFile" -ForegroundColor Gray
Write-Host "Database Engine: $engine" -ForegroundColor Gray
Write-Host "Target Database: $dbName" -ForegroundColor Gray

if (-not $Force) {
    Write-Host "`nWARNING: Restoring will overwrite existing data in the target database." -ForegroundColor Yellow
    $confirm = Read-Host "Are you sure you want to proceed with restoration? (y/N)"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host "Restoration cancelled by user." -ForegroundColor Yellow
        exit 0
    }
}

# 3. Perform Restoration
if ($engine -like "*sqlite*") {
    Write-Host "`nRestoring SQLite database..." -ForegroundColor Cyan
    if (Test-Path $dbName) {
        $safetyBak = "$dbName.pre-restore-$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
        Copy-Item -Path $dbName -Destination $safetyBak -Force
        Write-Host "  Safety snapshot of active DB saved to: $safetyBak" -ForegroundColor Gray
    }
    
    $restoreSnippet = @"
import sqlite3
src = sqlite3.connect(r'$BackupFile')
dst = sqlite3.connect(r'$dbName')
src.backup(dst)
dst.close()
src.close()
print('RESTORE_SUCCESS')
"@
    $res = & $pythonCmd -c $restoreSnippet
    if ($LASTEXITCODE -ne 0 -or $res -notlike "*RESTORE_SUCCESS*") {
        Write-Error "SQLite restoration failed."
    }
    Write-Host "  [OK] SQLite database restored successfully." -ForegroundColor Green

} elseif ($engine -like "*postgres*") {
    Write-Host "`nRestoring PostgreSQL database via pg_restore..." -ForegroundColor Cyan
    $pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
    if (-not $pgRestore) {
        Write-Error "pg_restore command not found in PATH. Please install PostgreSQL client tools."
    }

    $pgArgs = @("--clean", "--if-exists", "-d", $dbName)
    if ($dbHost) { $pgArgs += @("-h", $dbHost) }
    if ($dbPort) { $pgArgs += @("-p", $dbPort) }
    if ($dbUser) { $pgArgs += @("-U", $dbUser) }
    $pgArgs += $BackupFile

    & pg_restore $pgArgs
    Write-Host "  [OK] pg_restore command completed." -ForegroundColor Green
} else {
    Write-Error "Unsupported database engine: $engine"
}

# 4. Post-Restore Verification
Write-Host "`nRunning Post-Restore Verification Checks..." -ForegroundColor Cyan

$verifySnippet = @"
import sys, os
from decimal import Decimal
sys.path.insert(0, os.path.join(r'$rootDir', 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', os.getenv('DJANGO_SETTINGS_MODULE', 'config.settings.local'))
import django
django.setup()

from django.db import connection
from django.db.models import Sum
from apps.catalog.models import Product, Category
from apps.inventory.models import StockBalance, StockMovement, Location
from apps.purchasing.models import PurchaseOrder, Supplier
from django.contrib.auth import get_user_model
User = get_user_model()

# 1. Connection check
connection.ensure_connection()
print('[OK] Database connectivity verified.')

# 2. Table row count verification
print(f'  - Users:             {User.objects.count()}')
print(f'  - Products:          {Product.objects.count()} (Categories: {Category.objects.count()})')
print(f'  - Locations:         {Location.objects.count()}')
print(f'  - Stock Balances:    {StockBalance.objects.count()}')
print(f'  - Stock Movements:   {StockMovement.objects.count()}')
print(f'  - Suppliers:         {Supplier.objects.count()}')
print(f'  - Purchase Orders:   {PurchaseOrder.objects.count()}')

# 3. Authoritative Inventory Ledger Reconciliation Check
discrepancies = []
for balance in StockBalance.objects.select_related('product', 'location'):
    mov_total = StockMovement.objects.filter(
        product=balance.product,
        location=balance.location
    ).aggregate(total=Sum('quantity'))['total'] or Decimal('0.00')
    if balance.current_quantity != mov_total:
        discrepancies.append(
            f'SKU: {balance.product.sku} at Location: {balance.location.code} | Balance: {balance.current_quantity} vs Ledger: {mov_total}'
        )

if discrepancies:
    print(f'[FAIL] Reconciliation failed with {len(discrepancies)} discrepancy(ies):')
    for d in discrepancies[:10]:
        print(f'  * {d}')
    sys.exit(1)
else:
    print('[OK] Ledger Invariant Verified: 100% of StockBalances reconcile with StockMovements.')

print('VERIFICATION_SUCCESS')
"@

$verifyRes = & $pythonCmd -c $verifySnippet
$verifyText = $verifyRes -join "`n"
if ($LASTEXITCODE -ne 0 -or -not ($verifyText -like "*VERIFICATION_SUCCESS*")) {
    Write-Host $verifyText
    Write-Error "Post-restore verification failed."
} else {
    Write-Host $verifyText
    Write-Host "`nDatabase restore and verification completed successfully!`n" -ForegroundColor Green
}
