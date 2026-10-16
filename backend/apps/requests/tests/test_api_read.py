import pytest
from django.urls import reverse

from apps.accounts.services import display_name
from apps.requests import services
from apps.requests.tests.helpers import (
    FRI,
    MON,
    NOW,
    TODAY,
    TUE,
    WED,
    days,
    decide,
    draft,
    fresh,
    hours,
    pdf,
    pending_step,
    stored,
    submitted,
)

pytestmark = pytest.mark.django_db

LIST = "requests:request-list"
PREVIEW = "requests:request-preview"


def english(user):
    user.language = "en"
    user.save(update_fields=["language"])
    return user


def url(name: str, request) -> str:
    return reverse(name, kwargs={"public_id": request.public_id})


# ------------------------------------------------------------------ lists


def test_my_requests_are_paginated_newest_first(world, client_for, clock):
    first = submitted(world, data=days(MON))
    clock.shift(60)
    second = draft(world, data=days(TUE))
    response = client_for(world.owner_user).get(reverse(LIST))
    assert response.status_code == 200
    body = response.json()
    assert (body["count"], body["next"], body["previous"]) == (2, None, None)
    assert [item["public_id"] for item in body["results"]] == [str(second.public_id), str(first.public_id)]
    item = body["results"][1]
    assert (item["start_date"], item["quantity"], item["status"], item["state"]["key"]) == (
        "2026-11-02",
        "1.00",
        "pending",
        "waiting_manager",
    )
    assert item["viewer"]["actions"] == ["edit", "withdraw", "attach"]
    assert "steps" not in item


def test_scopes_follow_roles(world, client_for):
    mine = submitted(world)
    client = client_for(world.manager_user)
    team = client.get(reverse(LIST), {"scope": "team"}).json()
    assert [item["public_id"] for item in team["results"]] == [str(mine.public_id)]
    assert team["results"][0]["viewer"] == {
        "relation": "approver",
        "actions": ["decide"],
        "step_id": team["results"][0]["viewer"]["step_id"],
    }
    assert client.get(reverse(LIST), {"scope": "all"}).status_code == 403
    assert client_for(world.owner_user).get(reverse(LIST), {"scope": "team"}).status_code == 403
    assert client_for(world.hr_user).get(reverse(LIST), {"scope": "all"}).json()["count"] == 1
    unknown = client_for(world.hr_user).get(reverse(LIST), {"scope": "everything"})
    assert (unknown.status_code, unknown.json()["code"]) == (400, "request.scope_invalid")


def test_filters_ordering_and_unreadable_values(world, client_for):
    annual = submitted(world, data=days(MON))
    remote = submitted(world, request_type=world.remote, data=days(WED))
    client = client_for(world.owner_user)

    def ids(**params):
        return [item["public_id"] for item in client.get(reverse(LIST), params).json()["results"]]

    assert ids(type="remote") == [str(remote.public_id)]
    assert ids(status="pending,approved", ordering="start_date") == [
        str(annual.public_id),
        str(remote.public_id),
    ]
    assert ids(**{"from": "2026-11-04", "to": "2026-11-04"}) == [str(remote.public_id)]
    assert ids(year="2027") == []
    assert ids(on_behalf="1") == []
    bad = client.get(reverse(LIST), {"year": "soon"})
    assert (bad.status_code, bad.json()["code"]) == (400, "request.filter_invalid")
    for year in (
        "0",
        "99999",
        "-2026",
    ):  # a number that is no year is refused, not answered with an error page
        out_of_range = client.get(reverse(LIST), {"year": year})
        assert (out_of_range.status_code, out_of_range.json()["code"]) == (400, "request.filter_invalid")
    assert client.get(reverse(LIST), {"employee": "not-a-uuid"}).status_code == 400


def test_hr_filters_by_employee_and_department(world, client_for):
    submitted(world, data=days(MON))
    elsewhere = submitted(world, employee=world.outsider, data=days(MON))
    client = client_for(world.hr_user)
    by_person = client.get(reverse(LIST), {"scope": "all", "employee": str(world.outsider.public_id)}).json()
    by_department = client.get(reverse(LIST), {"scope": "all", "department": world.dept_b.pk}).json()
    assert [item["public_id"] for item in by_person["results"]] == [str(elsewhere.public_id)]
    assert [item["public_id"] for item in by_department["results"]] == [str(elsewhere.public_id)]


# ------------------------------------------------------------------ detail and history


def test_detail_carries_steps_files_changes_and_context(world, client_for):
    request = submitted(world, data=days(MON, TUE, comment="Vacances"))
    response = client_for(english(world.manager_user)).get(url("requests:request-detail", request))
    assert response.status_code == 200
    body = response.json()
    assert (body["public_id"], body["version"], body["comment"]) == (str(request.public_id), 2, "Vacances")
    assert body["state"]["since"].startswith("2026-10-06T09:00:00")
    assert [
        (step["position"], step["rule"], step["status"], step["approvers"]) for step in body["steps"]
    ] == [
        (1, "line_manager", "pending", [display_name(world.manager_user)]),
        (2, "hr_role", "waiting", ["HR"]),
    ]
    assert (body["attachments"], body["amendments"]) == ([], [])
    assert body["decision_context"] == {
        "balance": {"now": "10.00", "after": "8.00"},
        "teammates_away": [],
        "cap": None,
    }


