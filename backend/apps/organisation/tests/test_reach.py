import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser

from apps.accounts.roles import Role, roles_of
from apps.organisation import reach
from apps.organisation.models import Employee, EmployeeStatus

pytestmark = pytest.mark.django_db
User = get_user_model()


def _fresh(user):
    """Roles are cached on the user object, so read the account again."""
    return User.objects.get(pk=user.pk)


def test_employee_of(world):
    assert reach.employee_of(world.owner_user) == world.owner
    assert reach.employee_of(world.sysadmin_user) is None
    assert reach.employee_of(AnonymousUser()) is None
    assert reach.employee_of(None) is None


def test_team_is_the_direct_reports(world):
    assert reach.team_ids(world.manager_user) == {world.owner.id, world.peer.id}
    assert reach.team_ids(world.exec_user) == {world.manager.id, world.other_manager.id, world.hr.id}
    assert reach.team_ids(world.owner_user) == set()
    assert reach.team_ids(world.sysadmin_user) == set()


def test_people_who_left_are_not_in_a_team(world):
    Employee.objects.filter(pk=world.peer.pk).update(status=EmployeeStatus.ARCHIVED)

    assert reach.team_ids(world.manager_user) == {world.owner.id}


def test_department_peers_include_the_user(world):
    assert reach.department_peer_ids(world.owner_user) == {world.manager.id, world.owner.id, world.peer.id}
    assert reach.department_peer_ids(world.sysadmin_user) == set()


@pytest.mark.parametrize(
    ("viewer", "target", "visible"),
    [
        ("owner_user", "owner", True),
        ("owner_user", "peer", False),
        ("manager_user", "owner", True),
        ("manager_user", "outsider", False),
        ("other_manager_user", "owner", False),
        ("hr_user", "owner", True),
        ("exec_user", "outsider", True),
        ("sysadmin_user", "owner", False),
    ],
)
def test_can_see_employee(world, viewer, target, visible):
    assert reach.can_see_employee(getattr(world, viewer), getattr(world, target)) is visible


def test_roles_are_derived_from_the_record_and_the_reporting_line(world):
    assert Role.EMPLOYEE in roles_of(_fresh(world.owner_user))
    assert Role.MANAGER not in roles_of(_fresh(world.owner_user))
    assert {Role.EMPLOYEE, Role.MANAGER} <= roles_of(_fresh(world.manager_user))
    assert {Role.EMPLOYEE, Role.MANAGER, Role.EXEC} <= roles_of(_fresh(world.exec_user))
    assert {Role.EMPLOYEE, Role.HR} <= roles_of(_fresh(world.hr_user))
    assert roles_of(_fresh(world.sysadmin_user)) == {Role.SYSADMIN}


def test_an_archived_record_gives_no_role(world):
    Employee.objects.filter(pk=world.manager.pk).update(status=EmployeeStatus.ARCHIVED)

    assert roles_of(_fresh(world.manager_user)) == frozenset()


def test_lock_employee_returns_the_row(world):
    assert reach.lock_employee(world.owner.id) == world.owner
