import pytest

from apps.reports.tabular.types import type_facts

pytestmark = pytest.mark.django_db


def test_type_facts_list_every_seeded_type(world):
    facts = type_facts()

    assert {"annual", "sick", "exceptional", "permission", "remote"} <= set(facts)
    assert facts["permission"].unit == "hour"
    assert facts["annual"].unit == "day"
    assert facts["remote"].calendar_label == "remote"


def test_type_facts_carry_the_meal_ticket_flag(world):
    facts = type_facts()

    assert facts["annual"].reduces_meal_tickets is True
    assert facts["sick"].reduces_meal_tickets is True
    assert facts["exceptional"].reduces_meal_tickets is True
    assert facts["remote"].reduces_meal_tickets is False
    assert facts["permission"].reduces_meal_tickets is False


def test_type_facts_name_follows_the_language(world):
    fact = type_facts()["annual"]

    assert fact.name("fr") == world.annual.name_fr
    assert fact.name("en") == world.annual.name_en
    assert fact.name("de") == world.annual.name_fr
