"""Two requests against one balance at the very same moment (PRD 6.3, review focus 3).

Each action runs on its own database connection, so the lock on the employee really holds: the second
check waits for the first request to commit, then counts the days it holds. Inside one transaction the
second action would never wait, and such a test would prove nothing.
"""

from datetime import date
from decimal import Decimal

import pytest

from apps.balances.tests import flows
from apps.balances.tests.world import at, give_opening
from apps.core.errors import Conflict, DomainError
from apps.requests import selectors as request_selectors
from apps.requests import services as request_services
from apps.requests.tests.test_concurrency import together

pytestmark = [pytest.mark.django_db(transaction=True), pytest.mark.usefixtures("ledger_port")]

SEPT_30 = date(2026, 9, 30)


@pytest.fixture(autouse=True)
def monday_5_october_2026(time_machine):
    time_machine.move_to(at(2026, 10, 5), tick=False)


def refused_for_balance(action):
    """The refusal `together` reports by its code: a request the balance cannot afford."""

    def run():
        try:
            action()
        except DomainError as refusal:
            if "request.balance_insufficient" not in [problem.code for problem in refusal.problems]:
                raise
            raise Conflict("request.balance_insufficient") from None

    return run


def test_two_requests_against_one_balance_sent_at_the_same_moment(world, ledger_settings):
    ledger_settings()
    give_opening(world.owner, "3", SEPT_30)
    first = flows.draft(world, date(2026, 10, 19), date(2026, 10, 21))
    second = flows.draft(world, date(2026, 10, 26), date(2026, 10, 28))

    def send(request):
        return refused_for_balance(lambda: request_services.submit(actor=world.owner_user, request=request))

    outcomes = together(send(first), send(second))

    assert sorted(outcomes) == ["done", "request.balance_insufficient"]
    first.refresh_from_db()
    second.refresh_from_db()
    assert sorted([first.status, second.status]) == ["draft", "pending"]
    assert sum(request_selectors.reserved_days(world.owner.id).values()) == Decimal("3")
