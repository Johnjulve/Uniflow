"""
Automated audit logging middleware, model change diff signals, and Django Admin registration.
Captures access events, creations, edits, status/role updates, and deletions across both API and /admin/.
"""
from contextvars import ContextVar
import logging
from typing import Any

from django.contrib import admin
from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver
from rest_framework.authtoken.models import Token

from apps.accounts.models import User
from apps.catalog.models import Category, Product
from apps.common.models import AuditAction, AuditLog
from apps.inventory.models import Location
from apps.purchasing.models import PurchaseOrder, Supplier

logger = logging.getLogger(__name__)
_audit_ctx: ContextVar[dict[str, Any] | None] = ContextVar("_audit_ctx", default=None)

AUDITED_FIELDS: dict[type, list[str]] = {
    User: ["username", "email", "first_name", "last_name", "role", "is_active", "is_staff", "is_superuser"],
    Category: ["name", "slug", "parent_id", "description", "is_active"],
    Product: [
        "sku",
        "barcode",
        "name",
        "category_id",
        "unit_of_measure",
        "purchase_cost",
        "selling_price",
        "reorder_threshold",
        "is_active",
        "archived_at",
    ],
    Location: ["code", "name", "is_active"],
    Supplier: ["name", "contact_name", "email", "phone", "is_active"],
    PurchaseOrder: ["order_reference", "status", "expected_date"],
}

STATUS_FIELDS = {"role", "is_active", "is_staff", "is_superuser", "archived_at", "status", "password"}


def _resolve_request_actor(request) -> User | None:
    user = getattr(request, "user", None)
    if user and getattr(user, "is_authenticated", False):
        return user
    auth_header = request.META.get("HTTP_AUTHORIZATION", "")
    if auth_header.startswith("Token "):
        token_key = auth_header[6:].strip()
        token_obj = Token.objects.select_related("user").filter(key=token_key).first()
        if token_obj and token_obj.user.is_active:
            return token_obj.user
    return None


def _log_api_auth_response(request, response, pre_actor: User | None) -> None:
    if request.method != "POST" or response.status_code != 200:
        return
    clean_path = request.path.rstrip("/")
    if clean_path == "/api/v1/auth/login":
        token_key = getattr(response, "data", {}).get("token")
        token_obj = Token.objects.select_related("user").filter(key=token_key).first() if token_key else None
        if token_obj:
            record_audit_event(
                action=AuditAction.LOGIN,
                entity_type="User",
                entity_id=str(token_obj.user.pk),
                summary=f"User '{token_obj.user.username}' signed in via API",
                explicit_actor=token_obj.user,
            )
    elif clean_path == "/api/v1/auth/logout" and pre_actor:
        record_audit_event(
            action=AuditAction.LOGOUT,
            entity_type="User",
            entity_id=str(pre_actor.pk),
            summary=f"User '{pre_actor.username}' signed out via API",
            explicit_actor=pre_actor,
        )


