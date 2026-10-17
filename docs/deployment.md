# Uniflow IMS - Deployment & Operations Runbook

> **Documentation Index**: [Overview (README)](../README.md) | [Architecture](architecture.md) | [Database Design](database-design.md) | [API Contract](api-contract.md) | [Offline Sync](offline-sync.md) | **Deployment Runbook** | [Backup & Restore](backup-restore.md) | [Security Hardening](security.md)

This runbook guides engineers and system administrators through deploying, hosting, and operating the Uniflow Inventory Management System (IMS). It covers both **local development** and **on-premise local production hosting** on a business's dedicated local server or workstation.

---

## 1. Architecture Overview

Uniflow is designed for **on-premise local deployment** within a business's local network (LAN) without requiring external cloud infrastructure:

```
                  Local Network Clients (Browsers, Tablets, POS)
                                      │
                                      ▼
             ┌──────────────────────────────────────────────────┐
             │            Reverse Proxy (Caddy / Nginx)         │
             │           Port 80 (HTTP) / Port 443 (HTTPS)      │
             └───────────────────────┬──────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
         Static File Server (Disk)          WSGI/ASGI Backend Server
             (Built React SPA)             (Gunicorn / Waitress on 8000)
                    │                                 │
                    │                                 ▼
                    │                     Authoritative Django IMS
                    │                                 │
                    │                                 ▼
                    └─────────────────────► Database (PostgreSQL / SQLite)
```

---

## 2. System Requirements

Ensure the host machine satisfies the following minimum requirements:
- **Operating System:** Windows 10/11 / Windows Server 2019+, or Linux (Ubuntu 22.04 LTS+, Debian 12+, RHEL 9+).
- **Python:** 3.12+ 64-bit
- **Node.js:** 20.x or 22.x LTS (required for building frontend assets)
- **Database:** PostgreSQL 16+ recommended for multi-user production. (Built-in SQLite fallback is supported for single-terminal deployments).
- **Web Server:** Caddy 2.x (recommended for automatic local HTTPS) or Nginx 1.22+.

---

## 3. Local Development Setup

Follow these steps to bootstrap a fresh development environment from source:

### 3.1 Clone & Virtual Environment
```bash
# Clone the repository
git clone https://github.com/Johnjulve/Uniflow.git
cd Uniflow

# Create Python virtual environment
python -m venv .venv

# Activate virtual environment
# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# Linux / macOS:
source .venv/bin/activate
```

### 3.2 Install Dependencies
```bash
# Install backend package with development dependencies
pip install -e "backend[dev]"

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 3.3 Environment Configuration
Copy the template configuration file:
```bash
# Windows (PowerShell):
Copy-Item .env.example .env

# Linux / macOS:
cp .env.example .env
```

Ensure `.env` contains:
```ini
DJANGO_SETTINGS_MODULE=config.settings.local
DJANGO_SECRET_KEY=local-dev-secret-key-32-chars-long
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost
DATABASE_URL=sqlite:///backend/dev.sqlite3
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

### 3.4 Database Migrations & Initial Setup
```bash
python backend/manage.py migrate
python backend/manage.py createsuperuser
```

### 3.5 Run Development Servers
Open two terminal windows:
```bash
# Terminal 1 - Backend API Server (Port 8000)
python backend/manage.py runserver

# Terminal 2 - Frontend Dev Server with Proxy (Port 5173)
cd frontend
npm run dev
```

Visit `http://localhost:5173/` in your browser.

---

## 4. Local Production On-Premise Deployment

For production operation on a business local server, follow the hardened production deployment procedure:

### 4.1 Production Environment Configuration (`.env`)
Update `.env` to enforce production hardening:
```ini
DJANGO_SETTINGS_MODULE=config.settings.production
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=generate-a-strong-random-50-character-key-here
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,uniflow.local,192.168.1.100
CSRF_TRUSTED_ORIGINS=https://localhost,https://uniflow.local,https://192.168.1.100
CORS_ALLOWED_ORIGINS=https://uniflow.local,https://192.168.1.100

# PostgreSQL Production Database (Recommended)
DATABASE_URL=postgres://uniflow_user:StrongPassword123@localhost:5432/uniflow_db
```

