from django.contrib.auth import update_session_auth_hash
from django.middleware.csrf import get_token
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import services
from apps.accounts.api.session_serializers import CsrfOut, LoginIn, MeOut, MePatchIn, PasswordIn
from apps.accounts.me import me_payload
from apps.accounts.permissions import AUTHENTICATED, PUBLIC
from apps.core.net import client_ip


class CsrfView(APIView):
    """Called once when the web app starts: sets the csrftoken cookie that unsafe calls must echo."""

    access = {"GET": PUBLIC}
    http_method_names = ["get"]

    @extend_schema(operation_id="auth_csrf", responses=CsrfOut)
    def get(self, request):
        return Response(CsrfOut({"csrf_token": get_token(request._request)}).data)


class LoginView(APIView):
    access = {"POST": PUBLIC}
    http_method_names = ["post"]

    @extend_schema(operation_id="auth_login", request=LoginIn, responses=MeOut)
    def post(self, request):
        data = LoginIn(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.authenticate(
            email=data.validated_data["email"],
            password=data.validated_data["password"],
            ip=client_ip(request._request),
        )
        services.start_session(request, user)
        return Response(MeOut(me_payload(user)).data)


class LogoutView(APIView):
    access = {"POST": AUTHENTICATED}
    http_method_names = ["post"]

    @extend_schema(operation_id="auth_logout", request=None, responses={204: None})
    def post(self, request):
        services.end_session(request)
        return Response(status=204)


class MeView(APIView):
    access = {"GET": AUTHENTICATED, "PATCH": AUTHENTICATED}
    http_method_names = ["get", "patch"]

    @extend_schema(operation_id="auth_me", responses=MeOut)
    def get(self, request):
        return Response(MeOut(me_payload(request.user)).data)

    @extend_schema(operation_id="auth_me_update", request=MePatchIn, responses=MeOut)
    def patch(self, request):
        data = MePatchIn(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.update_preferences(user=request.user, **data.validated_data)
        return Response(MeOut(me_payload(user)).data)


class PasswordView(APIView):
    access = {"POST": AUTHENTICATED}
    http_method_names = ["post"]

    @extend_schema(operation_id="auth_password", request=PasswordIn, responses={204: None})
    def post(self, request):
        data = PasswordIn(data=request.data)
        data.is_valid(raise_exception=True)
        services.change_password(user=request.user, **data.validated_data)
        # Changing the password invalidates every session of the user; keep the one that made the change.
        update_session_auth_hash(request._request, request.user)
        return Response(status=204)
