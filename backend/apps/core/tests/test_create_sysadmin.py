import re
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts import services
from apps.accounts.models import User
from apps.accounts.roles import Role, roles_of
from apps.audit.models import AuditEvent

pytestmark = pytest.mark.django_db


def run(**options) -> str:
    out = StringIO()
    call_command("create_sysadmin", stdout=out, **options)
    return out.getvalue()


def test_the_command_creates_the_first_administrator_and_prints_the_password_once():
    output = run(email="Admin@ImpactRisks.com", name="Sonia Admin")

    user = User.objects.get(email="admin@impactrisks.com")
    assert user.full_name == "Sonia Admin"
    assert roles_of(user) == {Role.SYSADMIN}
    assert user.must_change_password is True
    temporary = re.search(r"Temporary password: (\S+)", output).group(1)
    assert services.authenticate(email="admin@impactrisks.com", password=temporary, ip="") == user
    assert "Valid until" in output
    assert AuditEvent.objects.get(action="account.created").actor is None


def test_an_address_that_already_has_an_account_is_refused():
    run(email="admin@impactrisks.com", name="Sonia Admin")

    with pytest.raises(CommandError, match="already exists"):
        run(email="admin@impactrisks.com", name="Someone Else")

    assert User.objects.count() == 1


def test_an_address_outside_the_company_is_refused():
    with pytest.raises(CommandError, match="impactrisks.com"):
        run(email="admin@gmail.com", name="Sonia Admin")

    assert User.objects.count() == 0


def test_both_options_are_required():
    with pytest.raises(CommandError):
        call_command("create_sysadmin", email="admin@impactrisks.com")
