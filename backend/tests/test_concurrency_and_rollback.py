"""
Automated tests for concurrency control, transaction rollback safety,
and idempotency lock integrity across inventory and purchasing domains.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.db import connection, connections, transaction

from apps.accounts.models import User, UserRole
from apps.catalog.models import Category, Product
from apps.inventory.exceptions import InsufficientStockError, InvalidMovementError
from apps.inventory.models import Location, MovementType, StockBalance, StockMovement
from apps.inventory.services import StockMovementService
from apps.purchasing.exceptions import InvalidOrderStatusError
from apps.purchasing.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
    Receipt,
    ReceiptStatus,
    Supplier,
)
from apps.purchasing.services import PurchaseOrderService


@pytest.fixture
def actor(db):
    return User.objects.create_user(
        username="concurrency_actor",
        password="Password123!",
        role=UserRole.MANAGER,
    )


@pytest.fixture
def location(db):
    return Location.objects.create(code="CONC-WH", name="Concurrency Warehouse")


@pytest.fixture
def product(db):
    cat = Category.objects.create(name="Concurrency Testing")
    return Product.objects.create(
        sku="SKU-CONC-001",
        name="High Stress Drill Bit",
        category=cat,
        purchase_cost=Decimal("10.0000"),
        selling_price=Decimal("20.0000"),
    )


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name="Concurrency Fasteners Inc.")


# ============================================================================
# 1. Transaction Rollback Resilience
# ============================================================================


@pytest.mark.django_db(transaction=True)
def test_stock_movement_rolls_back_on_unhandled_exception(actor, location, product):
    """
    Verify that if an unhandled error occurs during balance projection,
    the entire transaction rolls back cleanly with zero orphaned StockMovement records.
    """
    # Seed initial balance of 20 units
    StockMovementService.record_movement(
        product=product,
        location=location,
        movement_type=MovementType.OPENING_BALANCE,
        quantity=Decimal("20.00"),
        actor=actor,
        reason="Initial seed",
    )

    initial_balance = StockBalance.objects.get(product=product, location=location)
    assert initial_balance.current_quantity == Decimal("20.00")
    initial_movements_count = StockMovement.objects.count()

    # Attempt a movement where save() raises an error
    with (
        patch.object(StockBalance, "save", side_effect=RuntimeError("Simulated DB I/O Crash")),
        pytest.raises(RuntimeError, match="Simulated DB I/O Crash"),
    ):
        StockMovementService.record_movement(
            product=product,
            location=location,
            movement_type=MovementType.POSITIVE_ADJUSTMENT,
            quantity=Decimal("15.00"),
            actor=actor,
            reason="Corrupted save attempt",
        )

    # Verify rollback: no new movement was recorded and balance remains untouched
    assert StockMovement.objects.count() == initial_movements_count
    current_balance = StockBalance.objects.get(product=product, location=location)
    assert current_balance.current_quantity == Decimal("20.00")


@pytest.mark.django_db(transaction=True)
def test_purchasing_receipt_rolls_back_on_mid_flight_failure(actor, location, product, supplier):
    """
    Verify that if delivery intake fails halfway through posting line items,
    all previously processed items roll back cleanly with zero partial stock deductions.
    """
    product_b = Product.objects.create(
        sku="SKU-CONC-002",
        name="Secondary Drill Bit",
        category=product.category,
        purchase_cost=Decimal("15.0000"),
        selling_price=Decimal("30.0000"),
    )

    po = PurchaseOrder.objects.create(
        order_reference="PO-ROLLBACK-01",
        supplier=supplier,
        created_by=actor,
    )
    po_item_a = PurchaseOrderItem.objects.create(
        purchase_order=po,
        product=product,
        ordered_quantity=Decimal("10.00"),
        unit_cost=Decimal("10.0000"),
    )
    po_item_b = PurchaseOrderItem.objects.create(
        purchase_order=po,
        product=product_b,
        ordered_quantity=Decimal("5.00"),
        unit_cost=Decimal("15.0000"),
    )
    PurchaseOrderService.submit_order(purchase_order=po, actor=actor)

    initial_movements_count = StockMovement.objects.count()

    # Inject failure on item B processing
    orig_record_movement = StockMovementService.record_movement

    def mock_movement(**kwargs):
        if kwargs.get("product") == product_b:
            raise ValueError("Simulated validation failure on Product B")
        return orig_record_movement(**kwargs)

    with (
        patch.object(StockMovementService, "record_movement", side_effect=mock_movement),
        pytest.raises(ValueError, match="Simulated validation failure on Product B"),
    ):
        PurchaseOrderService.receive_delivery(
            purchase_order=po,
            location=location,
            received_by=actor,
            supplier_delivery_ref="DELIV-FAIL-01",
            items_data=[
                {"po_item_id": po_item_a.id, "accepted_quantity": "10.00"},
                {"po_item_id": po_item_b.id, "accepted_quantity": "5.00"},
            ],
        )

    # Verify atomic rollback: no receipts created, no movements created, no balances created
    assert Receipt.objects.filter(purchase_order=po).count() == 0
    assert StockMovement.objects.count() == initial_movements_count
    assert not StockBalance.objects.filter(product=product, location=location).exists()
    assert not StockBalance.objects.filter(product=product_b, location=location).exists()
    po.refresh_from_db()
    assert po.status == PurchaseOrderStatus.SUBMITTED


# ============================================================================
# 2. Concurrency & Negative-Stock Prevention Under Race Conditions
# ============================================================================


@pytest.mark.django_db(transaction=True)
def test_sequential_deductions_enforce_negative_stock_boundary(actor, location, product):
    """
    Verify that negative stock is strictly rejected at the service layer
    and balances cannot be driven below zero.
    """
    # Seed initial 10 units
    StockMovementService.record_movement(
        product=product,
        location=location,
        movement_type=MovementType.OPENING_BALANCE,
        quantity=Decimal("10.00"),
        actor=actor,
        reason="Opening 10 units",
    )

    # First deduction of 8 units succeeds (leaves 2.00)
    StockMovementService.record_movement(
        product=product,
        location=location,
        movement_type=MovementType.NEGATIVE_ADJUSTMENT,
        quantity=Decimal("-8.00"),
        actor=actor,
        reason="First deduction",
    )
    balance = StockBalance.objects.get(product=product, location=location)
    assert balance.current_quantity == Decimal("2.00")

    # Second deduction of 8 units MUST raise InsufficientStockError
    with pytest.raises(InsufficientStockError, match="Insufficient stock"):
        StockMovementService.record_movement(
            product=product,
            location=location,
            movement_type=MovementType.NEGATIVE_ADJUSTMENT,
            quantity=Decimal("-8.00"),
            actor=actor,
            reason="Exceeding deduction",
        )

    # Balance remains precisely 2.00
    balance.refresh_from_db()
    assert balance.current_quantity == Decimal("2.00")


@pytest.mark.django_db(transaction=True)
def test_concurrent_deductions_prevent_negative_stock(actor, location, product):
    """
    Test race condition under true database row-level locking (PostgreSQL).
    Stock is 10 units. Two concurrent threads attempt to deduct 8 units each.
    Under row-level select_for_update(), exactly ONE succeeds and the other fails.
    """
    if connection.vendor == "sqlite":
        pytest.skip(
            "Row-level locking via select_for_update() requires PostgreSQL. "
            "SQLite does not support select_for_update() and deadlocks with table-level locks."
        )

    # Seed 10 units
    StockMovementService.record_movement(
        product=product,
        location=location,
        movement_type=MovementType.OPENING_BALANCE,
        quantity=Decimal("10.00"),
        actor=actor,
        reason="Opening 10 units",
    )

    successes = []
    failures = []

    def attempt_deduction(qty: Decimal):
        connections.close_all()
        try:
            with transaction.atomic():
                StockMovementService.record_movement(
                    product=product,
                    location=location,
                    movement_type=MovementType.NEGATIVE_ADJUSTMENT,
                    quantity=qty,
                    actor=actor,
                    reason="Concurrent issue attempt",
                )
            successes.append(qty)
        except (InsufficientStockError, InvalidMovementError) as err:
            failures.append(str(err))
        finally:
            connections.close_all()

    # Launch 2 threads concurrently requesting 8 units each
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(attempt_deduction, Decimal("8.00")) for _ in range(2)]
        for f in as_completed(futures):
            f.result()

    assert len(successes) == 1
    assert len(failures) == 1
    assert "Insufficient stock" in failures[0]

    final_balance = StockBalance.objects.get(product=product, location=location)
    assert final_balance.current_quantity == Decimal("2.00")


# ============================================================================
# 3. Ledger-to-Balance Agreement Under Rapid Transaction Batches
# ============================================================================


@pytest.mark.django_db(transaction=True)
def test_rapid_transactional_movements_maintain_exact_ledger_balance(actor, location, product):
    """
    Execute 10 sequential transactional movements (adjustments, issues, receipts).
    Verify that the final StockBalance matches the net sum of all ledger movements
    with zero calculation drift.
    """
    deltas = [
        Decimal("20.00"),  # +20 (open)
        Decimal("10.50"),  # +10.50
        Decimal("-5.00"),  # -5.00
        Decimal("14.25"),  # +14.25
        Decimal("-12.00"),  # -12.00
        Decimal("3.50"),  # +3.50
        Decimal("-7.25"),  # -7.25
        Decimal("8.00"),  # +8.00
        Decimal("-4.00"),  # -4.00
        Decimal("5.00"),  # +5.00
    ]

    for delta in deltas:
        m_type = MovementType.POSITIVE_ADJUSTMENT if delta > 0 else MovementType.NEGATIVE_ADJUSTMENT
        StockMovementService.record_movement(
            product=product,
            location=location,
            movement_type=m_type,
            quantity=delta,
            actor=actor,
            reason="Rapid batch movement",
        )

    # Check StockBalance
    expected_sum = sum(deltas)
    balance = StockBalance.objects.get(product=product, location=location)
    assert balance.current_quantity == expected_sum

    # Check all movements
    movements = StockMovement.objects.filter(product=product, location=location)
    assert movements.count() == len(deltas)


@pytest.mark.django_db(transaction=True)
def test_multi_threaded_concurrent_deposits_maintain_ledger_balance_agreement(
    actor, location, product
):
    """
    Launch 8 concurrent worker threads, each depositing 5 units under PostgreSQL row-level locks.
    Assert that all 8 succeed, exactly 8 StockMovement records are created,
    and final StockBalance equals 40.00 units with zero race condition drops.
    """
    if connection.vendor == "sqlite":
        pytest.skip(
            "Concurrent multi-connection writes require PostgreSQL row-level MVCC. "
            "SQLite locks the entire database file on concurrent writes."
        )

    num_threads = 8
    deposit_amount = Decimal("5.00")

    def worker_deposit():
        connections.close_all()
        try:
            with transaction.atomic():
                StockMovementService.record_movement(
                    product=product,
                    location=location,
                    movement_type=MovementType.POSITIVE_ADJUSTMENT,
                    quantity=deposit_amount,
                    actor=actor,
                    reason="Concurrent deposit worker",
                )
            return True
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [executor.submit(worker_deposit) for _ in range(num_threads)]
        results = [f.result() for f in as_completed(futures)]

    assert len(results) == num_threads
    assert all(results)

    # Verify ledger consistency
    movements = StockMovement.objects.filter(product=product, location=location)
    assert movements.count() == num_threads

    expected_total = deposit_amount * num_threads
    final_balance = StockBalance.objects.get(product=product, location=location)
    assert final_balance.current_quantity == expected_total


# ============================================================================
# 4. Idempotency & Replay Prevention
# ============================================================================


@pytest.mark.django_db(transaction=True)
def test_post_receipt_idempotency_rejects_duplicate_posting(actor, location, product, supplier):
    """
    Verify that once an order is fully received, attempting to receive further deliveries
    is strictly rejected with InvalidOrderStatusError and creates 0 duplicate stock movements.
    """
    po = PurchaseOrder.objects.create(
        order_reference="PO-IDEMP-01",
        supplier=supplier,
        created_by=actor,
    )
    po_item = PurchaseOrderItem.objects.create(
        purchase_order=po,
        product=product,
        ordered_quantity=Decimal("25.00"),
        unit_cost=Decimal("10.0000"),
    )
    PurchaseOrderService.submit_order(purchase_order=po, actor=actor)

    # First delivery completes the entire order
    receipt = PurchaseOrderService.receive_delivery(
        purchase_order=po,
        location=location,
        received_by=actor,
        supplier_delivery_ref="DELIV-IDEMP-01",
        items_data=[{"po_item_id": po_item.id, "accepted_quantity": "25.00"}],
    )
    assert receipt.status == ReceiptStatus.POSTED
    po.refresh_from_db()
    assert po.status == PurchaseOrderStatus.FULLY_RECEIVED

    initial_movements = StockMovement.objects.filter(product=product).count()
    assert initial_movements == 1

    balance = StockBalance.objects.get(product=product, location=location)
    assert balance.current_quantity == Decimal("25.00")

    # Second receiving attempt on a FULLY_RECEIVED PO must be rejected
    with pytest.raises(
        InvalidOrderStatusError,
        match="Cannot receive items for purchase order in status 'FULLY_RECEIVED'",
    ):
        PurchaseOrderService.receive_delivery(
            purchase_order=po,
            location=location,
            received_by=actor,
            supplier_delivery_ref="DELIV-IDEMP-RETRY",
            items_data=[{"po_item_id": po_item.id, "accepted_quantity": "25.00"}],
        )

    # Verify no duplicate stock movements or balance increases
    assert StockMovement.objects.filter(product=product).count() == initial_movements
    balance.refresh_from_db()
    assert balance.current_quantity == Decimal("25.00")
