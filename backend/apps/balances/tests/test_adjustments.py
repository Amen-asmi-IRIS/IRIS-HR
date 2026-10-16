from datetime import date
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.models import RoleAssignment
from apps.accounts.roles import Role, users_with_role
from apps.audit.models import AuditEvent
from apps.balances import selectors, services
from apps.balances.models import LedgerEntry, LedgerKind
from apps.core.errors import Conflict, DomainError
from apps.core.i18n import translate
from apps.notifications import services as notifications
from apps.notifications.models import Notification


def opening(world, employee=None, amount="4", reason="Balance carried over from the 2025 file"):
    return services.post_opening(
        actor=world.hr_user,
        employee=employee or world.owner,
        amount=Decimal(amount),
        effective_date=date(2025, 12, 31),
        reason=reason,
    )


def adjustment(world, employee=None, amount="1.5", reason="Two half days recorded twice"):
    return services.adjust(
        actor=world.hr_user,
        employee=employee or world.owner,
        amount=Decimal(amount),
        effective_date=date(2026, 7, 15),
        reason=reason,
    )


def test_hr_records_an_opening_balance(world):
    entry = opening(world)

    assert (entry.kind, entry.amount, entry.effective_date) == (
        LedgerKind.OPENING,
        Decimal("4"),
        date(2025, 12, 31),
    )
    assert entry.reason == "Balance carried over from the 2025 file"
    assert entry.created_by == world.hr_user
    assert selectors.balance_on(world.owner.id, date(2025, 12, 31)) == Decimal("4")
    event = AuditEvent.objects.get(action="ledger.opening_posted")
    assert (event.object_type, event.object_id, event.actor) == ("ledgerentry", str(entry.pk), world.hr_user)
    assert event.changes["amount"] == {"before": None, "after": "4"}
    assert event.changes["employee"] == {"before": None, "after": str(world.owner.public_id)}


def test_a_second_opening_balance_is_refused(world):
    opening(world)

    with pytest.raises(Conflict) as refused:
        opening(world, amount="6")

    assert refused.value.code == "balances.opening_exists"
    assert LedgerEntry.objects.filter(kind=LedgerKind.OPENING).count() == 1


def test_an_opening_balance_may_be_zero_or_negative(world):
    opening(world, employee=world.owner, amount="0")
    opening(world, employee=world.peer, amount="-1.5")

    assert selectors.balance_on(world.owner.id, date(2026, 1, 1)) == Decimal("0")
    assert selectors.balance_on(world.peer.id, date(2026, 1, 1)) == Decimal("-1.5")


def test_an_opening_balance_is_stated_as_of_the_day_before_credits_start(world, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))

    for refused_on in (date(2026, 1, 1), date(2026, 3, 15)):
        with pytest.raises(DomainError) as refused:
            services.post_opening(
                actor=world.hr_user,
                employee=world.owner,
                amount=Decimal("4"),
                effective_date=refused_on,
                reason="Balance carried over from the 2025 file",
            )
        assert refused.value.code == "balances.opening_after_start"
        assert refused.value.problems[0].field == "effective_date"
        assert refused.value.params == {"latest": date(2025, 12, 31)}
    assert LedgerEntry.objects.count() == 0

    # the day before, or any earlier date, is accepted
    assert opening(world).effective_date == date(2025, 12, 31)
    assert services.post_opening(
        actor=world.hr_user,
        employee=world.peer,
        amount=Decimal("2"),
        effective_date=date(2025, 6, 30),
        reason="Balance carried over from the 2025 file",
    ).effective_date == date(2025, 6, 30)


def test_without_a_start_date_an_opening_balance_may_carry_any_date(world, ledger_settings):
    ledger_settings(start=None)

    entry = services.post_opening(
        actor=world.hr_user,
        employee=world.owner,
        amount=Decimal("4"),
        effective_date=date(2026, 10, 13),
        reason="Balance carried over from the 2025 file",
    )

    assert entry.effective_date == date(2026, 10, 13)
    assert services.opening_date() is None


def test_someone_hired_once_credits_started_is_offered_no_opening_balance(world, ledger_settings):
    """Master D50: their monthly credits are their balance; days brought from elsewhere are an adjustment."""
    ledger_settings(start=date(2026, 7, 1))
    world.peer.hire_date = date(2026, 7, 1)
    world.peer.save(update_fields=["hire_date"])

    with pytest.raises(Conflict) as refused:
        services.post_opening(
            actor=world.hr_user,
            employee=world.peer,
            amount=Decimal("3"),
            effective_date=date(2026, 6, 30),
            reason="Days brought from the previous employer",
        )

    assert refused.value.code == "balances.opening_not_offered"
    assert LedgerEntry.objects.count() == 0
    assert selectors.can_enter_opening(world.peer) is False
    assert (
        services.adjust(
            actor=world.hr_user,
            employee=world.peer,
            amount=Decimal("3"),
            effective_date=date(2026, 7, 1),
            reason="Days brought from the previous employer",
        ).kind
        == LedgerKind.ADJUSTMENT
    )


