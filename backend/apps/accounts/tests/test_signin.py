from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.contrib.auth import SESSION_KEY
from django.contrib.auth.models import AnonymousUser
from django.contrib.sessions.middleware import SessionMiddleware

from apps.accounts import services
from apps.accounts.emails import NOT_AN_ADDRESS
from apps.accounts.services.signin import LAST_ACTIVITY_KEY
from apps.accounts.tests.world import PASSWORD
from apps.audit.models import AuditEvent
from apps.core.errors import DomainError, RateLimited
from apps.core.i18n import translate
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db

START = datetime(2026, 10, 6, 8, 0, tzinfo=UTC)
IP = "192.168.1.20"
OWNER = "employee.a1@impactrisks.com"


def signin(email=OWNER, password=PASSWORD, ip=IP):
    return services.authenticate(email=email, password=password, ip=ip)


def failure(**arguments) -> DomainError:
    with pytest.raises(DomainError) as error:
        signin(**arguments)
    return error.value


# --- Review Focus 1: an imperfect address, or a bad moment ---


@pytest.mark.parametrize(
    "typed",
    ["employee.a1@impactrisks.com", "  Employee.A1@ImpactRisks.COM ", "EMPLOYEE.A1@IMPACTRISKS.COM"],
)
def test_the_address_may_be_typed_in_any_case_and_with_spaces(world, typed):
    assert signin(email=typed) == world.owner_user


@pytest.mark.parametrize(
    "typed",
    [
        "employee.a1@impactrisks.com.evil.com",
        "employee.a1@impactrisk.com",
        "employee.a1@mail.impactrisks.com",
        "employee.a1",
        "",
    ],
)
def test_an_address_outside_the_company_domain_is_refused_with_the_reason(world, typed):
    error = failure(email=typed)

    assert error.code == "auth.domain_not_allowed"
    assert error.field == "email"
    assert error.params == {"domain": "impactrisks.com"}
    assert error.status == 400


def test_a_wrong_password_and_an_unknown_address_get_the_same_answer(world):
    wrong = failure(password="not-the-password")
    unknown = failure(email="nobody@impactrisks.com")

    assert wrong.code == unknown.code == "auth.invalid_credentials"
    assert wrong.params == unknown.params == {}
    assert wrong.field is None and unknown.field is None


def test_a_failed_sign_in_is_audited_with_the_address_and_the_reason(world):
    failure(password="not-the-password")
    failure(email="Nobody@impactrisks.com")
    failure(email="someone@gmail.com")

    by_label = {event.object_label: event for event in AuditEvent.objects.filter(action="auth.login_failed")}
    known = by_label[OWNER]
    assert known.category == "security"
    assert known.actor is None
    assert known.object_id == str(world.owner_user.public_id)
    assert known.ip_address == IP
    assert known.changes == {"reason": "wrong_password"}
    assert by_label["nobody@impactrisks.com"].changes == {"reason": "unknown"}
    assert by_label["nobody@impactrisks.com"].object_id == ""
    assert by_label["someone@gmail.com"].changes == {"reason": "domain"}


def test_the_typed_password_is_never_written_to_the_audit_trail(world):
    failure(password="S3cret-typed-wrong")

    assert "S3cret" not in str(list(AuditEvent.objects.values()))


@pytest.mark.parametrize(
    "typed",
    [
        "Correct-Horse-42!",  # the password, typed in the email box
        "S3cret typed@impactrisks.com",
        "s3cret@@impactrisks.com",
        "P@ssw0rd.2024",
        "S3cret-without-an-at-sign",
    ],
)
def test_text_that_is_not_an_address_is_never_written_to_the_audit_trail(world, typed):
    failure(email=typed, password="wrong")

    event = AuditEvent.objects.get(action="auth.login_failed")
    assert event.object_label == NOT_AN_ADDRESS
    assert event.object_id == ""
    assert typed.lower() not in str(list(AuditEvent.objects.values())).lower()


@pytest.mark.parametrize(
    "typed",
    [
        "employee.a1@impactrisks.com.evil.com",
        "employee.a1@impactrisk.com",
        "employee.a1@mail.impactrisks.com",
        "employee.a1@impactrіsks.com",  # a Cyrillic letter that looks like "i"
    ],
)
def test_a_look_alike_address_is_kept_as_typed_for_the_administrator(world, typed):
    failure(email=typed)

    event = AuditEvent.objects.get(action="auth.login_failed")
    assert event.object_label == typed
    assert event.changes == {"reason": "domain"}


