"""
Integration tests for reports summary analytics and CSV export endpoints.
"""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.catalog.models import Category, Product
from apps.inventory.models import Location, MovementType
from apps.inventory.services import StockMovementService
from apps.purchasing.models import PurchaseOrder, PurchaseOrderItem, Supplier

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
    client, user = auth_client
    supplier = Supplier.objects.create(name="Acme Tools", email="acme@tools.test")
    po = PurchaseOrder.objects.create(
        order_reference="PO-TEST-001",
        supplier=supplier,
        created_by=user,
    )
    PurchaseOrderItem.objects.create(
        purchase_order=po,
        product=sample_inventory_setup["p1"],
        ordered_quantity=Decimal("10.00"),
        unit_cost=Decimal("12.5000"),
    )

    response = client.get("/api/v1/reports/summary/")
    assert response.status_code == status.HTTP_200_OK

    data = response.json()
    assert data["total_active_products"] == 3
    # 20 + 5 = 25 total units
    assert Decimal(data["total_inventory_quantity"]) == Decimal("25.00")
    # Valuation: (20 * 12.50) + (5 * 5.00) = 250 + 25 = 275.00
    assert Decimal(data["total_inventory_valuation"]) == Decimal("275.00")
    # Potential Revenue: (20 * 18.00) + (5 * 8.00) = 360 + 40 = 400.00
    assert Decimal(data["potential_revenue"]) == Decimal("400.00")
    assert Decimal(data["projected_margin"]) == Decimal("125.00")
    assert Decimal(data["margin_percentage"]) == Decimal("31.2")
    assert Decimal(data["gross_margin_percentage"]) == Decimal("31.2")
    assert Decimal(data["markup_percentage"]) == Decimal("45.5")
    # Incoming from open PO-TEST-001: 10 units @ 12.50 = 125.00
    assert Decimal(data["incoming_cost"]) == Decimal("125.00")
    assert Decimal(data["incoming_quantity"]) == Decimal("10.00")
    assert len(data["valuation_by_location"]) == 1
    assert data["valuation_by_location"][0]["location_code"] == "WH-MAIN"
    assert len(data["valuation_by_category"]) == 1
    assert data["valuation_by_category"][0]["category_name"] == "Beverages"
    assert data["low_stock_count"] == 1  # p2
    assert data["out_of_stock_count"] == 1  # p3
    assert len(data["recent_movements"]) == 2  # Two adjustments recorded
    assert len(data["recent_purchase_orders"]) == 1
    assert data["recent_purchase_orders"][0]["order_reference"] == "PO-TEST-001"
    assert Decimal(data["recent_purchase_orders"][0]["total_amount"]) == Decimal("125.0000")
    assert Decimal(data["monthly_realized_revenue"]) == Decimal("0.00")
    assert Decimal(data["weekly_realized_revenue"]) == Decimal("0.00")
    assert Decimal(data["monthly_realized_profit"]) == Decimal("0.00")
    assert "server_timestamp" in data


