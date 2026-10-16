from __future__ import annotations

from datetime import date

from django.utils import timezone

from apps.accounts.roles import Role, has_role

from .models import Delegation, Employee, EmployeeStatus


def employee_of(user) -> Employee | None:
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    try:
        return user.employee
    except Employee.DoesNotExist:
        return None


def acting_for(employee_id: int, *, on: date | None = None) -> set[int]:
    """The managers this employee acts as on a day: themselves, plus whoever delegated to them.

    Delegation is not passed on: only delegations given directly to this employee count.
    """
    on = on or timezone.localdate()
    delegators = Delegation.objects.filter(Delegation.active_on(on), delegate_id=employee_id).values_list(
        "manager_id", flat=True
    )
    return {employee_id, *delegators}


def team_ids(user, *, on: date | None = None) -> set[int]:
    employee = employee_of(user)
    if employee is None or employee.status == EmployeeStatus.ARCHIVED:
        return set()
    ids = set(
        Employee.objects.filter(manager_id__in=acting_for(employee.id, on=on))
        .exclude(status=EmployeeStatus.ARCHIVED)
        .values_list("id", flat=True)
    )
    ids.discard(employee.id)
    return ids


def department_peer_ids(user) -> set[int]:
    employee = employee_of(user)
    if employee is None:
        return set()
    return set(
        Employee.objects.filter(department_id=employee.department_id)
        .exclude(status=EmployeeStatus.ARCHIVED)
        .values_list("id", flat=True)
    )


def can_see_employee(user, employee: Employee) -> bool:
    if has_role(user, Role.HR, Role.EXEC):
        return True
    own = employee_of(user)
    if own is None:
        return False
    return own.id == employee.id or employee.id in team_ids(user)


def lock_employee(employee_id: int) -> Employee:
    """Serialises checks that must not run twice at once for one person. Call inside a transaction."""
    return Employee.objects.select_for_update().get(pk=employee_id)


def derived_roles(user) -> set[Role]:
    """EMPLOYEE for a linked record that is not archived; MANAGER when somebody reports to the user today."""
    employee = employee_of(user)
    if employee is None or employee.status == EmployeeStatus.ARCHIVED:
        return set()
    roles = {Role.EMPLOYEE}
    if team_ids(user):
        roles.add(Role.MANAGER)
    return roles
