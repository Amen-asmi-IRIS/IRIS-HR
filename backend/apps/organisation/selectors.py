from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db.models import Count, Q, QuerySet, Value
from django.db.models.functions import Concat

from apps.accounts.roles import Role, has_role
from apps.core.errors import NotAllowed, NotFound

from . import reach
from .models import (
    Department,
    Employee,
    EmployeeDocument,
    EmployeeStatus,
    Position,
    ProfileChange,
    ProfileChangeStatus,
)


def full_name(employee: Employee) -> str:
    return f"{employee.first_name} {employee.last_name}".strip()


def department_name(employee: Employee, lang: str) -> str:
    return employee.department.name_en if lang == "en" else employee.department.name_fr


def _head_count() -> Count:
    return Count("employees", filter=~Q(employees__status=EmployeeStatus.ARCHIVED))


def departments() -> QuerySet[Department]:
    return Department.objects.annotate(employee_count=_head_count()).order_by("code")


def positions() -> QuerySet[Position]:
    return Position.objects.annotate(employee_count=_head_count()).order_by("code")


def get_department(pk: int) -> Department:
    try:
        return Department.objects.get(pk=pk)
    except Department.DoesNotExist:
        raise NotFound() from None


def get_position(pk: int) -> Position:
    try:
        return Position.objects.get(pk=pk)
    except Position.DoesNotExist:
        raise NotFound() from None


# --- Employees -----------------------------------------------------------------------------

_ORDERINGS = {
    "name": ("last_name", "first_name"),
    "-name": ("-last_name", "-first_name"),
    "employee_number": ("employee_number",),
    "-employee_number": ("-employee_number",),
    "hire_date": ("hire_date", "last_name"),
    "-hire_date": ("-hire_date", "last_name"),
}


def _with_relations() -> QuerySet[Employee]:
    return Employee.objects.select_related("department", "position", "manager", "user")


def get_employee(public_id) -> Employee:
    """Any employee by public identifier, without a reach check. For services, never for views."""
    try:
        return _with_relations().get(public_id=public_id)
    except (Employee.DoesNotExist, ValidationError, ValueError):
        raise NotFound() from None


def get_employee_for(user, public_id) -> Employee:
    employee = get_employee(public_id)
    if not reach.can_see_employee(user, employee):
        raise NotFound()
    return employee


def employees_for(user, *, include_archived: bool = False) -> QuerySet[Employee]:
    """Everyone the user may see: all for HR and executives, otherwise their own record and their team."""
    queryset = _with_relations()
    if has_role(user, Role.HR, Role.EXEC):
        return queryset if include_archived else queryset.exclude(status=EmployeeStatus.ARCHIVED)
    own = reach.employee_of(user)
    if own is None:
        return queryset.none()
    return queryset.filter(id__in={own.id, *reach.team_ids(user)})


def employee_list(
    user,
    *,
    scope: str | None = None,
    search: str = "",
    department: int | None = None,
    manager=None,
    status: str | None = None,
    ordering: str | None = None,
) -> QuerySet[Employee]:
    """The directory (`all`, HR and executives) or the people of a manager (`team`)."""
    privileged = has_role(user, Role.HR, Role.EXEC)
    scope = scope or ("all" if privileged else "team")
    if scope == "all":
        if not privileged:
            raise NotAllowed()
        queryset = _with_relations()
        if not status:
            queryset = queryset.exclude(status=EmployeeStatus.ARCHIVED)
        elif status != "all":
            queryset = queryset.filter(status=status)
    else:
        if not has_role(user, Role.MANAGER):
            raise NotAllowed()
        queryset = _with_relations().filter(id__in=reach.team_ids(user))
        if privileged and status and status != "all":
            queryset = queryset.filter(status=status)
    if department:
        queryset = queryset.filter(department_id=department)
    if manager:
        queryset = queryset.filter(manager__public_id=manager)
    search = (search or "").strip()
    if search:
        matches = Q(_full_name__icontains=search) | Q(professional_email__icontains=search)
        if privileged:
            matches |= Q(employee_number__icontains=search)
        queryset = queryset.annotate(_full_name=Concat("first_name", Value(" "), "last_name")).filter(matches)
    # What a manager does not read about the team (number, status, hire date) cannot be asked for either:
    # a search, a filter or an ordering on it would give it away one question at a time.
    if not privileged and ordering not in ("name", "-name"):
        ordering = "name"
    return queryset.order_by(*_ORDERINGS[ordering or "name"])


