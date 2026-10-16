from rest_framework import serializers

from apps.notifications import services


class NotificationOut(serializers.Serializer):
    id = serializers.IntegerField()
    event = serializers.CharField(source="event_code")
    title = serializers.CharField(source="rendered.title")
    body = serializers.CharField(source="rendered.body")
    link = serializers.CharField(source="rendered.link", allow_blank=True)
    created_at = serializers.DateTimeField()
    read_at = serializers.DateTimeField(allow_null=True)

    def to_representation(self, instance):
        instance.rendered = services.render(instance)  # in the reader's language, set by LanguageMiddleware
        return super().to_representation(instance)


class UnreadCountOut(serializers.Serializer):
    count = serializers.IntegerField()