def test_a_request_outside_reach_is_not_available(world, client_for):
    request = submitted(world)
    response = client_for(world.peer_user).get(url("requests:request-detail", request))
    assert response.status_code == 404
    assert response.json()["code"] == "core.not_found"
    assert client_for(world.peer_user).get(url("requests:request-history", request)).status_code == 404


def test_the_json_of_a_sick_leave_for_a_manager_has_no_medical_detail(world, client_for):
    request = submitted(world, request_type=world.sick, data=days(TODAY, comment="Grippe sévère"))
    decide(request, world.hr_user, "return", "Certificat illisible")
    client = client_for(world.manager_user)
    text = (
        (
            client.get(url("requests:request-detail", request)).content
            + client.get(url("requests:request-history", request)).content
            + client.get(reverse(LIST), {"scope": "team"}).content
        )
        .decode()
        .lower()
    )
    assert "grippe" not in text
    assert "illisible" not in text
    body = client.get(url("requests:request-detail", request)).json()
    assert (body["comment"], body["comment_hidden"], body["certificate"]) == (None, True, None)


def test_the_history_of_a_sick_leave_does_not_tell_the_manager_about_its_files(world, client_for):
    request = submitted(world, request_type=world.sick, data=days(TODAY, comment="Grippe"))
    services.attach_file(actor=world.owner_user, request=request, upload=pdf("certificat.pdf"))

    def actions(user) -> list[str]:
        rows = client_for(user).get(url("requests:request-history", request)).json()
        return [row["action"] for row in rows]

    for user in (world.owner_user, world.hr_user):
        assert actions(user) == ["request.created", "request.submitted", "request.attachment_added"]
    for user in (world.manager_user, world.exec_user):
        assert actions(user) == ["request.created", "request.submitted"]


def test_the_history_of_a_sick_leave_does_not_tell_the_manager_that_a_signed_form_was_kept(world, client_for):
    request = submitted(world, request_type=world.sick, data=days(TODAY))
    current = fresh(request)
    services.record_on_behalf(
        actor=world.hr_user,
        step=pending_step(current),
        decided_by=world.hr,
        decision="approve",
        decided_at=NOW,
        channel="paper",
        note="Formulaire remis à l'accueil",
        scan=pdf("formulaire.pdf"),
        expected_version=current.version,
    )

    def recorded(user) -> dict:
        rows = client_for(user).get(url("requests:request-history", request)).json()
        return next(row for row in rows if row["action"] == "step.recorded_on_behalf")["changes"]

    for user in (world.owner_user, world.hr_user):
        assert recorded(user)["scan"] == {"before": None, "after": True}
    for user in (world.manager_user, world.exec_user):
        changes = recorded(user)
        assert "scan" not in changes
        assert changes["channel"] == {"before": None, "after": "paper"}


def test_the_history_of_an_ordinary_request_shows_its_files_to_everyone_who_sees_it(world, client_for):
    request = submitted(
        world, request_type=world.exceptional, data=days(MON, WED, exceptional_event_id=world.event.pk)
    )
    services.attach_file(actor=world.owner_user, request=request, upload=pdf("acte.pdf"))
    rows = client_for(world.manager_user).get(url("requests:request-history", request)).json()
    assert [row["action"] for row in rows][-1] == "request.attachment_added"


def test_history_is_oldest_first_with_summaries_in_the_reader_language(world, client_for, clock):
    request = submitted(world)
    clock.shift(60)
    decide(request, world.manager_user, comment="Bon repos")
    response = client_for(english(world.owner_user)).get(url("requests:request-history", request))
    assert response.status_code == 200
    rows = response.json()
    assert [row["action"] for row in rows] == ["request.created", "request.submitted", "step.decided"]
    assert [row["summary"] for row in rows] == ["Request created", "Request sent", "Decision recorded"]
    assert rows[2]["actor"] == display_name(world.manager_user)
    assert rows[2]["changes"]["decision"] == {"before": None, "after": "approve"}
    assert rows[0]["at"] < rows[2]["at"]


# ------------------------------------------------------------------ preview


def test_preview_computes_what_the_form_shows(world, client_for):
    payload = {"type": "annual", "start_date": "2026-11-06", "end_date": "2026-11-09"}
    response = client_for(english(world.owner_user)).post(reverse(PREVIEW), payload, format="json")
    assert response.status_code == 200
    body = response.json()
    assert body["quantity"] == "2.00"
    assert body["skipped_days"] == [
        {"date": "2026-11-07", "reason": "weekend"},
        {"date": "2026-11-08", "reason": "weekend"},
    ]
    assert body["chain"] == [
        {
            "position": 1,
            "rule": "line_manager",
            "mode": "approve",
            "approvers": [display_name(world.manager_user)],
        },
        {"position": 2, "rule": "hr_role", "mode": "approve", "approvers": ["HR"]},
    ]
    assert body["balance"] == {"now": "10.00", "on_start": "12.50", "after": "8.00"}
    assert body["usage"] == {"cap": None, "month_hours": None, "event_days_allowed": None}
    assert (body["certificate_due_at"], body["problems"]) == (None, [])


