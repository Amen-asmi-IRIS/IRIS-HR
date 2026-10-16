"""The demo data of plans 03a and 04 gives the calendar and the homes something to show.

The browser journeys of this plan rely on it; this test says so before a browser does."""

import pytest
import time_machine
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.urls import reverse

from tests.request_flows import NOW

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def frozen_clock():
    # A Monday with no holiday in the three weeks that follow.
    with time_machine.travel(NOW, tick=False):
        yield


def account(name):
    return get_user_model().objects.get(email=f"{name}@impactrisks.com")


def test_the_demo_data_feeds_the_calendar_and_the_homes(client_for):
    call_command("seed_demo")
    employee, manager, ceo = account("employee.a1"), account("manager.a"), account("ceo")

    home = client_for(employee).get(reverse("reports:home-me")).json()
    assert [request["type"]["code"] for request in home["in_progress"]] == ["annual"]
    assert [request["type"]["code"] for request in home["coming_up"]] == ["remote"]

    team = client_for(manager).get(reverse("reports:home-team")).json()
    # employee.a2's sick leave of today, waiting for HR (master D52); employee.a1, remote on Thursday.
    assert [(person["label"], person["waiting"]) for person in team["who_is_out"]] == [
        ("absent", True),
        ("remote", False),
    ]
    assert len(team["people"]) == 2

    overview = client_for(ceo).get(reverse("reports:home-overview")).json()
    assert len(overview["waiting"]) == 3
    assert len(overview["absence_this_month"]) >= 2

    # What the privacy journey looks at: the manager's approved leave, seen by a member of the department.
    november = {"from": "2026-11-01", "to": "2026-11-30", "scope": "department"}
    colleagues = [
        entry
        for entry in client_for(employee).get(reverse("calendar:feed"), november).json()["entries"]
        if not entry["mine"]
    ]
    assert [(entry["label"], entry["type_code"], entry["start_date"]) for entry in colleagues] == [
        ("absent", None, "2026-11-23"),
    ]
    # And its type, seen by the manager's own manager.
    team_feed = client_for(ceo).get(reverse("calendar:feed"), {**november, "scope": "team"}).json()
    assert ("annual", "2026-11-23") in [
        (entry["type_code"], entry["start_date"]) for entry in team_feed["entries"]
    ]

    assert client_for(manager).get(reverse("reports:workspace-summary")).json()["team"] == 1
