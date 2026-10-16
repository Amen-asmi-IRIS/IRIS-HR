"""Who decides a step (PRD 6.9), and how a chain moves from one step to the next."""

from __future__ import annotations

from dataclasses import dataclass

from django.utils import timezone

from apps.accounts.roles import Role, has_role, users_with_role
from apps.accounts.services import display_name
from apps.core.i18n import translate
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors

from ..models import (
    AmendmentStatus,
    ApproverRule,
    ChainStep,
    Decision,
    RequestStatus,
    RequestStep,
    StepMode,
    StepStatus,
)
from . import notices, outcomes
from .common import DECIDED, account_of, current_round, name_of, round_steps


@dataclass(frozen=True)
class Resolution:
    """Who may decide a step right now. `rule` is the rule that applied after the fallbacks of 6.9."""

    rule: str
    users: tuple = ()
    skip: bool = False  # line-manager rule, and the requester has no manager at all
    via_exec: bool = False  # HR rule that fell back to Executive Management


@dataclass(frozen=True)
class ChainRow:
    position: int
    rule: str
    mode: str
    approvers: list[str]


def _deciders(role, *, excluded) -> tuple:
    """Active holders of a role who can decide: with an employee record (master 7.9), and not the requester."""
    holders = users_with_role(role).filter(employee__isnull=False)
    return tuple(user for user in holders if user.pk != excluded)


def _hr_resolution(requester) -> Resolution:
    """PRD 6.9 counted with those who can decide (master D47): an HR holder without a record is no HR holder here."""
    requester_account = getattr(requester, "user", None)
    excluded = requester_account.pk if requester_account is not None else None
    holders = _deciders(Role.HR, excluded=excluded)
    if holders:
        return Resolution(rule=ApproverRule.HR_ROLE, users=holders)
    executives = _deciders(Role.EXEC, excluded=excluded)
    return Resolution(rule=ApproverRule.HR_ROLE, users=executives, via_exec=True)


def resolve_rule(*, rule: str, named_person, requester) -> Resolution:
    """Apply an approver rule to a requester (PRD 6.9).

    Line manager: the manager. No manager at all: the step is skipped. A manager who cannot act gives
    nobody (master D13), never a skip; HR then gives the step to someone else (D54).
    Named person: that person; if it is the requester, the step becomes an HR step.
    HR role: every HR holder but the requester, else every executive but the requester, else nobody;
    only those with an employee record count, since nobody else can decide (master D47).
    """
    if rule == ApproverRule.LINE_MANAGER:
        # "No manager" is an empty reporting line and nothing else. A manager who left, or whose account is
        # switched off, is still the manager: the step then waits and HR is told (master D13).
        if requester.manager_id is None:
            return Resolution(rule=ApproverRule.LINE_MANAGER, skip=True)
        user = organisation_selectors.manager_user(requester)
        return Resolution(rule=ApproverRule.LINE_MANAGER, users=(user,) if user is not None else ())
    if rule == ApproverRule.NAMED_PERSON and named_person is not None and named_person.pk != requester.pk:
        user = account_of(named_person)
        return Resolution(rule=ApproverRule.NAMED_PERSON, users=(user,) if user is not None else ())
    return _hr_resolution(requester)


def resolve_approvers(step) -> list:
    """The accounts that may decide this step."""
    resolution = resolve_rule(
        rule=step.approver_rule, named_person=step.named_person, requester=step.request.employee
    )
    return list(resolution.users)


def is_open(step, request) -> bool:
    """A step that is waiting for a decision on a request, or on an amendment, that is itself still pending."""
    if step.status != StepStatus.PENDING or step.mode != StepMode.APPROVE:
        return False
    if step.amendment_id is None:
        return request.status == RequestStatus.PENDING
    return step.amendment.status == AmendmentStatus.PENDING


