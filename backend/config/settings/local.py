"""
Local development settings for Uniflow backend.
Overrides base settings with developer-friendly defaults.
"""
import os
import urllib.parse

from .base import *  # noqa: F403, F405

DEBUG = True

# Database Configuration
# Uses PostgreSQL if DATABASE_URL is provided, with an automatic fallback to local SQLite
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
            "CONN_MAX_AGE": 60,
        }
    }
else:
    # Developer SQLite fallback when PostgreSQL service is not actively running locally
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "dev.sqlite3",  # noqa: F405
            "OPTIONS": {
                "timeout": 20,
            },
        }
    }

# CORS Settings for Vite SPA
cors_env = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
CORS_ALLOWED_ORIGINS = [origin.strip() for origin in cors_env.split(",") if origin.strip()]
CORS_ALLOW_CREDENTIALS = True

# Relax password validation in local development to facilitate testing
AUTH_PASSWORD_VALIDATORS = []

# Email backend for development
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
