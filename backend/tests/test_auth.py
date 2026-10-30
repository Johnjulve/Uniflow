"""
Automated tests for authentication (login, logout, me) and admin user management endpoints.
"""
import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def regular_user(db):
    return User.objects.create_user(
        username="staffuser",
        email="staff@uniflow.local",
        password="ValidPassword123!",
        first_name="Staff",
        last_name="Member",
        role=UserRole.STAFF,
    )


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="adminuser",
        email="admin@uniflow.local",
        password="AdminPassword123!",
        first_name="Super",
        last_name="Admin",
        role=UserRole.ADMIN,
    )


@pytest.mark.django_db
def test_login_successful(api_client, regular_user):
    url = reverse("auth:login")
    response = api_client.post(
        url,
        {"username": "staffuser", "password": "ValidPassword123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert "token" in response.data
    assert response.data["token"] != ""
    assert response.data["user"]["username"] == "staffuser"
    assert response.data["user"]["role"] == UserRole.STAFF
    assert response.data["user"]["can_manage_stock"] is True
    assert response.data["user"]["can_manage_users"] is False


@pytest.mark.django_db
def test_login_invalid_credentials(api_client, regular_user):
    url = reverse("auth:login")
    response = api_client.post(
        url,
        {"username": "staffuser", "password": "WrongPassword!"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "error" in response.data or "detail" in response.data or "errors" in response.data


@pytest.mark.django_db
def test_login_inactive_user(api_client, regular_user):
    regular_user.is_active = False
    regular_user.save()

    url = reverse("auth:login")
    response = api_client.post(
        url,
        {"username": "staffuser", "password": "ValidPassword123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_current_user_authenticated(api_client, regular_user):
    token = Token.objects.create(user=regular_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    url = reverse("auth:me")
    response = api_client.get(url)
    assert response.status_code == status.HTTP_200_OK
    assert response.data["username"] == "staffuser"
    assert response.data["role"] == "STAFF"


@pytest.mark.django_db
def test_current_user_unauthenticated(api_client):
    url = reverse("auth:me")
    response = api_client.get(url)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_logout_revokes_token(api_client, regular_user):
    token = Token.objects.create(user=regular_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    url = reverse("auth:logout")
    response = api_client.post(url)
    assert response.status_code == status.HTTP_200_OK
    assert not Token.objects.filter(user=regular_user).exists()

    me_response = api_client.get(reverse("auth:me"))
    assert me_response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_admin_can_list_and_create_users(api_client, admin_user, regular_user):
    token = Token.objects.create(user=admin_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    list_url = reverse("auth:user-list")
    list_res = api_client.get(list_url)
    assert list_res.status_code == status.HTTP_200_OK
    results = list_res.data.get("results", list_res.data)
    assert len(results) >= 2

    create_res = api_client.post(
        list_url,
        {
            "username": "manager01",
            "password": "StrongPassword123!",
            "email": "Manager@Uniflow.local",
            "first_name": "Dana",
            "last_name": "Lead",
            "role": UserRole.MANAGER,
            "is_active": True,
        },
        format="json",
    )
    assert create_res.status_code == status.HTTP_201_CREATED
    assert create_res.data["username"] == "manager01"
    assert create_res.data["email"] == "manager@uniflow.local"
    assert create_res.data["role"] == UserRole.MANAGER
    assert create_res.data["can_manage_purchasing"] is True


@pytest.mark.django_db
def test_non_admin_cannot_access_user_management(api_client, regular_user):
    token = Token.objects.create(user=regular_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    url = reverse("auth:user-list")
    res = api_client.get(url)
    assert res.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_admin_deactivate_user_revokes_token_and_prevents_self_lockout(
    api_client, admin_user, regular_user
):
    admin_token = Token.objects.create(user=admin_user)
    staff_token = Token.objects.create(user=regular_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {admin_token.key}")

    # Deactivating staff user succeeds and deletes their active token
    staff_detail_url = reverse("auth:user-detail", kwargs={"pk": regular_user.id})
    patch_res = api_client.patch(
        staff_detail_url,
        {"is_active": False, "role": UserRole.VIEWER},
        format="json",
    )
    assert patch_res.status_code == status.HTTP_200_OK
    assert patch_res.data["is_active"] is False
    assert patch_res.data["role"] == UserRole.VIEWER
    assert not Token.objects.filter(key=staff_token.key).exists()

    # Admin attempting to deactivate or demote themselves is rejected
    admin_detail_url = reverse("auth:user-detail", kwargs={"pk": admin_user.id})
    self_deactivate_res = api_client.patch(
        admin_detail_url,
        {"is_active": False},
        format="json",
    )
    assert self_deactivate_res.status_code == status.HTTP_400_BAD_REQUEST

    self_demote_res = api_client.patch(
        admin_detail_url,
        {"role": UserRole.STAFF},
        format="json",
    )
    assert self_demote_res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_admin_can_view_audit_logs_with_filters(api_client, admin_user, regular_user):
    from apps.common.models import AuditAction, AuditLog

    # Create dummy audit events
    AuditLog.objects.create(
        actor=admin_user,
        actor_username=admin_user.username,
        action=AuditAction.CREATED,
        entity_type="Category",
        entity_id="cat-100",
        summary="Created Category 'Hardware'",
        changes={"created": {"name": "Hardware"}},
        source="DJANGO_ADMIN",
    )
    AuditLog.objects.create(
        actor=regular_user,
        actor_username=regular_user.username,
        action=AuditAction.LOGIN,
        entity_type="User",
        entity_id=str(regular_user.id),
        summary="User 'staffuser' signed in via API",
        source="API",
    )

    token = Token.objects.create(user=admin_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    url = reverse("auth:audit-log-list")
    res = api_client.get(url)
    assert res.status_code == status.HTTP_200_OK
    results = res.data.get("results", res.data)
    assert len(results) >= 2

    # Filter by source=DJANGO_ADMIN
    filter_res = api_client.get(f"{url}?source=DJANGO_ADMIN")
    assert filter_res.status_code == status.HTTP_200_OK
    filtered = filter_res.data.get("results", filter_res.data)
    assert len(filtered) == 1
    assert filtered[0]["entity_type"] == "Category"
    assert filtered[0]["source"] == "DJANGO_ADMIN"


@pytest.mark.django_db
def test_audit_log_immutability_enforced(admin_user):
    from django.core.exceptions import ValidationError
    from apps.common.models import AuditAction, AuditLog

    log = AuditLog.objects.create(
        actor=admin_user,
        actor_username=admin_user.username,
        action=AuditAction.CREATED,
        entity_type="Product",
        entity_id="prod-1",
        summary="Created Product",
    )

    # Instance save/delete blocks
    with pytest.raises(ValidationError):
        log.summary = "Tampered summary"
        log.save()

    with pytest.raises(ValidationError):
        log.delete()

    # Bulk QuerySet update/delete blocks
    with pytest.raises(ValidationError):
        AuditLog.objects.filter(id=log.id).update(summary="Bulk tampered")

    with pytest.raises(ValidationError):
        AuditLog.objects.filter(id=log.id).delete()


@pytest.mark.django_db
def test_non_admin_and_unauthenticated_cannot_access_audit_logs(
    api_client, regular_user, admin_user
):
    url = reverse("auth:audit-log-list")

    # 1. Unauthenticated request rejected with 401
    unauth_res = api_client.get(url)
    assert unauth_res.status_code == status.HTTP_401_UNAUTHORIZED

    # 2. Authenticated non-admin rejected with 403
    staff_token = Token.objects.create(user=regular_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {staff_token.key}")
    forbidden_res = api_client.get(url)
    assert forbidden_res.status_code == status.HTTP_403_FORBIDDEN

    # 3. Authenticated admin write attempts rejected with 405 Method Not Allowed
    admin_token = Token.objects.create(user=admin_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {admin_token.key}")
    post_res = api_client.post(url, {"summary": "Direct API audit write"}, format="json")
    assert post_res.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


