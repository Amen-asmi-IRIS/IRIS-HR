from rest_framework import serializers

from apps.settings.registry import KINDS

KIND_CHOICES = [(kind, kind) for kind in KINDS]


class SettingOut(serializers.Serializer):
    """One setting with its current value. Takes a `SettingRow`."""

    key = serializers.CharField()
    kind = serializers.ChoiceField(choices=KIND_CHOICES)
    value = serializers.JSONField(allow_null=True)
    default = serializers.JSONField(allow_null=True)
    minimum = serializers.JSONField(allow_null=True)
    maximum = serializers.JSONField(allow_null=True)
    choices = serializers.ListField(child=serializers.CharField(), allow_null=True)
    updated_by = serializers.CharField(source="updated_by_name", allow_null=True)
    updated_at = serializers.DateTimeField(allow_null=True)


class SettingValueIn(serializers.Serializer):
    value = serializers.JSONField(allow_null=True)
