from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import DomainError
from apps.requests import services
from apps.requests.models import ChainStep, ExceptionalEvent, RequestType
from apps.requests.services import StepSpec

pytestmark = pytest.mark.django_db


def chain(request_type: RequestType) -> list[tuple]:
    return [
        (step.position, step.approver_rule, step.mode, step.reminder_after_days, step.flag_after_days)
        for step in request_type.chain_steps.order_by("position")
    ]


NEW_TYPE = {"code": "mission", "name_fr": "Mission", "name_en": "Business trip", "unit": "day"}


def test_five_types_are_seeded_as_in_the_prd_table(world):
    annual, sick, exceptional = world.annual, world.sick, world.exceptional
    permission, remote = world.permission, world.remote
    assert (annual.unit, annual.allows_half_day, annual.balance_effect, annual.calendar_label) == (
        "day",
        True,
        "deducts_annual",
        "absent",
    )
    assert (sick.document_rule, sick.is_sensitive, sick.allows_past_dates, sick.balance_effect) == (
        "required_within_deadline",
        True,
        True,
        "none",
    )
    assert sick.document_deadline_hours is None
    assert (exceptional.uses_events, exceptional.allows_half_day) == (True, False)
    assert (permission.unit, permission.calendar_label) == ("hour", "hidden")
    assert (remote.cap_quantity, remote.cap_period, remote.calendar_label) == (
        Decimal("2.00"),
        "week",
        "remote",
    )
    assert [t.reduces_meal_tickets for t in (annual, sick, exceptional, permission, remote)] == [
        True,
        True,
        True,
        False,
        False,
    ]


def test_seeded_chains_are_manager_then_hr_and_sick_leave_only_informs_the_manager(world):
    manager_then_hr = [(1, "line_manager", "approve", 2, 4), (2, "hr_role", "approve", 2, None)]
    for request_type in (world.annual, world.exceptional, world.permission, world.remote):
        assert chain(request_type) == manager_then_hr
    assert chain(world.sick) == [(1, "line_manager", "notify", 2, None), (2, "hr_role", "approve", 2, None)]


def test_a_new_type_gets_the_default_chain_and_is_audited(world):
    created = services.create_request_type(actor=world.hr_user, data=NEW_TYPE)
    assert created.is_active is True
    assert chain(created) == [(1, "line_manager", "approve", 2, 4), (2, "hr_role", "approve", 2, None)]
    assert AuditEvent.objects.filter(action="requesttype.created", object_id=str(created.pk)).exists()


def test_a_type_code_is_unique(world):
    with pytest.raises(DomainError) as error:
        services.create_request_type(actor=world.hr_user, data={**NEW_TYPE, "code": "annual"})
    assert error.value.code == "request.type_code_taken"


def test_an_hour_type_cannot_allow_half_days(world):
    with pytest.raises(DomainError) as error:
        services.create_request_type(
            actor=world.hr_user, data={**NEW_TYPE, "unit": "hour", "allows_half_day": True}
        )
    assert error.value.code == "request.type_half_day_hours"


def test_a_limit_needs_its_period(world):
    with pytest.raises(DomainError) as error:
        services.create_request_type(actor=world.hr_user, data={**NEW_TYPE, "cap_quantity": Decimal("3")})
    assert error.value.code == "request.type_cap_incomplete"


def test_update_changes_attributes_but_never_code_or_unit(world):
    updated = services.update_request_type(
        actor=world.hr_user, request_type=world.remote, data={"cap_quantity": Decimal("3"), "notice_days": 1}
    )
    assert (updated.cap_quantity, updated.notice_days) == (Decimal("3"), 1)
    assert AuditEvent.objects.filter(action="requesttype.updated", object_id=str(world.remote.pk)).exists()
    with pytest.raises(DomainError) as error:
        services.update_request_type(actor=world.hr_user, request_type=world.remote, data={"unit": "hour"})
    assert error.value.code == "request.type_fixed"


def test_replace_steps_renumbers_and_is_audited(world):
    steps = services.replace_steps(
        actor=world.hr_user,
        request_type=world.remote,
        steps=[
            StepSpec(approver_rule="named_person", named_person=world.other_manager, reminder_after_days=1),
            StepSpec(approver_rule="hr_role", mode="notify"),
        ],
    )
    assert [(s.position, s.approver_rule, s.named_person_id, s.mode) for s in steps] == [
        (1, "named_person", world.other_manager.pk, "approve"),
        (2, "hr_role", None, "notify"),
    ]
    assert ChainStep.objects.filter(request_type=world.remote).count() == 2
    assert AuditEvent.objects.filter(action="requesttype.steps_replaced").exists()


def test_a_chain_needs_at_least_one_step_that_decides(world):
    with pytest.raises(DomainError) as error:
        services.replace_steps(
            actor=world.hr_user,
            request_type=world.remote,
            steps=[StepSpec(approver_rule="hr_role", mode="notify")],
        )
    assert error.value.code == "request.chain_needs_approver"
    assert len(chain(world.remote)) == 2


def test_a_named_person_step_needs_the_person(world):
    with pytest.raises(DomainError) as error:
        services.replace_steps(
            actor=world.hr_user, request_type=world.remote, steps=[StepSpec(approver_rule="named_person")]
        )
    assert error.value.code == "request.named_person_required"


def test_step_delays_must_be_at_least_one_working_day(world):
    with pytest.raises(DomainError) as error:
        services.replace_steps(
            actor=world.hr_user,
            request_type=world.remote,
            steps=[StepSpec(approver_rule="hr_role", reminder_after_days=0)],
        )
    assert error.value.code == "request.step_delay_invalid"


def test_events_are_created_and_updated_with_an_audit_record(world):
    event = services.create_event(
        actor=world.hr_user,
        name_fr="Naissance",
        name_en="Birth",
        days_allowed=Decimal("2"),
        proof_required=True,
    )
    assert ExceptionalEvent.objects.filter(pk=event.pk, is_active=True).exists()
    updated = services.update_event(
        actor=world.hr_user, event=event, days_allowed=Decimal("3"), is_active=False
    )
    assert (updated.days_allowed, updated.is_active) == (Decimal("3"), False)
    assert AuditEvent.objects.filter(action="exceptionalevent.created").count() == 1
    assert AuditEvent.objects.filter(action="exceptionalevent.updated").count() == 1


def test_an_event_must_allow_more_than_zero_days(world):
    with pytest.raises(DomainError) as error:
        services.create_event(actor=world.hr_user, name_fr="X", name_en="X", days_allowed=Decimal("0"))
    assert error.value.code == "request.event_days_invalid"
