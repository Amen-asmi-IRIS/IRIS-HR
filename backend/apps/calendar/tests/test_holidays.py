import datetime as dt

import pytest

from apps.audit.models import AuditEvent
from apps.calendar import selectors, services
from apps.calendar.models import PublicHoliday
from apps.core.errors import DomainError

pytestmark = pytest.mark.django_db

MAY_DAY = dt.date(2026, 5, 1)


def test_create_holiday_is_audited(world):
    holiday = services.create_holiday(
        actor=world.hr_user,
        date=MAY_DAY,
        name_fr=" Fête du Travail ",
        name_en="Labour Day",
        recurs_yearly=True,
    )
    assert holiday.name_fr == "Fête du Travail"
    assert holiday.recurs_yearly is True
    event = AuditEvent.objects.get(action="holiday.created")
    assert event.actor == world.hr_user
    assert event.object_id == str(holiday.pk)


def test_two_holidays_cannot_share_a_date(world):
    services.create_holiday(actor=world.hr_user, date=MAY_DAY, name_fr="A", name_en="A")
    with pytest.raises(DomainError) as error:
        services.create_holiday(actor=world.hr_user, date=MAY_DAY, name_fr="B", name_en="B")
    assert error.value.code == "calendar.holiday_exists"


def test_update_holiday_changes_the_row_and_refuses_a_taken_date(world):
    first = services.create_holiday(actor=world.hr_user, date=MAY_DAY, name_fr="A", name_en="A")
    services.create_holiday(actor=world.hr_user, date=dt.date(2026, 7, 25), name_fr="B", name_en="B")
    updated = services.update_holiday(
        actor=world.hr_user,
        holiday=first,
        date=dt.date(2026, 5, 2),
        name_fr="A2",
        name_en="A2",
        recurs_yearly=True,
    )
    assert (updated.date, updated.name_en, updated.recurs_yearly) == (dt.date(2026, 5, 2), "A2", True)
    with pytest.raises(DomainError) as error:
        services.update_holiday(
            actor=world.hr_user,
            holiday=first,
            date=dt.date(2026, 7, 25),
            name_fr="A",
            name_en="A",
            recurs_yearly=False,
        )
    assert error.value.code == "calendar.holiday_exists"
    assert AuditEvent.objects.filter(action="holiday.updated").count() == 1


def test_delete_holiday_is_audited(world):
    holiday = services.create_holiday(actor=world.hr_user, date=MAY_DAY, name_fr="A", name_en="A")
    services.delete_holiday(actor=world.hr_user, holiday=holiday)
    assert not PublicHoliday.objects.exists()
    assert AuditEvent.objects.filter(action="holiday.deleted").exists()


def test_copy_takes_only_recurring_holidays_and_skips_existing_dates(world):
    services.create_holiday(
        actor=world.hr_user, date=MAY_DAY, name_fr="Travail", name_en="Labour", recurs_yearly=True
    )
    services.create_holiday(
        actor=world.hr_user,
        date=dt.date(2026, 7, 25),
        name_fr="République",
        name_en="Republic",
        recurs_yearly=True,
    )
    services.create_holiday(actor=world.hr_user, date=dt.date(2026, 3, 20), name_fr="Aïd", name_en="Eid")
    services.create_holiday(
        actor=world.hr_user, date=dt.date(2027, 5, 1), name_fr="Travail", name_en="Labour"
    )

    created = services.copy_recurring_holidays(actor=world.hr_user, from_year=2026, to_year=2027)

    assert [h.date for h in created] == [dt.date(2027, 7, 25)]
    assert created[0].recurs_yearly is True
    assert PublicHoliday.objects.filter(date__year=2027).count() == 2


def test_copy_run_twice_adds_nothing_the_second_time(world):
    services.create_holiday(
        actor=world.hr_user, date=MAY_DAY, name_fr="Travail", name_en="Labour", recurs_yearly=True
    )
    services.copy_recurring_holidays(actor=world.hr_user, from_year=2026, to_year=2027)
    assert services.copy_recurring_holidays(actor=world.hr_user, from_year=2026, to_year=2027) == []


def test_copy_refuses_a_target_year_that_is_not_later(world):
    with pytest.raises(DomainError) as error:
        services.copy_recurring_holidays(actor=world.hr_user, from_year=2026, to_year=2026)
    assert error.value.code == "calendar.year_invalid"


def test_selectors_return_holidays_in_date_order(world):
    services.create_holiday(actor=world.hr_user, date=dt.date(2026, 7, 25), name_fr="B", name_en="B")
    services.create_holiday(actor=world.hr_user, date=MAY_DAY, name_fr="A", name_en="A")
    services.create_holiday(actor=world.hr_user, date=dt.date(2027, 1, 1), name_fr="C", name_en="C")
    assert [h.name_en for h in selectors.holidays_of_year(2026)] == ["A", "B"]
    assert [h.name_en for h in selectors.holidays_between(dt.date(2026, 7, 1), dt.date(2027, 1, 1))] == [
        "B",
        "C",
    ]
