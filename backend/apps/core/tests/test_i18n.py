from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from django.http import HttpResponse
from django.utils import translation

from apps.core import i18n
from apps.core.i18n import register_messages, translate
from apps.core.middleware import LanguageMiddleware

register_messages(
    {
        "test.greeting": {"en": "Hello {name}", "fr": "Bonjour {name}"},
        "test.values": {
            "en": "{amount} days until {day}, at {moment}",
            "fr": "{amount} jours avant le {day}, à {moment}",
        },
        "test.quantities": {
            "en": "Changed by {amount:days}, for {spent:hours}",
            "fr": "Modifié de {amount:days}, pour {spent:hours}",
        },
    }
)


class FakeUser:
    is_authenticated = True

    def __init__(self, language):
        self.language = language


def test_translate_uses_the_active_language():
    with translation.override("fr"):
        assert translate("test.greeting", name="Sami") == "Bonjour Sami"
    with translation.override("en"):
        assert translate("test.greeting", name="Sami") == "Hello Sami"


def test_an_explicit_language_wins():
    with translation.override("fr"):
        assert translate("test.greeting", "en", name="Sami") == "Hello Sami"


def test_a_regional_variant_maps_to_its_language():
    with translation.override("en-gb"):
        assert i18n.active_language() == "en"


def test_an_unsupported_language_falls_back_to_the_default(settings):
    settings.DEFAULT_LANGUAGE = "en"

    with translation.override("de"):
        assert translate("test.greeting", name="Sami") == "Hello Sami"


def test_an_unknown_code_is_returned_as_it_is():
    assert translate("test.does_not_exist") == "test.does_not_exist"


def test_a_missing_parameter_does_not_crash():
    assert translate("test.greeting", "en") == "Hello {name}"


def test_dates_times_and_decimals_are_written_for_the_reader():
    params = {
        "amount": Decimal("2.50"),
        "day": date(2026, 10, 6),
        "moment": datetime(2026, 10, 6, 9, 30, tzinfo=UTC),  # 10:30 in Africa/Tunis
    }

    assert translate("test.values", "fr", **params) == "2,5 jours avant le 06/10/2026, à 06/10/2026 10:30"
    assert translate("test.values", "en", **params) == "2.5 days until 06/10/2026, at 06/10/2026 10:30"


@pytest.mark.parametrize(
    ("amount", "fr", "en"),
    [
        ("0.5", "0,5 jour", "0.5 days"),
        ("1", "1 jour", "1 day"),
        ("1.5", "1,5 jour", "1.5 days"),
        ("2.50", "2,5 jours", "2.5 days"),
        ("+1.5", "+1,5 jour", "+1.5 days"),
        ("+1", "+1 jour", "+1 day"),
        ("-0.5", "-0,5 jour", "-0.5 days"),
        ("-1", "-1 jour", "-1 day"),
        ("-2", "-2 jours", "-2 days"),
        (Decimal("-3.00"), "-3 jours", "-3 days"),
        ("10", "10 jours", "10 days"),
    ],
)
def test_a_number_of_days_is_written_for_the_reader_with_its_unit(amount, fr, en):
    """`{name:days}`: the decimal separator of the language, and the singular or plural it takes."""
    assert translate("test.quantities", "fr", amount=amount, spent="1") == f"Modifié de {fr}, pour 1 heure"
    assert translate("test.quantities", "en", amount=amount, spent="1") == f"Changed by {en}, for 1 hour"


def test_a_number_of_hours_is_written_for_the_reader_with_its_unit():
    assert (
        translate("test.quantities", "fr", amount="1", spent="1.25") == "Modifié de 1 jour, pour 1,25 heure"
    )
    assert translate("test.quantities", "en", amount="1", spent="2.5") == "Changed by 1 day, for 2.5 hours"


def test_a_unit_on_a_value_that_is_not_a_number_writes_the_value_as_it_is():
    assert translate("test.quantities", "en", amount="several", spent="1") == "Changed by several, for 1 hour"


def test_registering_a_code_twice_with_other_texts_is_refused():
    register_messages(
        {"test.greeting": {"en": "Hello {name}", "fr": "Bonjour {name}"}}
    )  # same texts: accepted

    with pytest.raises(ValueError, match="test.greeting"):
        register_messages({"test.greeting": {"en": "Hi", "fr": "Salut"}})


def run_language_middleware(request):
    seen = {}

    def view(inner):
        seen["language"] = translation.get_language()
        return HttpResponse("ok")

    response = LanguageMiddleware(view)(request)
    return response, seen


def test_the_signed_in_users_language_wins(rf):
    request = rf.get("/x", HTTP_ACCEPT_LANGUAGE="fr")
    request.user = FakeUser("en")

    response, seen = run_language_middleware(request)

    assert seen["language"] == "en"
    assert response["Content-Language"] == "en"
    assert request.LANGUAGE_CODE == "en"


@pytest.mark.parametrize(
    ("header", "expected"),
    [("en-GB,en;q=0.9", "en"), ("fr-FR", "fr"), ("de, en;q=0.5", "en"), ("EN", "en")],
)
def test_an_anonymous_request_uses_the_accept_language_header(rf, header, expected):
    _, seen = run_language_middleware(rf.get("/x", HTTP_ACCEPT_LANGUAGE=header))

    assert seen["language"] == expected


@pytest.mark.parametrize("header", ["", "de", "*"])
def test_without_a_usable_header_the_default_language_applies(rf, settings, header):
    settings.DEFAULT_LANGUAGE = "en"

    _, seen = run_language_middleware(rf.get("/x", HTTP_ACCEPT_LANGUAGE=header))

    assert seen["language"] == "en"


def test_the_language_does_not_leak_into_the_next_request(rf, settings):
    settings.DEFAULT_LANGUAGE = "fr"
    request = rf.get("/x")
    request.user = FakeUser("en")
    run_language_middleware(request)

    _, seen = run_language_middleware(rf.get("/x"))

    assert seen["language"] == "fr"
