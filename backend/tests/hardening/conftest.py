import pytest

from tests.hardening.helpers import frozen  # noqa: F401  (a fixture every hardening test may ask for)


@pytest.fixture(autouse=True)
def _real_ledger(request):
    """Every hardening test that uses the cast runs with the real balance port of plan 04."""
    if "world" in request.fixturenames:
        request.getfixturevalue("ledger_port")