def directory() -> QuerySet[Employee]:
    """Active employees, for pickers (master D24). Only name and department are ever serialised."""
    return (
        Employee.objects.filter(status=EmployeeStatus.ACTIVE)
        .select_related("department")
        .order_by("last_name", "first_name")
    )


def direct_reports(employee: Employee) -> QuerySet[Employee]:
    return employee.reports.exclude(status=EmployeeStatus.ARCHIVED).order_by("last_name", "first_name")


def _usable_account(employee: Employee | None):
    """The account of an employee who can act: not archived, with an account that is switched on."""
    if employee is None or employee.status == EmployeeStatus.ARCHIVED or employee.user_id is None:
        return None
    return employee.user if employee.user.is_active else None


def manager_user(employee: Employee):
    """The active account of the employee's manager, or None when that manager cannot act."""
    return _usable_account(employee.manager)


# --- Documents -----------------------------------------------------------------------------


def documents_for(user, employee: Employee) -> QuerySet[EmployeeDocument]:
    """Every document for HR and executives; the shared ones for the employee; nothing for anyone else."""
    queryset = EmployeeDocument.objects.filter(employee=employee).select_related("attachment", "added_by")
    if has_role(user, Role.HR, Role.EXEC):
        return queryset
    own = reach.employee_of(user)
    if own is None or own.id != employee.id:
        raise NotFound()
    return queryset.filter(visible_to_employee=True)


def get_document(employee: Employee, document_id: int) -> EmployeeDocument:
    try:
        return EmployeeDocument.objects.select_related("attachment", "added_by", "employee").get(
            pk=document_id, employee=employee
        )
    except EmployeeDocument.DoesNotExist:
        raise NotFound() from None


# --- Profile-change proposals --------------------------------------------------------------


def profile_changes_for(
    user, *, scope: str | None = None, status: str | None = None, employee_public_id=None
) -> QuerySet[ProfileChange]:
    """`mine`: the user's own proposals. `all` (HR): everyone's except the HR holder's own."""
    queryset = ProfileChange.objects.select_related("employee", "decided_by")
    is_hr = has_role(user, Role.HR)
    scope = scope or ("all" if is_hr else "mine")
    own = reach.employee_of(user)
    if scope == "all":
        if not is_hr:
            raise NotAllowed()
        if own is not None:
            queryset = queryset.exclude(employee=own)
        if employee_public_id:
            queryset = queryset.filter(employee__public_id=employee_public_id)
    else:
        if own is None:
            return queryset.none()
        queryset = queryset.filter(employee=own)
    if status == "decided":
        queryset = queryset.exclude(status=ProfileChangeStatus.PENDING)
    elif status:
        queryset = queryset.filter(status=status)
    # The queue is worked oldest first; everything else reads newest first.
    ordering = ("created_at", "id") if status == ProfileChangeStatus.PENDING else ("-created_at", "-id")
    return queryset.order_by(*ordering)


def get_profile_change_for(user, public_id, *, own_only: bool = False) -> ProfileChange:
    try:
        change = ProfileChange.objects.select_related("employee", "decided_by").get(public_id=public_id)
    except (ProfileChange.DoesNotExist, ValidationError, ValueError):
        raise NotFound() from None
    own = reach.employee_of(user)
    if own is not None and own.id == change.employee_id:
        return change
    if not own_only and has_role(user, Role.HR):
        return change
    raise NotFound()


def all_employees() -> QuerySet[Employee]:
    """Every employee record, whatever its status. For system jobs, which have no user (plan 04)."""
    return Employee.objects.all()
