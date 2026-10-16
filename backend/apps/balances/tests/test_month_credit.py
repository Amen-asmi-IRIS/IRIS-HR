from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
import time_machine
from django.urls import reverse

from apps.balances import services
from apps.balances.tests.world import at
from apps.organisation import services as organisation_services
from apps.settings import services as settings_service

LONG_AGO = date(2020, 1, 6)


def person(hired: date, left: date | None = None, status: str = "active"):
    """Stands in for an Employee: the rule reads only these three attributes."""
    return SimpleNamespace(hire_date=hired, archived_at=left, status="archived" if left else status)


def test_a_full_month_earns_the_monthly_rate(ledger_settings):
    ledger_settings()

    assert services.month_credit(person(LONG_AGO), 2026, 3) == Decimal("2.5")


def test_the_rate_is_the_setting(ledger_settings):
    ledger_settings(rate="2")

    assert services.month_credit(person(LONG_AGO), 2026, 4) == Decimal("2")
    # joined 16 April: 15 of 30 days, 2 x 15 / 30 = 1.0
    assert services.month_credit(person(date(2026, 4, 16)), 2026, 4) == Decimal("1")


@pytest.mark.parametrize(
    ("hired", "year", "month", "expected"),
    [
        (date(2026, 3, 1), 2026, 3, "2.5"),  # the first day is a full month
        (date(2026, 3, 16), 2026, 3, "1.5"),  # 16 of 31 days: 1.29 -> 1.5
        (date(2026, 3, 25), 2026, 3, "0.5"),  # 7 of 31 days: 0.56 -> 0.5
        (date(2026, 3, 31), 2026, 3, "0"),  # 1 of 31 days: 0.08 -> 0
        (date(2026, 2, 15), 2026, 2, "1.5"),  # 14 of 28 days: exactly 1.25, the tie goes up
        (date(2028, 2, 15), 2028, 2, "1.5"),  # leap February, 15 of 29 days: 1.29 -> 1.5
        (date(2028, 2, 20), 2028, 2, "1"),  # leap February, 10 of 29 days: 0.86 -> 1.0
    ],
)
def test_the_month_of_joining_is_pro_rated(ledger_settings, hired, year, month, expected):
    ledger_settings()

    assert services.month_credit(person(hired), year, month) == Decimal(expected)


@pytest.mark.parametrize(
    ("left", "expected"),
    [
        (date(2026, 11, 30), "2.5"),  # the last day is a full month
        (date(2026, 11, 15), "1.5"),  # 15 of 30 days: exactly 1.25, the tie goes up
        (date(2026, 11, 10), "1"),  # 10 of 30 days: 0.83 -> 1.0
        (date(2026, 11, 1), "0"),  # 1 of 30 days: 0.08 -> 0
    ],
)
def test_the_month_of_leaving_is_pro_rated(ledger_settings, left, expected):
    ledger_settings()

    assert services.month_credit(person(LONG_AGO, left), 2026, 11) == Decimal(expected)


def test_joining_and_leaving_in_the_same_month(ledger_settings):
    ledger_settings()

    # 10 to 20 November: 11 of 30 days, 0.92 -> 1.0
    assert services.month_credit(person(date(2026, 11, 10), date(2026, 11, 20)), 2026, 11) == Decimal("1")


def test_nothing_is_earned_outside_employment(ledger_settings):
    ledger_settings()

    assert services.month_credit(person(date(2026, 3, 16)), 2026, 2) == Decimal("0")
    assert services.month_credit(person(LONG_AGO, date(2026, 11, 10)), 2026, 12) == Decimal("0")


def test_a_suspended_employee_earns_the_credit(ledger_settings):
    ledger_settings()

    assert services.month_credit(person(LONG_AGO, status="suspended"), 2026, 3) == Decimal("2.5")


def test_an_archived_record_without_a_leaving_date_earns_nothing(ledger_settings):
    ledger_settings()
    leaver = SimpleNamespace(hire_date=LONG_AGO, archived_at=None, status="archived")

    assert services.month_credit(leaver, 2026, 3) == Decimal("0")


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("0", "0"),
        ("0.24", "0"),
        ("0.74", "0.5"),
        ("0.75", "1"),
        ("1.24", "1"),
        ("1.25", "1.5"),
        ("1.26", "1.5"),
        ("2.5", "2.5"),
    ],
)
def test_rounding_to_the_nearest_half_sends_ties_up(value, expected):
    assert services.round_to_half(Decimal(value)) == Decimal(expected)


def test_month_end_knows_leap_years():
    assert services.month_end(2026, 2) == date(2026, 2, 28)
    assert services.month_end(2028, 2) == date(2028, 2, 29)
    assert services.period_of(2026, 3) == "2026-03"


def test_the_leaving_date_is_read_from_an_archived_employee(world, ledger_settings):
    """Guards the one assumption this plan makes about plan 02's model: where the leaving date is kept."""
    ledger_settings()
    owner = world.owner
    owner.hire_date = LONG_AGO
    owner.save(update_fields=["hire_date"])

    with time_machine.travel(at(2026, 11, 10), tick=False):
        organisation_services.archive_employee(
            actor=world.hr_user, employee=owner, leaving_date=date(2026, 11, 10), reason="Resignation"
        )
    owner.refresh_from_db()

    assert services.leaving_date(owner) == date(2026, 11, 10)
    assert services.month_credit(owner, 2026, 11) == Decimal("1")
    assert services.month_credit(owner, 2026, 12) == Decimal("0")


def test_the_two_settings_are_registered_with_their_defaults(db, real_settings):
    assert services.monthly_rate() == Decimal("2.5")
    assert services.credit_start_date() is None


def test_hr_sets_the_credit_start_date_through_the_api(world, client_for, real_settings):
    response = client_for(world.hr_user).put(
        reverse("settings:hr-item", kwargs={"key": "credit_start_date"}),
        {"value": "2026-01-01"},
        format="json",
    )

    assert response.status_code == 200
    settings_service.clear_cache()
    assert services.credit_start_date() == date(2026, 1, 1)
