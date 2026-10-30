"""
REST API ViewSets for the product catalog domain.
"""
from django.db.models import Count, ProtectedError, Sum
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrReadOnly
from apps.catalog.models import Category, Product
from apps.catalog.serializers import (
    CategorySerializer,
    CategoryTreeSerializer,
    ProductSerializer,
)


@extend_schema_view(
    list=extend_schema(description="List all categories with parent names and product counts.", tags=["Catalog"]),
    retrieve=extend_schema(description="Retrieve details of a single category.", tags=["Catalog"]),
    create=extend_schema(description="Create a new product category.", tags=["Catalog"]),
    update=extend_schema(description="Update an existing product category.", tags=["Catalog"]),
    partial_update=extend_schema(description="Partially update a product category.", tags=["Catalog"]),
    destroy=extend_schema(description="Delete a category (only permitted if no products are associated).", tags=["Catalog"]),
)
class CategoryViewSet(viewsets.ModelViewSet):
    """
    CRUD viewset for product categories with tree view support and safe deletion guard.
    """
    queryset = Category.objects.all().select_related("parent").annotate(
        annotated_products_count=Count("products")
    )
    serializer_class = CategorySerializer
    permission_classes = [IsManagerOrReadOnly]
    filterset_fields = ["is_active", "parent"]
    search_fields = ["name", "slug"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def perform_destroy(self, instance: Category):
        if instance.products.exists():
            raise ValidationError(
                {"detail": "Category cannot be deleted while products are assigned to it."},
                code="CATEGORY_IN_USE",
            )
        try:
            super().perform_destroy(instance)
        except ProtectedError as exc:
            raise ValidationError(
                {"detail": "Category cannot be deleted while products are assigned to it."},
                code="CATEGORY_IN_USE",
            ) from exc

    @extend_schema(
        description="Returns hierarchical category tree starting from root categories.",
        responses={status.HTTP_200_OK: CategoryTreeSerializer(many=True)},
        tags=["Catalog"],
    )
    @action(detail=False, methods=["get"])
    def tree(self, request):
        root_categories = Category.objects.filter(parent__isnull=True, is_active=True).prefetch_related("children")
        serializer = CategoryTreeSerializer(root_categories, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


@extend_schema_view(
    list=extend_schema(
        description="List products with filtering, search, and pagination.",
        parameters=[
            OpenApiParameter(
                name="include_archived",
                type=bool,
                location=OpenApiParameter.QUERY,
                description="Include archived products in results (defaults to false).",
            ),
        ],
        tags=["Catalog"],
    ),
    retrieve=extend_schema(description="Retrieve full details for a product.", tags=["Catalog"]),
    create=extend_schema(description="Create a new inventory product record.", tags=["Catalog"]),
    update=extend_schema(description="Update product metadata and pricing.", tags=["Catalog"]),
    partial_update=extend_schema(description="Partially update product details.", tags=["Catalog"]),
    destroy=extend_schema(
        description="Delete a product (rejected with 400/409 if transaction history exists).",
        tags=["Catalog"],
    ),
)
class ProductViewSet(viewsets.ModelViewSet):
    """
    CRUD viewset for products with lifecycle archival support.
    """
    queryset = Product.objects.all().select_related("category").annotate(
        annotated_total_on_hand=Sum("stock_balances__current_quantity")
    )
    serializer_class = ProductSerializer
    permission_classes = [IsManagerOrReadOnly]
    filterset_fields = ["category", "is_active", "unit_of_measure"]
    search_fields = ["sku", "name", "barcode"]
    ordering_fields = ["name", "sku", "selling_price", "purchase_cost", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        qs = super().get_queryset()
        include_archived = self.request.query_params.get("include_archived", "").lower() in ("true", "1", "yes")
        if not include_archived:
            qs = qs.filter(archived_at__isnull=True)
        return qs

    def perform_destroy(self, instance: Product):
        has_movements = hasattr(instance, "stock_movements") and instance.stock_movements.exists()
        has_po_items = hasattr(instance, "purchase_order_items") and instance.purchase_order_items.exists()

        if has_movements or has_po_items:
            raise ValidationError(
                {"detail": "Product cannot be deleted because historical transactions exist. Archive the product instead."},
                code="PRODUCT_HAS_HISTORY",
            )
        super().perform_destroy(instance)

    @extend_schema(
        request=None,
        responses={
            status.HTTP_200_OK: ProductSerializer,
            status.HTTP_400_BAD_REQUEST: OpenApiResponse(description="Product already archived"),
        },
        description="Soft-archive a product to preserve historical audit records without showing in active lists.",
        tags=["Catalog"],
    )
    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        product = self.get_object()
        if product.is_archived:
            return Response(
                {"detail": "Product is already archived."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        product.archive()
        serializer = self.get_serializer(product)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        request=None,
        responses={
            status.HTTP_200_OK: ProductSerializer,
            status.HTTP_400_BAD_REQUEST: OpenApiResponse(description="Product is not archived"),
        },
        description="Restore an archived product back to active inventory status.",
        tags=["Catalog"],
    )
    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        product = get_object_or_404(Product, pk=pk)
        self.check_object_permissions(request, product)
        if not product.is_archived:
            return Response(
                {"detail": "Product is not archived."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        product.unarchive()
        serializer = self.get_serializer(product)
        return Response(serializer.data, status=status.HTTP_200_OK)
