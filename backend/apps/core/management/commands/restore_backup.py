"""Restore a backup: into a scratch database to prove it works, or in place."""

import uuid
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.core import backup

CHECK_TABLES = [
    "accounts_user",
    "audit_auditevent",
    "organisation_employee",
    "requests_request",
    "balances_ledgerentry",
    "files_attachment",
]


class Command(BaseCommand):
    help = "Restore the newest backup (or the named files). --scratch proves a backup; --in-place replaces live data."

    def add_arguments(self, parser):
        parser.add_argument("--db", help="database file name in /data/backups; default: the newest")
        parser.add_argument(
            "--files", help="files archive name in /data/backups; default: the one taken with --db"
        )
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument(
            "--scratch", action="store_true", help="restore into a temporary database, count, drop it"
        )
        mode.add_argument("--in-place", action="store_true", help="replace the live database and the files")
        parser.add_argument("--yes", action="store_true", help="required with --in-place")

    def _pick(self, options) -> tuple[Path, Path | None]:
        if options["db"]:
            database_file = backup.default_backup_dir() / options["db"]
            stamp = backup.NAME.match(database_file.name)
            paired = backup.default_backup_dir() / f"files-{stamp.group(2)}.tar.gz.gpg" if stamp else None
            files_file = backup.default_backup_dir() / options["files"] if options["files"] else paired
        else:
            pair = backup.latest()
            if pair is None:
                raise CommandError(f"no backup found in {backup.default_backup_dir()}")
            database_file, files_file = pair
        if not database_file.exists():
            raise CommandError(f"{database_file} does not exist")
        return database_file, files_file if files_file and files_file.exists() else None

    def handle(self, *args, **options):
        database_file, files_file = self._pick(options)
        try:
            if options["scratch"]:
                self._scratch(database_file)
            else:
                if not options["yes"]:
                    raise CommandError("--in-place replaces live data; repeat the command with --yes")
                self._in_place(database_file, files_file)
        except backup.BackupError as error:
            raise CommandError(str(error)) from error

    def _scratch(self, database_file: Path) -> None:
        scratch = f"iris_restore_check_{uuid.uuid4().hex[:8]}"
        self.stdout.write(f"Restoring {database_file.name} into {scratch}")
        try:
            backup.restore_database(dump_file=database_file, target_db=scratch, create=True)
            for table in CHECK_TABLES:
                try:
                    self.stdout.write(f"  {table}: {backup.count_rows(scratch, table)} rows")
                except backup.BackupError:
                    self.stdout.write(f"  {table}: not in this backup")
            if backup.count_rows(scratch, "accounts_user") < 1:
                raise CommandError("the restored database has no account; the backup is not usable")
        finally:
            backup.drop_database(scratch)
        self.stdout.write(self.style.SUCCESS("Restore check passed"))

    def _in_place(self, database_file: Path, files_file: Path | None) -> None:
        live = settings.DATABASES["default"]["NAME"]
        self.stdout.write(f"Restoring {database_file.name} into {live}")
        backup.restore_database(dump_file=database_file, target_db=live, create=False)
        if files_file is not None:
            count = backup.restore_files(archive_file=files_file)
            self.stdout.write(f"Restored files from {files_file.name}: {count} files present")
        else:
            self.stdout.write(self.style.WARNING("No files archive restored"))
        self.stdout.write(self.style.SUCCESS("Restore finished"))
