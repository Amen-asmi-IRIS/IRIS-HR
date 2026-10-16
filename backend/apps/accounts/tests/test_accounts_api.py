import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from rest_framework.test import APIClient

from apps.accounts import services
from apps.audit.models import AuditEvent

pytestmark = pytest.mark.django_db

ACCOUNTS = "/api/v1/accounts"
CANDIDATES = "/api/v1/accounts/candidates"
LOGIN = "/api/v1/auth/login"
START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)

ROW_KEYS = {"public_id", "email", "name", "state", "roles", "last_login_at", "has_employee"}
DETAIL_KEYS = ROW_KEYS | {
    "role_assignments",
    "previous_login_at",
    "failed_attempts",
    "locked_until",
    "created_at",
    "created_by",
    "recent_events",
    "can_enable",
}


def url(user, suffix: str = "") -> str:
    return f"{ACCOUNTS}/{user.public_id}{suffix}"


@pytest.fixture
def admin(world, client_for):
    return client_for(world.sysadmin_user)


# --- reading ---


def test_the_list_shows_every_account_with_its_state_and_roles(world, admin):
    body = admin.get(ACCOUNTS).json()

    assert body["count"] == 8
    emails = [row["email"] for row in body["results"]]
    assert emails == sorted(emails)
    row = next(row for row in body["results"] if row["email"] == "hr@impactrisks.com")
    assert row == {
        "public_id": str(world.hr_user.public_id),
        "email": "hr@impactrisks.com",
        "name": "Senna RH",
        "state": "active",
        "roles": ["employee", "hr"],
        "last_login_at": None,
        "has_employee": True,
    }


def test_the_list_can_be_searched_and_filtered(world, admin):
    services.disable_account(actor=world.sysadmin_user, user=world.owner_user)

    assert admin.get(ACCOUNTS, {"search": "senna"}).json()["count"] == 1
    assert admin.get(ACCOUNTS, {"search": "EMPLOYEE.A"}).json()["count"] == 2
    assert admin.get(ACCOUNTS, {"role": "sysadmin"}).json()["count"] == 1
    disabled = admin.get(ACCOUNTS, {"state": "disabled"}).json()
    assert [row["email"] for row in disabled["results"]] == ["employee.a1@impactrisks.com"]
    assert admin.get(ACCOUNTS, {"state": "active"}).json()["count"] == 7


def test_the_search_finds_an_account_by_its_employees_current_name(world, admin):
    # Amal Employee becomes Zineb Zarrouk: the account keeps the name copied when it was created.
    world.owner.first_name, world.owner.last_name = "Zineb", "Zarrouk"
    world.owner.save(update_fields=["first_name", "last_name"])

    def found(term):
        return [row["email"] for row in admin.get(ACCOUNTS, {"search": term}).json()["results"]]

    assert found("zineb zarr") == [world.owner_user.email]
    assert found("Amal") == [world.owner_user.email]  # the stored name still matches, as before
    assert found("employee.a1@") == [world.owner_user.email]
    assert found("sonia admin") == [world.sysadmin_user.email]  # no employee record: its own name


@pytest.mark.parametrize("query", [{"state": "sleeping"}, {"role": "manager"}])
def test_an_unknown_filter_value_is_refused(admin, query):
    response = admin.get(ACCOUNTS, query)

    assert response.status_code == 400
    assert response.json()["code"] == "core.validation"


def test_the_detail_shows_who_gave_each_role_and_the_recent_security_events(world, admin):
    services.assign_role(actor=world.sysadmin_user, user=world.owner_user, role="exec")

    body = admin.get(url(world.owner_user)).json()

    assert set(body) == DETAIL_KEYS
    assert body["roles"] == ["employee", "exec"]
    assert len(body["role_assignments"]) == 1
    assignment = body["role_assignments"][0]
    assert set(assignment) == {"role", "assigned_by", "assigned_at"}
    assert (assignment["role"], assignment["assigned_by"]) == ("exec", "Sonia Admin")
    assert [event["action"] for event in body["recent_events"]] == ["role.assigned"]
    assert body["recent_events"][0]["actor"] == "Sonia Admin"
    assert body["failed_attempts"] == 0
    assert body["locked_until"] is None
    assert body["previous_login_at"] is None
    assert body["created_by"] is None
    assert body["created_at"] is not None


def test_an_unknown_account_is_not_available(admin):
    missing = uuid.uuid4()

    assert admin.get(f"{ACCOUNTS}/{missing}").status_code == 404
    assert admin.post(f"{ACCOUNTS}/{missing}/disable").json()["code"] == "core.not_found"


