from apps.core.i18n import active_language


def active_lang() -> str:
    """The language of the current request: "fr" or "en"."""
    return active_language()


def pick(fr: str, en: str) -> str:
    """One of two stored names, in the language of the reader."""
    return fr if active_language() == "fr" else en
