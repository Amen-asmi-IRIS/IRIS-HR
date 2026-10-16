"""The calendar feed: which absences a user sees, and how much of each.

Three scopes:
- department: the user's own requests in full; colleagues of the same department
  as "absent" or "remote" only, approved only, never an hourly permission.
- team: the user's team (including teams delegated to them) with type and status.
- company: everyone, with type and status, for HR and Executive Management.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from apps.accounts.roles import Role, has_role
from apps.calendar import workdays
from apps.calendar.models import PublicHoliday
from apps.core.errors import DomainError, NotAllowed
from apps.organisation import reach
from apps.organisation import selectors as org_selectors
from apps.requests.spans import RequestSpan, request_spans

MAX_WINDOW_DAYS = 100
VISIBLE_STATUSES = ("approved", "pending")
PEER_LABELS = ("absent", "remote")


@dataclass(frozen=True)
class FeedHoliday:
    date: date
    name_fr: str
    name_en: str


@dataclass(frozen=True)
class FeedEntry:
    employee_public_id: str
    employee_name: str
    start_date: date
    end_date: date
    starts_at_midday: bool
    ends_at_midday: bool
    label: str
    type_code: str | None
    type_name_fr: str | None
    type_name_en: str | None
    status: str | None
    request_public_id: str | None
    mine: bool


@dataclass(frozen=True)
class CalendarFeed:
    holidays: list[FeedHoliday]
    entries: list[FeedEntry]
    # ISO weekdays that are worked (Monday = 1), from HR's `working_week` setting: the page greys the others.
    working_week: tuple[int, ...] = (1, 2, 3, 4, 5)


def calendar_feed(
    user,
    *,
    start: date,
    end: date,
    scope: str,
    department_id: int | None = None,
    employee_public_id: str | None = None,
    type_code: str | None = None,
    status: str | None = None,
) -> CalendarFeed:
    if end < start or (end - start).days > MAX_WINDOW_DAYS:
        raise DomainError("calendar.window_invalid", field="to", max_days=MAX_WINDOW_DAYS)

    me = reach.employee_of(user)
    people = {employee.id: employee for employee in org_selectors.directory().select_related("department")}

    if scope == "department":
        # Filters are deliberately not passed on: filtering by type or status
        # would tell a colleague what the label hides.
        entries = _department_entries(user, me, people, start, end)
    elif scope == "team":
        if not has_role(user, Role.MANAGER):
            raise NotAllowed("calendar.scope_not_allowed")
        entries = _detailed_entries(
            me,
            people,
            reach.team_ids(user),
            start,
            end,
            employee_public_id=employee_public_id,
            type_code=type_code,
            status=status,
        )
    elif scope == "company":
        if not has_role(user, Role.HR, Role.EXEC):
            raise NotAllowed("calendar.scope_not_allowed")
        ids = set(people)
        if department_id is not None:
            ids = {employee_id for employee_id in ids if people[employee_id].department_id == department_id}
        entries = _detailed_entries(
            me,
            people,
            ids,
            start,
            end,
            employee_public_id=employee_public_id,
            type_code=type_code,
            status=status,
        )
    else:
        raise DomainError("calendar.scope_unknown", field="scope")

    holidays = [
        FeedHoliday(date=holiday.date, name_fr=holiday.name_fr, name_en=holiday.name_en)
        for holiday in PublicHoliday.objects.filter(date__gte=start, date__lte=end).order_by("date")
    ]
    return CalendarFeed(holidays=holidays, entries=entries, working_week=workdays.working_week())


def _department_entries(user, me, people, start: date, end: date) -> list[FeedEntry]:
    if me is None:
        return []
    ids = set(reach.department_peer_ids(user)) | {me.id}
    spans = request_spans(start=start, end=end, statuses=VISIBLE_STATUSES, employee_ids=ids)
    entries: list[FeedEntry] = []
    for span in spans:
        if span.employee_id == me.id:
            entries.append(_entry(span, me, start, end, mine=True, detailed=True))
            continue
        person = people.get(span.employee_id)
        if person is None:
            continue
        # An hourly permission stays hidden whatever label HR gave its type (CAL-03, A9).
        if span.status == "approved" and span.calendar_label in PEER_LABELS and span.unit != "hour":
            entries.append(_entry(span, person, start, end, mine=False, detailed=False))
    return _in_order(entries)


def _detailed_entries(
    me,
    people,
    ids,
    start: date,
    end: date,
    *,
    employee_public_id: str | None,
    type_code: str | None,
    status: str | None,
) -> list[FeedEntry]:
    ids = set(ids) & set(people)
    if employee_public_id is not None:
        ids = {
            employee_id
            for employee_id in ids
            if str(people[employee_id].public_id) == str(employee_public_id)
        }
    if not ids:
        return []
    statuses = (status,) if status in VISIBLE_STATUSES else VISIBLE_STATUSES
    spans = request_spans(
        start=start,
        end=end,
        statuses=statuses,
        employee_ids=ids,
        type_codes=[type_code] if type_code else None,
    )
    my_id = me.id if me is not None else None
    return _in_order(
        [
            _entry(span, people[span.employee_id], start, end, mine=span.employee_id == my_id, detailed=True)
            for span in spans
        ]
    )


def _entry(span: RequestSpan, person, start: date, end: date, *, mine: bool, detailed: bool) -> FeedEntry:
    first = max(span.start_date, start)
    last = min(span.end_date, end)
    return FeedEntry(
        employee_public_id=str(person.public_id),
        employee_name=org_selectors.full_name(person),
        start_date=first,
        end_date=last,
        # A half-day flag describes the request's real first or last day. It is
        # kept only when that day is inside the window.
        starts_at_midday=span.starts_at_midday and first == span.start_date,
        ends_at_midday=span.ends_at_midday and last == span.end_date,
        label=span.calendar_label,
        type_code=span.type_code if detailed else None,
        type_name_fr=span.type_name_fr if detailed else None,
        type_name_en=span.type_name_en if detailed else None,
        status=span.status if detailed else None,
        request_public_id=span.request_public_id if detailed else None,
        mine=mine,
    )


def _in_order(entries: list[FeedEntry]) -> list[FeedEntry]:
    return sorted(entries, key=lambda entry: (entry.start_date, entry.employee_name, entry.end_date))
