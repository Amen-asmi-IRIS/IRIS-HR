from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.db import OperationalError, connection, connections, transaction

from apps.accounts import selectors, services
from apps.accounts.models import RoleAssignment, User
from apps.accounts.roles import Role, roles_of
from apps.accounts.services.administration import ADMINISTRATION_LOCK
from apps.accounts.tests.world import PASSWORD, make_user
from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotFound
from apps.notifications.models import Notification
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db

START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)
ME = "/api/v1/auth/me"


def refused(call, **arguments) -> DomainError:
    with pytest.raises(DomainError) as error:
        call(**arguments)
    return error.value


# --- creating an account (ACC-05) ---


def test_an_account_is_created_by_name_and_email_with_a_temporary_password(world):
    with time_machine.travel(START, tick=False):
        user, temporary = services.create_account(
            actor=world.sysadmin_user,
            email=" Leila.Admin@ImpactRisks.com ",
            full_name=" Leila Admin ",
            roles=[Role.EXEC],
        )

    assert user.email == "leila.admin@impactrisks.com"
    assert user.full_name == "Leila Admin"
    assert user.created_by == world.sysadmin_user
    assert user.must_change_password is True
    assert user.temp_password_expires_at == START + timedelta(hours=24)
    assert user.check_password(temporary)
    assert roles_of(user) == {Role.EXEC}
    assert RoleAssignment.objects.get(user=user).assigned_by == world.sysadmin_user
    assert selectors.account_state(user, now=START) == "awaiting_first_sign_in"
    event = AuditEvent.objects.get(action="account.created")
    assert event.category == "security"
    assert event.actor == world.sysadmin_user
    assert event.object_id == str(user.public_id)
    assert event.changes == {"roles": ["exec"], "employee": None}
    assert temporary not in str(list(AuditEvent.objects.values()))


def test_the_temporary_password_lifetime_follows_the_setting(world):
    settings_service.set_value(actor=world.sysadmin_user, key="temp_password_hours", value=2)

    with time_machine.travel(START, tick=False):
        user, _ = services.create_account(
            actor=world.sysadmin_user, email="short.lived@impactrisks.com", full_name="Short Lived"
        )

    assert user.temp_password_expires_at == START + timedelta(hours=2)


def test_an_account_for_an_employee_takes_name_and_email_from_the_record(world, directory):
    directory.add("emp-1", "Yasmine Trabelsi", "Yasmine.Trabelsi@impactrisks.com")

    user, _ = services.create_account(actor=world.sysadmin_user, employee_public_id="emp-1", roles=[Role.HR])

    assert user.email == "yasmine.trabelsi@impactrisks.com"
    assert user.full_name == "Yasmine Trabelsi"
    assert directory.ref_for_user(user.pk).public_id == "emp-1"
    assert directory.candidate("emp-1") is None
    assert roles_of(user) == {Role.HR}
    assert AuditEvent.objects.get(action="account.created").changes == {"roles": ["hr"], "employee": "emp-1"}


def test_an_employee_who_cannot_receive_an_account_is_refused(world, directory):
    error = refused(services.create_account, actor=world.sysadmin_user, employee_public_id="nobody")

    assert error.code == "accounts.employee_unknown"
    assert error.field == "employee"


def test_an_employee_whose_address_already_has_an_account_is_refused(world, directory):
    directory.add("emp-2", "Amal Employee", "employee.a1@impactrisks.com")

    with pytest.raises(Conflict) as error:
        services.create_account(actor=world.sysadmin_user, employee_public_id="emp-2")

    assert error.value.code == "accounts.employee_has_account"
    assert error.value.field == "employee"
    assert directory.candidate("emp-2") is not None


@pytest.mark.parametrize(
    ("email", "full_name", "field"),
    [
        ("", "Leila Admin", "email"),
        ("  ", "Leila Admin", "email"),
        ("leila@impactrisks.com", " ", "full_name"),
    ],
)
def test_without_an_employee_a_name_and_an_email_are_needed(world, email, full_name, field):
    error = refused(services.create_account, actor=world.sysadmin_user, email=email, full_name=full_name)

    assert error.code == "accounts.subject_required"
    assert error.field == field


def test_an_address_outside_the_company_is_refused(world):
    error = refused(
        services.create_account, actor=world.sysadmin_user, email="leila@gmail.com", full_name="Leila"
    )

    assert error.code == "auth.domain_not_allowed"
    assert error.field == "email"


