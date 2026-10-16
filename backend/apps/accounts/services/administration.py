"""What the System Administrator does to accounts (ACC-05, ACC-06, ACC-09, ACC-10)."""

from collections.abc import Iterable
from datetime import timedelta

from django.db import connection, transaction
from django.utils import timezone

from apps.accounts.emails import ensure_allowed_email
from apps.accounts.models import RoleAssignment, User
from apps.accounts.passwords import generate_temporary_password
from apps.accounts.ports import employee_directory
from apps.accounts.roles import ASSIGNABLE, Role, clear_role_cache, users_with_role
from apps.accounts.services.naming import display_name
from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError, NotFound
from apps.notifications import services as notifications
from apps.settings import services as settings_service

# One account cannot hold both (PRD section 3).
INCOMPATIBLE = frozenset({Role.HR, Role.SYSADMIN})

# Key of the PostgreSQL advisory lock that makes changes to roles and to account state take turns.
# The number only has to differ from that of any other advisory lock the application takes.
ADMINISTRATION_LOCK = 0x49524953_0001


def _one_at_a_time() -> None:
    """Waits for any other change to roles or to account state, then keeps the turn until the transaction ends.

    The rules below read before they write (HR never with System Administrator, always one active
    administrator): two changes at the same moment could each pass its check.
    """
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [ADMINISTRATION_LOCK])


def _assignable(role: Role | str) -> Role:
    role = Role(role)
    if role not in ASSIGNABLE:
        raise ValueError(f"{role.value} is a derived role and cannot be assigned")
    return role


def _not_self(actor: User | None, user: User) -> None:
    """An administrator never changes their own access: a second administrator has to."""
    if actor is not None and actor.pk == user.pk:
        raise DomainError("accounts.cannot_change_self")


def _held(user: User) -> set[Role]:
    return {Role(value) for value in RoleAssignment.objects.filter(user=user).values_list("role", flat=True)}


def _keep_an_administrator(user: User) -> None:
    """Refuses a change that would leave no active System Administrator."""
    if not user.is_active or Role.SYSADMIN not in _held(user):
        return
    if not users_with_role(Role.SYSADMIN).exclude(pk=user.pk).exists():
        raise Conflict("accounts.last_sysadmin")


def _issue_temporary_password(user: User) -> str:
    """Sets a temporary password on the (unsaved or loaded) user and returns it. The caller saves."""
    temporary = generate_temporary_password()
    user.set_password(temporary)
    user.must_change_password = True
    user.temp_password_expires_at = timezone.now() + timedelta(
        hours=settings_service.get("temp_password_hours")
    )
    return temporary


@transaction.atomic
def create_account(
    *,
    actor: User | None,
    email: str = "",
    full_name: str = "",
    employee_public_id: str | None = None,
    roles: Iterable[Role | str] = (),
) -> tuple[User, str]:
    """Creates an account for an employee record, or for a name and an email. Returns (user, temporary password).

    The temporary password is returned once and stored only as a hash; nobody can read it again (ACC-06).
    `actor=None` is the system creating the first administrator.
    """
    _one_at_a_time()
    wanted = {_assignable(role) for role in roles}
    if INCOMPATIBLE <= wanted:
        raise DomainError("accounts.roles_incompatible", field="roles")

    if employee_public_id:
        ref = employee_directory().candidate(str(employee_public_id))
        if ref is None:
            raise DomainError("accounts.employee_unknown", field="employee")
        address = ensure_allowed_email(ref.email, field="employee")
        name = ref.full_name
        if User.objects.filter(email=address).exists():
            raise Conflict("accounts.employee_has_account", field="employee")
    else:
        if not (email or "").strip():
            raise DomainError("accounts.subject_required", field="email")
        if not (full_name or "").strip():
            raise DomainError("accounts.subject_required", field="full_name")
        address = ensure_allowed_email(email)
        name = full_name.strip()
        if User.objects.filter(email=address).exists():
            raise Conflict("accounts.email_taken", field="email")

    user = User(email=address, full_name=name, created_by=actor)
    temporary = _issue_temporary_password(user)
    user.save()
    if employee_public_id:
        employee_directory().link(user_id=user.pk, public_id=str(employee_public_id))
    for role in sorted(wanted):
        RoleAssignment.objects.create(user=user, role=role.value, assigned_by=actor)
    audit.record(
        action="account.created",
        category=audit.SECURITY,
        actor=actor,
        obj=user,
        changes={
            "roles": sorted(role.value for role in wanted),
            "employee": str(employee_public_id) if employee_public_id else None,
        },
    )
    return user, temporary


