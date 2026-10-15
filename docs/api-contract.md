# UNIFLOW — REST API Contract & Interface Specification

## 1. Overview & Conventions
This document defines the REST API contract for Uniflow IMS across the Django REST Framework (DRF) backend and the React TypeScript frontend.

### 1.1 Base URL & Routing
All public endpoints are prefixed with the API version:
```
/api/v1/
```

### 1.2 Content Type & Character Encoding
- Request and response bodies are strictly formatted as `application/json; charset=utf-8`.
- Multi-part forms (`multipart/form-data`) are used exclusively for optional product image uploads.

### 1.3 Identification & Data Types
- All primary resource identifiers are strings representing **UUIDv4** values (e.g., `"f47ac10b-58cc-4372-a567-0e02b2c3d479"`).
- All timestamps follow **ISO 8601** format with UTC timezone offset (e.g., `"2026-10-15T12:00:00Z"`).
- Quantities and monetary amounts are represented as strings or exact decimal JSON numbers (e.g. `"24.50"`, `"199.99"`) to prevent floating-point rounding errors.

---

## 2. Global Standards & Error Envelope

### 2.1 Standardized Error Envelope
All error responses (`4xx` and `5xx`) return a uniform JSON envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The submitted stock adjustment is invalid.",
    "details": {
      "quantity": [
        "Adjustment would result in a negative stock balance of -4.00 units."
      ]
    }
  }
}
```

### 2.2 Error Codes & HTTP Status Mapping

| HTTP Status | Error `code` | Scenario |
| :--- | :--- | :--- |
| `400 Bad Request` | `BAD_REQUEST` | Malformed JSON syntax or missing required parameters |
| `401 Unauthorized`| `AUTHENTICATION_REQUIRED` | Unauthenticated session or expired token |
| `403 Forbidden` | `PERMISSION_DENIED` | Authenticated user lacks required role capability |
| `404 Not Found` | `NOT_FOUND` | Requested resource UUID does not exist |
| `409 Conflict` | `CONFLICT` | Concurrent modification conflict or unique constraint collision |
| `422 Unprocessable`| `VALIDATION_ERROR` | Business rule violated (e.g. negative stock check, invalid transition) |
| `500 Server Error`| `INTERNAL_SERVER_ERROR` | Unhandled server exception (tracebacks sanitized in production) |

### 2.3 Standard Pagination Envelope
All paginated list endpoints return results wrapped in a standard pagination envelope:

```json
{
  "count": 142,
  "next": "/api/v1/products/?page=2",
  "previous": null,
  "results": [ ... ]
}
```

---

## 3. Idempotency & Offline Operation Protocol

### 3.1 Idempotency Key Header
All state-mutating requests (`POST`, `PATCH`, `DELETE`), especially receiving receipts and inventory adjustments, accept an optional or required client idempotency header:
```http
Idempotency-Key: <client_operation_uuid>
```

### 3.2 Server Deduplication Behavior
1. The server checks the `sync_metadata` table for the provided `client_operation_id`.
2. If the operation has already been committed:
   - The server **does not** re-execute movements or adjust balances.
   - It returns the original cached HTTP status code and response payload with the header `X-Cache-Lookup: HIT-IDEMPOTENT`.
3. If the operation failed permanently on a previous attempt, the server returns the cached rejection details.

---

## 4. Endpoint Specifications

### 4.1 Authentication & User Management

#### `POST /api/v1/auth/login/`
Authenticates user credentials and issues an HTTP-only session cookie.
- **Request Body**:
  ```json
  {
    "username": "admin",
    "password": "SecurePassword123!"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "user": {
      "id": "a1b2c3d4-...",
      "username": "admin",
      "display_name": "System Administrator",
      "roles": ["Administrator"]
    }
  }
  ```

#### `POST /api/v1/auth/logout/`
Terminates session and clears cookies.
- **Response `204 No Content`**

#### `GET /api/v1/auth/me/`
Returns currently authenticated user profile and capability matrix.
- **Response `200 OK`**

#### `GET /api/v1/users/`
List system users (Admin only).
- **Query Params**: `page`, `page_size`, `search`, `role`, `is_active`

---

### 4.2 Product Catalog

#### `GET /api/v1/categories/`
List hierarchical categories.
- **Response `200 OK`**: List of categories with optional nested `children`.

#### `POST /api/v1/categories/`
Create a new category.

#### `GET /api/v1/products/`
List products with filtering, search, and inventory summaries.
- **Query Params**:
  - `page`, `page_size`
  - `search` (matches SKU, barcode, name)
  - `category` (UUID)
  - `is_active` (boolean, default: `true`)
  - `low_stock` (boolean, filter items at or below reorder threshold)
  - `ordering` (e.g. `name`, `-created_at`, `selling_price`)
- **Response `200 OK`**: Paginated products.

#### `POST /api/v1/products/`
Create a new product.
- **Request Body**:
  ```json
  {
    "sku": "WIDGET-001",
    "barcode": "123456789012",
    "name": "Standard Industrial Widget",
    "description": "High-durability stainless steel widget",
    "category_id": "c1d2e3f4-...",
    "unit_of_measure": "unit",
    "purchase_cost": "15.0000",
    "selling_price": "24.5000",
    "reorder_threshold": "10.00"
  }
  ```
- **Response `201 Created`**

#### `GET /api/v1/products/{id}/`
Retrieve full product details including current total stock on hand.

#### `PATCH /api/v1/products/{id}/`
Update product metadata. SKU and barcode changes validate uniqueness across existing records.

#### `POST /api/v1/products/{id}/archive/`
Soft-archive a product. Sets `is_active=false` and `archived_at=NOW()`. Historical transactions remain untouched.
- **Response `200 OK`**

---

### 4.3 Authoritative Inventory Ledger & Balances

> **CRITICAL ARCHITECTURAL RULE**: The client can **never** issue a direct `PUT` or `PATCH` on a stock balance. Stock balances are read-only projections. All quantity changes require an explicit movement endpoint.

#### `GET /api/v1/inventory/balances/`
Retrieve on-hand stock quantities by product and location.
- **Query Params**: `product_id`, `location_id`, `low_stock=true`
- **Response `200 OK`**:
  ```json
  {
    "count": 1,
    "results": [
      {
        "product": {
          "id": "p1-uuid",
          "sku": "WIDGET-001",
          "name": "Standard Industrial Widget"
        },
        "location": {
          "id": "loc1-uuid",
          "code": "MAIN-WH",
          "name": "Main Warehouse"
        },
        "current_quantity": "50.00",
        "reorder_threshold": "10.00",
        "is_low_stock": false,
        "updated_at": "2026-10-15T18:30:00Z"
      }
    ]
  }
  ```

#### `GET /api/v1/inventory/movements/`
Search and filter the immutable stock movement ledger.
- **Query Params**: `product_id`, `location_id`, `movement_type`, `date_from`, `date_to`, `ordering`
- **Response `200 OK`**: Paginated list of `StockMovement` records.

#### `POST /api/v1/inventory/adjustments/`
Record a cycle count adjustment.
- **Headers**: `Idempotency-Key: <uuid>`
- **Request Body**:
  ```json
  {
    "product_id": "p1-uuid",
    "location_id": "loc1-uuid",
    "counted_quantity": "48.00",
    "reason": "Physical cycle count discrepancy (-2 units lost/damaged)"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "movement_reference": "MOV-2026-000456",
    "movement_type": "NEGATIVE_ADJUSTMENT",
    "quantity_delta": "-2.00",
    "new_balance": "48.00",
    "effective_at": "2026-10-15T19:00:00Z"
  }
  ```

#### `POST /api/v1/inventory/issues/`
Record an issue/consumption of inventory.
- **Headers**: `Idempotency-Key: <uuid>`
- **Request Body**:
  ```json
  {
    "product_id": "p1-uuid",
    "location_id": "loc1-uuid",
    "quantity": "5.00",
    "reason": "Internal workshop maintenance use"
  }
  ```

#### `POST /api/v1/inventory/transfers/`
Transfer stock between two locations within a single atomic transaction.
- **Headers**: `Idempotency-Key: <uuid>`
- **Request Body**:
  ```json
  {
    "product_id": "p1-uuid",
    "source_location_id": "loc1-uuid",
    "target_location_id": "loc2-uuid",
    "quantity": "10.00",
    "reason": "Stock replenishment for front store"
  }
  ```
- **Response `201 Created`**: Returns both outbound and inbound movement records.

---

### 4.4 Suppliers & Purchasing

#### `GET /api/v1/suppliers/` | `POST /api/v1/suppliers/`
Manage vendor directory.

#### `GET /api/v1/purchase-orders/` | `POST /api/v1/purchase-orders/`
List and create purchase orders with nested line items.
- **Creation Payload**:
  ```json
  {
    "supplier_id": "supp-uuid",
    "expected_date": "2026-10-25",
    "notes": "Urgent warehouse replenishment",
    "items": [
      {
        "product_id": "p1-uuid",
        "ordered_quantity": "100.00",
        "unit_cost": "14.5000"
      }
    ]
  }
  ```

#### `POST /api/v1/purchase-orders/{id}/submit/`
Transitions a purchase order from `DRAFT` to `SUBMITTED`.

#### `POST /api/v1/purchase-orders/{id}/cancel/`
Cancels a purchase order if no receipts have been posted against it.

#### `POST /api/v1/receipts/`
Records an intake receipt for goods received from a purchase order.
- **Headers**: `Idempotency-Key: <uuid>`
- **Request Body**:
  ```json
  {
    "purchase_order_id": "po-uuid",
    "receipt_reference": "REC-2026-00089",
    "supplier_delivery_ref": "BOL-98741",
    "location_id": "loc1-uuid",
    "items": [
      {
        "po_item_id": "po-item-uuid",
        "accepted_quantity": "50.00",
        "rejected_quantity": "0.00",
        "notes": "First partial delivery in good condition"
      }
    ]
  }
  ```
- **Response `201 Created`**: Creates receipt, records `StockMovement` of type `RECEIPT`, updates `StockBalance` atomically, and updates PO item `received_quantity`.

---

### 4.5 Synchronization Endpoints

#### `POST /api/v1/sync/push/`
Batch submission of queued offline outbox operations.
- **Request Body**:
  ```json
  {
    "operations": [
      {
        "client_operation_id": "uuid-1",
        "operation_type": "STOCK_ADJUSTMENT",
        "payload": { ... },
        "created_at": "2026-10-15T18:00:00Z"
      }
    ]
  }
  ```
- **Response `200 OK`**: Returns array of results per operation with `COMMITTED` or `REJECTED` status and explanation.

#### `GET /api/v1/sync/pull/`
Fetches incremental catalog and reference data updates based on a high-water mark timestamp or version cursor.
- **Query Params**: `since=2026-10-15T10:00:00Z`
- **Response `200 OK`**: Changed categories, active products, and location records.

#### `GET /api/v1/sync/status/`
Health, server timestamp, and synchronization status check.

---

### 4.6 Reporting Endpoints

- `GET /api/v1/reports/inventory-summary/`: High-level inventory valuation and totals.
- `GET /api/v1/reports/low-stock/`: Products below their reorder threshold.
- `GET /api/v1/reports/stock-movements/`: Filtered movement history with export options.
- `GET /api/v1/reports/stock-movements/export-csv/`: Streamable CSV export for reporting.
