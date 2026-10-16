"""In-app notifications (PRD 5.6). Apps call register_event() at start-up and notify() inside their services."""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.core.errors import NotFound
from apps.core.i18n import translate
from apps.notifications import channels
from apps.notifications.models import Notification


@dataclass(frozen=True)
class EventDef:
    code: str
    link: str  # a path of the web app; may use {target} and any parameter of the event


_events: dict[str, EventDef] = {}


def register_event(code: str, *, link: str) -> None:
    """Declares an event. Its texts are the messages notification.<code>.title and notification.<code>.body."""
    existing = _events.get(code)
    if existing is not None and existing.link != link:
        raise ValueError(f"Notification event registered twice with different links: {code}")
    _events[code] = EventDef(code, link)


def registered_events() -> Mapping[str, EventDef]:
    return _events


@transaction.atomic
def notify(
    *,
    users: Iterable,
    event: str,
    params: Mapping[str, Any] | None = None,
    target_type: str = "",
    target_public_id: str = "",
    dedupe_key: str | None = None,
) -> list[Notification]:
    """Stores one notification per active user and returns those it created.

    With a `dedupe_key`, a user who already has a notification with that key gets nothing more.
    `params` must never carry a comment or a file name of a sensitive request (NOT-03).
    """
    if event not in _events:
        raise ValueError(f"Unknown notification event: {event}")
    fields = {
        "event_code": event,
        "parameters": dict(params or {}),
        "target_type": target_type,
        "target_public_id": str(target_public_id or ""),
    }
    created: list[Notification] = []
    seen: set[int] = set()
    for user in users:
        if user is None or user.pk in seen or not user.is_active:
            continue
        seen.add(user.pk)
        if dedupe_key is None:
            created.append(Notification.objects.create(user=user, **fields))
            continue
        notification, was_created = Notification.objects.get_or_create(
            user=user, dedupe_key=dedupe_key, defaults=fields
        )
        if was_created:
            created.append(notification)
    for channel in channels.CHANNELS:
        channel.deliver(created)
    return created


def render(notification: Notification, lang: str | None = None) -> dict[str, str]:
    """The title, body and link of a notification in `lang` (default: the active language)."""
    params = dict(notification.parameters or {})
    code = notification.event_code
    definition = _events.get(code)
    link = ""
    if definition is not None:
        try:
            link = definition.link.format(**{**params, "target": notification.target_public_id})
        except (KeyError, IndexError):
            link = definition.link
    return {
        "title": translate(f"notification.{code}.title", lang, **params),
        "body": translate(f"notification.{code}.body", lang, **params),
        "link": link,
    }


def for_user(user, *, unread_only: bool = False) -> QuerySet[Notification]:
    notifications = Notification.objects.filter(user=user)
    if unread_only:
        notifications = notifications.filter(read_at__isnull=True)
    return notifications


def unread_count(user) -> int:
    return Notification.objects.filter(user=user, read_at__isnull=True).count()


def mark_read(*, user, notification_id: int) -> None:
    """Marks one of the user's own notifications as read. Reading it again changes nothing."""
    if not Notification.objects.filter(user=user, pk=notification_id).exists():
        raise NotFound()
    Notification.objects.filter(user=user, pk=notification_id, read_at__isnull=True).update(
        read_at=timezone.now()
    )


def mark_all_read(*, user) -> int:
    return Notification.objects.filter(user=user, read_at__isnull=True).update(read_at=timezone.now())
