"""Reading the audit trail."""

from datetime import date, datetime, time, timedelta

from django.db.models import QuerySet
from django.utils import timezone

from apps.audit.models import AuditEvent


def events_for_object(object_type: str, object_id: str) -> QuerySet[AuditEvent]:
    """The history of one item, newest first. Other apps use it for their history blocks."""
    return AuditEvent.objects.filter(object_type=object_type, object_id=object_id).select_related("actor")


def count_recent(*, action: str, ip_address: str, since: datetime) -> int:
    return AuditEvent.objects.filter(action=action, ip_address=ip_address, at__gte=since).count()


def _start_of(day: date) -> datetime:
    return timezone.make_aware(datetime.combine(day, time.min))


def list_events(
    *,
    category: str,
    actor_public_id=None,
    action: str = "",
    object_type: str = "",
    object_id: str = "",
    date_from: date | None = None,
    date_to: date | None = None,
) -> QuerySet[AuditEvent]:
    """Events of one category, newest first. `date_from` and `date_to` are local days, both included."""
    events = AuditEvent.objects.filter(category=category).select_related("actor")
    if actor_public_id:
        events = events.filter(actor__public_id=actor_public_id)
    if action:
        events = events.filter(action=action)
    if object_type:
        events = events.filter(object_type=object_type)
    if object_id:
        events = events.filter(object_id=object_id)
    if date_from:
        events = events.filter(at__gte=_start_of(date_from))
    if date_to:
        events = events.filter(at__lt=_start_of(date_to + timedelta(days=1)))
    return events
