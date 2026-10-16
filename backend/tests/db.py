"""Database helpers for the test suite."""

from django.db import connection

_TRUNCATE_BIT = 32  # pg_trigger.tgtype flag of a TRUNCATE trigger


def truncate_guards() -> list[tuple[str, str]]:
    """Every (table, trigger) that blocks TRUNCATE: the audit trail now, the leave ledger from plan 04."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid "
            "WHERE NOT t.tgisinternal AND (t.tgtype & %s) <> 0 ORDER BY 1, 2",
            [_TRUNCATE_BIT],
        )
        return [(table, trigger) for table, trigger in cursor.fetchall()]


def disable_truncate_guards() -> None:
    """Django empties tables with TRUNCATE after a transactional test. Allow it in the test database only."""
    guards = truncate_guards()
    with connection.cursor() as cursor:
        for table, trigger in guards:
            cursor.execute(f'ALTER TABLE "{table}" DISABLE TRIGGER "{trigger}"')