def test_an_address_already_used_is_refused(world):
    with pytest.raises(Conflict) as error:
        services.create_account(
            actor=world.sysadmin_user, email="Employee.A1@impactrisks.com", full_name="Twin"
        )

    assert error.value.code == "accounts.email_taken"
    assert error.value.field == "email"
    assert error.value.status == 409


def test_hr_and_administrator_cannot_be_given_together(world):
    count = User.objects.count()

    error = refused(
        services.create_account,
        actor=world.sysadmin_user,
        email="both@impactrisks.com",
        full_name="Both Roles",
        roles=[Role.HR, Role.SYSADMIN],
    )

    assert error.code == "accounts.roles_incompatible"
    assert error.field == "roles"
    assert User.objects.count() == count


def test_a_derived_role_cannot_be_given(world):
    with pytest.raises(ValueError, match="derived"):
        services.create_account(
            actor=world.sysadmin_user, email="m@impactrisks.com", full_name="M", roles=[Role.MANAGER]
        )


def test_the_first_administrator_is_created_by_the_system():
    user, temporary = services.create_account(
        actor=None, email="first.admin@impactrisks.com", full_name="First Admin", roles=[Role.SYSADMIN]
    )

    assert user.created_by is None
    assert user.check_password(temporary)
    assert AuditEvent.objects.get(action="account.created").actor is None


# --- resetting a password (ACC-06) ---


def test_a_reset_issues_a_new_temporary_password_and_tells_the_user(world):
    owner = world.owner_user
    owner.failed_attempts = 3
    owner.locked_until = START + timedelta(minutes=10)
    owner.last_login_at = START - timedelta(days=1)
    owner.save()

    with time_machine.travel(START, tick=False):
        temporary = services.reset_password(actor=world.sysadmin_user, user=owner)

    owner.refresh_from_db()
    assert owner.check_password(temporary)
    assert not owner.check_password(PASSWORD)
    assert owner.must_change_password is True
    assert owner.temp_password_expires_at == START + timedelta(hours=24)
    assert owner.password_reset_by == world.sysadmin_user
    assert owner.password_reset_at == START
    assert (owner.failed_attempts, owner.locked_until) == (0, None)
    event = AuditEvent.objects.get(action="auth.password_reset")
    assert (event.actor, event.object_id, event.category) == (
        world.sysadmin_user,
        str(owner.public_id),
        "security",
    )
    # The cast already holds one notification of this event for the owner (world.owner_notification).
    notification = Notification.objects.exclude(pk=world.owner_notification.pk).get(
        user=owner, event_code="account.password_reset"
    )
    assert notification.parameters == {"by": "Sonia Admin"}
    assert (notification.target_type, notification.target_public_id) == ("account", str(owner.public_id))
    assert temporary not in str(list(AuditEvent.objects.values())) + str(notification.parameters)


def test_the_user_signs_in_with_the_temporary_password_and_must_change_it(world):
    temporary = services.reset_password(actor=world.sysadmin_user, user=world.owner_user)

    user = services.authenticate(email=world.owner_user.email, password=temporary, ip="")

    assert user.must_change_password is True


def test_an_administrator_cannot_reset_their_own_password_here(world):
    error = refused(services.reset_password, actor=world.sysadmin_user, user=world.sysadmin_user)

    assert error.code == "accounts.cannot_change_self"
    assert world.sysadmin_user.check_password(PASSWORD)


def test_a_reset_ends_the_users_sessions(world, client_for):
    client = client_for(world.owner_user)
    assert client.get(ME).status_code == 200

    services.reset_password(actor=world.sysadmin_user, user=world.owner_user)

    assert client.get(ME).status_code == 401


# --- roles (ACC-09, Review Focus 4) ---


def test_assigning_and_removing_a_role_are_audited(world):
    owner = world.owner_user

    assignment = services.assign_role(actor=world.sysadmin_user, user=owner, role=Role.EXEC)
    assert assignment.assigned_by == world.sysadmin_user
    assert roles_of(owner) == {Role.EXEC, Role.EMPLOYEE}

    services.remove_role(actor=world.sysadmin_user, user=owner, role=Role.EXEC)
    assert roles_of(owner) == {Role.EMPLOYEE}

    removed, assigned = AuditEvent.objects.filter(object_id=str(owner.public_id))
    assert (assigned.action, assigned.changes, assigned.category) == (
        "role.assigned",
        {"role": "exec"},
        "security",
    )
    assert (removed.action, removed.changes, removed.actor) == (
        "role.removed",
        {"role": "exec"},
        world.sysadmin_user,
    )


