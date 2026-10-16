"""The five roles (PRD section 3). HR, EXEC and SYSADMIN are assigned; EMPLOYEE and MANAGER are derived."""

from collections.abc import Callable, Iterable
from enum import StrEnum

from django.contrib.auth import get_user_model
from django.db.models import QuerySet


class Role(StrEnum):
    EMPLOYEE = "employee"
    MANAGER = "manager"
    HR = "hr"
    EXEC = "exec"
    SYSADMIN = "sysadmin"


ASSIGNABLE = frozenset({Role.HR, Role.EXEC, Role.SYSADMIN})

# A workspace is offered to the holders of one role (UI section 3.1). The order is the display order.
WORKSPACES = (
    ("me", Role.EMPLOYEE),
    ("team", Role.MANAGER),
    ("hr", Role.HR),
    ("overview", Role.EXEC),
    ("admin", Role.SYSADMIN),
)

# Choice lists for serializers and for the OpenAPI enum names.
ROLE_CHOICES = [(role.value, role.value) for role in Role]
ASSIGNABLE_CHOICES = [(role.value, role.value) for role in (Role.HR, Role.EXEC, Role.SYSADMIN)]
WORKSPACE_CHOICES = [(workspace, workspace) for workspace, _ in WORKSPACES]

_CACHE_ATTRIBUTE = "_iris_roles"
_providers: list[Callable[[object], Iterable[Role | str]]] = []


def register_derived_role_provider(fn: Callable[[object], Iterable[Role | str]]) -> None:
    """`fn(user)` returns the roles it derives for that user. The organisation app registers one in plan 02."""
    if fn not in _providers:
        _providers.append(fn)


def unregister_derived_role_provider(fn: Callable[[object], Iterable[Role | str]]) -> None:
    if fn in _providers:
        _providers.remove(fn)


def roles_of(user) -> frozenset[Role]:
    """Assigned roles plus derived ones. Computed once per user object, that is once per request."""
    if user is None or not getattr(user, "is_authenticated", False):
        return frozenset()
    cached = getattr(user, _CACHE_ATTRIBUTE, None)
    if cached is not None:
        return cached
    held = {Role(value) for value in user.role_assignments.values_list("role", flat=True)}
    for provider in _providers:
        held.update(Role(value) for value in provider(user))
    result = frozenset(held)
    setattr(user, _CACHE_ATTRIBUTE, result)
    return result


def clear_role_cache(user) -> None:
    """Call after changing a user's assignments when the same user object is used again."""
    if getattr(user, _CACHE_ATTRIBUTE, None) is not None:
        delattr(user, _CACHE_ATTRIBUTE)


def has_role(user, *wanted: Role) -> bool:
    return bool(roles_of(user) & set(wanted))


def users_with_role(role: Role | str) -> QuerySet:
    """Active accounts holding an assignable role, ordered by email."""
    role = Role(role)
    if role not in ASSIGNABLE:
        raise ValueError(f"{role.value} is a derived role: it is not assigned to accounts")
    return get_user_model().objects.filter(is_active=True, role_assignments__role=role.value).distinct()


def workspaces_of(user) -> list[str]:
    held = roles_of(user)
    return [workspace for workspace, role in WORKSPACES if role in held]
