from datetime import date
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.organisation import selectors as organisation_selectors
from apps.reports.tabular import framework, monthly
from apps.reports.tabular.framework import parse_params
from apps.reports.tests import scenario

pytestmark = pytest.mark.django_db


def _run(builder, user, lang="fr", **query):
    params = parse_params(query, user=user, accepts=monthly.ACCEPTS, today=date(2026, 12, 1))
    return builder(user, params, lang, timezone.now())


def _name(employee):
    return organisation_selectors.full_name(employee)


def _row(result, employee):
    return next(row for row in result.rows if row["employee"] == _name(employee))


def test_columns_are_the_employee_twelve_months_and_a_total(world, november):
    result = _run(monthly.build_permission_hours, world.hr_user, year="2026")

    assert [column.key for column in result.columns] == ["employee", *monthly.MONTH_KEYS, "total"]
    assert result.columns[11].label == "Nov."
    assert all(column.kind == "number" for column in result.columns[1:])


def test_permission_hours_fall_in_their_month(world, november):
    result = _run(monthly.build_permission_hours, world.hr_user, year="2026")

    assert [row["employee"] for row in result.rows] == [_name(world.owner)]
    owner = result.rows[0]
    assert owner["m11"] == Decimal("2.5")
    assert owner["m10"] is None
    assert owner["total"] == Decimal("2.5")
    assert result.totals[0].values["m11"] == Decimal("2.5")
    assert result.totals[0].values["total"] == Decimal("2.5")


def test_remote_days_fall_in_their_month(world, november):
    result = _run(monthly.build_remote_days, world.hr_user, year="2026")

    owner = _row(result, world.owner)
    assert owner["m11"] == Decimal("2")
    assert owner["total"] == Decimal("2")


def test_remote_days_across_new_year_are_split_between_the_two_years(world, november):
    scenario.approved(
        world, employee=world.peer, request_type=world.remote, start=date(2026, 12, 31), end=date(2027, 1, 1)
    )

    this_year = _run(monthly.build_remote_days, world.hr_user, year="2026")
    next_year = _run(monthly.build_remote_days, world.hr_user, year="2027")

    assert _row(this_year, world.peer)["m12"] == Decimal("1")
    assert _row(this_year, world.peer)["total"] == Decimal("1")
    assert _row(next_year, world.peer)["m01"] == Decimal("1")
    assert [row["employee"] for row in next_year.rows] == [_name(world.peer)]


def test_the_year_defaults_to_the_current_one(world, november):
    result = _run(monthly.build_remote_days, world.hr_user)

    assert _row(result, world.owner)["m11"] == Decimal("2")


def test_a_year_with_nothing_is_empty(world, november):
    result = _run(monthly.build_permission_hours, world.hr_user, year="2025")

    assert result.rows == []
    assert result.totals is None


def test_a_manager_sees_the_team_only(world, november):
    assert [
        row["employee"] for row in _run(monthly.build_remote_days, world.manager_user, year="2026").rows
    ] == [_name(world.owner)]
    assert _run(monthly.build_remote_days, world.other_manager_user, year="2026").rows == []


def test_empty_scope_never_queries_everyone(world, november, monkeypatch):
    def forbidden(**kwargs):
        raise AssertionError("day_rows must not be called when nobody is in scope")

    monkeypatch.setattr(framework.reach, "team_ids", lambda user, **kwargs: set())
    monkeypatch.setattr(monthly.request_selectors, "day_rows", forbidden)

    assert _run(monthly.build_remote_days, world.manager_user, year="2026").rows == []


def test_no_matching_type_never_queries_every_type(world, november, monkeypatch):
    def forbidden(**kwargs):
        raise AssertionError("day_rows must not be called without a type to look for")

    day_types_only = {code: fact for code, fact in monthly.type_facts().items() if fact.unit == "day"}
    monkeypatch.setattr(monthly, "type_facts", lambda: day_types_only)
    monkeypatch.setattr(monthly.request_selectors, "day_rows", forbidden)

    assert _run(monthly.build_permission_hours, world.hr_user, year="2026").rows == []