def is_eligible_approver(user, step, *, resolution: Resolution | None = None) -> bool:
    """Whether this user is one of the people this step is for, whatever the step's status.

    `resolution` is what `resolve_rule` gave for this step, when the caller already has it.
    """
    request = step.request
    me = reach.employee_of(user)
    if me is not None and me.pk == request.employee_id:
        return False  # nobody acts on their own request
    if resolution is None:
        resolution = resolve_rule(
            rule=step.approver_rule, named_person=step.named_person, requester=request.employee
        )
    if any(candidate.pk == user.pk for candidate in resolution.users):
        return True
    # A manager step that HR was alerted about can be decided by HR (permission matrix: "when flagged").
    return step.flagged_at is not None and resolution.rule != ApproverRule.HR_ROLE and has_role(user, Role.HR)


def can_act_on(user, step, *, resolution: Resolution | None = None) -> bool:
    """Whether this user may decide this step now."""
    return (
        is_open(step, step.request)
        and reach.employee_of(user) is not None
        and is_eligible_approver(user, step, resolution=resolution)
    )


def could_have_decided(employee, step) -> bool:
    """Whether a decision of this person can be recorded on this step (REQ-10): one of the people it is for.

    The manager, or the person the step names, counts even without an account that can sign in:
    a decision given verbally or on paper needs none.
    """
    request = step.request
    if employee.pk == request.employee_id:
        return False  # nobody acts on their own request
    resolution = resolve_rule(
        rule=step.approver_rule, named_person=step.named_person, requester=request.employee
    )
    user = account_of(employee)
    if user is not None and is_eligible_approver(user, step, resolution=resolution):
        return True
    if resolution.rule == ApproverRule.LINE_MANAGER:
        return request.employee.manager_id == employee.pk
    if resolution.rule == ApproverRule.NAMED_PERSON:
        return step.named_person_id == employee.pk
    return False


def waiting_names(*, rule: str, named_person, requester, resolution: Resolution | None = None) -> list[str]:
    """The names to show for "waiting for …" and "who will decide". HR is shown as a role, not as people."""
    if resolution is None:
        resolution = resolve_rule(rule=rule, named_person=named_person, requester=requester)
    if resolution.skip:
        return []
    if resolution.rule == ApproverRule.HR_ROLE:
        if resolution.via_exec:
            return [display_name(user) for user in resolution.users]
        return [translate("request.label_hr")]
    if resolution.users:
        return [display_name(user) for user in resolution.users]
    # Somebody is designated but cannot act (master D13): they are still the one being waited for.
    person = requester.manager if resolution.rule == ApproverRule.LINE_MANAGER else named_person
    return [name_of(person)] if person is not None else []


def chain_preview(*, request_type, employee) -> list[ChainRow]:
    """The steps a request of this type would go through for this employee, without the skipped ones."""
    rows: list[ChainRow] = []
    config = (
        ChainStep.objects.filter(request_type=request_type)
        .select_related("named_person")
        .order_by("position")
    )
    for step in config:
        resolution = resolve_rule(rule=step.approver_rule, named_person=step.named_person, requester=employee)
        if resolution.skip:
            continue
        rows.append(
            ChainRow(
                position=step.position,
                rule=resolution.rule,
                mode=step.mode,
                approvers=waiting_names(
                    rule=step.approver_rule, named_person=step.named_person, requester=employee
                ),
            )
        )
    return rows


STEP_STATUS = {
    Decision.APPROVE: StepStatus.APPROVED,
    Decision.REJECT: StepStatus.REJECTED,
    Decision.RETURN: StepStatus.RETURNED,
}


def _hr_safety_step(request, amendment, number: int, position: int) -> RequestStep:
    return RequestStep(
        request=request,
        amendment=amendment,
        round=number,
        position=position,
        approver_rule=ApproverRule.HR_ROLE,
        mode=StepMode.APPROVE,
        status=StepStatus.WAITING,
        reminder_after_days=2,
        flag_after_days=None,
    )


