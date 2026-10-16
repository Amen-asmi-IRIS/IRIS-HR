from apps.settings.tests.world import TEST_HR_FLAG
from tests.matrix import Case, P, only

CASES = [
    Case("settings:hr", "GET", only(P.HR, P.EXEC)),
    Case(
        "settings:hr-item",
        "PUT",
        only(P.HR),
        kwargs=lambda world: {"key": TEST_HR_FLAG},
        body=lambda world: {"value": True},
    ),
    Case("settings:system", "GET", only(P.SYSADMIN, P.EXEC)),
    Case(
        "settings:system-item",
        "PUT",
        only(P.SYSADMIN),
        kwargs=lambda world: {"key": "lockout_threshold"},
        body=lambda world: {"value": 6},
    ),
]
