"""
Domain synchronization service: handles batch ingestion of client offline outbox
operations with absolute idempotency and incremental delta pulls.
"""
import uuid
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.catalog.models import Product
from apps.common.models import SyncMetadata, SyncOperationStatus
from apps.inventory.exceptions import InventoryError
from apps.inventory.models import Location
from apps.inventory.services import StockMovementService
from apps.purchasing.exceptions import PurchasingError
from apps.purchasing.models import PurchaseOrder, Supplier
from apps.purchasing.services import PurchaseOrderService


class SyncService:
    """
    Authoritative server service for offline mutation replay and delta synchronization.
    """

    @classmethod
    def process_operation(cls, *, operation: dict, actor) -> dict:
        """
        Process a single queued client operation with idempotency enforcement.
        """
        raw_op_id = operation.get("client_operation_id")
        if not raw_op_id:
            return {
                "client_operation_id": None,
                "status": "REJECTED",
                "error": "Missing client_operation_id in operation payload.",
                "idempotent_replay": False,
            }

        try:
            op_id = uuid.UUID(str(raw_op_id))
        except ValueError:
            return {
                "client_operation_id": raw_op_id,
                "status": "REJECTED",
                "error": "client_operation_id must be a valid UUIDv4 string.",
                "idempotent_replay": False,
            }

        op_type = operation.get("operation_type", "").upper()
        payload = operation.get("payload", {})

        # 1. Idempotency check: if already processed, return cached outcome
        existing = SyncMetadata.objects.filter(client_operation_id=op_id).first()
        if existing:
            return {
                "client_operation_id": str(op_id),
                "operation_type": existing.operation_type,
                "status": existing.status,
                "result": existing.response_payload if existing.status == SyncOperationStatus.COMMITTED else None,
                "error": existing.error_message if existing.status == SyncOperationStatus.REJECTED else None,
                "idempotent_replay": True,
            }

        # 2. First-time execution inside atomic transaction
        try:
            with transaction.atomic():
                result_payload = cls._dispatch_operation(op_type=op_type, payload=payload, actor=actor)

                SyncMetadata.objects.create(
                    client_operation_id=op_id,
                    actor=actor,
                    operation_type=op_type,
                    status=SyncOperationStatus.COMMITTED,
                    response_payload=result_payload,
                )

                return {
                    "client_operation_id": str(op_id),
                    "operation_type": op_type,
                    "status": "COMMITTED",
                    "result": result_payload,
                    "error": None,
                    "idempotent_replay": False,
                }
        except (InventoryError, PurchasingError, ValidationError, ValueError, KeyError) as err:
            err_msg = str(err)
            # Record explicit rejection so future duplicate retries return identical failure
            SyncMetadata.objects.create(
                client_operation_id=op_id,
                actor=actor,
                operation_type=op_type,
                status=SyncOperationStatus.REJECTED,
                error_message=err_msg,
            )
            return {
                "client_operation_id": str(op_id),
                "operation_type": op_type,
                "status": "REJECTED",
                "result": None,
                "error": err_msg,
                "idempotent_replay": False,
            }

    @classmethod
    def _dispatch_operation(cls, *, op_type: str, payload: dict, actor) -> dict:
        """
        Route typed business operation to the authoritative domain service.
        """
        if op_type == "STOCK_ADJUSTMENT":
            product_id = payload["product"]
            location_id = payload["location"]
            counted_qty = Decimal(str(payload["counted_quantity"]))
            reason = payload.get("reason", "Offline stock adjustment")

            product = Product.objects.get(id=product_id)
            location = Location.objects.get(id=location_id)

            movement = StockMovementService.adjust_stock(
                product=product,
                location=location,
                counted_quantity=counted_qty,
                actor=actor,
                reason=reason,
            )
            return {
                "movement_reference": movement.movement_reference,
                "movement_type": movement.movement_type,
                "quantity": str(movement.quantity),
            }

        elif op_type == "CREATE_SUPPLIER":
            supplier = Supplier.objects.create(
                name=payload["name"],
                contact_name=payload.get("contact_name", ""),
                email=payload.get("email", ""),
                phone=payload.get("phone", ""),
                address=payload.get("address", ""),
                is_active=payload.get("is_active", True),
            )
            return {
                "id": str(supplier.id),
                "name": supplier.name,
                "is_active": supplier.is_active,
            }

        elif op_type == "POST_RECEIPT":
            po_id = payload["purchase_order_id"]
            location_id = payload["location_id"]
            supplier_delivery_ref = payload.get("supplier_delivery_ref", "")
            items_data = payload.get("items", [])

            po = PurchaseOrder.objects.get(id=po_id)
            location = Location.objects.get(id=location_id)

            receipt = PurchaseOrderService.receive_delivery(
                purchase_order=po,
                location=location,
                received_by=actor,
                items_data=items_data,
                supplier_delivery_ref=supplier_delivery_ref,
            )
            return {
                "receipt_reference": receipt.receipt_reference,
                "status": receipt.status,
                "purchase_order_status": po.status,
            }

        else:
            raise ValidationError(f"Unsupported operation type '{op_type}'.")

    @classmethod
    def process_batch(cls, *, operations: list[dict], actor) -> list[dict]:
        """
        Process a list of client offline outbox operations sequentially.
        """
        results = []
        for op in operations:
            res = cls.process_operation(operation=op, actor=actor)
            results.append(res)
        return results