### 4.2 Build Frontend & Collect Static Assets
```bash
# 1. Build optimized React SPA bundle (output to frontend/dist/)
cd frontend
npm run build
cd ..

# 2. Collect Django admin and REST framework static assets (output to staticfiles/)
python backend/manage.py collectstatic --no-input
```

### 4.3 Automated Production Service Launchers

Uniflow provides turnkey startup scripts that verify prerequisites, check ports, and start the application server:

#### Windows (PowerShell):
```powershell
# Run the local production runner
powershell -ExecutionPolicy Bypass -File deployment\scripts\run-production.ps1
```
*The script checks virtualenv availability, tests port 8000, and launches Waitress/Django WSGI server.*

#### Linux (POSIX Bash):
```bash
chmod +x deployment/scripts/run-production.sh
./deployment/scripts/run-production.sh
```
*The script starts Gunicorn with 3 worker processes binding to `127.0.0.1:8000`.*

---

## 5. Reverse Proxy Configuration

To serve the application to local network clients securely on port 80/443, configure a local reverse proxy.

### Option A: Caddy (Recommended - Zero Config Local HTTPS)
Caddy automatically manages internal self-signed TLS certificates for local domain names:

1. Copy configuration:
   ```bash
   cp deployment/config/Caddyfile /etc/caddy/Caddyfile
   ```
2. Adjust the hostname in `/etc/caddy/Caddyfile` (e.g. `uniflow.local` or `:80`).
3. Reload Caddy:
   ```bash
   caddy reload
   ```

### Option B: Nginx
1. Link configuration:
   ```bash
   sudo ln -s /path/to/Uniflow/deployment/config/nginx.conf /etc/nginx/sites-enabled/uniflow.conf
   sudo nginx -t
   sudo systemctl reload nginx
   ```

---

## 6. Running as an Automatic OS Service

To ensure Uniflow boots automatically upon server restart:

### 6.1 Linux: Systemd Service
Create `/etc/systemd/system/uniflow-backend.service`:

```ini
[Unit]
Description=Uniflow IMS Production Backend
After=network.target postgresql.service

[Service]
Type=simple
User=uniflow
WorkingDirectory=/opt/uniflow
ExecStart=/opt/uniflow/deployment/scripts/run-production.sh
Restart=always
RestartSec=5
EnvironmentFile=/opt/uniflow/.env

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now uniflow-backend
```

### 6.2 Windows: Windows Service via NSSM or Task Scheduler
Use Non-Sucking Service Manager (NSSM) or Windows Task Scheduler to register `deployment\scripts\run-production.ps1` as a background service configured to start "At system startup".

---

## 7. Verification & Health Monitoring

Verify deployment status via curl or browser:

```bash
# 1. API Health Check Endpoint
curl -s http://127.0.0.1:8000/api/v1/health/ | jq .
# Expected output: {"status":"healthy","database":"connected",...}

# 2. Reverse Proxy Frontend Delivery
curl -I http://localhost/
# Expected: HTTP 200 OK (Serving frontend/dist/index.html)

# 3. Reverse Proxy API Proxying
curl -I http://localhost/api/v1/health/
# Expected: HTTP 200 OK
```

---

## 8. Related Operations Guides

- **[Backup & Disaster Recovery Runbook](backup-restore.md)**: Daily backups, snapshot retention, database restoration, and stock reconciliation validation.
- **[Security Hardening Runbook](security.md)**: Network firewall policies, TLS setup, Django production headers, and role-based permissions.
- **[Architecture Guide](architecture.md)**: Modular monolith boundaries, service layer design, and domain event flow.
