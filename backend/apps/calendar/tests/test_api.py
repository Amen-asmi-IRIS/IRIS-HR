import pytest
from django.urls import reverse

from apps.calendar.models import PublicHoliday

pytestmark = pytest.mark.django_db

LABOUR_DAY = {
    "date": "2026-05-01",
    "name_fr": "Fête du Travail",
    "name_en": "Labour Day",
    "recurs_yearly": True,
}


def test_hr_adds_a_holiday(world, client_for):
    response = client_for(world.hr_user).post(reverse("calendar:holiday-list"), LABOUR_DAY, format="json")
    assert response.status_code == 201
    body = response.json()
    assert body["date"] == "2026-05-01"
    assert body["name_fr"] == "Fête du Travail"
    assert body["recurs_yearly"] is True


def test_duplicate_date_is_a_field_problem(world, client_for):
    client = client_for(world.hr_user)
    client.post(reverse("calendar:holiday-list"), LABOUR_DAY, format="json")
    response = client.post(reverse("calendar:holiday-list"), LABOUR_DAY, format="json")
    assert response.status_code == 400
    assert response.json()["code"] == "calendar.holiday_exists"
    assert response.json()["errors"][0]["field"] == "date"


def test_an_employee_lists_the_holidays_of_a_year_in_their_language(world, client_for):
    PublicHoliday.objects.create(date="2026-05-01", name_fr="Fête du Travail", name_en="Labour Day")
    PublicHoliday.objects.create(date="2027-05-01", name_fr="Fête du Travail", name_en="Labour Day")
    world.owner_user.language = "en"
    world.owner_user.save(update_fields=["language"])
    response = client_for(world.owner_user).get(reverse("calendar:holiday-list"), {"year": 2026})
    assert response.status_code == 200
    assert [(item["date"], item["name"]) for item in response.json()] == [("2026-05-01", "Labour Day")]


def test_a_year_that_is_not_a_number_is_refused(world, client_for):
    response = client_for(world.owner_user).get(reverse("calendar:holiday-list"), {"year": "soon"})
    assert response.status_code == 400
    assert response.json()["code"] == "calendar.year_invalid"


def test_hr_changes_and_removes_a_holiday(world, client_for):
    holiday = PublicHoliday.objects.create(date="2026-05-01", name_fr="A", name_en="A")
    client = client_for(world.hr_user)
    url = reverse("calendar:holiday-detail", kwargs={"pk": holiday.pk})
    changed = client.patch(url, {"name_en": "Labour Day"}, format="json")
    assert changed.status_code == 200
    assert changed.json()["name_en"] == "Labour Day"
    assert changed.json()["name_fr"] == "A"
    assert client.delete(url).status_code == 204
    assert client.delete(url).status_code == 404


def test_hr_copies_recurring_holidays_to_next_year(world, client_for):
    PublicHoliday.objects.create(date="2026-05-01", name_fr="Travail", name_en="Labour", recurs_yearly=True)
    response = client_for(world.hr_user).post(
        reverse("calendar:holiday-copy"), {"from_year": 2026, "to_year": 2027}, format="json"
    )
    assert response.status_code == 201
    assert [item["date"] for item in response.json()] == ["2027-05-01"]
