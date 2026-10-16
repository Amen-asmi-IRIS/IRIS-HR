import datetime as dt
import json
from decimal import Decimal

import pytest
from django.utils import translation

from apps.audit.models import AuditEvent
from apps.calendar.models import PublicHoliday
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.notifications import services as notification_services
from apps.notifications.models import Notification
from apps.requests import services
from apps.requests.models import RequestStep
from apps.requests.services import StepSpec
from apps.requests.tests.helpers import (
    MON,
    NEXT_MON,
    NOW,
    TODAY,
    TUE,
    days,
    draft,
    fresh,
    steps,
    stored,
    submitted,
)
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db


def test_sending_validates_copies_the_chain_and_tells_the_manager(world):
    request = submitted(world, data=days(MON, TUE))
    assert (request.status, request.version, request.submitted_at, request.quantity) == (
        "pending",
        2,
        NOW,
        Decimal("2.00"),
    )
    assert [(step.approver_rule, step.status) for step in steps(request)] == [
        ("line_manager", "pending"),
        ("hr_role", "waiting"),
    ]
    assert Notification.objects.filter(event_code="step.to_decide", user=world.manager_user).count() == 1
    event = AuditEvent.objects.get(action="request.submitted")
    assert event.object_id == str(request.public_id)
    assert event.changes == {"status": {"before": "draft", "after": "pending"}}


def test_a_request_that_breaks_a_rule_is_not_sent(world):
    stored(world, data=days(MON))
    request = draft(world, request_type=world.remote, data=days(MON))
    with pytest.raises(DomainError) as error:
        services.submit(actor=world.owner_user, request=request)
    assert error.value.code == "request.overlap"
    assert [problem.field for problem in error.value.problems] == ["start_date"]
    assert fresh(request).status == "draft"
    assert not RequestStep.objects.filter(request=request).exists()


def test_second_submit_is_refused(world):
    request = draft(world)
    services.submit(actor=world.owner_user, request=request, expected_version=1)
    with pytest.raises(Conflict) as error:
        services.submit(actor=world.owner_user, request=request, expected_version=1)
    assert error.value.code == "request.already_processed"
    with pytest.raises(Conflict):
        services.submit(actor=world.owner_user, request=request)  # no version given: still refused
    assert RequestStep.objects.filter(request=request).count() == 2
    assert Notification.objects.filter(event_code="step.to_decide").count() == 1


def test_only_its_creator_sends_a_draft(world):
    request = draft(world)
    with pytest.raises(NotAllowed):
        services.submit(actor=world.hr_user, request=request)


def test_the_balance_is_checked_on_sending_ignoring_the_request_itself(world, port):
    request = submitted(world, data=days(MON))
    assert port.checks == [
        {"employee_id": world.owner.pk, "new_days": {MON: Decimal("1")}, "ignoring_request_id": request.pk}
    ]
    assert port.taken == []  # nothing is posted before final approval


def test_an_insufficient_balance_stops_the_sending(world, port):
    port.ok = False
    request = draft(world)
    with pytest.raises(DomainError) as error:
        services.submit(actor=world.owner_user, request=request)
    assert error.value.code == "request.balance_insufficient"
    assert error.value.problems[0].params == {"shortfall": Decimal("1.5")}


def test_an_hr_exception_is_sent_without_the_balance_check_and_follows_the_normal_chain(world, port):
    port.ok = False
    request = submitted(world, actor=world.hr_user, override_reason="Accord de la direction")
    assert request.status == "pending"
    assert port.checks == []
    assert [(step.approver_rule, step.status) for step in steps(request)] == [
        ("line_manager", "pending"),
        ("hr_role", "waiting"),
    ]


def test_sick_leave_gets_a_certificate_deadline_from_the_hr_setting(world):
    request = submitted(world, request_type=world.sick, data=days(TODAY))
    assert request.certificate_due_at == NOW + dt.timedelta(hours=48)


