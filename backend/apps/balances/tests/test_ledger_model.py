from datetime import date
from decimal import Decimal

import pytest
from django.db import IntegrityError, connection, transaction

from apps.balances.models import LedgerEntry, LedgerKind
from apps.balances.tests.world import give_credit, give_opening, make_entry
from tests.db import truncate_guards


def test_entries_are_listed_by_effective_date_then_by_creation(world):
    late = make_entry(world.owner, LedgerKind.ADJUSTMENT, "1", date(2026, 3, 1), reason="Late")
    opening = give_opening(world.owner, "4", date(2025, 12, 31))
    same_day = make_entry(world.owner, LedgerKind.ADJUSTMENT, "-1", date(2026, 3, 1), reason="Same day")

    assert list(LedgerEntry.objects.filter(employee=world.owner)) == [opening, late, same_day]


def test_an_entry_cannot_be_updated(world):
    entry = give_opening(world.owner, "4")
    entry.amount = Decimal("40")

    with pytest.raises(IntegrityError), transaction.atomic():
        entry.save()

    entry.refresh_from_db()
    assert entry.amount == Decimal("4")


def test_a_bulk_update_is_refused(world):
    give_opening(world.owner, "4")

    with pytest.raises(IntegrityError), transaction.atomic():
        LedgerEntry.objects.filter(employee=world.owner).update(amount=Decimal("40"))


def test_an_entry_cannot_be_deleted(world):
    entry = give_opening(world.owner, "4")

    with pytest.raises(IntegrityError), transaction.atomic():
        entry.delete()

    assert LedgerEntry.objects.filter(pk=entry.pk).exists()


@pytest.mark.parametrize(
    "statement",
    ["UPDATE balances_ledgerentry SET amount = 40", "DELETE FROM balances_ledgerentry"],
)
def test_plain_sql_is_refused_too(world, statement):
    entry = give_opening(world.owner, "4")

    with pytest.raises(IntegrityError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(statement)

    assert LedgerEntry.objects.get(pk=entry.pk).amount == Decimal("4")


def test_the_table_cannot_be_emptied(world):
    give_opening(world.owner, "4")
    # The guard is switched off in the test database (tests.db.disable_truncate_guards); switch it on for
    # this test. The insert above left a deferred foreign-key check pending, and PostgreSQL refuses
    # ALTER TABLE until it has run. Both are rolled back with the test's transaction.
    connection.check_constraints()
    with connection.cursor() as cursor:
        cursor.execute("ALTER TABLE balances_ledgerentry ENABLE TRIGGER balances_ledger_no_truncate")

    with pytest.raises(IntegrityError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("TRUNCATE balances_ledgerentry")

    assert LedgerEntry.objects.count() == 1


def test_no_session_setting_lets_a_truncate_through(world):
    """Like the audit trail, the ledger has no bypass: development and production refuse TRUNCATE alike."""
    give_opening(world.owner, "4")
    connection.check_constraints()
    with connection.cursor() as cursor:
        cursor.execute("ALTER TABLE balances_ledgerentry ENABLE TRIGGER balances_ledger_no_truncate")
        cursor.execute("SET LOCAL iris.allow_truncate = 'on'")

    with pytest.raises(IntegrityError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("TRUNCATE balances_ledgerentry")

    assert LedgerEntry.objects.count() == 1


def test_the_truncate_guard_exists_and_is_switched_off_for_the_test_database_only(db):
    # tests.db.disable_truncate_guards finds every TRUNCATE trigger, this one included, so that the
    # teardown of a transactional test can empty the table. e2e_reset drops the schema instead.
    assert ("balances_ledgerentry", "balances_ledger_no_truncate") in truncate_guards()


def test_one_credit_per_employee_and_month(world):
    give_credit(world.owner, 2026, 1)

    with pytest.raises(IntegrityError), transaction.atomic():
        give_credit(world.owner, 2026, 1)

    give_credit(world.peer, 2026, 1)
    give_credit(world.owner, 2026, 2)
    assert LedgerEntry.objects.filter(kind=LedgerKind.CREDIT).count() == 3


def test_one_opening_balance_per_employee(world):
    give_opening(world.owner, "4")

    with pytest.raises(IntegrityError), transaction.atomic():
        give_opening(world.owner, "6")

    give_opening(world.peer, "6")


def test_a_credit_names_its_month_and_other_entries_do_not(world):
    with pytest.raises(IntegrityError), transaction.atomic():
        make_entry(world.owner, LedgerKind.CREDIT, "2.5", date(2026, 1, 31))

    with pytest.raises(IntegrityError), transaction.atomic():
        make_entry(world.owner, LedgerKind.ADJUSTMENT, "1", date(2026, 1, 31), period="2026-01", reason="x")


def test_leave_entries_name_their_request(world):
    with pytest.raises(IntegrityError), transaction.atomic():
        make_entry(world.owner, LedgerKind.TAKEN, "-1", date(2026, 2, 9))

    with pytest.raises(IntegrityError), transaction.atomic():
        make_entry(world.owner, LedgerKind.RESTORED, "1", date(2026, 2, 9))


@pytest.mark.parametrize(
    ("kind", "amount", "extra"),
    [
        (LedgerKind.CREDIT, "-2.5", {"period": "2026-01"}),
        (LedgerKind.CREDIT, "0", {"period": "2026-01"}),
        (LedgerKind.TAKEN, "1", {"request_id": 1}),
        (LedgerKind.RESTORED, "-1", {"request_id": 1}),
        (LedgerKind.ADJUSTMENT, "0", {"reason": "x"}),
    ],
)
def test_the_sign_of_an_entry_follows_its_kind(world, kind, amount, extra):
    with pytest.raises(IntegrityError), transaction.atomic():
        make_entry(world.owner, kind, amount, date(2026, 1, 31), **extra)


def test_an_opening_balance_may_be_zero_or_negative(world):
    give_opening(world.owner, "0")
    give_opening(world.peer, "-1.5")

    assert LedgerEntry.objects.filter(kind=LedgerKind.OPENING).count() == 2
