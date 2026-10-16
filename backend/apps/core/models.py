"""Abstract bases shared by every app's models."""

import uuid

from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class PublicIdModel(models.Model):
    """Adds a random identifier used in links, so record numbers cannot be guessed (PRD section 8)."""

    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    class Meta:
        abstract = True


class JobStatus(models.Model):
    """The last run of each scheduled job: read by the health check and by the Status page (UI 9.1)."""

    name = models.CharField(max_length=80, unique=True)
    schedule = models.CharField(max_length=60, blank=True)
    last_started_at = models.DateTimeField(null=True, blank=True)
    last_finished_at = models.DateTimeField(null=True, blank=True)
    last_ok = models.BooleanField(null=True, blank=True)
    last_detail = models.TextField(blank=True)
    consecutive_failures = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name
