"""The KPMG export (REP-03 to REP-08): absence figures per employee for one payroll period."""

from __future__ import annotations

import calendar
from collections import Counter, defaultdict
from collections.abc import Mapping
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.audit import services as audit
from apps.balances import selectors as balance_selectors
from apps.core.errors import DomainError
from apps.core.i18n import active_language, translate
from apps.requests import selectors as request_selectors
from apps.settings import services as settings_service

from .tabular.framework import People, ReportParams, ReportResult, col, employees_in_scope, parse_params
from .tabular.render import to_workbook
from .tabular.types import type_facts

ACCEPTS = frozenset({"period", "department", "employee", "type"})
KPMG_COLUMNS: tuple[tuple[str, str], ...] = (
    ("employee_number", "text"),
    ("name", "text"),
    ("department", "text"),
    ("annual_days", "number"),
    ("sick_days", "number"),
    ("exceptional_days", "number"),
    ("permission_hours", "number"),
    ("remote_days", "number"),
    ("balance_end", "number"),
    ("meal_tickets", "number"),
)
ABSENCE_KEYS = ("annual_days", "sick_days", "exceptional_days", "permission_hours", "remote_days")
BY_CODE = {"annual": "annual_days", "sick": "sick_days", "exceptional": "exceptional_days"}
ZERO = Decimal("0")
FULL_DAY = Decimal("1")


def _add_months(day: date, months: int) -> date:
    """The same day `months` later, or the last day of that month when it is shorter."""
    index = day.month - 1 + months
    year, month = day.year + index // 12, index % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def months_covered(start: date, end: date) -> int:
    """Whole months of a period (D38), at least one: 1 to 30 Nov is 1, 26 Oct to 25 Nov is 1,
    1 Nov to 15 Dec is 1 (the half month does not count), 1 Nov to 31 Dec is 2."""
    after_end = end + timedelta(days=1)
    months = 0
    while _add_months(start, months + 1) <= after_end:
        months += 1
    return max(1, months)


def default_period(*, today: date | None = None) -> tuple[date, date, int | None]:
    """REP-07: the last calendar month that is over (D53), or the payroll period ending on this
    month's cut-off day (D39)."""
    today = today or timezone.localdate()
    cutoff = settings_service.get("export_cutoff_day")
    last_of_previous_month = today.replace(day=1) - timedelta(days=1)
    if cutoff is None:
        return last_of_previous_month.replace(day=1), last_of_previous_month, None
    end = today.replace(day=cutoff)  # the setting is capped at 28, so the day exists in every month
    start = last_of_previous_month.replace(day=cutoff) + timedelta(days=1)
    return start, end, cutoff


def _employed_in(employee, start: date, end: date) -> bool:
    """Hired on or before the last day of the period, and not gone before its first day.

    `archived_at` is the leaving date HR recorded (plan 02); it is empty while the person is employed.
    """
    if employee.hire_date > end:
        return False
    return employee.archived_at is None or employee.archived_at >= start


def _column_of(fact) -> str | None:
    if fact.unit == "hour":
        return "permission_hours"
    if fact.calendar_label == "remote":
        return "remote_days"
    return BY_CODE.get(fact.code)


def build_kpmg(
    *, user, query: Mapping[str, str], now: datetime | None = None
) -> tuple[ReportParams, ReportResult]:
    now = now or timezone.now()
    lang = active_language()
    without_scope = {key: value for key, value in query.items() if key != "scope"}
    params = parse_params(without_scope, user=user, accepts=ACCEPTS, today=timezone.localtime(now).date())
    facts = type_facts()
    if params.type_code and params.type_code not in facts:
        raise DomainError("reports.unknown_type", field="type")
    columns = [col(key, kind, lang) for key, kind in KPMG_COLUMNS]

    employees = [
        employee
        for employee in employees_in_scope(user, params, include_archived=True)
        if _employed_in(employee, params.start, params.end)
    ]
    if not employees:
        raise DomainError("reports.nothing_to_export")
    people = People(employees, lang)

    day_rows = request_selectors.day_rows(
        start=params.start,
        end=params.end,
        statuses=["approved"],
        employee_ids=[employee.id for employee in employees],
    )

    sums: dict[int, dict[str, Decimal]] = defaultdict(lambda: dict.fromkeys(ABSENCE_KEYS, ZERO))
    absent_portion: dict[tuple[int, date], Decimal] = defaultdict(lambda: ZERO)
    for row in day_rows:
        fact = facts[row.type_code]
        if fact.unit == "day" and fact.reduces_meal_tickets:
            absent_portion[(row.employee_id, row.day)] += row.portion
        if params.type_code and row.type_code != params.type_code:
            continue
        column = _column_of(fact)
        if column is None:
            continue
        sums[row.employee_id][column] += (row.hours or ZERO) if fact.unit == "hour" else row.portion

    tickets_lost = Counter(
        employee_id for (employee_id, _day), portion in absent_portion.items() if portion >= FULL_DAY
    )
    base = settings_service.get("meal_tickets_per_month") * months_covered(params.start, params.end)
    # Posted lines, plus the month-end credits due by the period's end and not posted yet (master 13.1).
    found = balance_selectors.balances_at_period_end(
        params.end, employee_ids=[employee.id for employee in employees], today=timezone.localtime(now).date()
    )

    rows = []
    for employee in employees:
        row = {
            "employee_number": employee.employee_number,
            "name": people.name(employee.id),
            "department": people.department(employee.id),
        }
        row.update(sums[employee.id])
        row["balance_end"] = found.balances.get(employee.id, ZERO)
        row["meal_tickets"] = max(0, base - tickets_lost[employee.id])
        rows.append(row)
    notes = (
        (translate("reports.note_kpmg_credits_to_come", lang, on=params.end),)
        if found.credits_to_come
        else ()
    )
    return params, ReportResult(columns=columns, rows=rows, totals=None, notes=notes)


def export_kpmg(*, user, query: Mapping[str, str], now: datetime | None = None) -> tuple[bytes, str]:
    params, result = build_kpmg(user=user, query=query, now=now)
    lang = active_language()
    period = f"{params.start.isoformat()} {params.end.isoformat()}"
    content = to_workbook(result, title=f"KPMG {period}", lang=lang)
    audit.record(
        action="export.kpmg",
        object_type="export",
        object_id="kpmg",
        object_label=f"{translate('reports.title_kpmg', lang)} {period}",
        changes={"filters": params.as_audit(), "rows": len(result.rows)},
        actor=user,
    )
    return content, f"kpmg_{params.start.isoformat()}_{params.end.isoformat()}.xlsx"
