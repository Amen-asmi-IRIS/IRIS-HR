"""The nightly backup is encrypted, restorable and pruned (PRD 12.7, NFR-04)."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.core import backup
from apps.core.models import JobStatus

User = get_user_model()
pytestmark = pytest.mark.django_db(transaction=True)
NOW = datetime(2026, 11, 2, 22, 30, tzinfo=UTC)


@pytest.fixture
def dirs(tmp_path, files_root, monkeypatch):
    backups, files = tmp_path / "backups", files_root
    (files / "ab").mkdir()
    (files / "ab" / "0123456789.bin").write_bytes(b"stored attachment bytes")
    monkeypatch.setenv("BACKUP_PASSPHRASE", "correct horse battery staple")
    monkeypatch.setattr(backup, "BACKUP_DIR", backups)
    monkeypatch.setattr(backup, "FILES_DIR", files)
    return backups, files


def test_backup_writes_two_encrypted_files(world, dirs):
    backups, _ = dirs
    result = backup.run_backup(now=NOW)

    database_file, files_file = backups / result.database_file, backups / result.files_file
    assert result.database_file == "db-20261102-233000.dump.gpg"  # 22:30 UTC is 23:30 in Tunis
    assert result.files_file == "files-20261102-233000.tar.gz.gpg"
    assert database_file.stat().st_size > 0 and files_file.stat().st_size > 0
    assert result.size_bytes == database_file.stat().st_size + files_file.stat().st_size
    assert result.storage_used_bytes == result.size_bytes

    raw = database_file.read_bytes()
    assert not raw.startswith(b"PGDMP"), "the dump was written without encryption"
    assert world.hr_user.email.encode() not in raw
    assert b"stored attachment bytes" not in files_file.read_bytes()
    assert sorted(p.name for p in backups.iterdir()) == [result.database_file, result.files_file]


def test_backup_restores_into_a_scratch_database(world, dirs):
    backups, _ = dirs
    result = backup.run_backup(now=NOW)
    scratch = f"iris_restore_check_{uuid.uuid4().hex[:8]}"
    try:
        backup.restore_database(dump_file=backups / result.database_file, target_db=scratch, create=True)
        assert backup.count_rows(scratch, "accounts_user") == User.objects.count()
        assert backup.count_rows(scratch, "accounts_user") >= 8
    finally:
        backup.drop_database(scratch)


def test_files_archive_round_trip(world, dirs, tmp_path):
    backups, _ = dirs
    result = backup.run_backup(now=NOW)
    target = tmp_path / "restored"
    count = backup.restore_files(archive_file=backups / result.files_file, files_dir=target)
    assert count == 1
    assert (target / "ab" / "0123456789.bin").read_bytes() == b"stored attachment bytes"


def test_a_wrong_passphrase_cannot_decrypt(world, dirs, tmp_path, monkeypatch):
    backups, _ = dirs
    result = backup.run_backup(now=NOW)
    monkeypatch.setenv("BACKUP_PASSPHRASE", "not the passphrase")
    with pytest.raises(backup.BackupError):
        backup.restore_files(archive_file=backups / result.files_file, files_dir=tmp_path / "restored")
    assert not (tmp_path / "restored" / "ab").exists()


def test_a_missing_passphrase_fails_and_writes_nothing(world, dirs, monkeypatch):
    backups, _ = dirs
    monkeypatch.setenv("BACKUP_PASSPHRASE", "")
    with pytest.raises(backup.BackupError, match="BACKUP_PASSPHRASE"):
        backup.run_backup(now=NOW)
    assert not backups.exists() or list(backups.iterdir()) == []


def test_a_failed_dump_leaves_no_file_behind(world, dirs):
    backups, _ = dirs
    with pytest.raises(backup.BackupError, match="pg_dump"):
        backup.run_backup(now=NOW, database="database_that_does_not_exist")
    assert [p.name for p in backups.iterdir()] == []


def test_files_older_than_fourteen_days_are_removed(world, dirs):
    backups, _ = dirs
    backups.mkdir()
    old = ["db-20261018-233000.dump.gpg", "files-20261018-233000.tar.gz.gpg"]  # 15 days before
    kept = ["db-20261020-233000.dump.gpg", "files-20261020-233000.tar.gz.gpg"]  # 13 days before
    for name in [*old, *kept, "notes.txt"]:
        (backups / name).write_bytes(b"x")

    result = backup.run_backup(now=NOW)

    assert sorted(result.removed) == sorted(old)
    names = {p.name for p in backups.iterdir()}
    assert names == {*kept, "notes.txt", result.database_file, result.files_file}
    assert result.storage_used_bytes == sum(p.stat().st_size for p in backups.iterdir())


def test_latest_returns_the_newest_pair(world, dirs):
    backups, _ = dirs
    assert backup.latest() is None
    backup.run_backup(now=NOW - timedelta(days=1))
    newest = backup.run_backup(now=NOW)
    database_file, files_file = backup.latest()
    assert (database_file.name, files_file.name) == (newest.database_file, newest.files_file)


def test_the_job_fills_the_status_page(world, dirs, client_for):
    from procrastinate.contrib.django import app

    app.tasks["ops.backup"](0)

    status = JobStatus.objects.get(name="ops.backup")
    assert status.last_ok is True
    detail = json.loads(status.last_detail)
    assert detail["size_bytes"] > 0

    body = client_for(world.sysadmin_user).get(reverse("core:admin-status")).json()
    assert body["backup"]["size_bytes"] == detail["size_bytes"]
    assert body["backup"]["storage_used_bytes"] == detail["storage_used_bytes"]
    assert body["backup"]["last_at"] is not None
    assert any(job["name"] == "ops.backup" and job["last_ok"] for job in body["jobs"])


def test_backup_now_and_restore_check_commands(world, dirs, capsys):
    from django.core.management import call_command

    call_command("backup_now")
    assert "db-" in capsys.readouterr().out
    call_command("restore_backup", "--scratch")
    out = capsys.readouterr().out
    assert "accounts_user" in out and "Restore check passed" in out
    assert settings.DATABASES["default"]["NAME"] in out or "iris_restore_check" in out
