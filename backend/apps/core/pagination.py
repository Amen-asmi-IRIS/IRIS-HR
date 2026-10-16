"""Lists are always paginated the same way: {count, next, previous, results}."""

from drf_spectacular.utils import OpenApiParameter
from rest_framework import serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class DefaultPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


PAGE_PARAMETERS = [
    OpenApiParameter("page", int, description="Page number, starting at 1."),
    OpenApiParameter("page_size", int, description="Items per page: 25 by default, 100 at most."),
]

_paginated_classes: dict[type, type] = {}


def paginated(serializer_class: type[serializers.Serializer]) -> type[serializers.Serializer]:
    """The schema of a paginated list of `serializer_class`, for @extend_schema(responses=...)."""
    if serializer_class not in _paginated_classes:
        _paginated_classes[serializer_class] = type(
            f"Paginated{serializer_class.__name__}",
            (serializers.Serializer,),
            {
                "count": serializers.IntegerField(),
                "next": serializers.URLField(allow_null=True),
                "previous": serializers.URLField(allow_null=True),
                "results": serializer_class(many=True),
            },
        )
    return _paginated_classes[serializer_class]


def paginate(request, view, queryset, serializer_class, *, context=None) -> Response:
    """Returns one page of `queryset` (a queryset or a list) serialised with `serializer_class`."""
    paginator = DefaultPagination()
    page = paginator.paginate_queryset(queryset, request, view=view)
    serializer = serializer_class(page, many=True, context={"request": request, **(context or {})})
    return paginator.get_paginated_response(serializer.data)
