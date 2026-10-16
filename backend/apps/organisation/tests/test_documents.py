import pytest
from django.urls import reverse

from apps.audit.models import AuditEvent
from apps.core.errors import NotFound
from apps.files.tests.world import PDF_BYTES, upload
from apps.organisation import selectors, services
from apps.organisation.models import EmployeeDocument

pytestmark = pytest.mark.django_db


def _add(world, *, visible=True, label="Contrat", employee=None):
    return services.add_document(
        actor=world.hr_user,
        employee=employee or world.owner,
        upload=upload("contrat.pdf"),
        label=label,
        visible_to_employee=visible,
    )


def _documents_url(employee) -> str:
    return reverse("organisation:employee-documents", kwargs={"public_id": employee.public_id})


def test_hr_adds_a_document(world):
    document = _add(world, label=" Contrat de travail ")

    assert document.label == "Contrat de travail"
    assert document.attachment.kind == "employee_document"
    assert document.attachment.is_encrypted is False
    assert document.added_by == world.hr_user
    event = AuditEvent.objects.get(action="document.added")
    assert event.object_type == "employee"
    assert event.object_id == str(world.owner.public_id)
    assert event.changes["document"] == {"before": None, "after": "Contrat de travail"}


def test_sharing_can_be_changed_and_is_audited_once(world):
    document = _add(world, visible=False)

    services.set_document_visibility(actor=world.hr_user, document=document, visible_to_employee=True)
    services.set_document_visibility(actor=world.hr_user, document=document, visible_to_employee=True)

    document.refresh_from_db()
    assert document.visible_to_employee is True
    event = AuditEvent.objects.get(action="document.visibility_changed")
    assert event.changes["visible_to_employee"] == {"before": False, "after": True}


def test_who_lists_the_documents_of_an_employee(world):
    shared = _add(world, visible=True, label="Contrat")
    hidden = _add(world, visible=False, label="Note interne")

    assert set(selectors.documents_for(world.hr_user, world.owner)) == {shared, hidden}
    assert set(selectors.documents_for(world.exec_user, world.owner)) == {shared, hidden}
    assert list(selectors.documents_for(world.owner_user, world.owner)) == [shared]
    for user in (world.manager_user, world.peer_user, world.sysadmin_user):
        with pytest.raises(NotFound):
            selectors.documents_for(user, world.owner)


@pytest.mark.parametrize(
    ("viewer", "visible", "allowed"),
    [
        ("owner_user", True, True),
        ("owner_user", False, False),
        ("hr_user", False, True),
        ("exec_user", False, True),
        ("manager_user", True, False),
        ("peer_user", True, False),
        ("sysadmin_user", True, False),
    ],
)
def test_who_downloads_a_document(world, client_for, viewer, visible, allowed):
    document = _add(world, visible=visible)
    url = reverse("files:download", kwargs={"public_id": document.attachment.public_id})

    response = client_for(getattr(world, viewer)).get(url)

    assert response.status_code == (200 if allowed else 404)
    assert AuditEvent.objects.filter(action="attachment.downloaded").count() == (1 if allowed else 0)
    if allowed:
        assert response.content == PDF_BYTES


def test_a_download_is_checked_again_at_every_call(world, client_for):
    document = _add(world, visible=True)
    url = reverse("files:download", kwargs={"public_id": document.attachment.public_id})
    owner = client_for(world.owner_user)
    assert owner.get(url).status_code == 200

    services.set_document_visibility(actor=world.hr_user, document=document, visible_to_employee=False)

    assert owner.get(url).status_code == 404
    assert client_for(world.hr_user).get(url).status_code == 200


def test_documents_endpoints(world, client_for):
    client = client_for(world.hr_user)
    url = _documents_url(world.owner)

    created = client.post(
        url,
        {"file": upload("contrat.pdf"), "label": "Contrat", "visible_to_employee": "true"},
        format="multipart",
    )
    assert created.status_code == 201
    body = created.json()
    assert (body["label"], body["visible_to_employee"]) == ("Contrat", True)
    assert body["attachment"] == {
        "public_id": body["attachment"]["public_id"],
        "name": "contrat.pdf",
        "size": len(PDF_BYTES),
        "content_type": "application/pdf",
    }
    assert body["added_by"] == "Senna RH"
    assert [row["id"] for row in client.get(url).json()] == [body["id"]]
    assert [row["label"] for row in client_for(world.owner_user).get(url).json()] == ["Contrat"]

    patch_url = reverse(
        "organisation:employee-document", kwargs={"public_id": world.owner.public_id, "id": body["id"]}
    )
    patched = client.patch(patch_url, {"visible_to_employee": False}, format="json")
    assert (patched.status_code, patched.json()["visible_to_employee"]) == (200, False)
    assert client_for(world.owner_user).get(url).json() == []


def test_a_bad_file_is_refused_next_to_the_file_input(world, client_for):
    response = client_for(world.hr_user).post(
        _documents_url(world.owner),
        {"file": upload("facture.pdf", b"MZ\x90\x00" + b"\x00" * 64), "label": "Contrat"},
        format="multipart",
    )

    assert response.status_code == 400
    assert response.json()["code"] == "files.content_mismatch"
    assert response.json()["errors"][0]["field"] == "file"
    assert EmployeeDocument.objects.count() == 0


def test_documents_are_closed_to_managers_and_colleagues(world, client_for):
    _add(world)

    for user in (world.manager_user, world.peer_user):
        assert client_for(user).get(_documents_url(world.owner)).status_code == 404
    assert (
        client_for(world.exec_user).post(_documents_url(world.owner), {}, format="multipart").status_code
        == 403
    )


def test_a_document_of_another_employee_is_not_found(world, client_for):
    document = _add(world, employee=world.peer)
    url = reverse(
        "organisation:employee-document", kwargs={"public_id": world.owner.public_id, "id": document.id}
    )

    assert (
        client_for(world.hr_user).patch(url, {"visible_to_employee": True}, format="json").status_code == 404
    )
