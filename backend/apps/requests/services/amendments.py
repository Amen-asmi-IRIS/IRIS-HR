"""Changing or cancelling a request after it was approved (REQ-08)."""

from __future__ import annotations

from dataclasses import replace

from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError

from ..models import Amendment, AmendmentKind, AmendmentStatus, RequestStatus
from . import chain, notices, outcomes
from .common import bump, label, locked, note, require_requester
from .data import RequestData, compute_quantity, data_of, normalise
from .validation import validate


@transaction.atomic
def open_amendment(*, actor, request, kind, data: RequestData | None, reason: str) -> Amendment:
    """Ask to change the dates of, or to cancel, an approved request that has not started.

    The original stays in force and the balance is untouched until the amendment is approved.
    """
    request = locked(request)
    require_requester(actor, request)
    if request.status != RequestStatus.APPROVED:
        raise Conflict("request.not_editable")
    if request.start_date <= timezone.localdate():
        raise Conflict("request.not_started_only")
    if Amendment.objects.filter(request=request, status=AmendmentStatus.PENDING).exists():
        raise Conflict("request.amendment_open")
    reason = reason.strip()
    if not reason:
        raise DomainError("request.reason_required", field="reason")
    kind = AmendmentKind(kind)
    request_type = request.request_type
    current = data_of(request)
    amendment = Amendment(
        request=request,
        kind=kind,
        reason=reason,
        status=AmendmentStatus.PENDING,
        requested_by=actor,
        previous_start_date=request.start_date,
        previous_end_date=request.end_date,
        previous_starts_at_midday=request.starts_at_midday,
        previous_ends_at_midday=request.ends_at_midday,
        previous_start_time=request.start_time,
        previous_end_time=request.end_time,
        previous_quantity=request.quantity,
    )
    if kind == AmendmentKind.CHANGE:
        if data is None:
            raise DomainError("request.dates_required", field="start_date")
        new = normalise(
            request_type,
            replace(data, exceptional_event_id=current.exceptional_event_id, comment=current.comment),
        )
        if new == current:
            raise DomainError("request.nothing_to_change", field="start_date")
        problems = validate(
            employee=request.employee, request_type=request_type, data=new, ignoring_request_id=request.pk
        )
        if problems:
            raise DomainError(problems[0].code, problems=problems)
        amendment.new_start_date = new.start_date
        amendment.new_end_date = new.end_date
        amendment.new_starts_at_midday = new.starts_at_midday
        amendment.new_ends_at_midday = new.ends_at_midday
        amendment.new_start_time = new.start_time
        amendment.new_end_time = new.end_time
        amendment.new_quantity = compute_quantity(request_type, new)
    amendment.save()
    bump(request)
    audit.record(
        action="amendment.opened",
        obj=request,
        object_label=label(request),
        changes={
            "kind": {"before": None, "after": str(kind.value)},
            "dates": {
                "before": f"{request.start_date:%Y-%m-%d}/{request.end_date:%Y-%m-%d}",
                "after": None
                if kind == AmendmentKind.CANCEL
                else f"{amendment.new_start_date:%Y-%m-%d}/{amendment.new_end_date:%Y-%m-%d}",
            },
            **note(request, "reason", reason),
        },
        actor=actor,
    )
    chain.start_round(request=request, amendment=amendment, actor=actor)
    return amendment


@transaction.atomic
def withdraw_amendment(*, actor, amendment) -> Amendment:
    request = locked(amendment.request)
    amendment = Amendment.objects.select_for_update().get(pk=amendment.pk)
    amendment.request = request
    require_requester(actor, request)
    if amendment.status != AmendmentStatus.PENDING:
        raise Conflict("request.already_processed")
    involved = chain.people_involved(request, amendment)
    outcomes.close_open_steps(request, amendment)
    amendment.status = AmendmentStatus.WITHDRAWN
    amendment.decided_at = timezone.now()
    amendment.save(update_fields=["status", "decided_at"])
    bump(request)
    audit.record(
        action="amendment.withdrawn",
        obj=request,
        object_label=label(request),
        changes={"amendment": {"before": "pending", "after": "withdrawn"}},
        actor=actor,
    )
    notices.tell(involved, "request.withdrawn", request)
    return amendment
