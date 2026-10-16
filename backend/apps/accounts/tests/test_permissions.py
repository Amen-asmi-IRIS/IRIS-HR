import logging

import pytest
from rest_framework.test import APIClient

from apps.accounts.tests.world import make_user

pytestmark = [pytest.mark.django_db, pytest.mark.urls("apps.accounts.tests.urls_permissions")]


def signed_in(user, *, enforce_csrf=False) -> APIClient:
    client = APIClient(enforce_csrf_checks=enforce_csrf)
    client.force_login(user)
    return client


def test_a_public_endpoint_needs_no_session():
    assert APIClient().get("/open").status_code == 200


def test_an_anonymous_caller_is_asked_to_sign_in():
    response = APIClient().get("/signed-in")

    assert response.status_code == 401
    assert response["WWW-Authenticate"] == "Session"
    assert response.json()["code"] == "core.not_authenticated"


def test_any_signed_in_account_passes_an_authenticated_endpoint():
    response = signed_in(make_user("sami@impactrisks.com")).get("/signed-in")

    assert response.status_code == 200
    assert response.json() == {"email": "sami@impactrisks.com", "user_class": "User"}


def test_a_role_endpoint_refuses_an_account_without_the_role():
    response = signed_in(make_user()).get("/hr")

    assert response.status_code == 403
    assert response.json()["code"] == "core.not_allowed"


def test_a_role_endpoint_accepts_a_holder():
    assert signed_in(make_user(roles=["hr"])).get("/hr").status_code == 200


def test_access_is_declared_per_method():
    executive = signed_in(make_user(roles=["exec"]))

    assert executive.get("/hr").status_code == 403
    assert executive.post("/hr", {}).status_code == 200


def test_a_method_that_is_not_declared_is_refused_even_if_the_view_has_it():
    assert signed_in(make_user(roles=["hr"])).put("/hr", {}).status_code == 403


def test_a_view_without_declaration_is_closed_and_reported(caplog):
    with caplog.at_level(logging.ERROR, logger="iris.permissions"):
        signed = signed_in(make_user(roles=["hr", "exec"])).get("/undeclared")
        anonymous = APIClient().get("/undeclared")

    assert signed.status_code == 403
    assert anonymous.status_code == 401
    assert any(getattr(record, "data", None) == {"view": "UndeclaredView"} for record in caplog.records)


def test_a_disabled_account_loses_its_session_at_once():
    user = make_user()
    client = signed_in(user)
    assert client.get("/signed-in").status_code == 200

    user.is_active = False
    user.save(update_fields=["is_active"])

    assert client.get("/signed-in").status_code == 401


def test_until_the_password_is_changed_everything_but_public_pages_is_closed():
    client = signed_in(make_user(must_change_password=True, roles=["hr"]))

    blocked = client.get("/signed-in")
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "auth.password_change_required"
    assert client.get("/hr").json()["code"] == "auth.password_change_required"
    assert client.get("/open").status_code == 200


def test_an_unsafe_call_needs_the_csrf_token_even_without_a_session():
    client = APIClient(enforce_csrf_checks=True)

    refused = client.post("/open", {})
    assert refused.status_code == 403
    assert refused.json()["code"] == "auth.csrf_failed"

    token = client.get("/open").json()["csrf_token"]
    assert client.post("/open", {}, HTTP_X_CSRFTOKEN=token).status_code == 200


def test_an_unsafe_call_needs_the_csrf_token_with_a_session_too():
    client = signed_in(make_user(roles=["hr"]), enforce_csrf=True)

    assert client.post("/hr", {}).json()["code"] == "auth.csrf_failed"

    token = client.get("/open").json()["csrf_token"]
    assert client.post("/hr", {}, HTTP_X_CSRFTOKEN=token).status_code == 200


def test_a_wrong_csrf_token_is_refused():
    client = APIClient(enforce_csrf_checks=True)
    client.get("/open")

    assert client.post("/open", {}, HTTP_X_CSRFTOKEN="x" * 64).status_code == 403


def test_safe_calls_need_no_token():
    client = signed_in(make_user(), enforce_csrf=True)

    assert client.get("/signed-in").status_code == 200
