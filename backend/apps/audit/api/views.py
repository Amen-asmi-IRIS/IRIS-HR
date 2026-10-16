from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.views import APIView

from apps.accounts.roles import Role
from apps.audit import selectors
from apps.audit import services as audit
from apps.audit.api.serializers import AuditEventOut, AuditFilterIn
from apps.audit.exports import export_events
from apps.core.errors import DomainError
from apps.core.ordering import apply_ordering, ordering_parameter
from apps.core.pagination import PAGE_PARAMETERS, paginate, paginated

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
BUSINESS_READERS = {Role.HR, Role.EXEC}
SECURITY_READERS = {Role.SYSADMIN, Role.EXEC}

AUDIT_ORDERINGS = {
    "-at": ("-at", "-id"),
    "at": ("at", "id"),
    "action": ("action", "-at"),
    "-action": ("-action", "-at"),
}


def _filtered(request, category: str):
    """Returns (the filters given, the matching events)."""
    serializer = AuditFilterIn(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    given = serializer.validated_data
    date_from, date_to = given.get("from"), given.get("to")
    if date_from and date_to and date_from > date_to:
        raise DomainError("audit.period_order", field="to")
    events = selectors.list_events(
        category=category,
        actor_public_id=given.get("actor"),
        action=given.get("action", ""),
        object_type=given.get("object_type", ""),
        object_id=given.get("object_id", ""),
        date_from=date_from,
        date_to=date_to,
    )
    # An export follows the order of the list it was started from.
    return given, apply_ordering(request, events, AUDIT_ORDERINGS, "-at")


def _list(view, request, category: str):
    _, events = _filtered(request, category)
    return paginate(request, view, events, AuditEventOut)


def _export(request, category: str) -> HttpResponse:
    given, events = _filtered(request, category)
    content, filename = export_events(actor=request.user, category=category, events=events, filters=given)
    response = HttpResponse(content, content_type=XLSX)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


class BusinessAuditView(APIView):
    access = {"GET": BUSINESS_READERS}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="audit_business_list",
        parameters=[AuditFilterIn, ordering_parameter(AUDIT_ORDERINGS, "-at"), *PAGE_PARAMETERS],
        responses=paginated(AuditEventOut),
    )
    def get(self, request):
        return _list(self, request, audit.BUSINESS)


class SecurityAuditView(APIView):
    access = {"GET": SECURITY_READERS}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="audit_security_list",
        parameters=[AuditFilterIn, ordering_parameter(AUDIT_ORDERINGS, "-at"), *PAGE_PARAMETERS],
        responses=paginated(AuditEventOut),
    )
    def get(self, request):
        return _list(self, request, audit.SECURITY)


class BusinessAuditExportView(APIView):
    access = {"GET": BUSINESS_READERS}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="audit_business_export",
        parameters=[AuditFilterIn, ordering_parameter(AUDIT_ORDERINGS, "-at")],
        responses={(200, XLSX): OpenApiTypes.BINARY},
    )
    def get(self, request):
        return _export(request, audit.BUSINESS)


class SecurityAuditExportView(APIView):
    access = {"GET": SECURITY_READERS}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="audit_security_export",
        parameters=[AuditFilterIn, ordering_parameter(AUDIT_ORDERINGS, "-at")],
        responses={(200, XLSX): OpenApiTypes.BINARY},
    )
    def get(self, request):
        return _export(request, audit.SECURITY)
