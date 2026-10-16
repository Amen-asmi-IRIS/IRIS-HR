"""Writing the audit trail. Import as: `from apps.audit import services as audit` (master 6.5)."""

import enum
import ipaddress
from collections.abc import Iterable, Mapping
from typing import Any

from django.db import models

from apps.audit.models import AuditEvent
from apps.core import context

BUSINESS = AuditEvent.Category.BUSINESS.value
SECURITY = AuditEvent.Category.SECURITY.value


class Unset(enum.Enum):
    TOKEN = "unset"


UNSET = Unset.TOKEN


def _valid_ip(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return None


def record(
    *,
    action: str,
    category: str = BUSINESS,
    obj: models.Model | None = None,
    object_type: str = "",
    object_id: str = "",
    object_label: str = "",
    changes: Mapping[str, Any] | None = None,
    actor: Any = UNSET,
) -> AuditEvent:
    """Adds one event. `actor=None` means the system; left out, it is the current request's user."""
    if actor is UNSET:
        actor = context.current_actor()
    if obj is not None:
        object_type = object_type or obj._meta.model_name
        object_id = object_id or str(getattr(obj, "public_id", None) or obj.pk)
        object_label = object_label or str(obj)
    return AuditEvent.objects.create(
        actor=actor,
        category=category,
        action=action,
        object_type=object_type,
        object_id=object_id,
        object_label=object_label[:200],
        changes=dict(changes or {}),
        ip_address=_valid_ip(context.current_ip()),
        request_id=context.current_request_id()[:32],
    )


def snapshot(instance: models.Model, fields: Iterable[str]) -> dict[str, Any]:
    """The current values of `fields`; a relation is given by its key."""
    return {name: instance.serializable_value(name) for name in fields}


def diff(
    before: Mapping[str, Any], after: Mapping[str, Any], *, redact: Iterable[str] = ()
) -> dict[str, dict]:
    """What changed between two snapshots. A redacted field is reported as changed, without its values."""
    hidden = set(redact)
    result: dict[str, dict] = {}
    for name in list(before) + [key for key in after if key not in before]:
        old, new = before.get(name), after.get(name)
        if old == new:
            continue
        result[name] = {"changed": True} if name in hidden else {"before": old, "after": new}
    return result
