"""Demo requests for development and browser tests: one of each main state, on the demo cast of plan 01a."""

from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.calendar import workdays
from apps.organisation import reach

from . import selectors, services
from .models import Decision, ExceptionalEvent, Request, RequestStatus, RequestStep, StepStatus
from .services import RequestData

EVENTS = [
    ("Mariage", "Marriage", Decimal("3"), True),
    ("Naissance", "Birth", Decimal("2"), True),
    ("Décès d'un proche", "Death of a close relative", Decimal("3"), False),
]


def _account(local_part: str):
    return get_user_model().objects.get(email=f"{local_part}@impactrisks.com")


def _ask(user, code: str, start, end=None, *, send: bool = True, **fields) -> Request:
    request = services.create_draft(
        actor=user,
        employee=reach.employee_of(user),
        request_type=selectors.get_type_by_code(code),
        data=RequestData(start_date=start, end_date=end or start, **fields),
    )
    return services.submit(actor=user, request=request) if send else request


def _approve(request: Request) -> Request:
    """Take a request through its chain, each step decided by someone who may decide it."""
    while request.status == RequestStatus.PENDING:
        step = RequestStep.objects.get(request=request, amendment=None, status=StepStatus.PENDING)
        approver = services.resolve_approvers(step)[0]
        request = services.decide_step(
            actor=approver, step=step, decision=Decision.APPROVE, expected_version=request.version
        )
    return request


@transaction.atomic
def seed() -> None:
    for name_fr, name_en, allowed, proof in EVENTS:
        if not ExceptionalEvent.objects.filter(name_en=name_en).exists():
            ExceptionalEvent.objects.create(
                name_fr=name_fr, name_en=name_en, days_allowed=allowed, proof_required=proof
            )
    if Request.objects.exists():
        return  # already seeded

    today = timezone.localdate()
    last_working_day = today
    while not workdays.is_working_day(last_working_day):
        last_working_day -= timedelta(days=1)

    def ahead(count: int):
        return workdays.add_working_days(today, count)

    owner = _account("employee.a1")
    peer = _account("employee.a2")
    manager = _account("manager.a")
    outsider = _account("employee.b1")

    # Waiting for the manager.
    _ask(owner, "annual", ahead(10), ahead(11), comment="Vacances en famille")
    # Approved and coming up.
    _approve(_ask(owner, "remote", ahead(3)))
    # Not sent yet.
    _ask(owner, "permission", ahead(5), start_time=time(9, 0), end_time=time(10, 30), send=False)
    # Waiting for HR, without its certificate.
    _ask(peer, "sick", last_working_day, comment="Fièvre")
    # A manager who will be away: the delegation prompt is waiting in their notifications.
    _approve(_ask(manager, "annual", ahead(15)))
    # Waiting for the other manager. This person has no leave balance in plan 04's demo data.
    _ask(outsider, "remote", ahead(4))
