# Uniflow IMS - Security Hardening & Operations Guide

> **Documentation Index**: [Overview (README)](../README.md) | [Architecture](architecture.md) | [Database Design](database-design.md) | [API Contract](api-contract.md) | [Offline Sync](offline-sync.md) | [Deployment Runbook](deployment.md) | [Backup & Restore](backup-restore.md) | **Security Hardening**

This guide outlines security hardening standards, network perimeter configurations, authentication safeguards, and operational policies for running the Uniflow Inventory Management System (IMS) in an on-premise business environment.

---

## 1. Threat Model & Security Architecture

Uniflow is designed as a **locally hosted on-premise application**. Its primary security perimeter is the business's internal Local Area Network (LAN):

```
        External Internet
               │
               ▼  [BLOCKED BY ROUTER / FIREWALL]
        ╔══════════════════════════════════════════════════════════════╗
        ║                     Local Business LAN                       ║
        ║                                                              ║
        ║   Workstations / POS Tablets (192.168.1.0/24)                ║
        ║         │                                                    ║
        ║         ▼ (Port 443 HTTPS)                                   ║
        ║   ┌──────────────────────────────────────────────────────┐   ║
        ║   │ Dedicated Host Server (192.168.1.100)                │   ║
        ║   │                                                      │   ║
        ║   │  Reverse Proxy (Caddy / Nginx)                       │   ║
        ║   │    ├─ Terminates TLS (Port 443)                      │   ║
        ║   │    ├─ Serves Static React SPA (Disk)                 │   ║
        ║   │    └─ Proxies to localhost:8000 only                 │   ║
        ║   │                                                      │   ║
        ║   │  Backend App Server (127.0.0.1:8000)                 │   ║
        ║   │    └─ Authoritative Django Engine                    │   ║
        ║   │                                                      │   ║
        ║   │  Database (127.0.0.1:5432 or SQLite file)            │   ║
        ║   │    └─ Local loopback binding only                    │   ║
        ║   └──────────────────────────────────────────────────────┘   ║
        ╚══════════════════════════════════════════════════════════════╝
```

### Key Protective Measures:
- **Zero Public Cloud Exposure:** No direct external internet ports are exposed.
- **Loopback Service Isolation:** The application server (Waitress/Gunicorn) and database (PostgreSQL) bind exclusively to `127.0.0.1`.
- **Strict HTTPS Termination:** All client traffic across the LAN is encrypted via TLS.
- **Zero-Trust Client Engine:** Client-side offline outboxes are untrusted; all movements, cost records, and state transitions are authoritatively validated and signed on the server.

---

## 2. Django Production Hardening

Uniflow's production configuration (`backend/config/settings/production.py`) enforces strict security controls:

### 2.1 Enforced `DEBUG = False`
Debug mode is strictly disabled in production. Verbose stack traces, system paths, and SQL query strings are never exposed to clients.

### 2.2 Mandatory Strong Secret Key
The application validates `DJANGO_SECRET_KEY` on startup. If left unconfigured or set to the default insecure development string, the server refuses to start with an explicit `ImproperlyConfigured` exception:
```python
if SECRET_KEY == "uniflow-dev-insecure-key-change-in-production" or len(SECRET_KEY) < 32:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be configured with at least 32 characters in production.")
```

### 2.3 Browser Security Headers
The following headers are automatically applied to every HTTP response:
| Header | Value | Purpose |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Forces browsers to communicate over HTTPS exclusively |
| `X-Frame-Options` | `DENY` | Prevents clickjacking attacks by blocking iframe embedding |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type confusion attacks |
| `X-XSS-Protection` | `1; mode=block` | Enables legacy browser cross-site scripting filters |
| `Referrer-Policy` | `same-origin` | Protects private internal URLs from leaking in referrers |

### 2.4 Secure Cookie Policies
Session and CSRF cookies enforce transport security:
```python
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False  # Allows Axios/TanStack Query to read X-CSRFToken
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
```