class AuditContextMiddleware:
    """
    Captures the active request actor, IP address, and entry source (DJANGO_ADMIN vs API)
    so ORM signals log accurate attribution even when modified inside Django /admin/.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
        ip_addr = xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR", "")
        source = "DJANGO_ADMIN" if request.path.startswith("/admin") else "API"
        pre_actor = _resolve_request_actor(request) if request.path.rstrip("/") == "/api/v1/auth/logout" else None
        token = _audit_ctx.set({"request": request, "ip": ip_addr, "source": source})
        try:
            response = self.get_response(request)
            _log_api_auth_response(request, response, pre_actor)
            return response
        finally:
            _audit_ctx.reset(token)


def get_audit_context(explicit_actor: User | None = None) -> tuple[User | None, str, str, str]:
    ctx = _audit_ctx.get() or {}
    req = ctx.get("request")
    actor = explicit_actor or (_resolve_request_actor(req) if req else None)
    username = actor.username if actor else "system"
    return actor, username, ctx.get("ip", ""), ctx.get("source", "API")


def record_audit_event(
    *,
    action: str,
    entity_type: str,
    entity_id: str,
    summary: str,
    changes: dict[str, Any] | None = None,
    explicit_actor: User | None = None,
    explicit_username: str | None = None,
) -> None:
    actor, username, ip_addr, source = get_audit_context(explicit_actor)
    try:
        AuditLog.objects.create(
            actor=actor,
            actor_username=explicit_username or username,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            summary=summary[:255],
            changes=changes or {},
            ip_address=ip_addr,
            source=source,
        )
    except Exception:
        # Never crash primary business or migration transactions if audit table is initializing
        logger.warning("Failed to write AuditLog for %s (%s)", entity_type, entity_id, exc_info=True)


def _snapshot_instance(instance, fields: list[str]) -> dict[str, Any]:
    return {f: str(getattr(instance, f)) if getattr(instance, f) is not None else None for f in fields}


def _get_entity_label(instance) -> str:
    for attr in ("username", "sku", "code", "name", "order_reference"):
        val = getattr(instance, attr, None)
        if val:
            return str(val)
    return str(instance.pk)


def _compute_model_diff(sender, instance, after: dict[str, Any]) -> dict[str, Any]:
    fields = AUDITED_FIELDS.get(sender, [])
    before = getattr(instance, "_audit_before", None) or {}
    diff = {
        f: {"from": before.get(f), "to": after.get(f)}
        for f in fields
        if before.get(f) != after.get(f)
    }
    if sender is User:
        pw_before = getattr(instance, "_audit_pw_before", None)
        if pw_before and pw_before != instance.password:
            diff["password"] = {"from": "***", "to": "***"}
    return diff


@receiver(pre_save, sender=User)
@receiver(pre_save, sender=Category)
@receiver(pre_save, sender=Product)
@receiver(pre_save, sender=Location)
@receiver(pre_save, sender=Supplier)
@receiver(pre_save, sender=PurchaseOrder)
def capture_pre_save_snapshot(sender, instance, **kwargs):
    if instance._state.adding or not instance.pk:
        instance._audit_before = None
        instance._audit_pw_before = None
        return
    fields = AUDITED_FIELDS.get(sender, [])
    old = sender.objects.filter(pk=instance.pk).first()
    instance._audit_before = _snapshot_instance(old, fields) if old else None
    instance._audit_pw_before = getattr(old, "password", None) if old and sender is User else None


@receiver(post_save, sender=User)
@receiver(post_save, sender=Category)
@receiver(post_save, sender=Product)
@receiver(post_save, sender=Location)
@receiver(post_save, sender=Supplier)
@receiver(post_save, sender=PurchaseOrder)
def log_model_save(sender, instance, created: bool, **kwargs):
    after = _snapshot_instance(instance, AUDITED_FIELDS.get(sender, []))
    entity_name = sender.__name__
    label = _get_entity_label(instance)
    if created:
        record_audit_event(
            action=AuditAction.CREATED,
            entity_type=entity_name,
            entity_id=str(instance.pk),
            summary=f"Created {entity_name} '{label}'",
            changes={"created": after},
        )
        return
    diff = _compute_model_diff(sender, instance, after)
    if not diff:
        return
    action = AuditAction.STATUS_CHANGED if any(f in STATUS_FIELDS for f in diff) else AuditAction.UPDATED
    record_audit_event(
        action=action,
        entity_type=entity_name,
        entity_id=str(instance.pk),
        summary=f"Updated {entity_name} '{label}' ({', '.join(diff.keys())})",
        changes=diff,
    )


@receiver(post_delete, sender=User)
@receiver(post_delete, sender=Category)
@receiver(post_delete, sender=Product)
@receiver(post_delete, sender=Location)
@receiver(post_delete, sender=Supplier)
@receiver(post_delete, sender=PurchaseOrder)
def log_model_delete(sender, instance, **kwargs):
    fields = AUDITED_FIELDS.get(sender, [])
    entity_name = sender.__name__
    label = _get_entity_label(instance)
    record_audit_event(
        action=AuditAction.DELETED,
        entity_type=entity_name,
        entity_id=str(instance.pk),
        summary=f"Deleted {entity_name} '{label}'",
        changes={"deleted": _snapshot_instance(instance, fields)},
    )


@receiver(user_logged_in)
def log_session_login(sender, request, user, **kwargs):
    record_audit_event(
        action=AuditAction.LOGIN,
        entity_type="User",
        entity_id=str(user.pk),
        summary=f"User '{user.username}' signed in",
        explicit_actor=user,
    )


@receiver(user_logged_out)
def log_session_logout(sender, request, user, **kwargs):
    if not user:
        return
    record_audit_event(
        action=AuditAction.LOGOUT,
        entity_type="User",
        entity_id=str(user.pk),
        summary=f"User '{user.username}' signed out",
        explicit_actor=user,
    )


@receiver(user_login_failed)
def log_failed_login(sender, credentials, request, **kwargs):
    attempted = str(credentials.get("username", "unknown"))
    record_audit_event(
        action=AuditAction.LOGIN_FAILED,
        entity_type="Auth",
        entity_id=attempted,
        summary=f"Failed login attempt for username '{attempted}'",
        explicit_username=attempted,
    )


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    actions = None
    list_display = ("created_at", "actor_username", "source", "action", "entity_type", "summary", "ip_address")
    list_filter = ("action", "entity_type", "source")
    search_fields = ("actor_username", "summary", "entity_id")
    readonly_fields = (
        "id",
        "created_at",
        "actor",
        "actor_username",
        "source",
        "action",
        "entity_type",
        "entity_id",
        "summary",
        "changes",
        "ip_address",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


for _domain_model in (User, Category, Product, Location, Supplier, PurchaseOrder):
    if _domain_model not in admin.site._registry:
        admin.site.register(_domain_model)
