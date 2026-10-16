import uuid
from datetime import date, timedelta

import pytest
import time_machine
from django.urls import reverse

from apps.balances.models import LedgerEntry, LedgerKind
from apps.balances.tests.world import at, give_credit, give_opening, make_entry
from apps.organisation import selectors as organisation_selectors
from tests.matrix import P

pytestmark = pytest.mark.usefixtures("reservations")


def url(name: str, employee) -> str:
    return reverse(f"balances:{name}", kwargs={"employee_public_id": employee.public_id})


ADJUSTMENT = {
    "kind": "adjustment",
    "amount": "-1.5",
    "effective_date": "2026-07-15",
    "reason": "Two half days recorded twice",
}


@time_machine.travel(at(2026, 10, 5), tick=False)
def test_an_employee_reads_their_own_balance(cast, client_for, ledger_settings, reservations):
    ledger_settings(start=date(2026, 1, 1))
    owner = cast.owner
    give_opening(owner, "4", date(2025, 12, 31))
    make_entry(owner, LedgerKind.TAKEN, "-3", date(2026, 12, 21), request_id=1)
    reservations(owner, {date(2026, 11, 2): "1"})

    response = client_for(cast.owner_user).get(url("figures", owner))

    assert response.status_code == 200
    assert response.json() == {
        "employee": {"public_id": str(owner.public_id), "name": organisation_selectors.full_name(owner)},
        "current": "4.00",
        "pending": "1.00",
        "approved_upcoming": "3.00",
        "next_credit_amount": "2.50",
        "next_credit_date": "2026-10-31",
        "has_opening": True,
        "opening_date": "2025-12-31",
        "can_enter_opening": False,
        "as_of": None,
    }


def test_the_opening_date_is_the_day_before_credits_start_and_empty_without_them(
    cast, client_for, ledger_settings
):
    client = client_for(cast.hr_user)

    ledger_settings(start=date(2026, 7, 1))
    assert client.get(url("figures", cast.owner)).json()["opening_date"] == "2026-06-30"

    ledger_settings(start=None)
    assert client.get(url("figures", cast.owner)).json()["opening_date"] is None


@time_machine.travel(at(2026, 10, 5), tick=False)
def test_the_balance_on_a_future_date_is_marked_as_projected(cast, client_for, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))

    response = client_for(cast.owner_user).get(url("figures", cast.owner), {"on": "2026-12-15"})

    assert response.status_code == 200
    assert response.json()["as_of"] == {"date": "2026-12-15", "balance": "6.00", "projected": True}


