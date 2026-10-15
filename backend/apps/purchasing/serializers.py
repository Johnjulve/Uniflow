"""
Serializers for the purchasing domain: suppliers, purchase orders, and receipts.
"""
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from apps.catalog.models import Product
from apps.inventory.models import Location
from apps.purchasing.exceptions import PurchasingError
from apps.purchasing.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    Receipt,
    ReceiptItem,
    Supplier,
)
from apps.purchasing.services import (
    PurchaseOrderService,
    generate_po_reference,
)


class SupplierSerializer(serializers.ModelSerializer):
    """
    Serializer for vendor directory CRUD.
    """
    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "contact_name",
            "email",
            "phone",
            "address",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise serializers.ValidationError("Supplier name cannot be blank.")
        return trimmed


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    """
    Read serializer for individual purchase order items.
    """
    product_sku = serializers.ReadOnlyField(source="product.sku")
    product_name = serializers.ReadOnlyField(source="product.name")
    unit_of_measure = serializers.ReadOnlyField(source="product.unit_of_measure")

    class Meta:
        model = PurchaseOrderItem
        fields = [
            "id",
            "product",
            "product_sku",
            "product_name",
            "unit_of_measure",
            "ordered_quantity",
            "received_quantity",
            "unit_cost",
            "line_total",
        ]
        read_only_fields = [
            "id",
            "product_sku",
            "product_name",
            "unit_of_measure",
            "received_quantity",
            "line_total",
        ]


class PurchaseOrderCreateItemSerializer(serializers.Serializer):
    """
    Validation serializer for item input when creating a purchase order.
    """
    product_id = serializers.UUIDField()
    ordered_quantity = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    unit_cost = serializers.DecimalField(max_digits=14, decimal_places=4, min_value=Decimal("0.0000"))

    def validate_product_id(self, value):
        try:
            return Product.objects.get(id=value, is_active=True)
        except Product.DoesNotExist as err:
            raise serializers.ValidationError("Active product with this ID does not exist.") from err


class PurchaseOrderSerializer(serializers.ModelSerializer):
    """
    Full detail serializer for purchase orders including line items and vendor metadata.
    """
    supplier_name = serializers.ReadOnlyField(source="supplier.name")
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    created_by_name = serializers.ReadOnlyField(source="created_by.get_full_name")
    total_cost = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True)
    total_ordered_quantity = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_received_quantity = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    can_cancel = serializers.BooleanField(read_only=True)
    items = PurchaseOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "order_reference",
            "supplier",
            "supplier_name",
            "status",
            "status_display",
            "order_date",
            "expected_date",
            "notes",
            "created_by",
            "created_by_name",
            "total_cost",
            "total_ordered_quantity",
            "total_received_quantity",
            "can_cancel",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "order_reference",
            "status",
            "created_by",
            "total_cost",
            "total_ordered_quantity",
            "total_received_quantity",
            "can_cancel",
            "created_at",
            "updated_at",
        ]


class PurchaseOrderCreateSerializer(serializers.Serializer):
    """
    Serializer for creating a new purchase order with nested line items.
    """
    supplier_id = serializers.UUIDField()
    expected_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    items = PurchaseOrderCreateItemSerializer(many=True)

    def validate_supplier_id(self, value):
        try:
            return Supplier.objects.get(id=value, is_active=True)
        except Supplier.DoesNotExist as err:
            raise serializers.ValidationError("Active supplier with this ID does not exist.") from err

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Purchase order must include at least one item.")
        product_ids = [item["product_id"].id for item in value]
        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError("Duplicate products cannot be listed in the same purchase order.")
        return value

    def create(self, validated_data) -> PurchaseOrder:
        supplier = validated_data["supplier_id"]
        expected_date = validated_data.get("expected_date")
        notes = validated_data.get("notes", "")
        items_data = validated_data["items"]
        user = self.context["request"].user

        with transaction.atomic():
            po = PurchaseOrder.objects.create(
                order_reference=generate_po_reference(),
                supplier=supplier,
                expected_date=expected_date,
                notes=notes,
                created_by=user,
            )
            for item in items_data:
                PurchaseOrderItem.objects.create(
                    purchase_order=po,
                    product=item["product_id"],
                    ordered_quantity=item["ordered_quantity"],
                    unit_cost=item["unit_cost"],
                )
            return po


