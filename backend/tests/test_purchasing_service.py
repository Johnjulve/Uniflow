"""
Unit tests for PurchaseOrderService: order submission, cancellation,
intake receiving, and authoritative stock ledger integration.
"""
from decimal import Decimal

import pytest

from apps.accounts.models import User, UserRole
from apps.catalog.models import Category, Product
from apps.inventory.models import Location, MovementType, StockBalance, StockMovement
from apps.purchasing.exceptions import (
    InvalidOrderStatusError,
    OverReceiptError,
    PurchaseOrderValidationError,
)
from apps.purchasing.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
    Supplier,
)
from apps.purchasing.services import PurchaseOrderService


@pytest.fixture
def purchaser(db):
    return User.objects.create_user(
        username="purchasing_lead",
        password="Password123!",
        role=UserRole.MANAGER,
    )


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name="Apex Industrial Tools")


@pytest.fixture
def warehouse(db):
    return Location.objects.create(code="CENTRAL-WH", name="Central Warehouse")


@pytest.fixture
def product_a(db):
    cat = Category.objects.create(name="Power Tools")
    return Product.objects.create(
        sku="SKU-DRILL-PRO",
        name="18V Cordless Hammer Drill",
        category=cat,
        purchase_cost=Decimal("50.0000"),
        selling_price=Decimal("95.0000"),
    )


@pytest.fixture
def product_b(db):
    cat = Category.objects.create(name="Accessories")
    return Product.objects.create(
        sku="SKU-BIT-SET",
        name="Titanium Drill Bit 50pc Set",
        category=cat,
        purchase_cost=Decimal("12.0000"),
        selling_price=Decimal("24.0000"),
    )


@pytest.mark.django_db
def test_submit_order_success(purchaser, supplier, product_a):
    po = PurchaseOrder.objects.create(
        order_reference="PO-TEST-001",
        supplier=supplier,
        created_by=purchaser,
    )
    PurchaseOrderItem.objects.create(
        purchase_order=po,
        product=product_a,
        ordered_quantity=Decimal("10.00"),
        unit_cost=Decimal("48.0000"),
    )

    submitted_po = PurchaseOrderService.submit_order(purchase_order=po, actor=purchaser)
    assert submitted_po.status == PurchaseOrderStatus.SUBMITTED


@pytest.mark.django_db
def test_submit_order_without_items_fails(purchaser, supplier):
    po = PurchaseOrder.objects.create(
        order_reference="PO-TEST-EMPTY",
        supplier=supplier,
        created_by=purchaser,
    )
    with pytest.raises(PurchaseOrderValidationError):
        PurchaseOrderService.submit_order(purchase_order=po, actor=purchaser)


@pytest.mark.django_db
def test_submit_order_invalid_status(purchaser, supplier, product_a):
    po = PurchaseOrder.objects.create(
        order_reference="PO-TEST-SUBMITTED",
        supplier=supplier,
        status=PurchaseOrderStatus.SUBMITTED,
        created_by=purchaser,
    )
    PurchaseOrderItem.objects.create(
        purchase_order=po,
        product=product_a,
        ordered_quantity=Decimal("5.00"),
        unit_cost=Decimal("45.0000"),
    )
    with pytest.raises(InvalidOrderStatusError):
        PurchaseOrderService.submit_order(purchase_order=po, actor=purchaser)


@pytest.mark.django_db
def test_cancel_draft_order_discards_without_logging(purchaser, supplier):
    po = PurchaseOrder.objects.create(
        order_reference="PO-TEST-CANCEL-DRAFT",
        supplier=supplier,
        created_by=purchaser,
    )
    result = PurchaseOrderService.cancel_order(
        purchase_order=po,
        actor=purchaser,
    )
    assert result is None
    assert not PurchaseOrder.objects.filter(order_reference="PO-TEST-CANCEL-DRAFT").exists()


@pytest.mark.django_db
def test_cancel_submitted_order_records_log(purchaser, supplier, product_a):
    po = PurchaseOrder.objects.create(
        order_reference="PO-TEST-CANCEL-SUBMITTED",
        supplier=supplier,
        status=PurchaseOrderStatus.SUBMITTED,
        created_by=purchaser,
    )
    PurchaseOrderItem.objects.create(
        purchase_order=po,
        product=product_a,
        ordered_quantity=Decimal("10.00"),
        unit_cost=Decimal("15.0000"),
    )
    cancelled = PurchaseOrderService.cancel_order(
        purchase_order=po,
        actor=purchaser,
        reason="Vendor out of stock",
    )
    assert cancelled is not None
    assert cancelled.status == PurchaseOrderStatus.CANCELLED
    assert "Vendor out of stock" in cancelled.notes


