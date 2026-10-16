from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.utils import timezone


class AuditEvent(models.Model):
    """One thing that happened. Rows are only ever added (AUD-01); database triggers enforce it."""

    class Category(models.TextChoices):
        BUSINESS = "business", "Business"
        SECURITY = "security", "Security"

    at = models.DateTimeField(default=timezone.now)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    category = models.CharField(max_length=10, choices=Category.choices)
    action = models.CharField(max_length=60)
    object_type = models.CharField(max_length=60, blank=True)
    object_id = models.CharField(max_length=64, blank=True)
    object_label = models.CharField(max_length=200, blank=True)
    changes = models.JSONField(default=dict, blank=True, encoder=DjangoJSONEncoder)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    request_id = models.CharField(max_length=32, blank=True)

    class Meta:
        ordering = ["-at", "-id"]
        indexes = [
            models.Index(fields=["category", "-at"], name="audit_category_at"),
            models.Index(fields=["object_type", "object_id"], name="audit_object"),
            models.Index(fields=["action", "-at"], name="audit_action_at"),
        ]

    def __str__(self) -> str:
        return f"{self.at:%Y-%m-%d %H:%M} {self.action}"


# The choice list under a module-level name, so that ENUM_NAME_OVERRIDES can point at it by dotted path.
AUDIT_CATEGORY_CHOICES = AuditEvent.Category.choices
