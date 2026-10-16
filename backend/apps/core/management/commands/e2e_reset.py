from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


def rebuild_schema() -> None:
    """Drops every table. Migrations then recreate them, including the rows that data migrations create."""
    with connection.cursor() as cursor:
        cursor.execute("DROP SCHEMA public CASCADE")
        cursor.execute("CREATE SCHEMA public")
    ContentType.objects.clear_cache()


class Command(BaseCommand):
    help = "Empties the database, re-applies the migrations and loads the demo data. For browser tests only."

    def handle(self, *args, **options) -> None:
        if settings.ENVIRONMENT == "production":
            raise CommandError("e2e_reset never runs in production.")
        rebuild_schema()
        call_command("migrate", interactive=False, verbosity=0)
        call_command("seed_demo", stdout=self.stdout)
        self.stdout.write("Database reset.")
