"""
Integration tests for reports summary analytics and CSV export endpoints.
"""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.catalog.models import Category, Product
from apps.inventory.models import Location
from apps.inventory.services import StockMovementService

User = get_user_model()


@pytest.fixture
def auth_client():
    client = APIClient()
    user = User.objects.create_user(
        username="reports_admin",
        email="reports@uniflow.test",
        password="TestPassword123!",
        role="ADMIN",
    )
    client.force_authenticate(user=user)
    return client, user


@pytest.fixture
def sample_inventory_setup(auth_client):
    _, user = auth_client
    category = Category.objects.create(name="Beverages", slug="beverages")
    location = Location.objects.create(code="WH-MAIN", name="Main Warehouse")

    p1 = Product.objects.create(
        sku="BEV-001",
        name="Artisan Coffee",
        category=category,
        unit_of_measure="bag",
        purchase_cost=Decimal("12.5000"),
        selling_price=Decimal("18.0000"),
        reorder_threshold=Decimal("10.00"),
    )

    p2 = Product.objects.create(
        sku="BEV-002",
        name="Green Tea",
        category=category,
        unit_of_measure="box",
        purchase_cost=Decimal("5.0000"),
        selling_price=Decimal("8.0000"),
        reorder_threshold=Decimal("15.00"),
    )

    p3 = Product.objects.create(
        sku="BEV-003",
        name="Herbal Infusion",
        category=category,
        unit_of_measure="tin",
        purchase_cost=Decimal("7.0000"),
        selling_price=Decimal("10.0000"),
        reorder_threshold=Decimal("5.00"),
    )

    # p1 has 20 units (healthy stock)
    StockMovementService.adjust_stock(
        product=p1,
        location=location,
        counted_quantity=Decimal("20.00"),
        actor=user,
        reason="Opening stock",
    )

    # p2 has 5 units (low stock: <= 15 threshold and > 0)
    StockMovementService.adjust_stock(
        product=p2,
        location=location,
        counted_quantity=Decimal("5.00"),
        actor=user,
        reason="Opening stock",
    )

    # p3 has 0 units (out of stock: <= 0)

    return {
        "p1": p1,
        "p2": p2,
        "p3": p3,
        "location": location,
        "category": category,
    }


@pytest.mark.django_db
def test_dashboard_summary_unauthenticated():
    client = APIClient()
    response = client.get("/api/v1/reports/summary/")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_dashboard_summary_metrics(auth_client, sample_inventory_setup):
    client, _ = auth_client
    response = client.get("/api/v1/reports/summary/")
    assert response.status_code == status.HTTP_200_OK

    data = response.json()
    assert data["total_active_products"] == 3
    # 20 + 5 = 25 total units
    assert Decimal(data["total_inventory_quantity"]) == Decimal("25.00")
    # Valuation: (20 * 12.50) + (5 * 5.00) = 250 + 25 = 275.00
    assert Decimal(data["total_inventory_valuation"]) == Decimal("275.00")
    assert data["low_stock_count"] == 1  # p2
    assert data["out_of_stock_count"] == 1  # p3
    assert len(data["recent_movements"]) == 2  # Two adjustments recorded
    assert "server_timestamp" in data


@pytest.mark.django_db
def test_export_balances_csv(auth_client, sample_inventory_setup):
    client, _ = auth_client
    response = client.get("/api/v1/reports/export/?type=balances")
    assert response.status_code == status.HTTP_200_OK
    assert response["Content-Type"].startswith("text/csv")
    assert "attachment" in response["Content-Disposition"]

    content = response.content.decode("utf-8")
    assert "Product SKU,Product Name,Category,Location Code" in content
    assert "BEV-001" in content
    assert "BEV-002" in content
    assert "250.00" in content  # Valuation for BEV-001


@pytest.mark.django_db
def test_export_low_stock_csv(auth_client, sample_inventory_setup):
    client, _ = auth_client
    response = client.get("/api/v1/reports/export/?type=low_stock")
    assert response.status_code == status.HTTP_200_OK
    assert response["Content-Type"].startswith("text/csv")

    content = response.content.decode("utf-8")
    assert "LOW STOCK" in content
    assert "OUT OF STOCK" in content
    assert "BEV-002" in content
    assert "BEV-003" in content
    assert "BEV-001" not in content  # Healthy stock


@pytest.mark.django_db
def test_export_movements_csv(auth_client, sample_inventory_setup):
    client, _ = auth_client
    response = client.get("/api/v1/reports/export/?type=movements")
    assert response.status_code == status.HTTP_200_OK
    assert response["Content-Type"].startswith("text/csv")

    content = response.content.decode("utf-8")
    assert "Movement Reference,Movement Type,Product SKU" in content
    assert "Opening stock" in content


@pytest.mark.django_db
def test_export_invalid_type_rejected(auth_client):
    client, _ = auth_client
    response = client.get("/api/v1/reports/export/?type=nonexistent")
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Unsupported report type" in response.json()["error"]
