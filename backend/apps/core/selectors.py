"""Reads for the health check and the Status page (UI 9.1)."""

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from croniter import croniter
from django.conf import settings
from django.db import DatabaseError, connection
from django.utils import timezone

from apps.core.jobs import HEARTBEAT, periodic_schedules
from apps.core.models import JobStatus

HEARTBEAT_MAX_AGE = timedelta(minutes=3)
BACKUP_JOB = "ops.backup"


def _database_ok() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return True
    except DatabaseError:
        return False


def _worker_ok(now: datetime) -> bool:
    try:
        beat = (
            JobStatus.objects.filter(name=HEARTBEAT, last_ok=True)
            .values_list("last_finished_at", flat=True)
            .first()
        )
    except DatabaseError:
        return False
    return beat is not None and now - beat <= HEARTBEAT_MAX_AGE


def health_report(*, now: datetime | None = None) -> dict[str, str]:
    now = now or timezone.now()
    database = _database_ok()
    worker = database and _worker_ok(now)
    return {
        "status": "ok" if database and worker else "degraded",
        "app": "ok",
        "database": "ok" if database else "fail",
        "worker": "ok" if worker else "stale",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }


def _next_run(schedule: str, now: datetime) -> datetime | None:
    if not schedule:
        return None
    try:
        return croniter(schedule, now.astimezone(UTC)).get_next(datetime)
    except (ValueError, KeyError):
        return None


def job_rows(*, now: datetime | None = None) -> list[dict[str, Any]]:
    """Every scheduled job with its last run and its next one. Failed jobs come first."""
    now = now or timezone.now()
    schedules = periodic_schedules()
    statuses = {status.name: status for status in JobStatus.objects.all()}
    rows = []
    for name in sorted(set(schedules) | set(statuses)):
        status = statuses.get(name)
        schedule = schedules.get(name) or (status.schedule if status else "")
        rows.append(
            {
                "name": name,
                "schedule": schedule,
                "last_started_at": status.last_started_at if status else None,
                "last_finished_at": status.last_finished_at if status else None,
                "last_ok": status.last_ok if status else None,
                "last_detail": status.last_detail if status else "",
                "next_run_at": _next_run(schedule, now),
            }
        )
    rows.sort(key=lambda row: (row["last_ok"] is not False, row["name"]))
    return rows


def backup_info() -> dict[str, Any] | None:
    """The last successful backup, as reported by the `ops.backup` job that plan 07 adds."""
    status = JobStatus.objects.filter(name=BACKUP_JOB, last_ok=True).first()
    if status is None or status.last_finished_at is None:
        return None
    try:
        detail = json.loads(status.last_detail or "{}")
    except ValueError:
        detail = {}
    return {
        "last_at": status.last_finished_at,
        "size_bytes": detail.get("size_bytes"),
        "storage_used_bytes": detail.get("storage_used_bytes"),
    }


def admin_status(*, now: datetime | None = None) -> dict[str, Any]:
    from apps.accounts import selectors as account_selectors  # apps.core is loaded before apps.accounts

    now = now or timezone.now()
    return {
        "health": health_report(now=now),
        "accounts": account_selectors.accounts_needing_attention(now=now),
        "jobs": job_rows(now=now),
        "backup": backup_info(),
    }
