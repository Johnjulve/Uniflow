"""
Automated tests for authentication endpoints (login, logout, me).
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
    user = User.objects.create_user(
        username="staffuser",
        email="staff@uniflow.local",
        password="ValidPassword123!",
        first_name="Staff",
        last_name="Member",
        role=UserRole.STAFF,
    )
    return user


@pytest.fixture
def admin_user(db):
    user = User.objects.create_user(
        username="adminuser",
        email="admin@uniflow.local",
        password="AdminPassword123!",
        first_name="Super",
        last_name="Admin",
        role=UserRole.ADMIN,
    )
    return user


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

    # Subsequent request with old token is rejected
    me_response = api_client.get(reverse("auth:me"))
    assert me_response.status_code == status.HTTP_401_UNAUTHORIZED
