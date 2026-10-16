import datetime as dt
from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.notifications.models import Notification
from apps.requests import services
from apps.requests.models import RequestStep
from apps.requests.tests.helpers import (
    MON,
    NOW,
    THU,
    TUE,
    WED,
    approved,
    at,
    days,
    fresh,
    hours,
    pending_step,
    stored,
    submitted,
)

pytestmark = pytest.mark.django_db


def open_change(world, request, data, reason="Changement de plans"):
    return services.open_amendment(
        actor=world.owner_user, request=fresh(request), kind="change", data=data, reason=reason
    )


def open_cancel(world, request, reason="Voyage annulé"):
    return services.open_amendment(
        actor=world.owner_user, request=fresh(request), kind="cancel", data=None, reason=reason
    )


def decide_amendment(request, amendment, by, decision="approve", comment=""):
    current = fresh(request)
    return services.decide_step(
        actor=by,
        step=pending_step(current, amendment),
        decision=decision,
        comment=comment,
        expected_version=current.version,
    )


def test_the_requester_asks_to_change_approved_dates(world, port):
    request = approved(world, data=days(MON, TUE))
    port.checks.clear()

    amendment = open_change(world, request, days(WED, THU))

    assert (amendment.kind, amendment.status, amendment.requested_by) == (
        "change",
        "pending",
        world.owner_user,
    )
    assert (amendment.new_start_date, amendment.new_end_date, amendment.new_quantity) == (
        WED,
        THU,
        Decimal("2.00"),
    )
    assert (amendment.previous_start_date, amendment.previous_end_date, amendment.previous_quantity) == (
        MON,
        TUE,
        Decimal("2.00"),
    )
    saved = fresh(request)
    assert (saved.status, saved.start_date, saved.version) == ("approved", MON, request.version + 1)
    step = pending_step(request, amendment)
    assert (step.round, step.position, step.approver_rule) == (1, 1, "line_manager")
    assert Notification.objects.filter(event_code="amendment.submitted", user=world.manager_user).count() == 1
    # Master D18: the check of a change ignores the request it replaces.
    assert port.checks == [
        {
            "employee_id": world.owner.pk,
            "new_days": {WED: Decimal("1"), THU: Decimal("1")},
            "ignoring_request_id": request.pk,
        }
    ]
    assert AuditEvent.objects.filter(action="amendment.opened", object_id=str(request.public_id)).exists()


def test_an_approved_change_moves_the_request_and_posts_only_the_difference(world, port):
    request = approved(world, data=days(MON, TUE))
    port.taken.clear()
    amendment = open_change(world, request, days(TUE, WED))

    decide_amendment(request, amendment, world.manager_user)
    result = decide_amendment(request, amendment, world.hr_user)

    assert (result.status, result.start_date, result.end_date, result.quantity) == (
        "approved",
        TUE,
        WED,
        Decimal("2.00"),
    )
    saved = fresh(amendment)
    assert (saved.status, saved.decided_at) == ("approved", NOW)
    assert port.restored == [
        {
            "request_id": request.pk,
            "employee_id": world.owner.pk,
            "days": {MON: Decimal("1")},
            "actor": world.hr_user,
            "reason": "amendment",
        }
    ]
    assert port.taken == [
        {
            "request_id": request.pk,
            "employee_id": world.owner.pk,
            "days": {WED: Decimal("1")},
            "actor": world.hr_user,
        }
    ]
    assert Notification.objects.filter(event_code="amendment.approved", user=world.owner_user).count() == 1
    assert AuditEvent.objects.filter(action="amendment.approved").exists()


def test_an_approved_cancellation_cancels_the_request_and_gives_the_days_back(world, port):
    request = approved(world, data=days(MON, TUE))
    amendment = open_cancel(world, request)
    assert (amendment.new_start_date, amendment.new_quantity) == (None, None)
    decide_amendment(request, amendment, world.manager_user)
    result = decide_amendment(request, amendment, world.hr_user)
    assert result.status == "cancelled"
    assert port.restored[0]["days"] == {MON: Decimal("1"), TUE: Decimal("1")}


def test_a_refused_change_leaves_the_original_untouched(world, port):
    request = approved(world, data=days(MON, TUE))
    amendment = open_change(world, request, days(WED, THU))
    result = decide_amendment(
        request, amendment, world.manager_user, "reject", "Réunion importante ce jour-là"
    )
    assert (result.status, result.start_date, result.end_date) == ("approved", MON, TUE)
    assert fresh(amendment).status == "rejected"
    statuses = list(
        RequestStep.objects.filter(amendment=amendment).order_by("position").values_list("status", flat=True)
    )
    assert statuses == ["rejected", "skipped"]
    assert port.restored == []
    assert Notification.objects.filter(event_code="amendment.rejected", user=world.owner_user).count() == 1
    assert AuditEvent.objects.filter(action="amendment.rejected").exists()


