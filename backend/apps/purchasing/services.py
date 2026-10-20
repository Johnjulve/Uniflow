"""
Domain service for purchasing workflows: order submission, cancellation,
and delivery intake receipts with automated stock ledger synchronization.
"""
import uuid
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import Location, MovementType
from apps.inventory.services import StockMovementService
from apps.purchasing.exceptions import (
    InvalidOrderStatusError,
    OverReceiptError,
    PurchaseOrderValidationError,
)
from apps.purchasing.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
    Receipt,
    ReceiptItem,
    ReceiptStatus,
)


def generate_po_reference() -> str:
    """Generate sequential-style purchase order reference PO-YYYYMMDD-XXXX."""
    date_str = timezone.now().strftime("%Y%m%d")
    rand_suffix = uuid.uuid4().hex[:6].upper()
    return f"PO-{date_str}-{rand_suffix}"


def generate_receipt_reference() -> str:
    """Generate sequential-style receipt reference REC-YYYYMMDD-XXXX."""
    date_str = timezone.now().strftime("%Y%m%d")
    rand_suffix = uuid.uuid4().hex[:6].upper()
    return f"REC-{date_str}-{rand_suffix}"


class PurchaseOrderService:
    """
    Authoritative workflow service for purchase order lifecycle and inventory receiving.
    """

    @classmethod
    def submit_order(cls, *, purchase_order: PurchaseOrder, actor) -> PurchaseOrder:
        """
        Transition a draft purchase order to submitted status, freezing items for vendor fulfillment.
        """
        with transaction.atomic():
            po = PurchaseOrder.objects.select_for_update().get(id=purchase_order.id)
            if po.status != PurchaseOrderStatus.DRAFT:
                raise InvalidOrderStatusError(
                    f"Only DRAFT purchase orders can be submitted. Current status: {po.status}."
                )

            if not po.items.exists():
                raise PurchaseOrderValidationError(
                    "Cannot submit a purchase order with zero line items."
                )

            po.status = PurchaseOrderStatus.SUBMITTED
            po.save(update_fields=["status", "updated_at"])
            return po

    @classmethod
    def cancel_order(
        cls,
        *,
        purchase_order: PurchaseOrder,
        actor,
        reason: str = "",
    ) -> PurchaseOrder:
        """
        Cancel a draft or unfulfilled purchase order.
        """
        with transaction.atomic():
            po = PurchaseOrder.objects.select_for_update().get(id=purchase_order.id)
            if not po.can_cancel():
                raise InvalidOrderStatusError(
                    f"Purchase order {po.order_reference} cannot be cancelled in status {po.status} "
                    f"or after receipts have been posted."
                )

            if po.status == PurchaseOrderStatus.DRAFT:
                po.delete()
                return None

            po.status = PurchaseOrderStatus.CANCELLED
            if reason:
                note_entry = f"Cancelled on {timezone.now().strftime('%Y-%m-%d %H:%M')}: {reason}"
                po.notes = f"{po.notes}\n{note_entry}".strip()
            po.save(update_fields=["status", "notes", "updated_at"])
            return po

    @classmethod
    def receive_delivery(
        cls,
        *,
        purchase_order: PurchaseOrder,
        location: Location,
        received_by,
        items_data: list[dict],
        supplier_delivery_ref: str = "",
        receipt_reference: str | None = None,
    ) -> Receipt:
        """
        Process incoming delivery intake:
        1. Validates order status is SUBMITTED or PARTIALLY_RECEIVED.
        2. Records line item intake (accepted and rejected quantities).
        3. Synchronously generates RECEIPT StockMovement and updates StockBalance.
        4. Updates PurchaseOrderItem received quantities and PO overall status.
        """
        if not items_data:
            raise PurchaseOrderValidationError("Delivery intake requires at least one item.")

        if not location.is_active:
            raise PurchaseOrderValidationError(
                f"Target location '{location.code}' is inactive and cannot receive stock."
            )

        with transaction.atomic():
            po = PurchaseOrder.objects.select_for_update().get(id=purchase_order.id)

            if po.status not in (
                PurchaseOrderStatus.SUBMITTED,
                PurchaseOrderStatus.PARTIALLY_RECEIVED,
            ):
                raise InvalidOrderStatusError(
                    f"Cannot receive items for purchase order in status '{po.status}'. "
                    f"Expected SUBMITTED or PARTIALLY_RECEIVED."
                )

            ref = receipt_reference or generate_receipt_reference()
            receipt = Receipt.objects.create(
                receipt_reference=ref,
                purchase_order=po,
                location=location,
                supplier_delivery_ref=supplier_delivery_ref,
                received_by=received_by,
                status=ReceiptStatus.POSTED,
            )

            total_accepted_in_receipt = Decimal("0.00")

            for item_data in items_data:
                po_item_id = item_data.get("po_item_id")
                try:
                    po_item = po.items.select_for_update().get(id=po_item_id)
                except (PurchaseOrderItem.DoesNotExist, ValueError) as err:
                    raise PurchaseOrderValidationError(
                        f"Item with ID '{po_item_id}' does not belong to purchase order {po.order_reference}."
                    ) from err

                accepted = Decimal(str(item_data.get("accepted_quantity", "0.00")))
                rejected = Decimal(str(item_data.get("rejected_quantity", "0.00")))
                notes = item_data.get("notes", "")

                if accepted < Decimal("0.00") or rejected < Decimal("0.00"):
                    raise PurchaseOrderValidationError("Intake quantities cannot be negative.")

                if accepted == Decimal("0.00") and rejected == Decimal("0.00"):
                    continue

                remaining = po_item.ordered_quantity - po_item.received_quantity
                if accepted > remaining:
                    raise OverReceiptError(
                        f"Accepted quantity {accepted} exceeds remaining ordered quantity {remaining} "
                        f"for SKU {po_item.product.sku}."
                    )

                ReceiptItem.objects.create(
                    receipt=receipt,
                    po_item=po_item,
                    accepted_quantity=accepted,
                    rejected_quantity=rejected,
                    notes=notes,
                )

                if accepted > Decimal("0.00"):
                    po_item.received_quantity += accepted
                    po_item.save(update_fields=["received_quantity"])
                    total_accepted_in_receipt += accepted

                    StockMovementService.record_movement(
                        product=po_item.product,
                        location=location,
                        movement_type=MovementType.RECEIPT,
                        quantity=accepted,
                        actor=received_by,
                        unit_cost=po_item.unit_cost,
                        reason=(
                            f"PO Receipt: {po.order_reference} "
                            f"(Delivery Ref: {supplier_delivery_ref or 'N/A'})"
                        ),
                        source_doc_type="RECEIPT",
                        source_doc_id=receipt.id,
                    )

            if total_accepted_in_receipt == Decimal("0.00") and not receipt.items.exists():
                raise PurchaseOrderValidationError(
                    "No items were accepted or rejected in this delivery intake."
                )

            # Evaluate PO status progression
            all_items = list(po.items.all())
            is_fully_received = all(
                item.received_quantity >= item.ordered_quantity for item in all_items
            )
            has_any_received = any(
                item.received_quantity > Decimal("0.00") for item in all_items
            )

            if is_fully_received:
                po.status = PurchaseOrderStatus.FULLY_RECEIVED
            elif has_any_received:
                po.status = PurchaseOrderStatus.PARTIALLY_RECEIVED

            po.save(update_fields=["status", "updated_at"])
            return receipt
