"""Certificates outstanding: sick leaves still waiting for their medical certificate. Dates only, never content."""

from __future__ import annotations

from datetime import datetime

from apps.requests import selectors as request_selectors

from .framework import People, Period, ReportParams, ReportResult, col, employees_in_scope

ACCEPTS = frozenset({"department"})


def build(user, params: ReportParams, lang: str, now: datetime) -> ReportResult:
    columns = [
        col("employee", "text", lang),
        col("department", "text", lang),
        col("period", "period", lang),
        col("due", "datetime", lang),
        col("overdue_hours", "number", lang),
    ]
    employees = employees_in_scope(user, params, include_archived=True)
    if not employees:
        return ReportResult(columns=columns, rows=[], totals=None)
    people = People(employees, lang)

    items = request_selectors.outstanding_certificates(
        employee_ids=[employee.id for employee in employees], now=now
    )
    rows = []
    for item in items:  # the selector returns the earliest deadline first
        request = item.request
        rows.append(
            {
                "employee": people.name(request.employee_id),
                "department": people.department(request.employee_id),
                "period": Period(request.start_date, request.end_date),
                "due": item.due_at,
                "overdue_hours": None if item.overdue is None else int(item.overdue.total_seconds() // 3600),
            }
        )
    return ReportResult(columns=columns, rows=rows, totals=None)
