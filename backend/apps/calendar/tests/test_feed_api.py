from datetime import date

import pytest
import time_machine
from django.urls import reverse

from apps.calendar import services as calendar_services
from tests.request_flows import NOW, approved, send

pytestmark = pytest.mark.django_db

URL = reverse("calendar:feed")
NOVEMBER = {"from": "2026-11-01", "to": "2026-11-30"}
ENTRY_KEYS = {
    "employee",
    "start_date",
    "end_date",
    "starts_at_midday",
    "ends_at_midday",
    "label",
    "type_code",
    "type_name",
    "status",
    "request_public_id",
    "mine",
}


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def test_the_response_has_the_contract_shape(world, client_for):
    calendar_services.create_holiday(
        actor=world.hr_user, date=date(2026, 11, 20), name_fr="Jour férié", name_en="Public holiday"
    )
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 3),
    )

    response = client_for(world.owner_user).get(URL, {**NOVEMBER, "scope": "department"})

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"holidays", "entries", "working_week"}
    assert body["holidays"] == [{"date": "2026-11-20", "name": "Jour férié"}]
    [entry] = body["entries"]
    assert set(entry) == ENTRY_KEYS
    assert set(entry["employee"]) == {"public_id", "name"}
    assert entry["employee"]["public_id"] == str(world.peer.public_id)
    assert entry == {
        **entry,
        "start_date": "2026-11-02",
        "end_date": "2026-11-03",
        "label": "absent",
        "type_code": None,
        "type_name": None,
        "status": None,
        "request_public_id": None,
        "mine": False,
    }


def test_names_follow_the_readers_language(world, client_for):
    calendar_services.create_holiday(
        actor=world.hr_user, date=date(2026, 11, 20), name_fr="Jour férié", name_en="Public holiday"
    )
    send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 12),
    )
    world.owner_user.language = "en"
    world.owner_user.save(update_fields=["language"])

    body = client_for(world.owner_user).get(URL, {**NOVEMBER, "scope": "department"}).json()

    assert body["holidays"][0]["name"] == "Public holiday"
    assert body["entries"][0]["type_name"] == world.annual.name_en


def test_department_scope_ignores_filters(world, client_for):
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 3),
    )
    client = client_for(world.owner_user)

    plain = client.get(URL, {**NOVEMBER, "scope": "department"}).json()
    probed = client.get(
        URL, {**NOVEMBER, "scope": "department", "type": "annual", "status": "pending"}
    ).json()

    assert len(plain["entries"]) == 1
    assert probed == plain


def test_a_manager_gets_types_and_pending_requests_in_team_scope(world, client_for):
    request = send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 12),
    )

    body = client_for(world.manager_user).get(URL, {**NOVEMBER, "scope": "team"}).json()

    [entry] = body["entries"]
    assert entry["type_code"] == "annual"
    assert entry["type_name"] == world.annual.name_fr
    assert entry["status"] == "pending"
    assert entry["request_public_id"] == str(request.public_id)


def test_company_scope_accepts_its_filters(world, client_for):
    approved(
        world,
        employee=world.outsider,
        user=world.outsider_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 12),
    )
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.remote,
        start=date(2026, 11, 4),
        end=date(2026, 11, 4),
    )
    client = client_for(world.hr_user)

    by_department = client.get(URL, {**NOVEMBER, "scope": "company", "department": world.dept_b.id}).json()
    by_person = client.get(
        URL, {**NOVEMBER, "scope": "company", "employee": str(world.peer.public_id)}
    ).json()
    by_type = client.get(URL, {**NOVEMBER, "scope": "company", "type": "remote", "status": "approved"}).json()

    assert [e["employee"]["public_id"] for e in by_department["entries"]] == [str(world.outsider.public_id)]
    assert [e["employee"]["public_id"] for e in by_person["entries"]] == [str(world.peer.public_id)]
    assert [e["type_code"] for e in by_type["entries"]] == ["remote"]


@pytest.mark.parametrize(
    "persona, scope",
    [
        ("owner_user", "team"),  # manages nobody
        ("hr_user", "team"),  # HR is not a manager in the cast
        ("owner_user", "company"),
        ("manager_user", "company"),
    ],
)
def test_a_scope_beyond_the_viewers_role_is_refused(world, client_for, persona, scope):
    response = client_for(getattr(world, persona)).get(URL, {**NOVEMBER, "scope": scope})

    assert response.status_code == 403
    assert response.json()["code"] == "calendar.scope_not_allowed"


def test_an_executive_who_manages_people_may_use_all_three_scopes(world, client_for):
    client = client_for(world.exec_user)
    for scope in ("department", "team", "company"):
        assert client.get(URL, {**NOVEMBER, "scope": scope}).status_code == 200


def test_the_system_administrator_has_no_calendar(world, client_for):
    response = client_for(world.sysadmin_user).get(URL, {**NOVEMBER, "scope": "department"})
    assert response.status_code == 403


def test_anonymous_is_sent_to_sign_in(anon_client):
    assert anon_client.get(URL, {**NOVEMBER, "scope": "department"}).status_code == 401


@pytest.mark.parametrize(
    "params, field",
    [
        ({"to": "2026-11-30", "scope": "department"}, "from"),
        ({"from": "2026-11-01", "scope": "department"}, "to"),
        ({"from": "2026-11-01", "to": "2026-11-30"}, "scope"),
        ({"from": "2026-11-01", "to": "2026-11-30", "scope": "planet"}, "scope"),
        ({"from": "01/11/2026", "to": "2026-11-30", "scope": "department"}, "from"),
        ({"from": "2026-11-01", "to": "2026-11-30", "scope": "company", "status": "draft"}, "status"),
    ],
)
def test_bad_parameters_are_reported_on_their_field(world, client_for, params, field):
    response = client_for(world.exec_user).get(URL, params)

    assert response.status_code == 400
    assert field in [error["field"] for error in response.json()["errors"]]


def test_a_window_that_is_too_long_is_refused(world, client_for):
    response = client_for(world.owner_user).get(
        URL, {"from": "2026-01-01", "to": "2026-12-31", "scope": "department"}
    )

    assert response.status_code == 400
    assert response.json()["code"] == "calendar.window_invalid"
