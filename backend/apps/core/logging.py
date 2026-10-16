"""Structured JSON log lines. Values go in `extra={"data": {...}}`; sensitive keys are redacted."""

import json
import logging
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from apps.core import context

REDACTED = "[redacted]"
SENSITIVE_KEYS = frozenset(
    {
        "password",
        "current_password",
        "new_password",
        "temporary_password",
        "comment",
        "content",
        "secret",
        "token",
        "csrf_token",
        "authorization",
        "cookie",
    }
)


def redact(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            key: REDACTED if str(key).lower() in SENSITIVE_KEYS else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [redact(item) for item in value]
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "time": datetime.fromtimestamp(record.created, tz=UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": context.current_request_id() or None,
            "user_id": context.logged_user_id(),
        }
        data = getattr(record, "data", None)
        if isinstance(data, Mapping):
            payload["data"] = redact(data)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)