def test_a_change_cannot_be_sent_back(world):
    request = approved(world)
    amendment = open_change(world, request, days(WED))
    with pytest.raises(DomainError) as error:
        decide_amendment(request, amendment, world.manager_user, "return", "À revoir")
    assert error.value.code == "request.amendment_cannot_return"


def test_only_one_change_at_a_time(world):
    request = approved(world)
    open_change(world, request, days(WED))
    with pytest.raises(Conflict) as error:
        open_cancel(world, request)
    assert error.value.code == "request.amendment_open"


def test_a_request_that_has_started_cannot_be_amended(world, clock):
    request = approved(world, data=days(MON, TUE))
    clock.move_to(at(11, 2))
    with pytest.raises(Conflict) as error:
        open_cancel(world, request)
    assert error.value.code == "request.not_started_only"


def test_only_an_approved_request_is_amended(world):
    request = submitted(world)
    with pytest.raises(Conflict) as error:
        open_cancel(world, request)
    assert error.value.code == "request.not_editable"


def test_only_the_requester_asks_for_a_change(world):
    request = approved(world)
    with pytest.raises(NotAllowed):
        services.open_amendment(actor=world.hr_user, request=request, kind="cancel", data=None, reason="Test")


def test_a_change_needs_a_reason_new_dates_and_something_new(world):
    request = approved(world, data=days(MON))
    with pytest.raises(DomainError) as no_reason:
        open_change(world, request, days(TUE), reason="  ")
    assert no_reason.value.code == "request.reason_required"
    with pytest.raises(DomainError) as no_dates:
        services.open_amendment(
            actor=world.owner_user, request=fresh(request), kind="change", data=None, reason="Test"
        )
    assert no_dates.value.code == "request.dates_required"
    with pytest.raises(DomainError) as same:
        open_change(world, request, days(MON))
    assert same.value.code == "request.nothing_to_change"


def test_a_change_is_validated_like_a_new_request(world, port):
    request = approved(world, data=days(MON))
    stored(world, request_type=world.remote, data=days(THU))
    with pytest.raises(DomainError) as overlap:
        open_change(world, request, days(THU))
    assert overlap.value.code == "request.overlap"
    port.ok = False
    with pytest.raises(DomainError) as balance:
        open_change(world, request, days(TUE, WED))
    assert balance.value.code == "request.balance_insufficient"


def test_the_requester_withdraws_a_change(world):
    request = approved(world)
    amendment = open_change(world, request, days(WED))
    withdrawn = services.withdraw_amendment(actor=world.owner_user, amendment=amendment)
    assert withdrawn.status == "withdrawn"
    assert not RequestStep.objects.filter(amendment=amendment, status="pending").exists()
    assert fresh(request).status == "approved"
    assert Notification.objects.filter(event_code="request.withdrawn", user=world.manager_user).count() == 1
    assert AuditEvent.objects.filter(action="amendment.withdrawn").exists()
    assert open_change(world, request, days(THU)).status == "pending"  # a new one can be opened


def test_a_withdrawn_change_cannot_be_decided_or_withdrawn_again(world):
    request = approved(world)
    amendment = open_change(world, request, days(WED))
    step = pending_step(request, amendment)
    version = fresh(request).version
    services.withdraw_amendment(actor=world.owner_user, amendment=amendment)
    with pytest.raises(Conflict):
        services.decide_step(
            actor=world.manager_user, step=step, decision="approve", expected_version=version
        )
    with pytest.raises(Conflict) as error:
        services.withdraw_amendment(actor=world.owner_user, amendment=amendment)
    assert error.value.code == "request.already_processed"


def test_a_late_approval_is_judged_as_of_the_day_the_change_was_asked(world, clock):
    request = approved(world, data=days(dt.date(2026, 10, 12)))
    amendment = open_change(world, request, days(dt.date(2026, 10, 8)))
    clock.move_to(at(10, 9))  # the new date has passed, the original has not started
    decide_amendment(request, amendment, world.manager_user)
    result = decide_amendment(request, amendment, world.hr_user)
    assert (result.status, result.start_date) == ("approved", dt.date(2026, 10, 8))


def test_an_hourly_permission_can_be_moved(world):
    request = approved(world, request_type=world.permission, data=hours(MON, "09:00", "11:00"))
    amendment = open_change(world, request, hours(TUE, "14:00", "15:30"))
    assert (amendment.new_start_time, amendment.new_end_time, amendment.new_quantity) == (
        dt.time(14, 0),
        dt.time(15, 30),
        Decimal("1.50"),
    )
    decide_amendment(request, amendment, world.manager_user)
    result = decide_amendment(request, amendment, world.hr_user)
    assert (result.start_date, result.start_time, result.quantity) == (TUE, dt.time(14, 0), Decimal("1.50"))
