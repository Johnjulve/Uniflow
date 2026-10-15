"""
ASGI config for Uniflow project.
Exposes the ASGI callable as a module-level variable named ``application``.
"""
import os
import sys
from pathlib import Path

from django.core.asgi import get_asgi_application

# Ensure backend directory is in python path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

application = get_asgi_application()
