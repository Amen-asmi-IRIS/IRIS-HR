"""Requests waiting: every request with a pending step, who it waits on and for how long."""

from __future__ import annotations

from datetime import datetime

from apps.core.errors import DomainError
from apps.requests import selectors as request_selectors

from .framework import People, Period, ReportParams, ReportResult, col, employees_in_scope
from .types import type_facts

ACCEPTS = frozenset({"department", "type", "step"})


def build(user, params: ReportParams, lang: str, now: datetime) -> ReportResult:
    columns = [
        col("requester", "text", lang),
        col("type", "text", lang),
        col("period", "period", lang),
        col("waiting_on", "text", lang),
        col("since", "datetime", lang),
        col("age_days", "number", lang),
        col("reminded", "datetime", lang),
        col("alerted", "datetime", lang),
    ]
    facts = type_facts()
    if params.type_code and params.type_code not in facts:
        raise DomainError("reports.unknown_type", field="type")

    employees = employees_in_scope(user, params, include_archived=True)
    if not employees:
        return ReportResult(columns=columns, rows=[], totals=None)
    people = People(employees, lang)

    items = request_selectors.waiting_rows(employee_ids=[employee.id for employee in employees])
    rows = []
    for item in items:  # the selector returns the longest wait first
        request = item.request
        code = request.request_type.code
        if params.type_code and code != params.type_code:
            continue
        if params.step and item.step.approver_rule != params.step:
            continue
        rows.append(
            {
                "requester": people.name(request.employee_id),
                "type": facts[code].name(lang),
                "period": Period(request.start_date, request.end_date),
                "waiting_on": ", ".join(item.waiting_on),
                "since": item.since,
                "age_days": None if item.since is None else max(0, (now - item.since).days),
                "reminded": item.reminded_at,
                "alerted": item.flagged_at,
            }
        )
    return ReportResult(columns=columns, rows=rows, totals=None)
