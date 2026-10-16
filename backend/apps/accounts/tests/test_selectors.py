import uuid
from datetime import UTC, datetime, timedelta

import pytest

from apps.accounts import selectors
from apps.accounts.tests.world import make_user
from apps.core.errors import NotFound

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)


@pytest.fixture
def accounts():
    return {
        "active": make_user("a.active@impactrisks.com", full_name="Alia Active", last_login_at=NOW),
        "awaiting": make_user(
            "b.awaiting@impactrisks.com",
            full_name="Bechir Awaiting",
            must_change_password=True,
            temp_password_expires_at=NOW + timedelta(hours=5),
        ),
        "expired": make_user(
            "c.expired@impactrisks.com",
            full_name="Chiraz Expired",
            must_change_password=True,
            temp_password_expires_at=NOW - timedelta(hours=1),
        ),
        "locked": make_user(
            "d.locked@impactrisks.com",
            full_name="Dali Locked",
            locked_until=NOW + timedelta(minutes=5),
            roles=["hr"],
        ),
        "was_locked": make_user(
            "e.unlocked@impactrisks.com", full_name="Emna Unlocked", locked_until=NOW - timedelta(minutes=5)
        ),
        "disabled": make_user(
            "f.disabled@impactrisks.com",
            full_name="Fares Disabled",
            is_active=False,
            locked_until=NOW + timedelta(minutes=5),
            roles=["sysadmin"],
        ),
    }


def test_the_state_of_an_account(accounts):
    states = {name: selectors.account_state(user, now=NOW) for name, user in accounts.items()}

    assert states == {
        "active": "active",
        "awaiting": "awaiting_first_sign_in",
        "expired": "awaiting_first_sign_in",
        "locked": "locked",
        "was_locked": "active",
        "disabled": "disabled",
    }


@pytest.mark.parametrize(
    ("state", "names"),
    [
        ("active", {"active", "was_locked"}),
        ("awaiting_first_sign_in", {"awaiting", "expired"}),
        ("locked", {"locked"}),
        ("disabled", {"disabled"}),
    ],
)
def test_accounts_can_be_filtered_by_state(accounts, state, names):
    found = set(selectors.accounts(state=state, now=NOW))

    assert found == {accounts[name] for name in names}


def test_the_filter_and_the_state_agree_for_every_account(accounts):
    for user in accounts.values():
        state = selectors.account_state(user, now=NOW)
        assert user in selectors.accounts(state=state, now=NOW)


def test_accounts_can_be_searched_by_name_or_email_and_filtered_by_role(accounts):
    assert list(selectors.accounts(search="chiraz")) == [accounts["expired"]]
    assert list(selectors.accounts(search=" D.LOCKED@ ")) == [accounts["locked"]]
    assert list(selectors.accounts(role="hr")) == [accounts["locked"]]
    assert list(selectors.accounts(role="sysadmin", state="disabled", now=NOW)) == [accounts["disabled"]]
    assert list(selectors.accounts(search="nobody")) == []


def test_accounts_are_listed_by_email(accounts):
    emails = [user.email for user in selectors.accounts()]

    assert emails == sorted(emails)
    assert len(emails) == 6


def test_a_derived_role_is_not_a_filter(accounts):
    with pytest.raises(ValueError):
        selectors.accounts(role="manager")


def test_get_account_finds_by_public_id_or_raises_not_found(accounts):
    user = accounts["active"]

    assert selectors.get_account(user.public_id) == user
    assert selectors.get_account(str(user.public_id)) == user
    with pytest.raises(NotFound):
        selectors.get_account(uuid.uuid4())
    with pytest.raises(NotFound):
        selectors.get_account("not-a-uuid")


def test_accounts_needing_attention(accounts, directory):
    directory.add("emp-9", "Ines Sans Compte", "ines@impactrisks.com")

    report = selectors.accounts_needing_attention(now=NOW)

    assert [row["email"] for row in report["locked"]] == ["d.locked@impactrisks.com"]
    assert [row["email"] for row in report["awaiting_first_sign_in"]] == ["b.awaiting@impactrisks.com"]
    assert [row["email"] for row in report["temp_expired"]] == ["c.expired@impactrisks.com"]
    assert report["employees_without_account"] == [
        {"public_id": "emp-9", "name": "Ines Sans Compte", "email": "ines@impactrisks.com"}
    ]
    assert report["locked"][0] == {
        "public_id": str(accounts["locked"].public_id),
        "name": "Dali Locked",
        "email": "d.locked@impactrisks.com",
    }


def test_only_a_disabled_account_whose_employee_has_not_left_can_be_enabled(accounts, directory):
    user = accounts["active"]
    assert selectors.can_enable(user) is False  # nothing to enable

    user.is_active = False
    assert selectors.can_enable(user) is True

    directory.left.add(user.pk)
    assert selectors.can_enable(user) is False


def test_has_employee_asks_the_directory(accounts, directory):
    user = accounts["active"]
    assert selectors.has_employee(user) is False

    directory.add("emp-1", "Alia Active", user.email)
    directory.link(user_id=user.pk, public_id="emp-1")

    assert selectors.has_employee(user) is True
