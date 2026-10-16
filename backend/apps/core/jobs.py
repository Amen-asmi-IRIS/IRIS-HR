"""Scheduled jobs (PRD 9.5). A task is a thin Procrastinate wrapper around a service; `recorded` keeps its last run."""

import functools
import json
import logging
from collections.abc import Callable
from typing import Any

from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import F
from django.utils import timezone
from procrastinate import RetryStrategy

from apps.core.models import JobStatus

logger = logging.getLogger("iris.jobs")

HEARTBEAT = "core.heartbeat"

# Three attempts in all, 5 seconds then 25 seconds apart ("retried with back-off", PRD 9.5).
RETRY = RetryStrategy(max_attempts=3, exponential_wait=5)
NOTIFY_AFTER_FAILURES = 3  # the retries are used up: tell the System Administrators


def periodic_schedules() -> dict[str, str]:
    """The cron expression (UTC) of every periodic task, by task name. Empty if the registry cannot be read."""
    try:
        from procrastinate.contrib.django import app

        return {entry.task.name: entry.cron for entry in app.periodic_registry.periodic_tasks.values()}
    except Exception:  # the registry layout is not part of Procrastinate's documented interface
        logger.warning("could not read the periodic task registry", exc_info=True)
        return {}


def _describe(result: Any) -> str:
    if result is None:
        return ""
    if isinstance(result, dict):
        return json.dumps(result, cls=DjangoJSONEncoder, sort_keys=True)
    return str(result)[:2000]


def _succeeded(name: str, result: Any) -> None:
    JobStatus.objects.filter(name=name).update(
        last_finished_at=timezone.now(), last_ok=True, last_detail=_describe(result), consecutive_failures=0
    )


def _failed(name: str, exc: Exception) -> None:
    JobStatus.objects.filter(name=name).update(
        last_finished_at=timezone.now(),
        last_ok=False,
        last_detail=f"{type(exc).__name__}: {exc}"[:2000],
        consecutive_failures=F("consecutive_failures") + 1,
    )
    failures = JobStatus.objects.values_list("consecutive_failures", flat=True).get(name=name)
    logger.error("job failed", exc_info=exc, extra={"data": {"job": name, "consecutive_failures": failures}})
    if failures >= NOTIFY_AFTER_FAILURES:
        _notify_administrators(name)


def _notify_administrators(name: str) -> None:
    # Imported here: apps.core is loaded before the apps it would otherwise import.
    from apps.accounts.roles import Role, users_with_role
    from apps.notifications import services as notifications

    notifications.notify(
        users=users_with_role(Role.SYSADMIN),
        event="job.failed",
        params={"job": name},
        target_type="job",
        dedupe_key=f"job.failed:{name}:{timezone.localdate().isoformat()}",
    )


def recorded(name: str) -> Callable:
    """Decorator for a job function: stores each run in JobStatus, reports repeated failure, re-raises errors."""

    def decorator(function: Callable) -> Callable:
        @functools.wraps(function)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            JobStatus.objects.update_or_create(
                name=name,
                defaults={"last_started_at": timezone.now(), "schedule": periodic_schedules().get(name, "")},
            )
            try:
                result = function(*args, **kwargs)
            except Exception as exc:
                _failed(name, exc)
                raise
            _succeeded(name, result)
            return result

        return wrapper

    return decorator
