"""The balance at the end of a period, as the reports and the KPMG export of plan 06 read it (master 13.1).

The credit of a month is written in the first hour after its last day and dated that day, so a balance
read on or before a month's last day has no credit for that month. The credits due up to the period's end and
not posted yet are added, whether the period ends in the past, today or later (master 13.1).
"""

from datetime import date
from decimal import Decimal

import pytest

from apps.balances import selectors, services
from apps.balances.tests.world import give_opening

pytestmark = pytest.mark.usefixtures("reservations")

START = date(2026, 10, 1)


@pytest.fixture
def owner(cast, ledger_settings):
    ledger_settings(start=START)
    give_opening(cast.owner, "10", date(2026, 9, 30))
    # The job of 1 November posted October; November is not over yet.
    services.post_month_end_credits(today=date(2026, 11, 1))
    return cast.owner


def test_a_period_already_over_and_credited_reads_the_ledger_as_it_is(owner):
    found = selectors.balances_at_period_end(
        date(2026, 10, 31), employee_ids=[owner.id], today=date(2026, 11, 30)
    )

    assert found.balances == {owner.id: Decimal("12.5")}
    assert found.credits_to_come is False


def test_a_period_already_over_counts_a_credit_the_job_has_not_posted_yet(owner):
    # 1 December, before the job of the night ran (or while the worker was down).
    found = selectors.balances_at_period_end(
        date(2026, 11, 30), employee_ids=[owner.id], today=date(2026, 12, 1)
    )

    assert selectors.balance_on(owner.id, date(2026, 11, 30)) == Decimal("12.5")
    assert found.balances == {owner.id: Decimal("15")}
    assert found.credits_to_come is True


def test_a_period_ending_today_counts_the_credit_of_its_month(owner):
    found = selectors.balances_at_period_end(
        date(2026, 11, 30), employee_ids=[owner.id], today=date(2026, 11, 30)
    )

    assert selectors.balance_on(owner.id, date(2026, 11, 30)) == Decimal("12.5")
    assert found.balances == {owner.id: Decimal("15")}
    assert found.credits_to_come is True


def test_a_period_ending_later_counts_every_credit_up_to_its_end(owner):
    found = selectors.balances_at_period_end(
        date(2026, 12, 31), employee_ids=[owner.id], today=date(2026, 11, 13)
    )

    assert found.balances == {owner.id: Decimal("17.5")}
    assert found.credits_to_come is True


def test_a_credit_is_never_counted_twice_once_it_is_posted(owner):
    services.post_month_end_credits(today=date(2026, 12, 1))

    over = selectors.balances_at_period_end(
        date(2026, 11, 30), employee_ids=[owner.id], today=date(2026, 12, 1)
    )
    running = selectors.balances_at_period_end(
        date(2026, 12, 31), employee_ids=[owner.id], today=date(2026, 12, 1)
    )

    assert (over.balances[owner.id], over.credits_to_come) == (Decimal("15"), False)
    assert (running.balances[owner.id], running.credits_to_come) == (Decimal("17.5"), True)


def test_nothing_is_added_while_credits_have_no_start(cast, ledger_settings):
    ledger_settings(start=None)
    give_opening(cast.owner, "10", date(2026, 9, 30))

    found = selectors.balances_at_period_end(
        date(2026, 12, 31), employee_ids=[cast.owner.id, cast.peer.id], today=date(2026, 11, 13)
    )

    assert found.balances == {cast.owner.id: Decimal("10"), cast.peer.id: Decimal("0")}
    assert found.credits_to_come is False


def test_someone_who_has_left_earns_nothing_after_leaving(cast, ledger_settings):
    ledger_settings(start=START)
    cast.peer.archived_at = date(2026, 10, 31)
    cast.peer.save(update_fields=["archived_at"])

    found = selectors.balances_at_period_end(
        date(2026, 12, 31), employee_ids=[cast.peer.id], today=date(2026, 11, 13)
    )

    # October in full (not posted yet in this test), nothing for November and December.
    assert found.balances == {cast.peer.id: Decimal("2.5")}
