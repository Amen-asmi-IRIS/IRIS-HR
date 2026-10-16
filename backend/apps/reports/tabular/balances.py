"""Balances at a date: the balance on the date, days pending, days approved and upcoming."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from django.utils import timezone

from apps.balances import selectors as balance_selectors
from apps.core.i18n import translate

from .framework import People, ReportParams, ReportResult, TotalLine, col, employees_in_scope

ACCEPTS = frozenset({"on", "department", "employee"})
ZERO = Decimal("0")


def build(user, params: ReportParams, lang: str, now: datetime) -> ReportResult:
    columns = [
        col("employee", "text", lang),
        col("department", "text", lang),
        col("balance", "number", lang),
        col("pending", "number", lang),
        col("approved_upcoming", "number", lang),
    ]
    employees = employees_in_scope(user, params, include_archived=False)
    if not employees:
        return ReportResult(columns=columns, rows=[], totals=None)
    people = People(employees, lang)

    # Posted lines; on a date today or later, also the month-end credits due by then (master 13.1).
    found = balance_selectors.balances_at_period_end(
        params.on, employee_ids=[employee.id for employee in employees], today=timezone.localtime(now).date()
    )
    # The `pending` and `approved_upcoming` of each person's balance figures, read for everybody at once.
    held = balance_selectors.held_and_upcoming([employee.id for employee in employees], today=params.on)
    rows = []
    for employee in employees:
        pending, approved_upcoming = held[employee.id]
        rows.append(
            {
                "employee": people.name(employee.id),
                "department": people.department(employee.id),
                "balance": found.balances.get(employee.id, ZERO),
                "pending": pending,
                "approved_upcoming": approved_upcoming,
            }
        )

    overall = {
        key: sum((row[key] for row in rows), ZERO) for key in ("balance", "pending", "approved_upcoming")
    }
    notes = (translate("reports.note_credits_to_come", lang, on=params.on),) if found.credits_to_come else ()
    return ReportResult(
        columns=columns,
        rows=rows,
        totals=[TotalLine("overall", translate("reports.total", lang), overall)],
        notes=notes,
    )
