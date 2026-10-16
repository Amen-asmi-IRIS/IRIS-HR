"""The server's message catalogue: one text per code and language, registered by each app (master D9)."""

import logging
from collections.abc import Mapping
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from django.conf import settings
from django.utils import timezone, translation

LANGUAGES = ("fr", "en")

logger = logging.getLogger("iris.i18n")
_MESSAGES: dict[str, dict[str, str]] = {}


def register_messages(messages: Mapping[str, Mapping[str, str]]) -> None:
    """Adds `{"code": {"en": "...", "fr": "..."}}` entries. Called from each app's AppConfig.ready()."""
    for code, texts in messages.items():
        new = dict(texts)
        if code in _MESSAGES and _MESSAGES[code] != new:
            raise ValueError(f"Message code registered twice with different texts: {code}")
        _MESSAGES[code] = new


def all_messages() -> Mapping[str, Mapping[str, str]]:
    return _MESSAGES


def active_language() -> str:
    """The language of the current request ("fr" or "en"), or the default outside a request."""
    lang = (translation.get_language() or "").split("-")[0]
    return lang if lang in LANGUAGES else settings.DEFAULT_LANGUAGE


def humanise(value: Any, lang: str) -> Any:
    """Writes dates, times and decimals the way a reader expects them. Times are shown in the local zone."""
    if isinstance(value, datetime):
        local = timezone.localtime(value) if timezone.is_aware(value) else value
        return local.strftime("%d/%m/%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, Decimal):
        text = format(value.normalize(), "f")
        return text.replace(".", ",") if lang == "fr" else text
    return value


# The units a message may give a number: `{amount:days}`, `{spent:hours}`. Singular, then plural.
UNITS = {
    "days": {"fr": ("jour", "jours"), "en": ("day", "days")},
    "hours": {"fr": ("heure", "heures"), "en": ("hour", "hours")},
}


def quantity(value: Any, unit: str, lang: str) -> str:
    """A number with its unit as a reader writes it: "1,5 jour", "-2 jours", "+1 day", "0.5 days".

    The value may be a Decimal or the string a notification keeps ("+1.5"); an explicit "+" is kept.
    French takes the singular below 2 (0,5 jour, 1,5 jour), English for exactly 1 only. A value that
    is not a number is written as it is.
    """
    text = str(value).strip()
    try:
        amount = Decimal(text)
    except InvalidOperation:
        return text
    if not amount.is_finite():
        return text
    magnitude = abs(amount)
    number = format(magnitude.normalize(), "f")
    if lang == "fr":
        number = number.replace(".", ",")
    sign = "-" if amount < 0 else ("+" if text.startswith("+") else "")
    singular, plural = UNITS[unit][lang]
    one = magnitude < 2 if lang == "fr" else magnitude == 1
    return f"{sign}{number} {singular if one else plural}"


class _Param:
    """A parameter as `str.format` meets it: `{name}` is humanised, `{name:days}` gets its unit too."""

    def __init__(self, value: Any, lang: str) -> None:
        self.value = value
        self.lang = lang

    def __format__(self, spec: str) -> str:
        if spec in UNITS:
            return quantity(self.value, spec, self.lang)
        return format(humanise(self.value, self.lang), spec)


def translate(code: str, lang: str | None = None, /, **params: Any) -> str:
    """The text of `code` in `lang` (default: the active language), with `params` filled in.

    `{name}` writes dates, times and decimals for the reader (`humanise`); `{name:days}` and
    `{name:hours}` write a number with its unit (`quantity`), so a stored "+1.5" reads "+1,5 jour".
    """
    language = lang if lang in LANGUAGES else active_language()
    texts = _MESSAGES.get(code)
    if texts is None:
        logger.warning("unknown message code", extra={"data": {"code": code}})
        return code
    template = texts.get(language) or texts.get("en") or code
    try:
        return template.format(**{name: _Param(value, language) for name, value in params.items()})
    except (KeyError, IndexError, ValueError):
        return template
