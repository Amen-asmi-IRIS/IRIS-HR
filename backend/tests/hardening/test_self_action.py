"""Nobody decides their own request, and a request never approves itself (review focus 3, REQ-14)."""

from __future__ import annotations

from datetime import date, time, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone

from apps.accounts import services as account_services
from apps.accounts.roles import Role
from apps.balances import services as balance_services
from apps.core.errors import DomainError
from apps.notifications.models import Notification
from apps.organisation import services as organisation_services
from apps.requests import services as request_services
from apps.requests.models import Decision, RequestStatus, RequestStep, StepStatus
from tests.hardening.helpers import NOW, decide, give_balance, make_request, pending_step

User = get_user_model()
REFUSED = (400, 403, 404, 409)
MONDAY = date(2026, 11, 16)


def _fresh(user):
    return User.objects.get(pk=user.pk)


def _type_and_data(world, code: str) -> tuple[object, dict]:
    if code == "annual":
        return world.annual, {"start": MONDAY, "end": MONDAY}
    if code == "sick":
        return world.sick, {"start": date(2026, 11, 2), "end": date(2026, 11, 2)}
    if code == "exceptional":
        return world.exceptional, {"start": MONDAY, "end": MONDAY, "exceptional_event_id": world.event.id}
    if code == "permission":
        return world.permission, {
            "start": MONDAY,
            "end": MONDAY,
            "start_time": time(9, 0),
            "end_time": time(11, 0),
        }
    return world.remote, {"start": MONDAY, "end": MONDAY}


def _decide_url(step):
    return reverse("requests:step-decide", kwargs={"pk": step.id})


@pytest.mark.django_db
@pytest.mark.parametrize("code", ["annual", "sick", "exceptional", "permission", "remote"])
def test_the_requester_cannot_decide_any_step_of_any_type(world, client_for, frozen, code):
    give_balance(world, world.owner, "20")
    request_type, data = _type_and_data(world, code)
    request = make_request(
        world, user=world.owner_user, employee=world.owner, request_type=request_type, **data
    )
    client = client_for(world.owner_user)

    while (step := pending_step(request)) is not None:
        request.refresh_from_db()
        body = {"decision": "approve", "comment": "", "version": request.version}
        assert client.post(_decide_url(step), body, format="json").status_code == 404
        assert not request_services.can_act_on(world.owner_user, step)
        assert world.owner_user not in request_services.resolve_approvers(step)
        with pytest.raises(DomainError):
            request_services.decide_step(
                actor=world.owner_user, step=step, decision=Decision.APPROVE, expected_version=request.version
            )
        on_behalf = reverse("requests:step-record-on-behalf", kwargs={"pk": step.id})
        reassign = reverse("requests:step-reassign", kwargs={"pk": step.id})
        assert client.post(on_behalf, {}, format="multipart").status_code == 403
        assert client.post(reassign, {}, format="json").status_code == 403
        # Let the rightful approver move the request on, then try again at the next step.
        approver = request_services.resolve_approvers(step)[0]
        request = decide(request, approver)

    request.refresh_from_db()
    assert request.status == RequestStatus.APPROVED
    deciders = set(
        RequestStep.objects.filter(request=request, status=StepStatus.APPROVED).values_list(
            "decided_by_id", flat=True
        )
    )
    assert world.owner.id not in deciders


@pytest.mark.django_db
def test_a_managers_own_request_goes_to_their_manager(world, client_for, frozen):
    request = make_request(
        world,
        user=world.manager_user,
        employee=world.manager,
        request_type=world.remote,
        start=MONDAY,
        end=MONDAY,
    )
    step = pending_step(request)
    assert request_services.resolve_approvers(step) == [world.exec_user]
    body = {"decision": "approve", "comment": "", "version": request.version}
    assert client_for(world.manager_user).post(_decide_url(step), body, format="json").status_code == 404
    mine = client_for(world.manager_user).get(reverse("requests:approval-list"), {"queue": "mine"}).json()
    assert mine["count"] == 0


@pytest.mark.django_db
def test_a_named_approver_who_is_the_requester_is_replaced_by_hr(world, client_for, frozen):
    steps_url = reverse("requests:type-steps", kwargs={"pk": world.remote.id})
    chain = {
        "steps": [
            {
                "approver_rule": "named_person",
                "named_person": str(world.owner.public_id),
                "mode": "approve",
                "reminder_after_days": 2,
                "flag_after_days": 4,
            }
        ]
    }
    assert client_for(world.hr_user).put(steps_url, chain, format="json").status_code == 200

    request = make_request(
        world,
        user=world.owner_user,
        employee=world.owner,
        request_type=world.remote,
        start=MONDAY,
        end=MONDAY,
    )
    step = pending_step(request)
    assert request_services.resolve_approvers(step) == [world.hr_user]
    body = {"decision": "approve", "comment": "", "version": request.version}
    assert client_for(world.owner_user).post(_decide_url(step), body, format="json").status_code == 404

    # For anybody else the named person decides.
    other = make_request(
        world, user=world.peer_user, employee=world.peer, request_type=world.remote, start=MONDAY, end=MONDAY
    )
    assert request_services.resolve_approvers(pending_step(other)) == [world.owner_user]


