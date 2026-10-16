"""
URL routing for common endpoints: health checks and offline synchronization.
"""
from django.urls import path

from apps.common.views import HealthCheckView, SyncPullView, SyncPushView

app_name = "common"

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health-check"),
    path("sync/push/", SyncPushView.as_view(), name="sync-push"),
    path("sync/pull/", SyncPullView.as_view(), name="sync-pull"),
]
