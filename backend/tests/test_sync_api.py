"""
Unit and integration tests for offline synchronization endpoints:
- POST /api/v1/sync/push/ (Batch outbox ingestion with idempotency)
- GET /api/v1/sync/pull/ (Incremental delta cursor query)
"""
import uuid
from decimal import Decimal

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole
from apps.catalog.models import Category, Product
from apps.common.models import SyncMetadata, SyncOperationStatus
from apps.inventory.models import Location, StockBalance, StockMovement
from apps.purchasing.models import Supplier


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        username="sync_staff",
        password="Password123!",
        role=UserRole.STAFF,
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username="sync_viewer",
        password="Password123!",
        role=UserRole.VIEWER,
    )


@pytest.fixture
def warehouse(db):
    return Location.objects.create(code="SYNC-WH", name="Sync Testing Warehouse")


@pytest.fixture
def product(db):
    cat = Category.objects.create(name="Hardware")
    return Product.objects.create(
        sku="SKU-SYNC-01",
        name="Sync Cable 1m",
        category=cat,
        purchase_cost=Decimal("2.5000"),
        selling_price=Decimal("5.0000"),
    )


@pytest.mark.django_db
def test_health_check_endpoint(api_client):
    res = api_client.get("/api/v1/health/")
    assert res.status_code == status.HTTP_200_OK
    assert res.data["status"] == "healthy"
    assert res.data["database"] == "connected"


@pytest.mark.django_db
def test_sync_push_stock_adjustment_with_idempotency(api_client, staff_user, warehouse, product):
    api_client.force_authenticate(user=staff_user)

    client_op_id = uuid.uuid4()
    payload = {
        "operations": [
            {
                "client_operation_id": str(client_op_id),
                "operation_type": "STOCK_ADJUSTMENT",
                "payload": {
                    "product": str(product.id),
                    "location": str(warehouse.id),
                    "counted_quantity": "50.00",
                    "reason": "Physical cycle count via offline tablet",
                },
            }
        ]
    }

    # 1. First submission: processes and commits
    res = api_client.post("/api/v1/sync/push/", payload, format="json")
    assert res.status_code == status.HTTP_200_OK
    results = res.data["results"]
    assert len(results) == 1
    assert results[0]["status"] == "COMMITTED"
    assert results[0]["idempotent_replay"] is False

    # Verify database state
    balance = StockBalance.objects.get(product=product, location=warehouse)
    assert balance.current_quantity == Decimal("50.00")
    assert StockMovement.objects.filter(product=product, location=warehouse).count() == 1

    metadata = SyncMetadata.objects.get(client_operation_id=client_op_id)
    assert metadata.status == SyncOperationStatus.COMMITTED
    assert metadata.operation_type == "STOCK_ADJUSTMENT"

    # 2. Duplicate submission: must replay idempotently without re-executing
    res_dup = api_client.post("/api/v1/sync/push/", payload, format="json")
    assert res_dup.status_code == status.HTTP_200_OK
    dup_results = res_dup.data["results"]
    assert len(dup_results) == 1
    assert dup_results[0]["status"] == "COMMITTED"
    assert dup_results[0]["idempotent_replay"] is True

    # Movements count must remain exactly 1 (no duplicate adjustment)
    assert StockMovement.objects.filter(product=product, location=warehouse).count() == 1


@pytest.mark.django_db
def test_sync_push_create_supplier_operation(api_client, staff_user):
    api_client.force_authenticate(user=staff_user)

    client_op_id = uuid.uuid4()
    payload = {
        "operations": [
            {
                "client_operation_id": str(client_op_id),
                "operation_type": "CREATE_SUPPLIER",
                "payload": {
                    "name": "Offline Partner Ltd",
                    "contact_name": "Dave",
                    "email": "dave@offline.test",
                },
            }
        ]
    }

    res = api_client.post("/api/v1/sync/push/", payload, format="json")
    assert res.status_code == status.HTTP_200_OK
    results = res.data["results"]
    assert results[0]["status"] == "COMMITTED"
    assert Supplier.objects.filter(name="Offline Partner Ltd").exists()


@pytest.mark.django_db
def test_sync_push_rejection_handling(api_client, staff_user):
    api_client.force_authenticate(user=staff_user)

    client_op_id = uuid.uuid4()
    payload = {
        "operations": [
            {
                "client_operation_id": str(client_op_id),
                "operation_type": "UNKNOWN_OP_TYPE",
                "payload": {},
            }
        ]
    }

    res = api_client.post("/api/v1/sync/push/", payload, format="json")
    assert res.status_code == status.HTTP_200_OK
    results = res.data["results"]
    assert results[0]["status"] == "REJECTED"
    assert "Unsupported operation type" in results[0]["error"]

    meta = SyncMetadata.objects.get(client_operation_id=client_op_id)
    assert meta.status == SyncOperationStatus.REJECTED


@pytest.mark.django_db
def test_sync_pull_delta_cursor(api_client, staff_user, warehouse, product):
    api_client.force_authenticate(user=staff_user)

    res = api_client.get("/api/v1/sync/pull/")
    assert res.status_code == status.HTTP_200_OK
    data = res.data
    assert "server_timestamp" in data
    assert len(data["products"]) >= 1
    assert len(data["locations"]) >= 1

    # Filter with future timestamp returns empty lists
    future_iso = "2099-01-01T00:00:00Z"
    res_future = api_client.get(f"/api/v1/sync/pull/?since={future_iso}")
    assert res_future.status_code == status.HTTP_200_OK
    assert len(res_future.data["products"]) == 0
    assert len(res_future.data["locations"]) == 0
