"""Small helpers every lifecycle service uses: who is who, locking, versions, audit snapshots, guards."""

from __future__ import annotations

from typing import Any

from django.db.models import Max, QuerySet

from apps.accounts.roles import Role, has_role, users_with_role
from apps.audit import services as audit
from apps.core.errors import Conflict, NotAllowed
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors

from ..models import Request, RequestStatus, RequestStep, StepStatus

SNAPSHOT_FIELDS = (
    "start_date",
    "end_date",
    "starts_at_midday",
    "ends_at_midday",
    "start_time",
    "end_time",
    "quantity",
    "exceptional_event_id",
    "comment",
    "status",
    "override_reason",
)
DECIDED = (StepStatus.APPROVED, StepStatus.REJECTED, StepStatus.RETURNED)


# ------------------------------------------------------------------ people


def is_requester(user, request) -> bool:
    me = reach.employee_of(user)
    return me is not None and me.pk == request.employee_id


def account_of(employee):
    """The employee's account if they have one that can sign in, else None."""
    user = getattr(employee, "user", None)
    if user is None or not user.is_active:
        return None
    return user


def name_of(employee) -> str:
    return organisation_selectors.full_name(employee)


def hr_users(*, excluding=None) -> list:
    """Active HR holders, without the account of the `excluding` employee (the requester)."""
    excluded = getattr(excluding, "user", None) if excluding is not None else None
    return [user for user in users_with_role(Role.HR) if excluded is None or user.pk != excluded.pk]


# ------------------------------------------------------------------ audit


def label(request) -> str:
    return f"{name_of(request.employee)} {request.start_date:%d/%m/%Y}"


def snapshot(request) -> dict[str, Any]:
    return audit.snapshot(request, SNAPSHOT_FIELDS)


def redacted(request) -> tuple[str, ...]:
    """Fields whose content never enters the audit trail (AUD-05)."""
    return ("comment", "override_reason") if request.sensitive else ()


def changes_since(before: dict[str, Any], request) -> dict[str, Any]:
    return audit.diff(before, snapshot(request), redact=redacted(request))


def note(request, key: str, text: str) -> dict[str, Any]:
    """A free-text reason or comment for the audit trail; on a sensitive request only the fact that it was given."""
    if request.sensitive:
        return {key: {"changed": True}}
    return {key: {"before": None, "after": text}}


def ledger_reason(request, reason: str) -> str:
    """What is written in the leave ledger beside days given back.

    The ledger is read by the employee's manager and by executives. On a sensitive request the words
    HR typed stay out of it: the line then carries no reason.
    """
    return "" if request.sensitive else reason


# ------------------------------------------------------------------ rows and versions


def check_version(request, expected_version: int | None) -> None:
    if expected_version is not None and request.version != expected_version:
        raise Conflict("request.already_processed")


def save(request, *fields: str) -> None:
    request.save(update_fields=[*fields, "updated_at"])


def bump(request, *fields: str) -> None:
    """Save the given fields and move the version on, so that stale decisions are refused (REQ-18)."""
    request.version += 1
    request.save(update_fields=[*fields, "version", "updated_at"])


def locked(request) -> Request:
    """Lock the employee, then the request row, and return the fresh row. Every state change starts here.

    Taking the two locks always in this order is what makes two simultaneous actions queue up.
    """
    reach.lock_employee(request.employee_id)
    return (
        Request.objects.select_for_update(of=("self",))
        .select_related("request_type", "employee", "exceptional_event", "created_by")
        .get(pk=request.pk)
    )


def current_round(request, amendment=None) -> int:
    found = RequestStep.objects.filter(request=request, amendment=amendment).aggregate(last=Max("round"))
    return found["last"] or 0


def round_steps(request, amendment=None) -> QuerySet[RequestStep]:
    """The steps of the latest round of a request, or of one of its amendments, in order."""
    return RequestStep.objects.filter(
        request=request, amendment=amendment, round=current_round(request, amendment)
    ).order_by("position")


def has_decision(request) -> bool:
    """Whether somebody has already decided a step of the current round (REQ-07)."""
    return round_steps(request).filter(status__in=DECIDED).exists()


# ------------------------------------------------------------------ guards


def require_editor(actor, request) -> None:
    """Who may change or send a request that is not decided yet.

    A draft belongs to whoever created it. After that: the requester, unless HR entered it with an
    exception; or HR, for somebody else's request.
    """
    if request.status == RequestStatus.DRAFT:
        if request.created_by_id != actor.pk:
            raise NotAllowed("core.not_allowed")
        return
    own = is_requester(actor, request)
    if own and not request.override_reason:
        return
    if not own and has_role(actor, Role.HR):
        return
    raise NotAllowed("core.not_allowed")


def require_requester(actor, request) -> None:
    if not is_requester(actor, request):
        raise NotAllowed("core.not_allowed")


def require_hr_for_other(actor, request) -> None:
    """HR acting directly on a request (REQ-09, REQ-10): never on their own."""
    if not has_role(actor, Role.HR):
        raise NotAllowed("core.not_allowed")
    if is_requester(actor, request):
        raise NotAllowed("request.own_request")
