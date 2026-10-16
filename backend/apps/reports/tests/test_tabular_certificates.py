from datetime import date, timedelta

import pytest
from django.utils import timezone

from apps.organisation import selectors as organisation_selectors
from apps.reports.tabular import certificates
from apps.reports.tabular.framework import Period, parse_params
from apps.reports.tests import scenario

pytestmark = pytest.mark.django_db


@pytest.fixture
def undocumented(world, november):
    """A sick leave of the peer, declared now, with a comment and no certificate."""
    return scenario.pending(
        world,
        employee=world.peer,
        request_type=world.sick,
        start=date(2026, 11, 26),
        end=date(2026, 11, 27),
        comment=scenario.SICK_COMMENT,
    )


def _run(user, lang="fr", now=None, **query):
    params = parse_params(query, user=user, accepts=certificates.ACCEPTS, today=date(2026, 12, 1))
    return certificates.build(user, params, lang, now or timezone.now())


def _row(result, employee):
    name = organisation_selectors.full_name(employee)
    return next(row for row in result.rows if row["employee"] == name)


def test_columns(world, undocumented):
    result = _run(world.hr_user)

    assert [column.key for column in result.columns] == [
        "employee",
        "department",
        "period",
        "due",
        "overdue_hours",
    ]
    assert result.totals is None


def test_a_sick_leave_without_certificate_is_listed_with_its_deadline(world, undocumented):
    row = _row(_run(world.hr_user), world.peer)

    assert row["period"] == Period(date(2026, 11, 26), date(2026, 11, 27))
    assert row["due"] == undocumented.certificate_due_at
    assert row["overdue_hours"] is None


def test_overdue_is_counted_in_whole_hours(world, undocumented):
    later = undocumented.certificate_due_at + timedelta(hours=25, minutes=40)

    row = _row(_run(world.hr_user, now=later), world.peer)

    assert row["overdue_hours"] == 25


def test_department_filter(world, undocumented):
    in_a = _run(world.hr_user, department=str(world.dept_a.id))
    in_b = _run(world.hr_user, department=str(world.dept_b.id))

    peer = organisation_selectors.full_name(world.peer)
    assert peer in {row["employee"] for row in in_a.rows}
    assert peer not in {row["employee"] for row in in_b.rows}


def test_certificates_report_carries_no_medical_detail(world, undocumented):
    result = _run(world.hr_user)

    everything = repr(result)
    assert scenario.SICK_COMMENT not in everything
    assert "Karray" not in everything
    assert "comment" not in {column.key for column in result.columns}


def test_empty_scope_never_queries_everyone(world, undocumented, monkeypatch):
    def forbidden(**kwargs):
        raise AssertionError("outstanding_certificates must not be called when nobody is in scope")

    monkeypatch.setattr(certificates, "employees_in_scope", lambda user, params, include_archived: [])
    monkeypatch.setattr(certificates.request_selectors, "outstanding_certificates", forbidden)

    assert _run(world.hr_user).rows == []
