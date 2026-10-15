# Uniflow IMS - Local Development & Setup Runbook

> **Documentation Index**: [Overview (README)](../README.md) | [Architecture](architecture.md) | [Database Design](database-design.md) | [API Contract](api-contract.md) | [Offline Sync](offline-sync.md) | **Deployment Runbook**

This runbook guides engineers through bootstrapping and running the Uniflow Inventory Management System locally, including the Django REST Framework backend and the React 19 frontend application.

---

## 1. Prerequisites

Ensure your host system satisfies the minimum runtime requirements:
- **Python**: 3.12+
- **Node.js**: 20.x or 22.x LTS
- **Package Managers**: `pip` (or `uv`) and `npm`
- **Database (Optional for local dev)**: PostgreSQL 16+ (Local SQLite fallback is enabled automatically when PostgreSQL is not configured).

---

## 2. Backend Setup (Django REST Framework)

### 2.1 Virtual Environment
From the project root:

```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# Linux / macOS:
source .venv/bin/activate
```

### 2.2 Install Dependencies
```bash
pip install -e "backend[dev]"
```

### 2.3 Environment Configuration
Copy the template configuration file:

```bash
cp .env.example .env
```

Key environment settings in `.env`:
| Variable | Default (Local) | Purpose |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.local` | Loads development settings with debug enabled |
| `SECRET_KEY` | *(Random development string)* | Cryptographic signing key |
| `DEBUG` | `True` | Development debug mode |
| `ALLOWED_HOSTS` | `127.0.0.1,localhost` | Whitelisted host headers |
| `DB_ENGINE` | `sqlite` | Switch to `postgres` for PostgreSQL production/staging |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed frontend origin domains |

### 2.4 Database Migrations
Apply initial database schema migrations:

```bash
python backend/manage.py migrate
```

### 2.5 Run Backend Tests & Linter
```bash
# Run test suite
pytest

# Run linter
ruff check backend
```

### 2.6 Start Development Server
```bash
python backend/manage.py runserver
```
The REST API server will be available at:
- **API Base:** `http://127.0.0.1:8000/api/v1/`
- **Health Check:** `http://127.0.0.1:8000/api/v1/health/`
- **OpenAPI Schema:** `http://127.0.0.1:8000/api/v1/schema/`
- **Swagger Documentation:** `http://127.0.0.1:8000/api/v1/docs/`

---

## 3. Frontend Setup (React 19 + Vite)

### 3.1 Install Dependencies
From the `frontend/` directory:

```bash
cd frontend
npm install
```

### 3.2 Development Proxy Configuration
The frontend uses Vite's built-in development proxy (`frontend/vite.config.ts`) to route `/api/*` requests directly to `http://127.0.0.1:8000/`. This eliminates CORS friction during local development.

### 3.3 Run Frontend Linter & Type Check
```bash
cd frontend
npm run lint
npm run build
```

### 3.4 Start Frontend Development Server
```bash
cd frontend
npm run dev
```
The React SPA interface will be available at `http://localhost:5173/`.

---

## 4. End-to-End Verification Checklist

Verify that the full-stack system is operating correctly:

1. **Backend Health Check:**
   ```bash
   curl http://127.0.0.1:8000/api/v1/health/
   ```
   *Expected Response:*
   ```json
   {"status":"healthy","database":"connected","timestamp":"...","version":"0.1.0"}
   ```

2. **Frontend-to-Backend Proxy Verification:**
   ```bash
   curl http://localhost:5173/api/v1/health/
   ```
   *Expected Response:* Identical 200 JSON response confirming Vite proxy forward to Django.

3. **Application Shell:**
   Navigate to `http://localhost:5173/` in your browser:
   - Sidebar navigation functions across `/`, `/catalog`, `/inventory`, `/purchasing`, `/suppliers`, `/reports`, `/settings`.
   - Live network status displays `Online` with green indicator in the header.
   - Design primitives (cards, badges, buttons) render with unified Tailwind styles.

---

## 5. Architectural References

- System Architecture: [architecture.md](architecture.md)
- Database Design & Ledger Schemas: [database-design.md](database-design.md)
- REST API Contracts: [api-contract.md](api-contract.md)
- Offline Synchronization Protocol: [offline-sync.md](offline-sync.md)
