from datetime import date
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from apps.balances import selectors, services
from apps.balances.models import LedgerEntry, LedgerKind
from apps.balances.tests import flows
from apps.balances.tests.world import at, give_opening
from apps.calendar.models import PublicHoliday
from apps.core.errors import DomainError
from apps.requests import selectors as request_selectors
from apps.requests import services as request_services
from apps.requests.models import Decision
from apps.requests.services import RequestData

pytestmark = pytest.mark.usefixtures("ledger_port")

SEPT_30 = date(2026, 9, 30)


@pytest.fixture(autouse=True)
def monday_5_october_2026(time_machine):
    """Every test of this file runs on Monday 5 October 2026, 09:00 in Tunis."""
    time_machine.move_to(at(2026, 10, 5), tick=False)


def lines_of(employee, kind) -> list[tuple[date, Decimal]]:
    entries = LedgerEntry.objects.filter(employee=employee, kind=kind)
    return [(entry.effective_date, entry.amount) for entry in entries]


def test_a_request_beyond_the_balance_is_refused_with_the_shortfall(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "2", SEPT_30)

    with pytest.raises(DomainError) as refused:
        flows.send(cast, date(2026, 10, 19), date(2026, 10, 21))

    assert "request.balance_insufficient" in flows.problem_codes(refused.value)
    assert flows.shortfall(refused.value) == Decimal("1")
    assert request_selectors.reserved_days(cast.owner.id) == {}


def test_leave_not_yet_earned_is_accepted_when_earned_by_its_start(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", SEPT_30)

    request = flows.send(cast, date(2026, 12, 7), date(2026, 12, 9))

    assert request.status == "pending"
    assert selectors.figures(cast.owner.id).pending == Decimal("3")


def test_days_held_by_a_pending_request_cannot_be_asked_twice(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "3", SEPT_30)
    flows.send(cast, date(2026, 10, 19), date(2026, 10, 21))

    with pytest.raises(DomainError) as refused:
        flows.send(cast, date(2026, 10, 26), date(2026, 10, 26))

    assert flows.shortfall(refused.value) == Decimal("1")


def test_a_request_that_would_starve_approved_later_leave_is_refused(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "5", SEPT_30)
    flows.approve(cast, flows.send(cast, date(2026, 12, 21), date(2026, 12, 25)))

    with pytest.raises(DomainError) as refused:
        flows.send(cast, date(2026, 11, 16), date(2026, 11, 17))

    assert flows.shortfall(refused.value) == Decimal("2")


def test_final_approval_posts_one_line_per_month(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "12", SEPT_30)

    request = flows.approve(cast, flows.send(cast, date(2026, 12, 28), date(2027, 1, 8)))

    assert request.status == "approved"
    assert lines_of(cast.owner, LedgerKind.TAKEN) == [
        (date(2026, 12, 28), Decimal("-4")),
        (date(2027, 1, 1), Decimal("-6")),
    ]
    assert set(LedgerEntry.objects.filter(kind=LedgerKind.TAKEN).values_list("request_id", flat=True)) == {
        request.id
    }
    figures = selectors.figures(cast.owner.id)
    assert (figures.current, figures.pending, figures.approved_upcoming) == (
        Decimal("12"),
        Decimal("0"),
        Decimal("10"),
    )


def test_hr_can_exceed_the_balance_with_a_reason(cast, ledger_settings):
    ledger_settings()

    request = flows.send(
        cast,
        date(2026, 10, 19),
        date(2026, 10, 21),
        actor=cast.hr_user,
        override_reason="Agreed with the CEO",
    )
    request = flows.approve(cast, request)

    assert request.status == "approved"
    assert selectors.balance_on(cast.owner.id, date(2026, 10, 19)) == Decimal("-3")


def test_the_balance_is_checked_again_at_final_approval(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "3", SEPT_30)
    request = flows.send(cast, date(2026, 10, 19), date(2026, 10, 21))
    services.adjust(
        actor=cast.hr_user,
        employee=cast.owner,
        amount=Decimal("-2"),
        effective_date=date(2026, 10, 6),
        reason="Leave of September never recorded",
    )
    request = flows.decide(cast, request, approver=cast.manager_user, queue="mine")

    with pytest.raises(DomainError) as refused:
        flows.decide(cast, request, approver=cast.hr_user, queue="hr")

    assert flows.shortfall(refused.value) == Decimal("2")
    request.refresh_from_db()
    assert request.status == "pending"
    assert lines_of(cast.owner, LedgerKind.TAKEN) == []


def test_the_employee_is_locked_before_the_ledger_is_read(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "5", SEPT_30)
    draft = flows.draft(cast, date(2026, 10, 19), date(2026, 10, 21))

    with CaptureQueriesContext(connection) as queries:
        request_services.submit(actor=cast.owner_user, request=draft)

    statements = [query["sql"] for query in queries.captured_queries]
    lock = next(
        i for i, sql in enumerate(statements) if "FOR UPDATE" in sql and "organisation_employee" in sql
    )
    read = next(i for i, sql in enumerate(statements) if "balances_ledgerentry" in sql)
    assert lock < read


def test_cancelling_approved_leave_gives_the_days_back(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "5", SEPT_30)
    request = flows.approve(cast, flows.send(cast, date(2026, 11, 2), date(2026, 11, 6)))
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 2)) == Decimal("0")

    request_services.hr_cancel(actor=cast.hr_user, request=request, reason="Project deadline moved")

    assert lines_of(cast.owner, LedgerKind.RESTORED) == [(date(2026, 11, 2), Decimal("5"))]
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 2)) == Decimal("5")
    assert LedgerEntry.objects.get(kind=LedgerKind.RESTORED).reason == "Project deadline moved"


