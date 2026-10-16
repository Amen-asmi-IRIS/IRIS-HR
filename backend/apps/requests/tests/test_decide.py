import datetime as dt
from decimal import Decimal

import pytest

from apps.accounts.tests.world import make_user
from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed, NotFound
from apps.notifications.models import Notification
from apps.organisation import services as organisation_services
from apps.requests import selectors, services
from apps.requests.tests.helpers import (
    MON,
    NOW,
    TODAY,
    TUE,
    approved,
    days,
    decide,
    fresh,
    pending_step,
    steps,
    submitted,
)

pytestmark = pytest.mark.django_db


def test_the_manager_approves_and_the_hr_step_wakes(world):
    request = submitted(world)
    result = decide(request, world.manager_user, comment=" Bon repos ")
    assert (result.status, result.version) == ("pending", 3)
    first, second = steps(request)
    assert (
        first.status,
        first.decided_by,
        first.decided_at,
        first.channel,
        first.comment,
        first.recorded_by,
    ) == (
        "approved",
        world.manager,
        NOW,
        "in_app",
        "Bon repos",
        None,
    )
    assert (second.status, second.activated_at) == ("pending", NOW)
    assert Notification.objects.filter(event_code="step.to_decide", user=world.hr_user).count() == 1
    event = AuditEvent.objects.get(action="step.decided")
    assert (event.object_id, event.actor) == (str(request.public_id), world.manager_user)
    assert event.changes == {
        "step": {"before": None, "after": 1},
        "decision": {"before": None, "after": "approve"},
        "comment": {"before": None, "after": "Bon repos"},
    }


def test_hr_approves_last_and_the_request_is_approved(world, port):
    request = submitted(world, data=days(MON, TUE))
    decide(request, world.manager_user)
    result = decide(request, world.hr_user)
    assert (result.status, result.decided_at, result.version) == ("approved", NOW, 4)
    assert port.taken[0]["days"] == {MON: Decimal("1"), TUE: Decimal("1")}
    assert port.taken[0]["actor"] == world.hr_user
    assert Notification.objects.filter(event_code="request.approved", user=world.owner_user).count() == 1


