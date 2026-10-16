import datetime as dt
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from apps.accounts.services import display_name
from apps.calendar import services as calendar_services
from apps.requests import selectors, services
from apps.requests.services import StepSpec, compute_quantity
from apps.requests.tests.helpers import (
    FRI,
    MON,
    NEXT_MON,
    NOW,
    THU,
    TODAY,
    TUE,
    WED,
    approved,
    days,
    decide,
    fresh,
    hours,
    pdf,
    pending_step,
    submitted,
)
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db

NOVEMBER = (dt.date(2026, 11, 1), dt.date(2026, 11, 30))


def rows(**options):
    options.setdefault("start", NOVEMBER[0])
    options.setdefault("end", NOVEMBER[1])
    options.setdefault("statuses", ["approved"])
    return selectors.day_rows(**options)


# ------------------------------------------------------------------ day_rows


def test_day_rows_give_one_row_per_working_day_with_its_portion(world):
    request = approved(world, data=days(FRI, NEXT_MON, starts_at_midday=True))
    found = rows()
    assert [(row.day, row.portion, row.hours) for row in found] == [
        (FRI, Decimal("0.5"), None),
        (NEXT_MON, Decimal("1"), None),
    ]
    first = found[0]
    assert (first.request_id, first.request_public_id, first.employee_id, first.type_code, first.status) == (
        request.pk,
        str(request.public_id),
        world.owner.pk,
        "annual",
        "approved",
    )


def test_day_rows_are_clipped_to_the_period(world):
    approved(world, data=days(dt.date(2026, 11, 30), dt.date(2026, 12, 2)))
    assert [row.day for row in rows()] == [dt.date(2026, 11, 30)]
    december = rows(start=dt.date(2026, 12, 1), end=dt.date(2026, 12, 31))
    assert [row.day for row in december] == [dt.date(2026, 12, 1), dt.date(2026, 12, 2)]


def test_day_rows_filter_by_status_employee_and_type(world):
    approved(world, data=days(MON))
    pending = submitted(world, employee=world.peer, request_type=world.remote, data=days(TUE))
    assert [row.employee_id for row in rows()] == [world.owner.pk]
    both = rows(statuses=["approved", "pending"])
    assert [(row.day, row.type_code, row.status) for row in both] == [
        (MON, "annual", "approved"),
        (TUE, "remote", "pending"),
    ]
    assert rows(statuses=["approved", "pending"], employee_ids=[world.peer.pk])[0].request_id == pending.pk
    assert [row.type_code for row in rows(statuses=["approved", "pending"], type_codes=["remote"])] == [
        "remote"
    ]


def test_an_hourly_permission_is_one_row_with_its_hours(world):
    approved(world, request_type=world.permission, data=hours(WED, "09:00", "10:30"))
    (row,) = rows()
    assert (row.day, row.portion, row.hours, row.type_code) == (
        WED,
        Decimal("0"),
        Decimal("1.50"),
        "permission",
    )


# ------------------------------------------------------------------ reserved_days


def test_pending_annual_leave_is_reserved_day_by_day(world):
    submitted(world, data=days(MON, TUE, ends_at_midday=True))
    assert selectors.reserved_days(world.owner.pk) == {MON: Decimal("1"), TUE: Decimal("0.5")}
    assert selectors.reserved_days(world.peer.pk) == {}


def test_only_pending_requests_of_deducting_types_reserve(world):
    kept = submitted(world, data=days(MON))
    submitted(world, request_type=world.remote, data=days(TUE))
    returned = submitted(world, data=days(WED))
    decide(returned, world.manager_user, "return", "À revoir")
    approved(world, data=days(THU))
    assert selectors.reserved_days(world.owner.pk) == {MON: Decimal("1")}
    assert selectors.reserved_days(world.owner.pk, ignoring_request_id=kept.pk) == {}


def test_a_pending_change_reserves_only_the_days_it_adds(world):
    request = approved(world, data=days(MON, TUE))
    services.open_amendment(
        actor=world.owner_user, request=request, kind="change", data=days(MON, WED), reason="Un jour de plus"
    )
    assert selectors.reserved_days(world.owner.pk) == {WED: Decimal("1")}
    assert selectors.reserved_days(world.owner.pk, ignoring_request_id=request.pk) == {}


def test_the_days_held_by_several_people_are_read_at_once(world):
    submitted(world, data=days(MON, TUE, ends_at_midday=True))
    changed = approved(world, employee=world.peer, data=days(MON, TUE))
    services.open_amendment(
        actor=world.peer_user, request=changed, kind="change", data=days(MON, WED), reason="Un jour de plus"
    )
    wanted = [world.owner.pk, world.peer.pk, world.outsider.pk]

    with CaptureQueriesContext(connection) as queries:
        held = selectors.reserved_days_by_employee(wanted)

    # One read of the requests and one of the changes for everybody (counting days reads the holidays).
    read = [query["sql"].split(" FROM ", 1)[1].split()[0] for query in queries.captured_queries]
    assert read.count('"requests_request"') == 1
    assert read.count('"requests_amendment"') == 1

    assert held == {pk: selectors.reserved_days(pk) for pk in wanted}
    assert held[world.peer.pk] == {WED: Decimal("1")}
    assert held[world.outsider.pk] == {}


