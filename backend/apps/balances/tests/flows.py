"""Driving plan 03a's request engine from ledger tests (master plan 7.9)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from apps.requests import selectors as request_selectors
from apps.requests import services as request_services
from apps.requests.models import Decision
from apps.requests.services import RequestData


def draft(
    world, start: date, end: date, *, actor=None, request_type=None, override_reason: str = "", **flags
):
    """A draft for the owner. `flags` go to RequestData (`ends_at_midday=True`, ...)."""
    return request_services.create_draft(
        actor=actor or world.owner_user,
        employee=world.owner,
        request_type=request_type or world.annual,
        data=RequestData(start_date=start, end_date=end, **flags),
        override_reason=override_reason,
    )


def send(world, start: date, end: date, **kwargs):
    """Drafts and submits. Raises what `submit` raises."""
    actor = kwargs.get("actor") or world.owner_user
    return request_services.submit(actor=actor, request=draft(world, start, end, **kwargs))


def decide(world, request, *, approver, queue: str, decision=Decision.APPROVE, comment: str = ""):
    """The approver decides the step that is waiting for them on this request or on its open amendment."""
    request.refresh_from_db()
    step = request_selectors.queue(approver, queue).get(request=request)
    return request_services.decide_step(
        actor=approver, step=step, decision=decision, comment=comment, expected_version=request.version
    )


def approve(world, request):
    """The owner's chain: the line manager, then HR."""
    request = decide(world, request, approver=world.manager_user, queue="mine")
    return decide(world, request, approver=world.hr_user, queue="hr")


def let_hr_finish(world, request):
    """After a reclassification: approve the HR step if the engine left one to decide."""
    request.refresh_from_db()
    if request.status == "pending":
        request = decide(world, request, approver=world.hr_user, queue="hr")
    return request


def problem_codes(error) -> list[str]:
    return [problem.code for problem in error.problems]


def shortfall(error) -> Decimal:
    problem = next(p for p in error.problems if p.code == "request.balance_insufficient")
    return Decimal(str(problem.params["shortfall"]))
