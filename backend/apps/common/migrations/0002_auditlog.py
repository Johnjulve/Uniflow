# Generated for Uniflow IMS Phase 8/9 Audit Trail

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AuditLog",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "actor_username",
                    models.CharField(db_index=True, default="system", max_length=150),
                ),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("LOGIN", "User Login"),
                            ("LOGOUT", "User Logout"),
                            ("LOGIN_FAILED", "Failed Login Attempt"),
                            ("CREATED", "Record Created"),
                            ("UPDATED", "Record Updated"),
                            ("STATUS_CHANGED", "Status / Role Changed"),
                            ("DELETED", "Record Deleted"),
                        ],
                        db_index=True,
                        max_length=32,
                    ),
                ),
                ("entity_type", models.CharField(db_index=True, max_length=64)),
                ("entity_id", models.CharField(db_index=True, max_length=64)),
                ("summary", models.CharField(max_length=255)),
                ("changes", models.JSONField(blank=True, default=dict)),
                ("ip_address", models.CharField(blank=True, default="", max_length=64)),
                ("source", models.CharField(db_index=True, default="API", max_length=32)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="audit_logs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Audit Log",
                "verbose_name_plural": "Audit Logs",
                "db_table": "audit_logs",
                "ordering": ["-created_at"],
            },
        ),
    ]
