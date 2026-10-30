"""
Authentication, profile, and user management API views for accounts.
"""
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import mixins, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.permissions import IsAdminRole
from apps.accounts.serializers import (
    AuditLogSerializer,
    LoginRequestSerializer,
    LoginResponseSerializer,
    UserCreateSerializer,
    UserProfileSerializer,
    UserUpdateSerializer,
)
from apps.common.models import AuditLog


class LoginView(APIView):
    """
    Authenticate user credentials and issue an authoritative session token.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        request=LoginRequestSerializer,
        responses={
            status.HTTP_200_OK: LoginResponseSerializer,
            status.HTTP_400_BAD_REQUEST: OpenApiResponse(description="Invalid credentials or inactive account"),
        },
        description="Authenticates username and password, returning an API token and user profile.",
        tags=["Authentication"],
    )
    def post(self, request, *args, **kwargs):
        serializer = LoginRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)

        user_data = UserProfileSerializer(user).data
        return Response(
            {
                "token": token.key,
                "user": user_data,
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """
    Revoke the active authentication token for the authenticated user.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=None,
        responses={
            status.HTTP_200_OK: OpenApiResponse(description="Successfully logged out"),
            status.HTTP_401_UNAUTHORIZED: OpenApiResponse(description="Authentication required"),
        },
        description="Deletes the active token for the requesting user, terminating the session.",
        tags=["Authentication"],
    )
    def post(self, request, *args, **kwargs):
        Token.objects.filter(user=request.user).delete()
        return Response(
            {"detail": "Successfully logged out."},
            status=status.HTTP_200_OK,
        )


class CurrentUserView(APIView):
    """
    Retrieve profile details and capability flags for the currently authenticated user.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            status.HTTP_200_OK: UserProfileSerializer,
            status.HTTP_401_UNAUTHORIZED: OpenApiResponse(description="Authentication required"),
        },
        description="Returns identity, role, and operational capabilities of the active session.",
        tags=["Authentication"],
    )
    def get(self, request, *args, **kwargs):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)


@extend_schema_view(
    list=extend_schema(description="List user accounts with role and status filtering.", tags=["Users"]),
    retrieve=extend_schema(description="Retrieve a single user account profile.", tags=["Users"]),
    create=extend_schema(description="Provision a new user account (Admin only).", tags=["Users"]),
    update=extend_schema(description="Update user account details, role, or status (Admin only).", tags=["Users"]),
    partial_update=extend_schema(description="Partially update user account role, status, or password (Admin only).", tags=["Users"]),
)
class UserViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    Administrator ViewSet for managing user accounts and role assignments.
    Hard deletion is disabled to preserve audit and ledger foreign-key integrity.
    """
    queryset = User.objects.all().order_by("username")
    permission_classes = [IsAdminRole]
    filterset_fields = ["role", "is_active"]
    search_fields = ["username", "email", "first_name", "last_name"]
    ordering_fields = ["username", "role", "created_at", "date_joined"]
    ordering = ["username"]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in ("update", "partial_update"):
            return UserUpdateSerializer
        return UserProfileSerializer


@extend_schema_view(
    list=extend_schema(description="List immutable audit trail events (Admin only).", tags=["Audit Logs"]),
    retrieve=extend_schema(description="Retrieve single audit log entry (Admin only).", tags=["Audit Logs"]),
)
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Administrator read-only endpoint for inspecting system and admin audit trail records.
    """
    queryset = AuditLog.objects.all().order_by("-created_at")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminRole]
    filterset_fields = ["action", "entity_type", "source", "actor_username"]
    search_fields = ["actor_username", "summary", "entity_id", "entity_type"]
    ordering_fields = ["created_at", "action", "source"]
    ordering = ["-created_at"]

