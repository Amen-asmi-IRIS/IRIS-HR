from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role
from apps.core.errors import NotFound
from apps.settings import registry
from apps.settings import services as settings_service
from apps.settings.api.serializers import SettingOut, SettingValueIn


def _list(group: str) -> Response:
    return Response(SettingOut(settings_service.list_group(group), many=True).data)


def _update(request, group: str, key: str) -> Response:
    if registry.get_def(key).group != group:  # a key of the other group does not exist at this address
        raise NotFound("settings.unknown_key", field="key", key=key)
    data = SettingValueIn(data=request.data)
    data.is_valid(raise_exception=True)
    settings_service.set_value(actor=request.user, key=key, value=data.validated_data["value"])
    return Response(SettingOut(settings_service.row_for(key)).data)


class HrSettingsView(APIView):
    access = {"GET": {Role.HR, Role.EXEC}}
    http_method_names = ["get"]

    @extend_schema(operation_id="settings_hr_list", responses=SettingOut(many=True))
    def get(self, request):
        return _list("hr")


class HrSettingItemView(APIView):
    access = {"PUT": {Role.HR}}
    http_method_names = ["put"]

    @extend_schema(operation_id="settings_hr_update", request=SettingValueIn, responses=SettingOut)
    def put(self, request, key: str):
        return _update(request, "hr", key)


class SystemSettingsView(APIView):
    access = {"GET": {Role.SYSADMIN, Role.EXEC}}
    http_method_names = ["get"]

    @extend_schema(operation_id="settings_system_list", responses=SettingOut(many=True))
    def get(self, request):
        return _list("system")


class SystemSettingItemView(APIView):
    access = {"PUT": {Role.SYSADMIN}}
    http_method_names = ["put"]

    @extend_schema(operation_id="settings_system_update", request=SettingValueIn, responses=SettingOut)
    def put(self, request, key: str):
        return _update(request, "system", key)
