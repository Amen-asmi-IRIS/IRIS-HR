from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Notification(models.Model):
    """One event told to one user. The text is not stored: it is rendered in the reader's language (NOT-04)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    event_code = models.CharField(max_length=60)
    parameters = models.JSONField(default=dict, blank=True, encoder=DjangoJSONEncoder)
    target_type = models.CharField(max_length=40, blank=True)
    target_public_id = models.CharField(max_length=64, blank=True)
    dedupe_key = models.CharField(max_length=120, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "dedupe_key"],
                condition=Q(dedupe_key__isnull=False),
                name="notifications_dedupe_once",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "read_at"], name="notifications_user_read"),
            models.Index(fields=["user", "-created_at"], name="notifications_user_created"),
        ]

    def __str__(self) -> str:
        return f"{self.event_code} for {self.user_id}"
