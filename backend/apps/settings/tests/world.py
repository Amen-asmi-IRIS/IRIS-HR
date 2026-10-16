"""Settings that exist only in the test suite: no HR setting is registered before plan 03a."""

from decimal import Decimal

from apps.settings.registry import SettingDef, register

TEST_HR_FLAG = "test_hr_flag"

TEST_DEFS = [
    SettingDef(TEST_HR_FLAG, "hr", "bool", False),
    SettingDef("test_hr_rate", "hr", "decimal", Decimal("2.5"), Decimal("0"), Decimal("10")),
    SettingDef("test_hr_days", "hr", "weekdays", [1, 2, 3, 4, 5]),
    SettingDef("test_hr_start", "hr", "date_or_null", None),
    SettingDef("test_hr_cutoff", "hr", "int_or_null", None, 1, 28),
]

for _definition in TEST_DEFS:
    register(_definition)
