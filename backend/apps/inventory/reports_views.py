"""
API views for inventory analytics dashboard and CSV report exports.
"""

from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.inventory.reports_service import ReportsService


class DashboardSummaryView(APIView):
    """
    Real-time aggregated KPIs for dashboard overview:
    active products, stock quantities, total valuation, low-stock alerts,
    and recent activity feeds.
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        summary="Retrieve dashboard KPIs and inventory summary",
        description="Calculates live inventory totals, valuation, threshold warnings, and recent transactions.",
        responses={200: dict},
    )
    def get(self, request):
        data = ReportsService.get_dashboard_summary()
        return Response(data, status=status.HTTP_200_OK)


class ReportExportView(APIView):
    """
    Stream generated CSV reports for offline analysis and auditing.
    Supports 'balances', 'low_stock', and 'movements'.
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        summary="Export inventory reports in CSV format",
        parameters=[
            OpenApiParameter(
                name="type",
                description="Type of report: 'balances', 'low_stock', or 'movements'",
                required=False,
                type=str,
                default="balances",
            ),
            OpenApiParameter(
                name="start_date",
                description="Start ISO date/datetime for movements report",
                required=False,
                type=str,
            ),
            OpenApiParameter(
                name="end_date",
                description="End ISO date/datetime for movements report",
                required=False,
                type=str,
            ),
        ],
        responses={200: str},
    )
    def get(self, request):
        report_type = request.query_params.get("type", "balances").lower()
        now_str = timezone.now().strftime("%Y%m%d_%H%M%S")

        if report_type == "balances":
            csv_data = ReportsService.generate_balances_csv()
            filename = f"uniflow_stock_balances_{now_str}.csv"
        elif report_type == "low_stock":
            csv_data = ReportsService.generate_low_stock_csv()
            filename = f"uniflow_low_stock_{now_str}.csv"
        elif report_type == "movements":
            start_date = request.query_params.get("start_date")
            end_date = request.query_params.get("end_date")
            csv_data = ReportsService.generate_movements_csv(
                start_date=start_date, end_date=end_date
            )
            filename = f"uniflow_stock_movements_{now_str}.csv"
        else:
            return Response(
                {
                    "error": f"Unsupported report type: '{report_type}'. Allowed types: 'balances', 'low_stock', 'movements'."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        response = HttpResponse(csv_data, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
