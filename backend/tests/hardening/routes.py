"""Enumerates every API route with its view class, methods and path converters."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from django.urls import URLPattern, URLResolver, get_resolver

API_PREFIX = "api/v1/"


@dataclass(frozen=True)
class ApiRoute:
    name: str  # "requests:request-detail"
    path: str  # "api/v1/requests/<uuid:public_id>"
    methods: tuple[str, ...]  # ("GET", "PATCH", "DELETE")
    view: type
    converters: dict  # {"public_id": <UUIDConverter>}


def _walk(patterns, prefix: str, namespaces: tuple[str, ...], converters: dict):
    for entry in patterns:
        route = prefix + str(entry.pattern)
        found = {**converters, **getattr(entry.pattern, "converters", {})}
        if isinstance(entry, URLResolver):
            deeper = namespaces + ((entry.namespace,) if entry.namespace else ())
            yield from _walk(entry.url_patterns, route, deeper, found)
        elif isinstance(entry, URLPattern):
            view = getattr(entry.callback, "cls", None) or getattr(entry.callback, "view_class", None)
            if view is None or not route.startswith(API_PREFIX) or not entry.name:
                continue
            access = getattr(view, "access", {})
            name = ":".join((*namespaces, entry.name))
            yield ApiRoute(name=name, path=route, methods=tuple(sorted(access)), view=view, converters=found)


def iter_api_routes() -> list[ApiRoute]:
    return sorted(_walk(get_resolver().url_patterns, "", (), {}), key=lambda r: r.name)


def dummy_kwargs(route: ApiRoute) -> dict:
    """Arguments that resolve the URL without pointing at any real object."""
    values = {}
    for key, converter in route.converters.items():
        kind = type(converter).__name__
        if kind == "UUIDConverter":
            values[key] = uuid.UUID("00000000-0000-4000-8000-000000000000")
        elif kind == "IntConverter":
            values[key] = 999999
        else:
            values[key] = "none"
    return values
