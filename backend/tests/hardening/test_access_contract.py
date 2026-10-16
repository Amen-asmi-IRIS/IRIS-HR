"""Every route declares exactly the access the master plan gives it (PRD 7, PRD 10 'Proof')."""

from __future__ import annotations

import pytest
from django.urls import reverse

from apps.accounts.permissions import AUTHENTICATED, PUBLIC
from tests.hardening.contract_access import EXPECTED, SYSADMIN_MAY_CALL
from tests.hardening.routes import dummy_kwargs, iter_api_routes


def _declared(view, method) -> frozenset[str]:
    value = view.access[method]
    if value is AUTHENTICATED or value == AUTHENTICATED:
        return frozenset({"auth"})
    if value is PUBLIC or value == PUBLIC:
        return frozenset({"public"})
    return frozenset(str(role) for role in value)


def _declared_pairs() -> dict[tuple[str, str], frozenset[str]]:
    return {
        (route.name, method): _declared(route.view, method)
        for route in iter_api_routes()
        for method in route.methods
    }


def test_every_route_is_in_the_contract():
    missing = sorted(set(_declared_pairs()) - set(EXPECTED))
    assert missing == [], f"routes with no line in contract_access.EXPECTED: {missing}"


def test_every_contract_line_exists_as_a_route():
    gone = sorted(set(EXPECTED) - set(_declared_pairs()))
    assert gone == [], f"contract lines with no route: {gone}"


def test_declared_access_equals_the_contract():
    declared = _declared_pairs()
    wrong = {
        key: {"declared": sorted(declared[key]), "contract": sorted(EXPECTED[key])}
        for key in declared
        if key in EXPECTED and declared[key] != EXPECTED[key]
    }
    assert wrong == {}


def test_views_expose_no_undeclared_method():
    for route in iter_api_routes():
        allowed = {m.upper() for m in route.view.http_method_names} - {"OPTIONS", "HEAD"}
        assert allowed <= set(route.methods), (
            f"{route.name} accepts {allowed - set(route.methods)} without access"
        )


@pytest.mark.django_db
def test_system_administrator_is_refused_on_every_business_route(world, client_for):
    client = client_for(world.sysadmin_user)
    wrong = []
    for route in iter_api_routes():
        for method in route.methods:
            if (route.name, method) in SYSADMIN_MAY_CALL:
                continue
            url = reverse(route.name, kwargs=dummy_kwargs(route))
            response = client.generic(method, url, data="{}", content_type="application/json")
            if response.status_code != 403:
                wrong.append((route.name, method, response.status_code))
    assert wrong == [], f"System Administrator was not refused with 403: {wrong}"


@pytest.mark.django_db
def test_anonymous_is_refused_everywhere_but_public_routes(anon_client):
    wrong = []
    for route in iter_api_routes():
        for method in route.methods:
            if EXPECTED.get((route.name, method)) == frozenset({"public"}):
                continue
            url = reverse(route.name, kwargs=dummy_kwargs(route))
            response = anon_client.generic(method, url, data="{}", content_type="application/json")
            if response.status_code != 401:
                wrong.append((route.name, method, response.status_code))
    assert wrong == [], f"anonymous calls not answered with 401: {wrong}"


def test_permission_report_lists_every_route():
    from io import StringIO

    from django.core.management import call_command

    out = StringIO()
    call_command("permission_report", stdout=out)
    text = out.getvalue()
    for name, _method in EXPECTED:
        assert f"`{name}`" in text, name
    assert "| `requests:step-decide` |" in text
    assert "employee, hr, exec" in text
