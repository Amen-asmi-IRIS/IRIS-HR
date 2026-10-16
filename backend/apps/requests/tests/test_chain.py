from decimal import Decimal

import pytest

from apps.accounts import services as account_services
from apps.audit.models import AuditEvent
from apps.core.errors import DomainError
from apps.notifications import services as notification_services
from apps.notifications.models import Notification
from apps.organisation import services as organisation_services
from apps.requests import services
from apps.requests.models import RequestStatus, RequestStep
from apps.requests.services import StepSpec, chain, outcomes
from apps.requests.tests.helpers import MON, NOW, TODAY, TUE, days, fresh, stored

pytestmark = pytest.mark.django_db


def started(world, **options):
    options.setdefault("data", days(MON))
    request = stored(world, status=RequestStatus.PENDING, **options)
    chain.start_round(request=request, actor=request.created_by)
    return request


def steps(request) -> list[RequestStep]:
    return list(RequestStep.objects.filter(request=request).order_by("round", "position"))


def approve_all(request, by) -> None:
    for step in steps(request):
        step.status = "approved"
        step.decided_by = by
        step.save()


def test_starting_a_round_copies_the_chain_and_wakes_the_first_step(world):
    request = started(world)
    first, second = steps(request)
    assert (first.round, first.position, first.approver_rule, first.mode, first.status) == (
        1,
        1,
        "line_manager",
        "approve",
        "pending",
    )
    assert (first.activated_at, first.reminder_after_days, first.flag_after_days) == (NOW, 2, 4)
    assert (second.approver_rule, second.status, second.activated_at) == ("hr_role", "waiting", None)
    notification = Notification.objects.get(event_code="step.to_decide")
    assert (notification.user, notification.target_type, notification.target_public_id) == (
        world.manager_user,
        "request",
        str(request.public_id),
    )


def test_a_notify_step_informs_and_moves_on(world):
    request = started(world, request_type=world.sick, data=days(TODAY, comment="Grippe"))
    first, second = steps(request)
    assert (first.status, first.decided_at, second.status) == ("notified", NOW, "pending")
    assert Notification.objects.filter(event_code="sick.declared", user=world.manager_user).count() == 1
    assert Notification.objects.filter(event_code="step.to_decide", user=world.hr_user).count() == 1


def test_a_requester_without_a_manager_skips_the_manager_step(world):
    request = started(world, employee=world.ceo, created_by=world.exec_user)
    first, second = steps(request)
    assert (first.status, second.status) == ("skipped", "pending")
    assert Notification.objects.filter(event_code="step.to_decide", user=world.hr_user).count() == 1


def test_manager_who_cannot_act_is_flagged_to_hr_at_once(world):
    account_services.disable_account(actor=world.sysadmin_user, user=world.manager_user)
    request = started(world, employee=fresh(world.owner))
    first = steps(request)[0]
    assert (first.status, first.flagged_at) == ("pending", NOW)
    assert Notification.objects.filter(event_code="step.flagged", user=world.hr_user).count() == 1
    assert not Notification.objects.filter(event_code="step.to_decide").exists()


def test_the_request_of_someone_whose_manager_left_waits_and_is_flagged(world):
    """A leaver stays the manager of their reports until HR names a new one: that is not "no manager"."""
    organisation_services.archive_employee(
        actor=world.hr_user, employee=world.manager, leaving_date=TODAY, reason="Départ"
    )
    request = started(world, employee=fresh(world.owner))
    first, second = steps(request)
    assert (first.status, first.flagged_at, second.status) == ("pending", NOW, "waiting")
    assert Notification.objects.filter(event_code="step.flagged", user=world.hr_user).count() == 1


def test_a_step_that_only_informs_is_skipped_when_there_is_nobody_to_inform(world):
    request = started(
        world, employee=world.ceo, created_by=world.exec_user, request_type=world.sick, data=days(TODAY)
    )
    first, second = steps(request)
    assert (first.status, second.status) == ("skipped", "pending")
    assert not Notification.objects.filter(event_code="sick.declared").exists()


def test_a_manager_who_cannot_be_reached_is_not_recorded_as_informed(world):
    """A notification nobody received must not look like one that was given."""
    account_services.disable_account(actor=world.sysadmin_user, user=world.manager_user)
    request = started(world, employee=fresh(world.owner), request_type=world.sick, data=days(TODAY))
    first, second = steps(request)
    assert (first.status, second.status) == ("skipped", "pending")
    assert not Notification.objects.filter(event_code="sick.declared").exists()


def test_an_hr_step_nobody_can_take_alerts_the_administrators(world):
    services.replace_steps(
        actor=world.hr_user, request_type=world.remote, steps=[StepSpec(approver_rule="hr_role")]
    )
    account_services.disable_account(actor=world.sysadmin_user, user=world.exec_user)
    request = started(world, employee=fresh(world.hr), created_by=world.hr_user, request_type=world.remote)
    (only,) = steps(request)
    assert (only.status, only.flagged_at) == ("pending", None)
    assert Notification.objects.filter(event_code="hr_step.unattended", user=world.sysadmin_user).count() == 1


