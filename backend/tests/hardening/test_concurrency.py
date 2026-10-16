"""Two actions at once: exactly one wins and the other is told (REQ-18, PRD 6.3, review focus 4)."""

from __future__ import annotations

import threading
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connections
from django.urls import reverse
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.balances import services as balance_services
from apps.balances.models import LedgerEntry
from apps.core.errors import DomainError
from apps.notifications.models import Notification
from apps.organisation import services as organisation_services
from apps.organisation.models import Employee
from apps.requests import services as request_services
from apps.requests.models import Decision, Request, RequestStatus, RequestStep, StepStatus
from apps.settings import services as settings_service
from tests.hardening.helpers import decide, give_balance, make_request, pending_step

User = get_user_model()
pytestmark = pytest.mark.django_db(transaction=True)
MON, TUE = date(2026, 11, 16), date(2026, 11, 17)
NEXT_MON, NEXT_TUE = date(2026, 11, 23), date(2026, 11, 24)


def race(*calls):
    """Run the callables at the same instant, each in its own thread and connection.

    Returns, in order, what each returned or the exception it raised. The form of `together` in
    `apps/requests/tests/test_concurrency.py`, which keeps only the code of a `Conflict`; these tests
    also read refusals of other statuses and the answers of the API.
    """
    barrier = threading.Barrier(len(calls))
    outcomes: list[object] = [None] * len(calls)

    def runner(index: int, call) -> None:
        try:
            barrier.wait(timeout=10)
            outcomes[index] = call()
        except Exception as error:  # noqa: BLE001  (the exception is the result under test)
            outcomes[index] = error
        finally:
            connections.close_all()

    threads = [threading.Thread(target=runner, args=(index, call)) for index, call in enumerate(calls)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)
        assert not thread.is_alive(), "a racer is still running: probable deadlock"
    return outcomes


def split(outcomes):
    won = [outcome for outcome in outcomes if not isinstance(outcome, Exception)]
    lost = [outcome for outcome in outcomes if isinstance(outcome, Exception)]
    unexpected = [outcome for outcome in lost if not isinstance(outcome, DomainError)]
    assert unexpected == [], f"a racer failed with something other than a domain error: {unexpected!r}"
    return won, lost


def _decide(user_id: int, step_id: int, version: int, decision: Decision, comment: str = ""):
    return lambda: request_services.decide_step(
        actor=User.objects.get(pk=user_id),
        step=RequestStep.objects.get(pk=step_id),
        decision=decision,
        comment=comment,
        expected_version=version,
    )


def test_two_approvers_on_one_step_cannot_both_succeed(world, frozen):
    organisation_services.create_delegation(
        actor=world.manager_user,
        manager=world.manager,
        delegate=world.other_manager,
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 30),
    )
    request = make_request(
        world, user=world.owner_user, employee=world.owner, request_type=world.remote, start=MON, end=MON
    )
    step = pending_step(request)

    won, lost = split(
        race(
            _decide(world.manager_user.id, step.id, request.version, Decision.APPROVE),
            _decide(world.other_manager_user.id, step.id, request.version, Decision.APPROVE),
        )
    )

    assert len(won) == 1 and len(lost) == 1
    assert lost[0].code == "request.already_processed" and lost[0].status == 409
    step.refresh_from_db()
    assert step.status == StepStatus.APPROVED
    assert AuditEvent.objects.filter(action="step.decided").count() == 1
    assert RequestStep.objects.filter(request=request, status=StepStatus.PENDING).count() == 1  # the HR step


def test_an_approval_and_a_refusal_at_once_leave_one_clear_outcome(world, frozen):
    organisation_services.create_delegation(
        actor=world.manager_user,
        manager=world.manager,
        delegate=world.other_manager,
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 30),
    )
    request = make_request(
        world, user=world.owner_user, employee=world.owner, request_type=world.remote, start=MON, end=MON
    )
    step = pending_step(request)

    won, lost = split(
        race(
            _decide(world.manager_user.id, step.id, request.version, Decision.APPROVE),
            _decide(
                world.other_manager_user.id,
                step.id,
                request.version,
                Decision.REJECT,
                "Team meeting that day",
            ),
        )
    )

    assert len(won) == 1 and len(lost) == 1
    request.refresh_from_db()
    step.refresh_from_db()
    assert (request.status, step.status) in {
        (RequestStatus.PENDING, StepStatus.APPROVED),
        (RequestStatus.REJECTED, StepStatus.REJECTED),
    }
    told = Notification.objects.filter(
        user=world.owner_user, event_code__in=["request.rejected", "request.approved"]
    )
    assert told.count() == (1 if request.status == RequestStatus.REJECTED else 0)


