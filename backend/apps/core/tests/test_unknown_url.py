from rest_framework.test import APIClient


def test_an_unknown_address_answers_with_a_problem_document():
    response = APIClient().get("/api/v1/does-not-exist", HTTP_ACCEPT_LANGUAGE="en")
    body = response.json()

    assert response.status_code == 404
    assert response["Content-Type"] == "application/problem+json"
    assert body["code"] == "core.not_found"
    assert body["detail"] == "This page or item is not available."
    assert body["request_id"] == response["X-Request-ID"]
