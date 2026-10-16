"""The five seeded types, each from a draft to its approval, through the API alone and without balances."""

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db

REQUESTS = "requests:request-list"
APPROVALS = "requests:approval-list"

# type code, what the person fills in, the quantity the server computes, who decides (in order)
JOURNEYS = [
    ("annual", {"start_date": "2026-11-02", "end_date": "2026-11-03"}, "2.00", ["manager", "hr"]),
    ("sick", {"start_date": "2026-10-05", "end_date": "2026-10-06", "comment": "Grippe"}, "2.00", ["hr"]),
    ("exceptional", {"start_date": "2026-11-02", "end_date": "2026-11-04"}, "3.00", ["manager", "hr"]),
    (
        "permission",
        {"start_date": "2026-11-05", "end_date": "2026-11-05", "start_time": "09:00", "end_time": "10:30"},
        "1.50",
        ["manager", "hr"],
    ),
    (
        "remote",
        {"start_date": "2026-11-04", "end_date": "2026-11-04", "starts_at_midday": True},
        "0.50",
        ["manager", "hr"],
    ),
]


@pytest.mark.parametrize(
    ("code", "fields", "quantity", "deciders"), JOURNEYS, ids=[row[0] for row in JOURNEYS]
)
def test_a_request_of_each_type_runs_from_a_draft_to_its_approval(
    world, client_for, code, fields, quantity, deciders
):
    owner = client_for(world.owner_user)
    payload = {"type": code, **fields}
    if code == "exceptional":
        payload["exceptional_event"] = world.event.pk

    draft = owner.post(reverse(REQUESTS), payload, format="json")
    assert draft.status_code == 201
    public_id = draft.json()["public_id"]
    assert (draft.json()["status"], draft.json()["quantity"]) == ("draft", quantity)

    sent = owner.post(
        reverse("requests:request-submit", kwargs={"public_id": public_id}),
        {"version": draft.json()["version"]},
        format="json",
    )
    assert (sent.status_code, sent.json()["status"]) == (200, "pending")
    current = sent.json()

    people = {"manager": (world.manager_user, "mine"), "hr": (world.hr_user, "hr")}
    for who in deciders:
        user, queue = people[who]
        client = client_for(user)
        waiting = client.get(reverse(APPROVALS), {"queue": queue}).json()["results"]
        (item,) = [row for row in waiting if row["request"]["public_id"] == public_id]
        assert item["request"]["viewer"]["actions"][:1] in (["decide"], ["attach"])
        decided = client.post(
            reverse("requests:step-decide", kwargs={"pk": item["step_id"]}),
            {"decision": "approve", "comment": "", "version": item["request"]["version"]},
            format="json",
        )
        assert decided.status_code == 200
        current = decided.json()

    assert (current["status"], current["state"]["key"], current["quantity"]) == (
        "approved",
        "approved",
        quantity,
    )
    seen_by_owner = owner.get(reverse("requests:request-detail", kwargs={"public_id": public_id})).json()
    assert seen_by_owner["status"] == "approved"
    assert not any(step["status"] in ("pending", "waiting") for step in seen_by_owner["steps"])
    history = owner.get(reverse("requests:request-history", kwargs={"public_id": public_id})).json()
    assert [row["action"] for row in history][:2] == ["request.created", "request.submitted"]
    assert history[-1]["action"] == "request.approved"
    # Nothing is left for anybody to decide.
    for user, queue in people.values():
        waiting = client_for(user).get(reverse(APPROVALS), {"queue": queue}).json()["results"]
        assert all(row["request"]["public_id"] != public_id for row in waiting)
