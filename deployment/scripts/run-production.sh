#!/usr/bin/env bash
# ==============================================================================
# Uniflow IMS - Production Startup Runner for Linux / POSIX Host
# ==============================================================================
# Validates runtime dependencies, executes database migrations, collects Django static assets,
# compiles the React 19 production bundle, and launches the application backend.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
SKIP_BUILD="${SKIP_BUILD:-false}"

echo "=========================================================="
echo "  UNIFLOW IMS - Production Startup Runner (Linux Host)    "
echo "=========================================================="
echo "Repository Root: ${ROOT_DIR}"

# 1. Detect Python Interpreter
if [ -f "${ROOT_DIR}/.venv/bin/python" ]; then
    PYTHON_CMD="${ROOT_DIR}/.venv/bin/python"
    echo "[✓] Using virtual environment Python: ${PYTHON_CMD}"
elif command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
    echo "[✓] Using system Python: ${PYTHON_CMD}"
else
    echo "[-] Error: Python 3.12+ was not found. Please activate your virtual environment or install python3." >&2
    exit 1
fi

# 2. Check Node.js and NPM
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    echo "[-] Error: Node.js (20+ LTS) and npm are required to build the frontend." >&2
    exit 1
fi
echo "[✓] Detected Node.js $(node -v) and npm $(npm -v)"

# 3. Verify .env Configuration
if [ ! -f "${ROOT_DIR}/.env" ]; then
    echo "[!] Warning: No .env file found at ${ROOT_DIR}/.env. Using defaults from base settings."
else
    echo "[✓] Loaded environment configuration from ${ROOT_DIR}/.env"
fi

# 4. Run Database Schema Migrations
echo ""
echo "[1/3] Applying database schema migrations..."
"${PYTHON_CMD}" "${ROOT_DIR}/backend/manage.py" migrate --noinput
echo "[✓] Database migrations up to date."

# 5. Collect Static Assets
echo ""
echo "[2/3] Collecting Django static assets..."
"${PYTHON_CMD}" "${ROOT_DIR}/backend/manage.py" collectstatic --noinput
echo "[✓] Static assets collected in backend/staticfiles."

# 6. Build Frontend Production Bundle
if [ "${SKIP_BUILD}" != "true" ]; then
    echo ""
    echo "[3/3] Compiling React 19 Vite production bundle..."
    (cd "${ROOT_DIR}/frontend" && npm run build)
    echo "[✓] Frontend compiled into frontend/dist."
else
    echo ""
    echo "[3/3] Skipping frontend build (SKIP_BUILD=true)."
fi

# 7. Start Backend Application
echo ""
echo "=========================================================="
echo "  Uniflow IMS is ready for local production serving!      "
echo "=========================================================="
echo "  Backend Application Server: http://${HOST}:${PORT}/"
echo "  API Base:                   http://${HOST}:${PORT}/api/v1/"
echo "  Health Check:               http://${HOST}:${PORT}/api/v1/health/"
echo "  Reverse Proxy Target:       Configure Nginx or Caddy to proxy to http://${HOST}:${PORT}/"
echo "=========================================================="
echo "Starting application server (Press Ctrl+C to stop)..."
echo ""

export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}"
exec "${PYTHON_CMD}" "${ROOT_DIR}/backend/manage.py" runserver "${HOST}:${PORT}"
