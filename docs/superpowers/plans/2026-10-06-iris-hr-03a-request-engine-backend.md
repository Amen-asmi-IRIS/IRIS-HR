# IRIS HR Platform: Request Engine (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** deliver the request engine through the API: public holidays and day counting, configurable request types and approval chains, the full request lifecycle with steps, on-behalf decisions, amendments, attachments, queues, and the reminder and certificate jobs, so that all five request types run end to end without balances.

**Architecture:** two Django apps. `calendar` owns public holidays and the working-day arithmetic. `requests` owns types, chains, requests, steps, amendments and attachment links; its rules live in a `services/` package of plain functions, its reads in `selectors.py`, and one function (`representation.represent`) builds the viewer-relative JSON that every list, queue and detail returns. Annual-leave balances are reached only through `BalancePort`, which this plan defines with a null implementation and plan 04 replaces.

**Tech Stack:** Python 3.13, Django 5.2 LTS, Django REST Framework, drf-spectacular, PostgreSQL 17, Procrastinate, pytest, pytest-django, time-machine.

**Spec:**

- `docs/superpowers/plans/2026-10-06-iris-hr-00-master-plan.md` (binding contract: sections 6, 7.8, 7.9)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-prd-design.md` (sections 5.3, 5.5, 5.9, 6, 7, 8.3, 8.4)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-ui-design.md` (sections 3.5, 5.3, 5.4, 6.1, 6.2, 7.1 to 7.8, 10.2: what the API must be able to answer)

## Global Constraints

Master plan section 2 applies in full. The constraints below are copied from the specs and bear directly on this plan.

- "The quantity (days or hours) is always computed by the server." (REQ-01)
- "Only HR can create a request that exceeds a limit (balance, cap, event days) or, other than sick leave, one dated in the past; a reason is mandatory. The request then follows its normal chain." (REQ-02)
- "At submission the request's chain is copied from the type's configuration. Later changes to the configuration do not affect requests already submitted." (REQ-04)
- "Until the first decision, the employee can edit or withdraw the request. After the first decision and before final approval the employee can withdraw but not edit." (REQ-07)
- "The original stays in force, and the balance is unchanged, until the amendment is approved. One amendment can be open per request." (REQ-08)
- "No request is ever approved automatically." (REQ-14)
- "The HR step is assigned to the HR role, not a named person: any HR holder other than the requester can act." (REQ-15)
- "Files are attached to a request by the requester or HR. Accepted formats are PDF, JPG and PNG up to 10 MB each." (REQ-16)
- "Two approvers acting on the same step at the same moment cannot both succeed; the second receives "already processed"." (REQ-18)
- "Nobody acts on their own request, in any role." (PRD 3)
- "The working week is Monday to Friday (a setting). A working day is a day of the working week that is not a public holiday." (6.1)
- "The quantity of a day-based request is the number of working days from start to end inclusive, minus 0.5 if it starts at midday and minus 0.5 if it ends at midday. A request containing no working day is refused." (6.1)
- "Day-based requests of one employee cannot overlap at half-day granularity, across all types, while in status pending, returned or approved." (6.4)
- "An hourly permission must fall on a working day and cannot be on a half-day already covered by an absence." (6.4)
- "The comment and attachments are visible only to the employee and HR." (6.5)
- "One date, a start time and an end time; quantity in hours, in quarter-hour steps." (6.7)
- "Limit: 2 days per calendar week (Monday to Sunday), counting approved and pending requests." (6.8)
- "A notification links to its item. Its text never contains a sick-leave comment or any detail of a medical document." (NOT-03)
- "The content of sick-leave comments is not copied into the audit trail; the event records only that the field changed." (AUD-05)
- "Concurrent decisions are rejected with 409 using the request's version number." (9.3)
- Step statuses: waiting, pending, approved, rejected, returned, notified, skipped. Amendment statuses: pending, approved, rejected, withdrawn. (5.3)
- Anonymous call: 401. Role not allowed on the endpoint: 403. Object outside the user's reach: 404. (master D14)

**Conventions used in every task of this plan**

- All paths are relative to the repository root. Backend code is under `backend/`.
- Commands are those of master section 5. Tests run with `docker compose run --rm app pytest <path> -v`.
- Every test in `apps/requests/tests/` runs with the clock frozen at Tuesday 6 October 2026, 09:00 Africa/Tunis, and with a fake balance port installed (Task 3 and Task 4 create these fixtures). Monday 2 November 2026 is the reference week for leave dates.
- Problems raised by services use the codes of master 7.9. Codes this plan adds are listed under "Contract notes" at the end.
- Conventions of plan 01a that every task follows: services pass `actor=actor` to `audit.record`; every `@extend_schema` has its own `operation_id` and every `SerializerMethodField` an `@extend_schema_field`; a task that adds or changes an endpoint regenerates `backend/openapi.yaml` with `powershell -File scripts/dev.ps1 openapi` before its commit.
- This plan builds on plans 01a and 02 as they are written: the cast (`world.owner`, `world.manager`, …, with the names "Amal Employee", "Mounir Manager", "Senna RH", "Karim Directeur"), `client_for`, the matrix harness, `apps.organisation.reach` and selectors, and `apps.files`.

## Review Focus

The five inputs most likely to hurt a person using this part of the software. Each has a test in the task that owns the code.

1. **Half-days and non-working boundaries.** A request that starts on a Saturday, ends on a public holiday, or is a single day flagged at both ends must give an obvious quantity or a clear refusal. Tests: Task 3 (`test_a_range_across_a_weekend_counts_only_working_days`), Task 5 (`test_half_day_on_a_saturday_is_refused`, `test_single_day_flagged_at_both_ends_is_refused`, `test_range_ending_on_a_holiday_counts_up_to_the_last_working_day`).
2. **Nobody to approve.** A requester with no manager, with a manager who cannot sign in, who is the only HR holder, or who is their own manager's delegate must end with a request that somebody else decides, never with an automatic approval. Tests: Task 7 (`test_ceo_request_skips_the_manager_rule`, `test_disabled_manager_leaves_nobody`, `test_the_only_hr_holder_falls_back_to_executives`, `test_delegate_who_is_the_requester_cannot_act`), Task 8 (`test_chain_without_a_human_decision_gets_an_hr_step`, `test_manager_who_cannot_act_is_flagged_to_hr_at_once`).
3. **Two actions at once.** A double click on Send, two approvers on one step, an approval racing a withdrawal: exactly one succeeds and the other receives `request.already_processed`. Tests: Task 9 (`test_second_submit_is_refused`), Task 10 (`test_second_decision_on_the_same_step_is_refused`, `test_stale_version_is_refused`), Task 11 (`test_decision_after_withdrawal_is_refused`).
4. **Configuration changed mid-flight.** A chain, a holiday or the working week edited while requests are pending or approved must not change requests already submitted. Tests: Task 9 (`test_chain_edited_after_submission_does_not_change_the_request`), Task 21 (`test_holiday_added_later_is_reported_not_applied`).
5. **Leaked medical detail.** The sick-leave comment or the certificate must never reach a manager, an executive, a notification, the audit trail or a history. Tests: Task 6 (`test_sick_leave_comment_is_redacted_in_the_audit_trail`), Task 12 (`test_manager_cannot_download_a_certificate`), Task 16 (`test_notifications_never_carry_the_comment`), Task 17 (`test_manager_never_receives_the_sick_leave_comment`), Task 24 (`test_no_endpoint_leaks_the_sick_leave_comment`).

---

### Task 1: Calendar app, public holidays and working days

**Files:**
- Create: `backend/apps/calendar/__init__.py` (empty)
- Create: `backend/apps/calendar/apps.py`
- Create: `backend/apps/calendar/models.py`
- Create: `backend/apps/calendar/messages.py`
- Create: `backend/apps/calendar/lang.py`
- Create: `backend/apps/calendar/workdays.py`
- Create: `backend/apps/calendar/services.py`
- Create: `backend/apps/calendar/selectors.py`
- Create: `backend/apps/calendar/api/__init__.py` (empty)
- Create: `backend/apps/calendar/api/serializers.py`
- Create: `backend/apps/calendar/api/views.py`
- Create: `backend/apps/calendar/api/urls.py`
- Create: `backend/apps/calendar/migrations/__init__.py` (empty)
- Create: `backend/apps/calendar/migrations/0001_initial.py` (generated)
- Create: `backend/apps/calendar/tests/__init__.py` (empty)
- Create: `backend/apps/calendar/tests/conftest.py`
- Create: `backend/apps/calendar/tests/matrix.py`
- Modify: `backend/config/settings.py` (one line in `INSTALLED_APPS`)
- Modify: `backend/config/api_urls.py` (one line in `urlpatterns`)
- Modify: `backend/tests/test_permission_matrix.py` (one line in `MATRIX_MODULES`)
- Modify: `backend/openapi.yaml` (regenerated)
- Test: `backend/apps/calendar/tests/test_workdays.py`
- Test: `backend/apps/calendar/tests/test_holidays.py`
- Test: `backend/apps/calendar/tests/test_api.py`

**Interfaces:**
- Consumes (plan 01a): `apps.core.i18n.active_language`, `scripts/dev.ps1 openapi`, `apps.settings.registry.SettingDef`, `apps.settings.registry.register`, `apps.settings.services.get(key)`, `apps.settings.services.set_value(*, actor, key, value)`, `apps.settings.services.clear_cache()`, `apps.core.i18n.register_messages`, `apps.core.errors.DomainError`, `apps.core.errors.NotFound`, `apps.audit.services.record`, `apps.audit.services.snapshot`, `apps.audit.services.diff`, `apps.accounts.roles.Role`, the fixtures `world` and `client_for`, `tests.matrix.Case`, `tests.matrix.P`, `tests.matrix.only`.
- Produces:
  - `apps.calendar.models.PublicHoliday(date, name_fr, name_en, recurs_yearly)`
  - `apps.calendar.workdays.is_working_day(day: date) -> bool`
  - `apps.calendar.workdays.working_days(start: date, end: date) -> list[date]`
  - `apps.calendar.workdays.day_portions(start: date, end: date, *, starts_at_midday: bool, ends_at_midday: bool) -> dict[date, Decimal]`
  - `apps.calendar.workdays.skipped_days(start: date, end: date) -> list[tuple[date, str]]`
  - `apps.calendar.workdays.add_working_days(start: date, count: int) -> date`
  - `apps.calendar.workdays.working_days_between(earlier: datetime, later: datetime) -> int`
  - `apps.calendar.services.create_holiday(*, actor, date, name_fr, name_en, recurs_yearly=False) -> PublicHoliday`
  - `apps.calendar.services.update_holiday(*, actor, holiday, date, name_fr, name_en, recurs_yearly) -> PublicHoliday`
  - `apps.calendar.services.delete_holiday(*, actor, holiday) -> None`
  - `apps.calendar.services.copy_recurring_holidays(*, actor, from_year: int, to_year: int) -> list[PublicHoliday]`
  - `apps.calendar.selectors.holidays_between(start: date, end: date) -> QuerySet[PublicHoliday]`
  - `apps.calendar.selectors.holidays_of_year(year: int) -> QuerySet[PublicHoliday]`
  - `apps.calendar.lang.active_lang() -> str` (`"fr"` or `"en"`), `apps.calendar.lang.pick(fr: str, en: str) -> str`
  - HR setting `working_week` (ISO weekdays, default `[1, 2, 3, 4, 5]`)
  - Routes `calendar:holiday-list`, `calendar:holiday-detail`, `calendar:holiday-copy` (`calendar:holiday-impact` is added in Task 21)

- [ ] **Step 1: Create the app skeleton and register it**

Create the empty files `backend/apps/calendar/__init__.py`, `backend/apps/calendar/api/__init__.py`, `backend/apps/calendar/migrations/__init__.py`, `backend/apps/calendar/tests/__init__.py`.

`backend/apps/calendar/apps.py`:

```python
from django.apps import AppConfig


class CalendarConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.calendar"
    label = "calendar"

    def ready(self) -> None:
        from apps.core.i18n import register_messages
        from apps.settings.registry import SettingDef, register

        from .messages import MESSAGES

        register_messages(MESSAGES)
        register(SettingDef(key="working_week", group="hr", kind="weekdays", default=[1, 2, 3, 4, 5]))
```

`backend/apps/calendar/messages.py`:

```python
MESSAGES = {
    "calendar.holiday_exists": {
        "en": "A public holiday already exists on this date.",
        "fr": "Un jour férié existe déjà à cette date.",
    },
    "calendar.year_invalid": {
        "en": "Choose a valid year. The target year must come after the source year.",
        "fr": "Choisissez une année valide. L'année cible doit suivre l'année source.",
    },
    "calendar.date_required": {
        "en": "Give a date in the form YYYY-MM-DD.",
        "fr": "Indiquez une date au format AAAA-MM-JJ.",
    },
}
```

`backend/apps/calendar/models.py`:

```python
from django.db import models


class PublicHoliday(models.Model):
    date = models.DateField(unique=True)
    name_fr = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120)
    recurs_yearly = models.BooleanField(default=False)

    class Meta:
        ordering = ["date"]

    def __str__(self) -> str:
        return f"{self.date:%Y-%m-%d} {self.name_en}"
```

In `backend/config/settings.py`, append one line to the `INSTALLED_APPS` list, after the last `apps.` entry:

```python
    "apps.calendar",
```

- [ ] **Step 2: Generate the migration**

Run: `docker compose run --rm app python manage.py makemigrations calendar`
Expected: `Migrations for 'calendar':` followed by `apps/calendar/migrations/0001_initial.py` and `+ Create model PublicHoliday`.

- [ ] **Step 3: Write the failing tests for working days**

`backend/apps/calendar/tests/conftest.py`:

```python
import pytest

from apps.settings import services as settings_service


@pytest.fixture(autouse=True)
def _fresh_settings_cache():
    """Settings are cached per process; a value set in one test must not reach the next."""
    settings_service.clear_cache()
    yield
    settings_service.clear_cache()
```

`backend/apps/calendar/tests/test_workdays.py`:

```python
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
    assert workdays.day_portions(MON, MON, starts_at_midday=False, ends_at_midday=True) == {MON: Decimal("0.5")}


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
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/calendar/tests/test_workdays.py -v`
Expected: collection error, `ModuleNotFoundError: No module named 'apps.calendar.workdays'`.

- [ ] **Step 5: Implement working days**

`backend/apps/calendar/workdays.py`:

```python
"""Working-day arithmetic (PRD 6.1). Every count of days in the platform goes through this module."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.settings import services as settings_service

from .models import PublicHoliday

FULL = Decimal("1")
HALF = Decimal("0.5")


def _week() -> frozenset[int]:
    return frozenset(int(day) for day in settings_service.get("working_week"))


def _holidays(start: date, end: date) -> set[date]:
    return set(PublicHoliday.objects.filter(date__gte=start, date__lte=end).values_list("date", flat=True))


def _each_day(start: date, end: date) -> Iterator[date]:
    day = start
    while day <= end:
        yield day
        day += timedelta(days=1)


def is_working_day(day: date) -> bool:
    return day.isoweekday() in _week() and not PublicHoliday.objects.filter(date=day).exists()


def working_days(start: date, end: date) -> list[date]:
    """Working days from start to end inclusive. Empty when end is before start."""
    if end < start:
        return []
    week = _week()
    holidays = _holidays(start, end)
    return [day for day in _each_day(start, end) if day.isoweekday() in week and day not in holidays]


def day_portions(start: date, end: date, *, starts_at_midday: bool, ends_at_midday: bool) -> dict[date, Decimal]:
    """Each working day of the range with the part of it that is taken: 1 or 0.5."""
    portions = {day: FULL for day in working_days(start, end)}
    if starts_at_midday and start in portions:
        portions[start] -= HALF
    if ends_at_midday and end in portions:
        portions[end] -= HALF
    return {day: portion for day, portion in portions.items() if portion > 0}


def skipped_days(start: date, end: date) -> list[tuple[date, str]]:
    """Days of the range that are not counted, each with "weekend" or "holiday"."""
    if end < start:
        return []
    week = _week()
    holidays = _holidays(start, end)
    skipped: list[tuple[date, str]] = []
    for day in _each_day(start, end):
        if day.isoweekday() not in week:
            skipped.append((day, "weekend"))
        elif day in holidays:
            skipped.append((day, "holiday"))
    return skipped


def add_working_days(start: date, count: int) -> date:
    """The date reached after moving forward by `count` working days. `start` itself is not counted."""
    if count < 0:
        raise ValueError("count must not be negative")
    if not _week():
        raise ValueError("the working week is empty")
    day = start
    remaining = count
    while remaining > 0:
        day += timedelta(days=1)
        if is_working_day(day):
            remaining -= 1
    return day


def working_days_between(earlier: datetime, later: datetime) -> int:
    """Whole working days elapsed between two moments, in Tunis time.

    A working day counts once the clock on that day reaches the time of day of `earlier`.
    """
    start = timezone.localtime(earlier)
    end = timezone.localtime(later)
    if end <= start:
        return 0
    days = working_days(start.date() + timedelta(days=1), end.date())
    elapsed = len(days)
    if days and days[-1] == end.date() and end.time() < start.time():
        elapsed -= 1
    return elapsed
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/calendar/tests/test_workdays.py -v`
Expected: 12 passed.

- [ ] **Step 7: Write the failing tests for holiday services**

`backend/apps/calendar/tests/test_holidays.py`:

```python
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
        actor=world.hr_user, date=MAY_DAY, name_fr=" Fête du Travail ", name_en="Labour Day", recurs_yearly=True
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
        actor=world.hr_user, holiday=first, date=dt.date(2026, 5, 2), name_fr="A2", name_en="A2", recurs_yearly=True
    )
    assert (updated.date, updated.name_en, updated.recurs_yearly) == (dt.date(2026, 5, 2), "A2", True)
    with pytest.raises(DomainError) as error:
        services.update_holiday(
            actor=world.hr_user, holiday=first, date=dt.date(2026, 7, 25), name_fr="A", name_en="A", recurs_yearly=False
        )
    assert error.value.code == "calendar.holiday_exists"
    assert AuditEvent.objects.filter(action="holiday.updated").count() == 1


def test_delete_holiday_is_audited(world):
    holiday = services.create_holiday(actor=world.hr_user, date=MAY_DAY, name_fr="A", name_en="A")
    services.delete_holiday(actor=world.hr_user, holiday=holiday)
    assert not PublicHoliday.objects.exists()
    assert AuditEvent.objects.filter(action="holiday.deleted").exists()


def test_copy_takes_only_recurring_holidays_and_skips_existing_dates(world):
    services.create_holiday(actor=world.hr_user, date=MAY_DAY, name_fr="Travail", name_en="Labour", recurs_yearly=True)
    services.create_holiday(
        actor=world.hr_user, date=dt.date(2026, 7, 25), name_fr="République", name_en="Republic", recurs_yearly=True
    )
    services.create_holiday(actor=world.hr_user, date=dt.date(2026, 3, 20), name_fr="Aïd", name_en="Eid")
    services.create_holiday(actor=world.hr_user, date=dt.date(2027, 5, 1), name_fr="Travail", name_en="Labour")

    created = services.copy_recurring_holidays(actor=world.hr_user, from_year=2026, to_year=2027)

    assert [h.date for h in created] == [dt.date(2027, 7, 25)]
    assert created[0].recurs_yearly is True
    assert PublicHoliday.objects.filter(date__year=2027).count() == 2


def test_copy_run_twice_adds_nothing_the_second_time(world):
    services.create_holiday(actor=world.hr_user, date=MAY_DAY, name_fr="Travail", name_en="Labour", recurs_yearly=True)
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
    assert [h.name_en for h in selectors.holidays_between(dt.date(2026, 7, 1), dt.date(2027, 1, 1))] == ["B", "C"]
```

- [ ] **Step 8: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/calendar/tests/test_holidays.py -v`
Expected: collection error, `ImportError: cannot import name 'selectors' from 'apps.calendar'`.

- [ ] **Step 9: Implement holiday services and selectors**

`backend/apps/calendar/services.py`:

```python
from __future__ import annotations

import datetime as dt

from django.db import transaction

from apps.audit import services as audit
from apps.core.errors import DomainError

from .models import PublicHoliday

FIELDS = ("date", "name_fr", "name_en", "recurs_yearly")


def _label(holiday: PublicHoliday) -> str:
    return f"{holiday.date:%d/%m/%Y} {holiday.name_fr}"


@transaction.atomic
def create_holiday(*, actor, date: dt.date, name_fr: str, name_en: str, recurs_yearly: bool = False) -> PublicHoliday:
    if PublicHoliday.objects.filter(date=date).exists():
        raise DomainError("calendar.holiday_exists", field="date")
    holiday = PublicHoliday.objects.create(
        date=date, name_fr=name_fr.strip(), name_en=name_en.strip(), recurs_yearly=recurs_yearly
    )
    audit.record(
        action="holiday.created",
        obj=holiday,
        object_label=_label(holiday),
        changes=audit.diff(dict.fromkeys(FIELDS), audit.snapshot(holiday, FIELDS)),
        actor=actor,
    )
    return holiday


@transaction.atomic
def update_holiday(
    *, actor, holiday: PublicHoliday, date: dt.date, name_fr: str, name_en: str, recurs_yearly: bool
) -> PublicHoliday:
    if PublicHoliday.objects.filter(date=date).exclude(pk=holiday.pk).exists():
        raise DomainError("calendar.holiday_exists", field="date")
    before = audit.snapshot(holiday, FIELDS)
    holiday.date = date
    holiday.name_fr = name_fr.strip()
    holiday.name_en = name_en.strip()
    holiday.recurs_yearly = recurs_yearly
    holiday.save()
    audit.record(
        action="holiday.updated",
        obj=holiday,
        object_label=_label(holiday),
        changes=audit.diff(before, audit.snapshot(holiday, FIELDS)),
        actor=actor,
    )
    return holiday


@transaction.atomic
def delete_holiday(*, actor, holiday: PublicHoliday) -> None:
    before = audit.snapshot(holiday, FIELDS)
    audit.record(
        action="holiday.deleted",
        obj=holiday,
        object_label=_label(holiday),
        changes=audit.diff(before, dict.fromkeys(FIELDS)),
        actor=actor,
    )
    holiday.delete()


@transaction.atomic
def copy_recurring_holidays(*, actor, from_year: int, to_year: int) -> list[PublicHoliday]:
    """Copy the holidays marked as recurring to the same day and month of another year."""
    if to_year <= from_year:
        raise DomainError("calendar.year_invalid", field="to_year")
    existing = set(PublicHoliday.objects.filter(date__year=to_year).values_list("date", flat=True))
    created: list[PublicHoliday] = []
    for source in PublicHoliday.objects.filter(date__year=from_year, recurs_yearly=True).order_by("date"):
        try:
            target = source.date.replace(year=to_year)
        except ValueError:  # 29 February in a year that has none
            continue
        if target in existing:
            continue
        created.append(
            PublicHoliday.objects.create(
                date=target, name_fr=source.name_fr, name_en=source.name_en, recurs_yearly=True
            )
        )
    audit.record(
        action="holiday.copied",
        object_type="publicholiday",
        object_id=str(to_year),
        object_label=str(to_year),
        changes={"from_year": from_year, "to_year": to_year, "created": len(created)},
        actor=actor,
    )
    return created
```

`backend/apps/calendar/selectors.py`:

```python
from __future__ import annotations

from datetime import date

from django.db.models import QuerySet

from .models import PublicHoliday


def holidays_between(start: date, end: date) -> QuerySet[PublicHoliday]:
    return PublicHoliday.objects.filter(date__gte=start, date__lte=end).order_by("date")


def holidays_of_year(year: int) -> QuerySet[PublicHoliday]:
    return PublicHoliday.objects.filter(date__year=year).order_by("date")
```

- [ ] **Step 10: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/calendar/tests/test_holidays.py -v`
Expected: 8 passed.

- [ ] **Step 11: Write the failing API tests**

`backend/apps/calendar/tests/test_api.py`:

```python
import pytest
from django.urls import reverse

from apps.calendar.models import PublicHoliday

pytestmark = pytest.mark.django_db

LABOUR_DAY = {"date": "2026-05-01", "name_fr": "Fête du Travail", "name_en": "Labour Day", "recurs_yearly": True}


def test_hr_adds_a_holiday(world, client_for):
    response = client_for(world.hr_user).post(reverse("calendar:holiday-list"), LABOUR_DAY, format="json")
    assert response.status_code == 201
    body = response.json()
    assert body["date"] == "2026-05-01"
    assert body["name_fr"] == "Fête du Travail"
    assert body["recurs_yearly"] is True


def test_duplicate_date_is_a_field_problem(world, client_for):
    client = client_for(world.hr_user)
    client.post(reverse("calendar:holiday-list"), LABOUR_DAY, format="json")
    response = client.post(reverse("calendar:holiday-list"), LABOUR_DAY, format="json")
    assert response.status_code == 400
    assert response.json()["code"] == "calendar.holiday_exists"
    assert response.json()["errors"][0]["field"] == "date"


def test_an_employee_lists_the_holidays_of_a_year_in_their_language(world, client_for):
    PublicHoliday.objects.create(date="2026-05-01", name_fr="Fête du Travail", name_en="Labour Day")
    PublicHoliday.objects.create(date="2027-05-01", name_fr="Fête du Travail", name_en="Labour Day")
    world.owner_user.language = "en"
    world.owner_user.save(update_fields=["language"])
    response = client_for(world.owner_user).get(reverse("calendar:holiday-list"), {"year": 2026})
    assert response.status_code == 200
    assert [(item["date"], item["name"]) for item in response.json()] == [("2026-05-01", "Labour Day")]


def test_a_year_that_is_not_a_number_is_refused(world, client_for):
    response = client_for(world.owner_user).get(reverse("calendar:holiday-list"), {"year": "soon"})
    assert response.status_code == 400
    assert response.json()["code"] == "calendar.year_invalid"


def test_hr_changes_and_removes_a_holiday(world, client_for):
    holiday = PublicHoliday.objects.create(date="2026-05-01", name_fr="A", name_en="A")
    client = client_for(world.hr_user)
    url = reverse("calendar:holiday-detail", kwargs={"pk": holiday.pk})
    changed = client.patch(url, {"name_en": "Labour Day"}, format="json")
    assert changed.status_code == 200
    assert changed.json()["name_en"] == "Labour Day"
    assert changed.json()["name_fr"] == "A"
    assert client.delete(url).status_code == 204
    assert client.delete(url).status_code == 404


def test_hr_copies_recurring_holidays_to_next_year(world, client_for):
    PublicHoliday.objects.create(date="2026-05-01", name_fr="Travail", name_en="Labour", recurs_yearly=True)
    response = client_for(world.hr_user).post(
        reverse("calendar:holiday-copy"), {"from_year": 2026, "to_year": 2027}, format="json"
    )
    assert response.status_code == 201
    assert [item["date"] for item in response.json()] == ["2027-05-01"]
```

- [ ] **Step 12: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/calendar/tests/test_api.py -v`
Expected: 6 failed with `django.urls.exceptions.NoReverseMatch: 'calendar' is not a registered namespace`.

- [ ] **Step 13: Implement the API**

`backend/apps/calendar/lang.py`:

```python
from apps.core.i18n import active_language


def active_lang() -> str:
    """The language of the current request: "fr" or "en"."""
    return active_language()


def pick(fr: str, en: str) -> str:
    """One of two stored names, in the language of the reader."""
    return fr if active_language() == "fr" else en
```

`backend/apps/calendar/api/serializers.py`:

```python
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from ..lang import pick
from ..models import PublicHoliday


class HolidayOut(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = PublicHoliday
        fields = ["id", "date", "name_fr", "name_en", "name", "recurs_yearly"]

    @extend_schema_field(serializers.CharField())
    def get_name(self, holiday: PublicHoliday) -> str:
        return pick(holiday.name_fr, holiday.name_en)


class HolidayIn(serializers.Serializer):
    date = serializers.DateField()
    name_fr = serializers.CharField(max_length=120)
    name_en = serializers.CharField(max_length=120)
    recurs_yearly = serializers.BooleanField(required=False, default=False)


class HolidayPatchIn(serializers.Serializer):
    date = serializers.DateField(required=False)
    name_fr = serializers.CharField(max_length=120, required=False)
    name_en = serializers.CharField(max_length=120, required=False)
    recurs_yearly = serializers.BooleanField(required=False)


class HolidayCopyIn(serializers.Serializer):
    from_year = serializers.IntegerField(min_value=1900, max_value=2200)
    to_year = serializers.IntegerField(min_value=1900, max_value=2200)
```

`backend/apps/calendar/api/views.py`:

```python
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role
from apps.core.errors import DomainError, NotFound

from .. import selectors, services
from ..models import PublicHoliday
from .serializers import HolidayCopyIn, HolidayIn, HolidayOut, HolidayPatchIn

STAFF = {Role.EMPLOYEE, Role.HR, Role.EXEC}


def _holiday(pk: int) -> PublicHoliday:
    holiday = PublicHoliday.objects.filter(pk=pk).first()
    if holiday is None:
        raise NotFound("core.not_found")
    return holiday


class HolidayListView(APIView):
    http_method_names = ["get", "post"]
    access = {"GET": STAFF, "POST": {Role.HR}}

    @extend_schema(
        operation_id="holidays_list",
        parameters=[OpenApiParameter("year", int, required=False)],
        responses=HolidayOut(many=True),
    )
    def get(self, request):
        raw = request.query_params.get("year")
        try:
            year = int(raw) if raw else timezone.localdate().year
        except ValueError:
            raise DomainError("calendar.year_invalid", field="year") from None
        if not 1900 <= year <= 2200:
            raise DomainError("calendar.year_invalid", field="year")
        return Response(HolidayOut(selectors.holidays_of_year(year), many=True).data)

    @extend_schema(operation_id="holidays_create", request=HolidayIn, responses={201: HolidayOut})
    def post(self, request):
        data = HolidayIn(data=request.data)
        data.is_valid(raise_exception=True)
        holiday = services.create_holiday(actor=request.user, **data.validated_data)
        return Response(HolidayOut(holiday).data, status=201)


class HolidayDetailView(APIView):
    http_method_names = ["patch", "delete"]
    access = {"PATCH": {Role.HR}, "DELETE": {Role.HR}}

    @extend_schema(operation_id="holidays_update", request=HolidayPatchIn, responses=HolidayOut)
    def patch(self, request, pk: int):
        holiday = _holiday(pk)
        data = HolidayPatchIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = {
            "date": holiday.date,
            "name_fr": holiday.name_fr,
            "name_en": holiday.name_en,
            "recurs_yearly": holiday.recurs_yearly,
            **data.validated_data,
        }
        holiday = services.update_holiday(actor=request.user, holiday=holiday, **values)
        return Response(HolidayOut(holiday).data)

    @extend_schema(operation_id="holidays_delete", request=None, responses={204: None})
    def delete(self, request, pk: int):
        services.delete_holiday(actor=request.user, holiday=_holiday(pk))
        return Response(status=204)


class HolidayCopyView(APIView):
    http_method_names = ["post"]
    access = {"POST": {Role.HR}}

    @extend_schema(
        operation_id="holidays_copy", request=HolidayCopyIn, responses={201: HolidayOut(many=True)}
    )
    def post(self, request):
        data = HolidayCopyIn(data=request.data)
        data.is_valid(raise_exception=True)
        created = services.copy_recurring_holidays(actor=request.user, **data.validated_data)
        return Response(HolidayOut(created, many=True).data, status=201)
```

`backend/apps/calendar/api/urls.py`:

```python
from django.urls import path

from . import views

app_name = "calendar"

urlpatterns = [
    path("holidays", views.HolidayListView.as_view(), name="holiday-list"),
    path("holidays/copy", views.HolidayCopyView.as_view(), name="holiday-copy"),
    path("holidays/<int:pk>", views.HolidayDetailView.as_view(), name="holiday-detail"),
]
```

In `backend/config/api_urls.py`, append one line to `urlpatterns`, in the same form as the existing includes:

```python
    path("", include("apps.calendar.api.urls")),
```

- [ ] **Step 14: Add the permission-matrix cases**

`backend/apps/calendar/tests/matrix.py`:

```python
import datetime as dt

from apps.calendar.models import PublicHoliday
from tests.matrix import Case, P, only

STAFF = (P.OWNER, P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC)


def _holiday(world) -> PublicHoliday:
    holiday, _ = PublicHoliday.objects.get_or_create(
        date=dt.date(2031, 1, 1), defaults={"name_fr": "Jour de l'an", "name_en": "New Year's Day"}
    )
    return holiday


CASES = [
    Case("calendar:holiday-list", "GET", only(*STAFF)),
    Case(
        "calendar:holiday-list",
        "POST",
        only(P.HR),
        body=lambda w: {"date": "2031-05-01", "name_fr": "Fête du Travail", "name_en": "Labour Day"},
    ),
    Case(
        "calendar:holiday-detail",
        "PATCH",
        only(P.HR),
        kwargs=lambda w: {"pk": _holiday(w).pk},
        body=lambda w: {"name_en": "New Year"},
    ),
    Case("calendar:holiday-detail", "DELETE", only(P.HR), kwargs=lambda w: {"pk": _holiday(w).pk}),
    Case("calendar:holiday-copy", "POST", only(P.HR), body=lambda w: {"from_year": 2031, "to_year": 2032}),
]
```

In `backend/tests/test_permission_matrix.py`, append one line to `MATRIX_MODULES`:

```python
    "apps.calendar.tests.matrix",
```

- [ ] **Step 15: Regenerate the API description**

Plan 01a's `tests/test_openapi.py` fails as soon as the code and the committed description differ, so every task of this plan that adds or changes an endpoint ends by regenerating it.

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: no line starting with `Warning`, then `backend/openapi.yaml is up to date.` The file now has the paths `/api/v1/holidays`, `/api/v1/holidays/copy` and `/api/v1/holidays/{id}`. If `frontend/` exists, `frontend/src/api/schema.d.ts` is rewritten as well.

A warning stops the command. Plan 01a, Task 21, lists the usual causes; in this plan they are a missing `operation_id` or a choice set without a name in `ENUM_NAME_OVERRIDES`.

- [ ] **Step 16: Run the calendar tests, the matrix and the description check**

Run: `docker compose run --rm app pytest apps/calendar tests/test_permission_matrix.py tests/test_messages.py tests/test_openapi.py -v`
Expected: all pass, including the matrix cases whose ids contain `calendar:holiday-`.

- [ ] **Step 17: Commit**

```bash
git add backend/apps/calendar backend/config/settings.py backend/config/api_urls.py backend/tests/test_permission_matrix.py backend/openapi.yaml
git add frontend/src/api/schema.d.ts 2>/dev/null || true
git commit -m "feat(calendar): public holidays and working-day arithmetic"
```

---

### Task 2: Request configuration: types, chains, exceptional events

**Files:**
- Create: `backend/apps/requests/__init__.py` (empty)
- Create: `backend/apps/requests/apps.py`
- Create: `backend/apps/requests/models.py`
- Create: `backend/apps/requests/messages.py`
- Create: `backend/apps/requests/selectors.py`
- Create: `backend/apps/requests/services/__init__.py`
- Create: `backend/apps/requests/services/config.py`
- Create: `backend/apps/requests/api/__init__.py` (empty)
- Create: `backend/apps/requests/api/serializers.py`
- Create: `backend/apps/requests/api/views.py`
- Create: `backend/apps/requests/api/urls.py`
- Create: `backend/apps/requests/migrations/__init__.py` (empty)
- Create: `backend/apps/requests/migrations/0001_initial.py` (generated)
- Create: `backend/apps/requests/migrations/0002_seed_types.py`
- Create: `backend/apps/requests/tests/__init__.py` (empty)
- Create: `backend/apps/requests/tests/world.py`
- Create: `backend/apps/requests/tests/matrix.py`
- Modify: `backend/config/settings.py` (one line in `INSTALLED_APPS`; entries in `ENUM_NAME_OVERRIDES`)
- Modify: `backend/config/api_urls.py` (one line in `urlpatterns`)
- Modify: `backend/tests/world.py` (one line in `build_world()`)
- Modify: `backend/openapi.yaml` (regenerated)
- Modify: `backend/tests/test_permission_matrix.py` (one line in `MATRIX_MODULES`)
- Test: `backend/apps/requests/tests/test_config.py`
- Test: `backend/apps/requests/tests/test_config_api.py`

**Interfaces:**
- Consumes: `apps.audit.services` (`record`, `snapshot`, `diff`), `apps.core.errors` (`DomainError`, `NotFound`), `apps.core.i18n.register_messages`, `apps.accounts.roles` (`Role`, `has_role`), `apps.organisation.selectors.get_employee_for(user, public_id)`, `apps.organisation.selectors.full_name(employee)`, `apps.calendar.lang.pick`.
- Produces:
  - Enumerations in `apps.requests.models`: `Unit`, `BalanceEffect`, `DocumentRule`, `CapPeriod`, `CalendarLabel`, `ApproverRule`, `StepMode`, `RequestStatus`, `StepStatus`, `AmendmentStatus`, `AmendmentKind`, `Channel`, `Decision`
  - Models `RequestType`, `ChainStep` (`request_type.chain_steps`), `ExceptionalEvent`
  - Seeded types `annual`, `sick`, `exceptional`, `permission`, `remote` with their chains
  - `apps.requests.services.StepSpec(approver_rule, mode="approve", named_person=None, reminder_after_days=2, flag_after_days=None)`
  - `apps.requests.services.create_request_type(*, actor, data: Mapping[str, Any]) -> RequestType`
  - `apps.requests.services.update_request_type(*, actor, request_type, data: Mapping[str, Any]) -> RequestType`
  - `apps.requests.services.replace_steps(*, actor, request_type, steps: Sequence[StepSpec]) -> list[ChainStep]`
  - `apps.requests.services.create_event(*, actor, name_fr, name_en, days_allowed, proof_required=False, is_active=True) -> ExceptionalEvent`
  - `apps.requests.services.update_event(*, actor, event, **fields) -> ExceptionalEvent`
  - `apps.requests.selectors.request_types(*, active_only: bool) -> QuerySet[RequestType]`, `get_type(pk: int) -> RequestType`, `get_type_by_code(code: str) -> RequestType`, `events(*, active_only: bool) -> QuerySet[ExceptionalEvent]`, `get_event(pk: int) -> ExceptionalEvent`
  - The cast attributes `world.annual`, `world.sick`, `world.exceptional`, `world.permission`, `world.remote`, `world.event`
  - Routes `requests:type-list`, `requests:type-detail`, `requests:type-steps`, `requests:event-list`, `requests:event-detail` (`requests:type-chain-preview` is added in Task 7)

- [ ] **Step 1: Create the app, its enumerations and configuration models**

Create the empty files `backend/apps/requests/__init__.py`, `backend/apps/requests/api/__init__.py`, `backend/apps/requests/migrations/__init__.py`, `backend/apps/requests/tests/__init__.py`.

`backend/apps/requests/apps.py`:

```python
from django.apps import AppConfig


class RequestsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.requests"
    label = "requests"

    def ready(self) -> None:
        from apps.core.i18n import register_messages

        from .messages import MESSAGES

        register_messages(MESSAGES)
```

`backend/apps/requests/models.py`:

```python
from __future__ import annotations

from django.db import models


class Unit(models.TextChoices):
    DAY = "day", "Day"
    HOUR = "hour", "Hour"


class BalanceEffect(models.TextChoices):
    DEDUCTS_ANNUAL = "deducts_annual", "Deducts from the annual balance"
    NONE = "none", "None"


class DocumentRule(models.TextChoices):
    NONE = "none", "None"
    REQUIRED_WITHIN_DEADLINE = "required_within_deadline", "Required within a deadline"


class CapPeriod(models.TextChoices):
    NONE = "none", "None"
    WEEK = "week", "Week"
    MONTH = "month", "Month"


class CalendarLabel(models.TextChoices):
    ABSENT = "absent", "Absent"
    REMOTE = "remote", "Remote"
    HIDDEN = "hidden", "Hidden"


class ApproverRule(models.TextChoices):
    LINE_MANAGER = "line_manager", "Line manager"
    HR_ROLE = "hr_role", "HR role"
    NAMED_PERSON = "named_person", "Named person"


class StepMode(models.TextChoices):
    APPROVE = "approve", "Approve"
    NOTIFY = "notify", "Notify"


class RequestStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PENDING = "pending", "Pending"
    RETURNED = "returned", "Returned"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    WITHDRAWN = "withdrawn", "Withdrawn"
    CANCELLED = "cancelled", "Cancelled"


class StepStatus(models.TextChoices):
    WAITING = "waiting", "Waiting"
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    RETURNED = "returned", "Returned"
    NOTIFIED = "notified", "Notified"
    SKIPPED = "skipped", "Skipped"


class AmendmentStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    WITHDRAWN = "withdrawn", "Withdrawn"


class AmendmentKind(models.TextChoices):
    CANCEL = "cancel", "Cancel"
    CHANGE = "change", "Change"


class Channel(models.TextChoices):
    IN_APP = "in_app", "In the application"
    VERBAL = "verbal", "Verbal"
    PAPER = "paper", "Paper"


class Decision(models.TextChoices):
    APPROVE = "approve", "Approve"
    REJECT = "reject", "Reject"
    RETURN = "return", "Return"


class RequestType(models.Model):
    code = models.SlugField(max_length=40, unique=True)
    name_fr = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120)
    description_fr = models.CharField(max_length=240, blank=True)
    description_en = models.CharField(max_length=240, blank=True)
    unit = models.CharField(max_length=8, choices=Unit.choices)
    allows_half_day = models.BooleanField(default=False)
    balance_effect = models.CharField(max_length=20, choices=BalanceEffect.choices, default=BalanceEffect.NONE)
    document_rule = models.CharField(max_length=32, choices=DocumentRule.choices, default=DocumentRule.NONE)
    document_deadline_hours = models.PositiveIntegerField(null=True, blank=True)
    allows_past_dates = models.BooleanField(default=False)
    notice_days = models.PositiveIntegerField(default=0)
    cap_quantity = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    cap_period = models.CharField(max_length=8, choices=CapPeriod.choices, default=CapPeriod.NONE)
    reduces_meal_tickets = models.BooleanField(default=False)
    calendar_label = models.CharField(max_length=8, choices=CalendarLabel.choices, default=CalendarLabel.ABSENT)
    is_sensitive = models.BooleanField(default=False)
    uses_events = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=100)

    class Meta:
        ordering = ["sort_order", "code"]

    def __str__(self) -> str:
        return self.code


class ChainStep(models.Model):
    request_type = models.ForeignKey(RequestType, on_delete=models.CASCADE, related_name="chain_steps")
    position = models.PositiveSmallIntegerField()
    approver_rule = models.CharField(max_length=16, choices=ApproverRule.choices)
    named_person = models.ForeignKey(
        "organisation.Employee", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    mode = models.CharField(max_length=8, choices=StepMode.choices, default=StepMode.APPROVE)
    reminder_after_days = models.PositiveSmallIntegerField(default=2)
    flag_after_days = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(fields=["request_type", "position"], name="requests_chainstep_unique_position")
        ]


class ExceptionalEvent(models.Model):
    name_fr = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120)
    days_allowed = models.DecimalField(max_digits=7, decimal_places=2)
    proof_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name_fr"]

    def __str__(self) -> str:
        return self.name_en
```

`backend/apps/requests/messages.py`. This is the complete catalogue of the app; later tasks use these codes and add none.

```python
"""Every text the requests app shows: problems, labels, history lines and notifications."""

_WHO_WHEN = {"en": "{employee}: {start} to {end}.", "fr": "{employee} : du {start} au {end}."}
_WHEN = {"en": "{start} to {end}.", "fr": "Du {start} au {end}."}

PROBLEMS = {
    "request.actor_without_record": {
        "en": "Your account is not linked to an employee record, so you cannot do this. Ask HR to link it.",
        "fr": "Votre compte n'est pas lié à une fiche employé, cette action est donc impossible. Demandez aux RH de le lier.",
    },
    "request.end_before_start": {
        "en": "The end date is before the start date. Choose an end date on or after the start.",
        "fr": "La date de fin précède la date de début. Choisissez une fin égale ou postérieure au début.",
    },
    "request.no_working_day": {
        "en": "These dates contain no working day. Choose dates that include at least one.",
        "fr": "Ces dates ne contiennent aucun jour ouvré. Choisissez des dates qui en incluent au moins un.",
    },
    "request.half_day_not_allowed": {
        "en": "This kind of request cannot start or end at midday. Remove the half-day.",
        "fr": "Ce type de demande ne peut pas commencer ni finir à la mi-journée. Retirez la demi-journée.",
    },
    "request.half_day_on_non_working_day": {
        "en": "A half-day can only be set on a working day. Move the date or remove the half-day.",
        "fr": "Une demi-journée ne peut porter que sur un jour ouvré. Déplacez la date ou retirez la demi-journée.",
    },
    "request.half_day_both_ends": {
        "en": "A single day cannot start and end at midday. Choose the morning or the afternoon.",
        "fr": "Une seule journée ne peut pas commencer et finir à la mi-journée. Choisissez le matin ou l'après-midi.",
    },
    "request.past_dates": {
        "en": "These dates are in the past. Choose a later start, or ask HR to enter the request for you.",
        "fr": "Ces dates sont passées. Choisissez un début ultérieur, ou demandez aux RH de saisir la demande pour vous.",
    },
    "request.notice": {
        "en": "This kind of request must be sent at least {days} days before it starts. Choose a later start.",
        "fr": "Ce type de demande doit être envoyé au moins {days} jours avant son début. Choisissez un début ultérieur.",
    },
    "request.overlap": {
        "en": "These dates overlap another of your requests ({other}). Change the dates or withdraw the other request.",
        "fr": "Ces dates chevauchent une autre de vos demandes ({other}). Modifiez les dates ou retirez l'autre demande.",
    },
    "request.balance_insufficient": {
        "en": "Your leave balance is short by {shortfall} days for these dates. Shorten the request, or ask HR for an exception.",
        "fr": "Il manque {shortfall} jours à votre solde pour ces dates. Raccourcissez la demande, ou demandez une exception aux RH.",
    },
    "request.cap_exceeded": {
        "en": "The limit is {limit} for this period and {used} are already taken. Choose other dates.",
        "fr": "La limite est de {limit} sur cette période et {used} sont déjà pris. Choisissez d'autres dates.",
    },
    "request.event_required": {
        "en": "Choose the event this leave is for.",
        "fr": "Choisissez l'événement auquel ce congé se rapporte.",
    },
    "request.event_days_exceeded": {
        "en": "This event allows {allowed} days. Shorten the request.",
        "fr": "Cet événement donne droit à {allowed} jours. Raccourcissez la demande.",
    },
    "request.permission_non_working_day": {
        "en": "A permission must be on a working day. Choose another date.",
        "fr": "Une autorisation doit porter sur un jour ouvré. Choisissez une autre date.",
    },
    "request.permission_times": {
        "en": "Give one date, a start time and a later end time, both on a quarter hour.",
        "fr": "Indiquez une seule date, une heure de début et une heure de fin postérieure, toutes deux au quart d'heure.",
    },
    "request.permission_overlaps_absence": {
        "en": "You are already absent on this half-day. Choose another time or date.",
        "fr": "Vous êtes déjà absent(e) sur cette demi-journée. Choisissez un autre horaire ou une autre date.",
    },
    "request.reason_required": {
        "en": "Give a reason.",
        "fr": "Indiquez un motif.",
    },
    "request.comment_required": {
        "en": "Add a comment so the person knows what to do.",
        "fr": "Ajoutez un commentaire pour que la personne sache quoi faire.",
    },
    "request.not_editable": {
        "en": "This request can no longer be changed here. Reload the page to see what is possible now.",
        "fr": "Cette demande ne peut plus être modifiée ici. Rechargez la page pour voir ce qui est possible.",
    },
    "request.not_withdrawable": {
        "en": "This request can no longer be withdrawn. If it is approved, ask for a change or a cancellation.",
        "fr": "Cette demande ne peut plus être retirée. Si elle est approuvée, demandez une modification ou une annulation.",
    },
    "request.already_processed": {
        "en": "Someone else has already acted on this request. Reload the page to see where it stands.",
        "fr": "Quelqu'un d'autre a déjà agi sur cette demande. Rechargez la page pour voir où elle en est.",
    },
    "request.own_request": {
        "en": "Nobody can act on their own request. Another person must do this.",
        "fr": "Nul ne peut agir sur sa propre demande. Une autre personne doit le faire.",
    },
    "request.not_started_only": {
        "en": "This request has already started, so it cannot be changed here. Ask HR to correct it.",
        "fr": "Cette demande a déjà commencé et ne peut plus être modifiée ici. Demandez aux RH de la corriger.",
    },
    "request.amendment_open": {
        "en": "A change is already waiting on this request. Wait for its outcome or withdraw it first.",
        "fr": "Une modification est déjà en attente sur cette demande. Attendez son issue ou retirez-la d'abord.",
    },
    "request.type_inactive": {
        "en": "This kind of request is no longer available. Choose another kind.",
        "fr": "Ce type de demande n'est plus disponible. Choisissez un autre type.",
    },
    "request.chain_needs_approver": {
        "en": "At least one step must decide. Set one step to approve.",
        "fr": "Au moins une étape doit décider. Mettez une étape en approbation.",
    },
    "request.named_person_required": {
        "en": "Choose the person for each step given to a named person.",
        "fr": "Choisissez la personne pour chaque étape confiée à une personne désignée.",
    },
    "request.step_delay_invalid": {
        "en": "Delays are counted in working days and must be at least 1.",
        "fr": "Les délais se comptent en jours ouvrés et doivent être d'au moins 1.",
    },
    "request.type_code_taken": {
        "en": "Another kind of request already uses this code. Choose a different code.",
        "fr": "Un autre type de demande utilise déjà ce code. Choisissez un code différent.",
    },
    "request.type_fixed": {
        "en": "The code and the unit of a kind of request cannot be changed. Create a new kind instead.",
        "fr": "Le code et l'unité d'un type de demande ne peuvent pas être modifiés. Créez plutôt un nouveau type.",
    },
    "request.type_half_day_hours": {
        "en": "A kind counted in hours cannot allow half-days. Turn half-days off.",
        "fr": "Un type compté en heures ne peut pas autoriser les demi-journées. Désactivez les demi-journées.",
    },
    "request.type_cap_incomplete": {
        "en": "Give both the limit and its period, or neither.",
        "fr": "Indiquez à la fois la limite et sa période, ou aucune des deux.",
    },
    "request.type_unknown": {
        "en": "This kind of request does not exist. Choose one from the list.",
        "fr": "Ce type de demande n'existe pas. Choisissez-en un dans la liste.",
    },
    "request.event_days_invalid": {
        "en": "The days allowed must be more than zero.",
        "fr": "Le nombre de jours accordés doit être supérieur à zéro.",
    },
    "request.scope_invalid": {
        "en": "Unknown list. Use mine, team, all or decided.",
        "fr": "Liste inconnue. Utilisez mine, team, all ou decided.",
    },
    "request.queue_invalid": {
        "en": "Unknown queue. Use mine, hr, certificates or stuck.",
        "fr": "File inconnue. Utilisez mine, hr, certificates ou stuck.",
    },
    "request.filter_invalid": {
        "en": "One of the filters has a value that cannot be read. Check the dates and the year.",
        "fr": "L'un des filtres a une valeur illisible. Vérifiez les dates et l'année.",
    },
    "request.amendment_cannot_return": {
        "en": "A change to an approved request can be approved or refused, not sent back.",
        "fr": "Une modification d'une demande approuvée peut être approuvée ou refusée, pas renvoyée.",
    },
    "request.decided_at_future": {
        "en": "The decision cannot be dated in the future. Give the date and time it was made.",
        "fr": "La décision ne peut pas être datée dans le futur. Indiquez la date et l'heure où elle a été prise.",
    },
    "request.channel_invalid": {
        "en": "Say how the decision was given: verbally or on paper.",
        "fr": "Précisez comment la décision a été donnée : oralement ou sur papier.",
    },
    "request.approver_without_account": {
        "en": "This person has no active account and could not decide. Choose someone else.",
        "fr": "Cette personne n'a pas de compte actif et ne pourrait pas décider. Choisissez quelqu'un d'autre.",
    },
    "request.dates_required": {
        "en": "Give the new dates.",
        "fr": "Indiquez les nouvelles dates.",
    },
    "request.nothing_to_change": {
        "en": "The new dates are the same as the current ones. Change something or cancel.",
        "fr": "Les nouvelles dates sont identiques aux dates actuelles. Modifiez quelque chose ou annulez.",
    },
    "request.not_reclassifiable": {
        "en": "Only a sick leave waiting for HR can be counted as annual leave.",
        "fr": "Seul un arrêt maladie en attente des RH peut être compté en congé annuel.",
    },
}

LABELS = {
    "request.label_hr": {"en": "HR", "fr": "RH"},
}

HISTORY = {
    "request.history_request_created": {"en": "Request created", "fr": "Demande créée"},
    "request.history_request_updated": {"en": "Request edited", "fr": "Demande modifiée"},
    "request.history_request_submitted": {"en": "Request sent", "fr": "Demande envoyée"},
    "request.history_request_withdrawn": {"en": "Request withdrawn", "fr": "Demande retirée"},
    "request.history_request_approved": {"en": "Request approved", "fr": "Demande approuvée"},
    "request.history_request_rejected": {"en": "Request refused", "fr": "Demande refusée"},
    "request.history_request_returned": {"en": "Request sent back for correction", "fr": "Demande renvoyée pour correction"},
    "request.history_step_decided": {"en": "Decision recorded", "fr": "Décision enregistrée"},
    "request.history_step_recorded_on_behalf": {
        "en": "Decision entered by HR on someone's behalf",
        "fr": "Décision saisie par les RH au nom d'un tiers",
    },
    "request.history_step_reassigned": {"en": "Step given to someone else", "fr": "Étape confiée à une autre personne"},
    "request.history_amendment_opened": {"en": "Change requested", "fr": "Modification demandée"},
    "request.history_amendment_withdrawn": {"en": "Change withdrawn", "fr": "Modification retirée"},
    "request.history_amendment_approved": {"en": "Change approved", "fr": "Modification approuvée"},
    "request.history_amendment_rejected": {"en": "Change refused", "fr": "Modification refusée"},
    "request.history_request_corrected": {"en": "Corrected by HR", "fr": "Corrigée par les RH"},
    "request.history_request_cancelled": {"en": "Cancelled by HR", "fr": "Annulée par les RH"},
    "request.history_request_reclassified": {
        "en": "Counted as annual leave by HR",
        "fr": "Comptée en congé annuel par les RH",
    },
    "request.history_request_attachment_added": {"en": "File added", "fr": "Fichier ajouté"},
}

NOTIFICATIONS = {
    "notification.step.to_decide.title": {
        "en": "A request is waiting for your decision",
        "fr": "Une demande attend votre décision",
    },
    "notification.step.to_decide.body": _WHO_WHEN,
    "notification.step.reminder.title": {
        "en": "Reminder: a request is still waiting for you",
        "fr": "Rappel : une demande vous attend toujours",
    },
    "notification.step.reminder.body": _WHO_WHEN,
    "notification.step.flagged.title": {
        "en": "A request is stuck with a manager",
        "fr": "Une demande est bloquée chez un responsable",
    },
    "notification.step.flagged.body": {
        "en": "{employee}: {start} to {end}. Nobody has decided yet.",
        "fr": "{employee} : du {start} au {end}. Personne n'a encore décidé.",
    },
    "notification.step.informed.title": {
        "en": "For your information: a request was sent",
        "fr": "Pour information : une demande a été envoyée",
    },
    "notification.step.informed.body": _WHO_WHEN,
    "notification.request.approved.title": {"en": "Your request is approved", "fr": "Votre demande est approuvée"},
    "notification.request.approved.body": _WHEN,
    "notification.request.rejected.title": {"en": "Your request was refused", "fr": "Votre demande a été refusée"},
    "notification.request.rejected.body": {
        "en": "{start} to {end}. Open it to read the reason.",
        "fr": "Du {start} au {end}. Ouvrez-la pour lire le motif.",
    },
    "notification.request.returned.title": {
        "en": "Your request was sent back to you",
        "fr": "Votre demande vous a été renvoyée",
    },
    "notification.request.returned.body": {
        "en": "{start} to {end}. Open it to read the comment, then correct it and send it again.",
        "fr": "Du {start} au {end}. Ouvrez-la pour lire le commentaire, puis corrigez-la et renvoyez-la.",
    },
    "notification.request.withdrawn.title": {"en": "A request was withdrawn", "fr": "Une demande a été retirée"},
    "notification.request.withdrawn.body": _WHO_WHEN,
    "notification.request.cancelled.title": {
        "en": "A request was cancelled by HR",
        "fr": "Une demande a été annulée par les RH",
    },
    "notification.request.cancelled.body": _WHO_WHEN,
    "notification.request.corrected.title": {
        "en": "A request was changed by HR",
        "fr": "Une demande a été modifiée par les RH",
    },
    "notification.request.corrected.body": _WHO_WHEN,
    "notification.amendment.submitted.title": {
        "en": "A change to an approved request is waiting for your decision",
        "fr": "Une modification d'une demande approuvée attend votre décision",
    },
    "notification.amendment.submitted.body": _WHO_WHEN,
    "notification.amendment.approved.title": {"en": "Your change is approved", "fr": "Votre modification est approuvée"},
    "notification.amendment.approved.body": _WHEN,
    "notification.amendment.rejected.title": {"en": "Your change was refused", "fr": "Votre modification a été refusée"},
    "notification.amendment.rejected.body": {
        "en": "The original request stays valid: {start} to {end}.",
        "fr": "La demande initiale reste valable : du {start} au {end}.",
    },
    "notification.sick.declared.title": {"en": "Sick leave reported", "fr": "Arrêt maladie déclaré"},
    "notification.sick.declared.body": _WHO_WHEN,
    "notification.certificate.due_soon.title": {
        "en": "Your medical certificate is due soon",
        "fr": "Votre certificat médical est bientôt attendu",
    },
    "notification.certificate.due_soon.body": {
        "en": "Sick leave from {start} to {end}. Add the certificate before {due}.",
        "fr": "Arrêt du {start} au {end}. Ajoutez le certificat avant le {due}.",
    },
    "notification.certificate.overdue.title": {
        "en": "A medical certificate is overdue",
        "fr": "Un certificat médical est en retard",
    },
    "notification.certificate.overdue.body": _WHO_WHEN,
    "notification.delegation.prompt.title": {
        "en": "Name a delegate for your absence",
        "fr": "Désignez un délégué pour votre absence",
    },
    "notification.delegation.prompt.body": {
        "en": "You will be away from {start} to {end}. A delegate can decide your team's requests meanwhile.",
        "fr": "Vous serez absent(e) du {start} au {end}. Un délégué peut décider des demandes de votre équipe pendant ce temps.",
    },
    "notification.hr_step.unattended.title": {
        "en": "A request has nobody to validate it",
        "fr": "Une demande n'a personne pour la valider",
    },
    "notification.hr_step.unattended.body": {
        "en": "No HR or executive account can act on a request waiting for HR. Give the HR role to someone.",
        "fr": "Aucun compte RH ou direction ne peut agir sur une demande en attente des RH. Attribuez le rôle RH à quelqu'un.",
    },
}

MESSAGES = {**PROBLEMS, **LABELS, **HISTORY, **NOTIFICATIONS}
```

In `backend/config/settings.py`, append one line to `INSTALLED_APPS`, after `"apps.calendar",`:

```python
    "apps.requests",
```

- [ ] **Step 2: Generate the schema migration and write the seed migration**

Run: `docker compose run --rm app python manage.py makemigrations requests`
Expected: `apps/requests/migrations/0001_initial.py` with `+ Create model ExceptionalEvent`, `+ Create model RequestType`, `+ Create model ChainStep`.

`backend/apps/requests/migrations/0002_seed_types.py`:

```python
from django.db import migrations

MANAGER_THEN_HR = [("line_manager", "approve", 2, 4), ("hr_role", "approve", 2, None)]

TYPES = [
    {
        "code": "annual",
        "name_fr": "Congé annuel",
        "name_en": "Annual leave",
        "description_fr": "Jours de repos payés, déduits de votre solde.",
        "description_en": "Paid days off, taken from your balance.",
        "unit": "day",
        "allows_half_day": True,
        "balance_effect": "deducts_annual",
        "document_rule": "none",
        "allows_past_dates": False,
        "reduces_meal_tickets": True,
        "calendar_label": "absent",
        "is_sensitive": False,
        "uses_events": False,
        "sort_order": 10,
        "chain": MANAGER_THEN_HR,
    },
    {
        "code": "sick",
        "name_fr": "Congé maladie",
        "name_en": "Sick leave",
        "description_fr": "Vous êtes malade. Déclarez maintenant, le certificat peut suivre.",
        "description_en": "You are ill. Report it now; the certificate can follow.",
        "unit": "day",
        "allows_half_day": True,
        "balance_effect": "none",
        "document_rule": "required_within_deadline",
        "allows_past_dates": True,
        "reduces_meal_tickets": True,
        "calendar_label": "absent",
        "is_sensitive": True,
        "uses_events": False,
        "sort_order": 20,
        "chain": [("line_manager", "notify", 2, None), ("hr_role", "approve", 2, None)],
    },
    {
        "code": "exceptional",
        "name_fr": "Congé exceptionnel",
        "name_en": "Exceptional leave",
        "description_fr": "Un événement familial qui donne droit à des jours.",
        "description_en": "A family event that gives a fixed number of days.",
        "unit": "day",
        "allows_half_day": False,
        "balance_effect": "none",
        "document_rule": "none",
        "allows_past_dates": False,
        "reduces_meal_tickets": True,
        "calendar_label": "absent",
        "is_sensitive": False,
        "uses_events": True,
        "sort_order": 30,
        "chain": MANAGER_THEN_HR,
    },
    {
        "code": "permission",
        "name_fr": "Autorisation de sortie",
        "name_en": "Hourly permission",
        "description_fr": "Quelques heures d'absence dans une journée.",
        "description_en": "A few hours away during a working day.",
        "unit": "hour",
        "allows_half_day": False,
        "balance_effect": "none",
        "document_rule": "none",
        "allows_past_dates": False,
        "reduces_meal_tickets": False,
        "calendar_label": "hidden",
        "is_sensitive": False,
        "uses_events": False,
        "sort_order": 40,
        "chain": MANAGER_THEN_HR,
    },
    {
        "code": "remote",
        "name_fr": "Télétravail",
        "name_en": "Remote work",
        "description_fr": "Travailler à distance un jour donné.",
        "description_en": "Work from elsewhere on a given day.",
        "unit": "day",
        "allows_half_day": True,
        "balance_effect": "none",
        "document_rule": "none",
        "allows_past_dates": False,
        "cap_quantity": "2.00",
        "cap_period": "week",
        "reduces_meal_tickets": False,
        "calendar_label": "remote",
        "is_sensitive": False,
        "uses_events": False,
        "sort_order": 50,
        "chain": MANAGER_THEN_HR,
    },
]

CODES = [spec["code"] for spec in TYPES]


def seed(apps, schema_editor):
    RequestType = apps.get_model("requests", "RequestType")
    ChainStep = apps.get_model("requests", "ChainStep")
    for spec in TYPES:
        values = {key: value for key, value in spec.items() if key != "chain"}
        request_type, created = RequestType.objects.get_or_create(code=values["code"], defaults=values)
        if not created:
            continue
        for position, (rule, mode, reminder, flag) in enumerate(spec["chain"], start=1):
            ChainStep.objects.create(
                request_type=request_type,
                position=position,
                approver_rule=rule,
                mode=mode,
                reminder_after_days=reminder,
                flag_after_days=flag,
            )


def unseed(apps, schema_editor):
    RequestType = apps.get_model("requests", "RequestType")
    RequestType.objects.filter(code__in=CODES).delete()


class Migration(migrations.Migration):
    dependencies = [("requests", "0001_initial")]

    operations = [migrations.RunPython(seed, unseed)]
```

Run: `docker compose run --rm app python manage.py migrate`
Expected: `Applying requests.0001_initial... OK` and `Applying requests.0002_seed_types... OK`.

- [ ] **Step 3: Extend the standard cast**

`backend/apps/requests/tests/world.py`:

```python
from decimal import Decimal
from importlib import import_module

from django.apps import apps as django_apps

from apps.requests.models import ExceptionalEvent, RequestType

TYPE_CODES = ("annual", "sick", "exceptional", "permission", "remote")


def ensure_seeded_types() -> None:
    """Put the five seeded request types back when a test emptied the tables.

    A transactional test ends by emptying every table, including the rows a data migration created
    (plan 01a, contract note 27). The migration's own function is reused, so the data exists once.
    """
    if RequestType.objects.filter(code__in=TYPE_CODES).count() == len(TYPE_CODES):
        return
    import_module("apps.requests.migrations.0002_seed_types").seed(django_apps, None)


def build(world) -> None:
    """Add the five seeded request types and one exceptional event to the standard cast."""
    ensure_seeded_types()
    for code in TYPE_CODES:
        setattr(world, code, RequestType.objects.get(code=code))
    world.event = ExceptionalEvent.objects.create(
        name_fr="Mariage", name_en="Marriage", days_allowed=Decimal("3"), proof_required=True
    )
```

In `backend/tests/world.py`, add the import after the organisation import, and the call in `build_world()` after `organisation_world.build(world)` and before `return world`:

```python
from apps.requests.tests import world as requests_world
```

```python
    requests_world.build(world)
```

- [ ] **Step 4: Write the failing service tests**

`backend/apps/requests/tests/test_config.py`:

```python
from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import DomainError
from apps.requests import services
from apps.requests.models import ChainStep, ExceptionalEvent, RequestType
from apps.requests.services import StepSpec

pytestmark = pytest.mark.django_db


def chain(request_type: RequestType) -> list[tuple]:
    return [
        (step.position, step.approver_rule, step.mode, step.reminder_after_days, step.flag_after_days)
        for step in request_type.chain_steps.order_by("position")
    ]


NEW_TYPE = {"code": "mission", "name_fr": "Mission", "name_en": "Business trip", "unit": "day"}


def test_five_types_are_seeded_as_in_the_prd_table(world):
    annual, sick, exceptional = world.annual, world.sick, world.exceptional
    permission, remote = world.permission, world.remote
    assert (annual.unit, annual.allows_half_day, annual.balance_effect, annual.calendar_label) == (
        "day", True, "deducts_annual", "absent",
    )
    assert (sick.document_rule, sick.is_sensitive, sick.allows_past_dates, sick.balance_effect) == (
        "required_within_deadline", True, True, "none",
    )
    assert sick.document_deadline_hours is None
    assert (exceptional.uses_events, exceptional.allows_half_day) == (True, False)
    assert (permission.unit, permission.calendar_label) == ("hour", "hidden")
    assert (remote.cap_quantity, remote.cap_period, remote.calendar_label) == (Decimal("2.00"), "week", "remote")
    assert [t.reduces_meal_tickets for t in (annual, sick, exceptional, permission, remote)] == [
        True, True, True, False, False,
    ]


def test_seeded_chains_are_manager_then_hr_and_sick_leave_only_informs_the_manager(world):
    manager_then_hr = [(1, "line_manager", "approve", 2, 4), (2, "hr_role", "approve", 2, None)]
    for request_type in (world.annual, world.exceptional, world.permission, world.remote):
        assert chain(request_type) == manager_then_hr
    assert chain(world.sick) == [(1, "line_manager", "notify", 2, None), (2, "hr_role", "approve", 2, None)]


def test_a_new_type_gets_the_default_chain_and_is_audited(world):
    created = services.create_request_type(actor=world.hr_user, data=NEW_TYPE)
    assert created.is_active is True
    assert chain(created) == [(1, "line_manager", "approve", 2, 4), (2, "hr_role", "approve", 2, None)]
    assert AuditEvent.objects.filter(action="requesttype.created", object_id=str(created.pk)).exists()


def test_a_type_code_is_unique(world):
    with pytest.raises(DomainError) as error:
        services.create_request_type(actor=world.hr_user, data={**NEW_TYPE, "code": "annual"})
    assert error.value.code == "request.type_code_taken"


def test_an_hour_type_cannot_allow_half_days(world):
    with pytest.raises(DomainError) as error:
        services.create_request_type(
            actor=world.hr_user, data={**NEW_TYPE, "unit": "hour", "allows_half_day": True}
        )
    assert error.value.code == "request.type_half_day_hours"


def test_a_limit_needs_its_period(world):
    with pytest.raises(DomainError) as error:
        services.create_request_type(actor=world.hr_user, data={**NEW_TYPE, "cap_quantity": Decimal("3")})
    assert error.value.code == "request.type_cap_incomplete"


def test_update_changes_attributes_but_never_code_or_unit(world):
    updated = services.update_request_type(
        actor=world.hr_user, request_type=world.remote, data={"cap_quantity": Decimal("3"), "notice_days": 1}
    )
    assert (updated.cap_quantity, updated.notice_days) == (Decimal("3"), 1)
    assert AuditEvent.objects.filter(action="requesttype.updated", object_id=str(world.remote.pk)).exists()
    with pytest.raises(DomainError) as error:
        services.update_request_type(actor=world.hr_user, request_type=world.remote, data={"unit": "hour"})
    assert error.value.code == "request.type_fixed"


def test_replace_steps_renumbers_and_is_audited(world):
    steps = services.replace_steps(
        actor=world.hr_user,
        request_type=world.remote,
        steps=[
            StepSpec(approver_rule="named_person", named_person=world.other_manager, reminder_after_days=1),
            StepSpec(approver_rule="hr_role", mode="notify"),
        ],
    )
    assert [(s.position, s.approver_rule, s.named_person_id, s.mode) for s in steps] == [
        (1, "named_person", world.other_manager.pk, "approve"),
        (2, "hr_role", None, "notify"),
    ]
    assert ChainStep.objects.filter(request_type=world.remote).count() == 2
    assert AuditEvent.objects.filter(action="requesttype.steps_replaced").exists()


def test_a_chain_needs_at_least_one_step_that_decides(world):
    with pytest.raises(DomainError) as error:
        services.replace_steps(
            actor=world.hr_user, request_type=world.remote, steps=[StepSpec(approver_rule="hr_role", mode="notify")]
        )
    assert error.value.code == "request.chain_needs_approver"
    assert len(chain(world.remote)) == 2


def test_a_named_person_step_needs_the_person(world):
    with pytest.raises(DomainError) as error:
        services.replace_steps(
            actor=world.hr_user, request_type=world.remote, steps=[StepSpec(approver_rule="named_person")]
        )
    assert error.value.code == "request.named_person_required"


def test_step_delays_must_be_at_least_one_working_day(world):
    with pytest.raises(DomainError) as error:
        services.replace_steps(
            actor=world.hr_user,
            request_type=world.remote,
            steps=[StepSpec(approver_rule="hr_role", reminder_after_days=0)],
        )
    assert error.value.code == "request.step_delay_invalid"


def test_events_are_created_and_updated_with_an_audit_record(world):
    event = services.create_event(
        actor=world.hr_user, name_fr="Naissance", name_en="Birth", days_allowed=Decimal("2"), proof_required=True
    )
    assert ExceptionalEvent.objects.filter(pk=event.pk, is_active=True).exists()
    updated = services.update_event(actor=world.hr_user, event=event, days_allowed=Decimal("3"), is_active=False)
    assert (updated.days_allowed, updated.is_active) == (Decimal("3"), False)
    assert AuditEvent.objects.filter(action="exceptionalevent.created").count() == 1
    assert AuditEvent.objects.filter(action="exceptionalevent.updated").count() == 1


def test_an_event_must_allow_more_than_zero_days(world):
    with pytest.raises(DomainError) as error:
        services.create_event(actor=world.hr_user, name_fr="X", name_en="X", days_allowed=Decimal("0"))
    assert error.value.code == "request.event_days_invalid"
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_config.py -v`
Expected: collection error, `ImportError: cannot import name 'services' from 'apps.requests'`.

- [ ] **Step 6: Implement the configuration services and selectors**

`backend/apps/requests/services/config.py`:

```python
from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db import transaction

from apps.audit import services as audit
from apps.core.errors import DomainError

from ..models import ApproverRule, CapPeriod, ChainStep, ExceptionalEvent, RequestType, StepMode, Unit

TYPE_FIELDS = (
    "code", "name_fr", "name_en", "description_fr", "description_en", "unit", "allows_half_day",
    "balance_effect", "document_rule", "document_deadline_hours", "allows_past_dates", "notice_days",
    "cap_quantity", "cap_period", "reduces_meal_tickets", "calendar_label", "is_sensitive", "uses_events",
    "is_active", "sort_order",
)
TYPE_DEFAULTS: dict[str, Any] = {
    "description_fr": "", "description_en": "", "allows_half_day": False, "balance_effect": "none",
    "document_rule": "none", "document_deadline_hours": None, "allows_past_dates": False, "notice_days": 0,
    "cap_quantity": None, "cap_period": "none", "reduces_meal_tickets": False, "calendar_label": "absent",
    "is_sensitive": False, "uses_events": False, "is_active": True, "sort_order": 100,
}
FIXED_FIELDS = ("code", "unit")
EVENT_FIELDS = ("name_fr", "name_en", "days_allowed", "proof_required", "is_active")


@dataclass(frozen=True)
class StepSpec:
    """One step of a chain as HR configures it. `named_person` is an organisation.Employee or None."""

    approver_rule: str
    mode: str = StepMode.APPROVE
    named_person: Any = None
    reminder_after_days: int = 2
    flag_after_days: int | None = None


def _check_type(values: Mapping[str, Any]) -> None:
    if values["unit"] == Unit.HOUR and values["allows_half_day"]:
        raise DomainError("request.type_half_day_hours", field="allows_half_day")
    has_cap = values["cap_quantity"] is not None
    has_period = values["cap_period"] != CapPeriod.NONE
    if has_cap != has_period:
        raise DomainError("request.type_cap_incomplete", field="cap_quantity")


@transaction.atomic
def create_request_type(*, actor, data: Mapping[str, Any]) -> RequestType:
    values = {**TYPE_DEFAULTS, **data}
    if RequestType.objects.filter(code=values["code"]).exists():
        raise DomainError("request.type_code_taken", field="code")
    _check_type(values)
    request_type = RequestType.objects.create(**{field: values[field] for field in TYPE_FIELDS})
    ChainStep.objects.create(
        request_type=request_type, position=1, approver_rule=ApproverRule.LINE_MANAGER,
        mode=StepMode.APPROVE, reminder_after_days=2, flag_after_days=4,
    )
    ChainStep.objects.create(
        request_type=request_type, position=2, approver_rule=ApproverRule.HR_ROLE,
        mode=StepMode.APPROVE, reminder_after_days=2, flag_after_days=None,
    )
    audit.record(
        action="requesttype.created",
        obj=request_type,
        object_label=request_type.code,
        changes=audit.diff(dict.fromkeys(TYPE_FIELDS), audit.snapshot(request_type, TYPE_FIELDS)),
        actor=actor,
    )
    return request_type


@transaction.atomic
def update_request_type(*, actor, request_type: RequestType, data: Mapping[str, Any]) -> RequestType:
    for field in FIXED_FIELDS:
        if field in data and data[field] != getattr(request_type, field):
            raise DomainError("request.type_fixed", field=field)
    before = audit.snapshot(request_type, TYPE_FIELDS)
    for field in TYPE_FIELDS:
        if field in data:
            setattr(request_type, field, data[field])
    _check_type({field: getattr(request_type, field) for field in TYPE_FIELDS})
    request_type.save()
    audit.record(
        action="requesttype.updated",
        obj=request_type,
        object_label=request_type.code,
        changes=audit.diff(before, audit.snapshot(request_type, TYPE_FIELDS)),
        actor=actor,
    )
    return request_type


def _describe_chain(request_type: RequestType) -> list[dict[str, Any]]:
    return [
        {
            "position": step.position,
            "approver_rule": step.approver_rule,
            "mode": step.mode,
            "named_person_id": step.named_person_id,
            "reminder_after_days": step.reminder_after_days,
            "flag_after_days": step.flag_after_days,
        }
        for step in ChainStep.objects.filter(request_type=request_type).order_by("position")
    ]


@transaction.atomic
def replace_steps(*, actor, request_type: RequestType, steps: Sequence[StepSpec]) -> list[ChainStep]:
    """Replace the whole chain of a type. Requests already submitted keep the chain they were sent with."""
    if not any(step.mode == StepMode.APPROVE for step in steps):
        raise DomainError("request.chain_needs_approver", field="steps")
    for step in steps:
        if step.approver_rule == ApproverRule.NAMED_PERSON and step.named_person is None:
            raise DomainError("request.named_person_required", field="steps")
        if step.reminder_after_days < 1 or (step.flag_after_days is not None and step.flag_after_days < 1):
            raise DomainError("request.step_delay_invalid", field="steps")
    before = _describe_chain(request_type)
    ChainStep.objects.filter(request_type=request_type).delete()
    created = [
        ChainStep.objects.create(
            request_type=request_type,
            position=position,
            approver_rule=step.approver_rule,
            mode=step.mode,
            named_person=step.named_person if step.approver_rule == ApproverRule.NAMED_PERSON else None,
            reminder_after_days=step.reminder_after_days,
            flag_after_days=step.flag_after_days,
        )
        for position, step in enumerate(steps, start=1)
    ]
    audit.record(
        action="requesttype.steps_replaced",
        obj=request_type,
        object_label=request_type.code,
        changes={"steps": {"before": before, "after": _describe_chain(request_type)}},
        actor=actor,
    )
    return created


@transaction.atomic
def create_event(
    *, actor, name_fr: str, name_en: str, days_allowed: Decimal, proof_required: bool = False, is_active: bool = True
) -> ExceptionalEvent:
    if days_allowed <= 0:
        raise DomainError("request.event_days_invalid", field="days_allowed")
    event = ExceptionalEvent.objects.create(
        name_fr=name_fr.strip(), name_en=name_en.strip(), days_allowed=days_allowed,
        proof_required=proof_required, is_active=is_active,
    )
    audit.record(
        action="exceptionalevent.created",
        obj=event,
        object_label=event.name_fr,
        changes=audit.diff(dict.fromkeys(EVENT_FIELDS), audit.snapshot(event, EVENT_FIELDS)),
        actor=actor,
    )
    return event


@transaction.atomic
def update_event(*, actor, event: ExceptionalEvent, **fields: Any) -> ExceptionalEvent:
    unknown = set(fields) - set(EVENT_FIELDS)
    if unknown:
        raise TypeError(f"unknown event fields: {sorted(unknown)}")
    if "days_allowed" in fields and fields["days_allowed"] <= 0:
        raise DomainError("request.event_days_invalid", field="days_allowed")
    before = audit.snapshot(event, EVENT_FIELDS)
    for field, value in fields.items():
        setattr(event, field, value.strip() if isinstance(value, str) else value)
    event.save()
    audit.record(
        action="exceptionalevent.updated",
        obj=event,
        object_label=event.name_fr,
        changes=audit.diff(before, audit.snapshot(event, EVENT_FIELDS)),
        actor=actor,
    )
    return event
```

`backend/apps/requests/services/__init__.py`:

```python
"""The write side of the request engine. Import names from here: `from apps.requests import services`."""

from .config import (
    StepSpec,
    create_event,
    create_request_type,
    replace_steps,
    update_event,
    update_request_type,
)

__all__ = [
    "StepSpec",
    "create_event",
    "create_request_type",
    "replace_steps",
    "update_event",
    "update_request_type",
]
```

Later tasks add import lines to this file. Each of them gives the exact line; keep `__all__` in step by adding the same names.

`backend/apps/requests/selectors.py`:

```python
from __future__ import annotations

from django.db.models import QuerySet

from apps.core.errors import DomainError, NotFound

from .models import ExceptionalEvent, RequestType


def request_types(*, active_only: bool) -> QuerySet[RequestType]:
    types = RequestType.objects.order_by("sort_order", "code")
    return types.filter(is_active=True) if active_only else types


def get_type(pk: int) -> RequestType:
    request_type = RequestType.objects.filter(pk=pk).first()
    if request_type is None:
        raise NotFound("core.not_found")
    return request_type


def get_type_by_code(code: str) -> RequestType:
    request_type = RequestType.objects.filter(code=code).first()
    if request_type is None:
        raise DomainError("request.type_unknown", field="type")
    return request_type


def events(*, active_only: bool) -> QuerySet[ExceptionalEvent]:
    found = ExceptionalEvent.objects.order_by("name_fr")
    return found.filter(is_active=True) if active_only else found


def get_event(pk: int) -> ExceptionalEvent:
    event = ExceptionalEvent.objects.filter(pk=pk).first()
    if event is None:
        raise NotFound("core.not_found")
    return event
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_config.py -v`
Expected: 13 passed.

- [ ] **Step 8: Write the failing API tests**

`backend/apps/requests/tests/test_config_api.py`:

```python
import pytest
from django.urls import reverse

from apps.requests.models import ExceptionalEvent

pytestmark = pytest.mark.django_db


def english(user):
    user.language = "en"
    user.save(update_fields=["language"])
    return user


def test_an_employee_sees_only_active_types_named_in_their_language(world, client_for):
    world.remote.is_active = False
    world.remote.save()
    response = client_for(english(world.owner_user)).get(reverse("requests:type-list"))
    assert response.status_code == 200
    body = response.json()
    assert [item["code"] for item in body] == ["annual", "sick", "exceptional", "permission"]
    assert body[0]["name"] == "Annual leave"
    assert body[0]["description"] == "Paid days off, taken from your balance."
    assert body[0]["unit"] == "day"


def test_hr_sees_inactive_types_unless_it_asks_for_active_ones(world, client_for):
    world.remote.is_active = False
    world.remote.save()
    client = client_for(world.hr_user)
    assert len(client.get(reverse("requests:type-list")).json()) == 5
    assert len(client.get(reverse("requests:type-list"), {"active": "1"}).json()) == 4


def test_hr_creates_and_edits_a_type(world, client_for):
    client = client_for(world.hr_user)
    created = client.post(
        reverse("requests:type-list"),
        {"code": "mission", "name_fr": "Mission", "name_en": "Business trip", "unit": "day"},
        format="json",
    )
    assert created.status_code == 201
    type_id = created.json()["id"]
    edited = client.patch(
        reverse("requests:type-detail", kwargs={"pk": type_id}), {"notice_days": 3, "is_active": False}, format="json"
    )
    assert edited.status_code == 200
    assert (edited.json()["notice_days"], edited.json()["is_active"]) == (3, False)
    assert client.get(reverse("requests:type-detail", kwargs={"pk": type_id})).json()["code"] == "mission"


def test_a_duplicate_code_is_a_field_problem(world, client_for):
    response = client_for(world.hr_user).post(
        reverse("requests:type-list"),
        {"code": "annual", "name_fr": "X", "name_en": "X", "unit": "day"},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "request.type_code_taken"
    assert response.json()["errors"][0]["field"] == "code"


def test_hr_reads_and_replaces_the_steps_of_a_type(world, client_for):
    client = client_for(world.hr_user)
    url = reverse("requests:type-steps", kwargs={"pk": world.remote.pk})
    assert [step["approver_rule"] for step in client.get(url).json()] == ["line_manager", "hr_role"]
    response = client.put(
        url,
        {
            "steps": [
                {"approver_rule": "named_person", "named_person": str(world.other_manager.public_id), "mode": "approve"},
                {"approver_rule": "hr_role", "mode": "notify", "reminder_after_days": 3},
            ]
        },
        format="json",
    )
    assert response.status_code == 200
    first, second = response.json()
    assert first["position"] == 1
    assert first["named_person"]["public_id"] == str(world.other_manager.public_id)
    assert first["flag_after_days"] is None
    assert (second["mode"], second["reminder_after_days"], second["named_person"]) == ("notify", 3, None)


def test_steps_without_an_approver_are_refused(world, client_for):
    response = client_for(world.hr_user).put(
        reverse("requests:type-steps", kwargs={"pk": world.remote.pk}),
        {"steps": [{"approver_rule": "hr_role", "mode": "notify"}]},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "request.chain_needs_approver"


def test_an_unknown_named_person_is_a_field_problem(world, client_for):
    response = client_for(world.hr_user).put(
        reverse("requests:type-steps", kwargs={"pk": world.remote.pk}),
        {
            "steps": [
                {
                    "approver_rule": "named_person",
                    "named_person": "00000000-0000-0000-0000-000000000000",
                    "mode": "approve",
                }
            ]
        },
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "request.named_person_required"


def test_employees_see_active_events_and_hr_sees_all(world, client_for):
    ExceptionalEvent.objects.create(name_fr="Ancien", name_en="Old", days_allowed=1, is_active=False)
    seen = client_for(english(world.owner_user)).get(reverse("requests:event-list")).json()
    assert [(item["name"], item["days_allowed"], item["proof_required"]) for item in seen] == [("Marriage", "3.00", True)]
    assert len(client_for(world.hr_user).get(reverse("requests:event-list")).json()) == 2


def test_hr_creates_and_edits_an_event(world, client_for):
    client = client_for(world.hr_user)
    created = client.post(
        reverse("requests:event-list"),
        {"name_fr": "Naissance", "name_en": "Birth", "days_allowed": "2", "proof_required": True},
        format="json",
    )
    assert created.status_code == 201
    edited = client.patch(
        reverse("requests:event-detail", kwargs={"pk": created.json()["id"]}), {"is_active": False}, format="json"
    )
    assert edited.status_code == 200
    assert (edited.json()["is_active"], edited.json()["days_allowed"]) == (False, "2.00")
```

- [ ] **Step 9: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_config_api.py -v`
Expected: 9 failed with `NoReverseMatch: 'requests' is not a registered namespace`.

- [ ] **Step 10: Implement the configuration API**

`backend/apps/requests/api/serializers.py`:

```python
from decimal import Decimal

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.calendar.lang import pick
from apps.organisation import selectors as organisation_selectors

from ..models import ApproverRule, ChainStep, ExceptionalEvent, RequestType, StepMode
from ..services.config import TYPE_FIELDS


# ---------------------------------------------------------------- configuration


class RequestTypeOut(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()

    class Meta:
        model = RequestType
        fields = ["id", *TYPE_FIELDS, "name", "description"]

    @extend_schema_field(serializers.CharField())
    def get_name(self, request_type: RequestType) -> str:
        return pick(request_type.name_fr, request_type.name_en)

    @extend_schema_field(serializers.CharField())
    def get_description(self, request_type: RequestType) -> str:
        return pick(request_type.description_fr, request_type.description_en)


class RequestTypeIn(serializers.ModelSerializer):
    class Meta:
        model = RequestType
        fields = list(TYPE_FIELDS)
        # The service reports a taken code with its own problem code.
        extra_kwargs = {"code": {"validators": []}}


class NamedPersonOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    name = serializers.CharField()


class ChainStepOut(serializers.ModelSerializer):
    named_person = serializers.SerializerMethodField()

    class Meta:
        model = ChainStep
        fields = ["id", "position", "approver_rule", "named_person", "mode", "reminder_after_days", "flag_after_days"]

    @extend_schema_field(NamedPersonOut(allow_null=True))
    def get_named_person(self, step: ChainStep):
        if step.named_person_id is None:
            return None
        person = step.named_person
        return {"public_id": str(person.public_id), "name": organisation_selectors.full_name(person)}


class ChainStepIn(serializers.Serializer):
    approver_rule = serializers.ChoiceField(choices=ApproverRule.choices)
    named_person = serializers.UUIDField(required=False, allow_null=True, default=None)
    mode = serializers.ChoiceField(choices=StepMode.choices)
    reminder_after_days = serializers.IntegerField(min_value=1, max_value=60, required=False, default=2)
    flag_after_days = serializers.IntegerField(min_value=1, max_value=60, required=False, allow_null=True, default=None)


class ChainStepsIn(serializers.Serializer):
    steps = ChainStepIn(many=True, allow_empty=False)


class ExceptionalEventOut(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = ExceptionalEvent
        fields = ["id", "name_fr", "name_en", "name", "days_allowed", "proof_required", "is_active"]

    @extend_schema_field(serializers.CharField())
    def get_name(self, event: ExceptionalEvent) -> str:
        return pick(event.name_fr, event.name_en)


class ExceptionalEventIn(serializers.Serializer):
    name_fr = serializers.CharField(max_length=120)
    name_en = serializers.CharField(max_length=120)
    days_allowed = serializers.DecimalField(max_digits=7, decimal_places=2, min_value=Decimal("0"))
    proof_required = serializers.BooleanField(required=False, default=False)
    is_active = serializers.BooleanField(required=False, default=True)
```

`backend/apps/requests/api/views.py`:

```python
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role, has_role
from apps.core.errors import DomainError, NotFound
from apps.organisation import selectors as organisation_selectors

from .. import selectors, services
from ..models import ApproverRule
from .serializers import (
    ChainStepOut,
    ChainStepsIn,
    ExceptionalEventIn,
    ExceptionalEventOut,
    RequestTypeIn,
    RequestTypeOut,
)

STAFF = {Role.EMPLOYEE, Role.HR, Role.EXEC}
HR_ONLY = {Role.HR}
HR_AND_EXEC = {Role.HR, Role.EXEC}


def _sees_everything(request) -> bool:
    """HR and executives see inactive configuration unless they ask for the active part only."""
    return has_role(request.user, Role.HR, Role.EXEC) and request.query_params.get("active") != "1"


# ---------------------------------------------------------------- configuration


class TypeListView(APIView):
    http_method_names = ["get", "post"]
    access = {"GET": STAFF, "POST": HR_ONLY}

    @extend_schema(
        operation_id="request_types_list",
        parameters=[OpenApiParameter("active", str, required=False)],
        responses=RequestTypeOut(many=True),
    )
    def get(self, request):
        types = selectors.request_types(active_only=not _sees_everything(request))
        return Response(RequestTypeOut(types, many=True).data)

    @extend_schema(operation_id="request_types_create", request=RequestTypeIn, responses={201: RequestTypeOut})
    def post(self, request):
        data = RequestTypeIn(data=request.data)
        data.is_valid(raise_exception=True)
        request_type = services.create_request_type(actor=request.user, data=data.validated_data)
        return Response(RequestTypeOut(request_type).data, status=201)


class TypeDetailView(APIView):
    http_method_names = ["get", "patch"]
    access = {"GET": HR_AND_EXEC, "PATCH": HR_ONLY}

    @extend_schema(operation_id="request_types_detail", responses=RequestTypeOut)
    def get(self, request, pk: int):
        return Response(RequestTypeOut(selectors.get_type(pk)).data)

    @extend_schema(operation_id="request_types_update", request=RequestTypeIn, responses=RequestTypeOut)
    def patch(self, request, pk: int):
        request_type = selectors.get_type(pk)
        data = RequestTypeIn(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        request_type = services.update_request_type(
            actor=request.user, request_type=request_type, data=data.validated_data
        )
        return Response(RequestTypeOut(request_type).data)


class TypeStepsView(APIView):
    http_method_names = ["get", "put"]
    access = {"GET": HR_AND_EXEC, "PUT": HR_ONLY}

    @extend_schema(operation_id="request_types_steps", responses=ChainStepOut(many=True))
    def get(self, request, pk: int):
        request_type = selectors.get_type(pk)
        steps = request_type.chain_steps.select_related("named_person").order_by("position")
        return Response(ChainStepOut(steps, many=True).data)

    @extend_schema(
        operation_id="request_types_steps_replace", request=ChainStepsIn, responses=ChainStepOut(many=True)
    )
    def put(self, request, pk: int):
        request_type = selectors.get_type(pk)
        data = ChainStepsIn(data=request.data)
        data.is_valid(raise_exception=True)
        specs = []
        for item in data.validated_data["steps"]:
            person = None
            if item["approver_rule"] == ApproverRule.NAMED_PERSON and item["named_person"] is not None:
                try:
                    person = organisation_selectors.get_employee_for(request.user, str(item["named_person"]))
                except NotFound:
                    raise DomainError("request.named_person_required", field="steps") from None
            specs.append(
                services.StepSpec(
                    approver_rule=item["approver_rule"],
                    mode=item["mode"],
                    named_person=person,
                    reminder_after_days=item["reminder_after_days"],
                    flag_after_days=item["flag_after_days"],
                )
            )
        services.replace_steps(actor=request.user, request_type=request_type, steps=specs)
        steps = request_type.chain_steps.select_related("named_person").order_by("position")
        return Response(ChainStepOut(steps, many=True).data)


class EventListView(APIView):
    http_method_names = ["get", "post"]
    access = {"GET": STAFF, "POST": HR_ONLY}

    @extend_schema(
        operation_id="exceptional_events_list",
        parameters=[OpenApiParameter("active", str, required=False)],
        responses=ExceptionalEventOut(many=True),
    )
    def get(self, request):
        events = selectors.events(active_only=not _sees_everything(request))
        return Response(ExceptionalEventOut(events, many=True).data)

    @extend_schema(
        operation_id="exceptional_events_create", request=ExceptionalEventIn, responses={201: ExceptionalEventOut}
    )
    def post(self, request):
        data = ExceptionalEventIn(data=request.data)
        data.is_valid(raise_exception=True)
        event = services.create_event(actor=request.user, **data.validated_data)
        return Response(ExceptionalEventOut(event).data, status=201)


class EventDetailView(APIView):
    http_method_names = ["patch"]
    access = {"PATCH": HR_ONLY}

    @extend_schema(
        operation_id="exceptional_events_update", request=ExceptionalEventIn, responses=ExceptionalEventOut
    )
    def patch(self, request, pk: int):
        event = selectors.get_event(pk)
        data = ExceptionalEventIn(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        event = services.update_event(actor=request.user, event=event, **data.validated_data)
        return Response(ExceptionalEventOut(event).data)
```

`backend/apps/requests/api/urls.py`:

```python
from django.urls import path

from . import views

app_name = "requests"

urlpatterns = [
    path("request-types", views.TypeListView.as_view(), name="type-list"),
    path("request-types/<int:pk>", views.TypeDetailView.as_view(), name="type-detail"),
    path("request-types/<int:pk>/steps", views.TypeStepsView.as_view(), name="type-steps"),
    path("exceptional-events", views.EventListView.as_view(), name="event-list"),
    path("exceptional-events/<int:pk>", views.EventDetailView.as_view(), name="event-detail"),
]
```

In `backend/config/api_urls.py`, append one line to `urlpatterns`:

```python
    path("", include("apps.requests.api.urls")),
```

- [ ] **Step 11: Add the permission-matrix cases**

`backend/apps/requests/tests/matrix.py`. Later tasks add one list each and extend the sum on the last line.

```python
from tests.matrix import Case, P, only

STAFF = (P.OWNER, P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC)

CONFIG_CASES = [
    Case("requests:type-list", "GET", only(*STAFF)),
    Case(
        "requests:type-list",
        "POST",
        only(P.HR),
        body=lambda w: {"code": "matrix-type", "name_fr": "Matrice", "name_en": "Matrix", "unit": "day"},
    ),
    Case("requests:type-detail", "GET", only(P.HR, P.EXEC), kwargs=lambda w: {"pk": w.remote.pk}),
    Case(
        "requests:type-detail",
        "PATCH",
        only(P.HR),
        kwargs=lambda w: {"pk": w.remote.pk},
        body=lambda w: {"notice_days": 0},
    ),
    Case("requests:type-steps", "GET", only(P.HR, P.EXEC), kwargs=lambda w: {"pk": w.remote.pk}),
    Case(
        "requests:type-steps",
        "PUT",
        only(P.HR),
        kwargs=lambda w: {"pk": w.remote.pk},
        body=lambda w: {"steps": [{"approver_rule": "hr_role", "mode": "approve"}]},
    ),
    Case("requests:event-list", "GET", only(*STAFF)),
    Case(
        "requests:event-list",
        "POST",
        only(P.HR),
        body=lambda w: {"name_fr": "Naissance", "name_en": "Birth", "days_allowed": "2"},
    ),
    Case(
        "requests:event-detail",
        "PATCH",
        only(P.HR),
        kwargs=lambda w: {"pk": w.event.pk},
        body=lambda w: {"proof_required": False},
    ),
]

CASES = CONFIG_CASES
```

In `backend/tests/test_permission_matrix.py`, append one line to `MATRIX_MODULES`:

```python
    "apps.requests.tests.matrix",
```

- [ ] **Step 12: Name the choice sets and regenerate the API description**

Plan 01a requires one stable name per choice set in the generated client. In `backend/config/settings.py`, add these entries to `SPECTACULAR_SETTINGS["ENUM_NAME_OVERRIDES"]`, after the existing ones:

```python
        "RequestUnitEnum": "apps.requests.models.Unit",
        "BalanceEffectEnum": "apps.requests.models.BalanceEffect",
        "DocumentRuleEnum": "apps.requests.models.DocumentRule",
        "CapPeriodEnum": "apps.requests.models.CapPeriod",
        "CalendarLabelEnum": "apps.requests.models.CalendarLabel",
        "ApproverRuleEnum": "apps.requests.models.ApproverRule",
        "StepModeEnum": "apps.requests.models.StepMode",
        "RequestStatusEnum": "apps.requests.models.RequestStatus",
        "StepStatusEnum": "apps.requests.models.StepStatus",
        "AmendmentStatusEnum": "apps.requests.models.AmendmentStatus",
        "AmendmentKindEnum": "apps.requests.models.AmendmentKind",
        "DecisionChannelEnum": "apps.requests.models.Channel",
        "DecisionEnum": "apps.requests.models.Decision",
```

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: no line starting with `Warning`, then `backend/openapi.yaml is up to date.` The file now has the paths under `/api/v1/request-types` and `/api/v1/exceptional-events`.

- [ ] **Step 13: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests tests/test_permission_matrix.py tests/test_messages.py tests/test_openapi.py -v`
Expected: all pass. `tests/test_messages.py` confirms that every code of `apps/requests/messages.py` has both languages and matching placeholders.

- [ ] **Step 14: Commit**

```bash
git add backend/apps/requests backend/config/settings.py backend/config/api_urls.py backend/tests/world.py backend/tests/test_permission_matrix.py backend/openapi.yaml
git add frontend/src/api/schema.d.ts 2>/dev/null || true
git commit -m "feat(requests): configurable request types, approval chains and exceptional events"
```

---

### Task 3: Request records and quantities

**Files:**
- Modify: `backend/apps/requests/models.py` (append four models)
- Create: `backend/apps/requests/migrations/0003_request_amendment_requeststep_requestattachment.py` (generated)
- Create: `backend/apps/requests/services/data.py`
- Modify: `backend/apps/requests/services/__init__.py`
- Create: `backend/apps/requests/tests/helpers.py`
- Create: `backend/apps/requests/tests/conftest.py`
- Test: `backend/apps/requests/tests/test_data.py`

**Interfaces:**
- Consumes: `apps.core.models.PublicIdModel`, `apps.core.models.TimeStampedModel` (plan 01a), `organisation.Employee`, `files.Attachment` (plan 02), `apps.calendar.workdays.day_portions` (Task 1).
- Produces:
  - Models `Request` (`request.steps`, `request.amendments`, `request.attachment_links`), `Amendment` (`amendment.steps`), `RequestStep`, `RequestAttachment`
  - `apps.requests.services.RequestData(start_date, end_date, starts_at_midday=False, ends_at_midday=False, start_time=None, end_time=None, exceptional_event_id=None, comment="")`
  - `apps.requests.services.compute_quantity(request_type: RequestType, data: RequestData) -> Decimal`
  - `apps.requests.services.leave_days(request_type: RequestType, data: RequestData) -> dict[date, Decimal]`
  - `apps.requests.services.data_of(request: Request) -> RequestData`
  - `apps.requests.services.data.amendment_data(amendment: Amendment) -> RequestData`
  - `apps.requests.services.data.apply_data(request: Request, data: RequestData) -> None`
  - `apps.requests.services.data.day_diff(old: Mapping[date, Decimal], new: Mapping[date, Decimal]) -> tuple[dict[date, Decimal], dict[date, Decimal]]` (released, added)
  - `apps.requests.services.data.DATA_FIELDS`
  - Test helpers `NOW`, `TODAY`, `MON` … `NEXT_MON`, `days(...)`, `hours(...)`, `stored(...)` and the autouse fixtures `clock` and `_fresh_settings_cache`

- [ ] **Step 1: Append the record models**

Add these imports at the top of `backend/apps/requests/models.py`, below the existing `from django.db import models`:

```python
from django.conf import settings

from apps.core.models import PublicIdModel, TimeStampedModel
```

Append to the end of `backend/apps/requests/models.py`:

```python
class Request(PublicIdModel, TimeStampedModel):
    employee = models.ForeignKey("organisation.Employee", on_delete=models.PROTECT, related_name="+")
    request_type = models.ForeignKey(RequestType, on_delete=models.PROTECT, related_name="requests")
    start_date = models.DateField()
    end_date = models.DateField()
    starts_at_midday = models.BooleanField(default=False)
    ends_at_midday = models.BooleanField(default=False)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    quantity = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    exceptional_event = models.ForeignKey(
        ExceptionalEvent, null=True, blank=True, on_delete=models.PROTECT, related_name="requests"
    )
    comment = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=RequestStatus.choices, default=RequestStatus.DRAFT)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    override_reason = models.TextField(blank=True)
    certificate_due_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    # Set from the type when the request is created and never cleared, even after reclassification (master D17).
    sensitive = models.BooleanField(default=False)
    reclassified_from = models.ForeignKey(
        RequestType, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["employee", "status"], name="requests_req_emp_status"),
            models.Index(fields=["status", "start_date"], name="requests_req_status_start"),
        ]


class Amendment(PublicIdModel):
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="amendments")
    kind = models.CharField(max_length=8, choices=AmendmentKind.choices)
    new_start_date = models.DateField(null=True, blank=True)
    new_end_date = models.DateField(null=True, blank=True)
    new_starts_at_midday = models.BooleanField(default=False)
    new_ends_at_midday = models.BooleanField(default=False)
    new_start_time = models.TimeField(null=True, blank=True)
    new_end_time = models.TimeField(null=True, blank=True)
    new_quantity = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    previous_start_date = models.DateField()
    previous_end_date = models.DateField()
    previous_starts_at_midday = models.BooleanField(default=False)
    previous_ends_at_midday = models.BooleanField(default=False)
    previous_start_time = models.TimeField(null=True, blank=True)
    previous_end_time = models.TimeField(null=True, blank=True)
    previous_quantity = models.DecimalField(max_digits=7, decimal_places=2)
    reason = models.TextField()
    status = models.CharField(max_length=12, choices=AmendmentStatus.choices, default=AmendmentStatus.PENDING)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["request"],
                condition=models.Q(status="pending"),
                name="requests_one_open_amendment",
            )
        ]


class RequestStep(models.Model):
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="steps")
    amendment = models.ForeignKey(Amendment, null=True, blank=True, on_delete=models.CASCADE, related_name="steps")
    round = models.PositiveSmallIntegerField(default=1)
    position = models.PositiveSmallIntegerField()
    approver_rule = models.CharField(max_length=16, choices=ApproverRule.choices)
    mode = models.CharField(max_length=8, choices=StepMode.choices)
    named_person = models.ForeignKey(
        "organisation.Employee", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(max_length=10, choices=StepStatus.choices, default=StepStatus.WAITING)
    activated_at = models.DateTimeField(null=True, blank=True)
    reminded_at = models.DateTimeField(null=True, blank=True)
    flagged_at = models.DateTimeField(null=True, blank=True)
    # The person whose decision it is. They may have no account when the decision was given on paper.
    decided_by = models.ForeignKey(
        "organisation.Employee", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    # The HR holder who entered a decision given outside the application. Empty for an in-app decision.
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    channel = models.CharField(max_length=8, choices=Channel.choices, blank=True)
    comment = models.TextField(blank=True)
    reminder_after_days = models.PositiveSmallIntegerField(default=2)
    flag_after_days = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["round", "position", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["request", "amendment", "round", "position"],
                name="requests_step_unique_position",
                nulls_distinct=False,
            )
        ]
        indexes = [models.Index(fields=["status", "mode"], name="requests_step_status_mode")]


class RequestAttachment(models.Model):
    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="attachment_links")
    attachment = models.OneToOneField("files.Attachment", on_delete=models.PROTECT, related_name="+")
    # Set for the scan of a signed form recorded with an on-behalf decision; empty for a certificate or a proof.
    step = models.ForeignKey(RequestStep, null=True, blank=True, on_delete=models.SET_NULL, related_name="scans")
    added_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["added_at", "id"]
```

Run: `docker compose run --rm app python manage.py makemigrations requests`
Expected: a migration `0003_...` creating `Request`, `Amendment`, `RequestStep`, `RequestAttachment`. If the generated file name differs from `0003_request_amendment_requeststep_requestattachment.py`, keep the generated name.

Run: `docker compose run --rm app python manage.py migrate`
Expected: `Applying requests.0003_... OK`.

`nulls_distinct=False` needs PostgreSQL 15 or later; the stack pins 17.

- [ ] **Step 2: Write the test helpers and fixtures**

`backend/apps/requests/tests/helpers.py`:

```python
"""Dates, builders and fakes shared by the tests of the requests app."""

from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

from apps.requests.models import Request, RequestStatus
from apps.requests.services import RequestData, compute_quantity

TUNIS = ZoneInfo("Africa/Tunis")
NOW = dt.datetime(2026, 10, 6, 9, 0, tzinfo=TUNIS)  # a Tuesday
TODAY = NOW.date()

# The reference week for leave dates, four weeks after TODAY.
MON = dt.date(2026, 11, 2)
TUE = dt.date(2026, 11, 3)
WED = dt.date(2026, 11, 4)
THU = dt.date(2026, 11, 5)
FRI = dt.date(2026, 11, 6)
SAT = dt.date(2026, 11, 7)
SUN = dt.date(2026, 11, 8)
NEXT_MON = dt.date(2026, 11, 9)
NEXT_TUE = dt.date(2026, 11, 10)


def at(month: int, day: int, hour: int = 9, minute: int = 0, year: int = 2026) -> dt.datetime:
    return dt.datetime(year, month, day, hour, minute, tzinfo=TUNIS)


def days(start: dt.date, end: dt.date | None = None, **extra) -> RequestData:
    return RequestData(start_date=start, end_date=end or start, **extra)


def hours(day: dt.date, start: str = "09:00", end: str = "11:00", **extra) -> RequestData:
    return RequestData(
        start_date=day,
        end_date=day,
        start_time=dt.time.fromisoformat(start),
        end_time=dt.time.fromisoformat(end),
        **extra,
    )


def stored(world, *, employee=None, request_type=None, data=None, status=RequestStatus.APPROVED, created_by=None):
    """A request written straight to the database, for tests that need existing rows without the lifecycle."""
    employee = employee or world.owner
    request_type = request_type or world.annual
    data = data or days(MON)
    return Request.objects.create(
        employee=employee,
        request_type=request_type,
        start_date=data.start_date,
        end_date=data.end_date,
        starts_at_midday=data.starts_at_midday,
        ends_at_midday=data.ends_at_midday,
        start_time=data.start_time,
        end_time=data.end_time,
        exceptional_event_id=data.exceptional_event_id,
        comment=data.comment,
        quantity=compute_quantity(request_type, data),
        status=status,
        created_by=created_by or world.owner_user,
        sensitive=request_type.is_sensitive,
    )
```

`backend/apps/requests/tests/conftest.py`:

```python
import pytest
import time_machine

from apps.settings import services as settings_service

from apps.requests.tests.helpers import NOW


@pytest.fixture(autouse=True)
def clock():
    """Every test of this app runs on Tuesday 6 October 2026, 09:00 in Tunis. Move it with clock.move_to(...)."""
    with time_machine.travel(NOW, tick=False) as traveller:
        yield traveller


@pytest.fixture(autouse=True)
def _fresh_settings_cache():
    """Settings are cached per process; a value set in one test must not reach the next."""
    settings_service.clear_cache()
    yield
    settings_service.clear_cache()
```

- [ ] **Step 3: Write the failing tests**

`backend/apps/requests/tests/test_data.py`:

```python
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
        world, request_type=world.exceptional, data=days(MON, TUE, exceptional_event_id=world.event.pk, comment="Noces")
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
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_data.py -v`
Expected: collection error, `ImportError: cannot import name 'RequestData' from 'apps.requests.services'`.

- [ ] **Step 5: Implement the data module**

`backend/apps/requests/services/data.py`:

```python
"""What a person asks for, and how much it is. The server always computes the quantity (REQ-01)."""

from __future__ import annotations

import datetime as dt
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal

from apps.calendar import workdays

from ..models import Unit

CENT = Decimal("0.01")
ZERO = Decimal("0")

DATA_FIELDS = (
    "start_date", "end_date", "starts_at_midday", "ends_at_midday",
    "start_time", "end_time", "exceptional_event_id", "comment",
)


@dataclass(frozen=True)
class RequestData:
    start_date: dt.date
    end_date: dt.date
    starts_at_midday: bool = False
    ends_at_midday: bool = False
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    exceptional_event_id: int | None = None
    comment: str = ""


def data_of(request) -> RequestData:
    return RequestData(**{field: getattr(request, field) for field in DATA_FIELDS})


def amendment_data(amendment) -> RequestData:
    """The request as it would be once a change amendment is approved."""
    request = amendment.request
    return RequestData(
        start_date=amendment.new_start_date,
        end_date=amendment.new_end_date,
        starts_at_midday=amendment.new_starts_at_midday,
        ends_at_midday=amendment.new_ends_at_midday,
        start_time=amendment.new_start_time,
        end_time=amendment.new_end_time,
        exceptional_event_id=request.exceptional_event_id,
        comment=request.comment,
    )


def apply_data(request, data: RequestData) -> None:
    for field in DATA_FIELDS:
        setattr(request, field, getattr(data, field))


def hours_between(start_time: dt.time | None, end_time: dt.time | None) -> Decimal:
    if start_time is None or end_time is None or end_time <= start_time:
        return ZERO.quantize(CENT)
    start = dt.datetime.combine(dt.date.min, start_time)
    end = dt.datetime.combine(dt.date.min, end_time)
    return (Decimal(int((end - start).total_seconds())) / Decimal(3600)).quantize(CENT)


def leave_days(request_type, data: RequestData) -> dict[dt.date, Decimal]:
    """Each working day a day-based request takes, with 1 or 0.5. Empty for hour-based types."""
    if request_type.unit != Unit.DAY:
        return {}
    return workdays.day_portions(
        data.start_date,
        data.end_date,
        starts_at_midday=data.starts_at_midday,
        ends_at_midday=data.ends_at_midday,
    )


def compute_quantity(request_type, data: RequestData) -> Decimal:
    if request_type.unit == Unit.HOUR:
        return hours_between(data.start_time, data.end_time)
    return sum(leave_days(request_type, data).values(), ZERO).quantize(CENT)


def day_diff(
    old: Mapping[dt.date, Decimal], new: Mapping[dt.date, Decimal]
) -> tuple[dict[dt.date, Decimal], dict[dt.date, Decimal]]:
    """(released, added): what a change of dates gives back and what it newly takes, day by day."""
    released = {day: portion - new.get(day, ZERO) for day, portion in old.items() if portion > new.get(day, ZERO)}
    added = {day: portion - old.get(day, ZERO) for day, portion in new.items() if portion > old.get(day, ZERO)}
    return released, added
```

Add to `backend/apps/requests/services/__init__.py`, below the existing import:

```python
from .data import RequestData, compute_quantity, data_of, leave_days
```

and add `"RequestData"`, `"compute_quantity"`, `"data_of"`, `"leave_days"` to `__all__`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_data.py -v`
Expected: 13 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): request, step, amendment and attachment records; server-side quantities"
```

---

### Task 4: The balance port

**Files:**
- Create: `backend/apps/requests/ports.py`
- Modify: `backend/apps/requests/tests/helpers.py` (append `FakePort`)
- Modify: `backend/apps/requests/tests/conftest.py` (append the `port` fixture)
- Test: `backend/apps/requests/tests/test_ports.py`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (exactly as master 7.9; plan 04 implements `BalancePort` and calls `set_balance_port` in its `AppConfig.ready()`):
  - `apps.requests.ports.BalanceVerdict(ok: bool, shortfall: Decimal = Decimal("0"), first_negative_on: date | None = None)`
  - `apps.requests.ports.BalancePreview(now: Decimal, on_start: Decimal, after: Decimal)`
  - `apps.requests.ports.BalancePort` (protocol): `check(*, employee_id, new_days, ignoring_request_id=None) -> BalanceVerdict`, `preview(*, employee_id, new_days, ignoring_request_id=None) -> BalancePreview | None`, `post_taken(*, request_id, employee_id, days, actor) -> None`, `post_restored(*, request_id, employee_id, days, actor, reason) -> None`
  - `apps.requests.ports.NullBalancePort`, `set_balance_port(port)`, `balance_port()`
  - Test fake `FakePort` and the autouse fixture `port`, which installs a `FakePort` for every test of this app and restores the previous port afterwards

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/requests/tests/helpers.py`:

```python
from decimal import Decimal  # noqa: E402

from apps.requests.ports import BalancePreview, BalanceVerdict  # noqa: E402


class FakePort:
    """A balance port that records every call. Set `ok = False` to make the balance insufficient."""

    def __init__(self) -> None:
        self.ok = True
        self.shortfall = Decimal("1.5")
        self.checks: list[dict] = []
        self.taken: list[dict] = []
        self.restored: list[dict] = []

    def check(self, *, employee_id, new_days, ignoring_request_id=None):
        self.checks.append(
            {"employee_id": employee_id, "new_days": dict(new_days), "ignoring_request_id": ignoring_request_id}
        )
        if self.ok:
            return BalanceVerdict(ok=True)
        return BalanceVerdict(ok=False, shortfall=self.shortfall, first_negative_on=min(new_days, default=None))

    def preview(self, *, employee_id, new_days, ignoring_request_id=None):
        total = sum(new_days.values(), Decimal("0"))
        return BalancePreview(now=Decimal("10"), on_start=Decimal("12.5"), after=Decimal("10") - total)

    def post_taken(self, *, request_id, employee_id, days, actor):
        self.taken.append({"request_id": request_id, "employee_id": employee_id, "days": dict(days), "actor": actor})

    def post_restored(self, *, request_id, employee_id, days, actor, reason):
        self.restored.append(
            {"request_id": request_id, "employee_id": employee_id, "days": dict(days), "actor": actor, "reason": reason}
        )
```

Append to `backend/apps/requests/tests/conftest.py`:

```python
from apps.requests import ports  # noqa: E402

from apps.requests.tests.helpers import FakePort  # noqa: E402


@pytest.fixture(autouse=True)
def port():
    """Every test of this app talks to a fake balance port, whatever port the project has installed."""
    previous = ports.balance_port()
    fake = FakePort()
    ports.set_balance_port(fake)
    yield fake
    ports.set_balance_port(previous)
```

`backend/apps/requests/tests/test_ports.py`:

```python
from decimal import Decimal

from apps.requests import ports
from apps.requests.ports import NullBalancePort

from apps.requests.tests.helpers import MON


def test_the_null_port_accepts_everything_and_knows_no_balance():
    null = NullBalancePort()
    verdict = null.check(employee_id=1, new_days={MON: Decimal("1")})
    assert (verdict.ok, verdict.shortfall, verdict.first_negative_on) == (True, Decimal("0"), None)
    assert null.preview(employee_id=1, new_days={MON: Decimal("1")}) is None
    assert null.post_taken(request_id=1, employee_id=1, days={MON: Decimal("1")}, actor=None) is None
    assert null.post_restored(request_id=1, employee_id=1, days={MON: Decimal("1")}, actor=None, reason="x") is None


def test_the_installed_port_is_the_one_the_engine_gets(port):
    assert ports.balance_port() is port


def test_set_balance_port_replaces_the_port():
    mine = NullBalancePort()
    ports.set_balance_port(mine)
    assert ports.balance_port() is mine
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_ports.py -v`
Expected: collection error, `ModuleNotFoundError: No module named 'apps.requests.ports'`.

- [ ] **Step 3: Implement the port**

`backend/apps/requests/ports.py`:

```python
"""The one door between requests and the annual-leave ledger.

`requests` defines the port and calls it; `balances` (plan 04) implements it and installs itself with
`set_balance_port` when Django starts. Until then the null port accepts every request and knows no balance.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Protocol


@dataclass(frozen=True)
class BalanceVerdict:
    ok: bool
    shortfall: Decimal = Decimal("0")
    first_negative_on: date | None = None


@dataclass(frozen=True)
class BalancePreview:
    now: Decimal
    on_start: Decimal
    after: Decimal


class BalancePort(Protocol):
    def check(
        self, *, employee_id: int, new_days: Mapping[date, Decimal], ignoring_request_id: int | None = None
    ) -> BalanceVerdict: ...

    def preview(
        self, *, employee_id: int, new_days: Mapping[date, Decimal], ignoring_request_id: int | None = None
    ) -> BalancePreview | None: ...

    def post_taken(
        self, *, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor: Any | None
    ) -> None: ...

    def post_restored(
        self, *, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor: Any | None, reason: str
    ) -> None: ...


class NullBalancePort:
    def check(self, *, employee_id, new_days, ignoring_request_id=None) -> BalanceVerdict:
        return BalanceVerdict(ok=True)

    def preview(self, *, employee_id, new_days, ignoring_request_id=None) -> BalancePreview | None:
        return None

    def post_taken(self, *, request_id, employee_id, days, actor) -> None:
        return None

    def post_restored(self, *, request_id, employee_id, days, actor, reason) -> None:
        return None


_port: BalancePort = NullBalancePort()


def set_balance_port(port: BalancePort) -> None:
    global _port
    _port = port


def balance_port() -> BalancePort:
    return _port
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_ports.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): balance port with a null implementation"
```

---

### Task 5: Validation rules

**Files:**
- Create: `backend/apps/requests/services/validation.py`
- Modify: `backend/apps/requests/services/__init__.py`
- Test: `backend/apps/requests/tests/test_validation.py`

**Interfaces:**
- Consumes: `apps.core.errors.Problem(code, field=None, params={})`, `apps.calendar.workdays` (Task 1), `RequestData`, `compute_quantity`, `leave_days` (Task 3), `apps.requests.ports.balance_port()` (Task 4), the helpers `stored`, `days`, `hours` and the fixtures `clock`, `port`.
- Produces:
  - `apps.requests.services.validate(*, employee, request_type, data, override=False, ignoring_request_id=None, today=None) -> list[Problem]`: every rule of PRD 6.1 and 6.4 to 6.8 plus the balance check through the port. An empty list means the request may be sent. `override` (the HR exception) lifts past dates, notice, cap, event days and balance; it never lifts shape or overlap.
  - `apps.requests.services.validation.structural_problems(*, request_type, data) -> list[Problem]`: the subset a draft must already satisfy so that its quantity is computable.
  - `apps.requests.services.validation.cap_usage(*, employee, request_type, portions, ignoring_request_id=None) -> list[CapUsage]` with `CapUsage(start, end, used, adding, limit, period)` and `.exceeded`
  - `apps.requests.services.validation.hours_in_month(*, employee, request_type, day, ignoring_request_id=None) -> Decimal`
  - `apps.requests.services.validation.fmt_range(start, end) -> str` (`"03/11/2026 – 04/11/2026"`)
  - Problem parameters that are quantities (`shortfall`, `limit`, `used`, `allowed`) are `Decimal` values; `apps.core.i18n.translate` writes them for the reader's language (`1,5` in French, `1.5` in English)
  - Constants `BLOCKING` (pending, returned, approved), `COUNTED` (pending, approved), `MIDDAY` (12:00)

- [ ] **Step 1: Write the failing tests**

`backend/apps/requests/tests/test_validation.py`:

```python
import datetime as dt
from decimal import Decimal

import pytest

from apps.calendar.models import PublicHoliday
from apps.requests.models import Amendment, RequestStatus
from apps.requests.services import RequestData, compute_quantity, validate
from apps.requests.tests.helpers import (
    FRI, MON, NEXT_MON, NEXT_TUE, SAT, SUN, THU, TODAY, TUE, WED, days, hours, stored,
)

pytestmark = pytest.mark.django_db

YESTERDAY = dt.date(2026, 10, 5)  # a Monday


def check(world, request_type=None, data=None, **options):
    employee = options.pop("employee", world.owner)
    return validate(employee=employee, request_type=request_type or world.annual, data=data or days(MON), **options)


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
        request=original, kind="change", new_start_date=THU, new_end_date=THU,
        previous_start_date=MON, previous_end_date=MON, previous_quantity=Decimal("1"),
        reason="Décalage", requested_by=world.owner_user,
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_validation.py -v`
Expected: collection error, `ImportError: cannot import name 'validate' from 'apps.requests.services'`.

- [ ] **Step 3: Implement validation**

`backend/apps/requests/services/validation.py`:

```python
"""The rules a request must satisfy before it is sent (PRD 6.1, 6.4 to 6.8, and 6.3 through the balance port)."""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal

from django.utils import timezone

from apps.calendar import workdays
from apps.core.errors import Problem

from ..models import (
    Amendment,
    AmendmentKind,
    AmendmentStatus,
    BalanceEffect,
    CalendarLabel,
    CapPeriod,
    ExceptionalEvent,
    Request,
    RequestStatus,
    Unit,
)
from ..ports import balance_port
from .data import ZERO, RequestData, compute_quantity, leave_days

MIDDAY = dt.time(12, 0)
# A request in one of these statuses occupies its dates (6.4).
BLOCKING = (RequestStatus.PENDING, RequestStatus.RETURNED, RequestStatus.APPROVED)
# A request in one of these statuses counts towards a cap (6.8).
COUNTED = (RequestStatus.PENDING, RequestStatus.APPROVED)


@dataclass(frozen=True)
class CapUsage:
    """One period a request touches: what is already used there and what the request adds."""

    start: dt.date
    end: dt.date
    used: Decimal
    adding: Decimal
    limit: Decimal
    period: str

    @property
    def exceeded(self) -> bool:
        return self.used + self.adding > self.limit


def fmt_range(start: dt.date, end: dt.date) -> str:
    if start == end:
        return f"{start:%d/%m/%Y}"
    return f"{start:%d/%m/%Y} – {end:%d/%m/%Y}"


# ------------------------------------------------------------------ shape


def _on_quarter(value: dt.time) -> bool:
    return value.minute % 15 == 0 and value.second == 0 and value.microsecond == 0


def _valid_times(data: RequestData) -> bool:
    if data.start_date != data.end_date or data.start_time is None or data.end_time is None:
        return False
    return data.end_time > data.start_time and _on_quarter(data.start_time) and _on_quarter(data.end_time)


def structural_problems(*, request_type, data: RequestData) -> list[Problem]:
    """What must hold for the quantity to be computable. A draft already has to satisfy these."""
    problems: list[Problem] = []
    if not request_type.is_active:
        problems.append(Problem("request.type_inactive", "type"))
    if data.end_date < data.start_date:
        problems.append(Problem("request.end_before_start", "end_date"))
        return problems
    if request_type.unit == Unit.HOUR:
        if data.starts_at_midday or data.ends_at_midday:
            problems.append(Problem("request.half_day_not_allowed", "starts_at_midday"))
        if not _valid_times(data):
            problems.append(Problem("request.permission_times", "end_time"))
    elif data.starts_at_midday or data.ends_at_midday:
        if not request_type.allows_half_day:
            field = "starts_at_midday" if data.starts_at_midday else "ends_at_midday"
            problems.append(Problem("request.half_day_not_allowed", field))
        elif data.starts_at_midday and data.ends_at_midday and data.start_date == data.end_date:
            problems.append(Problem("request.half_day_both_ends", "ends_at_midday"))
        else:
            if data.starts_at_midday and not workdays.is_working_day(data.start_date):
                problems.append(Problem("request.half_day_on_non_working_day", "starts_at_midday"))
            if data.ends_at_midday and not workdays.is_working_day(data.end_date):
                problems.append(Problem("request.half_day_on_non_working_day", "ends_at_midday"))
    if request_type.uses_events:
        chosen = data.exceptional_event_id
        if chosen is None or not ExceptionalEvent.objects.filter(pk=chosen, is_active=True).exists():
            problems.append(Problem("request.event_required", "exceptional_event"))
    return problems


# ------------------------------------------------------------------ dates against today


def _date_rule_problems(request_type, data: RequestData, today: dt.date) -> list[Problem]:
    if data.start_date < today:
        if request_type.allows_past_dates:
            return []
        return [Problem("request.past_dates", "start_date")]
    if request_type.notice_days and (data.start_date - today).days < request_type.notice_days:
        return [Problem("request.notice", "start_date", {"days": request_type.notice_days})]
    return []


# ------------------------------------------------------------------ overlap (6.4)


def _span(start: dt.date, end: dt.date, starts_at_midday: bool, ends_at_midday: bool) -> tuple[int, int]:
    """A range on an axis of half-days: [low, high). Each date has two slots, morning then afternoon."""
    low = start.toordinal() * 2 + (1 if starts_at_midday else 0)
    high = end.toordinal() * 2 + (1 if ends_at_midday else 2)
    return low, high


def _span_of(request) -> tuple[int, int]:
    return _span(request.start_date, request.end_date, request.starts_at_midday, request.ends_at_midday)


def _intersects(a: tuple[int, int], b: tuple[int, int]) -> bool:
    return a[0] < b[1] and b[0] < a[1]


def _others(employee, ignoring_request_id: int | None):
    others = Request.objects.filter(employee=employee, status__in=BLOCKING).select_related("request_type")
    if ignoring_request_id is not None:
        others = others.exclude(pk=ignoring_request_id)
    return others


def _day_overlap_problems(employee, data: RequestData, ignoring_request_id: int | None) -> list[Problem]:
    mine = _span(data.start_date, data.end_date, data.starts_at_midday, data.ends_at_midday)
    others = _others(employee, ignoring_request_id).filter(
        request_type__unit=Unit.DAY, start_date__lte=data.end_date, end_date__gte=data.start_date
    )
    for other in others.order_by("start_date", "pk"):
        if _intersects(mine, _span_of(other)):
            return [Problem("request.overlap", "start_date", {"other": fmt_range(other.start_date, other.end_date)})]
    # The new dates of a change that is waiting are taken too.
    changes = Amendment.objects.filter(
        request__employee=employee,
        request__request_type__unit=Unit.DAY,
        status=AmendmentStatus.PENDING,
        kind=AmendmentKind.CHANGE,
        new_start_date__lte=data.end_date,
        new_end_date__gte=data.start_date,
    )
    if ignoring_request_id is not None:
        changes = changes.exclude(request_id=ignoring_request_id)
    for change in changes.order_by("new_start_date", "pk"):
        theirs = _span(
            change.new_start_date, change.new_end_date, change.new_starts_at_midday, change.new_ends_at_midday
        )
        if _intersects(mine, theirs):
            other = fmt_range(change.new_start_date, change.new_end_date)
            return [Problem("request.overlap", "start_date", {"other": other})]
    return []


def _permission_overlap_problems(employee, data: RequestData, ignoring_request_id: int | None) -> list[Problem]:
    day = data.start_date
    low = day.toordinal() * 2 + (0 if data.start_time < MIDDAY else 1)
    high = day.toordinal() * 2 + (2 if data.end_time > MIDDAY else 1)
    others = _others(employee, ignoring_request_id).filter(start_date__lte=day, end_date__gte=day)
    for other in others.order_by("pk"):
        if other.request_type.unit == Unit.DAY:
            if other.request_type.calendar_label == CalendarLabel.REMOTE:
                continue  # working remotely is not an absence
            if _intersects(_span_of(other), (low, high)):
                return [Problem("request.permission_overlaps_absence", "start_date")]
        elif other.start_time and other.end_time and other.start_time < data.end_time and data.start_time < other.end_time:
            described = f"{other.start_date:%d/%m/%Y} {other.start_time:%H:%M}–{other.end_time:%H:%M}"
            return [Problem("request.overlap", "start_time", {"other": described})]
    return []


# ------------------------------------------------------------------ cap (6.8)


def period_bounds(day: dt.date, period: str) -> tuple[dt.date, dt.date]:
    if period == CapPeriod.WEEK:
        start = day - dt.timedelta(days=day.isoweekday() - 1)
        return start, start + dt.timedelta(days=6)
    start = day.replace(day=1)
    return start, (start + dt.timedelta(days=32)).replace(day=1) - dt.timedelta(days=1)


def _portions_of(request) -> dict[dt.date, Decimal]:
    if request.request_type.unit == Unit.HOUR:
        return {request.start_date: request.quantity}
    return workdays.day_portions(
        request.start_date,
        request.end_date,
        starts_at_midday=request.starts_at_midday,
        ends_at_midday=request.ends_at_midday,
    )


def cap_usage(
    *, employee, request_type, portions: Mapping[dt.date, Decimal], ignoring_request_id: int | None = None
) -> list[CapUsage]:
    """One entry per capped period the given portions touch, oldest first. Empty when the type has no cap."""
    if request_type.cap_quantity is None or request_type.cap_period == CapPeriod.NONE or not portions:
        return []
    adding: dict[tuple[dt.date, dt.date], Decimal] = defaultdict(Decimal)
    for day, portion in portions.items():
        adding[period_bounds(day, request_type.cap_period)] += portion
    first = min(bounds[0] for bounds in adding)
    last = max(bounds[1] for bounds in adding)
    others = Request.objects.filter(
        employee=employee, request_type=request_type, status__in=COUNTED, start_date__lte=last, end_date__gte=first
    ).select_related("request_type")
    if ignoring_request_id is not None:
        others = others.exclude(pk=ignoring_request_id)
    used: dict[tuple[dt.date, dt.date], Decimal] = defaultdict(Decimal)
    for other in others:
        for day, portion in _portions_of(other).items():
            bounds = period_bounds(day, request_type.cap_period)
            if bounds in adding:
                used[bounds] += portion
    return [
        CapUsage(
            start=bounds[0],
            end=bounds[1],
            used=used[bounds],
            adding=adding[bounds],
            limit=request_type.cap_quantity,
            period=request_type.cap_period,
        )
        for bounds in sorted(adding)
    ]


def hours_in_month(*, employee, request_type, day: dt.date, ignoring_request_id: int | None = None) -> Decimal:
    """Hours already asked for or approved in the month of `day`, for an hour-based type."""
    start, end = period_bounds(day, CapPeriod.MONTH)
    others = Request.objects.filter(
        employee=employee, request_type=request_type, status__in=COUNTED, start_date__gte=start, start_date__lte=end
    )
    if ignoring_request_id is not None:
        others = others.exclude(pk=ignoring_request_id)
    return sum((other.quantity for other in others), ZERO)


def _cap_problems(employee, request_type, portions, ignoring_request_id) -> list[Problem]:
    for usage in cap_usage(
        employee=employee, request_type=request_type, portions=portions, ignoring_request_id=ignoring_request_id
    ):
        if usage.exceeded:
            return [Problem("request.cap_exceeded", "start_date", {"limit": usage.limit, "used": usage.used})]
    return []


# ------------------------------------------------------------------ event days (6.6) and balance (6.3)


def _event_problems(request_type, data: RequestData, portions) -> list[Problem]:
    if not request_type.uses_events:
        return []
    event = ExceptionalEvent.objects.get(pk=data.exceptional_event_id)
    if sum(portions.values(), ZERO) > event.days_allowed:
        return [Problem("request.event_days_exceeded", "end_date", {"allowed": event.days_allowed})]
    return []


def _balance_problems(employee, request_type, portions, ignoring_request_id) -> list[Problem]:
    if request_type.balance_effect != BalanceEffect.DEDUCTS_ANNUAL:
        return []
    verdict = balance_port().check(
        employee_id=employee.pk, new_days=portions, ignoring_request_id=ignoring_request_id
    )
    if verdict.ok:
        return []
    return [Problem("request.balance_insufficient", "end_date", {"shortfall": verdict.shortfall})]


# ------------------------------------------------------------------ entry point


def validate(
    *,
    employee,
    request_type,
    data: RequestData,
    override: bool = False,
    ignoring_request_id: int | None = None,
    today: dt.date | None = None,
) -> list[Problem]:
    """Every problem that stops this request from being sent. Empty means it may be sent.

    `override` is the HR exception (REQ-02): it lifts past dates, notice, cap, event days and balance.
    `ignoring_request_id` is the request being edited or amended, so that it does not collide with itself.
    """
    today = today or timezone.localdate()
    problems = structural_problems(request_type=request_type, data=data)
    if problems:
        return problems
    if request_type.unit == Unit.DAY:
        portions = leave_days(request_type, data)
        if not portions:
            return [Problem("request.no_working_day", "start_date")]
    else:
        if not workdays.is_working_day(data.start_date):
            return [Problem("request.permission_non_working_day", "start_date")]
        portions = {data.start_date: compute_quantity(request_type, data)}
    if not override:
        problems += _date_rule_problems(request_type, data, today)
    if request_type.unit == Unit.DAY:
        problems += _day_overlap_problems(employee, data, ignoring_request_id)
    else:
        problems += _permission_overlap_problems(employee, data, ignoring_request_id)
    if not override:
        problems += _cap_problems(employee, request_type, portions, ignoring_request_id)
        problems += _event_problems(request_type, data, portions)
        problems += _balance_problems(employee, request_type, portions, ignoring_request_id)
    return problems
```

Add to `backend/apps/requests/services/__init__.py`:

```python
from .validation import validate
```

and add `"validate"` to `__all__`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_validation.py -v`
Expected: 41 passed (33 test functions, three of them parametrised).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): validation of dates, half-days, overlap, caps, events and balance"
```

---

### Task 6: Drafts

**Files:**
- Create: `backend/apps/requests/services/common.py`
- Create: `backend/apps/requests/services/drafts.py`
- Modify: `backend/apps/requests/services/__init__.py`
- Test: `backend/apps/requests/tests/test_drafts.py`

**Interfaces:**
- Consumes: `apps.organisation.reach.employee_of(user)`, `apps.organisation.reach.lock_employee(employee_id)`, `apps.organisation.selectors.full_name(employee)`, `apps.accounts.roles` (`Role`, `has_role`, `users_with_role`), `apps.audit.services`, `apps.core.errors` (`DomainError`, `NotAllowed`, `Conflict`), `structural_problems`, `validate` (Task 5), `compute_quantity`, `apply_data`, `DATA_FIELDS` (Task 3).
- Produces:
  - `apps.requests.services.create_draft(*, actor, employee, request_type, data, override_reason="") -> Request`
  - `apps.requests.services.update_request(*, actor, request, data, expected_version) -> Request`
  - `apps.requests.services.discard_draft(*, actor, request) -> None`
  - In `apps.requests.services.common`, used by every later task:
    - `is_requester(user, request) -> bool`, `account_of(employee) -> User | None` (the employee's active account), `name_of(employee) -> str`, `hr_users(*, excluding=None) -> list[User]`
    - `label(request) -> str`, `snapshot(request) -> dict`, `redacted(request) -> tuple[str, ...]`, `changes_since(before, request) -> dict`, `note(request, key, text) -> dict`
    - `check_version(request, expected_version) -> None`, `save(request, *fields) -> None`, `bump(request, *fields) -> None`, `locked(request) -> Request`
    - `current_round(request, amendment=None) -> int`, `round_steps(request, amendment=None) -> QuerySet[RequestStep]`, `has_decision(request) -> bool`
    - `require_editor(actor, request) -> None`, `require_requester(actor, request) -> None`, `require_hr_for_other(actor, request) -> None`
  - Audit actions `request.created`, `request.updated`, `request.discarded`, all recorded on the request (`object_type` `request`, `object_id` its `public_id`)

- [ ] **Step 1: Write the failing tests**

`backend/apps/requests/tests/test_drafts.py`:

```python
import json
from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.requests import services
from apps.requests.models import Request, RequestStatus
from apps.requests.tests.helpers import FRI, MON, TODAY, TUE, WED, days, stored

pytestmark = pytest.mark.django_db


def test_an_employee_saves_a_draft_for_themselves(world):
    request = services.create_draft(
        actor=world.owner_user, employee=world.owner, request_type=world.annual, data=days(MON, TUE, comment=" Vacances ")
    )
    assert (request.status, request.version, request.quantity) == ("draft", 1, Decimal("2.00"))
    assert (request.comment, request.created_by, request.sensitive) == ("Vacances", world.owner_user, False)
    event = AuditEvent.objects.get(action="request.created")
    assert (event.object_type, event.object_id, event.actor) == ("request", str(request.public_id), world.owner_user)


def test_a_draft_may_break_rules_that_are_only_checked_on_sending(world):
    stored(world, data=days(MON))
    draft = services.create_draft(
        actor=world.owner_user, employee=world.owner, request_type=world.remote, data=days(MON)
    )
    assert draft.status == "draft"


def test_a_draft_must_have_a_computable_shape(world):
    with pytest.raises(DomainError) as error:
        services.create_draft(
            actor=world.owner_user, employee=world.owner, request_type=world.annual, data=days(FRI, MON)
        )
    assert error.value.code == "request.end_before_start"
    assert not Request.objects.exists()


def test_nobody_but_hr_creates_a_request_for_someone_else(world):
    with pytest.raises(NotAllowed):
        services.create_draft(
            actor=world.manager_user, employee=world.owner, request_type=world.annual, data=days(MON)
        )


def test_hr_creates_for_an_employee_with_an_exception(world):
    request = services.create_draft(
        actor=world.hr_user,
        employee=world.owner,
        request_type=world.annual,
        data=days(MON),
        override_reason=" Accord de la direction ",
    )
    assert (request.employee, request.created_by, request.override_reason) == (
        world.owner, world.hr_user, "Accord de la direction",
    )


def test_an_exception_is_for_hr_only_and_never_for_oneself(world):
    with pytest.raises(NotAllowed):
        services.create_draft(
            actor=world.owner_user, employee=world.owner, request_type=world.annual, data=days(MON),
            override_reason="Je le vaux bien",
        )
    with pytest.raises(NotAllowed) as error:
        services.create_draft(
            actor=world.hr_user, employee=world.hr, request_type=world.annual, data=days(MON),
            override_reason="Pour moi",
        )
    assert error.value.code == "request.own_request"


def test_sick_leave_comment_is_redacted_in_the_audit_trail(world):
    request = services.create_draft(
        actor=world.owner_user, employee=world.owner, request_type=world.sick, data=days(TODAY, comment="Grippe sévère")
    )
    assert request.sensitive is True
    created = AuditEvent.objects.get(action="request.created")
    assert created.changes["comment"] == {"changed": True}
    services.update_request(
        actor=world.owner_user, request=request, data=days(TODAY, comment="Angine"), expected_version=1
    )
    updated = AuditEvent.objects.get(action="request.updated")
    assert updated.changes["comment"] == {"changed": True}
    everything = json.dumps([created.changes, updated.changes, created.object_label, updated.object_label], default=str)
    assert "Grippe" not in everything
    assert "Angine" not in everything


def test_editing_a_draft_recomputes_the_quantity_and_bumps_the_version(world):
    draft = services.create_draft(
        actor=world.owner_user, employee=world.owner, request_type=world.annual, data=days(MON)
    )
    updated = services.update_request(
        actor=world.owner_user, request=draft, data=days(MON, WED, ends_at_midday=True), expected_version=1
    )
    assert (updated.quantity, updated.version, updated.end_date) == (Decimal("2.50"), 2, WED)
    event = AuditEvent.objects.get(action="request.updated")
    assert event.changes["end_date"]["after"] == "2026-11-04"


def test_a_stale_version_is_refused_on_edit(world):
    draft = services.create_draft(
        actor=world.owner_user, employee=world.owner, request_type=world.annual, data=days(MON)
    )
    with pytest.raises(Conflict) as error:
        services.update_request(actor=world.owner_user, request=draft, data=days(TUE), expected_version=7)
    assert error.value.code == "request.already_processed"


def test_only_its_creator_edits_a_draft(world):
    draft = services.create_draft(
        actor=world.owner_user, employee=world.owner, request_type=world.annual, data=days(MON)
    )
    with pytest.raises(NotAllowed):
        services.update_request(actor=world.hr_user, request=draft, data=days(TUE), expected_version=1)


def test_an_approved_request_is_not_editable(world):
    approved = stored(world, data=days(MON))
    with pytest.raises(Conflict) as error:
        services.update_request(actor=world.owner_user, request=approved, data=days(TUE), expected_version=1)
    assert error.value.code == "request.not_editable"


def test_discarding_a_draft_deletes_it_and_is_audited(world):
    draft = services.create_draft(
        actor=world.owner_user, employee=world.owner, request_type=world.annual, data=days(MON)
    )
    public_id = str(draft.public_id)
    services.discard_draft(actor=world.owner_user, request=draft)
    assert not Request.objects.exists()
    assert AuditEvent.objects.filter(action="request.discarded", object_id=public_id).exists()


def test_a_request_that_was_sent_cannot_be_discarded(world):
    returned = stored(world, data=days(MON), status=RequestStatus.RETURNED)
    with pytest.raises(Conflict) as error:
        services.discard_draft(actor=world.owner_user, request=returned)
    assert error.value.code == "request.not_editable"
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_drafts.py -v`
Expected: 13 failed with `AttributeError: module 'apps.requests.services' has no attribute 'create_draft'`.

- [ ] **Step 3: Implement the shared helpers**

`backend/apps/requests/services/common.py`:

```python
"""Small helpers every lifecycle service uses: who is who, locking, versions, audit snapshots, guards."""

from __future__ import annotations

from typing import Any

from django.db.models import Max, QuerySet

from apps.accounts.roles import Role, has_role, users_with_role
from apps.audit import services as audit
from apps.core.errors import Conflict, NotAllowed
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors

from ..models import Request, RequestStatus, RequestStep, StepStatus

SNAPSHOT_FIELDS = (
    "start_date", "end_date", "starts_at_midday", "ends_at_midday", "start_time", "end_time",
    "quantity", "exceptional_event_id", "comment", "status", "override_reason",
)
DECIDED = (StepStatus.APPROVED, StepStatus.REJECTED, StepStatus.RETURNED)


# ------------------------------------------------------------------ people


def is_requester(user, request) -> bool:
    me = reach.employee_of(user)
    return me is not None and me.pk == request.employee_id


def account_of(employee):
    """The employee's account if they have one that can sign in, else None."""
    user = getattr(employee, "user", None)
    if user is None or not user.is_active:
        return None
    return user


def name_of(employee) -> str:
    return organisation_selectors.full_name(employee)


def hr_users(*, excluding=None) -> list:
    """Active HR holders, without the account of the `excluding` employee (the requester)."""
    excluded = getattr(excluding, "user", None) if excluding is not None else None
    return [user for user in users_with_role(Role.HR) if excluded is None or user.pk != excluded.pk]


# ------------------------------------------------------------------ audit


def label(request) -> str:
    return f"{name_of(request.employee)} {request.start_date:%d/%m/%Y}"


def snapshot(request) -> dict[str, Any]:
    return audit.snapshot(request, SNAPSHOT_FIELDS)


def redacted(request) -> tuple[str, ...]:
    """Fields whose content never enters the audit trail (AUD-05)."""
    return ("comment",) if request.sensitive else ()


def changes_since(before: dict[str, Any], request) -> dict[str, Any]:
    return audit.diff(before, snapshot(request), redact=redacted(request))


def note(request, key: str, text: str) -> dict[str, Any]:
    """A free-text reason or comment for the audit trail; on a sensitive request only the fact that it was given."""
    if request.sensitive:
        return {key: {"changed": True}}
    return {key: {"before": None, "after": text}}


# ------------------------------------------------------------------ rows and versions


def check_version(request, expected_version: int | None) -> None:
    if expected_version is not None and request.version != expected_version:
        raise Conflict("request.already_processed")


def save(request, *fields: str) -> None:
    request.save(update_fields=[*fields, "updated_at"])


def bump(request, *fields: str) -> None:
    """Save the given fields and move the version on, so that stale decisions are refused (REQ-18)."""
    request.version += 1
    request.save(update_fields=[*fields, "version", "updated_at"])


def locked(request) -> Request:
    """Lock the employee, then the request row, and return the fresh row. Every state change starts here.

    Taking the two locks always in this order is what makes two simultaneous actions queue up.
    """
    reach.lock_employee(request.employee_id)
    return (
        Request.objects.select_for_update(of=("self",))
        .select_related("request_type", "employee", "exceptional_event", "created_by")
        .get(pk=request.pk)
    )


def current_round(request, amendment=None) -> int:
    found = RequestStep.objects.filter(request=request, amendment=amendment).aggregate(last=Max("round"))
    return found["last"] or 0


def round_steps(request, amendment=None) -> QuerySet[RequestStep]:
    """The steps of the latest round of a request, or of one of its amendments, in order."""
    return RequestStep.objects.filter(
        request=request, amendment=amendment, round=current_round(request, amendment)
    ).order_by("position")


def has_decision(request) -> bool:
    """Whether somebody has already decided a step of the current round (REQ-07)."""
    return round_steps(request).filter(status__in=DECIDED).exists()


# ------------------------------------------------------------------ guards


def require_editor(actor, request) -> None:
    """Who may change or send a request that is not decided yet.

    A draft belongs to whoever created it. After that: the requester, unless HR entered it with an
    exception; or HR, for somebody else's request.
    """
    if request.status == RequestStatus.DRAFT:
        if request.created_by_id != actor.pk:
            raise NotAllowed("core.not_allowed")
        return
    own = is_requester(actor, request)
    if own and not request.override_reason:
        return
    if not own and has_role(actor, Role.HR):
        return
    raise NotAllowed("core.not_allowed")


def require_requester(actor, request) -> None:
    if not is_requester(actor, request):
        raise NotAllowed("core.not_allowed")


def require_hr_for_other(actor, request) -> None:
    """HR acting directly on a request (REQ-09, REQ-10): never on their own."""
    if not has_role(actor, Role.HR):
        raise NotAllowed("core.not_allowed")
    if is_requester(actor, request):
        raise NotAllowed("request.own_request")
```

- [ ] **Step 4: Implement the draft services**

`backend/apps/requests/services/drafts.py`:

```python
from __future__ import annotations

from django.db import transaction

from apps.accounts.roles import Role, has_role
from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.organisation import reach

from ..models import Request, RequestStatus
from .common import (
    SNAPSHOT_FIELDS,
    bump,
    changes_since,
    check_version,
    has_decision,
    label,
    locked,
    redacted,
    require_editor,
    snapshot,
)
from .data import DATA_FIELDS, RequestData, apply_data, compute_quantity
from .validation import structural_problems, validate


@transaction.atomic
def create_draft(*, actor, employee, request_type, data: RequestData, override_reason: str = "") -> Request:
    """Save a request without sending it (REQ-01). HR may create one for anybody, with an exception (REQ-02)."""
    me = reach.employee_of(actor)
    own = me is not None and me.pk == employee.pk
    is_hr = has_role(actor, Role.HR)
    if not own and not is_hr:
        raise NotAllowed("core.not_allowed")
    override_reason = override_reason.strip()
    if override_reason:
        if not is_hr:
            raise NotAllowed("core.not_allowed")
        if own:
            raise NotAllowed("request.own_request")
    problems = structural_problems(request_type=request_type, data=data)
    if problems:
        raise DomainError(problems[0].code, problems=problems)
    request = Request(
        employee=employee,
        request_type=request_type,
        status=RequestStatus.DRAFT,
        created_by=actor,
        override_reason=override_reason,
        sensitive=request_type.is_sensitive,
    )
    apply_data(request, data)
    request.comment = data.comment.strip()
    request.quantity = compute_quantity(request_type, data)
    request.save()
    audit.record(
        action="request.created",
        obj=request,
        object_label=label(request),
        changes=audit.diff(dict.fromkeys(SNAPSHOT_FIELDS), snapshot(request), redact=redacted(request)),
        actor=actor,
    )
    return request


@transaction.atomic
def update_request(*, actor, request, data: RequestData, expected_version: int) -> Request:
    """Edit a draft, a returned request, or a pending request that nobody has decided yet (REQ-07)."""
    request = locked(request)
    check_version(request, expected_version)
    require_editor(actor, request)
    request_type = request.request_type
    if request.status in (RequestStatus.DRAFT, RequestStatus.RETURNED):
        problems = structural_problems(request_type=request_type, data=data)
    elif request.status == RequestStatus.PENDING and not has_decision(request):
        problems = validate(
            employee=request.employee,
            request_type=request_type,
            data=data,
            override=bool(request.override_reason),
            ignoring_request_id=request.pk,
        )
    else:
        raise Conflict("request.not_editable")
    if problems:
        raise DomainError(problems[0].code, problems=problems)
    before = snapshot(request)
    apply_data(request, data)
    request.comment = data.comment.strip()
    request.quantity = compute_quantity(request_type, data)
    bump(request, *DATA_FIELDS, "quantity")
    audit.record(
        action="request.updated",
        obj=request,
        object_label=label(request),
        changes=changes_since(before, request),
        actor=actor,
    )
    return request


@transaction.atomic
def discard_draft(*, actor, request) -> None:
    """Delete a draft that was never sent (master D21). The discard itself is audited."""
    request = locked(request)
    require_editor(actor, request)
    if request.status != RequestStatus.DRAFT or request.submitted_at is not None:
        raise Conflict("request.not_editable")
    audit.record(
        action="request.discarded",
        obj=request,
        object_label=label(request),
        changes=audit.diff(snapshot(request), dict.fromkeys(SNAPSHOT_FIELDS), redact=redacted(request)),
        actor=actor,
    )
    request.delete()
```

Add to `backend/apps/requests/services/__init__.py`:

```python
from .drafts import create_draft, discard_draft, update_request
```

and add `"create_draft"`, `"discard_draft"`, `"update_request"` to `__all__`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_drafts.py -v`
Expected: 13 passed.

The audit trail stores `changes` as JSON (plan 01a, Task 8), which is why a date reads back as the text `2026-11-04`.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): drafts, with the HR exception and audit redaction for sensitive requests"
```

---

### Task 7: Approver resolution

**Files:**
- Create: `backend/apps/requests/services/chain.py`
- Modify: `backend/apps/requests/services/__init__.py`
- Modify: `backend/apps/requests/api/serializers.py` (append `ChainRowOut`)
- Modify: `backend/apps/requests/api/views.py` (append `TypeChainPreviewView`)
- Modify: `backend/apps/requests/api/urls.py` (one route)
- Modify: `backend/apps/requests/tests/helpers.py` (append `fresh`)
- Modify: `backend/apps/requests/tests/matrix.py` (one case)
- Test: `backend/apps/requests/tests/test_resolution.py`

**Interfaces:**
- Consumes: `apps.organisation.selectors.acting_users_for_manager(manager, *, on=None, excluding_employee_id=None) -> list[User]`, `apps.organisation.selectors.get_employee_for`, `apps.organisation.reach.employee_of`, `apps.organisation.services.create_delegation` (tests), `apps.accounts.roles` (`Role`, `has_role`, `users_with_role`), `apps.accounts.services` (`display_name`; `disable_account`, `assign_role` in tests), `apps.core.i18n.translate`, `account_of`, `name_of` (Task 6).
- Produces:
  - `apps.requests.services.chain.Resolution(rule: str, users: tuple = (), skip: bool = False, via_exec: bool = False)`
  - `apps.requests.services.resolve_rule(*, rule, named_person, requester, on=None) -> Resolution`: PRD 6.9 with master D13
  - `apps.requests.services.resolve_approvers(step: RequestStep) -> list[User]`
  - `apps.requests.services.is_eligible_approver(user, step) -> bool`: the user is one of the people the step is for, whatever the step's status
  - `apps.requests.services.can_act_on(user, step) -> bool`: eligible, the step is open, and the user has an employee record
  - `apps.requests.services.chain.is_open(step, request) -> bool`
  - `apps.requests.services.chain.waiting_names(*, rule, named_person, requester) -> list[str]`
  - `apps.requests.services.chain_preview(*, request_type, employee) -> list[ChainRow]` with `ChainRow(position, rule, mode, approvers)`
  - Route `requests:type-chain-preview`
  - Test helper `fresh(instance)`

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/requests/tests/helpers.py`:

```python
def fresh(instance):
    """The same row read again, with no cached relations."""
    return type(instance).objects.get(pk=instance.pk)
```

`backend/apps/requests/tests/test_resolution.py`:

```python
import datetime as dt

import pytest
from django.urls import reverse
from django.utils import translation

from apps.accounts import services as account_services
from apps.accounts.roles import Role
from apps.accounts.services import display_name
from apps.organisation import services as organisation_services
from apps.requests import services
from apps.requests.models import RequestStatus, RequestStep
from apps.requests.services import chain
from apps.requests.tests.helpers import MON, NOW, TODAY, days, fresh, stored

pytestmark = pytest.mark.django_db


def resolve(rule, requester, named=None):
    return services.resolve_rule(rule=rule, named_person=named, requester=fresh(requester))


def ids(resolution) -> set[int]:
    return {user.pk for user in resolution.users}


def delegate(world, manager, to):
    return organisation_services.create_delegation(
        actor=world.hr_user, manager=manager, delegate=to, start_date=TODAY, end_date=TODAY + dt.timedelta(days=7)
    )


def test_line_manager_rule_gives_the_manager(world):
    resolution = resolve("line_manager", world.owner)
    assert ids(resolution) == {world.manager_user.pk}
    assert (resolution.rule, resolution.skip) == ("line_manager", False)


def test_line_manager_rule_includes_an_active_delegate(world):
    delegate(world, world.manager, world.other_manager)
    assert ids(resolve("line_manager", world.owner)) == {world.manager_user.pk, world.other_manager_user.pk}


def test_delegate_who_is_the_requester_cannot_act(world):
    delegate(world, world.manager, world.owner)
    assert ids(resolve("line_manager", world.owner)) == {world.manager_user.pk}
    request = stored(world, data=days(MON), status=RequestStatus.PENDING)
    step = RequestStep.objects.create(
        request=request, round=1, position=1, approver_rule="line_manager", mode="approve", status="pending"
    )
    assert services.is_eligible_approver(world.owner_user, step) is False
    assert services.can_act_on(world.owner_user, step) is False


def test_ceo_request_skips_the_manager_rule(world):
    resolution = resolve("line_manager", world.ceo)
    assert (resolution.skip, resolution.users) == (True, ())


def test_disabled_manager_leaves_nobody(world):
    account_services.disable_account(actor=world.sysadmin_user, user=world.manager_user)
    resolution = resolve("line_manager", world.owner)
    assert (resolution.skip, resolution.users) == (False, ())


def test_hr_rule_gives_every_hr_holder_except_the_requester(world):
    account_services.assign_role(actor=world.sysadmin_user, user=world.other_manager_user, role=Role.HR)
    assert ids(resolve("hr_role", world.owner)) == {world.hr_user.pk, world.other_manager_user.pk}
    own = resolve("hr_role", world.hr)
    assert ids(own) == {world.other_manager_user.pk}
    assert own.via_exec is False


def test_the_only_hr_holder_falls_back_to_executives(world):
    resolution = resolve("hr_role", world.hr)
    assert ids(resolution) == {world.exec_user.pk}
    assert (resolution.rule, resolution.via_exec) == ("hr_role", True)


def test_without_hr_or_executive_nobody_is_left(world):
    account_services.disable_account(actor=world.sysadmin_user, user=world.exec_user)
    resolution = resolve("hr_role", world.hr)
    assert (resolution.users, resolution.via_exec, resolution.skip) == ((), True, False)


def test_named_person_rule_gives_that_person(world):
    resolution = resolve("named_person", world.owner, named=world.other_manager)
    assert ids(resolution) == {world.other_manager_user.pk}
    assert resolution.rule == "named_person"


def test_named_person_who_is_the_requester_becomes_an_hr_step(world):
    resolution = resolve("named_person", world.other_manager, named=world.other_manager)
    assert resolution.rule == "hr_role"
    assert ids(resolution) == {world.hr_user.pk}


def test_named_person_without_a_usable_account_leaves_nobody(world):
    account_services.disable_account(actor=world.sysadmin_user, user=world.other_manager_user)
    resolution = resolve("named_person", world.owner, named=fresh(world.other_manager))
    assert (resolution.rule, resolution.users) == ("named_person", ())


def test_waiting_names_say_hr_or_name_the_people(world):
    owner = fresh(world.owner)
    with translation.override("en"):
        assert chain.waiting_names(rule="hr_role", named_person=None, requester=owner) == ["HR"]
    with translation.override("fr"):
        assert chain.waiting_names(rule="hr_role", named_person=None, requester=owner) == ["RH"]
    manager_name = display_name(world.manager_user)
    assert chain.waiting_names(rule="line_manager", named_person=None, requester=owner) == [manager_name]
    assert chain.waiting_names(rule="hr_role", named_person=None, requester=fresh(world.hr)) == [
        display_name(world.exec_user)
    ]
    assert chain.waiting_names(rule="line_manager", named_person=None, requester=fresh(world.ceo)) == []


def test_a_manager_who_cannot_act_is_still_named(world):
    manager_name = display_name(world.manager_user)
    account_services.disable_account(actor=world.sysadmin_user, user=world.manager_user)
    names = chain.waiting_names(rule="line_manager", named_person=None, requester=fresh(world.owner))
    assert names == [manager_name]


def test_chain_preview_lists_who_will_decide_and_leaves_out_skipped_steps(world):
    rows = services.chain_preview(request_type=world.annual, employee=fresh(world.owner))
    assert [(row.position, row.rule, row.mode) for row in rows] == [
        (1, "line_manager", "approve"),
        (2, "hr_role", "approve"),
    ]
    assert rows[0].approvers == [display_name(world.manager_user)]
    for_ceo = services.chain_preview(request_type=world.annual, employee=fresh(world.ceo))
    assert [(row.position, row.rule) for row in for_ceo] == [(2, "hr_role")]


def test_who_can_act_on_a_step(world):
    request = stored(world, data=days(MON), status=RequestStatus.PENDING)
    step = RequestStep.objects.create(
        request=request, round=1, position=1, approver_rule="line_manager", mode="approve", status="pending"
    )
    assert services.can_act_on(world.manager_user, step) is True
    assert services.can_act_on(world.peer_user, step) is False
    assert services.can_act_on(world.other_manager_user, step) is False
    assert services.can_act_on(world.hr_user, step) is False
    assert [user.pk for user in services.resolve_approvers(step)] == [world.manager_user.pk]

    step.flagged_at = NOW
    step.save()
    assert services.can_act_on(world.hr_user, step) is True  # a step HR was alerted about

    step.status = "approved"
    step.save()
    assert services.can_act_on(world.manager_user, step) is False
    assert services.is_eligible_approver(world.manager_user, step) is True


def test_hr_previews_the_chain_for_an_employee(world, client_for):
    url = reverse("requests:type-chain-preview", kwargs={"pk": world.annual.pk})
    response = client_for(world.hr_user).get(url, {"employee": str(world.owner.public_id)})
    assert response.status_code == 200
    body = response.json()
    assert [(row["position"], row["rule"], row["mode"]) for row in body] == [
        (1, "line_manager", "approve"),
        (2, "hr_role", "approve"),
    ]
    assert body[0]["approvers"] == [display_name(world.manager_user)]
    assert client_for(world.hr_user).get(url).status_code == 404
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_resolution.py -v`
Expected: collection error, `ImportError: cannot import name 'chain' from 'apps.requests.services'`.

- [ ] **Step 3: Implement resolution**

`backend/apps/requests/services/chain.py`:

```python
"""Who decides a step (PRD 6.9), and how a chain moves from one step to the next."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from apps.accounts.roles import Role, has_role, users_with_role
from apps.accounts.services import display_name
from apps.core.i18n import translate
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors

from ..models import AmendmentStatus, ApproverRule, ChainStep, RequestStatus, StepMode, StepStatus
from .common import account_of, name_of


@dataclass(frozen=True)
class Resolution:
    """Who may decide a step right now. `rule` is the rule that applied after the fallbacks of 6.9."""

    rule: str
    users: tuple = ()
    skip: bool = False  # line-manager rule, and the requester has no manager at all
    via_exec: bool = False  # HR rule that fell back to Executive Management


@dataclass(frozen=True)
class ChainRow:
    position: int
    rule: str
    mode: str
    approvers: list[str]


def _hr_resolution(requester) -> Resolution:
    requester_account = getattr(requester, "user", None)
    excluded = requester_account.pk if requester_account is not None else None
    holders = tuple(user for user in users_with_role(Role.HR) if user.pk != excluded)
    if holders:
        return Resolution(rule=ApproverRule.HR_ROLE, users=holders)
    executives = tuple(user for user in users_with_role(Role.EXEC) if user.pk != excluded)
    return Resolution(rule=ApproverRule.HR_ROLE, users=executives, via_exec=True)


def resolve_rule(*, rule: str, named_person, requester, on: date | None = None) -> Resolution:
    """Apply an approver rule to a requester (PRD 6.9).

    Line manager: the manager and their active delegates, never the requester. No manager at all:
    the step is skipped. A manager who cannot act gives nobody (master D13), never a skip.
    Named person: that person; if it is the requester, the step becomes an HR step.
    HR role: every HR holder but the requester, else every executive but the requester, else nobody.
    """
    if rule == ApproverRule.LINE_MANAGER:
        manager = requester.manager
        if manager is None:
            return Resolution(rule=ApproverRule.LINE_MANAGER, skip=True)
        users = organisation_selectors.acting_users_for_manager(
            manager, on=on, excluding_employee_id=requester.pk
        )
        return Resolution(rule=ApproverRule.LINE_MANAGER, users=tuple(users))
    if rule == ApproverRule.NAMED_PERSON and named_person is not None and named_person.pk != requester.pk:
        user = account_of(named_person)
        return Resolution(rule=ApproverRule.NAMED_PERSON, users=(user,) if user is not None else ())
    return _hr_resolution(requester)


def resolve_approvers(step) -> list:
    """The accounts that may decide this step."""
    resolution = resolve_rule(
        rule=step.approver_rule, named_person=step.named_person, requester=step.request.employee
    )
    return list(resolution.users)


def is_open(step, request) -> bool:
    """A step that is waiting for a decision on a request, or on an amendment, that is itself still pending."""
    if step.status != StepStatus.PENDING or step.mode != StepMode.APPROVE:
        return False
    if step.amendment_id is None:
        return request.status == RequestStatus.PENDING
    return step.amendment.status == AmendmentStatus.PENDING


def is_eligible_approver(user, step) -> bool:
    """Whether this user is one of the people this step is for, whatever the step's status."""
    request = step.request
    me = reach.employee_of(user)
    if me is not None and me.pk == request.employee_id:
        return False  # nobody acts on their own request
    resolution = resolve_rule(
        rule=step.approver_rule, named_person=step.named_person, requester=request.employee
    )
    if any(candidate.pk == user.pk for candidate in resolution.users):
        return True
    # A manager step that HR was alerted about can be decided by HR (permission matrix: "when flagged").
    return step.flagged_at is not None and resolution.rule != ApproverRule.HR_ROLE and has_role(user, Role.HR)


def can_act_on(user, step) -> bool:
    """Whether this user may decide this step now."""
    return (
        is_open(step, step.request)
        and reach.employee_of(user) is not None
        and is_eligible_approver(user, step)
    )


def waiting_names(*, rule: str, named_person, requester) -> list[str]:
    """The names to show for "waiting for …" and "who will decide". HR is shown as a role, not as people."""
    resolution = resolve_rule(rule=rule, named_person=named_person, requester=requester)
    if resolution.skip:
        return []
    if resolution.rule == ApproverRule.HR_ROLE:
        if resolution.via_exec:
            return [display_name(user) for user in resolution.users]
        return [translate("request.label_hr")]
    if resolution.users:
        return [display_name(user) for user in resolution.users]
    # Somebody is designated but cannot act (master D13): they are still the one being waited for.
    person = requester.manager if resolution.rule == ApproverRule.LINE_MANAGER else named_person
    return [name_of(person)] if person is not None else []


def chain_preview(*, request_type, employee) -> list[ChainRow]:
    """The steps a request of this type would go through for this employee, without the skipped ones."""
    rows: list[ChainRow] = []
    config = ChainStep.objects.filter(request_type=request_type).select_related("named_person").order_by("position")
    for step in config:
        resolution = resolve_rule(rule=step.approver_rule, named_person=step.named_person, requester=employee)
        if resolution.skip:
            continue
        rows.append(
            ChainRow(
                position=step.position,
                rule=resolution.rule,
                mode=step.mode,
                approvers=waiting_names(rule=step.approver_rule, named_person=step.named_person, requester=employee),
            )
        )
    return rows
```

Add to `backend/apps/requests/services/__init__.py`:

```python
from .chain import can_act_on, chain_preview, is_eligible_approver, resolve_approvers, resolve_rule
```

and add the five names to `__all__`.

- [ ] **Step 4: Add the chain-preview endpoint**

Append to `backend/apps/requests/api/serializers.py`:

```python
class ChainRowOut(serializers.Serializer):
    position = serializers.IntegerField()
    rule = serializers.ChoiceField(choices=ApproverRule.choices)
    mode = serializers.ChoiceField(choices=StepMode.choices)
    approvers = serializers.ListField(child=serializers.CharField())
```

Append to `backend/apps/requests/api/views.py` (add `ChainRowOut` to the import from `.serializers`):

```python
class TypeChainPreviewView(APIView):
    http_method_names = ["get"]
    access = {"GET": HR_ONLY}

    @extend_schema(
        operation_id="request_types_chain_preview",
        parameters=[OpenApiParameter("employee", str, required=True)],
        responses=ChainRowOut(many=True),
    )
    def get(self, request, pk: int):
        request_type = selectors.get_type(pk)
        public_id = request.query_params.get("employee")
        if not public_id:
            raise NotFound("core.not_found")
        employee = organisation_selectors.get_employee_for(request.user, public_id)
        rows = services.chain_preview(request_type=request_type, employee=employee)
        return Response(ChainRowOut(rows, many=True).data)
```

Add to `urlpatterns` in `backend/apps/requests/api/urls.py`, after the `type-steps` route:

```python
    path("request-types/<int:pk>/chain-preview", views.TypeChainPreviewView.as_view(), name="type-chain-preview"),
```

Add to `CONFIG_CASES` in `backend/apps/requests/tests/matrix.py`, after the `type-steps` cases:

```python
    Case(
        "requests:type-chain-preview",
        "GET",
        only(P.HR),
        kwargs=lambda w: {"pk": w.annual.pk},
        query=lambda w: {"employee": str(w.owner.public_id)},
    ),
```

- [ ] **Step 5: Regenerate the API description**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: no line starting with `Warning`, then `backend/openapi.yaml is up to date.` The file now has `/api/v1/request-types/{id}/chain-preview`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_resolution.py tests/test_permission_matrix.py tests/test_openapi.py -v`
Expected: 16 passed in `test_resolution.py`; the matrix passes with the new case; the description check passes.

`acting_users_for_manager` belongs to plan 02 (its Task 6): the manager first, then the delegates of the day, each only with an account that can sign in, and never the employee given as `excluding_employee_id`. If `test_disabled_manager_leaves_nobody` or `test_delegate_who_is_the_requester_cannot_act` fails, the defect is in that selector; fix it there, not here.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/requests backend/openapi.yaml
git add frontend/src/api/schema.d.ts 2>/dev/null || true
git commit -m "feat(requests): approver resolution for line manager, HR role and named person"
```

---

### Task 8: Chain activation and outcomes

**Files:**
- Create: `backend/apps/requests/services/notices.py`
- Create: `backend/apps/requests/services/outcomes.py`
- Modify: `backend/apps/requests/services/chain.py` (append the activation functions)
- Modify: `backend/apps/requests/apps.py` (register the notification events)
- Test: `backend/apps/requests/tests/test_chain.py`

**Interfaces:**
- Consumes: `apps.notifications.services.register_event(code, *, link)`, `apps.notifications.services.notify(*, users, event, params, target_type, target_public_id, dedupe_key)`, `apps.notifications.models.Notification`, `apps.organisation.selectors.direct_reports(employee)`, `apps.organisation.selectors.acting_users_for_manager`, `balance_port()` (Task 4), `resolve_rule` (Task 7), `round_steps`, `current_round`, `save`, `label`, `account_of`, `hr_users`, `name_of` (Task 6), `data_of`, `leave_days` (Task 3).
- Produces:
  - `apps.requests.services.chain.start_round(*, request, amendment=None, actor) -> None`: copies the type's chain into a new round and wakes its first step (REQ-04)
  - `apps.requests.services.chain.advance(*, request, amendment=None, actor) -> None`: wakes the next waiting step or finishes the round; adds an HR step when no person has decided (REQ-14)
  - `apps.requests.services.chain.apply_decision(*, request, step, decision, actor) -> None`
  - `apps.requests.services.chain.STEP_STATUS` (decision to step status)
  - `apps.requests.services.outcomes.approve_request(*, request, actor)`, `reject(*, request, amendment, actor)`, `send_back(*, request, actor)`, `complete(*, request, amendment, actor)`, `close_open_steps(request, amendment=None) -> None`
  - `apps.requests.services.notices.tell(users, event, request, *, dedupe_key=None, **extra)`, `tell_requester(request, event, **kw)`, `tell_hr(request, event, **kw)`, `tell_sysadmins(event, *, dedupe_key=None)`, `register_events()`, `EVENTS`
  - Notification events of master 7.9, plus `step.informed` (see Contract notes); audit action `request.approved`

- [ ] **Step 1: Write the failing tests**

`backend/apps/requests/tests/test_chain.py`:

```python
from decimal import Decimal

import pytest

from apps.accounts import services as account_services
from apps.audit.models import AuditEvent
from apps.core.errors import DomainError
from apps.notifications import services as notification_services
from apps.notifications.models import Notification
from apps.requests import services
from apps.requests.models import RequestStatus, RequestStep
from apps.requests.services import StepSpec, chain, outcomes
from apps.requests.tests.helpers import FRI, MON, NOW, TODAY, TUE, days, fresh, stored

pytestmark = pytest.mark.django_db


def started(world, **options):
    options.setdefault("data", days(MON))
    request = stored(world, status=RequestStatus.PENDING, **options)
    chain.start_round(request=request, actor=request.created_by)
    return request


def steps(request) -> list[RequestStep]:
    return list(RequestStep.objects.filter(request=request).order_by("round", "position"))


def approve_all(request, by) -> None:
    for step in steps(request):
        step.status = "approved"
        step.decided_by = by
        step.save()


def test_starting_a_round_copies_the_chain_and_wakes_the_first_step(world):
    request = started(world)
    first, second = steps(request)
    assert (first.round, first.position, first.approver_rule, first.mode, first.status) == (
        1, 1, "line_manager", "approve", "pending",
    )
    assert (first.activated_at, first.reminder_after_days, first.flag_after_days) == (NOW, 2, 4)
    assert (second.approver_rule, second.status, second.activated_at) == ("hr_role", "waiting", None)
    notification = Notification.objects.get(event_code="step.to_decide")
    assert (notification.user, notification.target_type, notification.target_public_id) == (
        world.manager_user, "request", str(request.public_id),
    )


def test_a_notify_step_informs_and_moves_on(world):
    request = started(world, request_type=world.sick, data=days(TODAY, comment="Grippe"))
    first, second = steps(request)
    assert (first.status, first.decided_at, second.status) == ("notified", NOW, "pending")
    assert Notification.objects.filter(event_code="sick.declared", user=world.manager_user).count() == 1
    assert Notification.objects.filter(event_code="step.to_decide", user=world.hr_user).count() == 1


def test_a_requester_without_a_manager_skips_the_manager_step(world):
    request = started(world, employee=world.ceo, created_by=world.exec_user)
    first, second = steps(request)
    assert (first.status, second.status) == ("skipped", "pending")
    assert Notification.objects.filter(event_code="step.to_decide", user=world.hr_user).count() == 1


def test_manager_who_cannot_act_is_flagged_to_hr_at_once(world):
    account_services.disable_account(actor=world.sysadmin_user, user=world.manager_user)
    request = started(world, employee=fresh(world.owner))
    first = steps(request)[0]
    assert (first.status, first.flagged_at) == ("pending", NOW)
    assert Notification.objects.filter(event_code="step.flagged", user=world.hr_user).count() == 1
    assert not Notification.objects.filter(event_code="step.to_decide").exists()


def test_an_hr_step_nobody_can_take_alerts_the_administrators(world):
    services.replace_steps(actor=world.hr_user, request_type=world.remote, steps=[StepSpec(approver_rule="hr_role")])
    account_services.disable_account(actor=world.sysadmin_user, user=world.exec_user)
    request = started(world, employee=fresh(world.hr), created_by=world.hr_user, request_type=world.remote)
    (only,) = steps(request)
    assert (only.status, only.flagged_at) == ("pending", None)
    assert Notification.objects.filter(event_code="hr_step.unattended", user=world.sysadmin_user).count() == 1


def test_chain_without_a_human_decision_gets_an_hr_step(world):
    services.replace_steps(
        actor=world.hr_user, request_type=world.remote, steps=[StepSpec(approver_rule="line_manager")]
    )
    request = started(world, employee=world.ceo, created_by=world.exec_user, request_type=world.remote)
    first, safety = steps(request)
    assert first.status == "skipped"
    assert (safety.round, safety.position, safety.approver_rule, safety.mode, safety.status) == (
        1, 2, "hr_role", "approve", "pending",
    )
    assert fresh(request).status == "pending"


def test_a_type_left_without_steps_still_gets_a_person_to_decide(world):
    world.remote.chain_steps.all().delete()
    request = started(world, request_type=world.remote)
    (only,) = steps(request)
    assert (only.approver_rule, only.mode, only.status) == ("hr_role", "approve", "pending")


def test_when_every_step_is_done_the_request_is_approved(world, port):
    request = started(world, data=days(MON, TUE))
    approve_all(request, world.manager)
    chain.advance(request=request, actor=world.hr_user)
    saved = fresh(request)
    assert (saved.status, saved.decided_at) == ("approved", NOW)
    assert port.checks[-1]["ignoring_request_id"] == request.pk
    assert port.taken == [
        {
            "request_id": request.pk,
            "employee_id": world.owner.pk,
            "days": {MON: Decimal("1"), TUE: Decimal("1")},
            "actor": world.hr_user,
        }
    ]
    assert Notification.objects.filter(event_code="request.approved", user=world.owner_user).count() == 1
    assert AuditEvent.objects.filter(action="request.approved", object_id=str(request.public_id)).exists()


def test_final_approval_fails_when_the_balance_no_longer_covers_it(world, port):
    request = started(world)
    approve_all(request, world.manager)
    port.ok = False
    with pytest.raises(DomainError) as error:
        chain.advance(request=request, actor=world.hr_user)
    assert error.value.code == "request.balance_insufficient"
    assert fresh(request).status == "pending"
    assert port.taken == []


def test_an_exception_skips_the_balance_check_but_still_posts_the_days(world, port):
    request = stored(world, data=days(MON), status=RequestStatus.PENDING)
    request.override_reason = "Accord de la direction"
    request.save()
    chain.start_round(request=request, actor=world.hr_user)
    approve_all(request, world.manager)
    port.ok = False
    chain.advance(request=request, actor=world.hr_user)
    assert fresh(request).status == "approved"
    assert port.checks == []
    assert len(port.taken) == 1


def test_types_without_balance_effect_post_nothing(world, port):
    request = started(world, request_type=world.remote)
    approve_all(request, world.manager)
    chain.advance(request=request, actor=world.hr_user)
    assert fresh(request).status == "approved"
    assert (port.checks, port.taken) == ([], [])


def test_a_manager_whose_leave_is_approved_is_prompted_to_name_a_delegate(world):
    request = started(world, employee=world.manager, created_by=world.manager_user, data=days(MON, FRI))
    approve_all(request, world.ceo)
    chain.advance(request=request, actor=world.hr_user)
    prompt = Notification.objects.get(event_code="delegation.prompt")
    assert (prompt.user, prompt.target_public_id) == (world.manager_user, str(request.public_id))
    # The link opens the delegations page of plan 02 with the dates of the absence filled in.
    assert (prompt.parameters["from"], prompt.parameters["to"]) == ("2026-11-02", "2026-11-06")
    assert notification_services.render(prompt)["link"] == "/team/delegations?from=2026-11-02&to=2026-11-06"


def test_no_delegation_prompt_without_a_team_or_for_remote_work(world):
    own = started(world)
    approve_all(own, world.manager)
    chain.advance(request=own, actor=world.hr_user)
    remote = started(world, employee=world.manager, created_by=world.manager_user, request_type=world.remote)
    approve_all(remote, world.ceo)
    chain.advance(request=remote, actor=world.hr_user)
    assert not Notification.objects.filter(event_code="delegation.prompt").exists()


def test_rejecting_closes_the_request_and_tells_the_requester(world):
    request = started(world)
    outcomes.reject(request=request, amendment=None, actor=world.manager_user)
    saved = fresh(request)
    assert (saved.status, saved.decided_at) == ("rejected", NOW)
    assert [step.status for step in steps(request)] == ["skipped", "skipped"]
    assert Notification.objects.filter(event_code="request.rejected", user=world.owner_user).count() == 1
    assert AuditEvent.objects.filter(action="request.rejected").exists()


def test_sending_back_returns_the_request_to_its_requester(world):
    request = started(world)
    outcomes.send_back(request=request, actor=world.manager_user)
    assert fresh(request).status == "returned"
    assert Notification.objects.filter(event_code="request.returned", user=world.owner_user).count() == 1
    assert AuditEvent.objects.filter(action="request.returned").exists()
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_chain.py -v`
Expected: collection error, `ImportError: cannot import name 'outcomes' from 'apps.requests.services'`.

- [ ] **Step 3: Implement the notices**

`backend/apps/requests/services/notices.py`:

```python
"""Every notification the request engine sends. Texts are in messages.py under notification.<event>.*.

Parameters carry a name and dates only: never a comment, a reason or a file name (NOT-03).
"""

from __future__ import annotations

from typing import Any

from apps.accounts.roles import Role, users_with_role
from apps.notifications.services import notify, register_event

from .common import account_of, hr_users, name_of

REQUEST_LINK = "/requests/{target}"

EVENTS = {
    "step.to_decide": REQUEST_LINK,
    "step.reminder": REQUEST_LINK,
    "step.flagged": REQUEST_LINK,
    "step.informed": REQUEST_LINK,
    "request.approved": REQUEST_LINK,
    "request.rejected": REQUEST_LINK,
    "request.returned": REQUEST_LINK,
    "request.withdrawn": REQUEST_LINK,
    "request.cancelled": REQUEST_LINK,
    "request.corrected": REQUEST_LINK,
    "amendment.submitted": REQUEST_LINK,
    "amendment.approved": REQUEST_LINK,
    "amendment.rejected": REQUEST_LINK,
    "sick.declared": REQUEST_LINK,
    "certificate.due_soon": REQUEST_LINK,
    "certificate.overdue": REQUEST_LINK,
    # Plan 02's delegations page opens its sheet filled in from these two ISO dates.
    "delegation.prompt": "/team/delegations?from={from}&to={to}",
    "hr_step.unattended": "/admin",
}


def register_events() -> None:
    for code, link in EVENTS.items():
        register_event(code, link=link)


def _params(request, **extra: Any) -> dict[str, Any]:
    return {
        "employee": name_of(request.employee),
        "start": f"{request.start_date:%d/%m/%Y}",
        "end": f"{request.end_date:%d/%m/%Y}",
        **extra,
    }


def tell(users, event: str, request, *, dedupe_key: str | None = None, **extra: Any) -> list:
    """Notify these accounts about this request. Duplicates and missing accounts are dropped."""
    unique = list({user.pk: user for user in users if user is not None}.values())
    if not unique:
        return []
    return notify(
        users=unique,
        event=event,
        params=_params(request, **extra),
        target_type="request",
        target_public_id=str(request.public_id),
        dedupe_key=dedupe_key,
    )


def tell_requester(request, event: str, **options: Any) -> list:
    return tell([account_of(request.employee)], event, request, **options)


def tell_hr(request, event: str, **options: Any) -> list:
    return tell(hr_users(excluding=request.employee), event, request, **options)


def tell_sysadmins(event: str, *, dedupe_key: str | None = None) -> list:
    """System Administrators see no business data: the notification carries no name and no date."""
    users = list(users_with_role(Role.SYSADMIN))
    if not users:
        return []
    return notify(users=users, event=event, params={}, dedupe_key=dedupe_key)


def informed_event(request) -> str:
    return "sick.declared" if request.sensitive else "step.informed"


def decide_event(amendment) -> str:
    return "amendment.submitted" if amendment is not None else "step.to_decide"
```

Replace the `ready` method in `backend/apps/requests/apps.py` with:

```python
    def ready(self) -> None:
        from apps.core.i18n import register_messages

        from .messages import MESSAGES
        from .services import notices

        register_messages(MESSAGES)
        notices.register_events()
```

- [ ] **Step 4: Implement the outcomes**

`backend/apps/requests/services/outcomes.py`:

```python
"""What happens to a request when its chain reaches a result."""

from __future__ import annotations

from django.utils import timezone

from apps.audit import services as audit
from apps.core.errors import DomainError
from apps.organisation import selectors as organisation_selectors

from ..models import BalanceEffect, CalendarLabel, RequestStatus, StepStatus, Unit
from ..ports import balance_port
from . import notices
from .common import label, round_steps, save
from .data import data_of, leave_days


def close_open_steps(request, amendment=None) -> None:
    """Steps of the current round that nobody will decide any more are recorded as skipped."""
    round_steps(request, amendment).filter(status__in=(StepStatus.WAITING, StepStatus.PENDING)).update(
        status=StepStatus.SKIPPED
    )


def _status_change(before: str, after: str) -> dict:
    return {"status": {"before": before, "after": after}}


def _prompt_delegation(request) -> None:
    """REQ-12: a manager whose own absence is approved is invited to name a delegate for those dates."""
    request_type = request.request_type
    if request_type.unit != Unit.DAY or request_type.calendar_label != CalendarLabel.ABSENT:
        return
    if not organisation_selectors.direct_reports(request.employee).exists():
        return
    notices.tell_requester(
        request,
        "delegation.prompt",
        dedupe_key=f"request:{request.pk}:delegation_prompt",
        **{"from": request.start_date.isoformat(), "to": request.end_date.isoformat()},
    )


def approve_request(*, request, actor) -> None:
    """Final approval. The balance is checked a second time (PRD 6.3) and the days are posted."""
    request_type = request.request_type
    deducts = request_type.balance_effect == BalanceEffect.DEDUCTS_ANNUAL
    days = leave_days(request_type, data_of(request))
    if deducts and not request.override_reason:
        verdict = balance_port().check(employee_id=request.employee_id, new_days=days, ignoring_request_id=request.pk)
        if not verdict.ok:
            raise DomainError("request.balance_insufficient", shortfall=verdict.shortfall)
    previous = request.status
    request.status = RequestStatus.APPROVED
    request.decided_at = timezone.now()
    save(request, "status", "decided_at")
    if deducts and days:
        balance_port().post_taken(request_id=request.pk, employee_id=request.employee_id, days=days, actor=actor)
    audit.record(
        action="request.approved",
        obj=request,
        object_label=label(request),
        changes=_status_change(previous, request.status),
        actor=actor,
    )
    notices.tell_requester(request, "request.approved")
    _prompt_delegation(request)


def reject(*, request, amendment, actor) -> None:
    previous = request.status
    close_open_steps(request)
    request.status = RequestStatus.REJECTED
    request.decided_at = timezone.now()
    save(request, "status", "decided_at")
    audit.record(
        action="request.rejected",
        obj=request,
        object_label=label(request),
        changes=_status_change(previous, request.status),
        actor=actor,
    )
    notices.tell_requester(request, "request.rejected")


def send_back(*, request, actor) -> None:
    """Return the request to its requester for correction (REQ-06). It reserves nothing while returned."""
    previous = request.status
    close_open_steps(request)
    request.status = RequestStatus.RETURNED
    save(request, "status")
    audit.record(
        action="request.returned",
        obj=request,
        object_label=label(request),
        changes=_status_change(previous, request.status),
        actor=actor,
    )
    notices.tell_requester(request, "request.returned")


def complete(*, request, amendment, actor) -> None:
    """Called when every step of a round is done and at least one person approved."""
    approve_request(request=request, actor=actor)
```

`reject` and `complete` take `amendment` from the start; Task 14 gives them their amendment branch.

- [ ] **Step 5: Implement activation**

In `backend/apps/requests/services/chain.py`, replace the import block at the top of the file with:

```python
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from django.utils import timezone

from apps.accounts.roles import Role, has_role, users_with_role
from apps.accounts.services import display_name
from apps.core.i18n import translate
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors

from ..models import (
    AmendmentStatus,
    ApproverRule,
    ChainStep,
    Decision,
    RequestStatus,
    RequestStep,
    StepMode,
    StepStatus,
)
from . import notices, outcomes
from .common import account_of, current_round, name_of, round_steps
```

Append to the end of `backend/apps/requests/services/chain.py`:

```python
STEP_STATUS = {
    Decision.APPROVE: StepStatus.APPROVED,
    Decision.REJECT: StepStatus.REJECTED,
    Decision.RETURN: StepStatus.RETURNED,
}


def _hr_safety_step(request, amendment, number: int, position: int) -> RequestStep:
    return RequestStep(
        request=request,
        amendment=amendment,
        round=number,
        position=position,
        approver_rule=ApproverRule.HR_ROLE,
        mode=StepMode.APPROVE,
        status=StepStatus.WAITING,
        reminder_after_days=2,
        flag_after_days=None,
    )


def start_round(*, request, amendment=None, actor) -> None:
    """Copy the type's chain into a new round and wake its first step (REQ-04).

    The copy is what makes later changes to the configuration harmless for requests already sent.
    """
    number = current_round(request, amendment) + 1
    config = ChainStep.objects.filter(request_type=request.request_type).order_by("position")
    rows = [
        RequestStep(
            request=request,
            amendment=amendment,
            round=number,
            position=step.position,
            approver_rule=step.approver_rule,
            mode=step.mode,
            named_person_id=step.named_person_id,
            status=StepStatus.WAITING,
            reminder_after_days=step.reminder_after_days,
            flag_after_days=step.flag_after_days,
        )
        for step in config
    ]
    if not rows:
        rows = [_hr_safety_step(request, amendment, number, 1)]
    RequestStep.objects.bulk_create(rows)
    advance(request=request, amendment=amendment, actor=actor)


def advance(*, request, amendment=None, actor) -> None:
    """Wake the next waiting step of the current round, or finish the round when none is left."""
    now = timezone.now()
    steps = list(round_steps(request, amendment).select_related("named_person"))
    for step in steps:
        if step.status != StepStatus.WAITING:
            continue
        resolution = resolve_rule(
            rule=step.approver_rule, named_person=step.named_person, requester=request.employee
        )
        step.activated_at = now
        if step.mode == StepMode.NOTIFY:
            step.status = StepStatus.NOTIFIED
            step.decided_at = now
            step.save(update_fields=["status", "activated_at", "decided_at"])
            notices.tell(resolution.users, notices.informed_event(request), request)
            continue
        if resolution.skip:
            step.status = StepStatus.SKIPPED
            step.decided_at = now
            step.save(update_fields=["status", "activated_at", "decided_at"])
            continue
        step.status = StepStatus.PENDING
        if resolution.users:
            notices.tell(resolution.users, notices.decide_event(amendment), request)
        elif resolution.rule == ApproverRule.HR_ROLE:
            notices.tell_sysadmins("hr_step.unattended", dedupe_key=f"step:{step.pk}:unattended")
        else:
            # Somebody is designated but cannot act (master D13): HR is alerted at once.
            step.flagged_at = now
            notices.tell_hr(request, "step.flagged", dedupe_key=f"step:{step.pk}:flagged")
        step.save(update_fields=["status", "activated_at", "flagged_at"])
        return
    if not any(step.status == StepStatus.APPROVED for step in steps):
        # Every step was informed or skipped. A person must still decide (REQ-14).
        position = max(step.position for step in steps) + 1
        _hr_safety_step(request, amendment, steps[0].round, position).save()
        advance(request=request, amendment=amendment, actor=actor)
        return
    outcomes.complete(request=request, amendment=amendment, actor=actor)


def apply_decision(*, request, step, decision, actor) -> None:
    """What a decision on a step does to the request, or to the amendment the step belongs to."""
    amendment = step.amendment
    if decision == Decision.APPROVE:
        advance(request=request, amendment=amendment, actor=actor)
    elif decision == Decision.REJECT:
        outcomes.reject(request=request, amendment=amendment, actor=actor)
    else:
        outcomes.send_back(request=request, actor=actor)
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_chain.py apps/requests/tests/test_resolution.py -v`
Expected: 15 passed in `test_chain.py`, 16 passed in `test_resolution.py`.

A link template may use `{target}` and any parameter of its event (plan 01a, Task 11); `delegation.prompt` uses `{from}` and `{to}`, which `_prompt_delegation` passes as ISO dates.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): chain activation, final approval and the notifications of the engine"
```

---

### Task 9: Sending a request

**Files:**
- Create: `backend/apps/requests/services/lifecycle.py`
- Modify: `backend/apps/requests/services/__init__.py`
- Modify: `backend/apps/requests/apps.py` (register two HR settings)
- Modify: `backend/apps/requests/tests/helpers.py` (append `draft`, `submitted`, `steps`)
- Test: `backend/apps/requests/tests/test_submit.py`

**Interfaces:**
- Consumes: `locked`, `check_version`, `bump`, `require_editor`, `label` (Task 6), `validate` (Task 5), `chain.start_round` (Task 8), `apps.settings.registry` (`SettingDef`, `register`), `apps.settings.services.get`.
- Produces:
  - `apps.requests.services.submit(*, actor, request, expected_version=None) -> Request`: validates under the employee lock, recomputes the quantity, copies the chain, sets `certificate_due_at` for types that require a document, bumps the version. A request that is not a draft or a returned request raises `Conflict("request.already_processed")`.
  - `apps.requests.services.lifecycle.certificate_deadline_hours(request_type) -> int` (master D10)
  - HR settings `certificate_deadline_hours` (48) and `certificate_warning_hours` (12)
  - Audit action `request.submitted`
  - Test helpers `draft(world, *, employee=None, actor=None, request_type=None, data=None, override_reason="")`, `submitted(world, **options)`, `steps(request)`

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/requests/tests/helpers.py`:

```python
from apps.requests import services  # noqa: E402
from apps.requests.models import RequestStep  # noqa: E402


def draft(world, *, employee=None, actor=None, request_type=None, data=None, override_reason=""):
    """A draft created through the service, by the employee unless another actor is given."""
    employee = employee or world.owner
    return services.create_draft(
        actor=actor or employee.user,
        employee=employee,
        request_type=request_type or world.annual,
        data=data or days(MON),
        override_reason=override_reason,
    )


def submitted(world, **options):
    """A request that was created and sent by the same person."""
    request = draft(world, **options)
    return services.submit(actor=request.created_by, request=request, expected_version=request.version)


def steps(request) -> list[RequestStep]:
    """Every step of the request itself (not of its amendments), oldest round first."""
    return list(RequestStep.objects.filter(request=request, amendment=None).order_by("round", "position"))
```

`backend/apps/requests/tests/test_submit.py`:

```python
import datetime as dt
from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.calendar.models import PublicHoliday
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.notifications.models import Notification
from apps.requests import services
from apps.requests.models import RequestStep
from apps.requests.services import StepSpec
from apps.requests.tests.helpers import MON, NEXT_MON, NOW, TODAY, TUE, days, draft, fresh, steps, stored, submitted
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db


def test_sending_validates_copies_the_chain_and_tells_the_manager(world):
    request = submitted(world, data=days(MON, TUE))
    assert (request.status, request.version, request.submitted_at, request.quantity) == (
        "pending", 2, NOW, Decimal("2.00"),
    )
    assert [(step.approver_rule, step.status) for step in steps(request)] == [
        ("line_manager", "pending"),
        ("hr_role", "waiting"),
    ]
    assert Notification.objects.filter(event_code="step.to_decide", user=world.manager_user).count() == 1
    event = AuditEvent.objects.get(action="request.submitted")
    assert event.object_id == str(request.public_id)
    assert event.changes == {"status": {"before": "draft", "after": "pending"}}


def test_a_request_that_breaks_a_rule_is_not_sent(world):
    stored(world, data=days(MON))
    request = draft(world, request_type=world.remote, data=days(MON))
    with pytest.raises(DomainError) as error:
        services.submit(actor=world.owner_user, request=request)
    assert error.value.code == "request.overlap"
    assert [problem.field for problem in error.value.problems] == ["start_date"]
    assert fresh(request).status == "draft"
    assert not RequestStep.objects.filter(request=request).exists()


def test_second_submit_is_refused(world):
    request = draft(world)
    services.submit(actor=world.owner_user, request=request, expected_version=1)
    with pytest.raises(Conflict) as error:
        services.submit(actor=world.owner_user, request=request, expected_version=1)
    assert error.value.code == "request.already_processed"
    with pytest.raises(Conflict):
        services.submit(actor=world.owner_user, request=request)  # no version given: still refused
    assert RequestStep.objects.filter(request=request).count() == 2
    assert Notification.objects.filter(event_code="step.to_decide").count() == 1


def test_only_its_creator_sends_a_draft(world):
    request = draft(world)
    with pytest.raises(NotAllowed):
        services.submit(actor=world.hr_user, request=request)


def test_the_balance_is_checked_on_sending_ignoring_the_request_itself(world, port):
    request = submitted(world, data=days(MON))
    assert port.checks == [
        {"employee_id": world.owner.pk, "new_days": {MON: Decimal("1")}, "ignoring_request_id": request.pk}
    ]
    assert port.taken == []  # nothing is posted before final approval


def test_an_insufficient_balance_stops_the_sending(world, port):
    port.ok = False
    request = draft(world)
    with pytest.raises(DomainError) as error:
        services.submit(actor=world.owner_user, request=request)
    assert error.value.code == "request.balance_insufficient"
    assert error.value.problems[0].params == {"shortfall": Decimal("1.5")}


def test_an_hr_exception_is_sent_without_the_balance_check_and_follows_the_normal_chain(world, port):
    port.ok = False
    request = submitted(world, actor=world.hr_user, override_reason="Accord de la direction")
    assert request.status == "pending"
    assert port.checks == []
    assert [(step.approver_rule, step.status) for step in steps(request)] == [
        ("line_manager", "pending"),
        ("hr_role", "waiting"),
    ]


def test_sick_leave_gets_a_certificate_deadline_from_the_hr_setting(world):
    request = submitted(world, request_type=world.sick, data=days(TODAY))
    assert request.certificate_due_at == NOW + dt.timedelta(hours=48)


def test_the_type_can_set_its_own_deadline(world):
    world.sick.document_deadline_hours = 24
    world.sick.save()
    request = submitted(world, request_type=world.sick, data=days(TODAY))
    assert request.certificate_due_at == NOW + dt.timedelta(hours=24)


def test_changing_the_setting_changes_the_deadline_of_later_requests(world):
    settings_service.set_value(actor=world.hr_user, key="certificate_deadline_hours", value=72)
    request = submitted(world, request_type=world.sick, data=days(TODAY))
    assert request.certificate_due_at == NOW + dt.timedelta(hours=72)


def test_types_without_a_required_document_have_no_deadline(world):
    assert submitted(world).certificate_due_at is None


def test_chain_edited_after_submission_does_not_change_the_request(world):
    request = submitted(world, request_type=world.remote)
    services.replace_steps(actor=world.hr_user, request_type=world.remote, steps=[StepSpec(approver_rule="hr_role")])
    assert [(step.approver_rule, step.status) for step in steps(request)] == [
        ("line_manager", "pending"),
        ("hr_role", "waiting"),
    ]
    later = submitted(world, request_type=world.remote, data=days(NEXT_MON))
    assert [step.approver_rule for step in steps(later)] == ["hr_role"]


def test_the_quantity_is_recomputed_when_sending(world):
    request = draft(world, data=days(MON, TUE))
    assert request.quantity == Decimal("2.00")
    PublicHoliday.objects.create(date=TUE, name_fr="Férié", name_en="Holiday")
    sent = services.submit(actor=world.owner_user, request=request)
    assert sent.quantity == Decimal("1.00")
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_submit.py -v`
Expected: 13 failed with `AttributeError: module 'apps.requests.services' has no attribute 'submit'`.

- [ ] **Step 3: Register the certificate settings**

In `backend/apps/requests/apps.py`, replace the `ready` method with:

```python
    def ready(self) -> None:
        from apps.core.i18n import register_messages
        from apps.settings.registry import SettingDef, register

        from .messages import MESSAGES
        from .services import notices

        register_messages(MESSAGES)
        notices.register_events()
        register(
            SettingDef(key="certificate_deadline_hours", group="hr", kind="int", default=48, minimum=1, maximum=720)
        )
        register(
            SettingDef(key="certificate_warning_hours", group="hr", kind="int", default=12, minimum=1, maximum=720)
        )
```

- [ ] **Step 4: Implement `submit`**

`backend/apps/requests/services/lifecycle.py`:

```python
"""Sending, deciding and withdrawing: the path of a request from draft to its final status."""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError
from apps.settings import services as settings_service

from ..models import DocumentRule, Request, RequestStatus
from . import chain
from .common import bump, check_version, label, locked, require_editor
from .data import compute_quantity, data_of
from .validation import validate


def certificate_deadline_hours(request_type) -> int:
    """The type's own deadline if it has one, else the HR setting (master D10)."""
    if request_type.document_deadline_hours is not None:
        return request_type.document_deadline_hours
    return int(settings_service.get("certificate_deadline_hours"))


@transaction.atomic
def submit(*, actor, request, expected_version: int | None = None) -> Request:
    """Send a draft or a returned request (REQ-03, REQ-04, REQ-06).

    The employee row is locked first, so two requests of one person are validated one after the other
    and a double click sends once.
    """
    request = locked(request)
    check_version(request, expected_version)
    if request.status not in (RequestStatus.DRAFT, RequestStatus.RETURNED):
        raise Conflict("request.already_processed")
    require_editor(actor, request)
    request_type = request.request_type
    data = data_of(request)
    problems = validate(
        employee=request.employee,
        request_type=request_type,
        data=data,
        override=bool(request.override_reason),
        ignoring_request_id=request.pk,
    )
    if problems:
        raise DomainError(problems[0].code, problems=problems)
    now = timezone.now()
    previous = request.status
    request.quantity = compute_quantity(request_type, data)
    request.status = RequestStatus.PENDING
    if request.submitted_at is None:
        request.submitted_at = now
    if request_type.document_rule == DocumentRule.REQUIRED_WITHIN_DEADLINE and request.certificate_due_at is None:
        request.certificate_due_at = now + timedelta(hours=certificate_deadline_hours(request_type))
    bump(request, "quantity", "status", "submitted_at", "certificate_due_at")
    audit.record(
        action="request.submitted",
        obj=request,
        object_label=label(request),
        changes={"status": {"before": previous, "after": request.status}},
        actor=actor,
    )
    chain.start_round(request=request, actor=actor)
    return request
```

Add to `backend/apps/requests/services/__init__.py`:

```python
from .lifecycle import submit
```

and add `"submit"` to `__all__`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_submit.py -v`
Expected: 13 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): send a request with validation, chain snapshot and certificate deadline"
```

---

### Task 10: Deciding a step

**Files:**
- Modify: `backend/apps/requests/services/lifecycle.py` (append `decide_step`)
- Modify: `backend/apps/requests/services/__init__.py`
- Modify: `backend/apps/requests/tests/helpers.py` (append `pending_step`, `decide`, `approved`)
- Test: `backend/apps/requests/tests/test_decide.py`

**Interfaces:**
- Consumes: `chain.is_eligible_approver`, `chain.is_open`, `chain.STEP_STATUS`, `chain.apply_decision` (Tasks 7 and 8), `locked`, `bump`, `label`, `note` (Task 6), `apps.organisation.reach.employee_of`.
- Produces:
  - `apps.requests.services.decide_step(*, actor, step, decision, comment="", expected_version) -> Request`. Checks, in this order: the actor has an employee record (`request.actor_without_record`, 403); it is not their own request (`request.own_request`, 403); the actor is one of the step's approvers (`core.not_found`, 404); the version matches and the step is still open (`request.already_processed`, 409); a refusal has a reason (`request.reason_required`) and a return has a comment (`request.comment_required`); an amendment step is never returned (`request.amendment_cannot_return`).
  - Audit action `step.decided`, recorded on the request, with `changes` keys `step`, `decision`, `comment`
  - Test helpers `pending_step(request, amendment=None)`, `decide(request, by, decision="approve", comment="")`, `approved(world, **options)`

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/requests/tests/helpers.py`:

```python
from apps.requests.models import StepStatus  # noqa: E402


def pending_step(request, amendment=None) -> RequestStep:
    return RequestStep.objects.select_related("request", "amendment").get(
        request=request, amendment=amendment, status=StepStatus.PENDING
    )


def decide(request, by, decision="approve", comment=""):
    """Decide the step that is waiting on this request, as `by`, with the current version."""
    current = fresh(request)
    return services.decide_step(
        actor=by, step=pending_step(current), decision=decision, comment=comment, expected_version=current.version
    )


def approved(world, **options):
    """A request taken through its whole chain by whoever may decide each step."""
    request = submitted(world, **options)
    while request.status == RequestStatus.PENDING:
        step = pending_step(request)
        approver = services.resolve_approvers(step)[0]
        request = services.decide_step(
            actor=approver, step=step, decision="approve", expected_version=request.version
        )
    return request
```

`backend/apps/requests/tests/test_decide.py`:

```python
import datetime as dt
from decimal import Decimal

import pytest

from apps.accounts.tests.world import make_user
from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed, NotFound
from apps.notifications.models import Notification
from apps.organisation import services as organisation_services
from apps.requests import services
from apps.requests.tests.helpers import (
    MON, NOW, TODAY, TUE, approved, days, decide, fresh, pending_step, steps, submitted,
)

pytestmark = pytest.mark.django_db


def test_the_manager_approves_and_the_hr_step_wakes(world):
    request = submitted(world)
    result = decide(request, world.manager_user, comment=" Bon repos ")
    assert (result.status, result.version) == ("pending", 3)
    first, second = steps(request)
    assert (first.status, first.decided_by, first.decided_at, first.channel, first.comment, first.recorded_by) == (
        "approved", world.manager, NOW, "in_app", "Bon repos", None,
    )
    assert (second.status, second.activated_at) == ("pending", NOW)
    assert Notification.objects.filter(event_code="step.to_decide", user=world.hr_user).count() == 1
    event = AuditEvent.objects.get(action="step.decided")
    assert (event.object_id, event.actor) == (str(request.public_id), world.manager_user)
    assert event.changes == {
        "step": {"before": None, "after": 1},
        "decision": {"before": None, "after": "approve"},
        "comment": {"before": None, "after": "Bon repos"},
    }


def test_hr_approves_last_and_the_request_is_approved(world, port):
    request = submitted(world, data=days(MON, TUE))
    decide(request, world.manager_user)
    result = decide(request, world.hr_user)
    assert (result.status, result.decided_at, result.version) == ("approved", NOW, 4)
    assert port.taken[0]["days"] == {MON: Decimal("1"), TUE: Decimal("1")}
    assert port.taken[0]["actor"] == world.hr_user
    assert Notification.objects.filter(event_code="request.approved", user=world.owner_user).count() == 1


def test_refusing_needs_a_reason(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        decide(request, world.manager_user, "reject", "   ")
    assert error.value.code == "request.reason_required"
    result = decide(request, world.manager_user, "reject", "Période de clôture")
    assert result.status == "rejected"
    assert [(step.status, step.comment) for step in steps(request)] == [
        ("rejected", "Période de clôture"),
        ("skipped", ""),
    ]


def test_sending_back_needs_a_comment(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        decide(request, world.manager_user, "return")
    assert error.value.code == "request.comment_required"
    result = decide(request, world.manager_user, "return", "Merci de décaler d'un jour")
    assert result.status == "returned"
    assert steps(request)[0].status == "returned"


def test_second_decision_on_the_same_step_is_refused(world):
    organisation_services.create_delegation(
        actor=world.hr_user, manager=world.manager, delegate=world.other_manager,
        start_date=TODAY, end_date=TODAY + dt.timedelta(days=30),
    )
    request = submitted(world)
    step = pending_step(request)
    services.decide_step(actor=world.manager_user, step=step, decision="approve", expected_version=2)
    with pytest.raises(Conflict) as error:
        services.decide_step(actor=world.other_manager_user, step=step, decision="reject", comment="Non", expected_version=2)
    assert error.value.code == "request.already_processed"
    with pytest.raises(Conflict):
        services.decide_step(actor=world.other_manager_user, step=step, decision="approve", expected_version=3)
    assert steps(request)[0].decided_by == world.manager
    assert fresh(request).status == "pending"


def test_stale_version_is_refused(world):
    request = submitted(world)
    step = pending_step(request)
    services.update_request(actor=world.owner_user, request=request, data=days(TUE), expected_version=2)
    with pytest.raises(Conflict) as error:
        services.decide_step(actor=world.manager_user, step=step, decision="approve", expected_version=2)
    assert error.value.code == "request.already_processed"
    assert pending_step(request).pk == step.pk


def test_nobody_decides_their_own_request(world):
    request = submitted(world, employee=world.hr, actor=world.hr_user)
    decide(request, world.exec_user)  # the CEO is the line manager of the HR Responsible
    current = fresh(request)
    step = pending_step(current)
    assert step.approver_rule == "hr_role"
    with pytest.raises(NotAllowed) as error:
        services.decide_step(actor=world.hr_user, step=step, decision="approve", expected_version=current.version)
    assert error.value.code == "request.own_request"
    result = decide(request, world.exec_user)  # the only HR holder is the requester: an executive validates
    assert result.status == "approved"


def test_someone_who_is_not_an_approver_cannot_decide(world):
    request = submitted(world)
    with pytest.raises(NotFound):
        decide(request, world.peer_user)
    with pytest.raises(NotFound):
        decide(request, world.other_manager_user)


def test_hr_decides_a_manager_step_only_once_it_was_flagged(world):
    request = submitted(world)
    with pytest.raises(NotFound):
        decide(request, world.hr_user)
    step = pending_step(request)
    step.flagged_at = NOW
    step.save()
    result = decide(request, world.hr_user)
    assert result.status == "pending"
    assert steps(request)[0].decided_by == world.hr


def test_an_account_without_an_employee_record_cannot_decide(world):
    external = make_user("rh.externe@impactrisks.com", full_name="RH Externe", roles=["hr"])
    request = submitted(world)
    decide(request, world.manager_user)
    with pytest.raises(NotAllowed) as error:
        decide(request, external)
    assert error.value.code == "request.actor_without_record"


def test_a_delegate_decides_for_the_manager(world):
    organisation_services.create_delegation(
        actor=world.hr_user, manager=world.manager, delegate=world.other_manager,
        start_date=TODAY, end_date=TODAY + dt.timedelta(days=30),
    )
    request = submitted(world)
    decide(request, world.other_manager_user)
    assert steps(request)[0].decided_by == world.other_manager


def test_final_approval_checks_the_balance_again_and_changes_nothing_when_it_fails(world, port):
    request = submitted(world)
    decide(request, world.manager_user)
    port.ok = False
    with pytest.raises(DomainError) as error:
        decide(request, world.hr_user)
    assert error.value.code == "request.balance_insufficient"
    assert fresh(request).status == "pending"
    assert pending_step(request).approver_rule == "hr_role"
    assert port.taken == []


def test_the_approved_helper_runs_the_whole_chain(world):
    request = approved(world)
    assert request.status == "approved"
    assert [step.status for step in steps(request)] == ["approved", "approved"]
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_decide.py -v`
Expected: 13 failed with `AttributeError: module 'apps.requests.services' has no attribute 'decide_step'`.

- [ ] **Step 3: Implement `decide_step`**

In `backend/apps/requests/services/lifecycle.py`, replace the import block with:

```python
from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError, NotAllowed, NotFound
from apps.organisation import reach
from apps.settings import services as settings_service

from ..models import Channel, Decision, DocumentRule, Request, RequestStatus, RequestStep
from . import chain
from .common import bump, check_version, label, locked, note, require_editor
from .data import compute_quantity, data_of
from .validation import validate
```

Append to the end of `backend/apps/requests/services/lifecycle.py`:

```python
@transaction.atomic
def decide_step(*, actor, step, decision, comment: str = "", expected_version: int) -> Request:
    """Approve, refuse or send back the step that is waiting (REQ-05).

    Two people acting on the same step queue on the employee lock; the second finds the step
    closed or the version moved and receives "already processed" (REQ-18).
    """
    request = locked(step.request)
    step = (
        RequestStep.objects.select_for_update(of=("self",))
        .select_related("amendment", "named_person")
        .get(pk=step.pk)
    )
    step.request = request
    me = reach.employee_of(actor)
    if me is None:
        raise NotAllowed("request.actor_without_record")
    if me.pk == request.employee_id:
        raise NotAllowed("request.own_request")
    if not chain.is_eligible_approver(actor, step):
        raise NotFound("core.not_found")
    if request.version != expected_version or not chain.is_open(step, request):
        raise Conflict("request.already_processed")
    decision = Decision(decision)
    comment = comment.strip()
    if decision == Decision.REJECT and not comment:
        raise DomainError("request.reason_required", field="comment")
    if decision == Decision.RETURN:
        if step.amendment_id is not None:
            raise DomainError("request.amendment_cannot_return", field="decision")
        if not comment:
            raise DomainError("request.comment_required", field="comment")
    step.status = chain.STEP_STATUS[decision]
    step.decided_by = me
    step.decided_at = timezone.now()
    step.channel = Channel.IN_APP
    step.comment = comment
    step.save(update_fields=["status", "decided_by", "decided_at", "channel", "comment"])
    bump(request)
    audit.record(
        action="step.decided",
        obj=request,
        object_label=label(request),
        changes={
            "step": {"before": None, "after": step.position},
            "decision": {"before": None, "after": str(decision.value)},
            **note(request, "comment", comment),
        },
        actor=actor,
    )
    chain.apply_decision(request=request, step=step, decision=decision, actor=actor)
    return request
```

Change the lifecycle import in `backend/apps/requests/services/__init__.py` to:

```python
from .lifecycle import decide_step, submit
```

and add `"decide_step"` to `__all__`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_decide.py -v`
Expected: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): decide a step with optimistic concurrency and the own-request ban"
```

---

### Task 11: Return and resubmission, editing while pending, withdrawal

**Files:**
- Modify: `backend/apps/requests/services/chain.py` (append `people_involved`)
- Modify: `backend/apps/requests/services/lifecycle.py` (append `withdraw`)
- Modify: `backend/apps/requests/services/__init__.py`
- Test: `backend/apps/requests/tests/test_return_withdraw.py`

**Interfaces:**
- Consumes: `submit`, `decide_step`, `update_request` (Tasks 6, 9, 10), `outcomes.close_open_steps`, `notices.tell` (Task 8), `require_requester`, `round_steps`, `DECIDED`, `account_of` (Task 6).
- Produces:
  - `apps.requests.services.withdraw(*, actor, request) -> Request`: the requester withdraws a pending or returned request; anything else raises `Conflict("request.not_withdrawable")`
  - `apps.requests.services.chain.people_involved(request, amendment=None) -> list[User]`: the approvers of the open step and the accounts of those who already decided in the current round
  - Audit action `request.withdrawn`; notification `request.withdrawn` to the people involved
  - Verified behaviour of REQ-06 and REQ-07: a resubmission opens round 2 at the first step and keeps round 1; a pending request is editable until somebody decides

- [ ] **Step 1: Write the failing tests**

`backend/apps/requests/tests/test_return_withdraw.py`:

```python
from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.notifications.models import Notification
from apps.requests import services
from apps.requests.services import validate
from apps.requests.tests.helpers import (
    MON, NEXT_MON, NOW, TODAY, TUE, WED, approved, days, decide, fresh, pending_step, steps, stored, submitted,
)

pytestmark = pytest.mark.django_db


def rows(request) -> list[tuple]:
    return [(step.round, step.position, step.status) for step in steps(request)]


def test_a_returned_request_is_edited_and_sent_again_in_a_new_round(world, clock):
    request = submitted(world)
    decide(request, world.manager_user, "return", "Merci de décaler d'un jour")
    returned = fresh(request)
    assert returned.status == "returned"

    clock.shift(3600)
    edited = services.update_request(
        actor=world.owner_user, request=returned, data=days(TUE), expected_version=returned.version
    )
    resent = services.submit(actor=world.owner_user, request=edited, expected_version=edited.version)

    assert (resent.status, resent.start_date, resent.submitted_at) == ("pending", TUE, NOW)
    assert rows(request) == [(1, 1, "returned"), (1, 2, "skipped"), (2, 1, "pending"), (2, 2, "waiting")]
    assert Notification.objects.filter(event_code="step.to_decide", user=world.manager_user).count() == 2


def test_a_request_returned_by_hr_restarts_at_the_first_step(world):
    request = submitted(world)
    decide(request, world.manager_user)
    decide(request, world.hr_user, "return", "Le motif manque")
    returned = fresh(request)
    services.submit(actor=world.owner_user, request=returned, expected_version=returned.version)
    assert rows(request) == [(1, 1, "approved"), (1, 2, "returned"), (2, 1, "pending"), (2, 2, "waiting")]
    assert pending_step(request).approver_rule == "line_manager"


def test_a_returned_request_still_occupies_its_dates(world):
    request = submitted(world, data=days(MON))
    decide(request, world.manager_user, "return", "À revoir")
    # PRD 6.4: pending, returned and approved requests block the dates of their requester.
    problems = validate(employee=world.owner, request_type=world.remote, data=days(MON))
    assert [problem.code for problem in problems] == ["request.overlap"]
    assert validate(employee=world.owner, request_type=world.remote, data=days(TUE)) == []


def test_the_employee_edits_a_pending_request_until_the_first_decision(world):
    request = submitted(world)
    edited = services.update_request(
        actor=world.owner_user, request=request, data=days(MON, TUE), expected_version=request.version
    )
    assert (edited.status, edited.quantity, edited.version) == ("pending", Decimal("2.00"), 3)
    assert rows(request) == [(1, 1, "pending"), (1, 2, "waiting")]


def test_editing_a_pending_request_is_fully_validated(world):
    stored(world, data=days(WED))
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        services.update_request(
            actor=world.owner_user, request=request, data=days(MON, WED), expected_version=request.version
        )
    assert error.value.code == "request.overlap"


def test_after_the_first_decision_the_employee_can_no_longer_edit(world):
    request = submitted(world)
    decide(request, world.manager_user)
    current = fresh(request)
    with pytest.raises(Conflict) as error:
        services.update_request(
            actor=world.owner_user, request=current, data=days(TUE), expected_version=current.version
        )
    assert error.value.code == "request.not_editable"


def test_being_informed_is_not_a_decision(world):
    request = submitted(world, request_type=world.sick, data=days(TODAY))
    assert rows(request) == [(1, 1, "notified"), (1, 2, "pending")]
    edited = services.update_request(
        actor=world.owner_user, request=request, data=days(TODAY, comment="Angine"), expected_version=request.version
    )
    assert edited.comment == "Angine"


def test_the_employee_withdraws_before_the_first_decision(world):
    request = submitted(world)
    withdrawn = services.withdraw(actor=world.owner_user, request=request)
    assert (withdrawn.status, withdrawn.version) == ("withdrawn", 3)
    assert rows(request) == [(1, 1, "skipped"), (1, 2, "skipped")]
    assert Notification.objects.filter(event_code="request.withdrawn", user=world.manager_user).count() == 1
    assert AuditEvent.objects.filter(action="request.withdrawn", object_id=str(request.public_id)).exists()


def test_the_employee_withdraws_after_the_first_decision(world):
    request = submitted(world)
    decide(request, world.manager_user)
    withdrawn = services.withdraw(actor=world.owner_user, request=fresh(request))
    assert withdrawn.status == "withdrawn"
    assert rows(request) == [(1, 1, "approved"), (1, 2, "skipped")]
    told = set(Notification.objects.filter(event_code="request.withdrawn").values_list("user_id", flat=True))
    assert told == {world.manager_user.pk, world.hr_user.pk}


def test_a_returned_request_can_be_withdrawn(world):
    request = submitted(world)
    decide(request, world.manager_user, "return", "À revoir")
    assert services.withdraw(actor=world.owner_user, request=fresh(request)).status == "withdrawn"


def test_an_approved_request_cannot_be_withdrawn(world):
    request = approved(world)
    with pytest.raises(Conflict) as error:
        services.withdraw(actor=world.owner_user, request=request)
    assert error.value.code == "request.not_withdrawable"
    assert fresh(request).status == "approved"


def test_only_the_requester_withdraws(world):
    request = submitted(world)
    with pytest.raises(NotAllowed):
        services.withdraw(actor=world.manager_user, request=request)
    with pytest.raises(NotAllowed):
        services.withdraw(actor=world.hr_user, request=request)


def test_decision_after_withdrawal_is_refused(world):
    request = submitted(world)
    step = pending_step(request)
    services.withdraw(actor=world.owner_user, request=request)
    with pytest.raises(Conflict) as error:
        services.decide_step(actor=world.manager_user, step=step, decision="approve", expected_version=request.version)
    assert error.value.code == "request.already_processed"
    assert fresh(request).status == "withdrawn"


def test_a_withdrawn_request_frees_its_dates(world):
    request = submitted(world, data=days(NEXT_MON))
    services.withdraw(actor=world.owner_user, request=request)
    assert validate(employee=world.owner, request_type=world.remote, data=days(NEXT_MON)) == []
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_return_withdraw.py -v`
Expected: the seven tests that call `services.withdraw` fail with `AttributeError: module 'apps.requests.services' has no attribute 'withdraw'`; the seven others pass, because return, resubmission and editing rest on Tasks 6, 9 and 10.

- [ ] **Step 3: Implement `people_involved` and `withdraw`**

In `backend/apps/requests/services/chain.py`, change the import from `.common` to:

```python
from .common import DECIDED, account_of, current_round, name_of, round_steps
```

and append:

```python
def people_involved(request, amendment=None) -> list:
    """Who should hear that a request stopped: those who could decide now and those who already did."""
    users: list = []
    for step in round_steps(request, amendment).select_related("decided_by", "named_person"):
        if step.status == StepStatus.PENDING:
            resolution = resolve_rule(
                rule=step.approver_rule, named_person=step.named_person, requester=request.employee
            )
            users.extend(resolution.users)
        elif step.status in DECIDED and step.decided_by is not None:
            users.append(account_of(step.decided_by))
    return users
```

In `backend/apps/requests/services/lifecycle.py`, change two imports to:

```python
from . import chain, notices, outcomes
from .common import bump, check_version, label, locked, note, require_editor, require_requester
```

and append:

```python
@transaction.atomic
def withdraw(*, actor, request) -> Request:
    """The requester takes back a request that is not yet approved (REQ-07)."""
    request = locked(request)
    require_requester(actor, request)
    if request.status not in (RequestStatus.PENDING, RequestStatus.RETURNED):
        raise Conflict("request.not_withdrawable")
    involved = chain.people_involved(request)
    previous = request.status
    outcomes.close_open_steps(request)
    request.status = RequestStatus.WITHDRAWN
    bump(request, "status")
    audit.record(
        action="request.withdrawn",
        obj=request,
        object_label=label(request),
        changes={"status": {"before": previous, "after": request.status}},
        actor=actor,
    )
    notices.tell(involved, "request.withdrawn", request)
    return request
```

Change the lifecycle import in `backend/apps/requests/services/__init__.py` to:

```python
from .lifecycle import decide_step, submit, withdraw
```

and add `"withdraw"` to `__all__`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_return_withdraw.py -v`
Expected: 14 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): withdrawal, and tests for return, resubmission and editing while pending"
```

---

### Task 12: Attachments

**Files:**
- Create: `backend/apps/requests/services/attachments.py`
- Modify: `backend/apps/requests/services/__init__.py`
- Modify: `backend/apps/requests/apps.py` (register the access rules)
- Modify: `backend/apps/requests/tests/helpers.py` (append `pdf`)
- Test: `backend/apps/requests/tests/test_attachments.py`

**Interfaces:**
- Consumes (plan 02): `apps.files.services.store_upload(*, actor, upload, kind) -> Attachment`, `apps.files.services.register_access_rule(kind, rule)`, the route `files:download`, `Attachment` fields `public_id`, `kind`, `is_encrypted`, `original_name`, `size`, `uploaded_by`, `uploaded_at`; `apps.organisation.reach.team_ids(user)`.
- Produces:
  - `apps.requests.services.attach_file(*, actor, request, upload) -> RequestAttachment`: by the requester or HR (REQ-16); the kind is `medical` on a sensitive request and `proof` otherwise
  - `apps.requests.services.may_read_attachment(user, attachment) -> bool`: the access rule registered with `files` for `medical`, `proof` and `scanned_form`
  - `apps.requests.services.attachments.require_attacher(actor, request) -> None`
  - `apps.requests.services.attachments.visible_attachments(request, user) -> list[RequestAttachment]`
  - Audit action `request.attachment_added`, which records the kind and never the file name
  - Test helper `pdf(name="certificat.pdf")`

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/requests/tests/helpers.py`:

```python
from django.core.files.uploadedfile import SimpleUploadedFile  # noqa: E402


def pdf(name: str = "certificat.pdf") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n", content_type="application/pdf")
```

`backend/apps/requests/tests/test_attachments.py`:

```python
import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.files import services as files_service
from apps.requests import services
from apps.requests.models import RequestAttachment
from apps.requests.tests.helpers import MON, TODAY, WED, days, draft, pdf, submitted

pytestmark = pytest.mark.django_db


def sick(world):
    return submitted(world, request_type=world.sick, data=days(TODAY, comment="Grippe"))


def wedding(world):
    return submitted(world, request_type=world.exceptional, data=days(MON, WED, exceptional_event_id=world.event.pk))


def test_the_requester_adds_a_certificate_to_a_sick_leave(world):
    request = sick(world)
    link = services.attach_file(actor=world.owner_user, request=request, upload=pdf("certificat-grippe.pdf"))
    assert (link.attachment.kind, link.attachment.is_encrypted, link.added_by, link.step) == (
        "medical", True, world.owner_user, None,
    )
    event = AuditEvent.objects.get(action="request.attachment_added")
    assert event.changes == {"kind": {"before": None, "after": "medical"}}
    assert "grippe" not in json.dumps([event.changes, event.object_label]).lower()


def test_a_request_that_is_not_sensitive_gets_a_proof(world):
    link = services.attach_file(actor=world.owner_user, request=wedding(world), upload=pdf("acte.pdf"))
    assert (link.attachment.kind, link.attachment.is_encrypted) == ("proof", False)


def test_hr_adds_a_file_for_the_employee(world):
    link = services.attach_file(actor=world.hr_user, request=sick(world), upload=pdf())
    assert (link.attachment.kind, link.added_by) == ("medical", world.hr_user)


def test_nobody_else_adds_a_file(world):
    request = wedding(world)
    for user in (world.manager_user, world.exec_user, world.peer_user):
        with pytest.raises(NotAllowed):
            services.attach_file(actor=user, request=request, upload=pdf())


def test_a_closed_request_takes_no_file(world):
    request = sick(world)
    services.withdraw(actor=world.owner_user, request=request)
    with pytest.raises(Conflict) as error:
        services.attach_file(actor=world.owner_user, request=request, upload=pdf())
    assert error.value.code == "request.not_editable"


def test_a_refused_upload_adds_nothing(world):
    request = sick(world)
    disguised = SimpleUploadedFile("certificat.pdf", b"MZ\x90\x00\x03\x00\x00\x00", content_type="application/pdf")
    with pytest.raises(DomainError) as error:
        services.attach_file(actor=world.owner_user, request=request, upload=disguised)
    assert error.value.code.startswith("files.")
    assert not RequestAttachment.objects.exists()
    assert not AuditEvent.objects.filter(action="request.attachment_added").exists()


def test_manager_cannot_download_a_certificate(world, client_for):
    link = services.attach_file(actor=world.owner_user, request=sick(world), upload=pdf())
    url = reverse("files:download", kwargs={"public_id": link.attachment.public_id})
    assert client_for(world.manager_user).get(url).status_code == 404
    assert client_for(world.exec_user).get(url).status_code == 404
    assert client_for(world.peer_user).get(url).status_code == 404
    assert client_for(world.owner_user).get(url).status_code == 200
    assert client_for(world.hr_user).get(url).status_code == 200


def test_who_reads_a_proof(world):
    link = services.attach_file(actor=world.owner_user, request=wedding(world), upload=pdf())
    allowed = (world.owner_user, world.manager_user, world.hr_user, world.exec_user)
    refused = (world.peer_user, world.other_manager_user, world.outsider_user, world.sysadmin_user)
    assert all(services.may_read_attachment(user, link.attachment) for user in allowed)
    assert not any(services.may_read_attachment(user, link.attachment) for user in refused)


def test_the_files_of_a_draft_are_for_its_creator_only(world):
    request = draft(world, request_type=world.exceptional, data=days(MON, WED, exceptional_event_id=world.event.pk))
    link = services.attach_file(actor=world.owner_user, request=request, upload=pdf())
    assert services.may_read_attachment(world.owner_user, link.attachment) is True
    assert services.may_read_attachment(world.hr_user, link.attachment) is False
    assert services.may_read_attachment(world.manager_user, link.attachment) is False


def test_a_file_that_belongs_to_no_request_is_not_readable_through_these_rules(world):
    orphan = files_service.store_upload(actor=world.owner_user, upload=pdf(), kind="proof")
    assert services.may_read_attachment(world.owner_user, orphan) is False
    assert services.may_read_attachment(world.hr_user, orphan) is False
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_attachments.py -v`
Expected: 10 failed with `AttributeError: module 'apps.requests.services' has no attribute 'attach_file'`.

- [ ] **Step 3: Implement attachments**

`backend/apps/requests/services/attachments.py`:

```python
"""Files on a request (REQ-16): the certificate of a sick leave, the proof of an event, a scanned form."""

from __future__ import annotations

from django.db import transaction

from apps.accounts.roles import Role, has_role
from apps.audit import services as audit
from apps.core.errors import Conflict, NotAllowed
from apps.files import services as files_service
from apps.organisation import reach

from ..models import RequestAttachment, RequestStatus
from .common import is_requester, label, locked

MEDICAL = "medical"
PROOF = "proof"
SCANNED_FORM = "scanned_form"
ATTACHABLE = (RequestStatus.DRAFT, RequestStatus.PENDING, RequestStatus.RETURNED, RequestStatus.APPROVED)


def require_attacher(actor, request) -> None:
    if is_requester(actor, request) or has_role(actor, Role.HR):
        return
    raise NotAllowed("core.not_allowed")


@transaction.atomic
def attach_file(*, actor, request, upload) -> RequestAttachment:
    """Add a certificate or a proof. On a sensitive request the file is medical: encrypted, owner and HR only."""
    request = locked(request)
    require_attacher(actor, request)
    if request.status not in ATTACHABLE:
        raise Conflict("request.not_editable")
    kind = MEDICAL if request.sensitive else PROOF
    attachment = files_service.store_upload(actor=actor, upload=upload, kind=kind)
    link = RequestAttachment.objects.create(request=request, attachment=attachment, added_by=actor)
    audit.record(
        action="request.attachment_added",
        obj=request,
        object_label=label(request),
        changes={"kind": {"before": None, "after": kind}},
        actor=actor,
    )
    return link


def may_read_attachment(user, attachment) -> bool:
    """The access rule for files linked to a request (permission matrix, rows on attachments)."""
    link = RequestAttachment.objects.select_related("request").filter(attachment=attachment).first()
    if link is None:
        return False
    request = link.request
    if request.status == RequestStatus.DRAFT:
        return request.created_by_id == user.pk
    if is_requester(user, request) or has_role(user, Role.HR):
        return True
    # Everything on a sensitive request is as restricted as the certificate itself.
    if request.sensitive or attachment.kind == MEDICAL:
        return False
    if has_role(user, Role.EXEC):
        return True
    return request.employee_id in reach.team_ids(user)


def register_access_rules() -> None:
    for kind in (MEDICAL, PROOF, SCANNED_FORM):
        files_service.register_access_rule(kind, may_read_attachment)


def visible_attachments(request, user) -> list[RequestAttachment]:
    """The attachment links of a request that this viewer may see, oldest first."""
    links = (
        RequestAttachment.objects.filter(request=request)
        .select_related("attachment", "attachment__uploaded_by")
        .order_by("added_at", "pk")
    )
    return [link for link in links if may_read_attachment(user, link.attachment)]
```

Add to `backend/apps/requests/services/__init__.py`:

```python
from .attachments import attach_file, may_read_attachment
```

and add both names to `__all__`.

In `backend/apps/requests/apps.py`, extend `ready`: add `attachments` to the import from `.services` and call the registration after `notices.register_events()`:

```python
        from .services import attachments, notices

        register_messages(MESSAGES)
        notices.register_events()
        attachments.register_access_rules()
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_attachments.py -v`
Expected: 10 passed.

These tests write files through `apps.files`. Plan 02's autouse fixture `files_root` (imported by `backend/conftest.py`) gives every test its own temporary folder and encryption key, so nothing lands in `/data/files`.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): certificates and proofs on requests, with access rules per kind"
```

---

### Task 13: Decisions recorded on behalf, and giving a step to someone else

**Files:**
- Create: `backend/apps/requests/services/onbehalf.py`
- Modify: `backend/apps/requests/services/__init__.py`
- Test: `backend/apps/requests/tests/test_onbehalf.py`

**Interfaces:**
- Consumes: `locked`, `bump`, `label`, `note`, `require_hr_for_other`, `account_of`, `name_of` (Task 6), `chain.is_open`, `chain.STEP_STATUS`, `chain.apply_decision`, `chain.waiting_names` (Tasks 7, 8), `notices.tell`, `notices.decide_event` (Task 8), `files.store_upload` (plan 02), `SCANNED_FORM` (Task 12).
- Produces:
  - `apps.requests.services.record_on_behalf(*, actor, step, decided_by, decision, decided_at, channel, note, scan=None, expected_version) -> Request` (REQ-10). `decided_by` is an `Employee`; it may have no account. `channel` is `verbal` or `paper`. The scan is stored as a `scanned_form` attachment linked to the step.
  - `apps.requests.services.reassign_step(*, actor, step, new_approver, reason) -> RequestStep` (REQ-13): the step becomes a named-person step for `new_approver`, its reminder and flag clocks restart, and the new approver is notified.
  - Audit actions `step.recorded_on_behalf` and `step.reassigned`

- [ ] **Step 1: Write the failing tests**

`backend/apps/requests/tests/test_onbehalf.py`:

```python
import datetime as dt

import pytest

from apps.accounts import services as account_services
from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.notifications.models import Notification
from apps.organisation.selectors import full_name
from apps.requests import services
from apps.requests.models import RequestAttachment
from apps.requests.tests.helpers import NOW, TODAY, days, decide, fresh, pdf, pending_step, steps, submitted

pytestmark = pytest.mark.django_db

TWO_HOURS_AGO = NOW - dt.timedelta(hours=2)


def record(world, request, **overrides):
    current = fresh(request)
    options = {
        "actor": world.hr_user,
        "step": pending_step(current),
        "decided_by": world.manager,
        "decision": "approve",
        "decided_at": TWO_HOURS_AGO,
        "channel": "verbal",
        "note": "Accord donné par téléphone",
        "expected_version": current.version,
    }
    options.update(overrides)
    return services.record_on_behalf(**options)


def test_hr_records_a_verbal_approval_of_the_manager(world):
    request = submitted(world)
    result = record(world, request)
    first, second = steps(request)
    assert (first.status, first.decided_by, first.recorded_by, first.channel, first.comment, first.decided_at) == (
        "approved", world.manager, world.hr_user, "verbal", "Accord donné par téléphone", TWO_HOURS_AGO,
    )
    assert (second.status, result.status, result.version) == ("pending", "pending", 3)
    event = AuditEvent.objects.get(action="step.recorded_on_behalf")
    assert (event.actor, event.object_id) == (world.hr_user, str(request.public_id))
    assert event.changes["decided_by"] == {"before": None, "after": full_name(world.manager)}
    assert event.changes["channel"] == {"before": None, "after": "verbal"}
    assert event.changes["decision"] == {"before": None, "after": "approve"}


def test_a_paper_decision_can_carry_the_scan_of_the_signed_form(world):
    request = submitted(world)
    record(world, request, channel="paper", scan=pdf("formulaire-signe.pdf"))
    link = RequestAttachment.objects.get(request=request)
    assert (link.attachment.kind, link.step, link.added_by) == ("scanned_form", steps(request)[0], world.hr_user)
    assert services.may_read_attachment(world.manager_user, link.attachment) is True
    assert services.may_read_attachment(world.peer_user, link.attachment) is False


def test_a_scan_on_a_sick_leave_is_as_restricted_as_the_certificate(world):
    request = submitted(world, request_type=world.sick, data=days(TODAY))
    record(world, request, decided_by=world.ceo, channel="paper", scan=pdf())
    link = RequestAttachment.objects.get(request=request)
    assert link.attachment.kind == "scanned_form"
    assert services.may_read_attachment(world.owner_user, link.attachment) is True
    assert services.may_read_attachment(world.hr_user, link.attachment) is True
    assert services.may_read_attachment(world.manager_user, link.attachment) is False
    assert services.may_read_attachment(world.exec_user, link.attachment) is False


def test_a_recorded_refusal_closes_the_request(world):
    request = submitted(world)
    result = record(world, request, decision="reject", note="Refus du responsable, période chargée")
    assert result.status == "rejected"
    assert steps(request)[0].status == "rejected"


def test_the_note_is_mandatory(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        record(world, request, note="   ")
    assert error.value.code == "request.comment_required"


def test_the_channel_is_verbal_or_paper(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        record(world, request, channel="in_app")
    assert error.value.code == "request.channel_invalid"


def test_the_decision_cannot_be_dated_in_the_future(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        record(world, request, decided_at=NOW + dt.timedelta(hours=1))
    assert error.value.code == "request.decided_at_future"


def test_only_hr_records_on_behalf(world):
    request = submitted(world)
    with pytest.raises(NotAllowed):
        record(world, request, actor=world.manager_user)


def test_hr_does_not_record_on_its_own_request(world):
    request = submitted(world, employee=world.hr, actor=world.hr_user)
    with pytest.raises(NotAllowed) as error:
        record(world, request, decided_by=world.ceo)
    assert error.value.code == "request.own_request"


def test_the_requester_cannot_be_the_one_who_decided(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        record(world, request, decided_by=world.owner)
    assert error.value.code == "request.own_request"


def test_a_step_already_decided_cannot_be_recorded_again(world):
    request = submitted(world)
    step = pending_step(request)
    decide(request, world.manager_user)
    with pytest.raises(Conflict) as error:
        record(world, request, step=step)
    assert error.value.code == "request.already_processed"
    with pytest.raises(Conflict):
        record(world, request, expected_version=2)


def test_a_manager_without_an_account_can_still_have_decided(world):
    account_services.disable_account(actor=world.sysadmin_user, user=world.manager_user)
    request = submitted(world, employee=fresh(world.owner))
    assert pending_step(request).flagged_at == NOW
    result = record(world, request, channel="paper", note="Formulaire signé remis en main propre")
    assert result.status == "pending"
    assert steps(request)[0].decided_by == world.manager


def test_hr_gives_a_step_to_someone_else(world, clock):
    request = submitted(world)
    step = pending_step(request)
    step.reminded_at = NOW
    step.flagged_at = NOW
    step.save()
    clock.shift(dt.timedelta(days=1))

    moved = services.reassign_step(
        actor=world.hr_user, step=step, new_approver=world.other_manager, reason="Responsable en déplacement"
    )

    assert (moved.approver_rule, moved.named_person, moved.reminded_at, moved.flagged_at) == (
        "named_person", world.other_manager, None, None,
    )
    assert moved.activated_at == NOW + dt.timedelta(days=1)
    assert fresh(request).version == 3
    assert Notification.objects.filter(event_code="step.to_decide", user=world.other_manager_user).count() == 1
    assert services.can_act_on(world.other_manager_user, moved) is True
    assert services.can_act_on(world.manager_user, moved) is False
    event = AuditEvent.objects.get(action="step.reassigned")
    assert event.changes["approver"]["after"] == full_name(world.other_manager)
    assert event.changes["reason"] == {"before": None, "after": "Responsable en déplacement"}


def test_reassigning_needs_a_reason(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        services.reassign_step(actor=world.hr_user, step=pending_step(request), new_approver=world.other_manager, reason=" ")
    assert error.value.code == "request.reason_required"


def test_the_new_approver_cannot_be_the_requester(world):
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        services.reassign_step(actor=world.hr_user, step=pending_step(request), new_approver=world.owner, reason="Test")
    assert error.value.code == "request.own_request"


def test_the_new_approver_needs_an_account(world):
    account_services.disable_account(actor=world.sysadmin_user, user=world.other_manager_user)
    request = submitted(world)
    with pytest.raises(DomainError) as error:
        services.reassign_step(
            actor=world.hr_user, step=pending_step(request), new_approver=fresh(world.other_manager), reason="Test"
        )
    assert error.value.code == "request.approver_without_account"


def test_only_hr_reassigns_and_only_an_open_step(world):
    request = submitted(world)
    step = pending_step(request)
    with pytest.raises(NotAllowed):
        services.reassign_step(actor=world.manager_user, step=step, new_approver=world.other_manager, reason="Test")
    decide(request, world.manager_user)
    with pytest.raises(Conflict) as error:
        services.reassign_step(actor=world.hr_user, step=step, new_approver=world.other_manager, reason="Test")
    assert error.value.code == "request.already_processed"
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_onbehalf.py -v`
Expected: 17 failed with `AttributeError: module 'apps.requests.services' has no attribute 'record_on_behalf'` or `'reassign_step'`.

- [ ] **Step 3: Implement the two services**

`backend/apps/requests/services/onbehalf.py`:

```python
"""What HR does when a decision does not happen in the application (REQ-10, REQ-13)."""

from __future__ import annotations

from datetime import datetime

from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError
from apps.files import services as files_service

from ..models import ApproverRule, Channel, Decision, Request, RequestAttachment, RequestStep
from . import chain, notices
from .attachments import SCANNED_FORM
from .common import account_of, bump, check_version, label, locked, name_of, note as audit_note, require_hr_for_other


def _locked_step(step, request) -> RequestStep:
    fresh = (
        RequestStep.objects.select_for_update(of=("self",))
        .select_related("amendment", "named_person")
        .get(pk=step.pk)
    )
    fresh.request = request
    return fresh


@transaction.atomic
def record_on_behalf(
    *,
    actor,
    step,
    decided_by,
    decision,
    decided_at: datetime,
    channel,
    note: str,
    scan=None,
    expected_version: int,
) -> Request:
    """Record a decision that its approver gave verbally or on paper (REQ-10)."""
    request = locked(step.request)
    step = _locked_step(step, request)
    require_hr_for_other(actor, request)
    check_version(request, expected_version)
    if not chain.is_open(step, request):
        raise Conflict("request.already_processed")
    if decided_by.pk == request.employee_id:
        raise DomainError("request.own_request", field="decided_by")
    if channel not in (Channel.VERBAL, Channel.PAPER):
        raise DomainError("request.channel_invalid", field="channel")
    note = note.strip()
    if not note:
        raise DomainError("request.comment_required", field="note")
    if decided_at > timezone.now():
        raise DomainError("request.decided_at_future", field="decided_at")
    decision = Decision(decision)
    if decision == Decision.RETURN and step.amendment_id is not None:
        raise DomainError("request.amendment_cannot_return", field="decision")

    step.status = chain.STEP_STATUS[decision]
    step.decided_by = decided_by
    step.decided_at = decided_at
    step.recorded_by = actor
    step.channel = channel
    step.comment = note
    step.save(update_fields=["status", "decided_by", "decided_at", "recorded_by", "channel", "comment"])
    if scan is not None:
        attachment = files_service.store_upload(actor=actor, upload=scan, kind=SCANNED_FORM)
        RequestAttachment.objects.create(request=request, attachment=attachment, step=step, added_by=actor)
    bump(request)
    audit.record(
        action="step.recorded_on_behalf",
        obj=request,
        object_label=label(request),
        changes={
            "step": {"before": None, "after": step.position},
            "decision": {"before": None, "after": str(decision.value)},
            "decided_by": {"before": None, "after": name_of(decided_by)},
            "decided_at": {"before": None, "after": decided_at.isoformat()},
            "channel": {"before": None, "after": str(channel)},
            "scan": {"before": None, "after": scan is not None},
            **audit_note(request, "note", note),
        },
        actor=actor,
    )
    chain.apply_decision(request=request, step=step, decision=decision, actor=actor)
    return request


@transaction.atomic
def reassign_step(*, actor, step, new_approver, reason: str) -> RequestStep:
    """Give an open step to another person (REQ-13). Its reminder and flag delays start again."""
    request = locked(step.request)
    step = _locked_step(step, request)
    require_hr_for_other(actor, request)
    if not chain.is_open(step, request):
        raise Conflict("request.already_processed")
    reason = reason.strip()
    if not reason:
        raise DomainError("request.reason_required", field="reason")
    if new_approver.pk == request.employee_id:
        raise DomainError("request.own_request", field="new_approver")
    user = account_of(new_approver)
    if user is None:
        raise DomainError("request.approver_without_account", field="new_approver")
    previous = chain.waiting_names(
        rule=step.approver_rule, named_person=step.named_person, requester=request.employee
    )
    step.approver_rule = ApproverRule.NAMED_PERSON
    step.named_person = new_approver
    step.activated_at = timezone.now()
    step.reminded_at = None
    step.flagged_at = None
    step.save(update_fields=["approver_rule", "named_person", "activated_at", "reminded_at", "flagged_at"])
    bump(request)
    audit.record(
        action="step.reassigned",
        obj=request,
        object_label=label(request),
        changes={
            "step": {"before": None, "after": step.position},
            "approver": {"before": ", ".join(previous), "after": name_of(new_approver)},
            **audit_note(request, "reason", reason),
        },
        actor=actor,
    )
    notices.tell([user], notices.decide_event(step.amendment), request)
    return step
```

Add to `backend/apps/requests/services/__init__.py`:

```python
from .onbehalf import reassign_step, record_on_behalf
```

and add both names to `__all__`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_onbehalf.py -v`
Expected: 17 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): decisions recorded on behalf and reassignment of a step by HR"
```

---

### Task 14: Amendments

**Files:**
- Create: `backend/apps/requests/services/amendments.py`
- Modify: `backend/apps/requests/services/outcomes.py` (add `apply_amendment`; replace `reject` and `complete`)
- Modify: `backend/apps/requests/services/__init__.py`
- Test: `backend/apps/requests/tests/test_amendments.py`

**Interfaces:**
- Consumes: `locked`, `bump`, `label`, `note`, `require_requester` (Task 6), `validate` (Task 5), `chain.start_round`, `chain.people_involved`, `outcomes.close_open_steps`, `notices` (Tasks 8, 11), `data_of`, `amendment_data`, `apply_data`, `compute_quantity`, `leave_days`, `day_diff`, `DATA_FIELDS` (Task 3), `balance_port()` (Task 4).
- Produces:
  - `apps.requests.services.open_amendment(*, actor, request, kind, data, reason) -> Amendment` (REQ-08): only the requester, only on an approved request that has not started, one at a time. `kind` is `change` (with `data`) or `cancel` (`data` is `None`). The amendment gets its own chain round; its steps carry `amendment`.
  - `apps.requests.services.withdraw_amendment(*, actor, amendment) -> Amendment`
  - `apps.requests.services.outcomes.apply_amendment(*, request, amendment, actor) -> None`: on final approval, moves or cancels the request and posts only the difference of days through the port (`post_restored` with reason `"amendment"`, then `post_taken`)
  - Audit actions `amendment.opened`, `amendment.withdrawn`, `amendment.approved`, `amendment.rejected`; notifications `amendment.submitted`, `amendment.approved`, `amendment.rejected`

- [ ] **Step 1: Write the failing tests**

`backend/apps/requests/tests/test_amendments.py`:

```python
import datetime as dt
from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.notifications.models import Notification
from apps.requests import services
from apps.requests.models import RequestStep
from apps.requests.tests.helpers import (
    MON, NOW, THU, TUE, WED, approved, at, days, fresh, hours, pending_step, stored, submitted,
)

pytestmark = pytest.mark.django_db


def open_change(world, request, data, reason="Changement de plans"):
    return services.open_amendment(
        actor=world.owner_user, request=fresh(request), kind="change", data=data, reason=reason
    )


def open_cancel(world, request, reason="Voyage annulé"):
    return services.open_amendment(
        actor=world.owner_user, request=fresh(request), kind="cancel", data=None, reason=reason
    )


def decide_amendment(request, amendment, by, decision="approve", comment=""):
    current = fresh(request)
    return services.decide_step(
        actor=by,
        step=pending_step(current, amendment),
        decision=decision,
        comment=comment,
        expected_version=current.version,
    )


def test_the_requester_asks_to_change_approved_dates(world, port):
    request = approved(world, data=days(MON, TUE))
    port.checks.clear()

    amendment = open_change(world, request, days(WED, THU))

    assert (amendment.kind, amendment.status, amendment.requested_by) == ("change", "pending", world.owner_user)
    assert (amendment.new_start_date, amendment.new_end_date, amendment.new_quantity) == (WED, THU, Decimal("2.00"))
    assert (amendment.previous_start_date, amendment.previous_end_date, amendment.previous_quantity) == (
        MON, TUE, Decimal("2.00"),
    )
    saved = fresh(request)
    assert (saved.status, saved.start_date, saved.version) == ("approved", MON, request.version + 1)
    step = pending_step(request, amendment)
    assert (step.round, step.position, step.approver_rule) == (1, 1, "line_manager")
    assert Notification.objects.filter(event_code="amendment.submitted", user=world.manager_user).count() == 1
    # Master D18: the check of a change ignores the request it replaces.
    assert port.checks == [
        {
            "employee_id": world.owner.pk,
            "new_days": {WED: Decimal("1"), THU: Decimal("1")},
            "ignoring_request_id": request.pk,
        }
    ]
    assert AuditEvent.objects.filter(action="amendment.opened", object_id=str(request.public_id)).exists()


def test_an_approved_change_moves_the_request_and_posts_only_the_difference(world, port):
    request = approved(world, data=days(MON, TUE))
    port.taken.clear()
    amendment = open_change(world, request, days(TUE, WED))

    decide_amendment(request, amendment, world.manager_user)
    result = decide_amendment(request, amendment, world.hr_user)

    assert (result.status, result.start_date, result.end_date, result.quantity) == (
        "approved", TUE, WED, Decimal("2.00"),
    )
    saved = fresh(amendment)
    assert (saved.status, saved.decided_at) == ("approved", NOW)
    assert port.restored == [
        {
            "request_id": request.pk,
            "employee_id": world.owner.pk,
            "days": {MON: Decimal("1")},
            "actor": world.hr_user,
            "reason": "amendment",
        }
    ]
    assert port.taken == [
        {"request_id": request.pk, "employee_id": world.owner.pk, "days": {WED: Decimal("1")}, "actor": world.hr_user}
    ]
    assert Notification.objects.filter(event_code="amendment.approved", user=world.owner_user).count() == 1
    assert AuditEvent.objects.filter(action="amendment.approved").exists()


def test_an_approved_cancellation_cancels_the_request_and_gives_the_days_back(world, port):
    request = approved(world, data=days(MON, TUE))
    amendment = open_cancel(world, request)
    assert (amendment.new_start_date, amendment.new_quantity) == (None, None)
    decide_amendment(request, amendment, world.manager_user)
    result = decide_amendment(request, amendment, world.hr_user)
    assert result.status == "cancelled"
    assert port.restored[0]["days"] == {MON: Decimal("1"), TUE: Decimal("1")}


def test_a_refused_change_leaves_the_original_untouched(world, port):
    request = approved(world, data=days(MON, TUE))
    amendment = open_change(world, request, days(WED, THU))
    result = decide_amendment(request, amendment, world.manager_user, "reject", "Réunion importante ce jour-là")
    assert (result.status, result.start_date, result.end_date) == ("approved", MON, TUE)
    assert fresh(amendment).status == "rejected"
    statuses = list(RequestStep.objects.filter(amendment=amendment).order_by("position").values_list("status", flat=True))
    assert statuses == ["rejected", "skipped"]
    assert port.restored == []
    assert Notification.objects.filter(event_code="amendment.rejected", user=world.owner_user).count() == 1
    assert AuditEvent.objects.filter(action="amendment.rejected").exists()


def test_a_change_cannot_be_sent_back(world):
    request = approved(world)
    amendment = open_change(world, request, days(WED))
    with pytest.raises(DomainError) as error:
        decide_amendment(request, amendment, world.manager_user, "return", "À revoir")
    assert error.value.code == "request.amendment_cannot_return"


def test_only_one_change_at_a_time(world):
    request = approved(world)
    open_change(world, request, days(WED))
    with pytest.raises(Conflict) as error:
        open_cancel(world, request)
    assert error.value.code == "request.amendment_open"


def test_a_request_that_has_started_cannot_be_amended(world, clock):
    request = approved(world, data=days(MON, TUE))
    clock.move_to(at(11, 2))
    with pytest.raises(Conflict) as error:
        open_cancel(world, request)
    assert error.value.code == "request.not_started_only"


def test_only_an_approved_request_is_amended(world):
    request = submitted(world)
    with pytest.raises(Conflict) as error:
        open_cancel(world, request)
    assert error.value.code == "request.not_editable"


def test_only_the_requester_asks_for_a_change(world):
    request = approved(world)
    with pytest.raises(NotAllowed):
        services.open_amendment(actor=world.hr_user, request=request, kind="cancel", data=None, reason="Test")


def test_a_change_needs_a_reason_new_dates_and_something_new(world):
    request = approved(world, data=days(MON))
    with pytest.raises(DomainError) as no_reason:
        open_change(world, request, days(TUE), reason="  ")
    assert no_reason.value.code == "request.reason_required"
    with pytest.raises(DomainError) as no_dates:
        services.open_amendment(
            actor=world.owner_user, request=fresh(request), kind="change", data=None, reason="Test"
        )
    assert no_dates.value.code == "request.dates_required"
    with pytest.raises(DomainError) as same:
        open_change(world, request, days(MON))
    assert same.value.code == "request.nothing_to_change"


def test_a_change_is_validated_like_a_new_request(world, port):
    request = approved(world, data=days(MON))
    stored(world, request_type=world.remote, data=days(THU))
    with pytest.raises(DomainError) as overlap:
        open_change(world, request, days(THU))
    assert overlap.value.code == "request.overlap"
    port.ok = False
    with pytest.raises(DomainError) as balance:
        open_change(world, request, days(TUE, WED))
    assert balance.value.code == "request.balance_insufficient"


def test_the_requester_withdraws_a_change(world):
    request = approved(world)
    amendment = open_change(world, request, days(WED))
    withdrawn = services.withdraw_amendment(actor=world.owner_user, amendment=amendment)
    assert withdrawn.status == "withdrawn"
    assert not RequestStep.objects.filter(amendment=amendment, status="pending").exists()
    assert fresh(request).status == "approved"
    assert Notification.objects.filter(event_code="request.withdrawn", user=world.manager_user).count() == 1
    assert AuditEvent.objects.filter(action="amendment.withdrawn").exists()
    assert open_change(world, request, days(THU)).status == "pending"  # a new one can be opened


def test_a_withdrawn_change_cannot_be_decided_or_withdrawn_again(world):
    request = approved(world)
    amendment = open_change(world, request, days(WED))
    step = pending_step(request, amendment)
    version = fresh(request).version
    services.withdraw_amendment(actor=world.owner_user, amendment=amendment)
    with pytest.raises(Conflict):
        services.decide_step(actor=world.manager_user, step=step, decision="approve", expected_version=version)
    with pytest.raises(Conflict) as error:
        services.withdraw_amendment(actor=world.owner_user, amendment=amendment)
    assert error.value.code == "request.already_processed"


def test_a_late_approval_is_judged_as_of_the_day_the_change_was_asked(world, clock):
    request = approved(world, data=days(dt.date(2026, 10, 12)))
    amendment = open_change(world, request, days(dt.date(2026, 10, 8)))
    clock.move_to(at(10, 9))  # the new date has passed, the original has not started
    decide_amendment(request, amendment, world.manager_user)
    result = decide_amendment(request, amendment, world.hr_user)
    assert (result.status, result.start_date) == ("approved", dt.date(2026, 10, 8))


def test_an_hourly_permission_can_be_moved(world):
    request = approved(world, request_type=world.permission, data=hours(MON, "09:00", "11:00"))
    amendment = open_change(world, request, hours(TUE, "14:00", "15:30"))
    assert (amendment.new_start_time, amendment.new_end_time, amendment.new_quantity) == (
        dt.time(14, 0), dt.time(15, 30), Decimal("1.50"),
    )
    decide_amendment(request, amendment, world.manager_user)
    result = decide_amendment(request, amendment, world.hr_user)
    assert (result.start_date, result.start_time, result.quantity) == (TUE, dt.time(14, 0), Decimal("1.50"))
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_amendments.py -v`
Expected: 15 failed with `AttributeError: module 'apps.requests.services' has no attribute 'open_amendment'`.

- [ ] **Step 3: Give the outcomes their amendment branch**

In `backend/apps/requests/services/outcomes.py`, replace the import block with:

```python
from __future__ import annotations

from django.utils import timezone

from apps.audit import services as audit
from apps.core.errors import DomainError
from apps.organisation import selectors as organisation_selectors

from ..models import AmendmentKind, AmendmentStatus, BalanceEffect, CalendarLabel, RequestStatus, StepStatus, Unit
from ..ports import balance_port
from . import notices
from .common import label, round_steps, save
from .data import DATA_FIELDS, amendment_data, apply_data, compute_quantity, data_of, day_diff, leave_days
from .validation import validate
```

Replace the functions `reject` and `complete` with these, and add `apply_amendment` between them:

```python
def reject(*, request, amendment, actor) -> None:
    """A refusal closes the request, or only the amendment when the step belonged to one."""
    now = timezone.now()
    if amendment is not None:
        close_open_steps(request, amendment)
        amendment.status = AmendmentStatus.REJECTED
        amendment.decided_at = now
        amendment.save(update_fields=["status", "decided_at"])
        audit.record(
            action="amendment.rejected",
            obj=request,
            object_label=label(request),
            changes={"amendment": {"before": "pending", "after": "rejected"}},
            actor=actor,
        )
        notices.tell_requester(request, "amendment.rejected")
        return
    previous = request.status
    close_open_steps(request)
    request.status = RequestStatus.REJECTED
    request.decided_at = now
    save(request, "status", "decided_at")
    audit.record(
        action="request.rejected",
        obj=request,
        object_label=label(request),
        changes=_status_change(previous, request.status),
        actor=actor,
    )
    notices.tell_requester(request, "request.rejected")


def apply_amendment(*, request, amendment, actor) -> None:
    """Final approval of an amendment (REQ-08): the request is moved or cancelled, and only then."""
    amendment.request = request
    request_type = request.request_type
    deducts = request_type.balance_effect == BalanceEffect.DEDUCTS_ANNUAL
    old_days = leave_days(request_type, data_of(request))
    before = {field: getattr(request, field) for field in ("start_date", "end_date", "quantity", "status")}
    if amendment.kind == AmendmentKind.CANCEL:
        if deducts and old_days:
            balance_port().post_restored(
                request_id=request.pk, employee_id=request.employee_id, days=old_days, actor=actor, reason="amendment"
            )
        request.status = RequestStatus.CANCELLED
        save(request, "status")
    else:
        new = amendment_data(amendment)
        # Rules that depend on today are judged as of the day the change was asked for;
        # overlap and balance are judged now, because other requests may have arrived since.
        problems = validate(
            employee=request.employee,
            request_type=request_type,
            data=new,
            ignoring_request_id=request.pk,
            today=timezone.localdate(amendment.created_at),
        )
        if problems:
            raise DomainError(problems[0].code, problems=problems)
        released, added = day_diff(old_days, leave_days(request_type, new))
        if deducts and released:
            balance_port().post_restored(
                request_id=request.pk, employee_id=request.employee_id, days=released, actor=actor, reason="amendment"
            )
        if deducts and added:
            balance_port().post_taken(request_id=request.pk, employee_id=request.employee_id, days=added, actor=actor)
        apply_data(request, new)
        request.quantity = compute_quantity(request_type, new)
        save(request, *DATA_FIELDS, "quantity")
    amendment.status = AmendmentStatus.APPROVED
    amendment.decided_at = timezone.now()
    amendment.save(update_fields=["status", "decided_at"])
    after = {field: getattr(request, field) for field in before}
    audit.record(
        action="amendment.approved",
        obj=request,
        object_label=label(request),
        changes={
            field: {"before": str(before[field]), "after": str(after[field])}
            for field in before
            if before[field] != after[field]
        },
        actor=actor,
    )
    notices.tell_requester(request, "amendment.approved")


def complete(*, request, amendment, actor) -> None:
    """Called when every step of a round is done and at least one person approved."""
    if amendment is None:
        approve_request(request=request, actor=actor)
    else:
        apply_amendment(request=request, amendment=amendment, actor=actor)
```

- [ ] **Step 4: Implement the amendment services**

`backend/apps/requests/services/amendments.py`:

```python
"""Changing or cancelling a request after it was approved (REQ-08)."""

from __future__ import annotations

from dataclasses import replace

from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError

from ..models import Amendment, AmendmentKind, AmendmentStatus, RequestStatus
from . import chain, notices, outcomes
from .common import bump, label, locked, note, require_requester
from .data import RequestData, compute_quantity, data_of
from .validation import validate


@transaction.atomic
def open_amendment(*, actor, request, kind, data: RequestData | None, reason: str) -> Amendment:
    """Ask to change the dates of, or to cancel, an approved request that has not started.

    The original stays in force and the balance is untouched until the amendment is approved.
    """
    request = locked(request)
    require_requester(actor, request)
    if request.status != RequestStatus.APPROVED:
        raise Conflict("request.not_editable")
    if request.start_date <= timezone.localdate():
        raise Conflict("request.not_started_only")
    if Amendment.objects.filter(request=request, status=AmendmentStatus.PENDING).exists():
        raise Conflict("request.amendment_open")
    reason = reason.strip()
    if not reason:
        raise DomainError("request.reason_required", field="reason")
    kind = AmendmentKind(kind)
    request_type = request.request_type
    current = data_of(request)
    amendment = Amendment(
        request=request,
        kind=kind,
        reason=reason,
        status=AmendmentStatus.PENDING,
        requested_by=actor,
        previous_start_date=request.start_date,
        previous_end_date=request.end_date,
        previous_starts_at_midday=request.starts_at_midday,
        previous_ends_at_midday=request.ends_at_midday,
        previous_start_time=request.start_time,
        previous_end_time=request.end_time,
        previous_quantity=request.quantity,
    )
    if kind == AmendmentKind.CHANGE:
        if data is None:
            raise DomainError("request.dates_required", field="start_date")
        new = replace(data, exceptional_event_id=current.exceptional_event_id, comment=current.comment)
        if new == current:
            raise DomainError("request.nothing_to_change", field="start_date")
        problems = validate(
            employee=request.employee, request_type=request_type, data=new, ignoring_request_id=request.pk
        )
        if problems:
            raise DomainError(problems[0].code, problems=problems)
        amendment.new_start_date = new.start_date
        amendment.new_end_date = new.end_date
        amendment.new_starts_at_midday = new.starts_at_midday
        amendment.new_ends_at_midday = new.ends_at_midday
        amendment.new_start_time = new.start_time
        amendment.new_end_time = new.end_time
        amendment.new_quantity = compute_quantity(request_type, new)
    amendment.save()
    bump(request)
    audit.record(
        action="amendment.opened",
        obj=request,
        object_label=label(request),
        changes={
            "kind": {"before": None, "after": str(kind.value)},
            "dates": {
                "before": f"{request.start_date:%Y-%m-%d}/{request.end_date:%Y-%m-%d}",
                "after": None
                if kind == AmendmentKind.CANCEL
                else f"{amendment.new_start_date:%Y-%m-%d}/{amendment.new_end_date:%Y-%m-%d}",
            },
            **note(request, "reason", reason),
        },
        actor=actor,
    )
    chain.start_round(request=request, amendment=amendment, actor=actor)
    return amendment


@transaction.atomic
def withdraw_amendment(*, actor, amendment) -> Amendment:
    request = locked(amendment.request)
    amendment = Amendment.objects.select_for_update().get(pk=amendment.pk)
    amendment.request = request
    require_requester(actor, request)
    if amendment.status != AmendmentStatus.PENDING:
        raise Conflict("request.already_processed")
    involved = chain.people_involved(request, amendment)
    outcomes.close_open_steps(request, amendment)
    amendment.status = AmendmentStatus.WITHDRAWN
    amendment.decided_at = timezone.now()
    amendment.save(update_fields=["status", "decided_at"])
    bump(request)
    audit.record(
        action="amendment.withdrawn",
        obj=request,
        object_label=label(request),
        changes={"amendment": {"before": "pending", "after": "withdrawn"}},
        actor=actor,
    )
    notices.tell(involved, "request.withdrawn", request)
    return amendment
```

Add to `backend/apps/requests/services/__init__.py`:

```python
from .amendments import open_amendment, withdraw_amendment
```

and add both names to `__all__`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_amendments.py apps/requests/tests/test_chain.py apps/requests/tests/test_decide.py -v`
Expected: 15 passed in `test_amendments.py`; the chain and decision tests still pass with the replaced `reject` and `complete`.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): amendments to approved requests, through the same chain"
```

---

### Task 15: HR corrects or cancels a request directly

**Files:**
- Create: `backend/apps/requests/services/hr_actions.py`
- Modify: `backend/apps/requests/services/notices.py` (append `everyone_concerned`)
- Modify: `backend/apps/requests/services/__init__.py`
- Test: `backend/apps/requests/tests/test_hr_actions.py`

**Interfaces:**
- Consumes: `locked`, `bump`, `label`, `note`, `snapshot`, `changes_since`, `require_hr_for_other`, `account_of` (Task 6), `validate` (Task 5), `chain.people_involved` (Task 11), `outcomes.close_open_steps` (Task 8), `balance_port()` (Task 4), `data_of`, `apply_data`, `compute_quantity`, `leave_days`, `day_diff`, `DATA_FIELDS` (Task 3).
- Produces:
  - `apps.requests.services.hr_correct(*, actor, request, data, reason) -> Request` (REQ-09): changes the dates of a pending or approved request, including one that has started or ended. Limits are lifted as for an HR exception; overlap is not. On an approved request of a deducting type only the difference of days is posted.
  - `apps.requests.services.hr_cancel(*, actor, request, reason) -> Request`: a pending or approved request becomes `cancelled`; approved days are restored; an open amendment is closed as withdrawn.
  - `apps.requests.services.notices.everyone_concerned(request, extra=()) -> list[User]`: the requester, their manager and delegates, plus `extra`
  - Audit actions `request.corrected` and `request.cancelled`; notifications of the same names to the requester, the manager and the approvers concerned

- [ ] **Step 1: Write the failing tests**

`backend/apps/requests/tests/test_hr_actions.py`:

```python
from decimal import Decimal

import pytest

from apps.accounts import services as account_services
from apps.accounts.roles import Role
from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.notifications.models import Notification
from apps.requests import services
from apps.requests.models import RequestStep
from apps.requests.tests.helpers import (
    MON, THU, TUE, WED, approved, at, days, fresh, pending_step, steps, stored, submitted,
)

pytestmark = pytest.mark.django_db


def told(event: str) -> set[int]:
    return set(Notification.objects.filter(event_code=event).values_list("user_id", flat=True))


def test_hr_shortens_an_approved_leave_and_the_days_come_back(world, port):
    request = approved(world, data=days(MON, WED))
    port.taken.clear()
    port.checks.clear()

    result = services.hr_correct(actor=world.hr_user, request=request, data=days(MON, TUE), reason=" Retour anticipé ")

    assert (result.status, result.end_date, result.quantity, result.version) == (
        "approved", TUE, Decimal("2.00"), request.version + 1,
    )
    assert port.restored == [
        {
            "request_id": request.pk,
            "employee_id": world.owner.pk,
            "days": {WED: Decimal("1")},
            "actor": world.hr_user,
            "reason": "Retour anticipé",
        }
    ]
    assert (port.taken, port.checks) == ([], [])
    event = AuditEvent.objects.get(action="request.corrected")
    assert event.changes["reason"] == {"before": None, "after": "Retour anticipé"}
    assert "end_date" in event.changes
    assert told("request.corrected") == {world.owner_user.pk, world.manager_user.pk}


def test_hr_extends_an_approved_leave_without_a_balance_check(world, port):
    request = approved(world, data=days(MON, TUE))
    port.taken.clear()
    port.checks.clear()
    port.ok = False
    result = services.hr_correct(actor=world.hr_user, request=request, data=days(MON, THU), reason="Accord direction")
    assert result.quantity == Decimal("4.00")
    assert port.checks == []
    assert [entry["days"] for entry in port.taken] == [{WED: Decimal("1"), THU: Decimal("1")}]


def test_hr_corrects_a_leave_that_has_already_started(world, clock):
    request = approved(world, data=days(MON, WED))
    clock.move_to(at(11, 3))
    result = services.hr_correct(actor=world.hr_user, request=request, data=days(MON, TUE), reason="Reprise mardi soir")
    assert result.end_date == TUE


def test_hr_corrects_a_pending_request_and_the_chain_goes_on(world, port):
    request = submitted(world, data=days(MON))
    result = services.hr_correct(actor=world.hr_user, request=request, data=days(TUE), reason="Erreur de date")
    assert (result.status, result.start_date) == ("pending", TUE)
    assert pending_step(request).approver_rule == "line_manager"
    assert (port.taken, port.restored) == ([], [])


def test_a_correction_cannot_create_an_overlap(world):
    request = approved(world, data=days(MON))
    stored(world, request_type=world.remote, data=days(WED))
    with pytest.raises(DomainError) as error:
        services.hr_correct(actor=world.hr_user, request=request, data=days(MON, WED), reason="Prolongation")
    assert error.value.code == "request.overlap"


def test_a_correction_needs_a_reason_and_a_change(world):
    request = approved(world, data=days(MON))
    with pytest.raises(DomainError) as no_reason:
        services.hr_correct(actor=world.hr_user, request=request, data=days(TUE), reason="  ")
    assert no_reason.value.code == "request.reason_required"
    with pytest.raises(DomainError) as same:
        services.hr_correct(actor=world.hr_user, request=request, data=days(MON), reason="Rien")
    assert same.value.code == "request.nothing_to_change"


def test_hr_never_corrects_or_cancels_its_own_request(world):
    request = approved(world, employee=world.hr, actor=world.hr_user)
    with pytest.raises(NotAllowed) as correcting:
        services.hr_correct(actor=world.hr_user, request=request, data=days(TUE), reason="Pour moi")
    assert correcting.value.code == "request.own_request"
    with pytest.raises(NotAllowed) as cancelling:
        services.hr_cancel(actor=world.hr_user, request=request, reason="Pour moi")
    assert cancelling.value.code == "request.own_request"


def test_only_hr_corrects_or_cancels(world):
    request = approved(world)
    for user in (world.manager_user, world.exec_user, world.owner_user):
        with pytest.raises(NotAllowed):
            services.hr_correct(actor=user, request=request, data=days(TUE), reason="Test")
        with pytest.raises(NotAllowed):
            services.hr_cancel(actor=user, request=request, reason="Test")


def test_a_correction_waits_for_an_open_change(world):
    request = approved(world)
    services.open_amendment(actor=world.owner_user, request=request, kind="cancel", data=None, reason="Annulé")
    with pytest.raises(Conflict) as error:
        services.hr_correct(actor=world.hr_user, request=fresh(request), data=days(TUE), reason="Test")
    assert error.value.code == "request.amendment_open"


def test_hr_cancels_an_approved_leave(world, port):
    request = approved(world, data=days(MON, TUE))
    result = services.hr_cancel(actor=world.hr_user, request=request, reason="Départ de l'employé")
    assert (result.status, result.version) == ("cancelled", request.version + 1)
    assert port.restored == [
        {
            "request_id": request.pk,
            "employee_id": world.owner.pk,
            "days": {MON: Decimal("1"), TUE: Decimal("1")},
            "actor": world.hr_user,
            "reason": "Départ de l'employé",
        }
    ]
    event = AuditEvent.objects.get(action="request.cancelled")
    assert event.changes["status"] == {"before": "approved", "after": "cancelled"}
    assert told("request.cancelled") == {world.owner_user.pk, world.manager_user.pk}
    assert Notification.objects.filter(event_code="request.cancelled", user=world.manager_user).count() == 1


def test_hr_cancels_a_pending_request_and_tells_whoever_was_deciding(world, port):
    account_services.assign_role(actor=world.sysadmin_user, user=world.other_manager_user, role=Role.HR)
    request = submitted(world)
    services.decide_step(
        actor=world.manager_user, step=pending_step(request), decision="approve", expected_version=request.version
    )
    result = services.hr_cancel(actor=world.hr_user, request=fresh(request), reason="Doublon")
    assert result.status == "cancelled"
    assert [step.status for step in steps(request)] == ["approved", "skipped"]
    assert port.restored == []
    # The requester, the manager who had approved, and the other HR holder who could have validated.
    # The HR holder who cancelled is not told about their own action.
    assert told("request.cancelled") == {
        world.owner_user.pk, world.manager_user.pk, world.other_manager_user.pk,
    }


def test_cancelling_closes_an_open_change(world):
    request = approved(world)
    amendment = services.open_amendment(
        actor=world.owner_user, request=request, kind="change", data=days(WED), reason="Décalage"
    )
    services.hr_cancel(actor=world.hr_user, request=fresh(request), reason="Annulation générale")
    assert fresh(amendment).status == "withdrawn"
    assert not RequestStep.objects.filter(amendment=amendment, status__in=["pending", "waiting"]).exists()


def test_a_closed_request_is_neither_corrected_nor_cancelled(world):
    request = submitted(world)
    services.withdraw(actor=world.owner_user, request=request)
    with pytest.raises(Conflict) as cancelling:
        services.hr_cancel(actor=world.hr_user, request=request, reason="Test")
    assert cancelling.value.code == "request.already_processed"
    with pytest.raises(Conflict):
        services.hr_correct(actor=world.hr_user, request=request, data=days(TUE), reason="Test")


def test_cancelling_needs_a_reason(world):
    request = approved(world)
    with pytest.raises(DomainError) as error:
        services.hr_cancel(actor=world.hr_user, request=request, reason="")
    assert error.value.code == "request.reason_required"
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_hr_actions.py -v`
Expected: 14 failed with `AttributeError: module 'apps.requests.services' has no attribute 'hr_correct'` or `'hr_cancel'`.

- [ ] **Step 3: Implement the HR actions**

Add `from apps.organisation import selectors as organisation_selectors` to the imports of `backend/apps/requests/services/notices.py` and append:

```python
def everyone_concerned(request, extra=(), *, excluding=None) -> list:
    """The requester, their manager and the manager's delegates, plus the accounts given in `extra`.

    `excluding` is the account that performed the action: nobody is notified of what they just did.
    """
    users = [account_of(request.employee), *extra]
    manager = request.employee.manager
    if manager is not None:
        users.extend(
            organisation_selectors.acting_users_for_manager(manager, excluding_employee_id=request.employee_id)
        )
    return [user for user in users if user is not None and (excluding is None or user.pk != excluding.pk)]
```

`backend/apps/requests/services/hr_actions.py`:

```python
"""What HR may do directly on any request but its own (REQ-09, PRD 6.5)."""

from __future__ import annotations

from dataclasses import replace

from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError

from ..models import Amendment, AmendmentStatus, BalanceEffect, Request, RequestStatus
from ..ports import balance_port
from . import chain, notices, outcomes
from .common import bump, changes_since, label, locked, note, require_hr_for_other, snapshot
from .data import DATA_FIELDS, RequestData, apply_data, compute_quantity, data_of, day_diff, leave_days
from .validation import validate

OPEN_TO_HR = (RequestStatus.PENDING, RequestStatus.APPROVED)


@transaction.atomic
def hr_correct(*, actor, request, data: RequestData, reason: str) -> Request:
    """Change the dates of a pending or approved request, even one that has started or ended."""
    request = locked(request)
    require_hr_for_other(actor, request)
    if request.status not in OPEN_TO_HR:
        raise Conflict("request.already_processed")
    if Amendment.objects.filter(request=request, status=AmendmentStatus.PENDING).exists():
        raise Conflict("request.amendment_open")
    reason = reason.strip()
    if not reason:
        raise DomainError("request.reason_required", field="reason")
    request_type = request.request_type
    current = data_of(request)
    new = replace(data, exceptional_event_id=current.exceptional_event_id, comment=current.comment)
    if new == current:
        raise DomainError("request.nothing_to_change", field="start_date")
    # A correction is an HR decision with a reason: limits are lifted, shape and overlap are not.
    problems = validate(
        employee=request.employee, request_type=request_type, data=new, override=True, ignoring_request_id=request.pk
    )
    if problems:
        raise DomainError(problems[0].code, problems=problems)
    before = snapshot(request)
    old_days = leave_days(request_type, current)
    apply_data(request, new)
    request.quantity = compute_quantity(request_type, new)
    if request.status == RequestStatus.APPROVED and request_type.balance_effect == BalanceEffect.DEDUCTS_ANNUAL:
        released, added = day_diff(old_days, leave_days(request_type, new))
        if released:
            balance_port().post_restored(
                request_id=request.pk, employee_id=request.employee_id, days=released, actor=actor, reason=reason
            )
        if added:
            balance_port().post_taken(request_id=request.pk, employee_id=request.employee_id, days=added, actor=actor)
    bump(request, *DATA_FIELDS, "quantity")
    audit.record(
        action="request.corrected",
        obj=request,
        object_label=label(request),
        changes={**changes_since(before, request), **note(request, "reason", reason)},
        actor=actor,
    )
    notices.tell(notices.everyone_concerned(request, excluding=actor), "request.corrected", request)
    return request


@transaction.atomic
def hr_cancel(*, actor, request, reason: str) -> Request:
    """Cancel a pending or approved request. Approved days go back to the balance."""
    request = locked(request)
    require_hr_for_other(actor, request)
    if request.status not in OPEN_TO_HR:
        raise Conflict("request.already_processed")
    reason = reason.strip()
    if not reason:
        raise DomainError("request.reason_required", field="reason")
    request_type = request.request_type
    was_approved = request.status == RequestStatus.APPROVED
    involved = chain.people_involved(request)
    change = Amendment.objects.filter(request=request, status=AmendmentStatus.PENDING).first()
    if change is not None:
        involved += chain.people_involved(request, change)
        outcomes.close_open_steps(request, change)
        change.status = AmendmentStatus.WITHDRAWN
        change.decided_at = timezone.now()
        change.save(update_fields=["status", "decided_at"])
    if not was_approved:
        outcomes.close_open_steps(request)
    elif request_type.balance_effect == BalanceEffect.DEDUCTS_ANNUAL:
        days = leave_days(request_type, data_of(request))
        if days:
            balance_port().post_restored(
                request_id=request.pk, employee_id=request.employee_id, days=days, actor=actor, reason=reason
            )
    previous = request.status
    request.status = RequestStatus.CANCELLED
    bump(request, "status")
    audit.record(
        action="request.cancelled",
        obj=request,
        object_label=label(request),
        changes={"status": {"before": previous, "after": request.status}, **note(request, "reason", reason)},
        actor=actor,
    )
    notices.tell(notices.everyone_concerned(request, involved, excluding=actor), "request.cancelled", request)
    return request
```

Add to `backend/apps/requests/services/__init__.py`:

```python
from .hr_actions import hr_cancel, hr_correct
```

and add both names to `__all__`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_hr_actions.py -v`
Expected: 14 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): direct correction and cancellation by HR"
```

---

### Task 16: Sick leave and reclassification as annual leave

**Files:**
- Modify: `backend/apps/requests/services/hr_actions.py` (append `reclassifiable_step`, `reclassify_as_annual`)
- Modify: `backend/apps/requests/services/__init__.py`
- Test: `backend/apps/requests/tests/test_sick_leave.py`

**Interfaces:**
- Consumes: everything of Tasks 6 to 15; `apps.organisation.reach.employee_of`.
- Produces:
  - `apps.requests.services.reclassify_as_annual(*, actor, request, override_reason="") -> Request` (PRD 6.5, master D17): converts the whole request to the `annual` type and records the HR step as approved. The balance is checked unless `override_reason` is given. `request.sensitive` stays true, `request.reclassified_from` keeps the former type, `certificate_due_at` is cleared.
  - `apps.requests.services.hr_actions.reclassifiable_step(request, user) -> RequestStep | None`: the open HR step of a pending sensitive day-based request without balance effect that this user may decide
  - Audit action `request.reclassified`
  - Verified behaviour of PRD 6.5: past dates allowed, the manager is informed and has nothing to decide, HR decides, and nothing medical reaches a notification or the audit trail

- [ ] **Step 1: Write the failing tests**

`backend/apps/requests/tests/test_sick_leave.py`:

```python
import datetime as dt
import json
from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.core.errors import Conflict, DomainError, NotAllowed, NotFound
from apps.notifications.models import Notification
from apps.requests import services
from apps.requests.tests.helpers import TODAY, days, decide, fresh, pdf, pending_step, steps, submitted

pytestmark = pytest.mark.django_db

YESTERDAY = dt.date(2026, 10, 5)


def sick(world, **options):
    options.setdefault("data", days(TODAY, comment="Grippe sévère"))
    return submitted(world, request_type=world.sick, **options)


def test_a_sick_leave_is_declared_for_past_days_and_waits_for_hr(world):
    request = sick(world, data=days(YESTERDAY, TODAY, comment="Grippe"))
    assert (request.status, request.sensitive, request.quantity) == ("pending", True, Decimal("2.00"))
    assert [(step.mode, step.status) for step in steps(request)] == [("notify", "notified"), ("approve", "pending")]
    assert Notification.objects.filter(event_code="sick.declared", user=world.manager_user).count() == 1
    assert Notification.objects.filter(event_code="step.to_decide", user=world.hr_user).count() == 1


def test_hr_declares_a_sick_leave_for_an_employee(world):
    request = sick(world, actor=world.hr_user, data=days(YESTERDAY))
    assert (request.status, request.created_by, request.override_reason) == ("pending", world.hr_user, "")


def test_the_manager_has_nothing_to_decide_on_a_sick_leave(world):
    request = sick(world)
    assert services.can_act_on(world.manager_user, pending_step(request)) is False
    with pytest.raises(NotFound):
        decide(request, world.manager_user)


def test_hr_approves_a_sick_leave_without_touching_the_balance(world, port):
    request = sick(world)
    result = decide(request, world.hr_user)
    assert result.status == "approved"
    assert (port.checks, port.taken) == ([], [])


def test_an_extension_is_a_new_adjacent_request(world):
    decide(sick(world), world.hr_user)
    extension = sick(world, data=days(dt.date(2026, 10, 7), dt.date(2026, 10, 8)))
    assert extension.status == "pending"


def test_hr_counts_a_sick_leave_as_annual_leave(world, port):
    request = sick(world)
    result = services.reclassify_as_annual(actor=world.hr_user, request=request)
    assert (result.status, result.request_type.code, result.reclassified_from.code) == ("approved", "annual", "sick")
    assert (result.sensitive, result.certificate_due_at, result.quantity) == (True, None, Decimal("1.00"))
    assert port.taken == [
        {"request_id": request.pk, "employee_id": world.owner.pk, "days": {TODAY: Decimal("1")}, "actor": world.hr_user}
    ]
    hr_step = steps(request)[1]
    assert (hr_step.status, hr_step.decided_by, hr_step.channel) == ("approved", world.hr, "in_app")
    event = AuditEvent.objects.get(action="request.reclassified")
    assert event.changes["type"] == {"before": "sick", "after": "annual"}
    events = set(Notification.objects.filter(user=world.owner_user).values_list("event_code", flat=True))
    assert {"request.corrected", "request.approved"} <= events


def test_reclassifying_checks_the_balance_unless_hr_gives_an_exception(world, port):
    request = sick(world)
    port.ok = False
    with pytest.raises(DomainError) as error:
        services.reclassify_as_annual(actor=world.hr_user, request=request)
    assert error.value.code == "request.balance_insufficient"
    assert fresh(request).request_type.code == "sick"
    result = services.reclassify_as_annual(
        actor=world.hr_user, request=fresh(request), override_reason="Accord de la direction"
    )
    assert (result.status, result.override_reason) == ("approved", "Accord de la direction")
    assert len(port.taken) == 1


def test_the_comment_and_the_certificate_stay_restricted_after_reclassification(world):
    request = sick(world)
    link = services.attach_file(actor=world.owner_user, request=request, upload=pdf())
    services.reclassify_as_annual(actor=world.hr_user, request=fresh(request))
    assert fresh(request).sensitive is True
    assert services.may_read_attachment(world.manager_user, link.attachment) is False
    assert services.may_read_attachment(world.exec_user, link.attachment) is False
    trail = json.dumps(list(AuditEvent.objects.values_list("changes", "object_label")), default=str)
    assert "Grippe" not in trail


def test_only_a_sick_leave_waiting_for_hr_can_be_reclassified(world):
    annual = submitted(world, data=days(dt.date(2026, 11, 2)))
    with pytest.raises(Conflict) as error:
        services.reclassify_as_annual(actor=world.hr_user, request=annual)
    assert error.value.code == "request.not_reclassifiable"
    done = sick(world)
    decide(done, world.hr_user)
    with pytest.raises(Conflict):
        services.reclassify_as_annual(actor=world.hr_user, request=fresh(done))


def test_reclassifying_is_for_hr_and_never_on_ones_own_sick_leave(world):
    request = sick(world)
    with pytest.raises(NotAllowed):
        services.reclassify_as_annual(actor=world.exec_user, request=request)
    own = sick(world, employee=world.hr, actor=world.hr_user)
    with pytest.raises(NotAllowed) as error:
        services.reclassify_as_annual(actor=world.hr_user, request=own)
    assert error.value.code == "request.own_request"


def test_notifications_never_carry_the_comment(world):
    request = sick(world)
    services.attach_file(actor=world.owner_user, request=request, upload=pdf("certificat-grippe.pdf"))
    decide(request, world.hr_user, "return", "Certificat illisible")
    returned = fresh(request)
    services.submit(actor=world.owner_user, request=returned, expected_version=returned.version)
    decide(request, world.hr_user)

    assert Notification.objects.count() >= 6
    carried = json.dumps(
        list(Notification.objects.values_list("event_code", "parameters", "target_public_id")), default=str
    ).lower()
    for secret in ("grippe", "certificat", "illisible"):
        assert secret not in carried


def test_decision_comments_on_a_sick_leave_stay_out_of_the_audit_trail(world):
    request = sick(world)
    decide(request, world.hr_user, "reject", "Certificat non conforme")
    event = AuditEvent.objects.get(action="step.decided")
    assert event.changes["comment"] == {"changed": True}
    trail = json.dumps(list(AuditEvent.objects.values_list("changes", "object_label")), default=str)
    assert "non conforme" not in trail
    assert "Grippe" not in trail
    assert steps(request)[1].comment == "Certificat non conforme"  # the step keeps it for the employee and HR
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_sick_leave.py -v`
Expected: the five tests that call `services.reclassify_as_annual` fail with `AttributeError`; the seven others pass, because they rest on Tasks 8 to 12.

- [ ] **Step 3: Implement reclassification**

In `backend/apps/requests/services/hr_actions.py`, replace the import block with:

```python
from __future__ import annotations

from dataclasses import replace

from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError, NotAllowed
from apps.organisation import reach

from ..models import (
    Amendment,
    AmendmentStatus,
    BalanceEffect,
    Channel,
    Request,
    RequestStatus,
    RequestType,
    StepStatus,
    Unit,
)
from ..ports import balance_port
from . import chain, notices, outcomes
from .common import bump, changes_since, label, locked, note, require_hr_for_other, round_steps, snapshot
from .data import DATA_FIELDS, RequestData, apply_data, compute_quantity, data_of, day_diff, leave_days
from .validation import validate

OPEN_TO_HR = (RequestStatus.PENDING, RequestStatus.APPROVED)
ANNUAL_CODE = "annual"
```

Append to the end of the file:

```python
def reclassifiable_step(request, user):
    """The open step whose decision can be "count it as annual leave" (PRD 6.5), or None."""
    request_type = request.request_type
    if request.status != RequestStatus.PENDING or not request_type.is_sensitive:
        return None
    if request_type.unit != Unit.DAY or request_type.balance_effect != BalanceEffect.NONE:
        return None
    for step in round_steps(request).filter(status=StepStatus.PENDING).select_related("named_person"):
        step.request = request
        if chain.can_act_on(user, step):
            return step
    return None


@transaction.atomic
def reclassify_as_annual(*, actor, request, override_reason: str = "") -> Request:
    """Count a sick leave as annual leave instead. This is the HR decision on the request (master D17).

    The whole request changes type. Its comment and files stay restricted to the employee and HR.
    """
    request = locked(request)
    require_hr_for_other(actor, request)
    me = reach.employee_of(actor)
    if me is None:
        raise NotAllowed("request.actor_without_record")
    step = reclassifiable_step(request, actor)
    annual = RequestType.objects.filter(code=ANNUAL_CODE, is_active=True).first()
    if step is None or annual is None:
        raise Conflict("request.not_reclassifiable")
    override_reason = override_reason.strip()
    data = data_of(request)
    if not override_reason:
        verdict = balance_port().check(
            employee_id=request.employee_id, new_days=leave_days(annual, data), ignoring_request_id=request.pk
        )
        if not verdict.ok:
            raise DomainError("request.balance_insufficient", field="override_reason", shortfall=verdict.shortfall)
    former = request.request_type
    request.reclassified_from = former
    request.request_type = annual
    request.certificate_due_at = None
    request.quantity = compute_quantity(annual, data)
    if override_reason:
        request.override_reason = override_reason
    step.status = StepStatus.APPROVED
    step.decided_by = me
    step.decided_at = timezone.now()
    step.channel = Channel.IN_APP
    step.save(update_fields=["status", "decided_by", "decided_at", "channel"])
    bump(request, "request_type", "reclassified_from", "certificate_due_at", "quantity", "override_reason")
    changes = {"type": {"before": former.code, "after": annual.code}}
    if override_reason:
        changes.update(note(request, "override_reason", override_reason))
    audit.record(
        action="request.reclassified", obj=request, object_label=label(request), changes=changes, actor=actor
    )
    notices.tell_requester(request, "request.corrected")
    chain.advance(request=request, actor=actor)
    return request
```

Change the import in `backend/apps/requests/services/__init__.py` to:

```python
from .hr_actions import hr_cancel, hr_correct, reclassify_as_annual
```

and add `"reclassify_as_annual"` to `__all__`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_sick_leave.py -v`
Expected: 12 passed.

- [ ] **Step 5: Run the whole app**

Run: `docker compose run --rm app pytest apps/requests apps/calendar -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): sick leave end to end and reclassification as annual leave"
```

---

### Task 17: Reach and the viewer-relative representation

**Files:**
- Modify: `backend/apps/requests/selectors.py` (append reach, filters, certificate status, decision context)
- Create: `backend/apps/requests/representation.py`
- Test: `backend/apps/requests/tests/test_representation.py`

**Interfaces:**
- Consumes: `apps.organisation.reach` (`employee_of`, `team_ids`), `apps.organisation.selectors` (`full_name`, `department_name(employee, lang)`, `direct_reports`, `get_employee_for`, `employees_for`), `apps.accounts.roles`, `apps.accounts.services.display_name`, `apps.calendar.lang` (`active_lang`, `pick`), `chain.resolve_rule`, `chain.waiting_names`, `chain.can_act_on` (Task 7), `hr_actions.reclassifiable_step` (Task 16), `visible_attachments` (Task 12), `cap_usage`, `CapUsage` (Task 5), `balance_port()` (Task 4).
- Produces:
  - `apps.requests.selectors.base_requests() -> QuerySet[Request]` (with the relations the representation reads)
  - `apps.requests.selectors.can_see(user, request) -> bool`
  - `apps.requests.selectors.get_request_for(user, public_id: str) -> Request` (raises `NotFound` outside reach)
  - `apps.requests.selectors.requests_for(user, scope: str) -> QuerySet[Request]` (`mine`, `team`, `all`, `decided`)
  - `apps.requests.selectors.filter_requests(queryset, *, viewer, statuses=None, type_codes=None, employee_public_id=None, department_id=None, year=None, date_from=None, date_to=None, on_behalf=None, has_override=None) -> QuerySet[Request]`
  - `apps.requests.selectors.has_document(request) -> bool`, `document_requirement(request) -> str` (`none`, `deadline`, `proof`), `certificate_status(request, *, now=None) -> str`
  - `apps.requests.selectors.decision_context(request) -> DecisionContext` with `DecisionContext(balance: BalancePreview | None, teammates_away: list[TeammateAway], cap: CapUsage | None)` and `TeammateAway(name, label, start_date, end_date)`
  - `apps.requests.representation.Viewer`, `viewer_for(user) -> Viewer`
  - `apps.requests.representation.represent(request, viewer) -> dict`: the `RequestOut` of master 7.9, with Python values
  - `apps.requests.representation.represent_detail(request, viewer) -> dict`: `RequestDetailOut`
  - `apps.requests.representation.represent_context(request, viewer) -> dict`, `attachment_body(link) -> dict`, `attachment_bodies(request, viewer) -> list[dict]`, `amendment_bodies(request, viewer) -> list[dict]`
  - Rule for drafts: a draft is visible to, and editable by, the account that created it and nobody else

- [ ] **Step 1: Write the failing tests**

`backend/apps/requests/tests/test_representation.py`:

```python
import datetime as dt
import json
from decimal import Decimal

import pytest
from django.utils import translation

from apps.accounts.services import display_name
from apps.calendar.lang import active_lang
from apps.core.errors import DomainError, NotAllowed, NotFound
from apps.organisation.selectors import department_name, full_name
from apps.requests import selectors, services
from apps.requests.representation import represent, represent_detail, viewer_for
from apps.requests.tests.helpers import (
    MON, NOW, THU, TODAY, TUE, WED, approved, at, days, decide, draft, pdf, pending_step, stored, submitted,
)

pytestmark = pytest.mark.django_db


def view(request, user) -> dict:
    return represent(selectors.get_request_for(user, str(request.public_id)), viewer_for(user))


def detail(request, user) -> dict:
    return represent_detail(selectors.get_request_for(user, str(request.public_id)), viewer_for(user))


def actions(request, user) -> list[str]:
    return view(request, user)["viewer"]["actions"]


def sick(world):
    return submitted(world, request_type=world.sick, data=days(TODAY, comment="Grippe sévère"))


# ------------------------------------------------------------------ shape


def test_the_shape_of_a_pending_request_for_its_owner(world):
    request = submitted(world, data=days(MON, TUE, comment="Vacances"))
    body = view(request, world.owner_user)
    assert (body["public_id"], body["version"], body["status"]) == (request.public_id, 2, "pending")
    assert body["employee"] == {
        "public_id": world.owner.public_id,
        "name": full_name(world.owner),
        "department": department_name(world.owner, active_lang()),
    }
    assert (body["type"]["code"], body["type"]["unit"], body["type"]["calendar_label"]) == ("annual", "day", "absent")
    assert (body["start_date"], body["end_date"], body["starts_at_midday"], body["start_time"]) == (
        MON, TUE, False, None,
    )
    assert (body["quantity"], body["event"], body["comment"], body["comment_hidden"]) == (
        Decimal("2.00"), None, "Vacances", False,
    )
    assert body["state"] == {
        "key": "waiting_manager",
        "waiting_on": [display_name(world.manager_user)],
        "last_actor": None,
        "note": None,
        "since": NOW,
    }
    assert body["certificate"] == {"status": "not_needed", "due_at": None}
    assert (body["amendment"], body["has_override"], body["created_by_hr"]) == (None, False, False)
    assert body["viewer"] == {"relation": "owner", "actions": ["edit", "withdraw", "attach"], "step_id": None}
    assert (body["submitted_at"], body["decided_at"]) == (NOW, None)


def test_names_follow_the_language_of_the_reader(world):
    request = submitted(world, request_type=world.exceptional, data=days(MON, exceptional_event_id=world.event.pk))
    with translation.override("en"):
        body = view(request, world.owner_user)
        assert (body["type"]["name"], body["event"]) == (
            "Exceptional leave", {"id": world.event.pk, "name": "Marriage"},
        )
    with translation.override("fr"):
        body = view(request, world.owner_user)
        assert (body["type"]["name"], body["event"]["name"]) == ("Congé exceptionnel", "Mariage")


# ------------------------------------------------------------------ actions of the owner (UI 5.4)


def test_owner_actions_follow_the_state(world):
    assert actions(draft(world, data=days(MON)), world.owner_user) == ["edit", "submit", "discard", "attach"]

    pending = submitted(world, data=days(MON))
    assert actions(pending, world.owner_user) == ["edit", "withdraw", "attach"]
    decide(pending, world.manager_user)
    assert actions(pending, world.owner_user) == ["withdraw", "attach"]

    returned = submitted(world, data=days(TUE))
    decide(returned, world.manager_user, "return", "À revoir")
    assert actions(returned, world.owner_user) == ["edit", "submit", "withdraw", "attach"]

    refused = submitted(world, data=days(THU))
    decide(refused, world.manager_user, "reject", "Non")
    assert actions(refused, world.owner_user) == []

    granted = approved(world, data=days(WED))
    assert actions(granted, world.owner_user) == ["amend"]
    services.open_amendment(actor=world.owner_user, request=granted, kind="cancel", data=None, reason="Annulé")
    assert actions(granted, world.owner_user) == ["withdraw_amendment"]


def test_a_started_approved_request_offers_nothing_to_its_owner(world, clock):
    request = approved(world, data=days(MON, TUE))
    clock.move_to(at(11, 2))
    assert actions(request, world.owner_user) == []


def test_a_request_entered_by_hr_with_an_exception_is_not_editable_by_the_employee(world):
    request = submitted(world, actor=world.hr_user, override_reason="Accord de la direction")
    body = view(request, world.owner_user)
    assert (body["has_override"], body["created_by_hr"]) == (True, True)
    assert body["viewer"]["actions"] == ["withdraw", "attach"]


# ------------------------------------------------------------------ the people who decide


def test_the_manager_sees_what_to_decide_then_only_follows(world):
    request = submitted(world)
    body = view(request, world.manager_user)
    assert body["viewer"] == {"relation": "approver", "actions": ["decide"], "step_id": pending_step(request).pk}

    decide(request, world.manager_user)
    with translation.override("en"):
        after = view(request, world.manager_user)
    assert after["viewer"] == {"relation": "team", "actions": [], "step_id": None}
    assert (after["state"]["key"], after["state"]["waiting_on"], after["state"]["last_actor"]) == (
        "waiting_hr", ["HR"], full_name(world.manager),
    )


def test_hr_actions_follow_the_state(world):
    request = submitted(world)
    waiting_on_manager = view(request, world.hr_user)
    assert waiting_on_manager["viewer"] == {
        "relation": "hr",
        "actions": ["attach", "record_on_behalf", "reassign", "correct", "cancel"],
        "step_id": pending_step(request).pk,
    }
    decide(request, world.manager_user)
    assert actions(request, world.hr_user) == [
        "attach", "decide", "record_on_behalf", "reassign", "correct", "cancel",
    ]
    decide(request, world.hr_user)
    done = view(request, world.hr_user)
    assert done["viewer"] == {"relation": "hr", "actions": ["correct", "cancel"], "step_id": None}


def test_hr_is_offered_reclassification_on_a_sick_leave(world):
    body = view(sick(world), world.hr_user)
    assert body["viewer"]["actions"] == [
        "attach", "decide", "record_on_behalf", "reassign", "correct", "cancel", "reclassify",
    ]
    assert body["certificate"] == {"status": "due", "due_at": NOW + dt.timedelta(hours=48)}


def test_hr_edits_and_resends_a_returned_request_it_entered(world):
    request = submitted(world, actor=world.hr_user, override_reason="Accord")
    decide(request, world.manager_user, "return", "Dates à confirmer")
    assert actions(request, world.hr_user) == ["edit", "submit", "attach"]


def test_an_executive_sees_everything_and_acts_on_nothing_outside_their_team(world):
    request = submitted(world)
    assert view(request, world.exec_user)["viewer"] == {"relation": "overview", "actions": [], "step_id": None}
    of_a_manager = submitted(world, employee=world.manager, data=days(TUE))
    assert view(of_a_manager, world.exec_user)["viewer"]["relation"] == "approver"


def test_hr_never_gets_actions_on_its_own_request(world):
    request = submitted(world, employee=world.hr, actor=world.hr_user)
    assert view(request, world.hr_user)["viewer"] == {
        "relation": "owner", "actions": ["edit", "withdraw", "attach"], "step_id": None,
    }


# ------------------------------------------------------------------ what must never leak


def test_manager_never_receives_the_sick_leave_comment(world):
    request = sick(world)
    services.attach_file(actor=world.owner_user, request=request, upload=pdf("certificat-grippe.pdf"))
    decide(request, world.hr_user, "return", "Certificat illisible")

    for user in (world.manager_user, world.exec_user):
        body = detail(request, user)
        assert (body["comment"], body["comment_hidden"], body["certificate"]) == (None, True, None)
        assert body["attachments"] == []
        assert body["state"]["note"] is None
        assert all(step["comment"] is None for step in body["steps"])
        carried = json.dumps(body, default=str).lower()
        for secret in ("grippe", "illisible", "certificat"):
            assert secret not in carried

    for user in (world.owner_user, world.hr_user):
        body = detail(request, user)
        assert (body["comment"], body["comment_hidden"]) == ("Grippe sévère", False)
        assert body["state"]["note"] == "Certificat illisible"
        assert body["certificate"]["status"] == "attached"
        assert [(item["kind"], item["name"]) for item in body["attachments"]] == [("medical", "certificat-grippe.pdf")]


def test_the_type_of_a_sick_leave_is_visible_to_the_manager_but_nothing_more(world):
    body = view(sick(world), world.manager_user)
    assert body["type"]["code"] == "sick"
    assert body["viewer"] == {"relation": "team", "actions": [], "step_id": None}


# ------------------------------------------------------------------ detail


def test_detail_lists_steps_amendments_files_and_what_is_needed_to_decide(world):
    request = approved(world, data=days(MON, TUE))
    stored(world, employee=world.peer, request_type=world.remote, data=days(TUE))
    amendment = services.open_amendment(
        actor=world.owner_user, request=request, kind="change", data=days(WED), reason="Changement"
    )

    body = detail(request, world.manager_user)

    # The two steps of the request itself, then the two steps of the change that is waiting.
    assert [(step["round"], step["position"], step["status"]) for step in body["steps"]] == [
        (1, 1, "approved"),
        (1, 2, "approved"),
        (1, 1, "pending"),
        (1, 2, "waiting"),
    ]
    first = body["steps"][0]
    assert first == {
        "id": first["id"],
        "round": 1,
        "position": 1,
        "rule": "line_manager",
        "mode": "approve",
        "status": "approved",
        "approvers": [],
        "decided_by": full_name(world.manager),
        "decided_at": NOW,
        "recorded_by": None,
        "channel": "in_app",
        "comment": None,
        "amendment_public_id": None,
    }
    change_step = body["steps"][2]
    assert (change_step["amendment_public_id"], change_step["approvers"]) == (
        amendment.public_id, [display_name(world.manager_user)],
    )
    assert body["amendment"] == {
        "public_id": amendment.public_id,
        "kind": "change",
        "status": "pending",
        "state_key": "waiting_manager",
        "waiting_on": [display_name(world.manager_user)],
    }
    assert body["amendments"] == [
        {
            "public_id": amendment.public_id,
            "kind": "change",
            "status": "pending",
            "reason": "Changement",
            "new_start_date": WED,
            "new_end_date": WED,
            "new_quantity": Decimal("1.00"),
            "created_at": NOW,
            "decided_at": None,
        }
    ]
    assert body["viewer"] == {"relation": "approver", "actions": ["decide"], "step_id": change_step["id"]}
    assert body["decision_context"] == {
        "balance": {"now": Decimal("10"), "after": Decimal("8")},
        "teammates_away": [{"name": full_name(world.peer), "label": "remote", "start_date": TUE, "end_date": TUE}],
        "cap": None,
    }


def test_the_owner_sees_the_balance_but_not_who_else_is_away(world):
    request = submitted(world, data=days(TUE))
    stored(world, employee=world.peer, data=days(TUE))
    context = detail(request, world.owner_user)["decision_context"]
    assert context["teammates_away"] == []
    assert context["balance"] == {"now": Decimal("10"), "after": Decimal("9")}


def test_decision_context_shows_the_weekly_limit_for_remote_work(world):
    stored(world, request_type=world.remote, data=days(MON))
    request = submitted(world, request_type=world.remote, data=days(TUE))
    context = detail(request, world.manager_user)["decision_context"]
    assert context["cap"] == {"used": Decimal("1"), "limit": Decimal("2.00")}
    assert context["balance"] is None


# ------------------------------------------------------------------ reach, scopes, filters


def test_reach_of_a_request(world):
    request = submitted(world)
    for user in (world.owner_user, world.manager_user, world.hr_user, world.exec_user):
        assert selectors.get_request_for(user, str(request.public_id)).pk == request.pk
    for user in (world.peer_user, world.other_manager_user, world.outsider_user, world.sysadmin_user):
        with pytest.raises(NotFound):
            selectors.get_request_for(user, str(request.public_id))


def test_a_draft_is_seen_by_its_creator_only(world):
    own = draft(world)
    entered_by_hr = draft(world, actor=world.hr_user, data=days(TUE))
    assert selectors.can_see(world.owner_user, own) is True
    assert selectors.can_see(world.hr_user, own) is False
    assert selectors.can_see(world.manager_user, own) is False
    assert selectors.can_see(world.hr_user, entered_by_hr) is True
    assert selectors.can_see(world.owner_user, entered_by_hr) is False


def test_a_named_approver_and_a_past_decider_keep_access(world):
    request = submitted(world)
    services.reassign_step(
        actor=world.hr_user, step=pending_step(request), new_approver=world.other_manager, reason="Absence"
    )
    assert selectors.can_see(world.other_manager_user, request) is True
    decide(request, world.other_manager_user)
    assert selectors.can_see(world.other_manager_user, request) is True
    assert view(request, world.other_manager_user)["viewer"]["relation"] == "approver"


def test_scopes(world):
    mine = submitted(world, data=days(MON))
    own_draft = draft(world, data=days(TUE))
    of_peer = submitted(world, employee=world.peer, data=days(MON))
    elsewhere = submitted(world, employee=world.outsider, data=days(MON))
    decide(mine, world.manager_user)

    def found(user, scope):
        return set(selectors.requests_for(user, scope).values_list("pk", flat=True))

    assert found(world.owner_user, "mine") == {mine.pk, own_draft.pk}
    assert found(world.manager_user, "team") == {mine.pk, of_peer.pk}
    assert found(world.hr_user, "all") == {mine.pk, of_peer.pk, elsewhere.pk}
    assert found(world.exec_user, "all") == {mine.pk, of_peer.pk, elsewhere.pk}
    assert found(world.manager_user, "decided") == {mine.pk}
    assert found(world.sysadmin_user, "mine") == set()
    with pytest.raises(NotAllowed):
        selectors.requests_for(world.owner_user, "team")
    with pytest.raises(NotAllowed):
        selectors.requests_for(world.manager_user, "all")
    with pytest.raises(DomainError) as error:
        selectors.requests_for(world.hr_user, "everything")
    assert error.value.code == "request.scope_invalid"


def test_filters(world):
    annual = submitted(world, data=days(MON))
    remote = submitted(world, request_type=world.remote, data=days(TUE))
    of_outsider = submitted(world, employee=world.outsider, data=days(MON))
    entered = submitted(world, employee=world.peer, actor=world.hr_user, data=days(MON), override_reason="Accord")
    decide(annual, world.manager_user, "reject", "Non")
    viewer = world.hr_user

    def found(**filters):
        queryset = selectors.filter_requests(selectors.requests_for(viewer, "all"), viewer=viewer, **filters)
        return set(queryset.values_list("pk", flat=True))

    everything = {annual.pk, remote.pk, of_outsider.pk, entered.pk}
    assert found() == everything
    assert found(statuses=["rejected"]) == {annual.pk}
    assert found(type_codes=["remote"]) == {remote.pk}
    assert found(employee_public_id=str(world.outsider.public_id)) == {of_outsider.pk}
    assert found(department_id=world.dept_b.pk) == {of_outsider.pk}
    assert found(year=2026) == everything
    assert found(year=2027) == set()
    assert found(date_from=TUE, date_to=TUE) == {remote.pk}
    assert found(on_behalf=True) == {entered.pk}
    assert found(on_behalf=False) == everything - {entered.pk}
    assert found(has_override=True) == {entered.pk}
    assert found(has_override=False) == everything - {entered.pk}


def test_certificate_status_values(world, clock):
    assert selectors.certificate_status(submitted(world, data=days(MON))) == "not_needed"
    ill = sick(world)
    assert selectors.certificate_status(ill) == "due"
    clock.shift(dt.timedelta(hours=49))
    assert selectors.certificate_status(ill) == "overdue"
    services.attach_file(actor=world.owner_user, request=ill, upload=pdf())
    assert selectors.certificate_status(ill) == "attached"
    wedding = submitted(
        world, request_type=world.exceptional, data=days(dt.date(2026, 11, 16), exceptional_event_id=world.event.pk)
    )
    assert selectors.certificate_status(wedding) == "missing"
    assert selectors.document_requirement(wedding) == "proof"
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_representation.py -v`
Expected: collection error, `ModuleNotFoundError: No module named 'apps.requests.representation'`.

- [ ] **Step 3: Implement the selectors**

Replace the import block at the top of `backend/apps/requests/selectors.py` with:

```python
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from django.db.models import F, Q, QuerySet
from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.core.errors import DomainError, NotAllowed, NotFound
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors

from .models import (
    BalanceEffect,
    CalendarLabel,
    DocumentRule,
    ExceptionalEvent,
    Request,
    RequestStatus,
    RequestStep,
    RequestType,
    Unit,
)
from .ports import BalancePreview, balance_port
from .services.common import name_of
from .services.data import data_of, leave_days
from .services.validation import CapUsage, cap_usage
```

Append to the end of `backend/apps/requests/selectors.py`:

```python
# ------------------------------------------------------------------ reach


def base_requests() -> QuerySet[Request]:
    """Requests with the relations the representation reads, so that a page of a list stays cheap."""
    return Request.objects.select_related(
        "request_type", "employee", "exceptional_event", "created_by", "reclassified_from"
    ).prefetch_related("steps", "steps__named_person", "steps__decided_by", "amendments", "attachment_links")


def can_see(user, request) -> bool:
    """Permission matrix, row "View request": own, team, all for HR and executives.

    A draft belongs to the account that created it. Someone a step was given to, or who decided
    a step, keeps access to that request.
    """
    if request.status == RequestStatus.DRAFT:
        return request.created_by_id == user.pk
    me = reach.employee_of(user)
    if me is not None and me.pk == request.employee_id:
        return True
    if has_role(user, Role.HR, Role.EXEC):
        return True
    if request.employee_id in reach.team_ids(user):
        return True
    if me is None:
        return False
    return RequestStep.objects.filter(request=request).filter(Q(named_person=me) | Q(decided_by=me)).exists()


def get_request_for(user, public_id: str) -> Request:
    request = base_requests().filter(public_id=public_id).first()
    if request is None or not can_see(user, request):
        raise NotFound("core.not_found")
    return request


def requests_for(user, scope: str) -> QuerySet[Request]:
    """The requests of a scope: "mine", "team" (managers), "all" (HR, executives), "decided"."""
    me = reach.employee_of(user)
    base = base_requests()
    not_a_foreign_draft = ~Q(status=RequestStatus.DRAFT) | Q(created_by=user)
    if scope == "mine":
        if me is None:
            return base.none()
        return base.filter(not_a_foreign_draft, employee=me)
    if scope == "team":
        if not has_role(user, Role.MANAGER):
            raise NotAllowed("core.not_allowed")
        return base.filter(employee_id__in=reach.team_ids(user)).exclude(status=RequestStatus.DRAFT)
    if scope == "all":
        if not has_role(user, Role.HR, Role.EXEC):
            raise NotAllowed("core.not_allowed")
        return base.filter(not_a_foreign_draft)
    if scope == "decided":
        if me is None:
            return base.none()
        return base.filter(steps__decided_by=me).exclude(status=RequestStatus.DRAFT).distinct()
    raise DomainError("request.scope_invalid", field="scope")


def filter_requests(
    queryset: QuerySet[Request],
    *,
    viewer,
    statuses=None,
    type_codes=None,
    employee_public_id: str | None = None,
    department_id: int | None = None,
    year: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    on_behalf: bool | None = None,
    has_override: bool | None = None,
) -> QuerySet[Request]:
    """Narrow a scope. Employee and department are resolved through organisation, within the viewer's reach."""
    if statuses:
        queryset = queryset.filter(status__in=list(statuses))
    if type_codes:
        queryset = queryset.filter(request_type__code__in=list(type_codes))
    if employee_public_id:
        try:
            employee = organisation_selectors.get_employee_for(viewer, employee_public_id)
        except NotFound:
            return queryset.none()
        queryset = queryset.filter(employee=employee)
    if department_id is not None:
        members = organisation_selectors.employees_for(viewer, include_archived=True).filter(
            department_id=department_id
        )
        queryset = queryset.filter(employee_id__in=list(members.values_list("pk", flat=True)))
    if year is not None:
        queryset = queryset.filter(start_date__lte=date(year, 12, 31), end_date__gte=date(year, 1, 1))
    if date_from is not None:
        queryset = queryset.filter(end_date__gte=date_from)
    if date_to is not None:
        queryset = queryset.filter(start_date__lte=date_to)
    if on_behalf is True:
        queryset = queryset.exclude(created_by=F("employee__user"))
    elif on_behalf is False:
        queryset = queryset.filter(created_by=F("employee__user"))
    if has_override is True:
        queryset = queryset.exclude(override_reason="")
    elif has_override is False:
        queryset = queryset.filter(override_reason="")
    return queryset


# ------------------------------------------------------------------ documents


def has_document(request) -> bool:
    """A certificate or a proof is attached. The scan of a signed form (linked to a step) does not count."""
    return any(link.step_id is None for link in request.attachment_links.all())


def document_requirement(request) -> str:
    """"deadline": required within a deadline; "proof": required by the chosen event; "none"."""
    request_type = request.request_type
    if request_type.document_rule == DocumentRule.REQUIRED_WITHIN_DEADLINE:
        return "deadline"
    event = request.exceptional_event if request.exceptional_event_id else None
    if request_type.uses_events and event is not None and event.proof_required:
        return "proof"
    return "none"


def certificate_status(request, *, now: datetime | None = None) -> str:
    """"not_needed", "attached", "due", "overdue" (past the deadline) or "missing" (a proof without deadline)."""
    need = document_requirement(request)
    if need == "none":
        return "not_needed"
    if has_document(request):
        return "attached"
    if need == "proof":
        return "missing"
    now = now or timezone.now()
    if request.certificate_due_at is not None and now >= request.certificate_due_at:
        return "overdue"
    return "due"


# ------------------------------------------------------------------ what a decider needs (UI 6.2, 7.8)


@dataclass(frozen=True)
class TeammateAway:
    name: str
    label: str
    start_date: date
    end_date: date


@dataclass(frozen=True)
class DecisionContext:
    balance: BalancePreview | None
    teammates_away: list[TeammateAway]
    cap: CapUsage | None


def _teammates_away(request) -> list[TeammateAway]:
    """People with the same manager who are absent or remote on the dates of this request."""
    manager = request.employee.manager
    if manager is None:
        return []
    mates = {
        mate.pk: mate for mate in organisation_selectors.direct_reports(manager) if mate.pk != request.employee_id
    }
    if not mates:
        return []
    others = (
        Request.objects.filter(
            employee_id__in=list(mates),
            status=RequestStatus.APPROVED,
            request_type__unit=Unit.DAY,
            start_date__lte=request.end_date,
            end_date__gte=request.start_date,
        )
        .exclude(request_type__calendar_label=CalendarLabel.HIDDEN)
        .select_related("request_type")
        .order_by("start_date", "pk")
    )
    return [
        TeammateAway(
            name=name_of(mates[other.employee_id]),
            label=other.request_type.calendar_label,
            start_date=other.start_date,
            end_date=other.end_date,
        )
        for other in others
    ]


def decision_context(request) -> DecisionContext:
    """Balance now and after (through the port), teammates away on the same days, and use of the cap."""
    request_type = request.request_type
    data = data_of(request)
    days = leave_days(request_type, data)
    balance = None
    if request_type.balance_effect == BalanceEffect.DEDUCTS_ANNUAL:
        balance = balance_port().preview(
            employee_id=request.employee_id, new_days=days, ignoring_request_id=request.pk
        )
    portions = days if request_type.unit == Unit.DAY else {request.start_date: request.quantity}
    usages = cap_usage(
        employee=request.employee, request_type=request_type, portions=portions, ignoring_request_id=request.pk
    )
    cap = max(usages, key=lambda usage: usage.used + usage.adding) if usages else None
    return DecisionContext(balance=balance, teammates_away=_teammates_away(request), cap=cap)
```

`filter_requests` compares `created_by` with `employee__user`: this reads the `user` column of `organisation.Employee` (master D6) through the request's own foreign key.

- [ ] **Step 4: Implement the representation**

`backend/apps/requests/representation.py`:

```python
"""The one description of a request that every list, queue and detail returns (master 7.9).

It is built for a viewer: the state reads from their angle, the actions are exactly what they may do
now, and whatever they may not read is left out here, on the server.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.accounts.services import display_name
from apps.calendar.lang import active_lang, pick
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors

from . import selectors
from .models import AmendmentStatus, ApproverRule, RequestStatus, StepMode, StepStatus
from .services import chain, hr_actions
from .services.attachments import visible_attachments
from .services.common import DECIDED, name_of

STATE_KEYS = {
    ApproverRule.LINE_MANAGER: "waiting_manager",
    ApproverRule.HR_ROLE: "waiting_hr",
    ApproverRule.NAMED_PERSON: "waiting_person",
}
STEP_ACTIONS = ("decide", "record_on_behalf", "reassign")
NEEDS_DOCUMENT = ("due", "overdue", "missing")


@dataclass(frozen=True)
class Viewer:
    """Who is looking, computed once per call."""

    user: Any
    employee: Any
    is_hr: bool
    is_exec: bool
    team: frozenset[int]
    today: date
    now: datetime


def viewer_for(user) -> Viewer:
    return Viewer(
        user=user,
        employee=reach.employee_of(user),
        is_hr=has_role(user, Role.HR),
        is_exec=has_role(user, Role.EXEC),
        team=frozenset(reach.team_ids(user)),
        today=timezone.localdate(),
        now=timezone.now(),
    )


# ------------------------------------------------------------------ steps


def _steps_of(request, amendment=None) -> list:
    """The steps of the latest round of the request, or of one amendment, from the prefetched rows."""
    amendment_id = amendment.pk if amendment is not None else None
    mine = [step for step in request.steps.all() if step.amendment_id == amendment_id]
    if not mine:
        return []
    last = max(step.round for step in mine)
    return sorted((step for step in mine if step.round == last), key=lambda step: step.position)


def _open_amendment(request):
    return next((item for item in request.amendments.all() if item.status == AmendmentStatus.PENDING), None)


def _pending(steps):
    return next(
        (step for step in steps if step.status == StepStatus.PENDING and step.mode == StepMode.APPROVE), None
    )


def _waiting(request, steps) -> tuple[str, list[str]]:
    """The state key and the names for "waiting for …"."""
    step = _pending(steps)
    if step is None:
        return "waiting_hr", []
    resolution = chain.resolve_rule(
        rule=step.approver_rule, named_person=step.named_person, requester=request.employee
    )
    names = chain.waiting_names(rule=step.approver_rule, named_person=step.named_person, requester=request.employee)
    return STATE_KEYS[resolution.rule], names


# ------------------------------------------------------------------ pieces of RequestOut


def _state(request, steps, *, private: bool) -> dict:
    decided = sorted(
        (step for step in steps if step.status in DECIDED and step.decided_at is not None),
        key=lambda step: (step.decided_at, step.position),
    )
    last = decided[-1] if decided else None
    last_actor = name_of(last.decided_by) if last is not None and last.decided_by_id else None
    key: str = request.status
    waiting_on: list[str] = []
    note = None
    since = request.updated_at
    if request.status == RequestStatus.DRAFT:
        since = request.created_at
    elif request.status == RequestStatus.PENDING:
        key, waiting_on = _waiting(request, steps)
        pending = _pending(steps)
        since = pending.activated_at if pending is not None else request.submitted_at
    elif request.status in (RequestStatus.RETURNED, RequestStatus.REJECTED):
        if last is not None:
            note = last.comment if private else None
            since = last.decided_at
    elif request.status == RequestStatus.APPROVED:
        since = request.decided_at
    return {"key": key, "waiting_on": waiting_on, "last_actor": last_actor, "note": note or None, "since": since}


def _amendment(request, amendment) -> dict | None:
    if amendment is None:
        return None
    key, waiting_on = _waiting(request, _steps_of(request, amendment))
    return {
        "public_id": amendment.public_id,
        "kind": amendment.kind,
        "status": amendment.status,
        "state_key": key,
        "waiting_on": waiting_on,
    }


def _open_step(request, steps, amendment):
    """The step that is waiting for a decision: on the request, or on its open amendment."""
    step = _pending(steps)
    if step is None and amendment is not None:
        step = _pending(_steps_of(request, amendment))
        if step is not None:
            step.amendment = amendment
    if step is not None:
        step.request = request
    return step


def _actions(request, viewer: Viewer, *, own: bool, steps, amendment, open_step, decidable: bool) -> list[str]:
    """Everything this viewer may do on this request now, in display order. The UI shows exactly these."""
    status = request.status
    if status == RequestStatus.DRAFT:
        return ["edit", "submit", "discard", "attach"] if request.created_by_id == viewer.user.pk else []
    actions: list[str] = []
    may_edit = (own and not request.override_reason) or (not own and viewer.is_hr)
    someone_decided = any(step.status in DECIDED for step in steps)
    if status == RequestStatus.RETURNED and may_edit:
        actions += ["edit", "submit"]
    if status == RequestStatus.PENDING and own and not request.override_reason and not someone_decided:
        actions.append("edit")
    if own and status in (RequestStatus.PENDING, RequestStatus.RETURNED):
        actions.append("withdraw")
    if own and status == RequestStatus.APPROVED:
        if amendment is not None:
            actions.append("withdraw_amendment")
        elif request.start_date > viewer.today:
            actions.append("amend")
    if own or viewer.is_hr:
        open_for_files = status in (RequestStatus.PENDING, RequestStatus.RETURNED)
        awaited = status == RequestStatus.APPROVED and (
            selectors.certificate_status(request, now=viewer.now) in NEEDS_DOCUMENT
        )
        if open_for_files or awaited:
            actions.append("attach")
    if decidable:
        actions.append("decide")
    if viewer.is_hr and not own:
        if open_step is not None:
            actions += ["record_on_behalf", "reassign"]
        if status in (RequestStatus.PENDING, RequestStatus.APPROVED):
            if amendment is None:
                actions.append("correct")
            actions.append("cancel")
        if hr_actions.reclassifiable_step(request, viewer.user) is not None:
            actions.append("reclassify")
    return actions


def _relation(request, viewer: Viewer, *, own: bool, decidable: bool) -> str:
    if own:
        return "owner"
    if viewer.is_hr:
        return "hr"
    if decidable:
        return "approver"
    if request.employee_id in viewer.team:
        return "team"
    if viewer.is_exec:
        return "overview"
    return "approver"  # someone a step was given to, or who decided one earlier


# ------------------------------------------------------------------ RequestOut


def _flags(request, viewer: Viewer) -> tuple[bool, bool]:
    own = viewer.employee is not None and viewer.employee.pk == request.employee_id
    private = (not request.sensitive) or own or viewer.is_hr
    return own, private


def represent(request, viewer: Viewer) -> dict:
    """`RequestOut` of master 7.9, with Python values; the serializer turns them into JSON."""
    own, private = _flags(request, viewer)
    steps = _steps_of(request)
    amendment = _open_amendment(request)
    open_step = _open_step(request, steps, amendment)
    decidable = open_step is not None and chain.can_act_on(viewer.user, open_step)
    actions = _actions(
        request, viewer, own=own, steps=steps, amendment=amendment, open_step=open_step, decidable=decidable
    )
    request_type = request.request_type
    event = request.exceptional_event if request.exceptional_event_id else None
    certificate = None
    if own or viewer.is_hr:
        certificate = {
            "status": selectors.certificate_status(request, now=viewer.now),
            "due_at": request.certificate_due_at,
        }
    return {
        "public_id": request.public_id,
        "version": request.version,
        "employee": {
            "public_id": request.employee.public_id,
            "name": name_of(request.employee),
            "department": organisation_selectors.department_name(request.employee, active_lang()),
        },
        "type": {
            "code": request_type.code,
            "name": pick(request_type.name_fr, request_type.name_en),
            "unit": request_type.unit,
            "calendar_label": request_type.calendar_label,
        },
        "start_date": request.start_date,
        "end_date": request.end_date,
        "starts_at_midday": request.starts_at_midday,
        "ends_at_midday": request.ends_at_midday,
        "start_time": request.start_time,
        "end_time": request.end_time,
        "quantity": request.quantity,
        "event": {"id": event.pk, "name": pick(event.name_fr, event.name_en)} if event is not None else None,
        "comment": request.comment if private else None,
        "comment_hidden": not private,
        "status": request.status,
        "state": _state(request, steps, private=private),
        "certificate": certificate,
        "amendment": _amendment(request, amendment),
        "has_override": bool(request.override_reason),
        "created_by_hr": request.created_by_id != request.employee.user_id,
        "viewer": {
            "relation": _relation(request, viewer, own=own, decidable=decidable),
            "actions": actions,
            "step_id": open_step.pk if open_step is not None and any(a in STEP_ACTIONS for a in actions) else None,
        },
        "submitted_at": request.submitted_at,
        "decided_at": request.decided_at,
        "created_at": request.created_at,
    }


# ------------------------------------------------------------------ RequestDetailOut


def _step(request, step, *, private: bool, amendment_ids: dict[int, Any]) -> dict:
    waiting = step.status in (StepStatus.WAITING, StepStatus.PENDING)
    return {
        "id": step.pk,
        "round": step.round,
        "position": step.position,
        "rule": step.approver_rule,
        "mode": step.mode,
        "status": step.status,
        "approvers": chain.waiting_names(
            rule=step.approver_rule, named_person=step.named_person, requester=request.employee
        )
        if waiting
        else [],
        "decided_by": name_of(step.decided_by) if step.decided_by_id else None,
        "decided_at": step.decided_at,
        "recorded_by": display_name(step.recorded_by) if step.recorded_by_id else None,
        "channel": step.channel or None,
        "comment": (step.comment or None) if private else None,
        "amendment_public_id": amendment_ids.get(step.amendment_id),
    }


def _context(request, *, own: bool) -> dict:
    context = selectors.decision_context(request)
    return {
        "balance": {"now": context.balance.now, "after": context.balance.after} if context.balance else None,
        "teammates_away": []
        if own
        else [
            {"name": mate.name, "label": mate.label, "start_date": mate.start_date, "end_date": mate.end_date}
            for mate in context.teammates_away
        ],
        "cap": {"used": context.cap.used, "limit": context.cap.limit} if context.cap else None,
    }


def represent_context(request, viewer: Viewer) -> dict:
    """`decision_context` alone, for the approvals queues."""
    own, _ = _flags(request, viewer)
    return _context(request, own=own)


def represent_detail(request, viewer: Viewer) -> dict:
    """`RequestDetailOut`: `RequestOut` plus steps, files, amendments and what is needed to decide."""
    body = represent(request, viewer)
    own, private = _flags(request, viewer)
    amendments = sorted(request.amendments.all(), key=lambda item: (item.created_at, item.pk))
    amendment_ids = {item.pk: item.public_id for item in amendments}
    ordered = sorted(
        request.steps.all(),
        key=lambda step: (step.amendment_id is not None, step.amendment_id or 0, step.round, step.position),
    )
    body["steps"] = [_step(request, step, private=private, amendment_ids=amendment_ids) for step in ordered]
    body["attachments"] = attachment_bodies(request, viewer)
    body["amendments"] = amendment_bodies(request, viewer)
    body["decision_context"] = _context(request, own=own)
    return body


def attachment_body(link) -> dict:
    attachment = link.attachment
    return {
        "public_id": attachment.public_id,
        "kind": attachment.kind,
        "name": attachment.original_name,
        "size": attachment.size,
        "uploaded_by": display_name(attachment.uploaded_by),
        "uploaded_at": attachment.uploaded_at,
    }


def attachment_bodies(request, viewer: Viewer) -> list[dict]:
    """The files of a request that this viewer may see, oldest first."""
    return [attachment_body(link) for link in visible_attachments(request, viewer.user)]


def amendment_bodies(request, viewer: Viewer) -> list[dict]:
    """Every change asked for on a request, oldest first. The reason of a sensitive request stays private."""
    _, private = _flags(request, viewer)
    return [
        {
            "public_id": item.public_id,
            "kind": item.kind,
            "status": item.status,
            "reason": item.reason if private else None,
            "new_start_date": item.new_start_date,
            "new_end_date": item.new_end_date,
            "new_quantity": item.new_quantity,
            "created_at": item.created_at,
            "decided_at": item.decided_at,
        }
        for item in sorted(request.amendments.all(), key=lambda item: (item.created_at, item.pk))
    ]
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_representation.py -v`
Expected: 22 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): reach, filters and the viewer-relative representation of a request"
```

---

### Task 18: Read API: lists, detail, history, preview

**Files:**
- Create: `backend/apps/requests/services/preview.py`
- Modify: `backend/apps/requests/services/__init__.py`
- Modify: `backend/apps/requests/selectors.py` (append `history`)
- Modify: `backend/apps/requests/representation.py` (append `preview_body`, `problem_body`)
- Modify: `backend/apps/requests/api/serializers.py` (append the request serializers)
- Modify: `backend/apps/requests/api/views.py` (append four views)
- Modify: `backend/apps/requests/api/urls.py`
- Modify: `backend/apps/requests/tests/matrix.py`
- Modify: `backend/config/settings.py` (entries in `ENUM_NAME_OVERRIDES`)
- Modify: `backend/openapi.yaml` (regenerated)
- Test: `backend/apps/requests/tests/test_api_read.py`

**Interfaces:**
- Consumes: `apps.core.pagination` (`DefaultPagination`, `PAGE_PARAMETERS`, `paginated(serializer_class)`), `apps.audit.selectors.events_for_object(object_type, object_id)`, `apps.core.i18n` (`translate`, `all_messages`), everything of Task 17, `validate`, `cap_usage`, `hours_in_month` (Task 5), `chain_preview` (Task 7), `certificate_deadline_hours` (Task 9).
- Produces:
  - `apps.requests.services.preview(*, actor, employee, request_type, data, override=False, ignoring_request_id=None) -> Preview` with `Preview(quantity, skipped_days, chain, balance, cap, month_hours, event_days_allowed, certificate_due_at, problems)`
  - `apps.requests.selectors.history(request) -> list[dict]` (`at`, `actor`, `action`, `summary`, `changes`; oldest first)
  - Serializers named as in master 7.9: `RequestOut`, `RequestDetailOut`; plus `PreviewIn`, `PreviewOut`, `HistoryItemOut` and the nested `Request…` serializers
  - Routes `requests:request-list` (GET), `requests:request-preview` (POST), `requests:request-detail` (GET), `requests:request-history` (GET)
  - Query parameters of `GET requests`: `scope` (default `mine`), `status` and `type` (comma-separated), `employee` (public id), `department` (id), `year`, `from`, `to`, `on_behalf` and `has_override` (`1` or `0`), `ordering` (`-created_at` by default; `created_at`, `start_date`, `-start_date`), `page`, `page_size`
  - `POST requests/preview` accepts, beyond master 7.9, an optional `request` (the public id of the request being edited), so that a request does not collide with itself

- [ ] **Step 1: Write the failing tests**

`backend/apps/requests/tests/test_api_read.py`:

```python
import pytest
from django.urls import reverse

from apps.accounts.services import display_name
from apps.requests.tests.helpers import FRI, MON, TODAY, TUE, WED, days, decide, draft, hours, stored, submitted

pytestmark = pytest.mark.django_db

LIST = "requests:request-list"
PREVIEW = "requests:request-preview"


def english(user):
    user.language = "en"
    user.save(update_fields=["language"])
    return user


def url(name: str, request) -> str:
    return reverse(name, kwargs={"public_id": request.public_id})


# ------------------------------------------------------------------ lists


def test_my_requests_are_paginated_newest_first(world, client_for, clock):
    first = submitted(world, data=days(MON))
    clock.shift(60)
    second = draft(world, data=days(TUE))
    response = client_for(world.owner_user).get(reverse(LIST))
    assert response.status_code == 200
    body = response.json()
    assert (body["count"], body["next"], body["previous"]) == (2, None, None)
    assert [item["public_id"] for item in body["results"]] == [str(second.public_id), str(first.public_id)]
    item = body["results"][1]
    assert (item["start_date"], item["quantity"], item["status"], item["state"]["key"]) == (
        "2026-11-02", "1.00", "pending", "waiting_manager",
    )
    assert item["viewer"]["actions"] == ["edit", "withdraw", "attach"]
    assert "steps" not in item


def test_scopes_follow_roles(world, client_for):
    mine = submitted(world)
    client = client_for(world.manager_user)
    team = client.get(reverse(LIST), {"scope": "team"}).json()
    assert [item["public_id"] for item in team["results"]] == [str(mine.public_id)]
    assert team["results"][0]["viewer"] == {
        "relation": "approver", "actions": ["decide"], "step_id": team["results"][0]["viewer"]["step_id"],
    }
    assert client.get(reverse(LIST), {"scope": "all"}).status_code == 403
    assert client_for(world.owner_user).get(reverse(LIST), {"scope": "team"}).status_code == 403
    assert client_for(world.hr_user).get(reverse(LIST), {"scope": "all"}).json()["count"] == 1
    unknown = client_for(world.hr_user).get(reverse(LIST), {"scope": "everything"})
    assert (unknown.status_code, unknown.json()["code"]) == (400, "request.scope_invalid")


def test_filters_ordering_and_unreadable_values(world, client_for):
    annual = submitted(world, data=days(MON))
    remote = submitted(world, request_type=world.remote, data=days(WED))
    client = client_for(world.owner_user)

    def ids(**params):
        return [item["public_id"] for item in client.get(reverse(LIST), params).json()["results"]]

    assert ids(type="remote") == [str(remote.public_id)]
    assert ids(status="pending,approved", ordering="start_date") == [str(annual.public_id), str(remote.public_id)]
    assert ids(**{"from": "2026-11-04", "to": "2026-11-04"}) == [str(remote.public_id)]
    assert ids(year="2027") == []
    assert ids(on_behalf="1") == []
    bad = client.get(reverse(LIST), {"year": "soon"})
    assert (bad.status_code, bad.json()["code"]) == (400, "request.filter_invalid")
    assert client.get(reverse(LIST), {"employee": "not-a-uuid"}).status_code == 400


def test_hr_filters_by_employee_and_department(world, client_for):
    submitted(world, data=days(MON))
    elsewhere = submitted(world, employee=world.outsider, data=days(MON))
    client = client_for(world.hr_user)
    by_person = client.get(reverse(LIST), {"scope": "all", "employee": str(world.outsider.public_id)}).json()
    by_department = client.get(reverse(LIST), {"scope": "all", "department": world.dept_b.pk}).json()
    assert [item["public_id"] for item in by_person["results"]] == [str(elsewhere.public_id)]
    assert [item["public_id"] for item in by_department["results"]] == [str(elsewhere.public_id)]


# ------------------------------------------------------------------ detail and history


def test_detail_carries_steps_files_changes_and_context(world, client_for):
    request = submitted(world, data=days(MON, TUE, comment="Vacances"))
    response = client_for(english(world.manager_user)).get(url("requests:request-detail", request))
    assert response.status_code == 200
    body = response.json()
    assert (body["public_id"], body["version"], body["comment"]) == (str(request.public_id), 2, "Vacances")
    assert body["state"]["since"].startswith("2026-10-06T09:00:00")
    assert [(step["position"], step["rule"], step["status"], step["approvers"]) for step in body["steps"]] == [
        (1, "line_manager", "pending", [display_name(world.manager_user)]),
        (2, "hr_role", "waiting", ["HR"]),
    ]
    assert (body["attachments"], body["amendments"]) == ([], [])
    assert body["decision_context"] == {
        "balance": {"now": "10.00", "after": "8.00"},
        "teammates_away": [],
        "cap": None,
    }


def test_a_request_outside_reach_is_not_available(world, client_for):
    request = submitted(world)
    response = client_for(world.peer_user).get(url("requests:request-detail", request))
    assert response.status_code == 404
    assert response.json()["code"] == "core.not_found"
    assert client_for(world.peer_user).get(url("requests:request-history", request)).status_code == 404


def test_the_json_of_a_sick_leave_for_a_manager_has_no_medical_detail(world, client_for):
    request = submitted(world, request_type=world.sick, data=days(TODAY, comment="Grippe sévère"))
    decide(request, world.hr_user, "return", "Certificat illisible")
    client = client_for(world.manager_user)
    text = (
        client.get(url("requests:request-detail", request)).content
        + client.get(url("requests:request-history", request)).content
        + client.get(reverse(LIST), {"scope": "team"}).content
    ).decode().lower()
    assert "grippe" not in text
    assert "illisible" not in text
    body = client.get(url("requests:request-detail", request)).json()
    assert (body["comment"], body["comment_hidden"], body["certificate"]) == (None, True, None)


def test_history_is_oldest_first_with_summaries_in_the_reader_language(world, client_for, clock):
    request = submitted(world)
    clock.shift(60)
    decide(request, world.manager_user, comment="Bon repos")
    response = client_for(english(world.owner_user)).get(url("requests:request-history", request))
    assert response.status_code == 200
    rows = response.json()
    assert [row["action"] for row in rows] == ["request.created", "request.submitted", "step.decided"]
    assert [row["summary"] for row in rows] == ["Request created", "Request sent", "Decision recorded"]
    assert rows[2]["actor"] == display_name(world.manager_user)
    assert rows[2]["changes"]["decision"] == {"before": None, "after": "approve"}
    assert rows[0]["at"] < rows[2]["at"]


# ------------------------------------------------------------------ preview


def test_preview_computes_what_the_form_shows(world, client_for):
    payload = {"type": "annual", "start_date": "2026-11-06", "end_date": "2026-11-09"}
    response = client_for(english(world.owner_user)).post(reverse(PREVIEW), payload, format="json")
    assert response.status_code == 200
    body = response.json()
    assert body["quantity"] == "2.00"
    assert body["skipped_days"] == [
        {"date": "2026-11-07", "reason": "weekend"},
        {"date": "2026-11-08", "reason": "weekend"},
    ]
    assert body["chain"] == [
        {"position": 1, "rule": "line_manager", "mode": "approve", "approvers": [display_name(world.manager_user)]},
        {"position": 2, "rule": "hr_role", "mode": "approve", "approvers": ["HR"]},
    ]
    assert body["balance"] == {"now": "10.00", "on_start": "12.50", "after": "8.00"}
    assert body["usage"] == {"cap": None, "month_hours": None, "event_days_allowed": None}
    assert (body["certificate_due_at"], body["problems"]) == (None, [])


def test_preview_reports_every_problem_with_a_translated_detail(world, client_for):
    stored(world, request_type=world.remote, data=days(MON))
    payload = {"type": "annual", "start_date": "2026-11-02", "end_date": "2026-11-02"}
    body = client_for(english(world.owner_user)).post(reverse(PREVIEW), payload, format="json").json()
    (problem,) = body["problems"]
    assert (problem["field"], problem["code"]) == ("start_date", "request.overlap")
    assert problem["params"] == {"other": "02/11/2026"}
    assert problem["detail"].startswith("These dates overlap another of your requests (02/11/2026).")

    reversed_dates = {"type": "annual", "start_date": "2026-11-06", "end_date": "2026-11-02"}
    body = client_for(world.owner_user).post(reverse(PREVIEW), reversed_dates, format="json").json()
    assert (body["quantity"], body["skipped_days"]) == ("0.00", [])
    assert [problem["code"] for problem in body["problems"]] == ["request.end_before_start"]


def test_preview_shows_usage_per_type(world, client_for):
    client = client_for(world.owner_user)
    stored(world, request_type=world.remote, data=days(MON))
    remote = client.post(
        reverse(PREVIEW), {"type": "remote", "start_date": "2026-11-03", "end_date": "2026-11-03"}, format="json"
    ).json()
    assert remote["usage"]["cap"] == {"used": "1.00", "limit": "2.00", "period": "week"}
    assert remote["balance"] is None

    stored(world, request_type=world.permission, data=hours(FRI, "09:00", "10:30"))
    permission = client.post(
        reverse(PREVIEW),
        {"type": "permission", "start_date": "2026-11-05", "end_date": "2026-11-05", "start_time": "14:00", "end_time": "15:00"},
        format="json",
    ).json()
    assert (permission["quantity"], permission["usage"]["month_hours"]) == ("1.00", "1.50")

    wedding = client.post(
        reverse(PREVIEW),
        {"type": "exceptional", "start_date": "2026-11-16", "end_date": "2026-11-17", "exceptional_event": world.event.pk},
        format="json",
    ).json()
    assert wedding["usage"]["event_days_allowed"] == "3.00"

    ill = client.post(
        reverse(PREVIEW), {"type": "sick", "start_date": "2026-10-06", "end_date": "2026-10-06"}, format="json"
    ).json()
    assert ill["certificate_due_at"].startswith("2026-10-08T09:00:00")
    assert ill["chain"][0]["mode"] == "notify"


def test_preview_ignores_the_request_being_edited(world, client_for):
    request = submitted(world, data=days(MON))
    payload = {"type": "annual", "start_date": "2026-11-02", "end_date": "2026-11-03"}
    client = client_for(world.owner_user)
    colliding = client.post(reverse(PREVIEW), payload, format="json").json()
    assert [problem["code"] for problem in colliding["problems"]] == ["request.overlap"]
    editing = client.post(reverse(PREVIEW), {**payload, "request": str(request.public_id)}, format="json").json()
    assert editing["problems"] == []


def test_preview_for_someone_else_and_with_an_exception_is_for_hr(world, client_for, port):
    port.ok = False
    payload = {
        "type": "annual", "employee": str(world.owner.public_id),
        "start_date": "2026-11-02", "end_date": "2026-11-02", "override": True,
    }
    allowed = client_for(world.hr_user).post(reverse(PREVIEW), payload, format="json")
    assert (allowed.status_code, allowed.json()["problems"]) == (200, [])
    assert client_for(world.manager_user).post(reverse(PREVIEW), payload, format="json").status_code == 403
    unknown = client_for(world.owner_user).post(
        reverse(PREVIEW), {"type": "sabbatical", "start_date": "2026-11-02", "end_date": "2026-11-02"}, format="json"
    )
    assert (unknown.status_code, unknown.json()["code"]) == (400, "request.type_unknown")
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_api_read.py -v`
Expected: 13 failed with `NoReverseMatch: Reverse for 'request-list' not found`.

- [ ] **Step 3: Implement the preview service and the history selector**

`backend/apps/requests/services/preview.py`:

```python
"""Everything the request form shows before anything is saved (UI 5.3): computed, never asked."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.calendar import workdays
from apps.core.errors import NotAllowed, Problem
from apps.organisation import reach

from ..models import BalanceEffect, DocumentRule, ExceptionalEvent, Unit
from ..ports import BalancePreview, balance_port
from .chain import ChainRow, chain_preview
from .data import CENT, ZERO, RequestData, compute_quantity, leave_days
from .lifecycle import certificate_deadline_hours
from .validation import CapUsage, cap_usage, hours_in_month, validate


@dataclass(frozen=True)
class Preview:
    quantity: Decimal
    skipped_days: list[tuple[date, str]]
    chain: list[ChainRow]
    balance: BalancePreview | None
    cap: CapUsage | None
    month_hours: Decimal | None
    event_days_allowed: Decimal | None
    certificate_due_at: datetime | None
    problems: list[Problem]


def preview(
    *,
    actor,
    employee,
    request_type,
    data: RequestData,
    override: bool = False,
    ignoring_request_id: int | None = None,
) -> Preview:
    """Quantity, skipped days, who will decide, balance, usage and every problem, for a form not yet saved."""
    me = reach.employee_of(actor)
    own = me is not None and me.pk == employee.pk
    is_hr = has_role(actor, Role.HR)
    if not own and not is_hr:
        raise NotAllowed("core.not_allowed")
    if override and not is_hr:
        raise NotAllowed("core.not_allowed")
    if override and own:
        raise NotAllowed("request.own_request")

    problems = validate(
        employee=employee,
        request_type=request_type,
        data=data,
        override=override,
        ignoring_request_id=ignoring_request_id,
    )
    ordered = data.end_date >= data.start_date
    by_day = request_type.unit == Unit.DAY
    days = leave_days(request_type, data) if ordered else {}
    quantity = compute_quantity(request_type, data) if ordered else ZERO.quantize(CENT)
    skipped = workdays.skipped_days(data.start_date, data.end_date) if ordered and by_day else []

    balance = None
    if request_type.balance_effect == BalanceEffect.DEDUCTS_ANNUAL and days:
        balance = balance_port().preview(
            employee_id=employee.pk, new_days=days, ignoring_request_id=ignoring_request_id
        )

    month_hours = None
    if by_day:
        portions = days
    else:
        portions = {data.start_date: quantity} if quantity else {}
        month_hours = hours_in_month(
            employee=employee, request_type=request_type, day=data.start_date, ignoring_request_id=ignoring_request_id
        )
    usages = cap_usage(
        employee=employee, request_type=request_type, portions=portions, ignoring_request_id=ignoring_request_id
    )
    cap = max(usages, key=lambda usage: usage.used + usage.adding) if usages else None

    event_days_allowed = None
    if request_type.uses_events and data.exceptional_event_id is not None:
        event = ExceptionalEvent.objects.filter(pk=data.exceptional_event_id, is_active=True).first()
        event_days_allowed = event.days_allowed if event is not None else None

    certificate_due_at = None
    if request_type.document_rule == DocumentRule.REQUIRED_WITHIN_DEADLINE:
        certificate_due_at = timezone.now() + timedelta(hours=certificate_deadline_hours(request_type))

    return Preview(
        quantity=quantity,
        skipped_days=skipped,
        chain=chain_preview(request_type=request_type, employee=employee),
        balance=balance,
        cap=cap,
        month_hours=month_hours,
        event_days_allowed=event_days_allowed,
        certificate_due_at=certificate_due_at,
        problems=problems,
    )
```

Add to `backend/apps/requests/services/__init__.py`:

```python
from .preview import Preview, preview
```

and add both names to `__all__`.

Add these imports to `backend/apps/requests/selectors.py`, in the import block:

```python
from apps.accounts.services import display_name
from apps.audit import selectors as audit_selectors
from apps.core.i18n import all_messages, translate
```

and append:

```python
# ------------------------------------------------------------------ history


def history(request) -> list[dict]:
    """The audit events of a request, oldest first (REQ-17).

    Nothing sensitive is ever written to the trail (AUD-05), so the same history is safe for every
    viewer who may see the request.
    """
    known = all_messages()
    rows: list[dict] = []
    events = audit_selectors.events_for_object("request", str(request.public_id)).order_by("at", "pk")
    for event in events:
        code = "request.history_" + event.action.replace(".", "_")
        rows.append(
            {
                "at": event.at,
                "actor": display_name(event.actor) if event.actor_id else None,
                "action": event.action,
                "summary": translate(code) if code in known else event.action,
                "changes": event.changes or {},
            }
        )
    return rows
```

Add `from apps.core.i18n import translate` to the imports of `backend/apps/requests/representation.py` and append:

```python
# ------------------------------------------------------------------ preview


def problem_body(problem) -> dict:
    return {
        "field": problem.field,
        "code": problem.code,
        "detail": translate(problem.code, **problem.params),
        "params": dict(problem.params),
    }


def preview_body(preview) -> dict:
    """The preview of master 7.9, with Python values."""
    balance = preview.balance
    cap = preview.cap
    return {
        "quantity": preview.quantity,
        "skipped_days": [{"date": day, "reason": reason} for day, reason in preview.skipped_days],
        "chain": preview.chain,
        "balance": {"now": balance.now, "on_start": balance.on_start, "after": balance.after} if balance else None,
        "usage": {
            "cap": {"used": cap.used, "limit": cap.limit, "period": cap.period} if cap else None,
            "month_hours": preview.month_hours,
            "event_days_allowed": preview.event_days_allowed,
        },
        "certificate_due_at": preview.certificate_due_at,
        "problems": [problem_body(problem) for problem in preview.problems],
    }
```

- [ ] **Step 4: Describe the shapes for the API**

In `backend/apps/requests/api/serializers.py`, extend the models import to:

```python
from ..models import (
    AmendmentKind,
    AmendmentStatus,
    ApproverRule,
    CalendarLabel,
    CapPeriod,
    ChainStep,
    Channel,
    ExceptionalEvent,
    RequestStatus,
    RequestType,
    StepMode,
    StepStatus,
    Unit,
)
```

and append:

```python
# ---------------------------------------------------------------- requests: output (master 7.9)

STATE_KEYS = [
    "draft", "waiting_manager", "waiting_hr", "waiting_person",
    "returned", "approved", "rejected", "withdrawn", "cancelled",
]
RELATIONS = ["owner", "approver", "team", "hr", "overview"]
ACTIONS = [
    "edit", "submit", "discard", "withdraw", "amend", "withdraw_amendment", "attach",
    "decide", "record_on_behalf", "reassign", "correct", "cancel", "reclassify",
]
CERTIFICATE_STATUSES = ["not_needed", "attached", "due", "overdue", "missing"]
SKIP_REASONS = ["weekend", "holiday"]


def _quantity(**options) -> serializers.DecimalField:
    return serializers.DecimalField(max_digits=9, decimal_places=2, **options)


class RequestEmployeeOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    name = serializers.CharField()
    department = serializers.CharField()


class RequestTypeBrief(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()
    unit = serializers.ChoiceField(choices=Unit.choices)
    calendar_label = serializers.ChoiceField(choices=CalendarLabel.choices)


class RequestEventBrief(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class RequestStateOut(serializers.Serializer):
    key = serializers.ChoiceField(choices=STATE_KEYS)
    waiting_on = serializers.ListField(child=serializers.CharField())
    last_actor = serializers.CharField(allow_null=True)
    note = serializers.CharField(allow_null=True)
    since = serializers.DateTimeField(allow_null=True)


class RequestCertificateOut(serializers.Serializer):
    status = serializers.ChoiceField(choices=CERTIFICATE_STATUSES)
    due_at = serializers.DateTimeField(allow_null=True)


class RequestAmendmentBrief(serializers.Serializer):
    public_id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=AmendmentKind.choices)
    status = serializers.ChoiceField(choices=AmendmentStatus.choices)
    state_key = serializers.ChoiceField(choices=STATE_KEYS)
    waiting_on = serializers.ListField(child=serializers.CharField())


class RequestViewerOut(serializers.Serializer):
    relation = serializers.ChoiceField(choices=RELATIONS)
    actions = serializers.ListField(child=serializers.ChoiceField(choices=ACTIONS))
    step_id = serializers.IntegerField(allow_null=True)


class RequestOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    version = serializers.IntegerField()
    employee = RequestEmployeeOut()
    type = RequestTypeBrief()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    starts_at_midday = serializers.BooleanField()
    ends_at_midday = serializers.BooleanField()
    start_time = serializers.TimeField(allow_null=True)
    end_time = serializers.TimeField(allow_null=True)
    quantity = _quantity()
    event = RequestEventBrief(allow_null=True)
    comment = serializers.CharField(allow_null=True, allow_blank=True)
    comment_hidden = serializers.BooleanField()
    status = serializers.ChoiceField(choices=RequestStatus.choices)
    state = RequestStateOut()
    certificate = RequestCertificateOut(allow_null=True)
    amendment = RequestAmendmentBrief(allow_null=True)
    has_override = serializers.BooleanField()
    created_by_hr = serializers.BooleanField()
    viewer = RequestViewerOut()
    submitted_at = serializers.DateTimeField(allow_null=True)
    decided_at = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField()


class RequestStepOut(serializers.Serializer):
    id = serializers.IntegerField()
    round = serializers.IntegerField()
    position = serializers.IntegerField()
    rule = serializers.ChoiceField(choices=ApproverRule.choices)
    mode = serializers.ChoiceField(choices=StepMode.choices)
    status = serializers.ChoiceField(choices=StepStatus.choices)
    approvers = serializers.ListField(child=serializers.CharField())
    decided_by = serializers.CharField(allow_null=True)
    decided_at = serializers.DateTimeField(allow_null=True)
    recorded_by = serializers.CharField(allow_null=True)
    channel = serializers.ChoiceField(choices=Channel.choices, allow_null=True)
    comment = serializers.CharField(allow_null=True)
    amendment_public_id = serializers.UUIDField(allow_null=True)


class RequestAttachmentOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    kind = serializers.CharField()  # medical, proof or scanned_form: the kinds of apps.files
    name = serializers.CharField()
    size = serializers.IntegerField()
    uploaded_by = serializers.CharField()
    uploaded_at = serializers.DateTimeField()


class RequestAmendmentOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=AmendmentKind.choices)
    status = serializers.ChoiceField(choices=AmendmentStatus.choices)
    reason = serializers.CharField(allow_null=True)
    new_start_date = serializers.DateField(allow_null=True)
    new_end_date = serializers.DateField(allow_null=True)
    new_quantity = _quantity(allow_null=True)
    created_at = serializers.DateTimeField()
    decided_at = serializers.DateTimeField(allow_null=True)


class BalanceNowAfterOut(serializers.Serializer):
    now = _quantity()
    after = _quantity()


class TeammateAwayOut(serializers.Serializer):
    name = serializers.CharField()
    label = serializers.ChoiceField(choices=CalendarLabel.choices)
    start_date = serializers.DateField()
    end_date = serializers.DateField()


class CapUsedOut(serializers.Serializer):
    used = _quantity()
    limit = _quantity()


class DecisionContextOut(serializers.Serializer):
    balance = BalanceNowAfterOut(allow_null=True)
    teammates_away = TeammateAwayOut(many=True)
    cap = CapUsedOut(allow_null=True)


class RequestDetailOut(RequestOut):
    steps = RequestStepOut(many=True)
    attachments = RequestAttachmentOut(many=True)
    amendments = RequestAmendmentOut(many=True)
    decision_context = DecisionContextOut(allow_null=True)


class HistoryItemOut(serializers.Serializer):
    at = serializers.DateTimeField()
    actor = serializers.CharField(allow_null=True)
    action = serializers.CharField()
    summary = serializers.CharField()
    changes = serializers.JSONField()


# ---------------------------------------------------------------- requests: preview


class RequestDataIn(serializers.Serializer):
    """The fields a person fills in. `exceptional_event` is the id of an exceptional event."""

    start_date = serializers.DateField()
    end_date = serializers.DateField()
    starts_at_midday = serializers.BooleanField(required=False, default=False)
    ends_at_midday = serializers.BooleanField(required=False, default=False)
    start_time = serializers.TimeField(required=False, allow_null=True, default=None)
    end_time = serializers.TimeField(required=False, allow_null=True, default=None)
    exceptional_event = serializers.IntegerField(required=False, allow_null=True, default=None)


class PreviewIn(RequestDataIn):
    type = serializers.SlugField()
    employee = serializers.UUIDField(required=False, allow_null=True, default=None)
    request = serializers.UUIDField(required=False, allow_null=True, default=None)
    override = serializers.BooleanField(required=False, default=False)


class SkippedDayOut(serializers.Serializer):
    date = serializers.DateField()
    reason = serializers.ChoiceField(choices=SKIP_REASONS)


class BalancePreviewOut(serializers.Serializer):
    now = _quantity()
    on_start = _quantity()
    after = _quantity()


class CapUsageOut(serializers.Serializer):
    used = _quantity()
    limit = _quantity()
    period = serializers.ChoiceField(choices=CapPeriod.choices)


class UsageOut(serializers.Serializer):
    cap = CapUsageOut(allow_null=True)
    month_hours = _quantity(allow_null=True)
    event_days_allowed = _quantity(allow_null=True)


class ProblemOut(serializers.Serializer):
    field = serializers.CharField(allow_null=True)
    code = serializers.CharField()
    detail = serializers.CharField()
    params = serializers.JSONField()


class PreviewOut(serializers.Serializer):
    quantity = _quantity()
    skipped_days = SkippedDayOut(many=True)
    chain = ChainRowOut(many=True)
    balance = BalancePreviewOut(allow_null=True)
    usage = UsageOut()
    certificate_due_at = serializers.DateTimeField(allow_null=True)
    problems = ProblemOut(many=True)
```

- [ ] **Step 5: Implement the views**

In `backend/apps/requests/api/views.py`, replace the import block with:

```python
import uuid
from datetime import date

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role, has_role
from apps.core.errors import DomainError, NotAllowed, NotFound
from apps.core.pagination import PAGE_PARAMETERS, DefaultPagination, paginated
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors

from .. import selectors, services
from ..models import ApproverRule
from ..representation import preview_body, represent, represent_detail, viewer_for
from ..services import RequestData
from .serializers import (
    ChainRowOut,
    ChainStepOut,
    ChainStepsIn,
    ExceptionalEventIn,
    ExceptionalEventOut,
    HistoryItemOut,
    PreviewIn,
    PreviewOut,
    RequestDetailOut,
    RequestOut,
    RequestTypeIn,
    RequestTypeOut,
)

STAFF = {Role.EMPLOYEE, Role.HR, Role.EXEC}
HR_ONLY = {Role.HR}
HR_AND_EXEC = {Role.HR, Role.EXEC}
AUTHORS = {Role.EMPLOYEE, Role.HR}
ORDERINGS = {
    "created_at": ("created_at", "id"),
    "-created_at": ("-created_at", "-id"),
    "start_date": ("start_date", "id"),
    "-start_date": ("-start_date", "-id"),
}
```

Append to the end of the file:

```python
# ---------------------------------------------------------------- requests: helpers


def _csv(value: str | None) -> list[str] | None:
    return [part.strip() for part in value.split(",") if part.strip()] if value else None


def _flag(value: str | None) -> bool | None:
    if value in (None, ""):
        return None
    if value in ("1", "true"):
        return True
    if value in ("0", "false"):
        return False
    raise ValueError(value)


def _list_filters(params) -> dict:
    """Read the filters of a list. A value that cannot be read is one problem, whatever the filter."""
    try:
        employee = params.get("employee") or None
        if employee:
            uuid.UUID(employee)
        return {
            "statuses": _csv(params.get("status")),
            "type_codes": _csv(params.get("type")),
            "employee_public_id": employee,
            "department_id": int(params["department"]) if params.get("department") else None,
            "year": int(params["year"]) if params.get("year") else None,
            "date_from": date.fromisoformat(params["from"]) if params.get("from") else None,
            "date_to": date.fromisoformat(params["to"]) if params.get("to") else None,
            "on_behalf": _flag(params.get("on_behalf")),
            "has_override": _flag(params.get("has_override")),
        }
    except ValueError:
        raise DomainError("request.filter_invalid") from None


def _data_from(values: dict, *, comment: str = "") -> RequestData:
    return RequestData(
        start_date=values["start_date"],
        end_date=values["end_date"],
        starts_at_midday=values["starts_at_midday"],
        ends_at_midday=values["ends_at_midday"],
        start_time=values["start_time"],
        end_time=values["end_time"],
        exceptional_event_id=values["exceptional_event"],
        comment=comment,
    )


def _target_employee(user, public_id):
    """The employee a request is for: the one named (reach decides who may name whom), else the caller."""
    if public_id:
        return organisation_selectors.get_employee_for(user, str(public_id))
    employee = reach.employee_of(user)
    if employee is None:
        raise NotAllowed("request.actor_without_record")
    return employee


def _detail(user, public_id, status: int = 200) -> Response:
    """The current detail of a request, read again after any change so that it is never stale."""
    found = selectors.get_request_for(user, str(public_id))
    return Response(RequestDetailOut(represent_detail(found, viewer_for(user))).data, status=status)


LIST_PARAMETERS = [
    OpenApiParameter("scope", str, enum=["mine", "team", "all", "decided"]),
    OpenApiParameter("status", str, description="Comma-separated statuses"),
    OpenApiParameter("type", str, description="Comma-separated type codes"),
    OpenApiParameter("employee", str, description="Employee public id"),
    OpenApiParameter("department", int),
    OpenApiParameter("year", int),
    OpenApiParameter("from", str, description="ISO date"),
    OpenApiParameter("to", str, description="ISO date"),
    OpenApiParameter("on_behalf", str, enum=["1", "0"]),
    OpenApiParameter("has_override", str, enum=["1", "0"]),
    OpenApiParameter("ordering", str, enum=sorted(ORDERINGS)),
    *PAGE_PARAMETERS,
]


# ---------------------------------------------------------------- requests: read


class RequestListView(APIView):
    http_method_names = ["get"]
    access = {"GET": STAFF}

    @extend_schema(operation_id="requests_list", parameters=LIST_PARAMETERS, responses=paginated(RequestOut))
    def get(self, request):
        params = request.query_params
        found = selectors.requests_for(request.user, params.get("scope") or "mine")
        found = selectors.filter_requests(found, viewer=request.user, **_list_filters(params))
        found = found.order_by(*ORDERINGS.get(params.get("ordering") or "", ORDERINGS["-created_at"]))
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(found, request, view=self)
        viewer = viewer_for(request.user)
        return paginator.get_paginated_response(RequestOut([represent(item, viewer) for item in page], many=True).data)


class RequestPreviewView(APIView):
    http_method_names = ["post"]
    access = {"POST": AUTHORS}

    @extend_schema(operation_id="requests_preview", request=PreviewIn, responses=PreviewOut)
    def post(self, request):
        data = PreviewIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        request_type = selectors.get_type_by_code(values["type"])
        employee = _target_employee(request.user, values["employee"])
        ignoring = None
        if values["request"]:
            ignoring = selectors.get_request_for(request.user, str(values["request"])).pk
        result = services.preview(
            actor=request.user,
            employee=employee,
            request_type=request_type,
            data=_data_from(values),
            override=values["override"],
            ignoring_request_id=ignoring,
        )
        return Response(PreviewOut(preview_body(result)).data)


class RequestDetailView(APIView):
    http_method_names = ["get"]
    access = {"GET": STAFF}

    @extend_schema(operation_id="requests_detail", responses=RequestDetailOut)
    def get(self, request, public_id):
        return _detail(request.user, public_id)


class RequestHistoryView(APIView):
    http_method_names = ["get"]
    access = {"GET": STAFF}

    @extend_schema(operation_id="requests_history", responses=HistoryItemOut(many=True))
    def get(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        return Response(HistoryItemOut(selectors.history(found), many=True).data)
```

Add to `urlpatterns` in `backend/apps/requests/api/urls.py`:

```python
    path("requests", views.RequestListView.as_view(), name="request-list"),
    path("requests/preview", views.RequestPreviewView.as_view(), name="request-preview"),
    path("requests/<uuid:public_id>", views.RequestDetailView.as_view(), name="request-detail"),
    path("requests/<uuid:public_id>/history", views.RequestHistoryView.as_view(), name="request-history"),
```

- [ ] **Step 6: Add the permission-matrix cases**

In `backend/apps/requests/tests/matrix.py`, replace the first line (`from tests.matrix import Case, P, only`) with:

```python
from django.utils import timezone

from apps.calendar import workdays
from apps.requests import services
from apps.requests.models import RequestStatus, RequestStep, StepStatus
from apps.requests.services import RequestData
from tests.matrix import Case, P, only
```

Insert after `STAFF = ...`:

```python
# The matrix runs on the real clock, so its requests are placed on working days in the weeks to come.
# They use remote work and sick leave: neither depends on a leave balance.


def _day(offset: int):
    return workdays.add_working_days(timezone.localdate(), offset)


def _once(world, name: str, build):
    key = f"_requests_matrix_{name}"
    if getattr(world, key, None) is None:
        setattr(world, key, build())
    return getattr(world, key)


def _remote(world, offset: int, *, send: bool = True):
    request = services.create_draft(
        actor=world.owner_user,
        employee=world.owner,
        request_type=world.remote,
        data=RequestData(start_date=_day(offset), end_date=_day(offset)),
    )
    return services.submit(actor=world.owner_user, request=request) if send else request


def _through_the_chain(request):
    while request.status == RequestStatus.PENDING:
        step = RequestStep.objects.get(request=request, amendment=None, status=StepStatus.PENDING)
        approver = services.resolve_approvers(step)[0]
        request = services.decide_step(
            actor=approver, step=step, decision="approve", expected_version=request.version
        )
    return request


def pending(world):
    """A request of the owner, waiting for the manager."""
    return _once(world, "pending", lambda: _remote(world, 10))


def a_draft(world):
    return _once(world, "draft", lambda: _remote(world, 11, send=False))


def granted(world):
    """An approved request of the owner that has not started."""
    return _once(world, "granted", lambda: _through_the_chain(_remote(world, 15)))


def sick_leave(world):
    """A sick leave of the peer, waiting for HR, with a comment nobody else may read."""

    def build():
        today = timezone.localdate()
        request = services.create_draft(
            actor=world.peer_user,
            employee=world.peer,
            request_type=world.sick,
            data=RequestData(start_date=today, end_date=today, comment="matrix-medical-secret"),
        )
        return services.submit(actor=world.peer_user, request=request)

    return _once(world, "sick", build)


def _id(build):
    return lambda world: {"public_id": build(world).public_id}


VISIBLE_TO_ITS_CIRCLE = only(P.OWNER, P.MANAGER, P.HR, P.EXEC, hide=(P.PEER, P.OTHER_MANAGER, P.OUTSIDER))
```

Append before the final `CASES = ...` line, and change that line as shown:

```python
READ_CASES = [
    Case("requests:request-list", "GET", only(*STAFF), label="mine"),
    Case(
        "requests:request-list",
        "GET",
        only(P.MANAGER, P.OTHER_MANAGER, P.EXEC),
        query=lambda w: {"scope": "team"},
        label="team",
    ),
    Case("requests:request-list", "GET", only(P.HR, P.EXEC), query=lambda w: {"scope": "all"}, label="all"),
    Case(
        "requests:request-preview",
        "POST",
        only(*STAFF),
        body=lambda w: {"type": "remote", "start_date": str(_day(30)), "end_date": str(_day(30))},
    ),
    Case("requests:request-detail", "GET", VISIBLE_TO_ITS_CIRCLE, kwargs=_id(pending)),
    Case(
        "requests:request-detail",
        "GET",
        only(P.OWNER, hide=(P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC)),
        kwargs=_id(a_draft),
        label="draft",
    ),
    Case("requests:request-history", "GET", VISIBLE_TO_ITS_CIRCLE, kwargs=_id(pending)),
]

CASES = CONFIG_CASES + READ_CASES
```

- [ ] **Step 7: Name the new choice sets and regenerate the API description**

In `backend/config/settings.py`, add to `SPECTACULAR_SETTINGS["ENUM_NAME_OVERRIDES"]`:

```python
        "RequestStateKeyEnum": "apps.requests.api.serializers.STATE_KEYS",
        "ViewerRelationEnum": "apps.requests.api.serializers.RELATIONS",
        "RequestActionEnum": "apps.requests.api.serializers.ACTIONS",
        "CertificateStatusEnum": "apps.requests.api.serializers.CERTIFICATE_STATUSES",
        "SkipReasonEnum": "apps.requests.api.serializers.SKIP_REASONS",
```

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: no line starting with `Warning`, then `backend/openapi.yaml is up to date.` The components `RequestOut`, `RequestDetailOut`, `PaginatedRequestOut` and `PreviewOut` are in the file.

- [ ] **Step 8: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_api_read.py tests/test_permission_matrix.py tests/test_openapi.py -v`
Expected: 13 passed in `test_api_read.py`; the matrix passes with the read cases; the description check passes.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/requests backend/config/settings.py backend/openapi.yaml
git add frontend/src/api/schema.d.ts 2>/dev/null || true
git commit -m "feat(requests): read API with scopes, filters, detail, history and the form preview"
```

---

### Task 19: Write API: create, edit, send, withdraw, files, amendments, HR actions

**Files:**
- Modify: `backend/apps/requests/selectors.py` (append `get_amendment_for`)
- Modify: `backend/apps/requests/api/serializers.py` (append the input serializers)
- Modify: `backend/apps/requests/api/views.py` (replace two views, append nine)
- Modify: `backend/apps/requests/api/urls.py`
- Modify: `backend/apps/requests/tests/matrix.py`
- Modify: `backend/openapi.yaml` (regenerated)
- Test: `backend/apps/requests/tests/test_api_write.py`

**Interfaces:**
- Consumes: every service of Tasks 6 to 16; `require_editor`, `require_requester` (Task 6), `require_attacher` (Task 12); `_detail`, `_data_from`, `_target_employee` (Task 18); `attachment_body`, `attachment_bodies`, `amendment_bodies` (Task 17); `apps.accounts.tests.world.make_user` (tests).
- Produces:
  - `apps.requests.selectors.get_amendment_for(user, public_id) -> Amendment` (raises `NotFound` when the request is outside reach)
  - Routes and methods, with the bodies of master 7.9: `requests:request-list` (POST), `requests:request-detail` (PATCH, DELETE), `requests:request-submit`, `requests:request-withdraw`, `requests:request-attachments` (GET, POST), `requests:request-amendments` (GET, POST), `requests:amendment-withdraw`, `requests:request-correct`, `requests:request-cancel`, `requests:request-reclassify`
  - Every action answers with `RequestDetailOut`, read again after the change; `DELETE` answers 204; `POST …/attachments` answers 201 with the attachment item
  - `PATCH requests/{public_id}` merges the fields it receives into the request and needs `version`; it does not accept `override_reason`, which is fixed when HR creates the request
  - A view checks who may act before it reads the body, so a caller who may not act gets 403 or 404 whatever they send

- [ ] **Step 1: Write the failing tests**

`backend/apps/requests/tests/test_api_write.py`:

```python
import pytest
from django.urls import reverse

from apps.accounts.tests.world import make_user
from apps.requests.tests.helpers import (
    MON, TODAY, TUE, WED, approved, days, draft, pdf, stored, submitted,
)

pytestmark = pytest.mark.django_db

LIST = "requests:request-list"


def url(name: str, request) -> str:
    return reverse(name, kwargs={"public_id": request.public_id})


def english(user):
    user.language = "en"
    user.save(update_fields=["language"])
    return user


def test_an_employee_creates_edits_sends_and_withdraws(world, client_for):
    client = client_for(world.owner_user)
    created = client.post(
        reverse(LIST),
        {"type": "annual", "start_date": "2026-11-02", "end_date": "2026-11-03", "comment": "Vacances"},
        format="json",
    )
    assert created.status_code == 201
    body = created.json()
    assert (body["status"], body["quantity"], body["version"]) == ("draft", "2.00", 1)
    assert body["viewer"]["actions"] == ["edit", "submit", "discard", "attach"]
    detail = reverse("requests:request-detail", kwargs={"public_id": body["public_id"]})

    edited = client.patch(detail, {"version": 1, "end_date": "2026-11-04", "ends_at_midday": True}, format="json")
    assert edited.status_code == 200
    assert (edited.json()["quantity"], edited.json()["version"], edited.json()["comment"]) == ("2.50", 2, "Vacances")

    sent = client.post(
        reverse("requests:request-submit", kwargs={"public_id": body["public_id"]}), {"version": 2}, format="json"
    )
    assert (sent.status_code, sent.json()["status"], sent.json()["state"]["key"]) == (200, "pending", "waiting_manager")

    withdrawn = client.post(
        reverse("requests:request-withdraw", kwargs={"public_id": body["public_id"]}), {}, format="json"
    )
    assert (withdrawn.status_code, withdrawn.json()["status"]) == (200, "withdrawn")


def test_a_stale_version_answers_409_as_a_problem_document(world, client_for):
    request = draft(world)
    response = client_for(english(world.owner_user)).patch(
        url("requests:request-detail", request), {"version": 9, "comment": "Trop tard"}, format="json"
    )
    assert response.status_code == 409
    assert response["Content-Type"].startswith("application/problem+json")
    body = response.json()
    assert (body["status"], body["code"], body["type"]) == (
        409, "request.already_processed", "urn:iris-hr:problem:request.already_processed",
    )
    assert body["detail"].startswith("Someone else has already acted on this request.")
    assert body["request_id"]


def test_sending_a_request_that_breaks_a_rule_names_the_field_and_the_other_request(world, client_for):
    stored(world, request_type=world.remote, data=days(MON))
    request = draft(world, data=days(MON))
    response = client_for(english(world.owner_user)).post(
        url("requests:request-submit", request), {"version": 1}, format="json"
    )
    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "request.overlap"
    (problem,) = body["errors"]
    assert (problem["field"], problem["code"], problem["params"]) == (
        "start_date", "request.overlap", {"other": "02/11/2026"},
    )
    assert "02/11/2026" in problem["detail"]


def test_a_draft_is_discarded(world, client_for):
    request = draft(world)
    client = client_for(world.owner_user)
    assert client.delete(url("requests:request-detail", request)).status_code == 204
    assert client.get(url("requests:request-detail", request)).status_code == 404


def test_only_hr_creates_for_someone_else(world, client_for):
    payload = {
        "type": "annual",
        "employee": str(world.owner.public_id),
        "start_date": "2026-11-02",
        "end_date": "2026-11-02",
        "override_reason": "Accord de la direction",
    }
    assert client_for(world.manager_user).post(reverse(LIST), payload, format="json").status_code == 403
    assert client_for(world.peer_user).post(reverse(LIST), payload, format="json").status_code == 404
    created = client_for(world.hr_user).post(reverse(LIST), payload, format="json")
    assert created.status_code == 201
    body = created.json()
    assert (body["employee"]["public_id"], body["has_override"], body["created_by_hr"]) == (
        str(world.owner.public_id), True, True,
    )


def test_an_account_without_an_employee_record_has_nobody_to_ask_for(world, client_for):
    external = make_user("rh.externe@impactrisks.com", full_name="RH Externe", roles=["hr"])
    response = client_for(external).post(
        reverse(LIST), {"type": "annual", "start_date": "2026-11-02", "end_date": "2026-11-02"}, format="json"
    )
    assert (response.status_code, response.json()["code"]) == (403, "request.actor_without_record")


def test_files_are_uploaded_and_listed_for_those_who_may_see_them(world, client_for):
    request = submitted(world, request_type=world.sick, data=days(TODAY, comment="Grippe"))
    files = url("requests:request-attachments", request)

    uploaded = client_for(world.owner_user).post(files, {"file": pdf("certificat.pdf")}, format="multipart")
    assert uploaded.status_code == 201
    assert (uploaded.json()["kind"], uploaded.json()["name"]) == ("medical", "certificat.pdf")

    assert [item["name"] for item in client_for(world.hr_user).get(files).json()] == ["certificat.pdf"]
    assert client_for(world.manager_user).get(files).json() == []
    assert client_for(world.manager_user).post(files, {"file": pdf()}, format="multipart").status_code == 403
    assert client_for(world.owner_user).post(files, {}, format="multipart").status_code == 400


def test_a_change_is_asked_listed_and_withdrawn(world, client_for):
    request = approved(world, data=days(MON, TUE))
    client = client_for(world.owner_user)
    changes = url("requests:request-amendments", request)

    opened = client.post(
        changes, {"kind": "change", "start_date": "2026-11-04", "end_date": "2026-11-05", "reason": "Décalage"},
        format="json",
    )
    assert opened.status_code == 201
    body = opened.json()
    assert (body["status"], body["start_date"], body["amendment"]["status"]) == ("approved", "2026-11-02", "pending")
    assert body["viewer"]["actions"] == ["withdraw_amendment"]
    amendment_id = body["amendment"]["public_id"]

    listed = client_for(world.manager_user).get(changes)
    assert [(item["kind"], item["new_start_date"], item["reason"]) for item in listed.json()] == [
        ("change", "2026-11-04", "Décalage")
    ]
    assert client_for(world.manager_user).post(changes, {"kind": "cancel", "reason": "Non"}, format="json").status_code == 403

    again = client.post(changes, {"kind": "cancel", "reason": "Annulé"}, format="json")
    assert (again.status_code, again.json()["code"]) == (409, "request.amendment_open")

    withdrawn = client.post(
        reverse("requests:amendment-withdraw", kwargs={"public_id": amendment_id}), {}, format="json"
    )
    assert withdrawn.status_code == 200
    assert (withdrawn.json()["amendment"], withdrawn.json()["amendments"][0]["status"]) == (None, "withdrawn")

    no_dates = client.post(changes, {"kind": "change", "reason": "Sans dates"}, format="json")
    assert (no_dates.status_code, no_dates.json()["code"]) == (400, "request.dates_required")


def test_hr_corrects_and_cancels(world, client_for):
    request = approved(world, data=days(MON, WED))
    client = client_for(world.hr_user)

    corrected = client.post(
        url("requests:request-correct", request),
        {"start_date": "2026-11-02", "end_date": "2026-11-03", "reason": "Retour anticipé"},
        format="json",
    )
    assert (corrected.status_code, corrected.json()["end_date"], corrected.json()["quantity"]) == (
        200, "2026-11-03", "2.00",
    )

    no_reason = client.post(url("requests:request-cancel", request), {}, format="json")
    assert (no_reason.status_code, no_reason.json()["code"]) == (400, "request.reason_required")
    assert no_reason.json()["errors"][0]["field"] == "reason"

    cancelled = client.post(url("requests:request-cancel", request), {"reason": "Départ"}, format="json")
    assert (cancelled.status_code, cancelled.json()["status"]) == (200, "cancelled")

    assert client_for(world.manager_user).post(
        url("requests:request-cancel", request), {"reason": "Non"}, format="json"
    ).status_code == 403


def test_hr_counts_a_sick_leave_as_annual_leave_but_never_its_own(world, client_for):
    request = submitted(world, request_type=world.sick, data=days(TODAY))
    done = client_for(world.hr_user).post(url("requests:request-reclassify", request), {}, format="json")
    assert done.status_code == 200
    assert (done.json()["type"]["code"], done.json()["status"]) == ("annual", "approved")

    own = submitted(world, employee=world.hr, actor=world.hr_user, request_type=world.sick, data=days(TODAY))
    refused = client_for(world.hr_user).post(url("requests:request-reclassify", own), {}, format="json")
    assert (refused.status_code, refused.json()["code"]) == (403, "request.own_request")
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_api_write.py -v`
Expected: 10 failed. The first fails with status 405 on `POST /api/v1/requests`; the others with `NoReverseMatch`.

- [ ] **Step 3: Add the selector and the input serializers**

Add `Amendment` to the models import of `backend/apps/requests/selectors.py` and append:

```python
def get_amendment_for(user, public_id) -> "Amendment":
    amendment = Amendment.objects.select_related("request", "request__request_type").filter(public_id=public_id).first()
    if amendment is None or not can_see(user, amendment.request):
        raise NotFound("core.not_found")
    return amendment
```

Append to `backend/apps/requests/api/serializers.py`:

```python
# ---------------------------------------------------------------- requests: input

_REASON = {"required": False, "allow_blank": True, "default": "", "max_length": 2000}


class RequestIn(RequestDataIn):
    type = serializers.SlugField()
    employee = serializers.UUIDField(required=False, allow_null=True, default=None)
    comment = serializers.CharField(required=False, allow_blank=True, default="", max_length=4000)
    override_reason = serializers.CharField(**_REASON)


class RequestPatchIn(serializers.Serializer):
    """Only the fields that are sent are changed. `version` is the version the caller last saw."""

    version = serializers.IntegerField(min_value=1)
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)
    starts_at_midday = serializers.BooleanField(required=False)
    ends_at_midday = serializers.BooleanField(required=False)
    start_time = serializers.TimeField(required=False, allow_null=True)
    end_time = serializers.TimeField(required=False, allow_null=True)
    exceptional_event = serializers.IntegerField(required=False, allow_null=True)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=4000)


class VersionIn(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)


class FileIn(serializers.Serializer):
    file = serializers.FileField()


class AmendmentIn(serializers.Serializer):
    kind = serializers.ChoiceField(choices=AmendmentKind.choices)
    start_date = serializers.DateField(required=False, allow_null=True, default=None)
    end_date = serializers.DateField(required=False, allow_null=True, default=None)
    starts_at_midday = serializers.BooleanField(required=False, default=False)
    ends_at_midday = serializers.BooleanField(required=False, default=False)
    start_time = serializers.TimeField(required=False, allow_null=True, default=None)
    end_time = serializers.TimeField(required=False, allow_null=True, default=None)
    reason = serializers.CharField(**_REASON)


class CorrectIn(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    starts_at_midday = serializers.BooleanField(required=False, default=False)
    ends_at_midday = serializers.BooleanField(required=False, default=False)
    start_time = serializers.TimeField(required=False, allow_null=True, default=None)
    end_time = serializers.TimeField(required=False, allow_null=True, default=None)
    reason = serializers.CharField(**_REASON)


class ReasonIn(serializers.Serializer):
    reason = serializers.CharField(**_REASON)


class ReclassifyIn(serializers.Serializer):
    override_reason = serializers.CharField(**_REASON)
```

A reason may arrive empty on purpose: the service refuses it with `request.reason_required`, which says what to do in the reader's language.

- [ ] **Step 4: Implement the views**

In `backend/apps/requests/api/views.py`, add to the imports:

```python
from dataclasses import replace

from ..representation import amendment_bodies, attachment_bodies, attachment_body
from ..services.attachments import require_attacher
from ..services.common import require_editor, require_requester
```

and add `AmendmentIn`, `CorrectIn`, `FileIn`, `ReasonIn`, `ReclassifyIn`, `RequestAmendmentOut`, `RequestAttachmentOut`, `RequestIn`, `RequestPatchIn` and `VersionIn` to the import from `.serializers`.

Replace the classes `RequestListView` and `RequestDetailView` with:

```python
class RequestListView(APIView):
    http_method_names = ["get", "post"]
    access = {"GET": STAFF, "POST": AUTHORS}

    @extend_schema(operation_id="requests_list", parameters=LIST_PARAMETERS, responses=paginated(RequestOut))
    def get(self, request):
        params = request.query_params
        found = selectors.requests_for(request.user, params.get("scope") or "mine")
        found = selectors.filter_requests(found, viewer=request.user, **_list_filters(params))
        found = found.order_by(*ORDERINGS.get(params.get("ordering") or "", ORDERINGS["-created_at"]))
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(found, request, view=self)
        viewer = viewer_for(request.user)
        return paginator.get_paginated_response(RequestOut([represent(item, viewer) for item in page], many=True).data)

    @extend_schema(operation_id="requests_create", request=RequestIn, responses={201: RequestDetailOut})
    def post(self, request):
        data = RequestIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        created = services.create_draft(
            actor=request.user,
            employee=_target_employee(request.user, values["employee"]),
            request_type=selectors.get_type_by_code(values["type"]),
            data=_data_from(values, comment=values["comment"]),
            override_reason=values["override_reason"],
        )
        return _detail(request.user, created.public_id, status=201)


class RequestDetailView(APIView):
    http_method_names = ["get", "patch", "delete"]
    access = {"GET": STAFF, "PATCH": AUTHORS, "DELETE": AUTHORS}

    @extend_schema(operation_id="requests_detail", responses=RequestDetailOut)
    def get(self, request, public_id):
        return _detail(request.user, public_id)

    @extend_schema(operation_id="requests_update", request=RequestPatchIn, responses=RequestDetailOut)
    def patch(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        require_editor(request.user, found)
        data = RequestPatchIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        version = values.pop("version")
        if "exceptional_event" in values:
            values["exceptional_event_id"] = values.pop("exceptional_event")
        merged = replace(services.data_of(found), **values)
        services.update_request(actor=request.user, request=found, data=merged, expected_version=version)
        return _detail(request.user, public_id)

    @extend_schema(operation_id="requests_discard", request=None, responses={204: None})
    def delete(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        services.discard_draft(actor=request.user, request=found)
        return Response(status=204)
```

Append to the end of the file:

```python
# ---------------------------------------------------------------- requests: write


class RequestSubmitView(APIView):
    http_method_names = ["post"]
    access = {"POST": AUTHORS}

    @extend_schema(operation_id="requests_submit", request=VersionIn, responses=RequestDetailOut)
    def post(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        require_editor(request.user, found)
        data = VersionIn(data=request.data)
        data.is_valid(raise_exception=True)
        services.submit(actor=request.user, request=found, expected_version=data.validated_data["version"])
        return _detail(request.user, public_id)


class RequestWithdrawView(APIView):
    http_method_names = ["post"]
    access = {"POST": {Role.EMPLOYEE}}

    @extend_schema(operation_id="requests_withdraw", request=None, responses=RequestDetailOut)
    def post(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        services.withdraw(actor=request.user, request=found)
        return _detail(request.user, public_id)


class RequestAttachmentsView(APIView):
    http_method_names = ["get", "post"]
    access = {"GET": STAFF, "POST": AUTHORS}

    @extend_schema(operation_id="requests_attachments", responses=RequestAttachmentOut(many=True))
    def get(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        items = attachment_bodies(found, viewer_for(request.user))
        return Response(RequestAttachmentOut(items, many=True).data)

    @extend_schema(
        operation_id="requests_attach",
        request={"multipart/form-data": FileIn},
        responses={201: RequestAttachmentOut},
    )
    def post(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        require_attacher(request.user, found)
        data = FileIn(data=request.data)
        data.is_valid(raise_exception=True)
        link = services.attach_file(actor=request.user, request=found, upload=data.validated_data["file"])
        return Response(RequestAttachmentOut(attachment_body(link)).data, status=201)


class RequestAmendmentsView(APIView):
    http_method_names = ["get", "post"]
    access = {"GET": STAFF, "POST": {Role.EMPLOYEE}}

    @extend_schema(operation_id="requests_amendments", responses=RequestAmendmentOut(many=True))
    def get(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        items = amendment_bodies(found, viewer_for(request.user))
        return Response(RequestAmendmentOut(items, many=True).data)

    @extend_schema(operation_id="requests_amend", request=AmendmentIn, responses={201: RequestDetailOut})
    def post(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        require_requester(request.user, found)
        data = AmendmentIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        new = None
        if values["start_date"] is not None and values["end_date"] is not None:
            new = RequestData(
                start_date=values["start_date"],
                end_date=values["end_date"],
                starts_at_midday=values["starts_at_midday"],
                ends_at_midday=values["ends_at_midday"],
                start_time=values["start_time"],
                end_time=values["end_time"],
            )
        services.open_amendment(
            actor=request.user, request=found, kind=values["kind"], data=new, reason=values["reason"]
        )
        return _detail(request.user, public_id, status=201)


class AmendmentWithdrawView(APIView):
    http_method_names = ["post"]
    access = {"POST": {Role.EMPLOYEE}}

    @extend_schema(operation_id="amendments_withdraw", request=None, responses=RequestDetailOut)
    def post(self, request, public_id):
        amendment = selectors.get_amendment_for(request.user, str(public_id))
        services.withdraw_amendment(actor=request.user, amendment=amendment)
        return _detail(request.user, amendment.request.public_id)


class RequestCorrectView(APIView):
    http_method_names = ["post"]
    access = {"POST": HR_ONLY}

    @extend_schema(operation_id="requests_correct", request=CorrectIn, responses=RequestDetailOut)
    def post(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        data = CorrectIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        new = RequestData(
            start_date=values["start_date"],
            end_date=values["end_date"],
            starts_at_midday=values["starts_at_midday"],
            ends_at_midday=values["ends_at_midday"],
            start_time=values["start_time"],
            end_time=values["end_time"],
        )
        services.hr_correct(actor=request.user, request=found, data=new, reason=values["reason"])
        return _detail(request.user, public_id)


class RequestCancelView(APIView):
    http_method_names = ["post"]
    access = {"POST": HR_ONLY}

    @extend_schema(operation_id="requests_cancel", request=ReasonIn, responses=RequestDetailOut)
    def post(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        data = ReasonIn(data=request.data)
        data.is_valid(raise_exception=True)
        services.hr_cancel(actor=request.user, request=found, reason=data.validated_data["reason"])
        return _detail(request.user, public_id)


class RequestReclassifyView(APIView):
    http_method_names = ["post"]
    access = {"POST": HR_ONLY}

    @extend_schema(operation_id="requests_reclassify", request=ReclassifyIn, responses=RequestDetailOut)
    def post(self, request, public_id):
        found = selectors.get_request_for(request.user, str(public_id))
        data = ReclassifyIn(data=request.data)
        data.is_valid(raise_exception=True)
        services.reclassify_as_annual(
            actor=request.user, request=found, override_reason=data.validated_data["override_reason"]
        )
        return _detail(request.user, public_id)
```

`withdraw`, `discard_draft`, `withdraw_amendment` and the three HR actions check who is acting as their first step after taking the locks, and they take no body the caller could get wrong first: the order "may you act, then is the body valid" holds for every route.

Add to `urlpatterns` in `backend/apps/requests/api/urls.py`:

```python
    path("requests/<uuid:public_id>/submit", views.RequestSubmitView.as_view(), name="request-submit"),
    path("requests/<uuid:public_id>/withdraw", views.RequestWithdrawView.as_view(), name="request-withdraw"),
    path("requests/<uuid:public_id>/attachments", views.RequestAttachmentsView.as_view(), name="request-attachments"),
    path("requests/<uuid:public_id>/amendments", views.RequestAmendmentsView.as_view(), name="request-amendments"),
    path("requests/<uuid:public_id>/correct", views.RequestCorrectView.as_view(), name="request-correct"),
    path("requests/<uuid:public_id>/cancel", views.RequestCancelView.as_view(), name="request-cancel"),
    path("requests/<uuid:public_id>/reclassify", views.RequestReclassifyView.as_view(), name="request-reclassify"),
    path("amendments/<uuid:public_id>/withdraw", views.AmendmentWithdrawView.as_view(), name="amendment-withdraw"),
```

- [ ] **Step 5: Add the permission-matrix cases**

In `backend/apps/requests/tests/matrix.py`, add after the function `sick_leave`:

```python
def changing(world):
    """An approved request of the owner with a change that is waiting. Returns the amendment."""

    def build():
        request = _through_the_chain(_remote(world, 20))
        return services.open_amendment(
            actor=world.owner_user,
            request=request,
            kind="change",
            data=RequestData(start_date=_day(21), end_date=_day(21)),
            reason="matrix",
        )

    return _once(world, "changing", build)


def _certificate():
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile("certificat.pdf", b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n", content_type="application/pdf")


# The owner may do it; the manager, HR and executives see the request but may not; the others do not see it.
OWNER_AMONG_THOSE_WHO_SEE = only(P.OWNER, hide=(P.PEER, P.OTHER_MANAGER, P.OUTSIDER))
ITS_CREATOR_ONLY = only(P.OWNER, hide=(P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC))
```

Append before the final `CASES = ...` line, and change that line as shown:

```python
WRITE_CASES = [
    Case(
        "requests:request-list",
        "POST",
        only(*STAFF),
        body=lambda w: {"type": "remote", "start_date": str(_day(31)), "end_date": str(_day(31))},
    ),
    Case(
        "requests:request-detail",
        "PATCH",
        ITS_CREATOR_ONLY,
        kwargs=_id(a_draft),
        body=lambda w: {"version": a_draft(w).version, "comment": "matrix"},
    ),
    Case("requests:request-detail", "DELETE", ITS_CREATOR_ONLY, kwargs=_id(a_draft)),
    Case(
        "requests:request-submit",
        "POST",
        ITS_CREATOR_ONLY,
        kwargs=_id(a_draft),
        body=lambda w: {"version": a_draft(w).version},
    ),
    Case("requests:request-withdraw", "POST", OWNER_AMONG_THOSE_WHO_SEE, kwargs=_id(pending), body=lambda w: {}),
    Case("requests:request-attachments", "GET", VISIBLE_TO_ITS_CIRCLE, kwargs=_id(pending)),
    Case(
        "requests:request-attachments",
        "POST",
        only(P.OWNER, P.HR, hide=(P.PEER, P.OTHER_MANAGER, P.OUTSIDER)),
        kwargs=_id(pending),
        body=lambda w: {"file": _certificate()},
        format="multipart",
    ),
    Case("requests:request-amendments", "GET", VISIBLE_TO_ITS_CIRCLE, kwargs=_id(granted)),
    Case(
        "requests:request-amendments",
        "POST",
        OWNER_AMONG_THOSE_WHO_SEE,
        kwargs=_id(granted),
        body=lambda w: {"kind": "cancel", "reason": "matrix"},
    ),
    Case(
        "requests:amendment-withdraw",
        "POST",
        OWNER_AMONG_THOSE_WHO_SEE,
        kwargs=lambda w: {"public_id": changing(w).public_id},
        body=lambda w: {},
    ),
    Case(
        "requests:request-correct",
        "POST",
        only(P.HR),
        kwargs=_id(pending),
        body=lambda w: {"start_date": str(_day(12)), "end_date": str(_day(12)), "reason": "matrix"},
    ),
    Case("requests:request-cancel", "POST", only(P.HR), kwargs=_id(pending), body=lambda w: {"reason": "matrix"}),
    Case("requests:request-reclassify", "POST", only(P.HR), kwargs=_id(sick_leave), body=lambda w: {}),
]

CASES = CONFIG_CASES + READ_CASES + WRITE_CASES
```

For the personas who see the request but are refused, `only` expects 403: on `withdraw`, `amendments` and `amendment-withdraw` these are the manager, HR and the executive, who all hold the Employee role and so pass the role check before the service refuses them.

- [ ] **Step 6: Regenerate the API description**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: no line starting with `Warning`, then `backend/openapi.yaml is up to date.`

- [ ] **Step 7: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_api_write.py apps/requests/tests/test_api_read.py tests/test_permission_matrix.py tests/test_openapi.py -v`
Expected: 10 passed in `test_api_write.py`, 13 in `test_api_read.py`; the matrix and the description check pass.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/requests backend/openapi.yaml
git add frontend/src/api/schema.d.ts 2>/dev/null || true
git commit -m "feat(requests): write API for drafts, sending, files, amendments and HR actions"
```

---

### Task 20: Queues, the approvals API and the step endpoints

**Files:**
- Modify: `backend/apps/requests/selectors.py` (append `queue`, `get_step`, `via_delegation_from`)
- Modify: `backend/apps/requests/api/serializers.py` (append four serializers)
- Modify: `backend/apps/requests/api/views.py` (append four views)
- Modify: `backend/apps/requests/api/urls.py`
- Modify: `backend/apps/requests/tests/matrix.py`
- Modify: `backend/openapi.yaml` (regenerated)
- Test: `backend/apps/requests/tests/test_queues.py`
- Test: `backend/apps/requests/tests/test_api_steps.py`

**Interfaces:**
- Consumes: `chain.resolve_rule`, `is_eligible_approver` (Task 7), `decide_step` (Task 10), `record_on_behalf`, `reassign_step` (Task 13), `represent`, `represent_context`, `viewer_for` (Task 17), `_detail` (Task 18), `apps.organisation.reach` (`employee_of`, `team_ids`), `apps.organisation.selectors` (`get_employee_for`, `employees_for`).
- Produces:
  - `apps.requests.selectors.queue(user, name: str) -> QuerySet[RequestStep]`, oldest first. `mine`: steps the user decides as line manager, delegate or named person, plus HR steps that fell back to them as an executive. `hr`: steps that wait for the HR role. `certificates`: steps of pending requests whose required document is missing. `stuck`: manager and named-person steps that HR was alerted about. The last three need the HR role (`NotAllowed`). A user's own requests are in none of them.
  - `apps.requests.selectors.get_step(pk: int) -> RequestStep`, `via_delegation_from(step, user) -> str | None`
  - Routes `requests:approval-list` (GET, `?queue=`, `?type=`, `?department=`), `requests:step-decide`, `requests:step-record-on-behalf`, `requests:step-reassign`
  - `GET approvals` returns paginated `ApprovalItemOut`: `{step_id, request: RequestOut, waiting_since, via_delegation_from, decision_context}`

- [ ] **Step 1: Write the failing tests for the queues**

`backend/apps/requests/tests/test_queues.py`:

```python
import datetime as dt

import pytest

from apps.accounts import services as account_services
from apps.core.errors import DomainError, NotAllowed
from apps.organisation import services as organisation_services
from apps.requests import selectors, services
from apps.requests.services import StepSpec
from apps.requests.tests.helpers import (
    MON, NOW, TODAY, TUE, WED, approved, days, decide, pdf, pending_step, submitted,
)

pytestmark = pytest.mark.django_db


def requests_in(user, name) -> list[int]:
    return [step.request_id for step in selectors.queue(user, name)]


def sick(world, **options):
    return submitted(world, request_type=world.sick, data=days(TODAY), **options)


def test_a_manager_finds_the_steps_of_their_team_oldest_first(world, clock):
    first = submitted(world, data=days(MON))
    clock.shift(60)
    second = submitted(world, employee=world.peer, data=days(MON))
    submitted(world, employee=world.outsider, data=days(MON))
    assert requests_in(world.manager_user, "mine") == [first.pk, second.pk]
    assert requests_in(world.other_manager_user, "mine") != requests_in(world.manager_user, "mine")
    assert requests_in(world.owner_user, "mine") == []


def test_a_step_leaves_the_queue_once_decided_and_enters_the_hr_queue(world):
    request = submitted(world)
    assert requests_in(world.hr_user, "hr") == []
    decide(request, world.manager_user)
    assert requests_in(world.manager_user, "mine") == []
    assert requests_in(world.hr_user, "hr") == [request.pk]
    assert requests_in(world.hr_user, "mine") == []  # HR steps are the HR desk's, not My team's


def test_a_delegate_sees_the_steps_of_the_manager_they_cover(world):
    organisation_services.create_delegation(
        actor=world.hr_user, manager=world.manager, delegate=world.other_manager,
        start_date=TODAY, end_date=TODAY + dt.timedelta(days=14),
    )
    request = submitted(world)
    assert request.pk in requests_in(world.other_manager_user, "mine")
    step = pending_step(request)
    assert selectors.via_delegation_from(step, world.other_manager_user) == "Mounir Manager"
    assert selectors.via_delegation_from(step, world.manager_user) is None


def test_nobody_finds_their_own_request_in_a_queue(world):
    own = submitted(world, employee=world.manager, data=days(MON))
    assert requests_in(world.manager_user, "mine") == []
    assert requests_in(world.exec_user, "mine") == [own.pk]
    hr_own = submitted(world, employee=world.hr, actor=world.hr_user, data=days(TUE))
    decide(hr_own, world.exec_user)
    assert requests_in(world.hr_user, "hr") == []
    # The only HR holder is the requester: the step falls back to the executive.
    assert hr_own.pk in requests_in(world.exec_user, "mine")


def test_a_named_person_and_a_reassigned_step(world):
    services.replace_steps(
        actor=world.hr_user,
        request_type=world.remote,
        steps=[StepSpec(approver_rule="named_person", named_person=world.other_manager)],
    )
    named = submitted(world, request_type=world.remote, data=days(MON))
    assert requests_in(world.other_manager_user, "mine") == [named.pk]
    assert requests_in(world.manager_user, "mine") == []

    own = submitted(world, employee=world.other_manager, request_type=world.remote, data=days(MON))
    # The named person is the requester: the step is an HR step (PRD 6.9).
    assert requests_in(world.hr_user, "hr") == [own.pk]


def test_the_hr_queues_are_for_hr(world):
    for name in ("hr", "certificates", "stuck"):
        with pytest.raises(NotAllowed):
            selectors.queue(world.manager_user, name)
        with pytest.raises(NotAllowed):
            selectors.queue(world.exec_user, name)
    with pytest.raises(DomainError) as error:
        selectors.queue(world.hr_user, "everything")
    assert error.value.code == "request.queue_invalid"


def test_the_certificates_queue_lists_sick_leaves_without_a_certificate(world):
    without = sick(world)
    with_one = sick(world, employee=world.peer)
    services.attach_file(actor=world.peer_user, request=with_one, upload=pdf())
    counted_as_annual = sick(world, employee=world.outsider)
    services.reclassify_as_annual(actor=world.hr_user, request=counted_as_annual)
    submitted(world, employee=world.manager, data=days(MON))
    assert requests_in(world.hr_user, "certificates") == [without.pk]
    assert set(requests_in(world.hr_user, "hr")) == {without.pk, with_one.pk}


def test_the_stuck_queue_lists_manager_steps_hr_was_alerted_about(world):
    waiting = submitted(world, data=days(MON))
    account_services.disable_account(actor=world.sysadmin_user, user=world.other_manager_user)
    stuck = submitted(world, employee=world.outsider, data=days(MON))  # the manager cannot sign in: flagged at once
    assert requests_in(world.hr_user, "stuck") == [stuck.pk]

    step = pending_step(waiting)
    step.flagged_at = NOW
    step.save()
    assert set(requests_in(world.hr_user, "stuck")) == {waiting.pk, stuck.pk}
    assert requests_in(world.hr_user, "hr") == []


def test_a_change_to_an_approved_request_goes_through_the_same_queues(world):
    request = approved(world, data=days(MON))
    amendment = services.open_amendment(
        actor=world.owner_user, request=request, kind="change", data=days(WED), reason="Décalage"
    )
    (step,) = selectors.queue(world.manager_user, "mine")
    assert (step.request_id, step.amendment_id) == (request.pk, amendment.pk)
    services.withdraw_amendment(actor=world.owner_user, amendment=amendment)
    assert requests_in(world.manager_user, "mine") == []


def test_closed_requests_are_in_no_queue(world):
    request = submitted(world)
    services.withdraw(actor=world.owner_user, request=request)
    assert requests_in(world.manager_user, "mine") == []
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_queues.py -v`
Expected: 10 failed with `AttributeError: module 'apps.requests.selectors' has no attribute 'queue'`.

- [ ] **Step 3: Implement the queues**

Add `AmendmentStatus`, `ApproverRule`, `StepMode` and `StepStatus` to the models import of `backend/apps/requests/selectors.py`, add `from .services import chain` to its imports, and append:

```python
# ------------------------------------------------------------------ queues

QUEUES = ("mine", "hr", "certificates", "stuck")

# A step that waits for the HR role: by its rule, or because the person it names is the requester (PRD 6.9).
_HR_STEP = Q(approver_rule=ApproverRule.HR_ROLE) | Q(
    approver_rule=ApproverRule.NAMED_PERSON, named_person_id=F("request__employee_id")
)


def _open_steps() -> QuerySet[RequestStep]:
    """Steps waiting for a decision: on a pending request, or on a pending amendment of an approved one."""
    return RequestStep.objects.filter(status=StepStatus.PENDING, mode=StepMode.APPROVE).filter(
        Q(amendment__isnull=True, request__status=RequestStatus.PENDING)
        | Q(amendment__status=AmendmentStatus.PENDING)
    )


def _fallen_back_to(user, steps: QuerySet[RequestStep]) -> list[int]:
    """HR steps that an executive must take because no HR holder but the requester exists (PRD 6.9)."""
    taken: list[int] = []
    for step in steps.filter(_HR_STEP):
        resolution = chain.resolve_rule(
            rule=step.approver_rule, named_person=step.named_person, requester=step.request.employee
        )
        if resolution.via_exec and any(candidate.pk == user.pk for candidate in resolution.users):
            taken.append(step.pk)
    return taken


def queue(user, name: str) -> QuerySet[RequestStep]:
    """The steps waiting in one of the four queues, oldest first. Never a step of the user's own request."""
    if name not in QUEUES:
        raise DomainError("request.queue_invalid", field="queue")
    if name != "mine" and not has_role(user, Role.HR):
        raise NotAllowed("core.not_allowed")
    me = reach.employee_of(user)
    steps = (
        _open_steps()
        .select_related("request", "request__request_type", "request__employee", "amendment", "named_person")
        .order_by("activated_at", "pk")
    )
    if me is not None:
        steps = steps.exclude(request__employee=me)
    if name == "mine":
        if me is None:
            return steps.none()
        mine = Q(approver_rule=ApproverRule.LINE_MANAGER, request__employee_id__in=reach.team_ids(user)) | (
            Q(approver_rule=ApproverRule.NAMED_PERSON, named_person=me)
        )
        if has_role(user, Role.EXEC) and not has_role(user, Role.HR):
            mine |= Q(pk__in=_fallen_back_to(user, steps))
        return steps.filter(mine)
    if name == "hr":
        return steps.filter(_HR_STEP)
    if name == "certificates":
        return steps.filter(
            amendment__isnull=True,
            request__request_type__document_rule=DocumentRule.REQUIRED_WITHIN_DEADLINE,
        ).exclude(request__attachment_links__step__isnull=True)
    return steps.filter(flagged_at__isnull=False).exclude(_HR_STEP)


def get_step(pk: int) -> RequestStep:
    step = (
        RequestStep.objects.select_related(
            "request", "request__request_type", "request__employee", "amendment", "named_person"
        )
        .filter(pk=pk)
        .first()
    )
    if step is None:
        raise NotFound("core.not_found")
    return step


def via_delegation_from(step, user) -> str | None:
    """The manager a delegate is covering for on this step, or None when the user acts in their own name."""
    if step.approver_rule != ApproverRule.LINE_MANAGER:
        return None
    manager = step.request.employee.manager
    me = reach.employee_of(user)
    if manager is None or me is None or manager.pk == me.pk:
        return None
    if manager.pk not in reach.acting_for(me.pk):
        return None
    return name_of(manager)
```

In the `certificates` queue, `exclude(request__attachment_links__step__isnull=True)` removes the requests that have at least one file not tied to a step, that is a certificate; a request with no file at all, or with only the scan of a signed form, stays.

- [ ] **Step 4: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_queues.py -v`
Expected: 10 passed.

- [ ] **Step 5: Write the failing API tests**

`backend/apps/requests/tests/test_api_steps.py`:

```python
import datetime as dt

import pytest
from django.urls import reverse

from apps.accounts.services import display_name
from apps.organisation import services as organisation_services
from apps.organisation.selectors import full_name
from apps.requests.models import RequestAttachment
from apps.requests.tests.helpers import (
    MON, NOW, TODAY, TUE, days, decide, fresh, pdf, pending_step, steps, submitted,
)

pytestmark = pytest.mark.django_db

APPROVALS = "requests:approval-list"


def step_url(name: str, step) -> str:
    return reverse(name, kwargs={"pk": step.pk})


def test_the_manager_queue_carries_what_is_needed_to_decide_from_the_list(world, client_for):
    organisation_services.create_delegation(
        actor=world.hr_user, manager=world.manager, delegate=world.other_manager,
        start_date=TODAY, end_date=TODAY + dt.timedelta(days=14),
    )
    request = submitted(world, data=days(MON, TUE))

    response = client_for(world.manager_user).get(reverse(APPROVALS))
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    item = body["results"][0]
    assert (item["step_id"], item["via_delegation_from"]) == (pending_step(request).pk, None)
    assert item["waiting_since"].startswith("2026-10-06T09:00:00")
    assert (item["request"]["public_id"], item["request"]["viewer"]["actions"]) == (str(request.public_id), ["decide"])
    assert item["decision_context"] == {
        "balance": {"now": "10.00", "after": "8.00"},
        "teammates_away": [],
        "cap": None,
    }

    covered = client_for(world.other_manager_user).get(reverse(APPROVALS)).json()["results"][0]
    assert covered["via_delegation_from"] == full_name(world.manager)


def test_the_hr_queues_through_the_api(world, client_for):
    sick = submitted(world, request_type=world.sick, data=days(TODAY))
    annual = submitted(world, employee=world.peer, data=days(MON))
    decide(annual, world.manager_user)
    client = client_for(world.hr_user)

    def ids(**params):
        return [item["request"]["public_id"] for item in client.get(reverse(APPROVALS), params).json()["results"]]

    assert ids(queue="hr") == [str(sick.public_id), str(annual.public_id)]
    assert ids(queue="hr", type="annual") == [str(annual.public_id)]
    assert ids(queue="hr", department=world.dept_b.pk) == []
    assert ids(queue="certificates") == [str(sick.public_id)]
    assert ids(queue="stuck") == []
    assert client_for(world.manager_user).get(reverse(APPROVALS), {"queue": "hr"}).status_code == 403
    unknown = client.get(reverse(APPROVALS), {"queue": "everything"})
    assert (unknown.status_code, unknown.json()["code"]) == (400, "request.queue_invalid")


def test_deciding_through_the_api(world, client_for):
    request = submitted(world)
    step = pending_step(request)
    client = client_for(world.manager_user)
    url = step_url("requests:step-decide", step)

    no_reason = client.post(url, {"decision": "reject", "comment": "", "version": 2}, format="json")
    assert (no_reason.status_code, no_reason.json()["code"]) == (400, "request.reason_required")
    assert no_reason.json()["errors"][0]["field"] == "comment"

    approved = client.post(url, {"decision": "approve", "comment": "Bon repos", "version": 2}, format="json")
    assert approved.status_code == 200
    body = approved.json()
    assert (body["version"], body["state"]["key"], body["steps"][0]["status"]) == (3, "waiting_hr", "approved")
    assert body["steps"][0]["decided_by"] == display_name(world.manager_user)

    again = client.post(url, {"decision": "approve", "comment": "", "version": 3}, format="json")
    assert (again.status_code, again.json()["code"]) == (409, "request.already_processed")


def test_a_step_is_not_available_to_someone_it_is_not_for(world, client_for):
    request = submitted(world)
    url = step_url("requests:step-decide", pending_step(request))
    payload = {"decision": "approve", "comment": "", "version": 2}
    for user in (world.owner_user, world.peer_user, world.other_manager_user, world.hr_user, world.exec_user):
        assert client_for(user).post(url, payload, format="json").status_code == 404
    missing = reverse("requests:step-decide", kwargs={"pk": 999999})
    assert client_for(world.manager_user).post(missing, payload, format="json").status_code == 404
    assert fresh(request).status == "pending"


def test_hr_records_a_decision_given_on_paper_with_its_scan(world, client_for):
    request = submitted(world)
    step = pending_step(request)
    response = client_for(world.hr_user).post(
        step_url("requests:step-record-on-behalf", step),
        {
            "decided_by": str(world.manager.public_id),
            "decision": "approve",
            "decided_at": (NOW - dt.timedelta(hours=3)).isoformat(),
            "channel": "paper",
            "note": "Formulaire signé remis ce matin",
            "version": 2,
            "scan": pdf("formulaire.pdf"),
        },
        format="multipart",
    )
    assert response.status_code == 200
    first = response.json()["steps"][0]
    assert (first["status"], first["channel"], first["decided_by"], first["recorded_by"]) == (
        "approved", "paper", full_name(world.manager), display_name(world.hr_user),
    )
    assert [item["kind"] for item in response.json()["attachments"]] == ["scanned_form"]
    assert RequestAttachment.objects.get(request=request).step_id == step.pk


def test_recording_on_behalf_refuses_what_makes_no_sense(world, client_for):
    request = submitted(world)
    url = step_url("requests:step-record-on-behalf", pending_step(request))
    payload = {
        "decided_by": str(world.manager.public_id),
        "decision": "approve",
        "decided_at": (NOW - dt.timedelta(hours=1)).isoformat(),
        "channel": "verbal",
        "note": "Accord oral",
        "version": 2,
    }
    client = client_for(world.hr_user)

    def code(**changes):
        return client.post(url, {**payload, **changes}, format="json").json()["code"]

    assert code(note="") == "request.comment_required"
    assert code(channel="in_app") == "request.channel_invalid"
    assert code(decided_by=str(world.owner.public_id)) == "request.own_request"
    assert code(decided_by="00000000-0000-0000-0000-000000000000") == "core.not_found"
    assert code(decided_at=(NOW + dt.timedelta(hours=1)).isoformat()) == "request.decided_at_future"
    assert client_for(world.manager_user).post(url, payload, format="json").status_code == 403
    assert steps(request)[0].status == "pending"


def test_hr_gives_a_step_to_someone_else_through_the_api(world, client_for):
    request = submitted(world)
    step = pending_step(request)
    response = client_for(world.hr_user).post(
        step_url("requests:step-reassign", step),
        {"new_approver": str(world.other_manager.public_id), "reason": "Responsable en déplacement"},
        format="json",
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["state"]["key"], body["state"]["waiting_on"]) == (
        "waiting_person", [display_name(world.other_manager_user)],
    )
    assert body["version"] == 3
    no_reason = client_for(world.hr_user).post(
        step_url("requests:step-reassign", step), {"new_approver": str(world.peer.public_id)}, format="json"
    )
    assert (no_reason.status_code, no_reason.json()["code"]) == (400, "request.reason_required")
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_api_steps.py -v`
Expected: 7 failed with `NoReverseMatch: Reverse for 'approval-list' not found`.

- [ ] **Step 7: Implement the serializers and the views**

Add `Decision` to the models import of `backend/apps/requests/api/serializers.py` and append:

```python
# ---------------------------------------------------------------- approvals and steps


class ApprovalItemOut(serializers.Serializer):
    step_id = serializers.IntegerField()
    request = RequestOut()
    waiting_since = serializers.DateTimeField(allow_null=True)
    via_delegation_from = serializers.CharField(allow_null=True)
    decision_context = DecisionContextOut()


class DecideIn(serializers.Serializer):
    decision = serializers.ChoiceField(choices=Decision.choices)
    comment = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)
    version = serializers.IntegerField(min_value=1)


class RecordOnBehalfIn(serializers.Serializer):
    decided_by = serializers.UUIDField()
    decision = serializers.ChoiceField(choices=Decision.choices)
    decided_at = serializers.DateTimeField()
    # Every channel is accepted here; the service refuses "in_app" with a message that says what to choose.
    channel = serializers.ChoiceField(choices=Channel.choices)
    note = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)
    version = serializers.IntegerField(min_value=1)
    scan = serializers.FileField(required=False, allow_null=True, default=None)


class ReassignIn(serializers.Serializer):
    new_approver = serializers.UUIDField()
    reason = serializers.CharField(**_REASON)
```

In `backend/apps/requests/api/views.py`, add `represent_context` to the import from `..representation`, add `ApprovalItemOut`, `DecideIn`, `ReassignIn` and `RecordOnBehalfIn` to the import from `.serializers`, and append:

```python
# ---------------------------------------------------------------- approvals and steps


def _named_employee(user, public_id, field: str):
    """An employee chosen in a form. An unknown one is a problem of that field, not a missing page."""
    try:
        return organisation_selectors.get_employee_for(user, str(public_id))
    except NotFound:
        raise DomainError("core.not_found", field=field) from None


class ApprovalListView(APIView):
    http_method_names = ["get"]
    access = {"GET": STAFF}

    @extend_schema(
        operation_id="approvals_list",
        parameters=[
            OpenApiParameter("queue", str, enum=["mine", "hr", "certificates", "stuck"]),
            OpenApiParameter("type", str, description="Comma-separated type codes"),
            OpenApiParameter("department", int),
            *PAGE_PARAMETERS,
        ],
        responses=paginated(ApprovalItemOut),
    )
    def get(self, request):
        params = request.query_params
        waiting = selectors.queue(request.user, params.get("queue") or "mine")
        codes = _csv(params.get("type"))
        if codes:
            waiting = waiting.filter(request__request_type__code__in=codes)
        if params.get("department"):
            try:
                department = int(params["department"])
            except ValueError:
                raise DomainError("request.filter_invalid") from None
            members = organisation_selectors.employees_for(request.user, include_archived=True).filter(
                department_id=department
            )
            waiting = waiting.filter(request__employee_id__in=list(members.values_list("pk", flat=True)))
        paginator = DefaultPagination()
        page = paginator.paginate_queryset(waiting, request, view=self)
        viewer = viewer_for(request.user)
        found = {item.pk: item for item in selectors.base_requests().filter(pk__in=[s.request_id for s in page])}
        items = [
            {
                "step_id": step.pk,
                "request": represent(found[step.request_id], viewer),
                "waiting_since": step.activated_at,
                "via_delegation_from": selectors.via_delegation_from(step, request.user),
                "decision_context": represent_context(found[step.request_id], viewer),
            }
            for step in page
        ]
        return paginator.get_paginated_response(ApprovalItemOut(items, many=True).data)


class StepDecideView(APIView):
    http_method_names = ["post"]
    access = {"POST": STAFF}

    @extend_schema(operation_id="steps_decide", request=DecideIn, responses=RequestDetailOut)
    def post(self, request, pk: int):
        step = selectors.get_step(pk)
        # A step is "not available" to anyone it is not for, including the requester (master D14).
        if not services.is_eligible_approver(request.user, step):
            raise NotFound("core.not_found")
        data = DecideIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        services.decide_step(
            actor=request.user,
            step=step,
            decision=values["decision"],
            comment=values["comment"],
            expected_version=values["version"],
        )
        return _detail(request.user, step.request.public_id)


class StepRecordOnBehalfView(APIView):
    http_method_names = ["post"]
    access = {"POST": HR_ONLY}

    @extend_schema(
        operation_id="steps_record_on_behalf",
        request={"multipart/form-data": RecordOnBehalfIn, "application/json": RecordOnBehalfIn},
        responses=RequestDetailOut,
    )
    def post(self, request, pk: int):
        step = selectors.get_step(pk)
        data = RecordOnBehalfIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        services.record_on_behalf(
            actor=request.user,
            step=step,
            decided_by=_named_employee(request.user, values["decided_by"], "decided_by"),
            decision=values["decision"],
            decided_at=values["decided_at"],
            channel=values["channel"],
            note=values["note"],
            scan=values["scan"],
            expected_version=values["version"],
        )
        return _detail(request.user, step.request.public_id)


class StepReassignView(APIView):
    http_method_names = ["post"]
    access = {"POST": HR_ONLY}

    @extend_schema(operation_id="steps_reassign", request=ReassignIn, responses=RequestDetailOut)
    def post(self, request, pk: int):
        step = selectors.get_step(pk)
        data = ReassignIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        services.reassign_step(
            actor=request.user,
            step=step,
            new_approver=_named_employee(request.user, values["new_approver"], "new_approver"),
            reason=values["reason"],
        )
        return _detail(request.user, step.request.public_id)
```

Add to `urlpatterns` in `backend/apps/requests/api/urls.py`:

```python
    path("approvals", views.ApprovalListView.as_view(), name="approval-list"),
    path("steps/<int:pk>/decide", views.StepDecideView.as_view(), name="step-decide"),
    path("steps/<int:pk>/record-on-behalf", views.StepRecordOnBehalfView.as_view(), name="step-record-on-behalf"),
    path("steps/<int:pk>/reassign", views.StepReassignView.as_view(), name="step-reassign"),
```

- [ ] **Step 8: Add the permission-matrix cases**

In `backend/apps/requests/tests/matrix.py`, add after the function `changing`:

```python
def _open_step(request) -> RequestStep:
    return RequestStep.objects.get(request=request, amendment=None, status=StepStatus.PENDING)


def _an_hour_ago() -> str:
    from datetime import timedelta

    return (timezone.now() - timedelta(hours=1)).isoformat()
```

Append before the final `CASES = ...` line, and change that line as shown:

```python
STEP_CASES = [
    Case("requests:approval-list", "GET", only(*STAFF), label="mine"),
    Case("requests:approval-list", "GET", only(P.HR), query=lambda w: {"queue": "hr"}, label="hr"),
    Case(
        "requests:step-decide",
        "POST",
        # Only the manager of the owner is one of the people this step is for.
        only(P.MANAGER, hide=(P.OWNER, P.PEER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC)),
        kwargs=lambda w: {"pk": _open_step(pending(w)).pk},
        body=lambda w: {"decision": "approve", "comment": "", "version": pending(w).version},
    ),
    Case(
        "requests:step-record-on-behalf",
        "POST",
        only(P.HR),
        kwargs=lambda w: {"pk": _open_step(pending(w)).pk},
        body=lambda w: {
            "decided_by": str(w.manager.public_id),
            "decision": "approve",
            "decided_at": _an_hour_ago(),
            "channel": "verbal",
            "note": "matrix",
            "version": pending(w).version,
        },
    ),
    Case(
        "requests:step-reassign",
        "POST",
        only(P.HR),
        kwargs=lambda w: {"pk": _open_step(pending(w)).pk},
        body=lambda w: {"new_approver": str(w.other_manager.public_id), "reason": "matrix"},
    ),
]

CASES = CONFIG_CASES + READ_CASES + WRITE_CASES + STEP_CASES
```

- [ ] **Step 9: Regenerate the API description**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: no line starting with `Warning`, then `backend/openapi.yaml is up to date.`

- [ ] **Step 10: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_queues.py apps/requests/tests/test_api_steps.py tests/test_permission_matrix.py tests/test_openapi.py -v`
Expected: 10 passed in `test_queues.py`, 7 in `test_api_steps.py`; the matrix and the description check pass.

- [ ] **Step 11: Commit**

```bash
git add backend/apps/requests backend/openapi.yaml
git add frontend/src/api/schema.d.ts 2>/dev/null || true
git commit -m "feat(requests): the four queues, the approvals API and the step endpoints"
```

---

### Task 21: Selectors for the other plans, and the holiday warning

**Files:**
- Modify: `backend/apps/requests/selectors.py` (append six selectors)
- Modify: `backend/apps/calendar/api/serializers.py` (append `HolidayImpactOut`)
- Modify: `backend/apps/calendar/api/views.py` (append `HolidayImpactView`)
- Modify: `backend/apps/calendar/api/urls.py` (one route)
- Modify: `backend/apps/calendar/tests/matrix.py` (one case)
- Modify: `backend/openapi.yaml` (regenerated)
- Test: `backend/apps/requests/tests/test_selectors.py`

**Interfaces:**
- Consumes: `data_of`, `leave_days`, `amendment_data`, `day_diff` (Task 3), `chain.waiting_names` (Task 7), `_open_steps`, `base_requests` (Tasks 17, 20), `apps.calendar.workdays.day_portions`, `apps.organisation.selectors.full_name`.
- Produces, in `apps.requests.selectors` (plans 04, 05 and 06 build on these):
  - `DayRow(request_id: int, request_public_id: str, employee_id: int, type_code: str, day: date, portion: Decimal, hours: Decimal | None, status: str)`
  - `day_rows(*, start, end, statuses, employee_ids=None, type_codes=None) -> list[DayRow]`: one row per working day of each day-based request inside the period (`portion` 1 or 0.5, `hours` None); one row per hourly permission dated inside the period (`portion` 0, `hours` its quantity). Ordered by day, then request.
  - `reserved_days(employee_id, *, ignoring_request_id=None) -> dict[date, Decimal]`: days of pending requests of types that deduct, plus the days that pending change amendments add (master D18). Returned requests reserve nothing (PRD 6.3).
  - `WaitingRow(request, step, waiting_on: list[str], since, reminded_at, flagged_at)` and `waiting_rows(*, employee_ids=None) -> list[WaitingRow]`, longest wait first
  - `CertificateRow(request, due_at, overdue: timedelta | None)` and `outstanding_certificates(*, employee_ids=None, now=None) -> list[CertificateRow]`
  - `requests_touching(day: date) -> QuerySet[Request]`: approved day-based requests that cover a date
  - `public_ids(request_ids) -> dict[int, str]` (asked for by plan 04, contract note 12)
- Produces: route `calendar:holiday-impact` (`GET holidays/impact?date=YYYY-MM-DD`, HR), returning `[{public_id, employee, type, start_date, end_date, quantity}]` (master D22: HR is warned, nothing is recomputed)

- [ ] **Step 1: Write the failing tests**

`backend/apps/requests/tests/test_selectors.py`:

```python
import datetime as dt
from decimal import Decimal

import pytest
from django.urls import reverse

from apps.accounts.services import display_name
from apps.calendar import services as calendar_services
from apps.requests import selectors, services
from apps.requests.services import compute_quantity
from apps.requests.tests.helpers import (
    FRI, MON, NEXT_MON, NOW, THU, TODAY, TUE, WED, approved, days, decide, fresh, hours, pdf, submitted,
)
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db

NOVEMBER = (dt.date(2026, 11, 1), dt.date(2026, 11, 30))


def rows(**options):
    options.setdefault("start", NOVEMBER[0])
    options.setdefault("end", NOVEMBER[1])
    options.setdefault("statuses", ["approved"])
    return selectors.day_rows(**options)


# ------------------------------------------------------------------ day_rows


def test_day_rows_give_one_row_per_working_day_with_its_portion(world):
    request = approved(world, data=days(FRI, NEXT_MON, starts_at_midday=True))
    found = rows()
    assert [(row.day, row.portion, row.hours) for row in found] == [
        (FRI, Decimal("0.5"), None),
        (NEXT_MON, Decimal("1"), None),
    ]
    first = found[0]
    assert (first.request_id, first.request_public_id, first.employee_id, first.type_code, first.status) == (
        request.pk, str(request.public_id), world.owner.pk, "annual", "approved",
    )


def test_day_rows_are_clipped_to_the_period(world):
    approved(world, data=days(dt.date(2026, 11, 30), dt.date(2026, 12, 2)))
    assert [row.day for row in rows()] == [dt.date(2026, 11, 30)]
    december = rows(start=dt.date(2026, 12, 1), end=dt.date(2026, 12, 31))
    assert [row.day for row in december] == [dt.date(2026, 12, 1), dt.date(2026, 12, 2)]


def test_day_rows_filter_by_status_employee_and_type(world):
    approved(world, data=days(MON))
    pending = submitted(world, employee=world.peer, request_type=world.remote, data=days(TUE))
    assert [row.employee_id for row in rows()] == [world.owner.pk]
    both = rows(statuses=["approved", "pending"])
    assert [(row.day, row.type_code, row.status) for row in both] == [
        (MON, "annual", "approved"),
        (TUE, "remote", "pending"),
    ]
    assert rows(statuses=["approved", "pending"], employee_ids=[world.peer.pk])[0].request_id == pending.pk
    assert [row.type_code for row in rows(statuses=["approved", "pending"], type_codes=["remote"])] == ["remote"]


def test_an_hourly_permission_is_one_row_with_its_hours(world):
    approved(world, request_type=world.permission, data=hours(WED, "09:00", "10:30"))
    (row,) = rows()
    assert (row.day, row.portion, row.hours, row.type_code) == (WED, Decimal("0"), Decimal("1.50"), "permission")


# ------------------------------------------------------------------ reserved_days


def test_pending_annual_leave_is_reserved_day_by_day(world):
    submitted(world, data=days(MON, TUE, ends_at_midday=True))
    assert selectors.reserved_days(world.owner.pk) == {MON: Decimal("1"), TUE: Decimal("0.5")}
    assert selectors.reserved_days(world.peer.pk) == {}


def test_only_pending_requests_of_deducting_types_reserve(world):
    kept = submitted(world, data=days(MON))
    submitted(world, request_type=world.remote, data=days(TUE))
    returned = submitted(world, data=days(WED))
    decide(returned, world.manager_user, "return", "À revoir")
    approved(world, data=days(THU))
    assert selectors.reserved_days(world.owner.pk) == {MON: Decimal("1")}
    assert selectors.reserved_days(world.owner.pk, ignoring_request_id=kept.pk) == {}


def test_a_pending_change_reserves_only_the_days_it_adds(world):
    request = approved(world, data=days(MON, TUE))
    services.open_amendment(
        actor=world.owner_user, request=request, kind="change", data=days(MON, WED), reason="Un jour de plus"
    )
    assert selectors.reserved_days(world.owner.pk) == {WED: Decimal("1")}
    assert selectors.reserved_days(world.owner.pk, ignoring_request_id=request.pk) == {}


def test_a_pending_cancellation_reserves_nothing(world):
    request = approved(world, data=days(MON, TUE))
    services.open_amendment(actor=world.owner_user, request=request, kind="cancel", data=None, reason="Annulé")
    assert selectors.reserved_days(world.owner.pk) == {}


# ------------------------------------------------------------------ waiting and certificates


def test_waiting_rows_say_who_is_waited_for_and_since_when(world, clock):
    first = submitted(world, data=days(MON))
    clock.shift(3600)
    second = submitted(world, employee=world.outsider, data=days(MON))
    found = selectors.waiting_rows()
    assert [row.request.pk for row in found] == [first.pk, second.pk]
    assert (found[0].waiting_on, found[0].since, found[0].reminded_at, found[0].flagged_at) == (
        [display_name(world.manager_user)], NOW, None, None,
    )
    assert [row.request.pk for row in selectors.waiting_rows(employee_ids=[world.outsider.pk])] == [second.pk]


def test_outstanding_certificates_with_how_late_they_are(world, clock):
    late = submitted(world, request_type=world.sick, data=days(TODAY))
    covered = submitted(world, employee=world.peer, request_type=world.sick, data=days(TODAY))
    services.attach_file(actor=world.peer_user, request=covered, upload=pdf())
    (row,) = selectors.outstanding_certificates()
    assert (row.request.pk, row.due_at, row.overdue) == (late.pk, NOW + dt.timedelta(hours=48), None)
    clock.shift(dt.timedelta(hours=50))
    (row,) = selectors.outstanding_certificates()
    assert row.overdue == dt.timedelta(hours=2)
    assert selectors.outstanding_certificates(employee_ids=[world.peer.pk]) == []


def test_public_ids(world):
    request = submitted(world)
    assert selectors.public_ids([request.pk, 999999]) == {request.pk: str(request.public_id)}


# ------------------------------------------------------------------ configuration changed later (master D22)


def test_holiday_added_later_is_reported_not_applied(world, client_for):
    request = approved(world, data=days(MON, WED))
    pending = submitted(world, employee=world.peer, data=days(TUE))
    calendar_services.create_holiday(actor=world.hr_user, date=TUE, name_fr="Férié", name_en="Holiday")

    assert fresh(request).quantity == Decimal("3.00")  # the approved request is not rewritten
    assert compute_quantity(world.annual, days(MON, WED)) == Decimal("2.00")  # a new one counts the holiday
    assert [found.pk for found in selectors.requests_touching(TUE)] == [request.pk]  # pending ones are not listed

    response = client_for(world.hr_user).get(reverse("calendar:holiday-impact"), {"date": "2026-11-03"})
    assert response.status_code == 200
    assert response.json() == [
        {
            "public_id": str(request.public_id),
            "employee": "Amal Employee",
            "type": response.json()[0]["type"],
            "start_date": "2026-11-02",
            "end_date": "2026-11-04",
            "quantity": "3.00",
        }
    ]
    assert pending.status == "pending"
    bad = client_for(world.hr_user).get(reverse("calendar:holiday-impact"), {"date": "tuesday"})
    assert (bad.status_code, bad.json()["code"]) == (400, "calendar.date_required")
    assert client_for(world.manager_user).get(reverse("calendar:holiday-impact"), {"date": "2026-11-03"}).status_code == 403


def test_changing_the_working_week_does_not_rewrite_requests_already_sent(world):
    request = submitted(world, data=days(FRI, NEXT_MON))
    settings_service.set_value(actor=world.hr_user, key="working_week", value=[1, 2, 3, 4, 5, 6])
    assert fresh(request).quantity == Decimal("2.00")
    assert compute_quantity(world.annual, days(FRI, NEXT_MON)) == Decimal("3.00")
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_selectors.py -v`
Expected: 13 failed, the first with `AttributeError: module 'apps.requests.selectors' has no attribute 'day_rows'`.

- [ ] **Step 3: Implement the selectors**

In `backend/apps/requests/selectors.py`, extend three imports to:

```python
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from apps.calendar import workdays
```

```python
from .models import (
    Amendment,
    AmendmentKind,
    AmendmentStatus,
    ApproverRule,
    BalanceEffect,
    CalendarLabel,
    DocumentRule,
    ExceptionalEvent,
    Request,
    RequestStatus,
    RequestStep,
    RequestType,
    StepMode,
    StepStatus,
    Unit,
)
```

```python
from .services.data import amendment_data, data_of, day_diff, leave_days
```

and append:

```python
# ------------------------------------------------------------------ for balances, calendar and reports


@dataclass(frozen=True)
class DayRow:
    request_id: int
    request_public_id: str
    employee_id: int
    type_code: str
    day: date
    portion: Decimal
    hours: Decimal | None
    status: str


def day_rows(*, start: date, end: date, statuses, employee_ids=None, type_codes=None) -> list[DayRow]:
    """Requests cut into days, inside a period.

    A day-based request gives one row per working day (portion 1 or 0.5); an hourly permission gives one
    row with its hours. Days are counted with today's holidays and working week: a request approved
    before a holiday was added keeps its stored quantity until HR corrects it (master D22).
    """
    found = Request.objects.filter(
        status__in=list(statuses), start_date__lte=end, end_date__gte=start
    ).select_related("request_type")
    if employee_ids is not None:
        found = found.filter(employee_id__in=list(employee_ids))
    if type_codes is not None:
        found = found.filter(request_type__code__in=list(type_codes))
    rows: list[DayRow] = []
    for request in found:
        common = {
            "request_id": request.pk,
            "request_public_id": str(request.public_id),
            "employee_id": request.employee_id,
            "type_code": request.request_type.code,
            "status": request.status,
        }
        if request.request_type.unit == Unit.HOUR:
            rows.append(DayRow(day=request.start_date, portion=Decimal("0"), hours=request.quantity, **common))
            continue
        portions = workdays.day_portions(
            request.start_date,
            request.end_date,
            starts_at_midday=request.starts_at_midday,
            ends_at_midday=request.ends_at_midday,
        )
        rows.extend(
            DayRow(day=day, portion=portion, hours=None, **common)
            for day, portion in portions.items()
            if start <= day <= end
        )
    return sorted(rows, key=lambda row: (row.day, row.request_id))


def reserved_days(employee_id: int, *, ignoring_request_id: int | None = None) -> dict[date, Decimal]:
    """Annual-leave days an employee has asked for and not yet been granted (PRD 6.3, master D18)."""
    reserved: dict[date, Decimal] = defaultdict(Decimal)
    pending = Request.objects.filter(
        employee_id=employee_id,
        status=RequestStatus.PENDING,
        request_type__balance_effect=BalanceEffect.DEDUCTS_ANNUAL,
    ).select_related("request_type")
    changes = Amendment.objects.filter(
        request__employee_id=employee_id,
        request__request_type__balance_effect=BalanceEffect.DEDUCTS_ANNUAL,
        status=AmendmentStatus.PENDING,
        kind=AmendmentKind.CHANGE,
    ).select_related("request", "request__request_type")
    if ignoring_request_id is not None:
        pending = pending.exclude(pk=ignoring_request_id)
        changes = changes.exclude(request_id=ignoring_request_id)
    for request in pending:
        for day, portion in leave_days(request.request_type, data_of(request)).items():
            reserved[day] += portion
    for change in changes:
        request_type = change.request.request_type
        current = leave_days(request_type, data_of(change.request))
        _, added = day_diff(current, leave_days(request_type, amendment_data(change)))
        for day, portion in added.items():
            reserved[day] += portion
    return dict(reserved)


@dataclass(frozen=True)
class WaitingRow:
    request: Request
    step: RequestStep
    waiting_on: list[str]
    since: datetime | None
    reminded_at: datetime | None
    flagged_at: datetime | None


def waiting_rows(*, employee_ids=None) -> list[WaitingRow]:
    """Every step that waits for a decision, the longest wait first."""
    steps = _open_steps().select_related(
        "request", "request__request_type", "request__employee", "amendment", "named_person"
    )
    if employee_ids is not None:
        steps = steps.filter(request__employee_id__in=list(employee_ids))
    return [
        WaitingRow(
            request=step.request,
            step=step,
            waiting_on=chain.waiting_names(
                rule=step.approver_rule, named_person=step.named_person, requester=step.request.employee
            ),
            since=step.activated_at,
            reminded_at=step.reminded_at,
            flagged_at=step.flagged_at,
        )
        for step in steps.order_by("activated_at", "pk")
    ]


@dataclass(frozen=True)
class CertificateRow:
    request: Request
    due_at: datetime | None
    overdue: timedelta | None


def outstanding_certificates(*, employee_ids=None, now: datetime | None = None) -> list[CertificateRow]:
    """Pending requests whose required document has not arrived, the earliest deadline first."""
    now = now or timezone.now()
    found = (
        base_requests()
        .filter(
            status=RequestStatus.PENDING,
            request_type__document_rule=DocumentRule.REQUIRED_WITHIN_DEADLINE,
        )
        .exclude(attachment_links__step__isnull=True)
    )
    if employee_ids is not None:
        found = found.filter(employee_id__in=list(employee_ids))
    rows: list[CertificateRow] = []
    for request in found.order_by("certificate_due_at", "pk"):
        due = request.certificate_due_at
        rows.append(
            CertificateRow(request=request, due_at=due, overdue=now - due if due is not None and now >= due else None)
        )
    return rows


def requests_touching(day: date) -> QuerySet[Request]:
    """Approved day-based requests that cover a date: what a change of holiday on that date would affect."""
    return (
        Request.objects.filter(
            status=RequestStatus.APPROVED,
            request_type__unit=Unit.DAY,
            start_date__lte=day,
            end_date__gte=day,
        )
        .select_related("request_type", "employee")
        .order_by("start_date", "pk")
    )


def public_ids(request_ids) -> dict[int, str]:
    """The public identifier of each request id that exists."""
    found = Request.objects.filter(pk__in=list(request_ids)).values_list("pk", "public_id")
    return {pk: str(public_id) for pk, public_id in found}
```

- [ ] **Step 4: Add the holiday warning endpoint**

Append to `backend/apps/calendar/api/serializers.py`:

```python
class HolidayImpactOut(serializers.Serializer):
    """An approved request that covers the date of a holiday being added, moved or removed."""

    public_id = serializers.UUIDField()
    employee = serializers.CharField()
    type = serializers.CharField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    quantity = serializers.DecimalField(max_digits=9, decimal_places=2)
```

In `backend/apps/calendar/api/views.py`, add `from datetime import date` and `from ..lang import pick` to the imports, add `HolidayImpactOut` to the import from `.serializers`, and append:

```python
class HolidayImpactView(APIView):
    http_method_names = ["get"]
    access = {"GET": {Role.HR}}

    @extend_schema(
        operation_id="holidays_impact",
        parameters=[OpenApiParameter("date", str, required=True, description="ISO date")],
        responses=HolidayImpactOut(many=True),
    )
    def get(self, request):
        # Imported here: the calendar app stays loadable on its own, and requests builds on it.
        from apps.organisation.selectors import full_name
        from apps.requests.selectors import requests_touching

        try:
            day = date.fromisoformat(request.query_params.get("date") or "")
        except ValueError:
            raise DomainError("calendar.date_required", field="date") from None
        items = [
            {
                "public_id": found.public_id,
                "employee": full_name(found.employee),
                "type": pick(found.request_type.name_fr, found.request_type.name_en),
                "start_date": found.start_date,
                "end_date": found.end_date,
                "quantity": found.quantity,
            }
            for found in requests_touching(day)
        ]
        return Response(HolidayImpactOut(items, many=True).data)
```

Add to `urlpatterns` in `backend/apps/calendar/api/urls.py`, before the `holiday-detail` route:

```python
    path("holidays/impact", views.HolidayImpactView.as_view(), name="holiday-impact"),
```

Add to `CASES` in `backend/apps/calendar/tests/matrix.py`:

```python
    Case("calendar:holiday-impact", "GET", only(P.HR), query=lambda w: {"date": "2031-01-01"}),
```

- [ ] **Step 5: Regenerate the API description and run the tests**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: no line starting with `Warning`, then `backend/openapi.yaml is up to date.`

Run: `docker compose run --rm app pytest apps/requests/tests/test_selectors.py apps/calendar tests/test_permission_matrix.py tests/test_openapi.py -v`
Expected: 13 passed in `test_selectors.py`; the calendar tests, the matrix and the description check pass.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/requests backend/apps/calendar backend/openapi.yaml
git add frontend/src/api/schema.d.ts 2>/dev/null || true
git commit -m "feat(requests): selectors for balances, calendar and reports; holiday impact warning"
```

---

### Task 22: Jobs: reminders, HR flags and certificate deadlines

**Files:**
- Create: `backend/apps/requests/services/jobs.py`
- Create: `backend/apps/requests/tasks.py`
- Modify: `backend/apps/requests/services/__init__.py`
- Test: `backend/apps/requests/tests/test_jobs.py`

**Interfaces:**
- Consumes: `apps.calendar.workdays.working_days_between` (Task 1), `chain.resolve_rule` (Task 7), `notices.tell`, `tell_hr`, `tell_requester` (Task 8), `apps.settings.services.get("certificate_warning_hours")` (Task 9), `apps.core.jobs` (`RETRY`, `recorded`), `apps.core.models.JobStatus`, `procrastinate.contrib.django.app` (plan 01a).
- Produces:
  - `apps.requests.services.send_reminders_and_flags(*, now=None) -> dict[str, int]` (`{"reminded": n, "flagged": n}`): REQ-13. A step open for `reminder_after_days` working days gets one reminder to its approvers; a manager or named-person step open for `flag_after_days` working days is flagged to HR once. The delays are those copied onto the step when the request was sent.
  - `apps.requests.services.check_certificate_deadlines(*, now=None) -> dict[str, int]` (`{"due_soon": n, "overdue": n}`): PRD 6.5. The employee is told `certificate_warning_hours` before the deadline; HR is told at the deadline. Each once per request.
  - Tasks `requests.reminders_and_flags` (every hour) and `requests.certificate_deadlines` (every hour, at a quarter past)
  - Both services give the same result when run twice: the second run returns zeros and creates nothing

- [ ] **Step 1: Write the failing tests**

`backend/apps/requests/tests/test_jobs.py`:

```python
import pytest

from apps.core.models import JobStatus
from apps.notifications.models import Notification
from apps.requests import selectors, services, tasks
from apps.requests.models import RequestStep
from apps.requests.services import StepSpec
from apps.requests.tests.helpers import MON, NOW, TODAY, at, days, decide, pdf, pending_step, submitted
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db


def count(event: str, user=None) -> int:
    found = Notification.objects.filter(event_code=event)
    return found.filter(user=user).count() if user is not None else found.count()


def sick(world, **options):
    return submitted(world, request_type=world.sick, data=days(TODAY), **options)


# ------------------------------------------------------------------ reminders and flags (REQ-13)


def test_a_reminder_goes_out_after_two_working_days_and_only_once(world):
    request = submitted(world)  # Tuesday 6 October, 09:00
    assert services.send_reminders_and_flags(now=at(10, 8, 8, 59)) == {"reminded": 0, "flagged": 0}
    assert services.send_reminders_and_flags(now=at(10, 8, 9, 0)) == {"reminded": 1, "flagged": 0}
    assert count("step.reminder", world.manager_user) == 1
    assert pending_step(request).reminded_at == at(10, 8, 9, 0)
    assert services.send_reminders_and_flags(now=at(10, 8, 10, 0)) == {"reminded": 0, "flagged": 0}
    assert count("step.reminder") == 1


def test_the_weekend_does_not_count(world, clock):
    clock.move_to(at(10, 9, 16, 0))  # Friday afternoon
    submitted(world)
    assert services.send_reminders_and_flags(now=at(10, 12, 15, 59)) == {"reminded": 0, "flagged": 0}
    assert services.send_reminders_and_flags(now=at(10, 13, 16, 0)) == {"reminded": 1, "flagged": 0}


def test_a_manager_step_is_flagged_to_hr_after_four_working_days_and_only_once(world):
    request = submitted(world)
    services.send_reminders_and_flags(now=at(10, 8, 9, 0))
    assert services.send_reminders_and_flags(now=at(10, 9, 17, 0)) == {"reminded": 0, "flagged": 0}
    assert services.send_reminders_and_flags(now=at(10, 12, 9, 0)) == {"reminded": 0, "flagged": 1}
    assert count("step.flagged", world.hr_user) == 1
    assert pending_step(request).flagged_at == at(10, 12, 9, 0)
    assert [step.request_id for step in selectors.queue(world.hr_user, "stuck")] == [request.pk]
    assert services.send_reminders_and_flags(now=at(10, 13, 9, 0)) == {"reminded": 0, "flagged": 0}
    assert count("step.flagged") == 1


def test_an_hr_step_is_reminded_but_never_flagged(world):
    request = submitted(world)
    decide(request, world.manager_user)
    assert services.send_reminders_and_flags(now=at(10, 20, 9, 0)) == {"reminded": 1, "flagged": 0}
    assert count("step.reminder", world.hr_user) == 1
    assert pending_step(request).flagged_at is None


def test_the_delays_are_those_the_request_was_sent_with(world):
    submitted(world, request_type=world.remote, data=days(MON))
    services.replace_steps(
        actor=world.hr_user,
        request_type=world.remote,
        steps=[
            StepSpec(approver_rule="line_manager", reminder_after_days=1, flag_after_days=1),
            StepSpec(approver_rule="hr_role"),
        ],
    )
    assert services.send_reminders_and_flags(now=at(10, 7, 9, 0)) == {"reminded": 0, "flagged": 0}


def test_a_step_given_to_someone_else_starts_its_delays_again(world, clock):
    request = submitted(world)
    services.send_reminders_and_flags(now=at(10, 12, 9, 0))  # reminded and flagged
    clock.move_to(at(10, 12, 10, 0))
    services.reassign_step(
        actor=world.hr_user, step=pending_step(request), new_approver=world.other_manager, reason="Absence"
    )
    assert services.send_reminders_and_flags(now=at(10, 13, 10, 0)) == {"reminded": 0, "flagged": 0}
    assert services.send_reminders_and_flags(now=at(10, 14, 10, 0)) == {"reminded": 1, "flagged": 0}
    assert count("step.reminder", world.other_manager_user) == 1


def test_closed_requests_are_left_alone(world):
    request = submitted(world)
    services.withdraw(actor=world.owner_user, request=request)
    assert services.send_reminders_and_flags(now=at(10, 20, 9, 0)) == {"reminded": 0, "flagged": 0}
    assert RequestStep.objects.filter(reminded_at__isnull=False).count() == 0


# ------------------------------------------------------------------ certificate deadlines (PRD 6.5)


def test_the_employee_is_warned_twelve_hours_before_the_deadline_and_only_once(world):
    request = sick(world)  # due on Thursday 8 October, 09:00
    assert services.check_certificate_deadlines(now=at(10, 7, 20, 59)) == {"due_soon": 0, "overdue": 0}
    assert services.check_certificate_deadlines(now=at(10, 7, 21, 0)) == {"due_soon": 1, "overdue": 0}
    warning = Notification.objects.get(event_code="certificate.due_soon")
    assert (warning.user, warning.target_public_id) == (world.owner_user, str(request.public_id))
    assert warning.parameters["due"] == "08/10/2026 09:00"
    assert services.check_certificate_deadlines(now=at(10, 7, 22, 0)) == {"due_soon": 0, "overdue": 0}
    assert count("certificate.due_soon") == 1


def test_hr_is_told_at_the_deadline_and_only_once(world):
    sick(world)
    assert services.check_certificate_deadlines(now=at(10, 8, 9, 0)) == {"due_soon": 0, "overdue": 1}
    assert count("certificate.overdue", world.hr_user) == 1
    assert services.check_certificate_deadlines(now=at(10, 9, 9, 0)) == {"due_soon": 0, "overdue": 0}
    assert count("certificate.overdue") == 1
    assert count("certificate.due_soon") == 0  # the warning is not sent after the fact


def test_a_certificate_or_a_decision_ends_the_follow_up(world):
    with_certificate = sick(world)
    services.attach_file(actor=world.owner_user, request=with_certificate, upload=pdf())
    decided = sick(world, employee=world.peer)
    decide(decided, world.hr_user)
    assert services.check_certificate_deadlines(now=at(10, 9, 9, 0)) == {"due_soon": 0, "overdue": 0}
    assert count("certificate.overdue") == 0


def test_the_warning_delay_is_an_hr_setting(world):
    sick(world)
    settings_service.set_value(actor=world.hr_user, key="certificate_warning_hours", value=24)
    assert services.check_certificate_deadlines(now=at(10, 7, 9, 0)) == {"due_soon": 1, "overdue": 0}


# ------------------------------------------------------------------ the tasks


def test_the_tasks_record_their_runs(world):
    submitted(world)
    assert tasks.reminders_and_flags(0) == {"reminded": 0, "flagged": 0}
    assert tasks.certificate_deadlines(0) == {"due_soon": 0, "overdue": 0}
    for name in ("requests.reminders_and_flags", "requests.certificate_deadlines"):
        status = JobStatus.objects.get(name=name)
        assert status.last_ok is True
        assert status.last_finished_at == NOW
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_jobs.py -v`
Expected: collection error, `ImportError: cannot import name 'tasks' from 'apps.requests'`.

- [ ] **Step 3: Implement the job bodies**

`backend/apps/requests/services/jobs.py`:

```python
"""The bodies of the scheduled jobs. Each can run any number of times: what it did is remembered on the row."""

from __future__ import annotations

from datetime import datetime, timedelta

from django.db.models import Q
from django.utils import timezone

from apps.calendar import workdays
from apps.settings import services as settings_service

from ..models import (
    AmendmentStatus,
    ApproverRule,
    DocumentRule,
    Request,
    RequestStatus,
    RequestStep,
    StepMode,
    StepStatus,
)
from . import notices
from .chain import resolve_rule


def send_reminders_and_flags(*, now: datetime | None = None) -> dict[str, int]:
    """Remind approvers of steps left open, and alert HR to manager steps nobody decides (REQ-13).

    Delays are counted in working days from the moment the step became active, with the numbers that
    were copied onto the step when the request was sent.
    """
    now = now or timezone.now()
    reminded = flagged = 0
    open_steps = (
        RequestStep.objects.filter(status=StepStatus.PENDING, mode=StepMode.APPROVE, activated_at__isnull=False)
        .filter(
            Q(amendment__isnull=True, request__status=RequestStatus.PENDING)
            | Q(amendment__status=AmendmentStatus.PENDING)
        )
        .select_related("request", "request__employee", "named_person")
    )
    for step in open_steps:
        request = step.request
        elapsed = workdays.working_days_between(step.activated_at, now)
        resolution = resolve_rule(
            rule=step.approver_rule, named_person=step.named_person, requester=request.employee
        )
        stamp = f"{step.activated_at:%Y%m%d%H%M%S}"
        changed: list[str] = []
        if step.reminded_at is None and resolution.users and elapsed >= step.reminder_after_days:
            notices.tell(resolution.users, "step.reminder", request, dedupe_key=f"step:{step.pk}:reminder:{stamp}")
            step.reminded_at = now
            changed.append("reminded_at")
            reminded += 1
        if (
            step.flagged_at is None
            and step.flag_after_days is not None
            and resolution.rule != ApproverRule.HR_ROLE
            and elapsed >= step.flag_after_days
        ):
            notices.tell_hr(request, "step.flagged", dedupe_key=f"step:{step.pk}:flagged:{stamp}")
            step.flagged_at = now
            changed.append("flagged_at")
            flagged += 1
        if changed:
            step.save(update_fields=changed)
    return {"reminded": reminded, "flagged": flagged}


def check_certificate_deadlines(*, now: datetime | None = None) -> dict[str, int]:
    """Warn the employee before a certificate is due, and tell HR when it is overdue (PRD 6.5)."""
    now = now or timezone.now()
    warning = timedelta(hours=int(settings_service.get("certificate_warning_hours")))
    due_soon = overdue = 0
    waiting = (
        Request.objects.filter(
            status=RequestStatus.PENDING,
            certificate_due_at__isnull=False,
            request_type__document_rule=DocumentRule.REQUIRED_WITHIN_DEADLINE,
        )
        .exclude(attachment_links__step__isnull=True)
        .select_related("employee")
    )
    for request in waiting:
        due = request.certificate_due_at
        if now >= due:
            created = notices.tell_hr(
                request, "certificate.overdue", dedupe_key=f"request:{request.pk}:certificate_overdue"
            )
            overdue += 1 if created else 0
        elif now >= due - warning:
            created = notices.tell_requester(
                request,
                "certificate.due_soon",
                dedupe_key=f"request:{request.pk}:certificate_due_soon",
                due=f"{timezone.localtime(due):%d/%m/%Y %H:%M}",
            )
            due_soon += 1 if created else 0
    return {"due_soon": due_soon, "overdue": overdue}
```

Add to `backend/apps/requests/services/__init__.py`:

```python
from .jobs import check_certificate_deadlines, send_reminders_and_flags
```

and add both names to `__all__`.

- [ ] **Step 4: Declare the tasks**

`backend/apps/requests/tasks.py`:

```python
from procrastinate.contrib.django import app

from apps.core.jobs import RETRY, recorded

from . import services


@app.periodic(cron="0 * * * *")
@app.task(name="requests.reminders_and_flags", retry=RETRY, queueing_lock="requests.reminders_and_flags")
@recorded("requests.reminders_and_flags")
def reminders_and_flags(timestamp: int) -> dict[str, int]:
    return services.send_reminders_and_flags()


@app.periodic(cron="15 * * * *")
@app.task(name="requests.certificate_deadlines", retry=RETRY, queueing_lock="requests.certificate_deadlines")
@recorded("requests.certificate_deadlines")
def certificate_deadlines(timestamp: int) -> dict[str, int]:
    return services.check_certificate_deadlines()
```

Both run every hour, so the UTC rule for cron expressions (plan 01a, contract note 6) changes nothing here.

- [ ] **Step 5: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_jobs.py -v`
Expected: 12 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): hourly jobs for reminders, HR flags and certificate deadlines"
```

---

### Task 23: What a departure leaves open

**Files:**
- Create: `backend/apps/requests/services/departures.py`
- Modify: `backend/apps/requests/apps.py` (register two contributors)
- Test: `backend/apps/requests/tests/test_departures.py`

**Interfaces:**
- Consumes (plan 02): `apps.organisation.services.register_archive_contributor(fn)`, `ArchiveSection(key, items)`, `ArchiveItem(label, link="")`, `archive_preview(*, employee) -> ArchivePreview` (`.sections`), `apps.organisation.selectors.direct_reports(employee)`, `full_name(employee)`; the section keys `open_requests` and `open_steps`, for which plan 02's page already has titles.
- Produces:
  - `apps.requests.services.departures.open_requests_section(employee) -> ArchiveSection | None`: the leaver's own requests that are pending, returned, or approved and not yet over
  - `apps.requests.services.departures.open_steps_section(employee) -> ArchiveSection | None`: steps that wait for the leaver as line manager or as the person named
  - Both are registered with `organisation` when Django starts, so "Record a departure" (UI 7.9) lists them before HR confirms

- [ ] **Step 1: Write the failing tests**

`backend/apps/requests/tests/test_departures.py`:

```python
import pytest
from django.utils import translation

from apps.organisation import services as organisation_services
from apps.requests import services
from apps.requests.services import StepSpec
from apps.requests.tests.helpers import MON, TODAY, TUE, WED, approved, days, decide, fresh, submitted

pytestmark = pytest.mark.django_db


def section(employee, key):
    preview = organisation_services.archive_preview(employee=fresh(employee))
    return next((found for found in preview.sections if found.key == key), None)


def test_the_requests_a_leaver_leaves_open_are_listed(world):
    pending = submitted(world, data=days(MON))
    upcoming = approved(world, data=days(WED))
    refused = submitted(world, data=days(TUE))
    decide(refused, world.manager_user, "reject", "Non")

    with translation.override("en"):
        found = section(world.owner, "open_requests")

    assert [(item.label, item.link) for item in found.items] == [
        ("Annual leave · 02/11/2026", f"/requests/{pending.public_id}"),
        ("Annual leave · 04/11/2026", f"/requests/{upcoming.public_id}"),
    ]


def test_past_leave_and_other_people_are_not_listed(world, clock):
    approved(world, request_type=world.sick, data=days(TODAY))
    submitted(world, employee=world.peer, data=days(MON))
    clock.shift(3 * 24 * 3600)
    assert section(world.owner, "open_requests") is None


def test_the_steps_waiting_for_a_leaving_manager_are_listed(world):
    request = submitted(world, data=days(MON))
    services.replace_steps(
        actor=world.hr_user,
        request_type=world.remote,
        steps=[StepSpec(approver_rule="named_person", named_person=world.manager)],
    )
    named = submitted(world, employee=world.outsider, request_type=world.remote, data=days(TUE))

    found = section(world.manager, "open_steps")

    assert [item.link for item in found.items] == [f"/requests/{request.public_id}", f"/requests/{named.public_id}"]
    assert found.items[0].label.startswith("Amal Employee · ")
    assert section(world.other_manager, "open_steps") is None


def test_a_decided_step_is_no_longer_listed(world):
    request = submitted(world, data=days(MON))
    decide(request, world.manager_user)
    assert section(world.manager, "open_steps") is None
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/requests/tests/test_departures.py -v`
Expected: 2 failed, because `section(...)` is `None` where a section is expected. The two tests that expect no section pass already, since nothing is contributed yet.

- [ ] **Step 3: Implement the contributors**

`backend/apps/requests/services/departures.py`:

```python
"""What recording a departure would leave open (UI 7.9). Registered with organisation's archive preview."""

from __future__ import annotations

from django.db.models import Q
from django.utils import timezone

from apps.calendar.lang import pick
from apps.organisation import selectors as organisation_selectors
from apps.organisation.services import ArchiveItem, ArchiveSection

from ..models import AmendmentStatus, ApproverRule, Request, RequestStatus, RequestStep, StepMode, StepStatus
from .common import name_of
from .validation import fmt_range


def _described(request) -> str:
    request_type = request.request_type
    return f"{pick(request_type.name_fr, request_type.name_en)} · {fmt_range(request.start_date, request.end_date)}"


def open_requests_section(employee) -> ArchiveSection | None:
    """The leaver's own requests that still need somebody: waiting, sent back, or approved and not over."""
    today = timezone.localdate()
    found = (
        Request.objects.filter(employee=employee)
        .filter(
            Q(status__in=(RequestStatus.PENDING, RequestStatus.RETURNED))
            | Q(status=RequestStatus.APPROVED, end_date__gte=today)
        )
        .select_related("request_type")
        .order_by("start_date", "pk")
    )
    items = [ArchiveItem(label=_described(request), link=f"/requests/{request.public_id}") for request in found]
    return ArchiveSection(key="open_requests", items=items) if items else None


def open_steps_section(employee) -> ArchiveSection | None:
    """Steps that wait for the leaver, as line manager of the requester or as the person named."""
    reports = list(organisation_selectors.direct_reports(employee).values_list("pk", flat=True))
    steps = (
        RequestStep.objects.filter(status=StepStatus.PENDING, mode=StepMode.APPROVE)
        .filter(
            Q(amendment__isnull=True, request__status=RequestStatus.PENDING)
            | Q(amendment__status=AmendmentStatus.PENDING)
        )
        .filter(
            Q(approver_rule=ApproverRule.LINE_MANAGER, request__employee_id__in=reports)
            | Q(approver_rule=ApproverRule.NAMED_PERSON, named_person=employee)
        )
        .select_related("request", "request__request_type", "request__employee")
        .order_by("activated_at", "pk")
    )
    items = [
        ArchiveItem(
            label=f"{name_of(step.request.employee)} · {_described(step.request)}",
            link=f"/requests/{step.request.public_id}",
        )
        for step in steps
    ]
    return ArchiveSection(key="open_steps", items=items) if items else None
```

In `backend/apps/requests/apps.py`, replace the `ready` method with its final form:

```python
    def ready(self) -> None:
        from apps.core.i18n import register_messages
        from apps.organisation.services import register_archive_contributor
        from apps.settings.registry import SettingDef, register

        from .messages import MESSAGES
        from .services import attachments, departures, notices

        register_messages(MESSAGES)
        notices.register_events()
        attachments.register_access_rules()
        register_archive_contributor(departures.open_requests_section)
        register_archive_contributor(departures.open_steps_section)
        register(
            SettingDef(key="certificate_deadline_hours", group="hr", kind="int", default=48, minimum=1, maximum=720)
        )
        register(
            SettingDef(key="certificate_warning_hours", group="hr", kind="int", default=12, minimum=1, maximum=720)
        )
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/requests/tests/test_departures.py apps/organisation -q`
Expected: 4 passed in `test_departures.py`; plan 02's tests still pass with the two contributors registered.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/requests
git commit -m "feat(requests): list open requests and steps before a departure is recorded"
```

---

### Task 24: Sensitive-content sweep, demo data and the whole-step check

**Files:**
- Modify: `backend/apps/requests/tests/matrix.py` (sensitive cases)
- Create: `backend/apps/calendar/seed.py`
- Create: `backend/apps/requests/seed.py`
- Modify: `backend/apps/core/management/commands/seed_demo.py` (two lines in `SEEDERS`)
- Test: `backend/apps/requests/tests/test_sensitive_sweep.py`
- Test: `backend/apps/requests/tests/test_seed.py`
- Test: `backend/apps/requests/tests/test_openapi_requests.py`

**Interfaces:**
- Consumes: everything of this plan; the routes `notifications:list`, `audit:business` (plan 01a) and `files:download` (plan 02); `apps.audit.models.AuditEvent`, `apps.notifications.models.Notification`; the demo accounts of plan 01a and their employee records of plan 02, found by their fixed addresses.
- Produces:
  - Matrix cases that pin who sees a sick leave and who downloads a certificate or a proof
  - `test_no_endpoint_leaks_the_sick_leave_comment`: the sweep of master section 10, item 9, for this plan's endpoints
  - `apps.calendar.seed.seed()` (demo public holidays for this year and the next) and `apps.requests.seed.seed()` (demo exceptional events and six requests in the main states). Both are safe to run twice.
  - A test that the committed OpenAPI description names every operation of this plan and gives `RequestOut` the fields of master 7.9

- [ ] **Step 1: Add the sensitive cases to the permission matrix**

In `backend/apps/requests/tests/matrix.py`, add after the function `_certificate`:

```python
def certificate_of(world):
    """The medical certificate on the peer's sick leave."""
    return _once(
        world,
        "certificate",
        lambda: services.attach_file(
            actor=world.peer_user, request=sick_leave(world), upload=_certificate()
        ).attachment,
    )


def proof_of(world):
    """A proof on an exceptional leave of the owner."""

    def build():
        request = services.create_draft(
            actor=world.owner_user,
            employee=world.owner,
            request_type=world.exceptional,
            data=RequestData(start_date=_day(25), end_date=_day(25), exceptional_event_id=world.event.pk),
        )
        request = services.submit(actor=world.owner_user, request=request)
        return services.attach_file(actor=world.owner_user, request=request, upload=_certificate()).attachment

    return _once(world, "proof", build)


# The sick leave belongs to the peer: their manager, HR and executives see that it exists.
SICK_LEAVE_CIRCLE = only(P.PEER, P.MANAGER, P.HR, P.EXEC, hide=(P.OWNER, P.OTHER_MANAGER, P.OUTSIDER))
```

Append before the final `CASES = ...` line, and change that line as shown:

```python
SENSITIVE_CASES = [
    Case("requests:request-detail", "GET", SICK_LEAVE_CIRCLE, kwargs=_id(sick_leave), label="sick leave"),
    Case("requests:request-attachments", "GET", SICK_LEAVE_CIRCLE, kwargs=_id(sick_leave), label="sick leave"),
    Case("requests:request-history", "GET", SICK_LEAVE_CIRCLE, kwargs=_id(sick_leave), label="sick leave"),
    Case(
        "files:download",
        "GET",
        # Only the employee and HR open a medical file. Everyone else, signed in or not, finds nothing.
        only(P.PEER, P.HR, hide=(P.OWNER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.EXEC, P.SYSADMIN)),
        kwargs=lambda w: {"public_id": certificate_of(w).public_id},
        label="medical certificate",
    ),
    Case(
        "files:download",
        "GET",
        only(P.OWNER, P.MANAGER, P.HR, P.EXEC, hide=(P.PEER, P.OTHER_MANAGER, P.OUTSIDER, P.SYSADMIN)),
        kwargs=lambda w: {"public_id": proof_of(w).public_id},
        label="proof of an event",
    ),
]

CASES = CONFIG_CASES + READ_CASES + WRITE_CASES + STEP_CASES + SENSITIVE_CASES
```

The status says who gets in. What they then read is pinned by the sweep below.

- [ ] **Step 2: Write the sweep**

`backend/apps/requests/tests/test_sensitive_sweep.py`:

```python
"""Master section 10, item 9: nothing medical reaches a manager, an executive, a colleague or the trail."""

import json

import pytest
from django.urls import reverse

from apps.audit.models import AuditEvent
from apps.notifications.models import Notification
from apps.requests import services
from apps.requests.tests.helpers import TODAY, days, decide, fresh, pdf, submitted

pytestmark = pytest.mark.django_db

SECRETS = ("zz-secret-grippe", "zz-secret-certificat", "zz-secret-retour")


@pytest.fixture
def story(world):
    """A sick leave with a comment, a certificate, a return by HR with a comment, and a resubmission."""
    request = submitted(world, request_type=world.sick, data=days(TODAY, comment="ZZ-SECRET-GRIPPE sévère"))
    services.attach_file(actor=world.owner_user, request=request, upload=pdf("zz-secret-certificat.pdf"))
    decide(request, world.hr_user, "return", "ZZ-SECRET-RETOUR : certificat illisible")
    returned = fresh(request)
    services.submit(actor=world.owner_user, request=returned, expected_version=returned.version)
    return request


def everything_readable_by(client, request) -> str:
    """The body of every read endpoint that could mention the request, whatever the status of the answer."""
    one = {"public_id": request.public_id}
    calls = [
        (reverse("requests:request-list"), {}),
        (reverse("requests:request-list"), {"scope": "team"}),
        (reverse("requests:request-list"), {"scope": "all"}),
        (reverse("requests:request-list"), {"scope": "decided"}),
        (reverse("requests:request-detail", kwargs=one), {}),
        (reverse("requests:request-history", kwargs=one), {}),
        (reverse("requests:request-attachments", kwargs=one), {}),
        (reverse("requests:request-amendments", kwargs=one), {}),
        (reverse("requests:approval-list"), {}),
        (reverse("requests:approval-list"), {"queue": "hr"}),
        (reverse("requests:approval-list"), {"queue": "certificates"}),
        (reverse("requests:approval-list"), {"queue": "stuck"}),
        (reverse("notifications:list"), {}),
        (reverse("audit:business"), {}),
    ]
    return b"\n".join(client.get(url, params).content for url, params in calls).decode().lower()


def test_no_endpoint_leaks_the_sick_leave_comment(world, client_for, story):
    others = (
        world.manager_user,
        world.exec_user,
        world.peer_user,
        world.other_manager_user,
        world.outsider_user,
        world.sysadmin_user,
    )
    for user in others:
        text = everything_readable_by(client_for(user), story)
        for secret in SECRETS:
            assert secret not in text, f"{secret} reached {user.email}"


def test_the_manager_still_sees_that_the_sick_leave_exists(world, client_for, story):
    body = client_for(world.manager_user).get(
        reverse("requests:request-detail", kwargs={"public_id": story.public_id})
    ).json()
    assert (body["type"]["code"], body["status"], body["comment"], body["comment_hidden"]) == (
        "sick", "pending", None, True,
    )
    assert (body["certificate"], body["attachments"]) == (None, [])


def test_the_requester_and_hr_read_all_of_it(world, client_for, story):
    for user in (world.owner_user, world.hr_user):
        text = client_for(user).get(
            reverse("requests:request-detail", kwargs={"public_id": story.public_id})
        ).content.decode().lower()
        for secret in SECRETS:
            assert secret in text, f"{secret} is missing for {user.email}"


def test_nothing_medical_is_stored_in_notifications_or_in_the_audit_trail(world, story):
    stored = json.dumps(
        [
            list(Notification.objects.values_list("event_code", "parameters", "target_public_id")),
            list(AuditEvent.objects.values_list("action", "changes", "object_label")),
        ],
        default=str,
    ).lower()
    for secret in SECRETS:
        assert secret not in stored
    assert AuditEvent.objects.filter(action="step.decided").exists()
    assert Notification.objects.filter(event_code="request.returned").exists()
```

- [ ] **Step 3: Run the sweep and the matrix**

Run: `docker compose run --rm app pytest apps/requests/tests/test_sensitive_sweep.py tests/test_permission_matrix.py -v`
Expected: 4 passed in the sweep; the matrix passes with the sensitive cases. Nothing has to be implemented for this step: Tasks 6, 8, 12, 13 and 17 already keep medical detail out. A failure here names the endpoint or the row that leaks; fix the leak where it is, never the test.

- [ ] **Step 4: Write the failing test for the demo data**

`backend/apps/requests/tests/test_seed.py`:

```python
import pytest

from apps.calendar import seed as calendar_seed
from apps.calendar.models import PublicHoliday
from apps.requests import seed as requests_seed
from apps.requests.models import ExceptionalEvent, Request

pytestmark = pytest.mark.django_db


def test_demo_holidays_cover_this_year_and_the_next(world):
    calendar_seed.seed()
    calendar_seed.seed()
    assert PublicHoliday.objects.filter(date__year=2026).count() == 8
    assert PublicHoliday.objects.filter(date__year=2027).count() == 8
    assert PublicHoliday.objects.filter(recurs_yearly=False).count() == 0


def test_demo_requests_show_the_main_states_and_can_be_seeded_twice(world):
    calendar_seed.seed()
    requests_seed.seed()
    requests_seed.seed()

    assert ExceptionalEvent.objects.filter(name_en__in=["Birth", "Death of a close relative"]).count() == 2
    found = {
        (request.employee.professional_email.split("@")[0], request.request_type.code, request.status)
        for request in Request.objects.select_related("employee", "request_type")
    }
    assert found == {
        ("employee.a1", "annual", "pending"),
        ("employee.a1", "remote", "approved"),
        ("employee.a1", "permission", "draft"),
        ("employee.a2", "sick", "pending"),
        ("manager.a", "annual", "approved"),
        ("employee.b1", "remote", "pending"),
    }
```

Run: `docker compose run --rm app pytest apps/requests/tests/test_seed.py -v`
Expected: collection error, `ImportError: cannot import name 'seed' from 'apps.calendar'`.

- [ ] **Step 5: Write the seeders**

`backend/apps/calendar/seed.py`:

```python
"""Demo public holidays for development and browser tests. HR enters the real list at go-live."""

from datetime import date

from django.utils import timezone

from . import selectors, services

# Fixed-date holidays only. The religious holidays move each year and are left to HR.
FIXED = [
    (1, 1, "Jour de l'an", "New Year's Day"),
    (3, 20, "Fête de l'Indépendance", "Independence Day"),
    (4, 9, "Journée des Martyrs", "Martyrs' Day"),
    (5, 1, "Fête du Travail", "Labour Day"),
    (7, 25, "Fête de la République", "Republic Day"),
    (8, 13, "Journée de la Femme", "Women's Day"),
    (10, 15, "Fête de l'Évacuation", "Evacuation Day"),
    (12, 17, "Fête de la Révolution", "Revolution Day"),
]


def seed() -> None:
    this_year = timezone.localdate().year
    for year in (this_year, this_year + 1):
        existing = {holiday.date for holiday in selectors.holidays_of_year(year)}
        for month, day, name_fr, name_en in FIXED:
            if date(year, month, day) not in existing:
                services.create_holiday(
                    actor=None, date=date(year, month, day), name_fr=name_fr, name_en=name_en, recurs_yearly=True
                )
```

`backend/apps/requests/seed.py`:

```python
"""Demo requests for development and browser tests: one of each main state, on the demo cast of plan 01a."""

from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.calendar import workdays
from apps.organisation import reach

from . import selectors, services
from .models import Decision, ExceptionalEvent, Request, RequestStatus, RequestStep, StepStatus
from .services import RequestData

EVENTS = [
    ("Mariage", "Marriage", Decimal("3"), True),
    ("Naissance", "Birth", Decimal("2"), True),
    ("Décès d'un proche", "Death of a close relative", Decimal("3"), False),
]


def _account(local_part: str):
    return get_user_model().objects.get(email=f"{local_part}@impactrisks.com")


def _ask(user, code: str, start, end=None, *, send: bool = True, **fields) -> Request:
    request = services.create_draft(
        actor=user,
        employee=reach.employee_of(user),
        request_type=selectors.get_type_by_code(code),
        data=RequestData(start_date=start, end_date=end or start, **fields),
    )
    return services.submit(actor=user, request=request) if send else request


def _approve(request: Request) -> Request:
    """Take a request through its chain, each step decided by someone who may decide it."""
    while request.status == RequestStatus.PENDING:
        step = RequestStep.objects.get(request=request, amendment=None, status=StepStatus.PENDING)
        approver = services.resolve_approvers(step)[0]
        request = services.decide_step(
            actor=approver, step=step, decision=Decision.APPROVE, expected_version=request.version
        )
    return request


@transaction.atomic
def seed() -> None:
    for name_fr, name_en, allowed, proof in EVENTS:
        if not ExceptionalEvent.objects.filter(name_en=name_en).exists():
            ExceptionalEvent.objects.create(
                name_fr=name_fr, name_en=name_en, days_allowed=allowed, proof_required=proof
            )
    if Request.objects.exists():
        return  # already seeded

    today = timezone.localdate()
    last_working_day = today
    while not workdays.is_working_day(last_working_day):
        last_working_day -= timedelta(days=1)

    def ahead(count: int):
        return workdays.add_working_days(today, count)

    owner = _account("employee.a1")
    peer = _account("employee.a2")
    manager = _account("manager.a")
    outsider = _account("employee.b1")

    # Waiting for the manager.
    _ask(owner, "annual", ahead(10), ahead(11), comment="Vacances en famille")
    # Approved and coming up.
    _approve(_ask(owner, "remote", ahead(3)))
    # Not sent yet.
    _ask(owner, "permission", ahead(5), start_time=time(9, 0), end_time=time(10, 30), send=False)
    # Waiting for HR, without its certificate.
    _ask(peer, "sick", last_working_day, comment="Fièvre")
    # A manager who will be away: the delegation prompt is waiting in their notifications.
    _approve(_ask(manager, "annual", ahead(15)))
    # Waiting for the other manager. This person has no leave balance in plan 04's demo data.
    _ask(outsider, "remote", ahead(4))
```

In `backend/apps/core/management/commands/seed_demo.py`, append two lines to `SEEDERS`, after `"apps.organisation.seed",`:

```python
    "apps.calendar.seed",
    "apps.requests.seed",
```

When plan 04 adds `"apps.balances.seed"`, it must come before `"apps.requests.seed"`: the demo asks for two days of annual leave for `employee.a1` and one for `manager.a`, and from plan 04 on these are checked against the demo balances.

- [ ] **Step 6: Run the seed test and the command**

Run: `docker compose run --rm app pytest apps/requests/tests/test_seed.py -v`
Expected: 2 passed.

Run: `docker compose exec app python manage.py e2e_reset`
Expected: the command ends without error and prints `seeded apps.calendar.seed` and `seeded apps.requests.seed`.

- [ ] **Step 7: Check the committed API description**

`backend/apps/requests/tests/test_openapi_requests.py`:

```python
"""The committed OpenAPI description carries the request engine as master 7.8 and 7.9 define it."""

from pathlib import Path

import yaml
from django.conf import settings

OPERATIONS = {
    "holidays_list", "holidays_create", "holidays_update", "holidays_delete", "holidays_copy", "holidays_impact",
    "request_types_list", "request_types_create", "request_types_detail", "request_types_update",
    "request_types_steps", "request_types_steps_replace", "request_types_chain_preview",
    "exceptional_events_list", "exceptional_events_create", "exceptional_events_update",
    "requests_list", "requests_create", "requests_preview", "requests_detail", "requests_update",
    "requests_discard", "requests_submit", "requests_withdraw", "requests_attachments", "requests_attach",
    "requests_amendments", "requests_amend", "amendments_withdraw", "requests_correct", "requests_cancel",
    "requests_reclassify", "requests_history", "approvals_list", "steps_decide", "steps_record_on_behalf",
    "steps_reassign",
}

REQUEST_OUT = {
    "public_id", "version", "employee", "type", "start_date", "end_date", "starts_at_midday", "ends_at_midday",
    "start_time", "end_time", "quantity", "event", "comment", "comment_hidden", "status", "state", "certificate",
    "amendment", "has_override", "created_by_hr", "viewer", "submitted_at", "decided_at", "created_at",
}


def document() -> dict:
    return yaml.safe_load((Path(settings.BASE_DIR) / "openapi.yaml").read_text(encoding="utf-8"))


def test_every_operation_of_the_request_engine_is_described():
    described = {
        operation["operationId"]
        for methods in document()["paths"].values()
        for method, operation in methods.items()
        if method in {"get", "post", "put", "patch", "delete"}
    }
    assert OPERATIONS - described == set()


def test_the_request_shapes_match_the_master_plan():
    schemas = document()["components"]["schemas"]
    assert set(schemas["RequestOut"]["properties"]) == REQUEST_OUT
    assert set(schemas["RequestDetailOut"]["properties"]) == REQUEST_OUT | {
        "steps", "attachments", "amendments", "decision_context",
    }
    assert set(schemas["RequestStateOut"]["properties"]) == {"key", "waiting_on", "last_actor", "note", "since"}
    assert set(schemas["RequestViewerOut"]["properties"]) == {"relation", "actions", "step_id"}
    assert set(schemas["PaginatedRequestOut"]["properties"]) == {"count", "next", "previous", "results"}
    assert set(schemas["PreviewOut"]["properties"]) == {
        "quantity", "skipped_days", "chain", "balance", "usage", "certificate_due_at", "problems",
    }
```

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: `backend/openapi.yaml is up to date.` with no change, since every task regenerated it.

Run: `docker compose run --rm app pytest apps/requests/tests/test_openapi_requests.py tests/test_openapi.py -v`
Expected: all pass.

- [ ] **Step 8: Check the public face of the services package**

`backend/apps/requests/services/__init__.py` must now read as follows. Replace it if it differs.

```python
"""The write side of the request engine. Import names from here: `from apps.requests import services`."""

from .amendments import open_amendment, withdraw_amendment
from .attachments import attach_file, may_read_attachment
from .chain import can_act_on, chain_preview, is_eligible_approver, resolve_approvers, resolve_rule
from .config import StepSpec, create_event, create_request_type, replace_steps, update_event, update_request_type
from .data import RequestData, compute_quantity, data_of, leave_days
from .drafts import create_draft, discard_draft, update_request
from .hr_actions import hr_cancel, hr_correct, reclassify_as_annual
from .jobs import check_certificate_deadlines, send_reminders_and_flags
from .lifecycle import decide_step, submit, withdraw
from .onbehalf import reassign_step, record_on_behalf
from .preview import Preview, preview
from .validation import validate

__all__ = [
    "Preview",
    "RequestData",
    "StepSpec",
    "attach_file",
    "can_act_on",
    "chain_preview",
    "check_certificate_deadlines",
    "compute_quantity",
    "create_draft",
    "create_event",
    "create_request_type",
    "data_of",
    "decide_step",
    "discard_draft",
    "hr_cancel",
    "hr_correct",
    "is_eligible_approver",
    "leave_days",
    "may_read_attachment",
    "open_amendment",
    "preview",
    "reassign_step",
    "reclassify_as_annual",
    "record_on_behalf",
    "replace_steps",
    "resolve_approvers",
    "resolve_rule",
    "send_reminders_and_flags",
    "submit",
    "update_event",
    "update_request",
    "update_request_type",
    "validate",
    "withdraw",
    "withdraw_amendment",
]
```

- [ ] **Step 9: Format, lint and run everything**

Run: `docker compose run --rm app ruff format apps/calendar apps/requests`
Expected: files reformatted or left unchanged. The code blocks of this plan are written for a line length of 120; let the formatter settle any line the project's configuration finds too long.

Run: `docker compose run --rm app ruff check .`
Expected: `All checks passed!`

Run: `docker compose run --rm app pytest -q`
Expected: no failure. The suite now includes the tests of plans 01a and 02, the calendar and requests apps, the permission matrix with every route of this plan, the message catalogue check and the OpenAPI check.

Run: `docker compose run --rm app python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`.

- [ ] **Step 10: See the five types run end to end**

This is the "done when" of the step: all five types run end to end through the API without balances.

Run: `docker compose run --rm app pytest apps/requests/tests/test_api_write.py apps/requests/tests/test_api_steps.py apps/requests/tests/test_sick_leave.py apps/requests/tests/test_amendments.py apps/requests/tests/test_chain.py -q`
Expected: no failure. Between them these tests take annual leave, sick leave, exceptional leave, an hourly permission and remote work from creation to a final status.

- [ ] **Step 11: Commit**

```bash
git add backend/apps/requests backend/apps/calendar backend/apps/core/management/commands/seed_demo.py backend/openapi.yaml
git add frontend/src/api/schema.d.ts 2>/dev/null || true
git commit -m "test(requests): sensitive-content sweep, demo data and whole-step verification"
```

---

## Spec coverage

| Requirement or section | Tasks |
|---|---|
| REQ-01 create for oneself, draft, submit; quantity computed by the server | 3, 6, 9, 19 |
| REQ-02 HR creates for anyone; exception with a mandatory reason; normal chain afterwards | 5, 6, 9, 19 |
| REQ-03 validation on submission with specific, translated messages | 2 (texts), 5, 9, 18 (preview), 19 |
| REQ-04 chain copied at submission | 8, 9 |
| REQ-05 approve, reject with reason, return with comment | 10, 20 |
| REQ-06 returned request edited and resubmitted; chain restarts | 8, 11 |
| REQ-07 edit and withdraw before the first decision; withdraw only afterwards | 6, 11, 17 (actions) |
| REQ-08 amendment after approval, same chain, one at a time, original in force | 14, 19 |
| REQ-09 HR corrects, shortens or cancels with a reason; employee and manager notified | 15, 19 |
| REQ-10 decision recorded on behalf: who, when, channel, note, scan | 13, 20 |
| REQ-11 delegation | Plan 02. Here: delegates resolved as approvers (7), in queues (20) |
| REQ-12 prompt to name a delegate when a manager's leave is approved | 8 |
| REQ-13 reminder after 2 working days, flag to HR after 4, per step; reassign | 13, 22 |
| REQ-14 never approved automatically | 8 (HR step added when nobody decided) |
| REQ-15 HR step assigned to the role | 7 |
| REQ-16 files by the requester or HR; PDF, JPG, PNG up to 10 MB | 12, 19 (formats and size are enforced by plan 02's `files`) |
| REQ-17 full history | 18 (every service records on the request: 6, 9 to 16) |
| REQ-18 two approvers at once: the second gets "already processed" | 6 (`locked`), 9, 10, 11 |
| PRD 5.3 lifecycle, step statuses, amendment statuses | 2 (enumerations), 8 to 15 |
| CAL-01 public holidays with French and English names | 1 |
| ADM-01 request types | 2 |
| ADM-02 approval chain per type | 2, 7 (preview for an employee) |
| ADM-03 exceptional-leave events | 2 |
| ADM-04 public holidays | 1, 21 (warning) |
| ADM-05 HR settings of this step: working week, certificate deadline and warning | 1, 9, 22 |
| PRD 6.1 working days | 1, 3 |
| PRD 6.3 balance check at submission and at final approval, under the employee lock | 4, 5, 8, 9 (through the port; the rule itself is plan 04) |
| PRD 6.4 overlap | 5 |
| PRD 6.5 sick leave | 9 (deadline), 12, 16, 22 |
| PRD 6.6 exceptional leave | 5, 12, 17 (`missing` proof) |
| PRD 6.7 hourly permission | 3, 5, 18 (month hours) |
| PRD 6.8 remote work cap | 5, 17, 18 |
| PRD 6.9 approver resolution | 7, 8 |
| PRD 7 permission matrix, request rows | 17 (reach), matrix cases in 2, 7, 18, 19, 20, 24 |
| PRD 8.3, 8.4 data model | 1, 2, 3 |
| PRD 9.3 explicit sub-resources, 409 on version | 19, 20 |
| PRD 9.5 jobs: reminders and flags, certificate deadlines | 22 |
| NOT-02 events raised by the request engine | 8, 9 to 16, 22 |
| NOT-03 no sick-leave comment or medical detail in a notification | 8, 16, 24 |
| AUD-02 every create, update and decision | 6, 9 to 16 |
| AUD-05 sick-leave comment not copied into the trail | 6, 10, 16, 24 |
| UI 3.5 status sentences (the `state` object) | 17 |
| UI 5.3 what the form shows without asking | 18 (preview) |
| UI 5.4, 6.2, 7.8, 8.3 actions per viewer | 17 |
| UI 6.1, 7.2 to 7.4 queues | 20 |
| UI 7.9 consequences of a departure | 23 |
| UI 7.12 warning when a holiday change affects approved requests | 21 |
| UI 10.2 what each workspace sees of a request | 17, 24 |
| Master D10, D12, D13, D17, D18, D21, D22 | 9; 5; 7 and 8; 16; 14 and 21; 6; 21 |
| Master 6.11 cast and matrix | 2 (cast), cases in every API task |
| Master 7.8 (plan 03a rows), 7.9 | 1, 21; 2 to 22 |
| Master 10 review focus, items 1, 3, 4, 5, 9 | Review Focus above |

## Contract notes

Choices made where the master is silent, and what the other plans need to know. Nothing here changes a name, route, access set or shape the master fixes.

**Checked against the plans that are final (01a, 02, 04)**

1. Plan 01a: services pass `actor=actor` to `audit.record`; every `@extend_schema` has a unique `operation_id` (the 37 ids are listed in Task 24); every choice set of this plan has an entry in `ENUM_NAME_OVERRIDES` (Tasks 2 and 18); each API task regenerates `backend/openapi.yaml`; the two tasks run hourly, so the UTC rule for cron changes nothing; `Case.format="multipart"` is used for the upload case; the cast builder reseeds the five request types by calling the seed migration's own function when a transactional test has emptied the tables.
2. Plan 02: the selectors, `reach`, delegation services, `files.store_upload` and `register_access_rule` are used with their final signatures. The archive contributors use the keys `open_requests` and `open_steps`. `delegation.prompt` links to `/team/delegations?from={from}&to={to}` with ISO dates, the form plan 02's page reads. This plan creates no employee in its tests: it uses the cast, plan 01a's `make_user` for an account without a record, and services to change the cast (disable an account, give a role, create a delegation).
3. Plan 04: every name it assumed exists as assumed: `apps.requests.models.Decision` (`APPROVE`, `REJECT`, `RETURN`), `apps.requests.ports` (`BalancePort`, `BalanceVerdict`, `BalancePreview`, `NullBalancePort`, `set_balance_port`, `balance_port`), `selectors.reserved_days`, `selectors.day_rows` and `DayRow`, `selectors.queue(user, name).get(request=request)`, and the services its integration tests drive. `request.balance_insufficient` carries `shortfall` as a `Decimal` at submission, at final approval and at reclassification. `selectors.public_ids(ids)`, which its note 12 asks for, is provided (Task 21). Its autouse fixture `_null_balance_port` and this plan's autouse fixture `port` (a recording fake, for `apps/requests/tests/` only) do not conflict: the nearer one is installed last and removed first. Its seeder must stay before `apps.requests.seed`; the demo asks two annual days for `employee.a1` and one for `manager.a`, none for `employee.b1`.

**Additions to the master's lists**

4. Error codes: `request.half_day_both_ends`, `type_code_taken`, `type_fixed`, `type_half_day_hours`, `type_cap_incomplete`, `type_unknown`, `named_person_required`, `step_delay_invalid`, `event_days_invalid`, `scope_invalid`, `queue_invalid`, `filter_invalid`, `amendment_cannot_return`, `decided_at_future`, `channel_invalid`, `approver_without_account`, `dates_required`, `nothing_to_change`, `not_reclassifiable`; `calendar.holiday_exists`, `calendar.year_invalid`, `calendar.date_required`. Quantities in problem parameters (`shortfall`, `limit`, `used`, `allowed`) are numbers, written per language by `translate`.
5. Notification event `step.informed`: sent by a notify-mode step of a request that is not sensitive (the master names only `sick.declared`). Notifications carry the employee's name and the dates, never a type name, a comment or a file name.
6. Selectors beyond 7.9: `base_requests`, `can_see`, `filter_requests`, `has_document`, `document_requirement`, `history`, `get_amendment_for`, `get_step`, `via_delegation_from`, `public_ids`, and the configuration readers of Task 2. Services beyond 7.9: the configuration services of Task 2, `chain_preview`, `is_eligible_approver`, `may_read_attachment`. `preview` takes one more keyword, `ignoring_request_id`.
7. Audit actions: `holiday.created`, `.updated`, `.deleted`, `.copied`; `requesttype.created`, `.updated`, `.steps_replaced`; `exceptionalevent.created`, `.updated`; `request.created`, `.updated`, `.discarded`, `.submitted`, `.withdrawn`, `.approved`, `.rejected`, `.returned`, `.corrected`, `.cancelled`, `.reclassified`, `.attachment_added`; `step.decided`, `.recorded_on_behalf`, `.reassigned`; `amendment.opened`, `.withdrawn`, `.approved`, `.rejected`. All request, step and amendment events are recorded on the request (`object_type` `request`), which is what the history endpoint reads.

**For plan 03b (pages)**

8. `POST requests/preview` accepts an optional `request` (public id). Send it when editing a draft, a returned request or a pending one, or the request collides with itself.
9. `PATCH requests/{public_id}` changes only the fields sent, needs `version`, and does not take `override_reason` (fixed when HR creates the request).
10. `viewer.actions` is complete and ordered for display. `viewer.step_id` is the open step when the viewer has `decide`, `record_on_behalf` or `reassign`, else null.
11. A change to an approved request is approved or refused, never sent back (`request.amendment_cannot_return`). The step to decide belongs to an amendment exactly when `status` is `approved` and `amendment.status` is `pending`: show Approve and Refuse only.
12. `GET request-types` and `GET exceptional-events` return everything to HR and executives; add `?active=1` for a form. `GET approvals` also takes `type` and `department`.
13. `GET requests` filters: `status`, `type` (comma-separated), `employee`, `department`, `year`, `from`, `to`, `on_behalf`, `has_override`, `ordering`.
14. `certificate` is null for everyone but the requester and HR (UI 10.2), also on requests that are not sensitive. `comment_hidden` tells a hidden comment from an empty one. On a sensitive request, step comments, the return or refusal note and amendment reasons are hidden with it.
15. `RequestAttachmentOut.kind` is a plain string (`medical`, `proof`, `scanned_form`), to stay clear of the enumeration of plan 02's `files`.
16. `GET holidays/impact?date=` returns `[{public_id, employee, type, start_date, end_date, quantity}]`.

**Rules chosen where the specs are silent**

17. A draft is seen and edited only by the account that created it. A draft HR prepares for an employee appears to the employee once HR sends it.
18. A request HR entered with an exception cannot be edited or resent by the employee (they can withdraw it); HR does it. HR never gives an exception, corrects, cancels, reclassifies or records a decision on its own request.
19. HR may decide a manager or named-person step itself once that step is flagged (permission matrix: "when flagged"); before that it records the manager's decision or gives the step to someone else.
20. When every step of a chain was informed or skipped, an HR step is added so that a person decides (REQ-14). A type left without steps gets the same HR step.
21. Reclassification as annual leave is the HR decision on the request: it approves the open HR step and the chain goes on from there.
22. `hr_correct` lifts limits like an HR exception (past dates, notice, cap, event days, balance) and posts only the difference of days; it never allows an overlap. It is refused while a change asked by the employee is waiting.
23. At the final approval of a change, rules that depend on today are judged as of the day the change was asked for; overlap and balance are judged at approval.
24. Overlap also counts the new dates of a change that is waiting. A permission may overlap remote work but not an absence; two permissions of one person cannot share the same time. Noon separates morning from afternoon for permissions.
25. A cap counts pending and approved requests by their current dates. The override lifts notice together with past dates.
26. `RequestStep.flag_after_days` is empty on HR steps: they are reminded, never flagged. A reassigned step starts its delays again.
27. Deciders must have an employee record (master 7.9); the resolution still lists an HR holder without one, who then gets `request.actor_without_record`.
28. Day rows, the calendar and reports count days with today's holidays and working week; the stored `quantity` of a request already sent does not change (master D22).

**Reads across apps through this app's own foreign keys**

29. `Employee.user` (the account of an employee, for notifications and named approvers), `created_by` compared with `employee__user` (the "entered by HR" filter), `Employee.manager` (resolution and teammates), and the columns of `files.Attachment` behind `RequestAttachment.attachment` (name, size, kind). The master offers no selector for these; each is a read of a row this app already points to.

**Files outside the master's layout**

30. `apps/calendar/lang.py` (`active_lang`, `pick`), `apps/calendar/seed.py`, `apps/requests/representation.py`, `apps/requests/ports.py`, `apps/requests/tests/helpers.py` and `conftest.py`, and the `services/` package of `requests` with one module per subject.
