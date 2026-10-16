"""Typed settings stored in the database. Import as: `from apps.settings import services as settings_service`."""

import logging
import time
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.audit import services as audit
from apps.core.errors import DomainError, NotAllowed
from apps.settings import registry
from apps.settings.models import Setting

CACHE_SECONDS = 30
GROUP_ROLE = {"hr": Role.HR, "system": Role.SYSADMIN}
GROUP_AUDIT_CATEGORY = {"hr": audit.BUSINESS, "system": audit.SECURITY}

logger = logging.getLogger("iris.settings")

_clock = time.monotonic
_cache: dict[str, Any] | None = None
_cache_loaded_at = 0.0


@dataclass(frozen=True)
class SettingRow:
    key: str
    kind: str
    value: Any
    default: Any
    minimum: Any
    maximum: Any
    choices: list[str] | None
    updated_by_name: str | None
    updated_at: datetime | None


def clear_cache() -> None:
    global _cache
    _cache = None


def _stored_values() -> dict[str, Any]:
    """Every changed value, read once per process every CACHE_SECONDS."""
    global _cache, _cache_loaded_at
    now = _clock()
    if _cache is None or now - _cache_loaded_at > CACHE_SECONDS:
        _cache = {key: wrapped.get("v") for key, wrapped in Setting.objects.values_list("key", "value")}
        _cache_loaded_at = now
    return _cache


def _default(defn: registry.SettingDef) -> Any:
    return registry.to_storage(defn, defn.default)


def get(key: str) -> Any:
    """The current value of a setting, typed. Other processes see a change within CACHE_SECONDS."""
    defn = registry.get_def(key)
    stored = _stored_values()
    if key in stored:
        try:
            return registry.to_python(defn, registry.to_storage(defn, stored[key]))
        except DomainError:
            logger.error("stored setting is not valid; using the default", extra={"data": {"key": key}})
    return registry.to_python(defn, _default(defn))


@transaction.atomic
def set_value(*, actor, key: str, value: Any) -> Setting:
    defn = registry.get_def(key)
    if not has_role(actor, GROUP_ROLE[defn.group]):
        raise NotAllowed()
    new = registry.to_storage(defn, value)

    row = Setting.objects.select_for_update().filter(key=key).first()
    before = _default(defn) if row is None else row.value.get("v")
    if row is None:
        row = Setting(key=key)
    row.value = {"v": new}
    row.updated_by = actor
    row.updated_at = timezone.now()
    row.save()

    audit.record(
        action="setting.changed",
        category=GROUP_AUDIT_CATEGORY[defn.group],
        object_type="setting",
        object_id=key,
        object_label=key,
        changes={"value": {"before": before, "after": new}},
        actor=actor,
    )
    clear_cache()
    transaction.on_commit(clear_cache)
    return row


def _plain(value: Any) -> Any:
    return format(value.normalize(), "f") if isinstance(value, Decimal) else value


def list_group(group: str) -> list[SettingRow]:
    """Every setting of a group with its current value, for the settings pages."""
    from apps.accounts.services import display_name  # imported here: accounts services read settings

    if group not in registry.GROUPS:
        raise ValueError(f"Unknown settings group: {group}")
    definitions = registry.defs_for(group)
    keys = [defn.key for defn in definitions]
    rows = {row.key: row for row in Setting.objects.filter(key__in=keys).select_related("updated_by")}
    described = []
    for defn in definitions:
        row = rows.get(defn.key)
        default = _default(defn)
        described.append(
            SettingRow(
                key=defn.key,
                kind=defn.kind,
                value=default if row is None else row.value.get("v"),
                default=default,
                minimum=_plain(defn.minimum),
                maximum=_plain(defn.maximum),
                choices=list(defn.choices) if defn.choices is not None else None,
                updated_by_name=display_name(row.updated_by) if row is not None and row.updated_by else None,
                updated_at=None if row is None else row.updated_at,
            )
        )
    return described


def row_for(key: str) -> SettingRow:
    defn = registry.get_def(key)
    return next(row for row in list_group(defn.group) if row.key == key)
