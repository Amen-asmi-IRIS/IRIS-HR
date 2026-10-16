"""Reads and validates every environment variable once. Nothing else reads os.environ."""

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from cryptography.fernet import Fernet

ENVIRONMENTS = ("development", "test", "production")
LANGUAGES = ("fr", "en")
LOG_LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
PLACEHOLDER = "change-me"

_DOMAIN = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
_HOST = re.compile(r"^[A-Za-z0-9.\-_*\[\]:]+$")


class EnvError(Exception):
    """A missing or malformed environment variable. `variable` names it."""

    def __init__(self, variable: str, problem: str) -> None:
        super().__init__(f"{variable} {problem}")
        self.variable = variable
        self.problem = problem


@dataclass(frozen=True)
class Env:
    environment: str
    app_version: str
    site_hostname: str
    secret_key: str
    allowed_hosts: tuple[str, ...]
    postgres_db: str
    postgres_user: str
    postgres_password: str
    file_encryption_key: str
    backup_passphrase: str
    allowed_email_domain: str
    time_zone: str
    default_language: str
    log_level: str


def _required(source: Mapping[str, str], name: str) -> str:
    value = (source.get(name) or "").strip()
    if not value:
        raise EnvError(name, "is missing or empty")
    return value


def _choice(source: Mapping[str, str], name: str, choices: tuple[str, ...], *, upper: bool = False) -> str:
    value = _required(source, name)
    value = value.upper() if upper else value.lower()
    if value not in choices:
        raise EnvError(name, f"must be one of: {', '.join(choices)}")
    return value


def _secret(source: Mapping[str, str], name: str, *, min_length: int) -> str:
    value = _required(source, name)
    if value.startswith(PLACEHOLDER):
        raise EnvError(name, "still holds the placeholder from .env.example")
    if len(value) < min_length:
        raise EnvError(name, f"must have at least {min_length} characters")
    return value


def _hostname(source: Mapping[str, str], name: str) -> str:
    value = _required(source, name)
    if not _HOST.match(value) or "//" in value:
        raise EnvError(name, "must be a host name without scheme or path")
    return value


def _hosts(source: Mapping[str, str], name: str) -> tuple[str, ...]:
    hosts = tuple(part.strip() for part in _required(source, name).split(",") if part.strip())
    if not hosts:
        raise EnvError(name, "must list at least one host name")
    for host in hosts:
        if not _HOST.match(host):
            raise EnvError(name, f"contains an invalid host name: {host!r}")
    return hosts


def _fernet_key(source: Mapping[str, str], name: str) -> str:
    value = _required(source, name)
    try:
        Fernet(value.encode())
    except (ValueError, TypeError) as exc:
        raise EnvError(
            name, "must be a Fernet key: 32 random bytes in URL-safe base64 (44 characters)"
        ) from exc
    return value


def _domain(source: Mapping[str, str], name: str) -> str:
    value = _required(source, name).lower()
    if not _DOMAIN.match(value):
        raise EnvError(name, "must be a bare domain such as impactrisks.com")
    return value


def _time_zone(source: Mapping[str, str], name: str) -> str:
    value = _required(source, name)
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise EnvError(name, "must be an IANA time zone such as Africa/Tunis") from exc
    return value


def load(source: Mapping[str, str] | None = None) -> Env:
    """Returns the validated environment, or raises EnvError naming the first bad variable."""
    src = os.environ if source is None else source
    return Env(
        environment=_choice(src, "ENVIRONMENT", ENVIRONMENTS),
        app_version=_required(src, "APP_VERSION"),
        site_hostname=_hostname(src, "SITE_HOSTNAME"),
        secret_key=_secret(src, "DJANGO_SECRET_KEY", min_length=50),
        allowed_hosts=_hosts(src, "DJANGO_ALLOWED_HOSTS"),
        postgres_db=_required(src, "POSTGRES_DB"),
        postgres_user=_required(src, "POSTGRES_USER"),
        postgres_password=_secret(src, "POSTGRES_PASSWORD", min_length=12),
        file_encryption_key=_fernet_key(src, "FILE_ENCRYPTION_KEY"),
        backup_passphrase=_secret(src, "BACKUP_PASSPHRASE", min_length=16),
        allowed_email_domain=_domain(src, "ALLOWED_EMAIL_DOMAIN"),
        time_zone=_time_zone(src, "TIME_ZONE"),
        default_language=_choice(src, "DEFAULT_LANGUAGE", LANGUAGES),
        log_level=_choice(src, "LOG_LEVEL", LOG_LEVELS, upper=True),
    )