@transaction.atomic
def reset_password(*, actor: User, user: User) -> str:
    """Issues a new temporary password, unlocks the account and tells the user. Ends the user's sessions."""
    _not_self(actor, user)
    temporary = _issue_temporary_password(user)
    user.password_reset_by = actor
    user.password_reset_at = timezone.now()
    user.failed_attempts = 0
    user.locked_until = None
    user.save(
        update_fields=[
            "password",
            "must_change_password",
            "temp_password_expires_at",
            "password_reset_by",
            "password_reset_at",
            "failed_attempts",
            "locked_until",
        ]
    )
    audit.record(action="auth.password_reset", category=audit.SECURITY, actor=actor, obj=user)
    notifications.notify(
        users=[user],
        event="account.password_reset",
        params={"by": display_name(actor)},
        target_type="account",
        target_public_id=str(user.public_id),
    )
    return temporary


@transaction.atomic
def assign_role(*, actor: User | None, user: User, role: Role | str) -> RoleAssignment:
    _one_at_a_time()
    role = _assignable(role)
    _not_self(actor, user)
    if role in INCOMPATIBLE and (INCOMPATIBLE - {role}) & _held(user):
        raise DomainError("accounts.roles_incompatible", field="role")
    assignment, created = RoleAssignment.objects.get_or_create(
        user=user, role=role.value, defaults={"assigned_by": actor}
    )
    if created:
        audit.record(
            action="role.assigned",
            category=audit.SECURITY,
            actor=actor,
            obj=user,
            changes={"role": role.value},
        )
    clear_role_cache(user)
    return assignment


@transaction.atomic
def remove_role(*, actor: User, user: User, role: Role | str) -> None:
    _one_at_a_time()
    role = _assignable(role)
    _not_self(actor, user)
    assignment = RoleAssignment.objects.filter(user=user, role=role.value).first()
    if assignment is None:
        raise NotFound()
    if role == Role.SYSADMIN:
        _keep_an_administrator(user)
    assignment.delete()
    audit.record(
        action="role.removed", category=audit.SECURITY, actor=actor, obj=user, changes={"role": role.value}
    )
    clear_role_cache(user)


@transaction.atomic
def disable_account(*, actor: User | None, user: User) -> None:
    """Stops the account from signing in. Its open sessions end at their next request (ACC-04)."""
    _one_at_a_time()
    _not_self(actor, user)
    if not user.is_active:
        return
    _keep_an_administrator(user)
    user.is_active = False
    user.save(update_fields=["is_active"])
    audit.record(action="account.disabled", category=audit.SECURITY, actor=actor, obj=user)


@transaction.atomic
def enable_account(*, actor: User, user: User) -> None:
    """Lets the account sign in again. Never the account of someone who has left the company (master D44)."""
    _one_at_a_time()
    if user.is_active:
        return
    if employee_directory().has_left(user.pk):
        raise Conflict("accounts.employee_left")
    user.is_active = True
    user.save(update_fields=["is_active"])
    audit.record(action="account.enabled", category=audit.SECURITY, actor=actor, obj=user)


@transaction.atomic
def unlock_account(*, actor: User, user: User) -> None:
    user.failed_attempts = 0
    user.locked_until = None
    user.save(update_fields=["failed_attempts", "locked_until"])
    audit.record(action="account.unlocked", category=audit.SECURITY, actor=actor, obj=user)
