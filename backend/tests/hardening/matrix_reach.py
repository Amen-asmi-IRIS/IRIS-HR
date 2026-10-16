"""Row-level permission cases: one object owned by `owner`, called by every persona."""

from __future__ import annotations

from datetime import date, timedelta

from django.utils import timezone

from apps.notifications.models import Notification
from apps.organisation import services as organisation_services
from apps.requests import services as request_services
from apps.requests.models import RequestStep, StepStatus
from apps.requests.services import RequestData
from tests.hardening.helpers import pdf
from tests.matrix import Case, P, only

EVERY_EMPLOYEE = [P.OWNER, P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC]


def _monday(weeks_ahead: int = 0) -> date:
    today = timezone.localdate()
    return today - timedelta(days=today.weekday()) + timedelta(weeks=weeks_ahead)


def _memo(world, key: str, build):
    cache = world.__dict__.setdefault("_hardening", {})
    if key not in cache:
        cache[key] = build()
    return cache[key]


def remote_request(w):
    """A pending remote-work day of `owner`, waiting for `manager`."""

    def build():
        day = _monday(2)
        draft = request_services.create_draft(
            actor=w.owner_user,
            employee=w.owner,
            request_type=w.remote,
            data=RequestData(start_date=day, end_date=day, comment="Plumber at home"),
        )
        return request_services.submit(actor=w.owner_user, request=draft)

    return _memo(w, "remote_request", build)


def remote_draft(w):
    def build():
        day = _monday(3)
        return request_services.create_draft(
            actor=w.owner_user,
            employee=w.owner,
            request_type=w.remote,
            data=RequestData(start_date=day, end_date=day),
        )

    return _memo(w, "remote_draft", build)


def manager_step(w) -> RequestStep:
    return RequestStep.objects.get(request=remote_request(w), status=StepStatus.PENDING)


def sick_request(w):
    """A sick-leave declaration of `owner` with a certificate, waiting for HR."""

    def build():
        day = _monday(0)
        draft = request_services.create_draft(
            actor=w.owner_user,
            employee=w.owner,
            request_type=w.sick,
            data=RequestData(start_date=day, end_date=day, comment="Flu"),
        )
        request = request_services.submit(actor=w.owner_user, request=draft)
        link = request_services.attach_file(
            actor=w.owner_user, request=request, upload=pdf("certificate.pdf")
        )
        return request, link.attachment

    return _memo(w, "sick_request", build)


def proof_attachment(w):
    """The proof attached to an exceptional-leave request of `owner`."""

    def build():
        day = _monday(4)
        draft = request_services.create_draft(
            actor=w.owner_user,
            employee=w.owner,
            request_type=w.exceptional,
            data=RequestData(start_date=day, end_date=day, exceptional_event_id=w.event.id),
        )
        request = request_services.submit(actor=w.owner_user, request=draft)
        return request_services.attach_file(
            actor=w.owner_user, request=request, upload=pdf("proof.pdf")
        ).attachment

    return _memo(w, "proof_attachment", build)


def profile_change(w):
    return _memo(
        w,
        "profile_change",
        lambda: organisation_services.propose_profile_change(
            user=w.owner_user, changes={"phone": "+216 20 000 001"}
        ),
    )


def document(w, *, shared: bool):
    key = f"document_{shared}"
    return _memo(
        w,
        key,
        lambda: organisation_services.add_document(
            actor=w.hr_user,
            employee=w.owner,
            upload=pdf("contract.pdf"),
            label="Contract",
            visible_to_employee=shared,
        ),
    )


def manager_notification(w) -> Notification:
    remote_request(w)
    return Notification.objects.filter(user=w.manager_user).order_by("-id").first()


def _others(*allowed: P) -> list[P]:
    """Every persona with an employee record that is not allowed: they must get 404."""
    return [p for p in EVERY_EMPLOYEE if p not in allowed]


OWN_TEAM_ALL = only(P.OWNER, P.MANAGER, P.HR, P.EXEC, hide=[P.PEER, P.OTHER_MANAGER, P.OUTSIDER])

