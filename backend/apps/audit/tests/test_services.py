import uuid
from datetime import date
from decimal import Decimal

import pytest

from apps.accounts.models import RoleAssignment
from apps.accounts.tests.world import make_user
from apps.audit import services as audit
from apps.audit.models import AuditEvent
from apps.core import context

pytestmark = pytest.mark.django_db


def test_record_stores_who_did_what_to_what():
    actor = make_user("hr@impactrisks.com")
    target = make_user("sami@impactrisks.com")

    event = audit.record(
        action="account.disabled",
        category=audit.SECURITY,
        obj=target,
        actor=actor,
        changes={"is_active": {"before": True, "after": False}},
    )

    event.refresh_from_db()
    assert event.actor == actor
    assert event.category == "security"
    assert event.action == "account.disabled"
    assert event.object_type == "user"
    assert event.object_id == str(target.public_id)
    assert event.object_label == "sami@impactrisks.com"
    assert event.changes == {"is_active": {"before": True, "after": False}}
    assert event.at is not None


def test_an_event_is_a_business_event_unless_stated():
    assert audit.record(action="thing.done", actor=None).category == audit.BUSINESS == "business"


def test_an_object_without_a_public_id_is_identified_by_its_key():
    assignment = RoleAssignment.objects.create(user=make_user(), role="hr")

    event = audit.record(action="role.assigned", obj=assignment, actor=None)

    assert event.object_type == "roleassignment"
    assert event.object_id == str(assignment.pk)


def test_the_item_can_be_described_without_a_model_instance():
    event = audit.record(
        action="setting.changed",
        object_type="setting",
        object_id="lockout_minutes",
        object_label="lockout_minutes",
        actor=None,
    )

    assert (event.object_type, event.object_id, event.object_label) == (
        "setting",
        "lockout_minutes",
        "lockout_minutes",
    )


def test_explicit_item_fields_win_over_those_derived_from_the_instance():
    target = make_user("sami@impactrisks.com")

    event = audit.record(action="thing.done", obj=target, object_label="Sami Ben Ali", actor=None)

    assert event.object_label == "Sami Ben Ali"
    assert event.object_id == str(target.public_id)


def test_actor_address_and_reference_default_to_the_current_context():
    user = make_user()

    with context.overriding(actor=user, ip="10.0.0.9", request_id="rid-1"):
        event = audit.record(action="thing.done")

    assert event.actor == user
    assert event.ip_address == "10.0.0.9"
    assert event.request_id == "rid-1"


def test_none_means_the_system_even_inside_a_users_request():
    with context.overriding(actor=make_user()):
        event = audit.record(action="credit.posted", actor=None)

    assert event.actor is None


def test_outside_a_request_there_is_no_actor_and_no_address():
    event = audit.record(action="thing.done")

    assert event.actor is None
    assert event.ip_address is None
    assert event.request_id == ""


def test_an_address_that_is_not_an_ip_is_dropped():
    with context.overriding(ip="not-an-address"):
        assert audit.record(action="thing.done").ip_address is None


def test_a_long_label_is_cut_to_200_characters():
    event = audit.record(
        action="thing.done", object_type="x", object_id="1", object_label="n" * 500, actor=None
    )

    assert len(event.object_label) == 200


def test_changes_may_hold_dates_decimals_and_identifiers():
    identifier = uuid.uuid4()

    event = audit.record(
        action="thing.done",
        actor=None,
        changes={"day": date(2026, 10, 6), "amount": Decimal("2.5"), "id": identifier},
    )

    event.refresh_from_db()
    assert event.changes == {"day": "2026-10-06", "amount": "2.5", "id": str(identifier)}


def test_snapshot_reads_values_and_gives_keys_for_relations():
    creator = make_user()
    user = make_user("sami@impactrisks.com", created_by=creator)

    assert audit.snapshot(user, ["email", "is_active", "created_by"]) == {
        "email": "sami@impactrisks.com",
        "is_active": True,
        "created_by": creator.pk,
    }


def test_diff_keeps_only_what_changed():
    before = {"phone": "111", "address": "Tunis", "status": "active"}
    after = {"phone": "222", "address": "Tunis", "status": "archived"}

    assert audit.diff(before, after) == {
        "phone": {"before": "111", "after": "222"},
        "status": {"before": "active", "after": "archived"},
    }


def test_diff_never_copies_a_redacted_value():
    before = {"comment": "I have the flu", "days": 2, "note": "same"}
    after = {"comment": "I broke my arm", "days": 3, "note": "same"}

    result = audit.diff(before, after, redact=["comment", "note"])

    assert result == {"comment": {"changed": True}, "days": {"before": 2, "after": 3}}
    assert "flu" not in str(result)


def test_diff_sees_keys_present_on_one_side_only():
    assert audit.diff({"a": 1}, {"b": 2}) == {
        "a": {"before": 1, "after": None},
        "b": {"before": None, "after": 2},
    }


def test_events_are_read_newest_first():
    first = audit.record(action="first", actor=None)
    second = audit.record(action="second", actor=None)

    assert list(AuditEvent.objects.all()) == [second, first]
