"""
URL routing for purchasing domain REST API endpoints: suppliers, purchase orders, receipts.
"""
from rest_framework.routers import DefaultRouter

from apps.purchasing.views import (
    PurchaseOrderViewSet,
    ReceiptViewSet,
    SupplierViewSet,
)

app_name = "purchasing"

router = DefaultRouter()
router.register(r"suppliers", SupplierViewSet, basename="supplier")
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="purchase-order")
router.register(r"receipts", ReceiptViewSet, basename="receipt")

urlpatterns = router.urls
