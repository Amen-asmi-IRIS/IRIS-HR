"""What accounts needs to know about employees. Implemented by the organisation app in plan 02 (master D6)."""

from dataclasses import dataclass
from typing import Protocol

from django.db.models import Expression


@dataclass(frozen=True)
class EmployeeRef:
    public_id: str
    full_name: str
    email: str


class EmployeeDirectory(Protocol):
    def candidate(self, public_id: str) -> EmployeeRef | None:
        """An active employee without an account, or None."""

    def candidates(self) -> list[EmployeeRef]:
        """Every active employee without an account."""

    def link(self, *, user_id: int, public_id: str) -> None:
        """Attach the account to the employee record."""

    def ref_for_user(self, user_id: int) -> EmployeeRef | None:
        """The employee record linked to this account, or None."""

    def has_left(self, user_id: int) -> bool:
        """Whether the employee linked to this account has left the company."""

    def name_on_account(self) -> Expression | None:
        """The linked employee's current name, as an expression over accounts (null without employee)."""


class NullEmployeeDirectory:
    """Used until the organisation app registers the real directory."""

    def candidate(self, public_id: str) -> EmployeeRef | None:
        return None

    def candidates(self) -> list[EmployeeRef]:
        return []

    def link(self, *, user_id: int, public_id: str) -> None:
        raise RuntimeError("No employee directory is installed")

    def ref_for_user(self, user_id: int) -> EmployeeRef | None:
        return None

    def has_left(self, user_id: int) -> bool:
        return False

    def name_on_account(self) -> Expression | None:
        return None


_directory: EmployeeDirectory = NullEmployeeDirectory()


def set_employee_directory(directory: EmployeeDirectory) -> None:
    global _directory
    _directory = directory


def employee_directory() -> EmployeeDirectory:
    return _directory