# --- Review Focus 2: the lock-out boundary ---


def test_four_wrong_passwords_then_the_right_one_sign_in_and_reset_the_count(world):
    for _ in range(4):
        assert failure(password="wrong").code == "auth.invalid_credentials"
    world.owner_user.refresh_from_db()
    assert world.owner_user.failed_attempts == 4

    assert signin() == world.owner_user

    world.owner_user.refresh_from_db()
    assert world.owner_user.failed_attempts == 0
    assert world.owner_user.locked_until is None


def test_the_fifth_wrong_password_locks_the_account_for_fifteen_minutes(world):
    with time_machine.travel(START, tick=False):
        for _ in range(4):
            assert failure(password="wrong").code == "auth.invalid_credentials"
        locked = failure(password="wrong")

    assert locked.code == "auth.locked"
    assert locked.params == {"until": START + timedelta(minutes=15)}
    world.owner_user.refresh_from_db()
    assert world.owner_user.locked_until == START + timedelta(minutes=15)
    event = AuditEvent.objects.get(action="auth.locked")
    assert event.object_id == str(world.owner_user.public_id)
    assert event.category == "security"


def test_a_locked_account_stays_locked_even_with_the_right_password(world):
    with time_machine.travel(START, tick=False) as clock:
        for _ in range(5):
            failure(password="wrong")
        clock.shift(timedelta(minutes=14, seconds=59))
        still_locked = failure()

    assert still_locked.code == "auth.locked"
    assert still_locked.params == {"until": START + timedelta(minutes=15)}


def test_the_lock_ends_by_itself(world):
    with time_machine.travel(START, tick=False) as clock:
        for _ in range(5):
            failure(password="wrong")
        clock.shift(timedelta(minutes=15, seconds=1))

        assert signin() == world.owner_user

    world.owner_user.refresh_from_db()
    assert world.owner_user.locked_until is None
    assert world.owner_user.failed_attempts == 0


def test_the_lock_out_numbers_follow_the_settings(world):
    settings_service.set_value(actor=world.sysadmin_user, key="lockout_threshold", value=3)
    settings_service.set_value(actor=world.sysadmin_user, key="lockout_minutes", value=60)

    with time_machine.travel(START, tick=False):
        failure(password="wrong")
        failure(password="wrong")
        locked = failure(password="wrong")

    assert locked.code == "auth.locked"
    assert locked.params == {"until": START + timedelta(minutes=60)}


def test_wrong_attempts_on_one_account_do_not_lock_another(world):
    for _ in range(5):
        failure(password="wrong")

    assert signin(email="employee.a2@impactrisks.com") == world.peer_user


# --- disabled accounts and temporary passwords ---


def test_a_disabled_account_is_told_so_only_with_the_right_password(world):
    world.owner_user.is_active = False
    world.owner_user.save(update_fields=["is_active"])

    assert failure(password="wrong").code == "auth.invalid_credentials"
    assert failure().code == "auth.disabled"


def test_an_expired_temporary_password_says_to_ask_the_administrator(world):
    world.owner_user.must_change_password = True
    world.owner_user.temp_password_expires_at = START - timedelta(minutes=1)
    world.owner_user.save(update_fields=["must_change_password", "temp_password_expires_at"])

    with time_machine.travel(START, tick=False):
        with_right_password = failure()
        with_wrong_password = failure(password="wrong")

    assert with_right_password.code == "auth.temp_password_expired"
    assert with_wrong_password.code == "auth.temp_password_expired"
    world.owner_user.refresh_from_db()
    assert world.owner_user.failed_attempts == 0


def test_a_temporary_password_still_valid_signs_in(world):
    world.owner_user.must_change_password = True
    world.owner_user.temp_password_expires_at = START + timedelta(hours=1)
    world.owner_user.save(update_fields=["must_change_password", "temp_password_expires_at"])

    with time_machine.travel(START, tick=False):
        assert signin() == world.owner_user


def test_an_account_whose_password_was_never_set_cannot_sign_in(world):
    world.owner_user.set_unusable_password()
    world.owner_user.save(update_fields=["password"])

    assert failure().code == "auth.invalid_credentials"


# --- the limit per network address ---


