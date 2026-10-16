import logging

import pytest
from rest_framework.test import APIClient

from apps.core.i18n import register_messages

register_messages(
    {
        "test.locked": {"en": "Locked until {until}.", "fr": "Verrouillé jusqu'au {until}."},
        "test.first": {"en": "First problem.", "fr": "Premier problème."},
        "test.second": {"en": "Second problem.", "fr": "Second problème."},
    }
)

pytestmark = [pytest.mark.django_db, pytest.mark.urls("apps.core.tests.urls_problems")]


@pytest.fixture
def api():
    return APIClient()


def probe(api, kind, lang="en"):
    return api.get("/probe", {"kind": kind}, HTTP_ACCEPT_LANGUAGE=lang)


def test_a_domain_error_becomes_a_problem_document(api):
    response = probe(api, "domain")

    assert response.status_code == 400
    assert response["Content-Type"] == "application/problem+json"
    assert response.json() == {
        "type": "urn:iris-hr:problem:test.locked",
        "title": "Bad Request",
        "status": 400,
        "code": "test.locked",
        "detail": "Locked until 06/10/2026 10:30.",
        "errors": [
            {
                "field": "email",
                "code": "test.locked",
                "detail": "Locked until 06/10/2026 10:30.",
                "params": {"until": "2026-10-06T09:30:00Z"},
            }
        ],
        "request_id": response["X-Request-ID"],
    }


def test_the_detail_is_in_the_callers_language(api):
    body = probe(api, "domain", lang="fr").json()

    assert body["detail"] == "Verrouillé jusqu'au 06/10/2026 10:30."
    assert body["errors"][0]["detail"] == "Verrouillé jusqu'au 06/10/2026 10:30."


def test_several_problems_are_listed_under_one_summary(api):
    body = probe(api, "several").json()

    assert body["code"] == "core.validation"
    assert body["detail"] == "Some fields need your attention."
    assert [(e["field"], e["code"], e["detail"]) for e in body["errors"]] == [
        ("start_date", "test.first", "First problem."),
        (None, "test.second", "Second problem."),
    ]


@pytest.mark.parametrize(
    ("kind", "status", "title", "code"),
    [
        ("not_found", 404, "Not Found", "core.not_found"),
        ("conflict", 409, "Conflict", "core.conflict"),
        ("rate", 429, "Too Many Requests", "core.rate_limited"),
        ("http404", 404, "Not Found", "core.not_found"),
        ("denied", 403, "Forbidden", "core.not_allowed"),
    ],
)
def test_each_kind_of_error_has_its_status_and_code(api, kind, status, title, code):
    response = probe(api, kind)
    body = response.json()

    assert response.status_code == status
    assert (body["status"], body["title"], body["code"]) == (status, title, code)
    assert body["type"] == f"urn:iris-hr:problem:{code}"
    assert len(body["errors"]) == 1
    assert body["errors"][0]["field"] is None
    assert body["detail"]


def test_a_missing_field_is_reported_next_to_its_input(api):
    english = api.post("/probe", {}, HTTP_ACCEPT_LANGUAGE="en").json()
    french = api.post("/probe", {}, HTTP_ACCEPT_LANGUAGE="fr").json()

    assert english["status"] == 400
    assert english["code"] == "core.validation"
    assert english["detail"] == "Some fields need your attention."
    assert english["errors"] == [
        {"field": "name", "code": "validation.required", "detail": "This field is required.", "params": {}}
    ]
    assert french["detail"] == "Certains champs sont à corriger."
    assert french["errors"][0]["detail"] != english["errors"][0]["detail"]


def test_nested_inputs_get_a_dotted_path(api):
    payload = {"name": "toolong", "lines": [{"label": "a", "days": 0}, {"days": 2}]}

    body = api.post("/probe", payload).json()

    assert [(e["field"], e["code"]) for e in body["errors"]] == [
        ("name", "validation.max_length"),
        ("lines.0.days", "validation.min_value"),
        ("lines.1.label", "validation.required"),
    ]


def test_an_error_that_belongs_to_no_field_has_a_null_field(api):
    body = api.post("/probe", {"name": "clash"}).json()

    assert body["errors"] == [
        {"field": None, "code": "validation.invalid", "detail": "These two do not go together.", "params": {}}
    ]


def test_an_unexpected_error_hides_the_cause_and_gives_a_reference(api, caplog):
    with caplog.at_level(logging.ERROR, logger="iris.errors"):
        response = probe(api, "crash")
    body = response.json()

    assert response.status_code == 500
    assert body["code"] == "core.unexpected"
    assert body["request_id"] == response["X-Request-ID"]
    assert response["X-Request-ID"] in body["detail"]
    assert "secret internal detail" not in response.content.decode()
    logged = next(r for r in caplog.records if r.name == "iris.errors")
    assert logged.exc_info is not None
    assert "secret internal detail" in str(logged.exc_info[1])


def test_a_method_the_view_does_not_have_is_refused(api):
    response = api.delete("/probe")

    assert response.status_code == 405
    assert response.json()["code"] == "core.method_not_allowed"


def test_unreadable_json_is_refused(api):
    response = api.post("/probe", data="{", content_type="application/json")

    assert response.status_code == 400
    assert response.json()["code"] == "core.malformed"


def test_an_unsupported_content_type_is_refused(api):
    response = api.post("/probe", data="name=x", content_type="text/plain")

    assert response.status_code == 415
    assert response.json()["code"] == "core.unsupported_media_type"
