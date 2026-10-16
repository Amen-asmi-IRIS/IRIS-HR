from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models import Exists, F, OuterRef, Q, QuerySet
from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.accounts.services import display_name
from apps.audit import selectors as audit_selectors
from apps.calendar import workdays
from apps.core.errors import DomainError, NotAllowed, NotFound
from apps.core.i18n import all_messages, translate
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors

from .models import (
    Amendment,
    AmendmentKind,
    AmendmentStatus,
    ApproverRule,
    BalanceEffect,
    CalendarLabel,
    DocumentRule,
    ExceptionalEvent,
    Request,
    RequestAttachment,
    RequestStatus,
    RequestStep,
    RequestType,
    StepMode,
    StepStatus,
    Unit,
)
from .ports import BalancePreview, balance_port
from .services import chain
from .services.common import name_of
from .services.data import amendment_data, data_of, day_diff, leave_days
from .services.validation import CapUsage, cap_usage


def request_types(*, active_only: bool) -> QuerySet[RequestType]:
    types = RequestType.objects.order_by("sort_order", "code")
    return types.filter(is_active=True) if active_only else types


def get_type(pk: int) -> RequestType:
    request_type = RequestType.objects.filter(pk=pk).first()
    if request_type is None:
        raise NotFound("core.not_found")
    return request_type


def get_type_by_code(code: str) -> RequestType:
    request_type = RequestType.objects.filter(code=code).first()
    if request_type is None:
        raise DomainError("request.type_unknown", field="type")
    return request_type


def events(*, active_only: bool) -> QuerySet[ExceptionalEvent]:
    found = ExceptionalEvent.objects.order_by("name_fr")
    return found.filter(is_active=True) if active_only else found


def get_event(pk: int) -> ExceptionalEvent:
    event = ExceptionalEvent.objects.filter(pk=pk).first()
    if event is None:
        raise NotFound("core.not_found")
    return event


# ------------------------------------------------------------------ reach


def base_requests() -> QuerySet[Request]:
    """Requests with the relations the representation reads, so that a page of a list stays cheap."""
    return Request.objects.select_related(
        "request_type",
        "employee__department",
        "employee__user",
        "employee__manager__user",
        "exceptional_event",
        "created_by",
        "reclassified_from",
    ).prefetch_related("steps", "steps__named_person", "steps__decided_by", "amendments", "attachment_links")


def can_see(user, request) -> bool:
    """Permission matrix, row "View request": own, team, all for HR and executives.

    A draft belongs to the account that created it. Someone a step was given to, or who decided
    a step, keeps access to that request.
    """
    if request.status == RequestStatus.DRAFT:
        return request.created_by_id == user.pk
    me = reach.employee_of(user)
    if me is not None and me.pk == request.employee_id:
        return True
    if has_role(user, Role.HR, Role.EXEC):
        return True
    if request.employee_id in reach.team_ids(user):
        return True
    if me is None:
        return False
    return RequestStep.objects.filter(request=request).filter(Q(named_person=me) | Q(decided_by=me)).exists()


def get_request_for(user, public_id: str) -> Request:
    request = base_requests().filter(public_id=public_id).first()
    if request is None or not can_see(user, request):
        raise NotFound("core.not_found")
    return request


def requests_for(user, scope: str) -> QuerySet[Request]:
    """The requests of a scope: "mine", "team" (managers), "all" (HR, executives), "decided"."""
    me = reach.employee_of(user)
    base = base_requests()
    not_a_foreign_draft = ~Q(status=RequestStatus.DRAFT) | Q(created_by=user)
    if scope == "mine":
        if me is None:
            return base.none()
        return base.filter(not_a_foreign_draft, employee=me)
    if scope == "team":
        if not has_role(user, Role.MANAGER):
            raise NotAllowed("core.not_allowed")
        return base.filter(employee_id__in=reach.team_ids(user)).exclude(status=RequestStatus.DRAFT)
    if scope == "all":
        if not has_role(user, Role.HR, Role.EXEC):
            raise NotAllowed("core.not_allowed")
        return base.filter(not_a_foreign_draft)
    if scope == "decided":
        if me is None:
            return base.none()
        return base.filter(steps__decided_by=me).exclude(status=RequestStatus.DRAFT).distinct()
    raise DomainError("request.scope_invalid", field="scope")


