import pytest

from apps.accounts.emails import (
    NOT_AN_ADDRESS,
    ensure_allowed_email,
    has_allowed_domain,
    normalise_email,
    recordable_address,
)
from apps.core.errors import DomainError


@pytest.fixture(autouse=True)
def company_domain(settings):
    settings.ALLOWED_EMAIL_DOMAIN = "impactrisks.com"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  Sami@ImpactRisks.com ", "sami@impactrisks.com"),
        ("sami@impactrisks.com", "sami@impactrisks.com"),
        ("", ""),
        (None, ""),
    ],
)
def test_normalise_trims_and_lowers(raw, expected):
    assert normalise_email(raw) == expected


@pytest.mark.parametrize(
    "address",
    ["sami@impactrisks.com", " SAMI@IMPACTRISKS.COM ", "Employee.A1@ImpactRisks.Com"],
)
def test_addresses_on_the_company_domain_are_allowed(address):
    assert has_allowed_domain(address) is True


@pytest.mark.parametrize(
    "address",
    [
        "sami@impactrisks.com.evil.com",
        "sami@impactrisk.com",
        "sami@mail.impactrisks.com",
        "sami@evil-impactrisks.com",
        "sami@impactrisks.co",
        "sami@impactrisкs.com",  # a Cyrillic letter that looks like "k"
        "impactrisks.com",
        "sami",
        "",
    ],
)
def test_every_other_address_is_refused(address):
    assert has_allowed_domain(address) is False


@pytest.mark.parametrize(
    ("typed", "kept"),
    [
        ("  Sami@ImpactRisks.com ", "sami@impactrisks.com"),
        ("sami@gmail.com", "sami@gmail.com"),
        ("sami@impactrisks.com.evil.com", "sami@impactrisks.com.evil.com"),
        ("sami@impactrisкs.com", "sami@impactrisкs.com"),  # a Cyrillic look-alike: worth seeing
        ("o'brien+hr@impactrisks.com", "o'brien+hr@impactrisks.com"),
    ],
)
def test_text_with_the_shape_of_an_address_may_be_recorded(typed, kept):
    assert recordable_address(typed) == kept


@pytest.mark.parametrize(
    "typed",
    [
        "Correct-Horse-42!",
        "P@ssw0rd.2024",
        "P@ssword",
        "pass word@impactrisks.com",
        "sami@evil.com@impactrisks.com",
        "@impactrisks.com",
        "sami@.com",
        "sami@impactrisks..com",
        "x" * 250 + "@impactrisks.com",
        "",
        None,
    ],
)
def test_any_other_text_is_replaced_before_it_is_recorded(typed):
    assert recordable_address(typed) == NOT_AN_ADDRESS


def test_ensure_allowed_email_returns_the_normalised_address():
    assert ensure_allowed_email("  Sami@ImpactRisks.com ") == "sami@impactrisks.com"


def test_a_foreign_domain_is_refused_with_the_reason():
    with pytest.raises(DomainError) as error:
        ensure_allowed_email("sami@gmail.com")

    assert error.value.code == "auth.domain_not_allowed"
    assert error.value.field == "email"
    assert error.value.params == {"domain": "impactrisks.com"}


@pytest.mark.parametrize(
    "address", ["@impactrisks.com", "sa mi@impactrisks.com", "sami@evil.com@impactrisks.com"]
)
def test_a_malformed_address_on_the_right_domain_is_invalid(address):
    with pytest.raises(DomainError) as error:
        ensure_allowed_email(address, field="professional_email")

    assert error.value.code == "accounts.email_invalid"
    assert error.value.field == "professional_email"
