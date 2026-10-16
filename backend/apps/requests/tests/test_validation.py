import datetime as dt
from decimal import Decimal

import pytest

from apps.calendar.models import PublicHoliday
from apps.requests.models import Amendment, RequestStatus
from apps.requests.services import RequestData, compute_quantity, validate
from apps.requests.tests.helpers import (
    FRI,
    MON,
    NEXT_MON,
    NEXT_TUE,
    SAT,
    SUN,
    THU,
    TODAY,
    TUE,
    WED,
    days,
    hours,
    stored,
)

pytestmark = pytest.mark.django_db

YESTERDAY = dt.date(2026, 10, 5)  # a Monday


def check(world, request_type=None, data=None, **options):
    employee = options.pop("employee", world.owner)
    return validate(
        employee=employee, request_type=request_type or world.annual, data=data or days(MON), **options
    )


def codes(problems) -> list[str]:
    return [problem.code for problem in problems]


# ------------------------------------------------------------------ shape


def test_a_plain_request_has_no_problem(world):
    assert check(world, data=days(MON, FRI)) == []


def test_end_before_start(world):
    problems = check(world, data=days(FRI, MON))
    assert codes(problems) == ["request.end_before_start"]
    assert problems[0].field == "end_date"


def test_an_inactive_type_is_refused(world):
    world.remote.is_active = False
    world.remote.save()
    assert codes(check(world, world.remote)) == ["request.type_inactive"]


def test_dates_without_a_working_day_are_refused(world):
    assert codes(check(world, data=days(SAT, SUN))) == ["request.no_working_day"]


def test_half_day_is_refused_when_the_type_does_not_allow_it(world):
    data = days(MON, starts_at_midday=True, exceptional_event_id=world.event.pk)
    assert codes(check(world, world.exceptional, data)) == ["request.half_day_not_allowed"]


def test_half_day_on_a_saturday_is_refused(world):
    problems = check(world, data=days(SAT, NEXT_MON, starts_at_midday=True))
    assert codes(problems) == ["request.half_day_on_non_working_day"]
    assert problems[0].field == "starts_at_midday"


def test_half_day_ending_on_a_holiday_is_refused(world):
    PublicHoliday.objects.create(date=WED, name_fr="Férié", name_en="Holiday")
    problems = check(world, data=days(MON, WED, ends_at_midday=True))
    assert codes(problems) == ["request.half_day_on_non_working_day"]
    assert problems[0].field == "ends_at_midday"


def test_single_day_flagged_at_both_ends_is_refused(world):
    problems = check(world, data=days(MON, starts_at_midday=True, ends_at_midday=True))
    assert codes(problems) == ["request.half_day_both_ends"]


def test_a_period_longer_than_a_year_is_refused_before_anything_is_counted(world):
    """A slip on the year (3026 for 2026) must give a sentence, not a quantity no column can hold."""
    problems = check(world, data=days(MON, dt.date(3026, 11, 2)))
    assert codes(problems) == ["request.period_too_long"]
    assert (problems[0].field, problems[0].params) == ("end_date", {"days": 366})
    assert check(world, world.sick, days(TODAY, TODAY + dt.timedelta(days=365))) == []
    assert codes(check(world, world.sick, days(TODAY, TODAY + dt.timedelta(days=366)))) == [
        "request.period_too_long"
    ]


def test_the_last_day_the_calendar_knows_is_counted_like_any_other(world):
    last = dt.date(9999, 12, 31)  # a Friday
    assert compute_quantity(world.remote, days(last)) == Decimal("1.00")
    assert check(world, world.remote, days(last)) == []


def test_range_ending_on_a_holiday_counts_up_to_the_last_working_day(world):
    PublicHoliday.objects.create(date=FRI, name_fr="Férié", name_en="Holiday")
    assert check(world, data=days(THU, FRI)) == []
    assert compute_quantity(world.annual, days(THU, FRI)) == Decimal("1.00")


# ------------------------------------------------------------------ dates against today


def test_past_dates_are_refused_except_for_types_that_allow_them(world):
    assert codes(check(world, data=days(YESTERDAY))) == ["request.past_dates"]
    assert check(world, world.sick, days(YESTERDAY)) == []