def filter_requests(
    queryset: QuerySet[Request],
    *,
    viewer,
    statuses=None,
    type_codes=None,
    employee_public_id: str | None = None,
    department_id: int | None = None,
    year: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    on_behalf: bool | None = None,
    has_override: bool | None = None,
) -> QuerySet[Request]:
    """Narrow a scope. Employee and department are resolved through organisation, within the viewer's reach."""
    if statuses:
        queryset = queryset.filter(status__in=list(statuses))
    if type_codes:
        queryset = queryset.filter(request_type__code__in=list(type_codes))
    if employee_public_id:
        try:
            employee = organisation_selectors.get_employee_for(viewer, employee_public_id)
        except NotFound:
            return queryset.none()
        queryset = queryset.filter(employee=employee)
    if department_id is not None:
        members = organisation_selectors.employees_for(viewer, include_archived=True).filter(
            department_id=department_id
        )
        queryset = queryset.filter(employee_id__in=list(members.values_list("pk", flat=True)))
    if year is not None:
        queryset = queryset.filter(start_date__lte=date(year, 12, 31), end_date__gte=date(year, 1, 1))
    if date_from is not None:
        queryset = queryset.filter(end_date__gte=date_from)
    if date_to is not None:
        queryset = queryset.filter(start_date__lte=date_to)
    if on_behalf is True:
        queryset = queryset.exclude(created_by=F("employee__user"))
    elif on_behalf is False:
        queryset = queryset.filter(created_by=F("employee__user"))
    if has_override is True:
        queryset = queryset.exclude(override_reason="")
    elif has_override is False:
        queryset = queryset.filter(override_reason="")
    return queryset


# ------------------------------------------------------------------ documents


def has_document(request) -> bool:
    """A certificate or a proof is attached. The scan of a signed form (linked to a step) does not count."""
    return any(link.step_id is None for link in request.attachment_links.all())


def document_requirement(request) -> str:
    """ "deadline": required within a deadline; "proof": required by the chosen event; "none"."""
    request_type = request.request_type
    if request_type.document_rule == DocumentRule.REQUIRED_WITHIN_DEADLINE:
        return "deadline"
    event = request.exceptional_event if request.exceptional_event_id else None
    if request_type.uses_events and event is not None and event.proof_required:
        return "proof"
    return "none"


def certificate_status(request, *, now: datetime | None = None) -> str:
    """ "not_needed", "attached", "due", "overdue" (past the deadline) or "missing" (a proof without deadline)."""
    need = document_requirement(request)
    if need == "none":
        return "not_needed"
    if has_document(request):
        return "attached"
    if need == "proof":
        return "missing"
    now = now or timezone.now()
    if request.certificate_due_at is not None and now >= request.certificate_due_at:
        return "overdue"
    return "due"


# ------------------------------------------------------------------ what a decider needs (UI 6.2, 7.8)


@dataclass(frozen=True)
class TeammateAway:
    name: str
    label: str
    start_date: date
    end_date: date


@dataclass(frozen=True)
class DecisionContext:
    balance: BalancePreview | None
    teammates_away: list[TeammateAway]
    cap: CapUsage | None


def _teammates_away(request) -> list[TeammateAway]:
    """People with the same manager who are absent or remote on the dates of this request."""
    manager = request.employee.manager
    if manager is None:
        return []
    mates = {
        mate.pk: mate
        for mate in organisation_selectors.direct_reports(manager)
        if mate.pk != request.employee_id
    }
    if not mates:
        return []
    others = (
        Request.objects.filter(
            employee_id__in=list(mates),
            status=RequestStatus.APPROVED,
            request_type__unit=Unit.DAY,
            start_date__lte=request.end_date,
            end_date__gte=request.start_date,
        )
        .exclude(request_type__calendar_label=CalendarLabel.HIDDEN)
        .select_related("request_type")
        .order_by("start_date", "pk")
    )
    return [
        TeammateAway(
            name=name_of(mates[other.employee_id]),
            label=other.request_type.calendar_label,
            start_date=other.start_date,
            end_date=other.end_date,
        )
        for other in others
    ]


