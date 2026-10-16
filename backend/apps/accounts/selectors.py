"""Reads of the accounts app."""

from datetime import datetime

from django.core.exceptions import ValidationError
from django.db.models import F, Q, QuerySet
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.ports import employee_directory
from apps.accounts.roles import ASSIGNABLE, Role
from apps.accounts.services.naming import display_name
from apps.core.errors import NotFound

STATES = ("active", "awaiting_first_sign_in", "locked", "disabled")
ACCOUNT_STATE_CHOICES = [(state, state) for state in STATES]


def account_state(user: User, *, now: datetime | None = None) -> str:
    """One word for the Accounts page (UI 9.2). Disabled wins over locked, locked over awaiting."""
    now = now or timezone.now()
    if not user.is_active:
        return "disabled"
    if user.locked_until is not None and user.locked_until > now:
        return "locked"
    if user.must_change_password and user.last_login_at is None:
        return "awaiting_first_sign_in"
    return "active"


def _state_filter(state: str, now: datetime) -> Q:
    locked = Q(locked_until__gt=now)
    awaiting = Q(must_change_password=True, last_login_at__isnull=True)
    if state == "disabled":
        return Q(is_active=False)
    if state == "locked":
        return Q(is_active=True) & locked
    if state == "awaiting_first_sign_in":
        return Q(is_active=True) & ~locked & awaiting
    if state == "active":
        return Q(is_active=True) & ~locked & ~awaiting
    raise ValueError(f"Unknown account state: {state}")


def accounts(
    *, search: str = "", state: str = "", role: str = "", now: datetime | None = None
) -> QuerySet[User]:
    """Accounts ordered by email, optionally narrowed by a search term, a state and an assignable role.

    Each carries `sort_name`: the linked employee's current name, else the account's own name;
    the search matches it as well as the stored name and the email.
    """
    employee_name = employee_directory().name_on_account()
    stored = F("full_name")
    found = User.objects.annotate(
        sort_name=stored if employee_name is None else Coalesce(employee_name, stored)
    )
    term = (search or "").strip()
    if term:
        # `sort_name` is the employee's current name; `full_name` the one copied onto the account.
        found = found.filter(
            Q(email__icontains=term) | Q(full_name__icontains=term) | Q(sort_name__icontains=term)
        )
    if state:
        found = found.filter(_state_filter(state, now or timezone.now()))
    if role:
        wanted = Role(role)
        if wanted not in ASSIGNABLE:
            raise ValueError(f"{wanted.value} is a derived role and cannot be filtered on")
        found = found.filter(role_assignments__role=wanted.value)
    return found.distinct()


def get_account(public_id) -> User:
    try:
        return User.objects.get(public_id=public_id)
    except (User.DoesNotExist, ValueError, ValidationError):
        raise NotFound() from None


def has_employee(user: User) -> bool:
    return employee_directory().ref_for_user(user.pk) is not None


def can_enable(user: User) -> bool:
    """A disabled account can be switched on again, unless its employee has left the company (master D44)."""
    return not user.is_active and not employee_directory().has_left(user.pk)


def _brief(user: User) -> dict[str, str]:
    return {"public_id": str(user.public_id), "name": display_name(user), "email": user.email}


def accounts_needing_attention(*, now: datetime | None = None) -> dict[str, list[dict[str, str]]]:
    """Who cannot get in (UI 9.1): locked accounts, unused or expired temporary passwords, employees without account."""
    now = now or timezone.now()
    active = User.objects.filter(is_active=True)
    never_signed_in = active.filter(must_change_password=True, last_login_at__isnull=True)
    expired = active.filter(must_change_password=True, temp_password_expires_at__lte=now)
    return {
        "locked": [_brief(user) for user in active.filter(locked_until__gt=now)],
        "awaiting_first_sign_in": [
            _brief(user) for user in never_signed_in.exclude(temp_password_expires_at__lte=now)
        ],
        "temp_expired": [_brief(user) for user in expired],
        "employees_without_account": [
            {"public_id": ref.public_id, "name": ref.full_name, "email": ref.email}
            for ref in employee_directory().candidates()
        ],
    }
