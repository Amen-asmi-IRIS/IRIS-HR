"""What a departure leaves open (UI 7.9), and what happens to it once the departure is recorded.

Registered with organisation's archive preview and with its departure listeners.
"""

from __future__ import annotations

from django.db.models import Q
from django.utils import timezone

from apps.calendar.lang import pick
from apps.organisation import selectors as organisation_selectors
from apps.organisation.services import ArchiveItem, ArchiveSection

from ..models import AmendmentStatus, ApproverRule, Request, RequestStatus, RequestStep, StepMode, StepStatus
from . import notices
from .chain import resolve_rule
from .common import name_of
from .validation import fmt_range


def _described(request) -> str:
    request_type = request.request_type
    return f"{pick(request_type.name_fr, request_type.name_en)} · {fmt_range(request.start_date, request.end_date)}"


def open_requests_section(employee) -> ArchiveSection | None:
    """The leaver's own requests that still need somebody: waiting, sent back, or approved and not over."""
    today = timezone.localdate()
    found = (
        Request.objects.filter(employee=employee)
        .filter(
            Q(status__in=(RequestStatus.PENDING, RequestStatus.RETURNED))
            | Q(status=RequestStatus.APPROVED, end_date__gte=today)
        )
        .select_related("request_type")
        .order_by("start_date", "pk")
    )
    items = [
        ArchiveItem(label=_described(request), link=f"/requests/{request.public_id}") for request in found
    ]
    return ArchiveSection(key="open_requests", items=items) if items else None


def _steps_waiting_for(employee):
    """Open steps that wait for this person, as line manager of the requester or as the person named."""
    reports = list(organisation_selectors.direct_reports(employee).values_list("pk", flat=True))
    return (
        RequestStep.objects.filter(status=StepStatus.PENDING, mode=StepMode.APPROVE)
        .filter(
            Q(amendment__isnull=True, request__status=RequestStatus.PENDING)
            | Q(amendment__status=AmendmentStatus.PENDING)
        )
        .filter(
            Q(approver_rule=ApproverRule.LINE_MANAGER, request__employee_id__in=reports)
            | Q(approver_rule=ApproverRule.NAMED_PERSON, named_person=employee)
        )
        .select_related("request", "request__request_type", "request__employee", "named_person")
        .order_by("activated_at", "pk")
    )


def open_steps_section(employee) -> ArchiveSection | None:
    """Steps that wait for the leaver, as line manager of the requester or as the person named."""
    items = [
        ArchiveItem(
            label=f"{name_of(step.request.employee)} · {_described(step.request)}",
            link=f"/requests/{step.request.public_id}",
        )
        for step in _steps_waiting_for(employee)
    ]
    return ArchiveSection(key="open_steps", items=items) if items else None


def flag_open_steps(*, employee, actor) -> None:
    """A step that waited for the leaver and that nobody else can decide is flagged to HR at once (master D13).

    Without this it would wait for the hourly job, and for the delay of the step, before HR heard of it.
    """
    now = timezone.now()
    for step in _steps_waiting_for(employee):
        request = step.request
        resolution = resolve_rule(
            rule=step.approver_rule, named_person=step.named_person, requester=request.employee
        )
        if step.flagged_at is not None or resolution.users or resolution.rule == ApproverRule.HR_ROLE:
            continue
        step.flagged_at = now
        step.save(update_fields=["flagged_at"])
        notices.tell_hr(request, "step.flagged", dedupe_key=f"step:{step.pk}:flagged")