def decision_context(request) -> DecisionContext:
    """Balance now and after (through the port), teammates away on the same days, and use of the cap."""
    request_type = request.request_type
    data = data_of(request)
    days = leave_days(request_type, data)
    balance = None
    if request_type.balance_effect == BalanceEffect.DEDUCTS_ANNUAL:
        balance = balance_port().preview(
            employee_id=request.employee_id, new_days=days, ignoring_request_id=request.pk
        )
    portions = days if request_type.unit == Unit.DAY else {request.start_date: request.quantity}
    usages = cap_usage(
        employee=request.employee,
        request_type=request_type,
        portions=portions,
        ignoring_request_id=request.pk,
    )
    cap = max(usages, key=lambda usage: usage.used + usage.adding) if usages else None
    return DecisionContext(balance=balance, teammates_away=_teammates_away(request), cap=cap)


# ------------------------------------------------------------------ history

# What the trail says about the files of a request. On a sensitive request these lines are for the
# requester and HR only, like the certificate itself.
FILE_ACTIONS = frozenset({"request.attachment_added"})
# The entries of other lines that say whether a file was kept (the scan of a decision recorded from paper).
FILE_CHANGES = frozenset({"scan"})


def history(request, *, private: bool = True) -> list[dict]:
    """The audit events of a request, oldest first (REQ-17).

    No comment, reason or file name of a sensitive request is ever written to the trail (AUD-05).
    `private` is false for a reader who may not read what is restricted on this request: the lines
    about its files, and what other lines say of files, are then left out as well, so that nothing
    says whether a certificate or a signed form was given.
    """
    known = all_messages()
    rows: list[dict] = []
    events = audit_selectors.events_for_object("request", str(request.public_id)).order_by("at", "pk")
    for event in events:
        if not private and event.action in FILE_ACTIONS:
            continue
        changes = event.changes or {}
        if not private:
            changes = {key: value for key, value in changes.items() if key not in FILE_CHANGES}
        code = "request.history_" + event.action.replace(".", "_")
        rows.append(
            {
                "at": event.at,
                "actor": display_name(event.actor) if event.actor_id else None,
                "action": event.action,
                "summary": translate(code) if code in known else event.action,
                "changes": changes,
            }
        )
    return rows


def get_amendment_for(user, public_id) -> Amendment:
    amendment = (
        Amendment.objects.select_related("request", "request__request_type")
        .filter(public_id=public_id)
        .first()
    )
    if amendment is None or not can_see(user, amendment.request):
        raise NotFound("core.not_found")
    return amendment


# ------------------------------------------------------------------ queues

QUEUES = ("mine", "hr", "certificates", "stuck")

# A step that waits for the HR role: by its rule, or because the person it names is the requester (PRD 6.9).
_HR_STEP = Q(approver_rule=ApproverRule.HR_ROLE) | Q(
    approver_rule=ApproverRule.NAMED_PERSON, named_person_id=F("request__employee_id")
)


def _open_steps() -> QuerySet[RequestStep]:
    """Steps waiting for a decision: on a pending request, or on a pending amendment of an approved one."""
    return RequestStep.objects.filter(status=StepStatus.PENDING, mode=StepMode.APPROVE).filter(
        Q(amendment__isnull=True, request__status=RequestStatus.PENDING)
        | Q(amendment__status=AmendmentStatus.PENDING)
    )


def _fallen_back_to(user, steps: QuerySet[RequestStep]) -> list[int]:
    """HR steps that an executive must take because no HR holder but the requester exists (PRD 6.9)."""
    taken: list[int] = []
    for step in steps.filter(_HR_STEP):
        resolution = chain.resolve_rule(
            rule=step.approver_rule, named_person=step.named_person, requester=step.request.employee
        )
        if resolution.via_exec and any(candidate.pk == user.pk for candidate in resolution.users):
            taken.append(step.pk)
    return taken


