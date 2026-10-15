"""
Authoritative stock mutation domain service.
Enforces transactional concurrency locks (select_for_update), negative-stock validation,
and synchronous balance projection updates.
"""
import uuid
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import Product
from apps.inventory.exceptions import InsufficientStockError, InvalidMovementError
from apps.inventory.models import Location, MovementType, StockBalance, StockMovement


def generate_movement_reference() -> str:
    """Generate an authoritative, unique movement reference string."""
    now_str = timezone.now().strftime("%Y%m%d")
    rand_suffix = uuid.uuid4().hex[:6].upper()
    return f"MOV-{now_str}-{rand_suffix}"


class StockMovementService:
    """
    Core transactional service for all inventory ledger changes.
    Direct updates to StockBalance outside this service are strictly prohibited.
    """

    @classmethod
    def record_movement(
        cls,
        *,
        product: Product,
        location: Location,
        movement_type: str,
        quantity: Decimal,
        actor,
        unit_cost: Decimal | None = None,
        reason: str = "",
        source_doc_type: str | None = None,
        source_doc_id: uuid.UUID | None = None,
        reversal_of: StockMovement | None = None,
        effective_at: timezone.datetime | None = None,
        movement_reference: str | None = None,
    ) -> StockMovement:
        """
        Record an immutable stock movement and synchronously update the balance projection.
        Acquires row-level database lock (select_for_update) inside an atomic transaction.
        """
        delta = Decimal(str(quantity))
        if delta == Decimal("0.00"):
            raise InvalidMovementError("Movement quantity cannot be zero.")

        if unit_cost is None:
            unit_cost = product.purchase_cost

        cost_val = Decimal(str(unit_cost))
        if cost_val < Decimal("0.00"):
            raise InvalidMovementError("Unit cost cannot be negative.")

        ref = movement_reference or generate_movement_reference()
        eff_time = effective_at or timezone.now()

        with transaction.atomic():
            # 1. Acquire row-level lock on the StockBalance row
            balance, _ = StockBalance.objects.select_for_update().get_or_create(
                product=product,
                location=location,
                defaults={"current_quantity": Decimal("0.00")},
            )

            # 2. Check negative-stock business policy
            new_quantity = balance.current_quantity + delta
            allow_negative = getattr(settings, "ALLOW_NEGATIVE_STOCK", False)

            if new_quantity < Decimal("0.00") and not allow_negative:
                raise InsufficientStockError(
                    f"Insufficient stock for SKU {product.sku} at {location.code}. "
                    f"Current balance: {balance.current_quantity}, requested delta: {delta}."
                )

            # 3. Create immutable StockMovement entry
            movement = StockMovement.objects.create(
                movement_reference=ref,
                product=product,
                location=location,
                movement_type=movement_type,
                quantity=delta,
                unit_cost=cost_val,
                source_doc_type=source_doc_type,
                source_doc_id=source_doc_id,
                reason=reason or f"Stock operation: {movement_type}",
                actor=actor,
                reversal_of=reversal_of,
                effective_at=eff_time,
            )

            # 4. Synchronously update the projected balance
            balance.current_quantity = new_quantity
            balance.last_movement = movement
            balance.save(update_fields=["current_quantity", "last_movement", "updated_at"])

            return movement

    @classmethod
    def adjust_stock(
        cls,
        *,
        product: Product,
        location: Location,
        counted_quantity: Decimal,
        actor,
        reason: str,
    ) -> StockMovement:
        """
        Perform a physical cycle count adjustment to align projected balance with counted inventory.
        """
        target = Decimal(str(counted_quantity))
        if target < Decimal("0.00"):
            raise InvalidMovementError("Counted quantity cannot be negative.")

        with transaction.atomic():
            balance, _ = StockBalance.objects.select_for_update().get_or_create(
                product=product,
                location=location,
                defaults={"current_quantity": Decimal("0.00")},
            )

            delta = target - balance.current_quantity
            if delta == Decimal("0.00"):
                raise InvalidMovementError("Counted quantity matches current balance. No adjustment required.")

            m_type = (
                MovementType.POSITIVE_ADJUSTMENT
                if delta > Decimal("0.00")
                else MovementType.NEGATIVE_ADJUSTMENT
            )

            return cls.record_movement(
                product=product,
                location=location,
                movement_type=m_type,
                quantity=delta,
                actor=actor,
                reason=reason or f"Cycle count discrepancy: {delta} units",
            )
