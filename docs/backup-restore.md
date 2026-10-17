# Uniflow IMS - Database Backup & Restoration Runbook

> **Documentation Index**: [Overview (README)](../README.md) | [Architecture](architecture.md) | [Database Design](database-design.md) | [API Contract](api-contract.md) | [Offline Sync](offline-sync.md) | [Deployment Runbook](deployment.md) | **Backup & Restore** | [Security Hardening](security.md)

This runbook outlines the operational procedures for database backup automation, snapshot retention management, safe restoration, and disaster recovery verification for the Uniflow Inventory Management System (IMS).

---

## 1. Disaster Recovery Objectives

For an on-premise inventory management system running in a business's local environment:
- **Recovery Point Objective (RPO):** Maximum 24 hours of transaction loss from automated nightly backups, or maximum 1 hour with scheduled hourly snapshots. Offline clients (IndexedDB outbox) retain pending unsynced stock operations locally, eliminating field data loss during outages.
- **Recovery Time Objective (RTO):** Under 5 minutes to restore a full database snapshot and complete automated ledger reconciliation.
- **Consistency Guarantee:** 100% ledger-balance agreement verified on every restoration (`StockBalance.current_quantity == Sum(StockMovement.quantity)`).

---

## 2. Automated Database Backups

Uniflow provides cross-platform backup automation scripts located in `deployment/scripts/`:
- **Windows (PowerShell):** `deployment/scripts/backup.ps1`
- **Linux / POSIX (Bash):** `deployment/scripts/backup.sh`

### 2.1 How the Backup Engine Operates
1. **Dynamic Engine Detection:** The script queries active Django settings (`config.settings.local` or `config.settings.production`) to identify the database engine and connection parameters.
2. **Consistent Zero-Downtime Snapshots:**
   - **SQLite:** Uses Python's native `sqlite3.backup()` Online Backup API to acquire a consistent page-level snapshot while the application server is actively processing reads and writes.
   - **PostgreSQL:** Uses `pg_dump -Fc` (custom archive format with compression), creating an atomic snapshot without locking tables against read/write operations.
3. **Dedicated Snapshot Directory:** Backups are written to the `backups/` directory (git-ignored) with timestamped filenames:
   - SQLite: `backups/uniflow-sqlite3-YYYYMMDD-HHMMSS.db`
   - PostgreSQL: `backups/uniflow-postgres-YYYYMMDD-HHMMSS.dump`
4. **Automated Retention Management:** Scans the backup directory and purges oldest backups, maintaining only the most recent N snapshots (default: 10).

### 2.2 Manual Execution

#### Windows (PowerShell):
```powershell
# Run backup with default parameters (10 snapshots retained)
powershell -ExecutionPolicy Bypass -File deployment\scripts\backup.ps1

# Run backup with custom retention and target directory
powershell -ExecutionPolicy Bypass -File deployment\scripts\backup.ps1 -BackupDir "D:\Backups\Uniflow" -RetentionCount 30
```

#### Linux (Bash):
```bash
# Run backup with defaults
./deployment/scripts/backup.sh

# Run backup with custom directory and retention
./deployment/scripts/backup.sh /var/backups/uniflow 30
```

### 2.3 Scheduling Automated Backups

#### Windows: Task Scheduler
Create a daily scheduled task executing `powershell.exe`:
- **Program/script:** `powershell.exe`
- **Arguments:** `-ExecutionPolicy Bypass -File "C:\Uniflow\deployment\scripts\backup.ps1"`
- **Start in:** `C:\Uniflow`
- **Trigger:** Daily at 02:00 AM.

#### Linux: Cron Job
Add an entry to `/etc/cron.d/uniflow-backup` or system crontab:
```cron
# Run Uniflow database backup daily at 2:00 AM
0 2 * * * uniflow /opt/uniflow/deployment/scripts/backup.sh /opt/uniflow/backups 14 >> /var/log/uniflow-backup.log 2>&1
```

---

## 3. Database Restoration & Post-Restore Verification

Uniflow provides automated restoration scripts that safely restore snapshots and run automated integrity checks:
- **Windows (PowerShell):** `deployment/scripts/restore.ps1`
- **Linux / POSIX (Bash):** `deployment/scripts/restore.sh`

### 3.1 Pre-Restoration Safety Safeguard
Before touching the active database, the restore script automatically saves a safety copy of the current database file:
- e.g. `dev.sqlite3.pre-restore-20261018-000448.bak`
This prevents catastrophic accidental data loss if the wrong backup file is selected.

