import pytest


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    """Append-only tables stay protected against UPDATE and DELETE, but may be emptied between tests."""
    from tests.db import disable_truncate_guards

    with django_db_blocker.unblock():
        disable_truncate_guards()


@pytest.fixture(scope="session", autouse=True)
def _test_only_settings():
    """No HR setting exists before plan 03a; the suite registers a few of its own."""
    import apps.settings.tests.world  # noqa: F401


@pytest.fixture(autouse=True)
def _fast_password_hashing(request, settings):
    """Argon2 is slow on purpose. Tests use a fast hasher unless marked `real_hasher`."""
    if request.node.get_closest_marker("real_hasher") is None:
        settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@pytest.fixture(autouse=True)
def _fresh_settings_cache():
    """Settings are cached per process; no test may see another test's values."""
    from apps.settings import services as settings_service

    settings_service.clear_cache()
    yield
    settings_service.clear_cache()


@pytest.fixture
def world(db):
    """The standard cast (master 6.11)."""
    from tests.world import build_world

    return build_world()


@pytest.fixture
def anon_client():
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def client_for():
    """`client_for(user)` returns an API client signed in as that user."""
    from rest_framework.test import APIClient

    def build(user):
        client = APIClient()
        client.force_login(user)
        return client

    return build


from apps.files.testing import files_root  # noqa: E402, F401


@pytest.fixture(autouse=True)
def _null_balance_port():
    """Every test runs without balances unless it asks for `ledger_port` (plan 04).

    `apps.balances` installs the ledger behind the request engine when Django starts; the request
    engine's own tests were written against the null port and state no balance.
    """
    from apps.requests import ports

    installed = ports.balance_port()
    ports.set_balance_port(ports.NullBalancePort())
    yield
    ports.set_balance_port(installed)


@pytest.fixture
def ledger_port(_null_balance_port):
    """Puts the real ledger behind the request engine for one test."""
    from apps.balances.port import LedgerBalancePort
    from apps.requests import ports

    ports.set_balance_port(LedgerBalancePort())
