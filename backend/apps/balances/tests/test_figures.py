from datetime import date, timedelta
from decimal import Decimal

import pytest
import time_machine

from apps.accounts import services as account_services
from apps.balances import selectors
from apps.balances.models import LedgerKind
from apps.balances.selectors import AsOf, BalanceFigures
from apps.balances.tests.world import at, give_credit, give_opening, make_entry
from apps.core.errors import DomainError
from apps.organisation import services as organisation_services
from apps.requests import selectors as request_selectors

pytestmark = pytest.mark.usefixtures("reservations")

TODAY = date(2026, 10, 5)


def test_an_employee_without_any_entry_has_a_zero_balance_everywhere(cast, ledger_settings):
    ledger_settings(start=None)
    owner = cast.owner

    assert selectors.figures(owner.id, today=TODAY) == BalanceFigures(
        current=Decimal("0"),
        pending=Decimal("0"),
        approved_upcoming=Decimal("0"),
        next_credit_amount=None,
        next_credit_date=None,
    )
    assert selectors.ledger_lines(owner.id) == []
    assert selectors.has_opening(owner.id) is False
    assert selectors.as_of(owner.id, TODAY, today=TODAY) == AsOf(
        on=TODAY, balance=Decimal("0"), projected=False
    )
    # a zero must never be written "-0.00"
    assert not selectors.figures(owner.id, today=TODAY).approved_upcoming.is_signed()


def test_the_current_balance_counts_lines_up_to_today(cast, ledger_settings):
    ledger_settings(start=None)
    owner = cast.owner
    give_opening(owner, "4", date(2025, 12, 31))
    give_credit(owner, 2026, 1)
    make_entry(owner, LedgerKind.TAKEN, "-2", TODAY, request_id=1)
    make_entry(owner, LedgerKind.TAKEN, "-3", date(2026, 12, 21), request_id=2)

    figures = selectors.figures(owner.id, today=TODAY)

    assert figures.current == Decimal("4.5")
    assert figures.approved_upcoming == Decimal("3")


def test_days_given_back_reduce_what_is_upcoming(cast, ledger_settings):
    ledger_settings(start=None)
    make_entry(cast.owner, LedgerKind.TAKEN, "-5", date(2026, 12, 21), request_id=2)
    make_entry(cast.owner, LedgerKind.RESTORED, "2", date(2026, 12, 21), request_id=2)

    assert selectors.figures(cast.owner.id, today=TODAY).approved_upcoming == Decimal("3")


def test_pending_is_what_requests_are_holding(cast, ledger_settings, reservations):
    ledger_settings(start=None)
    reservations(cast.owner, {date(2026, 11, 2): "1", date(2026, 11, 3): "0.5"})

    assert selectors.figures(cast.owner.id, today=TODAY).pending == Decimal("1.5")


def test_the_next_credit_is_the_end_of_this_month(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))

    assert selectors.next_credit(cast.owner.id, today=TODAY) == (Decimal("2.5"), date(2026, 10, 31))


