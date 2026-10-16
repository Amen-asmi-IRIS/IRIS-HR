import datetime as dt

import pytest

from apps.accounts import services as account_services
from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.notifications.models import Notification
from apps.organisation.selectors import full_name
from apps.organisation.tests.world import make_delegation
from apps.requests import services
from apps.requests.models import RequestAttachment
from apps.requests.tests.helpers import NOW, TODAY, days, decide, fresh, pdf, pending_step, steps, submitted

pytestmark = pytest.mark.django_db

TWO_HOURS_AGO = NOW - dt.timedelta(hours=2)


def record(world, request, **overrides):
    current = fresh(request)
    options = {
        "actor": world.hr_user,
        "step": pending_step(current),
        "decided_by": world.manager,
        "decision": "approve",
        "decided_at": TWO_HOURS_AGO,
        "channel": "verbal",
        "note": "Accord donné par téléphone",
        "expected_version": current.version,
    }
    options.update(overrides)
    return services.record_on_behalf(**options)


def test_hr_records_a_verbal_approval_of_the_manager(world):
    request = submitted(world)
    result = record(world, request)
    first, second = steps(request)
    assert (
        first.status,
        first.decided_by,
        first.recorded_by,
        first.channel,
        first.comment,
        first.decided_at,
    ) == (
        "approved",
        world.manager,
        world.hr_user,
        "verbal",
        "Accord donné par téléphone",
        TWO_HOURS_AGO,
    )
    assert (second.status, result.status, result.version) == ("pending", "pending", 3)
    event = AuditEvent.objects.get(action="step.recorded_on_behalf")
    assert (event.actor, event.object_id) == (world.hr_user, str(request.public_id))
    assert event.changes["decided_by"] == {"before": None, "after": full_name(world.manager)}
    assert event.changes["channel"] == {"before": None, "after": "verbal"}
    assert event.changes["decision"] == {"before": None, "after": "approve"}


def test_a_paper_decision_can_carry_the_scan_of_the_signed_form(world):
    request = submitted(world)
    record(world, request, channel="paper", scan=pdf("formulaire-signe.pdf"))
    link = RequestAttachment.objects.get(request=request)
    assert (link.attachment.kind, link.step, link.added_by) == (
        "scanned_form",
        steps(request)[0],
        world.hr_user,
    )
    assert link.attachment.is_encrypted is False
    assert services.may_read_attachment(world.manager_user, link.attachment) is True
    assert services.may_read_attachment(world.peer_user, link.attachment) is False


def test_a_scan_on_a_sick_leave_is_as_restricted_as_the_certificate(world):
    request = submitted(world, request_type=world.sick, data=days(TODAY))
    record(world, request, decided_by=world.hr, channel="paper", scan=pdf())
    link = RequestAttachment.objects.get(request=request)
    assert link.attachment.kind == "scanned_form"
    # A form signed for a sick leave may say why: it is kept like the certificate, and never named in the trail.
    assert link.attachment.is_encrypted is True
    labels = list(AuditEvent.objects.values_list("object_label", flat=True))
    assert not any("certificat" in label for label in labels)
    assert services.may_read_attachment(world.owner_user, link.attachment) is True
    assert services.may_read_attachment(world.hr_user, link.attachment) is True
    assert services.may_read_attachment(world.manager_user, link.attachment) is False
    assert services.may_read_attachment(world.exec_user, link.attachment) is False


def test_a_recorded_refusal_closes_the_request(world):
    request = submitted(world)
    result = record(world, request, decision="reject", note="Refus du responsable, période chargée")
    assert result.status == "rejected"
    assert steps(request)[0].status == "rejected"


