import pytest

from apps.accounts.ports import employee_directory, set_employee_directory
from apps.accounts.tests.directory import StubDirectory


@pytest.fixture
def directory():
    """Installs a stub employee directory for one test."""
    previous = employee_directory()
    stub = StubDirectory()
    set_employee_directory(stub)
    yield stub
    set_employee_directory(previous)
