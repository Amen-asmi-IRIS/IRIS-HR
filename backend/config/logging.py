"""Logging configuration: one JSON line per event on standard output, collected by Docker."""

from typing import Any


def build_logging(level: str) -> dict[str, Any]:
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"json": {"()": "apps.core.logging.JsonFormatter"}},
        "handlers": {
            "stdout": {"class": "logging.StreamHandler", "stream": "ext://sys.stdout", "formatter": "json"},
        },
        "root": {"handlers": ["stdout"], "level": level},
        "loggers": {
            "django.server": {"level": "WARNING"},  # the request line is logged by RequestContextMiddleware
            "django.request": {"level": "ERROR"},
        },
    }
