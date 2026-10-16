"""Dates, builders and fakes shared by the tests of the requests app."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.core.files.uploadedfile import SimpleUploadedFile

from apps.requests import services
from apps.requests.models import Request, RequestStatus, RequestStep, StepStatus
from apps.requests.ports import BalancePreview, BalanceVerdict
from apps.requests.services import RequestData, compute_quantity

TUNIS = ZoneInfo("Africa/Tunis")
NOW = dt.datetime(2026, 10, 6, 9, 0, tzinfo=TUNIS)  # a Tuesday
TODAY = NOW.date()

# The reference week for leave dates, four weeks after TODAY.
MON = dt.date(2026, 11, 2)
TUE = dt.date(2026, 11, 3)
WED = dt.date(2026, 11, 4)
THU = dt.date(2026, 11, 5)
FRI = dt.date(2026, 11, 6)
SAT = dt.date(2026, 11, 7)
SUN = dt.date(2026, 11, 8)
NEXT_MON = dt.date(2026, 11, 9)
NEXT_TUE = dt.date(2026, 11, 10)


def at(month: int, day: int, hour: int = 9, minute: int = 0, year: int = 2026) -> dt.datetime:
    return dt.datetime(year, month, day, hour, minute, tzinfo=TUNIS)


def days(start: dt.date, end: dt.date | None = None, **extra) -> RequestData:
    return RequestData(start_date=start, end_date=end or start, **extra)


def hours(day: dt.date, start: str = "09:00", end: str = "11:00", **extra) -> RequestData:
    return RequestData(
        start_date=day,
        end_date=day,
        start_time=dt.time.fromisoformat(start),
        end_time=dt.time.fromisoformat(end),
        **extra,
    )


def stored(
    world, *, employee=None, request_type=None, data=None, status=RequestStatus.APPROVED, created_by=None
):
    """A request written straight to the database, for tests that need existing rows without the lifecycle."""
    employee = employee or world.owner
    request_type = request_type or world.annual
    data = data or days(MON)
    return Request.objects.create(
        employee=employee,
        request_type=request_type,
        start_date=data.start_date,
        end_date=data.end_date,
        starts_at_midday=data.starts_at_midday,
        ends_at_midday=data.ends_at_midday,
        start_time=data.start_time,
        end_time=data.end_time,
        exceptional_event_id=data.exceptional_event_id,
        comment=data.comment,
        quantity=compute_quantity(request_type, data),
        status=status,
        created_by=created_by or world.owner_user,
        sensitive=request_type.is_sensitive,
    )


class FakePort:
    """A balance port that records every call. Set `ok = False` to make the balance insufficient."""

    def __init__(self) -> None:
        self.ok = True
        self.shortfall = Decimal("1.5")
        self.checks: list[dict] = []
        self.taken: list[dict] = []
        self.restored: list[dict] = []

    def check(self, *, employee_id, new_days, ignoring_request_id=None):
        self.checks.append(
            {
                "employee_id": employee_id,
                "new_days": dict(new_days),
                "ignoring_request_id": ignoring_request_id,
            }
        )
        if self.ok:
            return BalanceVerdict(ok=True)
        return BalanceVerdict(
            ok=False, shortfall=self.shortfall, first_negative_on=min(new_days, default=None)
        )

    def preview(self, *, employee_id, new_days, ignoring_request_id=None):
        total = sum(new_days.values(), Decimal("0"))
        return BalancePreview(now=Decimal("10"), on_start=Decimal("12.5"), after=Decimal("10") - total)

    def post_taken(self, *, request_id, employee_id, days, actor):
        self.taken.append(
            {"request_id": request_id, "employee_id": employee_id, "days": dict(days), "actor": actor}
        )

    def post_restored(self, *, request_id, employee_id, days, actor, reason):
        self.restored.append(
            {
                "request_id": request_id,
                "employee_id": employee_id,
                "days": dict(days),
                "actor": actor,
                "reason": reason,
            }
        )


def fresh(instance):
    """The same row read again, with no cached relations."""
    return type(instance).objects.get(pk=instance.pk)


def draft(world, *, employee=None, actor=None, request_type=None, data=None, override_reason=""):
    """A draft created through the service, by the employee unless another actor is given."""
    employee = employee or world.owner
    return services.create_draft(
        actor=actor or employee.user,
        employee=employee,
        request_type=request_type or world.annual,
        data=data or days(MON),
        override_reason=override_reason,
    )


def submitted(world, **options):
    """A request that was created and sent by the same person."""
    request = draft(world, **options)
    return services.submit(actor=request.created_by, request=request, expected_version=request.version)


def steps(request) -> list[RequestStep]:
    """Every step of the request itself (not of its amendments), oldest round first."""
    return list(RequestStep.objects.filter(request=request, amendment=None).order_by("round", "position"))


def pending_step(request, amendment=None) -> RequestStep:
    return RequestStep.objects.select_related("request", "amendment").get(
        request=request, amendment=amendment, status=StepStatus.PENDING
    )


def decide(request, by, decision="approve", comment=""):
    """Decide the step that is waiting on this request, as `by`, with the current version."""
    current = fresh(request)
    return services.decide_step(
        actor=by,
        step=pending_step(current),
        decision=decision,
        comment=comment,
        expected_version=current.version,
    )


def approved(world, **options):
    """A request taken through its whole chain by whoever may decide each step."""
    request = submitted(world, **options)
    while request.status == RequestStatus.PENDING:
        step = pending_step(request)
        approver = services.resolve_approvers(step)[0]
        request = services.decide_step(
            actor=approver, step=step, decision="approve", expected_version=request.version
        )
    return request


def pdf(name: str = "certificat.pdf") -> SimpleUploadedFile:
    return SimpleUploadedFile(
        name, b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n", content_type="application/pdf"
    )
