import pytest
from django.utils import translation

from apps.notifications.models import Notification
from apps.organisation import services as organisation_services
from apps.organisation.tests.world import make_delegation
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
    fresh,
    pending_step,
    submitted,
)

pytestmark = pytest.mark.django_db


def section(employee, key):
    preview = organisation_services.archive_preview(employee=fresh(employee))
    return next((found for found in preview.sections if found.key == key), None)


def test_the_requests_a_leaver_leaves_open_are_listed(world):
    pending = submitted(world, data=days(MON))
    upcoming = approved(world, data=days(WED))
    refused = submitted(world, data=days(TUE))
    decide(refused, world.manager_user, "reject", "Non")

    with translation.override("en"):
        found = section(world.owner, "open_requests")

    assert [(item.label, item.link) for item in found.items] == [
        ("Annual leave · 02/11/2026", f"/requests/{pending.public_id}"),
        ("Annual leave · 04/11/2026", f"/requests/{upcoming.public_id}"),
    ]


def test_past_leave_and_other_people_are_not_listed(world, clock):
    approved(world, request_type=world.sick, data=days(TODAY))
    submitted(world, employee=world.peer, data=days(MON))
    clock.shift(3 * 24 * 3600)
    assert section(world.owner, "open_requests") is None


def test_the_steps_waiting_for_a_leaving_manager_are_listed(world):
    request = submitted(world, data=days(MON))
    services.replace_steps(
        actor=world.hr_user,
        request_type=world.remote,
        steps=[StepSpec(approver_rule="named_person", named_person=world.manager)],
    )
    named = submitted(world, employee=world.outsider, request_type=world.remote, data=days(TUE))

    found = section(world.manager, "open_steps")

    assert [item.link for item in found.items] == [
        f"/requests/{request.public_id}",
        f"/requests/{named.public_id}",
    ]
    assert found.items[0].label.startswith("Amal Employee · ")
    assert section(world.other_manager, "open_steps") is None


def test_a_decided_step_is_no_longer_listed(world):
    request = submitted(world, data=days(MON))
    decide(request, world.manager_user)
    assert section(world.manager, "open_steps") is None


# ------------------------------------------------------------------ once the departure is recorded (master D13)


def leave(world, employee):
    return organisation_services.archive_employee(
        actor=world.hr_user, employee=fresh(employee), leaving_date=TODAY, reason="Démission"
    )


def flagged_to_hr(world) -> int:
    return Notification.objects.filter(event_code="step.flagged", user=world.hr_user).count()


def test_a_step_waiting_for_a_manager_who_leaves_is_flagged_to_hr_at_once(world):
    request = submitted(world, data=days(MON))
    assert pending_step(request).flagged_at is None

    leave(world, world.manager)

    step = pending_step(request)
    assert step.flagged_at == NOW
    assert flagged_to_hr(world) == 1
    assert [found.pk for found in selectors.queue(world.hr_user, "stuck")] == [step.pk]
    # HR may now decide it directly (master D29).
    assert services.can_act_on(world.hr_user, step) is True


def test_a_step_given_to_a_person_who_leaves_is_flagged_too(world):
    request = submitted(world, data=days(MON))
    services.reassign_step(
        actor=world.hr_user, step=pending_step(request), new_approver=world.other_manager, reason="Absence"
    )

    leave(world, world.other_manager)

    assert pending_step(request).flagged_at == NOW
    assert flagged_to_hr(world) == 1


def test_a_departure_flags_nothing_that_somebody_can_still_decide(world):
    covered = submitted(world, data=days(MON))  # the manager stays: only their delegate leaves
    make_delegation(world, manager=world.manager, delegate=world.other_manager, start=TODAY)
    with_hr = submitted(world, employee=world.outsider, data=days(TUE))
    decide(with_hr, world.other_manager_user)  # now waits for HR, not for the leaver
    decided = submitted(world, employee=world.outsider, data=days(WED))
    decide(decided, world.other_manager_user, "reject", "Non")

    leave(world, world.other_manager)

    assert pending_step(covered).flagged_at is None
    assert pending_step(with_hr).flagged_at is None
    assert flagged_to_hr(world) == 0


def test_a_step_already_flagged_is_not_announced_twice(world):
    request = submitted(world, data=days(MON))
    step = pending_step(request)
    step.flagged_at = NOW
    step.save(update_fields=["flagged_at"])

    leave(world, world.manager)

    assert flagged_to_hr(world) == 0
