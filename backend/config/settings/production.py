"""
Production settings for Uniflow backend.
Hardened configuration for on-premise business server deployments.
"""

import os
import urllib.parse

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403, F405

# Enforce DEBUG = False
DEBUG = False

# Enforce secure SECRET_KEY
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
if not SECRET_KEY or SECRET_KEY == "uniflow-dev-insecure-key-change-in-production":
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be set to a secure, unique secret in production environments."
    )

# Enforce explicit ALLOWED_HOSTS
allowed_hosts_env = os.getenv("DJANGO_ALLOWED_HOSTS", "")
ALLOWED_HOSTS = [h.strip() for h in allowed_hosts_env.split(",") if h.strip()]
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        "DJANGO_ALLOWED_HOSTS must be explicitly defined in production (e.g. 'uniflow.local,192.168.1.100')."
    )

# Production Database Configuration
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL and DATABASE_URL.startswith("postgres"):
    url = urllib.parse.urlparse(DATABASE_URL)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": url.path.lstrip("/"),
            "USER": url.username or "postgres",
            "PASSWORD": url.password or "",
            "HOST": url.hostname or "localhost",
            "PORT": url.port or 5432,
            "CONN_MAX_AGE": 600,
        }
    }
elif os.getenv("DB_ENGINE") == "postgres":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("DB_NAME", "uniflow_db"),
            "USER": os.getenv("DB_USER", "uniflow_user"),
            "PASSWORD": os.getenv("DB_PASSWORD", ""),
            "HOST": os.getenv("DB_HOST", "localhost"),
            "PORT": int(os.getenv("DB_PORT", "5432")),
            "CONN_MAX_AGE": 600,
        }
    }
else:
    # Explicit SQLite fallback permitted for local single-node on-premise servers
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "production.sqlite3",  # noqa: F405
        }
    }

# Security Headers & Cookie Hardening
SECURE_SSL_REDIRECT = os.getenv("DJANGO_SECURE_SSL_REDIRECT", "False").lower() in (
    "true",
    "1",
    "t",
    "yes",
)
SESSION_COOKIE_SECURE = (
    os.getenv("DJANGO_SESSION_COOKIE_SECURE", "False").lower()
    in (
        "true",
        "1",
        "t",
        "yes",
    )
    or SECURE_SSL_REDIRECT
)
CSRF_COOKIE_SECURE = (
    os.getenv("DJANGO_CSRF_COOKIE_SECURE", "False").lower()
    in (
        "true",
        "1",
        "t",
        "yes",
    )
    or SECURE_SSL_REDIRECT
)

SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

if SECURE_SSL_REDIRECT:
    SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
else:
    SECURE_HSTS_SECONDS = 0

# CORS Configuration
cors_env = os.getenv("CORS_ALLOWED_ORIGINS", "")
CORS_ALLOWED_ORIGINS = [origin.strip() for origin in cors_env.split(",") if origin.strip()]
CORS_ALLOW_CREDENTIALS = True

# Standard Password Validators for Production
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {
            "min_length": 8,
        },
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]