def test_assigning_a_role_twice_changes_nothing(world):
    services.assign_role(actor=world.sysadmin_user, user=world.owner_user, role=Role.EXEC)
    services.assign_role(actor=world.sysadmin_user, user=world.owner_user, role="exec")

    assert RoleAssignment.objects.filter(user=world.owner_user).count() == 1
    assert AuditEvent.objects.filter(action="role.assigned").count() == 1


def test_hr_cannot_be_added_to_an_administrator_nor_the_reverse(world):
    other_admin = make_user("second.admin@impactrisks.com", roles=["sysadmin"])

    on_admin = refused(services.assign_role, actor=world.sysadmin_user, user=other_admin, role=Role.HR)
    on_hr = refused(services.assign_role, actor=world.sysadmin_user, user=world.hr_user, role=Role.SYSADMIN)

    assert on_admin.code == on_hr.code == "accounts.roles_incompatible"
    assert on_admin.field == "role"
    assert set(other_admin.role_assignments.values_list("role", flat=True)) == {"sysadmin"}
    assert set(world.hr_user.role_assignments.values_list("role", flat=True)) == {"hr"}


def test_executive_management_combines_with_either(world):
    other_admin = make_user("second.admin@impactrisks.com", roles=["sysadmin"])

    services.assign_role(actor=world.sysadmin_user, user=world.hr_user, role=Role.EXEC)
    services.assign_role(actor=world.sysadmin_user, user=other_admin, role=Role.EXEC)

    assert roles_of(world.hr_user) == {Role.HR, Role.EXEC, Role.EMPLOYEE}
    assert roles_of(other_admin) == {Role.SYSADMIN, Role.EXEC}


def test_an_administrator_cannot_change_their_own_roles(world):
    admin = world.sysadmin_user

    giving = refused(services.assign_role, actor=admin, user=admin, role=Role.EXEC)
    dropping = refused(services.remove_role, actor=admin, user=admin, role=Role.SYSADMIN)

    assert giving.code == dropping.code == "accounts.cannot_change_self"
    assert set(admin.role_assignments.values_list("role", flat=True)) == {"sysadmin"}


def test_the_last_active_administrator_keeps_the_role(world):
    with pytest.raises(Conflict) as error:
        services.remove_role(actor=world.exec_user, user=world.sysadmin_user, role=Role.SYSADMIN)

    assert error.value.code == "accounts.last_sysadmin"
    assert RoleAssignment.objects.filter(user=world.sysadmin_user, role="sysadmin").exists()


def test_a_disabled_administrator_does_not_count_as_another_one(world):
    make_user("gone.admin@impactrisks.com", roles=["sysadmin"], is_active=False)

    with pytest.raises(Conflict):
        services.remove_role(actor=world.exec_user, user=world.sysadmin_user, role=Role.SYSADMIN)


def test_with_a_second_active_administrator_the_role_can_be_removed(world):
    second = make_user("second.admin@impactrisks.com", roles=["sysadmin"])

    services.remove_role(actor=second, user=world.sysadmin_user, role=Role.SYSADMIN)

    assert not RoleAssignment.objects.filter(user=world.sysadmin_user).exists()


def test_removing_a_role_that_is_not_held_is_not_found(world):
    with pytest.raises(NotFound):
        services.remove_role(actor=world.sysadmin_user, user=world.owner_user, role=Role.HR)


# --- disabling, enabling, unlocking ---


def test_disabling_an_account_is_audited_and_ends_its_sessions(world, client_for):
    client = client_for(world.owner_user)
    assert client.get(ME).status_code == 200

    services.disable_account(actor=world.sysadmin_user, user=world.owner_user)

    world.owner_user.refresh_from_db()
    assert world.owner_user.is_active is False
    assert client.get(ME).status_code == 401
    event = AuditEvent.objects.get(action="account.disabled")
    assert (event.actor, event.object_id) == (world.sysadmin_user, str(world.owner_user.public_id))


