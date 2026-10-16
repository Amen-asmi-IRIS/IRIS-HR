"""A URL configuration used only by permission tests: one view per kind of access."""

from django.middleware.csrf import get_token
from django.urls import path
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import AUTHENTICATED, PUBLIC
from apps.accounts.roles import Role


class OpenView(APIView):
    access = {"GET": PUBLIC, "POST": PUBLIC}
    http_method_names = ["get", "post"]

    def get(self, request):
        return Response({"csrf_token": get_token(request._request)})

    def post(self, request):
        return Response({"ok": True})


class SignedInView(APIView):
    access = {"GET": AUTHENTICATED}
    http_method_names = ["get"]

    def get(self, request):
        return Response({"email": request.user.email, "user_class": type(request.user).__name__})


class HrView(APIView):
    access = {"GET": {Role.HR}, "POST": {Role.HR, Role.EXEC}}
    http_method_names = ["get", "post", "put"]

    def get(self, request):
        return Response({"ok": True})

    def post(self, request):
        return Response({"ok": True})

    def put(self, request):  # implemented, but not declared in `access`
        return Response({"ok": True})


class UndeclaredView(APIView):
    http_method_names = ["get"]

    def get(self, request):
        return Response({"ok": True})


urlpatterns = [
    path("open", OpenView.as_view(), name="open"),
    path("signed-in", SignedInView.as_view(), name="signed-in"),
    path("hr", HrView.as_view(), name="hr"),
    path("undeclared", UndeclaredView.as_view(), name="undeclared"),
]
