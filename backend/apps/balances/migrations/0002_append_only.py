"""The ledger accepts INSERT and SELECT only (BAL-01, master D8), like the audit trail.

TRUNCATE is refused too. The test database switches that guard off (tests.db.disable_truncate_guards)
so that a transactional test can be torn down; e2e_reset drops the whole schema and needs no TRUNCATE.
`restrict_violation` is SQLSTATE 23001, which Django raises as IntegrityError.
"""

from django.db import migrations

CREATE_FUNCTION = """
CREATE FUNCTION balances_ledger_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION USING
        MESSAGE = 'balances_ledgerentry is append-only: ' || TG_OP || ' is not allowed',
        ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql
"""

CREATE_ROW_TRIGGER = """
CREATE TRIGGER balances_ledger_no_update_delete
    BEFORE UPDATE OR DELETE ON balances_ledgerentry
    FOR EACH ROW EXECUTE FUNCTION balances_ledger_append_only()
"""

CREATE_TRUNCATE_TRIGGER = """
CREATE TRIGGER balances_ledger_no_truncate
    BEFORE TRUNCATE ON balances_ledgerentry
    FOR EACH STATEMENT EXECUTE FUNCTION balances_ledger_append_only()
"""


class Migration(migrations.Migration):
    dependencies = [("balances", "0001_initial")]

    operations = [
        migrations.RunSQL(
            sql=[CREATE_FUNCTION, CREATE_ROW_TRIGGER, CREATE_TRUNCATE_TRIGGER],
            reverse_sql=[
                "DROP TRIGGER balances_ledger_no_truncate ON balances_ledgerentry",
                "DROP TRIGGER balances_ledger_no_update_delete ON balances_ledgerentry",
                "DROP FUNCTION balances_ledger_append_only()",
            ],
        ),
    ]