def test_disabling_twice_records_once(world):
    services.disable_account(actor=world.sysadmin_user, user=world.owner_user)
    services.disable_account(actor=world.sysadmin_user, user=world.owner_user)

    assert AuditEvent.objects.filter(action="account.disabled").count() == 1


def test_the_last_active_administrator_cannot_be_disabled(world):
    with pytest.raises(Conflict) as error:
        services.disable_account(actor=world.exec_user, user=world.sysadmin_user)

    assert error.value.code == "accounts.last_sysadmin"
    world.sysadmin_user.refresh_from_db()
    assert world.sysadmin_user.is_active is True


def test_an_administrator_cannot_disable_themselves(world):
    make_user("second.admin@impactrisks.com", roles=["sysadmin"])

    error = refused(services.disable_account, actor=world.sysadmin_user, user=world.sysadmin_user)

    assert error.code == "accounts.cannot_change_self"


def test_the_system_can_disable_an_account(world):
    services.disable_account(actor=None, user=world.owner_user)

    assert AuditEvent.objects.get(action="account.disabled").actor is None


def test_enabling_an_account_lets_the_user_sign_in_again(world):
    services.disable_account(actor=world.sysadmin_user, user=world.owner_user)

    services.enable_account(actor=world.sysadmin_user, user=world.owner_user)

    assert services.authenticate(email=world.owner_user.email, password=PASSWORD, ip="") == world.owner_user
    assert AuditEvent.objects.filter(action="account.enabled", actor=world.sysadmin_user).count() == 1


def test_the_account_of_someone_who_has_left_is_never_enabled_again(world, directory):
    """Master D44. Only the directory knows who has left; the refusal says that and nothing more."""
    services.disable_account(actor=world.sysadmin_user, user=world.owner_user)
    directory.left.add(world.owner_user.pk)

    error = refused(services.enable_account, actor=world.sysadmin_user, user=world.owner_user)

    assert (error.code, error.status) == ("accounts.employee_left", 409)
    world.owner_user.refresh_from_db()
    assert world.owner_user.is_active is False
    assert not AuditEvent.objects.filter(action="account.enabled").exists()
    with pytest.raises(DomainError) as still:
        services.authenticate(email=world.owner_user.email, password=PASSWORD, ip="")
    assert still.value.code == "auth.disabled"


def test_unlocking_an_account_lets_the_user_sign_in_at_once(world):
    for _ in range(5):
        with pytest.raises(DomainError):
            services.authenticate(email=world.owner_user.email, password="wrong", ip="")
    world.owner_user.refresh_from_db()
    assert world.owner_user.locked_until is not None

    services.unlock_account(actor=world.sysadmin_user, user=world.owner_user)

    assert services.authenticate(email=world.owner_user.email, password=PASSWORD, ip="") == world.owner_user
    assert AuditEvent.objects.filter(action="account.unlocked", actor=world.sysadmin_user).count() == 1


# --- one change at a time ---


@pytest.fixture
def a_change_in_progress():
    """Another database session holds the lock, as a change that has not finished yet would."""
    other = connections.create_connection("default")
    try:
        with other.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_lock(%s)", [ADMINISTRATION_LOCK])
        yield
    finally:
        other.close()


CHANGES = {
    "create_account": lambda world: services.create_account(
        actor=world.sysadmin_user, email="new.person@impactrisks.com", full_name="New Person"
    ),
    "assign_role": lambda world: services.assign_role(
        actor=world.sysadmin_user, user=world.owner_user, role=Role.EXEC
    ),
    "remove_role": lambda world: services.remove_role(
        actor=world.sysadmin_user, user=world.exec_user, role=Role.EXEC
    ),
    "disable_account": lambda world: services.disable_account(
        actor=world.sysadmin_user, user=world.owner_user
    ),
    "enable_account": lambda world: services.enable_account(actor=world.sysadmin_user, user=world.owner_user),
}


@pytest.mark.parametrize("change", sorted(CHANGES))
def test_a_change_to_roles_or_to_account_state_waits_for_the_one_in_progress(
    world, a_change_in_progress, change
):
    # Two changes at the same moment could each pass a check that reads before it writes (HR with System
    # Administrator, the last administrator). Here the wait is cut short, to show that there is one.
    with pytest.raises(OperationalError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("SET LOCAL lock_timeout = '100ms'")
        CHANGES[change](world)

    assert not AuditEvent.objects.exists()
    assert not User.objects.filter(email="new.person@impactrisks.com").exists()
