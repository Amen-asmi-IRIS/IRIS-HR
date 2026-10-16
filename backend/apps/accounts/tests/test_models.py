import pytest
from django.conf import settings
from django.db import IntegrityError, transaction

from apps.accounts.models import RoleAssignment, User
from apps.accounts.tests.world import PASSWORD, make_user

pytestmark = pytest.mark.django_db


def test_create_user_normalises_the_email():
    user = User.objects.create_user("  Sami.BenAli@ImpactRisks.COM ", PASSWORD)

    assert user.email == "sami.benali@impactrisks.com"
    assert User.objects.get_by_natural_key(" SAMI.BenAli@impactrisks.com") == user


def test_two_accounts_cannot_share_an_email_whatever_the_case():
    make_user("sami@impactrisks.com")

    with pytest.raises(IntegrityError), transaction.atomic():
        make_user("SAMI@impactrisks.com")


def test_the_database_refuses_an_email_that_is_not_lower_case():
    with pytest.raises(IntegrityError), transaction.atomic():
        User(email="Sami@impactrisks.com", password="x").save()


def test_a_new_account_has_safe_defaults():
    user = make_user()

    assert user.is_active is True
    assert user.must_change_password is False
    assert user.temp_password_expires_at is None
    assert user.failed_attempts == 0
    assert user.locked_until is None
    assert user.last_login_at is None
    assert user.previous_login_at is None
    assert user.password_reset_by is None
    assert user.password_reset_at is None
    assert user.language == settings.DEFAULT_LANGUAGE
    assert user.last_workspace == ""
    assert user.created_at is not None
    assert user.created_by is None
    assert str(user) == user.email


def test_every_account_has_its_own_public_id():
    assert make_user().public_id != make_user().public_id


def test_djangos_own_last_login_column_is_not_used():
    assert "last_login" not in {field.name for field in User._meta.get_fields()}


def test_the_password_is_never_stored_in_clear():
    user = make_user()

    assert PASSWORD not in user.password
    assert user.check_password(PASSWORD) is True
    assert user.check_password("something else") is False


@pytest.mark.real_hasher
def test_passwords_are_hashed_with_argon2():
    assert make_user().password.startswith("argon2")


def test_an_account_created_without_a_password_cannot_sign_in():
    user = User.objects.create_user("nopass@impactrisks.com")

    assert user.has_usable_password() is False


def test_make_user_assigns_roles():
    user = make_user(roles=["hr", "exec"])

    assert set(user.role_assignments.values_list("role", flat=True)) == {"hr", "exec"}


def test_a_role_is_held_once_per_account():
    user = make_user(roles=["hr"])

    with pytest.raises(IntegrityError), transaction.atomic():
        RoleAssignment.objects.create(user=user, role="hr")
