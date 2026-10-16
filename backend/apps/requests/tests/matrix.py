from django.utils import timezone

from apps.calendar import workdays
from apps.requests import services
from apps.requests.models import RequestStatus, RequestStep, StepStatus
from apps.requests.services import RequestData
from tests.matrix import Case, P, only

STAFF = (P.OWNER, P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC)

# The matrix runs on the real clock, so its requests are placed on working days in the weeks to come.
# They use remote work and sick leave: neither depends on a leave balance.


def _day(offset: int):
    return workdays.add_working_days(timezone.localdate(), offset)


def _once(world, name: str, build):
    key = f"_requests_matrix_{name}"
    if getattr(world, key, None) is None:
        setattr(world, key, build())
    return getattr(world, key)


def _remote(world, offset: int, *, send: bool = True):
    request = services.create_draft(
        actor=world.owner_user,
        employee=world.owner,
        request_type=world.remote,
        data=RequestData(start_date=_day(offset), end_date=_day(offset)),
    )
    return services.submit(actor=world.owner_user, request=request) if send else request


def _through_the_chain(request):
    while request.status == RequestStatus.PENDING:
        step = RequestStep.objects.get(request=request, amendment=None, status=StepStatus.PENDING)
        approver = services.resolve_approvers(step)[0]
        request = services.decide_step(
            actor=approver, step=step, decision="approve", expected_version=request.version
        )
    return request


def pending(world):
    """A request of the owner, waiting for the manager."""
    return _once(world, "pending", lambda: _remote(world, 10))


def a_draft(world):
    return _once(world, "draft", lambda: _remote(world, 11, send=False))


def granted(world):
    """An approved request of the owner that has not started."""
    return _once(world, "granted", lambda: _through_the_chain(_remote(world, 15)))


def sick_leave(world):
    """A sick leave of the peer, waiting for HR, with a comment nobody else may read."""

    def build():
        today = timezone.localdate()
        request = services.create_draft(
            actor=world.peer_user,
            employee=world.peer,
            request_type=world.sick,
            data=RequestData(start_date=today, end_date=today, comment="matrix-medical-secret"),
        )
        return services.submit(actor=world.peer_user, request=request)

    return _once(world, "sick", build)


def changing(world):
    """An approved request of the owner with a change that is waiting. Returns the amendment."""

    def build():
        request = _through_the_chain(_remote(world, 20))
        return services.open_amendment(
            actor=world.owner_user,
            request=request,
            kind="change",
            data=RequestData(start_date=_day(21), end_date=_day(21)),
            reason="matrix",
        )

    return _once(world, "changing", build)


def _open_step(request) -> RequestStep:
    return RequestStep.objects.get(request=request, amendment=None, status=StepStatus.PENDING)


def _an_hour_ago() -> str:
    from datetime import timedelta

    return (timezone.now() - timedelta(hours=1)).isoformat()


def _certificate():
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile(
        "certificat.pdf", b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n", content_type="application/pdf"
    )


def certificate_of(world):
    """The medical certificate on the peer's sick leave."""
    return _once(
        world,
        "certificate",
        lambda: (
            services.attach_file(
                actor=world.peer_user, request=sick_leave(world), upload=_certificate()
            ).attachment
        ),
    )


def proof_of(world):
    """A proof on an exceptional leave of the owner."""

    def build():
        request = services.create_draft(
            actor=world.owner_user,
            employee=world.owner,
            request_type=world.exceptional,
            data=RequestData(start_date=_day(25), end_date=_day(25), exceptional_event_id=world.event.pk),
        )
        request = services.submit(actor=world.owner_user, request=request)
        return services.attach_file(actor=world.owner_user, request=request, upload=_certificate()).attachment

    return _once(world, "proof", build)


# The sick leave belongs to the peer: their manager, HR and executives see that it exists.
SICK_LEAVE_CIRCLE = only(P.PEER, P.MANAGER, P.HR, P.EXEC, hide=(P.OWNER, P.OTHER_MANAGER, P.OUTSIDER))


