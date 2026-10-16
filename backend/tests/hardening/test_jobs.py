"""All scheduled jobs: registered, idempotent, and loud when they fail (PRD 9.5, PRD 12.8)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.urls import reverse
from procrastinate.contrib.django import app

from apps.accounts import services as account_services
from apps.audit.models import AuditEvent
from apps.balances.models import LedgerEntry
from apps.core import backup
from apps.core.jobs import RETRY, recorded
from apps.core.models import JobStatus
from apps.notifications.models import Notification
from apps.organisation import services as organisation_services
from apps.organisation.models import Employee
from apps.requests.models import Request, RequestStep
from apps.settings import services as settings_service
from tests.hardening.helpers import NOW, make_request

User = get_user_model()
JOBS = [
    "core.heartbeat",
    "accounts.cleanup",
    "organisation.delegation_transitions",
    "requests.reminders_and_flags",
    "requests.certificate_deadlines",
    "balances.month_end_credit",
    "ops.backup",
]
A_WEEK_LATER = datetime(2026, 11, 9, 8, 0, tzinfo=UTC)  # Monday 9 November 2026, 09:00 in Tunis


def _lock(task):
    return task.queueing_lock


def _scheduled_names() -> set[str]:
    return {periodic.task.name for periodic in app.periodic_registry.periodic_tasks.values()}


def _run(name: str) -> None:
    app.tasks[name](0)  # every task takes the scheduler's timestamp as its one argument


def test_every_job_of_the_contract_is_registered_and_scheduled():
    assert set(JOBS) <= set(app.tasks), sorted(set(JOBS) - set(app.tasks))
    assert set(JOBS) <= _scheduled_names(), sorted(set(JOBS) - _scheduled_names())


def test_jobs_retry_three_times_and_cannot_pile_up():
    assert RETRY.max_attempts == 3
    for name in JOBS:
        if name == "core.heartbeat":
            continue
        assert _lock(app.tasks[name]) == name, f"{name} has no queueing lock, two runs could overlap"


@pytest.fixture
def busy_world(world, frozen, tmp_path, files_root, monkeypatch):
    """A state in which every job has something to do one week later."""
    monkeypatch.setenv("BACKUP_PASSPHRASE", "correct horse battery staple")
    monkeypatch.setattr(backup, "BACKUP_DIR", tmp_path / "backups")
    monkeypatch.setattr(backup, "FILES_DIR", files_root)

    Employee.objects.update(hire_date=date(2020, 1, 1))
    settings_service.set_value(actor=world.hr_user, key="credit_start_date", value="2026-10-01")
    # A manager step that will need a reminder and a flag.
    make_request(
        world,
        user=world.owner_user,
        employee=world.owner,
        request_type=world.remote,
        start=date(2026, 11, 23),
        end=date(2026, 11, 23),
    )
    # A sick leave whose certificate will be overdue.
    make_request(
        world,
        user=world.peer_user,
        employee=world.peer,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
    )
    # A delegation that starts in a week.
    organisation_services.create_delegation(
        actor=world.manager_user,
        manager=world.manager,
        delegate=world.other_manager,
        start_date=date(2026, 11, 9),
        end_date=date(2026, 11, 13),
    )
    # A temporary password that will have expired, and a session that already has.
    account_services.create_account(
        actor=world.sysadmin_user, email="temp.user@impactrisks.com", full_name="Temp User"
    )
    Session.objects.create(
        session_key="expired-session-key", session_data="", expire_date=NOW - timedelta(days=1)
    )

    frozen.move_to(A_WEEK_LATER)
    return tmp_path


def _fingerprint(tmp_path) -> dict:
    backups = tmp_path / "backups"
    return {
        "notifications": sorted(
            Notification.objects.values_list("user_id", "event_code", "target_public_id")
        ),
        "audit": AuditEvent.objects.count(),
        "ledger": sorted(LedgerEntry.objects.values_list("employee_id", "kind", "period", "amount")),
        "steps": sorted(RequestStep.objects.values_list("id", "status", "reminded_at", "flagged_at")),
        "requests": sorted(Request.objects.values_list("id", "status", "version")),
        "sessions": Session.objects.count(),
        "accounts": sorted(
            User.objects.values_list("id", "is_active", "must_change_password", "temp_password_expires_at")
        ),
        "backup_files": sorted(path.name for path in backups.iterdir()) if backups.exists() else [],
    }


@pytest.mark.django_db
@pytest.mark.parametrize("name", JOBS)
def test_a_job_run_twice_equals_once(busy_world, name):
    _run(name)
    once = _fingerprint(busy_world)
    _run(name)
    twice = _fingerprint(busy_world)
    assert twice == once
    status = JobStatus.objects.get(name=name)
    assert status.last_ok is True and status.last_finished_at is not None


@pytest.mark.django_db
def test_each_job_did_its_work_on_the_first_run(busy_world, world):
    """Guards the test above: idempotence means nothing if the first run did nothing."""
    before = _fingerprint(busy_world)
    for name in JOBS:
        _run(name)
    after = _fingerprint(busy_world)

    events = {event for _, event, _ in after["notifications"]} - {
        event for _, event, _ in before["notifications"]
    }
    assert {"step.reminder", "step.flagged", "certificate.overdue", "delegation.started"} <= events
    assert any(reminded and flagged for _, _, reminded, flagged in after["steps"])
    assert len(after["ledger"]) - len(before["ledger"]) == 7  # October credit for the seven employees
    assert after["sessions"] == before["sessions"] - 1
    assert len(after["backup_files"]) == 2
    assert after["requests"] == before["requests"]  # no job changes a request's status


@pytest.mark.django_db
def test_all_jobs_together_twice_equal_once(busy_world):
    for name in JOBS:
        _run(name)
    once = _fingerprint(busy_world)
    for name in reversed(JOBS):
        _run(name)
    assert _fingerprint(busy_world) == once


@pytest.mark.django_db
def test_a_failing_job_tells_administrators_after_its_third_failure_once_a_day(world, client_for, frozen):
    """Plan 01a, contract note 14: the three attempts of RETRY are used up, then System Administrators are told."""

    @recorded("test.always_fails")
    def broken(timestamp: int = 0) -> None:
        raise RuntimeError("disk full")

    told = Notification.objects.filter(event_code="job.failed")
    for attempt in (1, 2):
        with pytest.raises(RuntimeError):
            broken()
        assert JobStatus.objects.get(name="test.always_fails").consecutive_failures == attempt
        assert told.count() == 0, "nobody is told while a retry is still to come"

    with pytest.raises(RuntimeError):
        broken()
    status = JobStatus.objects.get(name="test.always_fails")
    assert status.last_ok is False
    assert status.consecutive_failures == 3
    assert status.last_detail == "RuntimeError: disk full"
    assert told.filter(user=world.sysadmin_user).count() == 1
    assert told.exclude(user=world.sysadmin_user).count() == 0

    with pytest.raises(RuntimeError):  # a fourth failure the same day tells nobody again
        broken()
    assert told.count() == 1

    body = client_for(world.sysadmin_user).get(reverse("core:admin-status")).json()
    assert body["jobs"][0]["name"] == "test.always_fails"  # failures first
    assert body["jobs"][0]["last_ok"] is False

    frozen.move_to(NOW + timedelta(days=1))
    with pytest.raises(RuntimeError):
        broken()
    assert told.filter(user=world.sysadmin_user).count() == 2  # once per job per day


@pytest.mark.django_db
def test_a_job_that_recovers_is_shown_as_healthy_again(world, frozen):
    calls = {"count": 0}

    @recorded("test.recovers")
    def flaky(timestamp: int = 0) -> None:
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("first attempt fails")

    with pytest.raises(RuntimeError):
        flaky()
    flaky()
    status = JobStatus.objects.get(name="test.recovers")
    assert status.last_ok is True
    assert status.consecutive_failures == 0  # a success starts the count again
    assert not Notification.objects.filter(event_code="job.failed").exists()


@pytest.mark.django_db
def test_health_turns_degraded_when_the_worker_stops(anon_client, frozen):
    _run("core.heartbeat")
    healthy = anon_client.get(reverse("core:health"))
    assert healthy.status_code == 200 and healthy.json()["worker"] == "ok"

    frozen.move_to(NOW + timedelta(minutes=4))
    stale = anon_client.get(reverse("core:health"))
    assert stale.status_code == 503
    assert stale.json()["worker"] != "ok" and stale.json()["database"] == "ok"
