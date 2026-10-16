from datetime import date
from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import DomainError, NotAllowed
from apps.settings import services as settings_service
from apps.settings.models import Setting
from apps.settings.tests.world import TEST_HR_FLAG

pytestmark = pytest.mark.django_db


def test_a_setting_has_its_default_until_someone_changes_it():
    assert settings_service.get("session_timeout_minutes") == 120
    assert settings_service.get("lockout_threshold") == 5
    assert settings_service.get("upload_allowed_types") == ["pdf", "jpg", "png"]
    assert settings_service.get("test_hr_rate") == Decimal("2.5")
    assert settings_service.get("test_hr_start") is None
    assert settings_service.get(TEST_HR_FLAG) is False


def test_a_changed_value_is_returned_with_its_type(world):
    settings_service.set_value(actor=world.sysadmin_user, key="lockout_threshold", value=3)
    settings_service.set_value(actor=world.hr_user, key="test_hr_rate", value="3.50")
    settings_service.set_value(actor=world.hr_user, key="test_hr_start", value="2026-11-01")
    settings_service.set_value(actor=world.hr_user, key="test_hr_days", value=[7, 1, 2])

    assert settings_service.get("lockout_threshold") == 3
    assert settings_service.get("test_hr_rate") == Decimal("3.5")
    assert settings_service.get("test_hr_start") == date(2026, 11, 1)
    assert settings_service.get("test_hr_days") == [1, 2, 7]


def test_an_optional_value_can_be_emptied_again(world):
    settings_service.set_value(actor=world.hr_user, key="test_hr_cutoff", value=25)
    assert settings_service.get("test_hr_cutoff") == 25

    settings_service.set_value(actor=world.hr_user, key="test_hr_cutoff", value=None)
    assert settings_service.get("test_hr_cutoff") is None


def test_every_change_is_audited_with_the_previous_and_the_new_value(world):
    settings_service.set_value(actor=world.sysadmin_user, key="lockout_minutes", value=30)
    settings_service.set_value(actor=world.sysadmin_user, key="lockout_minutes", value=45)
    settings_service.set_value(actor=world.hr_user, key=TEST_HR_FLAG, value=True)

    second, first = AuditEvent.objects.filter(object_id="lockout_minutes")
    assert (first.action, first.category, first.object_type) == ("setting.changed", "security", "setting")
    assert first.actor == world.sysadmin_user
    assert first.changes == {"value": {"before": 15, "after": 30}}
    assert second.changes == {"value": {"before": 30, "after": 45}}
    hr_event = AuditEvent.objects.get(object_id=TEST_HR_FLAG)
    assert hr_event.category == "business"
    assert hr_event.actor == world.hr_user
    assert hr_event.changes == {"value": {"before": False, "after": True}}


def test_the_row_records_who_changed_it_and_when(world):
    row = settings_service.set_value(actor=world.sysadmin_user, key="upload_max_mb", value=20)

    assert row.updated_by == world.sysadmin_user
    assert row.updated_at is not None
    assert Setting.objects.get(key="upload_max_mb").value == {"v": 20}


@pytest.mark.parametrize(
    ("persona", "key", "value"),
    [
        ("hr", "lockout_threshold", 6),
        ("exec", "lockout_threshold", 6),
        ("owner", "lockout_threshold", 6),
        ("sysadmin", TEST_HR_FLAG, True),
        ("exec", TEST_HR_FLAG, True),
        ("owner", TEST_HR_FLAG, True),
    ],
)
def test_only_the_role_that_owns_a_group_can_change_it(world, persona, key, value):
    with pytest.raises(NotAllowed):
        settings_service.set_value(actor=world.user_for(persona), key=key, value=value)

    assert not Setting.objects.exists()
    assert not AuditEvent.objects.filter(action="setting.changed").exists()


@pytest.mark.parametrize(
    ("key", "value", "code"),
    [
        ("lockout_threshold", "many", "settings.invalid_value"),
        ("lockout_threshold", True, "settings.invalid_value"),
        ("lockout_threshold", 2, "settings.out_of_range"),
        ("lockout_threshold", 500, "settings.out_of_range"),
        ("upload_allowed_types", ["exe"], "settings.invalid_value"),
        ("no_such_setting", 1, "settings.unknown_key"),
    ],
)
def test_a_wrong_value_is_refused_and_the_old_value_stays(world, key, value, code):
    with pytest.raises(DomainError) as error:
        settings_service.set_value(actor=world.sysadmin_user, key=key, value=value)

    assert error.value.code == code
    assert settings_service.get("lockout_threshold") == 5
    assert settings_service.get("upload_allowed_types") == ["pdf", "jpg", "png"]
    assert not Setting.objects.exists()
    assert not AuditEvent.objects.filter(action="setting.changed").exists()


def test_values_are_cached_for_thirty_seconds(monkeypatch):
    clock = {"now": 1000.0}
    monkeypatch.setattr(settings_service, "_clock", lambda: clock["now"])
    assert settings_service.get("lockout_minutes") == 15
    Setting.objects.create(key="lockout_minutes", value={"v": 45})  # as if another process had changed it

    clock["now"] += 29
    assert settings_service.get("lockout_minutes") == 15
    clock["now"] += 2
    assert settings_service.get("lockout_minutes") == 45


def test_clear_cache_forces_a_fresh_read():
    assert settings_service.get("lockout_minutes") == 15
    Setting.objects.create(key="lockout_minutes", value={"v": 45})

    settings_service.clear_cache()

    assert settings_service.get("lockout_minutes") == 45


def test_a_corrupt_stored_value_falls_back_to_the_default():
    Setting.objects.create(key="lockout_threshold", value={"v": "many"})

    assert settings_service.get("lockout_threshold") == 5


def test_list_group_describes_every_setting_of_the_group(world):
    settings_service.set_value(actor=world.sysadmin_user, key="lockout_threshold", value=6)

    rows = settings_service.list_group("system")

    assert [row.key for row in rows] == [
        "session_timeout_minutes",
        "lockout_threshold",
        "lockout_minutes",
        "login_ip_max_attempts",
        "temp_password_hours",
        "upload_max_mb",
        "upload_allowed_types",
    ]
    untouched, changed = rows[0], rows[1]
    assert (untouched.kind, untouched.value, untouched.default) == ("int", 120, 120)
    assert (untouched.minimum, untouched.maximum) == (5, 1440)
    assert untouched.updated_by_name is None
    assert untouched.updated_at is None
    assert (changed.value, changed.default) == (6, 5)
    assert changed.updated_by_name == "Sonia Admin"
    assert changed.updated_at is not None
    assert rows[6].choices == ["pdf", "jpg", "png"]
    assert rows[0].choices is None


def test_decimals_and_dates_are_listed_in_their_stored_form(world):
    rows = {row.key: row for row in settings_service.list_group("hr")}

    rate = rows["test_hr_rate"]
    assert (rate.kind, rate.value, rate.default, rate.minimum, rate.maximum) == (
        "decimal",
        "2.5",
        "2.5",
        "0",
        "10",
    )
    assert rows["test_hr_start"].value is None
    assert rows["test_hr_days"].value == [1, 2, 3, 4, 5]


def test_row_for_returns_one_described_setting(world):
    settings_service.set_value(actor=world.sysadmin_user, key="upload_max_mb", value=20)

    row = settings_service.row_for("upload_max_mb")

    assert (row.key, row.value, row.default) == ("upload_max_mb", 20, 10)


def test_an_unknown_group_is_a_programming_error():
    with pytest.raises(ValueError):
        settings_service.list_group("finance")
