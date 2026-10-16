import datetime as dt
import json
from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.requests import services
from apps.requests.models import Request, RequestStatus
from apps.requests.tests.helpers import FRI, MON, TODAY, TUE, WED, days, stored

pytestmark = pytest.mark.django_db


def test_an_employee_saves_a_draft_for_themselves(world):
    request = services.create_draft(
        actor=world.owner_user,
        employee=world.owner,
        request_type=world.annual,
        data=days(MON, TUE, comment=" Vacances "),
    )
    assert (request.status, request.version, request.quantity) == ("draft", 1, Decimal("2.00"))
    assert (request.comment, request.created_by, request.sensitive) == ("Vacances", world.owner_user, False)
    event = AuditEvent.objects.get(action="request.created")
    assert (event.object_type, event.object_id, event.actor) == (
        "request",
        str(request.public_id),
        world.owner_user,
    )


def test_a_draft_may_break_rules_that_are_only_checked_on_sending(world):
    stored(world, data=days(MON))
    draft = services.create_draft(
        actor=world.owner_user, employee=world.owner, request_type=world.remote, data=days(MON)
    )
    assert draft.status == "draft"


def test_a_draft_must_have_a_computable_shape(world):
    with pytest.raises(DomainError) as error:
        services.create_draft(
            actor=world.owner_user, employee=world.owner, request_type=world.annual, data=days(FRI, MON)
        )
    assert error.value.code == "request.end_before_start"
    assert not Request.objects.exists()


def test_what_a_type_has_no_use_for_is_never_stored(world):
    """An event on a leave that has none, times on a leave counted in days: sent by a form, kept nowhere."""
    with_extras = services.create_draft(
        actor=world.owner_user,
        employee=world.owner,
        request_type=world.annual,
        data=days(MON, exceptional_event_id=world.event.pk, start_time=dt.time(9), end_time=dt.time(10)),
    )
    assert (with_extras.exceptional_event_id, with_extras.start_time, with_extras.end_time) == (
        None,
        None,
        None,
    )

    unknown_event = services.create_draft(
        actor=world.owner_user,
        employee=world.owner,
        request_type=world.annual,
        data=days(TUE, exceptional_event_id=987654),
    )
    assert unknown_event.exceptional_event_id is None

    edited = services.update_request(
        actor=world.owner_user,
        request=unknown_event,
        data=days(WED, exceptional_event_id=world.event.pk, start_time=dt.time(9)),
        expected_version=1,
    )
    assert (edited.start_date, edited.exceptional_event_id, edited.start_time) == (WED, None, None)


def test_nobody_but_hr_creates_a_request_for_someone_else(world):
    with pytest.raises(NotAllowed):
        services.create_draft(
            actor=world.manager_user, employee=world.owner, request_type=world.annual, data=days(MON)
        )


def test_hr_creates_for_an_employee_with_an_exception(world):
    request = services.create_draft(
        actor=world.hr_user,
        employee=world.owner,
        request_type=world.annual,
        data=days(MON),
        override_reason=" Accord de la direction ",
    )
    assert (request.employee, request.created_by, request.override_reason) == (
        world.owner,
        world.hr_user,
        "Accord de la direction",
    )


def test_an_exception_is_for_hr_only_and_never_for_oneself(world):
    with pytest.raises(NotAllowed):
        services.create_draft(
            actor=world.owner_user,
            employee=world.owner,
            request_type=world.annual,
            data=days(MON),
            override_reason="Je le vaux bien",
        )
    with pytest.raises(NotAllowed) as error:
        services.create_draft(
            actor=world.hr_user,
            employee=world.hr,
            request_type=world.annual,
            data=days(MON),
            override_reason="Pour moi",
        )
    assert error.value.code == "request.own_request"


def test_sick_leave_comment_is_redacted_in_the_audit_trail(world):
    request = services.create_draft(
        actor=world.owner_user,
        employee=world.owner,
        request_type=world.sick,
        data=days(TODAY, comment="Grippe sévère"),
    )
    assert request.sensitive is True
    created = AuditEvent.objects.get(action="request.created")
    assert created.changes["comment"] == {"changed": True}
    services.update_request(
        actor=world.owner_user, request=request, data=days(TODAY, comment="Angine"), expected_version=1
    )
    updated = AuditEvent.objects.get(action="request.updated")
    assert updated.changes["comment"] == {"changed": True}
    everything = json.dumps(
        [created.changes, updated.changes, created.object_label, updated.object_label], default=str
    )
    assert "Grippe" not in everything
    assert "Angine" not in everything


def test_the_reason_of_an_exception_on_a_sick_leave_is_redacted_too(world):
    """HR types that reason freely: on a sick leave it may say what the comment says."""
    request = services.create_draft(
        actor=world.hr_user,
        employee=world.owner,
        request_type=world.sick,
        data=days(TODAY),
        override_reason="Hospitalisation, certificat à suivre",
    )
    assert request.override_reason == "Hospitalisation, certificat à suivre"
    created = AuditEvent.objects.get(action="request.created")
    assert created.changes["override_reason"] == {"changed": True}
    assert "Hospitalisation" not in json.dumps([created.changes, created.object_label], default=str)


def test_editing_a_draft_recomputes_the_quantity_and_bumps_the_version(world):
    draft = services.create_draft(
        actor=world.owner_user, employee=world.owner, request_type=world.annual, data=days(MON)
    )
    updated = services.update_request(
        actor=world.owner_user, request=draft, data=days(MON, WED, ends_at_midday=True), expected_version=1
    )
    assert (updated.quantity, updated.version, updated.end_date) == (Decimal("2.50"), 2, WED)
    event = AuditEvent.objects.get(action="request.updated")
    assert event.changes["end_date"]["after"] == "2026-11-04"


def test_a_stale_version_is_refused_on_edit(world):
    draft = services.create_draft(
        actor=world.owner_user, employee=world.owner, request_type=world.annual, data=days(MON)
    )
    with pytest.raises(Conflict) as error:
        services.update_request(actor=world.owner_user, request=draft, data=days(TUE), expected_version=7)
    assert error.value.code == "request.already_processed"


def test_only_its_creator_edits_a_draft(world):
    draft = services.create_draft(
        actor=world.owner_user, employee=world.owner, request_type=world.annual, data=days(MON)
    )
    with pytest.raises(NotAllowed):
        services.update_request(actor=world.hr_user, request=draft, data=days(TUE), expected_version=1)


def test_an_approved_request_is_not_editable(world):
    approved = stored(world, data=days(MON))
    with pytest.raises(Conflict) as error:
        services.update_request(actor=world.owner_user, request=approved, data=days(TUE), expected_version=1)
    assert error.value.code == "request.not_editable"


def test_discarding_a_draft_deletes_it_and_is_audited(world):
    draft = services.create_draft(
        actor=world.owner_user, employee=world.owner, request_type=world.annual, data=days(MON)
    )
    public_id = str(draft.public_id)
    services.discard_draft(actor=world.owner_user, request=draft)
    assert not Request.objects.exists()
    assert AuditEvent.objects.filter(action="request.discarded", object_id=public_id).exists()


def test_a_request_that_was_sent_cannot_be_discarded(world):
    returned = stored(world, data=days(MON), status=RequestStatus.RETURNED)
    with pytest.raises(Conflict) as error:
        services.discard_draft(actor=world.owner_user, request=returned)
    assert error.value.code == "request.not_editable"
