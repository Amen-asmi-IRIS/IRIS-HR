import json
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.contrib.sessions.models import Session

from apps.accounts import services, tasks
from apps.accounts.tests.world import PASSWORD
from apps.core.errors import DomainError
from apps.core.models import JobStatus

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 10, 6, 1, 30, tzinfo=UTC)


def expire_temporary_password(user, *, hours_ago: int) -> None:
    user.must_change_password = True
    user.temp_password_expires_at = NOW - timedelta(hours=hours_ago)
    user.save(update_fields=["must_change_password", "temp_password_expires_at"])


def test_cleanup_removes_expired_sessions_only():
    Session.objects.create(session_key="a" * 32, session_data="x", expire_date=NOW - timedelta(hours=1))
    Session.objects.create(session_key="b" * 32, session_data="x", expire_date=NOW + timedelta(hours=1))

    result = services.cleanup(now=NOW)

    assert result["expired_sessions"] == 1
    assert list(Session.objects.values_list("session_key", flat=True)) == ["b" * 32]


def test_cleanup_makes_expired_temporary_passwords_unusable(world):
    expire_temporary_password(world.owner_user, hours_ago=2)
    expire_temporary_password(world.peer_user, hours_ago=-2)  # still valid for two hours

    result = services.cleanup(now=NOW)

    assert result == {"expired_sessions": 0, "expired_temporary_passwords": 1}
    world.owner_user.refresh_from_db()
    world.peer_user.refresh_from_db()
    world.manager_user.refresh_from_db()
    assert world.owner_user.has_usable_password() is False
    assert world.owner_user.must_change_password is True
    assert world.peer_user.check_password(PASSWORD)
    assert world.manager_user.check_password(PASSWORD)


def test_after_cleanup_the_user_is_still_told_to_ask_for_a_new_password(world):
    expire_temporary_password(world.owner_user, hours_ago=2)
    services.cleanup(now=NOW)

    with time_machine.travel(NOW, tick=False), pytest.raises(DomainError) as error:
        services.authenticate(email=world.owner_user.email, password=PASSWORD, ip="")

    assert error.value.code == "auth.temp_password_expired"


def test_running_cleanup_twice_changes_nothing_more(world):
    expire_temporary_password(world.owner_user, hours_ago=2)
    Session.objects.create(session_key="a" * 32, session_data="x", expire_date=NOW - timedelta(hours=1))

    first = services.cleanup(now=NOW)
    second = services.cleanup(now=NOW)

    assert first == {"expired_sessions": 1, "expired_temporary_passwords": 1}
    assert second == {"expired_sessions": 0, "expired_temporary_passwords": 0}


def test_the_cleanup_task_records_its_result(world):
    expire_temporary_password(world.owner_user, hours_ago=2)

    with time_machine.travel(NOW, tick=False):
        tasks.cleanup(0)

    status = JobStatus.objects.get(name="accounts.cleanup")
    assert status.last_ok is True
    assert json.loads(status.last_detail) == {"expired_sessions": 0, "expired_temporary_passwords": 1}
    assert status.schedule == "30 1 * * *"
