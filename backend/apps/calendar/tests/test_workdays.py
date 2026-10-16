import datetime as dt
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from apps.calendar import workdays
from apps.calendar.models import PublicHoliday
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db

TUNIS = ZoneInfo("Africa/Tunis")
MON = dt.date(2026, 11, 2)
TUE = dt.date(2026, 11, 3)
WED = dt.date(2026, 11, 4)
THU = dt.date(2026, 11, 5)
FRI = dt.date(2026, 11, 6)
SAT = dt.date(2026, 11, 7)
SUN = dt.date(2026, 11, 8)
NEXT_MON = dt.date(2026, 11, 9)


def holiday(day: dt.date) -> PublicHoliday:
    return PublicHoliday.objects.create(date=day, name_fr="Férié", name_en="Holiday")


def test_weekends_and_holidays_are_not_working_days():
    holiday(WED)
    assert workdays.is_working_day(TUE) is True
    assert workdays.is_working_day(WED) is False
    assert workdays.is_working_day(SAT) is False
    assert workdays.is_working_day(SUN) is False


def test_working_days_are_inclusive_and_skip_weekend_and_holiday():
    holiday(WED)
    assert workdays.working_days(MON, NEXT_MON) == [MON, TUE, THU, FRI, NEXT_MON]


def test_working_days_of_a_reversed_range_is_empty():
    assert workdays.working_days(FRI, MON) == []


def test_day_portions_take_half_a_day_off_each_flagged_end():
    portions = workdays.day_portions(MON, WED, starts_at_midday=True, ends_at_midday=True)
    assert portions == {MON: Decimal("0.5"), TUE: Decimal("1"), WED: Decimal("0.5")}


def test_day_portions_of_a_single_morning():
    assert workdays.day_portions(MON, MON, starts_at_midday=False, ends_at_midday=True) == {
        MON: Decimal("0.5")
    }


def test_day_portions_ignore_a_flag_on_a_non_working_end():
    portions = workdays.day_portions(FRI, SAT, starts_at_midday=False, ends_at_midday=True)
    assert portions == {FRI: Decimal("1")}


def test_skipped_days_say_why():
    holiday(WED)
    assert workdays.skipped_days(WED, SUN) == [(WED, "holiday"), (SAT, "weekend"), (SUN, "weekend")]


def test_add_working_days_jumps_the_weekend():
    assert workdays.add_working_days(THU, 2) == NEXT_MON
    assert workdays.add_working_days(THU, 0) == THU


def test_add_working_days_refuses_a_negative_count():
    with pytest.raises(ValueError):
        workdays.add_working_days(THU, -1)


def test_working_days_between_counts_whole_working_days():
    monday_ten = dt.datetime(2026, 11, 2, 10, 0, tzinfo=TUNIS)
    assert workdays.working_days_between(monday_ten, dt.datetime(2026, 11, 4, 9, 0, tzinfo=TUNIS)) == 1
    assert workdays.working_days_between(monday_ten, dt.datetime(2026, 11, 4, 10, 0, tzinfo=TUNIS)) == 2
    assert workdays.working_days_between(monday_ten, monday_ten) == 0


def test_working_days_between_does_not_count_the_weekend():
    friday_four = dt.datetime(2026, 11, 6, 16, 0, tzinfo=TUNIS)
    assert workdays.working_days_between(friday_four, dt.datetime(2026, 11, 9, 9, 0, tzinfo=TUNIS)) == 0
    assert workdays.working_days_between(friday_four, dt.datetime(2026, 11, 10, 16, 0, tzinfo=TUNIS)) == 2


def test_the_working_week_setting_changes_the_count(world):
    settings_service.set_value(actor=world.hr_user, key="working_week", value=[1, 2, 3, 4, 5, 6])
    assert workdays.is_working_day(SAT) is True
    assert workdays.working_days(FRI, NEXT_MON) == [FRI, SAT, NEXT_MON]
