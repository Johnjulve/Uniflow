"""
Abstract base models for Uniflow apps.
"""
import uuid

from django.db import models


class TimeStampedModel(models.Model):
    """
    Abstract base model providing self-updating created_at and updated_at fields.
    All business models across Uniflow should inherit from this.
    """
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class UUIDModel(models.Model):
    """
    Abstract base model providing a UUIDv4 primary key.
    Ensures safe distributed identifier generation for offline-first sync.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True
