"""Excel export of a filtered audit list (UI 7.11 and 9.6). The export itself is audited (AUD-02)."""

import json
from collections.abc import Mapping
from typing import Any

from django.db.models import QuerySet
from django.utils import timezone

from apps.accounts.services import display_name
from apps.audit import services as audit
from apps.audit.models import AuditEvent
from apps.core.i18n import translate
from apps.core.xlsx import Column, build_workbook

EXPORT_LIMIT = 10_000  # the newest events of the filtered list; narrow the period to get older ones

_COLUMNS = (
    ("at", "datetime"),
    ("actor", "text"),
    ("action", "text"),
    ("object_type", "text"),
    ("object_label", "text"),
    ("changes", "text"),
    ("ip_address", "text"),
    ("request_id", "text"),
)


def _row(event: AuditEvent) -> dict[str, Any]:
    return {
        "at": event.at,
        "actor": display_name(event.actor) if event.actor_id else translate("audit.system"),
        "action": event.action,
        "object_type": event.object_type,
        "object_label": event.object_label,
        "changes": json.dumps(event.changes, ensure_ascii=False, sort_keys=True) if event.changes else "",
        "ip_address": event.ip_address or "",
        "request_id": event.request_id,
    }


def export_events(
    *, actor, category: str, events: QuerySet[AuditEvent], filters: Mapping[str, Any]
) -> tuple[bytes, str]:
    """Returns (workbook, file name). Headers are in the active language."""
    rows = [_row(event) for event in events[:EXPORT_LIMIT]]
    columns = [Column(key, translate(f"audit.column.{key}"), kind) for key, kind in _COLUMNS]
    content = build_workbook(title=translate(f"audit.sheet.{category}"), columns=columns, rows=rows)
    audit.record(
        action="audit.exported",
        category=category,
        actor=actor,
        object_type="audit_log",
        object_id=category,
        object_label=category,
        changes={"filters": {name: str(value) for name, value in filters.items()}, "rows": len(rows)},
    )
    return content, f"{category}-log-{timezone.localdate().isoformat()}.xlsx"
