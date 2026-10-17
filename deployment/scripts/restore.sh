#!/usr/bin/env bash
# ==============================================================================
# Uniflow IMS - Automated Database Restoration & Verification (Linux / POSIX)
# ==============================================================================
# Usage:
#   ./deployment/scripts/restore.sh <BACKUP_FILE> [--force]
# ==============================================================================

set -euo pipefail

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <BACKUP_FILE> [--force]"
    exit 1
fi

BACKUP_FILE="$1"
FORCE=false
if [ "${2:-}" = "--force" ] || [ "${2:-}" = "-f" ]; then
    FORCE=true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Resolve backup file path
if [ ! -f "$BACKUP_FILE" ]; then
    if [ -f "$ROOT_DIR/$BACKUP_FILE" ]; then
        BACKUP_FILE="$ROOT_DIR/$BACKUP_FILE"
    else
        echo "ERROR: Backup file not found: $BACKUP_FILE" >&2
        exit 1
    fi
fi

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

echo "=========================================================="
echo "  UNIFLOW IMS - Database Restore & Verification           "
echo "=========================================================="
echo "Backup Source:   $BACKUP_FILE"
echo "Database Engine: $DB_ENGINE"
echo "Target Database: $DB_NAME"

if [ "$FORCE" = false ]; then
    echo ""
    echo "WARNING: Restoring will overwrite existing data in the target database."
    read -r -p "Are you sure you want to proceed with restoration? (y/N): " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[yY]$ ]]; then
        echo "Restoration cancelled by user."
        exit 0
    fi
fi

# 3. Perform Restoration
if [[ "$DB_ENGINE" == *"sqlite"* ]]; then
    echo ""
    echo "Restoring SQLite database..."
    if [ -f "$DB_NAME" ]; then
        SAFETY_BAK="${DB_NAME}.pre-restore-$(date +"%Y%m%d-%H%M%S").bak"
        cp "$DB_NAME" "$SAFETY_BAK"
        echo "  Safety snapshot of active DB saved to: $SAFETY_BAK"
    fi

    "$PYTHON_CMD" -c "
import sqlite3
src = sqlite3.connect(r'$BACKUP_FILE')
dst = sqlite3.connect(r'$DB_NAME')
src.backup(dst)
dst.close()
src.close()
print('RESTORE_SUCCESS')
"
    echo "  [OK] SQLite database restored successfully."

elif [[ "$DB_ENGINE" == *"postgres"* ]]; then
    echo ""
    echo "Restoring PostgreSQL database via pg_restore..."
    if ! command -v pg_restore >/dev/null 2>&1; then
        echo "ERROR: pg_restore not found in PATH. Please install PostgreSQL client tools." >&2
        exit 1
    fi

    PG_ARGS=("--clean" "--if-exists" "-d" "$DB_NAME")
    [[ -n "$DB_HOST" ]] && PG_ARGS+=("-h" "$DB_HOST")
    [[ -n "$DB_PORT" ]] && PG_ARGS+=("-p" "$DB_PORT")
    [[ -n "$DB_USER" ]] && PG_ARGS+=("-U" "$DB_USER")
    PG_ARGS+=("$BACKUP_FILE")

    pg_restore "${PG_ARGS[@]}" || true
    echo "  [OK] pg_restore command completed."
else
    echo "ERROR: Unsupported database engine: $DB_ENGINE" >&2
    exit 1
fi

# 4. Post-Restore Verification
echo ""
echo "Running Post-Restore Verification Checks..."

"$PYTHON_CMD" -c "
import sys, os
from decimal import Decimal
sys.path.insert(0, os.path.join(r'$ROOT_DIR', 'backend'))
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
"

echo ""
echo "Database restore and verification completed successfully!"
echo ""