@pytest.mark.django_db
def test_dashboard_summary_with_realized_revenue_and_categorized_adjustment(auth_client, sample_inventory_setup):
    client, user = auth_client
    p1 = sample_inventory_setup["p1"]
    location = sample_inventory_setup["location"]

    # Sell 5 units of p1 via categorized adjustment (20 -> 15 units)
    adj_sold = StockMovementService.adjust_stock(
        product=p1,
        location=location,
        counted_quantity=Decimal("15.00"),
        actor=user,
        reason="Direct counter sales",
        reason_category="SOLD",
    )
    assert adj_sold.movement_type == MovementType.ISSUE
    assert adj_sold.quantity == Decimal("-5.00")
    assert adj_sold.reason == "[SOLD] Direct counter sales"

    # Query summary report endpoint
    response = client.get("/api/v1/reports/summary/")
    assert response.status_code == status.HTTP_200_OK

    data = response.json()
    # 5 units * selling_price (18.00) = 90.00 realized revenue
    assert Decimal(data["monthly_realized_revenue"]) == Decimal("90.00")
    assert Decimal(data["weekly_realized_revenue"]) == Decimal("90.00")
    # Cost = 5 * purchase_cost (12.50) = 62.50; Profit = 90.00 - 62.50 = 27.50
    assert Decimal(data["monthly_realized_profit"]) == Decimal("27.50")
    # Potential revenue remaining: (15 * 18.00) + (5 * 8.00) = 270 + 40 = 310.00
    assert Decimal(data["potential_revenue"]) == Decimal("310.00")

    # Verify API adjustment validation:
    # 1. Other requires non-empty reason
    res_err_other = client.post(
        "/api/v1/inventory/adjustments/",
        {
            "product": str(p1.id),
            "location": str(location.id),
            "counted_quantity": "14.00",
            "reason_category": "OTHER",
            "reason": "   ",
        },
        format="json",
    )
    assert res_err_other.status_code == status.HTTP_400_BAD_REQUEST
    assert "reason" in str(res_err_other.data)

    # 2. Sold cannot increase stock
    res_err_sold_inc = client.post(
        "/api/v1/inventory/adjustments/",
        {
            "product": str(p1.id),
            "location": str(location.id),
            "counted_quantity": "25.00",
            "reason_category": "SOLD",
            "reason": "Invalid upward sale",
        },
        format="json",
    )
    assert res_err_sold_inc.status_code == status.HTTP_400_BAD_REQUEST
    assert "cannot increase stock balance" in str(res_err_sold_inc.data)

    # 3. Long reason (245 chars + category prefix) does not crash with 500 length error
    long_reason = "Audit discrepancy verified by external logistics auditor " * 4  # ~230 chars
    res_long = client.post(
        "/api/v1/inventory/adjustments/",
        {
            "product": str(p1.id),
            "location": str(location.id),
            "counted_quantity": "14.00",
            "reason_category": "AUDIT",
            "reason": long_reason,
        },
        format="json",
    )
    assert res_long.status_code == status.HTTP_201_CREATED
    assert len(res_long.data["movement"]["reason"]) <= 255

    # 4. Past movements (prior to month_start) must be excluded from MTD realized revenue
    p2 = sample_inventory_setup["p2"]
    from django.utils import timezone
    past_date = timezone.localtime(timezone.now()).replace(day=1) - timezone.timedelta(days=10)
    StockMovementService.record_movement(
        product=p2,
        location=location,
        movement_type=MovementType.ISSUE,
        quantity=Decimal("-2.00"),
        actor=user,
        reason="Prior month sale",
        effective_at=past_date,
    )
    # Re-query: monthly_realized_revenue must still be 90.00, NOT include the prior month's 16.00
    res_recheck = client.get("/api/v1/reports/summary/")
    assert res_recheck.status_code == status.HTTP_200_OK
    assert Decimal(res_recheck.json()["monthly_realized_revenue"]) == Decimal("90.00")


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


@pytest.mark.django_db
def test_dashboard_summary_zero_inventory_safe(auth_client):
    client, _ = auth_client
    response = client.get("/api/v1/reports/summary/")
    assert response.status_code == status.HTTP_200_OK

    data = response.json()
    assert data["total_active_products"] == 0
    assert Decimal(data["total_inventory_quantity"]) == Decimal("0.00")
    assert Decimal(data["total_inventory_valuation"]) == Decimal("0.00")
    assert Decimal(data["potential_revenue"]) == Decimal("0.00")
    assert Decimal(data["projected_margin"]) == Decimal("0.00")
    assert data["margin_percentage"] == "0.0"
    assert data["gross_margin_percentage"] == "0.0"
    assert data["markup_percentage"] == "0.0"
    assert Decimal(data["incoming_cost"]) == Decimal("0.00")
    assert len(data["valuation_by_location"]) == 0
    assert len(data["valuation_by_category"]) == 0
