from datetime import date

from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role
from apps.core.errors import DomainError, NotFound

from .. import selectors, services
from ..lang import pick
from ..models import PublicHoliday
from .serializers import HolidayCopyIn, HolidayImpactOut, HolidayIn, HolidayOut, HolidayPatchIn

STAFF = {Role.EMPLOYEE, Role.HR, Role.EXEC}


def _holiday(pk: int) -> PublicHoliday:
    holiday = PublicHoliday.objects.filter(pk=pk).first()
    if holiday is None:
        raise NotFound("core.not_found")
    return holiday


class HolidayListView(APIView):
    http_method_names = ["get", "post"]
    access = {"GET": STAFF, "POST": {Role.HR}}

    @extend_schema(
        operation_id="holidays_list",
        parameters=[OpenApiParameter("year", int, required=False)],
        responses=HolidayOut(many=True),
    )
    def get(self, request):
        raw = request.query_params.get("year")
        try:
            year = int(raw) if raw else timezone.localdate().year
        except ValueError:
            raise DomainError("calendar.year_invalid", field="year") from None
        if not 1900 <= year <= 2200:
            raise DomainError("calendar.year_invalid", field="year")
        return Response(HolidayOut(selectors.holidays_of_year(year), many=True).data)

    @extend_schema(operation_id="holidays_create", request=HolidayIn, responses={201: HolidayOut})
    def post(self, request):
        data = HolidayIn(data=request.data)
        data.is_valid(raise_exception=True)
        holiday = services.create_holiday(actor=request.user, **data.validated_data)
        return Response(HolidayOut(holiday).data, status=201)


class HolidayDetailView(APIView):
    http_method_names = ["patch", "delete"]
    access = {"PATCH": {Role.HR}, "DELETE": {Role.HR}}

    @extend_schema(operation_id="holidays_update", request=HolidayPatchIn, responses=HolidayOut)
    def patch(self, request, pk: int):
        holiday = _holiday(pk)
        data = HolidayPatchIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = {
            "date": holiday.date,
            "name_fr": holiday.name_fr,
            "name_en": holiday.name_en,
            "recurs_yearly": holiday.recurs_yearly,
            **data.validated_data,
        }
        holiday = services.update_holiday(actor=request.user, holiday=holiday, **values)
        return Response(HolidayOut(holiday).data)

    @extend_schema(operation_id="holidays_delete", request=None, responses={204: None})
    def delete(self, request, pk: int):
        services.delete_holiday(actor=request.user, holiday=_holiday(pk))
        return Response(status=204)


class HolidayCopyView(APIView):
    http_method_names = ["post"]
    access = {"POST": {Role.HR}}

    @extend_schema(
        operation_id="holidays_copy", request=HolidayCopyIn, responses={201: HolidayOut(many=True)}
    )
    def post(self, request):
        data = HolidayCopyIn(data=request.data)
        data.is_valid(raise_exception=True)
        created = services.copy_recurring_holidays(actor=request.user, **data.validated_data)
        return Response(HolidayOut(created, many=True).data, status=201)


class HolidayImpactView(APIView):
    http_method_names = ["get"]
    access = {"GET": {Role.HR}}

    @extend_schema(
        operation_id="holidays_impact",
        parameters=[OpenApiParameter("date", str, required=True, description="ISO date")],
        responses=HolidayImpactOut(many=True),
    )
    def get(self, request):
        # Imported here: the calendar app stays loadable on its own, and requests builds on it.
        from apps.organisation.selectors import full_name
        from apps.requests.selectors import requests_touching

        try:
            day = date.fromisoformat(request.query_params.get("date") or "")
        except ValueError:
            raise DomainError("calendar.date_required", field="date") from None
        items = [
            {
                "public_id": found.public_id,
                "employee": full_name(found.employee),
                "type": pick(found.request_type.name_fr, found.request_type.name_en),
                "start_date": found.start_date,
                "end_date": found.end_date,
                "quantity": found.quantity,
            }
            for found in requests_touching(day)
        ]
        return Response(HolidayImpactOut(items, many=True).data)
