"""The ledger behind the request engine's balance port (master plan 7.9)."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from decimal import Decimal

from django.utils import timezone

from apps.requests.ports import BalancePreview, BalanceVerdict, set_balance_port

from . import selectors, services

# What the request engine passes as the reason of days given back by a change or a cancellation the employee
# asked for (plan 03a): a code, not words anyone typed. The line links to its request, whose history says why.
AMENDMENT = "amendment"


class LedgerBalancePort:
    """Implements `apps.requests.ports.BalancePort` on the annual-leave ledger.

    The request engine calls `check` inside its lock on the employee (`reach.lock_employee`), so two
    requests against one balance are checked one after the other.
    """

    def check(
        self,
        *,
        employee_id: int,
        new_days: Mapping[date, Decimal],
        ignoring_request_id: int | None = None,
    ) -> BalanceVerdict:
        verdict = selectors.affordability(employee_id, new_days, ignoring_request_id=ignoring_request_id)
        return BalanceVerdict(
            ok=verdict.ok, shortfall=verdict.shortfall, first_negative_on=verdict.first_negative_on
        )

    def preview(
        self,
        *,
        employee_id: int,
        new_days: Mapping[date, Decimal],
        ignoring_request_id: int | None = None,
    ) -> BalancePreview | None:
        """`now`: posted today; `on_start`: projected on the first day without the new days; `after`: with them."""
        if not new_days:
            return None
        return BalancePreview(
            now=selectors.balance_on(employee_id, timezone.localdate()),
            on_start=selectors.projected_balance(
                employee_id, min(new_days), ignoring_request_id=ignoring_request_id
            ),
            after=selectors.projected_balance(
                employee_id, max(new_days), extra_days=new_days, ignoring_request_id=ignoring_request_id
            ),
        )

    def post_taken(self, *, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor) -> None:
        services.post_taken(request_id=request_id, employee_id=employee_id, days=days, actor=actor)

    def post_restored(
        self, *, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor, reason: str
    ) -> None:
        services.post_restored(
            request_id=request_id,
            employee_id=employee_id,
            days=days,
            actor=actor,
            reason="" if reason == AMENDMENT else reason,
        )


def install() -> None:
    set_balance_port(LedgerBalancePort())
