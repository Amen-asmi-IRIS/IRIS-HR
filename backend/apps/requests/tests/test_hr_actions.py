from decimal import Decimal

import pytest

from apps.accounts import services as account_services
from apps.accounts.roles import Role
from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.notifications.models import Notification
from apps.requests import services
from apps.requests.models import RequestStep
from apps.requests.tests.helpers import (
    MON,
    THU,
    TUE,
    WED,
    approved,
    at,
    days,
    fresh,
    pending_step,
    steps,
    stored,
    submitted,
)

pytestmark = pytest.mark.django_db


def told(event: str) -> set[int]:
    return set(Notification.objects.filter(event_code=event).values_list("user_id", flat=True))


def test_hr_shortens_an_approved_leave_and_the_days_come_back(world, port):
    request = approved(world, data=days(MON, WED))
    port.taken.clear()
    port.checks.clear()

    result = services.hr_correct(
        actor=world.hr_user, request=request, data=days(MON, TUE), reason=" Retour anticipé "
    )

    assert (result.status, result.end_date, result.quantity, result.version) == (
        "approved",
        TUE,
        Decimal("2.00"),
        request.version + 1,
    )
    assert port.restored == [
        {
            "request_id": request.pk,
            "employee_id": world.owner.pk,
            "days": {WED: Decimal("1")},
            "actor": world.hr_user,
            "reason": "Retour anticipé",
        }
    ]
    assert (port.taken, port.checks) == ([], [])
    event = AuditEvent.objects.get(action="request.corrected")
    assert event.changes["reason"] == {"before": None, "after": "Retour anticipé"}
    assert "end_date" in event.changes
    assert told("request.corrected") == {world.owner_user.pk, world.manager_user.pk}


def test_hr_extends_an_approved_leave_without_a_balance_check(world, port):
    request = approved(world, data=days(MON, TUE))
    port.taken.clear()
    port.checks.clear()
    port.ok = False
    result = services.hr_correct(
        actor=world.hr_user, request=request, data=days(MON, THU), reason="Accord direction"
    )
    assert result.quantity == Decimal("4.00")
    assert port.checks == []
    assert [entry["days"] for entry in port.taken] == [{WED: Decimal("1"), THU: Decimal("1")}]


def test_hr_corrects_a_leave_that_has_already_started(world, clock):
    request = approved(world, data=days(MON, WED))
    clock.move_to(at(11, 3))
    result = services.hr_correct(
        actor=world.hr_user, request=request, data=days(MON, TUE), reason="Reprise mardi soir"
    )
    assert result.end_date == TUE


def test_hr_corrects_a_pending_request_and_the_chain_goes_on(world, port):
    request = submitted(world, data=days(MON))
    result = services.hr_correct(
        actor=world.hr_user, request=request, data=days(TUE), reason="Erreur de date"
    )
    assert (result.status, result.start_date) == ("pending", TUE)
    assert pending_step(request).approver_rule == "line_manager"
    assert (port.taken, port.restored) == ([], [])


def test_a_correction_cannot_create_an_overlap(world):
    request = approved(world, data=days(MON))
    stored(world, request_type=world.remote, data=days(WED))
    with pytest.raises(DomainError) as error:
        services.hr_correct(actor=world.hr_user, request=request, data=days(MON, WED), reason="Prolongation")
    assert error.value.code == "request.overlap"


def test_a_correction_needs_a_reason_and_a_change(world):
    request = approved(world, data=days(MON))
    with pytest.raises(DomainError) as no_reason:
        services.hr_correct(actor=world.hr_user, request=request, data=days(TUE), reason="  ")
    assert no_reason.value.code == "request.reason_required"
    with pytest.raises(DomainError) as same:
        services.hr_correct(actor=world.hr_user, request=request, data=days(MON), reason="Rien")
    assert same.value.code == "request.nothing_to_change"


