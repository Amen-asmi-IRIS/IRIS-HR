"""Password policy (ACC-02) and administrator-issued temporary passwords (ACC-05)."""

import secrets

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError

from apps.core.errors import DomainError

# No 0/O, 1/l/I: a temporary password is read aloud or copied by hand.
TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ" + "abcdefghijkmnpqrstuvwxyz" + "23456789"


def validate_new_password(password: str, user=None, *, field: str = "new_password") -> None:
    """Applies AUTH_PASSWORD_VALIDATORS. The reasons are in the active language."""
    try:
        password_validation.validate_password(password, user=user)
    except ValidationError as exc:
        raise DomainError("auth.weak_password", field=field, reasons=" ".join(exc.messages)) from exc


def generate_temporary_password() -> str:
    """Sixteen random characters in four groups, for example `Xk7p-M2qd-Hn4w-TbR9`."""
    groups = ["".join(secrets.choice(TEMP_ALPHABET) for _ in range(4)) for _ in range(4)]
    return "-".join(groups)
