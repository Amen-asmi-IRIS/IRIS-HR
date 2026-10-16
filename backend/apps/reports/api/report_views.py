from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role
from apps.reports import kpmg
from apps.reports.tabular import registry
from apps.reports.tabular.render import XLSX_MEDIA_TYPE, to_json

from .report_serializers import KpmgDefaultPeriodOut, ReportFiltersOut, ReportOut

REPORT_NAMES = ["absences", "balances", "waiting", "permission-hours", "remote-days", "certificates"]


def _query(name: str, description: str, enum: list[str] | None = None) -> OpenApiParameter:
    return OpenApiParameter(
        name=name,
        type=str,
        location=OpenApiParameter.QUERY,
        required=False,
        description=description,
        enum=enum,
    )


SCOPE = _query(
    "scope",
    "team (the caller's team) or all (the company); defaults to the widest the caller holds",
    ["team", "all"],
)
PERIOD = [
    _query("from", "First day of the period, ISO date"),
    _query("to", "Last day of the period, ISO date"),
]
PEOPLE = [
    _query("department", "Department id"),
    _query("employee", "Employee public id"),
    _query("type", "Request type code"),
]


class IgnoreFormatNegotiation(DefaultContentNegotiation):
    """`format` is a parameter of the report here, not DRF's renderer override.

    Without this, DRF reads `?format=xlsx` as a request for a renderer named "xlsx", finds none
    (the API renders JSON only) and answers 404 before the view runs.
    """

    def select_renderer(self, request, renderers, format_suffix=None):
        return renderers[0], renderers[0].media_type


def xlsx_response(content: bytes, filename: str) -> HttpResponse:
    response = HttpResponse(content, content_type=XLSX_MEDIA_TYPE)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "no-store"
    return response


class ReportFiltersView(APIView):
    access = {"GET": {Role.MANAGER, Role.HR, Role.EXEC}}
    http_method_names = ["get"]

    @extend_schema(operation_id="reports_filters", parameters=[SCOPE], responses=ReportFiltersOut)
    def get(self, request):
        return Response(registry.filter_options(user=request.user, scope=request.query_params.get("scope")))


class ReportView(APIView):
    access = {"GET": {Role.MANAGER, Role.HR, Role.EXEC}}
    http_method_names = ["get"]
    content_negotiation_class = IgnoreFormatNegotiation

    @extend_schema(
        operation_id="reports_run",
        parameters=[
            OpenApiParameter(name="name", type=str, location=OpenApiParameter.PATH, enum=REPORT_NAMES),
            SCOPE,
            *PERIOD,
            _query("on", "Date of the balances report, ISO date; defaults to today"),
            _query("year", "Year of the monthly reports; defaults to the current year"),
            *PEOPLE,
            _query("step", "Step the request waits on", ["line_manager", "hr_role", "named_person"]),
            _query("format", "xlsx to download the same content as a workbook", ["xlsx"]),
        ],
        responses={(200, "application/json"): ReportOut, (200, XLSX_MEDIA_TYPE): OpenApiTypes.BINARY},
    )
    def get(self, request, name):
        query = request.query_params.dict()
        if query.get("format") == "xlsx":
            content, filename = registry.export_report(user=request.user, name=name, query=query)
            return xlsx_response(content, filename)
        run = registry.run_report(user=request.user, name=name, query=query)
        return Response(to_json(run.result))


class KpmgExportView(APIView):
    access = {"GET": {Role.HR}}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="kpmg_export",
        parameters=[*PERIOD, *PEOPLE],
        responses={(200, XLSX_MEDIA_TYPE): OpenApiTypes.BINARY},
    )
    def get(self, request):
        content, filename = kpmg.export_kpmg(user=request.user, query=request.query_params.dict())
        return xlsx_response(content, filename)


class KpmgDefaultPeriodView(APIView):
    access = {"GET": {Role.HR}}
    http_method_names = ["get"]

    @extend_schema(operation_id="kpmg_default_period", responses=KpmgDefaultPeriodOut)
    def get(self, request):
        start, end, cutoff_day = kpmg.default_period()
        return Response({"start": start.isoformat(), "end": end.isoformat(), "cutoff_day": cutoff_day})
