# Changelog

All notable changes to the Uniflow IMS platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-01

### Added
- **Reports & Analytics Center Overhaul (`/reports`)**:
  - Executive Financial Summary cards showing In-Stock Cost, Potential Retail Revenue, Projected Margin, MTD Realized Revenue & Profit, and Pipeline Units.
  - Interactive **Warehouse Asset Distribution** and **Category Valuation Share** visual comparison bars with MTD sales realization progress tracking.
  - High-precision **Stock Valuation & Profitability Table** with live search filtering, unit acquisition cost, unit catalog price, valuation, retail revenue, unit gross margin %, status badges, and aggregate portfolio totals footer.
  - CSV export date range scoping with clear visual indicator.
- **True Gross Margin & Cost Markup Disambiguation**:
  - Distinguishes Gross Margin (`(Revenue - Cost) / Revenue * 100`) from Markup on Cost (`(Revenue - Cost) / Cost * 100`) in both backend calculations and frontend displays.
  - Added accessible `(i)` calculation guides explaining mathematical formulas for all dashboard and report KPIs.
  - Explicit `-₱... MTD net loss` badge in rose styling when COGS exceeds realized sales.
- **Categorized Stock Adjustments & Realized Revenue Tracking**:
  - Structured adjustment reasons (`SOLD`, `DAMAGED`, `EXPIRED`, `INTERNAL_USE`, `AUDIT_CORRECTION`, `FOUND`, `RETURN`, `OTHER`) with required custom justifications for custom cases.
  - Automatic calculation of realized sales revenue, cost-of-goods-sold, and realized gross profit from `SOLD` manual decrements alongside sales channels.
- **UI/UX Polish & Stepper Inputs**:
  - Reusable horizontal `[ - ] [ Input ] [ + ]` quantity and price steppers across Product creation/editing modals and Stock Adjustment dialogs.
  - Localized currency formatting using centralized `formatCurrency` in Philippine Peso (`₱` / PHP).
- **Single-Source Global Versioning System**:
  - Backend `UNIFLOW_VERSION = "0.2.0"` in `backend/config/settings/base.py` bound to OpenAPI Spectacular and health endpoints.
  - Frontend `APP_VERSION = '0.2.0'` in `frontend/src/lib/constants.ts` bound to layout navigation and system diagnostics.

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
  - Inter-Warehouse Stock Transfer: Atomic dual-movement ledger transactions (`TRANSFER_OUT` + `TRANSFER_IN`) with deterministic deadlock-preventing UUID row locks, live on-hand source verification, and dedicated Transfer Modal with zero-net-valuation impact confirmation.
  - Purchase order lifecycle (`DRAFT`, `SUBMITTED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED`) and intake receiving.
  - Horizontal left-to-right quantity stepper `[ - ] [ Qty ] [ + ]` for purchase order line items and intake delivery receiving (`Accept Now` and `Damaged`).
  - Idempotent offline synchronization protocol powered by Dexie IndexedDB and `sync_metadata` table.
  - Real-time stock valuation reporting, low-stock threshold alerting, and streaming CSV export engine.
  - Executive Financial & Revenue Analytics Dashboard: Added real-time potential retail revenue, gross margin markup %, incoming procurement pipeline metrics, and visual valuation distribution graphs across warehouses and product categories.
  - Production deployment runners and automated database backup/restore scripts with post-restoration ledger verification.

### Security
- Enforced strict production security settings (`DEBUG=False`, HSTS, secure cookies, host validation, CSP).
- Added mandatory working-branch isolation safety gate preventing accidental direct commits on `main`.
- Added unit and integration security tests asserting `401 Unauthorized` for anonymous requests, `403 Forbidden` for non-admin endpoints, and `405 Method Not Allowed` on read-only audit logs.
