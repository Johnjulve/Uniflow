# UNIFLOW — Technical Architecture Specification

## 1. System Vision & Scope
Uniflow is a locally hosted, offline-capable business management platform designed to run in a business's own environment on a single local server or workstation.

The initial product is **Uniflow IMS** (Inventory Management System). Its primary architectural directive is to guarantee inventory ledger correctness, strict atomic concurrency, and durable offline operation while providing clean modular boundaries for future extensions (CMS and POS) without duplicating the core engine.

---

## 2. High-Level Architecture: Modular Monolith

Uniflow employs a **modular monolith** pattern with a clean physical separation between the backend API service and the frontend single-page application (SPA).

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser / SPA)                         │
│                                                                        │
│   ┌────────────────────────┐            ┌──────────────────────────┐   │
│   │   UI Views & Forms     │            │    Offline Outbox        │   │
│   │ (React + shadcn/ui)    │            │    (Dexie IndexedDB)     │   │
│   └───────────┬────────────┘            └────────────┬─────────────┘   │
│               │ (Online Queries/Mutations)           │ (Background)    │
│               ▼                                      ▼                 │
│   ┌────────────────────────────────────────────────────────────┐       │
│   │                  TanStack Query + API Client               │       │
│   └─────────────────────────────┬──────────────────────────────┘       │
└─────────────────────────────────┼──────────────────────────────────────┘
                                  │ HTTPS / REST JSON (/api/v1/)
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Django Monolith)                      │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────┐       │
│   │                  Django REST Framework Router              │       │
│   └─────────────┬──────────────────────────────┬───────────────┘       │
│                 ▼                              ▼                       │
│   ┌───────────────────────────┐  ┌───────────────────────────┐         │
│   │      Catalog Domain       │  │     Purchasing Domain     │         │
│   └─────────────┬─────────────┘  └─────────────┬─────────────┘         │
│                 │                              │ (Receipt Posting)     │
│                 ▼                              ▼                       │
│   ┌──────────────────────────────────────────────────────────┐         │
│   │                 Core Inventory Engine                    │         │
│   │     (Transactional Services: atomicity, locks, checks)   │         │
│   └─────────────────────────────┬────────────────────────────┘         │
│                                 ▼                                      │
│   ┌──────────────────────────────────────────────────────────┐         │
│   │            PostgreSQL (Authoritative Single DB)          │         │
│   │    - Immutable StockMovement Ledger                      │         │
│   │    - Atomically Projected StockBalance                   │         │
│   │    - Sync Metadata (Idempotency Tracking)                │         │
│   └──────────────────────────────────────────────────────────┘         │
└────────────────────────────────────────────────────────────────────────┘
```

### Architectural Invariants
1. **Single Authoritative Database**: One PostgreSQL database acts as the single source of truth.
2. **Backend Service-Centric Logic**: All stock-changing rules, negative stock checks, and state transitions reside strictly in backend domain services, never solely in React.
3. **Ledger Immutability**: Historical `StockMovement` rows are immutable. Corrections always generate explicit compensating movements.
4. **Decoupled Offline Engine**: The client offline engine (outbox queue, IndexedDB persistence, sync coordinator) is isolated from React visual display components.

---

## 3. Backend Architecture (Django REST Framework)

### 3.1 Technology Foundation
- **Language / Framework**: Python 3.12, Django 5.x, Django REST Framework 3.15+
- **Database Driver**: `psycopg` (PostgreSQL)
- **API Documentation**: `drf-spectacular` (OpenAPI 3.0 schema generation)
- **Filtering**: `django-filter`
- **Linting & Quality**: `ruff`

### 3.2 Domain Apps Layout
Backend code is partitioned into domain-driven Django applications located in `backend/apps/`:

```
backend/
├── config/                  # Core project configuration
│   ├── settings/
│   │   ├── base.py          # Shared baseline settings
│   │   ├── local.py         # Development overrides
│   │   └── production.py    # Local production / hardened settings
│   ├── urls.py              # Root routing (/api/v1/)
│   ├── asgi.py
│   └── wsgi.py
├── apps/
│   ├── accounts/            # Users, roles, capabilities, authentication
│   ├── common/              # Abstract models, standard timestamps, exceptions
│   ├── catalog/             # Categories, products, SKU & barcode constraints, units
│   ├── inventory/           # Stock movements, balances, adjustments, valuation
│   ├── suppliers/           # Supplier profiles, contacts, notes
│   ├── purchasing/          # Purchase orders, PO items, receiving, receipt posting
│   ├── audit/               # Security and audit log persistence
│   └── reporting/           # Query selectors for valuation, movements, CSV generation
├── tests/                   # Global integration & cross-app tests
├── manage.py
└── pyproject.toml
```

### 3.3 Domain Responsibilities & Service Contracts

| App Name | Primary Responsibilities | Core Service / Handler |
| :--- | :--- | :--- |
| **`accounts`** | Auth tokens/sessions, user management, RBAC enforcement (`Admin`, `Manager`, `Staff`, `Viewer`). | `AuthenticationService`, `PermissionEvaluator` |
| **`catalog`** | Products, categories, units of measure, SKU/barcode uniqueness, product archiving. | `ProductService`, `CategoryService` |
| **`inventory`** | The authoritative stock ledger (`StockMovement`) and atomic balance projections (`StockBalance`). | `StockService.record_movement()`, `ReconciliationService` |
| **`purchasing`** | Purchase order state lifecycle (Draft ➔ Submitted ➔ Partially Received ➔ Received / Cancelled) and receipt posting. | `ReceivingService.post_receipt()` |
| **`suppliers`** | Vendor master data and supplier contact tracking. | `SupplierService` |
| **`reporting`** | Fast read-only query aggregations, stock valuation (moving average), and CSV export generators. | `ValuationCalculator`, `ExportService` |
| **`audit`** | Recording immutable administrative and critical business audit trails. | `AuditService.log_action()` |

### 3.4 Transaction & Concurrency Policy
- Every state-mutating inventory operation executes within a `transaction.atomic()` context.
- Modifying stock balances requires acquiring a PostgreSQL row-level lock via `StockBalance.objects.select_for_update()`.
- Balances and movements are updated atomically. If an operation causes a balance to drop below zero (violating the negative-stock policy), the entire transaction rolls back immediately.

---

## 4. Frontend Architecture (React + Vite + TypeScript)

### 4.1 Technology Foundation
- **Build Tool / Framework**: Vite 6.x, React 19.x, TypeScript (strict mode enabled)
- **Routing**: React Router 7.x
- **Styling & UI Kit**: Tailwind CSS 4.x, shadcn/ui (Radix UI primitives), Lucide icons
- **Server State**: TanStack Query (React Query v5)
- **Form Management**: React Hook Form with Zod validation schemas
- **Offline Client Storage**: Dexie.js (IndexedDB wrapper)
- **Testing**: Vitest, React Testing Library

### 4.2 Frontend Codebase Layout
The frontend is organized cleanly into functional layers in `frontend/src/`:

```
frontend/
├── public/
├── src/
│   ├── app/                 # Root application shell, router, providers
│   │   ├── router.tsx
│   │   ├── providers.tsx
│   │   └── layouts/         # DashboardLayout, AuthLayout
│   ├── components/
│   │   ├── ui/              # shadcn/ui design primitives (Button, Dialog, Input, Table)
│   │   ├── forms/           # Form wrappers, FormField, ErrorBanner
│   │   ├── tables/          # Reusable data table, pagination, search bar
│   │   └── feedback/        # StatusBadge, Toast, SyncIndicator
│   ├── modules/             # Business domain feature views
│   │   ├── auth/            # LoginPage, SessionHandler
│   │   ├── dashboard/       # Metric cards, quick actions, recent movements
│   │   ├── catalog/         # ProductList, ProductForm, CategoryList
│   │   ├── inventory/       # StockOverview, AdjustmentModal, MovementHistory
│   │   ├── suppliers/       # SupplierList, SupplierDetails
│   │   ├── purchasing/      # PurchaseOrderList, POForm, ReceivingWorkflow
│   │   ├── reports/         # ValuationReport, StockMovementReport
│   │   └── settings/        # SystemSettings, UserManagement, OutboxQueueView
│   ├── services/            # API client definitions
│   │   └── api-client.ts    # Axios or native fetch with error interceptors
│   ├── offline/             # Offline persistence & synchronization
│   │   ├── database.ts      # Dexie schema definition
│   │   ├── outbox.ts        # Enqueue, dequeue, retry logic
│   │   └── sync-engine.ts   # Push/pull coordinator and conflict detector
│   ├── hooks/               # Generic utility hooks (useDebounce, useOnlineStatus)
│   ├── lib/                 # Utility functions (formatters, cn utility)
│   └── types/               # Shared domain interfaces and API payload types
├── tests/
├── package.json
└── vite.config.ts
```

### 4.3 State Management Split
- **Server State**: Handled exclusively via TanStack Query. Caches responses, handles background revalidation, and supports query invalidation on mutation.
- **Form State**: Managed locally by React Hook Form, strictly validated against Zod schemas prior to dispatch.
- **Offline Outbox State**: Managed in Dexie IndexedDB. When disconnected, user mutations write to the local outbox first, assigning a permanent client operation UUID.

---

## 5. Offline-First Architecture & Synchronization Contract

### 5.1 Levels of Disconnection
Uniflow distinguishes four operating states:
1. **Fully Online**: Local workstation connects directly to the server with zero latency.
2. **Internet Offline / LAN Online**: Standard local operation. Local server is reachable; public cloud is not required.
3. **Server Transiently Unreachable**: Workstation is disconnected from the local network. The application transitions to IndexedDB cached data.
4. **Reconnecting**: Outbox queue replays pending operations sequentially using idempotent HTTP calls.

### 5.2 The Durable Outbox Queue
- Every queued operation contains:
  - `client_operation_id`: UUIDv4 generated once upon user submission.
  - `operation_type`: (e.g. `INVENTORY_ADJUSTMENT`, `CREATE_PO`, `POST_RECEIPT`).
  - `payload`: Exact JSON parameters required by the server endpoint.
  - `created_at`: Client ISO timestamp.
  - `status`: `pending` | `syncing` | `failed` | `rejected`.
  - `rejection_reason`: Captured error message from server if validation failed.
- Operations survive browser reloads and restarts.
- Operations are sent with the `client_operation_id` as an `Idempotency-Key` HTTP header.
- The server records processed IDs in a `sync_metadata` table; duplicate submissions return the original committed result without re-executing business mutations.

---

## 6. Security & Authorization Architecture

- **Session / Token Security**: Cookie-based HTTP-only session tokens with CSRF defense for local browser clients.
- **Strict Role-Based Access Control (RBAC)**:
  - **Administrator**: Full system management, user provisioning, database utilities.
  - **Inventory Manager**: Full catalog, purchasing, inventory movements, adjustments, and reporting.
  - **Inventory Staff**: Restricted to creating drafts, counting, and standard stock movements. Cannot alter configuration or delete records.
  - **Viewer**: Read-only access to catalogs, stock levels, and non-sensitive reports.
- **Sanitized Error Responses**: Internal tracebacks and SQL errors are never returned over `/api/v1/`.

---

## 7. Explicit Non-Goals & Architectural Boundaries

To preserve architectural clarity and keep the codebase lean and maintainable:
- **No Microservices**: The entire backend is deployed as a single process.
- **No Distributed Message Brokers**: No Redis, RabbitMQ, or Celery in the initial release. PostgreSQL transactions and simple scheduled jobs fulfill all current needs.
- **No Multi-Tenant Isolation**: Uniflow runs on a single business installation model.
- **No Premature CMS or POS Modules**: Customer management and cash register/point-of-sale features will interface with the inventory services in future phases without polluting the initial IMS release.
