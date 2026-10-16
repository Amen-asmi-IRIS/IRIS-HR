"""Requests as date spans, for the calendar and the home screens.

This is the read other apps use when they need a request's dates together with
its type's calendar label. It returns plain data, never model instances, and it
applies no reach rule: the caller decides which employees it may ask about.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from apps.requests.models import CalendarLabel, Request, RequestType


@dataclass(frozen=True)
class RequestSpan:
    request_id: int
    request_public_id: str
    employee_id: int
    type_code: str
    type_name_fr: str
    type_name_en: str
    unit: str
    calendar_label: str
    # A sick-leave kind of type: its comment and files are private (PRD 6.5).
    type_is_sensitive: bool
    start_date: date
    end_date: date
    starts_at_midday: bool
    ends_at_midday: bool
    status: str


def request_spans(
    *,
    start: date,
    end: date,
    statuses: Iterable[str],
    employee_ids: Iterable[int] | None = None,
    type_codes: Iterable[str] | None = None,
) -> list[RequestSpan]:
    """Every request in one of `statuses` that touches [start, end], with its real dates."""
    queryset = (
        Request.objects.filter(status__in=list(statuses), start_date__lte=end, end_date__gte=start)
        .select_related("request_type")
        .order_by("start_date", "employee_id", "id")
    )
    if employee_ids is not None:
        queryset = queryset.filter(employee_id__in=list(employee_ids))
    if type_codes is not None:
        queryset = queryset.filter(request_type__code__in=list(type_codes))
    return [
        RequestSpan(
            request_id=request.id,
            request_public_id=str(request.public_id),
            employee_id=request.employee_id,
            type_code=request.request_type.code,
            type_name_fr=request.request_type.name_fr,
            type_name_en=request.request_type.name_en,
            unit=request.request_type.unit,
            calendar_label=request.request_type.calendar_label,
            type_is_sensitive=request.request_type.is_sensitive,
            start_date=request.start_date,
            end_date=request.end_date,
            starts_at_midday=request.starts_at_midday,
            ends_at_midday=request.ends_at_midday,
            status=request.status,
        )
        for request in queryset
    ]


def absence_type_codes() -> set[str]:
    """Codes of the request types that count as an absence on the calendar."""
    return set(RequestType.objects.filter(calendar_label=CalendarLabel.ABSENT).values_list("code", flat=True))
