"""
Role-based authorization permission classes for Uniflow.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import UserRole


class IsAdminRole(BasePermission):
    """
    Allows access only to authenticated users with the ADMIN role or superuser status.
    """
    message = "Administrator privileges are required to perform this action."

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(request.user.role == UserRole.ADMIN or request.user.is_superuser)


class IsInventoryManagerRole(BasePermission):
    """
    Allows access to users with ADMIN or INVENTORY_MANAGER roles.
    """
    message = "Inventory Manager or Administrator privileges are required."

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.role in (UserRole.ADMIN, UserRole.MANAGER)
            or request.user.is_superuser
        )


class CanManageStock(BasePermission):
    """
    Allows operational stock recording access to ADMIN, MANAGER, and STAFF roles.
    """
    message = "Inventory management privileges are required."

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        return bool(
            request.user.role in (UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
            or request.user.is_superuser
        )


class IsReadOnlyViewer(BasePermission):
    """
    Allows read-only access (GET, HEAD, OPTIONS) to any authenticated user.
    """
    message = "Read-only access is permitted."

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        return request.method in SAFE_METHODS


class IsAdminOrReadOnly(BasePermission):
    """
    Permits write actions only to ADMIN users, and read actions to any authenticated user.
    """
    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user.role == UserRole.ADMIN or request.user.is_superuser)


class IsManagerOrReadOnly(BasePermission):
    """
    Permits write actions to ADMIN and MANAGER users, and read actions to any authenticated user.
    """
    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return bool(
            request.user.role in (UserRole.ADMIN, UserRole.MANAGER)
            or request.user.is_superuser
        )


class IsStaffOrReadOnly(BasePermission):
    """
    Permits write actions to ADMIN, MANAGER, and STAFF users, and read actions to any authenticated user.
    """
    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return bool(
            request.user.role in (UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF)
            or request.user.is_superuser
        )
