"""Signing in and out, and changing one's own password (PRD 5.1)."""

from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.utils import timezone

from apps.accounts.emails import has_allowed_domain, normalise_email, recordable_address
from apps.accounts.models import User
from apps.accounts.passwords import validate_new_password
from apps.audit import selectors as audit_selectors
from apps.audit import services as audit
from apps.core import context
from apps.core.errors import DomainError, RateLimited
from apps.core.i18n import translate
from apps.settings import services as settings_service

LAST_ACTIVITY_KEY = "last_activity"
AUTH_BACKEND = "django.contrib.auth.backends.ModelBackend"


def _record_failure(user: User | None, address: str, reason: str) -> None:
    audit.record(
        action="auth.login_failed",
        category=audit.SECURITY,
        actor=None,
        obj=user,
        object_type="user",
        # Without an account, the label is what was typed: never kept unless it has the shape of an address.
        object_label=user.email if user is not None else recordable_address(address),
        changes={"reason": reason},
    )


def _check_known_user(
    user_id: int, password: str, address: str, now: datetime, window: timedelta
) -> tuple[str, User]:
    """Applies the rules to an existing account under a row lock. Returns the outcome and the fresh user."""
    threshold = settings_service.get("lockout_threshold")
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=user_id)
        if user.locked_until and user.locked_until > now:
            _record_failure(user, address, "locked")
            return "locked", user
        expires = user.temp_password_expires_at
        if user.must_change_password and expires is not None and expires <= now:
            # An expired temporary password is no longer a secret worth hiding: say so whatever was typed.
            _record_failure(user, address, "temp_password_expired")
            return "temp_expired", user
        if not user.check_password(password):
            user.failed_attempts += 1
            locking = user.failed_attempts >= threshold
            if locking:
                user.failed_attempts = 0
                user.locked_until = now + window
            user.save(update_fields=["failed_attempts", "locked_until"])
            _record_failure(user, address, "wrong_password")
            if locking:
                audit.record(
                    action="auth.locked",
                    category=audit.SECURITY,
                    actor=None,
                    obj=user,
                    changes={"until": user.locked_until},
                )
                return "locked", user
            return "wrong", user
        if not user.is_active:
            _record_failure(user, address, "disabled")
            return "disabled", user
        if user.failed_attempts or user.locked_until:
            user.failed_attempts = 0
            user.locked_until = None
            user.save(update_fields=["failed_attempts", "locked_until"])
        return "ok", user


def authenticate(*, email: str, password: str, ip: str) -> User:
    """Returns the account for these credentials, or raises a DomainError that says why not (UI 4.1)."""
    now = timezone.now()
    address = normalise_email(email)
    minutes = settings_service.get("lockout_minutes")
    window = timedelta(minutes=minutes)

    with context.overriding(ip=ip or None):
        if ip:
            failures = audit_selectors.count_recent(
                action="auth.login_failed", ip_address=ip, since=now - window
            )
            if failures >= settings_service.get("login_ip_max_attempts"):
                raise RateLimited("auth.rate_limited", minutes=minutes)

        if not has_allowed_domain(address):
            _record_failure(None, address, "domain")
            raise DomainError("auth.domain_not_allowed", field="email", domain=settings.ALLOWED_EMAIL_DOMAIN)

        known = User.objects.filter(email=address).first()
        if known is None:
            # The same work as a real check, so timing does not reveal who has an account.
            make_password(password)
            _record_failure(None, address, "unknown")
            raise DomainError("auth.invalid_credentials")

        outcome, user = _check_known_user(known.pk, password, address, now, window)

    if outcome == "locked":
        raise DomainError("auth.locked", until=user.locked_until)
    if outcome == "temp_expired":
        raise DomainError("auth.temp_password_expired")
    if outcome == "wrong":
        raise DomainError("auth.invalid_credentials")
    if outcome == "disabled":
        raise DomainError("auth.disabled")
    return user


def start_session(request, user: User) -> None:
    """Opens the server-side session and records the sign-in (ACC-07)."""
    http_request = getattr(request, "_request", request)
    django_login(http_request, user, backend=AUTH_BACKEND)
    now = timezone.now()
    user.previous_login_at = user.last_login_at
    user.last_login_at = now
    user.save(update_fields=["previous_login_at", "last_login_at"])
    http_request.session[LAST_ACTIVITY_KEY] = now.timestamp()
    audit.record(action="auth.login", category=audit.SECURITY, actor=user, obj=user)


def end_session(request) -> None:
    http_request = getattr(request, "_request", request)
    user = getattr(http_request, "user", None)
    if user is not None and user.is_authenticated:
        actor = getattr(user, "_wrapped", user)
        audit.record(action="auth.logout", category=audit.SECURITY, actor=actor, obj=actor)
    django_logout(http_request)


@transaction.atomic
def change_password(*, user: User, current_password: str, new_password: str) -> None:
    """The user's own change (ACC-08). Also the way out of a temporary password (ACC-05)."""
    if not user.check_password(current_password):
        raise DomainError("auth.wrong_current_password", field="current_password")
    if new_password == current_password:
        raise DomainError("auth.weak_password", field="new_password", reasons=translate("auth.same_password"))
    validate_new_password(new_password, user)
    user.set_password(new_password)
    user.must_change_password = False
    user.temp_password_expires_at = None
    user.save(update_fields=["password", "must_change_password", "temp_password_expires_at"])
    audit.record(action="auth.password_changed", category=audit.SECURITY, actor=user, obj=user)
