from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts.services import display_name
from apps.audit.models import AuditEvent


class AuditEventOut(serializers.Serializer):
    id = serializers.IntegerField()
    at = serializers.DateTimeField()
    actor = serializers.SerializerMethodField()
    category = serializers.ChoiceField(choices=AuditEvent.Category.choices)
    action = serializers.CharField()
    object_type = serializers.CharField(allow_blank=True)
    object_id = serializers.CharField(allow_blank=True)
    object_label = serializers.CharField(allow_blank=True)
    changes = serializers.JSONField()
    ip_address = serializers.CharField(allow_null=True)
    request_id = serializers.CharField(allow_blank=True)

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_actor(self, event) -> str | None:
        """The actor's display name; null when the system acted."""
        return display_name(event.actor) if event.actor_id else None


class AuditFilterIn(serializers.Serializer):
    actor = serializers.UUIDField(required=False)
    action = serializers.CharField(required=False)
    object_type = serializers.CharField(required=False)
    object_id = serializers.CharField(required=False)
    to = serializers.DateField(required=False)

    def get_fields(self):
        fields = super().get_fields()
        fields["from"] = serializers.DateField(required=False)  # "from" cannot be a class attribute in Python
        return fields