def test_preview_reports_every_problem_with_a_translated_detail(world, client_for):
    stored(world, request_type=world.remote, data=days(MON))
    payload = {"type": "annual", "start_date": "2026-11-02", "end_date": "2026-11-02"}
    body = client_for(english(world.owner_user)).post(reverse(PREVIEW), payload, format="json").json()
    (problem,) = body["problems"]
    assert (problem["field"], problem["code"]) == ("start_date", "request.overlap")
    assert problem["params"] == {"other": "02/11/2026"}
    assert problem["detail"].startswith("These dates overlap another of your requests (02/11/2026).")

    reversed_dates = {"type": "annual", "start_date": "2026-11-06", "end_date": "2026-11-02"}
    body = client_for(world.owner_user).post(reverse(PREVIEW), reversed_dates, format="json").json()
    assert (body["quantity"], body["skipped_days"]) == ("0.00", [])
    assert [problem["code"] for problem in body["problems"]] == ["request.end_before_start"]


def test_preview_of_an_absurd_period_answers_at_once_with_the_problem(world, client_for):
    payload = {"type": "annual", "start_date": "2026-11-02", "end_date": "9999-12-31"}
    response = client_for(english(world.owner_user)).post(reverse(PREVIEW), payload, format="json")
    assert response.status_code == 200
    body = response.json()
    assert [problem["code"] for problem in body["problems"]] == ["request.period_too_long"]
    assert body["problems"][0]["detail"].startswith("A request cannot cover more than 366 days.")
    assert (body["quantity"], body["skipped_days"], body["balance"]) == ("0.00", [], None)


def test_preview_shows_usage_per_type(world, client_for):
    client = client_for(world.owner_user)
    stored(world, request_type=world.remote, data=days(MON))
    remote = client.post(
        reverse(PREVIEW),
        {"type": "remote", "start_date": "2026-11-03", "end_date": "2026-11-03"},
        format="json",
    ).json()
    assert remote["usage"]["cap"] == {"used": "1.00", "limit": "2.00", "period": "week"}
    assert remote["balance"] is None

    stored(world, request_type=world.permission, data=hours(FRI, "09:00", "10:30"))
    permission = client.post(
        reverse(PREVIEW),
        {
            "type": "permission",
            "start_date": "2026-11-05",
            "end_date": "2026-11-05",
            "start_time": "14:00",
            "end_time": "15:00",
        },
        format="json",
    ).json()
    assert (permission["quantity"], permission["usage"]["month_hours"]) == ("1.00", "1.50")

    wedding = client.post(
        reverse(PREVIEW),
        {
            "type": "exceptional",
            "start_date": "2026-11-16",
            "end_date": "2026-11-17",
            "exceptional_event": world.event.pk,
        },
        format="json",
    ).json()
    assert wedding["usage"]["event_days_allowed"] == "3.00"

    ill = client.post(
        reverse(PREVIEW),
        {"type": "sick", "start_date": "2026-10-06", "end_date": "2026-10-06"},
        format="json",
    ).json()
    assert ill["certificate_due_at"].startswith("2026-10-08T09:00:00")
    assert ill["chain"][0]["mode"] == "notify"


def test_preview_ignores_the_request_being_edited(world, client_for):
    request = submitted(world, data=days(MON))
    payload = {"type": "annual", "start_date": "2026-11-02", "end_date": "2026-11-03"}
    client = client_for(world.owner_user)
    colliding = client.post(reverse(PREVIEW), payload, format="json").json()
    assert [problem["code"] for problem in colliding["problems"]] == ["request.overlap"]
    editing = client.post(
        reverse(PREVIEW), {**payload, "request": str(request.public_id)}, format="json"
    ).json()
    assert editing["problems"] == []


def test_preview_for_someone_else_and_with_an_exception_is_for_hr(world, client_for, port):
    port.ok = False
    payload = {
        "type": "annual",
        "employee": str(world.owner.public_id),
        "start_date": "2026-11-02",
        "end_date": "2026-11-02",
        "override": True,
    }
    allowed = client_for(world.hr_user).post(reverse(PREVIEW), payload, format="json")
    assert (allowed.status_code, allowed.json()["problems"]) == (200, [])
    assert client_for(world.manager_user).post(reverse(PREVIEW), payload, format="json").status_code == 403
    unknown = client_for(world.owner_user).post(
        reverse(PREVIEW),
        {"type": "sabbatical", "start_date": "2026-11-02", "end_date": "2026-11-02"},
        format="json",
    )
    assert (unknown.status_code, unknown.json()["code"]) == (400, "request.type_unknown")
