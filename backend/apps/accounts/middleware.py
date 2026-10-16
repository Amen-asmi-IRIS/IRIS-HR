from django.contrib.auth import logout as django_logout
from django.db import Error as DatabaseFailure
from django.utils import timezone
from django.utils.functional import SimpleLazyObject

from apps.accounts.services.signin import LAST_ACTIVITY_KEY
from apps.audit import services as audit
from apps.settings import services as settings_service

REFRESH_SECONDS = 60  # the session row is rewritten at most once a minute


def _unreadable(failure: Exception) -> SimpleLazyObject:
    """Stands in for `request.user` when the session could not be read: reading it fails the same way again."""

    def fail():
        raise failure

    return SimpleLazyObject(fail)


def _is_background(view) -> bool:
    """True for a view class that declares `background = True`: a call the page makes by itself, on a timer."""
    return getattr(getattr(view, "cls", None), "background", False) is True


class InactivityMiddleware:
    """Ends a session that stayed idle longer than the `session_timeout_minutes` setting (ACC-04).

    Every call is checked against the limit. Every call also counts as activity, except a call to a view that
    declares `background = True`: what a page asks for on a timer must not keep an unattended session alive.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_view(self, request, view, view_args, view_kwargs):
        # Done here and not in __call__: only now is the view known, and with it whether the call is background.
        user = getattr(request, "user", None)
        try:
            signed_in = user is not None and user.is_authenticated
        except DatabaseFailure as failure:
            # The session cannot be read, so the idle limit cannot be checked. Nothing is decided here, but the
            # request no longer has a user: a view that needs the session fails on the same error and answers
            # 500, even if the database is back by then. One that needs none (the health check) can still say
            # what is wrong.
            request.user = _unreadable(failure)
            signed_in = False
        if signed_in:
            now = timezone.now().timestamp()
            last = request.session.get(LAST_ACTIVITY_KEY)
            limit = settings_service.get("session_timeout_minutes") * 60
            if last is not None and now - last > limit:
                actor = getattr(user, "_wrapped", user)
                audit.record(action="auth.session_expired", category=audit.SECURITY, actor=actor, obj=actor)
                django_logout(request)
            elif last is None or (now - last >= REFRESH_SECONDS and not _is_background(view)):
                # A session without a time gets one from any call: a background call must not keep it for ever.
                request.session[LAST_ACTIVITY_KEY] = now
        return None