def test_an_opening_balance_is_offered_to_someone_hired_before_credits_start_until_it_is_entered(
    world, ledger_settings
):
    ledger_settings(start=date(2026, 7, 1))
    world.owner.hire_date = date(2026, 6, 30)
    world.owner.save(update_fields=["hire_date"])
    assert selectors.can_enter_opening(world.owner) is True

    services.post_opening(
        actor=world.hr_user,
        employee=world.owner,
        amount=Decimal("1"),
        effective_date=date(2026, 6, 30),
        reason="Balance carried over from the 2025 file",
    )

    assert selectors.can_enter_opening(world.owner) is False


def test_while_credits_have_no_start_date_an_opening_balance_is_offered_to_everyone(world, ledger_settings):
    ledger_settings(start=None)
    world.peer.hire_date = date(2026, 10, 1)
    world.peer.save(update_fields=["hire_date"])

    assert selectors.can_enter_opening(world.peer) is True
    assert selectors.can_enter_opening(world.owner) is True


def test_an_opening_balance_does_not_notify(world):
    opening(world)

    assert Notification.objects.filter(event_code="balance.adjusted").count() == 0


def test_hr_adds_days_with_a_reason(world):
    opening(world)

    entry = adjustment(world)

    assert (entry.kind, entry.amount, entry.effective_date) == (
        LedgerKind.ADJUSTMENT,
        Decimal("1.5"),
        date(2026, 7, 15),
    )
    assert selectors.balance_on(world.owner.id, date(2026, 7, 14)) == Decimal("4")
    assert selectors.balance_on(world.owner.id, date(2026, 7, 15)) == Decimal("5.5")
    event = AuditEvent.objects.get(action="ledger.adjusted")
    assert (event.object_id, event.actor) == (str(entry.pk), world.hr_user)
    assert event.changes["reason"] == {"before": None, "after": "Two half days recorded twice"}


def test_hr_can_remove_more_days_than_the_balance_holds(world):
    opening(world, amount="1")

    adjustment(world, amount="-3", reason="Leave taken in 2025 and never recorded")

    assert selectors.balance_on(world.owner.id, date(2026, 7, 15)) == Decimal("-2")


@pytest.mark.parametrize("post", [opening, adjustment])
def test_a_reason_is_mandatory(world, post):
    with pytest.raises(DomainError) as refused:
        post(world, reason="")

    assert refused.value.code == "balances.reason_required"
    assert refused.value.problems[0].field == "reason"
    assert LedgerEntry.objects.count() == 0


@pytest.mark.parametrize("post", [opening, adjustment])
def test_a_reason_of_spaces_is_refused(world, post):
    with pytest.raises(DomainError) as refused:
        post(world, reason="   \n")

    assert refused.value.code == "balances.reason_required"
    assert LedgerEntry.objects.count() == 0


def test_an_adjustment_of_zero_is_refused(world):
    with pytest.raises(DomainError) as refused:
        adjustment(world, amount="0")

    assert refused.value.code == "balances.zero_amount"
    assert refused.value.problems[0].field == "amount"
    assert LedgerEntry.objects.count() == 0


def test_the_employee_is_notified_of_an_adjustment(world):
    adjustment(world)

    notification = Notification.objects.get(user=world.owner_user, event_code="balance.adjusted")
    assert notification.parameters == {"amount": "+1.5", "reason": "Two half days recorded twice"}
    assert (notification.target_type, notification.target_public_id) == (
        "balance",
        str(world.owner.public_id),
    )


@pytest.mark.parametrize(
    ("amount", "fr", "en"),
    [
        ("0.5", "+0,5 jour", "+0.5 days"),
        ("1", "+1 jour", "+1 day"),
        ("1.5", "+1,5 jour", "+1.5 days"),
        ("-2", "-2 jours", "-2 days"),
        ("-0.5", "-0,5 jour", "-0.5 days"),
    ],
)
def test_the_adjustment_is_written_for_the_reader_in_their_language(world, amount, fr, en):
    adjustment(world, amount=amount, reason="Correction")

    notification = Notification.objects.get(user=world.owner_user, event_code="balance.adjusted")
    assert notifications.render(notification, "fr")["body"] == (
        f"Les RH ont ajusté votre solde de congés annuels de {fr}. Motif : Correction"
    )
    assert notifications.render(notification, "en")["body"] == (
        f"HR adjusted your annual leave balance by {en}. Reason: Correction"
    )


