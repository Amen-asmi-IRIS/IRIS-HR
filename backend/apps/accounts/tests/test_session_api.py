from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.tests.world import PASSWORD
from apps.audit.models import AuditEvent
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db

CSRF = "/api/v1/auth/csrf"
LOGIN = "/api/v1/auth/login"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/auth/me"
CHANGE_PASSWORD = "/api/v1/auth/password"
NOTIFICATIONS = "/api/v1/notifications"

OWNER = "employee.a1@impactrisks.com"
NEW_PASSWORD = "Another-Horse-43!"
START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)

ME_KEYS = {
    "public_id",
    "email",
    "name",
    "language",
    "roles",
    "workspaces",
    "last_workspace",
    "must_change_password",
    "previous_login_at",
    "password_reset",
    "employee",
    "environment",
    "version",
}


def login(client, email=OWNER, password=PASSWORD, **extra):
    return client.post(LOGIN, {"email": email, "password": password}, **extra)


# --- csrf and sign-in ---


def test_the_csrf_endpoint_hands_out_a_token_and_its_cookie(anon_client):
    response = anon_client.get(CSRF)

    assert response.status_code == 200
    assert len(response.json()["csrf_token"]) == 64
    assert "csrftoken" in response.cookies


def test_signing_in_needs_the_csrf_token(world):
    client = APIClient(enforce_csrf_checks=True)

    refused = login(client)
    assert refused.status_code == 403
    assert refused.json()["code"] == "auth.csrf_failed"

    token = client.get(CSRF).json()["csrf_token"]
    assert login(client, HTTP_X_CSRFTOKEN=token).status_code == 200


def test_signing_in_returns_the_user_and_opens_a_browser_session(world, anon_client, settings):
    response = login(anon_client)
    body = response.json()

    assert response.status_code == 200
    assert set(body) == ME_KEYS
    assert body["public_id"] == str(world.owner_user.public_id)
    assert body["email"] == OWNER
    assert body["name"] == "Amal Employee"
    assert body["language"] == settings.DEFAULT_LANGUAGE
    assert body["roles"] == ["employee"]
    assert body["workspaces"] == ["me"]
    assert body["last_workspace"] == ""
    assert body["must_change_password"] is False
    assert body["previous_login_at"] is None
    assert body["password_reset"] is None
    assert body["employee"] == {"public_id": str(world.owner.public_id), "name": "Amal Employee"}
    assert body["environment"] == settings.ENVIRONMENT
    assert body["version"] == settings.APP_VERSION

    cookie = response.cookies["sessionid"]
    assert cookie["httponly"] is True
    assert cookie["samesite"] == "Lax"
    assert cookie["max-age"] == ""  # no lifetime: the cookie ends with the browser (ACC-04)
    assert cookie["expires"] == ""
    assert bool(cookie["secure"]) is settings.SESSION_COOKIE_SECURE
    assert anon_client.get(ME).status_code == 200


def test_cookies_are_secure_on_every_stack_but_development(settings):
    expected = settings.ENVIRONMENT != "development"

    assert settings.SESSION_COOKIE_SECURE is expected
    assert settings.CSRF_COOKIE_SECURE is expected
    assert settings.SESSION_COOKIE_HTTPONLY is True
    assert settings.SESSION_COOKIE_SAMESITE == "Lax"
    assert settings.SESSION_EXPIRE_AT_BROWSER_CLOSE is True


def test_an_administrator_gets_the_administration_workspace(world, anon_client):
    body = login(anon_client, email="sysadmin@impactrisks.com").json()

    assert body["roles"] == ["sysadmin"]
    assert body["workspaces"] == ["admin"]
    assert body["name"] == "Sonia Admin"


def test_the_second_sign_in_shows_the_time_of_the_first(world):
    with time_machine.travel(START, tick=False) as clock:
        first = login(APIClient()).json()
        clock.shift(timedelta(days=1))
        second = login(APIClient()).json()

    assert first["previous_login_at"] is None
    assert datetime.fromisoformat(second["previous_login_at"]) == START
    assert second["previous_login_at"].endswith("+01:00")  # shown in Africa/Tunis time


