from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.contrib.sessions.backends.db import SessionStore
from django.db import OperationalError

from apps.core import selectors
from apps.core.models import JobStatus

pytestmark = pytest.mark.django_db

HEALTH = "/api/v1/health"
START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)


def beat(at: datetime, *, ok: bool = True) -> None:
    JobStatus.objects.update_or_create(
        name="core.heartbeat", defaults={"last_started_at": at, "last_finished_at": at, "last_ok": ok}
    )


def test_health_is_public_and_names_each_part(anon_client, settings):
    with time_machine.travel(START, tick=False):
        beat(START - timedelta(minutes=1))
        response = anon_client.get(HEALTH)

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "app": "ok",
        "database": "ok",
        "worker": "ok",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }


def test_without_a_heartbeat_the_worker_is_reported_stale(anon_client):
    response = anon_client.get(HEALTH)

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    assert response.json()["worker"] == "stale"
    assert response.json()["database"] == "ok"


@pytest.mark.parametrize(("age_minutes", "status"), [(3, 200), (4, 503)])
def test_the_heartbeat_may_be_three_minutes_old(anon_client, age_minutes, status):
    with time_machine.travel(START, tick=False):
        beat(START - timedelta(minutes=age_minutes))

        assert anon_client.get(HEALTH).status_code == status


def test_a_failed_heartbeat_does_not_count(anon_client):
    with time_machine.travel(START, tick=False):
        beat(START, ok=False)

        assert anon_client.get(HEALTH).json()["worker"] == "stale"


def test_a_database_failure_is_reported(anon_client, monkeypatch):
    monkeypatch.setattr(selectors, "_database_ok", lambda: False)

    response = anon_client.get(HEALTH)

    assert response.status_code == 503
    assert response.json()["database"] == "fail"
    assert response.json()["worker"] == "stale"
    assert response.json()["app"] == "ok"


def test_a_signed_in_user_gets_the_same_answer(world, client_for):
    assert client_for(world.owner_user).get(HEALTH).status_code == 503


def test_a_signed_in_caller_still_gets_the_report_when_the_session_cannot_be_read(
    world, client_for, monkeypatch
):
    client = client_for(world.owner_user)

    def unreadable(self):
        raise OperationalError("the database is down")

    monkeypatch.setattr(SessionStore, "_get_session_from_db", unreadable)
    monkeypatch.setattr(selectors, "_database_ok", lambda: False)

    response = client.get(HEALTH)

    assert response.status_code == 503
    assert response.json()["database"] == "fail"