def test_once_this_month_is_credited_the_next_credit_is_next_month(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    give_credit(cast.owner, 2026, 10)

    assert selectors.next_credit(cast.owner.id, today=date(2026, 10, 31)) == (
        Decimal("2.5"),
        date(2026, 11, 30),
    )


def test_the_december_credit_is_followed_by_january(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    give_credit(cast.owner, 2026, 12)

    assert selectors.next_credit(cast.owner.id, today=date(2026, 12, 31)) == (
        Decimal("2.5"),
        date(2027, 1, 31),
    )


def test_no_next_credit_without_a_start_date(cast, ledger_settings):
    ledger_settings(start=None)

    assert selectors.next_credit(cast.owner.id, today=TODAY) == (None, None)


def test_the_next_credit_waits_for_the_start_date(cast, ledger_settings):
    ledger_settings(start=date(2026, 12, 1))

    assert selectors.next_credit(cast.owner.id, today=TODAY) == (Decimal("2.5"), date(2026, 12, 31))


def test_the_next_credit_of_a_joiner_is_pro_rated(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    cast.owner.hire_date = date(2026, 10, 16)
    cast.owner.save(update_fields=["hire_date"])

    # 16 of 31 days in October: 1.29 -> 1.5
    assert selectors.next_credit(cast.owner.id, today=date(2026, 10, 20)) == (
        Decimal("1.5"),
        date(2026, 10, 31),
    )


def test_a_leaver_has_no_next_credit(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    with time_machine.travel(at(2026, 9, 30), tick=False):
        organisation_services.archive_employee(
            actor=cast.hr_user, employee=cast.owner, leaving_date=date(2026, 9, 30), reason="Resignation"
        )

    assert selectors.next_credit(cast.owner.id, today=TODAY) == (None, None)


def test_ledger_lines_carry_a_running_balance_oldest_first(cast):
    owner = cast.owner
    make_entry(owner, LedgerKind.TAKEN, "-3", date(2026, 2, 9), request_id=1)
    make_entry(
        owner, LedgerKind.ADJUSTMENT, "1", date(2026, 2, 9), reason="Correction", created_by=cast.hr_user
    )
    give_credit(owner, 2026, 1)
    give_opening(owner, "4", date(2025, 12, 31))

    lines = selectors.ledger_lines(owner.id)

    assert [(line.kind, line.effective_date, line.amount, line.balance_after) for line in lines] == [
        ("opening", date(2025, 12, 31), Decimal("4"), Decimal("4")),
        ("credit", date(2026, 1, 31), Decimal("2.5"), Decimal("6.5")),
        ("taken", date(2026, 2, 9), Decimal("-3"), Decimal("3.5")),
        ("adjustment", date(2026, 2, 9), Decimal("1"), Decimal("4.5")),
    ]
    assert lines[1].created_by is None
    assert lines[1].period == "2026-01"
    assert lines[3].created_by == account_services.display_name(cast.hr_user)
    assert lines[3].reason == "Correction"
    assert selectors.ledger_line(owner.id, lines[2].id) == lines[2]


def test_ledger_lines_name_the_request_behind_leave(cast, monkeypatch):
    public_id = "0b0e7a36-6f0f-4a53-9a59-0f1c2d3e4f50"
    make_entry(cast.owner, LedgerKind.TAKEN, "-2", date(2026, 11, 2), request_id=77)
    make_entry(cast.owner, LedgerKind.RESTORED, "2", date(2026, 11, 2), request_id=77)
    give_opening(cast.owner, "4", date(2025, 12, 31))
    asked: list = []

    def fake_public_ids(request_ids):
        asked.append(sorted(request_ids))
        return {77: public_id}

    monkeypatch.setattr(request_selectors, "public_ids", fake_public_ids)

    opening, taken, restored = selectors.ledger_lines(cast.owner.id)

    assert opening.request_public_id is None
    assert (taken.request_public_id, restored.request_public_id) == (public_id, public_id)
    # one question for the whole ledger, about each request once
    assert asked == [[77]]


def test_lines_without_a_request_ask_the_request_engine_nothing(cast, monkeypatch):
    give_opening(cast.owner, "4", date(2025, 12, 31))

    def must_not_be_called(request_ids):
        raise AssertionError("public_ids was called for a ledger without leave lines")

    monkeypatch.setattr(request_selectors, "public_ids", must_not_be_called)

    assert len(selectors.ledger_lines(cast.owner.id)) == 1


def test_the_balance_on_a_past_date_is_the_posted_balance(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    give_opening(cast.owner, "4", date(2025, 12, 31))
    give_credit(cast.owner, 2026, 1)

    assert selectors.as_of(cast.owner.id, date(2026, 1, 31), today=TODAY) == AsOf(
        on=date(2026, 1, 31), balance=Decimal("6.5"), projected=False
    )


def test_the_balance_on_a_future_date_is_projected(cast, ledger_settings, reservations):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))
    reservations(cast.owner, {date(2026, 11, 2): "1"})

    # 1 + 2.5 (Oct) + 2.5 (Nov) - 1 held = 5
    assert selectors.as_of(cast.owner.id, date(2026, 12, 15), today=TODAY) == AsOf(
        on=date(2026, 12, 15), balance=Decimal("5"), projected=True
    )


def test_a_date_too_far_ahead_is_refused(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    limit = TODAY + timedelta(days=731)

    assert selectors.as_of(cast.owner.id, limit, today=TODAY).projected is True
    with pytest.raises(DomainError) as refused:
        selectors.as_of(cast.owner.id, date(9999, 12, 31), today=TODAY)

    assert refused.value.code == "balances.date_out_of_range"
    assert refused.value.problems[0].field == "on"


def test_has_opening_knows_whether_the_opening_balance_was_entered(cast):
    give_opening(cast.owner, "0", date(2025, 12, 31))

    assert selectors.has_opening(cast.owner.id) is True
    assert selectors.has_opening(cast.peer.id) is False