def test_today_is_not_the_past(world):
    assert check(world, data=days(TODAY)) == []


def test_notice_period(world):
    world.annual.notice_days = 7
    world.annual.save()
    problems = check(world, data=days(dt.date(2026, 10, 9)))
    assert codes(problems) == ["request.notice"]
    assert problems[0].params == {"days": 7}
    assert check(world, data=days(MON)) == []


def test_today_can_be_set_for_rules_evaluated_as_of_another_day(world):
    assert check(world, data=days(YESTERDAY), today=dt.date(2026, 10, 2)) == []


# ------------------------------------------------------------------ overlap (6.4)


def test_overlap_with_an_approved_request_of_another_type(world):
    stored(world, request_type=world.remote, data=days(TUE, WED))
    problems = check(world, data=days(MON, TUE))
    assert codes(problems) == ["request.overlap"]
    assert problems[0].params == {"other": "03/11/2026 – 04/11/2026"}


def test_a_morning_and_an_afternoon_of_the_same_day_do_not_overlap(world):
    stored(world, request_type=world.remote, data=days(MON, ends_at_midday=True))
    assert check(world, data=days(MON, starts_at_midday=True)) == []
    assert codes(check(world, data=days(MON))) == ["request.overlap"]


@pytest.mark.parametrize("status", ["pending", "returned", "approved"])
def test_pending_returned_and_approved_requests_block(world, status):
    stored(world, data=days(MON), status=status)
    assert codes(check(world, world.remote, days(MON))) == ["request.overlap"]


@pytest.mark.parametrize("status", ["draft", "rejected", "withdrawn", "cancelled"])
def test_other_statuses_do_not_block(world, status):
    stored(world, data=days(MON), status=status)
    assert check(world, world.remote, days(MON)) == []


def test_the_request_being_edited_does_not_overlap_itself(world):
    mine = stored(world, data=days(MON, TUE), status=RequestStatus.PENDING)
    assert check(world, data=days(MON, WED), ignoring_request_id=mine.pk) == []


def test_other_peoples_requests_do_not_block(world):
    stored(world, employee=world.peer, data=days(MON))
    assert check(world, data=days(MON)) == []


def test_a_pending_change_blocks_its_new_dates(world):
    original = stored(world, data=days(MON))
    Amendment.objects.create(
        request=original,
        kind="change",
        new_start_date=THU,
        new_end_date=THU,
        previous_start_date=MON,
        previous_end_date=MON,
        previous_quantity=Decimal("1"),
        reason="Décalage",
        requested_by=world.owner_user,
    )
    assert codes(check(world, world.remote, days(THU))) == ["request.overlap"]
    assert check(world, world.remote, days(THU), ignoring_request_id=original.pk) == []


# ------------------------------------------------------------------ hourly permission (6.7)


@pytest.mark.parametrize(
    "data",
    [
        days(MON),
        hours(MON, "09:10", "10:00"),
        hours(MON, "10:00", "09:00"),
        RequestData(start_date=MON, end_date=TUE, start_time=dt.time(9), end_time=dt.time(10)),
    ],
)
def test_a_permission_needs_one_date_and_times_on_the_quarter_hour(world, data):
    assert codes(check(world, world.permission, data)) == ["request.permission_times"]


def test_a_permission_must_be_on_a_working_day(world):
    assert codes(check(world, world.permission, hours(SAT))) == ["request.permission_non_working_day"]


def test_a_permission_cannot_fall_on_a_half_day_of_absence(world):
    stored(world, data=days(MON, ends_at_midday=True))  # absent on Monday morning
    assert codes(check(world, world.permission, hours(MON, "09:00", "10:00"))) == [
        "request.permission_overlaps_absence"
    ]
    assert codes(check(world, world.permission, hours(MON, "11:00", "13:00"))) == [
        "request.permission_overlaps_absence"
    ]
    assert check(world, world.permission, hours(MON, "14:00", "15:00")) == []


