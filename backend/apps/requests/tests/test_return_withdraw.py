from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.notifications.models import Notification
from apps.requests import services
from apps.requests.services import validate
from apps.requests.tests.helpers import (
    MON,
    NEXT_MON,
    NOW,
    TODAY,
    TUE,
    WED,
    approved,
    days,
    decide,
    fresh,
    pending_step,
    steps,
    stored,
    submitted,
)

pytestmark = pytest.mark.django_db


def rows(request) -> list[tuple]:
    return [(step.round, step.position, step.status) for step in steps(request)]


def test_a_returned_request_is_edited_and_sent_again_in_a_new_round(world, clock):
    request = submitted(world)
    decide(request, world.manager_user, "return", "Merci de décaler d'un jour")
    returned = fresh(request)
    assert returned.status == "returned"

    clock.shift(3600)
    edited = services.update_request(
        actor=world.owner_user, request=returned, data=days(TUE), expected_version=returned.version
    )
    resent = services.submit(actor=world.owner_user, request=edited, expected_version=edited.version)

    assert (resent.status, resent.start_date, resent.submitted_at) == ("pending", TUE, NOW)
    assert rows(request) == [(1, 1, "returned"), (1, 2, "skipped"), (2, 1, "pending"), (2, 2, "waiting")]
    assert Notification.objects.filter(event_code="step.to_decide", user=world.manager_user).count() == 2


def test_a_request_returned_by_hr_restarts_at_the_first_step(world):
    request = submitted(world)
    decide(request, world.manager_user)
    decide(request, world.hr_user, "return", "Le motif manque")
    returned = fresh(request)
    services.submit(actor=world.owner_user, request=returned, expected_version=returned.version)
    assert rows(request) == [(1, 1, "approved"), (1, 2, "returned"), (2, 1, "pending"), (2, 2, "waiting")]
    assert pending_step(request).approver_rule == "line_manager"


def test_a_returned_request_still_occupies_its_dates(world):
    request = submitted(world, data=days(MON))
    decide(request, world.manager_user, "return", "À revoir")
    # PRD 6.4: pending, returned and approved requests block the dates of their requester.
    problems = validate(employee=world.owner, request_type=world.remote, data=days(MON))
    assert [problem.code for problem in problems] == ["request.overlap"]
    assert validate(employee=world.owner, request_type=world.remote, data=days(TUE)) == []


def test_the_employee_edits_a_pending_request_until_the_first_decision(world):
    request = submitted(world)
    edited = services.update_request(
        actor=world.owner_user, request=request, data=days(MON, TUE), expected_version=request.version
    )
    assert (edited.status, edited.quantity, edited.version) == ("pending", Decimal("2.00"), 3)
    assert rows(request) == [(1, 1, "pending"), (1, 2, "waiting")]


def test_while_a_request_waits_only_its_requester_edits_it(world):
    """REQ-07 is for the employee. HR changes a waiting request by a correction, with its reason (REQ-09)."""
    request = submitted(world)
    with pytest.raises(NotAllowed):
        services.update_request(actor=world.hr_user, request=request, data=days(TUE), expected_version=2)
    entered = submitted(
        world, employee=world.peer, actor=world.hr_user, data=days(WED), override_reason="Accord"
    )
    for actor in (world.hr_user, world.peer_user):
        with pytest.raises(NotAllowed):
            services.update_request(actor=actor, request=entered, data=days(TUE), expected_version=2)
    assert (fresh(request).start_date, fresh(entered).start_date) == (MON, WED)
    assert not AuditEvent.objects.filter(action="request.updated").exists()


def test_editing_a_pending_request_is_fully_validated(world):
    stored(world, data=days(WED))
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        services.update_request(
            actor=world.owner_user, request=request, data=days(MON, WED), expected_version=request.version
        )
    assert error.value.code == "request.overlap"


def test_after_the_first_decision_the_employee_can_no_longer_edit(world):
    request = submitted(world)
    decide(request, world.manager_user)
    current = fresh(request)
    with pytest.raises(Conflict) as error:
        services.update_request(
            actor=world.owner_user, request=current, data=days(TUE), expected_version=current.version
        )
    assert error.value.code == "request.not_editable"


def test_being_informed_is_not_a_decision(world):
    request = submitted(world, request_type=world.sick, data=days(TODAY))
    assert rows(request) == [(1, 1, "notified"), (1, 2, "pending")]
    edited = services.update_request(
        actor=world.owner_user,
        request=request,
        data=days(TODAY, comment="Angine"),
        expected_version=request.version,
    )
    assert edited.comment == "Angine"


def test_the_employee_withdraws_before_the_first_decision(world):
    request = submitted(world)
    withdrawn = services.withdraw(actor=world.owner_user, request=request)
    assert (withdrawn.status, withdrawn.version) == ("withdrawn", 3)
    assert rows(request) == [(1, 1, "skipped"), (1, 2, "skipped")]
    assert Notification.objects.filter(event_code="request.withdrawn", user=world.manager_user).count() == 1
    assert AuditEvent.objects.filter(action="request.withdrawn", object_id=str(request.public_id)).exists()


def test_the_employee_withdraws_after_the_first_decision(world):
    request = submitted(world)
    decide(request, world.manager_user)
    withdrawn = services.withdraw(actor=world.owner_user, request=fresh(request))
    assert withdrawn.status == "withdrawn"
    assert rows(request) == [(1, 1, "approved"), (1, 2, "skipped")]
    told = set(Notification.objects.filter(event_code="request.withdrawn").values_list("user_id", flat=True))
    assert told == {world.manager_user.pk, world.hr_user.pk}


def test_a_returned_request_can_be_withdrawn(world):
    request = submitted(world)
    decide(request, world.manager_user, "return", "À revoir")
    assert services.withdraw(actor=world.owner_user, request=fresh(request)).status == "withdrawn"


def test_an_approved_request_cannot_be_withdrawn(world):
    request = approved(world)
    with pytest.raises(Conflict) as error:
        services.withdraw(actor=world.owner_user, request=request)
    assert error.value.code == "request.not_withdrawable"
    assert fresh(request).status == "approved"


def test_only_the_requester_withdraws(world):
    request = submitted(world)
    with pytest.raises(NotAllowed):
        services.withdraw(actor=world.manager_user, request=request)
    with pytest.raises(NotAllowed):
        services.withdraw(actor=world.hr_user, request=request)


def test_decision_after_withdrawal_is_refused(world):
    request = submitted(world)
    step = pending_step(request)
    services.withdraw(actor=world.owner_user, request=request)
    with pytest.raises(Conflict) as error:
        services.decide_step(
            actor=world.manager_user, step=step, decision="approve", expected_version=request.version
        )
    assert error.value.code == "request.already_processed"
    assert fresh(request).status == "withdrawn"


def test_a_withdrawn_request_frees_its_dates(world):
    request = submitted(world, data=days(NEXT_MON))
    services.withdraw(actor=world.owner_user, request=request)
    assert validate(employee=world.owner, request_type=world.remote, data=days(NEXT_MON)) == []
