from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import AUTHENTICATED
from apps.accounts.roles import Role
from apps.reports import home, summary
from apps.reports.api.serializers import (
    MeHomeOut,
    OverviewHomeOut,
    TeamHomeOut,
    WorkspaceSummaryOut,
    me_home_payload,
    overview_home_payload,
    team_home_payload,
)


class MeHomeView(APIView):
    access = {"GET": {Role.EMPLOYEE}}
    http_method_names = ["get"]

    @extend_schema(operation_id="home_me", responses=MeHomeOut)
    def get(self, request):
        data = home.me_home(request.user)
        return Response(MeHomeOut(me_home_payload(data, request.user)).data)


class TeamHomeView(APIView):
    access = {"GET": {Role.MANAGER}}
    http_method_names = ["get"]

    @extend_schema(operation_id="home_team", responses=TeamHomeOut)
    def get(self, request):
        return Response(TeamHomeOut(team_home_payload(home.team_home(request.user))).data)


class OverviewHomeView(APIView):
    access = {"GET": {Role.EXEC}}
    http_method_names = ["get"]

    @extend_schema(operation_id="home_overview", responses=OverviewHomeOut)
    def get(self, request):
        return Response(OverviewHomeOut(overview_home_payload(home.overview_home(request.user))).data)


class WorkspaceSummaryView(APIView):
    access = {"GET": AUTHENTICATED}
    http_method_names = ["get"]
    # The switcher reads it on a timer: a page left open must not keep its session alive (master 13.1).
    background = True

    @extend_schema(operation_id="workspaces_summary", responses=WorkspaceSummaryOut)
    def get(self, request):
        return Response(WorkspaceSummaryOut(summary.workspace_summary(request.user)).data)
