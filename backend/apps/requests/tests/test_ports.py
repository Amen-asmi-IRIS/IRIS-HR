from decimal import Decimal

from apps.requests import ports
from apps.requests.ports import NullBalancePort
from apps.requests.tests.helpers import MON


def test_the_null_port_accepts_everything_and_knows_no_balance():
    null = NullBalancePort()
    verdict = null.check(employee_id=1, new_days={MON: Decimal("1")})
    assert (verdict.ok, verdict.shortfall, verdict.first_negative_on) == (True, Decimal("0"), None)
    assert null.preview(employee_id=1, new_days={MON: Decimal("1")}) is None
    assert null.post_taken(request_id=1, employee_id=1, days={MON: Decimal("1")}, actor=None) is None
    assert (
        null.post_restored(request_id=1, employee_id=1, days={MON: Decimal("1")}, actor=None, reason="x")
        is None
    )


def test_the_installed_port_is_the_one_the_engine_gets(port):
    assert ports.balance_port() is port


def test_set_balance_port_replaces_the_port():
    mine = NullBalancePort()
    ports.set_balance_port(mine)
    assert ports.balance_port() is mine