def queue(user, name: str) -> QuerySet[RequestStep]:
    """The steps waiting in one of the four queues, oldest first. Never a step of the user's own request."""
    if name not in QUEUES:
        raise DomainError("request.queue_invalid", field="queue")
    if name != "mine" and not has_role(user, Role.HR):
        raise NotAllowed("core.not_allowed")
    me = reach.employee_of(user)
    steps = (
        _open_steps()
        .select_related("request", "request__request_type", "request__employee", "amendment", "named_person")
        .order_by("activated_at", "pk")
    )
    if me is not None:
        steps = steps.exclude(request__employee=me)
    if name == "mine":
        if me is None:
            return steps.none()
        mine = Q(approver_rule=ApproverRule.LINE_MANAGER, request__employee_id__in=reach.team_ids(user)) | (
            Q(approver_rule=ApproverRule.NAMED_PERSON, named_person=me)
        )
        if has_role(user, Role.EXEC) and not has_role(user, Role.HR):
            mine |= Q(pk__in=_fallen_back_to(user, steps))
        return steps.filter(mine)
    if name == "hr":
        return steps.filter(_HR_STEP)
    if name == "certificates":
        # A file not tied to a step is a certificate; the scan of a signed form is not.
        certificate = RequestAttachment.objects.filter(request_id=OuterRef("request_id"), step__isnull=True)
        return steps.filter(
            ~Exists(certificate),
            amendment__isnull=True,
            request__request_type__document_rule=DocumentRule.REQUIRED_WITHIN_DEADLINE,
        )
    return steps.filter(flagged_at__isnull=False).exclude(_HR_STEP)


def get_step(pk: int) -> RequestStep:
    step = (
        RequestStep.objects.select_related(
            "request", "request__request_type", "request__employee", "amendment", "named_person"
        )
        .filter(pk=pk)
        .first()
    )
    if step is None:
        raise NotFound("core.not_found")
    return step


def via_delegation_from(step, user) -> str | None:
    """The manager a delegate is covering for on this step, or None when the user acts in their own name."""
    if step.approver_rule != ApproverRule.LINE_MANAGER:
        return None
    employee = step.request.employee
    me = reach.employee_of(user)
    if employee.manager_id is None or me is None or employee.manager_id == me.pk:
        return None
    if employee.manager_id not in reach.acting_for(me.pk):
        return None
    return name_of(employee.manager)


# ------------------------------------------------------------------ for balances, calendar and reports


@dataclass(frozen=True)
class DayRow:
    request_id: int
    request_public_id: str
    employee_id: int
    type_code: str
    day: date
    portion: Decimal
    hours: Decimal | None
    status: str


def day_rows(*, start: date, end: date, statuses, employee_ids=None, type_codes=None) -> list[DayRow]:
    """Requests cut into days, inside a period.

    A day-based request gives one row per working day (portion 1 or 0.5); an hourly permission gives one
    row with its hours. Days are counted with today's holidays and working week: a request approved
    before a holiday was added keeps its stored quantity until HR corrects it (master D22).
    """
    found = Request.objects.filter(
        status__in=list(statuses), start_date__lte=end, end_date__gte=start
    ).select_related("request_type")
    if employee_ids is not None:
        found = found.filter(employee_id__in=list(employee_ids))
    if type_codes is not None:
        found = found.filter(request_type__code__in=list(type_codes))
    rows: list[DayRow] = []
    for request in found:
        common = {
            "request_id": request.pk,
            "request_public_id": str(request.public_id),
            "employee_id": request.employee_id,
            "type_code": request.request_type.code,
            "status": request.status,
        }
        if request.request_type.unit == Unit.HOUR:
            rows.append(
                DayRow(day=request.start_date, portion=Decimal("0"), hours=request.quantity, **common)
            )
            continue
        portions = workdays.day_portions(
            request.start_date,
            request.end_date,
            starts_at_midday=request.starts_at_midday,
            ends_at_midday=request.ends_at_midday,
        )
        rows.extend(
            DayRow(day=day, portion=portion, hours=None, **common)
            for day, portion in portions.items()
            if start <= day <= end
        )
    return sorted(rows, key=lambda row: (row.day, row.request_id))


def reserved_days(employee_id: int, *, ignoring_request_id: int | None = None) -> dict[date, Decimal]:
    """Annual-leave days an employee has asked for and not yet been granted (PRD 6.3, master D18)."""
    return _held_days([employee_id], ignoring_request_id=ignoring_request_id)[employee_id]


def reserved_days_by_employee(employee_ids: Iterable[int]) -> dict[int, dict[date, Decimal]]:
    """`reserved_days` of several employees in two queries, for a list or a report. Every id asked for is in it."""
    return _held_days(list(employee_ids))


