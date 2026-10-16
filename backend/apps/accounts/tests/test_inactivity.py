"""Review Focus 3: a session that should be dead is dead, and a user who keeps working is never signed out."""

from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.contrib.sessions.backends.db import SessionStore
from django.db import OperationalError
from rest_framework.test import APIClient

from apps.accounts.authentication import SessionAuth
from apps.accounts.services.signin import LAST_ACTIVITY_KEY
from apps.audit.models import AuditEvent
from apps.settings import services as settings_service

pytestmark = [pytest.mark.django_db, pytest.mark.urls("apps.accounts.tests.urls_permissions")]

START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)


def test_a_session_idle_for_more_than_two_hours_ends(world, client_for):
    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)
        assert client.get("/signed-in").status_code == 200

        clock.shift(timedelta(minutes=121))
        expired = client.get("/signed-in")
        clock.shift(timedelta(seconds=5))
        after = client.get("/signed-in")

    assert expired.status_code == 401
    assert after.status_code == 401
    events = AuditEvent.objects.filter(action="auth.session_expired")
    assert events.count() == 1
    assert events[0].object_id == str(world.owner_user.public_id)
    assert events[0].category == "security"


def test_a_session_idle_for_exactly_the_limit_is_still_alive(world, client_for):
    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)
        client.get("/signed-in")
        clock.shift(timedelta(minutes=120))

        assert client.get("/signed-in").status_code == 200


def test_a_user_who_keeps_working_is_never_signed_out(world, client_for):
    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)
        for _ in range(10):  # 10 x 100 minutes: far beyond two hours in total
            assert client.get("/signed-in").status_code == 200
            clock.shift(timedelta(minutes=100))

        assert client.get("/signed-in").status_code == 200


def test_the_limit_follows_the_setting(world, client_for):
    settings_service.set_value(actor=world.sysadmin_user, key="session_timeout_minutes", value=5)

    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)
        assert client.get("/signed-in").status_code == 200
        clock.shift(timedelta(minutes=6))

        assert client.get("/signed-in").status_code == 401


def test_activity_is_stored_at_most_once_a_minute(world, client_for):
    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)
        client.get("/signed-in")
        assert client.session[LAST_ACTIVITY_KEY] == START.timestamp()

        clock.shift(timedelta(seconds=30))
        client.get("/signed-in")
        assert client.session[LAST_ACTIVITY_KEY] == START.timestamp()

        clock.shift(timedelta(seconds=31))
        client.get("/signed-in")
        assert client.session[LAST_ACTIVITY_KEY] == (START + timedelta(seconds=61)).timestamp()


def test_a_session_that_cannot_be_read_is_an_error_and_not_a_sign_out(world, client_for, monkeypatch):
    client = client_for(world.owner_user)

    def unreadable(self):
        raise OperationalError("the database is down")

    monkeypatch.setattr(SessionStore, "_get_session_from_db", unreadable)

    response = client.get("/signed-in")

    assert response.status_code == 500
    assert response.json()["code"] == "core.unexpected"
    assert not AuditEvent.objects.filter(action="auth.session_expired").exists()


def test_a_database_that_comes_back_mid_request_does_not_let_an_idle_session_through(
    world, client_for, monkeypatch
):
    read = SessionStore._get_session_from_db
    authenticate = SessionAuth.authenticate
    database = {"down": True}

    def read_if_up(self):
        if database["down"]:
            raise OperationalError("the database is down")
        return read(self)

    def back_for_the_view(self, request):  # down while the middlewares run, back when the view starts
        database["down"] = False
        return authenticate(self, request)

    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)
        assert client.get("/signed-in").status_code == 200
        clock.shift(timedelta(minutes=121))
        monkeypatch.setattr(SessionStore, "_get_session_from_db", read_if_up)
        monkeypatch.setattr(SessionAuth, "authenticate", back_for_the_view)

        during = client.get("/signed-in")
        after = client.get("/signed-in")

    assert during.status_code == 500
    assert during.json()["code"] == "core.unexpected"
    assert after.status_code == 401
    assert AuditEvent.objects.filter(action="auth.session_expired").count() == 1


def test_requests_without_a_session_pass_untouched():
    assert APIClient().get("/open").status_code == 200
    assert not AuditEvent.objects.filter(action="auth.session_expired").exists()
