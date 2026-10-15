"""
Tests for system health check and OpenAPI documentation endpoints.
"""
import pytest
from rest_framework import status
from rest_framework.test import APIClient


@pytest.fixture
def api_client():
    return APIClient()


@pytest.mark.django_db
def test_health_check_endpoint(api_client):
    """Verify that /api/v1/health/ returns HTTP 200 with healthy database status."""
    response = api_client.get("/api/v1/health/")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"
    assert "timestamp" in data
    assert data["version"] == "0.1.0"


def test_openapi_schema_endpoint(api_client):
    """Verify that /api/v1/schema/ generates valid OpenAPI schema."""
    response = api_client.get("/api/v1/schema/")
    assert response.status_code == status.HTTP_200_OK


def test_swagger_ui_endpoint(api_client):
    """Verify that /api/v1/docs/ serves the interactive Swagger UI interface."""
    response = api_client.get("/api/v1/docs/")
    assert response.status_code == status.HTTP_200_OK
    assert b"swagger-ui" in response.content.lower()
