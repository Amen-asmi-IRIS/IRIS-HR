import pytest
from django.urls import reverse

from apps.accounts.tests.world import make_user
from apps.requests.tests.helpers import (
    MON,
    TODAY,
    TUE,
    WED,
    approved,
    days,
    draft,
    pdf,
    stored,
    submitted,
)

pytestmark = pytest.mark.django_db

LIST = "requests:request-list"


def url(name: str, request) -> str:
    return reverse(name, kwargs={"public_id": request.public_id})


def english(user):
    user.language = "en"
    user.save(update_fields=["language"])
    return user


def test_an_employee_creates_edits_sends_and_withdraws(world, client_for):
    client = client_for(world.owner_user)
    created = client.post(
        reverse(LIST),
        {"type": "annual", "start_date": "2026-11-02", "end_date": "2026-11-03", "comment": "Vacances"},
        format="json",
    )
    assert created.status_code == 201
    body = created.json()
    assert (body["status"], body["quantity"], body["version"]) == ("draft", "2.00", 1)
    assert body["viewer"]["actions"] == ["edit", "submit", "discard", "attach"]
    detail = reverse("requests:request-detail", kwargs={"public_id": body["public_id"]})

    edited = client.patch(
        detail, {"version": 1, "end_date": "2026-11-04", "ends_at_midday": True}, format="json"
    )
    assert edited.status_code == 200
    assert (edited.json()["quantity"], edited.json()["version"], edited.json()["comment"]) == (
        "2.50",
        2,
        "Vacances",
    )

    sent = client.post(
        reverse("requests:request-submit", kwargs={"public_id": body["public_id"]}),
        {"version": 2},
        format="json",
    )
    assert (sent.status_code, sent.json()["status"], sent.json()["state"]["key"]) == (
        200,
        "pending",
        "waiting_manager",
    )

    withdrawn = client.post(
        reverse("requests:request-withdraw", kwargs={"public_id": body["public_id"]}), {}, format="json"
    )
    assert (withdrawn.status_code, withdrawn.json()["status"]) == (200, "withdrawn")


def test_a_stale_version_answers_409_as_a_problem_document(world, client_for):
    request = draft(world)
    response = client_for(english(world.owner_user)).patch(
        url("requests:request-detail", request), {"version": 9, "comment": "Trop tard"}, format="json"
    )
    assert response.status_code == 409
    assert response["Content-Type"].startswith("application/problem+json")
    body = response.json()
    assert (body["status"], body["code"], body["type"]) == (
        409,
        "request.already_processed",
        "urn:iris-hr:problem:request.already_processed",
    )
    assert body["detail"].startswith("Someone else has already acted on this request.")
    assert body["request_id"]


def test_sending_a_request_that_breaks_a_rule_names_the_field_and_the_other_request(world, client_for):
    stored(world, request_type=world.remote, data=days(MON))
    request = draft(world, data=days(MON))
    response = client_for(english(world.owner_user)).post(
        url("requests:request-submit", request), {"version": 1}, format="json"
    )
    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "request.overlap"
    (problem,) = body["errors"]
    assert (problem["field"], problem["code"], problem["params"]) == (
        "start_date",
        "request.overlap",
        {"other": "02/11/2026"},
    )
    assert "02/11/2026" in problem["detail"]


def test_a_slip_on_the_year_is_a_problem_of_the_end_date_not_an_error_page(world, client_for):
    response = client_for(english(world.owner_user)).post(
        reverse(LIST), {"type": "annual", "start_date": "2026-11-02", "end_date": "3026-11-03"}, format="json"
    )
    assert response.status_code == 400
    body = response.json()
    assert (body["code"], body["errors"][0]["field"]) == ("request.period_too_long", "end_date")


def test_a_draft_is_discarded(world, client_for):
    request = draft(world)
    client = client_for(world.owner_user)
    assert client.delete(url("requests:request-detail", request)).status_code == 204
    assert client.get(url("requests:request-detail", request)).status_code == 404


def test_only_hr_creates_for_someone_else(world, client_for):
    payload = {
        "type": "annual",
        "employee": str(world.owner.public_id),
        "start_date": "2026-11-02",
        "end_date": "2026-11-02",
        "override_reason": "Accord de la direction",
    }
    assert client_for(world.manager_user).post(reverse(LIST), payload, format="json").status_code == 403
    assert client_for(world.peer_user).post(reverse(LIST), payload, format="json").status_code == 404
    created = client_for(world.hr_user).post(reverse(LIST), payload, format="json")
    assert created.status_code == 201
    body = created.json()
    assert (body["employee"]["public_id"], body["has_override"], body["created_by_hr"]) == (
        str(world.owner.public_id),
        True,
        True,
    )


def test_an_account_without_an_employee_record_has_nobody_to_ask_for(world, client_for):
    external = make_user("rh.externe@impactrisks.com", full_name="RH Externe", roles=["hr"])
    response = client_for(external).post(
        reverse(LIST), {"type": "annual", "start_date": "2026-11-02", "end_date": "2026-11-02"}, format="json"
    )
    assert (response.status_code, response.json()["code"]) == (403, "request.actor_without_record")


