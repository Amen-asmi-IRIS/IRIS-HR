from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS

from apps.core.errors import NotAllowed


class SessionAuth(SessionAuthentication):
    """Server-side session in a cookie (PRD 9.3). No token is ever handed to the browser's storage."""

    def authenticate(self, request):
        # CSRF is checked on every unsafe call, signed in or not, so that sign-in itself is protected.
        if request.method not in SAFE_METHODS:
            self.enforce_csrf(request)
        user = getattr(request._request, "user", None)
        if user is None or not user.is_authenticated or not user.is_active:
            return None
        return (getattr(user, "_wrapped", user), None)  # hand views the plain User, not Django's lazy wrapper

    def enforce_csrf(self, request):
        try:
            super().enforce_csrf(request)
        except PermissionDenied as exc:
            raise NotAllowed("auth.csrf_failed") from exc

    def authenticate_header(self, request):
        # With this header DRF answers 401, not 403, to a caller without a session (master D14).
        return "Session"
