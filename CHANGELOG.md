# Changelog

All notable changes to the Uniflow IMS platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-31

### Added
- **System Settings & User Administration (`/settings`)**:
  - Administrator User Directory with search, role filters (`ADMIN`, `MANAGER`, `STAFF`, `VIEWER`), and account provisioning modal.
  - Granular user editing with self-deactivation and self-demotion lockout prevention.
  - Immediate token revocation on user account deactivation or password update.
  - Dedicated **Warehouses & Storage Locations** management tab with facility directory table and add/edit modal.
  - Live system diagnostics displaying active operator session, Dexie outbox queue status, and platform architecture metrics.
- **Security & Admin Audit Trail**:
  - Immutable database `AuditLog` model and `ImmutableAuditQuerySet` preventing record alteration or deletion.
  - Request-context middleware (`AuditContextMiddleware`) automatically capturing actor, IP address, and operation source (`API` vs. `DJANGO_ADMIN`).
  - Pre/post save and delete ORM signals logging creations, updates, status changes, and deletions across `User`, `Category`, `Product`, `Location`, `Supplier`, and `PurchaseOrder`.
  - Sensitive password hash change tracking recording redacted diffs (`{"password": {"from": "***", "to": "***"}}`).
  - Interactive audit explorer in `/settings` featuring source badges, action filters, expandable JSON modification diff views, and paginated records.
  - Django `/admin/` integration for all core domain models with read-only audit log inspection.
- **Catalog Category & Unit of Measure Management**:
  - Category deletion safety guard returning `400 CATEGORY_IN_USE` if products reference the category.
  - Real-time `product_count` annotation on category queries.
  - Interactive Category Manager modal in catalog view supporting inline creation and safe unused category deletion without entering the backend.
  - Unit of Measure selector featuring standard presets (`unit`, `pcs`, `box`, `pack`, `set`, `pair`, `kg`, `g`, `liter`, `ml`, `meter`, `roll`) and custom unit persistence.
- **Core Inventory Ledger & Purchasing**:
  - Append-only immutable `StockMovement` ledger with row-level locked atomic `StockBalance` projections.
  - Purchase order lifecycle (`DRAFT`, `SUBMITTED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED`) and intake receiving.
  - Horizontal left-to-right quantity stepper `[ - ] [ Qty ] [ + ]` for purchase order line items and intake delivery receiving (`Accept Now` and `Damaged`).
  - Idempotent offline synchronization protocol powered by Dexie IndexedDB and `sync_metadata` table.
  - Real-time stock valuation reporting, low-stock threshold alerting, and streaming CSV export engine.
  - Production deployment runners and automated database backup/restore scripts with post-restoration ledger verification.

### Security
- Enforced strict production security settings (`DEBUG=False`, HSTS, secure cookies, host validation, CSP).
- Added mandatory working-branch isolation safety gate preventing accidental direct commits on `main`.
- Added unit and integration security tests asserting `401 Unauthorized` for anonymous requests, `403 Forbidden` for non-admin endpoints, and `405 Method Not Allowed` on read-only audit logs.
