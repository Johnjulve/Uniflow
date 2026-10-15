"""
Unit tests for inventory domain models: Location, StockMovement, StockBalance.
"""
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from apps.accounts.models import User, UserRole
from apps.catalog.models import Category, Product
from apps.inventory.models import Location, MovementType, StockBalance, StockMovement


@pytest.fixture
def actor(db):
    return User.objects.create_user(
        username="inv_actor",
        password="Password123!",
        role=UserRole.MANAGER,
    )


@pytest.fixture
def location(db):
    return Location.objects.create(
        code="main-wh",
        name="Primary Distribution Warehouse",
    )


@pytest.fixture
def product(db):
    cat = Category.objects.create(name="Fasteners")
    return Product.objects.create(
        sku="SKU-BOLT-M6",
        name="M6 Hex Bolt",
        category=cat,
        purchase_cost=Decimal("0.2000"),
        selling_price=Decimal("0.5000"),
    )


@pytest.mark.django_db
def test_location_creation_and_code_normalization(location):
    assert location.code == "MAIN-WH"
    assert location.is_active is True
    assert str(location) == "MAIN-WH - Primary Distribution Warehouse"


@pytest.mark.django_db
def test_location_unique_code():
    Location.objects.create(code="STORE-1", name="Front Store")
    with pytest.raises((ValidationError, IntegrityError)):
        Location.objects.create(code="store-1", name="Duplicate Store")


@pytest.mark.django_db
def test_stock_movement_creation(actor, location, product):
    movement = StockMovement.objects.create(
        movement_reference="MOV-2026-000001",
        product=product,
        location=location,
        movement_type=MovementType.OPENING_BALANCE,
        quantity=Decimal("100.00"),
        unit_cost=Decimal("0.2000"),
        reason="Initial warehouse stock load",
        actor=actor,
    )
    assert movement.movement_reference == "MOV-2026-000001"
    assert movement.quantity == Decimal("100.00")
    assert movement.actor == actor


@pytest.mark.django_db
def test_stock_movement_zero_quantity_rejected(actor, location, product):
    with pytest.raises(ValidationError):
        StockMovement.objects.create(
            movement_reference="MOV-ZERO",
            product=product,
            location=location,
            movement_type=MovementType.POSITIVE_ADJUSTMENT,
            quantity=Decimal("0.00"),
            reason="Zero adjustment",
            actor=actor,
        )


@pytest.mark.django_db
def test_stock_movement_strict_immutability(actor, location, product):
    movement = StockMovement.objects.create(
        movement_reference="MOV-IMMUTABLE-01",
        product=product,
        location=location,
        movement_type=MovementType.RECEIPT,
        quantity=Decimal("50.00"),
        reason="PO receiving",
        actor=actor,
    )

    # Editing existing movement is forbidden
    movement.reason = "Altered reason"
    with pytest.raises(ValidationError) as exc_info:
        movement.save()
    assert "immutable" in str(exc_info.value)

    # Deleting movement is forbidden
    with pytest.raises(ValidationError) as del_info:
        movement.delete()
    assert "immutable" in str(del_info.value)


@pytest.mark.django_db
def test_stock_balance_unique_constraint(location, product):
    StockBalance.objects.create(
        product=product,
        location=location,
        current_quantity=Decimal("150.00"),
    )

    with pytest.raises(IntegrityError):
        StockBalance.objects.create(
            product=product,
            location=location,
            current_quantity=Decimal("20.00"),
        )
