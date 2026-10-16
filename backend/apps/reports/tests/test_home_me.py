from datetime import date, time
from decimal import Decimal

import pytest
import time_machine
from django.urls import reverse

from tests.request_flows import NOW, approved, decide, give_balance, send

pytestmark = pytest.mark.django_db

URL = reverse("reports:home-me")


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def ids(requests):
    return [request["public_id"] for request in requests]


def test_home_me_for_a_new_employee(world, client_for):
    response = client_for(world.owner_user).get(URL)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"balance", "needs_you", "in_progress", "coming_up"}
    assert set(body["balance"]) == {
        "current",
        "pending",
        "approved_upcoming",
        "next_credit_amount",
        "next_credit_date",
    }
    assert Decimal(body["balance"]["current"]) == Decimal("0")
    assert Decimal(body["balance"]["pending"]) == Decimal("0")
    assert Decimal(body["balance"]["approved_upcoming"]) == Decimal("0")
    assert body["needs_you"] == []
    assert body["in_progress"] == []
    assert body["coming_up"] == []


def test_home_me_gathers_what_the_employee_asks_every_day(world, client_for, ledger_port):
    # With the real ledger behind the requests, so that approved leave is posted.
    give_balance(world, world.owner, "20")
    returned = send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 10),
    )
    decide(returned, "return", "Pick another week")
    pending = send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 17),
        end=date(2026, 11, 18),
    )
    upcoming = approved(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 24),
        end=date(2026, 11, 25),
    )
    sick = send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
    )

    body = client_for(world.owner_user).get(URL).json()

    assert Decimal(body["balance"]["current"]) == Decimal("20")  # nothing is taken before 24 November
    assert Decimal(body["balance"]["pending"]) == Decimal(
        "2"
    )  # 17 and 18 November; a returned request holds nothing
    assert Decimal(body["balance"]["approved_upcoming"]) == Decimal("2")

    needs = {item["kind"]: item for item in body["needs_you"]}
    assert set(needs) == {"returned", "certificate_due"}
    assert needs["returned"]["request"]["public_id"] == str(returned.public_id)
    assert needs["returned"]["request"]["state"]["note"] == "Pick another week"
    assert needs["returned"]["due_at"] is None
    assert needs["certificate_due"]["request"]["public_id"] == str(sick.public_id)
    assert needs["certificate_due"]["due_at"] is not None

    assert ids(body["in_progress"]) == [str(sick.public_id), str(pending.public_id)]
    assert ids(body["coming_up"]) == [str(upcoming.public_id)]
    assert body["in_progress"][0]["viewer"]["relation"] == "owner"


def test_lists_hold_at_most_five_requests_soonest_first(world, client_for):
    for day in (10, 9, 6, 5, 4, 3):
        send(
            world,
            employee=world.owner,
            user=world.owner_user,
            request_type=world.permission,
            start=date(2026, 11, day),
            end=date(2026, 11, day),
            start_time=time(9, 0),
            end_time=time(10, 0),
        )

    body = client_for(world.owner_user).get(URL).json()

    assert [request["start_date"] for request in body["in_progress"]] == [
        "2026-11-03",
        "2026-11-04",
        "2026-11-05",
        "2026-11-06",
        "2026-11-09",
    ]


def test_coming_up_keeps_leave_in_progress_and_drops_leave_that_is_over(world, client_for):
    approved(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.sick,
        start=date(2026, 10, 28),
        end=date(2026, 10, 29),
    )
    current = approved(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 3),
    )

    body = client_for(world.owner_user).get(URL).json()

    assert ids(body["coming_up"]) == [str(current.public_id)]


def test_other_peoples_requests_never_appear(world, client_for):
    send(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.annual,
        start=date(2026, 11, 17),
        end=date(2026, 11, 18),
    )
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.remote,
        start=date(2026, 11, 4),
        end=date(2026, 11, 4),
    )

    body = client_for(world.owner_user).get(URL).json()

    assert body["in_progress"] == [] and body["coming_up"] == [] and body["needs_you"] == []


def test_home_me_needs_an_employee_record(world, client_for, anon_client):
    assert client_for(world.sysadmin_user).get(URL).status_code == 403
    assert anon_client.get(URL).status_code == 401
