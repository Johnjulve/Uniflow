"""
Abstract base models and cross-domain system models for Uniflow apps.
"""
import uuid

from django.core.exceptions import ValidationError
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


class AuditAction(models.TextChoices):
    LOGIN = "LOGIN", "User Login"
    LOGOUT = "LOGOUT", "User Logout"
    LOGIN_FAILED = "LOGIN_FAILED", "Failed Login Attempt"
    CREATED = "CREATED", "Record Created"
    UPDATED = "UPDATED", "Record Updated"
    STATUS_CHANGED = "STATUS_CHANGED", "Status / Role Changed"
    DELETED = "DELETED", "Record Deleted"


class ImmutableAuditQuerySet(models.QuerySet):
    """
    Prevents bulk QuerySet .update() or .delete() calls on AuditLog records.
    """
    def delete(self):
        raise ValidationError("AuditLog entries are immutable and cannot be deleted.")

    def update(self, **kwargs):
        raise ValidationError("AuditLog entries are immutable and cannot be modified.")


class AuditLog(UUIDModel):
    """
    Immutable system audit trail recording access events, additions, edits,
    status/role changes, and deletions across both API and Django Admin.
    """
    actor = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    actor_username = models.CharField(max_length=150, default="system", db_index=True)
    action = models.CharField(max_length=32, choices=AuditAction.choices, db_index=True)
    entity_type = models.CharField(max_length=64, db_index=True)
    entity_id = models.CharField(max_length=64, db_index=True)
    summary = models.CharField(max_length=255)
    changes = models.JSONField(default=dict, blank=True)
    ip_address = models.CharField(max_length=64, blank=True, default="")
    source = models.CharField(max_length=32, default="API", db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    objects = ImmutableAuditQuerySet.as_manager()

    class Meta:
        db_table = "audit_logs"
        verbose_name = "Audit Log"
        verbose_name_plural = "Audit Logs"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"[{self.created_at:%Y-%m-%d %H:%M:%S}] {self.actor_username} - {self.action} {self.entity_type}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("AuditLog entries are immutable and cannot be modified.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("AuditLog entries are immutable and cannot be deleted.")
