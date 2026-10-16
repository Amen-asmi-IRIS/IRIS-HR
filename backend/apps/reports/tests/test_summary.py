from datetime import date, timedelta

import pytest
import time_machine
from django.urls import reverse
from django.utils import timezone

from apps.core.models import JobStatus
from apps.organisation import services as org_services
from apps.requests import services as request_services
from apps.requests.tests.helpers import pending_step
from tests.request_flows import NOW, decide, send

pytestmark = pytest.mark.django_db

URL = reverse("reports:workspace-summary")
NOTHING = {"me": 0, "team": 0, "hr": 0, "overview": 0, "admin": 0}


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def summary(client_for, user):
    response = client_for(user).get(URL)
    assert response.status_code == 200
    return response.json()


def test_nothing_waits_in_a_quiet_company(world, client_for):
    for user in (world.owner_user, world.manager_user, world.hr_user, world.exec_user, world.sysadmin_user):
        assert summary(client_for, user) == NOTHING


def test_me_counts_requests_sent_back_and_certificates_outstanding(world, client_for):
    returned = send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 10),
    )
    decide(returned, "return", "Pick another week")
    send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
    )

    assert summary(client_for, world.owner_user)["me"] == 2
    assert summary(client_for, world.peer_user)["me"] == 0


def test_team_counts_the_steps_a_manager_may_decide(world, client_for):
    send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 10),
    )
    send(
        world,
        employee=world.peer,
        user=world.peer_user,
        request_type=world.remote,
        start=date(2026, 11, 4),
        end=date(2026, 11, 4),
    )

    assert summary(client_for, world.manager_user) == {**NOTHING, "team": 2}
    assert summary(client_for, world.other_manager_user)["team"] == 0


def test_hr_counts_its_queues_and_profile_changes(world, client_for):
    request = send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 10),
    )
    decide(request, "approve")  # the manager approves; HR is next
    org_services.propose_profile_change(user=world.peer_user, changes={"phone": "+216 20 000 000"})

    assert summary(client_for, world.hr_user) == {**NOTHING, "hr": 2}


def test_hr_counts_a_sick_leave_without_certificate_once(world, client_for):
    # It waits for HR and has no certificate: the same step is in the queues "hr" and "certificates".
    send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
    )

    assert summary(client_for, world.hr_user)["hr"] == 1


def test_a_step_given_to_someone_who_is_not_a_manager_counts_in_my_space(world, client_for):
    request = send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 10),
    )
    request_services.reassign_step(
        actor=world.hr_user, step=pending_step(request), new_approver=world.outsider, reason="Cover"
    )

    assert summary(client_for, world.outsider_user) == {**NOTHING, "me": 1}
    assert summary(client_for, world.manager_user)["team"] == 0


def test_sysadmin_without_record(world, client_for):
    world.owner_user.locked_until = timezone.now() + timedelta(minutes=10)
    world.owner_user.save(update_fields=["locked_until"])
    world.peer_user.must_change_password = True
    world.peer_user.temp_password_expires_at = timezone.now() - timedelta(hours=1)
    world.peer_user.save(update_fields=["must_change_password", "temp_password_expires_at"])
    JobStatus.objects.create(
        name="demo.failing",
        schedule="0 1 * * *",
        last_started_at=timezone.now(),
        last_finished_at=timezone.now(),
        last_ok=False,
        last_detail="boom",
    )
    JobStatus.objects.create(
        name="demo.fine",
        schedule="0 2 * * *",
        last_started_at=timezone.now(),
        last_finished_at=timezone.now(),
        last_ok=True,
        last_detail="",
    )

    assert summary(client_for, world.sysadmin_user) == {**NOTHING, "admin": 3}
    # Somebody who is not an administrator learns nothing about accounts.
    assert summary(client_for, world.exec_user)["admin"] == 0


def test_overview_never_counts(world, client_for):
    send(
        world,
        employee=world.owner,
        user=world.owner_user,
        request_type=world.annual,
        start=date(2026, 11, 10),
        end=date(2026, 11, 10),
    )

    assert summary(client_for, world.exec_user)["overview"] == 0


def test_summary_needs_a_session(anon_client):
    assert anon_client.get(URL).status_code == 401
