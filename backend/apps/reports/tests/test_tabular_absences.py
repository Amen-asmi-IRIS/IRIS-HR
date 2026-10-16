from datetime import date
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.core.errors import DomainError
from apps.organisation import selectors as organisation_selectors
from apps.organisation import services as organisation_services
from apps.reports.tabular import absences, framework
from apps.reports.tabular.framework import Period, parse_params

pytestmark = pytest.mark.django_db

NOVEMBER = {"from": "2026-11-01", "to": "2026-11-30"}


def _run(user, lang="fr", **extra):
    params = parse_params({**NOVEMBER, **extra}, user=user, accepts=absences.ACCEPTS, today=date(2026, 12, 1))
    return absences.build(user, params, lang, timezone.now())


def _name(employee):
    return organisation_selectors.full_name(employee)


def _row(result, employee, type_name, start):
    return next(
        row
        for row in result.rows
        if row["employee"] == _name(employee) and row["type"] == type_name and row["period"].start == start
    )


def _total(result, group, label=None):
    return next(
        line for line in result.totals if line.group == group and (label is None or line.label == label)
    )


def test_hr_sees_every_approved_absence_of_the_month(world, november):
    result = _run(world.hr_user)

    assert [column.key for column in result.columns] == [
        "employee",
        "department",
        "type",
        "period",
        "days",
        "hours",
    ]
    assert len(result.rows) == 7
    # The pending request of 9 and 10 November is not there.
    assert not any(
        row["employee"] == _name(world.owner) and row["period"].start == date(2026, 11, 9)
        for row in result.rows
    )


def test_request_crossing_the_period_is_clipped(world, november):
    result = _run(world.hr_user)

    long_leave = _row(result, world.owner, world.annual.name_fr, date(2026, 11, 2))
    assert long_leave["period"] == Period(date(2026, 11, 2), date(2026, 11, 2))  # 3 November is a holiday
    assert long_leave["days"] == Decimal("1")

    exceptional = _row(result, world.owner, world.exceptional.name_fr, date(2026, 11, 30))
    assert exceptional["period"] == Period(date(2026, 11, 30), date(2026, 11, 30))
    assert exceptional["days"] == Decimal("1")


def test_half_days_count_as_halves_and_permissions_in_hours(world, november):
    result = _run(world.hr_user)

    half = _row(result, world.owner, world.annual.name_fr, date(2026, 11, 13))
    assert (half["days"], half["hours"]) == (Decimal("0.5"), None)

    permission = _row(result, world.owner, world.permission.name_fr, date(2026, 11, 24))
    assert (permission["days"], permission["hours"]) == (None, Decimal("2.5"))


def test_totals_overall_per_employee_and_per_type(world, november):
    result = _run(world.hr_user)

    assert _total(result, "overall").values == {"days": Decimal("8"), "hours": Decimal("2.5")}
    assert _total(result, "by_employee", _name(world.owner)).values == {
        "days": Decimal("5"),
        "hours": Decimal("2.5"),
    }
    assert _total(result, "by_employee", _name(world.outsider)).values == {
        "days": Decimal("3"),
        "hours": Decimal("0"),
    }
    assert _total(result, "by_type", world.annual.name_fr).values == {"days": Decimal("1.5"), "hours": None}
    assert _total(result, "by_type", world.sick.name_fr).values == {"days": Decimal("3.5"), "hours": None}
    assert _total(result, "by_type", world.exceptional.name_fr).values == {
        "days": Decimal("1"),
        "hours": None,
    }
    assert _total(result, "by_type", world.remote.name_fr).values == {"days": Decimal("2"), "hours": None}
    assert _total(result, "by_type", world.permission.name_fr).values == {
        "days": None,
        "hours": Decimal("2.5"),
    }


def test_type_filter(world, november):
    result = _run(world.hr_user, type="sick")

    assert {row["type"] for row in result.rows} == {world.sick.name_fr}
    assert _total(result, "overall").values["days"] == Decimal("3.5")


def test_unknown_type_is_refused(world, november):
    with pytest.raises(DomainError) as refused:
        _run(world.hr_user, type="sabbatical")

    assert refused.value.code == "reports.unknown_type"
    assert refused.value.problems[0].field == "type"


def test_a_manager_sees_the_team_only(world, november):
    result = _run(world.manager_user)

    assert {row["employee"] for row in result.rows} == {_name(world.owner)}
    assert len(result.rows) == 6
    assert _total(result, "overall").values == {"days": Decimal("5"), "hours": Decimal("2.5")}


def test_employee_and_department_filters(world, november):
    by_employee = _run(world.hr_user, employee=str(world.outsider.public_id))
    by_department = _run(world.hr_user, department=str(world.dept_b.id))

    assert [row["employee"] for row in by_employee.rows] == [_name(world.outsider)]
    assert [row["employee"] for row in by_department.rows] == [_name(world.outsider)]
    assert by_department.rows[0]["days"] == Decimal("3")


def test_empty_scope_never_queries_everyone(world, november, monkeypatch):
    def forbidden(**kwargs):
        raise AssertionError("day_rows must not be called when nobody is in scope")

    monkeypatch.setattr(framework.reach, "team_ids", lambda user, **kwargs: set())
    monkeypatch.setattr(absences.request_selectors, "day_rows", forbidden)

    result = _run(world.manager_user)

    assert result.rows == []
    assert result.totals is None


def test_rows_are_sorted_by_employee_then_date(world, november):
    result = _run(world.hr_user)

    keys = [(row["employee"].casefold(), row["period"].start) for row in result.rows]
    assert keys == sorted(keys)


def test_an_archived_employee_keeps_the_absences_of_their_last_month(world, november):
    organisation_services.archive_employee(
        actor=world.hr_user, employee=world.outsider, leaving_date=date(2026, 11, 30), reason="Resignation"
    )

    result = _run(world.hr_user)

    assert _name(world.outsider) in {row["employee"] for row in result.rows}


def test_labels_follow_the_readers_language(world, november):
    result = _run(world.hr_user, lang="en")

    assert [column.label for column in result.columns] == [
        "Employee",
        "Department",
        "Type",
        "Dates",
        "Days",
        "Hours",
    ]
    assert world.sick.name_en in {row["type"] for row in result.rows}
    assert _total(result, "overall").label == "Total"
