"""A URL configuration used only by test_problems.py: one view that fails in every way."""

from datetime import UTC, datetime

from django.core.exceptions import PermissionDenied
from django.http import Http404
from django.urls import path
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.errors import Conflict, DomainError, NotFound, Problem, RateLimited


class Line(serializers.Serializer):
    label = serializers.CharField()
    days = serializers.IntegerField(min_value=1)


class Sample(serializers.Serializer):
    name = serializers.CharField(max_length=5)
    lines = Line(many=True, required=False)

    def validate(self, attrs):
        if attrs["name"] == "clash":
            raise serializers.ValidationError("These two do not go together.")
        return attrs


class ProbeView(APIView):
    authentication_classes: list = []
    permission_classes: list = []

    def get(self, request):
        kind = request.query_params.get("kind", "")
        if kind == "domain":
            raise DomainError("test.locked", field="email", until=datetime(2026, 10, 6, 9, 30, tzinfo=UTC))
        if kind == "several":
            raise DomainError(
                "core.validation",
                problems=[Problem("test.first", "start_date"), Problem("test.second")],
            )
        if kind == "not_found":
            raise NotFound()
        if kind == "conflict":
            raise Conflict()
        if kind == "rate":
            raise RateLimited()
        if kind == "http404":
            raise Http404("no such thing")
        if kind == "denied":
            raise PermissionDenied("nope")
        if kind == "crash":
            raise RuntimeError("secret internal detail")
        return Response({"ok": True})

    def post(self, request):
        serializer = Sample(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({"ok": True})


urlpatterns = [path("probe", ProbeView.as_view())]
