"""Shared pieces of every tabular report: result shape, parameters, reach."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date
from typing import Any

from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.core.errors import DomainError, NotAllowed, NotFound, Problem
from apps.core.i18n import translate
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors

SCOPE_TEAM = "team"
SCOPE_ALL = "all"
MAX_PERIOD_DAYS = 731
STEP_RULES = ("line_manager", "hr_role", "named_person")
FILTERS = ("department", "employee", "type", "step")


@dataclass(frozen=True)
class Column:
    key: str
    label: str
    kind: str  # "text" | "number" | "date" | "datetime" | "period"


@dataclass(frozen=True)
class Period:
    """The value of a cell of kind "period": one attribute on screen, two date columns in a workbook."""

    start: date
    end: date


@dataclass(frozen=True)
class TotalLine:
    group: str  # "overall" | "by_employee" | "by_type"
    label: str
    values: Mapping[str, Any]


@dataclass(frozen=True)
class ReportResult:
    columns: list[Column]
    rows: list[dict[str, Any]]
    totals: list[TotalLine] | None = None
    # Sentences the reader must have beside the figures, in their language (a balance that counts a
    # month-end credit not posted yet, master 13.1). Shown under the table, and on a sheet of their own in a workbook.
    notes: tuple[str, ...] = ()


@dataclass(frozen=True)
class ReportParams:
    scope: str
    start: date | None = None
    end: date | None = None
    on: date | None = None
    year: int | None = None
    department_id: int | None = None
    employee_public_id: str | None = None
    type_code: str | None = None
    step: str | None = None

    def as_audit(self) -> dict[str, str]:
        """The filters as they are written to the audit trail: query names, only what was set."""
        pairs = {
            "scope": self.scope,
            "from": self.start.isoformat() if self.start else None,
            "to": self.end.isoformat() if self.end else None,
            "on": self.on.isoformat() if self.on else None,
            "year": str(self.year) if self.year is not None else None,
            "department": str(self.department_id) if self.department_id is not None else None,
            "employee": self.employee_public_id,
            "type": self.type_code,
            "step": self.step,
        }
        return {key: value for key, value in pairs.items() if value is not None}


def col(key: str, kind: str = "text", lang: str | None = None) -> Column:
    return Column(key=key, label=translate(f"reports.col_{key}", lang), kind=kind)


def resolve_scope(user, requested: str | None) -> str:
    wide = has_role(user, Role.HR, Role.EXEC)
    if not requested:
        return SCOPE_ALL if wide else SCOPE_TEAM
    if requested == SCOPE_ALL:
        if not wide:
            raise NotAllowed("reports.scope_not_allowed")
        return SCOPE_ALL
    if requested == SCOPE_TEAM:
        if not has_role(user, Role.MANAGER):
            raise NotAllowed("reports.scope_not_allowed")
        return SCOPE_TEAM
    raise DomainError("reports.unknown_scope", field="scope")


def _date(raw: str, field: str, problems: list[Problem]) -> date | None:
    try:
        return date.fromisoformat(raw)
    except ValueError:
        problems.append(Problem("reports.invalid_date", field))
        return None


def parse_params(
    query: Mapping[str, str], *, user, accepts: frozenset[str], today: date | None = None
) -> ReportParams:
    today = today or timezone.localdate()
    scope = resolve_scope(user, query.get("scope"))
    problems: list[Problem] = []
    values: dict[str, Any] = {"scope": scope}

    if "period" in accepts:
        raw_from, raw_to = query.get("from"), query.get("to")
        if not raw_from or not raw_to:
            problems.append(Problem("reports.period_required", "to" if raw_from else "from"))
        else:
            start = _date(raw_from, "from", problems)
            end = _date(raw_to, "to", problems)
            if start and end:
                if end < start:
                    problems.append(Problem("reports.period_order", "to"))
                elif (end - start).days > MAX_PERIOD_DAYS:
                    problems.append(Problem("reports.period_too_long", "to", {"days": MAX_PERIOD_DAYS}))
                else:
                    values["start"], values["end"] = start, end

    if "on" in accepts:
        raw_on = query.get("on")
        values["on"] = _date(raw_on, "on", problems) if raw_on else today

    if "year" in accepts:
        raw_year = query.get("year")
        if not raw_year:
            values["year"] = today.year
        elif raw_year.isdigit() and 2000 <= int(raw_year) <= 2100:
            values["year"] = int(raw_year)
        else:
            problems.append(Problem("reports.invalid_year", "year"))

    for name in FILTERS:
        raw = query.get(name)
        if not raw:
            continue
        if name not in accepts or (name == "department" and scope == SCOPE_TEAM):
            problems.append(Problem("reports.filter_not_available", name))
        elif name == "department":
            if raw.isdigit():
                values["department_id"] = int(raw)
            else:
                problems.append(Problem("reports.invalid_filter", "department"))
        elif name == "employee":
            values["employee_public_id"] = raw
        elif name == "type":
            values["type_code"] = raw
        elif raw in STEP_RULES:
            values["step"] = raw
        else:
            problems.append(Problem("reports.unknown_step", "step"))

    if problems:
        raise DomainError(problems[0].code, problems=problems)
    return ReportParams(**values)


def employees_in_scope(user, params: ReportParams, *, include_archived: bool) -> list:
    """The employees a report may show, after the employee and department filters, sorted by name.

    Filtering happens in Python on what the organisation selector returns: this app never
    queries organisation tables itself, and the company has a few dozen people.
    """
    employees = list(organisation_selectors.employees_for(user, include_archived=include_archived))
    if params.scope == SCOPE_TEAM:
        team = reach.team_ids(user)
        employees = [employee for employee in employees if employee.id in team]
    if params.employee_public_id:
        employees = [
            employee for employee in employees if str(employee.public_id) == params.employee_public_id
        ]
        if not employees:
            raise NotFound("reports.employee_not_found")
    if params.department_id is not None:
        employees = [employee for employee in employees if employee.department_id == params.department_id]
    return sorted(
        employees, key=lambda employee: (organisation_selectors.full_name(employee).casefold(), employee.id)
    )


class People:
    """Names and department names of the employees of one report, looked up by id."""

    def __init__(self, employees: Iterable, lang: str) -> None:
        self._by_id = {employee.id: employee for employee in employees}
        self._lang = lang
        self._departments: dict[int | None, str] = {}

    def name(self, employee_id: int) -> str:
        return organisation_selectors.full_name(self._by_id[employee_id])

    def department(self, employee_id: int) -> str:
        employee = self._by_id[employee_id]
        key = employee.department_id
        if key not in self._departments:
            self._departments[key] = organisation_selectors.department_name(employee, self._lang)
        return self._departments[key]

    def department_options(self) -> list[tuple[int, str]]:
        """(id, name) of every department that has someone in this report, sorted by name."""
        for employee_id in self._by_id:
            self.department(employee_id)
        return sorted(
            ((key, name) for key, name in self._departments.items() if key is not None),
            key=lambda pair: pair[1].casefold(),
        )
