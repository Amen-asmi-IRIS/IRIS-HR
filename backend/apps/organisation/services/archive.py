from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date

from django.db import transaction

from apps.accounts import services as accounts_services
from apps.audit import services as audit
from apps.core.errors import Conflict

from ..models import Employee, EmployeeStatus
from ..selectors import direct_reports, full_name
from .employees import employee_state


@dataclass(frozen=True)
class ArchiveItem:
    label: str
    link: str = ""


@dataclass(frozen=True)
class ArchiveSection:
    key: str
    items: list[ArchiveItem] = field(default_factory=list)


@dataclass(frozen=True)
class ArchivePreview:
    has_account: bool
    reports: list[ArchiveItem]
    sections: list[ArchiveSection]


_contributors: list[Callable[[Employee], ArchiveSection | None]] = []


def register_archive_contributor(fn: Callable[[Employee], ArchiveSection | None]) -> None:
    """Lets another app list what a departure would leave open (requests, steps to decide, …)."""
    _contributors.append(fn)


_departure_listeners: list[Callable[..., None]] = []


def register_departure_listener(fn: Callable[..., None]) -> None:
    """Lets another app act once a departure is recorded: `fn(employee=..., actor=...)`, inside its transaction.

    The leaver is already archived, with the account switched off.
    """
    _departure_listeners.append(fn)


def archive_preview(*, employee: Employee) -> ArchivePreview:
    reports = [
        ArchiveItem(label=full_name(report), link=f"/hr/employees/{report.public_id}")
        for report in direct_reports(employee)
    ]
    candidates = [contribute(employee) for contribute in _contributors]
    sections = [section for section in candidates if section is not None and section.items]
    has_account = employee.user_id is not None and employee.user.is_active
    return ArchivePreview(has_account=has_account, reports=reports, sections=sections)


@transaction.atomic
def archive_employee(*, actor, employee: Employee, leaving_date: date, reason: str) -> Employee:
    employee = (
        Employee.objects.select_for_update(of=("self",))
        .select_related("department", "position", "manager", "user")
        .get(pk=employee.pk)
    )
    if employee.status == EmployeeStatus.ARCHIVED:
        raise Conflict("organisation.already_archived")

    before = {**employee_state(employee), "archived_at": None, "archive_reason": ""}
    employee.status = EmployeeStatus.ARCHIVED
    employee.archived_at = leaving_date
    employee.archive_reason = reason.strip()
    employee.save(update_fields=["status", "archived_at", "archive_reason", "updated_at"])
    after = {
        **employee_state(employee),
        "archived_at": leaving_date.isoformat(),
        "archive_reason": employee.archive_reason,
    }

    if employee.user_id is not None and employee.user.is_active:
        accounts_services.disable_account(actor=actor, user=employee.user)
    for listen in _departure_listeners:
        listen(employee=employee, actor=actor)

    audit.record(
        action="employee.archived",
        obj=employee,
        actor=actor,
        object_label=full_name(employee),
        changes=audit.diff(before, after),
    )
    return employee
