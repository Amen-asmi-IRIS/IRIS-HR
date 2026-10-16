"""What a person asks for, and how much it is. The server always computes the quantity (REQ-01)."""

from __future__ import annotations

import datetime as dt
from collections.abc import Mapping
from dataclasses import dataclass, replace
from decimal import Decimal

from apps.calendar import workdays

from ..models import Unit

CENT = Decimal("0.01")
ZERO = Decimal("0")

DATA_FIELDS = (
    "start_date",
    "end_date",
    "starts_at_midday",
    "ends_at_midday",
    "start_time",
    "end_time",
    "exceptional_event_id",
    "comment",
)


@dataclass(frozen=True)
class RequestData:
    start_date: dt.date
    end_date: dt.date
    starts_at_midday: bool = False
    ends_at_midday: bool = False
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    exceptional_event_id: int | None = None
    comment: str = ""


def normalise(request_type, data: RequestData) -> RequestData:
    """The same request without what its type has no use for, so that it is never stored.

    A form may send an event with a leave that has none, or times with a leave counted in days.
    """
    changes: dict = {}
    if not request_type.uses_events and data.exceptional_event_id is not None:
        changes["exceptional_event_id"] = None
    if request_type.unit == Unit.DAY and (data.start_time is not None or data.end_time is not None):
        changes.update(start_time=None, end_time=None)
    return replace(data, **changes) if changes else data


def data_of(request) -> RequestData:
    return RequestData(**{field: getattr(request, field) for field in DATA_FIELDS})


def amendment_data(amendment) -> RequestData:
    """The request as it would be once a change amendment is approved."""
    request = amendment.request
    return RequestData(
        start_date=amendment.new_start_date,
        end_date=amendment.new_end_date,
        starts_at_midday=amendment.new_starts_at_midday,
        ends_at_midday=amendment.new_ends_at_midday,
        start_time=amendment.new_start_time,
        end_time=amendment.new_end_time,
        exceptional_event_id=request.exceptional_event_id,
        comment=request.comment,
    )


def apply_data(request, data: RequestData) -> None:
    for field in DATA_FIELDS:
        setattr(request, field, getattr(data, field))


def hours_between(start_time: dt.time | None, end_time: dt.time | None) -> Decimal:
    if start_time is None or end_time is None or end_time <= start_time:
        return ZERO.quantize(CENT)
    start = dt.datetime.combine(dt.date.min, start_time)
    end = dt.datetime.combine(dt.date.min, end_time)
    return (Decimal(int((end - start).total_seconds())) / Decimal(3600)).quantize(CENT)


def leave_days(request_type, data: RequestData) -> dict[dt.date, Decimal]:
    """Each working day a day-based request takes, with 1 or 0.5. Empty for hour-based types."""
    if request_type.unit != Unit.DAY:
        return {}
    return workdays.day_portions(
        data.start_date,
        data.end_date,
        starts_at_midday=data.starts_at_midday,
        ends_at_midday=data.ends_at_midday,
    )


def compute_quantity(request_type, data: RequestData) -> Decimal:
    if request_type.unit == Unit.HOUR:
        return hours_between(data.start_time, data.end_time)
    return sum(leave_days(request_type, data).values(), ZERO).quantize(CENT)


def day_diff(
    old: Mapping[dt.date, Decimal], new: Mapping[dt.date, Decimal]
) -> tuple[dict[dt.date, Decimal], dict[dt.date, Decimal]]:
    """(released, added): what a change of dates gives back and what it newly takes, day by day."""
    released = {
        day: portion - new.get(day, ZERO) for day, portion in old.items() if portion > new.get(day, ZERO)
    }
    added = {
        day: portion - old.get(day, ZERO) for day, portion in new.items() if portion > old.get(day, ZERO)
    }
    return released, added