def test_an_executive_reads_accounts_but_changes_nothing(world, client_for):
    executive = client_for(world.exec_user)

    assert executive.get(ACCOUNTS).status_code == 200
    assert executive.get(url(world.owner_user)).status_code == 200
    assert executive.get(CANDIDATES).status_code == 403
    assert executive.post(ACCOUNTS, {"email": "x@impactrisks.com", "full_name": "X"}).status_code == 403
    assert executive.post(url(world.owner_user, "/disable")).status_code == 403
    assert executive.post(url(world.owner_user, "/reset-password")).status_code == 403


def test_other_roles_and_anonymous_callers_see_no_account(world, client_for, anon_client):
    assert client_for(world.hr_user).get(ACCOUNTS).status_code == 403
    assert client_for(world.owner_user).get(url(world.owner_user)).status_code == 403
    assert anon_client.get(ACCOUNTS).status_code == 401


# --- creating (UI 9.3) ---


def test_creating_an_account_shows_the_temporary_password_once(world, client_for):
    with time_machine.travel(START, tick=False):
        admin = client_for(world.sysadmin_user)
        response = admin.post(
            ACCOUNTS, {"email": "Leila.Admin@impactrisks.com", "full_name": "Leila Admin", "roles": ["exec"]}
        )
        body = response.json()
        signed_in = APIClient().post(
            LOGIN, {"email": "leila.admin@impactrisks.com", "password": body["temporary_password"]}
        )
        detail = admin.get(f"{ACCOUNTS}/{body['account']['public_id']}").json()
        listing = admin.get(ACCOUNTS).json()

    assert response.status_code == 201
    assert set(body) == {"account", "temporary_password", "expires_at"}
    assert set(body["account"]) == ROW_KEYS
    assert body["account"]["email"] == "leila.admin@impactrisks.com"
    assert body["account"]["name"] == "Leila Admin"
    assert body["account"]["state"] == "awaiting_first_sign_in"
    assert body["account"]["roles"] == ["exec"]
    assert datetime.fromisoformat(body["expires_at"]) == START + timedelta(hours=24)
    assert signed_in.status_code == 200
    assert signed_in.json()["must_change_password"] is True
    assert body["temporary_password"] not in json.dumps(detail) + json.dumps(listing)
    assert detail["created_by"] == "Sonia Admin"


def test_creating_an_account_for_an_employee_record(world, admin, directory):
    employee_id = str(uuid.uuid4())
    directory.add(employee_id, "Yasmine Trabelsi", "yasmine.trabelsi@impactrisks.com")
    assert admin.get(CANDIDATES).json() == [
        {
            "public_id": employee_id,
            "full_name": "Yasmine Trabelsi",
            "email": "yasmine.trabelsi@impactrisks.com",
        }
    ]

    response = admin.post(ACCOUNTS, {"employee": employee_id, "roles": []})

    assert response.status_code == 201
    account = response.json()["account"]
    assert (account["email"], account["name"]) == ("yasmine.trabelsi@impactrisks.com", "Yasmine Trabelsi")
    assert account["has_employee"] is True
    assert admin.get(CANDIDATES).json() == []


@pytest.mark.parametrize(
    ("payload", "status", "code", "field"),
    [
        ({"email": "leila@gmail.com", "full_name": "Leila"}, 400, "auth.domain_not_allowed", "email"),
        ({"email": "employee.a1@impactrisks.com", "full_name": "Twin"}, 409, "accounts.email_taken", "email"),
        (
            {"email": "both@impactrisks.com", "full_name": "Both", "roles": ["hr", "sysadmin"]},
            400,
            "accounts.roles_incompatible",
            "roles",
        ),
        ({"full_name": "No Email"}, 400, "accounts.subject_required", "email"),
        ({"email": "noname@impactrisks.com"}, 400, "accounts.subject_required", "full_name"),
        ({"employee": "0f0e0d0c-0000-4000-8000-000000000009"}, 400, "accounts.employee_unknown", "employee"),
        (
            {"email": "m@impactrisks.com", "full_name": "M", "roles": ["manager"]},
            400,
            "core.validation",
            "roles.0",
        ),
    ],
)
def test_each_reason_an_account_cannot_be_created_is_explained(world, admin, payload, status, code, field):
    response = admin.post(ACCOUNTS, payload)

    assert response.status_code == status
    assert response.json()["code"] == code
    assert response.json()["errors"][0]["field"] == field


