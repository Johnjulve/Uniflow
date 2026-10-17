<#
.SYNOPSIS
    Uniflow IMS - Production Startup Runner for Windows Server / On-Premise Host
.DESCRIPTION
    Validates runtime dependencies, executes database migrations, collects Django static assets,
    compiles the React 19 production bundle, and launches the application backend.
#>

[CmdletBinding()]
param (
    [string]$HostAddress = "127.0.0.1",
    [int]$Port = 8000,
    [switch]$SkipBuild = $false
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..\..").Path

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  UNIFLOW IMS - Production Startup Runner (Windows Host)  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Repository Root: $rootDir" -ForegroundColor Gray

# 1. Detect Python Interpreter
$venvPython = "$rootDir\.venv\Scripts\python.exe"
if (Test-Path $venvPython) {
    $pythonCmd = $venvPython
    Write-Host "[✓] Using virtual environment Python: $pythonCmd" -ForegroundColor Green
} else {
    $pythonCmd = (Get-Command python -ErrorAction SilentlyContinue)?.Source
    if (-not $pythonCmd) {
        Write-Error "Python 3.12+ was not found. Please create a virtual environment at .venv or add python to PATH."
    }
    Write-Host "[✓] Using system Python: $pythonCmd" -ForegroundColor Yellow
}

# 2. Check Node.js and NPM
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $nodeCmd -or -not $npmCmd) {
    Write-Error "Node.js (20+ LTS) and npm are required to build the frontend. Please install Node.js."
}
Write-Host "[✓] Detected Node.js $((& node -v)) and npm $((& npm -v))" -ForegroundColor Green

# 3. Verify .env Configuration
$envFile = "$rootDir\.env"
if (-not (Test-Path $envFile)) {
    Write-Warning "No .env file found at $envFile. Using defaults from base settings."
    Write-Host "    To configure production settings, copy .env.example to .env and set DJANGO_SETTINGS_MODULE=config.settings.production" -ForegroundColor Gray
} else {
    Write-Host "[✓] Loaded environment configuration from $envFile" -ForegroundColor Green
}

# 4. Run Database Schema Migrations
Write-Host "`n[1/3] Applying database schema migrations..." -ForegroundColor Cyan
& $pythonCmd "$rootDir\backend\manage.py" migrate --noinput
if ($LASTEXITCODE -ne 0) {
    Write-Error "Database migrations failed. Check database connectivity."
}
Write-Host "[✓] Database migrations up to date." -ForegroundColor Green

# 5. Collect Static Assets
Write-Host "`n[2/3] Collecting Django static assets..." -ForegroundColor Cyan
& $pythonCmd "$rootDir\backend\manage.py" collectstatic --noinput
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to collect static assets."
}
Write-Host "[✓] Static assets collected in backend\staticfiles." -ForegroundColor Green

# 6. Build Frontend Production Bundle
if (-not $SkipBuild) {
    Write-Host "`n[3/3] Compiling React 19 Vite production bundle..." -ForegroundColor Cyan
    Push-Location "$rootDir\frontend"
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Frontend production build failed."
        }
    } finally {
        Pop-Location
    }
    Write-Host "[✓] Frontend compiled into frontend\dist." -ForegroundColor Green
} else {
    Write-Host "`n[3/3] Skipping frontend build as requested (-SkipBuild)." -ForegroundColor Yellow
}

# 7. Start Backend Application
Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  Uniflow IMS is ready for local production serving!      " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Backend Application Server: http://${HostAddress}:${Port}/" -ForegroundColor White
Write-Host "  API Base:                   http://${HostAddress}:${Port}/api/v1/" -ForegroundColor White
Write-Host "  Health Check:               http://${HostAddress}:${Port}/api/v1/health/" -ForegroundColor White
Write-Host "  Reverse Proxy Target:       Configure Nginx or Caddy to point to http://${HostAddress}:${Port}/" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Starting application server (Press Ctrl+C to stop)...`n" -ForegroundColor Cyan

# Set production environment variable if not explicitly defined
if (-not $env:DJANGO_SETTINGS_MODULE) {
    $env:DJANGO_SETTINGS_MODULE = "config.settings.production"
}

& $pythonCmd "$rootDir\backend\manage.py" runserver "${HostAddress}:${Port}"
