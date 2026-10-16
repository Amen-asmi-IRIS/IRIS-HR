"""Review Focus 5: a setting given a wrong value is refused, the old value stays, and nothing else breaks."""

from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.settings import services as settings_service
from apps.settings.models import Setting
from apps.settings.tests.world import TEST_HR_FLAG

pytestmark = pytest.mark.django_db

HR = "/api/v1/settings/hr"
SYSTEM = "/api/v1/settings/system"
ROW_KEYS = {"key", "kind", "value", "default", "minimum", "maximum", "choices", "updated_by", "updated_at"}


def test_the_administrator_reads_the_system_settings(world, client_for):
    response = client_for(world.sysadmin_user).get(SYSTEM)
    rows = response.json()

    assert response.status_code == 200
    assert [row["key"] for row in rows] == [
        "session_timeout_minutes",
        "lockout_threshold",
        "lockout_minutes",
        "login_ip_max_attempts",
        "temp_password_hours",
        "upload_max_mb",
        "upload_allowed_types",
    ]
    assert rows[0] == {
        "key": "session_timeout_minutes",
        "kind": "int",
        "value": 120,
        "default": 120,
        "minimum": 5,
        "maximum": 1440,
        "choices": None,
        "updated_by": None,
        "updated_at": None,
    }
    assert rows[6]["value"] == ["pdf", "jpg", "png"]
    assert rows[6]["choices"] == ["pdf", "jpg", "png"]
    assert (rows[6]["minimum"], rows[6]["maximum"]) == (None, None)


def test_hr_reads_the_hr_settings(world, client_for):
    rows = {row["key"]: row for row in client_for(world.hr_user).get(HR).json()}

    assert set(rows[TEST_HR_FLAG]) == ROW_KEYS
    assert rows[TEST_HR_FLAG]["value"] is False
    assert (rows["test_hr_rate"]["kind"], rows["test_hr_rate"]["value"]) == ("decimal", "2.5")
    assert (rows["test_hr_rate"]["minimum"], rows["test_hr_rate"]["maximum"]) == ("0", "10")
    assert rows["test_hr_start"]["value"] is None
    assert "lockout_threshold" not in rows


def test_each_group_is_read_by_its_role_and_by_executives(world, client_for, anon_client):
    assert client_for(world.hr_user).get(SYSTEM).status_code == 403
    assert client_for(world.sysadmin_user).get(HR).status_code == 403
    assert client_for(world.owner_user).get(HR).status_code == 403
    assert client_for(world.exec_user).get(HR).status_code == 200
    assert client_for(world.exec_user).get(SYSTEM).status_code == 200
    assert anon_client.get(SYSTEM).status_code == 401


def test_executives_read_but_do_not_change(world, client_for):
    executive = client_for(world.exec_user)

    assert executive.put(f"{SYSTEM}/lockout_threshold", {"value": 6}).status_code == 403
    assert executive.put(f"{HR}/{TEST_HR_FLAG}", {"value": True}).status_code == 403
    assert not Setting.objects.exists()


def test_the_administrator_changes_a_system_setting(world, client_for):
    response = client_for(world.sysadmin_user).put(f"{SYSTEM}/lockout_threshold", {"value": 6})
    row = response.json()

    assert response.status_code == 200
    assert set(row) == ROW_KEYS
    assert (row["key"], row["value"], row["default"]) == ("lockout_threshold", 6, 5)
    assert row["updated_by"] == "Sonia Admin"
    assert row["updated_at"] is not None
    assert settings_service.get("lockout_threshold") == 6
    event = AuditEvent.objects.get(action="setting.changed")
    assert (event.category, event.actor, event.object_id) == (
        "security",
        world.sysadmin_user,
        "lockout_threshold",
    )
    assert event.changes == {"value": {"before": 5, "after": 6}}
    assert event.ip_address == "127.0.0.1"


def test_hr_changes_hr_settings_of_every_kind(world, client_for):
    client = client_for(world.hr_user)

    assert client.put(f"{HR}/test_hr_rate", {"value": "3.50"}).json()["value"] == "3.5"
    assert client.put(f"{HR}/{TEST_HR_FLAG}", {"value": True}).json()["value"] is True
    assert client.put(f"{HR}/test_hr_days", {"value": [7, 1]}).json()["value"] == [1, 7]
    assert client.put(f"{HR}/test_hr_start", {"value": "2026-11-01"}).json()["value"] == "2026-11-01"
    assert client.put(f"{HR}/test_hr_cutoff", {"value": 25}).json()["value"] == 25
    assert client.put(f"{HR}/test_hr_cutoff", {"value": None}).json()["value"] is None

    assert settings_service.get("test_hr_rate") == Decimal("3.5")
    assert settings_service.get("test_hr_cutoff") is None
    assert AuditEvent.objects.filter(action="setting.changed", category="business").count() == 6


@pytest.mark.parametrize(
    ("value", "code"),
    [
        ("many", "settings.invalid_value"),
        (True, "settings.invalid_value"),
        (5.5, "settings.invalid_value"),
        (None, "settings.invalid_value"),
        ([5], "settings.invalid_value"),
        (2, "settings.out_of_range"),
        (500, "settings.out_of_range"),
    ],
)
def test_a_wrong_value_is_refused_next_to_its_input_and_the_old_value_stays(world, client_for, value, code):
    response = client_for(world.sysadmin_user).put(f"{SYSTEM}/lockout_threshold", {"value": value})

    assert response.status_code == 400
    assert response.json()["code"] == code
    assert response.json()["errors"][0]["field"] == "value"
    assert settings_service.get("lockout_threshold") == 5
    assert not Setting.objects.exists()
    assert not AuditEvent.objects.filter(action="setting.changed").exists()


def test_the_range_is_named_in_the_message(world, client_for):
    world.sysadmin_user.language = "en"
    world.sysadmin_user.save(update_fields=["language"])

    body = client_for(world.sysadmin_user).put(f"{SYSTEM}/lockout_threshold", {"value": 500}).json()

    assert body["detail"] == "The value must be between 3 and 20."
    assert body["errors"][0]["params"] == {"minimum": 3, "maximum": 20}


def test_a_request_without_value_is_refused(world, client_for):
    response = client_for(world.sysadmin_user).put(f"{SYSTEM}/lockout_threshold", {})

    assert response.status_code == 400
    assert response.json()["code"] == "core.validation"
    assert response.json()["errors"][0]["field"] == "value"


def test_an_unknown_key_is_not_found(world, client_for):
    response = client_for(world.sysadmin_user).put(f"{SYSTEM}/no_such_setting", {"value": 1})

    assert response.status_code == 404
    assert response.json()["code"] == "settings.unknown_key"


def test_a_key_of_the_other_group_is_not_found_here(world, client_for):
    as_admin = client_for(world.sysadmin_user).put(f"{SYSTEM}/{TEST_HR_FLAG}", {"value": True})
    as_hr = client_for(world.hr_user).put(f"{HR}/lockout_threshold", {"value": 6})

    assert as_admin.status_code == 404
    assert as_hr.status_code == 404
    assert as_hr.json()["code"] == "settings.unknown_key"
    assert not Setting.objects.exists()


def test_after_a_refused_value_sign_in_still_follows_the_old_setting(world, client_for, anon_client):
    client_for(world.sysadmin_user).put(f"{SYSTEM}/lockout_threshold", {"value": "many"})

    codes = [
        anon_client.post("/api/v1/auth/login", {"email": world.owner_user.email, "password": "wrong"}).json()[
            "code"
        ]
        for _ in range(5)
    ]

    assert codes == ["auth.invalid_credentials"] * 4 + ["auth.locked"]
