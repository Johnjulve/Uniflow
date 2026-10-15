"""
Automated tests for StockMovementService and transactional stock ledger operations.
"""
from decimal import Decimal

import pytest

from apps.accounts.models import User, UserRole
from apps.catalog.models import Category, Product
from apps.inventory.exceptions import InsufficientStockError, InvalidMovementError
from apps.inventory.models import Location, MovementType, StockBalance
from apps.inventory.services import StockMovementService


@pytest.fixture
def actor(db):
    return User.objects.create_user(
        username="srv_actor",
        password="Password123!",
        role=UserRole.MANAGER,
    )


@pytest.fixture
def location(db):
    return Location.objects.create(code="CENTRAL-WH", name="Central Warehouse")


@pytest.fixture
def product(db):
    cat = Category.objects.create(name="Plumbing")
    return Product.objects.create(
        sku="SKU-VALVE-01",
        name="Brass Ball Valve 1/2 inch",
        category=cat,
        purchase_cost=Decimal("8.5000"),
        selling_price=Decimal("15.0000"),
    )


@pytest.mark.django_db
def test_record_positive_movement(actor, location, product):
    movement = StockMovementService.record_movement(
        product=product,
        location=location,
        movement_type=MovementType.OPENING_BALANCE,
        quantity=Decimal("50.00"),
        actor=actor,
        reason="Initial inventory load",
    )

    assert movement.quantity == Decimal("50.00")
    assert movement.movement_reference.startswith("MOV-")

    balance = StockBalance.objects.get(product=product, location=location)
    assert balance.current_quantity == Decimal("50.00")
    assert balance.last_movement == movement


@pytest.mark.django_db
def test_record_negative_movement(actor, location, product):
    # Setup initial 50 units
    StockMovementService.record_movement(
        product=product,
        location=location,
        movement_type=MovementType.RECEIPT,
        quantity=Decimal("50.00"),
        actor=actor,
    )

    # Issue 20 units
    issue_movement = StockMovementService.record_movement(
        product=product,
        location=location,
        movement_type=MovementType.ISSUE,
        quantity=Decimal("-20.00"),
        actor=actor,
        reason="Internal maintenance use",
    )
    assert issue_movement.quantity == Decimal("-20.00")

    balance = StockBalance.objects.get(product=product, location=location)
    assert balance.current_quantity == Decimal("30.00")
    assert balance.last_movement == issue_movement


@pytest.mark.django_db
def test_negative_stock_rejection(actor, location, product, settings):
    settings.ALLOW_NEGATIVE_STOCK = False

    # Setup initial 10 units
    StockMovementService.record_movement(
        product=product,
        location=location,
        movement_type=MovementType.RECEIPT,
        quantity=Decimal("10.00"),
        actor=actor,
    )

    # Attempt to issue 15 units (would drop to -5)
    with pytest.raises(InsufficientStockError) as exc_info:
        StockMovementService.record_movement(
            product=product,
            location=location,
            movement_type=MovementType.ISSUE,
            quantity=Decimal("-15.00"),
            actor=actor,
            reason="Over-issue attempt",
        )

    assert "Insufficient stock" in str(exc_info.value)

    # Balance must remain unchanged at 10
    balance = StockBalance.objects.get(product=product, location=location)
    assert balance.current_quantity == Decimal("10.00")


@pytest.mark.django_db
def test_negative_stock_allowed_when_configured(actor, location, product, settings):
    settings.ALLOW_NEGATIVE_STOCK = True

    # Setup initial 5 units
    StockMovementService.record_movement(
        product=product,
        location=location,
        movement_type=MovementType.RECEIPT,
        quantity=Decimal("5.00"),
        actor=actor,
    )

    # Issue 15 units (allowed by setting)
    StockMovementService.record_movement(
        product=product,
        location=location,
        movement_type=MovementType.ISSUE,
        quantity=Decimal("-15.00"),
        actor=actor,
    )

    balance = StockBalance.objects.get(product=product, location=location)
    assert balance.current_quantity == Decimal("-10.00")


@pytest.mark.django_db
def test_adjust_stock_positive_and_negative(actor, location, product):
    # Initial balance = 0
    # Adjust to 40
    adj1 = StockMovementService.adjust_stock(
        product=product,
        location=location,
        counted_quantity=Decimal("40.00"),
        actor=actor,
        reason="Physical count initial",
    )
    assert adj1.movement_type == MovementType.POSITIVE_ADJUSTMENT
    assert adj1.quantity == Decimal("40.00")

    balance = StockBalance.objects.get(product=product, location=location)
    assert balance.current_quantity == Decimal("40.00")

    # Downward adjustment from 40 to 35
    adj2 = StockMovementService.adjust_stock(
        product=product,
        location=location,
        counted_quantity=Decimal("35.00"),
        actor=actor,
        reason="Physical count discrepancy (-5 units)",
    )
    assert adj2.movement_type == MovementType.NEGATIVE_ADJUSTMENT
    assert adj2.quantity == Decimal("-5.00")

    balance.refresh_from_db()
    assert balance.current_quantity == Decimal("35.00")


@pytest.mark.django_db
def test_adjust_stock_identical_count_rejected(actor, location, product):
    StockMovementService.record_movement(
        product=product,
        location=location,
        movement_type=MovementType.RECEIPT,
        quantity=Decimal("25.00"),
        actor=actor,
    )

    with pytest.raises(InvalidMovementError) as exc_info:
        StockMovementService.adjust_stock(
            product=product,
            location=location,
            counted_quantity=Decimal("25.00"),
            actor=actor,
            reason="Redundant check",
        )
    assert "No adjustment required" in str(exc_info.value)
