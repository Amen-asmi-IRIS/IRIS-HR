"""Builds a company of the size NFR-01 states, with a year of approved requests.

Test tooling only. Everything goes through the services of the master plan, so the data is what
real use would produce, including audit rows, notifications and ledger entries.
"""

from __future__ import annotations

import os
from datetime import date, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.accounts import services as account_services
from apps.accounts.roles import Role
from apps.balances import services as balance_services
from apps.core.errors import DomainError
from apps.organisation import services as organisation_services
from apps.organisation.models import Employee
from apps.requests import services as request_services
from apps.requests.models import Decision, Request, RequestStep, RequestType, StepStatus
from apps.requests.services import RequestData

User = get_user_model()
PASSWORD = "Correct-Horse-42!"
DEPARTMENTS = [
    ("LD1", "Souscription", "Underwriting"),
    ("LD2", "Sinistres", "Claims"),
    ("LD3", "Finance", "Finance"),
    ("LD4", "Opérations", "Operations"),
]


def _employee_data(*, number: str, first: str, last: str, email: str, department, position, manager) -> dict:
    """The one place that knows the shape of `create_employee`'s data.

    If plan 02 named a key differently, change it here and nowhere else; the names below are the
    columns of PRD 8.2.
    """
    return {
        "employee_number": number,
        "first_name": first,
        "last_name": last,
        "professional_email": email,
        "hire_date": date(2020, 1, 6),
        "contract_start_date": date(2020, 1, 6),
        "contract_type": "permanent",
        "department": department,
        "position": position,
        "manager": manager,
    }


def _account(employee: Employee, *roles: Role) -> User:
    user, _temporary = account_services.create_account(actor=None, employee_public_id=str(employee.public_id))
    for role in roles:
        account_services.assign_role(actor=None, user=user, role=role)
    user.set_password(PASSWORD)
    user.must_change_password = False
    user.temp_password_expires_at = None
    user.save(update_fields=["password", "must_change_password", "temp_password_expires_at"])
    return user


def _approve(request: Request) -> None:
    while True:
        request.refresh_from_db()
        step = (
            RequestStep.objects.filter(request=request, status=StepStatus.PENDING)
            .order_by("-round", "position")
            .first()
        )
        if step is None:
            return
        approver = request_services.resolve_approvers(step)[0]
        request_services.decide_step(
            actor=approver, step=step, decision=Decision.APPROVE, expected_version=request.version
        )


def _first_monday(year: int, month: int) -> date:
    first = date(year, month, 1)
    return first + timedelta(days=(7 - first.weekday()) % 7)


def _months_back(today: date, count: int) -> list[tuple[int, int]]:
    months, year, month = [], today.year, today.month
    for _ in range(count):
        month -= 1
        if month == 0:
            year, month = year - 1, 12
        months.append((year, month))
    return months


def _counts() -> dict[str, int]:
    return {
        "employees": Employee.objects.filter(employee_number__startswith="L").count(),
        "requests": Request.objects.filter(employee__employee_number__startswith="L").count(),
    }


def build(*, employees: int = 100, months: int = 12) -> dict[str, int]:
    if os.environ.get("ENVIRONMENT") == "production":
        raise RuntimeError("the load builder must never run in production")
    if User.objects.filter(email="load.hr@impactrisks.com").exists():
        return _counts()

    types = {code: RequestType.objects.get(code=code) for code in ("annual", "sick", "permission", "remote")}
    today = timezone.localdate()

    with transaction.atomic():
        position = organisation_services.create_position(
            actor=None, code="LP1", title_fr="Collaborateur", title_en="Staff member"
        )
        departments = [
            organisation_services.create_department(actor=None, code=code, name_fr=fr, name_en=en)
            for code, fr, en in DEPARTMENTS
        ]

        def person(number: str, first: str, last: str, slug: str, department, manager) -> Employee:
            return organisation_services.create_employee(
                actor=None,
                data=_employee_data(
                    number=number,
                    first=first,
                    last=last,
                    email=f"load.{slug}@impactrisks.com",
                    department=department,
                    position=position,
                    manager=manager,
                ),
            )

        ceo = person("L0001", "Leila", "Direction", "ceo", departments[2], None)
        _account(ceo, Role.EXEC)
        hr = person("L0002", "Hana", "Ressources", "hr", departments[3], ceo)
        hr_user = _account(hr, Role.HR)
        managers = []
        for index, department in enumerate(departments, start=1):
            manager = person(f"L001{index}", "Manager", f"Equipe{index}", f"m{index}", department, ceo)
            _account(manager)
            managers.append(manager)
        staff = []
        for index in range(1, employees + 1):
            slot = (index - 1) % len(departments)
            employee = person(
                f"L1{index:03d}",
                "Employe",
                f"Numero{index:03d}",
                f"e{index:03d}",
                departments[slot],
                managers[slot],
            )
            _account(employee)
            staff.append(employee)

        for employee in [*managers, *staff]:
            balance_services.post_opening(
                actor=hr_user,
                employee=employee,
                amount=Decimal("40"),
                effective_date=today - timedelta(days=400),
                reason="Load data",
            )

    for year, month in _months_back(today, months):
        monday = _first_monday(year, month)
        for index, employee in enumerate(staff):
            plans = [
                (types["annual"], RequestData(start_date=monday, end_date=monday + timedelta(days=1))),
                (
                    types["remote"],
                    RequestData(start_date=monday + timedelta(days=2), end_date=monday + timedelta(days=2)),
                ),
                (
                    types["permission"],
                    RequestData(
                        start_date=monday + timedelta(days=3),
                        end_date=monday + timedelta(days=3),
                        start_time=time(9, 0),
                        end_time=time(11, 0),
                    ),
                ),
            ]
            if index % 3 == 0:
                plans.append(
                    (
                        types["sick"],
                        RequestData(
                            start_date=monday + timedelta(days=4),
                            end_date=monday + timedelta(days=4),
                            comment="Load",
                        ),
                    )
                )
            for request_type, data in plans:
                try:
                    with transaction.atomic():
                        draft = request_services.create_draft(
                            actor=hr_user,
                            employee=employee,
                            request_type=request_type,
                            data=data,
                            override_reason="Load data",
                        )
                        _approve(request_services.submit(actor=hr_user, request=draft))
                except DomainError:
                    continue  # for example a public holiday on that day in this database
    return _counts()
