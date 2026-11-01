"""
Domain service for aggregating inventory analytics, valuation, and streaming CSV reports.
"""

import csv
import io
from decimal import Decimal
from typing import Any

from django.db.models import F, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.catalog.models import Product
from apps.inventory.models import StockBalance, StockMovement
from apps.purchasing.models import PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus


class ReportsService:
    """
    Business logic for inventory KPIs, stock valuation, and report generation.
    """

    @classmethod
    def get_dashboard_summary(cls) -> dict[str, Any]:
        """
        Aggregate real-time metrics for active products, total stock, valuation,
        threshold alerts, recent movements, and recent procurement orders.
        """
        # 1. Total active products
        total_active_products = Product.objects.filter(is_active=True).count()

        # 2 & 3. Consolidated stock balance aggregations (quantity, cost valuation, retail revenue)
        stock_agg = StockBalance.objects.aggregate(
            total_qty=Sum("current_quantity"),
            valuation=Sum(F("current_quantity") * F("product__purchase_cost")),
            revenue=Sum(F("current_quantity") * F("product__selling_price")),
        )
        total_inventory_quantity = str(stock_agg["total_qty"] or Decimal("0.00"))
        raw_valuation = stock_agg["valuation"] or Decimal("0.0000")
        total_inventory_valuation = str(raw_valuation.quantize(Decimal("0.01")))
        raw_revenue = stock_agg["revenue"] or Decimal("0.0000")
        potential_revenue = str(raw_revenue.quantize(Decimal("0.01")))

        # 3b. Projected gross margin and markup percentage
        raw_margin = raw_revenue - raw_valuation
        projected_margin = str(raw_margin.quantize(Decimal("0.01")))
        margin_percentage = (
            str(((raw_margin / raw_valuation) * Decimal("100")).quantize(Decimal("0.1")))
            if raw_valuation > Decimal("0.00")
            else "0.0"
        )

        # 3c. Incoming procurement costs from open POs (awaiting delivery)
        open_items = PurchaseOrderItem.objects.filter(
            purchase_order__status__in=[
                PurchaseOrderStatus.DRAFT,
                PurchaseOrderStatus.SUBMITTED,
                PurchaseOrderStatus.PARTIALLY_RECEIVED,
            ]
        )
        incoming_agg = open_items.aggregate(
            qty=Sum(F("ordered_quantity") - F("received_quantity")),
            cost=Sum((F("ordered_quantity") - F("received_quantity")) * F("unit_cost")),
        )
        incoming_quantity = str((incoming_agg["qty"] or Decimal("0.00")).quantize(Decimal("0.01")))
        incoming_cost = str((incoming_agg["cost"] or Decimal("0.00")).quantize(Decimal("0.01")))

        # 3d. Valuation breakdown by warehouse location
        loc_balances = (
            StockBalance.objects.filter(current_quantity__gt=Decimal("0.00"))
            .values("location__id", "location__code", "location__name")
            .annotate(
                total_qty=Sum("current_quantity"),
                total_val=Sum(F("current_quantity") * F("product__purchase_cost")),
            )
            .order_by("-total_val")
        )
        valuation_by_location = []
        for lb in loc_balances:
            val = lb["total_val"] or Decimal("0.00")
            share = (
                Decimal("0.0")
                if raw_valuation <= Decimal("0.00")
                else ((val / raw_valuation) * Decimal("100")).quantize(Decimal("0.1"))
            )
            valuation_by_location.append({
                "location_id": str(lb["location__id"]),
                "location_code": lb["location__code"],
                "location_name": lb["location__name"],
                "quantity": str((lb["total_qty"] or Decimal("0.00")).quantize(Decimal("0.01"))),
                "valuation": str(val.quantize(Decimal("0.01"))),
                "share_percentage": str(share),
            })

        # 3e. Valuation breakdown by product category
        cat_balances = (
            StockBalance.objects.filter(current_quantity__gt=Decimal("0.00"))
            .values("product__category__id", "product__category__name")
            .annotate(
                total_qty=Sum("current_quantity"),
                total_val=Sum(F("current_quantity") * F("product__purchase_cost")),
            )
            .order_by("-total_val")
        )
        valuation_by_category = []
        for cb in cat_balances:
            val = cb["total_val"] or Decimal("0.00")
            share = (
                Decimal("0.0")
                if raw_valuation <= Decimal("0.00")
                else ((val / raw_valuation) * Decimal("100")).quantize(Decimal("0.1"))
            )
            valuation_by_category.append({
                "category_id": str(cb["product__category__id"]) if cb["product__category__id"] else None,
                "category_name": cb["product__category__name"] or "Uncategorized",
                "quantity": str((cb["total_qty"] or Decimal("0.00")).quantize(Decimal("0.01"))),
                "valuation": str(val.quantize(Decimal("0.01"))),
                "share_percentage": str(share),
            })

        # 4. Stock threshold alerts
        products_annotated = Product.objects.filter(is_active=True).annotate(
            total_on_hand=Coalesce(Sum("stock_balances__current_quantity"), Decimal("0.00"))
        )
        low_stock_count = products_annotated.filter(
            total_on_hand__gt=0,
            total_on_hand__lte=F("reorder_threshold"),
        ).count()
        out_of_stock_count = products_annotated.filter(total_on_hand__lte=Decimal("0.00")).count()

        # 5. Recent 5 stock movements
        recent_movements_qs = StockMovement.objects.select_related(
            "product", "location", "actor"
        ).order_by("-created_at")[:5]

        recent_movements = [
            {
                "id": str(m.id),
                "movement_reference": m.movement_reference,
                "movement_type": m.movement_type,
                "movement_type_display": m.get_movement_type_display(),
                "quantity": str(m.quantity),
                "product_name": m.product.name,
                "product_sku": m.product.sku,
                "location_name": m.location.name,
                "location_code": m.location.code,
                "actor_username": m.actor.username if m.actor else "System",
                "created_at": m.created_at.isoformat(),
            }
            for m in recent_movements_qs
        ]

        # 6. Recent 5 purchase orders
        recent_pos_qs = PurchaseOrder.objects.select_related("supplier").order_by("-created_at")[:5]

        recent_purchase_orders = [
            {
                "id": str(po.id),
                "order_reference": po.order_reference,
                "supplier_name": po.supplier.name,
                "status": po.status,
                "status_display": po.get_status_display(),
                "total_amount": str(po.total_cost),
                "order_date": po.order_date.isoformat(),
                "created_at": po.created_at.isoformat(),
            }
            for po in recent_pos_qs
        ]

        return {
            "total_active_products": total_active_products,
            "total_inventory_quantity": total_inventory_quantity,
            "total_inventory_valuation": total_inventory_valuation,
            "potential_revenue": potential_revenue,
            "projected_margin": projected_margin,
            "margin_percentage": margin_percentage,
            "incoming_cost": incoming_cost,
            "incoming_quantity": incoming_quantity,
            "valuation_by_location": valuation_by_location,
            "valuation_by_category": valuation_by_category,
            "low_stock_count": low_stock_count,
            "out_of_stock_count": out_of_stock_count,
            "recent_movements": recent_movements,
            "recent_purchase_orders": recent_purchase_orders,
            "server_timestamp": timezone.now().isoformat(),
        }

    @classmethod
    def generate_balances_csv(cls) -> str:
        """
        Generate CSV export for all current location stock balances and valuation.
        """
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "Product SKU",
                "Product Name",
                "Category",
                "Location Code",
                "Location Name",
                "On Hand Quantity",
                "Unit of Measure",
                "Unit Cost",
                "Total Valuation",
                "Last Updated",
            ]
        )

        balances = StockBalance.objects.select_related(
            "product", "product__category", "location"
        ).order_by("product__sku", "location__code")

        for b in balances:
            cost = b.product.purchase_cost
            val = (b.current_quantity * cost).quantize(Decimal("0.01"))
            writer.writerow(
                [
                    b.product.sku,
                    b.product.name,
                    b.product.category.name if b.product.category else "Uncategorized",
                    b.location.code,
                    b.location.name,
                    str(b.current_quantity),
                    b.product.unit_of_measure,
                    str(cost),
                    str(val),
                    b.updated_at.isoformat(),
                ]
            )

        return output.getvalue()

    @classmethod
    def generate_low_stock_csv(cls) -> str:
        """
        Generate CSV export of products below or at reorder thresholds.
        """
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "Product SKU",
                "Product Name",
                "Category",
                "Total On Hand",
                "Reorder Threshold",
                "Unit of Measure",
                "Status",
            ]
        )

        products = (
            Product.objects.filter(is_active=True)
            .select_related("category")
            .annotate(
                total_on_hand=Coalesce(Sum("stock_balances__current_quantity"), Decimal("0.00"))
            )
            .filter(total_on_hand__lte=F("reorder_threshold"))
            .order_by("total_on_hand", "name")
        )

        for p in products:
            status = "OUT OF STOCK" if p.total_on_hand <= Decimal("0.00") else "LOW STOCK"
            writer.writerow(
                [
                    p.sku,
                    p.name,
                    p.category.name if p.category else "Uncategorized",
                    str(p.total_on_hand),
                    str(p.reorder_threshold),
                    p.unit_of_measure,
                    status,
                ]
            )

        return output.getvalue()

    @classmethod
    def generate_movements_csv(
        cls, start_date: str | None = None, end_date: str | None = None
    ) -> str:
        """
        Generate CSV audit export of stock ledger transactions.
        """
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "Movement Reference",
                "Movement Type",
                "Product SKU",
                "Product Name",
                "Location Code",
                "Quantity",
                "Actor",
                "Reason / Notes",
                "Effective At",
                "Created At",
            ]
        )

        qs = StockMovement.objects.select_related("product", "location", "actor").order_by(
            "-effective_at", "-created_at"
        )

        if start_date:
            qs = qs.filter(effective_at__gte=start_date)
        if end_date:
            qs = qs.filter(effective_at__lte=end_date)

        for m in qs:
            writer.writerow(
                [
                    m.movement_reference,
                    m.movement_type,
                    m.product.sku,
                    m.product.name,
                    m.location.code,
                    str(m.quantity),
                    m.actor.username if m.actor else "System",
                    m.reason or "",
                    m.effective_at.isoformat(),
                    m.created_at.isoformat(),
                ]
            )

        return output.getvalue()
