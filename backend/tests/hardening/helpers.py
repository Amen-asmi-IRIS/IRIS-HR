"""Shared builders for the hardening suite. Only master-plan interfaces are used."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
import time_machine
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.balances import services as balance_services
from apps.requests import services as request_services
from apps.requests.models import Decision, Request, RequestStep, StepStatus
from apps.requests.services import RequestData

# Monday 2 November 2026, 09:00 in Tunis (UTC+1).
NOW = datetime(2026, 11, 2, 8, 0, tzinfo=UTC)
TODAY = date(2026, 11, 2)

MARKER = "ZZMARKERZZ"

PDF_BYTES = (
    b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n"
    b"trailer\n<< /Root 1 0 R >>\n%%EOF\n"
)


def pdf(name: str = "document.pdf") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, PDF_BYTES, content_type="application/pdf")


@pytest.fixture
def frozen():
    with time_machine.travel(NOW, tick=False) as traveller:
        yield traveller


def give_balance(world, employee, days: str) -> None:
    """Post an opening balance dated the day before the frozen clock."""
    balance_services.post_opening(
        actor=world.hr_user,
        employee=employee,
        amount=Decimal(days),
        effective_date=date(2026, 11, 1),
        reason="Opening balance for tests",
    )


def make_request(
    world,
    *,
    user,
    employee,
    request_type,
    start: date,
    end: date,
    comment: str = "",
    submit: bool = True,
    **flags,
) -> Request:
    data = RequestData(start_date=start, end_date=end, comment=comment, **flags)
    request = request_services.create_draft(
        actor=user, employee=employee, request_type=request_type, data=data
    )
    if submit:
        request = request_services.submit(actor=user, request=request)
    return request


def pending_step(request: Request) -> RequestStep | None:
    return (
        RequestStep.objects.filter(request=request, amendment__isnull=True, status=StepStatus.PENDING)
        .order_by("-round", "position")
        .first()
    )


def decide(request: Request, user, decision: Decision = Decision.APPROVE, comment: str = "") -> Request:
    request.refresh_from_db()
    step = pending_step(request)
    assert step is not None, "no pending step to decide"
    return request_services.decide_step(
        actor=user, step=step, decision=decision, comment=comment, expected_version=request.version
    )


def approve_fully(world, request: Request) -> Request:
    """Approve the owner's or the peer's request: line manager, then HR."""
    request = decide(request, world.manager_user)
    return decide(request, world.hr_user)
