"""Who and what the current unit of work belongs to: a request, a job, or nothing."""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Any

from apps.core.net import client_ip

_UNSET: Any = object()

_request: ContextVar[Any] = ContextVar("iris_request", default=None)
_request_id: ContextVar[str] = ContextVar("iris_request_id", default="")
_actor: ContextVar[Any] = ContextVar("iris_actor", default=_UNSET)
_ip: ContextVar[Any] = ContextVar("iris_ip", default=_UNSET)

Tokens = list[tuple[ContextVar, Token]]


def bind_request(request: Any, request_id: str) -> Tokens:
    """Called by RequestContextMiddleware at the start of a request."""
    return [(_request, _request.set(request)), (_request_id, _request_id.set(request_id))]


def unbind(tokens: Tokens) -> None:
    for variable, token in reversed(tokens):
        variable.reset(token)


@contextmanager
def overriding(*, actor: Any = _UNSET, ip: Any = _UNSET, request_id: Any = _UNSET) -> Iterator[None]:
    """For code that knows the actor, address or reference better than the request does (jobs, commands, sign-in)."""
    tokens: Tokens = []
    if actor is not _UNSET:
        tokens.append((_actor, _actor.set(actor)))
    if ip is not _UNSET:
        tokens.append((_ip, _ip.set(ip)))
    if request_id is not _UNSET:
        tokens.append((_request_id, _request_id.set(request_id)))
    try:
        yield
    finally:
        unbind(tokens)


def current_request_id() -> str:
    return _request_id.get()


def current_actor() -> Any | None:
    """The signed-in user of the current request, or None for the system and for anonymous callers."""
    override = _actor.get()
    if override is not _UNSET:
        return override
    user = getattr(_request.get(), "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return getattr(user, "_wrapped", user)  # unwrap Django's lazy user object


def current_ip() -> str | None:
    override = _ip.get()
    if override is not _UNSET:
        return override or None
    request = _request.get()
    if request is None:
        return None
    return client_ip(request) or None


def logged_user_id() -> str | None:
    """The signed-in user's public id, only if the request has already loaded the user. Never queries."""
    user = getattr(_request.get(), "_cached_user", None)
    public_id = getattr(user, "public_id", None)
    return str(public_id) if public_id else None
