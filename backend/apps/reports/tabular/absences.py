"""Absences taken: one line per approved request, clipped to the period (REP-01, REP-05)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from apps.core.errors import DomainError
from apps.core.i18n import translate
from apps.requests import selectors as request_selectors

from .framework import People, Period, ReportParams, ReportResult, TotalLine, col, employees_in_scope
from .types import type_facts

ACCEPTS = frozenset({"period", "department", "employee", "type"})
ZERO = Decimal("0")


@dataclass(frozen=True)
class _Line:
    employee_id: int
    type_code: str
    start: date
    end: date
    days: Decimal | None
    hours: Decimal | None


def build(user, params: ReportParams, lang: str, now: datetime) -> ReportResult:
    columns = [
        col("employee", "text", lang),
        col("department", "text", lang),
        col("type", "text", lang),
        col("period", "period", lang),
        col("days", "number", lang),
        col("hours", "number", lang),
    ]
    facts = type_facts()
    if params.type_code and params.type_code not in facts:
        raise DomainError("reports.unknown_type", field="type")

    employees = employees_in_scope(user, params, include_archived=True)
    if not employees:
        # Never hand an empty id list to day_rows: "no filter" and "nobody" must not be confused.
        return ReportResult(columns=columns, rows=[], totals=None)
    people = People(employees, lang)

    day_rows = request_selectors.day_rows(
        start=params.start,
        end=params.end,
        statuses=["approved"],
        employee_ids=[employee.id for employee in employees],
        type_codes=[params.type_code] if params.type_code else None,
    )
    by_request: dict[int, list] = defaultdict(list)
    for row in day_rows:
        by_request[row.request_id].append(row)

    lines: list[_Line] = []
    for items in by_request.values():
        first = items[0]
        hourly = facts[first.type_code].unit == "hour"
        lines.append(
            _Line(
                employee_id=first.employee_id,
                type_code=first.type_code,
                start=min(item.day for item in items),
                end=max(item.day for item in items),
                days=None if hourly else sum((item.portion for item in items), ZERO),
                hours=sum((item.hours or ZERO for item in items), ZERO) if hourly else None,
            )
        )
    lines.sort(key=lambda line: (people.name(line.employee_id).casefold(), line.start, line.type_code))

    rows = [
        {
            "employee": people.name(line.employee_id),
            "department": people.department(line.employee_id),
            "type": facts[line.type_code].name(lang),
            "period": Period(line.start, line.end),
            "days": line.days,
            "hours": line.hours,
        }
        for line in lines
    ]
    return ReportResult(
        columns=columns, rows=rows, totals=_totals(lines, people, facts, lang) if lines else None
    )


def _totals(lines: list[_Line], people: People, facts: dict, lang: str) -> list[TotalLine]:
    def days_of(selected: list[_Line]) -> Decimal:
        return sum((line.days or ZERO for line in selected), ZERO)

    def hours_of(selected: list[_Line]) -> Decimal:
        return sum((line.hours or ZERO for line in selected), ZERO)

    totals = [
        TotalLine(
            "overall", translate("reports.total", lang), {"days": days_of(lines), "hours": hours_of(lines)}
        )
    ]

    employee_ids = sorted({line.employee_id for line in lines}, key=lambda eid: people.name(eid).casefold())
    for employee_id in employee_ids:
        own = [line for line in lines if line.employee_id == employee_id]
        totals.append(
            TotalLine("by_employee", people.name(employee_id), {"days": days_of(own), "hours": hours_of(own)})
        )

    for code, fact in facts.items():
        of_type = [line for line in lines if line.type_code == code]
        if not of_type:
            continue
        if fact.unit == "hour":
            values = {"days": None, "hours": hours_of(of_type)}
        else:
            values = {"days": days_of(of_type), "hours": None}
        totals.append(TotalLine("by_type", fact.name(lang), values))
    return totals
