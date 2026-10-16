import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.files import services as files_service
from apps.requests import services
from apps.requests.models import RequestAttachment
from apps.requests.tests.helpers import MON, TODAY, WED, days, draft, pdf, submitted

pytestmark = pytest.mark.django_db


def sick(world):
    return submitted(world, request_type=world.sick, data=days(TODAY, comment="Grippe"))


def wedding(world):
    return submitted(
        world, request_type=world.exceptional, data=days(MON, WED, exceptional_event_id=world.event.pk)
    )


def test_the_requester_adds_a_certificate_to_a_sick_leave(world):
    request = sick(world)
    link = services.attach_file(actor=world.owner_user, request=request, upload=pdf("certificat-grippe.pdf"))
    assert (link.attachment.kind, link.attachment.is_encrypted, link.added_by, link.step) == (
        "medical",
        True,
        world.owner_user,
        None,
    )
    event = AuditEvent.objects.get(action="request.attachment_added")
    assert event.changes == {"kind": {"before": None, "after": "medical"}}
    assert "grippe" not in json.dumps([event.changes, event.object_label]).lower()


def test_a_request_that_is_not_sensitive_gets_a_proof(world):
    link = services.attach_file(actor=world.owner_user, request=wedding(world), upload=pdf("acte.pdf"))
    assert (link.attachment.kind, link.attachment.is_encrypted) == ("proof", False)


def test_hr_adds_a_file_for_the_employee(world):
    link = services.attach_file(actor=world.hr_user, request=sick(world), upload=pdf())
    assert (link.attachment.kind, link.added_by) == ("medical", world.hr_user)


def test_nobody_else_adds_a_file(world):
    request = wedding(world)
    for user in (world.manager_user, world.exec_user, world.peer_user):
        with pytest.raises(NotAllowed):
            services.attach_file(actor=user, request=request, upload=pdf())


def test_a_closed_request_takes_no_file(world):
    request = sick(world)
    services.withdraw(actor=world.owner_user, request=request)
    with pytest.raises(Conflict) as error:
        services.attach_file(actor=world.owner_user, request=request, upload=pdf())
    assert error.value.code == "request.not_editable"


def test_a_refused_upload_adds_nothing(world):
    request = sick(world)
    disguised = SimpleUploadedFile(
        "certificat.pdf", b"MZ\x90\x00\x03\x00\x00\x00", content_type="application/pdf"
    )
    with pytest.raises(DomainError) as error:
        services.attach_file(actor=world.owner_user, request=request, upload=disguised)
    assert error.value.code.startswith("files.")
    assert not RequestAttachment.objects.exists()
    assert not AuditEvent.objects.filter(action="request.attachment_added").exists()


def test_manager_cannot_download_a_certificate(world, client_for):
    link = services.attach_file(actor=world.owner_user, request=sick(world), upload=pdf())
    url = reverse("files:download", kwargs={"public_id": link.attachment.public_id})
    assert client_for(world.manager_user).get(url).status_code == 404
    assert client_for(world.exec_user).get(url).status_code == 404
    assert client_for(world.peer_user).get(url).status_code == 404
    assert client_for(world.owner_user).get(url).status_code == 200
    assert client_for(world.hr_user).get(url).status_code == 200


def test_who_reads_a_proof(world):
    link = services.attach_file(actor=world.owner_user, request=wedding(world), upload=pdf())
    allowed = (world.owner_user, world.manager_user, world.hr_user, world.exec_user)
    refused = (world.peer_user, world.other_manager_user, world.outsider_user, world.sysadmin_user)
    assert all(services.may_read_attachment(user, link.attachment) for user in allowed)
    assert not any(services.may_read_attachment(user, link.attachment) for user in refused)


def test_the_files_of_a_draft_are_for_its_creator_only(world):
    request = draft(
        world, request_type=world.exceptional, data=days(MON, WED, exceptional_event_id=world.event.pk)
    )
    link = services.attach_file(actor=world.owner_user, request=request, upload=pdf())
    assert services.may_read_attachment(world.owner_user, link.attachment) is True
    assert services.may_read_attachment(world.hr_user, link.attachment) is False
    assert services.may_read_attachment(world.manager_user, link.attachment) is False


def test_a_file_that_belongs_to_no_request_is_not_readable_through_these_rules(world):
    orphan = files_service.store_upload(actor=world.owner_user, upload=pdf(), kind="proof")
    assert services.may_read_attachment(world.owner_user, orphan) is False
    assert services.may_read_attachment(world.hr_user, orphan) is False
