from datetime import date, time
from decimal import Decimal
from types import SimpleNamespace

import pytest
import time_machine

from apps.balances import services as balance_services
from apps.calendar import services as calendar_services
from apps.reports.tests import scenario
from apps.settings import services as settings_service


@pytest.fixture
def november(world, ledger_port):
    """The hand-calculable November 2026 described at the top of plan 06, on the real ledger."""
    with time_machine.travel(scenario.AFTER_NOVEMBER, tick=False):
        settings_service.clear_cache()
        calendar_services.create_holiday(
            actor=world.hr_user, date=date(2026, 11, 3), name_fr="Jour férié de test", name_en="Test holiday"
        )
        balance_services.post_opening(
            actor=world.hr_user,
            employee=world.owner,
            amount=Decimal("20"),
            effective_date=date(2026, 9, 30),
            reason="Opening balance",
        )
        made = SimpleNamespace()
        made.annual_long = scenario.approved(
            world,
            employee=world.owner,
            request_type=world.annual,
            start=date(2026, 10, 29),
            end=date(2026, 11, 3),
        )
        made.annual_half = scenario.approved(
            world,
            employee=world.owner,
            request_type=world.annual,
            start=date(2026, 11, 13),
            ends_at_midday=True,
        )
        made.sick_half = scenario.approved(
            world,
            employee=world.owner,
            request_type=world.sick,
            start=date(2026, 11, 13),
            starts_at_midday=True,
            comment=scenario.SICK_COMMENT,
        )
        made.remote = scenario.approved(
            world,
            employee=world.owner,
            request_type=world.remote,
            start=date(2026, 11, 18),
            end=date(2026, 11, 19),
        )
        made.permission = scenario.approved(
            world,
            employee=world.owner,
            request_type=world.permission,
            start=date(2026, 11, 24),
            start_time=time(9, 0),
            end_time=time(11, 30),
        )
        made.exceptional = scenario.approved(
            world,
            employee=world.owner,
            request_type=world.exceptional,
            start=date(2026, 11, 30),
            end=date(2026, 12, 1),
            exceptional_event_id=world.event.id,
        )
        made.pending_annual = scenario.pending(
            world,
            employee=world.owner,
            request_type=world.annual,
            start=date(2026, 11, 9),
            end=date(2026, 11, 10),
        )
        made.outsider_sick = scenario.approved(
            world,
            employee=world.outsider,
            request_type=world.sick,
            start=date(2026, 11, 9),
            end=date(2026, 11, 11),
        )
        yield made
    settings_service.clear_cache()
