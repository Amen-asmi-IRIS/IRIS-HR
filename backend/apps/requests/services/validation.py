"""The rules a request must satisfy before it is sent (PRD 6.1, 6.4 to 6.8, and 6.3 through the balance port)."""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal

from django.utils import timezone

from apps.calendar import workdays
from apps.core.errors import Problem

from ..models import (
    Amendment,
    AmendmentKind,
    AmendmentStatus,
    BalanceEffect,
    CalendarLabel,
    CapPeriod,
    ExceptionalEvent,
    Request,
    RequestStatus,
    Unit,
)
from ..ports import balance_port
from .data import ZERO, RequestData, compute_quantity, leave_days

MIDDAY = dt.time(12, 0)
# The longest period one request may cover, both ends included. A longer absence is several requests.
MAX_SPAN_DAYS = 366
# A request in one of these statuses occupies its dates (6.4).
BLOCKING = (RequestStatus.PENDING, RequestStatus.RETURNED, RequestStatus.APPROVED)
# A request in one of these statuses counts towards a cap (6.8).
COUNTED = (RequestStatus.PENDING, RequestStatus.APPROVED)


@dataclass(frozen=True)
class CapUsage:
    """One period a request touches: what is already used there and what the request adds."""

    start: dt.date
    end: dt.date
    used: Decimal
    adding: Decimal
    limit: Decimal
    period: str

    @property
    def exceeded(self) -> bool:
        return self.used + self.adding > self.limit


def fmt_range(start: dt.date, end: dt.date) -> str:
    if start == end:
        return f"{start:%d/%m/%Y}"
    return f"{start:%d/%m/%Y} – {end:%d/%m/%Y}"


# ------------------------------------------------------------------ shape


def _on_quarter(value: dt.time) -> bool:
    return value.minute % 15 == 0 and value.second == 0 and value.microsecond == 0


def _valid_times(data: RequestData) -> bool:
    if data.start_date != data.end_date or data.start_time is None or data.end_time is None:
        return False
    return data.end_time > data.start_time and _on_quarter(data.start_time) and _on_quarter(data.end_time)


def structural_problems(*, request_type, data: RequestData) -> list[Problem]:
    """What must hold for the quantity to be computable. A draft already has to satisfy these."""
    problems: list[Problem] = []
    if not request_type.is_active:
        problems.append(Problem("request.type_inactive", "type"))
    if data.end_date < data.start_date:
        problems.append(Problem("request.end_before_start", "end_date"))
        return problems
    if (data.end_date - data.start_date).days > MAX_SPAN_DAYS - 1:
        # Usually a slip on the year. Nothing is counted for such a period.
        problems.append(Problem("request.period_too_long", "end_date", {"days": MAX_SPAN_DAYS}))
        return problems
    if request_type.unit == Unit.HOUR:
        if data.starts_at_midday or data.ends_at_midday:
            problems.append(Problem("request.half_day_not_allowed", "starts_at_midday"))
        if not _valid_times(data):
            problems.append(Problem("request.permission_times", "end_time"))
    elif data.starts_at_midday or data.ends_at_midday:
        if not request_type.allows_half_day:
            field = "starts_at_midday" if data.starts_at_midday else "ends_at_midday"
            problems.append(Problem("request.half_day_not_allowed", field))
        elif data.starts_at_midday and data.ends_at_midday and data.start_date == data.end_date:
            problems.append(Problem("request.half_day_both_ends", "ends_at_midday"))
        else:
            if data.starts_at_midday and not workdays.is_working_day(data.start_date):
                problems.append(Problem("request.half_day_on_non_working_day", "starts_at_midday"))
            if data.ends_at_midday and not workdays.is_working_day(data.end_date):
                problems.append(Problem("request.half_day_on_non_working_day", "ends_at_midday"))
    if request_type.uses_events:
        chosen = data.exceptional_event_id
        if chosen is None or not ExceptionalEvent.objects.filter(pk=chosen, is_active=True).exists():
            problems.append(Problem("request.event_required", "exceptional_event"))
    return problems


# ------------------------------------------------------------------ dates against today


def _date_rule_problems(request_type, data: RequestData, today: dt.date) -> list[Problem]:
    if data.start_date < today:
        if request_type.allows_past_dates:
            return []
        return [Problem("request.past_dates", "start_date")]
    if request_type.notice_days and (data.start_date - today).days < request_type.notice_days:
        return [Problem("request.notice", "start_date", {"days": request_type.notice_days})]
    return []


# ------------------------------------------------------------------ overlap (6.4)


