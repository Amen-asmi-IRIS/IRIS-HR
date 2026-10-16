# syntax=docker/dockerfile:1
FROM python:3.13-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

# PostgreSQL 17 client (pg_dump for the update command and the nightly backup) and gnupg (backup encryption).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11.6 /uv /usr/local/bin/uv

RUN useradd --create-home --uid 10001 app \
 && install -d -o app -g app /app /opt/venv /data/files /data/backups

WORKDIR /app
USER app

# Production dependencies only.
FROM base AS deps
COPY --chown=app:app pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Development and test image: adds pytest, ruff and time-machine. The source is bind-mounted over /app.
FROM deps AS dev
RUN uv sync --frozen
COPY --chown=app:app . .
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# Production image. Keep this stage last: it is the default build target.
FROM deps AS prod
COPY --chown=app:app . .
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60"]
