"""Every paginated list takes a whitelisted `ordering` (PRD 9.3)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO

import openpyxl
import pytest
import yaml
from django.conf import settings
from django.urls import reverse

from apps.balances import services as balance_services
from apps.notifications import services as notifications
from apps.organisation import services as organisation_services
from tests.hardening.helpers import give_balance, make_request

LISTS = [
    # (route, kwargs builder, persona attribute, an ordering it must accept)
    ("accounts:account-list", lambda w: {}, "sysadmin_user", "-last_login_at"),
    ("audit:security", lambda w: {}, "sysadmin_user", "at"),
    ("audit:business", lambda w: {}, "hr_user", "action"),
    ("audit:security-export", lambda w: {}, "sysadmin_user", "at"),
    ("notifications:list", lambda w: {}, "owner_user", "created_at"),
    ("organisation:profile-change-list", lambda w: {}, "hr_user", "-created_at"),
    ("organisation:employee-history", lambda w: {"public_id": w.owner.public_id}, "hr_user", "at"),
    ("requests:approval-list", lambda w: {}, "manager_user", "-waiting_since"),
    ("balances:ledger", lambda w: {"employee_public_id": w.owner.public_id}, "owner_user", "date"),
]


def _results(response) -> list:
    assert response.status_code == 200, response.content
    return response.json()["results"]


@pytest.mark.django_db
@pytest.mark.parametrize(("route", "kwargs", "who", "ordering"), LISTS, ids=[row[0] for row in LISTS])
def test_a_list_accepts_its_orderings_and_refuses_any_other(world, client_for, route, kwargs, who, ordering):
    client = client_for(getattr(world, who))
    url = reverse(route, kwargs=kwargs(world))

    assert client.get(url).status_code == 200  # without the parameter, as before
    assert client.get(url, {"ordering": ordering}).status_code == 200

    refused = client.get(url, {"ordering": "password"})
    assert refused.status_code == 400
    body = refused.json()
    assert body["code"] == "core.ordering_invalid"
    assert body["errors"][0]["field"] == "ordering"
    assert ordering in body["detail"]  # the message lists what is allowed


@pytest.mark.django_db
def test_accounts_sort_by_email_name_and_last_sign_in(world, client_for, frozen):
    client = client_for(world.sysadmin_user)
    url = reverse("accounts:account-list")

    emails = [row["email"] for row in _results(client.get(url, {"page_size": 100}))]
    assert emails == sorted(emails)  # the default stays email
    reverse_emails = [
        row["email"] for row in _results(client.get(url, {"ordering": "-email", "page_size": 100}))
    ]
    assert reverse_emails == sorted(emails, reverse=True)
    names = [row["name"] for row in _results(client.get(url, {"ordering": "name", "page_size": 100}))]
    assert names == sorted(names)

    # Someone who signed in sorts before someone who never did, when the newest sign-in is asked first.
    from apps.accounts.models import User

    User.objects.update(last_login_at=None)
    User.objects.filter(pk=world.peer_user.pk).update(last_login_at=datetime(2026, 11, 1, 9, 0, tzinfo=UTC))
    User.objects.filter(pk=world.owner_user.pk).update(last_login_at=datetime(2026, 11, 2, 9, 0, tzinfo=UTC))
    newest = [
        row["email"] for row in _results(client.get(url, {"ordering": "-last_login_at", "page_size": 100}))
    ]
    assert newest[:2] == [world.owner_user.email, world.peer_user.email]
    oldest = [
        row["email"] for row in _results(client.get(url, {"ordering": "last_login_at", "page_size": 100}))
    ]
    assert oldest[-2:] == [world.peer_user.email, world.owner_user.email]


@pytest.mark.django_db
def test_accounts_sort_by_the_employees_current_name(world, client_for):
    client = client_for(world.sysadmin_user)
    url = reverse("accounts:account-list")
    # Amal Employee becomes Zineb Zarrouk: the account keeps the name copied when it was created.
    world.owner.first_name, world.owner.last_name = "Zineb", "Zarrouk"
    world.owner.save(update_fields=["first_name", "last_name"])

    def emails(ordering):
        return [row["email"] for row in _results(client.get(url, {"ordering": ordering, "page_size": 100}))]

    ascending = emails("name")
    assert ascending[-1] == world.owner_user.email
    assert emails("-name")[0] == world.owner_user.email
    assert emails("-name") == ascending[::-1]
    # Sonia Admin has no employee record and sorts under her own name, between Senna RH and Zineb.
    assert ascending[-3:] == [world.hr_user.email, world.sysadmin_user.email, world.owner_user.email]
    names = [row["name"] for row in _results(client.get(url, {"ordering": "name", "page_size": 100}))]
    assert names == sorted(names)
    assert "Zineb Zarrouk" in names


@pytest.mark.django_db
def test_the_logs_sort_by_time_and_the_export_follows(world, client_for, frozen):
    for minutes, user in enumerate([world.owner_user, world.peer_user, world.manager_user]):
        frozen.move_to(datetime(2026, 11, 2, 8, minutes, tzinfo=UTC))
        organisation_services.propose_profile_change(user=user, changes={"phone": f"+216 20 000 00{minutes}"})
    client = client_for(world.hr_user)
    url = reverse("audit:business")

    newest_first = [row["at"] for row in _results(client.get(url))]
    assert newest_first == sorted(newest_first, reverse=True) and len(newest_first) >= 3
    oldest_first = [row["at"] for row in _results(client.get(url, {"ordering": "at"}))]
    assert oldest_first == sorted(newest_first)
    by_action = [row["action"] for row in _results(client.get(url, {"ordering": "action"}))]
    assert by_action == sorted(by_action)

    exported = client.get(reverse("audit:business-export"), {"ordering": "at"})
    body = b"".join(exported.streaming_content) if getattr(exported, "streaming", False) else exported.content
    rows = list(openpyxl.load_workbook(BytesIO(body)).worksheets[0].iter_rows(min_row=2, values_only=True))
    times = [next(cell for cell in row if isinstance(cell, datetime)) for row in rows]  # the "when" column
    assert times == sorted(times) and len(times) >= 3


@pytest.mark.django_db
def test_notifications_and_histories_can_be_read_oldest_first(world, client_for, frozen):
    for minutes in range(3):
        frozen.move_to(datetime(2026, 11, 2, 8, minutes, tzinfo=UTC))
        notifications.notify(
            users=[world.owner_user],
            event="account.password_reset",
            params={"by": "Sonia Admin"},
            dedupe_key=f"test:{minutes}",
        )
    client = client_for(world.owner_user)
    url = reverse("notifications:list")
    default = [row["id"] for row in _results(client.get(url))]
    assert default == sorted(default, reverse=True)  # newest first, as before
    assert [row["id"] for row in _results(client.get(url, {"ordering": "created_at"}))] == sorted(default)


@pytest.mark.django_db
def test_profile_changes_sort_by_date(world, client_for, frozen):
    for minutes, user in enumerate([world.owner_user, world.peer_user]):
        frozen.move_to(datetime(2026, 11, 2, 8, minutes, tzinfo=UTC))
        organisation_services.propose_profile_change(user=user, changes={"phone": f"+216 20 000 01{minutes}"})
    hr = client_for(world.hr_user)
    changes = reverse("organisation:profile-change-list")
    waiting = [row["employee"]["name"] for row in _results(hr.get(changes, {"status": "pending"}))]
    assert waiting == ["Amal Employee", "Bilel Employee"]  # a queue: oldest first
    newest = [
        row["employee"]["name"]
        for row in _results(hr.get(changes, {"status": "pending", "ordering": "-created_at"}))
    ]
    assert newest == list(reversed(waiting))


@pytest.mark.django_db
def test_the_queue_and_the_ledger_keep_their_order_unless_asked(world, client_for, frozen):
    first = make_request(
        world,
        user=world.owner_user,
        employee=world.owner,
        request_type=world.remote,
        start=date(2026, 11, 23),
        end=date(2026, 11, 23),
    )
    frozen.move_to(datetime(2026, 11, 2, 9, 0, tzinfo=UTC))
    second = make_request(
        world,
        user=world.peer_user,
        employee=world.peer,
        request_type=world.remote,
        start=date(2026, 11, 16),
        end=date(2026, 11, 16),
    )
    manager = client_for(world.manager_user)
    url = reverse("requests:approval-list")

    def ids(**query):
        return [
            item["request"]["public_id"] for item in _results(manager.get(url, {"queue": "mine", **query}))
        ]

    assert ids() == [str(first.public_id), str(second.public_id)]  # oldest first
    assert ids(ordering="-waiting_since") == [str(second.public_id), str(first.public_id)]
    assert ids(ordering="start_date") == [str(second.public_id), str(first.public_id)]

    give_balance(world, world.owner, "10")
    balance_services.adjust(
        actor=world.hr_user,
        employee=world.owner,
        amount=Decimal("1"),
        effective_date=date(2026, 11, 2),
        reason="Correction",
    )
    owner = client_for(world.owner_user)
    ledger = reverse("balances:ledger", kwargs={"employee_public_id": world.owner.public_id})
    newest_first = [row["kind"] for row in _results(owner.get(ledger))]
    assert newest_first == ["adjustment", "opening"]
    assert [row["kind"] for row in _results(owner.get(ledger, {"ordering": "date"}))] == [
        "opening",
        "adjustment",
    ]


def test_the_api_description_names_the_parameter():
    schema = yaml.safe_load((settings.BASE_DIR / "openapi.yaml").read_text(encoding="utf-8"))
    for path in (
        "/api/v1/accounts",
        "/api/v1/audit/business",
        "/api/v1/audit/security",
        "/api/v1/notifications",
        "/api/v1/profile-changes",
        "/api/v1/approvals",
        "/api/v1/balances/{employee_public_id}/ledger",
        "/api/v1/employees/{public_id}/history",
        "/api/v1/employees",
        "/api/v1/requests",
    ):
        names = [parameter["name"] for parameter in schema["paths"][path]["get"]["parameters"]]
        assert "ordering" in names, path
