"""
Authentication and profile API views for accounts.
"""
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.serializers import (
    LoginRequestSerializer,
    LoginResponseSerializer,
    UserProfileSerializer,
)


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
