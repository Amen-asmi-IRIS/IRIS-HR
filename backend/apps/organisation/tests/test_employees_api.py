from datetime import date

import pytest
from django.urls import reverse

from apps.organisation.models import Employee, EmployeeStatus

pytestmark = pytest.mark.django_db

LIST = "organisation:employee-list"


@pytest.fixture(autouse=True)
def _company_domain(settings):
    settings.ALLOWED_EMAIL_DOMAIN = "impactrisks.com"


def _list(client, **params):
    return client.get(reverse(LIST), params)


def _detail(employee) -> str:
    return reverse("organisation:employee-detail", kwargs={"public_id": employee.public_id})


def _archive(employee) -> None:
    Employee.objects.filter(pk=employee.pk).update(status=EmployeeStatus.ARCHIVED)


def _payload(world, **overrides):
    payload = {
        "employee_number": "E100",
        "first_name": "Nour",
        "last_name": "Nouvelle",
        "professional_email": "Nour.Nouvelle@impactrisks.com",
        "hire_date": "2026-11-02",
        "contract_type": "permanent",
        "department": world.dept_a.id,
        "position": world.position.id,
        "manager": str(world.manager.public_id),
    }
    payload.update(overrides)
    return payload


def test_hr_lists_everyone_still_employed(world, client_for):
    _archive(world.outsider)

    body = _list(client_for(world.hr_user)).json()

    assert body["count"] == 6
    assert "E007" not in [row["employee_number"] for row in body["results"]]
    row = next(row for row in body["results"] if row["employee_number"] == "E004")
    assert set(row) == {
        "public_id",
        "name",
        "department",
        "position",
        "professional_email",
        "phone",
        "employee_number",
        "manager",
        "status",
    }
    assert row["name"] == "Amal Employee"
    assert row["department"]["code"] == "DEP-A"
    assert row["position"]["code"] == "POS-1"
    assert row["manager"] == {"public_id": str(world.manager.public_id), "name": "Mounir Manager"}
    assert row["status"] == "active"


def test_people_who_left_are_found_only_when_asked_for(world, client_for):
    _archive(world.outsider)
    client = client_for(world.hr_user)

    assert [row["employee_number"] for row in _list(client, status="archived").json()["results"]] == ["E007"]
    assert _list(client, status="all").json()["count"] == 7


def test_search_filters_and_ordering(world, client_for):
    client = client_for(world.hr_user)

    assert [row["name"] for row in _list(client, search="amal emp").json()["results"]] == ["Amal Employee"]
    assert [row["name"] for row in _list(client, search="e005").json()["results"]] == ["Bilel Employee"]
    assert [row["name"] for row in _list(client, search=world.hr.professional_email).json()["results"]] == [
        "Senna RH"
    ]
    assert _list(client, department=world.dept_a.id).json()["count"] == 3
    reports = _list(client, manager=str(world.manager.public_id)).json()["results"]
    assert {row["name"] for row in reports} == {"Amal Employee", "Bilel Employee"}
    assert _list(client, ordering="-employee_number").json()["results"][0]["employee_number"] == "E007"
    assert _list(client, ordering="nonsense").status_code == 400


def test_a_manager_sees_only_the_team_and_only_contact_details(world, client_for):
    body = _list(client_for(world.manager_user)).json()

    assert {row["name"] for row in body["results"]} == {"Amal Employee", "Bilel Employee"}
    for row in body["results"]:
        assert (row["employee_number"], row["manager"], row["status"]) == (None, None, None)
        assert row["professional_email"].endswith("@impactrisks.com")


def test_a_manager_cannot_search_filter_or_sort_by_what_they_do_not_read(world, client_for):
    """The number, the status and the hire date are not shown to a manager, so they cannot be asked for either."""
    Employee.objects.filter(pk=world.peer.pk).update(
        hire_date=date(2024, 1, 8), status=EmployeeStatus.SUSPENDED
    )
    client = client_for(world.manager_user)
    by_name = ["Amal Employee", "Bilel Employee"]

    assert [row["name"] for row in _list(client, search="E005").json()["results"]] == []
    assert [row["name"] for row in _list(client, search="bilel").json()["results"]] == ["Bilel Employee"]
    assert [row["name"] for row in _list(client, status="suspended").json()["results"]] == by_name
    for ordering in ("-hire_date", "-employee_number"):
        assert [row["name"] for row in _list(client, ordering=ordering).json()["results"]] == by_name
    assert [row["name"] for row in _list(client, ordering="-name").json()["results"]] == by_name[::-1]


def test_scopes_follow_the_roles(world, client_for):
    assert _list(client_for(world.manager_user), scope="all").status_code == 403
    assert _list(client_for(world.hr_user), scope="team").status_code == 403

    team = _list(client_for(world.exec_user), scope="team").json()
    assert {row["name"] for row in team["results"]} == {"Mounir Manager", "Nadia Manager", "Senna RH"}
    assert team["results"][0]["employee_number"] is not None  # an executive keeps the full view


def test_the_record_is_complete_for_its_owner_hr_and_executives(world, client_for):
    for user in (world.owner_user, world.hr_user, world.exec_user):
        body = client_for(user).get(_detail(world.owner)).json()
        assert body["employee_number"] == "E004"
        assert body["hire_date"] == "2020-01-06"
        assert body["manager"] == {"public_id": str(world.manager.public_id), "name": "Mounir Manager"}
        assert body["has_account"] is True
        assert body["archived_at"] is None