CASES = [
    # Employee record: own, team, all (PRD 7 "View employee record").
    Case(
        "organisation:employee-detail",
        "GET",
        OWN_TEAM_ALL,
        kwargs=lambda w: {"public_id": w.owner.public_id},
        label="reach: employee record",
    ),
    # Documents: own if shared, HR, EXEC. The manager has no access (PRD 7 "Employee documents").
    Case(
        "organisation:employee-documents",
        "GET",
        only(P.OWNER, P.HR, P.EXEC, hide=_others(P.OWNER, P.HR, P.EXEC)),
        kwargs=lambda w: {"public_id": w.owner.public_id},
        label="reach: employee documents",
    ),
    Case(
        "organisation:profile-change-detail",
        "GET",
        only(P.OWNER, P.HR, hide=_others(P.OWNER, P.HR)),
        kwargs=lambda w: {"public_id": profile_change(w).public_id},
        label="reach: profile change",
    ),
    Case(
        "organisation:profile-change-withdraw",
        "POST",
        only(P.OWNER, hide=_others(P.OWNER)),
        kwargs=lambda w: {"public_id": profile_change(w).public_id},
        label="reach: withdraw profile change",
    ),
    # Requests: own, team, all.
    Case(
        "requests:request-detail",
        "GET",
        OWN_TEAM_ALL,
        kwargs=lambda w: {"public_id": remote_request(w).public_id},
        label="reach: request",
    ),
    Case(
        "requests:request-history",
        "GET",
        OWN_TEAM_ALL,
        kwargs=lambda w: {"public_id": remote_request(w).public_id},
        label="reach: request history",
    ),
    Case(
        "requests:request-attachments",
        "GET",
        OWN_TEAM_ALL,
        kwargs=lambda w: {"public_id": remote_request(w).public_id},
        label="reach: request attachments",
    ),
    Case(
        "requests:request-amendments",
        "GET",
        OWN_TEAM_ALL,
        kwargs=lambda w: {"public_id": remote_request(w).public_id},
        label="reach: request amendments",
    ),
    Case(
        "requests:request-withdraw",
        "POST",
        # Those who may read the request are refused (403); those who may not are told it is not there (D14).
        only(P.OWNER, hide=[P.PEER, P.OTHER_MANAGER, P.OUTSIDER]),
        kwargs=lambda w: {"public_id": remote_request(w).public_id},
        body=lambda w: {},
        label="reach: withdraw",
    ),
    # Only the line manager can decide the manager step (PRD 7 "Decide manager step").
    Case(
        "requests:step-decide",
        "POST",
        only(P.MANAGER, hide=_others(P.MANAGER)),
        kwargs=lambda w: {"pk": manager_step(w).id},
        body=lambda w: {"decision": "approve", "comment": "", "version": remote_request(w).version},
        label="reach: decide manager step",
    ),
    # Balance and ledger: own, team, all.
    Case(
        "balances:figures",
        "GET",
        OWN_TEAM_ALL,
        kwargs=lambda w: {"employee_public_id": w.owner.public_id},
        label="reach: balance",
    ),
    Case(
        "balances:ledger",
        "GET",
        OWN_TEAM_ALL,
        kwargs=lambda w: {"employee_public_id": w.owner.public_id},
        label="reach: ledger",
    ),
    # Files. The System Administrator is signed in, so the answer is 404, not 403.
    Case(
        "files:download",
        "GET",
        only(P.OWNER, P.HR, hide=[*_others(P.OWNER, P.HR), P.SYSADMIN]),
        kwargs=lambda w: {"public_id": sick_request(w)[1].public_id},
        label="reach: medical certificate",
    ),
    Case(
        "files:download",
        "GET",
        only(P.OWNER, P.MANAGER, P.HR, P.EXEC, hide=[P.PEER, P.OTHER_MANAGER, P.OUTSIDER, P.SYSADMIN]),
        kwargs=lambda w: {"public_id": proof_attachment(w).public_id},
        label="reach: proof",
    ),
    Case(
        "files:download",
        "GET",
        only(P.OWNER, P.HR, P.EXEC, hide=[*_others(P.OWNER, P.HR, P.EXEC), P.SYSADMIN]),
        kwargs=lambda w: {"public_id": document(w, shared=True).attachment.public_id},
        label="reach: shared employee document",
    ),
    Case(
        "files:download",
        "GET",
        only(P.HR, P.EXEC, hide=[*_others(P.HR, P.EXEC), P.SYSADMIN]),
        kwargs=lambda w: {"public_id": document(w, shared=False).attachment.public_id},
        label="reach: unshared employee document",
    ),
    # A notification belongs to one account.
    Case(
        "notifications:read",
        "POST",
        only(P.MANAGER, hide=[*_others(P.MANAGER), P.SYSADMIN]),
        kwargs=lambda w: {"pk": manager_notification(w).id},
        label="reach: notification",
    ),
]
