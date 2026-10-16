from datetime import date

import pytest

from apps.core.errors import DomainError, NotAllowed, NotFound
from apps.organisation import selectors as organisation_selectors
from apps.organisation import services as organisation_services
from apps.reports.tabular import framework
from apps.reports.tabular.framework import (
    People,
    ReportParams,
    col,
    employees_in_scope,
    parse_params,
    resolve_scope,
)

pytestmark = pytest.mark.django_db

TODAY = date(2026, 12, 1)
NO_PERIOD = frozenset({"on", "year", "department", "employee", "type", "step"})


def _ids(user, params, *, include_archived=False):
    return {employee.id for employee in employees_in_scope(user, params, include_archived=include_archived)}


# --- scope ---------------------------------------------------------------


def test_scope_defaults_to_the_widest_the_user_holds(world):
    assert resolve_scope(world.hr_user, None) == "all"
    assert resolve_scope(world.exec_user, None) == "all"
    assert resolve_scope(world.manager_user, None) == "team"


def test_an_executive_who_manages_people_may_ask_for_the_team(world):
    assert resolve_scope(world.exec_user, "team") == "team"


def test_scope_all_is_refused_to_a_manager(world):
    with pytest.raises(NotAllowed) as refused:
        resolve_scope(world.manager_user, "all")
    assert refused.value.code == "reports.scope_not_allowed"


def test_scope_team_is_refused_to_someone_who_manages_nobody(world):
    with pytest.raises(NotAllowed) as refused:
        resolve_scope(world.hr_user, "team")
    assert refused.value.code == "reports.scope_not_allowed"


def test_unknown_scope_is_a_problem_on_the_scope_field(world):
    with pytest.raises(DomainError) as refused:
        resolve_scope(world.hr_user, "everyone")
    assert refused.value.code == "reports.unknown_scope"
    assert refused.value.problems[0].field == "scope"


# --- parameters ----------------------------------------------------------


def test_period_is_parsed_and_other_dates_default_to_today(world):
    params = parse_params(
        {"from": "2026-11-01", "to": "2026-11-30"},
        user=world.hr_user,
        accepts=frozenset({"period", "on", "year"}),
        today=TODAY,
    )

    assert (params.start, params.end) == (date(2026, 11, 1), date(2026, 11, 30))
    assert params.on == TODAY
    assert params.year == 2026


@pytest.mark.parametrize(
    ("query", "code", "field"),
    [
        ({}, "reports.period_required", "from"),
        ({"from": "2026-11-01"}, "reports.period_required", "to"),
        ({"from": "2026-11-30", "to": "2026-11-01"}, "reports.period_order", "to"),
        ({"from": "2016-01-01", "to": "2026-01-01"}, "reports.period_too_long", "to"),
        ({"from": "2026-02-30", "to": "2026-03-01"}, "reports.invalid_date", "from"),
        ({"from": "2026-11-01", "to": "next week"}, "reports.invalid_date", "to"),
    ],
)
def test_period_problems(world, query, code, field):
    with pytest.raises(DomainError) as refused:
        parse_params(query, user=world.hr_user, accepts=frozenset({"period"}), today=TODAY)

    problem = refused.value.problems[0]
    assert (problem.code, problem.field) == (code, field)


@pytest.mark.parametrize(
    ("query", "code", "field"),
    [
        ({"on": "yesterday"}, "reports.invalid_date", "on"),
        ({"year": "20x6"}, "reports.invalid_year", "year"),
        ({"year": "1990"}, "reports.invalid_year", "year"),
        ({"department": "abc"}, "reports.invalid_filter", "department"),
        ({"step": "ceo"}, "reports.unknown_step", "step"),
    ],
)
def test_other_filter_problems(world, query, code, field):
    with pytest.raises(DomainError) as refused:
        parse_params(query, user=world.hr_user, accepts=NO_PERIOD, today=TODAY)

    problem = refused.value.problems[0]
    assert (problem.code, problem.field) == (code, field)


def test_a_filter_the_report_does_not_accept_is_refused(world):
    with pytest.raises(DomainError) as refused:
        parse_params({"type": "annual"}, user=world.hr_user, accepts=frozenset({"on"}), today=TODAY)

    problem = refused.value.problems[0]
    assert (problem.code, problem.field) == ("reports.filter_not_available", "type")


