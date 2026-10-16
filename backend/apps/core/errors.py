"""Errors that services raise. The API turns them into problem details (apps.core.api.problems)."""

import dataclasses
from collections.abc import Mapping, Sequence
from typing import Any


@dataclasses.dataclass(frozen=True)
class Problem:
    """One thing that is wrong: a message code, the input it belongs to, and the values of its message."""

    code: str
    field: str | None = None
    params: Mapping[str, Any] = dataclasses.field(default_factory=dict)


class DomainError(Exception):
    """A rule was broken. `status` is the HTTP status the API answers with."""

    status = 400
    default_code = "core.invalid"

    def __init__(
        self,
        code: str | None = None,
        *,
        field: str | None = None,
        problems: Sequence[Problem] | None = None,
        **params: Any,
    ) -> None:
        self.code = code or self.default_code
        self.params = dict(params)
        self.problems = list(problems) if problems else [Problem(self.code, field, self.params)]
        super().__init__(self.code)

    @property
    def field(self) -> str | None:
        return self.problems[0].field


class NotAllowed(DomainError):
    status = 403
    default_code = "core.not_allowed"


class NotFound(DomainError):
    status = 404
    default_code = "core.not_found"


class Conflict(DomainError):
    status = 409
    default_code = "core.conflict"


class RateLimited(DomainError):
    status = 429
    default_code = "core.rate_limited"