def _span(start: dt.date, end: dt.date, starts_at_midday: bool, ends_at_midday: bool) -> tuple[int, int]:
    """A range on an axis of half-days: [low, high). Each date has two slots, morning then afternoon."""
    low = start.toordinal() * 2 + (1 if starts_at_midday else 0)
    high = end.toordinal() * 2 + (1 if ends_at_midday else 2)
    return low, high


def _span_of(request) -> tuple[int, int]:
    return _span(request.start_date, request.end_date, request.starts_at_midday, request.ends_at_midday)


def _intersects(a: tuple[int, int], b: tuple[int, int]) -> bool:
    return a[0] < b[1] and b[0] < a[1]


def _others(employee, ignoring_request_id: int | None):
    others = Request.objects.filter(employee=employee, status__in=BLOCKING).select_related("request_type")
    if ignoring_request_id is not None:
        others = others.exclude(pk=ignoring_request_id)
    return others


def _day_overlap_problems(employee, data: RequestData, ignoring_request_id: int | None) -> list[Problem]:
    mine = _span(data.start_date, data.end_date, data.starts_at_midday, data.ends_at_midday)
    others = _others(employee, ignoring_request_id).filter(
        request_type__unit=Unit.DAY, start_date__lte=data.end_date, end_date__gte=data.start_date
    )
    for other in others.order_by("start_date", "pk"):
        if _intersects(mine, _span_of(other)):
            return [
                Problem(
                    "request.overlap", "start_date", {"other": fmt_range(other.start_date, other.end_date)}
                )
            ]
    # The new dates of a change that is waiting are taken too.
    changes = Amendment.objects.filter(
        request__employee=employee,
        request__request_type__unit=Unit.DAY,
        status=AmendmentStatus.PENDING,
        kind=AmendmentKind.CHANGE,
        new_start_date__lte=data.end_date,
        new_end_date__gte=data.start_date,
    )
    if ignoring_request_id is not None:
        changes = changes.exclude(request_id=ignoring_request_id)
    for change in changes.order_by("new_start_date", "pk"):
        theirs = _span(
            change.new_start_date, change.new_end_date, change.new_starts_at_midday, change.new_ends_at_midday
        )
        if _intersects(mine, theirs):
            other = fmt_range(change.new_start_date, change.new_end_date)
            return [Problem("request.overlap", "start_date", {"other": other})]
    return []


def _permission_overlap_problems(
    employee, data: RequestData, ignoring_request_id: int | None
) -> list[Problem]:
    day = data.start_date
    low = day.toordinal() * 2 + (0 if data.start_time < MIDDAY else 1)
    high = day.toordinal() * 2 + (2 if data.end_time > MIDDAY else 1)
    others = _others(employee, ignoring_request_id).filter(start_date__lte=day, end_date__gte=day)
    for other in others.order_by("pk"):
        if other.request_type.unit == Unit.DAY:
            if other.request_type.calendar_label == CalendarLabel.REMOTE:
                continue  # working remotely is not an absence
            if _intersects(_span_of(other), (low, high)):
                return [Problem("request.permission_overlaps_absence", "start_date")]
        elif (
            other.start_time
            and other.end_time
            and other.start_time < data.end_time
            and data.start_time < other.end_time
        ):
            described = f"{other.start_date:%d/%m/%Y} {other.start_time:%H:%M}–{other.end_time:%H:%M}"
            return [Problem("request.overlap", "start_time", {"other": described})]
    return []


# ------------------------------------------------------------------ cap (6.8)


def period_bounds(day: dt.date, period: str) -> tuple[dt.date, dt.date]:
    """The week (Monday to Sunday) or the month a day belongs to, kept inside what a date can hold."""
    first, last = dt.date.min.toordinal(), dt.date.max.toordinal()
    if period == CapPeriod.WEEK:
        monday = day.toordinal() - (day.isoweekday() - 1)
        return dt.date.fromordinal(max(first, monday)), dt.date.fromordinal(min(last, monday + 6))
    start = day.replace(day=1)
    following = (start.toordinal() + 32) if start.toordinal() + 32 <= last else None
    if following is None:
        return start, dt.date.max
    return start, dt.date.fromordinal(following).replace(day=1) - dt.timedelta(days=1)


def _portions_of(request) -> dict[dt.date, Decimal]:
    if request.request_type.unit == Unit.HOUR:
        return {request.start_date: request.quantity}
    return workdays.day_portions(
        request.start_date,
        request.end_date,
        starts_at_midday=request.starts_at_midday,
        ends_at_midday=request.ends_at_midday,
    )