def test_refusing_needs_a_reason(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        decide(request, world.manager_user, "reject", "   ")
    assert error.value.code == "request.reason_required"
    result = decide(request, world.manager_user, "reject", "Période de clôture")
    assert result.status == "rejected"
    assert [(step.status, step.comment) for step in steps(request)] == [
        ("rejected", "Période de clôture"),
        ("skipped", ""),
    ]


def test_sending_back_needs_a_comment(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        decide(request, world.manager_user, "return")
    assert error.value.code == "request.comment_required"
    result = decide(request, world.manager_user, "return", "Merci de décaler d'un jour")
    assert result.status == "returned"
    assert steps(request)[0].status == "returned"


def test_second_decision_on_the_same_step_is_refused(world):
    organisation_services.create_delegation(
        actor=world.hr_user,
        manager=world.manager,
        delegate=world.other_manager,
        start_date=TODAY,
        end_date=TODAY + dt.timedelta(days=30),
    )
    request = submitted(world)
    step = pending_step(request)
    services.decide_step(actor=world.manager_user, step=step, decision="approve", expected_version=2)
    with pytest.raises(Conflict) as error:
        services.decide_step(
            actor=world.other_manager_user, step=step, decision="reject", comment="Non", expected_version=2
        )
    assert error.value.code == "request.already_processed"
    with pytest.raises(Conflict):
        services.decide_step(
            actor=world.other_manager_user, step=step, decision="approve", expected_version=3
        )
    assert steps(request)[0].decided_by == world.manager
    assert fresh(request).status == "pending"


def test_stale_version_is_refused(world):
    request = submitted(world)
    step = pending_step(request)
    services.update_request(actor=world.owner_user, request=request, data=days(TUE), expected_version=2)
    with pytest.raises(Conflict) as error:
        services.decide_step(actor=world.manager_user, step=step, decision="approve", expected_version=2)
    assert error.value.code == "request.already_processed"
    assert pending_step(request).pk == step.pk


def test_nobody_decides_their_own_request(world):
    request = submitted(world, employee=world.hr, actor=world.hr_user)
    decide(request, world.exec_user)  # the CEO is the line manager of the HR Responsible
    current = fresh(request)
    step = pending_step(current)
    assert step.approver_rule == "hr_role"
    with pytest.raises(NotAllowed) as error:
        services.decide_step(
            actor=world.hr_user, step=step, decision="approve", expected_version=current.version
        )
    assert error.value.code == "request.own_request"
    result = decide(request, world.exec_user)  # the only HR holder is the requester: an executive validates
    assert result.status == "approved"


def test_no_other_door_leads_to_ones_own_request(world):
    """A step HR was alerted about, and a change to one's own approved leave, are no way around the rule."""
    own = submitted(world, employee=world.hr, actor=world.hr_user)
    step = pending_step(own)  # waits for the CEO, the line manager of the HR Responsible
    step.flagged_at = NOW
    step.save(update_fields=["flagged_at"])
    assert services.can_act_on(world.hr_user, step) is False
    assert list(selectors.queue(world.hr_user, "stuck")) == []
    with pytest.raises(NotAllowed) as error:
        decide(own, world.hr_user)
    assert error.value.code == "request.own_request"

    leave = approved(world, employee=world.hr, actor=world.hr_user, data=days(TUE))
    change = services.open_amendment(
        actor=world.hr_user, request=leave, kind="cancel", data=None, reason="Voyage annulé"
    )
    for _ in range(2):  # the manager's step, then the HR step
        current = fresh(leave)
        waiting = pending_step(current, change)
        assert services.can_act_on(world.hr_user, waiting) is False
        with pytest.raises(NotAllowed) as error:
            services.decide_step(
                actor=world.hr_user, step=waiting, decision="approve", expected_version=current.version
            )
        assert error.value.code == "request.own_request"
        services.decide_step(
            actor=world.exec_user, step=waiting, decision="approve", expected_version=current.version
        )
    assert fresh(leave).status == "cancelled"


def test_someone_who_is_not_an_approver_cannot_decide(world):
    request = submitted(world)
    with pytest.raises(NotFound):
        decide(request, world.peer_user)
    with pytest.raises(NotFound):
        decide(request, world.other_manager_user)


def test_hr_decides_a_manager_step_only_once_it_was_flagged(world):
    request = submitted(world)
    with pytest.raises(NotFound):
        decide(request, world.hr_user)
    step = pending_step(request)
    step.flagged_at = NOW
    step.save()
    result = decide(request, world.hr_user)
    assert result.status == "pending"
    assert steps(request)[0].decided_by == world.hr


def test_an_account_without_an_employee_record_cannot_decide(world):
    external = make_user("rh.externe@impactrisks.com", full_name="RH Externe", roles=["hr"])
    request = submitted(world)
    decide(request, world.manager_user)
    with pytest.raises(NotAllowed) as error:
        decide(request, external)
    assert error.value.code == "request.actor_without_record"


def test_a_delegate_decides_for_the_manager(world):
    organisation_services.create_delegation(
        actor=world.hr_user,
        manager=world.manager,
        delegate=world.other_manager,
        start_date=TODAY,
        end_date=TODAY + dt.timedelta(days=30),
    )
    request = submitted(world)
    decide(request, world.other_manager_user)
    assert steps(request)[0].decided_by == world.other_manager


def test_final_approval_checks_the_balance_again_and_changes_nothing_when_it_fails(world, port):
    request = submitted(world)
    decide(request, world.manager_user)
    port.ok = False
    with pytest.raises(DomainError) as error:
        decide(request, world.hr_user)
    assert error.value.code == "request.balance_insufficient"
    assert fresh(request).status == "pending"
    assert pending_step(request).approver_rule == "hr_role"
    assert port.taken == []


def test_the_approved_helper_runs_the_whole_chain(world):
    request = approved(world)
    assert request.status == "approved"
    assert [step.status for step in steps(request)] == ["approved", "approved"]
