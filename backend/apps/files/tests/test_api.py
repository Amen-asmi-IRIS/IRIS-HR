import uuid

import pytest
from django.urls import reverse

from apps.files import services
from apps.files.tests.world import PDF_BYTES, upload

pytestmark = pytest.mark.django_db


def _url(public_id) -> str:
    return reverse("files:download", kwargs={"public_id": public_id})


def test_download_serves_the_file_as_an_attachment_with_safe_headers(world, client_for, monkeypatch):
    monkeypatch.setattr(services, "_access_rules", {"proof": lambda user, attachment: True})
    attachment = services.store_upload(
        actor=world.hr_user, upload=upload("justificatif été.pdf"), kind="proof"
    )

    response = client_for(world.owner_user).get(_url(attachment.public_id))

    assert response.status_code == 200
    assert response.content == PDF_BYTES
    assert response["Content-Type"] == "application/pdf"
    assert response["Content-Disposition"].startswith("attachment;")
    assert "justificatif" in response["Content-Disposition"]
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["Content-Security-Policy"] == "sandbox; default-src 'none'"
    assert response["Cache-Control"] == "private, no-store"


def test_download_hides_what_the_user_may_not_read(world, client_for, monkeypatch):
    monkeypatch.setattr(services, "_access_rules", {"proof": lambda user, attachment: False})
    attachment = services.store_upload(actor=world.hr_user, upload=upload(), kind="proof")

    refused = client_for(world.owner_user).get(_url(attachment.public_id))
    unknown = client_for(world.owner_user).get(_url(uuid.uuid4()))

    assert refused.status_code == 404
    assert refused.json()["code"] == "core.not_found"
    assert unknown.status_code == 404
    assert unknown.json() == {**refused.json(), "request_id": unknown.json()["request_id"]}


def test_download_needs_a_session(anon_client):
    assert anon_client.get(_url(uuid.uuid4())).status_code == 401
