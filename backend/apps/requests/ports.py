"""The one door between requests and the annual-leave ledger.

`requests` defines the port and calls it; `balances` (plan 04) implements it and installs itself with
`set_balance_port` when Django starts. Until then the null port accepts every request and knows no balance.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Protocol


@dataclass(frozen=True)
class BalanceVerdict:
    ok: bool
    shortfall: Decimal = Decimal("0")
    first_negative_on: date | None = None


@dataclass(frozen=True)
class BalancePreview:
    now: Decimal
    on_start: Decimal
    after: Decimal


class BalancePort(Protocol):
    def check(
        self, *, employee_id: int, new_days: Mapping[date, Decimal], ignoring_request_id: int | None = None
    ) -> BalanceVerdict: ...

    def preview(
        self, *, employee_id: int, new_days: Mapping[date, Decimal], ignoring_request_id: int | None = None
    ) -> BalancePreview | None: ...

    def post_taken(
        self, *, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor: Any | None
    ) -> None: ...

    def post_restored(
        self,
        *,
        request_id: int,
        employee_id: int,
        days: Mapping[date, Decimal],
        actor: Any | None,
        reason: str,
    ) -> None: ...


class NullBalancePort:
    def check(self, *, employee_id, new_days, ignoring_request_id=None) -> BalanceVerdict:
        return BalanceVerdict(ok=True)

    def preview(self, *, employee_id, new_days, ignoring_request_id=None) -> BalancePreview | None:
        return None

    def post_taken(self, *, request_id, employee_id, days, actor) -> None:
        return None

    def post_restored(self, *, request_id, employee_id, days, actor, reason) -> None:
        return None


_port: BalancePort = NullBalancePort()


def set_balance_port(port: BalancePort) -> None:
    global _port
    _port = port


def balance_port() -> BalancePort:
    return _port