def test_shortening_approved_leave_gives_back_the_released_days(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "5", SEPT_30)
    request = flows.approve(cast, flows.send(cast, date(2026, 11, 2), date(2026, 11, 6)))

    request_services.hr_correct(
        actor=cast.hr_user,
        request=request,
        data=RequestData(start_date=date(2026, 11, 2), end_date=date(2026, 11, 4)),
        reason="Back two days early",
    )

    assert selectors.balance_on(cast.owner.id, date(2026, 11, 2)) == Decimal("2")
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 30)) == Decimal("2")


def test_moving_approved_leave_needs_no_extra_balance(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "2", SEPT_30)
    request = flows.approve(cast, flows.send(cast, date(2026, 11, 2), date(2026, 11, 3)))

    request_services.open_amendment(
        actor=cast.owner_user,
        request=request,
        kind="change",
        data=RequestData(start_date=date(2026, 11, 9), end_date=date(2026, 11, 10)),
        reason="Family event moved",
    )
    # the original stays in force until the change is approved
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 30)) == Decimal("0")
    flows.approve(cast, request)

    assert selectors.balance_on(cast.owner.id, date(2026, 11, 5)) == Decimal("2")
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 10)) == Decimal("0")
    assert (date(2026, 11, 9), Decimal("-2")) in lines_of(cast.owner, LedgerKind.TAKEN)


def test_an_approved_cancellation_gives_the_days_back(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "2", SEPT_30)
    request = flows.approve(cast, flows.send(cast, date(2026, 11, 2), date(2026, 11, 3)))

    request_services.open_amendment(
        actor=cast.owner_user, request=request, kind="cancel", data=None, reason="Trip cancelled"
    )
    flows.approve(cast, request)

    assert selectors.balance_on(cast.owner.id, date(2026, 11, 30)) == Decimal("2")


def test_a_pending_amendment_holds_only_the_days_it_adds(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "3", SEPT_30)
    request = flows.approve(cast, flows.send(cast, date(2026, 11, 2), date(2026, 11, 3)))

    request_services.open_amendment(
        actor=cast.owner_user,
        request=request,
        kind="change",
        data=RequestData(start_date=date(2026, 11, 2), end_date=date(2026, 11, 4)),
        reason="One more day",
    )

    assert request_selectors.reserved_days(cast.owner.id) == {date(2026, 11, 4): Decimal("1")}
    with pytest.raises(DomainError) as refused:
        flows.send(cast, date(2026, 10, 26), date(2026, 10, 26))
    assert flows.shortfall(refused.value) == Decimal("1")


