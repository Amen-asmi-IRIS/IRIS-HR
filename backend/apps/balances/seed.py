"""Demo balances for development and browser tests."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.accounts.roles import Role, users_with_role
from apps.organisation import selectors as organisation_selectors
from apps.settings import services as settings_service

from . import selectors, services

# Left without an opening balance: the browser test of plan 04 records it by hand.
WITHOUT_OPENING = "employee.b1@impactrisks.com"
OPENING_DAYS = Decimal("12")


def _first_day_of_month(today: date, months_back: int) -> date:
    year, month = today.year, today.month - months_back
    while month < 1:
        year, month = year - 1, month + 12
    return date(year, month, 1)


def seed() -> None:
    """Idempotent: a second run adds nothing."""
    hr_user = users_with_role(Role.HR).first()
    today = timezone.localdate()

    if services.credit_start_date() is None:
        start = _first_day_of_month(today, 3)
        settings_service.set_value(actor=hr_user, key="credit_start_date", value=start.isoformat())
        settings_service.clear_cache()
    start = services.credit_start_date()

    for employee in organisation_selectors.directory():
        if employee.professional_email == WITHOUT_OPENING or selectors.has_opening(employee.id):
            continue
        # Someone who joined after the credits started has nothing to carry over: the credits are their balance.
        if employee.hire_date >= start:
            continue
        services.post_opening(
            actor=hr_user,
            employee=employee,
            amount=OPENING_DAYS,
            effective_date=start - timedelta(days=1),
            reason="Reliquat repris à la mise en service",
        )

    services.post_month_end_credits(today=today)
