from datetime import UTC, date, datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
import time_machine
from django.urls import reverse

from apps.organisation import selectors as org_selectors
from apps.organisation import services as org_services
from tests.request_flows import NOW, approved, give_balance, send

pytestmark = pytest.mark.django_db

URL = reverse("reports:home-team")


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def names(body):
    return [person["employee"]["name"] for person in body["who_is_out"]]


def presence(body, employee):
    return next(person for person in body["people"] if person["public_id"] == str(employee.public_id))


def test_who_is_out_lists_the_team_today_and_over_the_next_seven_days(world, client_for):
    approved(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.remote,
        start=date(2026, 11, 5),
        end=date(2026, 11, 5),
        starts_at_midday=True,
    )
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 3),
    )
    # Outside the next seven days, still pending, hourly, or another team: none of these appears.
    approved(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 10),
    )
    send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 6),
        end=date(2026, 11, 6),
    )
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.permission,
        start=date(2026, 11, 4),
        end=date(2026, 11, 4),
        start_time=time(9, 0),
        end_time=time(10, 0),
    )
    approved(
        world,
        employee=world.outsider,
        user=world.outsider_user,
        request_type=world.annual,
        start=date(2026, 11, 3),
        end=date(2026, 11, 4),
    )

    response = client_for(world.manager_user).get(URL)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"who_is_out", "delegation", "people"}
    assert names(body) == [org_selectors.full_name(world.peer), org_selectors.full_name(world.owner)]
    first, second = body["who_is_out"]
    assert set(first) == {
        "employee",
        "label",
        "type_name",
        "start_date",
        "end_date",
        "starts_at_midday",
        "ends_at_midday",
        "today",
        "waiting",
    }
    assert first == {
        **first,
        "label": "absent",
        "type_name": world.sick.name_fr,
        "today": True,
        "waiting": False,
        "start_date": "2026-11-02",
        "end_date": "2026-11-03",
    }
    assert second == {
        **second,
        "label": "remote",
        "today": False,
        "start_date": "2026-11-05",
        "starts_at_midday": True,
    }
    assert body["delegation"] is None


def test_people_carries_presence_today_and_balance_for_every_team_member(world, client_for):
    give_balance(world, world.owner, "12")
    give_balance(world, world.peer, "7.5")
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 3),
    )
    approved(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.remote,
        start=date(2026, 11, 5),
        end=date(2026, 11, 5),
    )

    body = client_for(world.manager_user).get(URL).json()

    assert [person["public_id"] for person in body["people"]] == [
        str(world.owner.public_id),
        str(world.peer.public_id),
    ]
    assert presence(body, world.owner) == {
        "public_id": str(world.owner.public_id),
        "today": "in",
        "waiting": False,
        "balance": "12.00",
    }
    assert presence(body, world.peer) == {
        "public_id": str(world.peer.public_id),
        "today": "absent",
        "waiting": False,
        "balance": "7.50",
    }


def test_remote_work_today_reads_remote_and_an_absence_wins_over_it(world, client_for):
    approved(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.remote,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
        ends_at_midday=True,
    )
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.remote,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
        ends_at_midday=True,
    )
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
        starts_at_midday=True,
    )

    body = client_for(world.manager_user).get(URL).json()

    assert presence(body, world.owner)["today"] == "remote"
    assert presence(body, world.peer)["today"] == "absent"
    assert Decimal(presence(body, world.owner)["balance"]) == Decimal("0")


def test_nobody_is_marked_away_on_a_day_off(world, client_for):
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 6),
        end=date(2026, 11, 9),
    )

    saturday = datetime(2026, 11, 7, 8, 0, tzinfo=ZoneInfo("Africa/Tunis"))
    with time_machine.travel(saturday, tick=False):
        body = client_for(world.manager_user).get(URL).json()

    assert presence(body, world.peer)["today"] == "in"
    assert names(body) == [org_selectors.full_name(world.peer)]  # still listed: away again on Monday
    assert body["who_is_out"][0]["today"] is False


def test_delegate_sees_the_delegated_team(world, client_for):
    approved(
        world,
        employee=world.outsider,
        user=world.outsider_user,
        request_type=world.annual,
        start=date(2026, 11, 3),
        end=date(2026, 11, 4),
    )
    org_services.create_delegation(
        actor=world.hr_user,
        manager=world.other_manager,
        delegate=world.manager,
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 20),
    )

    body = client_for(world.manager_user).get(URL).json()

    assert names(body) == [org_selectors.full_name(world.outsider)]
    assert str(world.outsider.public_id) in [person["public_id"] for person in body["people"]]
    assert body["delegation"] == {
        "direction": "received",
        "person": org_selectors.full_name(world.other_manager),
        "start_date": "2026-11-02",
        "end_date": "2026-11-20",
    }


