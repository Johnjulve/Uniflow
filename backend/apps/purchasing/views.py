"""
REST API ViewSets for suppliers, purchase orders, and intake receipts.
"""
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.accounts.permissions import CanManageStock, IsInventoryManagerRole, IsReadOnlyViewer
from apps.purchasing.exceptions import PurchasingError
from apps.purchasing.models import PurchaseOrder, PurchaseOrderStatus, Receipt, Supplier
from apps.purchasing.serializers import (
    PurchaseOrderCreateSerializer,
    PurchaseOrderSerializer,
    ReceiptCreateSerializer,
    ReceiptSerializer,
    SupplierSerializer,
)
from apps.purchasing.services import PurchaseOrderService


@extend_schema_view(
    list=extend_schema(summary="List suppliers with optional search and active filtering"),
    create=extend_schema(summary="Register a new vendor supplier"),
    retrieve=extend_schema(summary="Retrieve supplier details"),
    update=extend_schema(summary="Update supplier contact information"),
    destroy=extend_schema(summary="Deactivate or delete supplier"),
)
class SupplierViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for vendor directory management.
    """
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsInventoryManagerRole | IsReadOnlyViewer]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name", "contact_name", "email", "phone"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]


@extend_schema_view(
    list=extend_schema(summary="List purchase orders with status filtering"),
    retrieve=extend_schema(summary="Retrieve full purchase order with line items"),
    create=extend_schema(summary="Create a new draft purchase order with line items"),
)
class PurchaseOrderViewSet(viewsets.ModelViewSet):
    """
    Purchase order lifecycle endpoints (creation, submission, cancellation).
    """
    queryset = (
        PurchaseOrder.objects.select_related("supplier", "created_by")
        .prefetch_related("items__product")
        .all()
    )
    permission_classes = [CanManageStock | IsReadOnlyViewer]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "supplier"]
    search_fields = ["order_reference", "supplier__name", "notes"]
    ordering_fields = ["order_date", "created_at", "total_cost"]
    ordering = ["-order_date", "-created_at"]

    def get_serializer_class(self):
        if self.action == "create":
            return PurchaseOrderCreateSerializer
        return PurchaseOrderSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        po = serializer.save()
        output_serializer = PurchaseOrderSerializer(po, context={"request": request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(summary="Submit a draft purchase order to vendor", responses={200: PurchaseOrderSerializer})
    @action(detail=True, methods=["post"], permission_classes=[CanManageStock])
    def submit(self, request, pk=None):
        po = self.get_object()
        try:
            submitted_po = PurchaseOrderService.submit_order(purchase_order=po, actor=request.user)
            return Response(PurchaseOrderSerializer(submitted_po).data)
        except PurchasingError as err:
            return Response({"error": {"code": "VALIDATION_ERROR", "message": str(err)}}, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(summary="Cancel an unfulfilled purchase order", responses={200: PurchaseOrderSerializer})
    @action(detail=True, methods=["post"], permission_classes=[CanManageStock])
    def cancel(self, request, pk=None):
        po = self.get_object()
        reason = request.data.get("reason", "")
        try:
            cancelled_po = PurchaseOrderService.cancel_order(
                purchase_order=po, actor=request.user, reason=reason
            )
            if cancelled_po is None:
                return Response(
                    {"status": "DISCARDED", "detail": "Draft purchase order discarded successfully."},
                    status=status.HTTP_200_OK,
                )
            return Response(PurchaseOrderSerializer(cancelled_po).data)
        except PurchasingError as err:
            return Response({"error": {"code": "VALIDATION_ERROR", "message": str(err)}}, status=status.HTTP_400_BAD_REQUEST)

    def perform_destroy(self, instance):
        if instance.status != PurchaseOrderStatus.DRAFT:
            raise ValidationError({"detail": "Only draft purchase orders can be deleted."})
        instance.delete()


@extend_schema_view(
    list=extend_schema(summary="List delivery intake receipts"),
    retrieve=extend_schema(summary="Retrieve intake receipt with line item quantities"),
    create=extend_schema(summary="Post delivery intake receipt and synchronize inventory"),
)
class ReceiptViewSet(viewsets.ModelViewSet):
    """
    Intake receiving endpoints generating stock movements.
    """
    queryset = (
        Receipt.objects.select_related("purchase_order__supplier", "location", "received_by")
        .prefetch_related("items__po_item__product")
        .all()
    )
    permission_classes = [CanManageStock | IsReadOnlyViewer]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "purchase_order", "location"]
    search_fields = ["receipt_reference", "supplier_delivery_ref", "purchase_order__order_reference"]
    ordering_fields = ["received_at", "created_at"]
    ordering = ["-received_at", "-created_at"]

    def get_serializer_class(self):
        if self.action == "create":
            return ReceiptCreateSerializer
        return ReceiptSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        receipt = serializer.save()
        output_serializer = ReceiptSerializer(receipt, context={"request": request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)
