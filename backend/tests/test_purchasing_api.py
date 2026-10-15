"""
API integration tests for purchasing endpoints: suppliers, purchase orders, receipts.
"""
from decimal import Decimal

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole
from apps.catalog.models import Category, Product
from apps.inventory.models import Location, StockBalance, StockMovement
from apps.purchasing.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
    Supplier,
)


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def manager_user(db):
    user = User.objects.create_user(
        username="purchasing_manager",
        password="Password123!",
        role=UserRole.MANAGER,
    )
    return user


@pytest.fixture
def staff_user(db):
    user = User.objects.create_user(
        username="warehouse_staff",
        password="Password123!",
        role=UserRole.STAFF,
    )
    return user


@pytest.fixture
def viewer_user(db):
    user = User.objects.create_user(
        username="read_viewer",
        password="Password123!",
        role=UserRole.VIEWER,
    )
    return user


@pytest.fixture
def warehouse(db):
    return Location.objects.create(code="EAST-WH", name="East Warehouse")


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(
        name="Global Hardware Co.",
        contact_name="Bob Miller",
        email="bob@globalhw.test",
    )


@pytest.fixture
def product(db):
    cat = Category.objects.create(name="Fasteners")
    return Product.objects.create(
        sku="SKU-SCREW-01",
        name="Stainless Wood Screws 50mm",
        category=cat,
        purchase_cost=Decimal("0.0500"),
        selling_price=Decimal("0.1500"),
    )


@pytest.mark.django_db
def test_supplier_endpoints(api_client, manager_user, viewer_user):
    # Viewer can list suppliers
    api_client.force_authenticate(user=viewer_user)
    res = api_client.get("/api/v1/suppliers/")
    assert res.status_code == status.HTTP_200_OK

    # Viewer cannot create supplier
    res = api_client.post("/api/v1/suppliers/", {"name": "New Supplier"})
    assert res.status_code == status.HTTP_403_FORBIDDEN

    # Manager can create supplier
    api_client.force_authenticate(user=manager_user)
    res = api_client.post(
        "/api/v1/suppliers/",
        {
            "name": "Precision Tools Inc.",
            "contact_name": "Carol Danvers",
            "email": "carol@precision.test",
        },
    )
    assert res.status_code == status.HTTP_201_CREATED
    assert res.data["name"] == "Precision Tools Inc."


@pytest.mark.django_db
def test_purchase_order_create_and_submit(api_client, staff_user, supplier, product):
    api_client.force_authenticate(user=staff_user)

    # 1. Create Purchase Order with line item
    payload = {
        "supplier_id": str(supplier.id),
        "notes": "Urgent order",
        "items": [
            {
                "product_id": str(product.id),
                "ordered_quantity": "100.00",
                "unit_cost": "0.0450",
            }
        ],
    }
    res = api_client.post("/api/v1/purchase-orders/", payload, format="json")
    assert res.status_code == status.HTTP_201_CREATED
    po_id = res.data["id"]
    assert res.data["status"] == "DRAFT"
    assert len(res.data["items"]) == 1
    assert Decimal(res.data["total_cost"]) == Decimal("4.5000")

    # 2. Submit Purchase Order
    res = api_client.post(f"/api/v1/purchase-orders/{po_id}/submit/")
    assert res.status_code == status.HTTP_200_OK
    assert res.data["status"] == "SUBMITTED"

    # 3. Duplicate submit returns 400
    res = api_client.post(f"/api/v1/purchase-orders/{po_id}/submit/")
    assert res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_purchase_order_cancel(api_client, staff_user, supplier, product):
    api_client.force_authenticate(user=staff_user)

    po = PurchaseOrder.objects.create(
        order_reference="PO-CANCEL-001",
        supplier=supplier,
        created_by=staff_user,
    )
    PurchaseOrderItem.objects.create(
        purchase_order=po,
        product=product,
        ordered_quantity=Decimal("50.00"),
        unit_cost=Decimal("0.0500"),
    )

    res = api_client.post(
        f"/api/v1/purchase-orders/{po.id}/cancel/",
        {"reason": "Project delayed"},
        format="json",
    )
    assert res.status_code == status.HTTP_200_OK
    assert res.data["status"] == "CANCELLED"
    assert "Project delayed" in res.data["notes"]


@pytest.mark.django_db
def test_receipt_create_updates_stock_and_po(api_client, staff_user, supplier, warehouse, product):
    api_client.force_authenticate(user=staff_user)

    # Create & submit PO
    po = PurchaseOrder.objects.create(
        order_reference="PO-REC-001",
        supplier=supplier,
        status=PurchaseOrderStatus.SUBMITTED,
        created_by=staff_user,
    )
    po_item = PurchaseOrderItem.objects.create(
        purchase_order=po,
        product=product,
        ordered_quantity=Decimal("100.00"),
        unit_cost=Decimal("0.0500"),
    )

    # Post delivery intake receipt
    receipt_payload = {
        "purchase_order_id": str(po.id),
        "location_id": str(warehouse.id),
        "supplier_delivery_ref": "DELIV-1001",
        "items": [
            {
                "po_item_id": str(po_item.id),
                "accepted_quantity": "60.00",
                "rejected_quantity": "5.00",
                "notes": "5 rusted screws rejected",
            }
        ],
    }

    res = api_client.post("/api/v1/receipts/", receipt_payload, format="json")
    assert res.status_code == status.HTTP_201_CREATED
    assert res.data["supplier_delivery_ref"] == "DELIV-1001"
    assert len(res.data["items"]) == 1

    # Verify PO status advanced to PARTIALLY_RECEIVED
    po.refresh_from_db()
    assert po.status == PurchaseOrderStatus.PARTIALLY_RECEIVED
    po_item.refresh_from_db()
    assert po_item.received_quantity == Decimal("60.00")

    # Verify StockBalance projection
    balance = StockBalance.objects.get(product=product, location=warehouse)
    assert balance.current_quantity == Decimal("60.00")

    # Verify StockMovement record
    movement = StockMovement.objects.get(product=product, location=warehouse)
    assert movement.quantity == Decimal("60.00")
    assert movement.movement_type == "RECEIPT"

    # Post remaining 40.00 units
    receipt_payload_2 = {
        "purchase_order_id": str(po.id),
        "location_id": str(warehouse.id),
        "supplier_delivery_ref": "DELIV-1002",
        "items": [
            {
                "po_item_id": str(po_item.id),
                "accepted_quantity": "40.00",
            }
        ],
    }
    res = api_client.post("/api/v1/receipts/", receipt_payload_2, format="json")
    assert res.status_code == status.HTTP_201_CREATED

    po.refresh_from_db()
    assert po.status == PurchaseOrderStatus.FULLY_RECEIVED
    balance.refresh_from_db()
    assert balance.current_quantity == Decimal("100.00")
