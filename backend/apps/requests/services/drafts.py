from __future__ import annotations

from django.db import transaction

from apps.accounts.roles import Role, has_role
from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.organisation import reach

from ..models import Request, RequestStatus
from .common import (
    SNAPSHOT_FIELDS,
    bump,
    changes_since,
    check_version,
    has_decision,
    label,
    locked,
    redacted,
    require_editor,
    require_requester,
    snapshot,
)
from .data import DATA_FIELDS, RequestData, apply_data, compute_quantity, normalise
from .validation import structural_problems, validate


@transaction.atomic
def create_draft(*, actor, employee, request_type, data: RequestData, override_reason: str = "") -> Request:
    """Save a request without sending it (REQ-01). HR may create one for anybody, with an exception (REQ-02)."""
    me = reach.employee_of(actor)
    own = me is not None and me.pk == employee.pk
    is_hr = has_role(actor, Role.HR)
    if not own and not is_hr:
        raise NotAllowed("core.not_allowed")
    override_reason = override_reason.strip()
    if override_reason:
        if not is_hr:
            raise NotAllowed("core.not_allowed")
        if own:
            raise NotAllowed("request.own_request")
    data = normalise(request_type, data)
    problems = structural_problems(request_type=request_type, data=data)
    if problems:
        raise DomainError(problems[0].code, problems=problems)
    request = Request(
        employee=employee,
        request_type=request_type,
        status=RequestStatus.DRAFT,
        created_by=actor,
        override_reason=override_reason,
        sensitive=request_type.is_sensitive,
    )
    apply_data(request, data)
    request.comment = data.comment.strip()
    request.quantity = compute_quantity(request_type, data)
    request.save()
    audit.record(
        action="request.created",
        obj=request,
        object_label=label(request),
        changes=audit.diff(dict.fromkeys(SNAPSHOT_FIELDS), snapshot(request), redact=redacted(request)),
        actor=actor,
    )
    return request


@transaction.atomic
def update_request(*, actor, request, data: RequestData, expected_version: int) -> Request:
    """Edit a draft, a returned request, or a pending request that nobody has decided yet (REQ-07)."""
    request = locked(request)
    check_version(request, expected_version)
    require_editor(actor, request)
    request_type = request.request_type
    data = normalise(request_type, data)
    if request.status in (RequestStatus.DRAFT, RequestStatus.RETURNED):
        problems = structural_problems(request_type=request_type, data=data)
    elif request.status == RequestStatus.PENDING and not has_decision(request):
        # While it waits, a request is changed by its requester alone (REQ-07). HR corrects it, with a reason.
        require_requester(actor, request)
        problems = validate(
            employee=request.employee,
            request_type=request_type,
            data=data,
            override=bool(request.override_reason),
            ignoring_request_id=request.pk,
        )
    else:
        raise Conflict("request.not_editable")
    if problems:
        raise DomainError(problems[0].code, problems=problems)
    before = snapshot(request)
    apply_data(request, data)
    request.comment = data.comment.strip()
    request.quantity = compute_quantity(request_type, data)
    bump(request, *DATA_FIELDS, "quantity")
    audit.record(
        action="request.updated",
        obj=request,
        object_label=label(request),
        changes=changes_since(before, request),
        actor=actor,
    )
    return request


@transaction.atomic
def discard_draft(*, actor, request) -> None:
    """Delete a draft that was never sent (master D21). The discard itself is audited."""
    request = locked(request)
    require_editor(actor, request)
    if request.status != RequestStatus.DRAFT or request.submitted_at is not None:
        raise Conflict("request.not_editable")
    audit.record(
        action="request.discarded",
        obj=request,
        object_label=label(request),
        changes=audit.diff(snapshot(request), dict.fromkeys(SNAPSHOT_FIELDS), redact=redacted(request)),
        actor=actor,
    )
    request.delete()
