"""Requests for report tests: entered by HR with an exception, through plan 03a's helpers."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from apps.requests import services as request_services
from apps.requests.services import RequestData
from apps.requests.tests import helpers as request_helpers

AFTER_NOVEMBER = datetime(2026, 12, 1, 9, 0, tzinfo=ZoneInfo("Africa/Tunis"))
SICK_COMMENT = "Migraine, see Dr Karray"
EXCEPTION = "Scenario data"


def _options(world, employee, request_type, start: date, end: date | None, flags: dict) -> dict:
    return {
        "employee": employee,
        "actor": world.hr_user,
        "request_type": request_type,
        "data": RequestData(start_date=start, end_date=end or start, **flags),
        "override_reason": EXCEPTION,
    }


def approved(world, *, employee, request_type, start: date, end: date | None = None, **flags):
    """A request approved at every step by whoever may decide it. `flags` are RequestData fields."""
    return request_helpers.approved(world, **_options(world, employee, request_type, start, end, flags))


def pending(world, *, employee, request_type, start: date, end: date | None = None, **flags):
    """The same request, sent and left undecided."""
    return request_helpers.submitted(world, **_options(world, employee, request_type, start, end, flags))


def approve_fully(request):
    """Take a pending request through the rest of its chain."""
    current = request_helpers.fresh(request)
    while current.status == "pending":
        step = request_helpers.pending_step(current)
        approver = request_services.resolve_approvers(step)[0]
        current = request_services.decide_step(
            actor=approver, step=step, decision="approve", expected_version=current.version
        )
    return current