def test_a_pending_cancellation_reserves_nothing(world):
    request = approved(world, data=days(MON, TUE))
    services.open_amendment(
        actor=world.owner_user, request=request, kind="cancel", data=None, reason="Annulé"
    )
    assert selectors.reserved_days(world.owner.pk) == {}


# ------------------------------------------------------------------ waiting and certificates


def test_waiting_rows_say_who_is_waited_for_and_since_when(world, clock):
    first = submitted(world, data=days(MON))
    clock.shift(3600)
    second = submitted(world, employee=world.outsider, data=days(MON))
    found = selectors.waiting_rows()
    assert [row.request.pk for row in found] == [first.pk, second.pk]
    assert (found[0].waiting_on, found[0].since, found[0].reminded_at, found[0].flagged_at) == (
        [display_name(world.manager_user)],
        NOW,
        None,
        None,
    )
    assert [row.request.pk for row in selectors.waiting_rows(employee_ids=[world.outsider.pk])] == [second.pk]


def test_outstanding_certificates_with_how_late_they_are(world, clock):
    late = submitted(world, request_type=world.sick, data=days(TODAY))
    covered = submitted(world, employee=world.peer, request_type=world.sick, data=days(TODAY))
    services.attach_file(actor=world.peer_user, request=covered, upload=pdf())
    (row,) = selectors.outstanding_certificates()
    assert (row.request.pk, row.due_at, row.overdue) == (late.pk, NOW + dt.timedelta(hours=48), None)
    clock.shift(dt.timedelta(hours=50))
    (row,) = selectors.outstanding_certificates()
    assert row.overdue == dt.timedelta(hours=2)
    assert selectors.outstanding_certificates(employee_ids=[world.peer.pk]) == []


def test_the_scan_of_a_signed_form_is_not_a_certificate(world):
    services.replace_steps(
        actor=world.hr_user,
        request_type=world.sick,
        steps=[StepSpec(approver_rule="line_manager"), StepSpec(approver_rule="hr_role")],
    )
    request = submitted(world, request_type=world.sick, data=days(TODAY))
    services.record_on_behalf(
        actor=world.hr_user,
        step=pending_step(request),
        decided_by=world.manager,
        decision="approve",
        decided_at=NOW,
        channel="paper",
        note="Formulaire signé",
        scan=pdf("formulaire.pdf"),
        expected_version=request.version,
    )
    assert [row.request.pk for row in selectors.outstanding_certificates()] == [request.pk]
    assert [step.request_id for step in selectors.queue(world.hr_user, "certificates")] == [request.pk]
    assert (
        selectors.certificate_status(selectors.get_request_for(world.hr_user, str(request.public_id)))
        == "due"
    )


def test_public_ids(world):
    request = submitted(world)
    assert selectors.public_ids([request.pk, 999999]) == {request.pk: str(request.public_id)}


# ------------------------------------------------------------------ configuration changed later (master D22)


def test_holiday_added_later_is_reported_not_applied(world, client_for):
    request = approved(world, data=days(MON, WED))
    pending = submitted(world, employee=world.peer, data=days(TUE))
    calendar_services.create_holiday(actor=world.hr_user, date=TUE, name_fr="Férié", name_en="Holiday")

    assert fresh(request).quantity == Decimal("3.00")  # the approved request is not rewritten
    assert compute_quantity(world.annual, days(MON, WED)) == Decimal("2.00")  # a new one counts the holiday
    assert [found.pk for found in selectors.requests_touching(TUE)] == [
        request.pk
    ]  # pending ones are not listed

    response = client_for(world.hr_user).get(reverse("calendar:holiday-impact"), {"date": "2026-11-03"})
    assert response.status_code == 200
    assert response.json() == [
        {
            "public_id": str(request.public_id),
            "employee": "Amal Employee",
            "type": response.json()[0]["type"],
            "start_date": "2026-11-02",
            "end_date": "2026-11-04",
            "quantity": "3.00",
        }
    ]
    assert pending.status == "pending"
    bad = client_for(world.hr_user).get(reverse("calendar:holiday-impact"), {"date": "tuesday"})
    assert (bad.status_code, bad.json()["code"]) == (400, "calendar.date_required")
    assert (
        client_for(world.manager_user)
        .get(reverse("calendar:holiday-impact"), {"date": "2026-11-03"})
        .status_code
        == 403
    )


def test_changing_the_working_week_does_not_rewrite_requests_already_sent(world):
    request = submitted(world, data=days(FRI, NEXT_MON))
    settings_service.set_value(actor=world.hr_user, key="working_week", value=[1, 2, 3, 4, 5, 6])
    assert fresh(request).quantity == Decimal("2.00")
    assert compute_quantity(world.annual, days(FRI, NEXT_MON)) == Decimal("3.00")
