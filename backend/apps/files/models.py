from django.conf import settings
from django.db import models

from apps.core.models import PublicIdModel


class AttachmentKind(models.TextChoices):
    MEDICAL = "medical"
    PROOF = "proof"
    SCANNED_FORM = "scanned_form"
    EMPLOYEE_DOCUMENT = "employee_document"


class Attachment(PublicIdModel):
    kind = models.CharField(max_length=20, choices=AttachmentKind.choices)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveIntegerField()
    sha256 = models.CharField(max_length=64)
    storage_path = models.CharField(max_length=255, unique=True)
    is_encrypted = models.BooleanField(default=False)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at", "-id"]

    def __str__(self) -> str:
        return f"{self.kind}:{self.public_id}"