def test_the_note_is_mandatory(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        record(world, request, note="   ")
    assert error.value.code == "request.comment_required"


def test_the_channel_is_verbal_or_paper(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        record(world, request, channel="in_app")
    assert error.value.code == "request.channel_invalid"


def test_the_decision_cannot_be_dated_in_the_future(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        record(world, request, decided_at=NOW + dt.timedelta(hours=1))
    assert error.value.code == "request.decided_at_future"


def test_only_hr_records_on_behalf(world):
    request = submitted(world)
    with pytest.raises(NotAllowed):
        record(world, request, actor=world.manager_user)


def test_hr_does_not_record_on_its_own_request(world):
    request = submitted(world, employee=world.hr, actor=world.hr_user)
    with pytest.raises(NotAllowed) as error:
        record(world, request, decided_by=world.ceo)
    assert error.value.code == "request.own_request"


def test_the_requester_cannot_be_the_one_who_decided(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        record(world, request, decided_by=world.owner)
    assert error.value.code == "request.own_request"


def test_the_one_who_decided_is_someone_the_step_is_for(world):
    """REQ-10: a decision is recorded for an approver of the step, never for somebody else."""
    request = submitted(world)
    for stranger in (world.peer, world.other_manager, world.ceo, world.hr):
        with pytest.raises(DomainError) as error:
            record(world, request, decided_by=stranger)
        assert (error.value.code, error.value.field) == ("request.decided_by_not_approver", "decided_by")
    assert pending_step(request).decided_by is None
    assert not AuditEvent.objects.filter(action="step.recorded_on_behalf").exists()


def test_a_delegate_of_the_manager_can_be_the_one_who_decided(world):
    make_delegation(world, manager=world.manager, delegate=world.other_manager, start=TODAY)
    request = submitted(world)
    record(world, request, decided_by=world.other_manager)
    assert steps(request)[0].decided_by == world.other_manager


def test_on_an_hr_step_the_one_who_decided_holds_the_hr_role(world):
    request = submitted(world)
    decide(request, world.manager_user)
    for stranger in (world.manager, world.ceo):
        with pytest.raises(DomainError) as error:
            record(world, request, decided_by=stranger)
        assert error.value.code == "request.decided_by_not_approver"
    record(world, request, decided_by=world.hr)
    assert steps(request)[1].decided_by == world.hr


def test_once_a_manager_step_is_flagged_an_hr_holder_can_be_the_one_who_decided(world):
    request = submitted(world)
    step = pending_step(request)
    step.flagged_at = NOW
    step.save(update_fields=["flagged_at"])
    record(world, request, decided_by=world.hr)
    assert steps(request)[0].decided_by == world.hr


def test_after_a_reassignment_only_the_new_approver_can_be_the_one_who_decided(world):
    request = submitted(world)
    services.reassign_step(
        actor=world.hr_user, step=pending_step(request), new_approver=world.other_manager, reason="Absence"
    )
    with pytest.raises(DomainError) as error:
        record(world, request, decided_by=world.manager)
    assert error.value.code == "request.decided_by_not_approver"
    record(world, request, decided_by=world.other_manager)
    assert steps(request)[0].decided_by == world.other_manager


def test_a_step_already_decided_cannot_be_recorded_again(world):
    request = submitted(world)
    step = pending_step(request)
    decide(request, world.manager_user)
    with pytest.raises(Conflict) as error:
        record(world, request, step=step)
    assert error.value.code == "request.already_processed"
    with pytest.raises(Conflict):
        record(world, request, expected_version=2)


def test_a_manager_without_an_account_can_still_have_decided(world):
    account_services.disable_account(actor=world.sysadmin_user, user=world.manager_user)
    request = submitted(world, employee=fresh(world.owner))
    assert pending_step(request).flagged_at == NOW
    result = record(world, request, channel="paper", note="Formulaire signé remis en main propre")
    assert result.status == "pending"
    assert steps(request)[0].decided_by == world.manager


def test_hr_gives_a_step_to_someone_else(world, clock):
    request = submitted(world)
    step = pending_step(request)
    step.reminded_at = NOW
    step.flagged_at = NOW
    step.save()
    clock.shift(dt.timedelta(days=1))

    moved = services.reassign_step(
        actor=world.hr_user, step=step, new_approver=world.other_manager, reason="Responsable en déplacement"
    )

    assert (moved.approver_rule, moved.named_person, moved.reminded_at, moved.flagged_at) == (
        "named_person",
        world.other_manager,
        None,
        None,
    )
    assert moved.activated_at == NOW + dt.timedelta(days=1)
    assert fresh(request).version == 3
    assert (
        Notification.objects.filter(event_code="step.to_decide", user=world.other_manager_user).count() == 1
    )
    assert services.can_act_on(world.other_manager_user, moved) is True
    assert services.can_act_on(world.manager_user, moved) is False
    event = AuditEvent.objects.get(action="step.reassigned")
    assert event.changes["approver"]["after"] == full_name(world.other_manager)
    assert event.changes["reason"] == {"before": None, "after": "Responsable en déplacement"}


def test_reassigning_needs_a_reason(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        services.reassign_step(
            actor=world.hr_user, step=pending_step(request), new_approver=world.other_manager, reason=" "
        )
    assert error.value.code == "request.reason_required"


def test_the_new_approver_cannot_be_the_requester(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        services.reassign_step(
            actor=world.hr_user, step=pending_step(request), new_approver=world.owner, reason="Test"
        )
    assert error.value.code == "request.own_request"


def test_the_new_approver_needs_an_account(world):
    account_services.disable_account(actor=world.sysadmin_user, user=world.other_manager_user)
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        services.reassign_step(
            actor=world.hr_user,
            step=pending_step(request),
            new_approver=fresh(world.other_manager),
            reason="Test",
        )
    assert error.value.code == "request.approver_without_account"


def test_only_hr_reassigns_and_only_an_open_step(world):
    request = submitted(world)
    step = pending_step(request)
    with pytest.raises(NotAllowed):
        services.reassign_step(
            actor=world.manager_user, step=step, new_approver=world.other_manager, reason="Test"
        )
    decide(request, world.manager_user)
    with pytest.raises(Conflict) as error:
        services.reassign_step(
            actor=world.hr_user, step=step, new_approver=world.other_manager, reason="Test"
        )
    assert error.value.code == "request.already_processed"
