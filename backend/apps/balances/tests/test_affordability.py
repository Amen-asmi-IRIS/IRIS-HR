from datetime import date
from decimal import Decimal

import pytest

from apps.balances import selectors
from apps.balances.models import LedgerKind
from apps.balances.selectors import Affordability
from apps.balances.tests.world import days, give_opening, make_entry

pytestmark = pytest.mark.usefixtures("reservations")

OCT_12_TO_14 = days(date(2026, 10, 12), date(2026, 10, 13), date(2026, 10, 14))
DEC_7_TO_9 = days(date(2026, 12, 7), date(2026, 12, 8), date(2026, 12, 9))
NOV_16_17 = days(date(2026, 11, 16), date(2026, 11, 17))
NEW_YEAR = days(
    date(2026, 12, 28),
    date(2026, 12, 29),
    date(2026, 12, 30),
    date(2026, 12, 31),
    date(2027, 1, 1),
    date(2027, 1, 4),
    date(2027, 1, 5),
    date(2027, 1, 6),
    date(2027, 1, 7),
    date(2027, 1, 8),
)


def test_exactly_enough_is_accepted(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "3", date(2026, 9, 30))

    assert selectors.affordability(cast.owner.id, OCT_12_TO_14) == Affordability(ok=True)


def test_half_a_day_short_is_refused_with_the_shortfall_and_the_first_bad_day(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "2.5", date(2026, 9, 30))

    # after 12 Oct: 1.5; after 13 Oct: 0.5; after 14 Oct: -0.5
    assert selectors.affordability(cast.owner.id, OCT_12_TO_14) == Affordability(
        ok=False, shortfall=Decimal("0.5"), first_negative_on=date(2026, 10, 14)
    )


def test_leave_not_yet_earned_is_accepted_when_earned_by_its_first_day(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))

    # on 7 Dec: 1 + 2.5 (Oct) + 2.5 (Nov) - 1 = 5; then 4; then 3
    assert selectors.affordability(cast.owner.id, DEC_7_TO_9).ok is True


def test_the_same_leave_too_early_is_refused(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))

    # after 12 Oct: 0; after 13 Oct: -1; after 14 Oct: -2; the October credit comes too late
    assert selectors.affordability(cast.owner.id, OCT_12_TO_14) == Affordability(
        ok=False, shortfall=Decimal("2"), first_negative_on=date(2026, 10, 13)
    )


def test_a_later_approved_leave_makes_an_earlier_request_unaffordable(cast, ledger_settings):
    ledger_settings(start=None)
    give_opening(cast.owner, "5", date(2026, 9, 30))
    make_entry(cast.owner, LedgerKind.TAKEN, "-5", date(2026, 12, 21), request_id=77)

    # after 17 Nov: 3; on 21 Dec the approved leave takes 5: -2
    assert selectors.affordability(cast.owner.id, NOV_16_17) == Affordability(
        ok=False, shortfall=Decimal("2"), first_negative_on=date(2026, 12, 21)
    )


def test_credits_earned_in_between_keep_the_later_leave_affordable(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "5", date(2026, 9, 30))
    make_entry(cast.owner, LedgerKind.TAKEN, "-5", date(2026, 12, 21), request_id=77)

    # 16 Nov: 5 + 2.5 - 1 = 6.5; 17 Nov: 5.5; 30 Nov: 8; 21 Dec: 3
    assert selectors.affordability(cast.owner.id, NOV_16_17).ok is True


def test_pending_days_are_held(cast, ledger_settings, reservations):
    ledger_settings(start=None)
    give_opening(cast.owner, "5", date(2026, 9, 30))
    reservations(cast.owner, {date(2026, 11, 2): "1", date(2026, 11, 3): "1", date(2026, 11, 4): "1"})
    asked = days(date(2026, 10, 19), date(2026, 10, 20), date(2026, 10, 21))

    # after 21 Oct: 2; 2 Nov: 1; 3 Nov: 0; 4 Nov: -1
    assert selectors.affordability(cast.owner.id, asked) == Affordability(
        ok=False, shortfall=Decimal("1"), first_negative_on=date(2026, 11, 4)
    )


def test_moving_approved_leave_does_not_need_the_balance_twice(cast, ledger_settings):
    ledger_settings(start=None)
    give_opening(cast.owner, "2", date(2026, 9, 30))
    make_entry(cast.owner, LedgerKind.TAKEN, "-2", date(2026, 11, 2), request_id=77)
    moved = days(date(2026, 11, 9), date(2026, 11, 10))

    assert selectors.affordability(cast.owner.id, moved) == Affordability(
        ok=False, shortfall=Decimal("2"), first_negative_on=date(2026, 11, 9)
    )
    assert selectors.affordability(cast.owner.id, moved, ignoring_request_id=77) == Affordability(ok=True)


def test_no_days_means_nothing_to_check(cast, ledger_settings):
    ledger_settings()

    assert selectors.affordability(cast.owner.id, {}) == Affordability(ok=True)


def test_a_balance_already_negative_is_short_from_the_first_day(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "-1", date(2026, 9, 30))

    assert selectors.affordability(cast.owner.id, days(date(2026, 10, 12))) == Affordability(
        ok=False, shortfall=Decimal("2"), first_negative_on=date(2026, 10, 12)
    )


def test_half_days_are_counted_as_halves(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "0.5", date(2026, 9, 30))
    one_half = days(date(2026, 10, 9), portion="0.5")
    two_halves = days(date(2026, 10, 9), date(2026, 10, 12), portion="0.5")

    assert selectors.affordability(cast.owner.id, one_half).ok is True
    assert selectors.affordability(cast.owner.id, two_halves) == Affordability(
        ok=False, shortfall=Decimal("0.5"), first_negative_on=date(2026, 10, 12)
    )


def test_leave_across_the_new_year_uses_the_december_credit(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "5", date(2026, 9, 30))
    give_opening(cast.peer, "2", date(2026, 9, 30))

    # owner: 28 Dec 9, 29 Dec 8, 30 Dec 7, 31 Dec 7 - 1 + 2.5 = 8.5, then down to 2.5 on 8 Jan
    assert selectors.affordability(cast.owner.id, NEW_YEAR).ok is True
    # peer: 28 Dec 6, 29 Dec 5, 30 Dec 4, 31 Dec 5.5, then down to -0.5 on 8 Jan
    assert selectors.affordability(cast.peer.id, NEW_YEAR) == Affordability(
        ok=False, shortfall=Decimal("0.5"), first_negative_on=date(2027, 1, 8)
    )


def test_days_given_back_count_again(cast, ledger_settings):
    ledger_settings(start=None)
    give_opening(cast.owner, "2", date(2026, 9, 30))
    make_entry(cast.owner, LedgerKind.TAKEN, "-2", date(2026, 11, 2), request_id=77)
    make_entry(cast.owner, LedgerKind.RESTORED, "2", date(2026, 11, 2), request_id=77)

    assert selectors.affordability(cast.owner.id, NOV_16_17).ok is True


def test_a_negative_adjustment_dated_inside_the_range_is_seen(cast, ledger_settings):
    ledger_settings(start=None)
    give_opening(cast.owner, "3", date(2026, 9, 30))
    make_entry(cast.owner, LedgerKind.ADJUSTMENT, "-2", date(2026, 10, 13), reason="Correction")

    # after 12 Oct: 2; after 13 Oct: 2 - 1 - 2 = -1; after 14 Oct: -2
    assert selectors.affordability(cast.owner.id, OCT_12_TO_14) == Affordability(
        ok=False, shortfall=Decimal("2"), first_negative_on=date(2026, 10, 13)
    )
