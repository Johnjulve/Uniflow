"""
Unit tests for purchasing domain models: Supplier, PurchaseOrder, PurchaseOrderItem, Receipt, ReceiptItem.
"""
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from apps.accounts.models import User, UserRole
from apps.catalog.models import Category, Product
from apps.inventory.models import Location
from apps.purchasing.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
    Receipt,
    ReceiptItem,
    ReceiptStatus,
    Supplier,
)


@pytest.fixture
def purchaser(db):
    return User.objects.create_user(
        username="purchaser_user",
        password="Password123!",
        role=UserRole.MANAGER,
    )


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(
        name="Acme Tools & Supplies",
        contact_name="Alice Smith",
        email="alice@acmetools.test",
        phone="+1-555-0199",
    )


@pytest.fixture
def warehouse(db):
    return Location.objects.create(
        code="WH-NORTH",
        name="North Distribution Center",
    )


@pytest.fixture
def product(db):
    cat = Category.objects.create(name="Tools")
    return Product.objects.create(
        sku="SKU-DRILL-01",
        name="Cordless Drill 18V",
        category=cat,
        purchase_cost=Decimal("45.0000"),
        selling_price=Decimal("79.9900"),
    )


@pytest.mark.django_db
def test_supplier_creation_and_defaults(supplier):
    assert supplier.name == "Acme Tools & Supplies"
    assert supplier.is_active is True
    assert str(supplier) == "Acme Tools & Supplies"


@pytest.mark.django_db
def test_purchase_order_creation_and_properties(purchaser, supplier, product):
    po = PurchaseOrder.objects.create(
        order_reference="PO-20261015-0001",
        supplier=supplier,
        created_by=purchaser,
    )
    assert po.status == PurchaseOrderStatus.DRAFT
    assert po.total_cost == Decimal("0.0000")
    assert po.total_ordered_quantity == Decimal("0.00")
    assert po.total_received_quantity == Decimal("0.00")
    assert po.can_cancel() is True

    item = PurchaseOrderItem.objects.create(
        purchase_order=po,
        product=product,
        ordered_quantity=Decimal("10.00"),
        unit_cost=Decimal("42.5000"),
    )
    assert item.line_total == Decimal("425.0000")
    assert po.total_cost == Decimal("425.0000")
    assert po.total_ordered_quantity == Decimal("10.00")


@pytest.mark.django_db
def test_purchase_order_item_validation(purchaser, supplier, product):
    po = PurchaseOrder.objects.create(
        order_reference="PO-20261015-0002",
        supplier=supplier,
        created_by=purchaser,
    )
    with pytest.raises(ValidationError):
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            product=product,
            ordered_quantity=Decimal("0.00"),
            unit_cost=Decimal("10.0000"),
        )

    with pytest.raises(ValidationError):
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            product=product,
            ordered_quantity=Decimal("5.00"),
            unit_cost=Decimal("-1.0000"),
        )


@pytest.mark.django_db
def test_purchase_order_item_unique_constraint(purchaser, supplier, product):
    po = PurchaseOrder.objects.create(
        order_reference="PO-20261015-0003",
        supplier=supplier,
        created_by=purchaser,
    )
    PurchaseOrderItem.objects.create(
        purchase_order=po,
        product=product,
        ordered_quantity=Decimal("5.00"),
        unit_cost=Decimal("10.0000"),
    )
    with pytest.raises((ValidationError, IntegrityError)):
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            product=product,
            ordered_quantity=Decimal("10.00"),
            unit_cost=Decimal("9.0000"),
        )


@pytest.mark.django_db
def test_receipt_and_receipt_item_lifecycle(purchaser, supplier, warehouse, product):
    po = PurchaseOrder.objects.create(
        order_reference="PO-20261015-0004",
        supplier=supplier,
        created_by=purchaser,
    )
    po_item = PurchaseOrderItem.objects.create(
        purchase_order=po,
        product=product,
        ordered_quantity=Decimal("20.00"),
        unit_cost=Decimal("15.0000"),
    )

    receipt = Receipt.objects.create(
        receipt_reference="REC-20261015-0001",
        purchase_order=po,
        location=warehouse,
        supplier_delivery_ref="WAYBILL-9901",
        received_by=purchaser,
    )
    assert receipt.status == ReceiptStatus.POSTED
    assert "REC-20261015-0001" in str(receipt)

    receipt_item = ReceiptItem.objects.create(
        receipt=receipt,
        po_item=po_item,
        accepted_quantity=Decimal("18.00"),
        rejected_quantity=Decimal("2.00"),
        notes="2 units cracked in transit",
    )
    assert receipt_item.accepted_quantity == Decimal("18.00")
    assert receipt_item.rejected_quantity == Decimal("2.00")

    with pytest.raises(ValidationError):
        ReceiptItem.objects.create(
            receipt=receipt,
            po_item=po_item,
            accepted_quantity=Decimal("-1.00"),
        )
