"""
URL routing for accounts, authentication, and user management endpoints.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts.views import CurrentUserView, LoginView, LogoutView, UserViewSet

app_name = "accounts"

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", CurrentUserView.as_view(), name="me"),
    path("", include(router.urls)),
]
