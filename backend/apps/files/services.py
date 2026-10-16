from __future__ import annotations

import hashlib
import re
import unicodedata
import uuid
from collections.abc import Callable

from cryptography.fernet import Fernet
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage, Storage
from django.db import transaction

from apps.audit import services as audit
from apps.core.errors import DomainError, NotFound
from apps.settings import services as settings_service

from .models import Attachment, AttachmentKind

# What a file must start with to be the type its name claims.
_SIGNATURES = (("pdf", b"%PDF-"), ("jpg", b"\xff\xd8\xff"), ("png", b"\x89PNG\r\n\x1a\n"))
_CONTENT_TYPES = {"pdf": "application/pdf", "jpg": "image/jpeg", "png": "image/png"}
_ALIASES = {"jpeg": "jpg"}
_AUDITED_DOWNLOADS = {AttachmentKind.MEDICAL, AttachmentKind.EMPLOYEE_DOCUMENT}

_access_rules: dict[str, Callable[[object, Attachment], bool]] = {}


def storage() -> Storage:
    """The only place that knows where files live. Swap it to move to object storage."""
    return FileSystemStorage(location=settings.FILES_ROOT)


def register_access_rule(kind: str, rule: Callable[[object, Attachment], bool]) -> None:
    _access_rules[kind] = rule


def clean_name(name: str) -> str:
    """The name shown to people and used for downloads. Never used as a path."""
    name = unicodedata.normalize("NFC", name or "")
    name = re.split(r"[\\/]", name)[-1]
    name = "".join(character for character in name if character.isprintable()).strip()
    stem, dot, extension = name.rpartition(".")
    if dot and stem:
        name = f"{stem[:190]}.{extension[:9]}"
    else:
        name = name[:200]
    return name or "file"


def _extension(name: str) -> str:
    stem, dot, extension = name.rpartition(".")
    if not dot or not stem:
        return ""
    extension = extension.lower()
    return _ALIASES.get(extension, extension)


def _sniff(head: bytes) -> str | None:
    for extension, signature in _SIGNATURES:
        if head.startswith(signature):
            return extension
    return None


def _cipher() -> Fernet:
    return Fernet(settings.FILE_ENCRYPTION_KEY)


@transaction.atomic
def store_upload(*, actor, upload, kind: str, confidential: bool = False) -> Attachment:
    """Checks and keeps an uploaded file.

    A medical file is encrypted and never named in the audit trail; `confidential` asks the same for a file
    of another kind (the scan of a form signed for a sick leave).
    """
    if kind not in AttachmentKind.values:
        raise ValueError(f"unknown attachment kind: {kind}")
    max_mb = int(settings_service.get("upload_max_mb"))
    allowed = [
        _ALIASES.get(item.lower(), item.lower()) for item in settings_service.get("upload_allowed_types")
    ]
    allowed = [item for item in allowed if item in _CONTENT_TYPES]
    allowed_label = ", ".join(item.upper() for item in allowed)

    name = clean_name(upload.name)
    if upload.size == 0:
        raise DomainError("files.empty", field="file")
    if upload.size > max_mb * 1024 * 1024:
        raise DomainError("files.too_large", field="file", max_mb=max_mb)
    extension = _extension(name)
    if extension not in allowed:
        raise DomainError("files.type_not_allowed", field="file", allowed=allowed_label)

    data = upload.read()
    if not data:
        raise DomainError("files.empty", field="file")
    if _sniff(data[:16]) != extension:
        raise DomainError("files.content_mismatch", field="file", allowed=allowed_label)

    encrypted = kind == AttachmentKind.MEDICAL or confidential
    payload = _cipher().encrypt(data) if encrypted else data
    path = storage().save(f"{uuid.uuid4().hex[:2]}/{uuid.uuid4().hex}", ContentFile(payload))
    attachment = Attachment.objects.create(
        kind=kind,
        original_name=name,
        content_type=_CONTENT_TYPES[extension],
        size=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        storage_path=path,
        is_encrypted=encrypted,
        uploaded_by=actor,
    )
    audit.record(
        action="attachment.uploaded", obj=attachment, actor=actor, object_label="" if encrypted else name
    )
    return attachment


def read_for_download(*, user, attachment: Attachment) -> tuple[bytes, str, str]:
    rule = _access_rules.get(attachment.kind)
    if rule is None or not rule(user, attachment):
        raise NotFound()
    with storage().open(attachment.storage_path, "rb") as handle:
        data = handle.read()
    if attachment.is_encrypted:
        data = _cipher().decrypt(data)
    if attachment.kind in _AUDITED_DOWNLOADS or attachment.is_encrypted:
        audit.record(
            action="attachment.downloaded",
            obj=attachment,
            actor=user,
            object_label="" if attachment.is_encrypted else attachment.original_name,
        )
    return data, attachment.original_name, attachment.content_type