def test_a_successful_sign_in_is_audited_with_address_and_reference(world, anon_client):
    response = login(anon_client)

    event = AuditEvent.objects.get(action="auth.login")
    assert event.actor == world.owner_user
    assert event.ip_address == "127.0.0.1"
    assert event.request_id == response["X-Request-ID"]


def test_a_forwarding_header_that_holds_no_address_does_not_break_sign_in(world, anon_client):
    refused = login(anon_client, password="wrong", HTTP_X_FORWARDED_FOR="unknown")
    accepted = login(anon_client, HTTP_X_FORWARDED_FOR="unknown")

    assert refused.json()["code"] == "auth.invalid_credentials"
    assert accepted.status_code == 200
    assert AuditEvent.objects.get(action="auth.login_failed").ip_address == "127.0.0.1"


# --- refusals (UI 4.1) ---


def test_a_wrong_password_and_an_unknown_address_read_the_same(world, anon_client):
    wrong = login(anon_client, password="not-the-password", HTTP_ACCEPT_LANGUAGE="en")
    unknown = login(anon_client, email="nobody@impactrisks.com", HTTP_ACCEPT_LANGUAGE="en")

    assert wrong.status_code == unknown.status_code == 400
    assert wrong.json()["code"] == unknown.json()["code"] == "auth.invalid_credentials"
    assert (
        wrong.json()["detail"]
        == unknown.json()["detail"]
        == "Wrong email or password. Check both and try again."
    )


def test_an_address_outside_the_company_is_refused_with_the_reason(world, anon_client):
    body = login(anon_client, email="someone@gmail.com", HTTP_ACCEPT_LANGUAGE="en").json()

    assert body["code"] == "auth.domain_not_allowed"
    assert body["errors"][0]["field"] == "email"
    assert "@impactrisks.com" in body["detail"]


def test_a_locked_account_is_told_until_when(world, anon_client):
    with time_machine.travel(START, tick=False):
        for _ in range(4):
            assert login(anon_client, password="wrong").json()["code"] == "auth.invalid_credentials"
        fifth = login(anon_client, password="wrong", HTTP_ACCEPT_LANGUAGE="en").json()
        with_right_password = login(anon_client).json()

    assert fifth["code"] == "auth.locked"
    assert datetime.fromisoformat(fifth["errors"][0]["params"]["until"]) == START + timedelta(minutes=15)
    assert "06/10/2026 09:15" in fifth["detail"]  # 08:15 UTC, shown in Africa/Tunis time
    assert with_right_password["code"] == "auth.locked"


def test_a_disabled_account_is_told_to_contact_the_administrator(world, anon_client):
    world.owner_user.is_active = False
    world.owner_user.save(update_fields=["is_active"])

    assert login(anon_client).json()["code"] == "auth.disabled"


def test_an_expired_temporary_password_is_told_to_ask_for_a_new_one(world, anon_client):
    world.owner_user.must_change_password = True
    world.owner_user.temp_password_expires_at = timezone.now() - timedelta(minutes=1)
    world.owner_user.save(update_fields=["must_change_password", "temp_password_expires_at"])

    assert login(anon_client).json()["code"] == "auth.temp_password_expired"


def test_too_many_attempts_from_one_address_answer_429(world, anon_client):
    settings_service.set_value(actor=world.sysadmin_user, key="login_ip_max_attempts", value=5)
    for number in range(5):
        login(anon_client, email=f"ghost{number}@impactrisks.com")

    response = login(anon_client)

    assert response.status_code == 429
    assert response.json()["code"] == "auth.rate_limited"


def test_missing_fields_are_reported_one_by_one(anon_client):
    response = anon_client.post(LOGIN, {})

    assert response.status_code == 400
    assert response.json()["code"] == "core.validation"
    assert {error["field"] for error in response.json()["errors"]} == {"email", "password"}


# --- me ---


def test_me_needs_a_session(anon_client):
    assert anon_client.get(ME).status_code == 401
    assert anon_client.patch(ME, {"language": "en"}).status_code == 401