def test_sick_leave_counted_as_annual_leave_is_deducted(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "5", SEPT_30)
    request = flows.send(cast, date(2026, 10, 1), date(2026, 10, 2), request_type=cast.sick)
    assert selectors.figures(cast.owner.id).pending == Decimal("0")

    request = request_services.reclassify_as_annual(actor=cast.hr_user, request=request)
    request = flows.let_hr_finish(cast, request)

    assert request.status == "approved"
    assert lines_of(cast.owner, LedgerKind.TAKEN) == [(date(2026, 10, 1), Decimal("-2"))]
    assert selectors.balance_on(cast.owner.id, date(2026, 10, 5)) == Decimal("3")


def test_counting_sick_leave_as_annual_needs_the_balance_or_a_reason(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "1", SEPT_30)
    request = flows.send(cast, date(2026, 10, 1), date(2026, 10, 2), request_type=cast.sick)

    with pytest.raises(DomainError) as refused:
        request_services.reclassify_as_annual(actor=cast.hr_user, request=request)
    assert flows.shortfall(refused.value) == Decimal("1")

    request.refresh_from_db()
    request = request_services.reclassify_as_annual(
        actor=cast.hr_user, request=request, override_reason="No certificate; agreed with the employee"
    )
    flows.let_hr_finish(cast, request)

    assert selectors.balance_on(cast.owner.id, date(2026, 10, 5)) == Decimal("-1")


def test_a_withdrawn_request_holds_nothing(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "3", SEPT_30)
    request = flows.send(cast, date(2026, 10, 19), date(2026, 10, 21))

    request_services.withdraw(actor=cast.owner_user, request=request)

    assert flows.send(cast, date(2026, 10, 26), date(2026, 10, 28)).status == "pending"


def test_a_request_sent_back_holds_nothing(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "3", SEPT_30)
    request = flows.send(cast, date(2026, 10, 19), date(2026, 10, 21))

    flows.decide(
        cast,
        request,
        approver=cast.manager_user,
        queue="mine",
        decision=Decision.RETURN,
        comment="Pick other dates",
    )

    assert request_selectors.reserved_days(cast.owner.id) == {}
    assert flows.send(cast, date(2026, 10, 26), date(2026, 10, 28)).status == "pending"


def test_the_form_preview_and_the_decision_view_carry_the_balance(cast, client_for, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "5", SEPT_30)
    asked = {
        "type": "annual",
        "start_date": "2026-10-19",
        "end_date": "2026-10-21",
        "starts_at_midday": False,
        "ends_at_midday": False,
        "start_time": None,
        "end_time": None,
        "exceptional_event": None,
        "override": False,
    }

    preview = client_for(cast.owner_user).post(reverse("requests:request-preview"), asked, format="json")

    assert preview.status_code == 200
    balance = preview.json()["balance"]
    assert (Decimal(balance["now"]), Decimal(balance["on_start"]), Decimal(balance["after"])) == (5, 5, 2)

    request = flows.send(cast, date(2026, 10, 19), date(2026, 10, 21))
    detail = client_for(cast.manager_user).get(
        reverse("requests:request-detail", kwargs={"public_id": request.public_id})
    )

    assert detail.status_code == 200
    context = detail.json()["decision_context"]["balance"]
    assert (Decimal(context["now"]), Decimal(context["after"])) == (5, 2)