def test_too_many_failures_from_one_address_block_that_address_for_a_while(world):
    with time_machine.travel(START, tick=False) as clock:
        for number in range(20):
            failure(email=f"ghost{number}@impactrisks.com")

        with pytest.raises(RateLimited) as blocked:
            signin()  # even the right password is refused from this address now
        assert blocked.value.code == "auth.rate_limited"
        assert blocked.value.status == 429
        assert blocked.value.params == {"minutes": 15}

        assert signin(ip="192.168.1.21") == world.owner_user

        clock.shift(timedelta(minutes=16))
        assert signin() == world.owner_user


def test_the_address_limit_follows_the_setting(world):
    settings_service.set_value(actor=world.sysadmin_user, key="login_ip_max_attempts", value=5)

    for number in range(5):
        failure(email=f"ghost{number}@impactrisks.com")

    with pytest.raises(RateLimited):
        signin()


def test_without_a_known_address_there_is_no_address_limit(world):
    for number in range(25):
        failure(email=f"ghost{number}@impactrisks.com", ip="")

    assert signin(ip="") == world.owner_user


# --- sessions ---


@pytest.fixture
def http_request(rf):
    request = rf.post("/api/v1/auth/login", REMOTE_ADDR=IP)
    SessionMiddleware(lambda inner: None).process_request(request)
    request.user = AnonymousUser()
    return request


def test_start_session_signs_in_and_remembers_the_previous_sign_in(world, http_request, rf):
    user = world.owner_user
    with time_machine.travel(START, tick=False) as clock:
        services.start_session(http_request, user)
        user.refresh_from_db()
        assert user.last_login_at == START
        assert user.previous_login_at is None

        clock.shift(timedelta(days=1))
        second = rf.post("/api/v1/auth/login")
        SessionMiddleware(lambda inner: None).process_request(second)
        services.start_session(second, user)

    user.refresh_from_db()
    assert user.previous_login_at == START
    assert user.last_login_at == START + timedelta(days=1)
    assert http_request.session[SESSION_KEY] == str(user.pk)
    assert http_request.session[LAST_ACTIVITY_KEY] == START.timestamp()
    assert http_request.user == user
    events = AuditEvent.objects.filter(action="auth.login")
    assert events.count() == 2
    assert all(event.actor == user and event.category == "security" for event in events)


def test_end_session_signs_out_and_is_audited(world, http_request):
    services.start_session(http_request, world.owner_user)

    services.end_session(http_request)

    assert SESSION_KEY not in http_request.session
    assert http_request.user.is_authenticated is False
    event = AuditEvent.objects.get(action="auth.logout")
    assert event.actor == world.owner_user
    assert event.object_id == str(world.owner_user.public_id)


def test_end_session_without_a_signed_in_user_records_nothing(http_request):
    services.end_session(http_request)

    assert not AuditEvent.objects.filter(action="auth.logout").exists()


# --- changing one's own password ---


def test_changing_the_password_needs_the_current_one(world):
    with pytest.raises(DomainError) as error:
        services.change_password(
            user=world.owner_user, current_password="wrong", new_password="Another-Horse-43!"
        )

    assert error.value.code == "auth.wrong_current_password"
    assert error.value.field == "current_password"
    assert world.owner_user.check_password(PASSWORD)


def test_the_new_password_must_respect_the_policy(world):
    with pytest.raises(DomainError) as error:
        services.change_password(user=world.owner_user, current_password=PASSWORD, new_password="short")

    assert error.value.code == "auth.weak_password"
    assert error.value.field == "new_password"


def test_the_new_password_must_differ_from_the_current_one(world):
    with pytest.raises(DomainError) as error:
        services.change_password(user=world.owner_user, current_password=PASSWORD, new_password=PASSWORD)

    assert error.value.code == "auth.weak_password"
    assert error.value.params == {"reasons": translate("auth.same_password")}


def test_changing_the_password_ends_the_temporary_state_and_is_audited(world):
    user = world.owner_user
    user.must_change_password = True
    user.temp_password_expires_at = START
    user.save(update_fields=["must_change_password", "temp_password_expires_at"])

    services.change_password(user=user, current_password=PASSWORD, new_password="Another-Horse-43!")

    user.refresh_from_db()
    assert user.check_password("Another-Horse-43!")
    assert user.must_change_password is False
    assert user.temp_password_expires_at is None
    event = AuditEvent.objects.get(action="auth.password_changed")
    assert event.actor == user
    assert event.category == "security"
    assert "Another-Horse" not in str(event.changes)
