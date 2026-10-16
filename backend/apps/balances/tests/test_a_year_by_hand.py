from datetime import date, timedelta
from decimal import Decimal

import pytest
import time_machine

from apps.balances import selectors, services
from apps.balances.selectors import BalanceFigures
from apps.balances.tests import flows
from apps.balances.tests.world import at
from apps.requests import services as request_services

pytestmark = pytest.mark.usefixtures("ledger_port")

D = Decimal


def test_a_year_of_one_employee_matches_the_hand_calculation(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    owner = cast.owner

    def month_end_run(month: int) -> None:
        # The run in the first hour of the next month credits the month just over.
        services.post_month_end_credits(today=services.month_end(2026, month) + timedelta(days=1))

    def leave(asked_on, start: date, end: date, **flags):
        with time_machine.travel(asked_on, tick=False):
            return flows.approve(cast, flows.send(cast, start, end, **flags))

    services.post_opening(
        actor=cast.hr_user,
        employee=owner,
        amount=D("4"),
        effective_date=date(2025, 12, 31),
        reason="Balance carried over from the 2025 file",
    )
    month_end_run(1)
    month_end_run(2)
    leave(at(2026, 3, 2), date(2026, 3, 9), date(2026, 3, 13))
    month_end_run(3)
    month_end_run(4)
    leave(at(2026, 5, 18), date(2026, 5, 28), date(2026, 6, 2))
    month_end_run(5)
    month_end_run(6)
    services.adjust(
        actor=cast.hr_user,
        employee=owner,
        amount=D("-1"),
        effective_date=date(2026, 7, 15),
        reason="A day of 2025 recorded twice",
    )
    month_end_run(7)
    august = leave(at(2026, 8, 3), date(2026, 8, 17), date(2026, 8, 21))
    with time_machine.travel(at(2026, 8, 10), tick=False):
        request_services.hr_cancel(actor=cast.hr_user, request=august, reason="Project deadline moved")
    month_end_run(8)
    month_end_run(9)
    leave(at(2026, 10, 1), date(2026, 10, 9), date(2026, 10, 9), ends_at_midday=True)
    month_end_run(10)
    month_end_run(11)
    leave(at(2026, 12, 7), date(2026, 12, 21), date(2026, 12, 24))
    month_end_run(12)

    lines = selectors.ledger_lines(owner.id)

    assert [(line.effective_date, line.kind, line.amount, line.balance_after) for line in lines] == [
        (date(2025, 12, 31), "opening", D("4"), D("4")),
        (date(2026, 1, 31), "credit", D("2.5"), D("6.5")),
        (date(2026, 2, 28), "credit", D("2.5"), D("9")),
        (date(2026, 3, 9), "taken", D("-5"), D("4")),
        (date(2026, 3, 31), "credit", D("2.5"), D("6.5")),
        (date(2026, 4, 30), "credit", D("2.5"), D("9")),
        (date(2026, 5, 28), "taken", D("-2"), D("7")),
        (date(2026, 5, 31), "credit", D("2.5"), D("9.5")),
        (date(2026, 6, 1), "taken", D("-2"), D("7.5")),
        (date(2026, 6, 30), "credit", D("2.5"), D("10")),
        (date(2026, 7, 15), "adjustment", D("-1"), D("9")),
        (date(2026, 7, 31), "credit", D("2.5"), D("11.5")),
        (date(2026, 8, 17), "taken", D("-5"), D("6.5")),
        (date(2026, 8, 17), "restored", D("5"), D("11.5")),
        (date(2026, 8, 31), "credit", D("2.5"), D("14")),
        (date(2026, 9, 30), "credit", D("2.5"), D("16.5")),
        (date(2026, 10, 9), "taken", D("-0.5"), D("16")),
        (date(2026, 10, 31), "credit", D("2.5"), D("18.5")),
        (date(2026, 11, 30), "credit", D("2.5"), D("21")),
        (date(2026, 12, 21), "taken", D("-4"), D("17")),
        (date(2026, 12, 31), "credit", D("2.5"), D("19.5")),
    ]
    # every leave line leads back to its request, the cancelled one included
    assert all(line.request_public_id for line in lines if line.kind in ("taken", "restored"))

    year_end = date(2026, 12, 31)
    assert selectors.balance_on(owner.id, date(2026, 6, 15)) == D("7.5")
    assert selectors.balance_on(owner.id, date(2026, 8, 20)) == D("11.5")
    assert selectors.balances_at(year_end, employee_ids=[owner.id]) == {owner.id: D("19.5")}
    assert selectors.figures(owner.id, today=year_end) == BalanceFigures(
        current=D("19.5"),
        pending=D("0"),
        approved_upcoming=D("0"),
        next_credit_amount=D("2.5"),
        next_credit_date=date(2027, 1, 31),
    )
    # nothing left to post: the year is complete and a new run changes nothing
    assert services.post_month_end_credits(today=year_end) == 0
