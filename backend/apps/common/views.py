"""
Common API views including system health checks.
"""
from django.db import connection
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


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
