import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.accounts import services as accounts_services
from apps.accounts.ports import employee_directory
from apps.accounts.roles import Role, roles_of
from apps.core.errors import Conflict
from apps.organisation.models import Employee, EmployeeStatus
from apps.organisation.tests.world import make_employee

pytestmark = pytest.mark.django_db
User = get_user_model()

NOUR = "nour.nouvelle@impactrisks.com"


@pytest.fixture
def newcomer(world):
    return make_employee(
        number="E100",
        first_name="Nour",
        last_name="Nouvelle",
        department=world.dept_a,
        position=world.position,
        manager=world.manager,
    )


def test_the_directory_offers_only_employees_without_an_account(world, newcomer):
    directory = employee_directory()

    refs = directory.candidates()

    assert [(ref.public_id, ref.full_name, ref.email) for ref in refs] == [
        (str(newcomer.public_id), "Nour Nouvelle", NOUR)
    ]
    assert directory.candidate(str(newcomer.public_id)) == refs[0]
    assert directory.candidate("not-an-identifier") is None
    assert directory.candidate("0f0e0d0c-0000-4000-8000-000000000001") is None
    with pytest.raises(Conflict) as error:
        directory.candidate(str(world.owner.public_id))
    assert error.value.code == "accounts.employee_has_account"


def test_people_who_left_are_not_candidates(world, newcomer):
    Employee.objects.filter(pk=newcomer.pk).update(status=EmployeeStatus.ARCHIVED)

    assert employee_directory().candidates() == []
    assert employee_directory().candidate(str(newcomer.public_id)) is None


def test_ref_for_user(world):
    ref = employee_directory().ref_for_user(world.owner_user.id)

    assert (ref.public_id, ref.full_name, ref.email) == (
        str(world.owner.public_id),
        "Amal Employee",
        world.owner.professional_email,
    )
    assert employee_directory().ref_for_user(world.sysadmin_user.id) is None


def test_link_attaches_an_account_once(world, newcomer):
    directory = employee_directory()

    directory.link(user_id=world.sysadmin_user.id, public_id=str(newcomer.public_id))

    newcomer.refresh_from_db()
    assert newcomer.user == world.sysadmin_user
    with pytest.raises(Conflict) as error:
        directory.link(user_id=world.sysadmin_user.id, public_id=str(newcomer.public_id))
    assert error.value.code == "accounts.employee_has_account"


def test_an_account_is_created_for_an_employee(world, newcomer):
    user, temporary_password = accounts_services.create_account(
        actor=world.sysadmin_user, employee_public_id=str(newcomer.public_id)
    )

    newcomer.refresh_from_db()
    assert newcomer.user_id == user.id
    assert user.email == NOUR
    assert temporary_password
    assert Role.EMPLOYEE in roles_of(User.objects.get(pk=user.pk))


def test_the_administrator_sees_candidates_and_the_status_page_counts_them(world, newcomer, client_for):
    client = client_for(world.sysadmin_user)

    candidates = client.get(reverse("accounts:account-candidates")).json()
    status = client.get(reverse("core:admin-status")).json()

    assert candidates == [{"public_id": str(newcomer.public_id), "full_name": "Nour Nouvelle", "email": NOUR}]
    assert [row["email"] for row in status["accounts"]["employees_without_account"]] == [NOUR]


def test_creating_the_account_through_the_api_links_it(world, newcomer, client_for):
    client = client_for(world.sysadmin_user)

    response = client.post(
        reverse("accounts:account-list"), {"employee": str(newcomer.public_id), "roles": []}, format="json"
    )

    assert response.status_code == 201
    assert response.json()["account"]["email"] == NOUR
    assert response.json()["account"]["has_employee"] is True
    assert client.get(reverse("accounts:account-candidates")).json() == []


def test_me_names_the_employee_and_the_workspaces(world, client_for):
    owner = client_for(world.owner_user).get(reverse("accounts:me")).json()
    manager = client_for(world.manager_user).get(reverse("accounts:me")).json()

    assert owner["employee"] == {"public_id": str(world.owner.public_id), "name": "Amal Employee"}
    assert owner["name"] == "Amal Employee"
    assert set(owner["workspaces"]) == {"me"}
    assert set(manager["workspaces"]) == {"me", "team"}
