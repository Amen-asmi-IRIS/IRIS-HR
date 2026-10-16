"""A call the page makes by itself, on a timer, is not the person's activity (ACC-04).

A view says so with `background = True`. Such a call is still checked against the limit, and ends a session
that is past it; it only never pushes the limit back. Without this, an unattended page would stay signed in.
"""

from datetime import UTC, datetime, timedelta

import pytest
import time_machine

from apps.accounts.services.signin import LAST_ACTIVITY_KEY
from apps.audit.models import AuditEvent

pytestmark = pytest.mark.django_db

ME = "/api/v1/auth/me"
UNREAD_COUNT = "/api/v1/notifications/unread-count"
STATUS = "/api/v1/admin/status"
WORKSPACE_SUMMARY = "/api/v1/workspaces/summary"

START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)


def test_a_session_that_only_polls_ends_at_the_limit(world, client_for):
    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)
        assert client.get(ME).status_code == 200

        for _ in range(120):  # the header asks every minute, for two hours, and nobody touches the page
            clock.shift(timedelta(minutes=1))
            assert client.get(UNREAD_COUNT).status_code == 200
        clock.shift(timedelta(minutes=1))
        expired = client.get(UNREAD_COUNT)
        after = client.get(ME)

    assert expired.status_code == 401
    assert after.status_code == 401
    event = AuditEvent.objects.get(action="auth.session_expired")
    assert event.object_id == str(world.owner_user.public_id)


def test_a_background_call_before_the_limit_answers_and_leaves_the_time_alone(world, client_for):
    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)
        client.get(ME)
        clock.shift(timedelta(minutes=30))

        response = client.get(UNREAD_COUNT)

        assert response.status_code == 200
        assert response.json() == {"count": 1}
        assert client.session[LAST_ACTIVITY_KEY] == START.timestamp()


def test_a_normal_call_still_counts_as_activity(world, client_for):
    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)
        client.get(ME)
        clock.shift(timedelta(minutes=100))
        client.get(UNREAD_COUNT)

        assert client.get(ME).status_code == 200
        assert client.session[LAST_ACTIVITY_KEY] == (START + timedelta(minutes=100)).timestamp()

        clock.shift(timedelta(minutes=100))  # 200 minutes after signing in, 100 after the last real call
        assert client.get(ME).status_code == 200


def test_a_background_call_starts_the_clock_of_a_session_that_has_none(world, client_for):
    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.owner_user)  # signed in by the test client: no time of last activity yet

        client.get(UNREAD_COUNT)
        assert client.session[LAST_ACTIVITY_KEY] == START.timestamp()

        clock.shift(timedelta(minutes=121))
        assert client.get(UNREAD_COUNT).status_code == 401


@pytest.mark.parametrize(
    ("persona", "path"), [("owner", UNREAD_COUNT), ("sysadmin", STATUS), ("owner", WORKSPACE_SUMMARY)]
)
def test_the_routes_the_pages_call_on_a_timer_are_background(world, client_for, persona, path):
    with time_machine.travel(START, tick=False) as clock:
        client = client_for(world.user_for(persona))
        client.get(ME)
        clock.shift(timedelta(minutes=30))

        assert client.get(path).status_code == 200
        assert client.session[LAST_ACTIVITY_KEY] == START.timestamp()