def test_files_are_uploaded_and_listed_for_those_who_may_see_them(world, client_for):
    request = submitted(world, request_type=world.sick, data=days(TODAY, comment="Grippe"))
    files = url("requests:request-attachments", request)

    uploaded = client_for(world.owner_user).post(files, {"file": pdf("certificat.pdf")}, format="multipart")
    assert uploaded.status_code == 201
    assert (uploaded.json()["kind"], uploaded.json()["name"]) == ("medical", "certificat.pdf")

    assert [item["name"] for item in client_for(world.hr_user).get(files).json()] == ["certificat.pdf"]
    assert client_for(world.manager_user).get(files).json() == []
    assert client_for(world.manager_user).post(files, {"file": pdf()}, format="multipart").status_code == 403
    assert client_for(world.owner_user).post(files, {}, format="multipart").status_code == 400


def test_a_change_is_asked_listed_and_withdrawn(world, client_for):
    request = approved(world, data=days(MON, TUE))
    client = client_for(world.owner_user)
    changes = url("requests:request-amendments", request)

    opened = client.post(
        changes,
        {"kind": "change", "start_date": "2026-11-04", "end_date": "2026-11-05", "reason": "Décalage"},
        format="json",
    )
    assert opened.status_code == 201
    body = opened.json()
    assert (body["status"], body["start_date"], body["amendment"]["status"]) == (
        "approved",
        "2026-11-02",
        "pending",
    )
    assert body["viewer"]["actions"] == ["withdraw_amendment"]
    amendment_id = body["amendment"]["public_id"]

    listed = client_for(world.manager_user).get(changes)
    assert [(item["kind"], item["new_start_date"], item["reason"]) for item in listed.json()] == [
        ("change", "2026-11-04", "Décalage")
    ]
    assert (
        client_for(world.manager_user)
        .post(changes, {"kind": "cancel", "reason": "Non"}, format="json")
        .status_code
        == 403
    )

    again = client.post(changes, {"kind": "cancel", "reason": "Annulé"}, format="json")
    assert (again.status_code, again.json()["code"]) == (409, "request.amendment_open")

    withdrawn = client.post(
        reverse("requests:amendment-withdraw", kwargs={"public_id": amendment_id}), {}, format="json"
    )
    assert withdrawn.status_code == 200
    assert (withdrawn.json()["amendment"], withdrawn.json()["amendments"][0]["status"]) == (None, "withdrawn")

    no_dates = client.post(changes, {"kind": "change", "reason": "Sans dates"}, format="json")
    assert (no_dates.status_code, no_dates.json()["code"]) == (400, "request.dates_required")


def test_hr_corrects_and_cancels(world, client_for):
    request = approved(world, data=days(MON, WED))
    client = client_for(world.hr_user)

    corrected = client.post(
        url("requests:request-correct", request),
        {"start_date": "2026-11-02", "end_date": "2026-11-03", "reason": "Retour anticipé"},
        format="json",
    )
    assert (corrected.status_code, corrected.json()["end_date"], corrected.json()["quantity"]) == (
        200,
        "2026-11-03",
        "2.00",
    )

    no_reason = client.post(url("requests:request-cancel", request), {}, format="json")
    assert (no_reason.status_code, no_reason.json()["code"]) == (400, "request.reason_required")
    assert no_reason.json()["errors"][0]["field"] == "reason"

    cancelled = client.post(url("requests:request-cancel", request), {"reason": "Départ"}, format="json")
    assert (cancelled.status_code, cancelled.json()["status"]) == (200, "cancelled")

    assert (
        client_for(world.manager_user)
        .post(url("requests:request-cancel", request), {"reason": "Non"}, format="json")
        .status_code
        == 403
    )


def test_hr_changes_a_waiting_request_by_a_correction_never_by_an_edit(world, client_for):
    """The page offers HR no "edit" on a request that waits, and the API refuses it as well."""
    request = submitted(world, data=days(MON))
    client = client_for(world.hr_user)
    detail = url("requests:request-detail", request)
    assert "edit" not in client.get(detail).json()["viewer"]["actions"]

    edited = client.patch(
        detail, {"version": 2, "start_date": "2026-11-03", "end_date": "2026-11-03"}, format="json"
    )

    assert (edited.status_code, edited.json()["code"]) == (403, "core.not_allowed")
    assert client.get(detail).json()["start_date"] == "2026-11-02"


def test_hr_counts_a_sick_leave_as_annual_leave_but_never_its_own(world, client_for):
    request = submitted(world, request_type=world.sick, data=days(TODAY))
    done = client_for(world.hr_user).post(url("requests:request-reclassify", request), {}, format="json")
    assert done.status_code == 200
    assert (done.json()["type"]["code"], done.json()["status"]) == ("annual", "approved")

    own = submitted(world, employee=world.hr, actor=world.hr_user, request_type=world.sick, data=days(TODAY))
    refused = client_for(world.hr_user).post(url("requests:request-reclassify", own), {}, format="json")
    assert (refused.status_code, refused.json()["code"]) == (403, "request.own_request")


def test_hr_is_told_it_is_its_own_request_before_its_body_is_read(world, client_for):
    own = submitted(world, employee=world.hr, actor=world.hr_user, data=days(MON))
    client = client_for(world.hr_user)
    for name in ("requests:request-correct", "requests:request-cancel", "requests:request-reclassify"):
        refused = client.post(url(name, own), {"start_date": "not a date"}, format="json")
        assert (refused.status_code, refused.json()["code"]) == (403, "request.own_request")
