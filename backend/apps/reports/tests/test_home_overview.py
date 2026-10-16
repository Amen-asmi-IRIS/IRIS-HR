from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
import time_machine
from django.urls import reverse

from apps.organisation import selectors as org_selectors
from tests.request_flows import NOW, approved, give_balance, send

pytestmark = pytest.mark.django_db

URL = reverse("reports:home-overview")


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def by_department(lines):
    return {line["department"]: line for line in lines}


def test_out_now_groups_people_by_department_with_labels_only(world, client_for):
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
        employee=world.outsider,
        user=world.outsider_user,
        request_type=world.remote,
        start=date(2026, 11, 5),
        end=date(2026, 11, 5),
    )

    response = client_for(world.exec_user).get(URL)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"out_now", "absence_this_month", "leave_owed", "waiting"}
    out = by_department(body["out_now"])
    assert set(out) == {world.dept_a.name_fr, world.dept_b.name_fr}
    peer = {
        "name": org_selectors.full_name(world.peer),
        "label": "absent",
        "start_date": "2026-11-02",
        "end_date": "2026-11-03",
        "waiting": False,
    }
    assert out[world.dept_a.name_fr]["today"] == [peer]
    assert out[world.dept_a.name_fr]["week"] == [peer]
    assert out[world.dept_b.name_fr]["today"] == []
    assert out[world.dept_b.name_fr]["week"] == [
        {
            "name": org_selectors.full_name(world.outsider),
            "label": "remote",
            "start_date": "2026-11-05",
            "end_date": "2026-11-05",
            "waiting": False,
        },
    ]


def test_nobody_is_out_today_on_a_day_off(world, client_for):
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
        out = by_department(client_for(world.exec_user).get(URL).json()["out_now"])

    assert out[world.dept_a.name_fr]["today"] == []
    assert [person["name"] for person in out[world.dept_a.name_fr]["week"]] == [
        org_selectors.full_name(world.peer)
    ]


def test_out_now_is_empty_when_everybody_is_in(world, client_for):
    assert client_for(world.exec_user).get(URL).json()["out_now"] == []


def test_a_sick_leave_waiting_for_hr_is_out_now_and_says_so(world, client_for):
    send(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
        comment="Migraine",
    )
    # Any other request that still waits does not count.
    send(
        world,
        employee=world.outsider,
        user=world.outsider_user,
        request_type=world.annual,
        start=date(2026, 11, 3),
        end=date(2026, 11, 3),
    )

    response = client_for(world.exec_user).get(URL)

    out = by_department(response.json()["out_now"])
    waiting = {
        "name": org_selectors.full_name(world.peer),
        "label": "absent",
        "start_date": "2026-11-02",
        "end_date": "2026-11-02",
        "waiting": True,
    }
    assert set(out) == {world.dept_a.name_fr}
    assert out[world.dept_a.name_fr]["today"] == [waiting]
    assert out[world.dept_a.name_fr]["week"] == [waiting]  # a label and the mark, no type
    assert "migraine" not in response.content.decode().lower()


def test_an_hourly_permission_is_not_out_now_whatever_its_label(world, client_for):
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

    assert client_for(world.exec_user).get(URL).json()["out_now"] == []


def test_absence_this_month_counts_working_days_of_absence_per_department(world, client_for):
    approved(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 3),
    )  # 2 days, department A
    approved(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.sick,
        start=date(2026, 10, 28),
        end=date(2026, 10, 29),
    )  # 2 days last month, A
    approved(
        world,
        employee=world.outsider,
        user=world.outsider_user,
        request_type=world.sick,
        start=date(2026, 11, 4),
        end=date(2026, 11, 4),
        ends_at_midday=True,
    )  # half a day, B
    approved(
        world,
        employee=world.outsider,
        user=world.outsider_user,
        request_type=world.remote,
        start=date(2026, 11, 5),
        end=date(2026, 11, 5),
    )  # remote is not absence

    lines = by_department(client_for(world.exec_user).get(URL).json()["absence_this_month"])

    assert set(lines) == {world.dept_a.name_fr, world.dept_b.name_fr}
    assert Decimal(lines[world.dept_a.name_fr]["days"]) == Decimal("2")
    assert Decimal(lines[world.dept_a.name_fr]["previous_days"]) == Decimal("2")
    assert Decimal(lines[world.dept_b.name_fr]["days"]) == Decimal("0.5")
    assert Decimal(lines[world.dept_b.name_fr]["previous_days"]) == Decimal("0")


