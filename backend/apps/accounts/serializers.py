"""
Serializers for accounts authentication and profile management.
"""
from django.contrib.auth import authenticate
from rest_framework import serializers

from apps.accounts.models import User, UserRole


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

        if not user.is_active:
            raise serializers.ValidationError(
                {"detail": "User account is inactive or disabled."},
                code="ACCOUNT_INACTIVE",
            )

        attrs["user"] = user
        return attrs


class LoginResponseSerializer(serializers.Serializer):
    """
    Response schema returning authentication token and profile summary.
    """
    token = serializers.CharField()
    user = UserProfileSerializer()
