import pytest
from django.urls import reverse

from apps.requests.models import ExceptionalEvent

pytestmark = pytest.mark.django_db


def english(user):
    user.language = "en"
    user.save(update_fields=["language"])
    return user


def test_an_employee_sees_only_active_types_named_in_their_language(world, client_for):
    world.remote.is_active = False
    world.remote.save()
    response = client_for(english(world.owner_user)).get(reverse("requests:type-list"))
    assert response.status_code == 200
    body = response.json()
    assert [item["code"] for item in body] == ["annual", "sick", "exceptional", "permission"]
    assert body[0]["name"] == "Annual leave"
    assert body[0]["description"] == "Paid days off, taken from your balance."
    assert body[0]["unit"] == "day"


def test_hr_sees_inactive_types_unless_it_asks_for_active_ones(world, client_for):
    world.remote.is_active = False
    world.remote.save()
    client = client_for(world.hr_user)
    assert len(client.get(reverse("requests:type-list")).json()) == 5
    assert len(client.get(reverse("requests:type-list"), {"active": "1"}).json()) == 4


def test_hr_creates_and_edits_a_type(world, client_for):
    client = client_for(world.hr_user)
    created = client.post(
        reverse("requests:type-list"),
        {"code": "mission", "name_fr": "Mission", "name_en": "Business trip", "unit": "day"},
        format="json",
    )
    assert created.status_code == 201
    type_id = created.json()["id"]
    edited = client.patch(
        reverse("requests:type-detail", kwargs={"pk": type_id}),
        {"notice_days": 3, "is_active": False},
        format="json",
    )
    assert edited.status_code == 200
    assert (edited.json()["notice_days"], edited.json()["is_active"]) == (3, False)
    assert client.get(reverse("requests:type-detail", kwargs={"pk": type_id})).json()["code"] == "mission"


def test_a_duplicate_code_is_a_field_problem(world, client_for):
    response = client_for(world.hr_user).post(
        reverse("requests:type-list"),
        {"code": "annual", "name_fr": "X", "name_en": "X", "unit": "day"},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "request.type_code_taken"
    assert response.json()["errors"][0]["field"] == "code"


def test_hr_reads_and_replaces_the_steps_of_a_type(world, client_for):
    client = client_for(world.hr_user)
    url = reverse("requests:type-steps", kwargs={"pk": world.remote.pk})
    assert [step["approver_rule"] for step in client.get(url).json()] == ["line_manager", "hr_role"]
    response = client.put(
        url,
        {
            "steps": [
                {
                    "approver_rule": "named_person",
                    "named_person": str(world.other_manager.public_id),
                    "mode": "approve",
                },
                {"approver_rule": "hr_role", "mode": "notify", "reminder_after_days": 3},
            ]
        },
        format="json",
    )
    assert response.status_code == 200
    first, second = response.json()
    assert first["position"] == 1
    assert first["named_person"]["public_id"] == str(world.other_manager.public_id)
    assert first["flag_after_days"] is None
    assert (second["mode"], second["reminder_after_days"], second["named_person"]) == ("notify", 3, None)


def test_steps_without_an_approver_are_refused(world, client_for):
    response = client_for(world.hr_user).put(
        reverse("requests:type-steps", kwargs={"pk": world.remote.pk}),
        {"steps": [{"approver_rule": "hr_role", "mode": "notify"}]},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "request.chain_needs_approver"


def test_an_unknown_named_person_is_a_field_problem(world, client_for):
    response = client_for(world.hr_user).put(
        reverse("requests:type-steps", kwargs={"pk": world.remote.pk}),
        {
            "steps": [
                {
                    "approver_rule": "named_person",
                    "named_person": "00000000-0000-0000-0000-000000000000",
                    "mode": "approve",
                }
            ]
        },
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "request.named_person_required"


def test_employees_see_active_events_and_hr_sees_all(world, client_for):
    ExceptionalEvent.objects.create(name_fr="Ancien", name_en="Old", days_allowed=1, is_active=False)
    seen = client_for(english(world.owner_user)).get(reverse("requests:event-list")).json()
    assert [(item["name"], item["days_allowed"], item["proof_required"]) for item in seen] == [
        ("Marriage", "3.00", True)
    ]
    assert len(client_for(world.hr_user).get(reverse("requests:event-list")).json()) == 2


def test_hr_creates_and_edits_an_event(world, client_for):
    client = client_for(world.hr_user)
    created = client.post(
        reverse("requests:event-list"),
        {"name_fr": "Naissance", "name_en": "Birth", "days_allowed": "2", "proof_required": True},
        format="json",
    )
    assert created.status_code == 201
    edited = client.patch(
        reverse("requests:event-detail", kwargs={"pk": created.json()["id"]}),
        {"is_active": False},
        format="json",
    )
    assert edited.status_code == 200
    assert (edited.json()["is_active"], edited.json()["days_allowed"]) == (False, "2.00")
