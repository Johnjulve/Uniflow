# Uniflow IMS

**Inventory-First, Offline-Capable Business Management Platform**

Uniflow is a reliable, maintainable, locally hosted business management system designed to run in a business's own environment. Its initial release focuses on core Inventory Management (IMS), built on a modular monolith architecture that provides a foundation for future extensions (CMS and POS) without rewriting the core engine.

---

## Documentation

- **Architecture:** `docs/architecture.md`
- **Database Design:** `docs/database-design.md`
- **API Contract:** `docs/api-contract.md`
- **Offline Synchronization:** `docs/offline-sync.md`

---

## Technology Stack

- **Backend:** Python 3.12, Django, Django REST Framework, PostgreSQL
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query
- **Offline Persistence:** IndexedDB (Dexie) with local outbox queue and idempotent synchronization
- **Architecture:** Modular Monolith with clean service layers and domain separation

---

## Initial Release Scope (IMS)

- **Product & Category Management:** SKUs, barcodes, categories, reorder thresholds, archiving.
- **Inventory Ledger:** Auditable, immutable `StockMovement` ledger with atomically maintained `StockBalance`.
- **Suppliers & Purchasing:** Purchase orders, partial receiving, idempotent receipt posting.
- **Offline Sync:** Durable client outbox queue, client-generated UUIDs, conflict resolution.
- **Reports & Dashboard:** Real-time stock status, low-stock alerts, CSV exports.
- **User Roles & Security:** Administrator, Inventory Manager, Inventory Staff, Viewer.
