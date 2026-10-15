---
name: planning-and-task-breakdown
description: Breaks Uniflow implementation work into ordered, vertical-slice tasks across Django and React. Use when translating phases from Plan/Master_plan.md into Plan/Implementation.md or breaking down complex milestones with verifiable acceptance criteria.
---

# Planning and Task Breakdown — Project: Uniflow

## Overview

Decompose Uniflow's master roadmap (`Plan/Master_plan.md`) into small, testable, verifiable tasks recorded in `Plan/Implementation.md`. Every task must follow Uniflow's architectural constraints (modular monolith, inventory correctness, offline outbox support, bounded 2–5 file modifications per session) and be verifiable in a single focused session.

---

## When to Use

- Translating a phase from `Plan/Master_plan.md` into active execution items in `Plan/Implementation.md`
- Scoping a vertical slice (e.g., catalog product creation, stock adjustment, purchase order receiving)
- Defining verifiable acceptance criteria and test steps before writing code
- Keeping implementation strictly ordered by dependencies (database schema ➔ service logic ➔ API endpoints ➔ UI & offline outbox)

**When NOT to use:** Routine single-file bug fixes or straightforward edits that already have explicit step-by-step instructions.

---

## Uniflow Phase Architecture Alignment

Uniflow's roadmap follows 10 ordered phases defined in `Plan/Master_plan.md`:
- **Phase 0:** Repository inspection, baseline, and planning (`docs/architecture.md`, `docs/database-design.md`, etc.)
- **Phase 1:** Project foundation (Django backend, React/Vite/Tailwind frontend, PostgreSQL, linting, health checks)
- **Phase 2:** Authentication and role-based permissions (Administrator, Inventory Manager, Inventory Staff, Viewer)
- **Phase 3:** Product catalog (Categories, Products, SKUs, barcode, reorder thresholds, archive behavior)
- **Phase 4:** Inventory engine (Immutable `StockMovement` ledger, atomic `StockBalance`, negative stock enforcement, reconciliation)
- **Phase 5:** Suppliers and purchasing (Suppliers, Purchase Orders, partial receiving, idempotent receipt posting)
- **Phase 6:** Offline storage and synchronization (Dexie IndexedDB, local outbox queue, client operation UUIDs, sync pull/push)
- **Phase 7:** Dashboard and reporting (Real data aggregates, valuation, movements, CSV exports)
- **Phase 8:** Hardening and local deployment (Production build, local server/reverse proxy, backup/restore scripts)
- **Phase 9:** Initial IMS release (Release checklist, migration freeze, verified documentation)

---

## The Planning Process for Uniflow

### Step 1: Read & Lock Scope (Read-Only Mode)
Before proposing tasks or editing code:
1. Consult `Plan/Master_plan.md` for phase objectives and strict non-goals (e.g., no CMS, no POS, no microservices in IMS release).
2. Inspect current files in `backend/` and `frontend/` to understand existing schemas, serializers, routes, and tests.
3. Record task progress and phase breakdown directly in `Plan/Implementation.md`.

### Step 2: Slice Vertically Across the Stack
Never build "all database tables" or "all frontend UI components" horizontally in isolation. Slice vertically so each task produces an independently verifiable end-to-end capability:
1. **Database & Migrations**: Django model constraints, indexes, and migrations.
2. **Domain Service**: Transactional business logic (e.g., `StockMovement` creation + `StockBalance` atomic update under `transaction.atomic` with `select_for_update`).
3. **API Layer**: DRF Serializer, ViewSet, permissions, and `/api/v1/` endpoint with OpenAPI doc.
4. **Frontend & Offline**: React component, Zod validation schema, TanStack Query mutation, and Dexie outbox integration.
5. **Automated Verification**: Pytest tests (backend) and Vitest tests (frontend).

### Step 3: Write Structured Tasks into `Plan/Implementation.md`

Format each task in `Plan/Implementation.md` as follows:

```markdown
### Task [Phase].[Number]: [Short descriptive title]

**Description:** One concise paragraph detailing what this task accomplishes and why it integrates safely.

**Affected Files (Max 2–5 per session):**
- `backend/apps/catalog/models.py`
- `backend/apps/catalog/serializers.py`
- `backend/apps/catalog/views.py`
- `frontend/src/modules/catalog/types.ts`

**Acceptance Criteria:**
- [ ] [Explicit, testable functional condition]
- [ ] Database transactions roll back cleanly on failure without orphaned records
- [ ] Concurrency and negative-stock guard conditions hold

**Verification:**
- [ ] Backend tests pass: `pytest backend/tests/test_filename.py`
- [ ] Frontend typecheck/lint: `npm run typecheck` or `npm run lint`
- [ ] Manual check: [Exact curl request or UI interaction step]
```

---

## Uniflow Guardrails & Verification

Before approving any planned task:
- [ ] **Modification limit checked**: The planned work touches no more than 2–5 files in one session.
- [ ] **Relative links in repo docs**: All markdown references within repository files use portable relative paths (never absolute `file:///` URIs).
- [ ] **No premature features**: No customer management (CMS), point of sale (POS), multi-tenancy, or cloud billing added.
- [ ] **Data integrity guaranteed**: Stock balance is never updated without a corresponding ledger entry in the same transaction.
- [ ] **Offline compatibility**: Outbox operations maintain client-generated operation IDs for idempotent synchronization.
