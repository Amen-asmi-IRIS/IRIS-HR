import json
import logging
from datetime import UTC, datetime, timedelta

import pytest
import time_machine

from apps.core import tasks
from apps.core.jobs import NOTIFY_AFTER_FAILURES, periodic_schedules, recorded
from apps.core.models import JobStatus
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db

START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)


def make_job(name="test.sample", *, result=None, fail=False):
    """A recorded job whose behaviour the test controls through the returned `state`."""
    state = {"result": result, "fail": fail, "calls": 0}

    @recorded(name)
    def job(timestamp):
        state["calls"] += 1
        if state["fail"]:
            raise RuntimeError("disk full")
        return state["result"]

    return job, state


def test_the_periodic_jobs_of_this_plan_are_registered_with_procrastinate():
    schedules = periodic_schedules()

    assert schedules["core.heartbeat"] == "* * * * *"
    assert schedules["accounts.cleanup"] == "30 1 * * *"


def test_a_recorded_job_stores_when_it_ran_and_what_it_returned():
    job, _ = make_job(result={"posted": 3, "skipped": 0})

    with time_machine.travel(START, tick=False):
        assert job(0) == {"posted": 3, "skipped": 0}

    status = JobStatus.objects.get(name="test.sample")
    assert status.last_started_at == START
    assert status.last_finished_at == START
    assert status.last_ok is True
    assert json.loads(status.last_detail) == {"posted": 3, "skipped": 0}
    assert status.consecutive_failures == 0


def test_a_job_that_returns_nothing_has_an_empty_detail():
    job, _ = make_job()

    job(0)

    assert JobStatus.objects.get(name="test.sample").last_detail == ""


def test_running_a_job_again_updates_the_same_row():
    job, state = make_job()

    job(0)
    job(0)

    assert state["calls"] == 2
    assert JobStatus.objects.filter(name="test.sample").count() == 1


def test_a_failing_job_is_recorded_logged_and_raised_again(caplog):
    job, _ = make_job("test.broken", fail=True)

    with caplog.at_level(logging.ERROR, logger="iris.jobs"), pytest.raises(RuntimeError, match="disk full"):
        job(0)

    status = JobStatus.objects.get(name="test.broken")
    assert status.last_ok is False
    assert status.last_detail == "RuntimeError: disk full"
    assert status.last_finished_at is not None
    assert status.consecutive_failures == 1
    logged = next(record for record in caplog.records if record.name == "iris.jobs")
    assert logged.data == {"job": "test.broken", "consecutive_failures": 1}
    assert logged.exc_info is not None


def test_administrators_are_told_when_the_retries_are_used_up_and_once_a_day(world):
    job, _ = make_job("test.broken", fail=True)

    with time_machine.travel(START, tick=False) as clock:
        for _ in range(NOTIFY_AFTER_FAILURES - 1):
            with pytest.raises(RuntimeError):
                job(0)
        assert not Notification.objects.filter(event_code="job.failed").exists()

        with pytest.raises(RuntimeError):
            job(0)
        with pytest.raises(RuntimeError):
            job(0)
        told = Notification.objects.filter(event_code="job.failed")
        assert [n.user for n in told] == [world.sysadmin_user]
        assert told[0].parameters == {"job": "test.broken"}

        clock.shift(timedelta(days=1))
        with pytest.raises(RuntimeError):
            job(0)

    assert Notification.objects.filter(event_code="job.failed").count() == 2


def test_a_success_resets_the_count_of_failures(world):
    job, state = make_job("test.flaky", fail=True)
    for _ in range(2):
        with pytest.raises(RuntimeError):
            job(0)

    state["fail"] = False
    job(0)
    state["fail"] = True
    with pytest.raises(RuntimeError):
        job(0)

    assert JobStatus.objects.get(name="test.flaky").consecutive_failures == 1
    assert not Notification.objects.filter(event_code="job.failed").exists()


def test_the_heartbeat_task_records_itself_with_its_schedule():
    with time_machine.travel(START, tick=False):
        tasks.heartbeat(0)

    status = JobStatus.objects.get(name="core.heartbeat")
    assert status.last_ok is True
    assert status.last_finished_at == START
    assert status.schedule == "* * * * *"
