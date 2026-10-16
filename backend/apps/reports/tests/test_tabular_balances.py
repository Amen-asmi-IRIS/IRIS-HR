from datetime import date
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.balances import selectors as balance_selectors
from apps.balances import services as balance_services
from apps.organisation import selectors as organisation_selectors
from apps.organisation import services as organisation_services
from apps.reports.tabular import balances, framework
from apps.reports.tabular.framework import parse_params
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db


def _run(user, lang="fr", **query):
    params = parse_params(query, user=user, accepts=balances.ACCEPTS, today=date(2026, 12, 1))
    return balances.build(user, params, lang, timezone.now())


def _name(employee):
    return organisation_selectors.full_name(employee)


def _row(result, employee):
    return next(row for row in result.rows if row["employee"] == _name(employee))


def test_columns(world, november):
    result = _run(world.hr_user, on="2026-11-30")

    assert [column.key for column in result.columns] == [
        "employee",
        "department",
        "balance",
        "pending",
        "approved_upcoming",
    ]


def test_balance_on_a_date_can_be_explained_by_hand(world, november):
    # Opening 20 on 30 Sep; 2 days taken on 29 and 30 Oct; 1 day on 2 Nov; half a day on 13 Nov.
    assert _row(_run(world.hr_user, on="2026-09-29"), world.owner)["balance"] == Decimal("0")
    assert _row(_run(world.hr_user, on="2026-10-31"), world.owner)["balance"] == Decimal("18")
    assert _row(_run(world.hr_user, on="2026-11-12"), world.owner)["balance"] == Decimal("17")
    assert _row(_run(world.hr_user, on="2026-11-30"), world.owner)["balance"] == Decimal("16.5")


def test_someone_without_entries_has_zero(world, november):
    assert _row(_run(world.hr_user, on="2026-11-30"), world.peer)["balance"] == Decimal("0")


def test_pending_and_upcoming_come_from_the_balance_figures(world, november):
    on = date(2026, 11, 5)
    figures = balance_selectors.figures(world.owner.id, today=on)

    row = _row(_run(world.hr_user, on=on.isoformat()), world.owner)

    assert row["pending"] == figures.pending
    assert row["approved_upcoming"] == figures.approved_upcoming


def test_the_date_defaults_to_today(world, november):
    assert _row(_run(world.hr_user), world.owner)["balance"] == Decimal("16.5")


def test_overall_total(world, november):
    result = _run(world.hr_user, on="2026-11-30")

    overall = result.totals[0]
    assert overall.group == "overall"
    assert overall.values["balance"] == Decimal("16.5")
    assert overall.values["pending"] == sum((row["pending"] for row in result.rows), Decimal("0"))


def test_a_manager_sees_the_team_only(world, november):
    result = _run(world.manager_user, on="2026-11-30")

    assert {row["employee"] for row in result.rows} == {_name(world.owner), _name(world.peer)}


def test_department_filter(world, november):
    result = _run(world.hr_user, on="2026-11-30", department=str(world.dept_b.id))

    names = {row["employee"] for row in result.rows}
    assert _name(world.outsider) in names
    assert _name(world.owner) not in names


def test_people_who_left_are_not_listed(world, november):
    organisation_services.archive_employee(
        actor=world.hr_user, employee=world.peer, leaving_date=date(2026, 11, 30), reason="Resignation"
    )

    result = _run(world.hr_user, on="2026-11-30")

    assert _name(world.peer) not in {row["employee"] for row in result.rows}


def test_empty_scope_never_queries_everyone(world, november, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("balances_at must not be called when nobody is in scope")

    monkeypatch.setattr(framework.reach, "team_ids", lambda user, **kwargs: set())
    monkeypatch.setattr(balances.balance_selectors, "balances_at", forbidden)

    result = _run(world.manager_user, on="2026-11-30")

    assert result.rows == []
    assert result.totals is None


# --- the month-end credits due by the date and not posted yet (master 13.1) -----------


@pytest.fixture
def credits_from_october(world, november):
    """Monthly credits start on 1 October; the job has not run, so none is posted."""
    settings_service.set_value(actor=world.hr_user, key="credit_start_date", value="2026-10-01")
    return november


def test_a_date_already_over_counts_the_credits_not_posted_yet_and_says_so(world, credits_from_october):
    """The job of 1 December has not run yet: October and November are due, dated on or before 30 Nov."""
    result = _run(world.hr_user, on="2026-11-30")

    assert _row(result, world.owner)["balance"] == Decimal("21.5")
    assert result.notes == (
        "Les soldes au 30/11/2026 comprennent les crédits de fin de mois qui ne sont pas encore enregistrés.",
    )


def test_a_date_already_over_whose_credits_are_posted_has_no_note(world, credits_from_october):
    balance_services.post_month_end_credits(today=date(2026, 12, 1))

    result = _run(world.hr_user, on="2026-11-30")

    assert _row(result, world.owner)["balance"] == Decimal("21.5")
    assert result.notes == ()


def test_today_counts_the_credits_not_posted_yet_and_says_so(world, credits_from_october):
    result = _run(world.hr_user, lang="en", on="2026-12-01")

    # October and November, 2.5 days each, are due and not posted yet.
    assert _row(result, world.owner)["balance"] == Decimal("21.5")
    assert result.notes == ("Balances on 01/12/2026 include the month-end credits that are not posted yet.",)


def test_a_later_date_counts_every_credit_up_to_it(world, credits_from_october):
    result = _run(world.hr_user, on="2026-12-31")

    assert _row(result, world.owner)["balance"] == Decimal("24")
    assert result.totals[0].values["balance"] == sum((row["balance"] for row in result.rows), Decimal("0"))
    assert result.notes == (
        "Les soldes au 31/12/2026 comprennent les crédits de fin de mois qui ne sont pas encore enregistrés.",
    )


def test_no_note_when_nothing_is_added(world, november):
    # credit_start_date is empty in the scenario: no credit is due, so nothing is said.
    assert _run(world.hr_user, on="2026-12-31").notes == ()


def test_the_queries_do_not_grow_with_the_number_of_people(world, november):
    settings_service.set_value(actor=world.hr_user, key="credit_start_date", value=date(2026, 10, 1))
    _run(world.hr_user, on="2026-11-30")  # the settings are read once, then kept for 30 seconds
    with CaptureQueriesContext(connection) as one:
        _run(world.hr_user, on="2026-11-30", employee=str(world.owner.public_id))
    with CaptureQueriesContext(connection) as everybody:
        result = _run(world.hr_user, on="2026-11-30")

    assert len(result.rows) == 7
    assert len(everybody) == len(one)
