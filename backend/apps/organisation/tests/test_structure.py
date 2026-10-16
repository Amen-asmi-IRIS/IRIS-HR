import pytest
from django.urls import reverse

from apps.audit.models import AuditEvent
from apps.organisation import services
from apps.organisation.models import EmployeeStatus
from apps.organisation.tests.world import make_employee

pytestmark = pytest.mark.django_db


def _speak(user, language):
    user.language = language
    user.save(update_fields=["language"])


def test_the_cast_is_wired_as_the_master_plan_describes(world):
    assert world.ceo.manager is None
    assert world.ceo.user == world.exec_user
    assert world.hr.user == world.hr_user
    assert world.owner.manager == world.peer.manager == world.manager
    assert world.manager.manager == world.other_manager.manager == world.hr.manager == world.ceo
    assert world.outsider.manager == world.other_manager
    assert {e.department for e in (world.manager, world.owner, world.peer)} == {world.dept_a}
    assert {e.department for e in (world.ceo, world.hr, world.other_manager, world.outsider)} == {
        world.dept_b
    }
    assert world.owner.professional_email == world.owner_user.email


def test_create_department_normalises_and_audits(world):
    department = services.create_department(
        actor=world.hr_user, code=" fin ", name_fr="Finance ", name_en="Finance"
    )

    assert (department.code, department.name_fr, department.is_active) == ("FIN", "Finance", True)
    event = AuditEvent.objects.get(action="department.created")
    assert event.object_label == "FIN"
    assert event.changes["code"] == {"before": None, "after": "FIN"}


def test_update_department_audits_only_what_changed(world):
    services.update_department(actor=world.hr_user, department=world.dept_a, name_en="Underwriting")
    services.update_department(actor=world.hr_user, department=world.dept_a, name_en="Underwriting")

    events = AuditEvent.objects.filter(action="department.updated")
    assert events.count() == 1
    assert events.get().changes == {"name_en": {"before": "Department A", "after": "Underwriting"}}


def test_a_department_in_use_can_be_deactivated_and_keeps_its_employees(world):
    services.set_department_active(actor=world.hr_user, department=world.dept_a, is_active=False)
    services.set_department_active(actor=world.hr_user, department=world.dept_a, is_active=False)

    world.dept_a.refresh_from_db()
    world.owner.refresh_from_db()
    assert world.dept_a.is_active is False
    assert world.owner.department == world.dept_a
    assert AuditEvent.objects.filter(action="department.deactivated").count() == 1


def test_positions_follow_the_same_rules(world):
    position = services.create_position(
        actor=world.hr_user, code="acc", title_fr="Comptable", title_en="Accountant", grade="B2"
    )
    services.update_position(actor=world.hr_user, position=position, grade="B3")
    services.set_position_active(actor=world.hr_user, position=position, is_active=False)

    position.refresh_from_db()
    assert (position.code, position.grade, position.is_active) == ("ACC", "B3", False)
    actions = (
        AuditEvent.objects.filter(object_type="position").order_by("id").values_list("action", flat=True)
    )
    assert list(actions) == ["position.created", "position.updated", "position.deactivated"]


def test_hr_lists_departments_with_names_and_head_counts(world, client_for):
    _speak(world.hr_user, "fr")
    make_employee(
        number="E900",
        first_name="Lea",
        last_name="Left",
        department=world.dept_a,
        position=world.position,
        status=EmployeeStatus.ARCHIVED,
    )

    response = client_for(world.hr_user).get(reverse("organisation:department-list"))

    assert response.status_code == 200
    rows = {row["code"]: row for row in response.json()}
    assert rows["DEP-A"] == {
        "id": world.dept_a.id,
        "code": "DEP-A",
        "name_fr": "Département A",
        "name_en": "Department A",
        "name": "Département A",
        "is_active": True,
        "employee_count": 3,
    }
    assert rows["DEP-B"]["employee_count"] == 4


def test_names_follow_the_language_of_the_reader(world, client_for):
    _speak(world.exec_user, "en")

    departments = client_for(world.exec_user).get(reverse("organisation:department-list")).json()
    positions = client_for(world.exec_user).get(reverse("organisation:position-list")).json()

    assert {row["name"] for row in departments} == {"Department A", "Department B"}
    assert positions[0]["title"] == "Officer"
    assert positions[0]["employee_count"] == 7


def test_hr_creates_and_edits_a_department(world, client_for):
    client = client_for(world.hr_user)

    created = client.post(
        reverse("organisation:department-list"),
        {"code": "ops", "name_fr": "Opérations", "name_en": "Operations"},
        format="json",
    )
    assert created.status_code == 201
    assert (created.json()["code"], created.json()["employee_count"]) == ("OPS", 0)

    url = reverse("organisation:department-detail", kwargs={"id": created.json()["id"]})
    patched = client.patch(url, {"name_en": "Ops", "is_active": False}, format="json")
    assert patched.status_code == 200
    assert (patched.json()["name_en"], patched.json()["is_active"]) == ("Ops", False)


def test_hr_creates_and_edits_a_position(world, client_for):
    client = client_for(world.hr_user)

    created = client.post(
        reverse("organisation:position-list"),
        {"code": "dir", "title_fr": "Directeur", "title_en": "Director", "grade": "A1"},
        format="json",
    )
    assert created.status_code == 201

    url = reverse("organisation:position-detail", kwargs={"id": created.json()["id"]})
    patched = client.patch(url, {"grade": "A2"}, format="json")
    assert (patched.status_code, patched.json()["grade"], patched.json()["code"]) == (200, "A2", "DIR")


def test_a_duplicate_code_is_refused_next_to_the_field(world, client_for):
    response = client_for(world.hr_user).post(
        reverse("organisation:department-list"),
        {"code": "dep-a", "name_fr": "Doublon", "name_en": "Duplicate"},
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["errors"][0]["field"] == "code"


def test_an_unknown_department_is_not_found(world, client_for):
    url = reverse("organisation:department-detail", kwargs={"id": 999999})

    assert client_for(world.hr_user).patch(url, {"name_en": "X"}, format="json").status_code == 404


def test_executives_read_but_do_not_write(world, client_for):
    client = client_for(world.exec_user)

    assert client.get(reverse("organisation:position-list")).status_code == 200
    assert client.post(reverse("organisation:position-list"), {}, format="json").status_code == 403
    url = reverse("organisation:position-detail", kwargs={"id": world.position.id})
    assert client.patch(url, {}, format="json").status_code == 403
