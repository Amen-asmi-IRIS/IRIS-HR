import json
import logging
import sys

from django.http import HttpResponse

from apps.core import context
from apps.core.logging import REDACTED, JsonFormatter, redact
from apps.core.middleware import RequestContextMiddleware
from config.logging import build_logging


class FakeUser:
    is_authenticated = True
    public_id = "0f0e0d0c-0000-4000-8000-000000000001"


def make_record(message="hello", **extra):
    record = logging.LogRecord("iris.test", logging.INFO, __file__, 1, message, None, None)
    for key, value in extra.items():
        setattr(record, key, value)
    return record


def test_a_line_is_json_with_the_standard_fields():
    with context.overriding(request_id="abc123"):
        payload = json.loads(JsonFormatter().format(make_record()))

    assert payload["message"] == "hello"
    assert payload["level"] == "INFO"
    assert payload["logger"] == "iris.test"
    assert payload["request_id"] == "abc123"
    assert payload["user_id"] is None
    assert payload["time"].endswith("+00:00")


def test_the_user_id_appears_once_the_request_has_loaded_the_user(rf):
    request = rf.get("/x")
    request._cached_user = FakeUser()
    tokens = context.bind_request(request, "rid")
    try:
        payload = json.loads(JsonFormatter().format(make_record()))
    finally:
        context.unbind(tokens)

    assert payload["user_id"] == FakeUser.public_id
    assert payload["request_id"] == "rid"


def test_redact_replaces_sensitive_keys_at_any_depth():
    data = {
        "email": "a@impactrisks.com",
        "password": "hunter2hunter2",
        "nested": {"comment": "I have the flu", "days": 2},
        "items": [{"new_password": "x"}, {"content": b"%PDF"}],
    }

    assert redact(data) == {
        "email": "a@impactrisks.com",
        "password": REDACTED,
        "nested": {"comment": REDACTED, "days": 2},
        "items": [{"new_password": REDACTED}, {"content": REDACTED}],
    }


def test_sensitive_values_never_reach_the_line():
    record = make_record(data={"password": "hunter2hunter2", "nested": {"comment": "I have the flu"}})

    line = JsonFormatter().format(record)

    assert "hunter2hunter2" not in line
    assert "I have the flu" not in line
    assert json.loads(line)["data"]["password"] == REDACTED


def test_an_exception_is_included():
    record = make_record()
    try:
        raise ValueError("broken thing")
    except ValueError:
        record.exc_info = sys.exc_info()

    payload = json.loads(JsonFormatter().format(record))

    assert "ValueError: broken thing" in payload["exception"]


def test_each_request_is_logged_without_its_query_string(rf, caplog):
    middleware = RequestContextMiddleware(lambda request: HttpResponse(status=204))

    with caplog.at_level(logging.INFO, logger="iris.request"):
        middleware(rf.get("/api/v1/thing?search=secret-term"))

    record = next(r for r in caplog.records if r.name == "iris.request")
    assert record.data["method"] == "GET"
    assert record.data["path"] == "/api/v1/thing"
    assert record.data["status"] == 204
    assert isinstance(record.data["duration_ms"], int)
    assert "secret-term" not in json.dumps(record.data)


def test_the_logging_configuration_writes_json_to_standard_output():
    config = build_logging("WARNING")

    assert config["root"]["level"] == "WARNING"
    assert config["root"]["handlers"] == ["stdout"]
    assert config["handlers"]["stdout"]["stream"] == "ext://sys.stdout"
    assert config["formatters"]["json"]["()"] == "apps.core.logging.JsonFormatter"
