"""
Automated tests for inventory domain REST API endpoints:
- Locations (CRUD, role permissions)
- Balances (read-only queries, low-stock filter)
- Movements (read-only audit ledger)
- Adjustments (cycle count physical adjustment)
"""
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole
from apps.catalog.models import Category, Product
from apps.inventory.models import Location, MovementType
from apps.inventory.services import StockMovementService


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username="inv_mgr_api",
        password="Password123!",
        role=UserRole.MANAGER,
    )


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        username="inv_staff_api",
        password="Password123!",
        role=UserRole.STAFF,
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username="inv_viewer_api",
        password="Password123!",
        role=UserRole.VIEWER,
    )


@pytest.fixture
def location(db):
    return Location.objects.create(code="EAST-WH", name="East Distribution Hub")


@pytest.fixture
def product(db):
    cat = Category.objects.create(name="Electrical")
    return Product.objects.create(
        sku="SKU-BREAKER-15A",
        name="Circuit Breaker 15 Amp",
        category=cat,
        purchase_cost=Decimal("14.0000"),
        selling_price=Decimal("26.5000"),
        reorder_threshold=Decimal("10.00"),
    )


@pytest.mark.django_db
def test_location_crud_permissions(api_client, manager_user, staff_user):
    mgr_token = Token.objects.create(user=manager_user)
    staff_token = Token.objects.create(user=staff_user)

    url = reverse("inventory:location-list")

    # Staff forbidden from creating location
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {staff_token.key}")
    res_staff = api_client.post(url, {"code": "WEST-WH", "name": "West Warehouse"}, format="json")
    assert res_staff.status_code == status.HTTP_403_FORBIDDEN

    # Manager allowed to create location
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {mgr_token.key}")
    res_mgr = api_client.post(url, {"code": "WEST-WH", "name": "West Warehouse"}, format="json")
    assert res_mgr.status_code == status.HTTP_201_CREATED
    assert res_mgr.data["code"] == "WEST-WH"


@pytest.mark.django_db
def test_stock_balances_list_and_low_stock_filter(api_client, staff_user, manager_user, location, product):
    token = Token.objects.create(user=staff_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    # Initial receipt of 8 units (product reorder threshold is 10 -> is_low_stock = True)
    StockMovementService.record_movement(
        product=product,
        location=location,
        movement_type=MovementType.RECEIPT,
        quantity=Decimal("8.00"),
        actor=manager_user,
    )

    url = reverse("inventory:balance-list")
    res = api_client.get(url)
    assert res.status_code == status.HTTP_200_OK
    assert res.data["count"] == 1
    balance_item = res.data["results"][0]
    assert balance_item["product_sku"] == "SKU-BREAKER-15A"
    assert balance_item["current_quantity"] == "8.00"
    assert balance_item["is_low_stock"] is True

    # Filter with low_stock=true
    res_low = api_client.get(f"{url}?low_stock=true")
    assert res_low.status_code == status.HTTP_200_OK
    assert res_low.data["count"] == 1


@pytest.mark.django_db
def test_stock_movements_list(api_client, staff_user, manager_user, location, product):
    token = Token.objects.create(user=staff_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    StockMovementService.record_movement(
        product=product,
        location=location,
        movement_type=MovementType.OPENING_BALANCE,
        quantity=Decimal("100.00"),
        actor=manager_user,
        reason="Initial setup",
    )

    url = reverse("inventory:movement-list")
    res = api_client.get(url)
    assert res.status_code == status.HTTP_200_OK
    assert res.data["count"] == 1
    movement_item = res.data["results"][0]
    assert movement_item["quantity"] == "100.00"
    assert movement_item["movement_type"] == "OPENING_BALANCE"
    assert movement_item["actor_name"] == "inv_mgr_api"


@pytest.mark.django_db
def test_stock_adjustment_by_staff_and_viewer_rejection(api_client, staff_user, viewer_user, location, product):
    staff_token = Token.objects.create(user=staff_user)
    viewer_token = Token.objects.create(user=viewer_user)

    url = reverse("inventory:adjustment")
    payload = {
        "product": str(product.id),
        "location": str(location.id),
        "counted_quantity": "42.00",
        "reason": "Annual stock audit cycle count",
    }

    # Viewer cannot adjust stock
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {viewer_token.key}")
    res_viewer = api_client.post(url, payload, format="json")
    assert res_viewer.status_code == status.HTTP_403_FORBIDDEN

    # Staff CAN adjust stock
    api_client.credentials(HTTP_AUTHORIZATION=f"Token {staff_token.key}")
    res_staff = api_client.post(url, payload, format="json")
    assert res_staff.status_code == status.HTTP_201_CREATED
    assert res_staff.data["movement"]["movement_type"] == "POSITIVE_ADJUSTMENT"
    assert res_staff.data["movement"]["quantity"] == "42.00"
    assert res_staff.data["balance"]["current_quantity"] == "42.00"

    # Redundant second adjustment with identical count is rejected
    res_redundant = api_client.post(url, payload, format="json")
    assert res_redundant.status_code == status.HTTP_400_BAD_REQUEST