def test_an_employee_without_an_account_is_adjusted_without_notification(world):
    world.peer.user = None
    world.peer.save(update_fields=["user"])

    entry = adjustment(world, employee=world.peer)

    assert entry.pk is not None
    assert Notification.objects.filter(event_code="balance.adjusted").count() == 0


def test_the_employee_is_locked_before_the_line_is_written(world):
    with CaptureQueriesContext(connection) as queries:
        adjustment(world)

    statements = [query["sql"] for query in queries.captured_queries]
    lock = next(
        i for i, sql in enumerate(statements) if "FOR UPDATE" in sql and "organisation_employee" in sql
    )
    write = next(
        i for i, sql in enumerate(statements) if sql.startswith("INSERT") and "balances_ledgerentry" in sql
    )
    assert lock < write


@pytest.mark.parametrize(
    ("amount", "expected"),
    [("1.50", "+1.5"), ("-2.00", "-2"), ("10", "+10"), ("-0.5", "-0.5")],
)
def test_amounts_are_written_with_their_sign_and_without_padding(amount, expected):
    assert services.signed_days(Decimal(amount)) == expected


def test_the_texts_exist_in_both_languages():
    for code in (
        "balances.reason_required",
        "balances.zero_amount",
        "balances.opening_exists",
        "balances.opening_after_start",
        "balances.opening_not_offered",
    ):
        assert translate(code, "fr") != translate(code, "en")

    body = translate("notification.balance.adjusted.body", "fr", amount="+1.5", reason="Correction")
    assert "+1,5 jour" in body
    assert "Correction" in body
    assert translate("notification.balance.adjusted.title", "en") == "Your leave balance was adjusted"


def own_changes():
    return Notification.objects.filter(event_code__in=["balance.own_adjustment", "balance.own_opening"])


def test_an_hr_holder_adjusting_their_own_balance_tells_each_executive_once(world):
    """Master D49: allowed, since IRIS has one HR holder, and every executive is told what and why."""
    executives = list(users_with_role(Role.EXEC))
    assert executives

    services.adjust(
        actor=world.hr_user,
        employee=world.hr,
        amount=Decimal("1.5"),
        effective_date=date(2026, 7, 15),
        reason="Two half days recorded twice",
    )

    assert sorted(n.user_id for n in own_changes()) == sorted(user.pk for user in executives)
    notification = own_changes().get(user=world.exec_user)
    assert notification.event_code == "balance.own_adjustment"
    # who, how many days, from when and why: nothing else is carried
    assert notification.parameters == {
        "employee": "Senna RH",
        "amount": "+1.5",
        "date": "15/07/2026",
        "reason": "Two half days recorded twice",
    }
    assert notifications.render(notification, "fr") == {
        "title": "Un membre des RH a ajusté son propre solde",
        "body": "Senna RH a ajusté son propre solde de congés annuels de +1,5 jour, avec effet au 15/07/2026. "
        "Motif : Two half days recorded twice",
        "link": f"/overview/people/{world.hr.public_id}",
    }
    assert notifications.render(notification, "en")["body"] == (
        "Senna RH adjusted their own annual leave balance by +1.5 days, effective 15/07/2026. "
        "Reason: Two half days recorded twice"
    )


def test_an_hr_holder_entering_their_own_opening_balance_tells_each_executive_once(world):
    services.post_opening(
        actor=world.hr_user,
        employee=world.hr,
        amount=Decimal("12"),
        effective_date=date(2025, 12, 31),
        reason="Balance carried over from the 2025 file",
    )

    notification = own_changes().get(user=world.exec_user)
    assert own_changes().count() == users_with_role(Role.EXEC).count()
    assert notifications.render(notification, "fr")["body"] == (
        "Senna RH a saisi son propre solde d'ouverture : 12 jours au 31/12/2025. "
        "Motif : Balance carried over from the 2025 file"
    )
    assert notifications.render(notification, "en")["body"] == (
        "Senna RH recorded their own opening balance: 12 days as of 31/12/2025. "
        "Reason: Balance carried over from the 2025 file"
    )


def test_hr_changing_someone_elses_balance_tells_no_executive(world):
    adjustment(world)
    opening(world, employee=world.peer)

    assert own_changes().count() == 0
    assert Notification.objects.filter(user=world.exec_user).count() == 0


def test_an_hr_holder_who_is_also_an_executive_is_not_told_of_their_own_change(world):
    RoleAssignment.objects.create(user=world.hr_user, role=Role.EXEC.value)

    services.adjust(
        actor=world.hr_user,
        employee=world.hr,
        amount=Decimal("-1"),
        effective_date=date(2026, 7, 15),
        reason="A day of 2025 recorded twice",
    )

    assert not own_changes().filter(user=world.hr_user).exists()
    assert own_changes().filter(user=world.exec_user).count() == 1