@pytest.mark.django_db
def test_receive_delivery_lifecycle(purchaser, supplier, warehouse, product_a, product_b):
    # Setup PO with 2 items
    po = PurchaseOrder.objects.create(
        order_reference="PO-20261015-MULTI",
        supplier=supplier,
        created_by=purchaser,
    )
    item_a = PurchaseOrderItem.objects.create(
        purchase_order=po,
        product=product_a,
        ordered_quantity=Decimal("10.00"),
        unit_cost=Decimal("45.0000"),
    )
    item_b = PurchaseOrderItem.objects.create(
        purchase_order=po,
        product=product_b,
        ordered_quantity=Decimal("20.00"),
        unit_cost=Decimal("10.0000"),
    )

    # 1. Cannot receive while in DRAFT status
    with pytest.raises(InvalidOrderStatusError):
        PurchaseOrderService.receive_delivery(
            purchase_order=po,
            location=warehouse,
            received_by=purchaser,
            items_data=[{"po_item_id": item_a.id, "accepted_quantity": "5.00"}],
        )

    # Submit PO
    PurchaseOrderService.submit_order(purchase_order=po, actor=purchaser)

    # 2. First partial delivery: 6 units of Item A, 10 units of Item B
    receipt_1 = PurchaseOrderService.receive_delivery(
        purchase_order=po,
        location=warehouse,
        received_by=purchaser,
        items_data=[
            {
                "po_item_id": item_a.id,
                "accepted_quantity": "6.00",
                "rejected_quantity": "1.00",
                "notes": "1 damaged box",
            },
            {
                "po_item_id": item_b.id,
                "accepted_quantity": "10.00",
                "rejected_quantity": "0.00",
            },
        ],
        supplier_delivery_ref="WB-9901",
    )

    po.refresh_from_db()
    assert po.status == PurchaseOrderStatus.PARTIALLY_RECEIVED
    assert receipt_1.items.count() == 2

    item_a.refresh_from_db()
    item_b.refresh_from_db()
    assert item_a.received_quantity == Decimal("6.00")
    assert item_b.received_quantity == Decimal("10.00")

    # Verify StockBalance projection
    bal_a = StockBalance.objects.get(product=product_a, location=warehouse)
    bal_b = StockBalance.objects.get(product=product_b, location=warehouse)
    assert bal_a.current_quantity == Decimal("6.00")
    assert bal_b.current_quantity == Decimal("10.00")

    # Verify StockMovement ledger entries
    movements = StockMovement.objects.filter(movement_type=MovementType.RECEIPT)
    assert movements.count() == 2

    # 3. Over-receipt validation check
    with pytest.raises(OverReceiptError):
        PurchaseOrderService.receive_delivery(
            purchase_order=po,
            location=warehouse,
            received_by=purchaser,
            items_data=[
                {
                    "po_item_id": item_a.id,
                    "accepted_quantity": "5.00",  # Only 4.00 remaining
                }
            ],
        )

    # 4. Final delivery: remaining 4 units of Item A, 10 units of Item B
    PurchaseOrderService.receive_delivery(
        purchase_order=po,
        location=warehouse,
        received_by=purchaser,
        items_data=[
            {
                "po_item_id": item_a.id,
                "accepted_quantity": "4.00",
            },
            {
                "po_item_id": item_b.id,
                "accepted_quantity": "10.00",
            },
        ],
        supplier_delivery_ref="WB-9902",
    )

    po.refresh_from_db()
    assert po.status == PurchaseOrderStatus.FULLY_RECEIVED

    bal_a.refresh_from_db()
    bal_b.refresh_from_db()
    assert bal_a.current_quantity == Decimal("10.00")
    assert bal_b.current_quantity == Decimal("20.00")

    # Cannot cancel fully received PO
    with pytest.raises(InvalidOrderStatusError):
        PurchaseOrderService.cancel_order(purchase_order=po, actor=purchaser)
