from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from django.conf import settings
from django.db import transaction

from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError, Problem

from ..models import Employee, EmployeeStatus
from ..selectors import full_name

_TEXT_FIELDS = (
    "employee_number",
    "first_name",
    "last_name",
    "gender",
    "professional_email",
    "personal_email",
    "phone",
    "address",
    "contract_type",
    "status",
    "emergency_contact_name",
    "emergency_contact_phone",
)
_DATE_FIELDS = ("date_of_birth", "hire_date", "contract_start_date", "contract_end_date")
_RELATIONS = ("department", "position", "manager")
WRITABLE_FIELDS = (*_TEXT_FIELDS, *_DATE_FIELDS, *_RELATIONS)


def employee_state(employee: Employee) -> dict[str, Any]:
    """What the audit trail and the record history show: readable values, no internal identifiers."""
    state: dict[str, Any] = {name: getattr(employee, name) for name in _TEXT_FIELDS}
    for name in _DATE_FIELDS:
        value = getattr(employee, name)
        state[name] = value.isoformat() if value else None
    state["department"] = employee.department.code
    state["position"] = employee.position.code
    state["manager"] = full_name(employee.manager) if employee.manager_id else None
    return state


def _normalise(data: Mapping[str, Any]) -> dict[str, Any]:
    values = {name: data[name] for name in WRITABLE_FIELDS if name in data}
    for name in _TEXT_FIELDS:
        if isinstance(values.get(name), str):
            values[name] = values[name].strip()
    if "professional_email" in values:
        values["professional_email"] = values["professional_email"].lower()
    return values


def _reports_to(person: Employee, boss: Employee) -> bool:
    """True when `person` is `boss` or sits anywhere below `boss` in the reporting line."""
    seen: set[int] = set()
    current: Employee | None = person
    while current is not None and current.pk not in seen:
        if current.pk == boss.pk:
            return True
        seen.add(current.pk)
        current = current.manager
    return False


def _problems(values: Mapping[str, Any], *, instance: Employee | None) -> list[Problem]:
    problems: list[Problem] = []
    others = Employee.objects.all() if instance is None else Employee.objects.exclude(pk=instance.pk)

    number = values.get("employee_number")
    if number is not None and others.filter(employee_number__iexact=number).exists():
        problems.append(Problem("organisation.number_taken", "employee_number"))

    email = values.get("professional_email")
    if email is not None:
        domain = settings.ALLOWED_EMAIL_DOMAIN.lower()
        if email.count("@") != 1 or not email.endswith(f"@{domain}"):
            problems.append(Problem("organisation.email_domain", "professional_email", {"domain": domain}))
        elif others.filter(professional_email__iexact=email).exists():
            problems.append(Problem("organisation.email_taken", "professional_email"))

    start = values.get("contract_start_date", instance.contract_start_date if instance else None)
    end = values.get("contract_end_date", instance.contract_end_date if instance else None)
    if start and end and end < start:
        problems.append(Problem("organisation.contract_dates", "contract_end_date"))

    manager = values.get("manager")
    if manager is not None:
        # The edit form sends every field: the manager a record already has stays, even once that person left.
        kept = instance is not None and instance.manager_id == manager.pk
        if manager.status == EmployeeStatus.ARCHIVED and not kept:
            problems.append(Problem("organisation.manager_left", "manager"))
        elif instance is not None and manager.pk == instance.pk:
            problems.append(Problem("organisation.manager_self", "manager"))
        elif instance is not None and _reports_to(manager, instance):
            problems.append(Problem("organisation.manager_loop", "manager"))
    return problems


def _raise_if_any(problems: list[Problem]) -> None:
    if problems:
        raise DomainError(problems[0].code, problems=problems)


@transaction.atomic
def create_employee(*, actor, data: Mapping[str, Any]) -> Employee:
    values = _normalise(data)
    values.setdefault("status", EmployeeStatus.ACTIVE)
    if values["status"] == EmployeeStatus.ARCHIVED:
        raise ValueError("a new employee cannot be archived; use archive_employee to record a departure")
    _raise_if_any(_problems(values, instance=None))
    employee = Employee.objects.create(**values)
    after = employee_state(employee)
    audit.record(
        action="employee.created",
        obj=employee,
        actor=actor,
        object_label=full_name(employee),
        changes=audit.diff(dict.fromkeys(after), after),
    )
    return employee


@transaction.atomic
def update_employee(*, actor, employee: Employee, data: Mapping[str, Any]) -> Employee:
    values = _normalise(data)
    status = values.get("status")
    if status == EmployeeStatus.ARCHIVED and employee.status != EmployeeStatus.ARCHIVED:
        raise ValueError("use archive_employee to record a departure")
    if employee.status == EmployeeStatus.ARCHIVED and status not in (None, EmployeeStatus.ARCHIVED):
        raise Conflict("organisation.already_archived")
    _raise_if_any(_problems(values, instance=employee))

    before = employee_state(employee)
    for name, value in values.items():
        setattr(employee, name, value)
    employee.save()
    changes = audit.diff(before, employee_state(employee))
    if changes:
        audit.record(
            action="employee.updated",
            obj=employee,
            actor=actor,
            object_label=full_name(employee),
            changes=changes,
        )
    return employee
