"""The six reports by name; running one; exporting one (audited); the options of their filters."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.audit import services as audit
from apps.core.errors import NotAllowed, NotFound
from apps.core.i18n import active_language, translate

from . import absences, balances, certificates, monthly, waiting
from .framework import (
    SCOPE_ALL,
    STEP_RULES,
    People,
    ReportParams,
    ReportResult,
    employees_in_scope,
    parse_params,
    resolve_scope,
)
from .render import to_workbook
from .types import type_facts


@dataclass(frozen=True)
class ReportDef:
    name: str
    title_code: str
    accepts: frozenset[str]
    build: Callable[[Any, ReportParams, str, datetime], ReportResult]
    hr_only: bool = False


@dataclass(frozen=True)
class ReportRun:
    definition: ReportDef
    params: ReportParams
    result: ReportResult
    lang: str


REPORTS: dict[str, ReportDef] = {
    definition.name: definition
    for definition in (
        ReportDef("absences", "reports.title_absences", absences.ACCEPTS, absences.build),
        ReportDef("balances", "reports.title_balances", balances.ACCEPTS, balances.build),
        ReportDef("waiting", "reports.title_waiting", waiting.ACCEPTS, waiting.build),
        ReportDef(
            "permission-hours",
            "reports.title_permission_hours",
            monthly.ACCEPTS,
            monthly.build_permission_hours,
        ),
        ReportDef("remote-days", "reports.title_remote_days", monthly.ACCEPTS, monthly.build_remote_days),
        ReportDef(
            "certificates",
            "reports.title_certificates",
            certificates.ACCEPTS,
            certificates.build,
            hr_only=True,
        ),
    )
}


def run_report(*, user, name: str, query: Mapping[str, str], now: datetime | None = None) -> ReportRun:
    definition = REPORTS.get(name)
    if definition is None:
        raise NotFound("reports.unknown_report")
    if definition.hr_only and not has_role(user, Role.HR):
        raise NotAllowed("reports.hr_only")
    now = now or timezone.now()
    params = parse_params(query, user=user, accepts=definition.accepts, today=timezone.localtime(now).date())
    if definition.hr_only and params.scope != SCOPE_ALL:
        raise NotAllowed("reports.hr_only")
    lang = active_language()
    return ReportRun(
        definition=definition, params=params, result=definition.build(user, params, lang, now), lang=lang
    )


def export_report(
    *, user, name: str, query: Mapping[str, str], now: datetime | None = None
) -> tuple[bytes, str]:
    now = now or timezone.now()
    run = run_report(user=user, name=name, query=query, now=now)
    title = translate(run.definition.title_code, run.lang)
    content = to_workbook(run.result, title=title, lang=run.lang)
    audit.record(
        action="report.exported",
        object_type="report",
        object_id=name,
        object_label=title,
        changes={"filters": run.params.as_audit(), "rows": len(run.result.rows)},
        actor=user,
    )
    return content, f"{name}_{timezone.localtime(now).date().isoformat()}.xlsx"


def filter_options(*, user, scope: str | None) -> dict[str, Any]:
    """What the filters of a report page may offer this user: never more than the report itself would show."""
    resolved = resolve_scope(user, scope)
    lang = active_language()
    employees = employees_in_scope(user, ReportParams(scope=resolved), include_archived=True)
    people = People(employees, lang)
    whole_company = resolved == SCOPE_ALL
    return {
        "scope": resolved,
        "departments": [{"id": key, "name": name} for key, name in people.department_options()]
        if whole_company
        else [],
        "employees": [
            {"public_id": str(employee.public_id), "name": people.name(employee.id)} for employee in employees
        ],
        # `employee.user` is the account this employee row points to (master D6); only its public id is read.
        "actors": [
            {"public_id": str(employee.user.public_id), "name": people.name(employee.id)}
            for employee in employees
            if employee.user_id is not None
        ]
        if whole_company
        else [],
        "types": [{"code": code, "name": fact.name(lang)} for code, fact in type_facts().items()],
        "steps": [{"code": rule, "name": translate(f"reports.step_{rule}", lang)} for rule in STEP_RULES],
    }
