"""
Unit and integration tests for role-based authorization permission classes.
"""
import pytest
from django.contrib.auth.models import AnonymousUser
from rest_framework.test import APIRequestFactory

from apps.accounts.models import User, UserRole
from apps.accounts.permissions import (
    CanManageStock,
    IsAdminOrReadOnly,
    IsAdminRole,
    IsInventoryManagerRole,
    IsManagerOrReadOnly,
    IsReadOnlyViewer,
    IsStaffOrReadOnly,
)


@pytest.fixture
def rf():
    return APIRequestFactory()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="perm_admin",
        password="Pass123!",
        role=UserRole.ADMIN,
    )


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username="perm_mgr",
        password="Pass123!",
        role=UserRole.MANAGER,
    )


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        username="perm_staff",
        password="Pass123!",
        role=UserRole.STAFF,
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username="perm_viewer",
        password="Pass123!",
        role=UserRole.VIEWER,
    )


def test_is_admin_role(rf, admin_user, manager_user, staff_user, viewer_user):
    perm = IsAdminRole()
    req = rf.post("/")

    # Admin passes
    req.user = admin_user
    assert perm.has_permission(req, None) is True

    # Manager, Staff, Viewer, Anon fail
    req.user = manager_user
    assert perm.has_permission(req, None) is False

    req.user = staff_user
    assert perm.has_permission(req, None) is False

    req.user = viewer_user
    assert perm.has_permission(req, None) is False

    req.user = AnonymousUser()
    assert perm.has_permission(req, None) is False


def test_is_inventory_manager_role(rf, admin_user, manager_user, staff_user, viewer_user):
    perm = IsInventoryManagerRole()
    req = rf.post("/")

    # Admin and Manager pass
    req.user = admin_user
    assert perm.has_permission(req, None) is True

    req.user = manager_user
    assert perm.has_permission(req, None) is True

    # Staff and Viewer fail
    req.user = staff_user
    assert perm.has_permission(req, None) is False

    req.user = viewer_user
    assert perm.has_permission(req, None) is False


def test_can_manage_stock(rf, admin_user, manager_user, staff_user, viewer_user):
    perm = CanManageStock()
    req = rf.post("/")

    # Admin, Manager, Staff pass
    req.user = admin_user
    assert perm.has_permission(req, None) is True

    req.user = manager_user
    assert perm.has_permission(req, None) is True

    req.user = staff_user
    assert perm.has_permission(req, None) is True

    # Viewer fails
    req.user = viewer_user
    assert perm.has_permission(req, None) is False


def test_is_read_only_viewer(rf, admin_user, viewer_user):
    perm = IsReadOnlyViewer()

    # Safe GET passes for authenticated
    get_req = rf.get("/")
    get_req.user = viewer_user
    assert perm.has_permission(get_req, None) is True

    get_req.user = admin_user
    assert perm.has_permission(get_req, None) is True

    # Unauthenticated GET fails
    get_req.user = AnonymousUser()
    assert perm.has_permission(get_req, None) is False

    # POST fails for all
    post_req = rf.post("/")
    post_req.user = viewer_user
    assert perm.has_permission(post_req, None) is False


def test_is_manager_or_read_only(rf, manager_user, staff_user, viewer_user):
    perm = IsManagerOrReadOnly()

    # GET passes for all authenticated
    get_req = rf.get("/")
    get_req.user = viewer_user
    assert perm.has_permission(get_req, None) is True

    # POST passes for manager
    post_req = rf.post("/")
    post_req.user = manager_user
    assert perm.has_permission(post_req, None) is True

    # POST fails for staff and viewer
    post_req.user = staff_user
    assert perm.has_permission(post_req, None) is False

    post_req.user = viewer_user
    assert perm.has_permission(post_req, None) is False


def test_is_admin_or_read_only(rf, admin_user, manager_user):
    perm = IsAdminOrReadOnly()

    post_req = rf.post("/")
    post_req.user = admin_user
    assert perm.has_permission(post_req, None) is True

    post_req.user = manager_user
    assert perm.has_permission(post_req, None) is False


def test_is_staff_or_read_only(rf, staff_user, viewer_user):
    perm = IsStaffOrReadOnly()

    post_req = rf.post("/")
    post_req.user = staff_user
    assert perm.has_permission(post_req, None) is True

    post_req.user = viewer_user
    assert perm.has_permission(post_req, None) is False