@pytest.mark.django_db
def test_the_only_hr_holder_cannot_validate_or_alter_their_own_request(world, client_for, frozen):
    request = make_request(
        world, user=world.hr_user, employee=world.hr, request_type=world.remote, start=MONDAY, end=MONDAY
    )
    request = decide(request, world.exec_user)  # the line manager of `hr` is the CEO
    hr_step = pending_step(request)
    assert request_services.resolve_approvers(hr_step) == [world.exec_user]  # PRD 6.9: no other HR holder

    client = client_for(world.hr_user)
    rid = {"public_id": request.public_id}
    body = {"decision": "approve", "comment": "", "version": request.version}
    assert client.post(_decide_url(hr_step), body, format="json").status_code == 404
    on_behalf = {
        "decided_by": str(world.ceo.public_id),
        "decision": "approve",
        "decided_at": timezone.now().isoformat(),
        "channel": "verbal",
        "note": "He said yes",
        "version": request.version,
    }
    assert (
        client.post(
            reverse("requests:step-record-on-behalf", kwargs={"pk": hr_step.id}),
            on_behalf,
            format="multipart",
        ).status_code
        in REFUSED
    )
    assert (
        client.post(
            reverse("requests:step-reassign", kwargs={"pk": hr_step.id}),
            {"new_approver": str(world.peer.public_id), "reason": "Quicker"},
            format="json",
        ).status_code
        in REFUSED
    )
    assert (
        client.post(
            reverse("requests:request-cancel", kwargs=rid), {"reason": "Changed my mind"}, format="json"
        ).status_code
        in REFUSED
    )
    correction = {
        "start_date": "2026-11-17",
        "end_date": "2026-11-17",
        "starts_at_midday": False,
        "ends_at_midday": False,
        "start_time": None,
        "end_time": None,
        "reason": "Other day",
    }
    assert (
        client.post(reverse("requests:request-correct", kwargs=rid), correction, format="json").status_code
        in REFUSED
    )

    request.refresh_from_db()
    hr_step.refresh_from_db()
    assert request.status == RequestStatus.PENDING
    assert request.start_date == MONDAY
    assert hr_step.status == StepStatus.PENDING

    request = decide(request, world.exec_user)
    assert request.status == RequestStatus.APPROVED


@pytest.mark.django_db
def test_hr_cannot_reclassify_their_own_sick_leave(world, client_for, frozen):
    request = make_request(
        world,
        user=world.hr_user,
        employee=world.hr,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
    )
    url = reverse("requests:request-reclassify", kwargs={"public_id": request.public_id})
    assert client_for(world.hr_user).post(url, {}, format="json").status_code in REFUSED
    request.refresh_from_db()
    assert request.request_type_id == world.sick.id


@pytest.mark.django_db
def test_the_ceo_has_no_manager_so_only_hr_decides(world, client_for, frozen):
    request = make_request(
        world, user=world.exec_user, employee=world.ceo, request_type=world.remote, start=MONDAY, end=MONDAY
    )
    first = RequestStep.objects.filter(request=request).order_by("position").first()
    assert first.status == StepStatus.SKIPPED
    step = pending_step(request)
    assert request_services.resolve_approvers(step) == [world.hr_user]
    body = {"decision": "approve", "comment": "", "version": request.version}
    assert client_for(world.exec_user).post(_decide_url(step), body, format="json").status_code == 404
    assert request.status == RequestStatus.PENDING
    assert decide(request, world.hr_user).status == RequestStatus.APPROVED


@pytest.mark.django_db
def test_with_no_hr_holder_the_ceos_request_waits_and_administrators_are_told(world, frozen):
    account_services.remove_role(actor=world.sysadmin_user, user=world.hr_user, role=Role.HR)
    request = make_request(
        world, user=world.exec_user, employee=world.ceo, request_type=world.remote, start=MONDAY, end=MONDAY
    )
    step = pending_step(request)
    assert step is not None and request_services.resolve_approvers(step) == []
    assert request.status == RequestStatus.PENDING
    assert Notification.objects.filter(user=world.sysadmin_user, event_code="hr_step.unattended").count() == 1


@pytest.mark.django_db
def test_an_archived_manager_leaves_the_step_pending_and_flagged(world, client_for, frozen):
    organisation_services.archive_employee(
        actor=world.hr_user, employee=world.manager, leaving_date=date(2026, 11, 1), reason="Left the company"
    )
    request = make_request(
        world,
        user=world.owner_user,
        employee=world.owner,
        request_type=world.remote,
        start=MONDAY,
        end=MONDAY,
    )
    step = pending_step(request)
    assert step.approver_rule == "line_manager"
    assert step.status == StepStatus.PENDING  # not skipped (master decision D13)
    assert step.flagged_at is not None
    assert request_services.resolve_approvers(step) == []
    stuck = (
        client_for(world.hr_user).get(reverse("requests:approval-list"), {"queue": "stuck"}).json()["results"]
    )
    assert [item["request"]["public_id"] for item in stuck] == [str(request.public_id)]


@pytest.mark.django_db
def test_no_job_ever_approves_a_request(world, frozen):
    give_balance(world, world.owner, "20")
    waiting = [
        make_request(
            world,
            user=world.owner_user,
            employee=world.owner,
            request_type=world.annual,
            start=MONDAY,
            end=MONDAY,
        ),
        make_request(
            world,
            user=world.owner_user,
            employee=world.owner,
            request_type=world.sick,
            start=date(2026, 11, 2),
            end=date(2026, 11, 2),
        ),
    ]
    for days in (1, 3, 5, 30, 90):
        later = NOW + timedelta(days=days)
        request_services.send_reminders_and_flags(now=later)
        request_services.check_certificate_deadlines(now=later)
        balance_services.post_month_end_credits(today=later.date())
    for request in waiting:
        request.refresh_from_db()
        assert request.status == RequestStatus.PENDING
    decided = RequestStep.objects.filter(request__in=waiting, status=StepStatus.APPROVED)
    assert not decided.exists()
