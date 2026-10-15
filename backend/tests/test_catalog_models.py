"""
Unit tests for catalog domain models (Category, Product).
"""
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.db.models import ProtectedError

from apps.catalog.models import Category, Product


@pytest.fixture
def root_category(db):
    return Category.objects.create(
        name="Electronics",
        description="Electronic devices and components",
    )


@pytest.fixture
def sub_category(db, root_category):
    return Category.objects.create(
        name="Audio",
        parent=root_category,
        description="Headphones and audio equipment",
    )


@pytest.mark.django_db
def test_category_creation_and_slug(root_category, sub_category):
    assert root_category.slug == "electronics"
    assert sub_category.slug == "audio"
    assert sub_category.parent == root_category
    assert str(sub_category) == "Electronics > Audio"


@pytest.mark.django_db
def test_category_cannot_parent_itself(root_category):
    root_category.parent = root_category
    with pytest.raises(ValidationError):
        root_category.save()


@pytest.mark.django_db
def test_product_creation_and_attributes(sub_category):
    product = Product.objects.create(
        sku="SKU-HDPH-001",
        barcode="1234567890123",
        name="Wireless Noise-Canceling Headphones",
        category=sub_category,
        purchase_cost=Decimal("45.5000"),
        selling_price=Decimal("99.9900"),
        reorder_threshold=Decimal("10.00"),
    )
    assert product.sku == "SKU-HDPH-001"
    assert product.is_active is True
    assert product.is_archived is False
    assert str(product) == "SKU-HDPH-001 - Wireless Noise-Canceling Headphones"


@pytest.mark.django_db
def test_product_unique_sku_constraint(sub_category):
    Product.objects.create(
        sku="SKU-UNIQUE-01",
        name="Item One",
        category=sub_category,
    )
    with pytest.raises((ValidationError, IntegrityError)):
        Product.objects.create(
            sku="SKU-UNIQUE-01",
            name="Item Duplicate",
            category=sub_category,
        )


@pytest.mark.django_db
def test_product_negative_pricing_rejected(sub_category):
    with pytest.raises(ValidationError):
        Product.objects.create(
            sku="SKU-NEG-01",
            name="Negative Cost Item",
            category=sub_category,
            purchase_cost=Decimal("-10.0000"),
        )

    with pytest.raises(ValidationError):
        Product.objects.create(
            sku="SKU-NEG-02",
            name="Negative Price Item",
            category=sub_category,
            selling_price=Decimal("-5.0000"),
        )


@pytest.mark.django_db
def test_product_archival_lifecycle(sub_category):
    product = Product.objects.create(
        sku="SKU-ARCH-01",
        name="Archivable Product",
        category=sub_category,
    )
    assert not product.is_archived
    assert product.is_active

    # Archive product
    product.archive()
    product.refresh_from_db()
    assert product.is_archived
    assert not product.is_active
    assert product.archived_at is not None

    # Unarchive product
    product.unarchive()
    product.refresh_from_db()
    assert not product.is_archived
    assert product.is_active
    assert product.archived_at is None


@pytest.mark.django_db
def test_category_protected_from_deletion_with_products(sub_category):
    Product.objects.create(
        sku="SKU-PROT-01",
        name="Protected Item",
        category=sub_category,
    )
    with pytest.raises(ProtectedError):
        sub_category.delete()