def _held_days(
    employee_ids: list[int], *, ignoring_request_id: int | None = None
) -> dict[int, dict[date, Decimal]]:
    reserved: dict[int, dict[date, Decimal]] = {
        employee_id: defaultdict(Decimal) for employee_id in employee_ids
    }
    pending = Request.objects.filter(
        employee_id__in=employee_ids,
        status=RequestStatus.PENDING,
        request_type__balance_effect=BalanceEffect.DEDUCTS_ANNUAL,
    ).select_related("request_type")
    changes = Amendment.objects.filter(
        request__employee_id__in=employee_ids,
        request__request_type__balance_effect=BalanceEffect.DEDUCTS_ANNUAL,
        status=AmendmentStatus.PENDING,
        kind=AmendmentKind.CHANGE,
    ).select_related("request", "request__request_type")
    if ignoring_request_id is not None:
        pending = pending.exclude(pk=ignoring_request_id)
        changes = changes.exclude(request_id=ignoring_request_id)
    for request in pending:
        for day, portion in leave_days(request.request_type, data_of(request)).items():
            reserved[request.employee_id][day] += portion
    for change in changes:
        request_type = change.request.request_type
        current = leave_days(request_type, data_of(change.request))
        _, added = day_diff(current, leave_days(request_type, amendment_data(change)))
        for day, portion in added.items():
            reserved[change.request.employee_id][day] += portion
    return {employee_id: dict(days) for employee_id, days in reserved.items()}


@dataclass(frozen=True)
class WaitingRow:
    request: Request
    step: RequestStep
    waiting_on: list[str]
    since: datetime | None
    reminded_at: datetime | None
    flagged_at: datetime | None


def waiting_rows(*, employee_ids=None) -> list[WaitingRow]:
    """Every step that waits for a decision, the longest wait first."""
    steps = _open_steps().select_related(
        "request", "request__request_type", "request__employee", "amendment", "named_person"
    )
    if employee_ids is not None:
        steps = steps.filter(request__employee_id__in=list(employee_ids))
    return [
        WaitingRow(
            request=step.request,
            step=step,
            waiting_on=chain.waiting_names(
                rule=step.approver_rule, named_person=step.named_person, requester=step.request.employee
            ),
            since=step.activated_at,
            reminded_at=step.reminded_at,
            flagged_at=step.flagged_at,
        )
        for step in steps.order_by("activated_at", "pk")
    ]


@dataclass(frozen=True)
class CertificateRow:
    request: Request
    due_at: datetime | None
    overdue: timedelta | None


def outstanding_certificates(*, employee_ids=None, now: datetime | None = None) -> list[CertificateRow]:
    """Pending requests whose required document has not arrived, the earliest deadline first."""
    now = now or timezone.now()
    # A file not tied to a step is a certificate; the scan of a signed form is not.
    certificate = RequestAttachment.objects.filter(request_id=OuterRef("pk"), step__isnull=True)
    found = base_requests().filter(
        ~Exists(certificate),
        status=RequestStatus.PENDING,
        request_type__document_rule=DocumentRule.REQUIRED_WITHIN_DEADLINE,
    )
    if employee_ids is not None:
        found = found.filter(employee_id__in=list(employee_ids))
    rows: list[CertificateRow] = []
    for request in found.order_by("certificate_due_at", "pk"):
        due = request.certificate_due_at
        rows.append(
            CertificateRow(
                request=request, due_at=due, overdue=now - due if due is not None and now >= due else None
            )
        )
    return rows


def requests_touching(day: date) -> QuerySet[Request]:
    """Approved day-based requests that cover a date: what a change of holiday on that date would affect."""
    return (
        Request.objects.filter(
            status=RequestStatus.APPROVED,
            request_type__unit=Unit.DAY,
            start_date__lte=day,
            end_date__gte=day,
        )
        .select_related("request_type", "employee")
        .order_by("start_date", "pk")
    )


def public_ids(request_ids) -> dict[int, str]:
    """The public identifier of each request id that exists."""
    found = Request.objects.filter(pk__in=list(request_ids)).values_list("pk", "public_id")
    return {pk: str(public_id) for pk, public_id in found}
