import json
from datetime import UTC, datetime, timedelta

import pytest
import time_machine

from apps.core.models import JobStatus

pytestmark = pytest.mark.django_db

STATUS = "/api/v1/admin/status"
START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)


def job(name: str, at: datetime, *, ok: bool, detail: str = "") -> None:
    JobStatus.objects.create(
        name=name, last_started_at=at, last_finished_at=at, last_ok=ok, last_detail=detail
    )


def test_the_status_page_gets_health_accounts_jobs_and_backup(world, client_for):
    with time_machine.travel(START, tick=False):
        job("core.heartbeat", START, ok=True)
        job("accounts.cleanup", START - timedelta(hours=6), ok=False, detail="RuntimeError: disk full")
        world.owner_user.locked_until = START + timedelta(minutes=5)
        world.owner_user.save(update_fields=["locked_until"])
        world.peer_user.must_change_password = True
        world.peer_user.temp_password_expires_at = START - timedelta(hours=1)
        world.peer_user.save(update_fields=["must_change_password", "temp_password_expires_at"])

        response = client_for(world.sysadmin_user).get(STATUS)

    body = response.json()
    assert response.status_code == 200
    assert set(body) == {"health", "accounts", "jobs", "backup"}
    assert body["health"]["status"] == "ok"
    assert set(body["accounts"]) == {
        "locked",
        "awaiting_first_sign_in",
        "temp_expired",
        "employees_without_account",
    }
    assert body["accounts"]["locked"] == [
        {
            "public_id": str(world.owner_user.public_id),
            "name": "Amal Employee",
            "email": "employee.a1@impactrisks.com",
        }
    ]
    assert [row["email"] for row in body["accounts"]["temp_expired"]] == ["employee.a2@impactrisks.com"]
    assert body["accounts"]["awaiting_first_sign_in"] == []
    assert body["accounts"]["employees_without_account"] == []
    assert body["backup"] is None

    jobs = {row["name"]: row for row in body["jobs"]}
    assert body["jobs"][0]["name"] == "accounts.cleanup"  # failures come first
    cleanup, heartbeat = jobs["accounts.cleanup"], jobs["core.heartbeat"]
    assert set(cleanup) == {
        "name",
        "schedule",
        "last_started_at",
        "last_finished_at",
        "last_ok",
        "last_detail",
        "next_run_at",
    }
    assert (cleanup["schedule"], cleanup["last_ok"], cleanup["last_detail"]) == (
        "30 1 * * *",
        False,
        "RuntimeError: disk full",
    )
    assert datetime.fromisoformat(cleanup["next_run_at"]) == datetime(2026, 10, 7, 1, 30, tzinfo=UTC)
    assert (heartbeat["schedule"], heartbeat["last_ok"]) == ("* * * * *", True)
    assert datetime.fromisoformat(heartbeat["next_run_at"]) == START + timedelta(minutes=1)


def test_a_job_that_never_ran_is_listed_from_its_schedule(world, client_for):
    body = client_for(world.sysadmin_user).get(STATUS).json()

    jobs = {row["name"]: row for row in body["jobs"]}
    assert jobs["core.heartbeat"]["last_ok"] is None
    assert jobs["core.heartbeat"]["last_started_at"] is None
    assert jobs["core.heartbeat"]["next_run_at"] is not None
    assert body["health"]["worker"] == "stale"


def test_the_backup_block_reads_the_backup_job(world, client_for):
    detail = json.dumps({"size_bytes": 52_428_800, "storage_used_bytes": 734_003_200})
    job("ops.backup", START, ok=True, detail=detail)

    body = client_for(world.sysadmin_user).get(STATUS).json()

    assert datetime.fromisoformat(body["backup"]["last_at"]) == START
    assert body["backup"]["size_bytes"] == 52_428_800
    assert body["backup"]["storage_used_bytes"] == 734_003_200


def test_a_failed_backup_shows_no_backup_and_a_failed_job(world, client_for):
    job("ops.backup", START, ok=False, detail="OSError: no space left on device")

    body = client_for(world.sysadmin_user).get(STATUS).json()

    assert body["backup"] is None
    assert body["jobs"][0]["name"] == "ops.backup"
    assert body["jobs"][0]["last_ok"] is False


def test_only_administrators_and_executives_read_the_status(world, client_for, anon_client):
    assert client_for(world.exec_user).get(STATUS).status_code == 200
    assert client_for(world.hr_user).get(STATUS).status_code == 403
    assert client_for(world.owner_user).get(STATUS).status_code == 403
    assert anon_client.get(STATUS).status_code == 401
