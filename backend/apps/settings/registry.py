"""Which settings exist, of which kind, and what values they accept (master 6.7)."""

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from apps.core.errors import DomainError, NotFound

GROUPS = ("hr", "system")
KINDS = ("int", "decimal", "bool", "weekdays", "str_list", "int_or_null", "date_or_null")


@dataclass(frozen=True)
class SettingDef:
    key: str
    group: str  # "hr" (changed by HR) or "system" (changed by the System Administrator)
    kind: str
    default: Any
    minimum: Any = None
    maximum: Any = None
    choices: tuple[str, ...] | None = None  # str_list only: the strings that are accepted


_defs: dict[str, SettingDef] = {}


def _invalid() -> DomainError:
    return DomainError("settings.invalid_value", field="value")


def _check_range(defn: SettingDef, value: Any) -> None:
    if defn.minimum is None:
        return
    if value < defn.minimum or value > defn.maximum:
        raise DomainError("settings.out_of_range", field="value", minimum=defn.minimum, maximum=defn.maximum)


def _whole_number(defn: SettingDef, raw: Any) -> int:
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise _invalid()
    _check_range(defn, raw)
    return raw


def to_storage(defn: SettingDef, raw: Any) -> Any:
    """Validates `raw` and returns the JSON form that is stored. Raises DomainError on a bad value."""
    kind = defn.kind
    if kind == "bool":
        if not isinstance(raw, bool):
            raise _invalid()
        return raw
    if kind == "int":
        return _whole_number(defn, raw)
    if kind == "int_or_null":
        return None if raw is None else _whole_number(defn, raw)
    if kind == "decimal":
        if isinstance(raw, bool) or not isinstance(raw, (int, float, str, Decimal)):
            raise _invalid()
        try:
            value = Decimal(str(raw).strip().replace(",", "."))
        except InvalidOperation:
            raise _invalid() from None
        if not value.is_finite():
            raise _invalid()
        _check_range(defn, value)
        return format(value.normalize(), "f")
    if kind == "weekdays":
        if not isinstance(raw, list) or not raw:
            raise _invalid()
        if any(isinstance(day, bool) or not isinstance(day, int) or not 1 <= day <= 7 for day in raw):
            raise _invalid()
        if len(set(raw)) != len(raw):
            raise _invalid()
        return sorted(raw)
    if kind == "str_list":
        if not isinstance(raw, list) or any(not isinstance(item, str) or not item.strip() for item in raw):
            raise _invalid()
        values = [item.strip().lower() for item in raw]
        if len(set(values)) != len(values):
            raise _invalid()
        if defn.choices is not None and (not values or any(value not in defn.choices for value in values)):
            raise _invalid()
        return values
    if kind == "date_or_null":
        if raw is None:
            return None
        if isinstance(raw, date) and not isinstance(raw, datetime):
            return raw.isoformat()
        if isinstance(raw, str):
            try:
                return date.fromisoformat(raw.strip()).isoformat()
            except ValueError:
                raise _invalid() from None
        raise _invalid()
    raise ValueError(f"Unknown setting kind: {kind}")


def to_python(defn: SettingDef, stored: Any) -> Any:
    """The typed value services work with: Decimal for decimals, date for dates."""
    if stored is None:
        return None
    if defn.kind == "decimal":
        return Decimal(stored)
    if defn.kind == "date_or_null":
        return date.fromisoformat(stored)
    if isinstance(stored, list):
        return list(stored)
    return stored


def register(defn: SettingDef) -> None:
    """Called from an app's AppConfig.ready(). A wrong definition stops the process at start-up."""
    if defn.group not in GROUPS:
        raise ValueError(f"{defn.key}: unknown group {defn.group!r}")
    if defn.kind not in KINDS:
        raise ValueError(f"{defn.key}: unknown kind {defn.kind!r}")
    if (defn.minimum is None) != (defn.maximum is None):
        raise ValueError(f"{defn.key}: give both a minimum and a maximum, or neither")
    if defn.choices is not None and defn.kind != "str_list":
        raise ValueError(f"{defn.key}: choices apply to str_list settings only")
    existing = _defs.get(defn.key)
    if existing is not None and existing != defn:
        raise ValueError(f"Setting registered twice with different definitions: {defn.key}")
    try:
        to_storage(defn, defn.default)
    except DomainError as exc:
        raise ValueError(f"{defn.key}: the default value is not valid ({exc.code})") from exc
    _defs[defn.key] = defn


def get_def(key: str) -> SettingDef:
    try:
        return _defs[key]
    except KeyError:
        raise NotFound("settings.unknown_key", field="key", key=key) from None


def defs_for(group: str) -> list[SettingDef]:
    """The definitions of one group, in registration order."""
    return [defn for defn in _defs.values() if defn.group == group]
