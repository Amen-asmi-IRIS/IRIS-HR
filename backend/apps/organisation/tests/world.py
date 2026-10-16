"""Builders for organisation data and the organisation part of the standard cast (master 6.11)."""

from __future__ import annotations

from datetime import date, timedelta

from django.utils import timezone

from apps.organisation.models import (
    ContractType,
    Delegation,
    Department,
    Employee,
    EmployeeDocument,
    Position,
    ProfileChange,
)


def make_department(
    code: str = "DEP-X", name_fr: str = "Département X", name_en: str = "Department X", **extra
) -> Department:
    return Department.objects.create(code=code, name_fr=name_fr, name_en=name_en, **extra)


def make_position(
    code: str = "POS-X", title_fr: str = "Poste X", title_en: str = "Position X", **extra
) -> Position:
    return Position.objects.create(code=code, title_fr=title_fr, title_en=title_en, **extra)


def make_employee(
    *,
    number: str,
    first_name: str,
    last_name: str,
    department: Department,
    position: Position,
    manager: Employee | None = None,
    user=None,
    email: str | None = None,
    **extra,
) -> Employee:
    if email is None:
        email = user.email if user is not None else f"{first_name}.{last_name}@impactrisks.com"
    extra.setdefault("hire_date", date(2020, 1, 6))
    extra.setdefault("contract_type", ContractType.PERMANENT)
    return Employee.objects.create(
        employee_number=number,
        first_name=first_name,
        last_name=last_name,
        professional_email=email.lower(),
        department=department,
        position=position,
        manager=manager,
        user=user,
        **extra,
    )


def build(w) -> None:
    """Adds departments, a position and one employee per cast account."""
    w.dept_a = make_department("DEP-A", "Département A", "Department A")
    w.dept_b = make_department("DEP-B", "Département B", "Department B")
    w.position = make_position("POS-1", "Chargé de mission", "Officer")

    def cast(number, first_name, last_name, user, department, manager):
        return make_employee(
            number=number,
            first_name=first_name,
            last_name=last_name,
            user=user,
            department=department,
            position=w.position,
            manager=manager,
        )

    w.ceo = cast("E001", "Karim", "Directeur", w.exec_user, w.dept_b, None)
    w.hr = cast("E002", "Senna", "RH", w.hr_user, w.dept_b, w.ceo)
    w.manager = cast("E003", "Mounir", "Manager", w.manager_user, w.dept_a, w.ceo)
    w.owner = cast("E004", "Amal", "Employee", w.owner_user, w.dept_a, w.manager)
    w.peer = cast("E005", "Bilel", "Employee", w.peer_user, w.dept_a, w.manager)
    w.other_manager = cast("E006", "Nadia", "Manager", w.other_manager_user, w.dept_b, w.ceo)
    w.outsider = cast("E007", "Chokri", "Employee", w.outsider_user, w.dept_b, w.other_manager)


def make_delegation(
    w,
    *,
    manager: Employee | None = None,
    delegate: Employee | None = None,
    start: date | None = None,
    days: int = 5,
) -> Delegation:
    """A delegation that starts in a month by default, so it changes nobody's reach today."""
    start = start or timezone.localdate() + timedelta(days=30)
    return Delegation.objects.create(
        manager=manager or w.manager,
        delegate=delegate or w.peer,
        start_date=start,
        end_date=start + timedelta(days=days - 1),
    )


def make_document(
    w, *, employee: Employee | None = None, visible: bool = True, label: str = "Contrat"
) -> EmployeeDocument:
    from apps.files.tests.world import upload
    from apps.organisation import services

    return services.add_document(
        actor=w.hr_user,
        employee=employee or w.owner,
        upload=upload("contrat.pdf"),
        label=label,
        visible_to_employee=visible,
    )


def make_profile_change(w, *, user=None, **changes) -> ProfileChange:
    from apps.organisation import services

    return services.propose_profile_change(
        user=user or w.owner_user, changes=changes or {"phone": "20 111 222"}
    )
