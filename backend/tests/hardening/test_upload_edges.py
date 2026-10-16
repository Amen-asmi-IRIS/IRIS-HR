"""Hostile and sloppy uploads (PRD 9.6, REQ-16, review focus 7)."""

from __future__ import annotations

import hashlib
from datetime import date

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.core.errors import DomainError
from apps.files import services as file_services
from apps.requests import services as request_services
from tests.hardening.helpers import PDF_BYTES, make_request, pdf

EXECUTABLE = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff" + b"\x00" * 128
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
SCRIPT = b"<html><script>alert(1)</script></html>"


def _store(world, name: str, content: bytes, content_type: str, kind: str = "employee_document"):
    upload = SimpleUploadedFile(name, content, content_type=content_type)
    return file_services.store_upload(actor=world.hr_user, upload=upload, kind=kind)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "name, content, content_type, code",
    [
        ("report.pdf", EXECUTABLE, "application/pdf", "files.content_mismatch"),
        ("scan.jpg", PNG, "image/jpeg", "files.content_mismatch"),
        ("page.png", SCRIPT, "image/png", "files.content_mismatch"),
        ("setup.exe", EXECUTABLE, "application/octet-stream", "files.type_not_allowed"),
        ("notes.html", SCRIPT, "text/html", "files.type_not_allowed"),
        ("archive.pdf.exe", PDF_BYTES, "application/pdf", "files.type_not_allowed"),
        ("empty.pdf", b"", "application/pdf", "files.empty"),
        ("huge.pdf", PDF_BYTES + b"\x00" * (11 * 1024 * 1024), "application/pdf", "files.too_large"),
    ],
)
def test_a_bad_upload_is_refused_with_a_specific_code(world, name, content, content_type, code):
    with pytest.raises(DomainError) as error:
        _store(world, name, content, content_type)
    assert error.value.code == code


@pytest.mark.django_db
@pytest.mark.parametrize(
    "name",
    [
        "../../évaluation finale.pdf",
        "..\\..\\windows\\system32\\évaluation.pdf",
        "/etc/passwd.pdf",
        "contrat signé (2026) — Amira Ben Salah.pdf",
        "a" * 300 + ".pdf",
    ],
)
def test_a_strange_name_is_stored_safely_and_given_back_clean(world, name):
    attachment = _store(world, name, PDF_BYTES, "application/pdf")
    assert ".." not in attachment.storage_path
    assert "évaluation" not in attachment.storage_path and "contrat" not in attachment.storage_path
    assert "/" not in attachment.original_name and "\\" not in attachment.original_name
    assert attachment.original_name.endswith(".pdf")
    assert len(attachment.original_name) <= 255
    assert attachment.size == len(PDF_BYTES)
    assert attachment.sha256 == hashlib.sha256(PDF_BYTES).hexdigest()


@pytest.mark.django_db
def test_two_uploads_of_one_name_do_not_overwrite_each_other(world):
    first = _store(world, "certificat.pdf", PDF_BYTES, "application/pdf")
    second = _store(world, "certificat.pdf", PDF_BYTES + b"%second\n", "application/pdf")
    assert first.storage_path != second.storage_path
    assert first.public_id != second.public_id


@pytest.mark.django_db
def test_a_medical_file_is_encrypted_and_comes_back_intact(world, frozen):
    request = make_request(
        world,
        user=world.owner_user,
        employee=world.owner,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
    )
    link = request_services.attach_file(actor=world.owner_user, request=request, upload=pdf("certificat.pdf"))
    attachment = link.attachment
    assert attachment.kind == "medical" and attachment.is_encrypted is True
    content, name, content_type = file_services.read_for_download(
        user=world.owner_user, attachment=attachment
    )
    assert content == PDF_BYTES and name == "certificat.pdf" and content_type == "application/pdf"


@pytest.mark.django_db
def test_the_api_refuses_a_renamed_executable_and_keeps_the_request_unchanged(world, client_for, frozen):
    request = make_request(
        world,
        user=world.owner_user,
        employee=world.owner,
        request_type=world.sick,
        start=date(2026, 11, 2),
        end=date(2026, 11, 2),
    )
    url = reverse("requests:request-attachments", kwargs={"public_id": request.public_id})
    client = client_for(world.owner_user)

    bad = SimpleUploadedFile("certificat.pdf", EXECUTABLE, content_type="application/pdf")
    response = client.post(url, {"file": bad}, format="multipart")
    assert response.status_code == 400 and response.json()["code"] == "files.content_mismatch"
    assert response.json()["errors"][0]["field"] == "file"

    missing = client.post(url, {}, format="multipart")
    assert missing.status_code == 400

    def listed() -> list:
        body = client.get(url).json()
        return body["results"] if isinstance(body, dict) else body

    assert listed() == []
    good = client.post(url, {"file": pdf("certificat.pdf")}, format="multipart")
    assert good.status_code == 201
    assert [item["name"] for item in listed()] == ["certificat.pdf"]
