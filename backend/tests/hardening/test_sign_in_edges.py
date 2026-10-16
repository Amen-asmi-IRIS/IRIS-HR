"""Sign-in at its edges: case, spaces, lookalike domains, lock-out, temporary passwords, address limit."""

from __future__ import annotations

import json
import logging
from datetime import timedelta

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts import services as account_services
from apps.audit.models import AuditEvent
from tests.hardening.helpers import NOW

PASSWORD = "Correct-Horse-42!"
LOGIN = "accounts:login"


def _try(email: str, password: str = PASSWORD, ip: str = "10.20.0.7"):
    return APIClient(REMOTE_ADDR=ip).post(
        reverse(LOGIN), {"email": email, "password": password}, format="json"
    )


@pytest.mark.django_db
def test_case_and_surrounding_spaces_do_not_matter(world):
    email = world.owner_user.email
    assert _try(email.upper()).status_code == 200
    assert _try(f"  {email.title()}  ").status_code == 200
    assert _try(f"\t{email}\n").status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize(
    "email",
    [
        "employee.a1@impactrisks.com.evil.org",
        "employee.a1@notimpactrisks.com",
        "employee.a1@impactrisks.co",
        "employee.a1@impactrisks.com@evil.org",
        "employee.a1@IMPACTRISKS.COM.",
        "employee.a1",
    ],
)
def test_a_lookalike_address_is_refused_for_its_domain(world, email):
    response = _try(email)
    assert response.status_code != 200
    assert response.json()["code"] in ("auth.domain_not_allowed", "auth.invalid_credentials")
    if "@" in email and not email.endswith("."):
        assert response.json()["code"] == "auth.domain_not_allowed"


@pytest.mark.django_db
def test_the_administrator_cannot_create_an_account_outside_the_domain(world, client_for):
    response = client_for(world.sysadmin_user).post(
        reverse("accounts:account-list"),
        {"email": "contractor@gmail.com", "full_name": "A Contractor", "roles": []},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "auth.domain_not_allowed"


@pytest.mark.django_db
def test_a_wrong_password_and_an_unknown_address_look_the_same(world):
    wrong = _try(world.owner_user.email, "Not-The-Password-1!")
    unknown = _try("nobody.here@impactrisks.com", "Not-The-Password-1!")
    assert wrong.status_code == unknown.status_code != 200
    assert wrong.json()["code"] == unknown.json()["code"] == "auth.invalid_credentials"
    assert wrong.json()["detail"] == unknown.json()["detail"]


@pytest.mark.django_db
def test_five_failures_lock_the_account_even_for_the_right_password(world, frozen):
    email = world.owner_user.email
    for _ in range(4):
        assert _try(email, "Not-The-Password-1!").json()["code"] == "auth.invalid_credentials"
    # The fifth failure locks the account and says so at once (plan 01a).
    assert _try(email, "Not-The-Password-1!").json()["code"] == "auth.locked"
    locked = _try(email)
    assert locked.status_code != 200 and locked.json()["code"] == "auth.locked"
    assert AuditEvent.objects.filter(category="security", action="auth.locked").count() == 1

    frozen.move_to(NOW + timedelta(minutes=14))
    assert _try(email).json()["code"] == "auth.locked"
    frozen.move_to(NOW + timedelta(minutes=16))
    assert _try(email).status_code == 200


@pytest.mark.django_db
def test_an_expired_temporary_password_is_refused_with_its_own_message(world, frozen):
    user, temporary = account_services.create_account(
        actor=world.sysadmin_user, email="new.person@impactrisks.com", full_name="New Person"
    )
    frozen.move_to(NOW + timedelta(hours=25))
    response = _try(user.email, temporary)
    assert response.status_code != 200 and response.json()["code"] == "auth.temp_password_expired"


@pytest.mark.django_db
def test_a_temporary_password_opens_nothing_but_the_password_change(world, frozen):
    user, temporary = account_services.create_account(
        actor=world.sysadmin_user, email="new.person@impactrisks.com", full_name="New Person"
    )
    client = APIClient()
    signed_in = client.post(reverse(LOGIN), {"email": user.email, "password": temporary}, format="json")
    assert signed_in.status_code == 200 and signed_in.json()["must_change_password"] is True

    blocked = client.get(reverse("notifications:list"))
    assert blocked.status_code == 403 and blocked.json()["code"] == "auth.password_change_required"

    change = reverse("accounts:password")
    from django.contrib.auth.password_validation import CommonPasswordValidator

    common = next(word for word in sorted(CommonPasswordValidator().passwords) if len(word) >= 12)
    weak = client.post(change, {"current_password": temporary, "new_password": common}, format="json")
    assert weak.status_code == 400 and weak.json()["code"] == "auth.weak_password"
    same = client.post(change, {"current_password": temporary, "new_password": temporary}, format="json")
    assert same.status_code == 400 and same.json()["code"] == "auth.weak_password"
    like_name = client.post(
        change, {"current_password": temporary, "new_password": "New.Person.2026"}, format="json"
    )
    assert like_name.status_code == 400 and like_name.json()["code"] == "auth.weak_password"
    short = client.post(change, {"current_password": temporary, "new_password": "Xk9!vT2q"}, format="json")
    assert short.status_code == 400 and short.json()["code"] == "auth.weak_password"

    assert (
        client.post(
            change, {"current_password": temporary, "new_password": "Granite-Lantern-58!"}, format="json"
        ).status_code
        == 204
    )
    assert client.get(reverse("notifications:list")).status_code == 200
    assert _try(user.email, temporary).json()["code"] == "auth.invalid_credentials"


@pytest.mark.django_db
def test_twenty_failures_from_one_address_block_that_address_only(world, frozen):
    for index in range(20):
        assert (
            _try(f"nobody{index}@impactrisks.com", "Not-The-Password-1!", ip="10.20.0.50").status_code != 200
        )
    blocked = _try(world.owner_user.email, ip="10.20.0.50")
    assert blocked.status_code == 429 and blocked.json()["code"] == "auth.rate_limited"
    assert _try(world.owner_user.email, ip="10.20.0.51").status_code == 200

    frozen.move_to(NOW + timedelta(minutes=16))
    assert _try(world.owner_user.email, ip="10.20.0.50").status_code == 200


@pytest.mark.django_db
def test_a_password_never_reaches_the_audit_trail_or_the_logs(world, caplog):
    caplog.set_level(logging.DEBUG)
    secret = "Zz-Secret-Marker-91!"
    _try(world.owner_user.email, secret)
    _try("nobody.here@impactrisks.com", secret)
    for event in AuditEvent.objects.all():
        assert secret not in json.dumps([event.object_label, event.changes], default=str)
    for record in caplog.records:
        assert secret not in json.dumps(record.__dict__, default=str)
    assert AuditEvent.objects.filter(category="security", action="auth.login_failed").count() == 2
