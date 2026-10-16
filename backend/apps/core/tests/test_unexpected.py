import logging
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.test import RequestFactory
from rest_framework.test import APIClient

from apps.accounts.tests.world import make_user
from apps.core.api import problems
from apps.notifications import services as notifications
from apps.notifications.models import Notification

pytestmark = [pytest.mark.django_db, pytest.mark.urls("apps.core.tests.urls_problems")]

START = datetime(2026, 10, 6, 8, 10, tzinfo=UTC)


def crash():
    return APIClient().get("/probe", {"kind": "crash"})


def test_an_unexpected_error_tells_every_active_administrator(world):
    second = make_user("second.admin@impactrisks.com", roles=["sysadmin"])
    make_user("gone.admin@impactrisks.com", roles=["sysadmin"], is_active=False)

    response = crash()

    told = Notification.objects.filter(event_code="error.unexpected")
    assert response.status_code == 500
    assert {n.user for n in told} == {world.sysadmin_user, second}
    assert all(n.parameters == {"reference": response["X-Request-ID"]} for n in told)
    rendered = notifications.render(told[0], "en")
    assert response["X-Request-ID"] in rendered["body"]
    assert rendered["link"] == "/admin"


def test_administrators_are_told_once_per_hour(world):
    with time_machine.travel(START, tick=False) as clock:
        crash()
        clock.shift(timedelta(minutes=40))  # 08:50, the same clock hour
        crash()
        assert Notification.objects.filter(event_code="error.unexpected").count() == 1

        clock.shift(timedelta(minutes=20))  # 09:10, the next clock hour
        crash()

    assert Notification.objects.filter(event_code="error.unexpected").count() == 2


def test_expected_errors_tell_nobody(world):
    client = APIClient()
    client.get("/probe", {"kind": "not_found"})
    client.get("/probe", {"kind": "domain"})
    client.post("/probe", {})

    assert not Notification.objects.filter(event_code="error.unexpected").exists()


def test_without_an_administrator_the_error_is_still_answered():
    response = crash()

    assert response.status_code == 500
    assert response.json()["code"] == "core.unexpected"
    assert not Notification.objects.filter(event_code="error.unexpected").exists()


def test_a_failure_to_notify_does_not_change_the_answer(world, monkeypatch, caplog):
    def broken_notify(**arguments):
        raise RuntimeError("notification table is gone")

    monkeypatch.setattr(notifications, "notify", broken_notify)

    with caplog.at_level(logging.ERROR, logger="iris.errors"):
        response = crash()

    assert response.status_code == 500
    assert response.json()["code"] == "core.unexpected"
    assert "notification table is gone" not in response.content.decode()
    messages = [record.getMessage() for record in caplog.records]
    assert "unexpected error" in messages
    assert "could not notify the administrators of an unexpected error" in messages


def test_an_error_outside_a_view_notifies_too(world):
    response = problems.server_error_view(RequestFactory().get("/api/v1/anything"))

    assert response.status_code == 500
    assert Notification.objects.filter(event_code="error.unexpected", user=world.sysadmin_user).count() == 1
