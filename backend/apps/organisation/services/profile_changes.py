from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.accounts.roles import Role, users_with_role
from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError, NotAllowed, Problem
from apps.notifications import services as notifications

from .. import reach
from ..models import ProfileChange, ProfileChangeStatus
from ..selectors import full_name, get_employee
from .employees import update_employee

PROPOSABLE_FIELDS = (
    "first_name",
    "last_name",
    "date_of_birth",
    "gender",
    "personal_email",
    "phone",
    "address",
    "emergency_contact_name",
    "emergency_contact_phone",
)


def ensure_proposable(fields: Iterable[str]) -> None:
    """Contractual fields cannot be proposed (ORG-06). Names every refused field."""
    refused = sorted(set(fields) - set(PROPOSABLE_FIELDS))
    if refused:
        problems = [
            Problem("organisation.field_not_proposable", f"changes.{name}", {"name": name})
            for name in refused
        ]
        raise DomainError(problems[0].code, problems=problems)


def _plain(value: Any) -> Any:
    """A value as it is stored in the proposal: text trimmed, dates as ISO strings."""
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()


def _typed(name: str, value: Any) -> Any:
    if name == "date_of_birth":
        return date.fromisoformat(value) if value else None
    return value or ""


def _locked(change: ProfileChange) -> ProfileChange:
    return (
        ProfileChange.objects.select_for_update(of=("self",))
        .select_related("employee__user")
        .get(pk=change.pk)
    )


@transaction.atomic
def propose_profile_change(*, user, changes: Mapping[str, Any], note: str = "") -> ProfileChange:
    own = reach.employee_of(user)
    if own is None:
        raise NotAllowed()
    ensure_proposable(changes)
    employee = reach.lock_employee(own.id)
    if ProfileChange.objects.filter(employee=employee, status=ProfileChangeStatus.PENDING).exists():
        raise Conflict("organisation.change_already_open")

    different: dict[str, dict[str, Any]] = {}
    for name in PROPOSABLE_FIELDS:
        if name not in changes:
            continue
        old, new = _plain(getattr(employee, name)), _plain(changes[name])
        if (old or None) != (new or None):
            different[name] = {"old": old, "new": new}
    if not different:
        raise DomainError("organisation.nothing_to_change")

    change = ProfileChange.objects.create(employee=employee, changes=different, note=note.strip())
    audit.record(
        action="profile_change.proposed",
        obj=change,
        actor=user,
        object_label=full_name(employee),
        changes={
            name: {"before": values["old"], "after": values["new"]} for name, values in different.items()
        },
    )
    notifications.notify(
        users=[holder for holder in users_with_role(Role.HR) if holder.pk != user.pk],
        event="profile_change.proposed",
        params={"employee": full_name(employee)},
        target_type="profile_change",
        target_public_id=str(change.public_id),
    )
    return change


@transaction.atomic
def decide_profile_change(*, actor, change: ProfileChange, accept: bool, comment: str = "") -> ProfileChange:
    change = _locked(change)
    if change.status != ProfileChangeStatus.PENDING:
        raise Conflict("organisation.change_already_decided")
    own = reach.employee_of(actor)
    if own is not None and own.id == change.employee_id:
        raise NotAllowed()

    change.status = ProfileChangeStatus.ACCEPTED if accept else ProfileChangeStatus.REJECTED
    change.decided_by = actor
    change.decided_at = timezone.now()
    change.comment = comment.strip()
    change.save(update_fields=["status", "decided_by", "decided_at", "comment"])

    employee = get_employee(change.employee.public_id)
    if accept:
        update_employee(
            actor=actor,
            employee=employee,
            data={name: _typed(name, values["new"]) for name, values in change.changes.items()},
        )
    outcome = "accepted" if accept else "rejected"
    audit.record(
        action=f"profile_change.{outcome}", obj=change, actor=actor, object_label=full_name(employee)
    )
    if employee.user_id is not None and employee.user.is_active:
        # A refusal carries HR's comment, when there is one: the employee reads it nowhere else.
        event, params = f"profile_change.{outcome}", {}
        if not accept and change.comment:
            event, params = "profile_change.rejected_with_comment", {"comment": change.comment}
        notifications.notify(
            users=[employee.user],
            event=event,
            params=params,
            target_type="profile_change",
            target_public_id=str(change.public_id),
        )
    return change


@transaction.atomic
def withdraw_profile_change(*, user, change: ProfileChange) -> ProfileChange:
    change = _locked(change)
    own = reach.employee_of(user)
    if own is None or own.id != change.employee_id:
        raise NotAllowed()
    if change.status != ProfileChangeStatus.PENDING:
        raise Conflict("organisation.change_already_decided")
    change.status = ProfileChangeStatus.WITHDRAWN
    change.save(update_fields=["status"])
    audit.record(
        action="profile_change.withdrawn", obj=change, actor=user, object_label=full_name(change.employee)
    )
    return change
