from __future__ import annotations

from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.audit import services as audit
from apps.core.errors import DomainError, NotAllowed, Problem
from apps.notifications import services as notifications

from .. import reach
from ..models import Delegation, Employee, EmployeeStatus
from ..selectors import direct_reports, full_name

# An end that the daily job missed for longer than this is no longer announced.
_ANNOUNCE_ENDS_FOR_DAYS = 7


def _label(delegation: Delegation) -> str:
    return f"{full_name(delegation.manager)} → {full_name(delegation.delegate)}"


def _may_manage(actor, manager: Employee) -> bool:
    """The system and HR act for any manager; anyone else only for themselves."""
    if actor is None or has_role(actor, Role.HR):
        return True
    own = reach.employee_of(actor)
    return own is not None and own.id == manager.id


def _page(user) -> str:
    """Where the announcement leads. My team is closed to a delegate who manages nobody once it is over."""
    return "/team/delegations" if reach.team_ids(user) else "/me"


def _announce(delegation: Delegation, kind: str) -> int:
    people = (delegation.manager, delegation.delegate)
    users = [person.user for person in people if person.user_id is not None and person.user.is_active]
    created = 0
    for user in users:
        created += len(
            notifications.notify(
                users=[user],
                event=f"delegation.{kind}",
                params={
                    "manager": full_name(delegation.manager),
                    "delegate": full_name(delegation.delegate),
                    "start": delegation.start_date.strftime("%d/%m/%Y"),
                    "end": delegation.end_date.strftime("%d/%m/%Y"),
                    "page": _page(user),
                },
                target_type="delegation",
                target_public_id=str(delegation.public_id),
                dedupe_key=f"delegation:{delegation.public_id}:{kind}",
            )
        )
    return created


@transaction.atomic
def create_delegation(
    *,
    actor,
    manager: Employee,
    delegate: Employee,
    start_date: date,
    end_date: date,
    today: date | None = None,
) -> Delegation:
    today = today or timezone.localdate()
    if not _may_manage(actor, manager):
        raise NotAllowed()
    # Two requests at the same moment (a double click) must not both pass the overlap check below.
    reach.lock_employee(manager.pk)

    problems: list[Problem] = []
    if start_date < today:
        problems.append(Problem("organisation.delegation_dates", "start_date"))
    elif end_date < start_date:
        problems.append(Problem("organisation.delegation_dates", "end_date"))
    if delegate.pk == manager.pk:
        problems.append(Problem("organisation.delegation_self", "delegate"))
    elif delegate.status != EmployeeStatus.ACTIVE:
        problems.append(Problem("organisation.delegation_delegate_inactive", "delegate"))
    if manager.status == EmployeeStatus.ARCHIVED or not direct_reports(manager).exists():
        problems.append(Problem("organisation.delegation_not_manager", "manager"))
    if not problems:
        overlapping = Delegation.objects.filter(
            manager=manager, ended_at__isnull=True, start_date__lte=end_date, end_date__gte=start_date
        )
        if overlapping.exists():
            problems.append(Problem("organisation.delegation_overlap", "start_date"))
    if problems:
        raise DomainError(problems[0].code, problems=problems)

    delegation = Delegation.objects.create(
        manager=manager, delegate=delegate, start_date=start_date, end_date=end_date, created_by=actor
    )
    audit.record(
        action="delegation.created",
        obj=delegation,
        actor=actor,
        object_label=_label(delegation),
        changes={
            "start_date": {"before": None, "after": start_date.isoformat()},
            "end_date": {"before": None, "after": end_date.isoformat()},
        },
    )
    if start_date <= today:
        _announce(delegation, "started")
    return delegation


@transaction.atomic
def close_delegation(*, actor, delegation: Delegation, today: date) -> Delegation:
    """Ends a running delegation or cancels an upcoming one, without asking who the actor is.

    For use inside this package (ending on request, ending on departure); callers check rights first.
    """
    delegation = (
        Delegation.objects.select_for_update(of=("self",))
        .select_related("manager__user", "delegate__user")
        .get(pk=delegation.pk)
    )
    if delegation.ended_at is not None or delegation.end_date < today:
        return delegation  # already over
    started = delegation.start_date <= today
    delegation.ended_at = timezone.now()
    delegation.save(update_fields=["ended_at"])
    audit.record(
        action="delegation.ended" if started else "delegation.cancelled",
        obj=delegation,
        actor=actor,
        object_label=_label(delegation),
    )
    if started:
        _announce(delegation, "ended")
    return delegation


@transaction.atomic
def end_delegation(*, actor, delegation: Delegation, today: date | None = None) -> Delegation:
    if not _may_manage(actor, delegation.manager):
        raise NotAllowed()
    return close_delegation(actor=actor, delegation=delegation, today=today or timezone.localdate())


@transaction.atomic
def announce_delegation_transitions(*, today: date | None = None) -> int:
    """Tells manager and delegate when a delegation starts and when it runs out. Safe to run any number of times."""
    today = today or timezone.localdate()
    open_ones = Delegation.objects.filter(ended_at__isnull=True).select_related(
        "manager__user", "delegate__user"
    )
    created = 0
    for delegation in open_ones.filter(start_date__lte=today, end_date__gte=today):
        created += _announce(delegation, "started")
    recently = today - timedelta(days=_ANNOUNCE_ENDS_FOR_DAYS)
    for delegation in open_ones.filter(end_date__lt=today, end_date__gte=recently):
        created += _announce(delegation, "ended")
    return created
