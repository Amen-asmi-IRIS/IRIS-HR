"""Working-day arithmetic (PRD 6.1). Every count of days in the platform goes through this module."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.settings import services as settings_service

from .models import PublicHoliday

FULL = Decimal("1")
HALF = Decimal("0.5")


def _week() -> frozenset[int]:
    return frozenset(int(day) for day in settings_service.get("working_week"))


def working_week() -> tuple[int, ...]:
    """The ISO weekdays that are worked (Monday = 1), from HR's `working_week` setting, in order."""
    return tuple(sorted(_week()))


def _holidays(start: date, end: date) -> set[date]:
    return set(PublicHoliday.objects.filter(date__gte=start, date__lte=end).values_list("date", flat=True))


def _each_day(start: date, end: date) -> Iterator[date]:
    # Counted by ordinal: adding a day to the last date the calendar knows would be an error.
    for ordinal in range(start.toordinal(), end.toordinal() + 1):
        yield date.fromordinal(ordinal)


def is_working_day(day: date) -> bool:
    return day.isoweekday() in _week() and not PublicHoliday.objects.filter(date=day).exists()


def working_days(start: date, end: date) -> list[date]:
    """Working days from start to end inclusive. Empty when end is before start."""
    if end < start:
        return []
    week = _week()
    holidays = _holidays(start, end)
    return [day for day in _each_day(start, end) if day.isoweekday() in week and day not in holidays]


def day_portions(
    start: date, end: date, *, starts_at_midday: bool, ends_at_midday: bool
) -> dict[date, Decimal]:
    """Each working day of the range with the part of it that is taken: 1 or 0.5."""
    portions = {day: FULL for day in working_days(start, end)}
    if starts_at_midday and start in portions:
        portions[start] -= HALF
    if ends_at_midday and end in portions:
        portions[end] -= HALF
    return {day: portion for day, portion in portions.items() if portion > 0}


def skipped_days(start: date, end: date) -> list[tuple[date, str]]:
    """Days of the range that are not counted, each with "weekend" or "holiday"."""
    if end < start:
        return []
    week = _week()
    holidays = _holidays(start, end)
    skipped: list[tuple[date, str]] = []
    for day in _each_day(start, end):
        if day.isoweekday() not in week:
            skipped.append((day, "weekend"))
        elif day in holidays:
            skipped.append((day, "holiday"))
    return skipped


def add_working_days(start: date, count: int) -> date:
    """The date reached after moving forward by `count` working days. `start` itself is not counted."""
    if count < 0:
        raise ValueError("count must not be negative")
    if not _week():
        raise ValueError("the working week is empty")
    day = start
    remaining = count
    while remaining > 0:
        day += timedelta(days=1)
        if is_working_day(day):
            remaining -= 1
    return day


def working_days_between(earlier: datetime, later: datetime) -> int:
    """Whole working days elapsed between two moments, in Tunis time.

    A working day counts once the clock on that day reaches the time of day of `earlier`.
    """
    start = timezone.localtime(earlier)
    end = timezone.localtime(later)
    if end <= start:
        return 0
    days = working_days(start.date() + timedelta(days=1), end.date())
    elapsed = len(days)
    if days and days[-1] == end.date() and end.time() < start.time():
        elapsed -= 1
    return elapsed
