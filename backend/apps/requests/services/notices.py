"""Every notification the request engine sends. Texts are in messages.py under notification.<event>.*.

Parameters carry a name and dates only: never a comment, a reason or a file name (NOT-03).
"""

from __future__ import annotations

from typing import Any

from apps.accounts.roles import Role, users_with_role
from apps.notifications.services import notify, register_event
from apps.organisation import selectors as organisation_selectors

from .common import account_of, hr_users, name_of

REQUEST_LINK = "/requests/{target}"

EVENTS = {
    "step.to_decide": REQUEST_LINK,
    "step.reminder": REQUEST_LINK,
    "step.flagged": REQUEST_LINK,
    "step.informed": REQUEST_LINK,
    "request.approved": REQUEST_LINK,
    "request.rejected": REQUEST_LINK,
    "request.returned": REQUEST_LINK,
    "request.withdrawn": REQUEST_LINK,
    "request.cancelled": REQUEST_LINK,
    "request.corrected": REQUEST_LINK,
    "request.sent_on_behalf": REQUEST_LINK,
    "amendment.submitted": REQUEST_LINK,
    "amendment.approved": REQUEST_LINK,
    "amendment.rejected": REQUEST_LINK,
    "sick.declared": REQUEST_LINK,
    "certificate.due_soon": REQUEST_LINK,
    "certificate.overdue": REQUEST_LINK,
    "hr_step.unattended": "/admin",
}


def register_events() -> None:
    for code, link in EVENTS.items():
        register_event(code, link=link)


def _params(request, **extra: Any) -> dict[str, Any]:
    return {
        "employee": name_of(request.employee),
        "start": f"{request.start_date:%d/%m/%Y}",
        "end": f"{request.end_date:%d/%m/%Y}",
        **extra,
    }


def tell(users, event: str, request, *, dedupe_key: str | None = None, **extra: Any) -> list:
    """Notify these accounts about this request. Duplicates and missing accounts are dropped."""
    unique = list({user.pk: user for user in users if user is not None}.values())
    if not unique:
        return []
    return notify(
        users=unique,
        event=event,
        params=_params(request, **extra),
        target_type="request",
        target_public_id=str(request.public_id),
        dedupe_key=dedupe_key,
    )


def tell_requester(request, event: str, **options: Any) -> list:
    return tell([account_of(request.employee)], event, request, **options)


def tell_hr(request, event: str, **options: Any) -> list:
    return tell(hr_users(excluding=request.employee), event, request, **options)


def tell_sysadmins(event: str, *, dedupe_key: str | None = None) -> list:
    """System Administrators see no business data: the notification carries no name and no date."""
    users = list(users_with_role(Role.SYSADMIN))
    if not users:
        return []
    return notify(users=users, event=event, params={}, dedupe_key=dedupe_key)


def informed_event(request) -> str:
    return "sick.declared" if request.sensitive else "step.informed"


def decide_event(amendment) -> str:
    return "amendment.submitted" if amendment is not None else "step.to_decide"


def everyone_concerned(request, extra=(), *, excluding=None) -> list:
    """The requester and their manager, plus the accounts given in `extra`.

    `excluding` is the account that performed the action: nobody is notified of what they just did.
    """
    users = [account_of(request.employee), organisation_selectors.manager_user(request.employee), *extra]
    return [user for user in users if user is not None and (excluding is None or user.pk != excluding.pk)]
