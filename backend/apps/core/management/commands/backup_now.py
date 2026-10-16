"""Take a backup immediately. Used before a restore and by the runbook."""

from django.core.management.base import BaseCommand, CommandError

from apps.core import backup


class Command(BaseCommand):
    help = "Write an encrypted database dump and files archive to /data/backups."

    def handle(self, *args, **options):
        try:
            result = backup.run_backup()
        except backup.BackupError as error:
            raise CommandError(str(error)) from error
        self.stdout.write(
            f"{result.database_file}\n{result.files_file}\n"
            f"{result.size_bytes} bytes written, {result.storage_used_bytes} bytes used in total"
        )
