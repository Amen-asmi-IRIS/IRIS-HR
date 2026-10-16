"""Calls every endpoint as every persona (PRD section 10). A new endpoint without a case fails the build."""

from importlib import import_module
from urllib.parse import urlencode

import pytest
from django.urls import URLPattern, URLResolver, reverse
from rest_framework.test import APIClient

from tests.matrix import Case, P, missing_cases, unknown_cases, verdict

# One module per app. A plan that adds an app appends its line here.
MATRIX_MODULES = [
    "apps.core.tests.matrix",
    "apps.accounts.tests.matrix",
    "apps.audit.tests.matrix",
    "apps.settings.tests.matrix",
    "apps.notifications.tests.matrix",
    "apps.files.tests.matrix",
    "apps.organisation.tests.matrix",
    "apps.calendar.tests.matrix",
    "apps.requests.tests.matrix",
    "apps.balances.tests.matrix",
    "apps.reports.tests.matrix",
    "tests.hardening.matrix_reach",
]


def all_cases() -> list[Case]:
    cases: list[Case] = []
    for path in MATRIX_MODULES:
        cases.extend(import_module(path).CASES)
    return cases


def api_views() -> list[tuple[str | None, type | None]]:
    """(route name, view class) for every route under /api/v1/."""
    found: list[tuple[str | None, type | None]] = []

    def walk(patterns, prefix: str) -> None:
        for entry in patterns:
            if isinstance(entry, URLResolver):
                walk(entry.url_patterns, f"{prefix}{entry.namespace}:" if entry.namespace else prefix)
            elif isinstance(entry, URLPattern):
                view_class = getattr(entry.callback, "cls", None) or getattr(
                    entry.callback, "view_class", None
                )
                found.append((f"{prefix}{entry.name}" if entry.name else None, view_class))

    walk(import_module("config.api_urls").urlpatterns, "")
    return found


def declared_endpoints() -> set[tuple[str, str]]:
    return {
        (name, method)
        for name, view_class in api_views()
        if name is not None and view_class is not None
        for method in getattr(view_class, "access", {})
    }


CASES = all_cases()


def test_every_route_has_a_name_and_a_view_that_declares_its_access():
    problems = []
    for name, view_class in api_views():
        if name is None:
            problems.append(f"a route served by {view_class} has no name")
        elif view_class is None:
            problems.append(f"{name}: not a class-based API view")
        elif not isinstance(getattr(view_class, "access", None), dict):
            problems.append(f"{name}: {view_class.__name__} declares no access")
        else:
            served = {method.upper() for method in view_class.http_method_names}
            if served != set(view_class.access):
                problems.append(
                    f"{name}: http_method_names {sorted(served)} and access {sorted(view_class.access)} differ"
                )

    assert problems == []


def test_every_endpoint_has_a_case():
    missing = missing_cases(declared_endpoints(), CASES)

    assert missing == [], "Add a Case for each of these to the app's tests/matrix.py"


def test_every_case_names_an_existing_endpoint():
    assert unknown_cases(declared_endpoints(), CASES) == []


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("case", "persona"),
    [(case, persona) for case in CASES for persona in P],
    ids=[f"{case.id} as {persona.value}" for case in CASES for persona in P],
)
def test_matrix(case: Case, persona: P, world):
    client = APIClient()
    user = world.user_for(persona)
    if user is not None:
        client.force_login(user)

    url = reverse(case.route, kwargs=case.kwargs(world))
    query = case.query(world)
    if case.method == "GET":
        response = client.get(url, query)
    else:
        if query:
            url = f"{url}?{urlencode(query)}"
        response = getattr(client, case.method.lower())(url, data=case.body(world), format=case.format)

    problem = verdict(case, persona, response.status_code)
    assert problem is None, problem
