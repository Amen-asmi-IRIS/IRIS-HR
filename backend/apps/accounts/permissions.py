"""Every endpoint declares who may call it (master 6.4). An undeclared view or method is closed."""

import logging

from rest_framework.permissions import BasePermission

from apps.accounts.roles import roles_of
from apps.core.errors import NotAllowed

logger = logging.getLogger("iris.permissions")

AUTHENTICATED = "authenticated"
PUBLIC = "public"

# Reachable while the user still has to choose a password (ACC-05).
GATE_EXEMPT_ROUTES = frozenset({"accounts:me", "accounts:password", "accounts:logout", "accounts:csrf"})


def _route_name(request) -> str:
    match = getattr(request, "resolver_match", None)
    return match.view_name if match is not None else ""


class RolePermission(BasePermission):
    """Reads `view.access`: {"GET": {Role.HR, Role.EXEC}, "POST": AUTHENTICATED, ...}."""

    def has_permission(self, request, view) -> bool:
        access = getattr(view, "access", None)
        if access is None:
            logger.error("view declares no access", extra={"data": {"view": type(view).__name__}})
            return False
        allowed = access.get(request.method)
        if allowed is None:
            return False
        if allowed == PUBLIC:
            return True
        user = request.user
        if user is None or not user.is_authenticated:
            return False
        if user.must_change_password and _route_name(request) not in GATE_EXEMPT_ROUTES:
            raise NotAllowed("auth.password_change_required")
        if allowed == AUTHENTICATED:
            return True
        return bool(roles_of(user) & frozenset(allowed))