# The owner may do it; the manager, HR and executives see the request but may not; the others do not see it.
OWNER_AMONG_THOSE_WHO_SEE = only(P.OWNER, hide=(P.PEER, P.OTHER_MANAGER, P.OUTSIDER))
ITS_CREATOR_ONLY = only(P.OWNER, hide=(P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC))


def _id(build):
    return lambda world: {"public_id": build(world).public_id}


VISIBLE_TO_ITS_CIRCLE = only(P.OWNER, P.MANAGER, P.HR, P.EXEC, hide=(P.PEER, P.OTHER_MANAGER, P.OUTSIDER))

CONFIG_CASES = [
    Case("requests:type-list", "GET", only(*STAFF)),
    Case(
        "requests:type-list",
        "POST",
        only(P.HR),
        body=lambda w: {"code": "matrix-type", "name_fr": "Matrice", "name_en": "Matrix", "unit": "day"},
    ),
    Case("requests:type-detail", "GET", only(P.HR, P.EXEC), kwargs=lambda w: {"pk": w.remote.pk}),
    Case(
        "requests:type-detail",
        "PATCH",
        only(P.HR),
        kwargs=lambda w: {"pk": w.remote.pk},
        body=lambda w: {"notice_days": 0},
    ),
    Case("requests:type-steps", "GET", only(P.HR, P.EXEC), kwargs=lambda w: {"pk": w.remote.pk}),
    Case(
        "requests:type-steps",
        "PUT",
        only(P.HR),
        kwargs=lambda w: {"pk": w.remote.pk},
        body=lambda w: {"steps": [{"approver_rule": "hr_role", "mode": "approve"}]},
    ),
    Case(
        "requests:type-chain-preview",
        "GET",
        only(P.HR),
        kwargs=lambda w: {"pk": w.annual.pk},
        query=lambda w: {"employee": str(w.owner.public_id)},
    ),
    Case("requests:event-list", "GET", only(*STAFF)),
    Case(
        "requests:event-list",
        "POST",
        only(P.HR),
        body=lambda w: {"name_fr": "Naissance", "name_en": "Birth", "days_allowed": "2"},
    ),
    Case(
        "requests:event-detail",
        "PATCH",
        only(P.HR),
        kwargs=lambda w: {"pk": w.event.pk},
        body=lambda w: {"proof_required": False},
    ),
]

READ_CASES = [
    Case("requests:request-list", "GET", only(*STAFF), label="mine"),
    Case(
        "requests:request-list",
        "GET",
        only(P.MANAGER, P.OTHER_MANAGER, P.EXEC),
        query=lambda w: {"scope": "team"},
        label="team",
    ),
    Case("requests:request-list", "GET", only(P.HR, P.EXEC), query=lambda w: {"scope": "all"}, label="all"),
    Case(
        "requests:request-preview",
        "POST",
        only(*STAFF),
        body=lambda w: {"type": "remote", "start_date": str(_day(30)), "end_date": str(_day(30))},
    ),
    Case("requests:request-detail", "GET", VISIBLE_TO_ITS_CIRCLE, kwargs=_id(pending)),
    Case(
        "requests:request-detail",
        "GET",
        only(P.OWNER, hide=(P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC)),
        kwargs=_id(a_draft),
        label="draft",
    ),
    Case("requests:request-history", "GET", VISIBLE_TO_ITS_CIRCLE, kwargs=_id(pending)),
]

