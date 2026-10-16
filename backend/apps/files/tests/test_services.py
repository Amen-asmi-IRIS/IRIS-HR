import hashlib
import re

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import DomainError, NotFound
from apps.files import services
from apps.files.models import Attachment, AttachmentKind
from apps.files.tests.world import JPG_BYTES, PDF_BYTES, PNG_BYTES, upload
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db


def test_stores_a_pdf_under_a_generated_name(world, files_root):
    attachment = services.store_upload(
        actor=world.hr_user, upload=upload("Contrat signé.pdf"), kind=AttachmentKind.EMPLOYEE_DOCUMENT
    )

    assert attachment.original_name == "Contrat signé.pdf"
    assert attachment.content_type == "application/pdf"
    assert attachment.size == len(PDF_BYTES)
    assert attachment.sha256 == hashlib.sha256(PDF_BYTES).hexdigest()
    assert attachment.is_encrypted is False
    assert attachment.uploaded_by == world.hr_user
    assert re.fullmatch(r"[0-9a-f]{2}/[0-9a-f]{32}", attachment.storage_path)
    assert (files_root / attachment.storage_path).read_bytes() == PDF_BYTES
    event = AuditEvent.objects.get(action="attachment.uploaded")
    assert event.object_id == str(attachment.public_id)
    assert event.object_label == "Contrat signé.pdf"


def test_medical_files_are_encrypted_on_disk_and_never_named_in_the_audit(world, files_root):
    attachment = services.store_upload(
        actor=world.owner_user, upload=upload("certificat grippe.pdf"), kind=AttachmentKind.MEDICAL
    )

    on_disk = (files_root / attachment.storage_path).read_bytes()
    assert attachment.is_encrypted is True
    assert b"%PDF" not in on_disk
    assert attachment.size == len(PDF_BYTES)
    # The label of a medical file is its kind and identifier, never its name.
    assert (
        AuditEvent.objects.get(action="attachment.uploaded").object_label == f"medical:{attachment.public_id}"
    )


def test_jpeg_and_png_are_accepted_whatever_the_case_of_the_extension(world):
    photo = services.store_upload(
        actor=world.hr_user, upload=upload("Photo.JPEG", JPG_BYTES, "image/jpeg"), kind=AttachmentKind.PROOF
    )
    scan = services.store_upload(
        actor=world.hr_user, upload=upload("scan.PNG", PNG_BYTES, "image/png"), kind=AttachmentKind.PROOF
    )

    assert photo.content_type == "image/jpeg"
    assert scan.content_type == "image/png"


@pytest.mark.parametrize(
    ("name", "content", "code"),
    [
        ("invoice.pdf", b"MZ\x90\x00" + b"\x00" * 64, "files.content_mismatch"),  # a renamed executable
        ("scan.pdf", PNG_BYTES, "files.content_mismatch"),
        ("notes.docx", b"PK\x03\x04" + b"\x00" * 64, "files.type_not_allowed"),
        ("setup.exe", b"MZ\x90\x00" + b"\x00" * 64, "files.type_not_allowed"),
        ("noextension", PDF_BYTES, "files.type_not_allowed"),
        ("empty.pdf", b"", "files.empty"),
    ],
)
def test_refuses_bad_files(world, files_root, name, content, code):
    with pytest.raises(DomainError) as error:
        services.store_upload(actor=world.hr_user, upload=upload(name, content), kind=AttachmentKind.PROOF)

    assert error.value.code == code
    assert error.value.problems[0].field == "file"
    assert Attachment.objects.count() == 0
    assert list(files_root.rglob("*")) == []


class _Huge:
    name = "huge.pdf"
    size = 50 * 1024 * 1024

    def read(self, *args):
        raise AssertionError("the content of an oversized file must not be read")


def test_refuses_a_50_mb_file_without_reading_it(world):
    with pytest.raises(DomainError) as error:
        services.store_upload(actor=world.hr_user, upload=_Huge(), kind=AttachmentKind.PROOF)

    assert error.value.code == "files.too_large"
    assert error.value.problems[0].params["max_mb"] == 10


