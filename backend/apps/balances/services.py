"""Rules and writes of the annual-leave ledger (PRD 5.4, 6.2, 6.3)."""

from __future__ import annotations

import calendar
from collections.abc import Mapping
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from apps.accounts.roles import Role, users_with_role
from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError
from apps.notifications import services as notifications
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors
from apps.settings import services as settings_service

from .models import LedgerEntry, LedgerKind

ZERO = Decimal("0")


def monthly_rate() -> Decimal:
    """Days credited for a full month (HR setting `monthly_credit_days`)."""
    return Decimal(str(settings_service.get("monthly_credit_days")))


def credit_start_date() -> date | None:
    """First day from which month-end credits are posted (HR setting `credit_start_date`, D11)."""
    value = settings_service.get("credit_start_date")
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def opening_date() -> date | None:
    """The date opening balances are stated as of: the day before `credit_start_date` (master D11), or nothing."""
    start = credit_start_date()
    return None if start is None else start - timedelta(days=1)


def round_to_half(value: Decimal) -> Decimal:
    """Nearest half day. An exact tie (x.25, x.75) goes up (master D35)."""
    return (value * 2).quantize(Decimal("1"), rounding=ROUND_HALF_UP) / 2


def month_end(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


def period_of(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def leaving_date(employee) -> date | None:
    """Last day of employment of a leaver: `Employee.archived_at`, the leaving date HR gave (plan 02)."""
    value = getattr(employee, "archived_at", None)
    if value is None:
        return None
    if isinstance(value, datetime):
        return timezone.localtime(value).date() if timezone.is_aware(value) else value.date()
    return value


def employed_days(employee, year: int, month: int) -> int:
    """Calendar days of the month on which the employee is employed, both ends included."""
    left = leaving_date(employee)
    if left is None and getattr(employee, "status", "") == "archived":
        return 0
    start = max(date(year, month, 1), employee.hire_date)
    end = month_end(year, month) if left is None else min(month_end(year, month), left)
    return max(0, (end - start).days + 1)


def month_credit(employee, year: int, month: int) -> Decimal:
    """Days earned for one month (PRD 6.2): the rate, pro-rated in the month of joining or leaving.

    Status does not matter (master D35): a suspended employee earns the credit, a leaver earns it up
    to the leaving date and never after.
    """
    days_in_month = calendar.monthrange(year, month)[1]
    employed = employed_days(employee, year, month)
    if employed == 0:
        return ZERO
    rate = monthly_rate()
    if employed == days_in_month:
        return rate
    return round_to_half(rate * employed / days_in_month)


def months_ending_between(start: date, end: date) -> list[tuple[int, int]]:
    """(year, month) of every month whose last day falls between the two dates, both included."""
    months: list[tuple[int, int]] = []
    year, month = start.year, start.month
    while month_end(year, month) <= end:
        months.append((year, month))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


@transaction.atomic
def post_month_end_credits(*, today: date | None = None) -> int:
    """Posts every month-end credit that is due and missing. Safe to run any number of times.

    A month is due once it is over: its last day is on or after `credit_start_date` and before today.
    The line is dated that last day (PRD 6.2) but written on the next run, in the first hour of the
    next month, so that a departure or a hire HR records during the last day still counts in that
    month's credit: a credit already written is never taken back. Months missed while the server was
    down are caught up (BAL-03). The unique constraint on (employee, period) is the final guard
    against a double credit.
    """
    today = today or timezone.localdate()
    start = credit_start_date()
    if start is None:
        return 0
    months = months_ending_between(start, today - timedelta(days=1))
    if not months:
        return 0

    already = set(LedgerEntry.objects.filter(kind=LedgerKind.CREDIT).values_list("employee_id", "period"))
    lines: list[LedgerEntry] = []
    for employee in organisation_selectors.all_employees():
        for year, month in months:
            period = period_of(year, month)
            if (employee.id, period) in already:
                continue
            amount = month_credit(employee, year, month)
            if amount <= ZERO:
                continue
            lines.append(
                LedgerEntry(
                    employee=employee,
                    kind=LedgerKind.CREDIT,
                    amount=amount,
                    effective_date=month_end(year, month),
                    period=period,
                )
            )
    if not lines:
        return 0

    before = LedgerEntry.objects.filter(kind=LedgerKind.CREDIT).count()
    LedgerEntry.objects.bulk_create(lines, ignore_conflicts=True)
    posted = LedgerEntry.objects.filter(kind=LedgerKind.CREDIT).count() - before
    if posted:
        audit.record(
            action="ledger.credits_posted",
            object_type="ledgerentry",
            object_label=", ".join(sorted({line.period for line in lines})),
            changes={"lines": {"before": None, "after": posted}},
            actor=None,
        )
    return posted


def _by_month(days: Mapping[date, Decimal]) -> dict[tuple[int, int], dict[date, Decimal]]:
    months: dict[tuple[int, int], dict[date, Decimal]] = {}
    for day, portion in days.items():
        months.setdefault((day.year, day.month), {})[day] = portion
    return months


@transaction.atomic
def post_taken(
    *, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor
) -> list[LedgerEntry]:
    """Leave finally approved (PRD 6.3): one line per calendar month, dated the first leave day of that month."""
    lines: list[LedgerEntry] = []
    for _month, month_days in sorted(_by_month(days).items()):
        total = sum(month_days.values(), ZERO)
        if total <= ZERO:
            continue
        lines.append(
            LedgerEntry(
                employee_id=employee_id,
                kind=LedgerKind.TAKEN,
                amount=ZERO - total,
                effective_date=min(month_days),
                request_id=request_id,
                created_by=actor,
            )
        )
    return LedgerEntry.objects.bulk_create(lines)


@transaction.atomic
def post_restored(
    *, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor, reason: str
) -> list[LedgerEntry]:
    """Approved days released: one line per calendar month.

    A line is dated like the most recent `taken` line of the same request and month that is dated
    on or before the first day given back, so that the two net out from the same date; without one,
    it is dated the first day given back. On a sensitive request the request engine passes an empty
    reason (master D46): managers and executives read the ledger.
    """
    lines: list[LedgerEntry] = []
    for (year, month), month_days in sorted(_by_month(days).items()):
        total = sum(month_days.values(), ZERO)
        if total <= ZERO:
            continue
        first_day = min(month_days)
        undone = (
            LedgerEntry.objects.filter(
                employee_id=employee_id,
                kind=LedgerKind.TAKEN,
                request_id=request_id,
                effective_date__year=year,
                effective_date__month=month,
                effective_date__lte=first_day,
            )
            .order_by("-effective_date", "-id")
            .values_list("effective_date", flat=True)
            .first()
        )
        lines.append(
            LedgerEntry(
                employee_id=employee_id,
                kind=LedgerKind.RESTORED,
                amount=total,
                effective_date=undone or first_day,
                request_id=request_id,
                reason=(reason or "")[:500],
                created_by=actor,
            )
        )
    return LedgerEntry.objects.bulk_create(lines)


def signed_days(amount: Decimal) -> str:
    """An amount as a notification writes it: "+1.5", "-2"."""
    magnitude = f"{abs(amount).normalize():f}"
    return f"{'-' if amount < ZERO else '+'}{magnitude}"


def _clean_reason(reason: str) -> str:
    cleaned = (reason or "").strip()
    if not cleaned:
        raise DomainError("balances.reason_required", field="reason")
    return cleaned[:500]


def _audit_line(action: str, entry: LedgerEntry, employee, actor) -> None:
    audit.record(
        action=action,
        obj=entry,
        object_label=organisation_selectors.full_name(employee),
        changes={
            "employee": {"before": None, "after": str(employee.public_id)},
            "amount": {"before": None, "after": f"{entry.amount.normalize():f}"},
            "effective_date": {"before": None, "after": entry.effective_date.isoformat()},
            "reason": {"before": None, "after": entry.reason},
        },
        actor=actor,
    )


def _tell_executives_of_own_change(event: str, *, actor, employee, entry: LedgerEntry, amount: str) -> None:
    """Master D49: an HR holder may change their own balance (IRIS has one HR holder), and every executive is
    told who, how many days, from when and why. Not when HR changes someone else's balance."""
    if actor is None or employee.user_id is None or employee.user_id != actor.pk:
        return
    notifications.notify(
        users=users_with_role(Role.EXEC).exclude(pk=actor.pk),
        event=event,
        params={
            "employee": organisation_selectors.full_name(employee),
            "amount": amount,
            "date": f"{entry.effective_date:%d/%m/%Y}",
            "reason": entry.reason,
        },
        target_type="employee",
        target_public_id=str(employee.public_id),
    )


@transaction.atomic
def post_opening(*, actor, employee, amount: Decimal, effective_date: date, reason: str) -> LedgerEntry:
    """The balance an employee starts with at go-live (BAL-06). Once per employee; any number (master D36).

    It is stated as of the day before monthly credits start (master D11), or earlier: dated later, it
    would count again days the first credits already give. Someone hired on or after that start has
    none (master D50): their credits are their balance, and days brought from elsewhere are an
    adjustment. No notification: HR enters opening balances at go-live, before the accounts are
    handed out.
    """
    reason = _clean_reason(reason)
    start = credit_start_date()
    if start is not None and employee.hire_date >= start:
        raise Conflict("balances.opening_not_offered")
    latest = opening_date()
    if latest is not None and effective_date > latest:
        raise DomainError("balances.opening_after_start", field="effective_date", latest=latest)
    reach.lock_employee(employee.id)
    if LedgerEntry.objects.filter(employee_id=employee.id, kind=LedgerKind.OPENING).exists():
        raise Conflict("balances.opening_exists")
    entry = LedgerEntry.objects.create(
        employee_id=employee.id,
        kind=LedgerKind.OPENING,
        amount=amount,
        effective_date=effective_date,
        reason=reason,
        created_by=actor,
    )
    _audit_line("ledger.opening_posted", entry, employee, actor)
    _tell_executives_of_own_change(
        "balance.own_opening", actor=actor, employee=employee, entry=entry, amount=f"{amount.normalize():f}"
    )
    return entry


@transaction.atomic
def adjust(*, actor, employee, amount: Decimal, effective_date: date, reason: str) -> LedgerEntry:
    """A correction by HR (BAL-05): a new line, positive or negative, never zero; it may take the balance
    below zero (master D36). The employee is notified.

    The employee is locked first, like the request engine's balance check, so the two cannot interleave.
    """
    reason = _clean_reason(reason)
    if amount == ZERO:
        raise DomainError("balances.zero_amount", field="amount")
    reach.lock_employee(employee.id)
    entry = LedgerEntry.objects.create(
        employee_id=employee.id,
        kind=LedgerKind.ADJUSTMENT,
        amount=amount,
        effective_date=effective_date,
        reason=reason,
        created_by=actor,
    )
    _audit_line("ledger.adjusted", entry, employee, actor)
    _tell_executives_of_own_change(
        "balance.own_adjustment", actor=actor, employee=employee, entry=entry, amount=signed_days(amount)
    )
    user = getattr(employee, "user", None)
    if user is not None:
        notifications.notify(
            users=[user],
            event="balance.adjusted",
            params={"amount": signed_days(amount), "reason": reason},
            target_type="balance",
            target_public_id=str(employee.public_id),
        )
    return entry
