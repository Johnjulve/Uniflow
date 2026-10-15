"""
Standardized API exception handling for Uniflow REST API.
Enforces the error envelope specified in docs/api-contract.md.
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def uniflow_exception_handler(exc, context):
    """
    Transforms DRF exceptions into Uniflow's uniform error envelope:
    {
        "error": {
            "code": "ERROR_CODE",
            "message": "Description",
            "details": { ... }
        }
    }
    """
    response = exception_handler(exc, context)

    if response is None:
        # Unhandled server exception
        return Response(
            {
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected internal server error occurred.",
                    "details": None,
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Map HTTP status codes to standard machine-readable codes
    code_mapping = {
        status.HTTP_400_BAD_REQUEST: "BAD_REQUEST",
        status.HTTP_401_UNAUTHORIZED: "AUTHENTICATION_REQUIRED",
        status.HTTP_403_FORBIDDEN: "PERMISSION_DENIED",
        status.HTTP_404_NOT_FOUND: "NOT_FOUND",
        status.HTTP_409_CONFLICT: "CONFLICT",
        status.HTTP_422_UNPROCESSABLE_ENTITY: "VALIDATION_ERROR",
    }

    code = code_mapping.get(response.status_code, "API_ERROR")
    if response.status_code == status.HTTP_400_BAD_REQUEST and isinstance(response.data, dict):
        code = "VALIDATION_ERROR"

    message = "Request validation failed."
    details = response.data

    if isinstance(response.data, dict):
        if "detail" in response.data:
            message = str(response.data["detail"])
            details = None
    elif isinstance(response.data, list):
        message = "; ".join(str(item) for item in response.data)
        details = None

    response.data = {
        "error": {
            "code": code,
            "message": message,
            "details": details,
        }
    }

    return response
