"""The catalogue must be complete in French and English (NFR-06, UI rule U9)."""

import re
import string

from apps.core.i18n import all_messages

CODE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$")


def placeholders(text: str) -> set[str]:
    return {name for _, name, _, _ in string.Formatter().parse(text) if name}


def test_the_catalogue_is_not_empty():
    assert "core.not_found" in all_messages()


def test_every_message_exists_in_both_languages():
    missing = [
        f"{code}: no {lang} text"
        for code, texts in all_messages().items()
        for lang in ("en", "fr")
        if not (texts.get(lang) or "").strip()
    ]

    assert missing == []


def test_both_languages_use_the_same_placeholders():
    different = [
        f"{code}: en {sorted(placeholders(texts['en']))} / fr {sorted(placeholders(texts['fr']))}"
        for code, texts in all_messages().items()
        if placeholders(texts.get("en", "")) != placeholders(texts.get("fr", ""))
    ]

    assert different == []


def test_codes_follow_the_naming_rule():
    assert [code for code in all_messages() if not CODE.match(code)] == []


def test_no_message_has_extra_languages():
    assert [code for code, texts in all_messages().items() if set(texts) != {"en", "fr"}] == []
