"""The test clock of plan 05, and short wrappers around plan 03a's request helpers."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from apps.balances.tests.world import give_opening
from apps.requests import services as request_services
from apps.requests.services import RequestData
from apps.requests.tests import helpers as request_helpers

# Monday 2 November 2026, 08:00 in Tunis. The calendar and home tests freeze the clock here:
# 2 to 6 November are working days, and no demo holiday falls in November.
NOW = datetime(2026, 11, 2, 8, 0, tzinfo=ZoneInfo("Africa/Tunis"))


def give_balance(world, employee, days: str = "20") -> None:
    """An opening balance, for tests that read balances or run with the real ledger (`ledger_port`)."""
    give_opening(employee, days)


def send(world, *, employee, user, request_type, start: date, end: date, **flags):
    """A request created and sent by `user` for `employee`. `flags` are RequestData fields."""
    return request_helpers.submitted(
        world,
        employee=employee,
        actor=user,
        request_type=request_type,
        data=RequestData(start_date=start, end_date=end, **flags),
    )


def approved(world, *, employee, user, request_type, start: date, end: date, **flags):
    """The same request, approved at every step by whoever may decide it."""
    return request_helpers.approved(
        world,
        employee=employee,
        actor=user,
        request_type=request_type,
        data=RequestData(start_date=start, end_date=end, **flags),
    )


def decide(request, decision: str, comment: str = ""):
    """Decide the step that is waiting, as the first person who may act on it."""
    step = request_helpers.pending_step(request_helpers.fresh(request))
    approver = request_services.resolve_approvers(step)[0]
    return request_helpers.decide(request, approver, decision, comment)