def test_hr_never_corrects_or_cancels_its_own_request(world):
    request = approved(world, employee=world.hr, actor=world.hr_user)
    with pytest.raises(NotAllowed) as correcting:
        services.hr_correct(actor=world.hr_user, request=request, data=days(TUE), reason="Pour moi")
    assert correcting.value.code == "request.own_request"
    with pytest.raises(NotAllowed) as cancelling:
        services.hr_cancel(actor=world.hr_user, request=request, reason="Pour moi")
    assert cancelling.value.code == "request.own_request"


def test_only_hr_corrects_or_cancels(world):
    request = approved(world)
    for user in (world.manager_user, world.exec_user, world.owner_user):
        with pytest.raises(NotAllowed):
            services.hr_correct(actor=user, request=request, data=days(TUE), reason="Test")
        with pytest.raises(NotAllowed):
            services.hr_cancel(actor=user, request=request, reason="Test")


def test_a_correction_waits_for_an_open_change(world):
    request = approved(world)
    services.open_amendment(
        actor=world.owner_user, request=request, kind="cancel", data=None, reason="Annulé"
    )
    with pytest.raises(Conflict) as error:
        services.hr_correct(actor=world.hr_user, request=fresh(request), data=days(TUE), reason="Test")
    assert error.value.code == "request.amendment_open"


def test_hr_cancels_an_approved_leave(world, port):
    request = approved(world, data=days(MON, TUE))
    result = services.hr_cancel(actor=world.hr_user, request=request, reason="Départ de l'employé")
    assert (result.status, result.version) == ("cancelled", request.version + 1)
    assert port.restored == [
        {
            "request_id": request.pk,
            "employee_id": world.owner.pk,
            "days": {MON: Decimal("1"), TUE: Decimal("1")},
            "actor": world.hr_user,
            "reason": "Départ de l'employé",
        }
    ]
    event = AuditEvent.objects.get(action="request.cancelled")
    assert event.changes["status"] == {"before": "approved", "after": "cancelled"}
    assert told("request.cancelled") == {world.owner_user.pk, world.manager_user.pk}
    assert Notification.objects.filter(event_code="request.cancelled", user=world.manager_user).count() == 1


def test_hr_cancels_a_pending_request_and_tells_whoever_was_deciding(world, port):
    account_services.assign_role(actor=world.sysadmin_user, user=world.other_manager_user, role=Role.HR)
    request = submitted(world)
    services.decide_step(
        actor=world.manager_user,
        step=pending_step(request),
        decision="approve",
        expected_version=request.version,
    )
    result = services.hr_cancel(actor=world.hr_user, request=fresh(request), reason="Doublon")
    assert result.status == "cancelled"
    assert [step.status for step in steps(request)] == ["approved", "skipped"]
    assert port.restored == []
    # The requester, the manager who had approved, and the other HR holder who could have validated.
    # The HR holder who cancelled is not told about their own action.
    assert told("request.cancelled") == {
        world.owner_user.pk,
        world.manager_user.pk,
        world.other_manager_user.pk,
    }


def test_cancelling_closes_an_open_change(world):
    request = approved(world)
    amendment = services.open_amendment(
        actor=world.owner_user, request=request, kind="change", data=days(WED), reason="Décalage"
    )
    services.hr_cancel(actor=world.hr_user, request=fresh(request), reason="Annulation générale")
    assert fresh(amendment).status == "withdrawn"
    assert not RequestStep.objects.filter(amendment=amendment, status__in=["pending", "waiting"]).exists()


def test_a_closed_request_is_neither_corrected_nor_cancelled(world):
    request = submitted(world)
    services.withdraw(actor=world.owner_user, request=request)
    with pytest.raises(Conflict) as cancelling:
        services.hr_cancel(actor=world.hr_user, request=request, reason="Test")
    assert cancelling.value.code == "request.already_processed"
    with pytest.raises(Conflict):
        services.hr_correct(actor=world.hr_user, request=request, data=days(TUE), reason="Test")


def test_cancelling_needs_a_reason(world):
    request = approved(world)
    with pytest.raises(DomainError) as error:
        services.hr_cancel(actor=world.hr_user, request=request, reason="")
    assert error.value.code == "request.reason_required"
