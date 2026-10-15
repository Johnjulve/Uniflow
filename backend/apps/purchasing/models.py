"""
Data models for the purchasing and supplier domain:
- Supplier: Vendor registry.
- PurchaseOrder: Formal procurement orders.
- PurchaseOrderItem: Ordered product line items with unit costs.
- Receipt: Intake delivery notes.
- ReceiptItem: Line-item intake quantities.
"""
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel, UUIDModel


class Supplier(UUIDModel, TimeStampedModel):
    """
    Vendor record for procuring products and raw materials.
    """
    name = models.CharField(max_length=255, db_index=True)
    contact_name = models.CharField(max_length=128, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=32, blank=True, default="")
    address = models.TextField(blank=True, default="")
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Active vendor status for placing purchase orders.",
    )

    class Meta:
        db_table = "suppliers"
        verbose_name = "Supplier"
        verbose_name_plural = "Suppliers"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class PurchaseOrderStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    SUBMITTED = "SUBMITTED", "Submitted"
    PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED", "Partially Received"
    FULLY_RECEIVED = "FULLY_RECEIVED", "Fully Received"
    CANCELLED = "CANCELLED", "Cancelled"


class PurchaseOrder(UUIDModel, TimeStampedModel):
    """
    Formal procurement order placed with a supplier.
    """
    order_reference = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="Unique purchase order reference (e.g. PO-2026-00045).",
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="purchase_orders",
    )
    status = models.CharField(
        max_length=32,
        choices=PurchaseOrderStatus.choices,
        default=PurchaseOrderStatus.DRAFT,
        db_index=True,
    )
    order_date = models.DateField(default=timezone.localdate)
    expected_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="authored_purchase_orders",
    )

    class Meta:
        db_table = "purchase_orders"
        verbose_name = "Purchase Order"
        verbose_name_plural = "Purchase Orders"
        ordering = ["-order_date", "-created_at"]

    def __str__(self) -> str:
        return f"{self.order_reference} ({self.get_status_display()}) - {self.supplier.name}"

    @property
    def total_cost(self) -> Decimal:
        return sum((item.line_total for item in self.items.all()), Decimal("0.0000"))

    @property
    def total_ordered_quantity(self) -> Decimal:
        return sum((item.ordered_quantity for item in self.items.all()), Decimal("0.00"))

    @property
    def total_received_quantity(self) -> Decimal:
        return sum((item.received_quantity for item in self.items.all()), Decimal("0.00"))

    def can_cancel(self) -> bool:
        """Can only cancel if no receipts have been posted against this order."""
        return self.status in (PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.SUBMITTED) and not self.receipts.exists()


class PurchaseOrderItem(UUIDModel):
    """
    Individual line item in a purchase order.
    """
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="po_items",
    )
    ordered_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Quantity ordered from vendor.",
    )
    received_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Accumulated quantity accepted into stock across all receipts.",
    )
    unit_cost = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        help_text="Agreed unit cost at purchase time.",
    )
    line_total = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        help_text="Computed: ordered_quantity * unit_cost.",
    )

    class Meta:
        db_table = "purchase_order_items"
        verbose_name = "Purchase Order Item"
        verbose_name_plural = "Purchase Order Items"
        constraints = [
            models.UniqueConstraint(
                fields=["purchase_order", "product"],
                name="unique_po_product_item",
            )
        ]

    def __str__(self) -> str:
        return f"{self.product.sku}: {self.ordered_quantity} @ {self.unit_cost}"

    def clean(self):
        super().clean()
        if self.ordered_quantity is not None and self.ordered_quantity <= Decimal("0.00"):
            raise ValidationError({"ordered_quantity": "Ordered quantity must be greater than zero."})
        if self.unit_cost is not None and self.unit_cost < Decimal("0.00"):
            raise ValidationError({"unit_cost": "Unit cost cannot be negative."})

    def save(self, *args, **kwargs):
        if self.ordered_quantity and self.unit_cost:
            self.line_total = (self.ordered_quantity * self.unit_cost).quantize(Decimal("0.0001"))
        self.full_clean()
        super().save(*args, **kwargs)


class ReceiptStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class Receipt(UUIDModel, TimeStampedModel):
    """
    Intake delivery note representing goods received into a warehouse against a purchase order.
    """
    receipt_reference = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="Delivery intake reference (e.g. REC-2026-00089).",
    )
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.PROTECT,
        related_name="receipts",
    )
    location = models.ForeignKey(
        "inventory.Location",
        on_delete=models.PROTECT,
        related_name="receipts",
        help_text="Target warehouse location where accepted items are shelved.",
    )
    status = models.CharField(
        max_length=32,
        choices=ReceiptStatus.choices,
        default=ReceiptStatus.POSTED,
        db_index=True,
    )
    supplier_delivery_ref = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="Supplier's waybill, bill of lading, or invoice number.",
    )
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="received_receipts",
    )
    received_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "receipts"
        verbose_name = "Receipt"
        verbose_name_plural = "Receipts"
        ordering = ["-received_at", "-created_at"]

    def __str__(self) -> str:
        return f"{self.receipt_reference} ({self.get_status_display()}) - PO: {self.purchase_order.order_reference}"


class ReceiptItem(UUIDModel):
    """
    Individual line item in an intake receipt.
    """
    receipt = models.ForeignKey(
        Receipt,
        on_delete=models.CASCADE,
        related_name="items",
    )
    po_item = models.ForeignKey(
        PurchaseOrderItem,
        on_delete=models.PROTECT,
        related_name="receipt_items",
    )
    accepted_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Quantity accepted into active warehouse stock.",
    )
    rejected_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Damaged or rejected quantity.",
    )
    notes = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "receipt_items"
        verbose_name = "Receipt Item"
        verbose_name_plural = "Receipt Items"

    def __str__(self) -> str:
        return f"{self.po_item.product.sku}: Accepted {self.accepted_quantity}, Rejected {self.rejected_quantity}"

    def clean(self):
        super().clean()
        if self.accepted_quantity is not None and self.accepted_quantity < Decimal("0.00"):
            raise ValidationError({"accepted_quantity": "Accepted quantity cannot be negative."})
        if self.rejected_quantity is not None and self.rejected_quantity < Decimal("0.00"):
            raise ValidationError({"rejected_quantity": "Rejected quantity cannot be negative."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
