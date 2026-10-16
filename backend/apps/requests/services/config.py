from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db import transaction

from apps.audit import services as audit
from apps.core.errors import DomainError

from ..models import ApproverRule, CapPeriod, ChainStep, ExceptionalEvent, RequestType, StepMode, Unit

TYPE_FIELDS = (
    "code",
    "name_fr",
    "name_en",
    "description_fr",
    "description_en",
    "unit",
    "allows_half_day",
    "balance_effect",
    "document_rule",
    "document_deadline_hours",
    "allows_past_dates",
    "notice_days",
    "cap_quantity",
    "cap_period",
    "reduces_meal_tickets",
    "calendar_label",
    "is_sensitive",
    "uses_events",
    "is_active",
    "sort_order",
)
TYPE_DEFAULTS: dict[str, Any] = {
    "description_fr": "",
    "description_en": "",
    "allows_half_day": False,
    "balance_effect": "none",
    "document_rule": "none",
    "document_deadline_hours": None,
    "allows_past_dates": False,
    "notice_days": 0,
    "cap_quantity": None,
    "cap_period": "none",
    "reduces_meal_tickets": False,
    "calendar_label": "absent",
    "is_sensitive": False,
    "uses_events": False,
    "is_active": True,
    "sort_order": 100,
}
FIXED_FIELDS = ("code", "unit")
EVENT_FIELDS = ("name_fr", "name_en", "days_allowed", "proof_required", "is_active")


@dataclass(frozen=True)
class StepSpec:
    """One step of a chain as HR configures it. `named_person` is an organisation.Employee or None."""

    approver_rule: str
    mode: str = StepMode.APPROVE
    named_person: Any = None
    reminder_after_days: int = 2
    flag_after_days: int | None = None


def _check_type(values: Mapping[str, Any]) -> None:
    if values["unit"] == Unit.HOUR and values["allows_half_day"]:
        raise DomainError("request.type_half_day_hours", field="allows_half_day")
    has_cap = values["cap_quantity"] is not None
    has_period = values["cap_period"] != CapPeriod.NONE
    if has_cap != has_period:
        raise DomainError("request.type_cap_incomplete", field="cap_quantity")


@transaction.atomic
def create_request_type(*, actor, data: Mapping[str, Any]) -> RequestType:
    values = {**TYPE_DEFAULTS, **data}
    if RequestType.objects.filter(code=values["code"]).exists():
        raise DomainError("request.type_code_taken", field="code")
    _check_type(values)
    request_type = RequestType.objects.create(**{field: values[field] for field in TYPE_FIELDS})
    ChainStep.objects.create(
        request_type=request_type,
        position=1,
        approver_rule=ApproverRule.LINE_MANAGER,
        mode=StepMode.APPROVE,
        reminder_after_days=2,
        flag_after_days=4,
    )
    ChainStep.objects.create(
        request_type=request_type,
        position=2,
        approver_rule=ApproverRule.HR_ROLE,
        mode=StepMode.APPROVE,
        reminder_after_days=2,
        flag_after_days=None,
    )
    audit.record(
        action="requesttype.created",
        obj=request_type,
        object_label=request_type.code,
        changes=audit.diff(dict.fromkeys(TYPE_FIELDS), audit.snapshot(request_type, TYPE_FIELDS)),
        actor=actor,
    )
    return request_type


@transaction.atomic
def update_request_type(*, actor, request_type: RequestType, data: Mapping[str, Any]) -> RequestType:
    for field in FIXED_FIELDS:
        if field in data and data[field] != getattr(request_type, field):
            raise DomainError("request.type_fixed", field=field)
    before = audit.snapshot(request_type, TYPE_FIELDS)
    for field in TYPE_FIELDS:
        if field in data:
            setattr(request_type, field, data[field])
    _check_type({field: getattr(request_type, field) for field in TYPE_FIELDS})
    request_type.save()
    audit.record(
        action="requesttype.updated",
        obj=request_type,
        object_label=request_type.code,
        changes=audit.diff(before, audit.snapshot(request_type, TYPE_FIELDS)),
        actor=actor,
    )
    return request_type


def _describe_chain(request_type: RequestType) -> list[dict[str, Any]]:
    return [
        {
            "position": step.position,
            "approver_rule": step.approver_rule,
            "mode": step.mode,
            "named_person_id": step.named_person_id,
            "reminder_after_days": step.reminder_after_days,
            "flag_after_days": step.flag_after_days,
        }
        for step in ChainStep.objects.filter(request_type=request_type).order_by("position")
    ]


@transaction.atomic
def replace_steps(*, actor, request_type: RequestType, steps: Sequence[StepSpec]) -> list[ChainStep]:
    """Replace the whole chain of a type. Requests already submitted keep the chain they were sent with."""
    if not any(step.mode == StepMode.APPROVE for step in steps):
        raise DomainError("request.chain_needs_approver", field="steps")
    for step in steps:
        if step.approver_rule == ApproverRule.NAMED_PERSON and step.named_person is None:
            raise DomainError("request.named_person_required", field="steps")
        if step.reminder_after_days < 1 or (step.flag_after_days is not None and step.flag_after_days < 1):
            raise DomainError("request.step_delay_invalid", field="steps")
    before = _describe_chain(request_type)
    ChainStep.objects.filter(request_type=request_type).delete()
    created = [
        ChainStep.objects.create(
            request_type=request_type,
            position=position,
            approver_rule=step.approver_rule,
            mode=step.mode,
            named_person=step.named_person if step.approver_rule == ApproverRule.NAMED_PERSON else None,
            reminder_after_days=step.reminder_after_days,
            flag_after_days=step.flag_after_days,
        )
        for position, step in enumerate(steps, start=1)
    ]
    audit.record(
        action="requesttype.steps_replaced",
        obj=request_type,
        object_label=request_type.code,
        changes={"steps": {"before": before, "after": _describe_chain(request_type)}},
        actor=actor,
    )
    return created


@transaction.atomic
def create_event(
    *,
    actor,
    name_fr: str,
    name_en: str,
    days_allowed: Decimal,
    proof_required: bool = False,
    is_active: bool = True,
) -> ExceptionalEvent:
    if days_allowed <= 0:
        raise DomainError("request.event_days_invalid", field="days_allowed")
    event = ExceptionalEvent.objects.create(
        name_fr=name_fr.strip(),
        name_en=name_en.strip(),
        days_allowed=days_allowed,
        proof_required=proof_required,
        is_active=is_active,
    )
    audit.record(
        action="exceptionalevent.created",
        obj=event,
        object_label=event.name_fr,
        changes=audit.diff(dict.fromkeys(EVENT_FIELDS), audit.snapshot(event, EVENT_FIELDS)),
        actor=actor,
    )
    return event


@transaction.atomic
def update_event(*, actor, event: ExceptionalEvent, **fields: Any) -> ExceptionalEvent:
    unknown = set(fields) - set(EVENT_FIELDS)
    if unknown:
        raise TypeError(f"unknown event fields: {sorted(unknown)}")
    if "days_allowed" in fields and fields["days_allowed"] <= 0:
        raise DomainError("request.event_days_invalid", field="days_allowed")
    before = audit.snapshot(event, EVENT_FIELDS)
    for field, value in fields.items():
        setattr(event, field, value.strip() if isinstance(value, str) else value)
    event.save()
    audit.record(
        action="exceptionalevent.updated",
        obj=event,
        object_label=event.name_fr,
        changes=audit.diff(before, audit.snapshot(event, EVENT_FIELDS)),
        actor=actor,
    )
    return event