### 2.5 Cross-Origin Resource Sharing (CORS) & CSRF
CORS and CSRF origins are locked to explicit whitelisted domains defined in `.env`:
```ini
CORS_ALLOWED_ORIGINS=https://uniflow.local,https://192.168.1.100
CSRF_TRUSTED_ORIGINS=https://uniflow.local,https://192.168.1.100
```
Wildcards (`*`) and insecure origins are rejected.

---

## 3. Network & Host Firewall Hardening

### 3.1 Host Firewall Rules
Only ports 80 and 443 should accept inbound connections on the host machine. Direct access to port 8000 (Django) and port 5432 (PostgreSQL) must be blocked from external interfaces.

#### Linux (ufw):
```bash
# Default deny incoming, allow outgoing
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH from management subnet
sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp

# Allow HTTP and HTTPS from local LAN only
sudo ufw allow from 192.168.1.0/24 to any port 80 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 443 proto tcp

# Enable firewall
sudo ufw enable
```

#### Windows Defender Firewall (PowerShell):
```powershell
# Allow inbound HTTPS from LAN
New-NetFirewallRule -DisplayName "Uniflow Web (HTTPS)" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow -RemoteAddress 192.168.1.0/24

# Allow inbound HTTP for redirection
New-NetFirewallRule -DisplayName "Uniflow Web (HTTP)" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow -RemoteAddress 192.168.1.0/24

# Block external access to raw backend port 8000
New-NetFirewallRule -DisplayName "Block External Backend Port 8000" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Block
```

### 3.2 Local TLS Termination via Caddy
Caddy provides zero-maintenance HTTPS for local networks by automatically managing internal CA certificates. When running `caddy run --config deployment/config/Caddyfile`:
1. Caddy generates a local root CA.
2. Browsers on client workstations can trust the Caddy local root CA (`caddy trust`) once during setup, enabling green padlock HTTPS across the entire business network.

---

## 4. Authentication & Role-Based Access Control (RBAC)

### 4.1 Password Security
- Passwords are hashed using **PBKDF2 with SHA-256** using 600,000 iterations (standard Django cryptographic hasher).
- Passwords are never stored or logged in plain text.
- Minimum password length is enforced (minimum 8 characters, disallowing common passwords or numeric-only strings).

### 4.2 Role Permission Matrix
Uniflow implements strict role-based access control across all API endpoints:

| Role | Catalog View | Catalog Edit | Inventory View | Stock Adjust / Receive | PO Create / Approve | User Management |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **ADMINISTRATOR** | Yes | Yes | Yes | Yes | Yes | Yes |
| **INVENTORY_MANAGER** | Yes | Yes | Yes | Yes | Yes | No |
| **INVENTORY_STAFF** | Yes | No | Yes | Yes (Count / Receive) | View Only | No |
| **VIEWER** | Yes | No | Yes | No | View Only | No |

### 4.3 Immutability & Audit Trail
To protect financial and stock accuracy against tampering:
- `StockMovement` records are **strictly immutable**. Django models enforce validation exceptions preventing `UPDATE` or `DELETE` operations on existing movement ledger rows.
- Every inventory transaction logs the initiating `actor` (user foreign key), `effective_at` timestamp, and originating document ID (e.g. purchase receipt UUID or stock adjustment reason).

---

## 5. File System & Secret Storage Hardening

1. **Protect Environment Secrets (`.env`):**
   - The `.env` file contains database credentials and the Django secret key.
   - On Linux: Restrict permissions to the `uniflow` user only:
     ```bash
     chmod 600 /opt/uniflow/.env
     chown uniflow:uniflow /opt/uniflow/.env
     ```
   - On Windows: Restrict NTFS file permissions so only Administrators and the service account have Read/Write access.

2. **Protect Backup Archives (`backups/`):**
   - Ensure the `backups/` directory is restricted from unauthorized local users (`chmod 700 /opt/uniflow/backups`).
   - If replicating backups to USB flash drives or external drives, encrypt the external drive using BitLocker (Windows) or LUKS (Linux).