def test_the_type_can_set_its_own_deadline(world):
    world.sick.document_deadline_hours = 24
    world.sick.save()
    request = submitted(world, request_type=world.sick, data=days(TODAY))
    assert request.certificate_due_at == NOW + dt.timedelta(hours=24)


def test_changing_the_setting_changes_the_deadline_of_later_requests(world):
    settings_service.set_value(actor=world.hr_user, key="certificate_deadline_hours", value=72)
    request = submitted(world, request_type=world.sick, data=days(TODAY))
    assert request.certificate_due_at == NOW + dt.timedelta(hours=72)


def test_types_without_a_required_document_have_no_deadline(world):
    assert submitted(world).certificate_due_at is None


def test_chain_edited_after_submission_does_not_change_the_request(world):
    request = submitted(world, request_type=world.remote)
    services.replace_steps(
        actor=world.hr_user, request_type=world.remote, steps=[StepSpec(approver_rule="hr_role")]
    )
    assert [(step.approver_rule, step.status) for step in steps(request)] == [
        ("line_manager", "pending"),
        ("hr_role", "waiting"),
    ]
    later = submitted(world, request_type=world.remote, data=days(NEXT_MON))
    assert [step.approver_rule for step in steps(later)] == ["hr_role"]


def test_the_quantity_is_recomputed_when_sending(world):
    request = draft(world, data=days(MON, TUE))
    assert request.quantity == Decimal("2.00")
    PublicHoliday.objects.create(date=TUE, name_fr="Férié", name_en="Holiday")
    sent = services.submit(actor=world.owner_user, request=request)
    assert sent.quantity == Decimal("1.00")


# ------------------------------------------------------------------ sent in someone's name (master D45)

SENT_FOR = "request.sent_on_behalf"


def sent_for(user):
    return Notification.objects.filter(event_code=SENT_FOR, user=user)


def test_the_employee_is_told_when_someone_else_sends_a_request_in_their_name(world):
    request = submitted(
        world, actor=world.hr_user, data=days(MON, TUE), override_reason="Accord du directeur"
    )

    (notice,) = sent_for(world.owner_user)
    assert (notice.target_type, notice.target_public_id) == ("request", str(request.public_id))
    assert notice.parameters == {
        "employee": "Amal Employee",
        "start": "02/11/2026",
        "end": "03/11/2026",
        "by": "Senna RH",
    }
    with translation.override("en"):
        assert notification_services.render(notice) == {
            "title": "A request was sent in your name",
            "body": "Senna RH sent it for you: 02/11/2026 to 03/11/2026. Open it to check the details.",
            "link": f"/requests/{request.public_id}",
        }
    assert sent_for(world.hr_user).count() == 0
    assert Notification.objects.filter(event_code="step.to_decide", user=world.manager_user).count() == 1


def test_nobody_is_told_of_what_they_sent_themselves(world):
    submitted(world, data=days(MON))
    submitted(world, employee=world.hr, actor=world.hr_user, data=days(TUE))
    assert not Notification.objects.filter(event_code=SENT_FOR).exists()


def test_sending_again_a_returned_request_in_someones_name_tells_them_again(world):
    request = submitted(world, actor=world.hr_user, data=days(MON))
    current = fresh(request)
    services.decide_step(
        actor=world.manager_user,
        step=RequestStep.objects.get(request=request, status="pending"),
        decision="return",
        comment="Dates à confirmer",
        expected_version=current.version,
    )
    returned = fresh(request)
    services.submit(actor=world.hr_user, request=returned, expected_version=returned.version)
    assert sent_for(world.owner_user).count() == 2


def test_a_sick_leave_declared_by_hr_is_announced_without_its_comment(world):
    submitted(
        world, actor=world.hr_user, request_type=world.sick, data=days(TODAY, comment="ZZ-SECRET-GRIPPE")
    )
    (notice,) = sent_for(world.owner_user)
    carried = json.dumps([notice.parameters, notification_services.render(notice)]).lower()
    assert "zz-secret" not in carried
