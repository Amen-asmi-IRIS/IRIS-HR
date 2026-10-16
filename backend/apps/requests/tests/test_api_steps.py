import datetime as dt

import pytest
from django.urls import reverse

from apps.accounts.services import display_name
from apps.organisation import services as organisation_services
from apps.organisation.selectors import full_name
from apps.requests.models import RequestAttachment
from apps.requests.tests.helpers import (
    MON,
    NOW,
    TODAY,
    TUE,
    days,
    decide,
    fresh,
    pdf,
    pending_step,
    steps,
    submitted,
)

pytestmark = pytest.mark.django_db

APPROVALS = "requests:approval-list"


def step_url(name: str, step) -> str:
    return reverse(name, kwargs={"pk": step.pk})


def test_the_manager_queue_carries_what_is_needed_to_decide_from_the_list(world, client_for):
    organisation_services.create_delegation(
        actor=world.hr_user,
        manager=world.manager,
        delegate=world.other_manager,
        start_date=TODAY,
        end_date=TODAY + dt.timedelta(days=14),
    )
    request = submitted(world, data=days(MON, TUE))

    response = client_for(world.manager_user).get(reverse(APPROVALS))
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    item = body["results"][0]
    assert (item["step_id"], item["via_delegation_from"]) == (pending_step(request).pk, None)
    assert item["waiting_since"].startswith("2026-10-06T09:00:00")
    assert (item["request"]["public_id"], item["request"]["viewer"]["actions"]) == (
        str(request.public_id),
        ["decide"],
    )
    assert item["decision_context"] == {
        "balance": {"now": "10.00", "after": "8.00"},
        "teammates_away": [],
        "cap": None,
    }

    covered = client_for(world.other_manager_user).get(reverse(APPROVALS)).json()["results"][0]
    assert covered["via_delegation_from"] == full_name(world.manager)


def test_the_hr_queues_through_the_api(world, client_for):
    sick = submitted(world, request_type=world.sick, data=days(TODAY))
    annual = submitted(world, employee=world.peer, data=days(MON))
    decide(annual, world.manager_user)
    client = client_for(world.hr_user)

    def ids(**params):
        return [
            item["request"]["public_id"] for item in client.get(reverse(APPROVALS), params).json()["results"]
        ]

    assert ids(queue="hr") == [str(sick.public_id), str(annual.public_id)]
    assert ids(queue="hr", type="annual") == [str(annual.public_id)]
    assert ids(queue="hr", department=world.dept_b.pk) == []
    assert ids(queue="certificates") == [str(sick.public_id)]
    assert ids(queue="stuck") == []
    assert client_for(world.manager_user).get(reverse(APPROVALS), {"queue": "hr"}).status_code == 403
    unknown = client.get(reverse(APPROVALS), {"queue": "everything"})
    assert (unknown.status_code, unknown.json()["code"]) == (400, "request.queue_invalid")


def test_deciding_through_the_api(world, client_for):
    request = submitted(world)
    step = pending_step(request)
    client = client_for(world.manager_user)
    url = step_url("requests:step-decide", step)

    no_reason = client.post(url, {"decision": "reject", "comment": "", "version": 2}, format="json")
    assert (no_reason.status_code, no_reason.json()["code"]) == (400, "request.reason_required")
    assert no_reason.json()["errors"][0]["field"] == "comment"

    approved = client.post(url, {"decision": "approve", "comment": "Bon repos", "version": 2}, format="json")
    assert approved.status_code == 200
    body = approved.json()
    assert (body["version"], body["state"]["key"], body["steps"][0]["status"]) == (
        3,
        "waiting_hr",
        "approved",
    )
    assert body["steps"][0]["decided_by"] == display_name(world.manager_user)

    again = client.post(url, {"decision": "approve", "comment": "", "version": 3}, format="json")
    assert (again.status_code, again.json()["code"]) == (409, "request.already_processed")


