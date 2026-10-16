import pytest
from django.http import HttpResponse

from apps.core import context
from apps.core.middleware import RequestContextMiddleware
from apps.core.net import client_ip


class FakeUser:
    is_authenticated = True
    public_id = "0f0e0d0c-0000-4000-8000-000000000001"


class FakeAnonymous:
    is_authenticated = False


def run(request):
    seen = {}

    def view(inner):
        seen["request_id"] = context.current_request_id()
        seen["ip"] = context.current_ip()
        seen["actor"] = context.current_actor()
        return HttpResponse("ok")

    response = RequestContextMiddleware(view)(request)
    return response, seen


def test_each_request_gets_an_id_that_the_response_carries(rf):
    request = rf.get("/x")

    response, seen = run(request)

    assert len(seen["request_id"]) == 32
    assert response["X-Request-ID"] == seen["request_id"]
    assert request.id == seen["request_id"]


def test_a_client_supplied_request_id_is_ignored(rf):
    response, seen = run(rf.get("/x", HTTP_X_REQUEST_ID="chosen-by-the-client"))

    assert seen["request_id"] != "chosen-by-the-client"
    assert response["X-Request-ID"] == seen["request_id"]


def test_two_requests_get_different_ids(rf):
    _, first = run(rf.get("/x"))
    _, second = run(rf.get("/x"))

    assert first["request_id"] != second["request_id"]


def test_the_network_address_comes_from_the_proxy_header_first(rf):
    request = rf.get("/x", HTTP_X_FORWARDED_FOR="192.168.1.20, 10.0.0.1", REMOTE_ADDR="172.18.0.5")

    _, seen = run(request)

    assert seen["ip"] == "192.168.1.20"
    assert client_ip(request) == "192.168.1.20"


def test_the_network_address_falls_back_to_the_socket(rf):
    _, seen = run(rf.get("/x", REMOTE_ADDR="10.0.0.7"))

    assert seen["ip"] == "10.0.0.7"


@pytest.mark.parametrize("header", ["unknown", "192.168.1.20:51234", "not an address, 10.0.0.1", " "])
def test_a_proxy_header_that_holds_no_address_is_ignored(rf, header):
    request = rf.get("/x", HTTP_X_FORWARDED_FOR=header, REMOTE_ADDR="172.18.0.5")

    assert client_ip(request) == "172.18.0.5"


def test_without_any_address_the_caller_is_unknown(rf):
    assert client_ip(rf.get("/x", HTTP_X_FORWARDED_FOR="unknown", REMOTE_ADDR="")) == ""


def test_the_actor_is_the_signed_in_user(rf):
    request = rf.get("/x")
    request.user = FakeUser()

    _, seen = run(request)

    assert seen["actor"] is request.user


@pytest.mark.parametrize("user", [None, FakeAnonymous()])
def test_there_is_no_actor_without_a_signed_in_user(rf, user):
    request = rf.get("/x")
    if user is not None:
        request.user = user

    _, seen = run(request)

    assert seen["actor"] is None


def test_the_context_is_empty_outside_a_request():
    assert context.current_request_id() == ""
    assert context.current_actor() is None
    assert context.current_ip() is None
    assert context.logged_user_id() is None


def test_the_context_is_cleared_even_when_the_view_raises(rf):
    def broken(request):
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        RequestContextMiddleware(broken)(rf.get("/x"))

    assert context.current_request_id() == ""
    assert context.current_ip() is None


def test_overriding_sets_values_and_restores_them():
    user = FakeUser()

    with context.overriding(actor=user, ip="10.1.2.3", request_id="job-42"):
        assert context.current_actor() is user
        assert context.current_ip() == "10.1.2.3"
        assert context.current_request_id() == "job-42"

    assert context.current_actor() is None
    assert context.current_ip() is None
    assert context.current_request_id() == ""


def test_overriding_can_state_that_there_is_no_actor_and_no_address(rf):
    request = rf.get("/x", REMOTE_ADDR="10.0.0.7")
    request.user = FakeUser()
    tokens = context.bind_request(request, "rid")
    try:
        with context.overriding(actor=None, ip=None):
            assert context.current_actor() is None
            assert context.current_ip() is None
        assert context.current_actor() is request.user
        assert context.current_ip() == "10.0.0.7"
    finally:
        context.unbind(tokens)
