from datetime import date
from decimal import Decimal

import pytest

from apps.core.errors import DomainError, NotFound
from apps.settings import registry
from apps.settings.registry import SettingDef

TYPES = ("pdf", "jpg", "png")


def definition(kind, default, minimum=None, maximum=None, choices=None) -> SettingDef:
    return SettingDef("sample", "hr", kind, default, minimum, maximum, choices)


INT = definition("int", 5, 1, 10)
BOOL = definition("bool", False)
RATE = definition("decimal", Decimal("2.5"), 0, 10)
DAYS = definition("weekdays", [1, 2, 3, 4, 5])
KINDS = definition("str_list", ["pdf"], choices=TYPES)
WORDS = definition("str_list", [])
CUTOFF = definition("int_or_null", None, 1, 28)
START = definition("date_or_null", None)


@pytest.mark.parametrize(
    ("defn", "raw", "stored"),
    [
        (INT, 7, 7),
        (BOOL, True, True),
        (RATE, "3.50", "3.5"),
        (RATE, 2, "2"),
        (RATE, "2,5", "2.5"),
        (RATE, Decimal("10"), "10"),
        (DAYS, [5, 1, 3], [1, 3, 5]),
        (KINDS, ["PDF", " jpg "], ["pdf", "jpg"]),
        (WORDS, [], []),
        (CUTOFF, None, None),
        (CUTOFF, 25, 25),
        (START, None, None),
        (START, "2026-11-01", "2026-11-01"),
        (START, date(2026, 11, 1), "2026-11-01"),
    ],
)
def test_a_valid_value_is_normalised_for_storage(defn, raw, stored):
    assert registry.to_storage(defn, raw) == stored


@pytest.mark.parametrize(
    ("defn", "raw"),
    [
        (INT, "7"),
        (INT, True),
        (INT, 7.5),
        (INT, None),
        (BOOL, 1),
        (BOOL, "true"),
        (RATE, "abc"),
        (RATE, True),
        (RATE, None),
        (RATE, "NaN"),
        (DAYS, []),
        (DAYS, [0]),
        (DAYS, [8]),
        (DAYS, [1, 1]),
        (DAYS, "12345"),
        (DAYS, [1, "2"]),
        (KINDS, ["exe"]),
        (KINDS, []),
        (KINDS, "pdf"),
        (KINDS, ["pdf", "PDF"]),
        (WORDS, [""]),
        (WORDS, [3]),
        (CUTOFF, "3"),
        (CUTOFF, False),
        (START, "01/11/2026"),
        (START, 20261101),
        (START, "2026-13-01"),
    ],
)
def test_a_value_of_the_wrong_shape_is_refused(defn, raw):
    with pytest.raises(DomainError) as error:
        registry.to_storage(defn, raw)

    assert error.value.code == "settings.invalid_value"
    assert error.value.field == "value"


@pytest.mark.parametrize(
    ("defn", "raw"),
    [(INT, 0), (INT, 11), (RATE, "10.5"), (RATE, -1), (CUTOFF, 0), (CUTOFF, 29)],
)
def test_a_value_outside_the_range_is_refused(defn, raw):
    with pytest.raises(DomainError) as error:
        registry.to_storage(defn, raw)

    assert error.value.code == "settings.out_of_range"
    assert error.value.field == "value"
    assert error.value.params == {"minimum": defn.minimum, "maximum": defn.maximum}


def test_stored_values_come_back_typed():
    assert registry.to_python(RATE, "3.5") == Decimal("3.5")
    assert registry.to_python(START, "2026-11-01") == date(2026, 11, 1)
    assert registry.to_python(START, None) is None
    assert registry.to_python(INT, 7) == 7
    assert registry.to_python(DAYS, [1, 3]) == [1, 3]


@pytest.mark.parametrize(
    "bad",
    [
        SettingDef("x", "finance", "int", 1),
        SettingDef("x", "hr", "colour", 1),
        SettingDef("x", "hr", "int", "five"),
        SettingDef("x", "hr", "int", 50, 1, 10),
        SettingDef("x", "hr", "int", 5, 1),
        SettingDef("x", "hr", "int", 5, None, 10),
        SettingDef("x", "hr", "int", 5, choices=("a",)),
    ],
)
def test_a_wrong_definition_is_refused_at_start_up(bad):
    with pytest.raises(ValueError):
        registry.register(bad)


def test_registering_the_same_definition_again_is_accepted_but_not_a_different_one():
    registry.register(SettingDef("lockout_threshold", "system", "int", 5, 3, 20))

    with pytest.raises(ValueError, match="lockout_threshold"):
        registry.register(SettingDef("lockout_threshold", "system", "int", 6, 3, 20))


def test_an_unknown_key_is_not_found():
    with pytest.raises(NotFound) as error:
        registry.get_def("no_such_setting")

    assert error.value.code == "settings.unknown_key"
    assert error.value.field == "key"


def test_the_system_settings_of_the_master_plan_are_registered():
    system = registry.defs_for("system")

    assert [(d.key, d.kind, d.default) for d in system] == [
        ("session_timeout_minutes", "int", 120),
        ("lockout_threshold", "int", 5),
        ("lockout_minutes", "int", 15),
        ("login_ip_max_attempts", "int", 20),
        ("temp_password_hours", "int", 24),
        ("upload_max_mb", "int", 10),
        ("upload_allowed_types", "str_list", ["pdf", "jpg", "png"]),
    ]
    assert all(d.group == "system" for d in system)
