import re

import pytest
from django.contrib.auth.password_validation import CommonPasswordValidator
from django.utils import translation

from apps.accounts.models import User
from apps.accounts.passwords import generate_temporary_password, validate_new_password
from apps.core.errors import DomainError

TEMPORARY = re.compile(r"^[A-HJ-NP-Za-km-np-z2-9]{4}(-[A-HJ-NP-Za-km-np-z2-9]{4}){3}$")


def sami() -> User:
    return User(email="sami.benali@impactrisks.com", full_name="Sami Ben Ali")


def test_a_good_password_is_accepted():
    validate_new_password("Correct-Horse-42!", sami())


def test_a_password_under_12_characters_is_refused():
    with pytest.raises(DomainError) as error:
        validate_new_password("Short-pass1", sami())

    assert error.value.code == "auth.weak_password"
    assert error.value.field == "new_password"
    assert error.value.params["reasons"]


def test_a_common_password_is_refused():
    common = next(p for p in sorted(CommonPasswordValidator().passwords) if len(p) >= 12)

    with pytest.raises(DomainError) as error:
        validate_new_password(common, sami())

    assert error.value.code == "auth.weak_password"


@pytest.mark.parametrize("password", ["Impactrisks2026", "sami.benali@impactrisks.com", "Sami Ben Ali 1"])
def test_a_password_close_to_the_email_or_the_name_is_refused(password):
    with pytest.raises(DomainError) as error:
        validate_new_password(password, sami())

    assert error.value.code == "auth.weak_password"


def test_the_reasons_are_written_in_the_readers_language():
    with translation.override("fr"), pytest.raises(DomainError) as french:
        validate_new_password("court", sami())
    with translation.override("en"), pytest.raises(DomainError) as english:
        validate_new_password("short", sami())

    assert "12 caract" in french.value.params["reasons"]
    assert "12 characters" in english.value.params["reasons"]


def test_the_field_name_can_be_chosen():
    with pytest.raises(DomainError) as error:
        validate_new_password("short", sami(), field="password")

    assert error.value.field == "password"


def test_temporary_passwords_are_readable_unique_and_strong():
    generated = {generate_temporary_password() for _ in range(200)}

    assert len(generated) == 200
    for password in generated:
        assert TEMPORARY.match(password), password
        validate_new_password(password, sami())
