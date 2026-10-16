"""One error format for the whole API: problem details (master 6.2)."""

import logging
from http import HTTPStatus
from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.db import transaction
from django.http import Http404, JsonResponse
from django.utils import timezone
from rest_framework import exceptions as drf
from rest_framework.response import Response

from apps.core import context
from apps.core.errors import DomainError
from apps.core.i18n import translate

logger = logging.getLogger("iris.errors")

CONTENT_TYPE = "application/problem+json"
NON_FIELD_KEY = "non_field_errors"

_DRF_CODES: tuple[tuple[type[drf.APIException], str], ...] = (
    (drf.NotAuthenticated, "core.not_authenticated"),
    (drf.AuthenticationFailed, "core.not_authenticated"),
    (drf.PermissionDenied, "core.not_allowed"),
    (drf.NotFound, "core.not_found"),
    (drf.MethodNotAllowed, "core.method_not_allowed"),
    (drf.ParseError, "core.malformed"),
    (drf.UnsupportedMediaType, "core.unsupported_media_type"),
    (drf.NotAcceptable, "core.not_acceptable"),
    (drf.Throttled, "core.rate_limited"),
)


def problem_entry(
    code: str, *, field: str | None = None, detail: str | None = None, params: dict[str, Any] | None = None
) -> dict[str, Any]:
    values = dict(params or {})
    return {
        "field": field,
        "code": code,
        "detail": translate(code, **values) if detail is None else detail,
        "params": values,
    }


def problem_body(
    *, status: int, code: str, errors: list[dict[str, Any]], detail: str | None = None
) -> dict[str, Any]:
    return {
        "type": f"urn:iris-hr:problem:{code}",
        "title": HTTPStatus(status).phrase,
        "status": status,
        "code": code,
        "detail": errors[0]["detail"] if detail is None else detail,
        "errors": errors,
        "request_id": context.current_request_id(),
    }


def _respond(
    status: int,
    code: str,
    errors: list[dict[str, Any]],
    *,
    detail: str | None = None,
    headers: dict[str, str] | None = None,
) -> Response:
    body = problem_body(status=status, code=code, errors=errors, detail=detail)
    return Response(body, status=status, headers=headers, content_type=CONTENT_TYPE)


def _is_leaf(node: Any) -> bool:
    return isinstance(node, dict) and set(node) == {"message", "code"} and isinstance(node["message"], str)


def _flatten(node: Any, path: str = "") -> list[dict[str, Any]]:
    """Turns DRF's nested validation details into a flat list with dotted field paths."""
    if _is_leaf(node):
        return [problem_entry(f"validation.{node['code']}", field=path or None, detail=str(node["message"]))]
    found: list[dict[str, Any]] = []
    if isinstance(node, dict):
        for key, child in node.items():
            child_path = path if key == NON_FIELD_KEY else (f"{path}.{key}" if path else str(key))
            found.extend(_flatten(child, child_path))
    elif isinstance(node, list):
        for index, child in enumerate(node):
            child_path = path if _is_leaf(child) else (f"{path}.{index}" if path else str(index))
            found.extend(_flatten(child, child_path))
    return found


def _unexpected_errors() -> list[dict[str, Any]]:
    return [problem_entry("core.unexpected", params={"reference": context.current_request_id()})]


def _notify_administrators() -> None:
    """Tells the System Administrators, at most once per clock hour, that someone met an error (PRD 9.7)."""
    try:
        # Imported here: apps.core is loaded before the apps it would otherwise import.
        from apps.accounts.roles import Role, users_with_role
        from apps.notifications import services as notifications

        with transaction.atomic():
            notifications.notify(
                users=users_with_role(Role.SYSADMIN),
                event="error.unexpected",
                params={"reference": context.current_request_id()},
                dedupe_key=f"error.unexpected:{timezone.now():%Y%m%d%H}",
            )
    except Exception:  # the user must get the 500 answer whatever happens here
        logger.exception("could not notify the administrators of an unexpected error")


def exception_handler(exc: Exception, handler_context: dict[str, Any]) -> Response:
    if isinstance(exc, DomainError):
        errors = [problem_entry(p.code, field=p.field, params=dict(p.params)) for p in exc.problems]
        summary = translate(exc.code, **exc.params) if len(errors) > 1 else None
        return _respond(exc.status, exc.code, errors, detail=summary)

    if isinstance(exc, Http404):
        exc = drf.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = drf.PermissionDenied()

    if isinstance(exc, drf.ValidationError):
        errors = _flatten(exc.get_full_details()) or [problem_entry("core.validation")]
        return _respond(400, "core.validation", errors, detail=translate("core.validation"))

    if isinstance(exc, drf.APIException) and exc.status_code < 500:
        code = next((known for cls, known in _DRF_CODES if isinstance(exc, cls)), "core.invalid")
        headers: dict[str, str] = {}
        if getattr(exc, "auth_header", None):
            headers["WWW-Authenticate"] = exc.auth_header
        if getattr(exc, "wait", None):
            headers["Retry-After"] = str(int(exc.wait))
        return _respond(exc.status_code, code, [problem_entry(code)], headers=headers)

    logger.error("unexpected error", exc_info=exc)
    _notify_administrators()
    return _respond(500, "core.unexpected", _unexpected_errors())


def not_found_view(request, exception=None) -> JsonResponse:
    """Django's handler404: an address that matches no route."""
    body = problem_body(status=404, code="core.not_found", errors=[problem_entry("core.not_found")])
    return JsonResponse(body, status=404, content_type=CONTENT_TYPE)


def server_error_view(request) -> JsonResponse:
    """Django's handler500: an error raised outside a DRF view. Django has already logged it."""
    _notify_administrators()
    body = problem_body(status=500, code="core.unexpected", errors=_unexpected_errors())
    return JsonResponse(body, status=500, content_type=CONTENT_TYPE)
