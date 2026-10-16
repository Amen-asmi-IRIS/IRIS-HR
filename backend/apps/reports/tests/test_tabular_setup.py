import pytest

from apps.core.errors import DomainError
from apps.core.i18n import all_messages, translate
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db


def test_report_texts_exist_in_both_languages():
    assert translate("reports.title_absences", "fr") == "Absences prises"
    assert translate("reports.title_absences", "en") == "Absences taken"
    assert translate("reports.col_meal_tickets", "fr") == "Tickets restaurant"
    assert translate("reports.period_too_long", "en", days=731) == (
        "The period is longer than 731 days. Choose a shorter period."
    )


def test_every_month_has_a_label():
    codes = all_messages()
    for month in range(1, 13):
        assert f"reports.col_m{month:02d}" in codes


def test_the_two_settings_are_registered_with_their_defaults(world):
    settings_service.clear_cache()
    rows = {row.key: row for row in settings_service.list_group("hr")}

    assert rows["meal_tickets_per_month"].default == 21
    assert rows["export_cutoff_day"].default is None
    assert settings_service.get("meal_tickets_per_month") == 21
    assert settings_service.get("export_cutoff_day") is None


def test_cutoff_day_stays_inside_every_month(world):
    with pytest.raises(DomainError) as refused:
        settings_service.set_value(actor=world.hr_user, key="export_cutoff_day", value=29)
    assert refused.value.code == "settings.out_of_range"

    settings_service.set_value(actor=world.hr_user, key="export_cutoff_day", value=25)
    assert settings_service.get("export_cutoff_day") == 25

    settings_service.set_value(actor=world.hr_user, key="export_cutoff_day", value=None)
    assert settings_service.get("export_cutoff_day") is None