def cap_usage(
    *, employee, request_type, portions: Mapping[dt.date, Decimal], ignoring_request_id: int | None = None
) -> list[CapUsage]:
    """One entry per capped period the given portions touch, oldest first. Empty when the type has no cap."""
    if request_type.cap_quantity is None or request_type.cap_period == CapPeriod.NONE or not portions:
        return []
    adding: dict[tuple[dt.date, dt.date], Decimal] = defaultdict(Decimal)
    for day, portion in portions.items():
        adding[period_bounds(day, request_type.cap_period)] += portion
    first = min(bounds[0] for bounds in adding)
    last = max(bounds[1] for bounds in adding)
    others = Request.objects.filter(
        employee=employee,
        request_type=request_type,
        status__in=COUNTED,
        start_date__lte=last,
        end_date__gte=first,
    ).select_related("request_type")
    if ignoring_request_id is not None:
        others = others.exclude(pk=ignoring_request_id)
    used: dict[tuple[dt.date, dt.date], Decimal] = defaultdict(Decimal)
    for other in others:
        for day, portion in _portions_of(other).items():
            bounds = period_bounds(day, request_type.cap_period)
            if bounds in adding:
                used[bounds] += portion
    return [
        CapUsage(
            start=bounds[0],
            end=bounds[1],
            used=used[bounds],
            adding=adding[bounds],
            limit=request_type.cap_quantity,
            period=request_type.cap_period,
        )
        for bounds in sorted(adding)
    ]


def hours_in_month(
    *, employee, request_type, day: dt.date, ignoring_request_id: int | None = None
) -> Decimal:
    """Hours already asked for or approved in the month of `day`, for an hour-based type."""
    start, end = period_bounds(day, CapPeriod.MONTH)
    others = Request.objects.filter(
        employee=employee,
        request_type=request_type,
        status__in=COUNTED,
        start_date__gte=start,
        start_date__lte=end,
    )
    if ignoring_request_id is not None:
        others = others.exclude(pk=ignoring_request_id)
    return sum((other.quantity for other in others), ZERO)


def _cap_problems(employee, request_type, portions, ignoring_request_id) -> list[Problem]:
    for usage in cap_usage(
        employee=employee,
        request_type=request_type,
        portions=portions,
        ignoring_request_id=ignoring_request_id,
    ):
        if usage.exceeded:
            return [Problem("request.cap_exceeded", "start_date", {"limit": usage.limit, "used": usage.used})]
    return []


# ------------------------------------------------------------------ event days (6.6) and balance (6.3)


def _event_problems(request_type, data: RequestData, portions) -> list[Problem]:
    if not request_type.uses_events:
        return []
    event = ExceptionalEvent.objects.get(pk=data.exceptional_event_id)
    if sum(portions.values(), ZERO) > event.days_allowed:
        return [Problem("request.event_days_exceeded", "end_date", {"allowed": event.days_allowed})]
    return []


def _balance_problems(employee, request_type, portions, ignoring_request_id) -> list[Problem]:
    if request_type.balance_effect != BalanceEffect.DEDUCTS_ANNUAL:
        return []
    verdict = balance_port().check(
        employee_id=employee.pk, new_days=portions, ignoring_request_id=ignoring_request_id
    )
    if verdict.ok:
        return []
    return [Problem("request.balance_insufficient", "end_date", {"shortfall": verdict.shortfall})]


# ------------------------------------------------------------------ entry point


def validate(
    *,
    employee,
    request_type,
    data: RequestData,
    override: bool = False,
    ignoring_request_id: int | None = None,
    today: dt.date | None = None,
) -> list[Problem]:
    """Every problem that stops this request from being sent. Empty means it may be sent.

    `override` is the HR exception (REQ-02): it lifts past dates, notice, cap, event days and balance.
    `ignoring_request_id` is the request being edited or amended, so that it does not collide with itself.
    """
    today = today or timezone.localdate()
    problems = structural_problems(request_type=request_type, data=data)
    if problems:
        return problems
    if request_type.unit == Unit.DAY:
        portions = leave_days(request_type, data)
        if not portions:
            return [Problem("request.no_working_day", "start_date")]
    else:
        if not workdays.is_working_day(data.start_date):
            return [Problem("request.permission_non_working_day", "start_date")]
        portions = {data.start_date: compute_quantity(request_type, data)}
    if not override:
        problems += _date_rule_problems(request_type, data, today)
    if request_type.unit == Unit.DAY:
        problems += _day_overlap_problems(employee, data, ignoring_request_id)
    else:
        problems += _permission_overlap_problems(employee, data, ignoring_request_id)
    if not override:
        problems += _cap_problems(employee, request_type, portions, ignoring_request_id)
        problems += _event_problems(request_type, data, portions)
        problems += _balance_problems(employee, request_type, portions, ignoring_request_id)
    return problems