def test_the_user_can_change_language_and_last_workspace(world, client_for):
    client = client_for(world.hr_user)

    english = client.patch(ME, {"language": "en"})
    workspace = client.patch(ME, {"last_workspace": "hr"})

    assert english.status_code == 200
    assert english.json()["language"] == "en"
    assert workspace.json()["last_workspace"] == "hr"
    world.hr_user.refresh_from_db()
    assert (world.hr_user.language, world.hr_user.last_workspace) == ("en", "hr")
    assert client.get(ME)["Content-Language"] == "en"


@pytest.mark.parametrize("payload", [{"language": "de"}, {"last_workspace": "finance"}])
def test_an_unknown_language_or_workspace_is_refused(world, client_for, payload):
    response = client_for(world.hr_user).patch(ME, payload)

    assert response.status_code == 400
    assert response.json()["code"] == "core.validation"
    world.hr_user.refresh_from_db()
    assert world.hr_user.last_workspace == ""


def test_the_user_learns_that_an_administrator_reset_the_password(world):
    world.owner_user.password_reset_by = world.sysadmin_user
    world.owner_user.password_reset_at = timezone.now()
    world.owner_user.save(update_fields=["password_reset_by", "password_reset_at"])

    first = login(APIClient()).json()
    second = login(APIClient()).json()

    assert first["password_reset"]["by"] == "Sonia Admin"
    assert first["password_reset"]["at"] is not None
    assert second["password_reset"] is None  # shown at the first sign-in after the reset only


# --- sign-out and dead sessions (Review Focus 3) ---


def test_signing_out_ends_the_session_and_is_audited(world, anon_client):
    login(anon_client)

    response = anon_client.post(LOGOUT)

    assert response.status_code == 204
    assert anon_client.get(ME).status_code == 401
    assert AuditEvent.objects.filter(action="auth.logout", actor=world.owner_user).count() == 1


def test_a_disabled_account_is_signed_out_at_once(world, anon_client):
    login(anon_client)
    assert anon_client.get(ME).status_code == 200

    world.owner_user.is_active = False
    world.owner_user.save(update_fields=["is_active"])

    assert anon_client.get(ME).status_code == 401


def test_changing_the_password_keeps_this_session_and_ends_the_others(world):
    here, there = APIClient(), APIClient()
    login(here)
    login(there)

    response = here.post(CHANGE_PASSWORD, {"current_password": PASSWORD, "new_password": NEW_PASSWORD})

    assert response.status_code == 204
    assert here.get(ME).status_code == 200
    assert there.get(ME).status_code == 401
    assert login(APIClient(), password=NEW_PASSWORD).status_code == 200
    assert login(APIClient(), password=PASSWORD).json()["code"] == "auth.invalid_credentials"


def test_a_wrong_current_password_is_reported_on_its_field(world, client_for):
    response = client_for(world.owner_user).post(
        CHANGE_PASSWORD, {"current_password": "wrong", "new_password": NEW_PASSWORD}
    )

    assert response.status_code == 400
    assert response.json()["code"] == "auth.wrong_current_password"
    assert response.json()["errors"][0]["field"] == "current_password"


def test_a_weak_new_password_is_reported_with_the_reasons(world, client_for):
    response = client_for(world.owner_user).post(
        CHANGE_PASSWORD, {"current_password": PASSWORD, "new_password": "short"}
    )

    assert response.status_code == 400
    assert response.json()["code"] == "auth.weak_password"
    assert response.json()["errors"][0]["field"] == "new_password"
    assert "12" in response.json()["detail"]


def test_until_the_temporary_password_is_replaced_only_the_account_pages_answer(world, anon_client):
    world.owner_user.must_change_password = True
    world.owner_user.temp_password_expires_at = timezone.now() + timedelta(hours=1)
    world.owner_user.save(update_fields=["must_change_password", "temp_password_expires_at"])

    assert login(anon_client).json()["must_change_password"] is True
    assert anon_client.get(ME).status_code == 200
    blocked = anon_client.get(NOTIFICATIONS)
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "auth.password_change_required"

    changed = anon_client.post(CHANGE_PASSWORD, {"current_password": PASSWORD, "new_password": NEW_PASSWORD})

    assert changed.status_code == 204
    assert anon_client.get(NOTIFICATIONS).status_code == 200
    assert anon_client.get(ME).json()["must_change_password"] is False
