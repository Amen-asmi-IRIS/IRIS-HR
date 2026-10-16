from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.utils import translation

from apps.core.errors import NotFound
from apps.core.i18n import register_messages
from apps.notifications import channels, services
from apps.notifications.models import Notification
from apps.notifications.tests.world import make_notification

register_messages(
    {
        "notification.test.pinged.title": {"en": "Ping from {who}", "fr": "Ping de {who}"},
        "notification.test.pinged.body": {
            "en": "{who} pinged you about {subject}.",
            "fr": "{who} vous a écrit au sujet de {subject}.",
        },
    }
)
services.register_event("test.pinged", link="/requests/{target}")

pytestmark = pytest.mark.django_db


def ping(users, **options):
    return services.notify(
        users=users,
        event="test.pinged",
        params={"who": "Sami", "subject": "leave"},
        target_type="request",
        target_public_id="abc-123",
        **options,
    )


def test_notify_stores_one_row_per_user(world):
    created = ping([world.manager_user, world.peer_user])

    assert [n.user for n in created] == [world.manager_user, world.peer_user]
    row = Notification.objects.get(user=world.manager_user)
    assert row.event_code == "test.pinged"
    assert row.parameters == {"who": "Sami", "subject": "leave"}
    assert (row.target_type, row.target_public_id) == ("request", "abc-123")
    assert row.dedupe_key is None
    assert row.read_at is None
    assert row.created_at is not None


def test_a_user_listed_twice_is_notified_once(world):
    assert len(ping([world.manager_user, world.manager_user])) == 1


def test_disabled_accounts_and_missing_users_are_skipped(world):
    world.peer_user.is_active = False
    world.peer_user.save(update_fields=["is_active"])

    created = ping([world.peer_user, None, world.manager_user])

    assert [n.user for n in created] == [world.manager_user]


def test_an_unknown_event_is_a_programming_error(world):
    with pytest.raises(ValueError, match="no.such.event"):
        services.notify(users=[world.manager_user], event="no.such.event")


def test_a_dedupe_key_stores_a_notification_once_per_user(world):
    first = ping([world.manager_user], dedupe_key="reminder:42")
    again = ping([world.manager_user], dedupe_key="reminder:42")
    wider = ping([world.manager_user, world.peer_user], dedupe_key="reminder:42")
    other = ping([world.manager_user], dedupe_key="reminder:43")

    assert len(first) == 1
    assert again == []
    assert [n.user for n in wider] == [world.peer_user]
    assert len(other) == 1
    assert Notification.objects.filter(user=world.manager_user).count() == 2


def test_without_a_dedupe_key_every_call_notifies(world):
    ping([world.manager_user])
    ping([world.manager_user])

    assert Notification.objects.filter(user=world.manager_user).count() == 2


def test_the_text_is_rendered_in_the_language_asked_for(world):
    notification = ping([world.manager_user])[0]

    assert services.render(notification, "fr") == {
        "title": "Ping de Sami",
        "body": "Sami vous a écrit au sujet de leave.",
        "link": "/requests/abc-123",
    }
    assert services.render(notification, "en")["title"] == "Ping from Sami"


def test_render_defaults_to_the_active_language(world):
    notification = ping([world.manager_user])[0]

    with translation.override("en"):
        assert services.render(notification)["body"] == "Sami pinged you about leave."
    with translation.override("fr"):
        assert services.render(notification)["body"] == "Sami vous a écrit au sujet de leave."


def test_for_user_returns_the_users_own_notifications_newest_first(world):
    with time_machine.travel(datetime(2026, 10, 6, 9, 0, tzinfo=UTC), tick=False) as clock:
        old = ping([world.manager_user])[0]
        clock.shift(timedelta(minutes=5))
        new = ping([world.manager_user])[0]
        ping([world.peer_user])

    assert list(services.for_user(world.manager_user)) == [new, old]


def test_reading_one_notification(world):
    first, second = ping([world.manager_user])[0], ping([world.manager_user])[0]
    assert services.unread_count(world.manager_user) == 2

    services.mark_read(user=world.manager_user, notification_id=first.pk)

    assert services.unread_count(world.manager_user) == 1
    assert list(services.for_user(world.manager_user, unread_only=True)) == [second]
    first.refresh_from_db()
    assert first.read_at is not None


def test_reading_twice_keeps_the_first_time(world):
    notification = ping([world.manager_user])[0]
    with time_machine.travel(datetime(2026, 10, 6, 9, 0, tzinfo=UTC), tick=False) as clock:
        services.mark_read(user=world.manager_user, notification_id=notification.pk)
        clock.shift(timedelta(hours=1))
        services.mark_read(user=world.manager_user, notification_id=notification.pk)

    notification.refresh_from_db()
    assert notification.read_at == datetime(2026, 10, 6, 9, 0, tzinfo=UTC)


def test_nobody_can_read_someone_elses_notification(world):
    notification = ping([world.manager_user])[0]

    with pytest.raises(NotFound):
        services.mark_read(user=world.peer_user, notification_id=notification.pk)

    notification.refresh_from_db()
    assert notification.read_at is None


def test_reading_all_touches_only_the_users_own(world):
    ping([world.manager_user])
    ping([world.manager_user])
    ping([world.peer_user])

    assert services.mark_all_read(user=world.manager_user) == 2
    assert services.unread_count(world.manager_user) == 0
    assert services.unread_count(world.peer_user) == 1


def test_every_channel_receives_what_was_created(world, monkeypatch):
    delivered = []

    class Spy:
        def deliver(self, notifications):
            delivered.append(list(notifications))

    monkeypatch.setattr(channels, "CHANNELS", [channels.InAppChannel(), Spy()])

    created = ping([world.manager_user, world.peer_user])

    assert delivered == [created]


def test_an_event_cannot_be_registered_twice_with_another_link():
    services.register_event("test.pinged", link="/requests/{target}")  # the same again: accepted

    with pytest.raises(ValueError, match="test.pinged"):
        services.register_event("test.pinged", link="/elsewhere")


def test_the_events_of_this_plan_are_registered():
    events = services.registered_events()

    assert events["account.password_reset"].link == "/password"
    assert events["job.failed"].link == "/admin"
    assert events["error.unexpected"].link == "/admin"


def test_the_cast_has_one_notification_for_the_owner(world):
    assert world.owner_notification.user == world.owner_user
    assert make_notification(world.peer_user).event_code == "account.password_reset"
