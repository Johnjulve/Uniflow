"""
REST API ViewSets and Views for the inventory domain:
- LocationViewSet: Physical warehouse/location CRUD.
- StockBalanceViewSet: Read-only projection queries with low-stock filtering.
- StockMovementViewSet: Read-only audit trail of immutable ledger transactions.
- StockAdjustmentView: Cycle count discrepancy adjustment endpoint.
"""
from decimal import Decimal

from django.db.models import F
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import CanManageStock, IsManagerOrReadOnly
from apps.inventory.exceptions import InventoryError
from apps.inventory.models import Location, StockBalance, StockMovement
from apps.inventory.serializers import (
    LocationSerializer,
    StockAdjustmentRequestSerializer,
    StockAdjustmentResponseSerializer,
    StockBalanceSerializer,
    StockMovementSerializer,
)
from apps.inventory.services import StockMovementService


@extend_schema_view(
    list=extend_schema(description="List storage locations.", tags=["Inventory"]),
    retrieve=extend_schema(description="Retrieve location details.", tags=["Inventory"]),
    create=extend_schema(description="Create a new storage location.", tags=["Inventory"]),
    update=extend_schema(description="Update location details.", tags=["Inventory"]),
    partial_update=extend_schema(description="Partially update location details.", tags=["Inventory"]),
    destroy=extend_schema(description="Delete an empty location.", tags=["Inventory"]),
)
class LocationViewSet(viewsets.ModelViewSet):
    """
    CRUD viewset for warehouse locations.
    """
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [IsManagerOrReadOnly]
    search_fields = ["code", "name"]
    filterset_fields = ["is_active"]
    ordering_fields = ["code", "name", "created_at"]
    ordering = ["code"]


@extend_schema_view(
    list=extend_schema(
        description="Query projected stock balances with search and low-stock filtering.",
        parameters=[
            OpenApiParameter(
                name="low_stock",
                type=bool,
                location=OpenApiParameter.QUERY,
                description="Filter items at or below reorder threshold (defaults to false).",
            ),
        ],
        tags=["Inventory"],
    ),
    retrieve=extend_schema(description="Retrieve single stock balance record.", tags=["Inventory"]),
)
class StockBalanceViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only viewset for materialized stock balance projections.
    Direct modification of balances is strictly prohibited.
    """
    queryset = StockBalance.objects.all().select_related("product", "location", "product__category")
    serializer_class = StockBalanceSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ["product__sku", "product__name", "location__code", "location__name"]
    filterset_fields = ["location", "product"]
    ordering_fields = ["current_quantity", "updated_at"]
    ordering = ["product__name"]

    def get_queryset(self):
        qs = super().get_queryset()
        low_stock = self.request.query_params.get("low_stock", "").lower() in ("true", "1", "yes")
        if low_stock:
            qs = qs.filter(
                product__reorder_threshold__gt=Decimal("0.00"),
                current_quantity__lte=F("product__reorder_threshold"),
            )
        return qs


@extend_schema_view(
    list=extend_schema(description="Query paginated immutable stock movement ledger records.", tags=["Inventory"]),
    retrieve=extend_schema(description="Retrieve single movement ledger entry.", tags=["Inventory"]),
)
class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only audit trail for immutable stock movements.
    """
    queryset = StockMovement.objects.all().select_related("product", "location", "actor")
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ["movement_reference", "product__sku", "product__name", "reason"]
    filterset_fields = ["location", "product", "movement_type"]
    ordering_fields = ["effective_at", "created_at", "quantity"]
    ordering = ["-effective_at", "-created_at"]


class StockAdjustmentView(APIView):
    """
    Record a physical cycle count adjustment to align projected balance with counted inventory.
    """
    permission_classes = [CanManageStock]

    @extend_schema(
        request=StockAdjustmentRequestSerializer,
        responses={
            status.HTTP_201_CREATED: StockAdjustmentResponseSerializer,
            status.HTTP_400_BAD_REQUEST: OpenApiResponse(description="Invalid counted quantity or identical count"),
        },
        description="Records a positive or negative adjustment movement based on physical count.",
        tags=["Inventory"],
    )
    def post(self, request, *args, **kwargs):
        serializer = StockAdjustmentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product = serializer.validated_data["product"]
        location = serializer.validated_data["location"]
        counted_quantity = serializer.validated_data["counted_quantity"]
        reason = serializer.validated_data["reason"]

        try:
            movement = StockMovementService.adjust_stock(
                product=product,
                location=location,
                counted_quantity=counted_quantity,
                actor=request.user,
                reason=reason,
            )
        except InventoryError as err:
            raise ValidationError({"detail": str(err)}) from err

        balance = StockBalance.objects.get(product=product, location=location)

        return Response(
            {
                "movement": StockMovementSerializer(movement).data,
                "balance": StockBalanceSerializer(balance).data,
            },
            status=status.HTTP_201_CREATED,
        )
