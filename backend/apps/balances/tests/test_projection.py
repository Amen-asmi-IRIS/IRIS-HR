from datetime import date
from decimal import Decimal

import pytest
import time_machine

from apps.balances import selectors
from apps.balances.models import LedgerKind
from apps.balances.tests.world import at, days, give_credit, give_opening, make_entry
from apps.organisation import services as organisation_services

pytestmark = pytest.mark.usefixtures("reservations")


def test_the_balance_on_a_date_counts_lines_dated_on_or_before_it(cast, ledger_settings):
    ledger_settings()
    owner = cast.owner
    give_opening(owner, "4", date(2025, 12, 31))
    give_credit(owner, 2026, 1)
    make_entry(owner, LedgerKind.TAKEN, "-3", date(2026, 2, 9), request_id=1)

    assert selectors.balance_on(owner.id, date(2025, 12, 30)) == Decimal("0")
    assert selectors.balance_on(owner.id, date(2025, 12, 31)) == Decimal("4")
    assert selectors.balance_on(owner.id, date(2026, 1, 31)) == Decimal("6.5")
    assert selectors.balance_on(owner.id, date(2026, 2, 8)) == Decimal("6.5")
    assert selectors.balance_on(owner.id, date(2026, 2, 9)) == Decimal("3.5")


def test_the_balance_of_an_empty_ledger_is_zero(cast):
    assert selectors.balance_on(cast.owner.id, date(2026, 6, 30)) == Decimal("0")


def test_balances_at_a_date_for_several_employees(cast):
    give_opening(cast.owner, "4", date(2025, 12, 31))
    give_credit(cast.owner, 2026, 1)
    give_credit(cast.owner, 2026, 2)

    asked = selectors.balances_at(date(2026, 1, 31), employee_ids=[cast.owner.id, cast.peer.id])
    everyone = selectors.balances_at(date(2026, 1, 31))

    assert asked == {cast.owner.id: Decimal("6.5"), cast.peer.id: Decimal("0")}
    assert everyone == {cast.owner.id: Decimal("6.5")}


def test_without_a_start_date_the_projection_is_the_posted_balance(cast, ledger_settings):
    ledger_settings(start=None)
    give_opening(cast.owner, "4", date(2025, 12, 31))

    assert selectors.projected_balance(cast.owner.id, date(2027, 12, 31)) == Decimal("4")


def test_the_projection_adds_the_credits_still_to_come(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))

    assert selectors.projected_balance(cast.owner.id, date(2026, 10, 30)) == Decimal("1")
    assert selectors.projected_balance(cast.owner.id, date(2026, 10, 31)) == Decimal("3.5")
    assert selectors.projected_balance(cast.owner.id, date(2026, 12, 15)) == Decimal("6")
    assert selectors.projected_balance(cast.owner.id, date(2026, 12, 31)) == Decimal("8.5")


def test_a_month_already_credited_is_not_counted_twice(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))
    give_credit(cast.owner, 2026, 10)

    assert selectors.projected_balance(cast.owner.id, date(2026, 11, 15)) == Decimal("3.5")


def test_the_projection_subtracts_held_days_on_or_before_the_date(cast, ledger_settings, reservations):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))
    reservations(cast.owner, {date(2026, 11, 2): "1", date(2026, 11, 3): "1", date(2026, 12, 1): "0.5"})

    assert selectors.projected_balance(cast.owner.id, date(2026, 11, 1)) == Decimal("3.5")
    assert selectors.projected_balance(cast.owner.id, date(2026, 11, 2)) == Decimal("2.5")
    assert selectors.projected_balance(cast.owner.id, date(2026, 11, 3)) == Decimal("1.5")
    assert selectors.projected_balance(cast.owner.id, date(2026, 11, 30)) == Decimal("4")
    assert selectors.projected_balance(cast.owner.id, date(2026, 12, 1)) == Decimal("3.5")


def test_the_projection_subtracts_extra_days(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))
    asked = days(date(2026, 11, 2), date(2026, 11, 3))

    assert selectors.projected_balance(cast.owner.id, date(2026, 11, 2), extra_days=asked) == Decimal("2.5")
    assert selectors.projected_balance(cast.owner.id, date(2026, 11, 3), extra_days=asked) == Decimal("1.5")


def test_ignoring_a_request_leaves_out_its_lines_and_keeps_the_others(cast, ledger_settings):
    ledger_settings(start=None)
    owner = cast.owner
    give_opening(owner, "5", date(2026, 9, 30))
    make_entry(owner, LedgerKind.TAKEN, "-2", date(2026, 11, 2), request_id=77)
    make_entry(owner, LedgerKind.TAKEN, "-1", date(2026, 11, 9), request_id=78)
    month_end = date(2026, 11, 30)

    assert selectors.projected_balance(owner.id, month_end) == Decimal("2")
    assert selectors.projected_balance(owner.id, month_end, ignoring_request_id=77) == Decimal("4")
    assert selectors.projected_balance(owner.id, month_end, ignoring_request_id=78) == Decimal("3")


def test_a_leaver_earns_no_projected_credit_after_leaving(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))
    with time_machine.travel(at(2026, 10, 20), tick=False):
        organisation_services.archive_employee(
            actor=cast.hr_user, employee=cast.owner, leaving_date=date(2026, 10, 20), reason="Resignation"
        )

    # 20 of 31 days in October: 1.61 -> 1.5; nothing for November and December
    assert selectors.projected_balance(cast.owner.id, date(2026, 12, 31)) == Decimal("2.5")
