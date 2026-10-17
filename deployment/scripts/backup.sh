#!/usr/bin/env bash
# ==============================================================================
# Uniflow IMS - Automated Database Backup Script (Linux / macOS POSIX)
# ==============================================================================
# Usage:
#   ./deployment/scripts/backup.sh [BACKUP_DIR] [RETENTION_COUNT]
#
# Defaults:
#   BACKUP_DIR: backups
#   RETENTION_COUNT: 10
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${1:-backups}"
RETENTION_COUNT="${2:-10}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET_BACKUP_DIR="$ROOT_DIR/$BACKUP_DIR"

mkdir -p "$TARGET_BACKUP_DIR"

# 1. Detect Python Interpreter
if [ -f "$ROOT_DIR/.venv/bin/python" ]; then
    PYTHON_CMD="$ROOT_DIR/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    echo "ERROR: Python 3.12+ was not found." >&2
    exit 1
fi

# 2. Extract Active Database Configuration via Django
echo "Detecting active database engine..."
DB_INFO="$("$PYTHON_CMD" -c "
import sys, os
sys.path.insert(0, os.path.join('$ROOT_DIR', 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', os.getenv('DJANGO_SETTINGS_MODULE', 'config.settings.local'))
import django
django.setup()
from django.conf import settings
db = settings.DATABASES['default']
print('|'.join([str(db.get('ENGINE')), str(db.get('NAME')), str(db.get('USER', '')), str(db.get('HOST', '')), str(db.get('PORT', ''))]))
")"

IFS='|' read -r DB_ENGINE DB_NAME DB_USER DB_HOST DB_PORT <<< "$DB_INFO"

TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"

echo "=========================================================="
echo "  UNIFLOW IMS - Database Backup Utility                   "
echo "=========================================================="
echo "Timestamp:       $TIMESTAMP"
echo "Database Engine: $DB_ENGINE"

# 3. Perform Backup
if [[ "$DB_ENGINE" == *"sqlite"* ]]; then
    BACKUP_FILE="$TARGET_BACKUP_DIR/uniflow-sqlite3-$TIMESTAMP.db"
    echo "Creating consistent SQLite snapshot via Online Backup API..."

    "$PYTHON_CMD" -c "
import sqlite3
src = sqlite3.connect(r'$DB_NAME')
dst = sqlite3.connect(r'$BACKUP_FILE')
src.backup(dst)
dst.close()
src.close()
print('SUCCESS')
"
    FILE_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
    echo "[OK] SQLite backup created: $BACKUP_FILE ($FILE_SIZE)"

elif [[ "$DB_ENGINE" == *"postgres"* ]]; then
    BACKUP_FILE="$TARGET_BACKUP_DIR/uniflow-postgres-$TIMESTAMP.dump"
    echo "Running PostgreSQL pg_dump..."

    if ! command -v pg_dump >/dev/null 2>&1; then
        echo "ERROR: pg_dump not found in PATH. Please install PostgreSQL client tools." >&2
        exit 1
    fi

    PG_ARGS=("-Fc" "-d" "$DB_NAME" "-f" "$BACKUP_FILE")
    [[ -n "$DB_HOST" ]] && PG_ARGS+=("-h" "$DB_HOST")
    [[ -n "$DB_PORT" ]] && PG_ARGS+=("-p" "$DB_PORT")
    [[ -n "$DB_USER" ]] && PG_ARGS+=("-U" "$DB_USER")

    pg_dump "${PG_ARGS[@]}"

    FILE_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
    echo "[OK] PostgreSQL backup created: $BACKUP_FILE ($FILE_SIZE)"
else
    echo "ERROR: Unsupported database engine: $DB_ENGINE" >&2
    exit 1
fi

# 4. Rotation Policy: Retain newest N snapshots
EXISTING_COUNT="$(find "$TARGET_BACKUP_DIR" -maxdepth 1 -name "uniflow-*" | wc -l)"
if [ "$EXISTING_COUNT" -gt "$RETENTION_COUNT" ]; then
    echo ""
    echo "Applying retention policy (keeping latest $RETENTION_COUNT backups)..."
    find "$TARGET_BACKUP_DIR" -maxdepth 1 -name "uniflow-*" -printf '%T@ %p\n' 2>/dev/null | \
        sort -nr | \
        tail -n +$((RETENTION_COUNT + 1)) | \
        awk '{print $2}' | \
        while read -r old_file; do
            echo "  Removing expired backup: $(basename "$old_file")"
            rm -f "$old_file"
        done
fi

echo ""
echo "Backup completed successfully."
echo ""