def test_days_given_back_by_a_change_the_employee_asked_for_carry_no_code_as_their_reason(
    cast, ledger_settings
):
    """The request engine names such a release "amendment": a code, not words to show in the history."""
    ledger_settings()
    give_opening(cast.owner, "5", SEPT_30)
    moved = flows.approve(cast, flows.send(cast, date(2026, 11, 2), date(2026, 11, 3)))
    cancelled = flows.approve(cast, flows.send(cast, date(2026, 11, 16), date(2026, 11, 16)))

    request_services.open_amendment(
        actor=cast.owner_user,
        request=moved,
        kind="change",
        data=RequestData(start_date=date(2026, 11, 9), end_date=date(2026, 11, 10)),
        reason="Family event moved",
    )
    flows.approve(cast, moved)
    request_services.open_amendment(
        actor=cast.owner_user, request=cancelled, kind="cancel", data=None, reason="Trip cancelled"
    )
    flows.approve(cast, cancelled)

    given_back = [line for line in selectors.ledger_lines(cast.owner.id) if line.kind == LedgerKind.RESTORED]
    assert [(line.effective_date, line.amount, line.reason) for line in given_back] == [
        (date(2026, 11, 2), Decimal("2"), ""),
        (date(2026, 11, 16), Decimal("1"), ""),
    ]
    assert all(line.request_public_id for line in given_back)


def test_half_days_a_weekend_and_a_holiday_across_two_months_are_posted_and_given_back_per_month(
    cast, ledger_settings
):
    ledger_settings()
    give_opening(cast.owner, "5", SEPT_30)
    PublicHoliday.objects.create(date=date(2026, 11, 2), name_fr="Férié", name_en="Holiday")

    # Thursday 29 October from midday to Tuesday 3 November at midday: half a day, a day, a weekend and
    # the holiday of Monday 2 November that count nothing, then half a day.
    request = flows.approve(
        cast,
        flows.send(cast, date(2026, 10, 29), date(2026, 11, 3), starts_at_midday=True, ends_at_midday=True),
    )

    assert request.quantity == Decimal("2")
    assert lines_of(cast.owner, LedgerKind.TAKEN) == [
        (date(2026, 10, 29), Decimal("-1.5")),
        (date(2026, 11, 3), Decimal("-0.5")),
    ]

    request_services.hr_cancel(actor=cast.hr_user, request=request, reason="Trip cancelled")

    assert lines_of(cast.owner, LedgerKind.RESTORED) == [
        (date(2026, 10, 29), Decimal("1.5")),
        (date(2026, 11, 3), Decimal("0.5")),
    ]
    for day in (date(2026, 10, 29), date(2026, 11, 2), date(2026, 11, 3)):
        assert selectors.balance_on(cast.owner.id, day) == Decimal("5")


def test_held_and_upcoming_of_several_people_are_their_figures_in_a_fixed_number_of_queries(
    cast, ledger_settings, django_assert_max_num_queries
):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "10", SEPT_30)
    give_opening(cast.peer, "10", SEPT_30)
    flows.approve(cast, flows.send(cast, date(2026, 11, 2), date(2026, 11, 3)))
    flows.send(cast, date(2026, 11, 16), date(2026, 11, 17), ends_at_midday=True)
    wanted = [cast.owner.id, cast.peer.id, cast.outsider.id]
    today = date(2026, 10, 5)

    with django_assert_max_num_queries(4):
        found = selectors.held_and_upcoming(wanted, today=today)

    for employee_id in wanted:
        figures = selectors.figures(employee_id, today=today)
        assert found[employee_id] == (figures.pending, figures.approved_upcoming)
    assert found[cast.owner.id] == (Decimal("1.5"), Decimal("2"))
    assert not found[cast.peer.id][1].is_signed()


def test_period_end_balances_read_the_credits_posted_once_for_everybody(
    cast, ledger_settings, django_assert_max_num_queries
):
    ledger_settings(start=date(2026, 10, 1))
    services.post_month_end_credits(today=date(2026, 11, 1))
    wanted = [employee.id for employee in (cast.owner, cast.peer, cast.outsider, cast.manager, cast.hr)]

    with django_assert_max_num_queries(3):
        found = selectors.balances_at_period_end(date(2026, 12, 31), employee_ids=wanted)

    # October is posted; November and December are still to come, for each of them.
    assert found.credits_to_come is True
    assert set(found.balances.values()) == {Decimal("7.5")}
