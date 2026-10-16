"""Reach rules beyond single calls: writes, limited fields, department, delegation over time."""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
import time_machine
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.organisation import services as organisation_services
from tests.hardening import matrix_reach as objects
from tests.hardening.helpers import approve_fully, decide, make_request
from tests.matrix import P

User = get_user_model()
REFUSED = (403, 404)


def _fresh(user):
    """A new instance, so that roles cached on the object are recomputed."""
    return User.objects.get(pk=user.pk)


@pytest.mark.django_db
@pytest.mark.parametrize("persona", [P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.EXEC, P.SYSADMIN])
def test_nobody_but_the_owner_changes_a_draft(world, client_for, persona):
    draft = objects.remote_draft(world)
    client = client_for(world.user_for(persona))
    detail = reverse("requests:request-detail", kwargs={"public_id": draft.public_id})
    submit = reverse("requests:request-submit", kwargs={"public_id": draft.public_id})
    attach = reverse("requests:request-attachments", kwargs={"public_id": draft.public_id})
    body = {
        "start_date": str(draft.start_date),
        "end_date": str(draft.end_date),
        "starts_at_midday": False,
        "ends_at_midday": False,
        "start_time": None,
        "end_time": None,
        "exceptional_event": None,
        "comment": "changed by someone else",
        "version": draft.version,
    }

    assert client.patch(detail, body, format="json").status_code in REFUSED
    assert client.delete(detail).status_code in REFUSED
    assert client.post(submit, {"version": draft.version}, format="json").status_code in REFUSED
    assert client.post(attach, {"file": objects.pdf("x.pdf")}, format="multipart").status_code in REFUSED

    draft.refresh_from_db()
    assert draft.comment == ""
    assert draft.status == "draft"


@pytest.mark.django_db
@pytest.mark.parametrize("persona", [P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.EXEC])
def test_nobody_but_the_owner_opens_an_amendment(world, client_for, persona):
    request = objects.remote_request(world)
    approve_fully(world, request)
    url = reverse("requests:request-amendments", kwargs={"public_id": request.public_id})
    response = client_for(world.user_for(persona)).post(
        url, {"kind": "cancel", "reason": "not mine"}, format="json"
    )
    assert response.status_code in REFUSED


@pytest.mark.django_db
def test_a_manager_receives_only_the_team_fields(world, client_for):
    url = reverse("organisation:employee-detail", kwargs={"public_id": world.owner.public_id})
    team_view = client_for(world.manager_user).get(url).json()
    hr_view = client_for(world.hr_user).get(url).json()

    private = {
        "date_of_birth",
        "gender",
        "personal_email",
        "address",
        "emergency_contact_name",
        "emergency_contact_phone",
        "contract_type",
        "contract_start_date",
        "contract_end_date",
        "hire_date",
    }
    assert private & set(team_view) == set(), f"a manager received private fields: {private & set(team_view)}"
    assert private <= set(hr_view)


@pytest.mark.django_db
def test_the_employee_list_is_cut_to_the_team(world, client_for):
    url = reverse("organisation:employee-list")
    ids = {
        row["public_id"]
        for row in client_for(world.manager_user).get(url, {"page_size": 100}).json()["results"]
    }
    assert ids == {str(world.owner.public_id), str(world.peer.public_id)}
    everyone = client_for(world.hr_user).get(url, {"page_size": 100}).json()["count"]
    assert everyone == 7  # ceo, hr, manager, owner, peer, other_manager, outsider


@pytest.mark.django_db
def test_requests_scopes_follow_roles(world, client_for):
    objects.remote_request(world)
    url = reverse("requests:request-list")
    assert client_for(world.owner_user).get(url, {"scope": "team"}).status_code == 403
    assert client_for(world.owner_user).get(url, {"scope": "all"}).status_code == 403
    assert client_for(world.manager_user).get(url, {"scope": "all"}).status_code == 403
    assert client_for(world.manager_user).get(url, {"scope": "team"}).json()["count"] == 1
    assert client_for(world.other_manager_user).get(url, {"scope": "team"}).json()["count"] == 0
    assert client_for(world.hr_user).get(url, {"scope": "all"}).json()["count"] == 1
    assert client_for(world.exec_user).get(url, {"scope": "all"}).json()["count"] == 1


