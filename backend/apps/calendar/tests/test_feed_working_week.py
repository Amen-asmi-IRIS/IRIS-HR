"""The calendar feed carries HR's working week, so the page greys the right days (PRD 6.1, UI 5.7)."""

import pytest
from django.urls import reverse

from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db
WINDOW = {"from": "2026-11-01", "to": "2026-11-30", "scope": "department"}


def test_the_feed_says_which_days_are_worked(world, client_for):
    body = client_for(world.owner_user).get(reverse("calendar:feed"), WINDOW).json()
    assert set(body) == {"holidays", "entries", "working_week"}
    assert body["working_week"] == [1, 2, 3, 4, 5]


def test_the_feed_follows_the_setting(world, client_for):
    settings_service.set_value(actor=world.hr_user, key="working_week", value=[1, 2, 3, 4, 7])
    settings_service.clear_cache()
    for user, scope in (
        (world.owner_user, "department"),
        (world.manager_user, "team"),
        (world.hr_user, "company"),
    ):
        body = client_for(user).get(reverse("calendar:feed"), {**WINDOW, "scope": scope}).json()
        assert body["working_week"] == [1, 2, 3, 4, 7], scope
