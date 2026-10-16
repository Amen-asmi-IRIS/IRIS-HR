"""The organisation side of the accounts port: accounts never read employee tables themselves."""

from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db.models import Case, Expression, F, QuerySet, Value, When
from django.db.models.functions import Concat

from apps.accounts.ports import EmployeeRef
from apps.core.errors import Conflict

from .models import Employee, EmployeeStatus
from .selectors import full_name


def _ref(employee: Employee) -> EmployeeRef:
    return EmployeeRef(
        public_id=str(employee.public_id), full_name=full_name(employee), email=employee.professional_email
    )


class OrganisationDirectory:
    def _without_account(self) -> QuerySet[Employee]:
        return Employee.objects.filter(user__isnull=True).exclude(status=EmployeeStatus.ARCHIVED)

    def candidate(self, public_id: str) -> EmployeeRef | None:
        try:
            employee = Employee.objects.exclude(status=EmployeeStatus.ARCHIVED).get(public_id=public_id)
        except (Employee.DoesNotExist, ValidationError, ValueError):
            return None
        if employee.user_id is not None:
            # Saying so is more useful to the administrator than "unknown employee".
            raise Conflict("accounts.employee_has_account", field="employee")
        return _ref(employee)

    def candidates(self) -> list[EmployeeRef]:
        return [_ref(employee) for employee in self._without_account().order_by("last_name", "first_name")]

    def link(self, *, user_id: int, public_id: str) -> None:
        try:
            updated = Employee.objects.filter(public_id=public_id, user__isnull=True).update(user_id=user_id)
        except (ValidationError, ValueError):
            updated = 0
        if not updated:
            raise Conflict("accounts.employee_has_account", field="employee")

    def ref_for_user(self, user_id: int) -> EmployeeRef | None:
        employee = Employee.objects.filter(user_id=user_id).first()
        return _ref(employee) if employee is not None else None

    def has_left(self, user_id: int) -> bool:
        return Employee.objects.filter(user_id=user_id, status=EmployeeStatus.ARCHIVED).exists()

    def name_on_account(self) -> Expression:
        # The same text as `full_name`; null when the account has no employee record
        # (PostgreSQL's CONCAT would give " ").
        name = Concat(F("employee__first_name"), Value(" "), F("employee__last_name"))
        return Case(When(employee__isnull=False, then=name), default=None)
