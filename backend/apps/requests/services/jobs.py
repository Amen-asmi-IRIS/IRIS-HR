"""The bodies of the scheduled jobs. Each can run any number of times: what it did is remembered on the row."""

from __future__ import annotations

from datetime import datetime, timedelta

from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from apps.calendar import workdays
from apps.settings import services as settings_service

from ..models import (
    AmendmentStatus,
    ApproverRule,
    DocumentRule,
    Request,
    RequestAttachment,
    RequestStatus,
    RequestStep,
    StepMode,
    StepStatus,
)
from . import notices
from .chain import resolve_rule


def send_reminders_and_flags(*, now: datetime | None = None) -> dict[str, int]:
    """Remind approvers of steps left open, and alert HR to manager steps nobody decides (REQ-13).

    Delays are counted in working days from the moment the step became active, with the numbers that
    were copied onto the step when the request was sent. A manager step that nobody can decide any
    more is flagged without waiting for its delay.
    """
    now = now or timezone.now()
    reminded = flagged = 0
    open_steps = (
        RequestStep.objects.filter(
            status=StepStatus.PENDING, mode=StepMode.APPROVE, activated_at__isnull=False
        )
        .filter(
            Q(amendment__isnull=True, request__status=RequestStatus.PENDING)
            | Q(amendment__status=AmendmentStatus.PENDING)
        )
        .select_related("request", "request__employee", "named_person")
    )
    for step in open_steps:
        request = step.request
        elapsed = workdays.working_days_between(step.activated_at, now)
        resolution = resolve_rule(
            rule=step.approver_rule, named_person=step.named_person, requester=request.employee
        )
        stamp = f"{step.activated_at:%Y%m%d%H%M%S}"
        changed: list[str] = []
        if step.reminded_at is None and resolution.users and elapsed >= step.reminder_after_days:
            notices.tell(
                resolution.users, "step.reminder", request, dedupe_key=f"step:{step.pk}:reminder:{stamp}"
            )
            step.reminded_at = now
            changed.append("reminded_at")
            reminded += 1
        # Nobody behind the step any more (an account switched off since): HR hears of it now (master D13).
        stuck = not resolution.users or (step.flag_after_days is not None and elapsed >= step.flag_after_days)
        if step.flagged_at is None and resolution.rule != ApproverRule.HR_ROLE and stuck:
            notices.tell_hr(request, "step.flagged", dedupe_key=f"step:{step.pk}:flagged:{stamp}")
            step.flagged_at = now
            changed.append("flagged_at")
            flagged += 1
        if changed:
            step.save(update_fields=changed)
    return {"reminded": reminded, "flagged": flagged}


def check_certificate_deadlines(*, now: datetime | None = None) -> dict[str, int]:
    """Warn the employee before a certificate is due, and tell HR when it is overdue (PRD 6.5)."""
    now = now or timezone.now()
    warning = timedelta(hours=int(settings_service.get("certificate_warning_hours")))
    due_soon = overdue = 0
    # A file not tied to a step is a certificate; the scan of a signed form is not.
    certificate = RequestAttachment.objects.filter(request_id=OuterRef("pk"), step__isnull=True)
    waiting = Request.objects.filter(
        ~Exists(certificate),
        status=RequestStatus.PENDING,
        certificate_due_at__isnull=False,
        request_type__document_rule=DocumentRule.REQUIRED_WITHIN_DEADLINE,
    ).select_related("employee")
    for request in waiting:
        due = request.certificate_due_at
        if now >= due:
            created = notices.tell_hr(
                request, "certificate.overdue", dedupe_key=f"request:{request.pk}:certificate_overdue"
            )
            overdue += 1 if created else 0
        elif now >= due - warning:
            created = notices.tell_requester(
                request,
                "certificate.due_soon",
                dedupe_key=f"request:{request.pk}:certificate_due_soon",
                due=f"{timezone.localtime(due):%d/%m/%Y %H:%M}",
            )
            due_soon += 1 if created else 0
    return {"due_soon": due_soon, "overdue": overdue}
