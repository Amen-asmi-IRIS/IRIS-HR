from datetime import date
from decimal import Decimal

import pytest
import time_machine

from apps.balances import selectors, services
from apps.balances.models import LedgerEntry, LedgerKind
from apps.balances.port import LedgerBalancePort
from apps.balances.tests.world import at, days, give_opening
from apps.requests import ports
from apps.requests.ports import BalancePreview, BalanceVerdict

pytestmark = pytest.mark.usefixtures("reservations")

NOV_2_TO_6 = days(
    date(2026, 11, 2), date(2026, 11, 3), date(2026, 11, 4), date(2026, 11, 5), date(2026, 11, 6)
)
NOV_10_TO_12 = days(date(2026, 11, 10), date(2026, 11, 11), date(2026, 11, 12))
OCT_12_TO_14 = days(date(2026, 10, 12), date(2026, 10, 13), date(2026, 10, 14))
DEC_7_TO_9 = days(date(2026, 12, 7), date(2026, 12, 8), date(2026, 12, 9))
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


def lines_of(employee, kind) -> list[tuple[date, Decimal]]:
    entries = LedgerEntry.objects.filter(employee=employee, kind=kind)
    return [(entry.effective_date, entry.amount) for entry in entries]


def take(cast, leave_days, request_id=77):
    return services.post_taken(
        request_id=request_id, employee_id=cast.owner.id, days=leave_days, actor=cast.hr_user
    )


def give_back(cast, leave_days, request_id=77, reason="Cancelled by HR"):
    return services.post_restored(
        request_id=request_id, employee_id=cast.owner.id, days=leave_days, actor=cast.hr_user, reason=reason
    )


def test_the_ledger_port_is_installed_when_django_starts(port_at_start_up):
    assert isinstance(port_at_start_up, LedgerBalancePort)


def test_tests_run_without_balances_unless_they_ask():
    assert isinstance(ports.balance_port(), ports.NullBalancePort)


def test_the_ledger_port_fixture_puts_the_ledger_in_place(ledger_port):
    assert isinstance(ports.balance_port(), LedgerBalancePort)


def test_leave_in_one_month_is_one_line_dated_its_first_day(cast):
    take(cast, NOV_2_TO_6)

    assert lines_of(cast.owner, LedgerKind.TAKEN) == [(date(2026, 11, 2), Decimal("-5"))]
    line = LedgerEntry.objects.get(employee=cast.owner)
    assert line.request_id == 77
    assert line.created_by == cast.hr_user
    assert line.period == ""


def test_leave_across_two_months_and_two_years_is_posted_per_month(cast):
    take(cast, NEW_YEAR)

    assert lines_of(cast.owner, LedgerKind.TAKEN) == [
        (date(2026, 12, 28), Decimal("-4")),
        (date(2027, 1, 1), Decimal("-6")),
    ]


def test_half_days_are_posted_as_halves(cast):
    take(cast, {date(2026, 10, 8): Decimal("1"), date(2026, 10, 9): Decimal("0.5")})

    assert lines_of(cast.owner, LedgerKind.TAKEN) == [(date(2026, 10, 8), Decimal("-1.5"))]


def test_no_days_post_nothing(cast):
    assert take(cast, {}) == []
    assert give_back(cast, {}) == []
    assert LedgerEntry.objects.count() == 0


def test_cancelling_gives_back_every_day_on_the_date_of_the_line_it_undoes(cast):
    give_opening(cast.owner, "10", date(2026, 9, 30))
    take(cast, NOV_2_TO_6)

    give_back(cast, NOV_2_TO_6)

    assert lines_of(cast.owner, LedgerKind.RESTORED) == [(date(2026, 11, 2), Decimal("5"))]
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 2)) == Decimal("10")


def test_shortening_gives_back_the_released_days_from_the_same_date(cast):
    give_opening(cast.owner, "10", date(2026, 9, 30))
    take(cast, NOV_2_TO_6)

    give_back(cast, days(date(2026, 11, 5), date(2026, 11, 6)), reason="Shortened by HR")

    assert lines_of(cast.owner, LedgerKind.RESTORED) == [(date(2026, 11, 2), Decimal("2"))]
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 2)) == Decimal("7")
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 30)) == Decimal("7")


