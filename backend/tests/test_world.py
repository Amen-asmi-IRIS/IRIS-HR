import pytest

from apps.accounts.roles import Role, roles_of
from apps.accounts.tests.world import PASSWORD


def test_the_cast_holds_the_accounts_of_the_master_plan(world):
    assert roles_of(world.sysadmin_user) == {Role.SYSADMIN}
    assert roles_of(world.exec_user) >= {Role.EXEC}
    assert roles_of(world.hr_user) >= {Role.HR}
    emails = {
        "sysadmin_user": "sysadmin@impactrisks.com",
        "exec_user": "ceo@impactrisks.com",
        "hr_user": "hr@impactrisks.com",
        "manager_user": "manager.a@impactrisks.com",
        "owner_user": "employee.a1@impactrisks.com",
        "peer_user": "employee.a2@impactrisks.com",
        "other_manager_user": "manager.b@impactrisks.com",
        "outsider_user": "employee.b1@impactrisks.com",
    }
    for attribute, email in emails.items():
        user = getattr(world, attribute)
        assert user.email == email
        assert user.check_password(PASSWORD)
        assert user.must_change_password is False


@pytest.mark.parametrize(
    "persona",
    ["owner", "peer", "manager", "other_manager", "outsider", "hr", "exec", "sysadmin"],
)
def test_user_for_returns_the_account_of_a_persona(world, persona):
    assert world.user_for(persona) is getattr(world, f"{persona}_user")


def test_the_anonymous_persona_has_no_account(world):
    assert world.user_for("anon") is None


@pytest.mark.urls("apps.accounts.tests.urls_permissions")
def test_the_client_fixtures_sign_in_or_stay_anonymous(world, client_for, anon_client):
    assert client_for(world.hr_user).get("/signed-in").json()["email"] == "hr@impactrisks.com"
    assert anon_client.get("/signed-in").status_code == 401
