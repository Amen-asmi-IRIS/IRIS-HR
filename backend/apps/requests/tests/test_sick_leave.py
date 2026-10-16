import datetime as dt
import json
from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed, NotFound
from apps.notifications.models import Notification
from apps.requests import services
from apps.requests.tests.helpers import TODAY, days, decide, fresh, pdf, pending_step, steps, submitted

pytestmark = pytest.mark.django_db

YESTERDAY = dt.date(2026, 10, 5)


def sick(world, **options):
    options.setdefault("data", days(TODAY, comment="Grippe sévère"))
    return submitted(world, request_type=world.sick, **options)


def test_a_sick_leave_is_declared_for_past_days_and_waits_for_hr(world):
    request = sick(world, data=days(YESTERDAY, TODAY, comment="Grippe"))
    assert (request.status, request.sensitive, request.quantity) == ("pending", True, Decimal("2.00"))
    assert [(step.mode, step.status) for step in steps(request)] == [
        ("notify", "notified"),
        ("approve", "pending"),
    ]
    assert Notification.objects.filter(event_code="sick.declared", user=world.manager_user).count() == 1
    assert Notification.objects.filter(event_code="step.to_decide", user=world.hr_user).count() == 1


def test_hr_declares_a_sick_leave_for_an_employee(world):
    request = sick(world, actor=world.hr_user, data=days(YESTERDAY))
    assert (request.status, request.created_by, request.override_reason) == ("pending", world.hr_user, "")


def test_the_manager_has_nothing_to_decide_on_a_sick_leave(world):
    request = sick(world)
    assert services.can_act_on(world.manager_user, pending_step(request)) is False
    with pytest.raises(NotFound):
        decide(request, world.manager_user)


def test_hr_approves_a_sick_leave_without_touching_the_balance(world, port):
    request = sick(world)
    result = decide(request, world.hr_user)
    assert result.status == "approved"
    assert (port.checks, port.taken) == ([], [])


def test_an_extension_is_a_new_adjacent_request(world):
    decide(sick(world), world.hr_user)
    extension = sick(world, data=days(dt.date(2026, 10, 7), dt.date(2026, 10, 8)))
    assert extension.status == "pending"


def test_hr_counts_a_sick_leave_as_annual_leave(world, port):
    request = sick(world)
    result = services.reclassify_as_annual(actor=world.hr_user, request=request)
    assert (result.status, result.request_type.code, result.reclassified_from.code) == (
        "approved",
        "annual",
        "sick",
    )
    assert (result.sensitive, result.certificate_due_at, result.quantity) == (True, None, Decimal("1.00"))
    assert port.taken == [
        {
            "request_id": request.pk,
            "employee_id": world.owner.pk,
            "days": {TODAY: Decimal("1")},
            "actor": world.hr_user,
        }
    ]
    hr_step = steps(request)[1]
    assert (hr_step.status, hr_step.decided_by, hr_step.channel) == ("approved", world.hr, "in_app")
    event = AuditEvent.objects.get(action="request.reclassified")
    assert event.changes["type"] == {"before": "sick", "after": "annual"}
    events = set(Notification.objects.filter(user=world.owner_user).values_list("event_code", flat=True))
    assert {"request.corrected", "request.approved"} <= events


def test_reclassifying_checks_the_balance_unless_hr_gives_an_exception(world, port):
    request = sick(world)
    port.ok = False
    with pytest.raises(DomainError) as error:
        services.reclassify_as_annual(actor=world.hr_user, request=request)
    assert error.value.code == "request.balance_insufficient"
    assert fresh(request).request_type.code == "sick"
    result = services.reclassify_as_annual(
        actor=world.hr_user, request=fresh(request), override_reason="Accord de la direction"
    )
    assert (result.status, result.override_reason) == ("approved", "Accord de la direction")
    assert len(port.taken) == 1


def test_the_comment_and_the_certificate_stay_restricted_after_reclassification(world):
    request = sick(world)
    link = services.attach_file(actor=world.owner_user, request=request, upload=pdf())
    services.reclassify_as_annual(actor=world.hr_user, request=fresh(request))
    assert fresh(request).sensitive is True
    assert services.may_read_attachment(world.manager_user, link.attachment) is False
    assert services.may_read_attachment(world.exec_user, link.attachment) is False
    trail = json.dumps(list(AuditEvent.objects.values_list("changes", "object_label")), default=str)
    assert "Grippe" not in trail


def test_the_reason_hr_gives_later_on_a_reclassified_sick_leave_stays_out_of_the_ledger(world, port):
    """The ledger is read by the manager: what HR writes about a sick leave must not reach it."""
    request = sick(world, data=days(dt.date(2026, 11, 2), dt.date(2026, 11, 3), comment="Grippe"))
    services.reclassify_as_annual(actor=world.hr_user, request=request)

    services.hr_correct(
        actor=world.hr_user,
        request=fresh(request),
        data=days(dt.date(2026, 11, 2)),
        reason="Certificat reçu pour le second jour",
    )
    services.hr_cancel(actor=world.hr_user, request=fresh(request), reason="C'était bien un arrêt maladie")

    assert [entry["reason"] for entry in port.restored] == ["", ""]
    assert [entry["days"] for entry in port.restored] == [
        {dt.date(2026, 11, 3): Decimal("1")},
        {dt.date(2026, 11, 2): Decimal("1")},
    ]


def test_only_a_sick_leave_waiting_for_hr_can_be_reclassified(world):
    annual = submitted(world, data=days(dt.date(2026, 11, 2)))
    with pytest.raises(Conflict) as error:
        services.reclassify_as_annual(actor=world.hr_user, request=annual)
    assert error.value.code == "request.not_reclassifiable"
    done = sick(world)
    decide(done, world.hr_user)
    with pytest.raises(Conflict):
        services.reclassify_as_annual(actor=world.hr_user, request=fresh(done))


def test_reclassifying_is_for_hr_and_never_on_ones_own_sick_leave(world):
    request = sick(world)
    with pytest.raises(NotAllowed):
        services.reclassify_as_annual(actor=world.exec_user, request=request)
    own = sick(world, employee=world.hr, actor=world.hr_user)
    with pytest.raises(NotAllowed) as error:
        services.reclassify_as_annual(actor=world.hr_user, request=own)
    assert error.value.code == "request.own_request"


def test_notifications_never_carry_the_comment(world):
    request = sick(world)
    services.attach_file(actor=world.owner_user, request=request, upload=pdf("certificat-grippe.pdf"))
    decide(request, world.hr_user, "return", "Certificat illisible")
    returned = fresh(request)
    services.submit(actor=world.owner_user, request=returned, expected_version=returned.version)
    decide(request, world.hr_user)

    assert Notification.objects.count() >= 6
    carried = json.dumps(
        list(Notification.objects.values_list("event_code", "parameters", "target_public_id")), default=str
    ).lower()
    for secret in ("grippe", "certificat", "illisible"):
        assert secret not in carried


def test_decision_comments_on_a_sick_leave_stay_out_of_the_audit_trail(world):
    request = sick(world)
    decide(request, world.hr_user, "reject", "Certificat non conforme")
    event = AuditEvent.objects.get(action="step.decided")
    assert event.changes["comment"] == {"changed": True}
    trail = json.dumps(list(AuditEvent.objects.values_list("changes", "object_label")), default=str)
    assert "non conforme" not in trail
    assert "Grippe" not in trail
    assert steps(request)[1].comment == "Certificat non conforme"  # the step keeps it for the employee and HR
