"""
Serializers for the catalog domain (Category, Product).
"""

from decimal import Decimal

from django.db import IntegrityError
from django.db.models import Sum
from django.utils.text import slugify
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import Category, Product


class CategorySerializer(serializers.ModelSerializer):
    """
    Serializer for category records with parent category label and product counts.
    """

    parent_name = serializers.ReadOnlyField(source="parent.name", default=None)
    products_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "slug",
            "parent",
            "parent_name",
            "description",
            "is_active",
            "products_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "slug",
            "parent_name",
            "products_count",
            "created_at",
            "updated_at",
        ]

    def get_products_count(self, obj: Category) -> int:
        annotated = getattr(obj, "annotated_products_count", None)
        if annotated is not None:
            return int(annotated)
        return obj.products.count()

    def validate_name(self, value: str) -> str:
        trimmed = value.strip()
        slug_candidate = slugify(trimmed)
        if not trimmed or not slug_candidate:
            raise serializers.ValidationError("Category name must contain valid alphanumeric characters.")
        instance = getattr(self, "instance", None)
        existing = Category.objects.filter(name__iexact=trimmed) | Category.objects.filter(slug=slug_candidate)
        if instance:
            existing = existing.exclude(id=instance.id)
        if existing.exists():
            raise serializers.ValidationError("A category with this name already exists.")
        return trimmed

    def create(self, validated_data: dict) -> Category:
        try:
            return super().create(validated_data)
        except IntegrityError as exc:
            raise serializers.ValidationError(
                {"name": "A category with this name already exists."}
            ) from exc


class CategoryTreeSerializer(serializers.ModelSerializer):
    """
    Hierarchical category serializer with nested children.
    """

    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "is_active",
            "children",
        ]

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_children(self, obj: Category):
        active_children = obj.children.filter(is_active=True)
        return CategoryTreeSerializer(active_children, many=True).data


class ProductSerializer(serializers.ModelSerializer):
    """
    Full serializer for Product CRUD operations.
    """

    category_name = serializers.ReadOnlyField(source="category.name", default=None)
    is_archived = serializers.BooleanField(read_only=True)
    total_on_hand = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "sku",
            "barcode",
            "name",
            "description",
            "category",
            "category_name",
            "unit_of_measure",
            "purchase_cost",
            "selling_price",
            "reorder_threshold",
            "total_on_hand",
            "is_active",
            "is_archived",
            "archived_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "category_name",
            "total_on_hand",
            "is_archived",
            "archived_at",
            "created_at",
            "updated_at",
        ]

    def get_total_on_hand(self, obj: Product) -> str:
        annotated = getattr(obj, "annotated_total_on_hand", None)
        if annotated is not None:
            return str(annotated)
        total = obj.stock_balances.aggregate(total=Sum("current_quantity"))["total"]
        return str(total or Decimal("0.00"))

    def validate_sku(self, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise serializers.ValidationError("SKU cannot be blank.")
        instance = getattr(self, "instance", None)
        existing = Product.objects.filter(sku__iexact=trimmed)
        if instance:
            existing = existing.exclude(id=instance.id)
        if existing.exists():
            raise serializers.ValidationError("A product with this SKU already exists.")
        return trimmed

    def validate_barcode(self, value: str | None) -> str | None:
        if not value:
            return None
        trimmed = value.strip()
        instance = getattr(self, "instance", None)
        existing = Product.objects.filter(barcode__iexact=trimmed)
        if instance:
            existing = existing.exclude(id=instance.id)
        if existing.exists():
            raise serializers.ValidationError("A product with this barcode already exists.")
        return trimmed
