from importlib import import_module

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

# One module per app, in dependency order. Each exposes seed() and is safe to run twice.
# A plan that adds demo data appends its module here.
SEEDERS = [
    "apps.accounts.seed",
    "apps.organisation.seed",
    "apps.calendar.seed",
    "apps.balances.seed",
    "apps.requests.seed",
]


class Command(BaseCommand):
    help = "Loads demo accounts and data for development and browser tests. Never runs in production."

    def handle(self, *args, **options) -> None:
        if settings.ENVIRONMENT == "production":
            raise CommandError("seed_demo never runs in production.")
        for path in SEEDERS:
            import_module(path).seed()
            self.stdout.write(f"seeded {path}")
        self.stdout.write("Demo data ready. Every demo account uses the password Correct-Horse-42!")