WRITE_CASES = [
    Case(
        "requests:request-list",
        "POST",
        only(*STAFF),
        body=lambda w: {"type": "remote", "start_date": str(_day(31)), "end_date": str(_day(31))},
    ),
    Case(
        "requests:request-detail",
        "PATCH",
        ITS_CREATOR_ONLY,
        kwargs=_id(a_draft),
        body=lambda w: {"version": a_draft(w).version, "comment": "matrix"},
    ),
    Case("requests:request-detail", "DELETE", ITS_CREATOR_ONLY, kwargs=_id(a_draft)),
    Case(
        "requests:request-submit",
        "POST",
        ITS_CREATOR_ONLY,
        kwargs=_id(a_draft),
        body=lambda w: {"version": a_draft(w).version},
    ),
    Case(
        "requests:request-withdraw", "POST", OWNER_AMONG_THOSE_WHO_SEE, kwargs=_id(pending), body=lambda w: {}
    ),
    Case("requests:request-attachments", "GET", VISIBLE_TO_ITS_CIRCLE, kwargs=_id(pending)),
    Case(
        "requests:request-attachments",
        "POST",
        only(P.OWNER, P.HR, hide=(P.PEER, P.OTHER_MANAGER, P.OUTSIDER)),
        kwargs=_id(pending),
        body=lambda w: {"file": _certificate()},
        format="multipart",
    ),
    Case("requests:request-amendments", "GET", VISIBLE_TO_ITS_CIRCLE, kwargs=_id(granted)),
    Case(
        "requests:request-amendments",
        "POST",
        OWNER_AMONG_THOSE_WHO_SEE,
        kwargs=_id(granted),
        body=lambda w: {"kind": "cancel", "reason": "matrix"},
    ),
    Case(
        "requests:amendment-withdraw",
        "POST",
        OWNER_AMONG_THOSE_WHO_SEE,
        kwargs=lambda w: {"public_id": changing(w).public_id},
        body=lambda w: {},
    ),
    Case(
        "requests:request-correct",
        "POST",
        only(P.HR),
        kwargs=_id(pending),
        body=lambda w: {"start_date": str(_day(12)), "end_date": str(_day(12)), "reason": "matrix"},
    ),
    Case(
        "requests:request-cancel",
        "POST",
        only(P.HR),
        kwargs=_id(pending),
        body=lambda w: {"reason": "matrix"},
    ),
    Case("requests:request-reclassify", "POST", only(P.HR), kwargs=_id(sick_leave), body=lambda w: {}),
]

STEP_CASES = [
    Case("requests:approval-list", "GET", only(*STAFF), label="mine"),
    Case("requests:approval-list", "GET", only(P.HR), query=lambda w: {"queue": "hr"}, label="hr"),
    Case(
        "requests:step-decide",
        "POST",
        # Only the manager of the owner is one of the people this step is for.
        only(P.MANAGER, hide=(P.OWNER, P.PEER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC)),
        kwargs=lambda w: {"pk": _open_step(pending(w)).pk},
        body=lambda w: {"decision": "approve", "comment": "", "version": pending(w).version},
    ),
    Case(
        "requests:step-record-on-behalf",
        "POST",
        only(P.HR),
        kwargs=lambda w: {"pk": _open_step(pending(w)).pk},
        body=lambda w: {
            "decided_by": str(w.manager.public_id),
            "decision": "approve",
            "decided_at": _an_hour_ago(),
            "channel": "verbal",
            "note": "matrix",
            "version": pending(w).version,
        },
    ),
    Case(
        "requests:step-reassign",
        "POST",
        only(P.HR),
        kwargs=lambda w: {"pk": _open_step(pending(w)).pk},
        body=lambda w: {"new_approver": str(w.other_manager.public_id), "reason": "matrix"},
    ),
]

SENSITIVE_CASES = [
    Case("requests:request-detail", "GET", SICK_LEAVE_CIRCLE, kwargs=_id(sick_leave), label="sick leave"),
    Case(
        "requests:request-attachments", "GET", SICK_LEAVE_CIRCLE, kwargs=_id(sick_leave), label="sick leave"
    ),
    Case("requests:request-history", "GET", SICK_LEAVE_CIRCLE, kwargs=_id(sick_leave), label="sick leave"),
    Case(
        "files:download",
        "GET",
        # Only the employee and HR open a medical file. Everyone else, signed in or not, finds nothing.
        only(P.PEER, P.HR, hide=(P.OWNER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.EXEC, P.SYSADMIN)),
        kwargs=lambda w: {"public_id": certificate_of(w).public_id},
        label="medical certificate",
    ),
    Case(
        "files:download",
        "GET",
        only(P.OWNER, P.MANAGER, P.HR, P.EXEC, hide=(P.PEER, P.OTHER_MANAGER, P.OUTSIDER, P.SYSADMIN)),
        kwargs=lambda w: {"public_id": proof_of(w).public_id},
        label="proof of an event",
    ),
]

CASES = CONFIG_CASES + READ_CASES + WRITE_CASES + STEP_CASES + SENSITIVE_CASES
