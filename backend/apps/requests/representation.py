"""The one description of a request that every list, queue and detail returns (master 7.9).

It is built for a viewer: the state reads from their angle, the actions are exactly what they may do
now, and whatever they may not read is left out here, on the server.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.accounts.services import display_name
from apps.calendar.lang import active_lang, pick
from apps.core.i18n import translate
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors

from . import selectors
from .models import AmendmentStatus, ApproverRule, RequestStatus, StepMode, StepStatus
from .services import chain, hr_actions
from .services.attachments import visible_attachments
from .services.common import DECIDED, name_of

STATE_KEYS = {
    ApproverRule.LINE_MANAGER: "waiting_manager",
    ApproverRule.HR_ROLE: "waiting_hr",
    ApproverRule.NAMED_PERSON: "waiting_person",
}
STEP_ACTIONS = ("decide", "record_on_behalf", "reassign")
NEEDS_DOCUMENT = ("due", "overdue", "missing")


@dataclass(frozen=True)
class Viewer:
    """Who is looking, computed once per call."""

    user: Any
    employee: Any
    is_hr: bool
    is_exec: bool
    team: frozenset[int]
    today: date
    now: datetime


def viewer_for(user) -> Viewer:
    return Viewer(
        user=user,
        employee=reach.employee_of(user),
        is_hr=has_role(user, Role.HR),
        is_exec=has_role(user, Role.EXEC),
        team=frozenset(reach.team_ids(user)),
        today=timezone.localdate(),
        now=timezone.now(),
    )


# ------------------------------------------------------------------ steps


def _steps_of(request, amendment=None) -> list:
    """The steps of the latest round of the request, or of one amendment, from the prefetched rows."""
    amendment_id = amendment.pk if amendment is not None else None
    mine = [step for step in request.steps.all() if step.amendment_id == amendment_id]
    if not mine:
        return []
    last = max(step.round for step in mine)
    return sorted((step for step in mine if step.round == last), key=lambda step: step.position)


def _open_amendment(request):
    return next((item for item in request.amendments.all() if item.status == AmendmentStatus.PENDING), None)


def _pending(steps):
    return next(
        (step for step in steps if step.status == StepStatus.PENDING and step.mode == StepMode.APPROVE), None
    )


def _resolution(request, step):
    return chain.resolve_rule(
        rule=step.approver_rule, named_person=step.named_person, requester=request.employee
    )


def _waiting(request, steps, resolved: dict) -> tuple[str, list[str]]:
    """The state key and the names for "waiting for …".

    `resolved` holds the resolution of the open step, worked out once for the whole description.
    """
    step = _pending(steps)
    if step is None:
        return "waiting_hr", []
    resolution = resolved.get(step.pk) or _resolution(request, step)
    names = chain.waiting_names(
        rule=step.approver_rule,
        named_person=step.named_person,
        requester=request.employee,
        resolution=resolution,
    )
    return STATE_KEYS[resolution.rule], names


# ------------------------------------------------------------------ pieces of RequestOut


def _state(request, steps, *, private: bool, resolved: dict) -> dict:
    decided = sorted(
        (step for step in steps if step.status in DECIDED and step.decided_at is not None),
        key=lambda step: (step.decided_at, step.position),
    )
    last = decided[-1] if decided else None
    last_actor = name_of(last.decided_by) if last is not None and last.decided_by_id else None
    key: str = request.status
    waiting_on: list[str] = []
    note = None
    since = request.updated_at
    if request.status == RequestStatus.DRAFT:
        since = request.created_at
    elif request.status == RequestStatus.PENDING:
        key, waiting_on = _waiting(request, steps, resolved)
        pending = _pending(steps)
        since = pending.activated_at if pending is not None else request.submitted_at
    elif request.status in (RequestStatus.RETURNED, RequestStatus.REJECTED):
        if last is not None:
            note = last.comment if private else None
            since = last.decided_at
    elif request.status == RequestStatus.APPROVED:
        since = request.decided_at
    return {
        "key": key,
        "waiting_on": waiting_on,
        "last_actor": last_actor,
        "note": note or None,
        "since": since,
    }


def _amendment(request, amendment, resolved: dict) -> dict | None:
    if amendment is None:
        return None
    key, waiting_on = _waiting(request, _steps_of(request, amendment), resolved)
    return {
        "public_id": amendment.public_id,
        "kind": amendment.kind,
        "status": amendment.status,
        "state_key": key,
        "waiting_on": waiting_on,
    }


def _open_step(request, steps, amendment):
    """The step that is waiting for a decision: on the request, or on its open amendment."""
    step = _pending(steps)
    if step is None and amendment is not None:
        step = _pending(_steps_of(request, amendment))
        if step is not None:
            step.amendment = amendment
    if step is not None:
        step.request = request
    return step


def _actions(
    request, viewer: Viewer, *, own: bool, steps, amendment, open_step, decidable: bool
) -> list[str]:
    """Everything this viewer may do on this request now, in display order. The UI shows exactly these."""
    status = request.status
    if status == RequestStatus.DRAFT:
        return ["edit", "submit", "discard", "attach"] if request.created_by_id == viewer.user.pk else []
    actions: list[str] = []
    may_edit = (own and not request.override_reason) or (not own and viewer.is_hr)
    someone_decided = any(step.status in DECIDED for step in steps)
    if status == RequestStatus.RETURNED and may_edit:
        actions += ["edit", "submit"]
    if status == RequestStatus.PENDING and own and not request.override_reason and not someone_decided:
        actions.append("edit")
    if own and status in (RequestStatus.PENDING, RequestStatus.RETURNED):
        actions.append("withdraw")
    if own and status == RequestStatus.APPROVED:
        if amendment is not None:
            actions.append("withdraw_amendment")
        elif request.start_date > viewer.today:
            actions.append("amend")
    if own or viewer.is_hr:
        open_for_files = status in (RequestStatus.PENDING, RequestStatus.RETURNED)
        awaited = status == RequestStatus.APPROVED and (
            selectors.certificate_status(request, now=viewer.now) in NEEDS_DOCUMENT
        )
        if open_for_files or awaited:
            actions.append("attach")
    if decidable:
        actions.append("decide")
    if viewer.is_hr and not own:
        if open_step is not None:
            actions += ["record_on_behalf", "reassign"]
        if status in (RequestStatus.PENDING, RequestStatus.APPROVED):
            if amendment is None:
                actions.append("correct")
            actions.append("cancel")
        if hr_actions.reclassifiable_step(request, viewer.user) is not None:
            actions.append("reclassify")
    return actions


def _relation(request, viewer: Viewer, *, own: bool, decidable: bool) -> str:
    if own:
        return "owner"
    if viewer.is_hr:
        return "hr"
    if decidable:
        return "approver"
    if request.employee_id in viewer.team:
        return "team"
    if viewer.is_exec:
        return "overview"
    return "approver"  # someone a step was given to, or who decided one earlier


# ------------------------------------------------------------------ RequestOut


def _flags(request, viewer: Viewer) -> tuple[bool, bool]:
    own = viewer.employee is not None and viewer.employee.pk == request.employee_id
    private = (not request.sensitive) or own or viewer.is_hr
    return own, private


def reads_private(request, viewer: Viewer) -> bool:
    """Whether this viewer reads what is restricted on this request: the comment, the notes, the files."""
    return _flags(request, viewer)[1]


def represent(request, viewer: Viewer) -> dict:
    """`RequestOut` of master 7.9, with Python values; the serializer turns them into JSON."""
    own, private = _flags(request, viewer)
    steps = _steps_of(request)
    amendment = _open_amendment(request)
    open_step = _open_step(request, steps, amendment)
    # Who the open step is for is worked out once: it says who decides, who is waited for, and the state key.
    resolved = {open_step.pk: _resolution(request, open_step)} if open_step is not None else {}
    decidable = open_step is not None and chain.can_act_on(
        viewer.user, open_step, resolution=resolved[open_step.pk]
    )
    actions = _actions(
        request, viewer, own=own, steps=steps, amendment=amendment, open_step=open_step, decidable=decidable
    )
    request_type = request.request_type
    event = request.exceptional_event if request.exceptional_event_id else None
    certificate = None
    if own or viewer.is_hr:
        certificate = {
            "status": selectors.certificate_status(request, now=viewer.now),
            "due_at": request.certificate_due_at,
        }
    return {
        "public_id": request.public_id,
        "version": request.version,
        "employee": {
            "public_id": request.employee.public_id,
            "name": name_of(request.employee),
            "department": organisation_selectors.department_name(request.employee, active_lang()),
        },
        "type": {
            "code": request_type.code,
            "name": pick(request_type.name_fr, request_type.name_en),
            "unit": request_type.unit,
            "calendar_label": request_type.calendar_label,
        },
        "start_date": request.start_date,
        "end_date": request.end_date,
        "starts_at_midday": request.starts_at_midday,
        "ends_at_midday": request.ends_at_midday,
        "start_time": request.start_time,
        "end_time": request.end_time,
        "quantity": request.quantity,
        "event": {"id": event.pk, "name": pick(event.name_fr, event.name_en)} if event is not None else None,
        "comment": request.comment if private else None,
        "comment_hidden": not private,
        "status": request.status,
        "state": _state(request, steps, private=private, resolved=resolved),
        "certificate": certificate,
        "amendment": _amendment(request, amendment, resolved),
        "has_override": bool(request.override_reason),
        "created_by_hr": request.created_by_id != request.employee.user_id,
        "viewer": {
            "relation": _relation(request, viewer, own=own, decidable=decidable),
            "actions": actions,
            "step_id": open_step.pk
            if open_step is not None and any(a in STEP_ACTIONS for a in actions)
            else None,
        },
        "submitted_at": request.submitted_at,
        "decided_at": request.decided_at,
        "created_at": request.created_at,
    }


# ------------------------------------------------------------------ RequestDetailOut


def _step(request, step, *, private: bool, amendment_ids: dict[int, Any]) -> dict:
    waiting = step.status in (StepStatus.WAITING, StepStatus.PENDING)
    return {
        "id": step.pk,
        "round": step.round,
        "position": step.position,
        "rule": step.approver_rule,
        "mode": step.mode,
        "status": step.status,
        "approvers": chain.waiting_names(
            rule=step.approver_rule, named_person=step.named_person, requester=request.employee
        )
        if waiting
        else [],
        "decided_by": name_of(step.decided_by) if step.decided_by_id else None,
        "decided_at": step.decided_at,
        "recorded_by": display_name(step.recorded_by) if step.recorded_by_id else None,
        "channel": step.channel or None,
        "comment": (step.comment or None) if private else None,
        "amendment_public_id": amendment_ids.get(step.amendment_id),
    }


def _context(request, *, own: bool) -> dict:
    context = selectors.decision_context(request)
    return {
        "balance": {"now": context.balance.now, "after": context.balance.after} if context.balance else None,
        "teammates_away": []
        if own
        else [
            {"name": mate.name, "label": mate.label, "start_date": mate.start_date, "end_date": mate.end_date}
            for mate in context.teammates_away
        ],
        "cap": {"used": context.cap.used, "limit": context.cap.limit} if context.cap else None,
    }


def _reads_context(body: dict) -> bool:
    """The balance and who else is away are for those the request is in the reach of, and for whoever decides now.

    Someone who decided a step from outside the team keeps the request, without the figures of the person.
    """
    viewer = body["viewer"]
    return viewer["relation"] != "approver" or "decide" in viewer["actions"]


def represent_context(request, viewer: Viewer) -> dict:
    """`decision_context` alone, for the approvals queues."""
    own, _ = _flags(request, viewer)
    return _context(request, own=own)


def represent_detail(request, viewer: Viewer) -> dict:
    """`RequestDetailOut`: `RequestOut` plus steps, files, amendments and what is needed to decide."""
    body = represent(request, viewer)
    own, private = _flags(request, viewer)
    amendments = sorted(request.amendments.all(), key=lambda item: (item.created_at, item.pk))
    amendment_ids = {item.pk: item.public_id for item in amendments}
    ordered = sorted(
        request.steps.all(),
        key=lambda step: (step.amendment_id is not None, step.amendment_id or 0, step.round, step.position),
    )
    body["steps"] = [_step(request, step, private=private, amendment_ids=amendment_ids) for step in ordered]
    body["attachments"] = attachment_bodies(request, viewer)
    body["amendments"] = amendment_bodies(request, viewer)
    body["decision_context"] = _context(request, own=own) if _reads_context(body) else None
    return body


def attachment_body(link) -> dict:
    attachment = link.attachment
    return {
        "public_id": attachment.public_id,
        "kind": attachment.kind,
        "name": attachment.original_name,
        "size": attachment.size,
        "uploaded_by": display_name(attachment.uploaded_by),
        "uploaded_at": attachment.uploaded_at,
    }


def attachment_bodies(request, viewer: Viewer) -> list[dict]:
    """The files of a request that this viewer may see, oldest first."""
    return [attachment_body(link) for link in visible_attachments(request, viewer.user)]


def amendment_bodies(request, viewer: Viewer) -> list[dict]:
    """Every change asked for on a request, oldest first. The reason of a sensitive request stays private."""
    _, private = _flags(request, viewer)
    return [
        {
            "public_id": item.public_id,
            "kind": item.kind,
            "status": item.status,
            "reason": item.reason if private else None,
            "new_start_date": item.new_start_date,
            "new_end_date": item.new_end_date,
            "new_quantity": item.new_quantity,
            "created_at": item.created_at,
            "decided_at": item.decided_at,
        }
        for item in sorted(request.amendments.all(), key=lambda item: (item.created_at, item.pk))
    ]


# ------------------------------------------------------------------ preview


def problem_body(problem) -> dict:
    return {
        "field": problem.field,
        "code": problem.code,
        "detail": translate(problem.code, **problem.params),
        "params": dict(problem.params),
    }


def preview_body(preview) -> dict:
    """The preview of master 7.9, with Python values."""
    balance = preview.balance
    cap = preview.cap
    return {
        "quantity": preview.quantity,
        "skipped_days": [{"date": day, "reason": reason} for day, reason in preview.skipped_days],
        "chain": preview.chain,
        "balance": {"now": balance.now, "on_start": balance.on_start, "after": balance.after}
        if balance
        else None,
        "usage": {
            "cap": {"used": cap.used, "limit": cap.limit, "period": cap.period} if cap else None,
            "month_hours": preview.month_hours,
            "event_days_allowed": preview.event_days_allowed,
        },
        "certificate_due_at": preview.certificate_due_at,
        "problems": [problem_body(problem) for problem in preview.problems],
    }