def test_two_submissions_cannot_both_spend_the_same_balance(world, frozen):
    give_balance(world, world.owner, "3")
    first = make_request(
        world,
        user=world.owner_user,
        employee=world.owner,
        request_type=world.annual,
        start=MON,
        end=TUE,
        submit=False,
    )
    second = make_request(
        world,
        user=world.owner_user,
        employee=world.owner,
        request_type=world.annual,
        start=NEXT_MON,
        end=NEXT_TUE,
        submit=False,
    )

    def send(request_id: int):
        return lambda: request_services.submit(
            actor=User.objects.get(pk=world.owner_user.id), request=Request.objects.get(pk=request_id)
        )

    won, lost = split(race(send(first.id), send(second.id)))

    assert len(won) == 1 and len(lost) == 1
    assert lost[0].code == "request.balance_insufficient"
    statuses = sorted(Request.objects.filter(employee=world.owner).values_list("status", flat=True))
    assert statuses == ["draft", "pending"]


def test_two_overlapping_requests_cannot_both_be_sent(world, frozen):
    first = make_request(
        world,
        user=world.owner_user,
        employee=world.owner,
        request_type=world.remote,
        start=MON,
        end=MON,
        submit=False,
    )
    second = make_request(
        world,
        user=world.owner_user,
        employee=world.owner,
        request_type=world.exceptional,
        start=MON,
        end=MON,
        exceptional_event_id=world.event.id,
        submit=False,
    )

    def send(request_id: int):
        return lambda: request_services.submit(
            actor=User.objects.get(pk=world.owner_user.id), request=Request.objects.get(pk=request_id)
        )

    won, lost = split(race(send(first.id), send(second.id)))
    assert len(won) == 1 and len(lost) == 1
    assert lost[0].code == "request.overlap"


def test_a_double_click_on_send_creates_one_chain(world, frozen):
    draft = make_request(
        world,
        user=world.owner_user,
        employee=world.owner,
        request_type=world.remote,
        start=MON,
        end=MON,
        submit=False,
    )

    def send():
        return request_services.submit(
            actor=User.objects.get(pk=world.owner_user.id),
            request=Request.objects.get(pk=draft.id),
            expected_version=draft.version,
        )

    won, lost = split(race(send, send))
    assert len(won) == 1 and len(lost) == 1
    assert lost[0].status == 409
    steps = list(RequestStep.objects.filter(request=draft).values_list("round", "position"))
    assert len(steps) == len(set(steps)) == 2
    assert Notification.objects.filter(user=world.manager_user, event_code="step.to_decide").count() == 1


def test_a_final_approval_racing_a_withdrawal_ends_in_one_state(world, frozen):
    give_balance(world, world.owner, "5")
    request = make_request(
        world, user=world.owner_user, employee=world.owner, request_type=world.annual, start=MON, end=TUE
    )
    request = decide(request, world.manager_user)
    hr_step = pending_step(request)

    def withdraw():
        return request_services.withdraw(
            actor=User.objects.get(pk=world.owner_user.id), request=Request.objects.get(pk=request.id)
        )

    won, lost = split(
        race(
            _decide(world.hr_user.id, hr_step.id, request.version, Decision.APPROVE),
            withdraw,
        )
    )

    assert len(won) == 1 and len(lost) == 1
    request.refresh_from_db()
    assert request.status in (RequestStatus.APPROVED, RequestStatus.WITHDRAWN)
    taken = LedgerEntry.objects.filter(employee=world.owner, kind="taken")
    if request.status == RequestStatus.APPROVED:
        assert lost[0].code in ("request.not_withdrawable", "request.already_processed")
        assert sum(entry.amount for entry in taken) == Decimal("-2")
    else:
        assert lost[0].code == "request.already_processed"
        assert not taken.exists()


def test_the_api_answers_200_and_409_to_two_decisions(world, frozen):
    organisation_services.create_delegation(
        actor=world.manager_user,
        manager=world.manager,
        delegate=world.other_manager,
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 30),
    )
    request = make_request(
        world, user=world.owner_user, employee=world.owner, request_type=world.remote, start=MON, end=MON
    )
    step = pending_step(request)
    url = reverse("requests:step-decide", kwargs={"pk": step.id})
    body = {"decision": "approve", "comment": "", "version": request.version}

    def call(user_id: int):
        def run():
            client = APIClient()
            client.force_authenticate(User.objects.get(pk=user_id))
            response = client.post(url, body, format="json")
            return response.status_code, response.json()

        return run

    outcomes = race(call(world.manager_user.id), call(world.other_manager_user.id))
    assert sorted(status for status, _ in outcomes) == [200, 409]
    loser = next(payload for status, payload in outcomes if status == 409)
    assert loser["code"] == "request.already_processed"
    assert loser["detail"]  # a sentence the interface can show (UI 3.4)


def test_two_credit_runs_at_once_post_each_credit_once(world, frozen):
    Employee.objects.update(hire_date=date(2020, 1, 1))
    settings_service.set_value(actor=world.hr_user, key="credit_start_date", value="2026-10-01")

    def run():
        return balance_services.post_month_end_credits(today=date(2026, 11, 2))

    outcomes = race(run, run)
    assert not any(isinstance(outcome, Exception) for outcome in outcomes), outcomes
    credits = LedgerEntry.objects.filter(kind="credit", period="2026-10")
    assert credits.count() == 7
    assert credits.values("employee_id").distinct().count() == 7
