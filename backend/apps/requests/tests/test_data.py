import datetime as dt
from decimal import Decimal

import pytest

from apps.calendar.models import PublicHoliday
from apps.requests.models import Amendment
from apps.requests.services import compute_quantity, data_of, leave_days
from apps.requests.services.data import amendment_data, apply_data, day_diff
from apps.requests.tests.helpers import FRI, MON, NEXT_MON, SAT, TUE, WED, days, hours, stored

pytestmark = pytest.mark.django_db


def test_a_week_is_five_days(world):
    assert compute_quantity(world.annual, days(MON, FRI)) == Decimal("5.00")


def test_a_holiday_inside_the_range_is_not_counted(world):
    PublicHoliday.objects.create(date=WED, name_fr="Férié", name_en="Holiday")
    assert compute_quantity(world.annual, days(MON, FRI)) == Decimal("4.00")


def test_a_range_across_a_weekend_counts_only_working_days(world):
    assert compute_quantity(world.annual, days(FRI, NEXT_MON)) == Decimal("2.00")
    assert compute_quantity(world.annual, days(SAT, NEXT_MON)) == Decimal("1.00")
    assert compute_quantity(world.annual, days(SAT, SAT)) == Decimal("0.00")


def test_half_days_take_half_a_day_off_each_end(world):
    data = days(MON, WED, starts_at_midday=True, ends_at_midday=True)
    assert compute_quantity(world.annual, data) == Decimal("2.00")


def test_a_single_morning_or_afternoon_is_half_a_day(world):
    assert compute_quantity(world.annual, days(MON, ends_at_midday=True)) == Decimal("0.50")
    assert compute_quantity(world.annual, days(MON, starts_at_midday=True)) == Decimal("0.50")


def test_hours_are_counted_in_quarters(world):
    assert compute_quantity(world.permission, hours(MON, "09:00", "10:30")) == Decimal("1.50")
    assert compute_quantity(world.permission, hours(MON, "14:15", "15:00")) == Decimal("0.75")


def test_hours_without_usable_times_count_zero(world):
    assert compute_quantity(world.permission, days(MON)) == Decimal("0.00")
    assert compute_quantity(world.permission, hours(MON, "11:00", "09:00")) == Decimal("0.00")


def test_leave_days_lists_each_working_day_with_its_portion(world):
    assert leave_days(world.annual, days(FRI, NEXT_MON, starts_at_midday=True)) == {
        FRI: Decimal("0.5"),
        NEXT_MON: Decimal("1"),
    }


def test_leave_days_is_empty_for_hour_types(world):
    assert leave_days(world.permission, hours(MON)) == {}


def test_data_of_reads_a_stored_request_back(world):
    data = days(MON, TUE, ends_at_midday=True, comment="Vacances")
    assert data_of(stored(world, data=data)) == data


def test_apply_data_copies_every_field_onto_the_request(world):
    request = stored(world, request_type=world.permission, data=hours(MON, "09:00", "10:00"))
    apply_data(request, hours(TUE, "14:00", "15:30", comment="Banque"))
    assert (request.start_date, request.end_date) == (TUE, TUE)
    assert (request.start_time, request.end_time) == (dt.time(14, 0), dt.time(15, 30))
    assert request.comment == "Banque"


def test_amendment_data_keeps_the_event_and_comment_of_the_request(world):
    request = stored(
        world,
        request_type=world.exceptional,
        data=days(MON, TUE, exceptional_event_id=world.event.pk, comment="Noces"),
    )
    amendment = Amendment(
        request=request, kind="change", new_start_date=WED, new_end_date=FRI, new_ends_at_midday=True
    )
    assert amendment_data(amendment) == days(
        WED, FRI, ends_at_midday=True, exceptional_event_id=world.event.pk, comment="Noces"
    )


def test_day_diff_separates_released_and_added_days():
    old = {MON: Decimal("1"), TUE: Decimal("1")}
    new = {TUE: Decimal("0.5"), WED: Decimal("1")}
    released, added = day_diff(old, new)
    assert released == {MON: Decimal("1"), TUE: Decimal("0.5")}
    assert added == {WED: Decimal("1")}
