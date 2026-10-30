"""
Serializers for accounts authentication and profile management.
"""
from django.contrib.auth import authenticate
from django.db import IntegrityError, transaction
from rest_framework import serializers
from rest_framework.authtoken.models import Token

from apps.accounts.models import User, UserRole
from apps.common.models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    """
    Read-only serializer for immutable system and admin audit log entries.
    """
    action_display = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor_username",
            "action",
            "action_display",
            "entity_type",
            "entity_id",
            "summary",
            "changes",
            "ip_address",
            "source",
            "created_at",
        ]
        read_only_fields = fields


class UserProfileSerializer(serializers.ModelSerializer):
    """
    Serializer providing authenticated user profile and capability summary.
    """
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    can_manage_users = serializers.SerializerMethodField()
    can_manage_stock = serializers.SerializerMethodField()
    can_manage_purchasing = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "role_display",
            "is_active",
            "can_manage_users",
            "can_manage_stock",
            "can_manage_purchasing",
            "date_joined",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_can_manage_users(self, obj: User) -> bool:
        return obj.role == UserRole.ADMIN or obj.is_superuser

    def get_can_manage_stock(self, obj: User) -> bool:
        return obj.role in (UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF) or obj.is_superuser

    def get_can_manage_purchasing(self, obj: User) -> bool:
        return obj.role in (UserRole.ADMIN, UserRole.MANAGER) or obj.is_superuser


class LoginRequestSerializer(serializers.Serializer):
    """
    Request payload validating user credentials for authentication.
    """
    username = serializers.CharField(required=True, trim_whitespace=True)
    password = serializers.CharField(
        required=True,
        write_only=True,
        style={"input_type": "password"},
    )

    def validate(self, attrs):
        username = attrs.get("username")
        password = attrs.get("password")

        user = authenticate(
            request=self.context.get("request"),
            username=username,
            password=password,
        )

        if not user:
            raise serializers.ValidationError(
                {"detail": "Invalid username or password."},
                code="INVALID_CREDENTIALS",
            )

        attrs["user"] = user
        return attrs


class LoginResponseSerializer(serializers.Serializer):
    """
    Response schema returning authentication token and profile summary.
    """
    token = serializers.CharField()
    user = UserProfileSerializer()


class BaseAdminUserWriteSerializer(serializers.ModelSerializer):
    """
    Shared base serializer for admin user creation and updates.
    """
    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def to_representation(self, instance: User) -> dict:
        return UserProfileSerializer(instance, context=self.context).data


class UserCreateSerializer(BaseAdminUserWriteSerializer):
    """
    Serializer for administrators to provision new user accounts.
    """
    password = serializers.CharField(
        write_only=True,
        required=True,
        min_length=8,
        style={"input_type": "password"},
    )

    class Meta:
        model = User
        fields = [
            "username",
            "password",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
        ]

    def validate_username(self, value: str) -> str:
        clean_username = value.strip()
        if User.objects.filter(username__iexact=clean_username).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return clean_username

    def create(self, validated_data: dict) -> User:
        password = validated_data.pop("password")
        try:
            with transaction.atomic():
                return User.objects.create_user(password=password, **validated_data)
        except IntegrityError as exc:
            raise serializers.ValidationError(
                {"username": "A user with this username already exists."}
            ) from exc


class UserUpdateSerializer(BaseAdminUserWriteSerializer):
    """
    Serializer for administrators to update roles, active status, or credentials.
    """
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=False,
        min_length=8,
        style={"input_type": "password"},
    )

    class Meta:
        model = User
        fields = [
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "password",
        ]

    def validate(self, attrs: dict) -> dict:
        request = self.context.get("request")
        if not (request and self.instance and request.user.id == self.instance.id):
            return attrs

        if attrs.get("is_active") is False:
            raise serializers.ValidationError(
                {"is_active": "You cannot deactivate your own active administrator account."}
            )
        if (
            "role" in attrs
            and self.instance.role == UserRole.ADMIN
            and attrs["role"] != UserRole.ADMIN
        ):
            raise serializers.ValidationError(
                {"role": "You cannot demote your own administrator role."}
            )
        return attrs

    @transaction.atomic
    def update(self, instance: User, validated_data: dict) -> User:
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        if not instance.is_active:
            Token.objects.filter(user=instance).delete()
        return instance
