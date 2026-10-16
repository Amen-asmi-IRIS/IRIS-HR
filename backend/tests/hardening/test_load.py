"""The load builder produces a company the API can serve."""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from apps.organisation.models import Employee
from apps.requests.models import Request, RequestStatus
from tests.hardening import load

User = get_user_model()


@pytest.mark.django_db
def test_build_creates_people_accounts_and_approved_history(world):
    counts = load.build(employees=6, months=2)

    assert counts["employees"] == 6 + 6  # the six asked for, plus HR, the CEO and four managers
    assert Employee.objects.filter(employee_number__startswith="L").count() == 12
    assert User.objects.filter(email__startswith="load.").count() == 12
    loaded = Request.objects.filter(employee__employee_number__startswith="L")
    assert counts["requests"] == loaded.count() >= 6 * 2 * 3
    assert set(loaded.values_list("status", flat=True)) == {RequestStatus.APPROVED}

    client = APIClient()
    signed_in = client.post(
        reverse("accounts:login"),
        {"email": "load.e001@impactrisks.com", "password": load.PASSWORD},
        format="json",
    )
    assert signed_in.status_code == 200 and signed_in.json()["must_change_password"] is False
    assert client.get(reverse("requests:request-list"), {"scope": "mine"}).json()["count"] >= 6


@pytest.mark.django_db
def test_build_twice_changes_nothing(world):
    first = load.build(employees=6, months=1)
    second = load.build(employees=6, months=1)
    assert second == first


def test_build_refuses_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    with pytest.raises(RuntimeError, match="production"):
        load.build(employees=1, months=1)
