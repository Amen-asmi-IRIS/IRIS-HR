"""The login identifier is the professional email, on the company domain only (ACC-01)."""

import re

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from apps.core.errors import DomainError

NOT_AN_ADDRESS = "(not an email address)"

# One @, no whitespace, and a dotted domain whose last part is made of letters. Letters of any alphabet count.
_ADDRESS_SHAPE = re.compile(r"[^@\s]+@(?:[\w-]+\.)+[^\W\d_]{2,}")
_ADDRESS_MAX_LENGTH = 254


def normalise_email(value: str | None) -> str:
    return (value or "").strip().lower()


def recordable_address(value: str | None) -> str:
    """What the audit trail may keep of text typed as an address: the text if it has the shape of one.

    Anything else may be a password typed in the wrong box, and the trail is never erased: it is replaced by
    NOT_AN_ADDRESS. A look-alike domain has the shape of an address and is kept as typed.
    """
    address = normalise_email(value)
    if len(address) <= _ADDRESS_MAX_LENGTH and _ADDRESS_SHAPE.fullmatch(address):
        return address
    return NOT_AN_ADDRESS


def has_allowed_domain(value: str | None) -> bool:
    """True when the text after the last @ is exactly the company domain."""
    _local, separator, domain = normalise_email(value).rpartition("@")
    return bool(separator) and domain == settings.ALLOWED_EMAIL_DOMAIN


def ensure_allowed_email(value: str | None, *, field: str = "email") -> str:
    """Returns the normalised address, or raises with the reason."""
    email = normalise_email(value)
    if not has_allowed_domain(email):
        raise DomainError("auth.domain_not_allowed", field=field, domain=settings.ALLOWED_EMAIL_DOMAIN)
    try:
        validate_email(email)
    except ValidationError as exc:
        raise DomainError("accounts.email_invalid", field=field) from exc
    return email