def start_round(*, request, amendment=None, actor) -> None:
    """Copy the type's chain into a new round and wake its first step (REQ-04).

    The copy is what makes later changes to the configuration harmless for requests already sent.
    """
    number = current_round(request, amendment) + 1
    config = ChainStep.objects.filter(request_type=request.request_type).order_by("position")
    rows = [
        RequestStep(
            request=request,
            amendment=amendment,
            round=number,
            position=step.position,
            approver_rule=step.approver_rule,
            mode=step.mode,
            named_person_id=step.named_person_id,
            status=StepStatus.WAITING,
            reminder_after_days=step.reminder_after_days,
            flag_after_days=step.flag_after_days,
        )
        for step in config
    ]
    if not rows:
        rows = [_hr_safety_step(request, amendment, number, 1)]
    RequestStep.objects.bulk_create(rows)
    advance(request=request, amendment=amendment, actor=actor)


def advance(*, request, amendment=None, actor) -> None:
    """Wake the next waiting step of the current round, or finish the round when none is left."""
    now = timezone.now()
    steps = list(round_steps(request, amendment).select_related("named_person"))
    for step in steps:
        if step.status != StepStatus.WAITING:
            continue
        resolution = resolve_rule(
            rule=step.approver_rule, named_person=step.named_person, requester=request.employee
        )
        step.activated_at = now
        if resolution.skip or (step.mode == StepMode.NOTIFY and not resolution.users):
            # Nobody is behind this step (PRD 6.9), or nobody who could be told: it is not recorded as done.
            step.status = StepStatus.SKIPPED
            step.decided_at = now
            step.save(update_fields=["status", "activated_at", "decided_at"])
            continue
        if step.mode == StepMode.NOTIFY:
            step.status = StepStatus.NOTIFIED
            step.decided_at = now
            step.save(update_fields=["status", "activated_at", "decided_at"])
            notices.tell(resolution.users, notices.informed_event(request), request)
            continue
        step.status = StepStatus.PENDING
        if resolution.users:
            notices.tell(resolution.users, notices.decide_event(amendment), request)
        elif resolution.rule == ApproverRule.HR_ROLE:
            notices.tell_sysadmins("hr_step.unattended", dedupe_key=f"step:{step.pk}:unattended")
        else:
            # Somebody is designated but cannot act (master D13): HR is alerted at once.
            step.flagged_at = now
            notices.tell_hr(request, "step.flagged", dedupe_key=f"step:{step.pk}:flagged")
        step.save(update_fields=["status", "activated_at", "flagged_at"])
        return
    if not any(step.status == StepStatus.APPROVED for step in steps):
        # Every step was informed or skipped. A person must still decide (REQ-14).
        position = max(step.position for step in steps) + 1
        _hr_safety_step(request, amendment, steps[0].round, position).save()
        advance(request=request, amendment=amendment, actor=actor)
        return
    outcomes.complete(request=request, amendment=amendment, actor=actor)


def apply_decision(*, request, step, decision, actor) -> None:
    """What a decision on a step does to the request, or to the amendment the step belongs to."""
    amendment = step.amendment
    if decision == Decision.APPROVE:
        advance(request=request, amendment=amendment, actor=actor)
    elif decision == Decision.REJECT:
        outcomes.reject(request=request, amendment=amendment, actor=actor)
    else:
        outcomes.send_back(request=request, actor=actor)


def people_involved(request, amendment=None) -> list:
    """Who should hear that a request stopped: those who could decide now and those who already did."""
    users: list = []
    for step in round_steps(request, amendment).select_related("decided_by", "named_person"):
        if step.status == StepStatus.PENDING:
            resolution = resolve_rule(
                rule=step.approver_rule, named_person=step.named_person, requester=request.employee
            )
            users.extend(resolution.users)
        elif step.status in DECIDED and step.decided_by is not None:
            users.append(account_of(step.decided_by))
    return users
