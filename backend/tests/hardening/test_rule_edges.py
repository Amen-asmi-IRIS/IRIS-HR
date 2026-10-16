"""Review focus 1, 2, 5 and 6, followed through requests, ledger, reports and the KPMG file."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO

import openpyxl
import pytest
from django.urls import reverse

from apps.balances import selectors as balance_selectors
from apps.balances import services as balance_services
from apps.balances.models import LedgerEntry
from apps.calendar import services as calendar_services
from apps.organisation import selectors as organisation_selectors
from apps.organisation import services as organisation_services
from apps.organisation.models import Employee
from apps.requests import selectors as request_selectors
from apps.requests.models import RequestStatus, RequestStep
from apps.settings import services as settings_service
from tests.hardening.helpers import approve_fully, decide, give_balance, make_request

SAT, SUN, MON, TUE, WED = (date(2026, 11, d) for d in (14, 15, 16, 17, 18))


def _preview(client, **fields):
    body = {
        "type": "remote",
        "start_date": None,
        "end_date": None,
        "starts_at_midday": False,
        "ends_at_midday": False,
        "start_time": None,
        "end_time": None,
        "exceptional_event": None,
        "override": False,
    }
    body.update(
        {key: (value.isoformat() if isinstance(value, date) else value) for key, value in fields.items()}
    )
    response = client.post(reverse("requests:request-preview"), body, format="json")
    assert response.status_code == 200, response.content
    return response.json()


def _codes(preview) -> set[str]:
    return {problem["code"] for problem in preview["problems"]}


# ---------------------------------------------------------------- focus 1: boundaries


@pytest.mark.django_db
def test_a_weekend_inside_a_request_is_not_counted(world, client_for, frozen):
    preview = _preview(client_for(world.owner_user), start_date=SAT, end_date=MON)
    assert preview["quantity"] == "1.00"
    assert preview["problems"] == []
    assert {(row["date"], row["reason"]) for row in preview["skipped_days"]} == {
        ("2026-11-14", "weekend"),
        ("2026-11-15", "weekend"),
    }


@pytest.mark.django_db
def test_a_half_day_on_a_saturday_is_refused_with_its_own_message(world, client_for, frozen):
    preview = _preview(client_for(world.owner_user), start_date=SAT, end_date=MON, starts_at_midday=True)
    assert "request.half_day_on_non_working_day" in _codes(preview)


@pytest.mark.django_db
def test_a_single_day_flagged_at_both_ends_is_refused(world, client_for, frozen):
    client = client_for(world.owner_user)
    preview = _preview(client, start_date=MON, end_date=MON, starts_at_midday=True, ends_at_midday=True)
    assert preview["problems"], "a day that is both afternoon-only and morning-only must be refused"
    assert all(code.startswith("request.") for code in _codes(preview))

    body = {
        "type": "remote",
        "start_date": "2026-11-16",
        "end_date": "2026-11-16",
        "starts_at_midday": True,
        "ends_at_midday": True,
        "start_time": None,
        "end_time": None,
        "exceptional_event": None,
        "comment": "",
    }
    created = client.post(reverse("requests:request-list"), body, format="json")
    if created.status_code == 201:  # a draft may be saved; it must not be sendable
        draft = created.json()
        sent = client.post(
            reverse("requests:request-submit", kwargs={"public_id": draft["public_id"]}),
            {"version": draft["version"]},
            format="json",
        )
        assert sent.status_code == 400
    else:
        assert created.status_code == 400


@pytest.mark.django_db
def test_a_request_of_only_non_working_days_is_refused(world, client_for, frozen):
    preview = _preview(client_for(world.owner_user), start_date=SAT, end_date=SUN)
    assert "request.no_working_day" in _codes(preview)


@pytest.mark.django_db
def test_a_holiday_at_the_end_is_skipped_and_cannot_carry_a_half_day(world, client_for, frozen):
    calendar_services.create_holiday(
        actor=world.hr_user, date=TUE, name_fr="Jour férié", name_en="Public holiday"
    )
    client = client_for(world.owner_user)

    preview = _preview(client, start_date=MON, end_date=TUE)
    assert preview["quantity"] == "1.00"
    assert ("2026-11-17", "holiday") in {(row["date"], row["reason"]) for row in preview["skipped_days"]}

    preview = _preview(client, start_date=MON, end_date=TUE, ends_at_midday=True)
    assert "request.half_day_on_non_working_day" in _codes(preview)


@pytest.mark.django_db
def test_morning_and_afternoon_of_one_day_can_hold_two_different_requests(world, client_for, frozen):
    give_balance(world, world.owner, "5")
    morning = make_request(
        world,
        user=world.owner_user,
        employee=world.owner,
        request_type=world.annual,
        start=MON,
        end=MON,
        ends_at_midday=True,
    )
    afternoon = make_request(
        world,
        user=world.owner_user,
        employee=world.owner,
        request_type=world.remote,
        start=MON,
        end=MON,
        starts_at_midday=True,
    )
    assert morning.quantity == Decimal("0.5") and afternoon.quantity == Decimal("0.5")
    preview = _preview(client_for(world.owner_user), start_date=MON, end_date=MON, ends_at_midday=True)
    assert "request.overlap" in _codes(preview)


# ---------------------------------------------------------------- focus 2: crossing a boundary


def _kpmg_row(client, world, start: str, end: str) -> list:
    response = client.get(reverse("reports:kpmg-export"), {"from": start, "to": end})
    assert response.status_code == 200, response.content
    body = b"".join(response.streaming_content) if getattr(response, "streaming", False) else response.content
    sheet = openpyxl.load_workbook(BytesIO(body), read_only=True).worksheets[0]
    for row in sheet.iter_rows(values_only=True):
        if str(row[0]) == str(world.owner.employee_number):
            return list(row)
    raise AssertionError("the owner is missing from the KPMG file")


def _owner_total(client, world, start: str, end: str) -> Decimal:
    """Sum of the first numeric column of the absence report over the owner's rows."""
    report = client.get(
        reverse("reports:report", kwargs={"name": "absences"}), {"from": start, "to": end}
    ).json()
    number_key = next(column["key"] for column in report["columns"] if column["kind"] == "number")
    name = organisation_selectors.full_name(world.owner)
    rows = [row for row in report["rows"] if any(name in str(value) for value in row.values())]
    return sum((Decimal(str(row[number_key])) for row in rows), Decimal("0"))


