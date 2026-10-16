import datetime as dt

import pytest

from apps.accounts import services as account_services
from apps.core.errors import DomainError, NotAllowed
from apps.organisation import services as organisation_services
from apps.requests import selectors, services
from apps.requests.services import StepSpec
from apps.requests.tests.helpers import (
    MON,
    NOW,
    TODAY,
    TUE,
    WED,
    approved,
    days,
    decide,
    pdf,
    pending_step,
    submitted,
)

pytestmark = pytest.mark.django_db


def requests_in(user, name) -> list[int]:
    return [step.request_id for step in selectors.queue(user, name)]


def sick(world, **options):
    return submitted(world, request_type=world.sick, data=days(TODAY), **options)


def test_a_manager_finds_the_steps_of_their_team_oldest_first(world, clock):
    first = submitted(world, data=days(MON))
    clock.shift(60)
    second = submitted(world, employee=world.peer, data=days(MON))
    submitted(world, employee=world.outsider, data=days(MON))
    assert requests_in(world.manager_user, "mine") == [first.pk, second.pk]
    assert requests_in(world.other_manager_user, "mine") != requests_in(world.manager_user, "mine")
    assert requests_in(world.owner_user, "mine") == []


def test_a_step_leaves_the_queue_once_decided_and_enters_the_hr_queue(world):
    request = submitted(world)
    assert requests_in(world.hr_user, "hr") == []
    decide(request, world.manager_user)
    assert requests_in(world.manager_user, "mine") == []
    assert requests_in(world.hr_user, "hr") == [request.pk]
    assert requests_in(world.hr_user, "mine") == []  # HR steps are the HR desk's, not My team's


def test_a_delegate_sees_the_steps_of_the_manager_they_cover(world):
    organisation_services.create_delegation(
        actor=world.hr_user,
        manager=world.manager,
        delegate=world.other_manager,
        start_date=TODAY,
        end_date=TODAY + dt.timedelta(days=14),
    )
    request = submitted(world)
    assert request.pk in requests_in(world.other_manager_user, "mine")
    step = pending_step(request)
    assert selectors.via_delegation_from(step, world.other_manager_user) == "Mounir Manager"
    assert selectors.via_delegation_from(step, world.manager_user) is None


def test_nobody_finds_their_own_request_in_a_queue(world):
    own = submitted(world, employee=world.manager, data=days(MON))
    assert requests_in(world.manager_user, "mine") == []
    assert requests_in(world.exec_user, "mine") == [own.pk]
    hr_own = submitted(world, employee=world.hr, actor=world.hr_user, data=days(TUE))
    decide(hr_own, world.exec_user)
    assert requests_in(world.hr_user, "hr") == []
    # The only HR holder is the requester: the step falls back to the executive.
    assert hr_own.pk in requests_in(world.exec_user, "mine")


def test_a_named_person_and_a_reassigned_step(world):
    services.replace_steps(
        actor=world.hr_user,
        request_type=world.remote,
        steps=[StepSpec(approver_rule="named_person", named_person=world.other_manager)],
    )
    named = submitted(world, request_type=world.remote, data=days(MON))
    assert requests_in(world.other_manager_user, "mine") == [named.pk]
    assert requests_in(world.manager_user, "mine") == []

    own = submitted(world, employee=world.other_manager, request_type=world.remote, data=days(MON))
    # The named person is the requester: the step is an HR step (PRD 6.9).
    assert requests_in(world.hr_user, "hr") == [own.pk]


def test_the_hr_queues_are_for_hr(world):
    for name in ("hr", "certificates", "stuck"):
        with pytest.raises(NotAllowed):
            selectors.queue(world.manager_user, name)
        with pytest.raises(NotAllowed):
            selectors.queue(world.exec_user, name)
    with pytest.raises(DomainError) as error:
        selectors.queue(world.hr_user, "everything")
    assert error.value.code == "request.queue_invalid"


def test_the_certificates_queue_lists_sick_leaves_without_a_certificate(world):
    without = sick(world)
    with_one = sick(world, employee=world.peer)
    services.attach_file(actor=world.peer_user, request=with_one, upload=pdf())
    counted_as_annual = sick(world, employee=world.outsider)
    services.reclassify_as_annual(actor=world.hr_user, request=counted_as_annual)
    submitted(world, employee=world.manager, data=days(MON))
    assert requests_in(world.hr_user, "certificates") == [without.pk]
    assert set(requests_in(world.hr_user, "hr")) == {without.pk, with_one.pk}


def test_the_stuck_queue_lists_manager_steps_hr_was_alerted_about(world):
    waiting = submitted(world, data=days(MON))
    account_services.disable_account(actor=world.sysadmin_user, user=world.other_manager_user)
    stuck = submitted(
        world, employee=world.outsider, data=days(MON)
    )  # the manager cannot sign in: flagged at once
    assert requests_in(world.hr_user, "stuck") == [stuck.pk]

    step = pending_step(waiting)
    step.flagged_at = NOW
    step.save()
    assert set(requests_in(world.hr_user, "stuck")) == {waiting.pk, stuck.pk}
    assert requests_in(world.hr_user, "hr") == []


def test_a_change_to_an_approved_request_goes_through_the_same_queues(world):
    request = approved(world, data=days(MON))
    amendment = services.open_amendment(
        actor=world.owner_user, request=request, kind="change", data=days(WED), reason="Décalage"
    )
    (step,) = selectors.queue(world.manager_user, "mine")
    assert (step.request_id, step.amendment_id) == (request.pk, amendment.pk)
    services.withdraw_amendment(actor=world.owner_user, amendment=amendment)
    assert requests_in(world.manager_user, "mine") == []


def test_closed_requests_are_in_no_queue(world):
    request = submitted(world)
    services.withdraw(actor=world.owner_user, request=request)
    assert requests_in(world.manager_user, "mine") == []