def test_previous_month_in_january(world, client_for):
    january = datetime(2027, 1, 4, 8, 0, tzinfo=ZoneInfo("Africa/Tunis"))  # a Monday
    with time_machine.travel(january, tick=False):
        approved(
            world,
            employee=world.peer,
            user=world.peer_user,
            request_type=world.sick,
            start=date(2026, 12, 28),
            end=date(2026, 12, 29),
        )
        lines = by_department(client_for(world.exec_user).get(URL).json()["absence_this_month"])

    assert Decimal(lines[world.dept_a.name_fr]["days"]) == Decimal("0")
    assert Decimal(lines[world.dept_a.name_fr]["previous_days"]) == Decimal("2")


def test_leave_owed_totals_departments_and_names_the_largest_balances(world, client_for):
    give_balance(world, world.owner, "20")
    give_balance(world, world.peer, "5")
    give_balance(world, world.outsider, "12")

    owed = client_for(world.exec_user).get(URL).json()["leave_owed"]

    totals = by_department(owed["departments"])
    assert Decimal(totals[world.dept_a.name_fr]["total"]) == Decimal("25")
    assert Decimal(totals[world.dept_b.name_fr]["total"]) == Decimal("12")
    assert [(person["name"], Decimal(person["balance"])) for person in owed["largest"]] == [
        (org_selectors.full_name(world.owner), Decimal("20")),
        (org_selectors.full_name(world.outsider), Decimal("12")),
        (org_selectors.full_name(world.peer), Decimal("5")),
    ]
    assert owed["largest"][0]["department"] == world.dept_a.name_fr


def test_waiting_lists_the_oldest_undecided_requests_first(world, client_for):
    oldest = send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 17),
        end=date(2026, 11, 18),
    )
    with time_machine.travel(NOW + timedelta(days=1), tick=False):
        newer = send(
            world,
            employee=world.peer,
            user=world.peer_user,
            request_type=world.annual,
            start=date(2026, 11, 24),
            end=date(2026, 11, 24),
        )
        waiting = client_for(world.exec_user).get(URL).json()["waiting"]

    assert [line["request_public_id"] for line in waiting] == [str(oldest.public_id), str(newer.public_id)]
    first = waiting[0]
    assert set(first) == {"request_public_id", "employee_name", "type_name", "waiting_on", "since"}
    assert first["employee_name"] == org_selectors.full_name(world.owner)
    assert first["type_name"] == world.annual.name_fr
    assert first["waiting_on"] == [org_selectors.full_name(world.manager)]


def test_waiting_holds_at_most_five_lines(world, client_for):
    for day in (3, 4, 5, 6, 9, 10):
        send(
            world,
            employee=world.owner,
            user=world.owner_user,
            request_type=world.remote,
            start=date(2026, 11, day),
            end=date(2026, 11, day),
            starts_at_midday=True,
        )

    assert len(client_for(world.exec_user).get(URL).json()["waiting"]) == 5


def test_the_overview_carries_no_medical_detail(world, client_for):
    send(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 3),
        comment="Severe migraine, doctor at 3pm",
    )

    response = client_for(world.exec_user).get(URL)

    text = response.content.decode()
    assert "migraine" not in text.lower()
    assert "comment" not in text
    assert response.json()["waiting"][0]["type_name"] == world.sick.name_fr


def test_home_overview_is_for_executives_only(world, client_for, anon_client):
    for user in (world.hr_user, world.manager_user, world.owner_user, world.sysadmin_user):
        assert client_for(user).get(URL).status_code == 403
    assert anon_client.get(URL).status_code == 401
