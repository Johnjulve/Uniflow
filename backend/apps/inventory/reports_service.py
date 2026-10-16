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
from apps.purchasing.models import PurchaseOrder


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

        # 2. Total physical quantity across all locations
        total_qty_agg = StockBalance.objects.aggregate(total=Sum("current_quantity"))["total"]
        total_inventory_quantity = str(total_qty_agg or Decimal("0.00"))

        # 3. Total inventory valuation (Quantity * Purchase Cost)
        valuation_agg = StockBalance.objects.aggregate(
            valuation=Sum(F("current_quantity") * F("product__purchase_cost"))
        )["valuation"]
        raw_valuation = valuation_agg or Decimal("0.0000")
        total_inventory_valuation = str(raw_valuation.quantize(Decimal("0.01")))

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
                "total_amount": str(po.total_amount),
                "order_date": po.order_date.isoformat(),
                "created_at": po.created_at.isoformat(),
            }
            for po in recent_pos_qs
        ]

        return {
            "total_active_products": total_active_products,
            "total_inventory_quantity": total_inventory_quantity,
            "total_inventory_valuation": total_inventory_valuation,
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