def test_chain_without_a_human_decision_gets_an_hr_step(world):
    services.replace_steps(
        actor=world.hr_user, request_type=world.remote, steps=[StepSpec(approver_rule="line_manager")]
    )
    request = started(world, employee=world.ceo, created_by=world.exec_user, request_type=world.remote)
    first, safety = steps(request)
    assert first.status == "skipped"
    assert (safety.round, safety.position, safety.approver_rule, safety.mode, safety.status) == (
        1,
        2,
        "hr_role",
        "approve",
        "pending",
    )
    assert fresh(request).status == "pending"


def test_a_type_left_without_steps_still_gets_a_person_to_decide(world):
    world.remote.chain_steps.all().delete()
    request = started(world, request_type=world.remote)
    (only,) = steps(request)
    assert (only.approver_rule, only.mode, only.status) == ("hr_role", "approve", "pending")


def test_when_every_step_is_done_the_request_is_approved(world, port):
    request = started(world, data=days(MON, TUE))
    approve_all(request, world.manager)
    chain.advance(request=request, actor=world.hr_user)
    saved = fresh(request)
    assert (saved.status, saved.decided_at) == ("approved", NOW)
    assert port.checks[-1]["ignoring_request_id"] == request.pk
    assert port.taken == [
        {
            "request_id": request.pk,
            "employee_id": world.owner.pk,
            "days": {MON: Decimal("1"), TUE: Decimal("1")},
            "actor": world.hr_user,
        }
    ]
    assert Notification.objects.filter(event_code="request.approved", user=world.owner_user).count() == 1
    assert AuditEvent.objects.filter(action="request.approved", object_id=str(request.public_id)).exists()


def test_final_approval_fails_when_the_balance_no_longer_covers_it(world, port):
    request = started(world)
    approve_all(request, world.manager)
    port.ok = False
    with pytest.raises(DomainError) as error:
        chain.advance(request=request, actor=world.hr_user)
    assert error.value.code == "request.balance_insufficient"
    assert fresh(request).status == "pending"
    assert port.taken == []


def test_an_exception_skips_the_balance_check_but_still_posts_the_days(world, port):
    request = stored(world, data=days(MON), status=RequestStatus.PENDING)
    request.override_reason = "Accord de la direction"
    request.save()
    chain.start_round(request=request, actor=world.hr_user)
    approve_all(request, world.manager)
    port.ok = False
    chain.advance(request=request, actor=world.hr_user)
    assert fresh(request).status == "approved"
    assert port.checks == []
    assert len(port.taken) == 1


def test_types_without_balance_effect_post_nothing(world, port):
    request = started(world, request_type=world.remote)
    approve_all(request, world.manager)
    chain.advance(request=request, actor=world.hr_user)
    assert fresh(request).status == "approved"
    assert (port.checks, port.taken) == ([], [])


def test_rejecting_closes_the_request_and_tells_the_requester(world):
    request = started(world)
    outcomes.reject(request=request, amendment=None, actor=world.manager_user)
    saved = fresh(request)
    assert (saved.status, saved.decided_at) == ("rejected", NOW)
    assert [step.status for step in steps(request)] == ["skipped", "skipped"]
    assert Notification.objects.filter(event_code="request.rejected", user=world.owner_user).count() == 1
    assert AuditEvent.objects.filter(action="request.rejected").exists()


def test_sending_back_returns_the_request_to_its_requester(world):
    request = started(world)
    outcomes.send_back(request=request, actor=world.manager_user)
    assert fresh(request).status == "returned"
    assert Notification.objects.filter(event_code="request.returned", user=world.owner_user).count() == 1
    assert AuditEvent.objects.filter(action="request.returned").exists()


ENGINE_EVENTS = {
    "step.to_decide": "/requests/{target}",
    "step.reminder": "/requests/{target}",
    "step.flagged": "/requests/{target}",
    "step.informed": "/requests/{target}",
    "request.approved": "/requests/{target}",
    "request.rejected": "/requests/{target}",
    "request.returned": "/requests/{target}",
    "request.withdrawn": "/requests/{target}",
    "request.cancelled": "/requests/{target}",
    "request.corrected": "/requests/{target}",
    "request.sent_on_behalf": "/requests/{target}",
    "amendment.submitted": "/requests/{target}",
    "amendment.approved": "/requests/{target}",
    "amendment.rejected": "/requests/{target}",
    "sick.declared": "/requests/{target}",
    "certificate.due_soon": "/requests/{target}",
    "certificate.overdue": "/requests/{target}",
    "hr_step.unattended": "/admin",
}


def test_the_events_of_the_request_engine_are_registered_with_their_link_and_texts():
    """Master 7.9 and D45. A later plan that lists the events (or translates them) starts from here."""
    from apps.core.i18n import all_messages

    registered = notification_services.registered_events()
    assert {code: registered[code].link for code in ENGINE_EVENTS if code in registered} == ENGINE_EVENTS
    known = all_messages()
    assert [
        f"notification.{code}.{part}"
        for code in ENGINE_EVENTS
        for part in ("title", "body")
        if f"notification.{code}.{part}" not in known
    ] == []
