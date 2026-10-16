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


class SyncOperationStatus(models.TextChoices):
    COMMITTED = "COMMITTED", "Committed"
    REJECTED = "REJECTED", "Rejected"


class SyncMetadata(TimeStampedModel):
    """
    Server-side record of processed client offline mutations.
    Ensures absolute idempotency: duplicate client_operation_id submissions
    return cached results without re-executing transactions.
    """
    client_operation_id = models.UUIDField(unique=True, db_index=True)
    actor = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="synced_operations",
    )
    operation_type = models.CharField(max_length=64, db_index=True)
    status = models.CharField(
        max_length=32,
        choices=SyncOperationStatus.choices,
        db_index=True,
    )
    response_payload = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default="")
    processed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "sync_metadata"
        verbose_name = "Sync Metadata"
        verbose_name_plural = "Sync Metadata Records"
        ordering = ["-processed_at"]

    def __str__(self) -> str:
        return f"{self.operation_type} ({self.client_operation_id}) - {self.status}"
