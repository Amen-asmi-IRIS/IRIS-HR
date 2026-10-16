from datetime import date, timedelta

import pytest
from django.utils import timezone

from apps.core.errors import DomainError
from apps.organisation import selectors as organisation_selectors
from apps.reports.tabular import framework, waiting
from apps.reports.tabular.framework import Period, parse_params

pytestmark = pytest.mark.django_db


def _run(user, lang="fr", now=None, **query):
    params = parse_params(query, user=user, accepts=waiting.ACCEPTS, today=date(2026, 12, 1))
    return waiting.build(user, params, lang, now or timezone.now())


def _name(employee):
    return organisation_selectors.full_name(employee)


def test_columns(world, november):
    result = _run(world.hr_user)

    assert [column.key for column in result.columns] == [
        "requester",
        "type",
        "period",
        "waiting_on",
        "since",
        "age_days",
        "reminded",
        "alerted",
    ]
    assert result.totals is None


def test_hr_sees_the_request_nobody_decided(world, november):
    result = _run(world.hr_user)

    assert len(result.rows) == 1
    row = result.rows[0]
    assert row["requester"] == _name(world.owner)
    assert row["type"] == world.annual.name_fr
    assert row["period"] == Period(date(2026, 11, 9), date(2026, 11, 10))
    assert _name(world.manager) in row["waiting_on"]
    assert row["since"] == timezone.now()  # the clock is frozen: the step became active at this instant
    assert row["reminded"] is None
    assert row["alerted"] is None


def test_age_is_counted_in_whole_days(world, november):
    assert _run(world.hr_user).rows[0]["age_days"] == 0

    later = timezone.now() + timedelta(days=3, hours=5)

    assert _run(world.hr_user, now=later).rows[0]["age_days"] == 3


def test_step_filter(world, november):
    assert len(_run(world.hr_user, step="line_manager").rows) == 1
    assert _run(world.hr_user, step="hr_role").rows == []


def test_type_filter(world, november):
    assert len(_run(world.hr_user, type="annual").rows) == 1
    assert _run(world.hr_user, type="sick").rows == []


def test_unknown_type_is_refused(world, november):
    with pytest.raises(DomainError) as refused:
        _run(world.hr_user, type="sabbatical")

    assert refused.value.code == "reports.unknown_type"


def test_department_filter(world, november):
    assert len(_run(world.hr_user, department=str(world.dept_a.id)).rows) == 1
    assert _run(world.hr_user, department=str(world.dept_b.id)).rows == []


def test_each_manager_sees_their_own_team(world, november):
    assert len(_run(world.manager_user).rows) == 1
    assert _run(world.other_manager_user).rows == []


def test_empty_scope_never_queries_everyone(world, november, monkeypatch):
    def forbidden(**kwargs):
        raise AssertionError("waiting_rows must not be called when nobody is in scope")

    monkeypatch.setattr(framework.reach, "team_ids", lambda user, **kwargs: set())
    monkeypatch.setattr(waiting.request_selectors, "waiting_rows", forbidden)

    assert _run(world.manager_user).rows == []
