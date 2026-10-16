import pytest

from apps.accounts.ports import EmployeeRef, NullEmployeeDirectory, employee_directory, set_employee_directory
from apps.accounts.services import display_name
from apps.accounts.tests.world import make_user


class StubDirectory:
    def __init__(self, refs):
        self.refs = refs

    def candidate(self, public_id):
        return None

    def candidates(self):
        return []

    def link(self, *, user_id, public_id):
        raise AssertionError("not used here")

    def ref_for_user(self, user_id):
        return self.refs.get(user_id)


@pytest.fixture
def install_directory():
    previous = employee_directory()
    yield set_employee_directory
    set_employee_directory(previous)


def test_the_organisation_app_installs_its_directory():
    """Since plan 02. The null directory below is what `accounts` falls back to without that app."""
    assert type(employee_directory()).__name__ == "OrganisationDirectory"


def test_without_the_organisation_the_directory_knows_nobody():
    directory = NullEmployeeDirectory()

    assert directory.candidate("0f0e0d0c-0000-4000-8000-000000000001") is None
    assert directory.candidates() == []
    assert directory.ref_for_user(1) is None
    assert directory.has_left(1) is False


def test_without_the_organisation_nobody_can_be_linked():
    with pytest.raises(RuntimeError, match="No employee directory"):
        NullEmployeeDirectory().link(user_id=1, public_id="0f0e0d0c-0000-4000-8000-000000000001")


@pytest.mark.django_db
def test_the_name_comes_from_the_employee_record_when_there_is_one(install_directory):
    user = make_user("sami@impactrisks.com", full_name="S. Ben Ali")
    install_directory(StubDirectory({user.pk: EmployeeRef("abc", "Sami Ben Ali", "sami@impactrisks.com")}))

    assert display_name(user) == "Sami Ben Ali"


@pytest.mark.django_db
def test_otherwise_the_name_is_the_one_stored_on_the_account():
    assert display_name(make_user("admin@impactrisks.com", full_name="Leila Admin")) == "Leila Admin"


@pytest.mark.django_db
def test_and_as_a_last_resort_the_email():
    assert display_name(make_user("admin@impactrisks.com", full_name="")) == "admin@impactrisks.com"
