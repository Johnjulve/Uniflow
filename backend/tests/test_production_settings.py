"""
Automated tests for production settings security hardening.
Verifies production safeguards: DEBUG=False, SECRET_KEY enforcement,
ALLOWED_HOSTS validation, security headers, and password validators.
"""

import importlib
import os
from unittest import mock

import pytest
from django.core.exceptions import ImproperlyConfigured


def test_production_settings_rejects_default_secret_key():
    """Verify production settings raise ImproperlyConfigured if secret key is insecure."""
    env = {
        "DJANGO_SECRET_KEY": "uniflow-dev-insecure-key-change-in-production",
        "DJANGO_ALLOWED_HOSTS": "uniflow.local",
    }
    with (
        mock.patch.dict(os.environ, env, clear=False),
        pytest.raises(ImproperlyConfigured, match="DJANGO_SECRET_KEY must be set"),
    ):
        import config.settings.production as prod_settings

        importlib.reload(prod_settings)


def test_production_settings_rejects_empty_allowed_hosts():
    """Verify production settings raise ImproperlyConfigured if ALLOWED_HOSTS is not provided."""
    env = {
        "DJANGO_SECRET_KEY": "a-very-strong-production-secret-key-1234567890",
        "DJANGO_ALLOWED_HOSTS": "",
    }
    with (
        mock.patch.dict(os.environ, env, clear=False),
        pytest.raises(
            ImproperlyConfigured, match="DJANGO_ALLOWED_HOSTS must be explicitly defined"
        ),
    ):
        import config.settings.production as prod_settings

        importlib.reload(prod_settings)


def test_production_settings_hardened_defaults():
    """Verify production settings enforce DEBUG=False, security headers, and password validators."""
    env = {
        "DJANGO_SECRET_KEY": "a-very-strong-production-secret-key-1234567890",
        "DJANGO_ALLOWED_HOSTS": "127.0.0.1, uniflow.local",
        "DJANGO_SECURE_SSL_REDIRECT": "True",
    }
    with mock.patch.dict(os.environ, env, clear=False):
        import config.settings.production as prod_settings

        importlib.reload(prod_settings)

        assert prod_settings.DEBUG is False
        assert prod_settings.ALLOWED_HOSTS == ["127.0.0.1", "uniflow.local"]
        assert prod_settings.X_FRAME_OPTIONS == "DENY"
        assert prod_settings.SECURE_CONTENT_TYPE_NOSNIFF is True
        assert prod_settings.SECURE_BROWSER_XSS_FILTER is True
        assert prod_settings.SECURE_SSL_REDIRECT is True
        assert prod_settings.SESSION_COOKIE_SECURE is True
        assert prod_settings.CSRF_COOKIE_SECURE is True
        assert prod_settings.SECURE_HSTS_SECONDS == 31536000
        assert len(prod_settings.AUTH_PASSWORD_VALIDATORS) == 4