def test_department_filter_is_refused_in_team_scope(world):
    with pytest.raises(DomainError) as refused:
        parse_params(
            {"department": str(world.dept_a.id)}, user=world.manager_user, accepts=NO_PERIOD, today=TODAY
        )

    problem = refused.value.problems[0]
    assert (problem.code, problem.field) == ("reports.filter_not_available", "department")


def test_all_filters_are_kept(world):
    params = parse_params(
        {
            "department": str(world.dept_b.id),
            "employee": str(world.outsider.public_id),
            "type": "sick",
            "step": "hr_role",
            "year": "2025",
            "on": "2026-10-15",
        },
        user=world.hr_user,
        accepts=NO_PERIOD,
        today=TODAY,
    )

    assert params.department_id == world.dept_b.id
    assert params.employee_public_id == str(world.outsider.public_id)
    assert params.type_code == "sick"
    assert params.step == "hr_role"
    assert params.year == 2025
    assert params.on == date(2026, 10, 15)


def test_params_as_audit_keeps_only_what_was_set():
    params = ReportParams(scope="all", start=date(2026, 11, 1), end=date(2026, 11, 30), type_code="sick")

    assert params.as_audit() == {"scope": "all", "from": "2026-11-01", "to": "2026-11-30", "type": "sick"}


# --- who is in the report --------------------------------------------------


def test_hr_reaches_everyone(world):
    ids = _ids(world.hr_user, ReportParams(scope="all"))

    assert {world.owner.id, world.outsider.id, world.ceo.id, world.hr.id} <= ids


def test_team_scope_is_the_managers_team(world):
    assert _ids(world.manager_user, ReportParams(scope="team")) == {world.owner.id, world.peer.id}


def test_team_scope_of_an_executive_is_their_direct_reports(world):
    assert _ids(world.exec_user, ReportParams(scope="team")) == {
        world.manager.id,
        world.other_manager.id,
        world.hr.id,
    }


def test_empty_team_yields_nobody(world, monkeypatch):
    monkeypatch.setattr(framework.reach, "team_ids", lambda user, **kwargs: set())

    assert employees_in_scope(world.manager_user, ReportParams(scope="team"), include_archived=False) == []


def test_employee_outside_the_team_is_not_found(world):
    params = ReportParams(scope="team", employee_public_id=str(world.outsider.public_id))

    with pytest.raises(NotFound) as refused:
        employees_in_scope(world.manager_user, params, include_archived=False)
    assert refused.value.code == "reports.employee_not_found"


def test_employee_filter_keeps_one_person(world):
    params = ReportParams(scope="all", employee_public_id=str(world.owner.public_id))

    assert _ids(world.hr_user, params) == {world.owner.id}


def test_department_filter_narrows(world):
    ids = _ids(world.hr_user, ReportParams(scope="all", department_id=world.dept_b.id))

    assert world.outsider.id in ids
    assert world.owner.id not in ids


def test_archived_employees_appear_only_on_request(world):
    organisation_services.archive_employee(
        actor=world.hr_user, employee=world.peer, leaving_date=date(2026, 11, 30), reason="Resignation"
    )

    assert world.peer.id not in _ids(world.hr_user, ReportParams(scope="all"))
    assert world.peer.id in _ids(world.hr_user, ReportParams(scope="all"), include_archived=True)


def test_employees_come_sorted_by_name(world):
    employees = employees_in_scope(world.hr_user, ReportParams(scope="all"), include_archived=False)
    names = [organisation_selectors.full_name(employee).casefold() for employee in employees]

    assert names == sorted(names)


# --- helpers -------------------------------------------------------------


def test_people_gives_names_and_departments(world):
    people = People([world.owner, world.outsider], "fr")

    assert people.name(world.owner.id) == organisation_selectors.full_name(world.owner)
    assert people.department(world.outsider.id) == organisation_selectors.department_name(
        world.outsider, "fr"
    )


def test_col_takes_its_label_from_the_catalogue():
    column = col("days", "number", "fr")

    assert (column.key, column.label, column.kind) == ("days", "Jours", "number")