def test_giving_back_after_a_correction_follows_the_latest_line(cast):
    give_opening(cast.owner, "10", date(2026, 9, 30))
    take(cast, NOV_2_TO_6)
    give_back(cast, NOV_2_TO_6, reason="Dates corrected by HR")
    take(cast, NOV_10_TO_12)

    give_back(cast, NOV_10_TO_12)

    assert lines_of(cast.owner, LedgerKind.RESTORED) == [
        (date(2026, 11, 2), Decimal("5")),
        (date(2026, 11, 10), Decimal("3")),
    ]
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 9)) == Decimal("10")
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 30)) == Decimal("10")


def test_giving_back_across_months_mirrors_each_month(cast):
    take(cast, NEW_YEAR)

    give_back(cast, NEW_YEAR)

    assert lines_of(cast.owner, LedgerKind.RESTORED) == [
        (date(2026, 12, 28), Decimal("4")),
        (date(2027, 1, 1), Decimal("6")),
    ]


def test_giving_back_without_a_matching_line_is_dated_the_first_day_given_back(cast):
    give_back(cast, days(date(2026, 11, 5), date(2026, 11, 6)))

    assert lines_of(cast.owner, LedgerKind.RESTORED) == [(date(2026, 11, 5), Decimal("2"))]


def test_the_reason_and_the_actor_are_kept_on_the_line(cast):
    take(cast, NOV_2_TO_6)

    give_back(cast, NOV_2_TO_6, reason="Project deadline moved")

    line = LedgerEntry.objects.get(employee=cast.owner, kind=LedgerKind.RESTORED)
    assert line.reason == "Project deadline moved"
    assert line.created_by == cast.hr_user
    assert line.request_id == 77


def test_check_reports_the_shortfall(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "2.5", date(2026, 9, 30))
    port = LedgerBalancePort()

    assert port.check(employee_id=cast.owner.id, new_days=days(date(2026, 10, 12))) == BalanceVerdict(ok=True)
    assert port.check(employee_id=cast.owner.id, new_days=OCT_12_TO_14) == BalanceVerdict(
        ok=False, shortfall=Decimal("0.5"), first_negative_on=date(2026, 10, 14)
    )


def test_check_ignores_the_request_being_replaced(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "5", date(2026, 9, 30))
    take(cast, NOV_2_TO_6)
    port = LedgerBalancePort()

    assert port.check(employee_id=cast.owner.id, new_days=NOV_10_TO_12).ok is False
    assert port.check(employee_id=cast.owner.id, new_days=NOV_10_TO_12, ignoring_request_id=77).ok is True


@time_machine.travel(at(2026, 10, 5), tick=False)
def test_preview_gives_the_balance_now_on_the_first_day_and_after(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))

    preview = LedgerBalancePort().preview(employee_id=cast.owner.id, new_days=DEC_7_TO_9)

    # now 1; on 7 Dec 1 + 2.5 + 2.5 = 6; after the three days 3
    assert preview == BalancePreview(now=Decimal("1"), on_start=Decimal("6"), after=Decimal("3"))


@time_machine.travel(at(2026, 10, 5), tick=False)
def test_preview_of_leave_across_a_month_end_counts_the_credit_in_between(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "5", date(2026, 9, 30))

    preview = LedgerBalancePort().preview(employee_id=cast.owner.id, new_days=NEW_YEAR)

    # on 28 Dec 5 + 5 = 10; on 8 Jan 5 + 7.5 - 10 = 2.5
    assert preview == BalancePreview(now=Decimal("5"), on_start=Decimal("10"), after=Decimal("2.5"))


def test_preview_without_days_is_empty(cast, ledger_settings):
    ledger_settings()

    assert LedgerBalancePort().preview(employee_id=cast.owner.id, new_days={}) is None


def test_the_port_posts_through_the_ledger(cast):
    port = LedgerBalancePort()

    port.post_taken(request_id=77, employee_id=cast.owner.id, days=NOV_2_TO_6, actor=cast.hr_user)
    port.post_restored(
        request_id=77,
        employee_id=cast.owner.id,
        days=NOV_2_TO_6,
        actor=cast.hr_user,
        reason="Cancelled by HR",
    )

    assert lines_of(cast.owner, LedgerKind.TAKEN) == [(date(2026, 11, 2), Decimal("-5"))]
    assert lines_of(cast.owner, LedgerKind.RESTORED) == [(date(2026, 11, 2), Decimal("5"))]
