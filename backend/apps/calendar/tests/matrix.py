import datetime as dt

from apps.calendar.models import PublicHoliday
from tests.matrix import Case, P, only

STAFF = (P.OWNER, P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC)


def _holiday(world) -> PublicHoliday:
    holiday, _ = PublicHoliday.objects.get_or_create(
        date=dt.date(2031, 1, 1), defaults={"name_fr": "Jour de l'an", "name_en": "New Year's Day"}
    )
    return holiday


CASES = [
    Case("calendar:holiday-list", "GET", only(*STAFF)),
    Case(
        "calendar:holiday-list",
        "POST",
        only(P.HR),
        body=lambda w: {"date": "2031-05-01", "name_fr": "Fête du Travail", "name_en": "Labour Day"},
    ),
    Case(
        "calendar:holiday-detail",
        "PATCH",
        only(P.HR),
        kwargs=lambda w: {"pk": _holiday(w).pk},
        body=lambda w: {"name_en": "New Year"},
    ),
    Case("calendar:holiday-detail", "DELETE", only(P.HR), kwargs=lambda w: {"pk": _holiday(w).pk}),
    Case("calendar:holiday-copy", "POST", only(P.HR), body=lambda w: {"from_year": 2031, "to_year": 2032}),
    Case("calendar:holiday-impact", "GET", only(P.HR), query=lambda w: {"date": "2031-01-01"}),
]

_NOVEMBER = {"from": "2026-11-01", "to": "2026-11-30"}

CASES += [
    Case(
        "calendar:feed",
        "GET",
        only(*STAFF),
        label="department scope",
        query=lambda w: {**_NOVEMBER, "scope": "department"},
    ),
    Case(
        "calendar:feed",
        "GET",
        only(P.MANAGER, P.OTHER_MANAGER, P.EXEC),
        label="team scope",
        query=lambda w: {**_NOVEMBER, "scope": "team"},
    ),
    Case(
        "calendar:feed",
        "GET",
        only(P.HR, P.EXEC),
        label="company scope",
        query=lambda w: {**_NOVEMBER, "scope": "company"},
    ),
]
