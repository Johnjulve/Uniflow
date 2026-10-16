"""
Common API views: system health checks, idempotent offline outbox synchronization,
and delta cache pull cursors.
"""
from django.db import connection
from django.utils import dateparse, timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import CanManageStock
from apps.catalog.models import Category, Product
from apps.common.services import SyncService
from apps.inventory.models import Location, StockBalance
from apps.purchasing.models import Supplier


class HealthCheckView(APIView):
    """
    Public health check endpoint for monitoring application and database availability.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        summary="System Health Check",
        description="Returns system status, database connectivity, and server timestamp.",
        responses={
            200: inline_serializer(
                name="HealthCheckSuccess",
                fields={
                    "status": serializers.CharField(default="healthy"),
                    "database": serializers.CharField(default="connected"),
                    "timestamp": serializers.DateTimeField(),
                    "version": serializers.CharField(default="0.1.0"),
                },
            ),
            503: inline_serializer(
                name="HealthCheckDegraded",
                fields={
                    "status": serializers.CharField(default="unhealthy"),
                    "database": serializers.CharField(default="disconnected"),
                    "error": serializers.CharField(),
                },
            ),
        },
        tags=["System"],
    )
    def get(self, request, *args, **kwargs):
        db_status = "connected"
        http_status = status.HTTP_200_OK

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
        except Exception as exc:
            db_status = "disconnected"
            http_status = status.HTTP_503_SERVICE_UNAVAILABLE
            return Response(
                {
                    "status": "unhealthy",
                    "database": db_status,
                    "error": str(exc),
                },
                status=http_status,
            )

        return Response(
            {
                "status": "healthy",
                "database": db_status,
                "timestamp": timezone.now().isoformat(),
                "version": "0.1.0",
            },
            status=http_status,
        )


class SyncPushView(APIView):
    """
    Idempotent batch ingestion endpoint for offline client outbox mutations.
    """
    permission_classes = [CanManageStock]

    @extend_schema(
        summary="Batch offline outbox sync push",
        description="Ingests queued offline mutations, replaying them with client_operation_id idempotency.",
        tags=["Synchronization"],
    )
    def post(self, request, *args, **kwargs):
        operations = request.data.get("operations")
        if not isinstance(operations, list):
            return Response(
                {"error": {"code": "VALIDATION_ERROR", "message": "'operations' must be a list."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = SyncService.process_batch(operations=operations, actor=request.user)
        return Response({"results": results}, status=status.HTTP_200_OK)


class SyncPullView(APIView):
    """
    Incremental delta cursor endpoint returning entities modified since the provided timestamp.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Incremental delta pull",
        description="Returns modified catalog, location, supplier, and balance records since timestamp.",
        tags=["Synchronization"],
    )
    def get(self, request, *args, **kwargs):
        since_raw = request.query_params.get("since")
        since_dt = dateparse.parse_datetime(since_raw) if since_raw else None

        cats_qs = Category.objects.all()
        prods_qs = Product.objects.all()
        locs_qs = Location.objects.all()
        supps_qs = Supplier.objects.all()
        bals_qs = StockBalance.objects.select_related("product", "location").all()

        if since_dt:
            cats_qs = cats_qs.filter(updated_at__gte=since_dt)
            prods_qs = prods_qs.filter(updated_at__gte=since_dt)
            locs_qs = locs_qs.filter(updated_at__gte=since_dt)
            supps_qs = supps_qs.filter(updated_at__gte=since_dt)
            bals_qs = bals_qs.filter(updated_at__gte=since_dt)

        return Response(
            {
                "server_timestamp": timezone.now().isoformat(),
                "categories": [
                    {"id": str(c.id), "name": c.name, "slug": c.slug, "updated_at": c.updated_at.isoformat()}
                    for c in cats_qs[:500]
                ],
                "products": [
                    {
                        "id": str(p.id),
                        "sku": p.sku,
                        "name": p.name,
                        "barcode": p.barcode,
                        "purchase_cost": str(p.purchase_cost),
                        "selling_price": str(p.selling_price),
                        "unit_of_measure": p.unit_of_measure,
                        "is_active": p.is_active,
                        "updated_at": p.updated_at.isoformat(),
                    }
                    for p in prods_qs[:500]
                ],
                "locations": [
                    {
                        "id": str(loc.id),
                        "code": loc.code,
                        "name": loc.name,
                        "is_active": loc.is_active,
                        "updated_at": loc.updated_at.isoformat(),
                    }
                    for loc in locs_qs[:100]
                ],
                "suppliers": [
                    {
                        "id": str(s.id),
                        "name": s.name,
                        "contact_name": s.contact_name,
                        "email": s.email,
                        "phone": s.phone,
                        "is_active": s.is_active,
                        "updated_at": s.updated_at.isoformat(),
                    }
                    for s in supps_qs[:200]
                ],
                "balances": [
                    {
                        "id": str(b.id),
                        "product_id": str(b.product_id),
                        "location_id": str(b.location_id),
                        "current_quantity": str(b.current_quantity),
                        "updated_at": b.updated_at.isoformat(),
                    }
                    for b in bals_qs[:500]
                ],
            },
            status=status.HTTP_200_OK,
        )
