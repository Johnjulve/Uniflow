"""
Root URL configuration for Uniflow backend.
"""
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.common.views import HealthCheckView

urlpatterns = [
    path("admin/", admin.site.urls),
    # System endpoints
    path("api/v1/health/", HealthCheckView.as_view(), name="health-check"),
    # Authentication endpoints
    path("api/v1/auth/", include("apps.accounts.urls", namespace="auth")),
    # OpenAPI 3.0 Documentation
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
