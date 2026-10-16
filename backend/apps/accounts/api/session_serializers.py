from rest_framework import serializers

from apps.accounts.models import LANGUAGE_CHOICES
from apps.accounts.roles import WORKSPACE_CHOICES


class CsrfOut(serializers.Serializer):
    csrf_token = serializers.CharField()


class LoginIn(serializers.Serializer):
    email = serializers.CharField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class PasswordResetNoticeOut(serializers.Serializer):
    by = serializers.CharField(allow_null=True)
    at = serializers.DateTimeField()


class EmployeeBriefOut(serializers.Serializer):
    public_id = serializers.CharField()
    name = serializers.CharField()


class MeOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    email = serializers.EmailField()
    name = serializers.CharField()
    language = serializers.ChoiceField(choices=LANGUAGE_CHOICES)
    roles = serializers.ListField(child=serializers.CharField())
    workspaces = serializers.ListField(child=serializers.CharField())
    last_workspace = serializers.CharField(allow_blank=True)
    must_change_password = serializers.BooleanField()
    previous_login_at = serializers.DateTimeField(allow_null=True)
    password_reset = PasswordResetNoticeOut(allow_null=True)
    employee = EmployeeBriefOut(allow_null=True)
    environment = serializers.CharField()
    version = serializers.CharField()


class MePatchIn(serializers.Serializer):
    language = serializers.ChoiceField(choices=LANGUAGE_CHOICES, required=False)
    last_workspace = serializers.ChoiceField(choices=WORKSPACE_CHOICES, required=False)


class PasswordIn(serializers.Serializer):
    current_password = serializers.CharField(max_length=128, trim_whitespace=False)
    new_password = serializers.CharField(max_length=128, trim_whitespace=False)
