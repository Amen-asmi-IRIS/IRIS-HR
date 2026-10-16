from datetime import date
from decimal import Decimal

import pytest

from apps.organisation import selectors as organisation_selectors
from apps.requests import ports as request_ports
from apps.requests import selectors as request_selectors
from apps.settings import services as settings_service


@pytest.fixture
def ledger_settings(monkeypatch):
    """Fixes the two ledger settings for a test: `ledger_settings(rate="2.5", start=date(...))`.

    Every other setting key still reaches the real settings service.
    """
    values: dict[str, object] = {}
    real_get = settings_service.get

    def fake_get(key: str):
        return values[key] if key in values else real_get(key)

    monkeypatch.setattr(settings_service, "get", fake_get)

    def configure(*, rate: str = "2.5", start: date | None = None) -> None:
        values["monthly_credit_days"] = Decimal(rate)
        values["credit_start_date"] = start

    return configure


@pytest.fixture
def real_settings():
    """For the few tests that read or write a setting for real: start and end with an empty cache."""
    settings_service.clear_cache()
    yield
    settings_service.clear_cache()


@pytest.fixture
def cast(world):
    """The standard cast with a known hire date, so that every credit is a full month."""
    organisation_selectors.all_employees().update(hire_date=date(2020, 1, 6))
    for name in ("ceo", "hr", "manager", "owner", "peer", "other_manager", "outsider"):
        getattr(world, name).refresh_from_db()
    return world


@pytest.fixture
def reservations(monkeypatch):
    """Replaces the days held by pending requests with a fixed set, so ledger tests need no requests.

    `hold = reservations; hold(employee, {date(2026, 11, 2): "1"})`. Without a call, nobody holds anything.
    """
    held: dict[int, dict[date, Decimal]] = {}

    def fake_reserved_days(
        employee_id: int, *, ignoring_request_id: int | None = None
    ) -> dict[date, Decimal]:
        return dict(held.get(employee_id, {}))

    monkeypatch.setattr(request_selectors, "reserved_days", fake_reserved_days)

    def hold(employee, held_days: dict[date, str]) -> None:
        held[employee.id] = {day: Decimal(portion) for day, portion in held_days.items()}

    return hold


# Read when pytest imports this file: Django has started, no fixture has run yet.
_PORT_AT_START_UP = request_ports.balance_port()


@pytest.fixture
def port_at_start_up():
    """The port that was installed when Django started."""
    return _PORT_AT_START_UP
