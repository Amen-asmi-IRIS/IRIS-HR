"""Permission hours by month and remote days by month: one row per employee for one year."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from datetime import date, datetime
from decimal import Decimal

from apps.core.i18n import translate
from apps.requests import selectors as request_selectors

from .framework import People, ReportParams, ReportResult, TotalLine, col, employees_in_scope
from .types import type_facts

ACCEPTS = frozenset({"year", "department", "employee"})
MONTH_KEYS = [f"m{month:02d}" for month in range(1, 13)]
ZERO = Decimal("0")


def build_permission_hours(user, params: ReportParams, lang: str, now: datetime) -> ReportResult:
    return _build(user, params, lang, pick=lambda fact: fact.unit == "hour", hourly=True)


def build_remote_days(user, params: ReportParams, lang: str, now: datetime) -> ReportResult:
    return _build(
        user,
        params,
        lang,
        pick=lambda fact: fact.unit == "day" and fact.calendar_label == "remote",
        hourly=False,
    )


def _build(user, params: ReportParams, lang: str, *, pick: Callable, hourly: bool) -> ReportResult:
    columns = [
        col("employee", "text", lang),
        *[col(key, "number", lang) for key in MONTH_KEYS],
        col("total", "number", lang),
    ]
    employees = employees_in_scope(user, params, include_archived=True)
    codes = [code for code, fact in type_facts().items() if pick(fact)]
    if not employees or not codes:
        # An empty list must never reach day_rows, where it could be read as "no filter".
        return ReportResult(columns=columns, rows=[], totals=None)
    people = People(employees, lang)

    day_rows = request_selectors.day_rows(
        start=date(params.year, 1, 1),
        end=date(params.year, 12, 31),
        statuses=["approved"],
        employee_ids=[employee.id for employee in employees],
        type_codes=codes,
    )
    grid: dict[int, dict[str, Decimal]] = defaultdict(dict)
    for row in day_rows:
        key = f"m{row.day.month:02d}"
        amount = (row.hours or ZERO) if hourly else row.portion
        grid[row.employee_id][key] = grid[row.employee_id].get(key, ZERO) + amount

    rows = []
    for employee in employees:  # already sorted by name
        months = grid.get(employee.id, {})
        total = sum(months.values(), ZERO)
        if total == ZERO:
            continue
        line: dict = {"employee": people.name(employee.id)}
        line.update({key: months.get(key) or None for key in MONTH_KEYS})
        line["total"] = total
        rows.append(line)
    if not rows:
        return ReportResult(columns=columns, rows=[], totals=None)

    overall: dict = {key: sum((row[key] or ZERO for row in rows), ZERO) or None for key in MONTH_KEYS}
    overall["total"] = sum((row["total"] for row in rows), ZERO)
    return ReportResult(
        columns=columns, rows=rows, totals=[TotalLine("overall", translate("reports.total", lang), overall)]
    )
