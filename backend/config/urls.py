"""
Root URL configuration for Uniflow backend.
"""
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Common & sync endpoints (health, sync/push, sync/pull)
    path("api/v1/", include("apps.common.urls", namespace="common")),
    # Authentication endpoints
    path("api/v1/auth/", include("apps.accounts.urls", namespace="auth")),
    # Catalog endpoints
    path("api/v1/catalog/", include("apps.catalog.urls", namespace="catalog")),
    # Inventory endpoints
    path("api/v1/inventory/", include("apps.inventory.urls", namespace="inventory")),
    # Purchasing endpoints (suppliers, purchase-orders, receipts)
    path("api/v1/", include("apps.purchasing.urls", namespace="purchasing")),
    # OpenAPI 3.0 Documentation
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
