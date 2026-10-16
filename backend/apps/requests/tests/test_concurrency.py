"""Two actions at the very same moment, each on its own database connection (REQ-18, review focus 3).

The other tests of this app act one after the other inside one transaction. Here the rows are really
locked: the second action waits for the first to commit, then finds the request moved on.
"""

import datetime as dt
import threading

import pytest
from django.db import connection

from apps.core.errors import Conflict, DomainError
from apps.notifications.models import Notification
from apps.organisation import services as organisation_services
from apps.requests import services
from apps.requests.tests.helpers import TODAY, decide, draft, fresh, pending_step, steps, submitted

pytestmark = pytest.mark.django_db(transaction=True)


def together(*actions) -> list[str]:
    """Run the actions at the same moment. Each gives "done", or the code of the refusal it met."""
    barrier = threading.Barrier(len(actions))
    outcomes = [""] * len(actions)

    def run(index: int, action) -> None:
        try:
            barrier.wait(timeout=10)
            action()
            outcomes[index] = "done"
        except Conflict as refusal:
            outcomes[index] = refusal.code
        except Exception as error:  # the assertion below shows what went wrong
            outcomes[index] = repr(error)
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=(index, action)) for index, action in enumerate(actions)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    return outcomes


def test_two_approvers_on_one_step_at_the_same_moment(world):
    organisation_services.create_delegation(
        actor=world.hr_user,
        manager=world.manager,
        delegate=world.other_manager,
        start_date=TODAY,
        end_date=TODAY + dt.timedelta(days=30),
    )
    request = submitted(world)
    step = pending_step(request)

    outcomes = together(
        lambda: services.decide_step(
            actor=world.manager_user, step=step, decision="approve", expected_version=request.version
        ),
        lambda: services.decide_step(
            actor=world.other_manager_user,
            step=step,
            decision="reject",
            comment="Période de clôture",
            expected_version=request.version,
        ),
    )

    assert sorted(outcomes) == ["done", "request.already_processed"]
    saved = fresh(request)
    assert saved.version == request.version + 1
    first = steps(request)[0]
    # The request is where the one decision that went through left it, and nowhere in between.
    if outcomes[0] == "done":
        assert (saved.status, first.status, first.decided_by) == ("pending", "approved", world.manager)
    else:
        assert (saved.status, first.status, first.decided_by) == ("rejected", "rejected", world.other_manager)


def test_the_last_approval_racing_a_withdrawal(world, port):
    request = submitted(world)
    decide(request, world.manager_user)
    current = fresh(request)
    step = pending_step(current)

    approval, withdrawal = together(
        lambda: services.decide_step(
            actor=world.hr_user, step=step, decision="approve", expected_version=current.version
        ),
        lambda: services.withdraw(actor=world.owner_user, request=current),
    )

    saved = fresh(request)
    if approval == "done":
        assert withdrawal == "request.not_withdrawable"
        assert (saved.status, len(port.taken)) == ("approved", 1)
    else:
        assert (approval, withdrawal) == ("request.already_processed", "done")
        assert (saved.status, port.taken) == ("withdrawn", [])
    assert not any(step.status in ("pending", "waiting") for step in steps(request))


def test_a_double_click_on_send(world):
    request = draft(world)

    outcomes = together(
        lambda: services.submit(actor=world.owner_user, request=request, expected_version=1),
        lambda: services.submit(actor=world.owner_user, request=request, expected_version=1),
    )

    assert sorted(outcomes) == ["done", "request.already_processed"]
    assert (fresh(request).status, fresh(request).version) == ("pending", 2)
    assert [(step.round, step.position) for step in steps(request)] == [(1, 1), (1, 2)]
    assert Notification.objects.filter(event_code="step.to_decide", user=world.manager_user).count() == 1


def test_two_requests_of_one_person_for_the_same_day_sent_at_the_same_moment(world):
    """Both pass the overlap rule alone; under the lock on the person, the second one sees the first."""
    first = draft(world)
    second = draft(world, request_type=world.remote)

    def send(request):
        try:
            services.submit(actor=world.owner_user, request=request, expected_version=1)
        except DomainError as refusal:
            if refusal.code != "request.overlap":
                raise
            raise Conflict(refusal.code) from None

    outcomes = together(lambda: send(first), lambda: send(second))

    assert sorted(outcomes) == ["done", "request.overlap"]
    assert sorted([fresh(first).status, fresh(second).status]) == ["draft", "pending"]
