"""
Automated tests for catalog REST API endpoints (categories, products, archival).
"""
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole
from apps.catalog.models import Category, Product


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def manager_user(db):
    user = User.objects.create_user(
        username="mgr_user",
        password="Password123!",
        role=UserRole.MANAGER,
    )
    return user


@pytest.fixture
def staff_user(db):
    user = User.objects.create_user(
        username="staff_user",
        password="Password123!",
        role=UserRole.STAFF,
    )
    return user


@pytest.fixture
def category(db):
    return Category.objects.create(name="Tools", description="Hardware tools")


@pytest.fixture
def product(db, category):
    return Product.objects.create(
        sku="SKU-HAMMER-01",
        barcode="987654321012",
        name="Claw Hammer 16oz",
        category=category,
        purchase_cost=Decimal("12.0000"),
        selling_price=Decimal("19.9900"),
        reorder_threshold=Decimal("5.00"),
    )


@pytest.mark.django_db
def test_category_list_and_create_as_manager(api_client, manager_user):
    token = Token.objects.create(user=manager_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    url = reverse("catalog:category-list")
    # List
    response = api_client.get(url)
    assert response.status_code == status.HTTP_200_OK

    # Create
    create_response = api_client.post(
        url,
        {"name": "Power Tools", "description": "Electric drills and saws"},
        format="json",
    )
    assert create_response.status_code == status.HTTP_201_CREATED
    assert create_response.data["name"] == "Power Tools"
    assert create_response.data["slug"] == "power-tools"


@pytest.mark.django_db
def test_category_create_forbidden_for_staff(api_client, staff_user):
    token = Token.objects.create(user=staff_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    url = reverse("catalog:category-list")
    response = api_client.post(
        url,
        {"name": "Restricted Category"},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_category_tree_action(api_client, manager_user, category):
    token = Token.objects.create(user=manager_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    Category.objects.create(name="Hand Tools", parent=category)

    url = reverse("catalog:category-tree")
    response = api_client.get(url)
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) >= 1
    assert any(cat["name"] == "Tools" for cat in response.data)


@pytest.mark.django_db
def test_product_create_and_validation(api_client, manager_user, category):
    token = Token.objects.create(user=manager_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    url = reverse("catalog:product-list")
    payload = {
        "sku": "SKU-DRILL-01",
        "barcode": "555111222333",
        "name": "Cordless Drill 20V",
        "category": str(category.id),
        "purchase_cost": "65.0000",
        "selling_price": "119.5000",
        "reorder_threshold": "3.00",
    }
    response = api_client.post(url, payload, format="json")
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["sku"] == "SKU-DRILL-01"
    assert response.data["category_name"] == "Tools"


@pytest.mark.django_db
def test_product_search_and_filter(api_client, staff_user, product):
    token = Token.objects.create(user=staff_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    url = reverse("catalog:product-list")

    # Search by SKU
    search_res = api_client.get(f"{url}?search=HAMMER")
    assert search_res.status_code == status.HTTP_200_OK
    assert search_res.data["count"] == 1

    # Search non-matching
    no_res = api_client.get(f"{url}?search=NONEXISTENT")
    assert no_res.data["count"] == 0


@pytest.mark.django_db
def test_product_archive_and_unarchive_actions(api_client, manager_user, product):
    token = Token.objects.create(user=manager_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    archive_url = reverse("catalog:product-archive", kwargs={"pk": product.id})
    res = api_client.post(archive_url)
    assert res.status_code == status.HTTP_200_OK
    assert res.data["is_archived"] is True

    # Standard list excludes archived by default
    list_url = reverse("catalog:product-list")
    default_list = api_client.get(list_url)
    assert default_list.data["count"] == 0

    # Including archived returns the product
    inc_list = api_client.get(f"{list_url}?include_archived=true")
    assert inc_list.data["count"] == 1

    # Unarchive
    unarchive_url = reverse("catalog:product-unarchive", kwargs={"pk": product.id})
    unarchive_res = api_client.post(unarchive_url)
    assert unarchive_res.status_code == status.HTTP_200_OK
    assert unarchive_res.data["is_archived"] is False
