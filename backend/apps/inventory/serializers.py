"""
Serializers for inventory balances, movements, locations, and adjustments.
"""

from decimal import Decimal

from rest_framework import serializers

from apps.catalog.models import Product
from apps.inventory.models import (
    AdjustmentReasonCategory,
    Location,
    StockBalance,
    StockMovement,
)


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
    purchase_cost = serializers.ReadOnlyField(source="product.purchase_cost")
    selling_price = serializers.ReadOnlyField(source="product.selling_price")
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
            "purchase_cost",
            "selling_price",
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
    reason_category = serializers.ChoiceField(
        choices=AdjustmentReasonCategory.choices,
        default=AdjustmentReasonCategory.AUDIT,
        required=False,
    )
    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=255,
        trim_whitespace=True,
    )

    def validate(self, attrs):
        category = attrs.get("reason_category", AdjustmentReasonCategory.AUDIT)
        reason = (attrs.get("reason") or "").strip()
        if category == AdjustmentReasonCategory.OTHER and not reason:
            raise serializers.ValidationError(
                {"reason": "Justification reason is required when category is 'Other'."}
            )
        return attrs


class StockAdjustmentResponseSerializer(serializers.Serializer):
    """
    Response returned after recording a cycle count adjustment.
    """

    movement = StockMovementSerializer()
    balance = StockBalanceSerializer()


class StockTransferRequestSerializer(serializers.Serializer):
    """
    Payload for inter-warehouse stock transfers.
    """

    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(archived_at__isnull=True)
    )
    source_location = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.filter(is_active=True)
    )
    destination_location = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.filter(is_active=True)
    )
    quantity = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01")
    )
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255, trim_whitespace=True)

    def validate(self, attrs):
        if attrs["source_location"].id == attrs["destination_location"].id:
            raise serializers.ValidationError(
                {"destination_location": "Source and destination locations must be different."}
            )
        return attrs


class StockTransferResponseSerializer(serializers.Serializer):
    """
    Response returned after recording an inter-warehouse transfer.
    """

    movement_out = StockMovementSerializer()
    movement_in = StockMovementSerializer()
    source_balance = StockBalanceSerializer()
    destination_balance = StockBalanceSerializer()
