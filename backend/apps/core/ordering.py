"""A whitelisted `ordering` query parameter for list endpoints (PRD 9.3: lists are sortable).

A view names the orders it allows; the client can ask for nothing else, so no column name
ever travels from the address bar to the database.
"""

from collections.abc import Mapping, Sequence

from drf_spectacular.utils import OpenApiParameter

from apps.core.errors import DomainError

Orderings = Mapping[str, Sequence]


def ordering_parameter(allowed: Orderings, default: str | None = None) -> OpenApiParameter:
    usual = f"`{default}`" if default else "the list's own order"
    return OpenApiParameter(
        "ordering",
        str,
        enum=sorted(allowed),
        description=f"Sort order; {usual} when absent. A leading minus sign means descending.",
    )


def chosen_ordering(request, allowed: Orderings, default: str | None = None) -> str | None:
    """The ordering asked for, the default when none is, or a problem when it is not allowed."""
    value = request.query_params.get("ordering") or default
    if value is not None and value not in allowed:
        raise DomainError("core.ordering_invalid", field="ordering", allowed=", ".join(sorted(allowed)))
    return value


def apply_ordering(request, queryset, allowed: Orderings, default: str | None = None):
    """`queryset` in the order asked for. Without `ordering` and without a default it is returned as it is."""
    value = chosen_ordering(request, allowed, default)
    return queryset if value is None else queryset.order_by(*allowed[value])
