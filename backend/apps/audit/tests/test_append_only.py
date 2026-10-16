import pytest
from django.db import DatabaseError, connection, transaction

from apps.audit import services as audit
from apps.audit.models import AuditEvent
from tests.db import truncate_guards

pytestmark = pytest.mark.django_db


@pytest.fixture
def event():
    return audit.record(action="thing.done", actor=None)


def test_an_event_cannot_be_updated(event):
    with pytest.raises(DatabaseError), transaction.atomic():
        AuditEvent.objects.filter(pk=event.pk).update(action="rewritten")

    event.refresh_from_db()
    assert event.action == "thing.done"


def test_saving_an_existing_event_again_is_refused(event):
    event.action = "rewritten"

    with pytest.raises(DatabaseError), transaction.atomic():
        event.save()


def test_an_event_cannot_be_deleted(event):
    with pytest.raises(DatabaseError), transaction.atomic():
        event.delete()
    with pytest.raises(DatabaseError), transaction.atomic():
        AuditEvent.objects.all().delete()

    assert AuditEvent.objects.filter(pk=event.pk).exists()


@pytest.mark.parametrize(
    "statement",
    ["UPDATE audit_auditevent SET action = 'rewritten'", "DELETE FROM audit_auditevent"],
)
def test_plain_sql_is_refused_too(event, statement):
    with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(statement)

    assert AuditEvent.objects.get(pk=event.pk).action == "thing.done"


def test_the_table_cannot_be_emptied(event):
    # The guard is switched off in the test database (see conftest.py); switch it on for this test.
    # The insert above left a deferred foreign-key check pending, and PostgreSQL refuses ALTER TABLE until it has run.
    connection.check_constraints()
    with connection.cursor() as cursor:
        cursor.execute("ALTER TABLE audit_auditevent ENABLE TRIGGER audit_auditevent_no_truncate")

    with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("TRUNCATE audit_auditevent")

    assert AuditEvent.objects.filter(pk=event.pk).exists()


def test_the_truncate_guard_exists():
    assert ("audit_auditevent", "audit_auditevent_no_truncate") in truncate_guards()


def test_events_can_still_be_added_and_read(event):
    audit.record(action="another.thing", actor=None)

    assert AuditEvent.objects.count() == 2
