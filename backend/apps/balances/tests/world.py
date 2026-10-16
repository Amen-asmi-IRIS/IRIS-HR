"""Builders for ledger tests. The standard cast starts with an empty ledger."""

from __future__ import annotations

import calendar
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from apps.balances.models import LedgerEntry, LedgerKind

TUNIS = ZoneInfo("Africa/Tunis")


def at(year: int, month: int, day: int, hour: int = 9) -> datetime:
    """A moment in Tunis time, for time_machine.travel."""
    return datetime(year, month, day, hour, 0, tzinfo=TUNIS)


def days(*dates: date, portion: str = "1") -> dict[date, Decimal]:
    """Leave days as the request engine passes them: date -> 1 or 0.5."""
    return {day: Decimal(portion) for day in dates}


def make_entry(
    employee,
    kind: str,
    amount: str | Decimal,
    on: date,
    *,
    period: str = "",
    request_id: int | None = None,
    reason: str = "",
    created_by=None,
) -> LedgerEntry:
    return LedgerEntry.objects.create(
        employee=employee,
        kind=kind,
        amount=Decimal(str(amount)),
        effective_date=on,
        period=period,
        request_id=request_id,
        reason=reason,
        created_by=created_by,
    )


def give_opening(employee, days: str | Decimal, on: date = date(2025, 12, 31)) -> LedgerEntry:
    return make_entry(employee, LedgerKind.OPENING, days, on, reason="Opening balance")


def give_credit(employee, year: int, month: int, days: str | Decimal = "2.5") -> LedgerEntry:
    last = date(year, month, calendar.monthrange(year, month)[1])
    return make_entry(employee, LedgerKind.CREDIT, days, last, period=f"{year:04d}-{month:02d}")
