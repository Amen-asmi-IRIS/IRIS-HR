from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role
from apps.calendar.api.feed_serializers import CalendarOut, CalendarQuery, feed_payload
from apps.calendar.feed import calendar_feed


class CalendarFeedView(APIView):
    access = {"GET": {Role.EMPLOYEE, Role.HR, Role.EXEC}}
    http_method_names = ["get"]

    @extend_schema(operation_id="calendar_feed", parameters=[CalendarQuery], responses=CalendarOut)
    def get(self, request):
        query = CalendarQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        params = query.validated_data
        employee = params.get("employee")
        feed = calendar_feed(
            request.user,
            start=params["from"],
            end=params["to"],
            scope=params["scope"],
            department_id=params.get("department"),
            employee_public_id=str(employee) if employee else None,
            type_code=params.get("type"),
            status=params.get("status"),
        )
        return Response(CalendarOut(feed_payload(feed)).data)
