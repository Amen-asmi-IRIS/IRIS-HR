"""Sending, deciding and withdrawing: the path of a request from draft to its final status."""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.accounts.services import display_name
from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError, NotAllowed, NotFound
from apps.organisation import reach
from apps.settings import services as settings_service

from ..models import Channel, Decision, DocumentRule, Request, RequestStatus, RequestStep
from . import chain, notices, outcomes
from .common import bump, check_version, label, locked, note, require_editor, require_requester
from .data import compute_quantity, data_of
from .validation import validate


def certificate_deadline_hours(request_type) -> int:
    """The type's own deadline if it has one, else the HR setting (master D10)."""
    if request_type.document_deadline_hours is not None:
        return request_type.document_deadline_hours
    return int(settings_service.get("certificate_deadline_hours"))


@transaction.atomic
def submit(*, actor, request, expected_version: int | None = None) -> Request:
    """Send a draft or a returned request (REQ-03, REQ-04, REQ-06).

    The employee row is locked first, so two requests of one person are validated one after the other
    and a double click sends once.
    """
    request = locked(request)
    check_version(request, expected_version)
    if request.status not in (RequestStatus.DRAFT, RequestStatus.RETURNED):
        raise Conflict("request.already_processed")
    require_editor(actor, request)
    request_type = request.request_type
    data = data_of(request)
    problems = validate(
        employee=request.employee,
        request_type=request_type,
        data=data,
        override=bool(request.override_reason),
        ignoring_request_id=request.pk,
    )
    if problems:
        raise DomainError(problems[0].code, problems=problems)
    now = timezone.now()
    previous = request.status
    request.quantity = compute_quantity(request_type, data)
    request.status = RequestStatus.PENDING
    if request.submitted_at is None:
        request.submitted_at = now
    if (
        request_type.document_rule == DocumentRule.REQUIRED_WITHIN_DEADLINE
        and request.certificate_due_at is None
    ):
        request.certificate_due_at = now + timedelta(hours=certificate_deadline_hours(request_type))
    bump(request, "quantity", "status", "submitted_at", "certificate_due_at")
    audit.record(
        action="request.submitted",
        obj=request,
        object_label=label(request),
        changes={"status": {"before": previous, "after": request.status}},
        actor=actor,
    )
    chain.start_round(request=request, actor=actor)
    if actor.pk != request.employee.user_id:
        # Sent in the employee's name by someone else (master D45): the employee hears of it.
        notices.tell_requester(request, "request.sent_on_behalf", by=display_name(actor))
    return request


@transaction.atomic
def decide_step(*, actor, step, decision, comment: str = "", expected_version: int) -> Request:
    """Approve, refuse or send back the step that is waiting (REQ-05).

    Two people acting on the same step queue on the employee lock; the second finds the step
    closed or the version moved and receives "already processed" (REQ-18).
    """
    request = locked(step.request)
    step = (
        RequestStep.objects.select_for_update(of=("self",))
        .select_related("amendment", "named_person")
        .get(pk=step.pk)
    )
    step.request = request
    me = reach.employee_of(actor)
    if me is None:
        raise NotAllowed("request.actor_without_record")
    if me.pk == request.employee_id:
        raise NotAllowed("request.own_request")
    if not chain.is_eligible_approver(actor, step):
        raise NotFound("core.not_found")
    if request.version != expected_version or not chain.is_open(step, request):
        raise Conflict("request.already_processed")
    decision = Decision(decision)
    comment = comment.strip()
    if decision == Decision.REJECT and not comment:
        raise DomainError("request.reason_required", field="comment")
    if decision == Decision.RETURN:
        if step.amendment_id is not None:
            raise DomainError("request.amendment_cannot_return", field="decision")
        if not comment:
            raise DomainError("request.comment_required", field="comment")
    step.status = chain.STEP_STATUS[decision]
    step.decided_by = me
    step.decided_at = timezone.now()
    step.channel = Channel.IN_APP
    step.comment = comment
    step.save(update_fields=["status", "decided_by", "decided_at", "channel", "comment"])
    bump(request)
    audit.record(
        action="step.decided",
        obj=request,
        object_label=label(request),
        changes={
            "step": {"before": None, "after": step.position},
            "decision": {"before": None, "after": str(decision.value)},
            **note(request, "comment", comment),
        },
        actor=actor,
    )
    chain.apply_decision(request=request, step=step, decision=decision, actor=actor)
    return request


@transaction.atomic
def withdraw(*, actor, request) -> Request:
    """The requester takes back a request that is not yet approved (REQ-07)."""
    request = locked(request)
    require_requester(actor, request)
    if request.status not in (RequestStatus.PENDING, RequestStatus.RETURNED):
        raise Conflict("request.not_withdrawable")
    involved = chain.people_involved(request)
    previous = request.status
    outcomes.close_open_steps(request)
    request.status = RequestStatus.WITHDRAWN
    bump(request, "status")
    audit.record(
        action="request.withdrawn",
        obj=request,
        object_label=label(request),
        changes={"status": {"before": previous, "after": request.status}},
        actor=actor,
    )
    notices.tell(involved, "request.withdrawn", request)
    return request
