from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts import services
from apps.accounts.models import RoleAssignment, User
from apps.accounts.roles import Role, roles_of
from apps.accounts.seed import ACCOUNTS, DEMO_PASSWORD
from apps.core.management.commands import e2e_reset

pytestmark = pytest.mark.django_db

EMAILS = [
    "ceo@impactrisks.com",
    "employee.a1@impactrisks.com",
    "employee.a2@impactrisks.com",
    "employee.b1@impactrisks.com",
    "hr@impactrisks.com",
    "manager.a@impactrisks.com",
    "manager.b@impactrisks.com",
    "sysadmin@impactrisks.com",
]


def seed() -> str:
    out = StringIO()
    call_command("seed_demo", stdout=out)
    return out.getvalue()


def test_seed_demo_creates_the_accounts_of_the_master_plan():
    output = seed()

    assert sorted(User.objects.values_list("email", flat=True)) == EMAILS
    assert DEMO_PASSWORD == "Correct-Horse-42!"
    for user in User.objects.all():
        assert user.check_password(DEMO_PASSWORD)
        assert user.must_change_password is False
        assert user.full_name
    assert roles_of(User.objects.get(email="sysadmin@impactrisks.com")) == {Role.SYSADMIN}
    assert roles_of(User.objects.get(email="ceo@impactrisks.com")) == {Role.EXEC, Role.EMPLOYEE, Role.MANAGER}
    assert roles_of(User.objects.get(email="hr@impactrisks.com")) == {Role.HR, Role.EMPLOYEE}
    assert roles_of(User.objects.get(email="employee.a1@impactrisks.com")) == {Role.EMPLOYEE}
    assert "seeded apps.accounts.seed" in output


def test_a_demo_account_can_sign_in():
    seed()

    user = services.authenticate(email="hr@impactrisks.com", password=DEMO_PASSWORD, ip="")

    assert user.email == "hr@impactrisks.com"


def test_seed_demo_can_run_again_without_duplicates_and_without_undoing_changes():
    seed()
    owner = User.objects.get(email="employee.a1@impactrisks.com")
    owner.set_password("Changed-By-Hand-44!")
    owner.save(update_fields=["password"])

    seed()

    assert User.objects.count() == 8
    assert RoleAssignment.objects.count() == 3
    owner.refresh_from_db()
    assert owner.check_password("Changed-By-Hand-44!")


def test_seed_demo_never_runs_in_production(settings):
    settings.ENVIRONMENT = "production"

    with pytest.raises(CommandError, match="production"):
        seed()

    assert User.objects.count() == 0


def test_the_demo_accounts_are_the_test_cast(world):
    cast = {user.email: user.full_name for user in User.objects.all()}

    assert cast == {email: full_name for email, full_name, _roles in ACCOUNTS}


def test_e2e_reset_never_runs_in_production(settings, monkeypatch):
    calls = []
    monkeypatch.setattr(e2e_reset, "rebuild_schema", lambda: calls.append("rebuild"))
    monkeypatch.setattr(e2e_reset, "call_command", lambda name, **options: calls.append(name))
    settings.ENVIRONMENT = "production"

    with pytest.raises(CommandError, match="production"):
        call_command("e2e_reset", stdout=StringIO())

    assert calls == []


def test_e2e_reset_rebuilds_migrates_then_seeds(monkeypatch):
    calls = []
    monkeypatch.setattr(e2e_reset, "rebuild_schema", lambda: calls.append("rebuild"))
    monkeypatch.setattr(e2e_reset, "call_command", lambda name, **options: calls.append(name))

    call_command("e2e_reset", stdout=StringIO())

    assert calls == ["rebuild", "migrate", "seed_demo"]
