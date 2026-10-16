"""Reads of the annual-leave ledger: balances, projection, affordability (PRD 6.3)."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models import Max, Q, QuerySet, Sum
from django.utils import timezone

from apps.accounts import services as account_services
from apps.core.errors import DomainError
from apps.organisation import selectors as organisation_selectors
from apps.requests import selectors as request_selectors

from . import services
from .models import LedgerEntry, LedgerKind

ZERO = Decimal("0")
# How far ahead "balance on a date" looks (two years).
PROJECTION_LIMIT_DAYS = 731


def _entries(employee_id: int, *, ignoring_request_id: int | None = None) -> QuerySet[LedgerEntry]:
    entries = LedgerEntry.objects.filter(employee_id=employee_id)
    if ignoring_request_id is not None:
        entries = entries.filter(Q(request_id__isnull=True) | ~Q(request_id=ignoring_request_id))
    return entries


def _employee(employee_id: int):
    return organisation_selectors.all_employees().get(pk=employee_id)


def balance_on(employee_id: int, on: date) -> Decimal:
    """Posted(d) of PRD 6.3: the sum of the lines dated on or before the date."""
    total = _entries(employee_id).filter(effective_date__lte=on).aggregate(total=Sum("amount"))["total"]
    return total if total is not None else ZERO


def balances_at(on: date, *, employee_ids: Iterable[int] | None = None) -> dict[int, Decimal]:
    """Posted balance of several employees on a date.

    With `employee_ids`, every id asked for is in the result (zero when it has no line).
    Without, only employees that have at least one line are in the result.
    """
    entries = LedgerEntry.objects.filter(effective_date__lte=on)
    wanted = None if employee_ids is None else list(employee_ids)
    if wanted is not None:
        entries = entries.filter(employee_id__in=wanted)
    totals = {
        row["employee_id"]: row["total"]
        for row in entries.order_by().values("employee_id").annotate(total=Sum("amount"))
    }
    if wanted is None:
        return totals
    return {employee_id: totals.get(employee_id, ZERO) for employee_id in wanted}


def projected_credits(employee, *, upto: date, posted: set[str] | None = None) -> list[tuple[date, Decimal]]:
    """Month-end credits the job has not posted yet, dated on or before `upto`, at the current rate.

    `posted` is the periods already credited to the employee, when the caller read them for several people.
    """
    start = services.credit_start_date()
    if start is None:
        return []
    if posted is None:
        posted = credited_periods([employee.id])[employee.id]
    credits: list[tuple[date, Decimal]] = []
    for year, month in services.months_ending_between(start, upto):
        if services.period_of(year, month) in posted:
            continue
        amount = services.month_credit(employee, year, month)
        if amount > ZERO:
            credits.append((services.month_end(year, month), amount))
    return credits


def credited_periods(employee_ids: Iterable[int]) -> dict[int, set[str]]:
    """The periods ("2026-10") already credited to each employee, in one query."""
    periods: dict[int, set[str]] = {employee_id: set() for employee_id in employee_ids}
    credits = LedgerEntry.objects.filter(employee_id__in=list(periods), kind=LedgerKind.CREDIT)
    for employee_id, period in credits.values_list("employee_id", "period"):
        periods[employee_id].add(period)
    return periods


@dataclass(frozen=True)
class PeriodEndBalances:
    balances: dict[int, Decimal]
    credits_to_come: bool  # some balance counts a month-end credit that is not posted yet


def balances_at_period_end(
    end: date, *, employee_ids: Iterable[int], today: date | None = None
) -> PeriodEndBalances:
    """The balance of each employee on the last day of a period, as reports and the KPMG export give it.

    The posted balance (`balances_at`), plus the month-end credits due up to its end and not posted
    yet, whether the period ends in the past, today or later (master 13.1): the credit of a month is
    posted in the first hour after its last day, or at the next run that succeeds, so a month that has
    just ended may not have been credited yet. `credits_to_come` says when any was added.
    `today` is kept for callers; the credits due depend on the period's end only.
    """
    wanted = list(employee_ids)
    balances = balances_at(end, employee_ids=wanted)
    credits_to_come = False
    if wanted and services.credit_start_date() is not None:
        posted = credited_periods(wanted)
        for employee in organisation_selectors.all_employees().filter(pk__in=wanted):
            credits = projected_credits(employee, upto=end, posted=posted[employee.id])
            if credits:
                balances[employee.id] += sum((amount for _, amount in credits), ZERO)
                credits_to_come = True
    return PeriodEndBalances(balances=balances, credits_to_come=credits_to_come)


def balance_events(
    employee_id: int,
    *,
    upto: date,
    extra_days: Mapping[date, Decimal] | None = None,
    ignoring_request_id: int | None = None,
    reserved: Mapping[date, Decimal] | None = None,
) -> list[tuple[date, Decimal]]:
    """Every dated change to the projected balance up to `upto`, in no particular order.

    Posted lines, credits still to come, days held by pending requests (as negatives) and
    `extra_days` (as negatives). `reserved` lets a caller that already has the held days pass them in.
    `ignoring_request_id` leaves out that request's lines and the days it holds (master D18).
    """
    posted = _entries(employee_id, ignoring_request_id=ignoring_request_id).filter(effective_date__lte=upto)
    events: list[tuple[date, Decimal]] = list(posted.values_list("effective_date", "amount"))
    events += projected_credits(_employee(employee_id), upto=upto)
    if reserved is None:
        reserved = request_selectors.reserved_days(employee_id, ignoring_request_id=ignoring_request_id)
    events += [(day, -portion) for day, portion in reserved.items() if day <= upto]
    events += [(day, -portion) for day, portion in (extra_days or {}).items() if day <= upto]
    return events


def projected_balance(
    employee_id: int,
    on: date,
    *,
    extra_days: Mapping[date, Decimal] | None = None,
    ignoring_request_id: int | None = None,
) -> Decimal:
    """Projected balance(d) of PRD 6.3, with `extra_days` counted as held."""
    events = balance_events(
        employee_id, upto=on, extra_days=extra_days, ignoring_request_id=ignoring_request_id
    )
    return sum((amount for _, amount in events), ZERO)


@dataclass(frozen=True)
class Affordability:
    ok: bool
    shortfall: Decimal = ZERO
    first_negative_on: date | None = None


def affordability(
    employee_id: int,
    new_days: Mapping[date, Decimal],
    *,
    ignoring_request_id: int | None = None,
) -> Affordability:
    """PRD 6.3: can the employee afford these days without making any later leave unaffordable?

    With the new days counted, the projected balance must be zero or more at the end of every
    day from the first new day up to the last date carrying posted leave, held days or new days.
    The balance is a step function, so it is enough to read it on the first day and then on every
    later date that carries an event. The shortfall is how far below zero the lowest point is.
    """
    if not new_days:
        return Affordability(ok=True)

    first = min(new_days)
    reserved = request_selectors.reserved_days(employee_id, ignoring_request_id=ignoring_request_id)
    last_posted_leave = (
        _entries(employee_id, ignoring_request_id=ignoring_request_id)
        .filter(kind=LedgerKind.TAKEN)
        .aggregate(last=Max("effective_date"))["last"]
    )
    horizon = max(new_days)
    if reserved:
        horizon = max(horizon, max(reserved))
    if last_posted_leave is not None:
        horizon = max(horizon, last_posted_leave)

    events = balance_events(
        employee_id,
        upto=horizon,
        extra_days=new_days,
        ignoring_request_id=ignoring_request_id,
        reserved=reserved,
    )

    balance = ZERO
    later: dict[date, Decimal] = defaultdict(Decimal)
    for day, amount in events:
        if day <= first:
            balance += amount
        else:
            later[day] += amount

    lowest = balance
    first_negative = first if balance < ZERO else None
    for day in sorted(later):
        balance += later[day]
        lowest = min(lowest, balance)
        if balance < ZERO and first_negative is None:
            first_negative = day

    if lowest >= ZERO:
        return Affordability(ok=True)
    return Affordability(ok=False, shortfall=ZERO - lowest, first_negative_on=first_negative)


@dataclass(frozen=True)
class BalanceFigures:
    current: Decimal
    pending: Decimal
    approved_upcoming: Decimal
    next_credit_amount: Decimal | None
    next_credit_date: date | None


@dataclass(frozen=True)
class AsOf:
    on: date
    balance: Decimal
    projected: bool


@dataclass(frozen=True)
class LedgerLine:
    id: int
    kind: str
    amount: Decimal
    effective_date: date
    period: str
    reason: str
    request_public_id: str | None
    created_by: str | None
    created_at: datetime
    balance_after: Decimal


def next_credit(employee_id: int, *, today: date) -> tuple[Decimal | None, date | None]:
    """Amount and date of the next month-end credit the employee will receive, or nothing.

    The first month-end from this month (or from `credit_start_date` if later) that is not credited
    yet and is worth more than zero; nothing while `credit_start_date` is empty or once the employee has left.
    """
    start = services.credit_start_date()
    if start is None:
        return None, None
    employee = _employee(employee_id)
    posted = set(
        LedgerEntry.objects.filter(employee_id=employee_id, kind=LedgerKind.CREDIT).values_list(
            "period", flat=True
        )
    )
    first = max(today, start)
    year, month = first.year, first.month
    for _ in range(3):
        if services.period_of(year, month) not in posted:
            amount = services.month_credit(employee, year, month)
            if amount > ZERO:
                return amount, services.month_end(year, month)
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return None, None


def figures(employee_id: int, *, today: date | None = None) -> BalanceFigures:
    """The figures of BAL-07: the balance today, what pending requests hold, approved leave still to come."""
    today = today or timezone.localdate()
    held = request_selectors.reserved_days(employee_id)
    # Read from the ledger, not from requests, so that leave in progress is never counted twice.
    upcoming = (
        _entries(employee_id)
        .filter(kind__in=[LedgerKind.TAKEN, LedgerKind.RESTORED], effective_date__gt=today)
        .aggregate(total=Sum("amount"))["total"]
    )
    amount, day = next_credit(employee_id, today=today)
    return BalanceFigures(
        current=balance_on(employee_id, today),
        pending=sum(held.values(), ZERO),
        # ZERO - x rather than -x: a negated zero is written "-0.00"
        approved_upcoming=ZERO - (upcoming or ZERO),
        next_credit_amount=amount,
        next_credit_date=day,
    )


def held_and_upcoming(employee_ids: Iterable[int], *, today: date) -> dict[int, tuple[Decimal, Decimal]]:
    """`(pending, approved_upcoming)` of `figures` for several employees, in three queries (a report's rows)."""
    wanted = list(employee_ids)
    held = request_selectors.reserved_days_by_employee(wanted)
    upcoming = dict(
        LedgerEntry.objects.filter(
            employee_id__in=wanted, kind__in=[LedgerKind.TAKEN, LedgerKind.RESTORED], effective_date__gt=today
        )
        .order_by()
        .values("employee_id")
        .annotate(total=Sum("amount"))
        .values_list("employee_id", "total")
    )
    # ZERO - x rather than -x: a negated zero is written "-0.00"
    return {
        employee_id: (sum(held[employee_id].values(), ZERO), ZERO - (upcoming.get(employee_id) or ZERO))
        for employee_id in wanted
    }


def has_opening(employee_id: int) -> bool:
    return LedgerEntry.objects.filter(employee_id=employee_id, kind=LedgerKind.OPENING).exists()


def can_enter_opening(employee) -> bool:
    """Whether HR may still enter this person's opening balance: none yet, and hired before monthly credits
    start, or no start is set. Someone hired on or after it is offered none (master D50)."""
    if has_opening(employee.id):
        return False
    start = services.credit_start_date()
    return start is None or employee.hire_date < start


def as_of(employee_id: int, on: date, *, today: date | None = None) -> AsOf:
    """The balance on a date of the reader's choice: posted up to today, projected after, two years ahead at most."""
    today = today or timezone.localdate()
    if on > today + timedelta(days=PROJECTION_LIMIT_DAYS):
        raise DomainError("balances.date_out_of_range", field="on")
    if on > today:
        return AsOf(on=on, balance=projected_balance(employee_id, on), projected=True)
    return AsOf(on=on, balance=balance_on(employee_id, on), projected=False)


def ledger_lines(employee_id: int) -> list[LedgerLine]:
    """Every line of the employee, oldest first, each with the balance after it."""
    entries = list(
        LedgerEntry.objects.filter(employee_id=employee_id)
        .select_related("created_by")
        .order_by("effective_date", "id")
    )
    request_ids = {entry.request_id for entry in entries if entry.request_id is not None}
    public_ids = request_selectors.public_ids(request_ids) if request_ids else {}
    names: dict[int, str] = {}
    running = ZERO
    lines: list[LedgerLine] = []
    for entry in entries:
        running += entry.amount
        if entry.created_by_id and entry.created_by_id not in names:
            names[entry.created_by_id] = account_services.display_name(entry.created_by)
        lines.append(
            LedgerLine(
                id=entry.id,
                kind=entry.kind,
                amount=entry.amount,
                effective_date=entry.effective_date,
                period=entry.period,
                reason=entry.reason,
                request_public_id=public_ids.get(entry.request_id) if entry.request_id is not None else None,
                created_by=names.get(entry.created_by_id) if entry.created_by_id else None,
                created_at=entry.created_at,
                balance_after=running,
            )
        )
    return lines


def ledger_line(employee_id: int, entry_id: int) -> LedgerLine:
    return next(line for line in ledger_lines(employee_id) if line.id == entry_id)
