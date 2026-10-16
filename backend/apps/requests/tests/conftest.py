import pytest
import time_machine

from apps.requests import ports
from apps.requests.tests.helpers import NOW, FakePort


@pytest.fixture(autouse=True)
def clock():
    """Every test of this app runs on Tuesday 6 October 2026, 09:00 in Tunis. Move it with clock.move_to(...)."""
    with time_machine.travel(NOW, tick=False) as traveller:
        yield traveller


@pytest.fixture(autouse=True)
def port():
    """Every test of this app talks to a fake balance port, whatever port the project has installed."""
    previous = ports.balance_port()
    fake = FakePort()
    ports.set_balance_port(fake)
    yield fake
    ports.set_balance_port(previous)
