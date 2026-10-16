from datetime import date
from decimal import Decimal

import time_machine

from apps.audit.models import AuditEvent
from apps.balances import services, tasks
from apps.balances.models import LedgerEntry, LedgerKind
from apps.balances.tests.world import at, give_credit
from apps.core.models import JobStatus
from apps.organisation import selectors as organisation_selectors
from apps.organisation import services as organisation_services


def credits_of(employee) -> list[tuple[str, date, Decimal]]:
    entries = LedgerEntry.objects.filter(employee=employee, kind=LedgerKind.CREDIT)
    return [(entry.period, entry.effective_date, entry.amount) for entry in entries]


def headcount() -> int:
    return organisation_selectors.all_employees().count()


def test_all_employees_includes_archived_records(cast):
    with time_machine.travel(at(2026, 2, 10), tick=False):
        organisation_services.archive_employee(
            actor=cast.hr_user, employee=cast.peer, leaving_date=date(2026, 2, 10), reason="Resignation"
        )

    everyone = set(organisation_selectors.all_employees().values_list("pk", flat=True))

    assert {cast.owner.pk, cast.peer.pk, cast.ceo.pk} <= everyone


def test_nothing_is_posted_while_the_start_date_is_empty(cast, ledger_settings):
    ledger_settings(start=None)

    assert services.post_month_end_credits(today=date(2026, 1, 31)) == 0
    assert LedgerEntry.objects.count() == 0


def test_every_employee_is_credited_at_month_end(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))

    posted = services.post_month_end_credits(today=date(2026, 2, 1))

    assert posted == headcount()
    assert credits_of(cast.owner) == [("2026-01", date(2026, 1, 31), Decimal("2.5"))]
    entry = LedgerEntry.objects.get(employee=cast.owner)
    assert entry.created_by is None
    assert entry.request_id is None
    assert entry.reason == ""


def test_the_credit_is_posted_once_the_last_day_is_over_and_dated_that_day(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))

    assert services.post_month_end_credits(today=date(2026, 1, 30)) == 0
    assert services.post_month_end_credits(today=date(2026, 1, 31)) == 0
    assert services.post_month_end_credits(today=date(2026, 2, 1)) == headcount()
    assert credits_of(cast.owner) == [("2026-01", date(2026, 1, 31), Decimal("2.5"))]


def test_a_departure_recorded_during_the_last_day_counts_in_that_month(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    # The job's run of 31 March, at 01:00, before HR records anything that day.
    with time_machine.travel(at(2026, 3, 31, hour=1), tick=False):
        tasks.month_end_credit(0)
    # 31 March, 16:00: HR records that the owner left on 10 March.
    with time_machine.travel(at(2026, 3, 31, hour=16), tick=False):
        organisation_services.archive_employee(
            actor=cast.hr_user, employee=cast.owner, leaving_date=date(2026, 3, 10), reason="Resignation"
        )
    # 1 April, 01:00: the next run.
    with time_machine.travel(at(2026, 4, 1, hour=1), tick=False):
        tasks.month_end_credit(0)

    # 10 of 31 days in March: 0.81 -> 1.0, not the full month
    assert credits_of(cast.owner) == [
        ("2026-01", date(2026, 1, 31), Decimal("2.5")),
        ("2026-02", date(2026, 2, 28), Decimal("2.5")),
        ("2026-03", date(2026, 3, 31), Decimal("1")),
    ]
    assert credits_of(cast.peer)[-1] == ("2026-03", date(2026, 3, 31), Decimal("2.5"))


def test_no_credit_for_a_month_that_ends_before_the_start_date(cast, ledger_settings):
    ledger_settings(start=date(2026, 3, 1))

    services.post_month_end_credits(today=date(2026, 4, 2))

    assert credits_of(cast.owner) == [("2026-03", date(2026, 3, 31), Decimal("2.5"))]


def test_months_missed_while_the_server_was_down_are_caught_up(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))

    posted = services.post_month_end_credits(today=date(2026, 4, 2))

    assert posted == 3 * headcount()
    assert credits_of(cast.owner) == [
        ("2026-01", date(2026, 1, 31), Decimal("2.5")),
        ("2026-02", date(2026, 2, 28), Decimal("2.5")),
        ("2026-03", date(2026, 3, 31), Decimal("2.5")),
    ]


def test_running_twice_posts_nothing_more(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    first = services.post_month_end_credits(today=date(2026, 2, 1))
    lines = LedgerEntry.objects.count()

    second = services.post_month_end_credits(today=date(2026, 2, 1))

    assert first > 0
    assert second == 0
    assert LedgerEntry.objects.count() == lines


def test_a_run_completes_what_an_interrupted_run_left(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    give_credit(cast.owner, 2026, 1)

    posted = services.post_month_end_credits(today=date(2026, 2, 1))

    assert posted == headcount() - 1
    assert len(credits_of(cast.owner)) == 1
    assert len(credits_of(cast.peer)) == 1


def test_a_joiner_is_credited_in_proportion(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    cast.owner.hire_date = date(2026, 3, 16)
    cast.owner.save(update_fields=["hire_date"])

    services.post_month_end_credits(today=date(2026, 4, 1))

    # nothing for January and February; 16 of 31 days in March: 1.29 -> 1.5
    assert credits_of(cast.owner) == [("2026-03", date(2026, 3, 31), Decimal("1.5"))]


def test_someone_who_joined_on_the_last_day_gets_no_line(cast, ledger_settings):
    ledger_settings(start=date(2026, 3, 1))
    cast.owner.hire_date = date(2026, 3, 31)
    cast.owner.save(update_fields=["hire_date"])

    services.post_month_end_credits(today=date(2026, 4, 1))

    assert credits_of(cast.owner) == []


def test_a_leaver_is_credited_for_the_part_of_the_last_month_and_never_after(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    with time_machine.travel(at(2026, 2, 10), tick=False):
        organisation_services.archive_employee(
            actor=cast.hr_user, employee=cast.owner, leaving_date=date(2026, 2, 10), reason="Resignation"
        )

    services.post_month_end_credits(today=date(2026, 4, 2))

    # 10 of 28 days in February: 0.89 -> 1.0; nothing for March
    assert credits_of(cast.owner) == [
        ("2026-01", date(2026, 1, 31), Decimal("2.5")),
        ("2026-02", date(2026, 2, 28), Decimal("1")),
    ]


def test_the_rate_in_force_on_the_day_of_the_run_is_used(cast, ledger_settings):
    ledger_settings(rate="3", start=date(2026, 1, 1))

    services.post_month_end_credits(today=date(2026, 2, 1))

    assert credits_of(cast.owner) == [("2026-01", date(2026, 1, 31), Decimal("3"))]


def test_a_run_is_audited_once_and_an_empty_run_is_not(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))

    services.post_month_end_credits(today=date(2026, 3, 1))
    services.post_month_end_credits(today=date(2026, 3, 1))

    events = AuditEvent.objects.filter(action="ledger.credits_posted")
    assert events.count() == 1
    event = events.get()
    assert event.actor is None
    assert event.object_label == "2026-01, 2026-02"
    assert event.changes == {"lines": {"before": None, "after": 2 * headcount()}}


def test_the_daily_task_runs_the_job_and_records_its_status(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))

    with time_machine.travel(at(2026, 2, 1, hour=1), tick=False):
        tasks.month_end_credit(0)

    assert tasks.month_end_credit.name == "balances.month_end_credit"
    assert LedgerEntry.objects.filter(kind=LedgerKind.CREDIT, period="2026-01").count() == headcount()
    assert JobStatus.objects.get(name="balances.month_end_credit").last_ok is True
