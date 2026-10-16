"""Nightly encrypted backup of the database and the file volume, and its restore (PRD 12.7).

Files are encrypted with GnuPG (AES-256, symmetric) using BACKUP_PASSPHRASE. Nothing is ever
written to the backup directory unencrypted except inside a work directory removed before return.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tarfile
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.utils import timezone

# None: the folders of the settings (`BACKUP_ROOT`, `FILES_ROOT`, master 6.1). Tests point them elsewhere.
BACKUP_DIR: Path | None = None
FILES_DIR: Path | None = None
KEEP_DAYS = 14
STAMP = "%Y%m%d-%H%M%S"
NAME = re.compile(r"^(db|files)-(\d{8}-\d{6})\.(dump|tar\.gz)\.gpg$")


class BackupError(RuntimeError):
    """A backup or restore step failed. The message never contains the passphrase."""


@dataclass(frozen=True)
class BackupResult:
    at: str
    database_file: str
    files_file: str
    size_bytes: int
    storage_used_bytes: int
    removed: list[str] = field(default_factory=list)

    def as_status(self) -> dict:
        """What the job returns. `recorded` stores a dictionary as JSON; `admin/status` reads the two sizes."""
        return {
            "size_bytes": self.size_bytes,
            "storage_used_bytes": self.storage_used_bytes,
            "database_file": self.database_file,
            "files_file": self.files_file,
            "removed": len(self.removed),
        }


def default_backup_dir() -> Path:
    return BACKUP_DIR or Path(settings.BACKUP_ROOT)


def default_files_dir() -> Path:
    return FILES_DIR or Path(settings.FILES_ROOT)


def _passphrase() -> str:
    value = os.environ.get("BACKUP_PASSPHRASE", "")
    if not value.strip():
        raise BackupError("BACKUP_PASSPHRASE is empty; refusing to write an unencrypted backup")
    return value


def _database() -> dict:
    return settings.DATABASES["default"]


def _pg_args() -> list[str]:
    database = _database()
    return [
        "--host",
        database["HOST"],
        "--port",
        str(database.get("PORT") or 5432),
        "--username",
        database["USER"],
    ]


def _pg_env() -> dict:
    return {**os.environ, "PGPASSWORD": _database()["PASSWORD"]}


def _run(
    command: list[str], *, env: dict | None = None, stdin: bytes | None = None
) -> subprocess.CompletedProcess:
    try:
        result = subprocess.run(command, env=env, input=stdin, capture_output=True, check=False)
    except FileNotFoundError as error:
        raise BackupError(f"{command[0]} is not installed in this image") from error
    if result.returncode != 0:
        tail = result.stderr.decode(errors="replace").strip()[-400:]
        raise BackupError(f"{command[0]} failed with code {result.returncode}: {tail}")
    return result


def _gpg(arguments: list[str], passphrase: str) -> None:
    with tempfile.TemporaryDirectory(prefix="gnupg-") as home:
        _run(
            [
                "gpg",
                "--homedir",
                home,
                "--batch",
                "--yes",
                "--quiet",
                "--pinentry-mode",
                "loopback",
                "--passphrase-fd",
                "0",
                *arguments,
            ],
            stdin=passphrase.encode() + b"\n",
        )


def encrypt(source: Path, target: Path, passphrase: str) -> None:
    _gpg(["--symmetric", "--cipher-algo", "AES256", "--output", str(target), str(source)], passphrase)


def decrypt(source: Path, target: Path, passphrase: str) -> None:
    _gpg(["--output", str(target), "--decrypt", str(source)], passphrase)


def prune(backup_dir: Path, *, now: datetime, keep_days: int = KEEP_DAYS) -> list[str]:
    """Delete nightly files whose time stamp is older than `keep_days`.

    Other files and the `pre-update` folder of dump.sh are left alone.
    """
    cutoff = timezone.localtime(now) - timedelta(days=keep_days)
    removed = []
    for path in sorted(backup_dir.iterdir()):
        match = NAME.match(path.name)
        if not match or not path.is_file():
            continue
        taken = datetime.strptime(match.group(2), STAMP).replace(tzinfo=cutoff.tzinfo)
        if taken < cutoff:
            path.unlink()
            removed.append(path.name)
    return removed


def run_backup(
    *,
    now: datetime | None = None,
    backup_dir: Path | None = None,
    files_dir: Path | None = None,
    keep_days: int = KEEP_DAYS,
    database: str | None = None,
) -> BackupResult:
    passphrase = _passphrase()
    now = now or timezone.now()
    backup_dir = backup_dir or default_backup_dir()
    files_dir = files_dir or default_files_dir()
    database = database or _database()["NAME"]
    stamp = timezone.localtime(now).strftime(STAMP)
    backup_dir.mkdir(parents=True, exist_ok=True)
    database_target = backup_dir / f"db-{stamp}.dump.gpg"
    files_target = backup_dir / f"files-{stamp}.tar.gz.gpg"

    try:
        with tempfile.TemporaryDirectory(dir=backup_dir, prefix=".work-") as work_name:
            work = Path(work_name)
            dump = work / "db.dump"
            _run(
                ["pg_dump", *_pg_args(), "--format=custom", "--no-owner", "--file", str(dump), database],
                env=_pg_env(),
            )
            encrypt(dump, database_target, passphrase)
            dump.unlink()
            archive = work / "files.tar.gz"
            with tarfile.open(archive, "w:gz") as tar:
                if files_dir.exists():
                    tar.add(files_dir, arcname="files")
            encrypt(archive, files_target, passphrase)
    except Exception:
        database_target.unlink(missing_ok=True)
        files_target.unlink(missing_ok=True)
        raise

    removed = prune(backup_dir, now=now, keep_days=keep_days)
    size = database_target.stat().st_size + files_target.stat().st_size
    # Everything on the backup volume counts, the pre-update dumps of dump.sh included.
    used = sum(path.stat().st_size for path in backup_dir.rglob("*") if path.is_file())
    return BackupResult(
        at=timezone.localtime(now).isoformat(),
        database_file=database_target.name,
        files_file=files_target.name,
        size_bytes=size,
        storage_used_bytes=used,
        removed=removed,
    )


def latest(backup_dir: Path | None = None) -> tuple[Path, Path] | None:
    """The newest database file and the files archive taken with it."""
    backup_dir = backup_dir or default_backup_dir()
    if not backup_dir.exists():
        return None
    dumps = sorted(
        path for path in backup_dir.iterdir() if path.name.startswith("db-") and NAME.match(path.name)
    )
    for dump in reversed(dumps):
        stamp = NAME.match(dump.name).group(2)
        archive = backup_dir / f"files-{stamp}.tar.gz.gpg"
        if archive.exists():
            return dump, archive
    return None


def restore_database(*, dump_file: Path, target_db: str, create: bool) -> None:
    passphrase = _passphrase()
    with tempfile.TemporaryDirectory(prefix="restore-") as work_name:
        plain = Path(work_name) / "db.dump"
        decrypt(dump_file, plain, passphrase)
        if create:
            _run(["createdb", *_pg_args(), target_db], env=_pg_env())
        _run(
            [
                "pg_restore",
                *_pg_args(),
                "--dbname",
                target_db,
                "--clean",
                "--if-exists",
                "--no-owner",
                "--exit-on-error",
                str(plain),
            ],
            env=_pg_env(),
        )


def restore_files(*, archive_file: Path, files_dir: Path | None = None) -> int:
    """Unpack the files archive into `files_dir`. Returns the number of files written."""
    passphrase = _passphrase()
    files_dir = files_dir or default_files_dir()
    with tempfile.TemporaryDirectory(prefix="restore-") as work_name:
        work = Path(work_name)
        plain = work / "files.tar.gz"
        decrypt(archive_file, plain, passphrase)
        unpacked = work / "unpacked"
        with tarfile.open(plain, "r:gz") as tar:
            tar.extractall(unpacked, filter="data")
        source = unpacked / "files"
        files_dir.mkdir(parents=True, exist_ok=True)
        if source.exists():
            shutil.copytree(source, files_dir, dirs_exist_ok=True)
        return sum(1 for path in files_dir.rglob("*") if path.is_file())


def count_rows(database: str, table: str) -> int:
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", table):
        raise BackupError(f"not a table name: {table}")
    result = _run(
        [
            "psql",
            *_pg_args(),
            "--dbname",
            database,
            "--tuples-only",
            "--no-align",
            "--command",
            f"SELECT count(*) FROM {table}",
        ],
        env=_pg_env(),
    )
    return int(result.stdout.decode().strip())


def drop_database(name: str) -> None:
    _run(["dropdb", *_pg_args(), "--if-exists", "--force", name], env=_pg_env())
