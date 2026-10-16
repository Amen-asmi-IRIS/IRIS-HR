from datetime import datetime

from django.contrib.auth.hashers import UNUSABLE_PASSWORD_PREFIX
from django.contrib.sessions.models import Session
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User


@transaction.atomic
def cleanup(*, now: datetime | None = None) -> dict[str, int]:
    """Daily job body: deletes expired sessions and makes expired temporary passwords unusable. Safe to repeat."""
    now = now or timezone.now()

    expired_sessions = Session.objects.filter(expire_date__lt=now)
    sessions = expired_sessions.count()
    expired_sessions.delete()

    stale = User.objects.filter(must_change_password=True, temp_password_expires_at__lt=now).exclude(
        password__startswith=UNUSABLE_PASSWORD_PREFIX
    )
    passwords = 0
    for user in stale:
        user.set_unusable_password()
        user.save(update_fields=["password"])
        passwords += 1

    return {"expired_sessions": sessions, "expired_temporary_passwords": passwords}
