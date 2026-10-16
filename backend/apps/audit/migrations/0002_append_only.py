"""The audit table accepts INSERT and SELECT only (AUD-01, master D8)."""

from django.db import migrations

CREATE_FUNCTION = """
CREATE FUNCTION audit_auditevent_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION USING
        MESSAGE = 'audit_auditevent is append-only: ' || TG_OP || ' is not allowed',
        ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql
"""

CREATE_ROW_TRIGGER = """
CREATE TRIGGER audit_auditevent_no_change
    BEFORE UPDATE OR DELETE ON audit_auditevent
    FOR EACH ROW EXECUTE FUNCTION audit_auditevent_append_only()
"""

CREATE_TRUNCATE_TRIGGER = """
CREATE TRIGGER audit_auditevent_no_truncate
    BEFORE TRUNCATE ON audit_auditevent
    FOR EACH STATEMENT EXECUTE FUNCTION audit_auditevent_append_only()
"""


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]

    operations = [
        migrations.RunSQL(
            sql=[CREATE_FUNCTION, CREATE_ROW_TRIGGER, CREATE_TRUNCATE_TRIGGER],
            reverse_sql=[
                "DROP TRIGGER audit_auditevent_no_truncate ON audit_auditevent",
                "DROP TRIGGER audit_auditevent_no_change ON audit_auditevent",
                "DROP FUNCTION audit_auditevent_append_only()",
            ],
        ),
    ]
