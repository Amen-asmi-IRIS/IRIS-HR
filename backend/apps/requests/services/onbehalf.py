"""What HR does when a decision does not happen in the application (REQ-10, REQ-13)."""

from __future__ import annotations

from datetime import datetime

from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError
from apps.files import services as files_service

from ..models import ApproverRule, Channel, Decision, Request, RequestAttachment, RequestStep
from . import chain, notices
from .attachments import SCANNED_FORM
from .common import account_of, bump, check_version, label, locked, name_of, require_hr_for_other
from .common import note as audit_note


def _locked_step(step, request) -> RequestStep:
    fresh = (
        RequestStep.objects.select_for_update(of=("self",))
        .select_related("amendment", "named_person")
        .get(pk=step.pk)
    )
    fresh.request = request
    return fresh


@transaction.atomic
def record_on_behalf(
    *,
    actor,
    step,
    decided_by,
    decision,
    decided_at: datetime,
    channel,
    note: str,
    scan=None,
    expected_version: int,
) -> Request:
    """Record a decision that its approver gave verbally or on paper (REQ-10)."""
    request = locked(step.request)
    step = _locked_step(step, request)
    require_hr_for_other(actor, request)
    check_version(request, expected_version)
    if not chain.is_open(step, request):
        raise Conflict("request.already_processed")
    if decided_by.pk == request.employee_id:
        raise DomainError("request.own_request", field="decided_by")
    if not chain.could_have_decided(decided_by, step):
        raise DomainError("request.decided_by_not_approver", field="decided_by")
    if channel not in (Channel.VERBAL, Channel.PAPER):
        raise DomainError("request.channel_invalid", field="channel")
    note = note.strip()
    if not note:
        raise DomainError("request.comment_required", field="note")
    if decided_at > timezone.now():
        raise DomainError("request.decided_at_future", field="decided_at")
    decision = Decision(decision)
    if decision == Decision.RETURN and step.amendment_id is not None:
        raise DomainError("request.amendment_cannot_return", field="decision")

    step.status = chain.STEP_STATUS[decision]
    step.decided_by = decided_by
    step.decided_at = decided_at
    step.recorded_by = actor
    step.channel = channel
    step.comment = note
    step.save(update_fields=["status", "decided_by", "decided_at", "recorded_by", "channel", "comment"])
    if scan is not None:
        # A form signed for a sick leave may say why the person is away: it is kept like the certificate.
        attachment = files_service.store_upload(
            actor=actor, upload=scan, kind=SCANNED_FORM, confidential=request.sensitive
        )
        RequestAttachment.objects.create(request=request, attachment=attachment, step=step, added_by=actor)
    bump(request)
    audit.record(
        action="step.recorded_on_behalf",
        obj=request,
        object_label=label(request),
        changes={
            "step": {"before": None, "after": step.position},
            "decision": {"before": None, "after": str(decision.value)},
            "decided_by": {"before": None, "after": name_of(decided_by)},
            "decided_at": {"before": None, "after": decided_at.isoformat()},
            "channel": {"before": None, "after": str(channel)},
            "scan": {"before": None, "after": scan is not None},
            **audit_note(request, "note", note),
        },
        actor=actor,
    )
    chain.apply_decision(request=request, step=step, decision=decision, actor=actor)
    return request


@transaction.atomic
def reassign_step(*, actor, step, new_approver, reason: str) -> RequestStep:
    """Give an open step to another person (REQ-13). Its reminder and flag delays start again."""
    request = locked(step.request)
    step = _locked_step(step, request)
    require_hr_for_other(actor, request)
    if not chain.is_open(step, request):
        raise Conflict("request.already_processed")
    reason = reason.strip()
    if not reason:
        raise DomainError("request.reason_required", field="reason")
    if new_approver.pk == request.employee_id:
        raise DomainError("request.own_request", field="new_approver")
    user = account_of(new_approver)
    if user is None:
        raise DomainError("request.approver_without_account", field="new_approver")
    previous = chain.waiting_names(
        rule=step.approver_rule, named_person=step.named_person, requester=request.employee
    )
    step.approver_rule = ApproverRule.NAMED_PERSON
    step.named_person = new_approver
    step.activated_at = timezone.now()
    step.reminded_at = None
    step.flagged_at = None
    step.save(update_fields=["approver_rule", "named_person", "activated_at", "reminded_at", "flagged_at"])
    bump(request)
    audit.record(
        action="step.reassigned",
        obj=request,
        object_label=label(request),
        changes={
            "step": {"before": None, "after": step.position},
            "approver": {"before": ", ".join(previous), "after": name_of(new_approver)},
            **audit_note(request, "reason", reason),
        },
        actor=actor,
    )
    notices.tell([user], notices.decide_event(step.amendment), request)
    return step
