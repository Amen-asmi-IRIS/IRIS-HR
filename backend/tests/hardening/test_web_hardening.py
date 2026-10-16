"""Cookies, CSRF, session end and response headers (PRD 10 'Web', ACC-04)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import date, timedelta

import pytest
from django.conf import settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts import services as account_services
from apps.organisation import services as organisation_services
from apps.settings import services as settings_service
from tests.hardening.helpers import NOW, pdf

PASSWORD = "Correct-Horse-42!"


def _sign_in(user, **extra) -> APIClient:
    client = APIClient(**extra)
    response = client.post(
        reverse("accounts:login"), {"email": user.email, "password": PASSWORD}, format="json"
    )
    assert response.status_code == 200, response.content
    client.login_response = response
    return client


@pytest.mark.django_db
def test_the_session_cookie_is_httponly_lax_and_ends_with_the_browser(world):
    cookie = _sign_in(world.owner_user).login_response.cookies[settings.SESSION_COOKIE_NAME]
    assert cookie["httponly"] is True
    assert cookie["samesite"] == "Lax"
    assert cookie["max-age"] == "" and cookie["expires"] == "", "the cookie must not outlive the browser"


@pytest.mark.parametrize("environment", ["test", "production"])
def test_server_settings_are_strict_outside_development(environment):
    keys = [
        "DEBUG",
        "SESSION_COOKIE_SECURE",
        "CSRF_COOKIE_SECURE",
        "SESSION_COOKIE_HTTPONLY",
        "SESSION_COOKIE_SAMESITE",
        "SESSION_EXPIRE_AT_BROWSER_CLOSE",
        "SECURE_CONTENT_TYPE_NOSNIFF",
        "X_FRAME_OPTIONS",
        "ALLOWED_HOSTS",
        "SECURE_HSTS_SECONDS",
        "SECURE_REFERRER_POLICY",
    ]
    code = (
        "import django, json; django.setup(); from django.conf import settings as s; "
        f"print(json.dumps({{k: getattr(s, k, None) for k in {keys!r}}}))"
    )
    env = {
        **os.environ,
        "ENVIRONMENT": environment,
        "SITE_HOSTNAME": "hr.example.test",
        "DJANGO_ALLOWED_HOSTS": "hr.example.test",
    }
    result = subprocess.run(
        [sys.executable, "-c", code], env=env, capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr
    values = json.loads(result.stdout.strip().splitlines()[-1])
    assert values["DEBUG"] is False
    assert values["SESSION_COOKIE_SECURE"] is True and values["CSRF_COOKIE_SECURE"] is True
    assert values["SESSION_COOKIE_HTTPONLY"] is True
    assert values["SESSION_COOKIE_SAMESITE"] == "Lax"
    assert values["SESSION_EXPIRE_AT_BROWSER_CLOSE"] is True
    assert values["SECURE_CONTENT_TYPE_NOSNIFF"] is True
    assert values["X_FRAME_OPTIONS"] == "DENY"
    assert values["ALLOWED_HOSTS"] == ["hr.example.test"]
    assert values["SECURE_HSTS_SECONDS"] >= 31536000
    assert values["SECURE_REFERRER_POLICY"] == "same-origin"


def test_the_process_refuses_to_start_without_a_required_variable():
    env = {key: value for key, value in os.environ.items() if key != "FILE_ENCRYPTION_KEY"}
    result = subprocess.run(
        [sys.executable, "-c", "import django; django.setup()"],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert "FILE_ENCRYPTION_KEY" in result.stderr


@pytest.mark.django_db
def test_a_state_changing_call_without_the_csrf_token_is_refused(world):
    client = APIClient(enforce_csrf_checks=True)
    client.get(reverse("accounts:csrf"))
    token = client.cookies["csrftoken"].value
    signed_in = client.post(
        reverse("accounts:login"),
        {"email": world.owner_user.email, "password": PASSWORD},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert signed_in.status_code == 200

    url = reverse("notifications:read-all")
    assert client.post(url, {}, format="json").status_code == 403
    assert client.post(url, {}, format="json", HTTP_X_CSRFTOKEN="wrong-token").status_code == 403
    token = client.cookies["csrftoken"].value  # Django rotates the token at sign-in
    assert client.post(url, {}, format="json", HTTP_X_CSRFTOKEN=token).status_code == 204


@pytest.mark.django_db
def test_a_session_ends_after_two_hours_without_activity(world, frozen):
    client = _sign_in(world.owner_user)
    me = reverse("accounts:me")
    frozen.move_to(NOW + timedelta(minutes=119))
    assert client.get(me).status_code == 200  # activity restarts the two hours
    frozen.move_to(NOW + timedelta(minutes=119 + 119))
    assert client.get(me).status_code == 200
    frozen.move_to(NOW + timedelta(minutes=119 + 119 + 121))
    assert client.get(me).status_code == 401


@pytest.mark.django_db
def test_the_inactivity_limit_is_the_setting(world, frozen):
    settings_service.set_value(actor=world.sysadmin_user, key="session_timeout_minutes", value=10)
    settings_service.clear_cache()
    client = _sign_in(world.owner_user)
    frozen.move_to(NOW + timedelta(minutes=11))
    assert client.get(reverse("accounts:me")).status_code == 401


@pytest.mark.django_db
def test_disabling_an_account_ends_its_sessions_at_once(world):
    client = _sign_in(world.owner_user)
    assert client.get(reverse("accounts:me")).status_code == 200
    account_services.disable_account(actor=world.sysadmin_user, user=world.owner_user)
    assert client.get(reverse("accounts:me")).status_code == 401


@pytest.mark.django_db
def test_archiving_an_employee_ends_their_sessions_at_once(world, frozen):
    client = _sign_in(world.peer_user)
    organisation_services.archive_employee(
        actor=world.hr_user, employee=world.peer, leaving_date=date(2026, 11, 2), reason="Left"
    )
    assert client.get(reverse("accounts:me")).status_code == 401
    again = APIClient().post(
        reverse("accounts:login"), {"email": world.peer_user.email, "password": PASSWORD}, format="json"
    )
    assert again.json()["code"] == "auth.disabled"


@pytest.mark.django_db
def test_api_responses_carry_safe_headers_and_a_request_id(world, anon_client):
    response = anon_client.get(reverse("core:health"))
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert len(response.headers["X-Request-ID"]) >= 16

    refused = anon_client.get(reverse("accounts:me"))
    assert refused.status_code == 401
    assert refused.headers["Content-Type"].startswith("application/problem+json")
    assert refused.json()["request_id"] == refused.headers["X-Request-ID"]
    assert {"type", "title", "status", "code", "detail", "errors", "request_id"} <= set(refused.json())


@pytest.mark.django_db
def test_a_file_is_served_as_a_download_only(world, client_for):
    document = organisation_services.add_document(
        actor=world.hr_user,
        employee=world.owner,
        upload=pdf("contrat.pdf"),
        label="Contrat",
        visible_to_employee=True,
    )
    url = reverse("files:download", kwargs={"public_id": document.attachment.public_id})
    response = client_for(world.owner_user).get(url)
    assert response.status_code == 200
    assert response.headers["Content-Disposition"].lower().startswith("attachment")
    assert "inline" not in response.headers["Content-Disposition"].lower()
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Content-Type"] in ("application/pdf", "application/octet-stream")
    assert "sandbox" in response.headers.get("Content-Security-Policy", "sandbox")


@pytest.mark.django_db
def test_an_unknown_path_under_the_api_is_a_problem_document_not_a_debug_page(world, client_for):
    response = client_for(world.owner_user).get("/api/v1/this-does-not-exist")
    assert response.status_code == 404
    assert b"Traceback" not in response.content and b"DEBUG" not in response.content
