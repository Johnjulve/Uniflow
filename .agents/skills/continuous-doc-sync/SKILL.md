---
name: continuous-doc-sync
description: Continuous documentation synchronization, changelog tracking, phase milestone recording, and pre-release audits for Uniflow across Plan/Implementation.md, docs/, backend, and frontend.
---

# Continuous Documentation & System Lifecycle (SDLC) — Project: Uniflow

## Overview

In Uniflow, documentation is not an afterthought—it is a core project deliverable. This skill enforces continuous, real-time synchronization of Uniflow's master roadmap, active implementation tracker, technical architecture documents, changelogs, and runtime manifests with every phase and code change.

Whenever code is added, schemas change, or milestones are reached, **do not wait for the user to request documentation updates**. Automatically update the relevant documentation files.

---

## Uniflow Documentation Suite & Maintenance Matrix

| Document Role | File Path | Maintenance Trigger & Rule |
| :--- | :--- | :--- |
| **1. Master Plan** | `Plan/Master_plan.md` | Authoritative source of vision, architecture principles, and 10-phase outline. Read-only reference unless project-level constraints explicitly change. |
| **2. Implementation Tracker** | `Plan/Implementation.md` | Active execution checklist. Mark completed tasks (`[x]`), update phase statuses, record deliverables, and detail next steps after every milestone. |
| **3. Technical Architecture** | `docs/architecture.md` | Monolith layout, frontend/backend separation, dependency graph, and service boundaries. |
| **4. Database & Ledger Design** | `docs/database-design.md` | PostgreSQL entity schemas, `StockMovement` ledger rules, `StockBalance` projections, constraints, and indexes. |
| **5. API Contract** | `docs/api-contract.md` | Versioned `/api/v1/` endpoint specs, request/response JSON schemas, error codes, and DRF OpenAPI references. |
| **6. Offline Sync Protocol** | `docs/offline-sync.md` | Dexie IndexedDB schemas, outbox queue structure, client UUID idempotency keys, push/pull protocol, and conflict policies. |
| **7. Security & Operations** | `docs/security.md`, `docs/deployment.md`, `docs/backup-restore.md` | Auth mechanisms, role capabilities, PostgreSQL backup/restore runbooks, and local deployment procedures. |
| **8. Changelog** | `CHANGELOG.md` | Keep a Changelog format. Record changes under `## [X.Y.Z] - YYYY-MM-DD` grouped by `Added`, `Changed`, `Fixed`, `Security`. |
| **9. Project README** | `README.md` | Production-facing overview, setup instructions, and `docs/` technical references. **Strict Rule:** Never reference or link to git-ignored internal planning directories (such as `Plan/`) in `README.md`. |

### Production Isolation & Gitignore Boundary Rule
- **Internal Planning Isolation**: The `Plan/` directory is an internal roadmap tool ignored by Git (`.gitignore`) to keep the production repository clean. It must never be committed or linked from public/production-facing documents like `README.md`.
- **Production Documentation**: Public and developer references in `README.md` must only link to tracked documentation in `docs/` (e.g. `docs/architecture.md`, `docs/database-design.md`, `docs/api-contract.md`).
- **Relative Link Portability**: All internal cross-references between tracked repository documentation files (e.g. within `docs/*.md`) **MUST** use portable relative file paths and **NEVER** machine-specific absolute `file:///` URIs. (Absolute `file://` URLs are reserved solely for chat-level responses to the user).

---

## Runtime Version Synchronization

Maintain version alignment across both sub-projects:
- **Backend**: `backend/pyproject.toml` (or `backend/config/__init__.py`: `__version__ = "X.Y.Z"`)
- **Frontend**: `frontend/package.json` (`"version": "X.Y.Z"`)

Whenever bumping versions upon milestone completion, ensure both manifests match the `CHANGELOG.md` release entry.

---

## Forensic Pre-Release Audit Protocol for Uniflow

Before declaring any phase milestone complete:
1. **Dependency Hygiene**: Confirm all Python packages are in `backend/pyproject.toml` / `requirements.txt` and npm packages in `frontend/package.json`. No untracked external imports.
2. **Environment & Secrets**: Verify no database credentials, secret keys, or hardcoded localhost URLs are committed. Ensure `.env.example` has all needed environment variables.
3. **Transactional Integrity**: Ensure every stock change mutation is wrapped in `transaction.atomic()` with appropriate row locking (`select_for_update()`).
4. **Offline Queue Safety**: Confirm client operation IDs are generated once and preserved across retries; ensure server idempotency deduplicates replay requests.
5. **Code Style & Metrics**: Verify functions adhere to the 30-line limit where practical, and no naked diffs or unhandled exceptions are present.

---

## Git Release & Milestone Runbook

When a phase milestone in `Plan/Implementation.md` is completed and verified:
1. **Pre-Verification**: Run backend tests (`pytest`), frontend checks (`npm run test`, `npm run build`), and verify migrations (`python manage.py makemigrations --check`).
2. **Commit with Clear Message**:
   ```bash
   git add .
   git commit -m "feat(phase-X): complete milestone - [description]"
   ```
3. **Doc Sync**: Ensure `Plan/Implementation.md` reflects all completed checkmarks before finalizing the session.