@pytest.mark.django_db
def test_leave_across_the_new_year_is_split_everywhere(world, client_for, frozen):
    """28 December 2026 to 6 January 2027: 4 working days in December, 3 in January."""
    calendar_services.create_holiday(
        actor=world.hr_user,
        date=date(2027, 1, 1),
        name_fr="Jour de l'an",
        name_en="New Year's Day",
        recurs_yearly=True,
    )
    give_balance(world, world.owner, "20")
    request = make_request(
        world,
        user=world.owner_user,
        employee=world.owner,
        request_type=world.annual,
        start=date(2026, 12, 28),
        end=date(2027, 1, 6),
    )
    assert request.quantity == Decimal("7")
    request = approve_fully(world, request)
    assert request.status == RequestStatus.APPROVED

    # Ledger: one entry per month, dated the first leave day of the month (PRD 6.3).
    taken = list(
        LedgerEntry.objects.filter(employee=world.owner, kind="taken")
        .order_by("effective_date")
        .values_list("effective_date", "amount")
    )
    assert taken == [(date(2026, 12, 28), Decimal("-4")), (date(2027, 1, 4), Decimal("-3"))]
    assert balance_selectors.balance_on(world.owner.id, date(2026, 12, 27)) == Decimal("20")
    assert balance_selectors.balance_on(world.owner.id, date(2026, 12, 31)) == Decimal("16")
    assert balance_selectors.balance_on(world.owner.id, date(2027, 1, 31)) == Decimal("13")
    assert balance_selectors.balances_at(date(2026, 12, 31), employee_ids=[world.owner.id]) == {
        world.owner.id: Decimal("16")
    }

    # Day rows clipped to each month (the basis of reports and export).
    def portions(start, end):
        rows = request_selectors.day_rows(
            start=start, end=end, statuses=["approved"], employee_ids=[world.owner.id]
        )
        return sum((row.portion for row in rows), Decimal("0"))

    assert portions(date(2026, 12, 1), date(2026, 12, 31)) == Decimal("4")
    assert portions(date(2027, 1, 1), date(2027, 1, 31)) == Decimal("3")

    hr = client_for(world.hr_user)
    assert _owner_total(hr, world, "2026-12-01", "2026-12-31") == Decimal("4")
    assert _owner_total(hr, world, "2027-01-01", "2027-01-31") == Decimal("3")

    # KPMG file, columns of REP-04: number, name, department, annual, sick, exceptional,
    # permission hours, remote days, balance at period end, meal tickets.
    december = _kpmg_row(hr, world, "2026-12-01", "2026-12-31")
    january = _kpmg_row(hr, world, "2027-01-01", "2027-01-31")
    assert Decimal(str(december[3])) == Decimal("4") and Decimal(str(january[3])) == Decimal("3")
    assert Decimal(str(december[8])) == Decimal("16") and Decimal(str(january[8])) == Decimal("13")
    assert int(december[9]) == 21 - 4 and int(january[9]) == 21 - 3


