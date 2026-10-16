"""Everything the request form shows before anything is saved (UI 5.3): computed, never asked."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.calendar import workdays
from apps.core.errors import NotAllowed, Problem
from apps.organisation import reach

from ..models import BalanceEffect, DocumentRule, ExceptionalEvent, Unit
from ..ports import BalancePreview, balance_port
from .chain import ChainRow, chain_preview
from .data import CENT, ZERO, RequestData, compute_quantity, leave_days
from .lifecycle import certificate_deadline_hours
from .validation import MAX_SPAN_DAYS, CapUsage, cap_usage, hours_in_month, validate


@dataclass(frozen=True)
class Preview:
    quantity: Decimal
    skipped_days: list[tuple[date, str]]
    chain: list[ChainRow]
    balance: BalancePreview | None
    cap: CapUsage | None
    month_hours: Decimal | None
    event_days_allowed: Decimal | None
    certificate_due_at: datetime | None
    problems: list[Problem]


def preview(
    *,
    actor,
    employee,
    request_type,
    data: RequestData,
    override: bool = False,
    ignoring_request_id: int | None = None,
) -> Preview:
    """Quantity, skipped days, who will decide, balance, usage and every problem, for a form not yet saved."""
    me = reach.employee_of(actor)
    own = me is not None and me.pk == employee.pk
    is_hr = has_role(actor, Role.HR)
    if not own and not is_hr:
        raise NotAllowed("core.not_allowed")
    if override and not is_hr:
        raise NotAllowed("core.not_allowed")
    if override and own:
        raise NotAllowed("request.own_request")

    problems = validate(
        employee=employee,
        request_type=request_type,
        data=data,
        override=override,
        ignoring_request_id=ignoring_request_id,
    )
    # Nothing is counted for a period that is the wrong way round, or too long to be meant.
    ordered = 0 <= (data.end_date - data.start_date).days < MAX_SPAN_DAYS
    by_day = request_type.unit == Unit.DAY
    days = leave_days(request_type, data) if ordered else {}
    quantity = compute_quantity(request_type, data) if ordered else ZERO.quantize(CENT)
    skipped = workdays.skipped_days(data.start_date, data.end_date) if ordered and by_day else []

    balance = None
    if request_type.balance_effect == BalanceEffect.DEDUCTS_ANNUAL and days:
        balance = balance_port().preview(
            employee_id=employee.pk, new_days=days, ignoring_request_id=ignoring_request_id
        )

    month_hours = None
    if by_day:
        portions = days
    else:
        portions = {data.start_date: quantity} if quantity else {}
        month_hours = hours_in_month(
            employee=employee,
            request_type=request_type,
            day=data.start_date,
            ignoring_request_id=ignoring_request_id,
        )
    usages = cap_usage(
        employee=employee,
        request_type=request_type,
        portions=portions,
        ignoring_request_id=ignoring_request_id,
    )
    cap = max(usages, key=lambda usage: usage.used + usage.adding) if usages else None

    event_days_allowed = None
    if request_type.uses_events and data.exceptional_event_id is not None:
        event = ExceptionalEvent.objects.filter(pk=data.exceptional_event_id, is_active=True).first()
        event_days_allowed = event.days_allowed if event is not None else None

    certificate_due_at = None
    if request_type.document_rule == DocumentRule.REQUIRED_WITHIN_DEADLINE:
        certificate_due_at = timezone.now() + timedelta(hours=certificate_deadline_hours(request_type))

    return Preview(
        quantity=quantity,
        skipped_days=skipped,
        chain=chain_preview(request_type=request_type, employee=employee),
        balance=balance,
        cap=cap,
        month_hours=month_hours,
        event_days_allowed=event_days_allowed,
        certificate_due_at=certificate_due_at,
        problems=problems,
    )
