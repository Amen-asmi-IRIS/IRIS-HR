from tests.matrix import SIGNED_IN, Case, P, only

EVERY_EMPLOYEE = (P.OWNER, P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC)

CASES = [
    Case("reports:home-me", "GET", only(*EVERY_EMPLOYEE)),
    Case("reports:home-team", "GET", only(P.MANAGER, P.OTHER_MANAGER, P.EXEC)),
    Case("reports:home-overview", "GET", only(P.EXEC)),
    Case("reports:workspace-summary", "GET", only(*SIGNED_IN)),
]


NOVEMBER_2026 = {"from": "2026-11-01", "to": "2026-11-30"}

CASES += [
    Case(
        route="reports:report-filters",
        method="GET",
        expect=only(P.MANAGER, P.OTHER_MANAGER, P.HR, P.EXEC),
        label="filter options: managers, HR, executives",
    ),
    Case(
        route="reports:report",
        method="GET",
        expect=only(P.MANAGER, P.OTHER_MANAGER, P.HR, P.EXEC),
        kwargs=lambda w: {"name": "absences"},
        query=lambda w: NOVEMBER_2026,
        label="a report: managers for their team, HR and executives for everyone",
    ),
    Case(
        route="reports:report",
        method="GET",
        expect=only(P.OTHER_MANAGER, P.HR, P.EXEC, hide=[P.MANAGER]),
        kwargs=lambda w: {"name": "absences"},
        query=lambda w: {**NOVEMBER_2026, "employee": str(w.outsider.public_id)},
        label="a report on someone outside the manager's team is hidden",
    ),
    Case(
        route="reports:report",
        method="GET",
        expect=only(P.HR),
        kwargs=lambda w: {"name": "certificates"},
        label="outstanding certificates: HR only",
    ),
    Case(
        route="reports:kpmg-export",
        method="GET",
        expect=only(P.HR),
        query=lambda w: NOVEMBER_2026,
        label="KPMG export: HR only",
    ),
    Case(
        route="reports:kpmg-default-period",
        method="GET",
        expect=only(P.HR),
        label="KPMG default period: HR only",
    ),
]
