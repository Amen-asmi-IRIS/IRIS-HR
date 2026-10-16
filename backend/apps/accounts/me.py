"""What the web app needs to know about the signed-in user (master 7.2, shape `Me`)."""

from django.conf import settings

from apps.accounts.ports import employee_directory
from apps.accounts.roles import roles_of, workspaces_of
from apps.accounts.services.naming import display_name


def _reset_notice(user) -> dict | None:
    """Set when an administrator reset the password since the user's previous sign-in (ACC-07)."""
    if user.password_reset_at is None:
        return None
    if user.previous_login_at is not None and user.password_reset_at <= user.previous_login_at:
        return None
    by = display_name(user.password_reset_by) if user.password_reset_by_id else None
    return {"by": by, "at": user.password_reset_at}


def me_payload(user) -> dict:
    ref = employee_directory().ref_for_user(user.pk)
    return {
        "public_id": user.public_id,
        "email": user.email,
        "name": ref.full_name if ref is not None else (user.full_name or user.email),
        "language": user.language,
        "roles": sorted(roles_of(user)),
        "workspaces": workspaces_of(user),
        "last_workspace": user.last_workspace,
        "must_change_password": user.must_change_password,
        "previous_login_at": user.previous_login_at,
        "password_reset": _reset_notice(user),
        "employee": {"public_id": ref.public_id, "name": ref.full_name} if ref is not None else None,
        "environment": settings.ENVIRONMENT,
        "version": settings.APP_VERSION,
    }
