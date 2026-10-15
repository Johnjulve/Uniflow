"""
Data models for the authoritative inventory engine:
- Location: Physical or logical storage locations.
- StockMovement: Immutable append-only transaction ledger.
- StockBalance: Materialized projected cache of on-hand quantities.
"""
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel, UUIDModel


class Location(UUIDModel, TimeStampedModel):
    """
    Physical or logical storage location (warehouse, storeroom, bin).
    """
    code = models.CharField(
        max_length=32,
        unique=True,
        db_index=True,
        help_text="Unique location code (e.g. MAIN-WH, FRONT-STORE).",
    )
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Active status for stock movements and fulfillment.",
    )

    class Meta:
        db_table = "locations"
        verbose_name = "Location"
        verbose_name_plural = "Locations"
        ordering = ["code"]

    def __str__(self) -> str:
        return f"{self.code} - {self.name}"

    def clean(self):
        super().clean()
        if self.code:
            self.code = self.code.strip().upper()

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class MovementType(models.TextChoices):
    OPENING_BALANCE = "OPENING_BALANCE", "Opening Balance"
    RECEIPT = "RECEIPT", "Receipt"
    ISSUE = "ISSUE", "Issue"
    POSITIVE_ADJUSTMENT = "POSITIVE_ADJUSTMENT", "Positive Adjustment"
    NEGATIVE_ADJUSTMENT = "NEGATIVE_ADJUSTMENT", "Negative Adjustment"
    TRANSFER_OUT = "TRANSFER_OUT", "Transfer Out"
    TRANSFER_IN = "TRANSFER_IN", "Transfer In"
    REVERSAL = "REVERSAL", "Reversal"


class StockMovement(UUIDModel):
    """
    Immutable ledger of every inventory change.
    Never modified or deleted. Records signed delta (+/-).
    """
    movement_reference = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="Authoritative reference string (e.g. MOV-2026-000123).",
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    movement_type = models.CharField(
        max_length=32,
        choices=MovementType.choices,
        db_index=True,
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Signed delta (+ for increase, - for decrease).",
    )
    unit_cost = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        default=Decimal("0.0000"),
        help_text="Unit cost of item at the time of movement.",
    )
    source_doc_type = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        help_text="Originating document type (e.g. RECEIPT, ADJUSTMENT).",
    )
    source_doc_id = models.UUIDField(
        null=True,
        blank=True,
        help_text="UUID of originating transaction document.",
    )
    reason = models.CharField(
        max_length=255,
        help_text="Operational reason code or justification.",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="authored_movements",
        help_text="User who initiated or authorized this movement.",
    )
    reversal_of = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reversed_by",
        help_text="Target movement if this transaction is a compensating reversal.",
    )
    effective_at = models.DateTimeField(
        default=timezone.now,
        db_index=True,
        help_text="Business effective timestamp.",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="System timestamp when record was committed.",
    )

    class Meta:
        db_table = "stock_movements"
        verbose_name = "Stock Movement"
        verbose_name_plural = "Stock Movements"
        ordering = ["-effective_at", "-created_at"]

    def __str__(self) -> str:
        return f"{self.movement_reference} ({self.movement_type}): {self.quantity} x {self.product.sku}"

    def clean(self):
        super().clean()
        if self.quantity == Decimal("0.00"):
            raise ValidationError({"quantity": "Movement quantity cannot be zero."})

    def save(self, *args, **kwargs):
        # Strict immutability: existing records cannot be edited
        if self.pk and StockMovement.objects.filter(pk=self.pk).exists():
            raise ValidationError("Stock movements are strictly immutable and cannot be updated.")
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # Strict immutability: ledger records cannot be deleted
        raise ValidationError("Stock movements are strictly immutable and cannot be deleted.")


class StockBalance(UUIDModel):
    """
    Transactionally maintained projection of current on-hand stock per product and location.
    Provides O(1) query performance without recalculating the entire ledger history.
    """
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.CASCADE,
        related_name="stock_balances",
    )
    location = models.ForeignKey(
        Location,
        on_delete=models.CASCADE,
        related_name="stock_balances",
    )
    current_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Current physical on-hand stock quantity.",
    )
    last_movement = models.ForeignKey(
        StockMovement,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text="Most recent movement applied to this balance.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "stock_balances"
        verbose_name = "Stock Balance"
        verbose_name_plural = "Stock Balances"
        constraints = [
            models.UniqueConstraint(
                fields=["product", "location"],
                name="unique_product_location_balance",
            )
        ]
        ordering = ["product__name"]

    def __str__(self) -> str:
        return f"{self.product.sku} @ {self.location.code}: {self.current_quantity}"