def test_a_delegation_given_is_reported_and_wins_over_one_received(world, client_for):
    org_services.create_delegation(
        actor=world.hr_user,
        manager=world.other_manager,
        delegate=world.manager,
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 20),
    )
    org_services.create_delegation(
        actor=world.hr_user,
        manager=world.manager,
        delegate=world.peer,
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 6),
    )

    as_manager = client_for(world.manager_user).get(URL).json()
    as_delegate = client_for(world.peer_user).get(URL)

    assert as_manager["delegation"] == {
        "direction": "given",
        "person": org_selectors.full_name(world.peer),
        "start_date": "2026-11-02",
        "end_date": "2026-11-06",
    }
    assert as_delegate.status_code == 200  # an active delegate is a manager for the period
    assert as_delegate.json()["delegation"]["direction"] == "received"
    # The delegate answers for the owner, not for themselves.
    assert [person["public_id"] for person in as_delegate.json()["people"]] == [str(world.owner.public_id)]


def test_a_delegation_that_has_not_started_is_not_reported(world, client_for):
    org_services.create_delegation(
        actor=world.hr_user,
        manager=world.manager,
        delegate=world.peer,
        start_date=date(2026, 11, 9),
        end_date=date(2026, 11, 13),
    )

    assert client_for(world.manager_user).get(URL).json()["delegation"] is None


def test_today_is_the_tunis_date(world, client_for):
    approved(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
    )
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.remote,
        start=date(2026, 11, 3),
        end=date(2026, 11, 3),
    )

    # 23:30 UTC on 2 November is 00:30 on 3 November in Tunis.
    with time_machine.travel(datetime(2026, 11, 2, 23, 30, tzinfo=UTC), tick=False):
        body = client_for(world.manager_user).get(URL).json()

    assert names(body) == [org_selectors.full_name(world.peer)]
    assert body["who_is_out"][0]["today"] is True
    assert presence(body, world.peer)["today"] == "remote"
    assert presence(body, world.owner)["today"] == "in"


def test_an_hourly_permission_never_makes_someone_out_whatever_its_label(world, client_for):
    # A type counted in hours that HR labelled "absent" is a few hours away, not a day out.
    world.permission.calendar_label = "absent"
    world.permission.save(update_fields=["calendar_label"])
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.permission,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
        start_time=time(9, 0),
        end_time=time(10, 0),
    )

    body = client_for(world.manager_user).get(URL).json()

    assert body["who_is_out"] == []
    assert presence(body, world.peer)["today"] == "in"


def test_a_sick_leave_waiting_for_hr_counts_as_away_and_says_so(world, client_for):
    # Declared this morning: the manager is told, and the request waits for HR (PRD 6.5, master D52).
    send(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 3),
    )
    # Any other request that still waits does not count.
    send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
    )

    body = client_for(world.manager_user).get(URL).json()

    assert names(body) == [org_selectors.full_name(world.peer)]
    [peer] = body["who_is_out"]
    assert (peer["type_name"], peer["today"], peer["waiting"]) == (world.sick.name_fr, True, True)
    assert presence(body, world.peer)["today"] == "absent"
    assert presence(body, world.peer)["waiting"] is True
    assert presence(body, world.owner)["today"] == "in"
    assert presence(body, world.owner)["waiting"] is False


def test_an_approved_absence_today_is_not_marked_waiting_beside_a_waiting_sick_leave(world, client_for):
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.annual,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
        ends_at_midday=True,
    )
    send(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
        starts_at_midday=True,
    )

    body = client_for(world.manager_user).get(URL).json()

    assert [person["waiting"] for person in body["who_is_out"]] == [False, True]
    assert presence(body, world.peer) == {**presence(body, world.peer), "today": "absent", "waiting": False}


def test_a_waiting_sick_leave_counts_nobody_on_a_day_off(world, client_for):
    send(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 6),
        end=date(2026, 11, 9),
    )

    saturday = datetime(2026, 11, 7, 8, 0, tzinfo=ZoneInfo("Africa/Tunis"))
    with time_machine.travel(saturday, tick=False):
        body = client_for(world.manager_user).get(URL).json()

    assert presence(body, world.peer) == {**presence(body, world.peer), "today": "in", "waiting": False}
    [peer] = body["who_is_out"]
    assert (peer["today"], peer["waiting"]) == (False, True)


def test_a_team_with_nobody_away(world, client_for):
    body = client_for(world.manager_user).get(URL).json()

    assert body["who_is_out"] == [] and body["delegation"] is None
    assert [person["today"] for person in body["people"]] == ["in", "in"]


def test_home_team_is_for_managers(world, client_for, anon_client):
    assert client_for(world.exec_user).get(URL).status_code == 200  # the CEO manages the managers
    assert client_for(world.owner_user).get(URL).status_code == 403
    assert client_for(world.hr_user).get(URL).status_code == 403
    assert client_for(world.sysadmin_user).get(URL).status_code == 403
    assert anon_client.get(URL).status_code == 401
