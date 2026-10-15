---
name: project-minimizer
description: Enforces lean project scope, prevents feature creep, and guards Uniflow against premature abstractions (CMS, POS, Redis, Kubernetes, multi-tenant SaaS). Use when planning, designing, or implementing Uniflow phases to ensure 100% focus on IMS core requirements.
---

# Project Minimizer & Scope Guard — Project: Uniflow

## Overview

Uniflow's master plan (`Plan/Master_plan.md`) clearly mandates:
> **"Build Uniflow as a dependable inventory system first. Keep the architecture extensible, but prioritize correctness, maintainability, and verified functionality over feature count or architectural complexity."**

This skill acts as Uniflow's **scope reducer** and **scope guard**. It prevents premature feature inflation, locks in the minimal viable scope for each phase, enforces strict YAGNI (You Aren't Gonna Need It), and ensures all engineering effort is dedicated to verified IMS functionality.

---

## The One-Sentence Core Purpose for Uniflow IMS

```
"Uniflow allows a single local business to reliably manage its product catalog, track stock changes through an immutable transactional ledger, receive purchase deliveries, and operate seamlessly both online and offline."
```

Any code, endpoint, abstraction, or dependency that does not directly support this purpose is outside the initial IMS scope.

---

## Explicitly Out-of-Scope (Strict Non-Goals for IMS Release)

Resolutely reject or defer implementation of the following items in the initial release:
1. **No CMS (Customer Management System)**: Customer profiles, loyalty groups, customer purchase tracking belong in future phases.
2. **No POS (Point of Sale)**: Cashier register screens, cash drawers, barcode checkout carts, payment gateway integrations are deferred.
3. **No Distributed Infrastructure**: No Celery, Redis, RabbitMQ, Kafka, or Kubernetes. Standard Django services and PostgreSQL background execution suffice.
4. **No Multi-Tenant SaaS**: No subscription tiers, tenant database isolation schemas, or billing portals. Uniflow is a single-business, locally hosted system.
5. **No Speculative Architecture**: No custom workflow engines, generic plugin marketplaces, or abstract repository layers wrapping Django's ORM.
6. **No Unrestricted Offline Stock Deduction**: Do not permit unbounded offline sales that promise guaranteed stock availability without server-authoritative coordination.

---

## Core Principles for Uniflow Development

### 1. Framework-First (Leverage Native Stack)
- Use Django's built-in authentication, ORM transactions (`transaction.atomic`), row-locking (`select_for_update()`), and validation mechanisms.
- Do not build custom micro-frameworks or home-grown ORM wrappers on top of Django.
- In the frontend, utilize standard React, Tailwind CSS, shadcn/ui components, and TanStack Query without adding heavy auxiliary state libraries.

### 2. Standard of Excellence on Core Inventory Scope
Narrowing scope does **not** mean sloppy code. In Uniflow, core inventory features demand deep rigor:
- Atomic updates between `StockMovement` ledger entries and `StockBalance`.
- Strict negative-stock policy checking.
- Bounded concurrency with row-level locks on balance rows.
- Idempotency on all receipt postings and sync requests.

### 3. Session Modification Limits
- Restrict code modifications to a maximum of **2–5 files per session**.
- If a proposed phase or refactoring requires touching more files, pause immediately and break it into explicit stages.

---

## Scope Verification Checklist for Uniflow Tasks

Before declaring any task or phase milestone complete:

- [ ] **Zero unrequested features**: No CMS, POS, multi-tenant billing, or external queuing services introduced.
- [ ] **No speculative layers**: Code directly calls Django models/services without gratuitous repository abstractions.
- [ ] **Core requirements satisfied**: Inventory changes produce immutable ledger movements and atomic balance updates.
- [ ] **Modification limit respected**: Stayed within the 2–5 file change boundary.
- [ ] **Clean verification**: All tests (`pytest`, `npm test`, or typechecks) pass with zero errors.
- [ ] **Documented in plan**: Status updated in `Plan/Implementation.md`.
