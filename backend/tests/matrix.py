"""The vocabulary of the permission matrix (master 6.11)."""

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class P(StrEnum):
    """Personas of the standard cast. `World.user_for(persona)` gives the account."""

    ANON = "anon"
    OWNER = "owner"
    PEER = "peer"
    MANAGER = "manager"
    OTHER_MANAGER = "other_manager"
    OUTSIDER = "outsider"
    HR = "hr"
    EXEC = "exec"
    SYSADMIN = "sysadmin"


ALLOW = "allow"  # any status except 401, 403, 404 and 500
DENY = 403  # signed in, but the role may not use this endpoint
HIDE = 404  # the item is outside this persona's reach, and must look as if it did not exist
LOGIN = 401  # no session

BLOCKED_OR_BROKEN = (401, 403, 404, 500)

EVERYONE = tuple(P)
SIGNED_IN = tuple(persona for persona in P if persona is not P.ANON)


@dataclass(frozen=True)
class Case:
    """One endpoint and what each persona must get from it."""

    route: str  # "accounts:account-detail"
    method: str  # "GET"
    expect: Mapping[P, object]
    kwargs: Callable[[Any], dict] = lambda world: {}  # URL arguments, built from the cast
    body: Callable[[Any], dict | None] = lambda world: None  # request body for unsafe methods
    query: Callable[[Any], dict] = lambda world: {}
    label: str = ""  # distinguishes several cases of one endpoint
    format: str = "json"  # "multipart" for uploads

    @property
    def id(self) -> str:
        return f"{self.method} {self.route}" + (f" [{self.label}]" if self.label else "")


def only(*allowed: P, hide: Iterable[P] = ()) -> dict[P, object]:
    """`allowed` get ALLOW, `hide` get 404, anonymous gets 401 (unless allowed), everyone else gets 403."""
    hidden = set(hide)
    expect: dict[P, object] = {}
    for persona in P:
        if persona in allowed:
            expect[persona] = ALLOW
        elif persona in hidden:
            expect[persona] = HIDE
        elif persona is P.ANON:
            expect[persona] = LOGIN
        else:
            expect[persona] = DENY
    return expect


def verdict(case: Case, persona: P, status: int) -> str | None:
    """None when `status` is what the case expects for `persona`, else a sentence saying what is wrong."""
    if persona not in case.expect:
        return f"{case.id}: the case does not say what {persona.value} must get"
    expected = case.expect[persona]
    if expected == ALLOW:
        if status in BLOCKED_OR_BROKEN:
            return f"{case.id}: {persona.value} must be let in, but got {status}"
        return None
    if status != expected:
        return f"{case.id}: {persona.value} must get {expected}, but got {status}"
    return None


def missing_cases(declared: set[tuple[str, str]], cases: Iterable[Case]) -> list[tuple[str, str]]:
    """Declared (route, method) pairs that no case covers."""
    covered = {(case.route, case.method) for case in cases}
    return sorted(declared - covered)


def unknown_cases(declared: set[tuple[str, str]], cases: Iterable[Case]) -> list[tuple[str, str]]:
    """Cases whose (route, method) is not declared by any view."""
    covered = {(case.route, case.method) for case in cases}
    return sorted(covered - declared)