def test_the_limits_follow_the_system_settings(world):
    settings_service.set_value(actor=world.sysadmin_user, key="upload_max_mb", value=1)
    settings_service.set_value(actor=world.sysadmin_user, key="upload_allowed_types", value=["pdf"])
    settings_service.clear_cache()

    with pytest.raises(DomainError) as too_large:
        services.store_upload(
            actor=world.hr_user,
            upload=upload("big.pdf", PDF_BYTES + b"0" * (1024 * 1024)),
            kind=AttachmentKind.PROOF,
        )
    with pytest.raises(DomainError) as wrong_type:
        services.store_upload(
            actor=world.hr_user, upload=upload("scan.png", PNG_BYTES, "image/png"), kind=AttachmentKind.PROOF
        )

    assert too_large.value.code == "files.too_large"
    assert wrong_type.value.code == "files.type_not_allowed"
    assert wrong_type.value.problems[0].params["allowed"] == "PDF"


@pytest.mark.parametrize(
    ("given", "stored"),
    [
        ("../../etc/passwd.pdf", "passwd.pdf"),
        ("C:\\Users\\rh\\Bureau\\contrat été.PDF", "contrat été.PDF"),
        ("re\u0301sume\u0301.pdf", "résumé.pdf"),  # decomposed accents become composed ones
        ("tab\tand\x00null.pdf", "tabandnull.pdf"),
        ("a" * 300 + ".pdf", "a" * 190 + ".pdf"),
        ("", "file"),
    ],
)
def test_clean_name(given, stored):
    assert services.clean_name(given) == stored


def test_a_confidential_file_of_any_kind_is_kept_like_a_medical_one(world, files_root, monkeypatch):
    """The scan of a form signed for a sick leave: encrypted, never named in the trail, its reading recorded."""
    monkeypatch.setattr(services, "_access_rules", {"scanned_form": lambda user, attachment: True})

    attachment = services.store_upload(
        actor=world.hr_user,
        upload=upload("formulaire arrêt maladie.pdf"),
        kind=AttachmentKind.SCANNED_FORM,
        confidential=True,
    )
    content, name, _ = services.read_for_download(user=world.hr_user, attachment=attachment)

    assert (attachment.kind, attachment.is_encrypted) == ("scanned_form", True)
    assert b"%PDF" not in (files_root / attachment.storage_path).read_bytes()
    assert (content, name) == (PDF_BYTES, "formulaire arrêt maladie.pdf")
    events = AuditEvent.objects.filter(object_id=str(attachment.public_id)).order_by("id")
    assert [event.action for event in events] == ["attachment.uploaded", "attachment.downloaded"]
    assert {event.object_label for event in events} == {f"scanned_form:{attachment.public_id}"}


def test_download_needs_an_access_rule(world, monkeypatch):
    monkeypatch.setattr(services, "_access_rules", {})
    attachment = services.store_upload(actor=world.hr_user, upload=upload(), kind=AttachmentKind.PROOF)

    with pytest.raises(NotFound):
        services.read_for_download(user=world.hr_user, attachment=attachment)


def test_download_returns_the_original_content_and_audits_sensitive_kinds(world, monkeypatch):
    monkeypatch.setattr(
        services, "_access_rules", {"medical": lambda user, attachment: user == world.owner_user}
    )
    attachment = services.store_upload(
        actor=world.owner_user, upload=upload("certificat.pdf"), kind=AttachmentKind.MEDICAL
    )

    content, name, content_type = services.read_for_download(user=world.owner_user, attachment=attachment)

    assert (content, name, content_type) == (PDF_BYTES, "certificat.pdf", "application/pdf")
    event = AuditEvent.objects.get(action="attachment.downloaded")
    assert event.object_id == str(attachment.public_id)
    assert "certificat" not in event.object_label
    assert event.actor == world.owner_user
    with pytest.raises(NotFound):
        services.read_for_download(user=world.hr_user, attachment=attachment)


def test_downloading_a_proof_is_not_audited(world, monkeypatch):
    monkeypatch.setattr(services, "_access_rules", {"proof": lambda user, attachment: True})
    attachment = services.store_upload(actor=world.hr_user, upload=upload(), kind=AttachmentKind.PROOF)

    services.read_for_download(user=world.hr_user, attachment=attachment)

    assert not AuditEvent.objects.filter(action="attachment.downloaded").exists()
