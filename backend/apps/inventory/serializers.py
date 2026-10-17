"""
Serializers for inventory balances, movements, locations, and adjustments.
"""

from decimal import Decimal

from rest_framework import serializers

from apps.catalog.models import Product
from apps.inventory.models import Location, StockBalance, StockMovement


class LocationSerializer(serializers.ModelSerializer):
    """
    Serializer for storage location management.
    """

    class Meta:
        model = Location
        fields = [
            "id",
            "code",
            "name",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_code(self, value: str) -> str:
        trimmed = value.strip().upper()
        if not trimmed:
            raise serializers.ValidationError("Location code cannot be blank.")
        instance = getattr(self, "instance", None)
        existing = Location.objects.filter(code__iexact=trimmed)
        if instance:
            existing = existing.exclude(id=instance.id)
        if existing.exists():
            raise serializers.ValidationError("A location with this code already exists.")
        return trimmed


class StockBalanceSerializer(serializers.ModelSerializer):
    """
    Projected stock balance serializer with product and location metadata.
    """

    product_sku = serializers.ReadOnlyField(source="product.sku")
    product_name = serializers.ReadOnlyField(source="product.name")
    product_is_active = serializers.ReadOnlyField(source="product.is_active")
    category_name = serializers.ReadOnlyField(source="product.category.name", default=None)
    reorder_threshold = serializers.ReadOnlyField(source="product.reorder_threshold")
    unit_of_measure = serializers.ReadOnlyField(source="product.unit_of_measure")
    location_code = serializers.ReadOnlyField(source="location.code")
    location_name = serializers.ReadOnlyField(source="location.name")
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = StockBalance
        fields = [
            "id",
            "product",
            "product_sku",
            "product_name",
            "product_is_active",
            "category_name",
            "unit_of_measure",
            "location",
            "location_code",
            "location_name",
            "current_quantity",
            "reorder_threshold",
            "is_low_stock",
            "updated_at",
        ]
        read_only_fields = fields

    def get_is_low_stock(self, obj: StockBalance) -> bool:
        threshold = obj.product.reorder_threshold
        if threshold and threshold > Decimal("0.00"):
            return obj.current_quantity <= threshold
        return False


class StockMovementSerializer(serializers.ModelSerializer):
    """
    Immutable stock movement ledger serializer.
    """

    product_sku = serializers.ReadOnlyField(source="product.sku")
    product_name = serializers.ReadOnlyField(source="product.name")
    location_code = serializers.ReadOnlyField(source="location.code")
    location_name = serializers.ReadOnlyField(source="location.name")
    movement_type_display = serializers.CharField(
        source="get_movement_type_display", read_only=True
    )
    actor_name = serializers.ReadOnlyField(source="actor.username")

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "movement_reference",
            "product",
            "product_sku",
            "product_name",
            "location",
            "location_code",
            "location_name",
            "movement_type",
            "movement_type_display",
            "quantity",
            "unit_cost",
            "reason",
            "actor",
            "actor_name",
            "effective_at",
            "created_at",
        ]
        read_only_fields = fields


class StockAdjustmentRequestSerializer(serializers.Serializer):
    """
    Payload for physical cycle count stock adjustments.
    """

    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(archived_at__isnull=True)
    )
    location = serializers.PrimaryKeyRelatedField(queryset=Location.objects.filter(is_active=True))
    counted_quantity = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00")
    )
    reason = serializers.CharField(required=True, max_length=255, trim_whitespace=True)


class StockAdjustmentResponseSerializer(serializers.Serializer):
    """
    Response returned after recording a cycle count adjustment.
    """

    movement = StockMovementSerializer()
    balance = StockBalanceSerializer()
