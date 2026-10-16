"""What each home screen shows. Read-only; every figure comes from another app's selector."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.balances import selectors as balance_selectors
from apps.balances.selectors import BalanceFigures
from apps.calendar import workdays
from apps.core.errors import NotFound
from apps.organisation import reach
from apps.organisation import selectors as org_selectors
from apps.requests import selectors as request_selectors
from apps.requests.models import Request
from apps.requests.spans import absence_type_codes, request_spans

LIST_LIMIT = 5


@dataclass(frozen=True)
class NeedsYouItem:
    kind: str
    request: Request
    due_at: datetime | None


@dataclass(frozen=True)
class MeHome:
    balance: BalanceFigures
    needs_you: list[NeedsYouItem]
    in_progress: list[Request]
    coming_up: list[Request]


def me_home(user, *, today: date | None = None, now: datetime | None = None) -> MeHome:
    today = today or timezone.localdate()
    now = now or timezone.now()
    me = reach.employee_of(user)
    if me is None:
        raise NotFound()

    mine = request_selectors.requests_for(user, "mine")
    needs_you = [
        NeedsYouItem(kind="returned", request=request, due_at=None)
        for request in mine.filter(status="returned").order_by("start_date", "id")
    ]
    needs_you += [
        NeedsYouItem(kind="certificate_due", request=row.request, due_at=row.due_at)
        for row in request_selectors.outstanding_certificates(employee_ids=[me.id], now=now)
    ]
    return MeHome(
        balance=balance_selectors.figures(me.id, today=today),
        needs_you=needs_you,
        in_progress=list(mine.filter(status="pending").order_by("start_date", "id")[:LIST_LIMIT]),
        coming_up=list(
            mine.filter(status="approved", end_date__gte=today).order_by("start_date", "id")[:LIST_LIMIT]
        ),
    )


WHO_IS_OUT_DAYS = 7
OUT_LABELS = ("absent", "remote")
# Approved requests, and the sick leaves still waiting for HR among the pending ones (`_is_out`).
OUT_STATUSES = ("approved", "pending")


def _is_out(span) -> bool:
    """Away for the day or part of it: a type counted in hours is never "out", whatever its label.

    A sick leave is declared, not asked: while it waits for HR the person is already away, and is
    shown as waiting (master D52). Every other pending request does not count.
    """
    if span.calendar_label not in OUT_LABELS or span.unit == "hour":
        return False
    return span.status == "approved" or (span.status == "pending" and span.type_is_sensitive)


@dataclass(frozen=True)
class OutPerson:
    employee_public_id: str
    name: str
    label: str
    type_name_fr: str
    type_name_en: str
    start_date: date
    end_date: date
    starts_at_midday: bool
    ends_at_midday: bool
    today: bool
    waiting: bool


@dataclass(frozen=True)
class DelegationLine:
    direction: str
    person: str
    start_date: date
    end_date: date


@dataclass(frozen=True)
class TeamPerson:
    employee_public_id: str
    today: str
    # Away today only through a sick leave that waits for HR.
    waiting: bool
    balance: Decimal


@dataclass(frozen=True)
class TeamHome:
    who_is_out: list[OutPerson]
    delegation: DelegationLine | None
    people: list[TeamPerson]


def team_home(user, *, today: date | None = None) -> TeamHome:
    today = today or timezone.localdate()
    me = reach.employee_of(user)
    if me is None:
        raise NotFound()

    team_ids = reach.team_ids(user, on=today)
    team = {employee.id: employee for employee in org_selectors.employees_for(user).filter(id__in=team_ids)}
    spans = [
        span
        for span in (
            request_spans(
                start=today,
                end=today + timedelta(days=WHO_IS_OUT_DAYS),
                statuses=OUT_STATUSES,
                employee_ids=set(team),
            )
            if team
            else []
        )
        if _is_out(span)
    ]
    working_today = workdays.is_working_day(today)

    def covers_today(span) -> bool:
        return working_today and span.start_date <= today <= span.end_date

    who_is_out = [
        OutPerson(
            employee_public_id=str(team[span.employee_id].public_id),
            name=org_selectors.full_name(team[span.employee_id]),
            label=span.calendar_label,
            type_name_fr=span.type_name_fr,
            type_name_en=span.type_name_en,
            start_date=span.start_date,
            end_date=span.end_date,
            starts_at_midday=span.starts_at_midday,
            ends_at_midday=span.ends_at_midday,
            today=covers_today(span),
            waiting=span.status == "pending",
        )
        for span in spans
    ]
    who_is_out.sort(key=lambda person: (not person.today, person.start_date, person.name))

    labels_today: dict[int, set[str]] = defaultdict(set)
    approved_today: dict[int, set[str]] = defaultdict(set)
    for span in spans:
        if covers_today(span):
            labels_today[span.employee_id].add(span.calendar_label)
            if span.status == "approved":
                approved_today[span.employee_id].add(span.calendar_label)
    balances = balance_selectors.balances_at(today, employee_ids=list(team)) if team else {}
    people = []
    for employee in sorted(team.values(), key=org_selectors.full_name):
        presence = _presence(labels_today[employee.id])
        people.append(
            TeamPerson(
                employee_public_id=str(employee.public_id),
                today=presence,
                waiting=presence != "in" and presence not in approved_today[employee.id],
                balance=balances.get(employee.id, Decimal("0")),
            )
        )
    return TeamHome(who_is_out=who_is_out, delegation=_delegation_line(me, today), people=people)


def _presence(labels: set[str]) -> str:
    if "absent" in labels:
        return "absent"
    return "remote" if "remote" in labels else "in"


def _delegation_line(me, today: date) -> DelegationLine | None:
    given = org_selectors.active_delegations(manager=me, on=today).order_by("end_date").first()
    if given is not None:
        return DelegationLine(
            direction="given",
            person=org_selectors.full_name(given.delegate),
            start_date=given.start_date,
            end_date=given.end_date,
        )
    received = org_selectors.active_delegations(delegate=me, on=today).order_by("end_date").first()
    if received is not None:
        return DelegationLine(
            direction="received",
            person=org_selectors.full_name(received.manager),
            start_date=received.start_date,
            end_date=received.end_date,
        )
    return None


OVERVIEW_LIMIT = 5


@dataclass(frozen=True)
class OutName:
    name: str
    label: str
    start_date: date
    end_date: date
    waiting: bool


@dataclass(frozen=True)
class OutDepartment:
    department_fr: str
    department_en: str
    today: list[OutName]
    week: list[OutName]


@dataclass(frozen=True)
class AbsenceMonth:
    department_fr: str
    department_en: str
    days: Decimal
    previous_days: Decimal


@dataclass(frozen=True)
class DepartmentBalance:
    department_fr: str
    department_en: str
    total: Decimal


@dataclass(frozen=True)
class PersonBalance:
    name: str
    department_fr: str
    department_en: str
    balance: Decimal


@dataclass(frozen=True)
class LeaveOwed:
    departments: list[DepartmentBalance]
    largest: list[PersonBalance]


@dataclass(frozen=True)
class WaitingLine:
    request_public_id: str
    employee_name: str
    type_name_fr: str
    type_name_en: str
    waiting_on: list[str]
    since: datetime | None


@dataclass(frozen=True)
class OverviewHome:
    out_now: list[OutDepartment]
    absence_this_month: list[AbsenceMonth]
    leave_owed: LeaveOwed
    waiting: list[WaitingLine]


def overview_home(user, *, today: date | None = None) -> OverviewHome:
    today = today or timezone.localdate()
    active = list(org_selectors.directory().select_related("department"))
    everyone = {
        employee.id: employee
        for employee in org_selectors.employees_for(user, include_archived=True).select_related("department")
    }
    departments = sorted(
        {employee.department for employee in active}, key=lambda department: department.name_fr
    )
    return OverviewHome(
        out_now=_out_now(active, departments, today),
        absence_this_month=_absence_by_month(everyone, departments, today),
        leave_owed=_leave_owed(active, departments, today),
        waiting=_waiting(everyone),
    )


def _out_now(active, departments, today: date) -> list[OutDepartment]:
    people = {employee.id: employee for employee in active}
    sunday = today + timedelta(days=6 - today.weekday())
    spans = [
        span
        for span in request_spans(start=today, end=sunday, statuses=OUT_STATUSES, employee_ids=set(people))
        if _is_out(span)
    ]
    # As on the My team home, nobody is out on a day that is not a working day.
    working_today = workdays.is_working_day(today)
    result = []
    for department in departments:
        week = sorted(
            (
                OutName(
                    name=org_selectors.full_name(people[span.employee_id]),
                    label=span.calendar_label,
                    start_date=span.start_date,
                    end_date=span.end_date,
                    waiting=span.status == "pending",
                )
                for span in spans
                if people[span.employee_id].department_id == department.id
            ),
            key=lambda person: (person.start_date, person.name),
        )
        if week:
            result.append(
                OutDepartment(
                    department_fr=department.name_fr,
                    department_en=department.name_en,
                    today=[
                        person
                        for person in week
                        if working_today and person.start_date <= today <= person.end_date
                    ],
                    week=week,
                )
            )
    return result


def _month_bounds(day: date) -> tuple[date, date]:
    first = day.replace(day=1)
    next_first = (first + timedelta(days=32)).replace(day=1)
    return first, next_first - timedelta(days=1)


def _absence_days(everyone, start: date, end: date) -> dict[int, Decimal]:
    """Working days of approved absence per department id in [start, end]."""
    totals: dict[int, Decimal] = {}
    codes = absence_type_codes()
    if not codes:
        return totals
    for row in request_selectors.day_rows(start=start, end=end, statuses=["approved"], type_codes=codes):
        employee = everyone.get(row.employee_id)
        if employee is None:
            continue
        totals[employee.department_id] = totals.get(employee.department_id, Decimal("0")) + row.portion
    return totals


def _absence_by_month(everyone, departments, today: date) -> list[AbsenceMonth]:
    this_first, this_last = _month_bounds(today)
    previous_first, previous_last = _month_bounds(this_first - timedelta(days=1))
    current = _absence_days(everyone, this_first, this_last)
    previous = _absence_days(everyone, previous_first, previous_last)
    return [
        AbsenceMonth(
            department_fr=department.name_fr,
            department_en=department.name_en,
            days=current.get(department.id, Decimal("0")),
            previous_days=previous.get(department.id, Decimal("0")),
        )
        for department in departments
    ]


def _leave_owed(active, departments, today: date) -> LeaveOwed:
    balances = balance_selectors.balances_at(today, employee_ids=[employee.id for employee in active])
    totals: dict[int, Decimal] = {}
    people: list[PersonBalance] = []
    for employee in active:
        balance = balances.get(employee.id, Decimal("0"))
        totals[employee.department_id] = totals.get(employee.department_id, Decimal("0")) + balance
        if balance > 0:
            people.append(
                PersonBalance(
                    name=org_selectors.full_name(employee),
                    department_fr=employee.department.name_fr,
                    department_en=employee.department.name_en,
                    balance=balance,
                )
            )
    people.sort(key=lambda person: (-person.balance, person.name))
    return LeaveOwed(
        departments=[
            DepartmentBalance(
                department_fr=department.name_fr,
                department_en=department.name_en,
                total=totals.get(department.id, Decimal("0")),
            )
            for department in departments
        ],
        largest=people[:OVERVIEW_LIMIT],
    )


def _waiting(everyone) -> list[WaitingLine]:
    rows = request_selectors.waiting_rows()[:OVERVIEW_LIMIT]  # already the longest wait first
    lines = []
    for row in rows:
        employee = everyone.get(row.request.employee_id)
        lines.append(
            WaitingLine(
                request_public_id=str(row.request.public_id),
                employee_name=org_selectors.full_name(employee) if employee is not None else "",
                type_name_fr=row.request.request_type.name_fr,
                type_name_en=row.request.request_type.name_en,
                waiting_on=list(row.waiting_on),
                since=row.since,
            )
        )
    return lines