@pytest.mark.django_db
def test_cancelling_split_leave_restores_each_month(world, client_for, frozen):
    give_balance(world, world.owner, "20")
    request = approve_fully(
        world,
        make_request(
            world,
            user=world.owner_user,
            employee=world.owner,
            request_type=world.annual,
            start=date(2026, 11, 30),
            end=date(2026, 12, 2),
        ),
    )
    response = client_for(world.hr_user).post(
        reverse("requests:request-cancel", kwargs={"public_id": request.public_id}),
        {"reason": "Project deadline moved"},
        format="json",
    )
    assert response.status_code == 200
    taken = list(
        LedgerEntry.objects.filter(employee=world.owner, kind="taken")
        .order_by("effective_date")
        .values_list("effective_date", "amount")
    )
    assert taken == [(date(2026, 11, 30), Decimal("-1")), (date(2026, 12, 1), Decimal("-2"))]
    restored = sorted(
        LedgerEntry.objects.filter(employee=world.owner, kind="restored").values_list("amount", flat=True)
    )
    assert restored == [Decimal("1"), Decimal("2")]  # one restoration per month, mirroring the two entries
    assert balance_selectors.balance_on(world.owner.id, date(2026, 12, 31)) == Decimal("20")
    assert LedgerEntry.objects.filter(employee=world.owner).count() == 5  # nothing edited or deleted (BAL-01)


# ---------------------------------------------------------------- focus 5: configuration mid-flight


@pytest.mark.django_db
def test_changing_configuration_does_not_touch_requests_already_sent(world, client_for, frozen):
    give_balance(world, world.peer, "20")
    pending = make_request(
        world, user=world.owner_user, employee=world.owner, request_type=world.remote, start=MON, end=MON
    )
    approved = approve_fully(
        world,
        make_request(
            world, user=world.peer_user, employee=world.peer, request_type=world.annual, start=MON, end=WED
        ),
    )
    steps_before = list(
        RequestStep.objects.filter(request=pending)
        .order_by("position")
        .values_list("position", "approver_rule", "mode", "status")
    )
    ledger_before = list(LedgerEntry.objects.filter(employee=world.peer).values_list("kind", "amount"))

    hr = client_for(world.hr_user)
    one_step = {
        "steps": [
            {
                "approver_rule": "hr_role",
                "named_person": None,
                "mode": "approve",
                "reminder_after_days": 1,
                "flag_after_days": 1,
            }
        ]
    }
    assert (
        hr.put(
            reverse("requests:type-steps", kwargs={"pk": world.remote.id}), one_step, format="json"
        ).status_code
        == 200
    )
    assert (
        hr.patch(
            reverse("requests:type-detail", kwargs={"pk": world.remote.id}),
            {"cap_quantity": "0.50", "is_active": False},
            format="json",
        ).status_code
        == 200
    )
    calendar_services.create_holiday(
        actor=world.hr_user, date=TUE, name_fr="Jour férié", name_en="Public holiday"
    )
    settings_service.set_value(actor=world.hr_user, key="working_week", value=[1, 2, 3, 4])

    # The pending request keeps the chain it was sent with (REQ-04) and still completes.
    assert (
        list(
            RequestStep.objects.filter(request=pending)
            .order_by("position")
            .values_list("position", "approver_rule", "mode", "status")
        )
        == steps_before
    )
    done = decide(decide(pending, world.manager_user), world.hr_user)
    assert done.status == RequestStatus.APPROVED

    # The approved leave keeps its quantity and its ledger entries (master decision D22).
    approved.refresh_from_db()
    assert approved.quantity == Decimal("3")
    assert (
        list(LedgerEntry.objects.filter(employee=world.peer).values_list("kind", "amount")) == ledger_before
    )

    # HR is shown the approved request that the new holiday touches.
    impact = hr.get(reverse("calendar:holiday-impact"), {"date": "2026-11-17"})
    assert str(approved.public_id) in impact.content.decode()

    # New requests follow the new configuration.
    body = {
        "type": "remote",
        "start_date": "2026-11-23",
        "end_date": "2026-11-23",
        "starts_at_midday": False,
        "ends_at_midday": False,
        "start_time": None,
        "end_time": None,
        "exceptional_event": None,
        "comment": "",
    }
    refused = client_for(world.outsider_user).post(reverse("requests:request-list"), body, format="json")
    assert refused.status_code == 400, "a deactivated type must refuse new requests"


