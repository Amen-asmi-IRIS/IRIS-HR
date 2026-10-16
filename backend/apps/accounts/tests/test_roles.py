import pytest
from django.contrib.auth.models import AnonymousUser

from apps.accounts import roles
from apps.accounts.models import ASSIGNABLE_ROLE_CHOICES, RoleAssignment
from apps.accounts.roles import ASSIGNABLE, Role, roles_of
from apps.accounts.tests.world import make_user

pytestmark = pytest.mark.django_db


@pytest.fixture
def derived_roles():
    """Registers a provider like the one plan 02 adds: everybody is an employee, `boss.*` are managers."""

    def provider(user):
        return [Role.EMPLOYEE, "manager"] if user.email.startswith("boss") else [Role.EMPLOYEE]

    roles.register_derived_role_provider(provider)
    yield
    roles.unregister_derived_role_provider(provider)


def test_a_role_is_a_plain_string():
    assert Role.HR == "hr"
    assert str(Role.SYSADMIN) == "sysadmin"
    assert sorted(Role) == ["employee", "exec", "hr", "manager", "sysadmin"]


def test_the_stored_choices_are_the_assignable_roles():
    assert {value for value, _ in ASSIGNABLE_ROLE_CHOICES} == {role.value for role in ASSIGNABLE}
    assert ASSIGNABLE == {Role.HR, Role.EXEC, Role.SYSADMIN}


def test_an_account_without_assignment_has_no_role():
    assert roles_of(make_user()) == frozenset()


def test_assigned_roles_are_returned():
    assert roles_of(make_user(roles=["hr", "exec"])) == {Role.HR, Role.EXEC}


def test_nobody_and_anonymous_have_no_role():
    assert roles_of(None) == frozenset()
    assert roles_of(AnonymousUser()) == frozenset()


def test_a_provider_adds_derived_roles(derived_roles):
    assert roles_of(make_user("sami@impactrisks.com")) == {Role.EMPLOYEE}
    assert roles_of(make_user("boss@impactrisks.com", roles=["exec"])) == {
        Role.EMPLOYEE,
        Role.MANAGER,
        Role.EXEC,
    }


def test_registering_the_same_provider_twice_changes_nothing():
    def provider(user):
        return [Role.EMPLOYEE]

    roles.register_derived_role_provider(provider)
    roles.register_derived_role_provider(provider)
    try:
        assert roles._providers.count(provider) == 1
    finally:
        roles.unregister_derived_role_provider(provider)


def test_roles_are_read_once_per_user_object(django_assert_num_queries):
    user = make_user(roles=["hr"])

    # One read of the assignments, one of the employee record the organisation derives roles from.
    with django_assert_num_queries(2):
        roles_of(user)
        roles_of(user)


def test_clearing_the_cache_forces_a_fresh_read():
    user = make_user()
    assert roles_of(user) == frozenset()
    RoleAssignment.objects.create(user=user, role="hr")

    assert roles_of(user) == frozenset()  # still the cached answer
    roles.clear_role_cache(user)
    assert roles_of(user) == {Role.HR}


def test_has_role_accepts_any_of_several():
    hr = make_user(roles=["hr"])

    assert roles.has_role(hr, Role.HR) is True
    assert roles.has_role(hr, Role.EXEC, Role.HR) is True
    assert roles.has_role(hr, Role.SYSADMIN) is False
    assert roles.has_role(None, Role.HR) is False


def test_users_with_role_lists_active_holders_only():
    first = make_user("a.admin@impactrisks.com", roles=["sysadmin"])
    make_user("b.disabled@impactrisks.com", roles=["sysadmin"], is_active=False)
    make_user("c.hr@impactrisks.com", roles=["hr"])

    assert list(roles.users_with_role(Role.SYSADMIN)) == [first]
    assert list(roles.users_with_role("hr").values_list("email", flat=True)) == ["c.hr@impactrisks.com"]


@pytest.mark.parametrize("role", [Role.EMPLOYEE, Role.MANAGER])
def test_users_with_role_refuses_a_derived_role(role):
    with pytest.raises(ValueError, match="derived"):
        roles.users_with_role(role)


def test_workspaces_follow_roles(derived_roles):
    assert roles.workspaces_of(make_user("sami@impactrisks.com")) == ["me"]
    assert roles.workspaces_of(make_user("boss@impactrisks.com")) == ["me", "team"]
    assert roles.workspaces_of(make_user("rh@impactrisks.com", roles=["hr", "exec"])) == [
        "me",
        "hr",
        "overview",
    ]


def test_an_administrator_without_employee_record_has_only_administration():
    assert roles.workspaces_of(make_user(roles=["sysadmin"])) == ["admin"]
    assert roles.workspaces_of(make_user()) == []
