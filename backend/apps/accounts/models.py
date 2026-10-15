"""
Custom User and Role models for Uniflow accounts.
"""
import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class UserRole(models.TextChoices):
    ADMIN = "ADMIN", "Administrator"
    MANAGER = "MANAGER", "Inventory Manager"
    STAFF = "STAFF", "Inventory Staff"
    VIEWER = "VIEWER", "Viewer"


class User(AbstractUser):
    """
    Custom User model with a UUID primary key and explicit role assignments.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(
        max_length=32,
        choices=UserRole.choices,
        default=UserRole.STAFF,
        help_text="Role determining application permissions and capabilities.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "users"
        verbose_name = "User"
        verbose_name_plural = "Users"
        ordering = ["username"]

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"
