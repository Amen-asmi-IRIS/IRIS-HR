from django.conf import settings
from django.db import models
from django.utils import timezone


class Setting(models.Model):
    """One changed setting. A key without a row has its registered default."""

    key = models.CharField(max_length=60, unique=True)
    value = models.JSONField(default=dict)  # always {"v": <value>}, so that an empty value is stored too
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["key"]

    def __str__(self) -> str:
        return self.key