class ReceiptItemSerializer(serializers.ModelSerializer):
    """
    Detail serializer for items within an intake receipt.
    """
    product_sku = serializers.ReadOnlyField(source="po_item.product.sku")
    product_name = serializers.ReadOnlyField(source="po_item.product.name")

    class Meta:
        model = ReceiptItem
        fields = [
            "id",
            "po_item",
            "product_sku",
            "product_name",
            "accepted_quantity",
            "rejected_quantity",
            "notes",
        ]
        read_only_fields = ["id", "product_sku", "product_name"]


class ReceiptSerializer(serializers.ModelSerializer):
    """
    Read serializer for delivery intake receipts.
    """
    order_reference = serializers.ReadOnlyField(source="purchase_order.order_reference")
    supplier_name = serializers.ReadOnlyField(source="purchase_order.supplier.name")
    location_code = serializers.ReadOnlyField(source="location.code")
    location_name = serializers.ReadOnlyField(source="location.name")
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    received_by_name = serializers.ReadOnlyField(source="received_by.get_full_name")
    items = ReceiptItemSerializer(many=True, read_only=True)

    class Meta:
        model = Receipt
        fields = [
            "id",
            "receipt_reference",
            "purchase_order",
            "order_reference",
            "supplier_name",
            "location",
            "location_code",
            "location_name",
            "status",
            "status_display",
            "supplier_delivery_ref",
            "received_by",
            "received_by_name",
            "received_at",
            "items",
            "created_at",
        ]
        read_only_fields = fields


class ReceiptCreateItemSerializer(serializers.Serializer):
    """
    Validation serializer for line-item quantities in an intake receipt payload.
    """
    po_item_id = serializers.UUIDField()
    accepted_quantity = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00")
    )
    rejected_quantity = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00"), default=Decimal("0.00")
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ReceiptCreateSerializer(serializers.Serializer):
    """
    Intake receiving payload serializer dispatching to PurchaseOrderService.
    """
    purchase_order_id = serializers.UUIDField()
    location_id = serializers.UUIDField()
    supplier_delivery_ref = serializers.CharField(required=False, allow_blank=True, default="")
    receipt_reference = serializers.CharField(required=False, allow_blank=True, default="")
    items = ReceiptCreateItemSerializer(many=True)

    def validate_purchase_order_id(self, value):
        try:
            return PurchaseOrder.objects.get(id=value)
        except PurchaseOrder.DoesNotExist as err:
            raise serializers.ValidationError("Purchase order with this ID does not exist.") from err

    def validate_location_id(self, value):
        try:
            return Location.objects.get(id=value, is_active=True)
        except Location.DoesNotExist as err:
            raise serializers.ValidationError("Active location with this ID does not exist.") from err

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Intake receipt must contain at least one item.")
        return value

    def create(self, validated_data) -> Receipt:
        po = validated_data["purchase_order_id"]
        location = validated_data["location_id"]
        supplier_delivery_ref = validated_data.get("supplier_delivery_ref", "")
        receipt_ref = validated_data.get("receipt_reference") or None
        items_data = validated_data["items"]
        user = self.context["request"].user

        try:
            return PurchaseOrderService.receive_delivery(
                purchase_order=po,
                location=location,
                received_by=user,
                items_data=items_data,
                supplier_delivery_ref=supplier_delivery_ref,
                receipt_reference=receipt_ref,
            )
        except PurchasingError as err:
            raise serializers.ValidationError(str(err)) from err
