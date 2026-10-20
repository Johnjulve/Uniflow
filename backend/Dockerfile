FROM python:3.12-slim

# Prevent Python from writing bytecode and enable immediate log streaming
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install runtime utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies in editable development mode
COPY backend/pyproject.toml /app/backend/
RUN touch /app/backend/README.md && pip install --no-cache-dir -e "/app/backend[dev]"

# Copy backend source code
COPY backend/ /app/backend/

WORKDIR /app/backend

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