def test_a_step_is_not_available_to_someone_it_is_not_for(world, client_for):
    request = submitted(world)
    url = step_url("requests:step-decide", pending_step(request))
    payload = {"decision": "approve", "comment": "", "version": 2}
    for user in (world.owner_user, world.peer_user, world.other_manager_user, world.hr_user, world.exec_user):
        assert client_for(user).post(url, payload, format="json").status_code == 404
    missing = reverse("requests:step-decide", kwargs={"pk": 999999})
    assert client_for(world.manager_user).post(missing, payload, format="json").status_code == 404
    assert fresh(request).status == "pending"


def test_hr_records_a_decision_given_on_paper_with_its_scan(world, client_for):
    request = submitted(world)
    step = pending_step(request)
    response = client_for(world.hr_user).post(
        step_url("requests:step-record-on-behalf", step),
        {
            "decided_by": str(world.manager.public_id),
            "decision": "approve",
            "decided_at": (NOW - dt.timedelta(hours=3)).isoformat(),
            "channel": "paper",
            "note": "Formulaire signé remis ce matin",
            "version": 2,
            "scan": pdf("formulaire.pdf"),
        },
        format="multipart",
    )
    assert response.status_code == 200
    first = response.json()["steps"][0]
    assert (first["status"], first["channel"], first["decided_by"], first["recorded_by"]) == (
        "approved",
        "paper",
        full_name(world.manager),
        display_name(world.hr_user),
    )
    assert [item["kind"] for item in response.json()["attachments"]] == ["scanned_form"]
    assert RequestAttachment.objects.get(request=request).step_id == step.pk


def test_recording_on_behalf_refuses_what_makes_no_sense(world, client_for):
    request = submitted(world)
    url = step_url("requests:step-record-on-behalf", pending_step(request))
    payload = {
        "decided_by": str(world.manager.public_id),
        "decision": "approve",
        "decided_at": (NOW - dt.timedelta(hours=1)).isoformat(),
        "channel": "verbal",
        "note": "Accord oral",
        "version": 2,
    }
    client = client_for(world.hr_user)

    def code(**changes):
        return client.post(url, {**payload, **changes}, format="json").json()["code"]

    assert code(note="") == "request.comment_required"
    assert code(channel="in_app") == "request.channel_invalid"
    assert code(decided_by=str(world.owner.public_id)) == "request.own_request"
    assert code(decided_by=str(world.other_manager.public_id)) == "request.decided_by_not_approver"
    assert code(decided_by="00000000-0000-0000-0000-000000000000") == "core.not_found"
    assert code(decided_at=(NOW + dt.timedelta(hours=1)).isoformat()) == "request.decided_at_future"
    assert client_for(world.manager_user).post(url, payload, format="json").status_code == 403
    assert steps(request)[0].status == "pending"


def test_hr_gives_a_step_to_someone_else_through_the_api(world, client_for):
    request = submitted(world)
    step = pending_step(request)
    response = client_for(world.hr_user).post(
        step_url("requests:step-reassign", step),
        {"new_approver": str(world.other_manager.public_id), "reason": "Responsable en déplacement"},
        format="json",
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["state"]["key"], body["state"]["waiting_on"]) == (
        "waiting_person",
        [display_name(world.other_manager_user)],
    )
    assert body["version"] == 3
    no_reason = client_for(world.hr_user).post(
        step_url("requests:step-reassign", step), {"new_approver": str(world.peer.public_id)}, format="json"
    )
    assert (no_reason.status_code, no_reason.json()["code"]) == (400, "request.reason_required")


def test_hr_is_refused_on_its_own_request_before_the_body_is_read(world, client_for):
    own = submitted(world, employee=world.hr, actor=world.hr_user)
    step = pending_step(own)
    for name in ("requests:step-record-on-behalf", "requests:step-reassign"):
        refused = client_for(world.hr_user).post(step_url(name, step), {}, format="json")
        assert (refused.status_code, refused.json()["code"]) == (403, "request.own_request")
