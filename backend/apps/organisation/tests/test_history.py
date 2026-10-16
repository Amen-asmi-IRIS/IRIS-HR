import pytest
from django.urls import reverse

from apps.organisation import services
from apps.organisation.tests.world import make_document

pytestmark = pytest.mark.django_db


def _url(employee) -> str:
    return reverse("organisation:employee-history", kwargs={"public_id": employee.public_id})


def test_the_history_tells_what_changed_from_what_to_what_by_whom(world, client_for):
    services.update_employee(actor=world.hr_user, employee=world.owner, data={"phone": "71 000 000"})
    services.update_employee(actor=world.hr_user, employee=world.peer, data={"phone": "72 000 000"})
    make_document(world, label="Contrat")

    body = client_for(world.hr_user).get(_url(world.owner)).json()

    assert body["count"] == 2
    added, updated = body["results"]
    assert (added["action"], updated["action"]) == ("document.added", "employee.updated")
    assert updated["changes"] == {"phone": {"before": "", "after": "71 000 000"}}
    assert updated["actor"] == "Senna RH"
    assert updated["at"]
    assert added["changes"]["document"] == {"before": None, "after": "Contrat"}


def test_who_reads_the_history(world, client_for):
    assert client_for(world.exec_user).get(_url(world.owner)).status_code == 200
    assert client_for(world.manager_user).get(_url(world.owner)).status_code == 403
    assert client_for(world.owner_user).get(_url(world.owner)).status_code == 403
