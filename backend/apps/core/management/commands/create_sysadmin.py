from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts import services
from apps.accounts.roles import Role
from apps.core.errors import DomainError
from apps.core.i18n import translate


class Command(BaseCommand):
    help = "Creates a System Administrator account and prints its temporary password once (go-live step 1)."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--email", required=True, help="Professional email of the administrator.")
        parser.add_argument("--name", required=True, help="Full name of the administrator.")

    def handle(self, *args, **options) -> None:
        try:
            user, temporary = services.create_account(
                actor=None, email=options["email"], full_name=options["name"], roles=[Role.SYSADMIN]
            )
        except DomainError as exc:
            raise CommandError(translate(exc.code, "en", **exc.params)) from exc
        expires = timezone.localtime(user.temp_password_expires_at)
        self.stdout.write(f"Account created: {user.email}")
        self.stdout.write(f"Temporary password: {temporary}")
        self.stdout.write(
            f"Valid until {expires:%d/%m/%Y %H:%M}. It is stored nowhere readable: hand it over now. "
            "The administrator chooses a new password at first sign-in."
        )
