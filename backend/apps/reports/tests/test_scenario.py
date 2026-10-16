from datetime import date
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.balances import selectors as balance_selectors
from apps.requests import selectors as request_selectors

pytestmark = pytest.mark.django_db


def test_the_clock_is_frozen_after_november(november):
    assert timezone.localdate() == date(2026, 12, 1)


def test_every_scenario_request_reached_its_status(november):
    for name in (
        "annual_long",
        "annual_half",
        "sick_half",
        "remote",
        "permission",
        "exceptional",
        "outsider_sick",
    ):
        assert getattr(november, name).status == "approved", name
    assert november.pending_annual.status == "pending"


def test_quantities_match_the_table_of_the_plan(november):
    assert november.annual_long.quantity == Decimal("3")  # 29 Oct, 30 Oct, 2 Nov; 3 Nov is a holiday
    assert november.annual_half.quantity == Decimal("0.5")
    assert november.sick_half.quantity == Decimal("0.5")
    assert november.remote.quantity == Decimal("2")
    assert november.permission.quantity == Decimal("2.5")
    assert november.exceptional.quantity == Decimal("2")
    assert november.outsider_sick.quantity == Decimal("3")


def test_the_real_ledger_is_behind_the_requests(world, november):
    # Opening 20, less the three days of the long leave and the half day of 13 November.
    assert balance_selectors.balance_on(world.owner.id, date(2026, 11, 30)) == Decimal("16.5")


def test_day_rows_see_the_scenario(world, november):
    rows = request_selectors.day_rows(
        start=date(2026, 11, 1), end=date(2026, 11, 30), statuses=["approved"], employee_ids=[world.owner.id]
    )

    days = sorted(row.day for row in rows)
    assert days[0] == date(2026, 11, 2)
    assert date(2026, 11, 3) not in days
    assert days[-1] == date(2026, 11, 30)
    assert sum(1 for row in rows if row.day == date(2026, 11, 13)) == 2
