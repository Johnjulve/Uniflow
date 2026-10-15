"""
URL routing for inventory domain REST API endpoints.
"""
from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.inventory.views import (
    LocationViewSet,
    StockAdjustmentView,
    StockBalanceViewSet,
    StockMovementViewSet,
)

app_name = "inventory"

router = DefaultRouter()
router.register(r"locations", LocationViewSet, basename="location")
router.register(r"balances", StockBalanceViewSet, basename="balance")
router.register(r"movements", StockMovementViewSet, basename="movement")

urlpatterns = router.urls + [
    path("adjustments/", StockAdjustmentView.as_view(), name="adjustment"),
]
