"""Sloppy or hostile input on the request engine's routes is answered with a problem, never an error page."""

import pytest
from django.urls import reverse

from apps.requests.tests.helpers import MON, days, draft, pending_step, submitted

pytestmark = pytest.mark.django_db

NOBODY = "00000000-0000-0000-0000-000000000000"


def _calls(world) -> list[tuple[str, str, dict | None, dict]]:
    """(method, url, body, query) of calls that are wrong in a way a form or a script could produce."""
    waiting = submitted(world, data=days(MON))
    step = pending_step(waiting)
    mine = draft(world, request_type=world.remote, data=days(MON))
    one = {"public_id": waiting.public_id}
    own = {"public_id": mine.public_id}
    requests = reverse("requests:request-list")
    preview = reverse("requests:request-preview")
    approvals = reverse("requests:approval-list")
    detail = reverse("requests:request-detail", kwargs=own)
    types = reverse("requests:type-list")
    a_type = reverse("requests:type-detail", kwargs={"pk": world.remote.pk})
    steps_of_type = reverse("requests:type-steps", kwargs={"pk": world.remote.pk})
    events = reverse("requests:event-list")
    holidays = reverse("calendar:holiday-list")
    dates = {"start_date": "2026-11-02", "end_date": "2026-11-02"}
    return [
        # lists and filters
        ("get", requests, None, {"scope": "all", "ordering": "comment"}),
        ("get", requests, None, {"scope": "all", "status": "nonsense,,pending", "type": "x y"}),
        ("get", requests, None, {"scope": "all", "employee": NOBODY}),
        ("get", requests, None, {"scope": "all", "department": "99999999999999999999999"}),
        ("get", requests, None, {"scope": "all", "from": "2026-12-31", "to": "2026-01-01"}),
        ("get", requests, None, {"scope": "all", "on_behalf": "maybe"}),
        ("get", requests, None, {"page": "0"}),
        ("get", requests, None, {"page": "x", "page_size": "y"}),
        ("get", approvals, None, {"queue": "hr", "department": "x"}),
        ("get", approvals, None, {"queue": "hr", "type": ",,,"}),
        ("get", approvals, None, {"queue": "hr", "page": "999"}),
        # creating and previewing
        ("post", requests, {}, {}),
        ("post", requests, {"type": "annual", "start_date": "02/11/2026", "end_date": "x"}, {}),
        ("post", requests, {"type": "annual", **dates, "exceptional_event": "abc"}, {}),
        ("post", requests, {"type": "annual", **dates, "employee": "not-a-uuid"}, {}),
        ("post", requests, {"type": "annual", **dates, "employee": NOBODY}, {}),
        ("post", requests, {"type": "permission", **dates, "start_time": "09:00"}, {}),
        ("post", requests, {"type": "permission", **dates, "start_time": "25:99", "end_time": "x"}, {}),
        ("post", requests, {"type": "permission", **dates, "starts_at_midday": True}, {}),
        ("post", requests, {"type": "annual", "start_date": "0001-01-01", "end_date": "0001-01-01"}, {}),
        ("post", requests, {"type": "remote", "start_date": "9999-12-31", "end_date": "9999-12-31"}, {}),
        ("post", requests, {"type": "annual", "start_date": "0001-01-01", "end_date": "9999-12-31"}, {}),
        ("post", requests, {"type": "annual", **dates, "comment": "x" * 5000}, {}),
        ("post", requests, {"type": "annual", **dates, "comment": "a\x00b"}, {}),
        ("post", requests, ["not", "an", "object"], {}),
        ("post", preview, {"type": "permission", "start_date": "9999-12-31", "end_date": "9999-12-31"}, {}),
        ("post", preview, {"type": "remote", "start_date": "0001-01-03", "end_date": "0001-01-03"}, {}),
        ("post", preview, {"type": "annual", **dates, "request": NOBODY}, {}),
        ("post", preview, {"type": "exceptional", **dates, "exceptional_event": 987654321}, {}),
        # editing, sending, files, changes
        ("patch", detail, {}, {}),
        ("patch", detail, {"version": 0}, {}),
        ("patch", detail, {"version": 1, "start_date": None}, {}),
        ("patch", detail, {"version": 1, "end_date": "2020-01-01"}, {}),
        ("post", reverse("requests:request-submit", kwargs=own), {"version": "one"}, {}),
        ("post", reverse("requests:request-submit", kwargs=own), {}, {}),
        ("post", reverse("requests:request-attachments", kwargs=own), {"file": "not a file"}, {}),
        ("post", reverse("requests:request-amendments", kwargs=one), {"kind": "erase", "reason": "x"}, {}),
        (
            "post",
            reverse("requests:request-amendments", kwargs=one),
            {"kind": "change", "start_date": "x"},
            {},
        ),
        ("post", reverse("requests:amendment-withdraw", kwargs={"public_id": NOBODY}), {}, {}),
        # HR actions and steps
        ("post", reverse("requests:request-correct", kwargs=one), {}, {}),
        ("post", reverse("requests:request-correct", kwargs=one), {**dates, "end_date": "3026-11-02"}, {}),
        ("post", reverse("requests:request-cancel", kwargs=one), {"reason": None}, {}),
        ("post", reverse("requests:request-reclassify", kwargs=one), {"override_reason": ["x"]}, {}),
        ("post", reverse("requests:step-decide", kwargs={"pk": step.pk}), {"decision": "maybe"}, {}),
        (
            "post",
            reverse("requests:step-decide", kwargs={"pk": 10**30}),
            {"decision": "approve", "version": 1},
            {},
        ),
        (
            "post",
            reverse("requests:step-record-on-behalf", kwargs={"pk": step.pk}),
            {"decided_at": "noon"},
            {},
        ),
        (
            "post",
            reverse("requests:step-record-on-behalf", kwargs={"pk": step.pk}),
            {
                "decided_by": NOBODY,
                "decision": "approve",
                "decided_at": "0001-01-01T00:00:00Z",
                "channel": "paper",
                "note": "x",
                "version": waiting.version,
            },
            {},
        ),
        ("post", reverse("requests:step-reassign", kwargs={"pk": step.pk}), {"new_approver": "x"}, {}),
        (
            "post",
            reverse("requests:step-reassign", kwargs={"pk": step.pk}),
            {"new_approver": NOBODY, "reason": "x"},
            {},
        ),
        # configuration
        ("post", types, {"code": "a b", "name_fr": "", "name_en": "x", "unit": "week"}, {}),
        (
            "post",
            types,
            {"code": "t", "name_fr": "x", "name_en": "x", "unit": "day", "cap_quantity": "1e99"},
            {},
        ),
        ("post", types, {"code": "t", "name_fr": "x", "name_en": "x", "unit": "day", "notice_days": -1}, {}),
        ("patch", a_type, {"cap_quantity": None}, {}),
        ("patch", a_type, {"code": "another", "unit": "hour"}, {}),
        ("put", steps_of_type, {"steps": []}, {}),
        ("put", steps_of_type, {"steps": [{"approver_rule": "named_person", "mode": "approve"}]}, {}),
        (
            "put",
            steps_of_type,
            {"steps": [{"approver_rule": "hr_role", "mode": "approve", "flag_after_days": 0}]},
            {},
        ),
        ("put", steps_of_type, {"steps": "all"}, {}),
        (
            "get",
            reverse("requests:type-chain-preview", kwargs={"pk": world.remote.pk}),
            None,
            {"employee": "x"},
        ),
        ("post", events, {"name_fr": "x", "name_en": "x", "days_allowed": "-1"}, {}),
        ("post", events, {"name_fr": "x", "name_en": "x", "days_allowed": "many"}, {}),
        ("patch", reverse("requests:event-detail", kwargs={"pk": 10**30}), {"is_active": False}, {}),
        # holidays
        ("get", holidays, None, {"year": "99999"}),
        ("post", holidays, {"date": "2026-02-30", "name_fr": "x", "name_en": "x"}, {}),
        ("patch", reverse("calendar:holiday-detail", kwargs={"pk": 10**30}), {"name_fr": "x"}, {}),
        ("post", reverse("calendar:holiday-copy"), {"from_year": 2027, "to_year": 2026}, {}),
        ("post", reverse("calendar:holiday-copy"), {"from_year": "x"}, {}),
        ("get", reverse("calendar:holiday-impact"), None, {}),
        ("get", reverse("calendar:holiday-impact"), None, {"date": "9999-12-31"}),
    ]


def test_no_input_gives_an_error_page(world, client_for):
    calls = _calls(world)
    answers = []
    for user in (world.hr_user, world.owner_user, world.manager_user):
        client = client_for(user)
        for method, url, body, query in calls:
            if method == "get":
                response = client.get(url, query)
            else:
                response = getattr(client, method)(url, body, format="json")
            answers.append((response.status_code, user.email, method, url, body or query))
    broken = [answer for answer in answers if answer[0] >= 500]
    assert broken == []
    # Every refusal is a problem document with its code, in the one format of the API.
    assert {status for status, *_ in answers} <= {200, 201, 204, 400, 403, 404, 409}
