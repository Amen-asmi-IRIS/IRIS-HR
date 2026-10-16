from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import PUBLIC
from apps.accounts.roles import Role
from apps.core import selectors
from apps.core.api.serializers import HealthOut, StatusOut


class HealthView(APIView):
    """Called by the update command and by monitoring. 200 when everything works, 503 otherwise."""

    access = {"GET": PUBLIC}
    http_method_names = ["get"]
    authentication_classes: list = []  # must answer even when sessions cannot be read

    @extend_schema(operation_id="health", auth=[], responses={200: HealthOut, 503: HealthOut})
    def get(self, request):
        report = selectors.health_report()
        return Response(HealthOut(report).data, status=200 if report["status"] == "ok" else 503)


class StatusView(APIView):
    access = {"GET": {Role.SYSADMIN, Role.EXEC}}
    http_method_names = ["get"]
    background = True  # the Status page asks every minute: that is not the person's activity (ACC-04)

    @extend_schema(operation_id="admin_status", responses=StatusOut)
    def get(self, request):
        return Response(StatusOut(selectors.admin_status()).data)