def test_a_manager_reads_only_name_department_position_and_contact(world, client_for):
    body = client_for(world.manager_user).get(_detail(world.owner)).json()

    assert set(body) == {
        "public_id",
        "first_name",
        "last_name",
        "name",
        "department",
        "position",
        "professional_email",
        "phone",
    }


@pytest.mark.parametrize("viewer", ["peer_user", "other_manager_user", "outsider_user"])
def test_a_record_outside_reach_does_not_exist(world, client_for, viewer):
    response = client_for(getattr(world, viewer)).get(_detail(world.owner))

    assert response.status_code == 404
    assert response.json()["code"] == "core.not_found"


def test_my_own_record(world, client_for):
    body = client_for(world.owner_user).get(reverse("organisation:employee-me")).json()

    assert body["public_id"] == str(world.owner.public_id)
    assert body["employee_number"] == "E004"
    assert client_for(world.sysadmin_user).get(reverse("organisation:employee-me")).status_code == 403


def test_the_directory_lists_active_people_by_name_and_department_only(world, client_for):
    Employee.objects.filter(pk=world.peer.pk).update(status=EmployeeStatus.SUSPENDED)
    url = reverse("organisation:employee-directory")

    body = client_for(world.manager_user).get(url).json()

    assert len(body) == 6
    assert set(body[0]) == {"public_id", "name", "department"}
    assert "Bilel Employee" not in [row["name"] for row in body]
    assert client_for(world.owner_user).get(url).status_code == 403


def test_hr_creates_an_employee(world, client_for):
    response = client_for(world.hr_user).post(reverse(LIST), _payload(world), format="json")

    assert response.status_code == 201
    body = response.json()
    assert body["professional_email"] == "nour.nouvelle@impactrisks.com"
    assert body["status"] == "active"
    assert body["has_account"] is False
    assert body["manager"]["name"] == "Mounir Manager"


def test_problems_come_back_next_to_their_fields(world, client_for):
    payload = _payload(world, employee_number="E004", professional_email="nour@gmail.com")

    response = client_for(world.hr_user).post(reverse(LIST), payload, format="json")

    assert response.status_code == 400
    assert {(error["field"], error["code"]) for error in response.json()["errors"]} == {
        ("employee_number", "organisation.number_taken"),
        ("professional_email", "organisation.email_domain"),
    }


def test_mandatory_fields_are_named(world, client_for):
    response = client_for(world.hr_user).post(reverse(LIST), {}, format="json")

    assert response.status_code == 400
    assert {error["field"] for error in response.json()["errors"]} == {
        "employee_number",
        "first_name",
        "last_name",
        "professional_email",
        "hire_date",
        "contract_type",
        "department",
        "position",
    }


def test_a_malformed_or_departed_manager_is_refused_not_crashed(world, client_for):
    _archive(world.outsider)
    client = client_for(world.hr_user)

    for manager in ("not-an-identifier", str(world.outsider.public_id)):
        response = client.post(reverse(LIST), _payload(world, manager=manager), format="json")
        assert response.status_code == 400
        assert response.json()["errors"][0]["field"] == "manager"


def test_hr_edits_an_employee(world, client_for):
    response = client_for(world.hr_user).patch(
        _detail(world.owner), {"phone": "71 000 000", "status": "suspended"}, format="json"
    )

    assert response.status_code == 200
    assert (response.json()["phone"], response.json()["status"]) == ("71 000 000", "suspended")


def test_an_edit_cannot_archive(world, client_for):
    response = client_for(world.hr_user).patch(_detail(world.owner), {"status": "archived"}, format="json")

    assert response.status_code == 400
    assert response.json()["errors"][0]["field"] == "status"


def test_a_manager_loop_is_refused_through_the_api(world, client_for):
    response = client_for(world.hr_user).patch(
        _detail(world.ceo), {"manager": str(world.owner.public_id)}, format="json"
    )

    assert response.status_code == 400
    assert response.json()["code"] == "organisation.manager_loop"
    assert response.json()["errors"][0]["field"] == "manager"


def test_only_hr_writes(world, client_for):
    assert client_for(world.exec_user).post(reverse(LIST), {}, format="json").status_code == 403
    own = client_for(world.owner_user).patch(_detail(world.owner), {"phone": "1"}, format="json")
    assert own.status_code == 403


def test_the_form_can_send_back_a_manager_who_left(world, client_for):
    # The edit form sends every field: an unchanged manager who has since left must not block the save.
    _archive(world.manager)

    response = client_for(world.hr_user).patch(
        _detail(world.owner), {"phone": "71 000 000", "manager": str(world.manager.public_id)}, format="json"
    )
    changed = client_for(world.hr_user).patch(
        _detail(world.outsider), {"manager": str(world.manager.public_id)}, format="json"
    )

    assert response.status_code == 200
    assert response.json()["manager"]["name"] == "Mounir Manager"
    assert changed.status_code == 400
    assert (changed.json()["code"], changed.json()["errors"][0]["field"]) == (
        "organisation.manager_left",
        "manager",
    )