### 3.2 Automated Post-Restore Verification Checks
Immediately after copying or restoring database pages, the script boots a verification runner that performs:
1. **Connectivity Check:** Tests raw database connection via `connection.ensure_connection()`.
2. **Table Row Counts:** Audits record counts across all core IMS models:
   - Users
   - Products & Categories
   - Locations
   - Stock Balances & Movements
   - Suppliers & Purchase Orders
3. **Authoritative Ledger Reconciliation Invariant:**
   Queries every `StockBalance` row in the database and verifies that:
   $$\text{StockBalance.current\_quantity} \equiv \sum \text{StockMovement.quantity}$$
   If any discrepancy is detected between the materialized balance cache and the immutable ledger history, the script reports the affected SKU/location and exits with a fatal status code (`1`).

### 3.3 Restoration Execution Examples

#### Windows (PowerShell):
```powershell
# Interactive mode (prompts for confirmation before overwriting)
powershell -ExecutionPolicy Bypass -File deployment\scripts\restore.ps1 -BackupFile backups\uniflow-sqlite3-20261018-000325.db

# Non-interactive / Automated mode
powershell -ExecutionPolicy Bypass -File deployment\scripts\restore.ps1 -BackupFile backups\uniflow-sqlite3-20261018-000325.db -Force
```

#### Linux (Bash):
```bash
# Interactive mode
./deployment/scripts/restore.sh backups/uniflow-postgres-20261018-020000.dump

# Non-interactive mode
./deployment/scripts/restore.sh backups/uniflow-postgres-20261018-020000.dump --force
```

#### Sample Verification Output:
```
==========================================================
  UNIFLOW IMS - Database Restore & Verification           
==========================================================
Backup Source:   D:\System Projects\Uniflow\backups\uniflow-sqlite3-20261018-000325.db
Database Engine: django.db.backends.sqlite3
Target Database: D:\System Projects\Uniflow\backend\dev.sqlite3

Restoring SQLite database...
  Safety snapshot of active DB saved to: D:\System Projects\Uniflow\backend\dev.sqlite3.pre-restore-20261018-000504.bak
  [OK] SQLite database restored successfully.

Running Post-Restore Verification Checks...
[OK] Database connectivity verified.
  - Users:             1
  - Products:          4 (Categories: 2)
  - Locations:         1
  - Stock Balances:    1
  - Stock Movements:   2
  - Suppliers:         1
  - Purchase Orders:   1
[OK] Ledger Invariant Verified: 100% of StockBalances reconcile with StockMovements.
VERIFICATION_SUCCESS

Database restore and verification completed successfully!
```

---

## 4. Disaster Recovery Scenarios

### Scenario A: Accidental Operator Error / Corrupted Session
1. Locate the most recent healthy backup snapshot in `backups/`.
2. Stop the web server or application process to halt incoming traffic:
   ```bash
   sudo systemctl stop uniflow-backend
   ```
3. Run the restoration script against the chosen backup snapshot.
4. Verify that ledger invariant reconciliation succeeds.
5. Restart the application service:
   ```bash
   sudo systemctl start uniflow-backend
   ```

### Scenario B: Complete Server Hardware Failure
1. Provision replacement hardware satisfying system requirements (Python 3.12+, PostgreSQL 16+ or SQLite).
2. Clone the repository and configure `.env` with production settings.
3. Transfer the latest backup snapshot file from off-site storage or secondary drive to `backups/`.
4. Run `restore.sh` (or `restore.ps1`) pointing to the transferred snapshot.
5. Start the production runner (`run-production.sh` / `run-production.ps1`).

### Scenario C: Offline Client Reconciliation After Server Recovery
Uniflow client workstations run an **IndexedDB (Dexie) client outbox**. If a server outage occurs:
1. Field staff continue recording stock counts, issues, or receipts in the frontend SPA. All movements are saved locally with pending UUIDs in Dexie.
2. Once the server is restored and returns healthy (`/api/v1/health/`), client outbox queues detect server reconnection.
3. Outbox transactions replay automatically with idempotent UUID headers (`X-Client-Sync-ID`).
4. The server's authoritative stock engine validates deltas and safely updates the ledger with zero duplicate movements.

---

## 5. Security & Off-Site Storage Guidelines

- **File Permissions:** Ensure the `backups/` directory permissions are restricted to the system service account (`chmod 700 /opt/uniflow/backups`).
- **Off-Site Replication:** Replicate `backups/` snapshots daily to an external encrypted USB drive, secondary NAS, or secure off-site file server using `rsync` or automated drive sync.
- **Encryption at Rest:** For backups stored on physical portable media, use full-disk encryption (BitLocker on Windows, LUKS on Linux, or VeraCrypt).