def test_a_permission_during_remote_work_is_allowed(world):
    stored(world, request_type=world.remote, data=days(MON))
    assert check(world, world.permission, hours(MON)) == []


def test_two_permissions_cannot_share_the_same_time(world):
    stored(world, request_type=world.permission, data=hours(MON, "09:00", "11:00"))
    assert codes(check(world, world.permission, hours(MON, "10:00", "12:00"))) == ["request.overlap"]
    assert check(world, world.permission, hours(MON, "11:00", "12:00")) == []


# ------------------------------------------------------------------ cap (6.8)


def test_weekly_cap_counts_pending_and_approved_requests_of_the_week(world):
    stored(world, request_type=world.remote, data=days(MON))
    stored(world, request_type=world.remote, data=days(TUE), status=RequestStatus.PENDING)
    stored(world, request_type=world.remote, data=days(THU), status=RequestStatus.RETURNED)
    problems = check(world, world.remote, days(WED))
    assert codes(problems) == ["request.cap_exceeded"]
    assert problems[0].params == {"limit": Decimal("2"), "used": Decimal("2")}
    assert check(world, world.remote, days(NEXT_MON)) == []


def test_weekly_cap_adds_up_half_days(world):
    stored(world, request_type=world.remote, data=days(MON))
    stored(world, request_type=world.remote, data=days(TUE, ends_at_midday=True))
    assert check(world, world.remote, days(WED, ends_at_midday=True)) == []
    problems = check(world, world.remote, days(WED))
    assert codes(problems) == ["request.cap_exceeded"]
    assert problems[0].params == {"limit": Decimal("2"), "used": Decimal("1.5")}


def test_a_request_across_two_weeks_is_checked_in_each_week(world):
    stored(world, request_type=world.remote, data=days(NEXT_TUE))
    stored(world, request_type=world.remote, data=days(dt.date(2026, 11, 11)))
    assert codes(check(world, world.remote, days(FRI, NEXT_MON))) == ["request.cap_exceeded"]


# ------------------------------------------------------------------ exceptional leave (6.6)


def test_an_event_is_required_and_limits_the_days(world):
    assert codes(check(world, world.exceptional, days(MON))) == ["request.event_required"]
    too_long = check(world, world.exceptional, days(MON, THU, exceptional_event_id=world.event.pk))
    assert codes(too_long) == ["request.event_days_exceeded"]
    assert too_long[0].params == {"allowed": Decimal("3")}
    assert check(world, world.exceptional, days(MON, WED, exceptional_event_id=world.event.pk)) == []


def test_an_inactive_event_cannot_be_chosen(world):
    world.event.is_active = False
    world.event.save()
    data = days(MON, exceptional_event_id=world.event.pk)
    assert codes(check(world, world.exceptional, data)) == ["request.event_required"]


# ------------------------------------------------------------------ balance and the HR exception


def test_an_insufficient_balance_reports_the_shortfall(world, port):
    port.ok = False
    problems = check(world, data=days(MON, TUE))
    assert codes(problems) == ["request.balance_insufficient"]
    assert problems[0].params == {"shortfall": Decimal("1.5")}
    assert port.checks[-1] == {
        "employee_id": world.owner.pk,
        "new_days": {MON: Decimal("1"), TUE: Decimal("1")},
        "ignoring_request_id": None,
    }


def test_the_balance_is_asked_only_for_types_that_deduct(world, port):
    check(world, world.remote, days(MON))
    check(world, world.sick, days(TODAY))
    assert port.checks == []


def test_the_exception_lifts_limits_but_never_overlap(world, port):
    port.ok = False
    assert check(world, data=days(YESTERDAY), override=True) == []

    stored(world, request_type=world.remote, data=days(MON))
    stored(world, request_type=world.remote, data=days(TUE))
    assert check(world, world.remote, days(WED), override=True) == []

    week_two = days(NEXT_MON, dt.date(2026, 11, 13), exceptional_event_id=world.event.pk)
    assert check(world, world.exceptional, week_two, override=True) == []

    stored(world, data=days(THU))
    assert codes(check(world, data=days(THU), override=True)) == ["request.overlap"]