def test_an_employee_who_already_has_an_account_is_explained(world, admin, directory):
    employee_id = str(uuid.uuid4())
    directory.add(employee_id, "Amal Employee", "employee.a1@impactrisks.com")

    response = admin.post(ACCOUNTS, {"employee": employee_id})

    assert response.status_code == 409
    assert response.json()["code"] == "accounts.employee_has_account"


# --- passwords, roles and state ---


def test_resetting_a_password_returns_a_new_temporary_one(world, admin):
    response = admin.post(url(world.owner_user, "/reset-password"))
    body = response.json()

    assert response.status_code == 200
    assert set(body) == {"temporary_password", "expires_at"}
    signed_in = APIClient().post(
        LOGIN, {"email": world.owner_user.email, "password": body["temporary_password"]}
    )
    assert signed_in.json()["must_change_password"] is True
    assert signed_in.json()["password_reset"]["by"] == "Sonia Admin"
    event = AuditEvent.objects.get(action="auth.password_reset")
    assert event.actor == world.sysadmin_user


def test_roles_are_added_and_removed(world, admin):
    added = admin.post(url(world.owner_user, "/roles"), {"role": "exec"})
    assert added.status_code == 200
    assert set(added.json()) == DETAIL_KEYS
    assert added.json()["roles"] == ["employee", "exec"]

    removed = admin.delete(url(world.owner_user, "/roles/exec"))
    assert removed.status_code == 200
    assert removed.json()["roles"] == ["employee"]
    assert removed.json()["role_assignments"] == []


@pytest.mark.parametrize("role", ["hr", "manager", "employee", "chief"])
def test_removing_a_role_that_is_not_held_or_cannot_be_held_is_not_found(world, admin, role):
    assert admin.delete(url(world.owner_user, f"/roles/{role}")).status_code == 404


def test_an_unknown_role_cannot_be_added(world, admin):
    response = admin.post(url(world.owner_user, "/roles"), {"role": "manager"})

    assert response.status_code == 400
    assert response.json()["errors"][0]["field"] == "role"


def test_the_administrators_slips_are_refused_with_a_reason(world, admin):
    me = world.sysadmin_user

    hr_and_admin = admin.post(url(world.hr_user, "/roles"), {"role": "sysadmin"})
    own_role = admin.post(url(me, "/roles"), {"role": "exec"})
    own_removal = admin.delete(url(me, "/roles/sysadmin"))
    own_disable = admin.post(url(me, "/disable"))
    own_reset = admin.post(url(me, "/reset-password"))

    assert hr_and_admin.json()["code"] == "accounts.roles_incompatible"
    assert hr_and_admin.json()["errors"][0]["field"] == "role"
    for response in (own_role, own_removal, own_disable, own_reset):
        assert response.status_code == 400
        assert response.json()["code"] == "accounts.cannot_change_self"
    assert admin.get(url(me)).json()["roles"] == ["sysadmin"]
    assert admin.get(url(me)).json()["state"] == "active"


def test_disabling_enabling_and_unlocking(world, admin):
    owner = world.owner_user

    assert admin.get(url(owner)).json()["can_enable"] is False
    disabled = admin.post(url(owner, "/disable")).json()
    assert (disabled["state"], disabled["can_enable"]) == ("disabled", True)
    assert admin.post(url(owner, "/enable")).json()["state"] == "active"

    owner.refresh_from_db()
    owner.failed_attempts = 0
    owner.locked_until = datetime.now(tz=UTC) + timedelta(minutes=10)
    owner.save(update_fields=["failed_attempts", "locked_until"])
    assert admin.get(url(owner)).json()["state"] == "locked"

    unlocked = admin.post(url(owner, "/unlock"))
    assert unlocked.status_code == 200
    assert unlocked.json()["state"] == "active"
    assert unlocked.json()["locked_until"] is None


def test_every_change_is_in_the_security_log_with_the_administrator_and_the_address(world, admin):
    created = admin.post(ACCOUNTS, {"email": "new.person@impactrisks.com", "full_name": "New Person"})
    admin.post(url(world.owner_user, "/disable"))

    events = {event.action: event for event in AuditEvent.objects.filter(category="security")}
    assert {"account.created", "account.disabled"} <= set(events)
    for action in ("account.created", "account.disabled"):
        assert events[action].actor == world.sysadmin_user
        assert events[action].ip_address == "127.0.0.1"
        assert len(events[action].request_id) == 32
    assert events["account.created"].request_id == created["X-Request-ID"]
