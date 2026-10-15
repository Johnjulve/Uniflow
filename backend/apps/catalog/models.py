"""
Data models for the product catalog domain (Category, Product).
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from apps.common.models import TimeStampedModel, UUIDModel


class Category(UUIDModel, TimeStampedModel):
    """
    Hierarchical categorization for products.
    Supports subcategories through self-referential parent key.
    """
    name = models.CharField(max_length=128, db_index=True)
    slug = models.SlugField(max_length=160, unique=True, db_index=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
        help_text="Optional parent category for hierarchical grouping.",
    )
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "categories"
        verbose_name = "Category"
        verbose_name_plural = "Categories"
        ordering = ["name"]

    def __str__(self) -> str:
        if self.parent:
            return f"{self.parent} > {self.name}"
        return self.name

    def clean(self):
        super().clean()
        if self.parent_id and self.parent_id == self.id:
            raise ValidationError({"parent": "A category cannot be its own parent."})

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        self.full_clean()
        super().save(*args, **kwargs)


class Product(UUIDModel, TimeStampedModel):
    """
    Master record representing an inventory item.
    Enforces unique SKU, decimal pricing, reorder thresholds, and safe archival lifecycle.
    """
    sku = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="Stock Keeping Unit (case-insensitive uniqueness enforced).",
    )
    barcode = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Optional unique barcode (EAN-13, UPC-A, Code 128).",
    )
    name = models.CharField(max_length=255, db_index=True)
    description = models.TextField(blank=True, default="")
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="products",
        help_text="Associated product category.",
    )
    unit_of_measure = models.CharField(
        max_length=32,
        default="unit",
        help_text="Unit of measure (e.g. unit, box, kg, liter).",
    )
    purchase_cost = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        default=Decimal("0.0000"),
        help_text="Baseline purchase or replacement cost per unit.",
    )
    selling_price = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        default=Decimal("0.0000"),
        help_text="Default sales price per unit.",
    )
    reorder_threshold = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Minimum stock level before generating reorder warnings.",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Active for business transactions and purchasing.",
    )
    archived_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Timestamp of archival. Products with historical movements are archived, never deleted.",
    )

    class Meta:
        db_table = "products"
        verbose_name = "Product"
        verbose_name_plural = "Products"
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.sku} - {self.name}"

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None

    def clean(self):
        super().clean()
        if self.sku:
            self.sku = self.sku.strip()

        if self.purchase_cost is not None and self.purchase_cost < Decimal("0"):
            raise ValidationError({"purchase_cost": "Purchase cost cannot be negative."})

        if self.selling_price is not None and self.selling_price < Decimal("0"):
            raise ValidationError({"selling_price": "Selling price cannot be negative."})

        if self.reorder_threshold is not None and self.reorder_threshold < Decimal("0"):
            raise ValidationError({"reorder_threshold": "Reorder threshold cannot be negative."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def archive(self):
        """Soft-archive the product, deactivating it without breaking transaction history."""
        self.archived_at = timezone.now()
        self.is_active = False
        self.save(update_fields=["archived_at", "is_active", "updated_at"])

    def unarchive(self):
        """Restore an archived product to active status."""
        self.archived_at = None
        self.is_active = True
        self.save(update_fields=["archived_at", "is_active", "updated_at"])
