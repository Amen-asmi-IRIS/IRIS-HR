"""Prints the access each API route declares, as a Markdown table."""

from django.core.management.base import BaseCommand
from django.urls import URLPattern, URLResolver, get_resolver

from apps.accounts.permissions import AUTHENTICATED, PUBLIC

ROLE_ORDER = ["employee", "manager", "hr", "exec", "sysadmin"]


def _routes(patterns, prefix="", namespaces=()):
    for entry in patterns:
        route = prefix + str(entry.pattern)
        if isinstance(entry, URLResolver):
            deeper = namespaces + ((entry.namespace,) if entry.namespace else ())
            yield from _routes(entry.url_patterns, route, deeper)
        elif isinstance(entry, URLPattern):
            view = getattr(entry.callback, "cls", None) or getattr(entry.callback, "view_class", None)
            if view is not None and route.startswith("api/v1/") and entry.name:
                yield ":".join((*namespaces, entry.name)), route, view


def _cell(value) -> str:
    if value == AUTHENTICATED:
        return "any signed-in account"
    if value == PUBLIC:
        return "public"
    names = sorted((str(role) for role in value), key=ROLE_ORDER.index)
    return ", ".join(names)


class Command(BaseCommand):
    help = "Print every API route with the roles allowed on each method."

    def handle(self, *args, **options):
        lines = ["| Route | Path | Method | Allowed |", "|---|---|---|---|"]
        for name, route, view in sorted(_routes(get_resolver().url_patterns)):
            for method in sorted(getattr(view, "access", {})):
                lines.append(f"| `{name}` | `/{route}` | {method} | {_cell(view.access[method])} |")
        self.stdout.write("\n".join(lines))