@pytest.mark.django_db
def test_hr_queues_are_closed_to_everyone_else(world, client_for):
    url = reverse("requests:approval-list")
    for queue in ("hr", "certificates", "stuck"):
        for persona in (P.OWNER, P.MANAGER, P.EXEC):
            response = client_for(world.user_for(persona)).get(url, {"queue": queue})
            assert response.status_code == 403, (queue, persona)
        assert client_for(world.hr_user).get(url, {"queue": queue}).status_code == 200


@pytest.mark.django_db
def test_department_calendar_shows_peers_without_the_type(world, client_for, frozen):
    in_department = make_request(
        world,
        user=world.peer_user,
        employee=world.peer,
        request_type=world.remote,
        start=date(2026, 11, 9),
        end=date(2026, 11, 9),
    )
    approve_fully(world, in_department)
    elsewhere = make_request(
        world,
        user=world.outsider_user,
        employee=world.outsider,
        request_type=world.remote,
        start=date(2026, 11, 9),
        end=date(2026, 11, 9),
    )
    decide(decide(elsewhere, world.other_manager_user), world.hr_user)

    url = reverse("calendar:feed")
    params = {"from": "2026-11-01", "to": "2026-11-30", "scope": "department"}
    entries = client_for(world.owner_user).get(url, params).json()["entries"]

    names = {entry["employee"]["public_id"] for entry in entries}
    assert str(world.peer.public_id) in names
    assert str(world.outsider.public_id) not in names
    peer_entry = next(e for e in entries if e["employee"]["public_id"] == str(world.peer.public_id))
    assert peer_entry["label"] == "remote"
    assert peer_entry["type_code"] is None and peer_entry["type_name"] is None
    assert peer_entry["status"] is None and peer_entry["request_public_id"] is None

    assert client_for(world.owner_user).get(url, {**params, "scope": "team"}).status_code == 403
    assert client_for(world.owner_user).get(url, {**params, "scope": "company"}).status_code == 403
    assert client_for(world.manager_user).get(url, {**params, "scope": "company"}).status_code == 403


@pytest.mark.django_db
def test_delegated_reach_exists_only_during_the_delegation(world, client_for):
    """`manager` delegates to `other_manager` from Monday 9 to Friday 13 November 2026."""
    with time_machine.travel(datetime(2026, 11, 2, 8, 0, tzinfo=UTC), tick=False) as clock:
        request = make_request(
            world,
            user=world.owner_user,
            employee=world.owner,
            request_type=world.remote,
            start=date(2026, 11, 16),
            end=date(2026, 11, 16),
        )
        organisation_services.create_delegation(
            actor=world.manager_user,
            manager=world.manager,
            delegate=world.other_manager,
            start_date=date(2026, 11, 9),
            end_date=date(2026, 11, 13),
        )

        detail = reverse("requests:request-detail", kwargs={"public_id": request.public_id})
        record = reverse("organisation:employee-detail", kwargs={"public_id": world.owner.public_id})
        balance = reverse("balances:figures", kwargs={"employee_public_id": world.owner.public_id})
        queue = reverse("requests:approval-list")

        def as_delegate():
            return client_for(_fresh(world.other_manager_user))

        # Before the delegation starts.
        assert as_delegate().get(detail).status_code == 404
        assert as_delegate().get(record).status_code == 404
        assert as_delegate().get(balance).status_code == 404

        # During the delegation: the delegate sees what the manager sees and can act.
        clock.move_to(datetime(2026, 11, 10, 8, 0, tzinfo=UTC))
        assert as_delegate().get(detail).status_code == 200
        assert as_delegate().get(record).status_code == 200
        assert as_delegate().get(balance).status_code == 200
        items = as_delegate().get(queue, {"queue": "mine"}).json()["results"]
        assert [item["request"]["public_id"] for item in items] == [str(request.public_id)]
        assert items[0]["via_delegation_from"]
        # The manager keeps the same rights during the delegation (REQ-11).
        assert client_for(_fresh(world.manager_user)).get(detail).status_code == 200

        # After it ends.
        clock.move_to(datetime(2026, 11, 14, 8, 0, tzinfo=UTC))
        assert as_delegate().get(detail).status_code == 404
        assert as_delegate().get(record).status_code == 404
        assert as_delegate().get(queue, {"queue": "mine"}).json()["count"] == 0
