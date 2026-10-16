"""What happens to a request when its chain reaches a result."""

from __future__ import annotations

from django.utils import timezone

from apps.audit import services as audit
from apps.core.errors import DomainError

from ..models import (
    AmendmentKind,
    AmendmentStatus,
    BalanceEffect,
    RequestStatus,
    StepStatus,
)
from ..ports import balance_port
from . import notices
from .common import label, round_steps, save
from .data import DATA_FIELDS, amendment_data, apply_data, compute_quantity, data_of, day_diff, leave_days
from .validation import validate


def close_open_steps(request, amendment=None) -> None:
    """Steps of the current round that nobody will decide any more are recorded as skipped."""
    round_steps(request, amendment).filter(status__in=(StepStatus.WAITING, StepStatus.PENDING)).update(
        status=StepStatus.SKIPPED
    )


def _status_change(before: str, after: str) -> dict:
    return {"status": {"before": before, "after": after}}


def approve_request(*, request, actor) -> None:
    """Final approval. The balance is checked a second time (PRD 6.3) and the days are posted."""
    request_type = request.request_type
    deducts = request_type.balance_effect == BalanceEffect.DEDUCTS_ANNUAL
    days = leave_days(request_type, data_of(request))
    if deducts and not request.override_reason:
        verdict = balance_port().check(
            employee_id=request.employee_id, new_days=days, ignoring_request_id=request.pk
        )
        if not verdict.ok:
            raise DomainError("request.balance_insufficient", shortfall=verdict.shortfall)
    previous = request.status
    request.status = RequestStatus.APPROVED
    request.decided_at = timezone.now()
    save(request, "status", "decided_at")
    if deducts and days:
        balance_port().post_taken(
            request_id=request.pk, employee_id=request.employee_id, days=days, actor=actor
        )
    audit.record(
        action="request.approved",
        obj=request,
        object_label=label(request),
        changes=_status_change(previous, request.status),
        actor=actor,
    )
    notices.tell_requester(request, "request.approved")


def reject(*, request, amendment, actor) -> None:
    """A refusal closes the request, or only the amendment when the step belonged to one."""
    now = timezone.now()
    if amendment is not None:
        close_open_steps(request, amendment)
        amendment.status = AmendmentStatus.REJECTED
        amendment.decided_at = now
        amendment.save(update_fields=["status", "decided_at"])
        audit.record(
            action="amendment.rejected",
            obj=request,
            object_label=label(request),
            changes={"amendment": {"before": "pending", "after": "rejected"}},
            actor=actor,
        )
        notices.tell_requester(request, "amendment.rejected")
        return
    previous = request.status
    close_open_steps(request)
    request.status = RequestStatus.REJECTED
    request.decided_at = now
    save(request, "status", "decided_at")
    audit.record(
        action="request.rejected",
        obj=request,
        object_label=label(request),
        changes=_status_change(previous, request.status),
        actor=actor,
    )
    notices.tell_requester(request, "request.rejected")


def send_back(*, request, actor) -> None:
    """Return the request to its requester for correction (REQ-06). It reserves nothing while returned."""
    previous = request.status
    close_open_steps(request)
    request.status = RequestStatus.RETURNED
    save(request, "status")
    audit.record(
        action="request.returned",
        obj=request,
        object_label=label(request),
        changes=_status_change(previous, request.status),
        actor=actor,
    )
    notices.tell_requester(request, "request.returned")


def apply_amendment(*, request, amendment, actor) -> None:
    """Final approval of an amendment (REQ-08): the request is moved or cancelled, and only then."""
    amendment.request = request
    request_type = request.request_type
    deducts = request_type.balance_effect == BalanceEffect.DEDUCTS_ANNUAL
    old_days = leave_days(request_type, data_of(request))
    before = {field: getattr(request, field) for field in ("start_date", "end_date", "quantity", "status")}
    if amendment.kind == AmendmentKind.CANCEL:
        if deducts and old_days:
            balance_port().post_restored(
                request_id=request.pk,
                employee_id=request.employee_id,
                days=old_days,
                actor=actor,
                reason="amendment",
            )
        request.status = RequestStatus.CANCELLED
        save(request, "status")
    else:
        new = amendment_data(amendment)
        # Rules that depend on today are judged as of the day the change was asked for;
        # overlap and balance are judged now, because other requests may have arrived since.
        problems = validate(
            employee=request.employee,
            request_type=request_type,
            data=new,
            ignoring_request_id=request.pk,
            today=timezone.localdate(amendment.created_at),
        )
        if problems:
            raise DomainError(problems[0].code, problems=problems)
        released, added = day_diff(old_days, leave_days(request_type, new))
        if deducts and released:
            balance_port().post_restored(
                request_id=request.pk,
                employee_id=request.employee_id,
                days=released,
                actor=actor,
                reason="amendment",
            )
        if deducts and added:
            balance_port().post_taken(
                request_id=request.pk, employee_id=request.employee_id, days=added, actor=actor
            )
        apply_data(request, new)
        request.quantity = compute_quantity(request_type, new)
        save(request, *DATA_FIELDS, "quantity")
    amendment.status = AmendmentStatus.APPROVED
    amendment.decided_at = timezone.now()
    amendment.save(update_fields=["status", "decided_at"])
    after = {field: getattr(request, field) for field in before}
    audit.record(
        action="amendment.approved",
        obj=request,
        object_label=label(request),
        changes={
            field: {"before": str(before[field]), "after": str(after[field])}
            for field in before
            if before[field] != after[field]
        },
        actor=actor,
    )
    notices.tell_requester(request, "amendment.approved")


def complete(*, request, amendment, actor) -> None:
    """Called when every step of a round is done and at least one person approved."""
    if amendment is None:
        approve_request(request=request, actor=actor)
    else:
        apply_amendment(request=request, amendment=amendment, actor=actor)