@time_machine.travel(at(2026, 10, 5), tick=False)
def test_the_balance_on_a_past_date_is_the_posted_balance(cast, client_for, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    give_opening(cast.owner, "4", date(2025, 12, 31))
    give_credit(cast.owner, 2026, 1)

    response = client_for(cast.owner_user).get(url("figures", cast.owner), {"on": "2026-01-15"})

    assert response.json()["as_of"] == {"date": "2026-01-15", "balance": "4.00", "projected": False}


def test_a_date_that_is_not_a_date_is_refused_next_to_the_field(cast, client_for, ledger_settings):
    ledger_settings()

    response = client_for(cast.owner_user).get(url("figures", cast.owner), {"on": "tomorrow"})

    assert response.status_code == 400
    assert response.json()["errors"][0]["field"] == "on"


def test_a_date_too_far_ahead_is_refused(cast, client_for, ledger_settings):
    ledger_settings()

    response = client_for(cast.owner_user).get(url("figures", cast.owner), {"on": "9999-12-31"})

    assert response.status_code == 400
    assert response.json()["code"] == "balances.date_out_of_range"
    assert response.json()["errors"][0]["field"] == "on"


@pytest.mark.parametrize(
    ("persona", "status"),
    [
        (P.OWNER, 200),
        (P.MANAGER, 200),
        (P.HR, 200),
        (P.EXEC, 200),
        (P.PEER, 404),
        (P.OTHER_MANAGER, 404),
        (P.OUTSIDER, 404),
        (P.SYSADMIN, 403),
    ],
)
def test_who_may_read_a_balance(cast, client_for, ledger_settings, persona, status):
    ledger_settings()
    client = client_for(cast.user_for(persona))

    assert client.get(url("figures", cast.owner)).status_code == status
    assert client.get(url("ledger", cast.owner)).status_code == status


def test_an_anonymous_call_is_sent_to_sign_in(cast, anon_client):
    assert anon_client.get(url("figures", cast.owner)).status_code == 401
    assert anon_client.get(url("ledger", cast.owner)).status_code == 401
    assert anon_client.post(url("adjustments", cast.owner), ADJUSTMENT, format="json").status_code == 401


def test_the_ledger_is_paginated_newest_first_with_the_balance_after_each_line(cast, client_for):
    owner = cast.owner
    give_opening(owner, "4", date(2025, 12, 31))
    give_credit(owner, 2026, 1)
    make_entry(
        owner, LedgerKind.ADJUSTMENT, "-1", date(2026, 2, 9), reason="Correction", created_by=cast.hr_user
    )

    response = client_for(cast.owner_user).get(url("ledger", owner))

    body = response.json()
    assert response.status_code == 200
    assert (body["count"], body["next"], body["previous"]) == (3, None, None)
    assert [(line["kind"], line["amount"], line["balance_after"]) for line in body["results"]] == [
        ("adjustment", "-1.00", "5.50"),
        ("credit", "2.50", "6.50"),
        ("opening", "4.00", "4.00"),
    ]
    assert set(body["results"][0]) == {
        "id",
        "kind",
        "amount",
        "effective_date",
        "period",
        "reason",
        "request_public_id",
        "created_by",
        "created_at",
        "balance_after",
    }
    assert body["results"][0]["reason"] == "Correction"
    assert body["results"][1]["period"] == "2026-01"
    assert body["results"][1]["created_by"] is None


def test_the_ledger_pages(cast, client_for):
    for offset in range(30):
        make_entry(
            cast.owner, LedgerKind.ADJUSTMENT, "1", date(2026, 1, 1) + timedelta(days=offset), reason="Line"
        )
    client = client_for(cast.owner_user)

    first = client.get(url("ledger", cast.owner)).json()
    second = client.get(url("ledger", cast.owner), {"page": 2}).json()

    assert first["count"] == 30
    assert len(first["results"]) == 25
    assert len(second["results"]) == 5
    assert first["results"][0]["balance_after"] == "30.00"
    assert second["results"][-1]["balance_after"] == "1.00"


def test_hr_posts_an_adjustment(cast, client_for):
    give_opening(cast.owner, "4", date(2025, 12, 31))

    response = client_for(cast.hr_user).post(url("adjustments", cast.owner), ADJUSTMENT, format="json")

    assert response.status_code == 201
    body = response.json()
    assert (body["kind"], body["amount"], body["balance_after"]) == ("adjustment", "-1.50", "2.50")
    entry = LedgerEntry.objects.get(pk=body["id"])
    assert (entry.employee, entry.created_by, entry.effective_date) == (
        cast.owner,
        cast.hr_user,
        date(2026, 7, 15),
    )


def test_hr_posts_the_opening_balance_once(cast, client_for):
    client = client_for(cast.hr_user)
    opening = {"kind": "opening", "amount": "12", "effective_date": "2025-12-31", "reason": "Carried over"}

    first = client.post(url("adjustments", cast.owner), opening, format="json")
    second = client.post(url("adjustments", cast.owner), opening, format="json")

    assert first.status_code == 201
    assert first.json()["kind"] == "opening"
    assert second.status_code == 409
    assert second.json()["code"] == "balances.opening_exists"


def test_the_representation_says_whether_an_opening_balance_can_be_entered(cast, client_for, ledger_settings):
    ledger_settings(start=date(2026, 7, 1))
    cast.peer.hire_date = date(2026, 8, 17)
    cast.peer.save(update_fields=["hire_date"])
    client = client_for(cast.hr_user)

    assert client.get(url("figures", cast.owner)).json()["can_enter_opening"] is True
    assert client.get(url("figures", cast.peer)).json()["can_enter_opening"] is False
    refused = client.post(
        url("adjustments", cast.peer),
        {"kind": "opening", "amount": "2", "effective_date": "2026-06-30", "reason": "Previous employer"},
        format="json",
    )
    assert (refused.status_code, refused.json()["code"]) == (409, "balances.opening_not_offered")

    give_opening(cast.owner, "4", date(2026, 6, 30))
    assert client.get(url("figures", cast.owner)).json()["can_enter_opening"] is False


def test_an_opening_balance_dated_once_credits_have_started_is_refused_next_to_the_date(
    cast, client_for, ledger_settings
):
    ledger_settings(start=date(2026, 7, 1))
    client = client_for(cast.hr_user)
    opening = {"kind": "opening", "amount": "12", "effective_date": "2026-07-01", "reason": "Carried over"}

    refused = client.post(url("adjustments", cast.owner), opening, format="json")
    accepted = client.post(
        url("adjustments", cast.owner), {**opening, "effective_date": "2026-06-30"}, format="json"
    )

    assert refused.status_code == 400
    assert refused.json()["code"] == "balances.opening_after_start"
    assert refused.json()["errors"][0]["field"] == "effective_date"
    assert "30/06/2026" in refused.json()["errors"][0]["detail"]
    assert accepted.status_code == 201
    assert LedgerEntry.objects.get(kind=LedgerKind.OPENING).effective_date == date(2026, 6, 30)


def test_an_adjustment_without_a_reason_is_refused_next_to_the_field(cast, client_for):
    response = client_for(cast.hr_user).post(
        url("adjustments", cast.owner), {**ADJUSTMENT, "reason": "   "}, format="json"
    )

    assert response.status_code == 400
    assert response.json()["code"] == "balances.reason_required"
    assert response.json()["errors"][0]["field"] == "reason"
    assert LedgerEntry.objects.count() == 0


def test_an_adjustment_of_zero_is_refused(cast, client_for):
    response = client_for(cast.hr_user).post(
        url("adjustments", cast.owner), {**ADJUSTMENT, "amount": "0"}, format="json"
    )

    assert response.status_code == 400
    assert response.json()["code"] == "balances.zero_amount"
    assert response.json()["errors"][0]["field"] == "amount"


def test_an_unknown_kind_is_refused(cast, client_for):
    response = client_for(cast.hr_user).post(
        url("adjustments", cast.owner), {**ADJUSTMENT, "kind": "credit"}, format="json"
    )

    assert response.status_code == 400
    assert response.json()["errors"][0]["field"] == "kind"
    assert LedgerEntry.objects.count() == 0


@pytest.mark.parametrize("persona", [P.OWNER, P.MANAGER, P.EXEC, P.SYSADMIN])
def test_only_hr_adjusts(cast, client_for, persona):
    response = client_for(cast.user_for(persona)).post(
        url("adjustments", cast.owner), ADJUSTMENT, format="json"
    )

    assert response.status_code == 403
    assert LedgerEntry.objects.count() == 0


def test_an_unknown_employee_is_not_found(cast, client_for):
    missing = reverse("balances:figures", kwargs={"employee_public_id": uuid.uuid4()})

    assert client_for(cast.hr_user).get(missing).status_code == 404
