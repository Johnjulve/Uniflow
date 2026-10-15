---
name: api-and-interface-design
description: Guides stable REST API and interface contracts for Uniflow across Django REST Framework and React. Use when designing or extending /api/v1/ endpoints, serializers, OpenAPI specs, and offline sync contracts.
---

# API & Interface Design — Project: Uniflow

## Overview

Design stable, consistent, and predictable interfaces for Uniflow across the Django REST Framework backend and React/TypeScript frontend. Good API contracts make correct data mutations effortless and dangerous operations (such as arbitrary stock overrides or non-idempotent duplicate receipts) impossible.

---

## Uniflow API Conventions

### 1. Base URL & Versioning
All public REST endpoints are mounted under:
`/api/v1/`

Never expose raw internal database IDs or unversioned routes.

### 2. Standard Endpoint Groups
- **Authentication & Users**:
  - `POST /api/v1/auth/login/`
  - `POST /api/v1/auth/logout/`
  - `GET /api/v1/auth/me/`
  - `GET/POST /api/v1/users/`
- **Product Catalog**:
  - `GET/POST /api/v1/categories/`
  - `GET/POST /api/v1/products/`
  - `GET/PATCH /api/v1/products/{id}/`
  - `POST /api/v1/products/{id}/archive/`
- **Inventory Ledger & Balances**:
  - `GET /api/v1/inventory/balances/`
  - `GET /api/v1/inventory/movements/`
  - `POST /api/v1/inventory/adjustments/`
  - `POST /api/v1/inventory/issues/`
  - `POST /api/v1/inventory/transfers/`
  - `GET /api/v1/inventory/products/{id}/history/`
  - `GET /api/v1/inventory/alerts/`
- **Suppliers & Purchasing**:
  - `GET/POST /api/v1/suppliers/`
  - `GET/POST /api/v1/purchase-orders/`
  - `POST /api/v1/purchase-orders/{id}/submit/`
  - `POST /api/v1/purchase-orders/{id}/cancel/`
  - `POST /api/v1/receipts/`
  - `POST /api/v1/receipts/{id}/post/`
- **Synchronization (Offline-to-Online)**:
  - `POST /api/v1/sync/push/` (Batch push of queued client outbox operations)
  - `GET /api/v1/sync/pull/` (Incremental pull cursor for changed catalog & reference data)
  - `GET /api/v1/sync/status/` (Connectivity, server timestamp, and version check)

---

## Core Rules for Uniflow Interfaces

### Rule 1: No Direct Client Stock Balance Overwrite
The client must **never** send an arbitrary new balance (e.g. `{ "balance": 45 }`).
Stock changes are always expressed as typed business intents:
- `POST /api/v1/inventory/adjustments/` (with reason and counted quantity)
- `POST /api/v1/inventory/issues/` (with signed deduction and destination/reason)
- `POST /api/v1/receipts/{id}/post/` (tied to verified purchase order line items)

### Rule 2: Consistent Response & Error Format
All errors return predictable HTTP status codes and structured payloads:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The submitted stock adjustment is invalid.",
    "details": {
      "quantity": ["Adjustment would cause negative inventory balance."]
    }
  }
}
```

Standard Status Codes:
- `200 OK` / `201 Created` / `204 No Content`
- `400 Bad Request` (Malformed syntax or missing required fields)
- `401 Unauthorized` (Unauthenticated session)
- `403 Forbidden` (Insufficient role permissions, e.g., Viewer attempting an adjustment)
- `404 Not Found`
- `409 Conflict` (Version mismatch or duplicate unique constraint)
- `422 Unprocessable Entity` (Domain rule failure, e.g., negative stock violation)
- `500 Internal Server Error` (Sanitized error; never leak tracebacks or SQL in production)

### Rule 3: Client Operation UUIDs & Idempotency
For all state-mutating operations and offline sync push payloads:
- Require an `idempotency_key` or `client_operation_id` (UUIDv4).
- The server checks if an operation with this UUID was previously committed. If found, it returns the cached result without re-executing ledger movements.
- Retrying a network request due to client disconnect must never duplicate stock movements.

### Rule 4: Boundary Validation (DRF Serializers + Zod)
- Frontend: Validate user input using Zod schemas matching backend constraints.
- Backend: Treat all client requests as untrusted. Validate rigorously in DRF serializers with explicit field typing, decimal precision, and permission checks.

### Rule 5: OpenAPI Documentation
All viewsets must be annotated with `drf-spectacular` (`@extend_schema`) so the generated OpenAPI schema remains accurate and up to date for frontend client generation and verification.
