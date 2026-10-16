"""What HR may do directly on any request but its own (REQ-09, PRD 6.5)."""

from __future__ import annotations

from dataclasses import replace

from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.organisation import reach

from ..models import (
    Amendment,
    AmendmentStatus,
    BalanceEffect,
    Channel,
    Request,
    RequestStatus,
    RequestType,
    StepStatus,
    Unit,
)
from ..ports import balance_port
from . import chain, notices, outcomes
from .common import (
    bump,
    changes_since,
    label,
    ledger_reason,
    locked,
    note,
    require_hr_for_other,
    round_steps,
    snapshot,
)
from .data import (
    DATA_FIELDS,
    RequestData,
    apply_data,
    compute_quantity,
    data_of,
    day_diff,
    leave_days,
    normalise,
)
from .validation import validate

OPEN_TO_HR = (RequestStatus.PENDING, RequestStatus.APPROVED)
ANNUAL_CODE = "annual"


@transaction.atomic
def hr_correct(*, actor, request, data: RequestData, reason: str) -> Request:
    """Change the dates of a pending or approved request, even one that has started or ended."""
    request = locked(request)
    require_hr_for_other(actor, request)
    if request.status not in OPEN_TO_HR:
        raise Conflict("request.already_processed")
    if Amendment.objects.filter(request=request, status=AmendmentStatus.PENDING).exists():
        raise Conflict("request.amendment_open")
    reason = reason.strip()
    if not reason:
        raise DomainError("request.reason_required", field="reason")
    request_type = request.request_type
    current = data_of(request)
    new = normalise(
        request_type,
        replace(data, exceptional_event_id=current.exceptional_event_id, comment=current.comment),
    )
    if new == current:
        raise DomainError("request.nothing_to_change", field="start_date")
    # A correction is an HR decision with a reason: limits are lifted, shape and overlap are not.
    problems = validate(
        employee=request.employee,
        request_type=request_type,
        data=new,
        override=True,
        ignoring_request_id=request.pk,
    )
    if problems:
        raise DomainError(problems[0].code, problems=problems)
    before = snapshot(request)
    old_days = leave_days(request_type, current)
    apply_data(request, new)
    request.quantity = compute_quantity(request_type, new)
    if (
        request.status == RequestStatus.APPROVED
        and request_type.balance_effect == BalanceEffect.DEDUCTS_ANNUAL
    ):
        released, added = day_diff(old_days, leave_days(request_type, new))
        if released:
            balance_port().post_restored(
                request_id=request.pk,
                employee_id=request.employee_id,
                days=released,
                actor=actor,
                reason=ledger_reason(request, reason),
            )
        if added:
            balance_port().post_taken(
                request_id=request.pk, employee_id=request.employee_id, days=added, actor=actor
            )
    bump(request, *DATA_FIELDS, "quantity")
    audit.record(
        action="request.corrected",
        obj=request,
        object_label=label(request),
        changes={**changes_since(before, request), **note(request, "reason", reason)},
        actor=actor,
    )
    notices.tell(notices.everyone_concerned(request, excluding=actor), "request.corrected", request)
    return request


@transaction.atomic
def hr_cancel(*, actor, request, reason: str) -> Request:
    """Cancel a pending or approved request. Approved days go back to the balance."""
    request = locked(request)
    require_hr_for_other(actor, request)
    if request.status not in OPEN_TO_HR:
        raise Conflict("request.already_processed")
    reason = reason.strip()
    if not reason:
        raise DomainError("request.reason_required", field="reason")
    request_type = request.request_type
    was_approved = request.status == RequestStatus.APPROVED
    involved = chain.people_involved(request)
    change = Amendment.objects.filter(request=request, status=AmendmentStatus.PENDING).first()
    if change is not None:
        involved += chain.people_involved(request, change)
        outcomes.close_open_steps(request, change)
        change.status = AmendmentStatus.WITHDRAWN
        change.decided_at = timezone.now()
        change.save(update_fields=["status", "decided_at"])
    if not was_approved:
        outcomes.close_open_steps(request)
    elif request_type.balance_effect == BalanceEffect.DEDUCTS_ANNUAL:
        days = leave_days(request_type, data_of(request))
        if days:
            balance_port().post_restored(
                request_id=request.pk,
                employee_id=request.employee_id,
                days=days,
                actor=actor,
                reason=ledger_reason(request, reason),
            )
    previous = request.status
    request.status = RequestStatus.CANCELLED
    bump(request, "status")
    audit.record(
        action="request.cancelled",
        obj=request,
        object_label=label(request),
        changes={"status": {"before": previous, "after": request.status}, **note(request, "reason", reason)},
        actor=actor,
    )
    notices.tell(notices.everyone_concerned(request, involved, excluding=actor), "request.cancelled", request)
    return request


def reclassifiable_step(request, user):
    """The open step whose decision can be "count it as annual leave" (PRD 6.5), or None."""
    request_type = request.request_type
    if request.status != RequestStatus.PENDING or not request_type.is_sensitive:
        return None
    if request_type.unit != Unit.DAY or request_type.balance_effect != BalanceEffect.NONE:
        return None
    for step in round_steps(request).filter(status=StepStatus.PENDING).select_related("named_person"):
        step.request = request
        if chain.can_act_on(user, step):
            return step
    return None


@transaction.atomic
def reclassify_as_annual(*, actor, request, override_reason: str = "") -> Request:
    """Count a sick leave as annual leave instead. This is the HR decision on the request (master D17).

    The whole request changes type. Its comment and files stay restricted to the employee and HR.
    """
    request = locked(request)
    require_hr_for_other(actor, request)
    me = reach.employee_of(actor)
    if me is None:
        raise NotAllowed("request.actor_without_record")
    step = reclassifiable_step(request, actor)
    annual = RequestType.objects.filter(code=ANNUAL_CODE, is_active=True).first()
    if step is None or annual is None:
        raise Conflict("request.not_reclassifiable")
    override_reason = override_reason.strip()
    data = data_of(request)
    if not override_reason:
        verdict = balance_port().check(
            employee_id=request.employee_id, new_days=leave_days(annual, data), ignoring_request_id=request.pk
        )
        if not verdict.ok:
            raise DomainError(
                "request.balance_insufficient", field="override_reason", shortfall=verdict.shortfall
            )
    former = request.request_type
    request.reclassified_from = former
    request.request_type = annual
    request.certificate_due_at = None
    request.quantity = compute_quantity(annual, data)
    if override_reason:
        request.override_reason = override_reason
    step.status = StepStatus.APPROVED
    step.decided_by = me
    step.decided_at = timezone.now()
    step.channel = Channel.IN_APP
    step.save(update_fields=["status", "decided_by", "decided_at", "channel"])
    bump(request, "request_type", "reclassified_from", "certificate_due_at", "quantity", "override_reason")
    changes = {"type": {"before": former.code, "after": annual.code}}
    if override_reason:
        changes.update(note(request, "override_reason", override_reason))
    audit.record(
        action="request.reclassified", obj=request, object_label=label(request), changes=changes, actor=actor
    )
    notices.tell_requester(request, "request.corrected")
    chain.advance(request=request, actor=actor)
    return request