# ---------------------------------------------------------------- focus 6: the clock


def _credits(**filters):
    return LedgerEntry.objects.filter(kind="credit", **filters)


@pytest.mark.django_db
def test_month_end_credit_catches_up_is_idempotent_and_pro_rates(world, frozen):
    Employee.objects.update(hire_date=date(2020, 1, 1))
    Employee.objects.filter(pk=world.outsider.pk).update(hire_date=date(2027, 2, 8))
    for employee in (world.outsider, world.peer):
        employee.refresh_from_db()
    settings_service.set_value(actor=world.hr_user, key="credit_start_date", value="2026-11-01")

    # Nothing is posted before the first month end.
    assert balance_services.post_month_end_credits(today=date(2026, 11, 29)) == 0

    # The server was down for three months: November, December and January are posted in one run.
    assert balance_services.post_month_end_credits(today=date(2027, 2, 1)) == 18  # 6 employees x 3 months
    assert set(_credits().values_list("period", flat=True)) == {"2026-11", "2026-12", "2027-01"}
    assert set(_credits().values_list("amount", flat=True)) == {Decimal("2.5")}
    assert set(_credits(period="2026-11").values_list("effective_date", flat=True)) == {date(2026, 11, 30)}
    assert not _credits(employee=world.outsider).exists()  # not hired yet

    # Twice in a day changes nothing.
    assert balance_services.post_month_end_credits(today=date(2027, 2, 1)) == 0
    assert _credits().count() == 18

    # The peer leaves on 10 March 2027.
    frozen.move_to(datetime(2027, 3, 10, 8, 0, tzinfo=UTC))
    organisation_services.archive_employee(
        actor=world.hr_user, employee=world.peer, leaving_date=date(2027, 3, 10), reason="Resignation"
    )
    world.peer.refresh_from_db()

    # February has 28 days: hired on the 8th means 21 days, 2.5 x 21 / 28 = 1.875, rounded to 2.0.
    assert balance_services.month_credit(world.outsider, 2027, 2) == Decimal("2.0")
    # March: 10 days of 31, 2.5 x 10 / 31 = 0.81, rounded to 1.0. April: nothing.
    assert balance_services.month_credit(world.peer, 2027, 3) == Decimal("1.0")
    assert balance_services.month_credit(world.peer, 2027, 4) == Decimal("0")

    frozen.move_to(datetime(2027, 5, 1, 8, 0, tzinfo=UTC))
    balance_services.post_month_end_credits(today=date(2027, 5, 1))
    assert _credits(employee=world.outsider, period="2027-02").get().amount == Decimal("2.0")
    assert _credits(employee=world.outsider, period="2027-03").get().amount == Decimal("2.5")
    assert _credits(employee=world.peer, period="2027-03").get().amount == Decimal("1.0")
    assert not _credits(employee=world.peer, period="2027-04").exists()
    assert (
        _credits(period="2027-02").values("employee_id").distinct().count()
        == _credits(period="2027-02").count()
    )


@pytest.mark.django_db
def test_no_credit_is_posted_while_the_start_date_is_empty(world, frozen):
    assert settings_service.get("credit_start_date") is None
    assert balance_services.post_month_end_credits(today=date(2027, 6, 1)) == 0
    assert not _credits().exists()
