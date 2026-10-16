"""
URL routing for reports and analytics endpoints.
"""

from django.urls import path

from apps.inventory.reports_views import DashboardSummaryView, ReportExportView

app_name = "reports"

urlpatterns = [
    path("summary/", DashboardSummaryView.as_view(), name="summary"),
    path("export/", ReportExportView.as_view(), name="export"),
]
