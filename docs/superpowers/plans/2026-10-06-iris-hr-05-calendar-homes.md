# IRIS HR 05: Calendar and Home Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** give every role a calendar that shows exactly what it may see, give My space and Overview their home, complete the My team home and its People list, and show in the workspace switcher how many things wait in each workspace.

**Architecture:** the calendar feed is a read-only selector in the `calendar` app that turns approved and pending requests into entries, with one function deciding what each scope may reveal. Home screens and switcher counts are read-only aggregations in a new `reports` app that call the selectors of `requests`, `balances` and `organisation`. On the frontend one calendar component (month, week, phone agenda) is mounted by four thin pages, and the homes are registered in `app/homes.ts`.

**Tech Stack:** Python 3.13, Django 5.2, Django REST Framework, drf-spectacular, pytest-django, time-machine. React 19, TypeScript (strict), Tailwind CSS v4 with `tokens.css`, the interface primitives of plan 01b, TanStack Query v5, React Router v7, react-i18next, openapi-fetch, date-fns, Vitest, Testing Library, MSW v2, Playwright.

**Spec:**

- `docs/superpowers/plans/2026-10-06-iris-hr-00-master-plan.md` (binding contract: sections 7.8, 7.11, 9.1, 9.3, 9.4)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-prd-design.md` (5.5, 5.7, 7, 10)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-ui-design.md` (2, 3.2, 5.1, 5.7, 6.1, 6.3, 6.5, 7.10, 8.1, 8.4)
- `docs/design/README.md`, `docs/design/iris-hr-tokens.css`

**Depends on:** plans 01a, 01b, 02, 03a, 03b and 04, all executed. Their contract notes were read; this plan uses their final names.

## Global Constraints

Master plan section 2 applies in full. The constraints below bear directly on this plan and are copied from the specs.

From the PRD:

- CAL-02: "The calendar has month and week views and shows public holidays."
- CAL-03: "An employee sees approved absences and remote days of people in their own department, labelled only "Absent" or "Remote". Hourly permissions are not shown."
- CAL-04: "A manager sees their reports' requests with the type, including pending ones."
- CAL-05: "HR and Executive Management see the whole company with the type."
- CAL-06: "A pending request is visible only to the requester, their manager or delegate, HR and Executive Management."
- Permission matrix, Calendar row: Employee "Dept, type hidden"; Manager "Team with type"; HR "All with type"; Executive "All with type"; Sys. Admin "No".
- Permission matrix, Balance and ledger row: Employee "Own"; Manager "Team"; HR "All"; Executive "All"; Sys. Admin "No".
- Section 10, Privacy: "Peers see "Absent", never the type. Exports and notifications carry no medical detail."
- A9: "Hourly permissions are not shown on colleagues' calendars."
- Section 9.2: "Views, jobs and other apps call services; they do not query another app's tables."
- Section 9.3: "Dates use ISO 8601." Section 8: "Timestamps are stored with time zone and shown in Africa/Tunis time."
- NFR-02: "95% of API calls answer in under 500 ms."

From the UI document:

- M3: "A home has at most four blocks, each answering a question that role asks every day. A block with nothing to show shrinks to one line or disappears."
- M9: "Nothing is shown that carries no information or leads to no action: no chart where a number is enough, no counter nobody acts on."
- M10: "The figure a person came for is shown first and alone. An employee sees one balance, not a table of balances."
- M1: "One primary action per page." M4: "A list shows at most six attributes per item." M5: "At most three filters are visible. Others are one step away." M8: "Nothing is shown that the user cannot use."
- U7: "Every action is acknowledged, and the page shows the new state without a manual refresh."
- U8: "Every page works on a phone, with a keyboard alone and with a screen reader. Target: WCAG 2.1 AA." U9: "French and English are complete and equal. No screen mixes the two."
- 3.2: "The switcher shows, per workspace, how many things are waiting there (for example "My team: 3")."
- 5.7: "Colleagues appear as "Absent" or "Remote" with their name, nothing more." and "Not shown: types, reasons, hourly permissions."
- 6.3: "Shown per person: name, position, today (in, absent, remote), annual balance, requests waiting."
- 8: "The whole workspace is read-only: it contains no editing action at all, so nothing appears disabled."

From `docs/design/README.md`:

- "One primary button per page; no disabled controls — what a role can't use is not shown."
- "Statuses are sentences from the viewer's angle, with a coloured dot."
- "Logo cyan `#0AA2D0` is for the logo and graphics only; IRIS blue `#0070B0` carries text and buttons."
- "Every text/background pair meets WCAG 2.1 AA; touch targets are 44px on phone."
- "Sick-leave comments and certificates appear only to the requester and HR."

From the plans this one builds on:

- Plan 01a: every `@extend_schema` has a unique `operation_id`; a choice set has one name in `ENUM_NAME_OVERRIDES`; the OpenAPI test fails on any warning; each API task regenerates `backend/openapi.yaml`.
- Plan 01b: in tests a missing translation key throws; a page shows `PageLoading` while its query is pending and throws the query's error to the shell.
- Plan 04: every backend test runs without balances unless it asks for the `ledger_port` fixture.

Specific to this plan:

- The calendar feed returns the exact shape of master 7.8. No field is added to it.
- In `department` scope the server ignores the `department`, `employee`, `type` and `status` filters. A filter there would let a colleague infer a type.
- "Today" is always `timezone.localdate()` (Africa/Tunis), never a UTC date.
- Files of earlier plans are changed only by appending an element, adding or replacing one line, or replacing a file whose full content this plan gives.

## Review Focus

The inputs most likely to hurt a person using what this plan builds. Each has a test in the task named.

1. **A colleague learns why someone is away.** In the department calendar a colleague's sick leave must read "Absent" with no type, no status and no link; a colleague's pending request, hourly permission, cancelled or refused request must not appear at all; adding `type=sick` to the address must change nothing. Tests: Task 2 (`test_department_scope_*`), Task 3 (`test_department_scope_ignores_filters`), Task 8 (the privacy sweep as every persona), Task 17 (browser).
2. **A request that crosses the edge of what is displayed.** Leave from 27 November to 2 December shown in a November month view, or a half-day that starts before the window: the entry must be clipped to the window and must keep a half-day flag only at an end that is really inside it. Tests: Task 2 (`test_entries_are_clipped_to_the_window`), Task 9 (`partForDay`).
3. **A person the code does not expect.** A System Administrator without an employee record, an executive with no direct report, a manager who is also somebody's delegate: each must receive a correct answer (403, empty, or both teams), never a server error. Tests: Task 3, Task 5 (`test_delegate_sees_the_delegated_team`), Task 7 (`test_sysadmin_without_record`).
4. **A home with nothing to show.** A new employee with no ledger line and no request, a team with nobody away, a company with one department: the page must render, the balance must read zero, and empty blocks must shrink or disappear rather than show an empty table. Tests: Task 4 (`test_home_me_for_a_new_employee`), Tasks 12, 13 and 15 (empty states).
5. **The clock at a boundary.** "Today" a few minutes after midnight in Tunis while it is still yesterday in UTC, a weekend, and "previous month" in January: the figures must follow the Tunis calendar. Tests: Task 5 (`test_today_is_the_tunis_date`, `test_nobody_is_marked_away_on_a_day_off`), Task 6 (`test_previous_month_in_january`).

---

## File structure

Backend, new files:

| File | Responsibility |
|---|---|
| `backend/apps/requests/spans.py` | One read for other apps: requests as date spans with their type's calendar label |
| `backend/tests/request_flows.py` | This plan's test clock, and short wrappers around plan 03a's request helpers |
| `backend/apps/calendar/feed.py` | `calendar_feed`: who sees which entry, and how much of it |
| `backend/apps/calendar/api/feed_serializers.py`, `feed_views.py` | `GET calendar` |
| `backend/apps/reports/` | New app: `apps.py`, `home.py` (the three homes), `summary.py` (switcher counts), `api/`, `tests/` |

Backend, files of earlier plans that receive one appended element: `apps/calendar/selectors.py` (a re-export line), `apps/calendar/messages.py` (three keys), `apps/calendar/api/urls.py` (one route), `apps/calendar/tests/matrix.py` (cases), `config/settings.py` (`INSTALLED_APPS`, `ENUM_NAME_OVERRIDES`), `config/api_urls.py`, `backend/tests/test_permission_matrix.py` (`MATRIX_MODULES`). `backend/openapi.yaml` and `frontend/src/api/schema.d.ts` are regenerated.

This plan adds no demo data: the demo requests of plan 03a and the demo balances of plan 04 already give every page of this plan something to show.

Frontend, new files:

| File | Responsibility |
|---|---|
| `frontend/src/features/calendar/model.ts` | Pure date logic: grids, ranges, which part of a day an entry covers |
| `frontend/src/features/calendar/dates.ts` | Weekday names, day names and period titles in both languages |
| `frontend/src/features/calendar/api.ts` | `useCalendar` |
| `frontend/src/features/calendar/CalendarView.tsx`, `CalendarToolbar.tsx` | Month grid, week grid, phone agenda, keyboard navigation; previous, today, next, month or week |
| `frontend/src/features/calendar/useCalendarState.ts`, `filters.ts`, `CompanyCalendar.tsx`, `pages/*.tsx` | The four pages and what they share |
| `frontend/src/features/home/api.ts` | `useMeHome`, `useTeamHome`, `useOverviewHome` |
| `frontend/src/features/home/RequestLines.tsx`, `MeHomePage.tsx`, `TeamHomePage.tsx`, `OverviewHomePage.tsx` | The homes |
| `frontend/src/features/home/PeopleCells.tsx` | The "today" and "annual balance" cells of the People list |
| `frontend/src/i18n/locales/{fr,en}/calendar.json`, `home.json` | Texts |
| `frontend/e2e/calendar-privacy.spec.ts`, `overview-nothing-stuck.spec.ts`, `homes-phone.spec.ts` | Browser journeys |

Frontend, files of earlier plans: `workspaces/{me,team,hr,overview}/routes.tsx` (one route appended each), `app/homes.ts` (two lines added, one replaced), `features/shell/workspaceCounts.ts` (replaced), `api/types.ts` (types appended), `test/handlers.ts` (two default answers appended), `features/employees/peopleColumns.tsx` (two columns appended).

The dates used in tests: 1 November 2026 is a Sunday, so 2 to 6 November 2026 are Monday to Friday, and 30 November 2026 is a Monday. Backend tests of this plan freeze the clock on Monday 2 November 2026 at 08:00 in Tunis.

---

### Task 1: Request spans and the test clock

Other apps may not read the `requests` tables. The calendar and the homes need requests as date ranges with their type's label, which no selector of plan 03a gives in one piece (`day_rows` loses whether a single half-day is a morning or an afternoon). This task adds that one read inside the `requests` app, and the small test module every later backend task of this plan imports.

**Files:**
- Create: `backend/apps/requests/spans.py`
- Create: `backend/tests/request_flows.py`
- Test: `backend/apps/requests/tests/test_spans.py`

**Interfaces:**
- Consumes (plan 03a): `apps.requests.models.Request`, `RequestType`; `apps.requests.services.RequestData`, `resolve_approvers(step) -> list[User]`; the test helpers of `apps/requests/tests/helpers.py`: `submitted(world, *, employee, actor, request_type, data)`, `approved(world, ...)` with the same options, `decide(request, by, decision="approve", comment="")`, `pending_step(request)`, `fresh(instance)`. (Plan 04): `apps.balances.tests.world.give_opening(employee, days, on=date(2025, 12, 31))`; the autouse fixture `_null_balance_port` of `backend/conftest.py` (every test runs without balances unless it asks for `ledger_port`). The cast `world` (master 6.11).
- Produces:

```python
# apps/requests/spans.py
@dataclass(frozen=True)
class RequestSpan:
    request_id: int
    request_public_id: str
    employee_id: int
    type_code: str
    type_name_fr: str
    type_name_en: str
    unit: str                 # "day" | "hour"
    calendar_label: str       # "absent" | "remote" | "hidden"
    start_date: date
    end_date: date
    starts_at_midday: bool
    ends_at_midday: bool
    status: str

def request_spans(*, start: date, end: date, statuses: Iterable[str],
                  employee_ids: Iterable[int] | None = None,
                  type_codes: Iterable[str] | None = None) -> list[RequestSpan]
def absence_type_codes() -> set[str]          # codes of types whose calendar_label is "absent"

# backend/tests/request_flows.py
NOW = datetime(2026, 11, 2, 8, 0, tzinfo=ZoneInfo("Africa/Tunis"))       # a Monday
def give_balance(world, employee, days: str = "20") -> None                # an opening balance
def send(world, *, employee, user, request_type, start: date, end: date, **flags) -> Request     # created and sent
def approved(world, *, employee, user, request_type, start: date, end: date, **flags) -> Request  # sent, then approved at every step
def decide(request, decision: str, comment: str = "") -> Request           # the waiting step, by its first approver
```

- [ ] **Step 1: Write the test module**

It adds nothing to plan 03a's helpers but a clock and a call shape with dates instead of a `RequestData`.

```python
# backend/tests/request_flows.py
"""The test clock of plan 05, and short wrappers around plan 03a's request helpers."""
from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from apps.balances.tests.world import give_opening
from apps.requests import services as request_services
from apps.requests.services import RequestData
from apps.requests.tests import helpers as request_helpers

# Monday 2 November 2026, 08:00 in Tunis. The calendar and home tests freeze the clock here:
# 2 to 6 November are working days, and no demo holiday falls in November.
NOW = datetime(2026, 11, 2, 8, 0, tzinfo=ZoneInfo("Africa/Tunis"))


def give_balance(world, employee, days: str = "20") -> None:
    """An opening balance, for tests that read balances or run with the real ledger (`ledger_port`)."""
    give_opening(employee, days)


def send(world, *, employee, user, request_type, start: date, end: date, **flags):
    """A request created and sent by `user` for `employee`. `flags` are RequestData fields."""
    return request_helpers.submitted(
        world, employee=employee, actor=user, request_type=request_type,
        data=RequestData(start_date=start, end_date=end, **flags),
    )


def approved(world, *, employee, user, request_type, start: date, end: date, **flags):
    """The same request, approved at every step by whoever may decide it."""
    return request_helpers.approved(
        world, employee=employee, actor=user, request_type=request_type,
        data=RequestData(start_date=start, end_date=end, **flags),
    )


def decide(request, decision: str, comment: str = ""):
    """Decide the step that is waiting, as the first person who may act on it."""
    step = request_helpers.pending_step(request_helpers.fresh(request))
    approver = request_services.resolve_approvers(step)[0]
    return request_helpers.decide(request, approver, decision, comment)
```

- [ ] **Step 2: Write the failing test**

```python
# backend/apps/requests/tests/test_spans.py
from datetime import date

import pytest
import time_machine

from apps.requests.spans import absence_type_codes, request_spans
from tests.request_flows import NOW, approved, send

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def test_a_span_carries_dates_flags_type_and_label(world):
    request = approved(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
                       start=date(2026, 11, 3), end=date(2026, 11, 5), ends_at_midday=True)

    spans = request_spans(start=date(2026, 11, 1), end=date(2026, 11, 30), statuses=["approved"])

    assert len(spans) == 1
    span = spans[0]
    assert span.request_id == request.id
    assert span.request_public_id == str(request.public_id)
    assert span.employee_id == world.owner.id
    assert (span.type_code, span.unit, span.calendar_label) == ("annual", "day", "absent")
    assert (span.start_date, span.end_date) == (date(2026, 11, 3), date(2026, 11, 5))
    assert (span.starts_at_midday, span.ends_at_midday) == (False, True)
    assert span.status == "approved"
    assert span.type_name_fr and span.type_name_en


def test_spans_are_filtered_by_window_status_employee_and_type(world):
    approved(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
             start=date(2026, 11, 3), end=date(2026, 11, 4))
    send(world, employee=world.peer, user=world.peer_user, request_type=world.remote,
         start=date(2026, 11, 10), end=date(2026, 11, 10))

    november = {"start": date(2026, 11, 1), "end": date(2026, 11, 30)}
    assert len(request_spans(**november, statuses=["approved", "pending"])) == 2
    assert len(request_spans(**november, statuses=["approved"])) == 1
    assert len(request_spans(**november, statuses=["approved", "pending"], employee_ids=[world.peer.id])) == 1
    assert len(request_spans(**november, statuses=["approved", "pending"], type_codes=["remote"])) == 1
    assert request_spans(start=date(2026, 11, 5), end=date(2026, 11, 9), statuses=["approved", "pending"]) == []
    assert request_spans(**november, statuses=["approved"], employee_ids=[]) == []


def test_a_span_that_only_touches_the_window_is_returned_whole(world):
    approved(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
             start=date(2026, 11, 30), end=date(2026, 12, 2))

    spans = request_spans(start=date(2026, 11, 1), end=date(2026, 11, 30), statuses=["approved"])

    assert [(s.start_date, s.end_date) for s in spans] == [(date(2026, 11, 30), date(2026, 12, 2))]


def test_absence_type_codes_are_the_types_labelled_absent(world):
    assert absence_type_codes() == {"annual", "sick", "exceptional"}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `docker compose run --rm app pytest apps/requests/tests/test_spans.py -v`
Expected: FAIL at collection with `ModuleNotFoundError: No module named 'apps.requests.spans'`.

- [ ] **Step 4: Write the implementation**

```python
# backend/apps/requests/spans.py
"""Requests as date spans, for the calendar and the home screens.

This is the read other apps use when they need a request's dates together with
its type's calendar label. It returns plain data, never model instances, and it
applies no reach rule: the caller decides which employees it may ask about.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from apps.requests.models import CalendarLabel, Request, RequestType


@dataclass(frozen=True)
class RequestSpan:
    request_id: int
    request_public_id: str
    employee_id: int
    type_code: str
    type_name_fr: str
    type_name_en: str
    unit: str
    calendar_label: str
    start_date: date
    end_date: date
    starts_at_midday: bool
    ends_at_midday: bool
    status: str


def request_spans(*, start: date, end: date, statuses: Iterable[str],
                  employee_ids: Iterable[int] | None = None,
                  type_codes: Iterable[str] | None = None) -> list[RequestSpan]:
    """Every request in one of `statuses` that touches [start, end], with its real dates."""
    queryset = (Request.objects
                .filter(status__in=list(statuses), start_date__lte=end, end_date__gte=start)
                .select_related("request_type")
                .order_by("start_date", "employee_id", "id"))
    if employee_ids is not None:
        queryset = queryset.filter(employee_id__in=list(employee_ids))
    if type_codes is not None:
        queryset = queryset.filter(request_type__code__in=list(type_codes))
    return [
        RequestSpan(
            request_id=request.id,
            request_public_id=str(request.public_id),
            employee_id=request.employee_id,
            type_code=request.request_type.code,
            type_name_fr=request.request_type.name_fr,
            type_name_en=request.request_type.name_en,
            unit=request.request_type.unit,
            calendar_label=request.request_type.calendar_label,
            start_date=request.start_date,
            end_date=request.end_date,
            starts_at_midday=request.starts_at_midday,
            ends_at_midday=request.ends_at_midday,
            status=request.status,
        )
        for request in queryset
    ]


def absence_type_codes() -> set[str]:
    """Codes of the request types that count as an absence on the calendar."""
    return set(RequestType.objects.filter(calendar_label=CalendarLabel.ABSENT).values_list("code", flat=True))
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `docker compose run --rm app pytest apps/requests/tests/test_spans.py -v`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/requests/spans.py backend/apps/requests/tests/test_spans.py backend/tests/request_flows.py
git commit -m "feat(requests): expose requests as date spans for calendar and homes"
```

---

### Task 2: The calendar feed selector

One function decides what each scope reveals. Everything the department calendar hides is hidden here, on the server.

**Files:**
- Create: `backend/apps/calendar/feed.py`
- Modify: `backend/apps/calendar/selectors.py` (append one line at the end)
- Modify: `backend/apps/calendar/messages.py` (add three keys to `MESSAGES`)
- Test: `backend/apps/calendar/tests/test_feed.py`

**Interfaces:**
- Consumes: `apps.requests.spans.request_spans`, `RequestSpan` and `tests.request_flows` (Task 1); `apps.organisation.reach.employee_of(user)`, `team_ids(user, *, on=None)`, `department_peer_ids(user)`; `apps.organisation.selectors.directory()`, `full_name(employee)`; `apps.organisation.services.create_delegation(*, actor, manager, delegate, start_date, end_date)`; `apps.accounts.roles.Role`, `has_role(user, *roles)`; `apps.core.errors.DomainError`, `NotAllowed`; `apps.calendar.models.PublicHoliday`; `apps.calendar.services.create_holiday(*, actor, date, name_fr, name_en, recurs_yearly=False)`; `apps.requests.services.withdraw(*, actor, request)`.
- Produces:

```python
# apps/calendar/feed.py   (re-exported by apps/calendar/selectors.py)
@dataclass(frozen=True)
class FeedHoliday: date: date; name_fr: str; name_en: str
@dataclass(frozen=True)
class FeedEntry:
    employee_public_id: str; employee_name: str
    start_date: date; end_date: date; starts_at_midday: bool; ends_at_midday: bool
    label: str                                   # "absent" | "remote" | "hidden"
    type_code: str | None; type_name_fr: str | None; type_name_en: str | None
    status: str | None; request_public_id: str | None
    mine: bool
@dataclass(frozen=True)
class CalendarFeed: holidays: list[FeedHoliday]; entries: list[FeedEntry]

MAX_WINDOW_DAYS = 100
def calendar_feed(user, *, start: date, end: date, scope: str, department_id: int | None = None,
                  employee_public_id: str | None = None, type_code: str | None = None,
                  status: str | None = None) -> CalendarFeed
```

Error codes: `calendar.window_invalid` (param `max_days`), `calendar.scope_unknown`, `calendar.scope_not_allowed`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/calendar/tests/test_feed.py
from datetime import date, time

import pytest
import time_machine

from apps.calendar import services as calendar_services
from apps.calendar.feed import calendar_feed
from apps.core.errors import DomainError, NotAllowed
from apps.organisation import selectors as org_selectors
from apps.organisation import services as org_services
from apps.requests import services as request_services
from tests.request_flows import NOW, approved, decide, send

pytestmark = pytest.mark.django_db

NOVEMBER = {"start": date(2026, 11, 1), "end": date(2026, 11, 30)}


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def entries_of(feed, employee):
    return [entry for entry in feed.entries if entry.employee_public_id == str(employee.public_id)]


# --- department scope -------------------------------------------------------------------

def test_department_scope_shows_a_colleague_as_absent_and_nothing_else(world):
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
             start=date(2026, 11, 2), end=date(2026, 11, 3))

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    [entry] = entries_of(feed, world.peer)
    assert entry.label == "absent"
    assert entry.employee_name == org_selectors.full_name(world.peer)
    assert (entry.start_date, entry.end_date) == (date(2026, 11, 2), date(2026, 11, 3))
    assert entry.type_code is None
    assert entry.type_name_fr is None and entry.type_name_en is None
    assert entry.status is None
    assert entry.request_public_id is None
    assert entry.mine is False


def test_department_scope_labels_remote_work_as_remote(world):
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.remote,
             start=date(2026, 11, 4), end=date(2026, 11, 4))

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    [entry] = entries_of(feed, world.peer)
    assert entry.label == "remote"
    assert entry.type_code is None


def test_department_scope_hides_a_colleagues_pending_request(world):
    send(world, employee=world.peer, user=world.peer_user, request_type=world.annual,
         start=date(2026, 11, 10), end=date(2026, 11, 12))

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    assert entries_of(feed, world.peer) == []


def test_department_scope_hides_a_colleagues_hourly_permission(world):
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.permission,
             start=date(2026, 11, 4), end=date(2026, 11, 4), start_time=time(9, 0), end_time=time(11, 0))

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    assert entries_of(feed, world.peer) == []


def test_department_scope_hides_refused_and_withdrawn_requests(world):
    refused = send(world, employee=world.peer, user=world.peer_user, request_type=world.annual,
                   start=date(2026, 11, 10), end=date(2026, 11, 10))
    decide(refused, "reject", "Too many people away")
    withdrawn = send(world, employee=world.peer, user=world.peer_user, request_type=world.annual,
                     start=date(2026, 11, 17), end=date(2026, 11, 17))
    request_services.withdraw(actor=world.peer_user, request=withdrawn)

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    assert entries_of(feed, world.peer) == []


def test_department_scope_shows_my_own_requests_in_full_including_pending(world):
    request = send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
                   start=date(2026, 11, 10), end=date(2026, 11, 12))

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    [entry] = entries_of(feed, world.owner)
    assert entry.mine is True
    assert entry.type_code == "annual"
    assert entry.type_name_fr and entry.type_name_en
    assert entry.status == "pending"
    assert entry.request_public_id == str(request.public_id)


def test_department_scope_does_not_show_another_department(world):
    approved(world, employee=world.outsider, user=world.outsider_user, request_type=world.annual,
             start=date(2026, 11, 10), end=date(2026, 11, 12))

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    assert entries_of(feed, world.outsider) == []


def test_department_scope_ignores_every_filter(world):
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
             start=date(2026, 11, 2), end=date(2026, 11, 3))
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.remote,
             start=date(2026, 11, 5), end=date(2026, 11, 5))

    plain = calendar_feed(world.owner_user, **NOVEMBER, scope="department")
    probed = calendar_feed(world.owner_user, **NOVEMBER, scope="department", type_code="sick",
                           status="pending", employee_public_id=str(world.owner.public_id),
                           department_id=world.dept_b.id)

    assert probed == plain
    assert len(entries_of(probed, world.peer)) == 2


def test_department_scope_is_empty_for_an_account_without_employee_record(world):
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.remote,
             start=date(2026, 11, 4), end=date(2026, 11, 4))

    feed = calendar_feed(world.sysadmin_user, **NOVEMBER, scope="department")

    assert feed.entries == []


# --- team scope -------------------------------------------------------------------------

def test_team_scope_shows_types_and_pending_requests_of_the_team_only(world):
    pending = send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
                   start=date(2026, 11, 10), end=date(2026, 11, 12))
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
             start=date(2026, 11, 2), end=date(2026, 11, 3))
    approved(world, employee=world.outsider, user=world.outsider_user, request_type=world.annual,
             start=date(2026, 11, 10), end=date(2026, 11, 12))

    feed = calendar_feed(world.manager_user, **NOVEMBER, scope="team")

    [owner_entry] = entries_of(feed, world.owner)
    assert (owner_entry.type_code, owner_entry.status) == ("annual", "pending")
    assert owner_entry.request_public_id == str(pending.public_id)
    [peer_entry] = entries_of(feed, world.peer)
    assert (peer_entry.type_code, peer_entry.status, peer_entry.label) == ("sick", "approved", "absent")
    assert entries_of(feed, world.outsider) == []


def test_team_scope_filters_by_person_and_type(world):
    send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
         start=date(2026, 11, 10), end=date(2026, 11, 12))
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.remote,
             start=date(2026, 11, 4), end=date(2026, 11, 4))

    by_person = calendar_feed(world.manager_user, **NOVEMBER, scope="team",
                              employee_public_id=str(world.peer.public_id))
    by_type = calendar_feed(world.manager_user, **NOVEMBER, scope="team", type_code="annual")

    assert {entry.employee_public_id for entry in by_person.entries} == {str(world.peer.public_id)}
    assert {entry.type_code for entry in by_type.entries} == {"annual"}


def test_team_scope_includes_the_team_of_a_manager_who_delegated_to_me(world):
    approved(world, employee=world.outsider, user=world.outsider_user, request_type=world.annual,
             start=date(2026, 11, 10), end=date(2026, 11, 12))
    org_services.create_delegation(actor=world.hr_user, manager=world.other_manager, delegate=world.manager,
                                   start_date=date(2026, 11, 2), end_date=date(2026, 11, 20))

    feed = calendar_feed(world.manager_user, **NOVEMBER, scope="team")

    assert len(entries_of(feed, world.outsider)) == 1


def test_team_scope_is_refused_to_someone_who_manages_nobody(world):
    with pytest.raises(NotAllowed) as raised:
        calendar_feed(world.owner_user, **NOVEMBER, scope="team")
    assert raised.value.code == "calendar.scope_not_allowed"


# --- company scope ----------------------------------------------------------------------

def test_company_scope_shows_everyone_with_types_to_hr_and_executives(world):
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
             start=date(2026, 11, 2), end=date(2026, 11, 3))
    approved(world, employee=world.outsider, user=world.outsider_user, request_type=world.annual,
             start=date(2026, 11, 10), end=date(2026, 11, 12))

    for viewer in (world.hr_user, world.exec_user):
        feed = calendar_feed(viewer, **NOVEMBER, scope="company")
        assert {entry.type_code for entry in feed.entries} == {"sick", "annual"}
        assert len(entries_of(feed, world.peer)) == 1
        assert len(entries_of(feed, world.outsider)) == 1


def test_company_scope_filters_by_department_person_type_and_status(world):
    send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
         start=date(2026, 11, 10), end=date(2026, 11, 12))
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.remote,
             start=date(2026, 11, 4), end=date(2026, 11, 4))
    approved(world, employee=world.outsider, user=world.outsider_user, request_type=world.annual,
             start=date(2026, 11, 17), end=date(2026, 11, 18))

    def feed(**filters):
        return calendar_feed(world.hr_user, **NOVEMBER, scope="company", **filters)

    assert {e.employee_public_id for e in feed(department_id=world.dept_b.id).entries} == {str(world.outsider.public_id)}
    assert {e.employee_public_id for e in feed(employee_public_id=str(world.peer.public_id)).entries} == {str(world.peer.public_id)}
    assert {e.type_code for e in feed(type_code="remote").entries} == {"remote"}
    assert {e.status for e in feed(status="pending").entries} == {"pending"}
    assert {e.status for e in feed(status="approved").entries} == {"approved"}


def test_company_scope_is_refused_to_a_manager(world):
    with pytest.raises(NotAllowed) as raised:
        calendar_feed(world.manager_user, **NOVEMBER, scope="company")
    assert raised.value.code == "calendar.scope_not_allowed"


# --- holidays, half-days, window --------------------------------------------------------

def test_holidays_inside_the_window_are_returned_in_date_order(world):
    calendar_services.create_holiday(actor=world.hr_user, date=date(2026, 12, 17),
                                     name_fr="Fête de la Révolution", name_en="Revolution Day")
    calendar_services.create_holiday(actor=world.hr_user, date=date(2026, 11, 20),
                                     name_fr="Jour férié", name_en="Public holiday")

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    assert [(h.date, h.name_fr, h.name_en) for h in feed.holidays] == [
        (date(2026, 11, 20), "Jour férié", "Public holiday"),
    ]


def test_half_day_flags_are_kept(world):
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.remote,
             start=date(2026, 11, 4), end=date(2026, 11, 4), starts_at_midday=True)

    feed = calendar_feed(world.owner_user, **NOVEMBER, scope="department")

    [entry] = entries_of(feed, world.peer)
    assert (entry.starts_at_midday, entry.ends_at_midday) == (True, False)


def test_entries_are_clipped_to_the_window(world):
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.annual,
             start=date(2026, 11, 27), end=date(2026, 12, 2), starts_at_midday=True, ends_at_midday=True)

    november = calendar_feed(world.owner_user, **NOVEMBER, scope="department")
    december = calendar_feed(world.owner_user, start=date(2026, 12, 1), end=date(2026, 12, 31), scope="department")

    [first] = entries_of(november, world.peer)
    assert (first.start_date, first.end_date) == (date(2026, 11, 27), date(2026, 11, 30))
    assert (first.starts_at_midday, first.ends_at_midday) == (True, False)
    [second] = entries_of(december, world.peer)
    assert (second.start_date, second.end_date) == (date(2026, 12, 1), date(2026, 12, 2))
    assert (second.starts_at_midday, second.ends_at_midday) == (False, True)


@pytest.mark.parametrize("start, end", [
    (date(2026, 11, 30), date(2026, 11, 1)),      # end before start
    (date(2026, 1, 1), date(2026, 12, 31)),       # a whole year
])
def test_an_invalid_window_is_refused(world, start, end):
    with pytest.raises(DomainError) as raised:
        calendar_feed(world.owner_user, start=start, end=end, scope="department")
    assert raised.value.code == "calendar.window_invalid"


def test_an_unknown_scope_is_refused(world):
    with pytest.raises(DomainError) as raised:
        calendar_feed(world.owner_user, **NOVEMBER, scope="everyone")
    assert raised.value.code == "calendar.scope_unknown"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/calendar/tests/test_feed.py -v`
Expected: FAIL at collection with `ModuleNotFoundError: No module named 'apps.calendar.feed'`.

- [ ] **Step 3: Add the messages**

In `backend/apps/calendar/messages.py`, add these three entries inside the `MESSAGES` dictionary plan 03a created (it is already registered in `CalendarConfig.ready()`):

```python
    "calendar.window_invalid": {
        "en": "Choose a period of at most {max_days} days that ends after it starts.",
        "fr": "Choisissez une période de {max_days} jours au plus, dont la fin suit le début.",
    },
    "calendar.scope_unknown": {
        "en": "This calendar does not exist.",
        "fr": "Ce calendrier n'existe pas.",
    },
    "calendar.scope_not_allowed": {
        "en": "This calendar is not available to you.",
        "fr": "Ce calendrier ne vous est pas accessible.",
    },
```

- [ ] **Step 4: Write the implementation**

```python
# backend/apps/calendar/feed.py
"""The calendar feed: which absences a user sees, and how much of each.

Three scopes:
- department: the user's own requests in full; colleagues of the same department
  as "absent" or "remote" only, approved only, never an hourly permission.
- team: the user's team (including teams delegated to them) with type and status.
- company: everyone, with type and status, for HR and Executive Management.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from apps.accounts.roles import Role, has_role
from apps.calendar.models import PublicHoliday
from apps.core.errors import DomainError, NotAllowed
from apps.organisation import reach
from apps.organisation import selectors as org_selectors
from apps.requests.spans import RequestSpan, request_spans

MAX_WINDOW_DAYS = 100
VISIBLE_STATUSES = ("approved", "pending")
PEER_LABELS = ("absent", "remote")


@dataclass(frozen=True)
class FeedHoliday:
    date: date
    name_fr: str
    name_en: str


@dataclass(frozen=True)
class FeedEntry:
    employee_public_id: str
    employee_name: str
    start_date: date
    end_date: date
    starts_at_midday: bool
    ends_at_midday: bool
    label: str
    type_code: str | None
    type_name_fr: str | None
    type_name_en: str | None
    status: str | None
    request_public_id: str | None
    mine: bool


@dataclass(frozen=True)
class CalendarFeed:
    holidays: list[FeedHoliday]
    entries: list[FeedEntry]


def calendar_feed(user, *, start: date, end: date, scope: str, department_id: int | None = None,
                  employee_public_id: str | None = None, type_code: str | None = None,
                  status: str | None = None) -> CalendarFeed:
    if end < start or (end - start).days > MAX_WINDOW_DAYS:
        raise DomainError("calendar.window_invalid", field="to", max_days=MAX_WINDOW_DAYS)

    me = reach.employee_of(user)
    people = {employee.id: employee for employee in org_selectors.directory().select_related("department")}

    if scope == "department":
        # Filters are deliberately not passed on: filtering by type or status
        # would tell a colleague what the label hides.
        entries = _department_entries(user, me, people, start, end)
    elif scope == "team":
        if not has_role(user, Role.MANAGER):
            raise NotAllowed("calendar.scope_not_allowed")
        entries = _detailed_entries(me, people, reach.team_ids(user), start, end,
                                    employee_public_id=employee_public_id, type_code=type_code, status=status)
    elif scope == "company":
        if not has_role(user, Role.HR, Role.EXEC):
            raise NotAllowed("calendar.scope_not_allowed")
        ids = set(people)
        if department_id is not None:
            ids = {employee_id for employee_id in ids if people[employee_id].department_id == department_id}
        entries = _detailed_entries(me, people, ids, start, end,
                                    employee_public_id=employee_public_id, type_code=type_code, status=status)
    else:
        raise DomainError("calendar.scope_unknown", field="scope")

    holidays = [
        FeedHoliday(date=holiday.date, name_fr=holiday.name_fr, name_en=holiday.name_en)
        for holiday in PublicHoliday.objects.filter(date__gte=start, date__lte=end).order_by("date")
    ]
    return CalendarFeed(holidays=holidays, entries=entries)


def _department_entries(user, me, people, start: date, end: date) -> list[FeedEntry]:
    if me is None:
        return []
    ids = set(reach.department_peer_ids(user)) | {me.id}
    spans = request_spans(start=start, end=end, statuses=VISIBLE_STATUSES, employee_ids=ids)
    entries: list[FeedEntry] = []
    for span in spans:
        if span.employee_id == me.id:
            entries.append(_entry(span, me, start, end, mine=True, detailed=True))
            continue
        person = people.get(span.employee_id)
        if person is None:
            continue
        if span.status == "approved" and span.calendar_label in PEER_LABELS:
            entries.append(_entry(span, person, start, end, mine=False, detailed=False))
    return _in_order(entries)


def _detailed_entries(me, people, ids, start: date, end: date, *, employee_public_id: str | None,
                      type_code: str | None, status: str | None) -> list[FeedEntry]:
    ids = set(ids) & set(people)
    if employee_public_id is not None:
        ids = {employee_id for employee_id in ids if str(people[employee_id].public_id) == str(employee_public_id)}
    if not ids:
        return []
    statuses = (status,) if status in VISIBLE_STATUSES else VISIBLE_STATUSES
    spans = request_spans(start=start, end=end, statuses=statuses, employee_ids=ids,
                          type_codes=[type_code] if type_code else None)
    my_id = me.id if me is not None else None
    return _in_order([
        _entry(span, people[span.employee_id], start, end, mine=span.employee_id == my_id, detailed=True)
        for span in spans
    ])


def _entry(span: RequestSpan, person, start: date, end: date, *, mine: bool, detailed: bool) -> FeedEntry:
    first = max(span.start_date, start)
    last = min(span.end_date, end)
    return FeedEntry(
        employee_public_id=str(person.public_id),
        employee_name=org_selectors.full_name(person),
        start_date=first,
        end_date=last,
        # A half-day flag describes the request's real first or last day. It is
        # kept only when that day is inside the window.
        starts_at_midday=span.starts_at_midday and first == span.start_date,
        ends_at_midday=span.ends_at_midday and last == span.end_date,
        label=span.calendar_label,
        type_code=span.type_code if detailed else None,
        type_name_fr=span.type_name_fr if detailed else None,
        type_name_en=span.type_name_en if detailed else None,
        status=span.status if detailed else None,
        request_public_id=span.request_public_id if detailed else None,
        mine=mine,
    )


def _in_order(entries: list[FeedEntry]) -> list[FeedEntry]:
    return sorted(entries, key=lambda entry: (entry.start_date, entry.employee_name, entry.end_date))
```

Append this line at the very end of `backend/apps/calendar/selectors.py`, so the function is importable from the module the master names:

```python
from apps.calendar.feed import CalendarFeed, FeedEntry, FeedHoliday, calendar_feed  # noqa: E402,F401
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/calendar/tests/test_feed.py -v`
Expected: 22 passed (21 test functions, one of them parametrised twice).

Run: `docker compose run --rm app pytest tests/test_messages.py -v`
Expected: PASS (the three new codes have both languages and the same placeholders).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/calendar/feed.py backend/apps/calendar/selectors.py backend/apps/calendar/messages.py backend/apps/calendar/tests/test_feed.py
git commit -m "feat(calendar): calendar feed with department, team and company scopes"
```

---

### Task 3: `GET calendar`

**Files:**
- Create: `backend/apps/calendar/api/feed_serializers.py`
- Create: `backend/apps/calendar/api/feed_views.py`
- Modify: `backend/apps/calendar/api/urls.py` (one import, one route appended)
- Modify: `backend/apps/calendar/tests/matrix.py` (three cases appended to `CASES`)
- Modify: `backend/config/settings.py` (two entries in `ENUM_NAME_OVERRIDES`)
- Modify: `backend/openapi.yaml`, `frontend/src/api/schema.d.ts` (regenerated)
- Test: `backend/apps/calendar/tests/test_feed_api.py`

**Interfaces:**
- Consumes: `apps.calendar.feed.calendar_feed`, `CalendarFeed` (Task 2); `apps.calendar.lang.pick(fr, en)` and `apps.requests.models.CalendarLabel` (plan 03a); `apps.accounts.roles.Role`; `tests.matrix.Case`, `P`, `only`; fixtures `world`, `client_for`, `anon_client`.
- Produces: `GET /api/v1/calendar?from=&to=&scope=&department=&employee=&type=&status=`, route name `calendar:feed`, access EMPLOYEE, HR, EXEC. Response, exactly as master 7.8:

```jsonc
{
  "holidays": [{"date": "2026-11-20", "name": "Jour férié"}],
  "entries": [{
    "employee": {"public_id": "…", "name": "…"},
    "start_date": "2026-11-02", "end_date": "2026-11-03",
    "starts_at_midday": false, "ends_at_midday": false,
    "label": "absent",                 // "absent" | "remote" | "hidden"
    "type_code": null, "type_name": null, "status": null, "request_public_id": null,
    "mine": false
  }]
}
```

`from`, `to` (ISO dates) and `scope` (`department`, `team`, `company`) are required. `department` is a department id, `employee` an employee `public_id`, `type` a type code, `status` is `pending` or `approved`. Operation id `calendar_feed`. Schema components: `CalendarOut`, `CalendarEntryOut`, `CalendarHolidayOut`, `CalendarEmployeeOut`; enumerations `CalendarLabelEnum` (plan 03a's), `CalendarEntryStatusEnum`, `CalendarScopeEnum`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/calendar/tests/test_feed_api.py
from datetime import date

import pytest
import time_machine
from django.urls import reverse

from apps.calendar import services as calendar_services
from tests.request_flows import NOW, approved, send

pytestmark = pytest.mark.django_db

URL = reverse("calendar:feed")
NOVEMBER = {"from": "2026-11-01", "to": "2026-11-30"}
ENTRY_KEYS = {"employee", "start_date", "end_date", "starts_at_midday", "ends_at_midday", "label",
              "type_code", "type_name", "status", "request_public_id", "mine"}


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def test_the_response_has_the_contract_shape(world, client_for):
    calendar_services.create_holiday(actor=world.hr_user, date=date(2026, 11, 20),
                                     name_fr="Jour férié", name_en="Public holiday")
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
             start=date(2026, 11, 2), end=date(2026, 11, 3))

    response = client_for(world.owner_user).get(URL, {**NOVEMBER, "scope": "department"})

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"holidays", "entries"}
    assert body["holidays"] == [{"date": "2026-11-20", "name": "Jour férié"}]
    [entry] = body["entries"]
    assert set(entry) == ENTRY_KEYS
    assert set(entry["employee"]) == {"public_id", "name"}
    assert entry["employee"]["public_id"] == str(world.peer.public_id)
    assert entry == {**entry, "start_date": "2026-11-02", "end_date": "2026-11-03", "label": "absent",
                     "type_code": None, "type_name": None, "status": None, "request_public_id": None,
                     "mine": False}


def test_names_follow_the_readers_language(world, client_for):
    calendar_services.create_holiday(actor=world.hr_user, date=date(2026, 11, 20),
                                     name_fr="Jour férié", name_en="Public holiday")
    send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
         start=date(2026, 11, 10), end=date(2026, 11, 12))
    world.owner_user.language = "en"
    world.owner_user.save(update_fields=["language"])

    body = client_for(world.owner_user).get(URL, {**NOVEMBER, "scope": "department"}).json()

    assert body["holidays"][0]["name"] == "Public holiday"
    assert body["entries"][0]["type_name"] == world.annual.name_en


def test_department_scope_ignores_filters(world, client_for):
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
             start=date(2026, 11, 2), end=date(2026, 11, 3))
    client = client_for(world.owner_user)

    plain = client.get(URL, {**NOVEMBER, "scope": "department"}).json()
    probed = client.get(URL, {**NOVEMBER, "scope": "department", "type": "annual", "status": "pending"}).json()

    assert len(plain["entries"]) == 1
    assert probed == plain


def test_a_manager_gets_types_and_pending_requests_in_team_scope(world, client_for):
    request = send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
                   start=date(2026, 11, 10), end=date(2026, 11, 12))

    body = client_for(world.manager_user).get(URL, {**NOVEMBER, "scope": "team"}).json()

    [entry] = body["entries"]
    assert entry["type_code"] == "annual"
    assert entry["type_name"] == world.annual.name_fr
    assert entry["status"] == "pending"
    assert entry["request_public_id"] == str(request.public_id)


def test_company_scope_accepts_its_filters(world, client_for):
    approved(world, employee=world.outsider, user=world.outsider_user, request_type=world.annual,
             start=date(2026, 11, 10), end=date(2026, 11, 12))
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.remote,
             start=date(2026, 11, 4), end=date(2026, 11, 4))
    client = client_for(world.hr_user)

    by_department = client.get(URL, {**NOVEMBER, "scope": "company", "department": world.dept_b.id}).json()
    by_person = client.get(URL, {**NOVEMBER, "scope": "company", "employee": str(world.peer.public_id)}).json()
    by_type = client.get(URL, {**NOVEMBER, "scope": "company", "type": "remote", "status": "approved"}).json()

    assert [e["employee"]["public_id"] for e in by_department["entries"]] == [str(world.outsider.public_id)]
    assert [e["employee"]["public_id"] for e in by_person["entries"]] == [str(world.peer.public_id)]
    assert [e["type_code"] for e in by_type["entries"]] == ["remote"]


@pytest.mark.parametrize("persona, scope", [
    ("owner_user", "team"),          # manages nobody
    ("hr_user", "team"),             # HR is not a manager in the cast
    ("owner_user", "company"),
    ("manager_user", "company"),
])
def test_a_scope_beyond_the_viewers_role_is_refused(world, client_for, persona, scope):
    response = client_for(getattr(world, persona)).get(URL, {**NOVEMBER, "scope": scope})

    assert response.status_code == 403
    assert response.json()["code"] == "calendar.scope_not_allowed"


def test_an_executive_who_manages_people_may_use_all_three_scopes(world, client_for):
    client = client_for(world.exec_user)
    for scope in ("department", "team", "company"):
        assert client.get(URL, {**NOVEMBER, "scope": scope}).status_code == 200


def test_the_system_administrator_has_no_calendar(world, client_for):
    response = client_for(world.sysadmin_user).get(URL, {**NOVEMBER, "scope": "department"})
    assert response.status_code == 403


def test_anonymous_is_sent_to_sign_in(anon_client):
    assert anon_client.get(URL, {**NOVEMBER, "scope": "department"}).status_code == 401


@pytest.mark.parametrize("params, field", [
    ({"to": "2026-11-30", "scope": "department"}, "from"),
    ({"from": "2026-11-01", "scope": "department"}, "to"),
    ({"from": "2026-11-01", "to": "2026-11-30"}, "scope"),
    ({"from": "2026-11-01", "to": "2026-11-30", "scope": "planet"}, "scope"),
    ({"from": "01/11/2026", "to": "2026-11-30", "scope": "department"}, "from"),
    ({"from": "2026-11-01", "to": "2026-11-30", "scope": "company", "status": "draft"}, "status"),
])
def test_bad_parameters_are_reported_on_their_field(world, client_for, params, field):
    response = client_for(world.exec_user).get(URL, params)

    assert response.status_code == 400
    assert field in [error["field"] for error in response.json()["errors"]]


def test_a_window_that_is_too_long_is_refused(world, client_for):
    response = client_for(world.owner_user).get(URL, {"from": "2026-01-01", "to": "2026-12-31", "scope": "department"})

    assert response.status_code == 400
    assert response.json()["code"] == "calendar.window_invalid"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/calendar/tests/test_feed_api.py -v`
Expected: FAIL at collection with `django.urls.exceptions.NoReverseMatch: Reverse for 'feed' not found`.

- [ ] **Step 3: Write the serializers**

```python
# backend/apps/calendar/api/feed_serializers.py
from rest_framework import serializers

from apps.calendar.feed import CalendarFeed
from apps.calendar.lang import pick
from apps.requests.models import CalendarLabel

SCOPES = ["department", "team", "company"]
# What an entry can be on the calendar; null for a colleague's entry in department scope.
ENTRY_STATUSES = ["pending", "approved"]


class CalendarQuery(serializers.Serializer):
    to = serializers.DateField()
    scope = serializers.ChoiceField(choices=SCOPES)
    department = serializers.IntegerField(required=False)
    employee = serializers.UUIDField(required=False)
    type = serializers.CharField(required=False, max_length=50)
    status = serializers.ChoiceField(choices=ENTRY_STATUSES, required=False)

    def get_fields(self):
        # "from" is a Python keyword, so the field cannot be declared as a class attribute.
        fields = super().get_fields()
        fields["from"] = serializers.DateField()
        return fields


class CalendarHolidayOut(serializers.Serializer):
    date = serializers.DateField()
    name = serializers.CharField()


class CalendarEmployeeOut(serializers.Serializer):
    public_id = serializers.CharField()
    name = serializers.CharField()


class CalendarEntryOut(serializers.Serializer):
    employee = CalendarEmployeeOut()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    starts_at_midday = serializers.BooleanField()
    ends_at_midday = serializers.BooleanField()
    label = serializers.ChoiceField(choices=CalendarLabel.choices)
    type_code = serializers.CharField(allow_null=True)
    type_name = serializers.CharField(allow_null=True)
    status = serializers.ChoiceField(choices=ENTRY_STATUSES, allow_null=True)
    request_public_id = serializers.CharField(allow_null=True)
    mine = serializers.BooleanField()


class CalendarOut(serializers.Serializer):
    holidays = CalendarHolidayOut(many=True)
    entries = CalendarEntryOut(many=True)


def feed_payload(feed: CalendarFeed) -> dict:
    """The feed as plain data, with names in the reader's language."""
    return {
        "holidays": [
            {"date": holiday.date, "name": pick(holiday.name_fr, holiday.name_en)}
            for holiday in feed.holidays
        ],
        "entries": [
            {
                "employee": {"public_id": entry.employee_public_id, "name": entry.employee_name},
                "start_date": entry.start_date,
                "end_date": entry.end_date,
                "starts_at_midday": entry.starts_at_midday,
                "ends_at_midday": entry.ends_at_midday,
                "label": entry.label,
                "type_code": entry.type_code,
                "type_name": pick(entry.type_name_fr, entry.type_name_en) if entry.type_code else None,
                "status": entry.status,
                "request_public_id": entry.request_public_id,
                "mine": entry.mine,
            }
            for entry in feed.entries
        ],
    }
```

In `backend/config/settings.py`, add to `SPECTACULAR_SETTINGS["ENUM_NAME_OVERRIDES"]`, after the entries of plan 03a (plan 01a's rule: one name per choice set; `label` reuses plan 03a's `CalendarLabelEnum`):

```python
        "CalendarEntryStatusEnum": "apps.calendar.api.feed_serializers.ENTRY_STATUSES",
        "CalendarScopeEnum": "apps.calendar.api.feed_serializers.SCOPES",
```

- [ ] **Step 4: Write the view and the route**

```python
# backend/apps/calendar/api/feed_views.py
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role
from apps.calendar.api.feed_serializers import CalendarOut, CalendarQuery, feed_payload
from apps.calendar.feed import calendar_feed


class CalendarFeedView(APIView):
    access = {"GET": {Role.EMPLOYEE, Role.HR, Role.EXEC}}
    http_method_names = ["get"]

    @extend_schema(operation_id="calendar_feed", parameters=[CalendarQuery], responses=CalendarOut)
    def get(self, request):
        query = CalendarQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        params = query.validated_data
        employee = params.get("employee")
        feed = calendar_feed(
            request.user,
            start=params["from"],
            end=params["to"],
            scope=params["scope"],
            department_id=params.get("department"),
            employee_public_id=str(employee) if employee else None,
            type_code=params.get("type"),
            status=params.get("status"),
        )
        return Response(CalendarOut(feed_payload(feed)).data)
```

In `backend/apps/calendar/api/urls.py` add the import next to the existing ones:

```python
from apps.calendar.api.feed_views import CalendarFeedView
```

and append this element to `urlpatterns`:

```python
    path("calendar", CalendarFeedView.as_view(), name="feed"),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/calendar/tests/test_feed_api.py -v`
Expected: 19 passed.

- [ ] **Step 6: Add the matrix cases**

Append to `backend/apps/calendar/tests/matrix.py`, after the `CASES` list of plan 03a (`Case`, `P` and `only` are already imported there from `tests.matrix`):

```python
_EVERY_EMPLOYEE = (P.OWNER, P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC)
_NOVEMBER = {"from": "2026-11-01", "to": "2026-11-30"}

CASES += [
    Case("calendar:feed", "GET", only(*_EVERY_EMPLOYEE), label="department scope",
         query=lambda w: {**_NOVEMBER, "scope": "department"}),
    Case("calendar:feed", "GET", only(P.MANAGER, P.OTHER_MANAGER, P.EXEC), label="team scope",
         query=lambda w: {**_NOVEMBER, "scope": "team"}),
    Case("calendar:feed", "GET", only(P.HR, P.EXEC), label="company scope",
         query=lambda w: {**_NOVEMBER, "scope": "company"}),
]
```

Run: `docker compose run --rm app pytest tests/test_permission_matrix.py -v -k calendar`
Expected: PASS for every persona of the three cases, and no "endpoint without a case" failure for `calendar:feed`.

- [ ] **Step 7: Regenerate the API description**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: no line starting with `Warning`; `backend/openapi.yaml` and `frontend/src/api/schema.d.ts` change and now describe `GET /api/v1/calendar` with the components `CalendarOut`, `CalendarEntryOut`, `CalendarHolidayOut`, `CalendarEmployeeOut`.

If the command warns about an enum name, the table of plan 01a, Task 21 gives the fix; the usual one is a missing entry in `ENUM_NAME_OVERRIDES`.

Run: `docker compose run --rm app pytest tests/test_openapi.py -q`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/calendar backend/config/settings.py backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(calendar): GET calendar endpoint"
```

---

### Task 4: The `reports` app and `home/me`

The `reports` app owns no table. It is the place for read-only aggregations over several modules (master D19). Plan 06 adds the reports and the export to it, and appends its routes to the `urls.py` created here.

**Files:**
- Create: `backend/apps/reports/__init__.py` (empty), `backend/apps/reports/apps.py`
- Create: `backend/apps/reports/home.py`
- Create: `backend/apps/reports/api/__init__.py` (empty), `backend/apps/reports/api/serializers.py`, `backend/apps/reports/api/views.py`, `backend/apps/reports/api/urls.py`
- Create: `backend/apps/reports/tests/__init__.py` (empty), `backend/apps/reports/tests/matrix.py`
- Modify: `backend/config/settings.py` (`"apps.reports"` appended to `INSTALLED_APPS`; one entry in `ENUM_NAME_OVERRIDES`)
- Modify: `backend/config/api_urls.py` (one `path` appended)
- Modify: `backend/tests/test_permission_matrix.py` (`"apps.reports.tests.matrix"` appended to `MATRIX_MODULES`)
- Modify: `backend/openapi.yaml`, `frontend/src/api/schema.d.ts` (regenerated)
- Test: `backend/apps/reports/tests/test_home_me.py`

**Interfaces:**
- Consumes (plan 03a): `apps.requests.selectors.requests_for(user, "mine") -> QuerySet[Request]`, `outstanding_certificates(*, employee_ids, now) -> list[CertificateRow]` (pending requests whose required document has not arrived; each row has `.request` and `.due_at`); `apps.requests.representation.viewer_for(user)`, `represent(request, viewer) -> dict` (the `RequestOut` of master 7.9); the serializer `apps.requests.api.serializers.RequestOut`. (Plan 04): `apps.balances.selectors.figures(employee_id, *, today=None) -> BalanceFigures`; the fixture `ledger_port`. (Plan 02): `apps.organisation.reach.employee_of(user)`. `apps.core.errors.NotFound`.
- Produces:

```python
# apps/reports/home.py
LIST_LIMIT = 5
@dataclass(frozen=True)
class NeedsYouItem: kind: str; request: Request; due_at: datetime | None     # kind: "returned" | "certificate_due"
@dataclass(frozen=True)
class MeHome: balance: BalanceFigures; needs_you: list[NeedsYouItem]; in_progress: list[Request]; coming_up: list[Request]
def me_home(user, *, today: date | None = None, now: datetime | None = None) -> MeHome
```

`GET /api/v1/home/me`, route name `reports:home-me`, operation id `home_me`, access EMPLOYEE:

```jsonc
{
  "balance": {"current": "20.00", "pending": "2.00", "approved_upcoming": "2.00", "next_credit_amount": "2.50", "next_credit_date": "2026-11-30"},
  "needs_you": [{"kind": "returned", "request": { /* RequestOut */ }, "due_at": null},
                {"kind": "certificate_due", "request": { /* RequestOut */ }, "due_at": "2026-11-04T08:00:00+01:00"}],
  "in_progress": [ /* RequestOut, pending, by start date, at most 5 */ ],
  "coming_up":   [ /* RequestOut, approved and not finished, by start date, at most 5 */ ]
}
```

Schema components: `MeHomeOut`, `HomeBalanceOut`, `NeedsYouOut`; enumeration `NeedsYouKindEnum`.

- [ ] **Step 1: Create the app and register it**

```python
# backend/apps/reports/apps.py
from django.apps import AppConfig


class ReportsConfig(AppConfig):
    name = "apps.reports"
    label = "reports"
```

Create the three empty `__init__.py` files listed above.

Append to `INSTALLED_APPS` in `backend/config/settings.py`, after `"apps.balances",`:

```python
    "apps.reports",
```

Add to `SPECTACULAR_SETTINGS["ENUM_NAME_OVERRIDES"]` in the same file:

```python
        "NeedsYouKindEnum": "apps.reports.api.serializers.NEEDS_YOU_KINDS",
```

Append to `urlpatterns` in `backend/config/api_urls.py`:

```python
    path("", include("apps.reports.api.urls")),
```

Append to `MATRIX_MODULES` in `backend/tests/test_permission_matrix.py`:

```python
    "apps.reports.tests.matrix",
```

- [ ] **Step 2: Write the failing tests**

```python
# backend/apps/reports/tests/test_home_me.py
from datetime import date, time
from decimal import Decimal

import pytest
import time_machine
from django.urls import reverse

from tests.request_flows import NOW, approved, decide, give_balance, send

pytestmark = pytest.mark.django_db

URL = reverse("reports:home-me")


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def ids(requests):
    return [request["public_id"] for request in requests]


def test_home_me_for_a_new_employee(world, client_for):
    response = client_for(world.owner_user).get(URL)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"balance", "needs_you", "in_progress", "coming_up"}
    assert set(body["balance"]) == {"current", "pending", "approved_upcoming", "next_credit_amount", "next_credit_date"}
    assert Decimal(body["balance"]["current"]) == Decimal("0")
    assert Decimal(body["balance"]["pending"]) == Decimal("0")
    assert Decimal(body["balance"]["approved_upcoming"]) == Decimal("0")
    assert body["needs_you"] == []
    assert body["in_progress"] == []
    assert body["coming_up"] == []


def test_home_me_gathers_what_the_employee_asks_every_day(world, client_for, ledger_port):
    # With the real ledger behind the requests, so that approved leave is posted.
    give_balance(world, world.owner, "20")
    returned = send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
                    start=date(2026, 11, 10), end=date(2026, 11, 10))
    decide(returned, "return", "Pick another week")
    pending = send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
                   start=date(2026, 11, 17), end=date(2026, 11, 18))
    upcoming = approved(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
                        start=date(2026, 11, 24), end=date(2026, 11, 25))
    sick = send(world, employee=world.owner, user=world.owner_user, request_type=world.sick,
                start=date(2026, 11, 2), end=date(2026, 11, 2))

    body = client_for(world.owner_user).get(URL).json()

    assert Decimal(body["balance"]["current"]) == Decimal("20")          # nothing is taken before 24 November
    assert Decimal(body["balance"]["pending"]) == Decimal("2")           # 17 and 18 November; a returned request holds nothing
    assert Decimal(body["balance"]["approved_upcoming"]) == Decimal("2")

    needs = {item["kind"]: item for item in body["needs_you"]}
    assert set(needs) == {"returned", "certificate_due"}
    assert needs["returned"]["request"]["public_id"] == str(returned.public_id)
    assert needs["returned"]["request"]["state"]["note"] == "Pick another week"
    assert needs["returned"]["due_at"] is None
    assert needs["certificate_due"]["request"]["public_id"] == str(sick.public_id)
    assert needs["certificate_due"]["due_at"] is not None

    assert ids(body["in_progress"]) == [str(sick.public_id), str(pending.public_id)]
    assert ids(body["coming_up"]) == [str(upcoming.public_id)]
    assert body["in_progress"][0]["viewer"]["relation"] == "owner"


def test_lists_hold_at_most_five_requests_soonest_first(world, client_for):
    for day in (10, 9, 6, 5, 4, 3):
        send(world, employee=world.owner, user=world.owner_user, request_type=world.permission,
             start=date(2026, 11, day), end=date(2026, 11, day), start_time=time(9, 0), end_time=time(10, 0))

    body = client_for(world.owner_user).get(URL).json()

    assert [request["start_date"] for request in body["in_progress"]] == [
        "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09",
    ]


def test_coming_up_keeps_leave_in_progress_and_drops_leave_that_is_over(world, client_for):
    approved(world, employee=world.owner, user=world.owner_user, request_type=world.sick,
             start=date(2026, 10, 28), end=date(2026, 10, 29))
    current = approved(world, employee=world.owner, user=world.owner_user, request_type=world.sick,
                       start=date(2026, 11, 2), end=date(2026, 11, 3))

    body = client_for(world.owner_user).get(URL).json()

    assert ids(body["coming_up"]) == [str(current.public_id)]


def test_other_peoples_requests_never_appear(world, client_for):
    send(world, employee=world.peer, user=world.peer_user, request_type=world.annual,
         start=date(2026, 11, 17), end=date(2026, 11, 18))
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.remote,
             start=date(2026, 11, 4), end=date(2026, 11, 4))

    body = client_for(world.owner_user).get(URL).json()

    assert body["in_progress"] == [] and body["coming_up"] == [] and body["needs_you"] == []


def test_home_me_needs_an_employee_record(world, client_for, anon_client):
    assert client_for(world.sysadmin_user).get(URL).status_code == 403
    assert anon_client.get(URL).status_code == 401
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_home_me.py -v`
Expected: FAIL at collection with `ModuleNotFoundError: No module named 'apps.reports.api.urls'` (the URL configuration of Step 1 includes a module that does not exist yet).

- [ ] **Step 4: Write the selector, the serializers, the view and the route**

```python
# backend/apps/reports/home.py
"""What each home screen shows. Read-only; every figure comes from another app's selector."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from django.utils import timezone

from apps.balances import selectors as balance_selectors
from apps.balances.selectors import BalanceFigures
from apps.core.errors import NotFound
from apps.organisation import reach
from apps.requests import selectors as request_selectors
from apps.requests.models import Request

LIST_LIMIT = 5


@dataclass(frozen=True)
class NeedsYouItem:
    kind: str
    request: Request
    due_at: datetime | None


@dataclass(frozen=True)
class MeHome:
    balance: BalanceFigures
    needs_you: list[NeedsYouItem]
    in_progress: list[Request]
    coming_up: list[Request]


def me_home(user, *, today: date | None = None, now: datetime | None = None) -> MeHome:
    today = today or timezone.localdate()
    now = now or timezone.now()
    me = reach.employee_of(user)
    if me is None:
        raise NotFound()

    mine = request_selectors.requests_for(user, "mine")
    needs_you = [
        NeedsYouItem(kind="returned", request=request, due_at=None)
        for request in mine.filter(status="returned").order_by("start_date", "id")
    ]
    needs_you += [
        NeedsYouItem(kind="certificate_due", request=row.request, due_at=row.due_at)
        for row in request_selectors.outstanding_certificates(employee_ids=[me.id], now=now)
    ]
    return MeHome(
        balance=balance_selectors.figures(me.id, today=today),
        needs_you=needs_you,
        in_progress=list(mine.filter(status="pending").order_by("start_date", "id")[:LIST_LIMIT]),
        coming_up=list(mine.filter(status="approved", end_date__gte=today)
                       .order_by("start_date", "id")[:LIST_LIMIT]),
    )
```

```python
# backend/apps/reports/api/serializers.py
from dataclasses import asdict

from rest_framework import serializers

from apps.requests.api.serializers import RequestOut
from apps.requests.representation import represent, viewer_for

NEEDS_YOU_KINDS = ["returned", "certificate_due"]


class HomeBalanceOut(serializers.Serializer):
    current = serializers.DecimalField(max_digits=9, decimal_places=2)
    pending = serializers.DecimalField(max_digits=9, decimal_places=2)
    approved_upcoming = serializers.DecimalField(max_digits=9, decimal_places=2)
    next_credit_amount = serializers.DecimalField(max_digits=9, decimal_places=2, allow_null=True)
    next_credit_date = serializers.DateField(allow_null=True)


class NeedsYouOut(serializers.Serializer):
    kind = serializers.ChoiceField(choices=NEEDS_YOU_KINDS)
    request = RequestOut()
    due_at = serializers.DateTimeField(allow_null=True)


class MeHomeOut(serializers.Serializer):
    balance = HomeBalanceOut()
    needs_you = NeedsYouOut(many=True)
    in_progress = RequestOut(many=True)
    coming_up = RequestOut(many=True)


def me_home_payload(data, user) -> dict:
    """The home as plain data. Each request is represented for this viewer, as everywhere else."""
    viewer = viewer_for(user)
    return {
        "balance": asdict(data.balance),
        "needs_you": [
            {"kind": item.kind, "request": represent(item.request, viewer), "due_at": item.due_at}
            for item in data.needs_you
        ],
        "in_progress": [represent(request, viewer) for request in data.in_progress],
        "coming_up": [represent(request, viewer) for request in data.coming_up],
    }
```

```python
# backend/apps/reports/api/views.py
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role
from apps.reports import home
from apps.reports.api.serializers import MeHomeOut, me_home_payload


class MeHomeView(APIView):
    access = {"GET": {Role.EMPLOYEE}}
    http_method_names = ["get"]

    @extend_schema(operation_id="home_me", responses=MeHomeOut)
    def get(self, request):
        data = home.me_home(request.user)
        return Response(MeHomeOut(me_home_payload(data, request.user)).data)
```

```python
# backend/apps/reports/api/urls.py
from django.urls import path

from apps.reports.api import views

app_name = "reports"

urlpatterns = [
    path("home/me", views.MeHomeView.as_view(), name="home-me"),
]
```

```python
# backend/apps/reports/tests/matrix.py
from tests.matrix import Case, P, only

EVERY_EMPLOYEE = (P.OWNER, P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC)

CASES = [
    Case("reports:home-me", "GET", only(*EVERY_EMPLOYEE)),
]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_home_me.py -v`
Expected: 6 passed.

Run: `docker compose run --rm app pytest tests/test_permission_matrix.py -v -k home`
Expected: PASS.

- [ ] **Step 6: Regenerate the API description**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: no line starting with `Warning`; the description now has `GET /api/v1/home/me`.

Run: `docker compose run --rm app pytest tests/test_openapi.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/reports backend/config/settings.py backend/config/api_urls.py backend/tests/test_permission_matrix.py backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(reports): reports app and the My space home endpoint"
```

---

### Task 5: `home/team`

The To decide block of the My team home reads `approvals?queue=mine` (plan 03a). This endpoint supplies everything else a manager's pages need about the team in one read: who is out, the delegation line, and, for the People list (UI 6.3), each team member's presence today and annual balance.

**Files:**
- Modify: `backend/apps/reports/home.py` (append)
- Modify: `backend/apps/reports/api/serializers.py` (append)
- Modify: `backend/apps/reports/api/views.py` (append)
- Modify: `backend/apps/reports/api/urls.py` (one route appended)
- Modify: `backend/apps/reports/tests/matrix.py` (one case appended)
- Modify: `backend/config/settings.py` (two entries in `ENUM_NAME_OVERRIDES`)
- Modify: `backend/openapi.yaml`, `frontend/src/api/schema.d.ts` (regenerated)
- Test: `backend/apps/reports/tests/test_home_team.py`

**Interfaces:**
- Consumes: `apps.requests.spans.request_spans` (Task 1); `apps.requests.models.CalendarLabel`; `apps.calendar.workdays.is_working_day(day)`; `apps.calendar.lang.pick(fr, en)`; `apps.balances.selectors.balances_at(on, *, employee_ids) -> dict[int, Decimal]` (every id asked for is in the result); `apps.organisation.reach.employee_of`, `team_ids(user, *, on)` (direct reports plus the reports of whoever delegated to the user; not the user, not people who left); `apps.organisation.selectors.employees_for(user)`, `full_name(employee)`, `active_delegations(*, manager=None, delegate=None, on=None) -> QuerySet[Delegation]`; `apps.organisation.services.create_delegation(*, actor, manager, delegate, start_date, end_date)`.
- Produces:

```python
# apps/reports/home.py
WHO_IS_OUT_DAYS = 7
@dataclass(frozen=True)
class OutPerson:
    employee_public_id: str; name: str; label: str            # "absent" | "remote"
    type_name_fr: str; type_name_en: str
    start_date: date; end_date: date; starts_at_midday: bool; ends_at_midday: bool
    today: bool
@dataclass(frozen=True)
class DelegationLine: direction: str; person: str; start_date: date; end_date: date   # direction: "given" | "received"
@dataclass(frozen=True)
class TeamPerson: employee_public_id: str; today: str; balance: Decimal                 # today: "in" | "absent" | "remote"
@dataclass(frozen=True)
class TeamHome: who_is_out: list[OutPerson]; delegation: DelegationLine | None; people: list[TeamPerson]
def team_home(user, *, today: date | None = None) -> TeamHome
```

`GET /api/v1/home/team`, route name `reports:home-team`, operation id `home_team`, access MANAGER:

```jsonc
{
  "who_is_out": [{"employee": {"public_id": "…", "name": "…"}, "label": "absent", "type_name": "Congé maladie",
                  "start_date": "2026-11-02", "end_date": "2026-11-03",
                  "starts_at_midday": false, "ends_at_midday": false, "today": true}],
  "delegation": {"direction": "given", "person": "…", "start_date": "2026-11-02", "end_date": "2026-11-20"},   // or null
  "people": [{"public_id": "…", "today": "absent", "balance": "7.50"}]
}
```

Rules:

- `who_is_out`: approved absences and remote days of the team (including teams delegated to the user) that touch today or the next seven days; people out today come first. A manager sees the type (CAL-04). Hourly permissions are left out: the block answers "who is in?".
- `delegation`: the delegation running today. When the user both gave and received one, the one given is reported.
- `people`: one line per team member, in name order. `today` is `absent` when an approved absence covers today, else `remote` when approved remote work covers today, else `in`; a half-day counts. On a day that is not a working day everybody is `in`. `balance` is the posted annual balance today (permission matrix: a manager sees the balance of the team).

Schema components: `TeamHomeOut`, `OutPersonOut`, `DelegationLineOut`, `TeamPersonOut`, `HomePersonOut`; enumerations `PresenceEnum`, `DelegationDirectionEnum`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/reports/tests/test_home_team.py
from datetime import UTC, date, datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
import time_machine
from django.urls import reverse

from apps.organisation import selectors as org_selectors
from apps.organisation import services as org_services
from tests.request_flows import NOW, approved, give_balance, send

pytestmark = pytest.mark.django_db

URL = reverse("reports:home-team")


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def names(body):
    return [person["employee"]["name"] for person in body["who_is_out"]]


def presence(body, employee):
    return next(person for person in body["people"] if person["public_id"] == str(employee.public_id))


def test_who_is_out_lists_the_team_today_and_over_the_next_seven_days(world, client_for):
    approved(world, employee=world.owner, user=world.owner_user, request_type=world.remote,
             start=date(2026, 11, 5), end=date(2026, 11, 5), starts_at_midday=True)
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
             start=date(2026, 11, 2), end=date(2026, 11, 3))
    # Outside the next seven days, still pending, hourly, or another team: none of these appears.
    approved(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
             start=date(2026, 11, 10), end=date(2026, 11, 10))
    send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
         start=date(2026, 11, 6), end=date(2026, 11, 6))
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.permission,
             start=date(2026, 11, 4), end=date(2026, 11, 4), start_time=time(9, 0), end_time=time(10, 0))
    approved(world, employee=world.outsider, user=world.outsider_user, request_type=world.annual,
             start=date(2026, 11, 3), end=date(2026, 11, 4))

    response = client_for(world.manager_user).get(URL)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"who_is_out", "delegation", "people"}
    assert names(body) == [org_selectors.full_name(world.peer), org_selectors.full_name(world.owner)]
    first, second = body["who_is_out"]
    assert set(first) == {"employee", "label", "type_name", "start_date", "end_date",
                          "starts_at_midday", "ends_at_midday", "today"}
    assert first == {**first, "label": "absent", "type_name": world.sick.name_fr, "today": True,
                     "start_date": "2026-11-02", "end_date": "2026-11-03"}
    assert second == {**second, "label": "remote", "today": False, "start_date": "2026-11-05",
                      "starts_at_midday": True}
    assert body["delegation"] is None


def test_people_carries_presence_today_and_balance_for_every_team_member(world, client_for):
    give_balance(world, world.owner, "12")
    give_balance(world, world.peer, "7.5")
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
             start=date(2026, 11, 2), end=date(2026, 11, 3))
    approved(world, employee=world.owner, user=world.owner_user, request_type=world.remote,
             start=date(2026, 11, 5), end=date(2026, 11, 5))

    body = client_for(world.manager_user).get(URL).json()

    assert [person["public_id"] for person in body["people"]] == [str(world.owner.public_id), str(world.peer.public_id)]
    assert presence(body, world.owner) == {"public_id": str(world.owner.public_id), "today": "in", "balance": "12.00"}
    assert presence(body, world.peer) == {"public_id": str(world.peer.public_id), "today": "absent", "balance": "7.50"}


def test_remote_work_today_reads_remote_and_an_absence_wins_over_it(world, client_for):
    approved(world, employee=world.owner, user=world.owner_user, request_type=world.remote,
             start=date(2026, 11, 2), end=date(2026, 11, 2), ends_at_midday=True)
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.remote,
             start=date(2026, 11, 2), end=date(2026, 11, 2), ends_at_midday=True)
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
             start=date(2026, 11, 2), end=date(2026, 11, 2), starts_at_midday=True)

    body = client_for(world.manager_user).get(URL).json()

    assert presence(body, world.owner)["today"] == "remote"
    assert presence(body, world.peer)["today"] == "absent"
    assert Decimal(presence(body, world.owner)["balance"]) == Decimal("0")


def test_nobody_is_marked_away_on_a_day_off(world, client_for):
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
             start=date(2026, 11, 6), end=date(2026, 11, 9))

    saturday = datetime(2026, 11, 7, 8, 0, tzinfo=ZoneInfo("Africa/Tunis"))
    with time_machine.travel(saturday, tick=False):
        body = client_for(world.manager_user).get(URL).json()

    assert presence(body, world.peer)["today"] == "in"
    assert names(body) == [org_selectors.full_name(world.peer)]        # still listed: away again on Monday
    assert body["who_is_out"][0]["today"] is False


def test_delegate_sees_the_delegated_team(world, client_for):
    approved(world, employee=world.outsider, user=world.outsider_user, request_type=world.annual,
             start=date(2026, 11, 3), end=date(2026, 11, 4))
    org_services.create_delegation(actor=world.hr_user, manager=world.other_manager, delegate=world.manager,
                                   start_date=date(2026, 11, 2), end_date=date(2026, 11, 20))

    body = client_for(world.manager_user).get(URL).json()

    assert names(body) == [org_selectors.full_name(world.outsider)]
    assert str(world.outsider.public_id) in [person["public_id"] for person in body["people"]]
    assert body["delegation"] == {"direction": "received", "person": org_selectors.full_name(world.other_manager),
                                  "start_date": "2026-11-02", "end_date": "2026-11-20"}


def test_a_delegation_given_is_reported_and_wins_over_one_received(world, client_for):
    org_services.create_delegation(actor=world.hr_user, manager=world.other_manager, delegate=world.manager,
                                   start_date=date(2026, 11, 2), end_date=date(2026, 11, 20))
    org_services.create_delegation(actor=world.hr_user, manager=world.manager, delegate=world.peer,
                                   start_date=date(2026, 11, 2), end_date=date(2026, 11, 6))

    as_manager = client_for(world.manager_user).get(URL).json()
    as_delegate = client_for(world.peer_user).get(URL)

    assert as_manager["delegation"] == {"direction": "given", "person": org_selectors.full_name(world.peer),
                                        "start_date": "2026-11-02", "end_date": "2026-11-06"}
    assert as_delegate.status_code == 200          # an active delegate is a manager for the period
    assert as_delegate.json()["delegation"]["direction"] == "received"
    # The delegate answers for the owner, not for themselves.
    assert [person["public_id"] for person in as_delegate.json()["people"]] == [str(world.owner.public_id)]


def test_a_delegation_that_has_not_started_is_not_reported(world, client_for):
    org_services.create_delegation(actor=world.hr_user, manager=world.manager, delegate=world.peer,
                                   start_date=date(2026, 11, 9), end_date=date(2026, 11, 13))

    assert client_for(world.manager_user).get(URL).json()["delegation"] is None


def test_today_is_the_tunis_date(world, client_for):
    approved(world, employee=world.owner, user=world.owner_user, request_type=world.sick,
             start=date(2026, 11, 2), end=date(2026, 11, 2))
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.remote,
             start=date(2026, 11, 3), end=date(2026, 11, 3))

    # 23:30 UTC on 2 November is 00:30 on 3 November in Tunis.
    with time_machine.travel(datetime(2026, 11, 2, 23, 30, tzinfo=UTC), tick=False):
        body = client_for(world.manager_user).get(URL).json()

    assert names(body) == [org_selectors.full_name(world.peer)]
    assert body["who_is_out"][0]["today"] is True
    assert presence(body, world.peer)["today"] == "remote"
    assert presence(body, world.owner)["today"] == "in"


def test_a_team_with_nobody_away(world, client_for):
    body = client_for(world.manager_user).get(URL).json()

    assert body["who_is_out"] == [] and body["delegation"] is None
    assert [person["today"] for person in body["people"]] == ["in", "in"]


def test_home_team_is_for_managers(world, client_for, anon_client):
    assert client_for(world.exec_user).get(URL).status_code == 200      # the CEO manages the managers
    assert client_for(world.owner_user).get(URL).status_code == 403
    assert client_for(world.hr_user).get(URL).status_code == 403
    assert client_for(world.sysadmin_user).get(URL).status_code == 403
    assert anon_client.get(URL).status_code == 401
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_home_team.py -v`
Expected: FAIL at collection with `NoReverseMatch: Reverse for 'home-team' not found`.

- [ ] **Step 3: Write the selector**

Replace the import block at the top of `backend/apps/reports/home.py` (everything above `LIST_LIMIT = 5`) with:

```python
"""What each home screen shows. Read-only; every figure comes from another app's selector."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.balances import selectors as balance_selectors
from apps.balances.selectors import BalanceFigures
from apps.calendar import workdays
from apps.core.errors import NotFound
from apps.organisation import reach
from apps.organisation import selectors as org_selectors
from apps.requests import selectors as request_selectors
from apps.requests.models import Request
from apps.requests.spans import request_spans
```

Then append to the file:

```python
WHO_IS_OUT_DAYS = 7
OUT_LABELS = ("absent", "remote")


@dataclass(frozen=True)
class OutPerson:
    employee_public_id: str
    name: str
    label: str
    type_name_fr: str
    type_name_en: str
    start_date: date
    end_date: date
    starts_at_midday: bool
    ends_at_midday: bool
    today: bool


@dataclass(frozen=True)
class DelegationLine:
    direction: str
    person: str
    start_date: date
    end_date: date


@dataclass(frozen=True)
class TeamPerson:
    employee_public_id: str
    today: str
    balance: Decimal


@dataclass(frozen=True)
class TeamHome:
    who_is_out: list[OutPerson]
    delegation: DelegationLine | None
    people: list[TeamPerson]


def team_home(user, *, today: date | None = None) -> TeamHome:
    today = today or timezone.localdate()
    me = reach.employee_of(user)
    if me is None:
        raise NotFound()

    team_ids = reach.team_ids(user, on=today)
    team = {employee.id: employee for employee in org_selectors.employees_for(user) if employee.id in team_ids}
    spans = [
        span
        for span in (request_spans(start=today, end=today + timedelta(days=WHO_IS_OUT_DAYS),
                                   statuses=["approved"], employee_ids=set(team)) if team else [])
        if span.calendar_label in OUT_LABELS
    ]
    working_today = workdays.is_working_day(today)

    def covers_today(span) -> bool:
        return working_today and span.start_date <= today <= span.end_date

    who_is_out = [
        OutPerson(
            employee_public_id=str(team[span.employee_id].public_id),
            name=org_selectors.full_name(team[span.employee_id]),
            label=span.calendar_label,
            type_name_fr=span.type_name_fr,
            type_name_en=span.type_name_en,
            start_date=span.start_date,
            end_date=span.end_date,
            starts_at_midday=span.starts_at_midday,
            ends_at_midday=span.ends_at_midday,
            today=covers_today(span),
        )
        for span in spans
    ]
    who_is_out.sort(key=lambda person: (not person.today, person.start_date, person.name))

    labels_today: dict[int, set[str]] = defaultdict(set)
    for span in spans:
        if covers_today(span):
            labels_today[span.employee_id].add(span.calendar_label)
    balances = balance_selectors.balances_at(today, employee_ids=list(team)) if team else {}
    people = [
        TeamPerson(
            employee_public_id=str(employee.public_id),
            today=_presence(labels_today[employee.id]),
            balance=balances.get(employee.id, Decimal("0")),
        )
        for employee in sorted(team.values(), key=org_selectors.full_name)
    ]
    return TeamHome(who_is_out=who_is_out, delegation=_delegation_line(me, today), people=people)


def _presence(labels: set[str]) -> str:
    if "absent" in labels:
        return "absent"
    return "remote" if "remote" in labels else "in"


def _delegation_line(me, today: date) -> DelegationLine | None:
    given = org_selectors.active_delegations(manager=me, on=today).order_by("end_date").first()
    if given is not None:
        return DelegationLine(direction="given", person=org_selectors.full_name(given.delegate),
                              start_date=given.start_date, end_date=given.end_date)
    received = org_selectors.active_delegations(delegate=me, on=today).order_by("end_date").first()
    if received is not None:
        return DelegationLine(direction="received", person=org_selectors.full_name(received.manager),
                              start_date=received.start_date, end_date=received.end_date)
    return None
```

- [ ] **Step 4: Write the serializers, the view, the route and the matrix case**

In `backend/apps/reports/api/serializers.py`, add these imports under the existing ones:

```python
from apps.calendar.lang import pick
from apps.requests.models import CalendarLabel
```

add these constants under `NEEDS_YOU_KINDS`:

```python
PRESENCE_STATES = ["in", "absent", "remote"]
DELEGATION_DIRECTIONS = ["given", "received"]
```

and append:

```python
class HomePersonOut(serializers.Serializer):
    public_id = serializers.CharField()
    name = serializers.CharField()


class OutPersonOut(serializers.Serializer):
    employee = HomePersonOut()
    label = serializers.ChoiceField(choices=CalendarLabel.choices)
    type_name = serializers.CharField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    starts_at_midday = serializers.BooleanField()
    ends_at_midday = serializers.BooleanField()
    today = serializers.BooleanField()


class DelegationLineOut(serializers.Serializer):
    direction = serializers.ChoiceField(choices=DELEGATION_DIRECTIONS)
    person = serializers.CharField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()


class TeamPersonOut(serializers.Serializer):
    public_id = serializers.CharField()
    today = serializers.ChoiceField(choices=PRESENCE_STATES)
    balance = serializers.DecimalField(max_digits=9, decimal_places=2)


class TeamHomeOut(serializers.Serializer):
    who_is_out = OutPersonOut(many=True)
    delegation = DelegationLineOut(allow_null=True)
    people = TeamPersonOut(many=True)


def team_home_payload(data) -> dict:
    return {
        "who_is_out": [
            {
                "employee": {"public_id": person.employee_public_id, "name": person.name},
                "label": person.label,
                "type_name": pick(person.type_name_fr, person.type_name_en),
                "start_date": person.start_date,
                "end_date": person.end_date,
                "starts_at_midday": person.starts_at_midday,
                "ends_at_midday": person.ends_at_midday,
                "today": person.today,
            }
            for person in data.who_is_out
        ],
        "delegation": None if data.delegation is None else {
            "direction": data.delegation.direction,
            "person": data.delegation.person,
            "start_date": data.delegation.start_date,
            "end_date": data.delegation.end_date,
        },
        "people": [
            {"public_id": person.employee_public_id, "today": person.today, "balance": person.balance}
            for person in data.people
        ],
    }
```

In `backend/config/settings.py`, add to `SPECTACULAR_SETTINGS["ENUM_NAME_OVERRIDES"]`:

```python
        "PresenceEnum": "apps.reports.api.serializers.PRESENCE_STATES",
        "DelegationDirectionEnum": "apps.reports.api.serializers.DELEGATION_DIRECTIONS",
```

Append to `backend/apps/reports/api/views.py` (extend the serializer import to `from apps.reports.api.serializers import MeHomeOut, TeamHomeOut, me_home_payload, team_home_payload`):

```python
class TeamHomeView(APIView):
    access = {"GET": {Role.MANAGER}}
    http_method_names = ["get"]

    @extend_schema(operation_id="home_team", responses=TeamHomeOut)
    def get(self, request):
        return Response(TeamHomeOut(team_home_payload(home.team_home(request.user))).data)
```

Append to `urlpatterns` in `backend/apps/reports/api/urls.py`:

```python
    path("home/team", views.TeamHomeView.as_view(), name="home-team"),
```

Append to `CASES` in `backend/apps/reports/tests/matrix.py`:

```python
    Case("reports:home-team", "GET", only(P.MANAGER, P.OTHER_MANAGER, P.EXEC)),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_home_team.py -v`
Expected: 10 passed.

Run: `docker compose run --rm app pytest tests/test_permission_matrix.py -v -k home`
Expected: PASS.

- [ ] **Step 6: Regenerate the API description**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: no line starting with `Warning`; the description now has `GET /api/v1/home/team`.

Run: `docker compose run --rm app pytest tests/test_openapi.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/reports backend/config/settings.py backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(reports): My team home endpoint with who is out, delegation and people"
```

---

### Task 6: `home/overview`

**Files:**
- Modify: `backend/apps/reports/home.py` (append)
- Modify: `backend/apps/reports/api/serializers.py` (append)
- Modify: `backend/apps/reports/api/views.py` (append)
- Modify: `backend/apps/reports/api/urls.py` (one route appended)
- Modify: `backend/apps/reports/tests/matrix.py` (one case appended)
- Modify: `backend/openapi.yaml`, `frontend/src/api/schema.d.ts` (regenerated)
- Test: `backend/apps/reports/tests/test_home_overview.py`

**Interfaces:**
- Consumes: `apps.requests.spans.request_spans`, `absence_type_codes` (Task 1); `apps.requests.selectors.day_rows(*, start, end, statuses, employee_ids=None, type_codes=None) -> list[DayRow]` (each row has `employee_id` and `portion`), `waiting_rows(*, employee_ids=None) -> list[WaitingRow]` (the longest wait first; each row has `request`, `waiting_on` as display names, and `since`); `apps.calendar.lang.pick(fr, en)`; `apps.balances.selectors.balances_at(on, *, employee_ids=None) -> dict[int, Decimal]`; `apps.organisation.selectors.directory()`, `employees_for(user, *, include_archived=False)`, `full_name(employee)`; `Employee.department` with `name_fr`, `name_en`.
- Produces:

```python
# apps/reports/home.py
@dataclass(frozen=True)
class OutName: name: str; label: str; start_date: date; end_date: date
@dataclass(frozen=True)
class OutDepartment: department_fr: str; department_en: str; today: list[OutName]; week: list[OutName]
@dataclass(frozen=True)
class AbsenceMonth: department_fr: str; department_en: str; days: Decimal; previous_days: Decimal
@dataclass(frozen=True)
class DepartmentBalance: department_fr: str; department_en: str; total: Decimal
@dataclass(frozen=True)
class PersonBalance: name: str; department_fr: str; department_en: str; balance: Decimal
@dataclass(frozen=True)
class LeaveOwed: departments: list[DepartmentBalance]; largest: list[PersonBalance]
@dataclass(frozen=True)
class WaitingLine: request_public_id: str; employee_name: str; type_name_fr: str; type_name_en: str; waiting_on: list[str]; since: datetime | None
@dataclass(frozen=True)
class OverviewHome: out_now: list[OutDepartment]; absence_this_month: list[AbsenceMonth]; leave_owed: LeaveOwed; waiting: list[WaitingLine]
def overview_home(user, *, today: date | None = None) -> OverviewHome
```

`GET /api/v1/home/overview`, route name `reports:home-overview`, operation id `home_overview`, access EXEC:

```jsonc
{
  "out_now": [{"department": "…", "today": [{"name": "…", "label": "absent", "start_date": "…", "end_date": "…"}],
               "week": [{"name": "…", "label": "remote", "start_date": "…", "end_date": "…"}]}],
  "absence_this_month": [{"department": "…", "days": "2.00", "previous_days": "2.00"}],
  "leave_owed": {"departments": [{"department": "…", "total": "25.00"}],
                 "largest": [{"name": "…", "department": "…", "balance": "20.00"}]},
  "waiting": [{"request_public_id": "…", "employee_name": "…", "type_name": "…", "waiting_on": ["…"], "since": "…"}]
}
```

Rules:

- `out_now`: approved absences and remote days, by department, only for departments with somebody out. `today` holds those covering today; `week` those touching the days from today to Sunday. Labels only (`absent`, `remote`), never a type.
- `absence_this_month`: one line per department with active employees: working days of approved absence (types labelled `absent`; half-days count 0.5) in the current calendar month and in the previous one.
- `leave_owed`: the posted annual balance today, summed per department, and the five largest positive individual balances.
- `waiting`: the five requests undecided for longest, oldest first.
- Nothing in the response comes from a comment or an attachment.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/reports/tests/test_home_overview.py
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
import time_machine
from django.urls import reverse

from apps.organisation import selectors as org_selectors
from tests.request_flows import NOW, approved, give_balance, send

pytestmark = pytest.mark.django_db

URL = reverse("reports:home-overview")


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def by_department(lines):
    return {line["department"]: line for line in lines}


def test_out_now_groups_people_by_department_with_labels_only(world, client_for):
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
             start=date(2026, 11, 2), end=date(2026, 11, 3))
    approved(world, employee=world.outsider, user=world.outsider_user, request_type=world.remote,
             start=date(2026, 11, 5), end=date(2026, 11, 5))

    response = client_for(world.exec_user).get(URL)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"out_now", "absence_this_month", "leave_owed", "waiting"}
    out = by_department(body["out_now"])
    assert set(out) == {world.dept_a.name_fr, world.dept_b.name_fr}
    peer = {"name": org_selectors.full_name(world.peer), "label": "absent",
            "start_date": "2026-11-02", "end_date": "2026-11-03"}
    assert out[world.dept_a.name_fr]["today"] == [peer]
    assert out[world.dept_a.name_fr]["week"] == [peer]
    assert out[world.dept_b.name_fr]["today"] == []
    assert out[world.dept_b.name_fr]["week"] == [
        {"name": org_selectors.full_name(world.outsider), "label": "remote",
         "start_date": "2026-11-05", "end_date": "2026-11-05"},
    ]


def test_out_now_is_empty_when_everybody_is_in(world, client_for):
    assert client_for(world.exec_user).get(URL).json()["out_now"] == []


def test_absence_this_month_counts_working_days_of_absence_per_department(world, client_for):
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
             start=date(2026, 11, 2), end=date(2026, 11, 3))                       # 2 days, department A
    approved(world, employee=world.owner, user=world.owner_user, request_type=world.sick,
             start=date(2026, 10, 28), end=date(2026, 10, 29))                     # 2 days last month, A
    approved(world, employee=world.outsider, user=world.outsider_user, request_type=world.sick,
             start=date(2026, 11, 4), end=date(2026, 11, 4), ends_at_midday=True)  # half a day, B
    approved(world, employee=world.outsider, user=world.outsider_user, request_type=world.remote,
             start=date(2026, 11, 5), end=date(2026, 11, 5))                       # remote is not absence

    lines = by_department(client_for(world.exec_user).get(URL).json()["absence_this_month"])

    assert set(lines) == {world.dept_a.name_fr, world.dept_b.name_fr}
    assert Decimal(lines[world.dept_a.name_fr]["days"]) == Decimal("2")
    assert Decimal(lines[world.dept_a.name_fr]["previous_days"]) == Decimal("2")
    assert Decimal(lines[world.dept_b.name_fr]["days"]) == Decimal("0.5")
    assert Decimal(lines[world.dept_b.name_fr]["previous_days"]) == Decimal("0")


def test_previous_month_in_january(world, client_for):
    january = datetime(2027, 1, 4, 8, 0, tzinfo=ZoneInfo("Africa/Tunis"))       # a Monday
    with time_machine.travel(january, tick=False):
        approved(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
                 start=date(2026, 12, 28), end=date(2026, 12, 29))
        lines = by_department(client_for(world.exec_user).get(URL).json()["absence_this_month"])

    assert Decimal(lines[world.dept_a.name_fr]["days"]) == Decimal("0")
    assert Decimal(lines[world.dept_a.name_fr]["previous_days"]) == Decimal("2")


def test_leave_owed_totals_departments_and_names_the_largest_balances(world, client_for):
    give_balance(world, world.owner, "20")
    give_balance(world, world.peer, "5")
    give_balance(world, world.outsider, "12")

    owed = client_for(world.exec_user).get(URL).json()["leave_owed"]

    totals = by_department(owed["departments"])
    assert Decimal(totals[world.dept_a.name_fr]["total"]) == Decimal("25")
    assert Decimal(totals[world.dept_b.name_fr]["total"]) == Decimal("12")
    assert [(person["name"], Decimal(person["balance"])) for person in owed["largest"]] == [
        (org_selectors.full_name(world.owner), Decimal("20")),
        (org_selectors.full_name(world.outsider), Decimal("12")),
        (org_selectors.full_name(world.peer), Decimal("5")),
    ]
    assert owed["largest"][0]["department"] == world.dept_a.name_fr


def test_waiting_lists_the_oldest_undecided_requests_first(world, client_for):
    oldest = send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
                  start=date(2026, 11, 17), end=date(2026, 11, 18))
    with time_machine.travel(NOW + timedelta(days=1), tick=False):
        newer = send(world, employee=world.peer, user=world.peer_user, request_type=world.annual,
                     start=date(2026, 11, 24), end=date(2026, 11, 24))
        waiting = client_for(world.exec_user).get(URL).json()["waiting"]

    assert [line["request_public_id"] for line in waiting] == [str(oldest.public_id), str(newer.public_id)]
    first = waiting[0]
    assert set(first) == {"request_public_id", "employee_name", "type_name", "waiting_on", "since"}
    assert first["employee_name"] == org_selectors.full_name(world.owner)
    assert first["type_name"] == world.annual.name_fr
    assert first["waiting_on"] == [org_selectors.full_name(world.manager)]


def test_waiting_holds_at_most_five_lines(world, client_for):
    for day in (3, 4, 5, 6, 9, 10):
        send(world, employee=world.owner, user=world.owner_user, request_type=world.remote,
             start=date(2026, 11, day), end=date(2026, 11, day), starts_at_midday=True)

    assert len(client_for(world.exec_user).get(URL).json()["waiting"]) == 5


def test_the_overview_carries_no_medical_detail(world, client_for):
    send(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
         start=date(2026, 11, 2), end=date(2026, 11, 3), comment="Severe migraine, doctor at 3pm")

    response = client_for(world.exec_user).get(URL)

    text = response.content.decode()
    assert "migraine" not in text.lower()
    assert "comment" not in text
    assert response.json()["waiting"][0]["type_name"] == world.sick.name_fr


def test_home_overview_is_for_executives_only(world, client_for, anon_client):
    for user in (world.hr_user, world.manager_user, world.owner_user, world.sysadmin_user):
        assert client_for(user).get(URL).status_code == 403
    assert anon_client.get(URL).status_code == 401
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_home_overview.py -v`
Expected: FAIL at collection with `NoReverseMatch: Reverse for 'home-overview' not found`.

- [ ] **Step 3: Write the selector**

In `backend/apps/reports/home.py`, extend the spans import to `from apps.requests.spans import absence_type_codes, request_spans`, then append:

```python
OVERVIEW_LIMIT = 5


@dataclass(frozen=True)
class OutName:
    name: str
    label: str
    start_date: date
    end_date: date


@dataclass(frozen=True)
class OutDepartment:
    department_fr: str
    department_en: str
    today: list[OutName]
    week: list[OutName]


@dataclass(frozen=True)
class AbsenceMonth:
    department_fr: str
    department_en: str
    days: Decimal
    previous_days: Decimal


@dataclass(frozen=True)
class DepartmentBalance:
    department_fr: str
    department_en: str
    total: Decimal


@dataclass(frozen=True)
class PersonBalance:
    name: str
    department_fr: str
    department_en: str
    balance: Decimal


@dataclass(frozen=True)
class LeaveOwed:
    departments: list[DepartmentBalance]
    largest: list[PersonBalance]


@dataclass(frozen=True)
class WaitingLine:
    request_public_id: str
    employee_name: str
    type_name_fr: str
    type_name_en: str
    waiting_on: list[str]
    since: datetime | None


@dataclass(frozen=True)
class OverviewHome:
    out_now: list[OutDepartment]
    absence_this_month: list[AbsenceMonth]
    leave_owed: LeaveOwed
    waiting: list[WaitingLine]


def overview_home(user, *, today: date | None = None) -> OverviewHome:
    today = today or timezone.localdate()
    active = list(org_selectors.directory().select_related("department"))
    everyone = {employee.id: employee
                for employee in org_selectors.employees_for(user, include_archived=True).select_related("department")}
    departments = sorted({employee.department for employee in active}, key=lambda department: department.name_fr)
    return OverviewHome(
        out_now=_out_now(active, departments, today),
        absence_this_month=_absence_by_month(everyone, departments, today),
        leave_owed=_leave_owed(active, departments, today),
        waiting=_waiting(everyone),
    )


def _out_now(active, departments, today: date) -> list[OutDepartment]:
    people = {employee.id: employee for employee in active}
    sunday = today + timedelta(days=6 - today.weekday())
    spans = [span for span in request_spans(start=today, end=sunday, statuses=["approved"], employee_ids=set(people))
             if span.calendar_label in OUT_LABELS]
    result = []
    for department in departments:
        week = sorted(
            (OutName(name=org_selectors.full_name(people[span.employee_id]), label=span.calendar_label,
                     start_date=span.start_date, end_date=span.end_date)
             for span in spans if people[span.employee_id].department_id == department.id),
            key=lambda person: (person.start_date, person.name),
        )
        if week:
            result.append(OutDepartment(
                department_fr=department.name_fr, department_en=department.name_en,
                today=[person for person in week if person.start_date <= today <= person.end_date],
                week=week,
            ))
    return result


def _month_bounds(day: date) -> tuple[date, date]:
    first = day.replace(day=1)
    next_first = (first + timedelta(days=32)).replace(day=1)
    return first, next_first - timedelta(days=1)


def _absence_days(everyone, start: date, end: date) -> dict[int, Decimal]:
    """Working days of approved absence per department id in [start, end]."""
    totals: dict[int, Decimal] = {}
    codes = absence_type_codes()
    if not codes:
        return totals
    for row in request_selectors.day_rows(start=start, end=end, statuses=["approved"], type_codes=codes):
        employee = everyone.get(row.employee_id)
        if employee is None:
            continue
        totals[employee.department_id] = totals.get(employee.department_id, Decimal("0")) + row.portion
    return totals


def _absence_by_month(everyone, departments, today: date) -> list[AbsenceMonth]:
    this_first, this_last = _month_bounds(today)
    previous_first, previous_last = _month_bounds(this_first - timedelta(days=1))
    current = _absence_days(everyone, this_first, this_last)
    previous = _absence_days(everyone, previous_first, previous_last)
    return [
        AbsenceMonth(department_fr=department.name_fr, department_en=department.name_en,
                     days=current.get(department.id, Decimal("0")),
                     previous_days=previous.get(department.id, Decimal("0")))
        for department in departments
    ]


def _leave_owed(active, departments, today: date) -> LeaveOwed:
    balances = balance_selectors.balances_at(today, employee_ids=[employee.id for employee in active])
    totals: dict[int, Decimal] = {}
    people: list[PersonBalance] = []
    for employee in active:
        balance = balances.get(employee.id, Decimal("0"))
        totals[employee.department_id] = totals.get(employee.department_id, Decimal("0")) + balance
        if balance > 0:
            people.append(PersonBalance(name=org_selectors.full_name(employee),
                                        department_fr=employee.department.name_fr,
                                        department_en=employee.department.name_en, balance=balance))
    people.sort(key=lambda person: (-person.balance, person.name))
    return LeaveOwed(
        departments=[DepartmentBalance(department_fr=department.name_fr, department_en=department.name_en,
                                       total=totals.get(department.id, Decimal("0")))
                     for department in departments],
        largest=people[:OVERVIEW_LIMIT],
    )


def _waiting(everyone) -> list[WaitingLine]:
    rows = request_selectors.waiting_rows()[:OVERVIEW_LIMIT]          # already the longest wait first
    lines = []
    for row in rows:
        employee = everyone.get(row.request.employee_id)
        lines.append(WaitingLine(
            request_public_id=str(row.request.public_id),
            employee_name=org_selectors.full_name(employee) if employee is not None else "",
            type_name_fr=row.request.request_type.name_fr,
            type_name_en=row.request.request_type.name_en,
            waiting_on=list(row.waiting_on),
            since=row.since,
        ))
    return lines
```

- [ ] **Step 4: Write the serializers, the view, the route and the matrix case**

Append to `backend/apps/reports/api/serializers.py`:

```python
class OutNameOut(serializers.Serializer):
    name = serializers.CharField()
    label = serializers.ChoiceField(choices=CalendarLabel.choices)
    start_date = serializers.DateField()
    end_date = serializers.DateField()


class OutDepartmentOut(serializers.Serializer):
    department = serializers.CharField()
    today = OutNameOut(many=True)
    week = OutNameOut(many=True)


class AbsenceMonthOut(serializers.Serializer):
    department = serializers.CharField()
    days = serializers.DecimalField(max_digits=7, decimal_places=2)
    previous_days = serializers.DecimalField(max_digits=7, decimal_places=2)


class DepartmentBalanceOut(serializers.Serializer):
    department = serializers.CharField()
    total = serializers.DecimalField(max_digits=9, decimal_places=2)


class PersonBalanceOut(serializers.Serializer):
    name = serializers.CharField()
    department = serializers.CharField()
    balance = serializers.DecimalField(max_digits=7, decimal_places=2)


class LeaveOwedOut(serializers.Serializer):
    departments = DepartmentBalanceOut(many=True)
    largest = PersonBalanceOut(many=True)


class WaitingLineOut(serializers.Serializer):
    request_public_id = serializers.CharField()
    employee_name = serializers.CharField(allow_blank=True)
    type_name = serializers.CharField()
    waiting_on = serializers.ListField(child=serializers.CharField())
    since = serializers.DateTimeField(allow_null=True)


class OverviewHomeOut(serializers.Serializer):
    out_now = OutDepartmentOut(many=True)
    absence_this_month = AbsenceMonthOut(many=True)
    leave_owed = LeaveOwedOut()
    waiting = WaitingLineOut(many=True)


def overview_home_payload(data) -> dict:
    def department(item) -> str:
        return pick(item.department_fr, item.department_en)

    def out_name(person) -> dict:
        return {"name": person.name, "label": person.label,
                "start_date": person.start_date, "end_date": person.end_date}

    return {
        "out_now": [
            {"department": department(group), "today": [out_name(p) for p in group.today],
             "week": [out_name(p) for p in group.week]}
            for group in data.out_now
        ],
        "absence_this_month": [
            {"department": department(line), "days": line.days, "previous_days": line.previous_days}
            for line in data.absence_this_month
        ],
        "leave_owed": {
            "departments": [{"department": department(line), "total": line.total}
                            for line in data.leave_owed.departments],
            "largest": [{"name": person.name, "department": department(person), "balance": person.balance}
                        for person in data.leave_owed.largest],
        },
        "waiting": [
            {"request_public_id": line.request_public_id, "employee_name": line.employee_name,
             "type_name": pick(line.type_name_fr, line.type_name_en),
             "waiting_on": line.waiting_on, "since": line.since}
            for line in data.waiting
        ],
    }
```

Append to `backend/apps/reports/api/views.py` (add `OverviewHomeOut, overview_home_payload` to the serializer import):

```python
class OverviewHomeView(APIView):
    access = {"GET": {Role.EXEC}}
    http_method_names = ["get"]

    @extend_schema(operation_id="home_overview", responses=OverviewHomeOut)
    def get(self, request):
        return Response(OverviewHomeOut(overview_home_payload(home.overview_home(request.user))).data)
```

Append to `urlpatterns` in `backend/apps/reports/api/urls.py`:

```python
    path("home/overview", views.OverviewHomeView.as_view(), name="home-overview"),
```

Append to `CASES` in `backend/apps/reports/tests/matrix.py`:

```python
    Case("reports:home-overview", "GET", only(P.EXEC)),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_home_overview.py -v`
Expected: 9 passed.

- [ ] **Step 6: Regenerate the API description**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: no line starting with `Warning`; the description now has `GET /api/v1/home/overview`. Its `label` fields reuse plan 03a's `CalendarLabelEnum`, so no new enumeration name is needed.

Run: `docker compose run --rm app pytest tests/test_openapi.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/reports backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(reports): Overview home endpoint"
```

---

### Task 7: `workspaces/summary`

The switcher shows how many things wait in each workspace (UI 3.2). One endpoint returns the five numbers for the signed-in user. A workspace the user does not have counts zero.

| Workspace | What is counted |
|---|---|
| `me` | Own requests sent back, plus own requests with a certificate outstanding. For a person who is not a manager: also steps given to them by name |
| `team` | Steps the user may decide in plan 03a's queue `mine` (a manager's or delegate's steps, steps given by name, and for an executive the HR steps that fell back to them) |
| `hr` | Distinct steps in the three HR queues (`hr`, `certificates`, `stuck`), plus profile changes to decide |
| `overview` | Always 0: the workspace is read-only |
| `admin` | Locked accounts, expired temporary passwords, employees without an account, and jobs whose last run failed |

**Files:**
- Create: `backend/apps/reports/summary.py`
- Modify: `backend/apps/reports/api/serializers.py`, `views.py`, `urls.py` (append)
- Modify: `backend/apps/reports/tests/matrix.py` (one case appended)
- Modify: `backend/openapi.yaml`, `frontend/src/api/schema.d.ts` (regenerated)
- Test: `backend/apps/reports/tests/test_summary.py`

**Interfaces:**
- Consumes (plan 01a): `apps.accounts.roles.Role`, `roles_of(user)`; `apps.accounts.permissions.AUTHENTICATED`; `apps.accounts.selectors.accounts_needing_attention(*, now) -> dict[str, list]` with the keys `locked`, `awaiting_first_sign_in`, `temp_expired`, `employees_without_account`; `apps.core.selectors.job_rows(*, now) -> list[dict]` (each row has `last_ok`); `apps.core.models.JobStatus`; `tests.matrix.SIGNED_IN`. (Plan 02): `apps.organisation.reach.employee_of`; `apps.organisation.selectors.profile_changes_for(user, *, scope, status)` (with `scope="all"` it leaves out the HR holder's own proposals); `apps.organisation.services.propose_profile_change(*, user, changes, note="")`. (Plan 03a): `apps.requests.selectors.requests_for`, `outstanding_certificates`, `queue(user, name) -> QuerySet[RequestStep]` (`mine` for anyone with an employee record; `hr`, `certificates`, `stuck` for HR; never a step of the user's own request); `apps.requests.services.reassign_step(*, actor, step, new_approver, reason)`; the test helper `pending_step(request)`.
- Produces:

```python
# apps/reports/summary.py
def workspace_summary(user, *, now: datetime | None = None) -> dict[str, int]    # keys: me, team, hr, overview, admin
```

`GET /api/v1/workspaces/summary`, route name `reports:workspace-summary`, operation id `workspaces_summary`, access AUTH. Response: `{"me": 2, "team": 3, "hr": 0, "overview": 0, "admin": 0}`. Schema component: `WorkspaceSummaryOut`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/reports/tests/test_summary.py
from datetime import date, timedelta

import pytest
import time_machine
from django.urls import reverse
from django.utils import timezone

from apps.core.models import JobStatus
from apps.organisation import services as org_services
from apps.requests import services as request_services
from apps.requests.tests.helpers import pending_step
from tests.request_flows import NOW, decide, send

pytestmark = pytest.mark.django_db

URL = reverse("reports:workspace-summary")
NOTHING = {"me": 0, "team": 0, "hr": 0, "overview": 0, "admin": 0}


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def summary(client_for, user):
    response = client_for(user).get(URL)
    assert response.status_code == 200
    return response.json()


def test_nothing_waits_in_a_quiet_company(world, client_for):
    for user in (world.owner_user, world.manager_user, world.hr_user, world.exec_user, world.sysadmin_user):
        assert summary(client_for, user) == NOTHING


def test_me_counts_requests_sent_back_and_certificates_outstanding(world, client_for):
    returned = send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
                    start=date(2026, 11, 10), end=date(2026, 11, 10))
    decide(returned, "return", "Pick another week")
    send(world, employee=world.owner, user=world.owner_user, request_type=world.sick,
         start=date(2026, 11, 2), end=date(2026, 11, 2))

    assert summary(client_for, world.owner_user)["me"] == 2
    assert summary(client_for, world.peer_user)["me"] == 0


def test_team_counts_the_steps_a_manager_may_decide(world, client_for):
    send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
         start=date(2026, 11, 10), end=date(2026, 11, 10))
    send(world, employee=world.peer, user=world.peer_user, request_type=world.remote,
         start=date(2026, 11, 4), end=date(2026, 11, 4))

    assert summary(client_for, world.manager_user) == {**NOTHING, "team": 2}
    assert summary(client_for, world.other_manager_user)["team"] == 0


def test_hr_counts_its_queues_and_profile_changes(world, client_for):
    request = send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
                   start=date(2026, 11, 10), end=date(2026, 11, 10))
    decide(request, "approve")                                   # the manager approves; HR is next
    org_services.propose_profile_change(user=world.peer_user, changes={"phone": "+216 20 000 000"})

    assert summary(client_for, world.hr_user) == {**NOTHING, "hr": 2}


def test_hr_counts_a_sick_leave_without_certificate_once(world, client_for):
    # It waits for HR and has no certificate: the same step is in the queues "hr" and "certificates".
    send(world, employee=world.owner, user=world.owner_user, request_type=world.sick,
         start=date(2026, 11, 2), end=date(2026, 11, 2))

    assert summary(client_for, world.hr_user)["hr"] == 1


def test_a_step_given_to_someone_who_is_not_a_manager_counts_in_my_space(world, client_for):
    request = send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
                   start=date(2026, 11, 10), end=date(2026, 11, 10))
    request_services.reassign_step(actor=world.hr_user, step=pending_step(request),
                                   new_approver=world.outsider, reason="Cover")

    assert summary(client_for, world.outsider_user) == {**NOTHING, "me": 1}
    assert summary(client_for, world.manager_user)["team"] == 0


def test_sysadmin_without_record(world, client_for):
    world.owner_user.locked_until = timezone.now() + timedelta(minutes=10)
    world.owner_user.save(update_fields=["locked_until"])
    world.peer_user.must_change_password = True
    world.peer_user.temp_password_expires_at = timezone.now() - timedelta(hours=1)
    world.peer_user.save(update_fields=["must_change_password", "temp_password_expires_at"])
    JobStatus.objects.create(name="demo.failing", schedule="0 1 * * *", last_started_at=timezone.now(),
                             last_finished_at=timezone.now(), last_ok=False, last_detail="boom")
    JobStatus.objects.create(name="demo.fine", schedule="0 2 * * *", last_started_at=timezone.now(),
                             last_finished_at=timezone.now(), last_ok=True, last_detail="")

    assert summary(client_for, world.sysadmin_user) == {**NOTHING, "admin": 3}
    # Somebody who is not an administrator learns nothing about accounts.
    assert summary(client_for, world.exec_user)["admin"] == 0


def test_overview_never_counts(world, client_for):
    send(world, employee=world.owner, user=world.owner_user, request_type=world.annual,
         start=date(2026, 11, 10), end=date(2026, 11, 10))

    assert summary(client_for, world.exec_user)["overview"] == 0


def test_summary_needs_a_session(anon_client):
    assert anon_client.get(URL).status_code == 401
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_summary.py -v`
Expected: FAIL at collection with `NoReverseMatch: Reverse for 'workspace-summary' not found`.

- [ ] **Step 3: Write the summary, the serializer, the view, the route and the matrix case**

```python
# backend/apps/reports/summary.py
"""How many things wait in each workspace, for the workspace switcher."""
from __future__ import annotations

from datetime import datetime

from django.utils import timezone

from apps.accounts import selectors as account_selectors
from apps.accounts.roles import Role, roles_of
from apps.core import selectors as core_selectors
from apps.organisation import reach
from apps.organisation import selectors as org_selectors
from apps.requests import selectors as request_selectors

HR_QUEUES = ("hr", "certificates", "stuck")
# The groups of the status page an administrator has to act on. Accounts that only wait for a
# first sign-in are not a problem yet.
ATTENTION_GROUPS = ("locked", "temp_expired", "employees_without_account")


def workspace_summary(user, *, now: datetime | None = None) -> dict[str, int]:
    now = now or timezone.now()
    roles = roles_of(user)
    counts = {"me": 0, "team": 0, "hr": 0, "overview": 0, "admin": 0}

    me = reach.employee_of(user)
    if me is not None:
        returned = request_selectors.requests_for(user, "mine").filter(status="returned").count()
        certificates = len(request_selectors.outstanding_certificates(employee_ids=[me.id], now=now))
        counts["me"] = returned + certificates
        to_decide = request_selectors.queue(user, "mine").count()
        if Role.MANAGER in roles:
            counts["team"] = to_decide
        else:
            # No My team workspace: the step is reached from My space (the notification links to it).
            counts["me"] += to_decide

    if Role.HR in roles:
        steps: set[int] = set()
        for name in HR_QUEUES:
            steps.update(request_selectors.queue(user, name).values_list("pk", flat=True))
        changes = org_selectors.profile_changes_for(user, scope="all", status="pending").count()
        counts["hr"] = len(steps) + changes

    if Role.SYSADMIN in roles:
        attention = account_selectors.accounts_needing_attention(now=now)
        failed_jobs = sum(1 for row in core_selectors.job_rows(now=now) if row["last_ok"] is False)
        counts["admin"] = sum(len(attention[group]) for group in ATTENTION_GROUPS) + failed_jobs

    return counts
```

Append to `backend/apps/reports/api/serializers.py`:

```python
class WorkspaceSummaryOut(serializers.Serializer):
    me = serializers.IntegerField()
    team = serializers.IntegerField()
    hr = serializers.IntegerField()
    overview = serializers.IntegerField()
    admin = serializers.IntegerField()
```

Append to `backend/apps/reports/api/views.py` (add the imports `from apps.accounts.permissions import AUTHENTICATED` and `from apps.reports import summary`, and `WorkspaceSummaryOut` to the serializer import):

```python
class WorkspaceSummaryView(APIView):
    access = {"GET": AUTHENTICATED}
    http_method_names = ["get"]

    @extend_schema(operation_id="workspaces_summary", responses=WorkspaceSummaryOut)
    def get(self, request):
        return Response(WorkspaceSummaryOut(summary.workspace_summary(request.user)).data)
```

Append to `urlpatterns` in `backend/apps/reports/api/urls.py`:

```python
    path("workspaces/summary", views.WorkspaceSummaryView.as_view(), name="workspace-summary"),
```

In `backend/apps/reports/tests/matrix.py`, change the import to `from tests.matrix import SIGNED_IN, Case, P, only` and append to `CASES`:

```python
    Case("reports:workspace-summary", "GET", only(*SIGNED_IN)),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_summary.py -v`
Expected: 9 passed.

Run: `docker compose run --rm app pytest tests/test_permission_matrix.py -q`
Expected: PASS, with no "endpoint without a case" failure.

- [ ] **Step 5: Regenerate the API description**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: no line starting with `Warning`; the description now has `GET /api/v1/workspaces/summary`.

Run: `docker compose run --rm app pytest tests/test_openapi.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/reports backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(reports): workspace summary counts for the switcher"
```

---

### Task 8: Privacy sweep, the demo data, and the backend check

No new code. Two guards are added: a sweep that calls every endpoint of this plan as every persona, and a test that the demo data of plans 03a and 04 gives this plan's pages something to show, because the browser journeys of Task 17 rely on it.

**Files:**
- Test: `backend/apps/reports/tests/test_privacy_sweep.py`
- Test: `backend/apps/reports/tests/test_demo_data.py`

**Interfaces:**
- Consumes: every endpoint of Tasks 3 to 7; `tests.matrix.P`; `world.user_for(P.X)`; the command `seed_demo` with the seeders of plans 01a, 02, 03a and 04. The demo requests of plan 03a, counted in working days from today: `employee.a1` asks annual leave on days 10 and 11 (waiting for the manager) and has approved remote work on day 3; `employee.a2` declared sick leave on the last working day (waiting for HR, no certificate); `manager.a` has approved annual leave on day 15; `employee.b1` asks remote work on day 4 (waiting for the other manager).
- Produces: nothing new.

- [ ] **Step 1: Write the sweep**

```python
# backend/apps/reports/tests/test_privacy_sweep.py
"""Every endpoint of this plan, called as every persona: nothing medical leaks, and the
department calendar never tells a colleague why somebody is away."""
import json
from datetime import date, time

import pytest
import time_machine
from django.urls import reverse

from tests.matrix import P
from tests.request_flows import NOW, approved, send

pytestmark = pytest.mark.django_db

NOVEMBER = {"from": "2026-11-01", "to": "2026-11-30"}
ENDPOINTS = [
    ("calendar:feed", {**NOVEMBER, "scope": "department"}),
    ("calendar:feed", {**NOVEMBER, "scope": "team"}),
    ("calendar:feed", {**NOVEMBER, "scope": "company"}),
    ("reports:home-me", {}),
    ("reports:home-team", {}),
    ("reports:home-overview", {}),
    ("reports:workspace-summary", {}),
]
SIGNED_IN = [persona for persona in P if persona is not P.ANON]
WITH_RECORD = [persona for persona in SIGNED_IN if persona is not P.SYSADMIN]


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


@pytest.fixture
def scenario(world):
    """The peer (department A) and the outsider (department B) are on sick leave with a telling comment."""
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.sick,
             start=date(2026, 11, 2), end=date(2026, 11, 3), comment="Severe migraine")
    send(world, employee=world.peer, user=world.peer_user, request_type=world.annual,
         start=date(2026, 11, 17), end=date(2026, 11, 18), comment="Family trip")
    approved(world, employee=world.peer, user=world.peer_user, request_type=world.permission,
             start=date(2026, 11, 4), end=date(2026, 11, 4), start_time=time(9, 0), end_time=time(10, 0))
    approved(world, employee=world.outsider, user=world.outsider_user, request_type=world.sick,
             start=date(2026, 11, 2), end=date(2026, 11, 2), comment="Migraine again")
    return world


@pytest.mark.parametrize("persona", SIGNED_IN)
def test_no_endpoint_of_this_plan_leaks_a_sick_leave_comment(scenario, client_for, persona):
    world = scenario
    client = client_for(world.user_for(persona))
    answered = 0
    for route, query in ENDPOINTS:
        response = client.get(reverse(route), query)
        assert response.status_code in (200, 403), (route, query, response.status_code)
        if response.status_code == 403:
            continue
        answered += 1
        requester_reading_own_home = route == "reports:home-me" and persona in (P.PEER, P.OUTSIDER)
        if not requester_reading_own_home:
            assert "migraine" not in response.content.decode().lower(), (route, query)
    assert answered >= 1                      # everybody may at least read the summary


@pytest.mark.parametrize("persona", WITH_RECORD)
def test_department_scope_never_reveals_a_colleagues_type(scenario, client_for, persona):
    world = scenario
    response = client_for(world.user_for(persona)).get(reverse("calendar:feed"), {**NOVEMBER, "scope": "department"})

    assert response.status_code == 200
    others = [entry for entry in response.json()["entries"] if not entry["mine"]]
    for entry in others:
        assert entry["label"] in ("absent", "remote")
        assert entry["type_code"] is None
        assert entry["type_name"] is None
        assert entry["status"] is None
        assert entry["request_public_id"] is None
    text = json.dumps(others, ensure_ascii=False)
    assert world.sick.name_fr not in text and world.sick.name_en not in text
    assert world.permission.name_fr not in text
    # The colleague's pending annual leave (17 and 18 November) is not there at all.
    assert all(entry["start_date"] != "2026-11-17" for entry in others)


def test_colleagues_in_department_a_do_see_the_peer_as_absent(scenario, client_for):
    world = scenario
    body = client_for(world.owner_user).get(reverse("calendar:feed"), {**NOVEMBER, "scope": "department"}).json()

    assert [(entry["label"], entry["start_date"], entry["end_date"]) for entry in body["entries"]] == [
        ("absent", "2026-11-02", "2026-11-03"),
    ]


def test_a_manager_reads_the_type_of_a_sick_leave_but_never_its_comment(scenario, client_for):
    world = scenario
    response = client_for(world.manager_user).get(reverse("reports:home-team"))

    out = response.json()["who_is_out"]
    assert [person["type_name"] for person in out] == [world.sick.name_fr]
    assert "migraine" not in response.content.decode().lower()
```

- [ ] **Step 2: Run the sweep**

Run: `docker compose run --rm app pytest apps/reports/tests/test_privacy_sweep.py -v`
Expected: 17 passed (8 personas, 7 personas, 2). These tests pass against the code of Tasks 2 to 7; they exist to stop a later change from widening what a scope returns. If one fails, the defect is in the task that owns the endpoint and is fixed there.

- [ ] **Step 3: Write the demo-data test**

```python
# backend/apps/reports/tests/test_demo_data.py
"""The demo data of plans 03a and 04 gives the calendar and the homes something to show.

The browser journeys of this plan rely on it; this test says so before a browser does."""
import pytest
import time_machine
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.urls import reverse

from tests.request_flows import NOW

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def frozen_clock():
    # A Monday with no holiday in the three weeks that follow.
    with time_machine.travel(NOW, tick=False):
        yield


def account(name):
    return get_user_model().objects.get(email=f"{name}@impactrisks.com")


def test_the_demo_data_feeds_the_calendar_and_the_homes(client_for):
    call_command("seed_demo")
    employee, manager, ceo = account("employee.a1"), account("manager.a"), account("ceo")

    home = client_for(employee).get(reverse("reports:home-me")).json()
    assert [request["type"]["code"] for request in home["in_progress"]] == ["annual"]
    assert [request["type"]["code"] for request in home["coming_up"]] == ["remote"]

    team = client_for(manager).get(reverse("reports:home-team")).json()
    assert [person["label"] for person in team["who_is_out"]] == ["remote"]       # employee.a1, on Thursday
    assert len(team["people"]) == 2

    overview = client_for(ceo).get(reverse("reports:home-overview")).json()
    assert len(overview["waiting"]) == 3
    assert len(overview["absence_this_month"]) >= 2

    # What the privacy journey looks at: the manager's approved leave, seen by a member of the department.
    november = {"from": "2026-11-01", "to": "2026-11-30", "scope": "department"}
    colleagues = [entry for entry in client_for(employee).get(reverse("calendar:feed"), november).json()["entries"]
                  if not entry["mine"]]
    assert [(entry["label"], entry["type_code"], entry["start_date"]) for entry in colleagues] == [
        ("absent", None, "2026-11-23"),
    ]
    # And its type, seen by the manager's own manager.
    team_feed = client_for(ceo).get(reverse("calendar:feed"), {**november, "scope": "team"}).json()
    assert ("annual", "2026-11-23") in [(entry["type_code"], entry["start_date"]) for entry in team_feed["entries"]]

    assert client_for(manager).get(reverse("reports:workspace-summary")).json()["team"] == 1
```

- [ ] **Step 4: Run it**

Run: `docker compose run --rm app pytest apps/reports/tests/test_demo_data.py -v`
Expected: 1 passed.

The numbers come from plan 03a's `apps/requests/seed.py` as it stands. If that seeder has changed, read it, and bring the expected lists of this test and the journeys of Task 17 in line with what it creates; the three facts the journeys need are a request waiting for a manager, somebody of a team out within seven days, and an approved absence of somebody in the department of `employee.a1`. If one of the three is no longer seeded, add it to plan 03a's seeder, where the rest of the demo requests are.

- [ ] **Step 5: Check the API description and the whole backend**

Run:

```bash
docker compose run --rm app python - <<'CHECK'
import yaml
paths = yaml.safe_load(open("openapi.yaml"))["paths"]
for path in ("/api/v1/calendar", "/api/v1/home/me", "/api/v1/home/team", "/api/v1/home/overview", "/api/v1/workspaces/summary"):
    print(path, "OK" if path in paths and "get" in paths[path] else "MISSING")
CHECK
```

Expected: five lines ending in `OK`.

Run: `docker compose run --rm app pytest -q`
Expected: all tests pass, including `tests/test_permission_matrix.py`, `tests/test_messages.py` and `tests/test_openapi.py`.

Run: `docker compose run --rm app ruff check . && docker compose run --rm app ruff format --check .`
Expected: no finding.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/reports/tests
git commit -m "test(reports): privacy sweep and demo-data guard for calendar and homes"
```

---

### Task 9: Calendar model, dates, API hook and texts (frontend)

The date logic of the calendar is pure and tested on its own, so the component of Task 10 only draws.

The feed says nothing about the working week, so the calendar treats Saturday and Sunday as days without entries, and a public holiday as a day without entries (see Contract notes).

**Files:**
- Create: `frontend/src/features/calendar/model.ts`
- Create: `frontend/src/features/calendar/dates.ts`
- Create: `frontend/src/features/calendar/api.ts`
- Create: `frontend/src/features/calendar/fixtures.ts`
- Create: `frontend/src/i18n/locales/fr/calendar.json`, `frontend/src/i18n/locales/en/calendar.json`
- Modify: `frontend/src/api/types.ts` (four types appended)
- Test: `frontend/src/features/calendar/model.test.ts`, `frontend/src/features/calendar/dates.test.ts`

**Interfaces:**
- Consumes: `api`, `call` from `@/api/client`; the helper types `Ok` and `Query` of `@/api/types` (plan 01b: response and request types are derived from the generated schema); the generated path `/api/v1/calendar` (Task 3); `AFFECTED_KEYS` from `@/features/requests/api` (plan 03b: the query keys read again after every change to a request); `date-fns` and its `fr` and `enGB` locales. `src/i18n/index.ts` picks up every `locales/<lang>/<namespace>.json` by itself.
- Produces:

```ts
// api/types.ts (appended)
export type CalendarFeed = Ok<"/api/v1/calendar", "get">;          // { holidays, entries }
export type CalendarEntry = CalendarFeed["entries"][number];       // label: "absent" | "remote" | "hidden"; status: "pending" | "approved" | null
export type CalendarHoliday = CalendarFeed["holidays"][number];
export type CalendarQuery = Query<"/api/v1/calendar", "get">;

// features/calendar/model.ts
export type { CalendarEntry, CalendarFeed, CalendarHoliday };      // re-exported from @/api/types
export type CalendarViewMode = "month" | "week";
export type CalendarScope = CalendarQuery["scope"];                // "department" | "team" | "company"
export type DayPart = "full" | "morning" | "afternoon";
export interface DayEntry { entry: CalendarEntry; part: DayPart }
export function toIso(day: Date): string;                                   // "2026-11-03"
export function fromIso(iso: string): Date;                                 // local midnight
export function rangeFor(view: CalendarViewMode, anchor: Date): { from: Date; to: Date };
export function weeksFor(view: CalendarViewMode, anchor: Date): Date[][];   // rows of seven days, Monday first
export function shiftAnchor(view: CalendarViewMode, anchor: Date, delta: 1 | -1): Date;
export function isWeekend(day: Date): boolean;
export function partForDay(entry: CalendarEntry, iso: string): DayPart | null;
export function holidayOn(holidays: CalendarHoliday[], iso: string): CalendarHoliday | undefined;
export function entriesOn(feed: CalendarFeed, day: Date): DayEntry[];       // [] on weekends and holidays; own entries first

// features/calendar/dates.ts: what lib/format.ts does not give (it formats dates, ranges and quantities)
export function localeOf(language: string): Locale;                         // fr or enGB
export function formatDayLong(day: Date, language: string): string;         // "lundi 2 novembre 2026"
export function formatDayShort(day: Date, language: string): string;        // "lun. 2 nov."
export function formatPeriodTitle(view: CalendarViewMode, anchor: Date, language: string): string;  // "novembre 2026" | "2 – 8 novembre 2026"
export function weekdayNames(language: string): { short: string; long: string }[];                  // Monday first

// features/calendar/api.ts
export interface CalendarParams { from: string; to: string; scope: CalendarScope; department?: number }
export const calendarKeys: { all: readonly ["calendar"]; feed: (p: CalendarParams) => readonly ["calendar", "feed", CalendarParams] };
export function useCalendar(params: CalendarParams): UseQueryResult<CalendarFeed>;      // calendarKeys.all is pushed to AFFECTED_KEYS

// features/calendar/fixtures.ts
export function makeEntry(overrides?: Partial<CalendarEntry>): CalendarEntry;
export function makeFeed(overrides?: Partial<CalendarFeed>): CalendarFeed;
```

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/features/calendar/model.test.ts
import { describe, expect, it } from "vitest";

import { makeEntry, makeFeed } from "./fixtures";
import { entriesOn, fromIso, holidayOn, isWeekend, partForDay, rangeFor, shiftAnchor, toIso, weeksFor } from "./model";

const day = (iso: string) => fromIso(iso);

describe("ranges and grids", () => {
  it("covers whole weeks around a month, Monday first", () => {
    const { from, to } = rangeFor("month", day("2026-11-15"));
    expect(toIso(from)).toBe("2026-10-26");      // the Monday before 1 November (a Sunday)
    expect(toIso(to)).toBe("2026-12-06");        // the Sunday after 30 November (a Monday)
  });

  it("covers Monday to Sunday for a week", () => {
    const { from, to } = rangeFor("week", day("2026-11-04"));
    expect([toIso(from), toIso(to)]).toEqual(["2026-11-02", "2026-11-08"]);
  });

  it("builds rows of seven days", () => {
    const month = weeksFor("month", day("2026-11-15"));
    expect(month).toHaveLength(6);
    expect(month.every((week) => week.length === 7)).toBe(true);
    expect(toIso(month[1][0])).toBe("2026-11-02");
    expect(weeksFor("week", day("2026-11-04"))).toHaveLength(1);
  });

  it("moves by a month or by a week", () => {
    expect(toIso(shiftAnchor("month", day("2026-01-31"), 1))).toBe("2026-02-28");
    expect(toIso(shiftAnchor("month", day("2026-11-15"), -1))).toBe("2026-10-15");
    expect(toIso(shiftAnchor("week", day("2026-12-30"), 1))).toBe("2027-01-06");
  });

  it("knows the weekend", () => {
    expect(isWeekend(day("2026-11-07"))).toBe(true);
    expect(isWeekend(day("2026-11-08"))).toBe(true);
    expect(isWeekend(day("2026-11-09"))).toBe(false);
  });
});

describe("partForDay", () => {
  const leave = makeEntry({ start_date: "2026-11-03", end_date: "2026-11-05" });

  it("is null outside the entry", () => {
    expect(partForDay(leave, "2026-11-02")).toBeNull();
    expect(partForDay(leave, "2026-11-06")).toBeNull();
  });

  it("is a full day inside a plain entry", () => {
    expect(["2026-11-03", "2026-11-04", "2026-11-05"].map((iso) => partForDay(leave, iso))).toEqual(["full", "full", "full"]);
  });

  it("starts with an afternoon and ends with a morning when flagged", () => {
    const flagged = { ...leave, starts_at_midday: true, ends_at_midday: true };
    expect(partForDay(flagged, "2026-11-03")).toBe("afternoon");
    expect(partForDay(flagged, "2026-11-04")).toBe("full");
    expect(partForDay(flagged, "2026-11-05")).toBe("morning");
  });

  it("reads a single day as a morning or an afternoon", () => {
    const single = makeEntry({ start_date: "2026-11-04", end_date: "2026-11-04" });
    expect(partForDay({ ...single, ends_at_midday: true }, "2026-11-04")).toBe("morning");
    expect(partForDay({ ...single, starts_at_midday: true }, "2026-11-04")).toBe("afternoon");
    expect(partForDay(single, "2026-11-04")).toBe("full");
  });
});

describe("entriesOn", () => {
  const colleague = makeEntry({ employee: { public_id: "p1", name: "Sana Trabelsi" }, start_date: "2026-11-06", end_date: "2026-11-10" });
  const mine = makeEntry({ employee: { public_id: "me", name: "Amine Jaziri" }, start_date: "2026-11-09", end_date: "2026-11-09", mine: true });
  const feed = makeFeed({ entries: [colleague, mine], holidays: [{ date: "2026-11-10", name: "Jour férié" }] });

  it("lists the entries that cover a working day, own entries first", () => {
    expect(entriesOn(feed, day("2026-11-06")).map((item) => item.entry.employee.name)).toEqual(["Sana Trabelsi"]);
    expect(entriesOn(feed, day("2026-11-09")).map((item) => item.entry.employee.name)).toEqual(["Amine Jaziri", "Sana Trabelsi"]);
  });

  it("shows nobody on a weekend or on a public holiday", () => {
    expect(entriesOn(feed, day("2026-11-07"))).toEqual([]);
    expect(entriesOn(feed, day("2026-11-08"))).toEqual([]);
    expect(entriesOn(feed, day("2026-11-10"))).toEqual([]);
  });

  it("finds the holiday of a day", () => {
    expect(holidayOn(feed.holidays, "2026-11-10")?.name).toBe("Jour férié");
    expect(holidayOn(feed.holidays, "2026-11-11")).toBeUndefined();
  });
});
```

```ts
// frontend/src/features/calendar/dates.test.ts
import { describe, expect, it } from "vitest";

import { formatDayLong, formatPeriodTitle, weekdayNames } from "./dates";
import { fromIso } from "./model";

describe("calendar dates", () => {
  it("names a day in French and in English", () => {
    expect(formatDayLong(fromIso("2026-11-02"), "fr")).toBe("lundi 2 novembre 2026");
    expect(formatDayLong(fromIso("2026-11-02"), "en")).toBe("Monday 2 November 2026");
  });

  it("titles a month and a week", () => {
    expect(formatPeriodTitle("month", fromIso("2026-11-15"), "fr")).toBe("novembre 2026");
    expect(formatPeriodTitle("month", fromIso("2026-11-15"), "en")).toBe("November 2026");
    expect(formatPeriodTitle("week", fromIso("2026-11-04"), "fr")).toBe("2 – 8 novembre 2026");
    expect(formatPeriodTitle("week", fromIso("2026-11-30"), "en")).toBe("30 November – 6 December 2026");
  });

  it("lists the weekdays from Monday", () => {
    expect(weekdayNames("fr").map((name) => name.long)).toEqual(["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]);
    expect(weekdayNames("en")[0]).toEqual({ short: "Mon", long: "Monday" });
  });

});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/features/calendar`
Expected: FAIL: `Failed to resolve import "./fixtures"` and `"./model"`.

- [ ] **Step 3: Derive the types, then write the model and the fixtures**

Append to `frontend/src/api/types.ts`:

```ts
export type CalendarFeed = Ok<"/api/v1/calendar", "get">;
export type CalendarEntry = CalendarFeed["entries"][number];
export type CalendarHoliday = CalendarFeed["holidays"][number];
export type CalendarQuery = Query<"/api/v1/calendar", "get">;
```

```ts
// frontend/src/features/calendar/model.ts
import {
  addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, getDay, parseISO, startOfMonth, startOfWeek,
} from "date-fns";

import type { CalendarEntry, CalendarFeed, CalendarHoliday, CalendarQuery } from "@/api/types";

export type { CalendarEntry, CalendarFeed, CalendarHoliday };
export type CalendarViewMode = "month" | "week";
export type CalendarScope = CalendarQuery["scope"];
export type DayPart = "full" | "morning" | "afternoon";

export interface DayEntry {
  entry: CalendarEntry;
  part: DayPart;
}

const MONDAY_FIRST = { weekStartsOn: 1 as const };

export function toIso(day: Date): string {
  return format(day, "yyyy-MM-dd");
}

export function fromIso(iso: string): Date {
  return parseISO(iso);
}

export function rangeFor(view: CalendarViewMode, anchor: Date): { from: Date; to: Date } {
  if (view === "week") {
    return { from: startOfWeek(anchor, MONDAY_FIRST), to: endOfWeek(anchor, MONDAY_FIRST) };
  }
  return {
    from: startOfWeek(startOfMonth(anchor), MONDAY_FIRST),
    to: endOfWeek(endOfMonth(anchor), MONDAY_FIRST),
  };
}

export function weeksFor(view: CalendarViewMode, anchor: Date): Date[][] {
  const { from, to } = rangeFor(view, anchor);
  const days = eachDayOfInterval({ start: from, end: to });
  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

export function shiftAnchor(view: CalendarViewMode, anchor: Date, delta: 1 | -1): Date {
  return view === "week" ? addWeeks(anchor, delta) : addMonths(anchor, delta);
}

export function isWeekend(day: Date): boolean {
  const weekday = getDay(day);
  return weekday === 0 || weekday === 6;
}

/** Which part of `iso` the entry covers; null when the day is outside the entry. ISO dates compare as text. */
export function partForDay(entry: CalendarEntry, iso: string): DayPart | null {
  if (iso < entry.start_date || iso > entry.end_date) {
    return null;
  }
  const first = iso === entry.start_date;
  const last = iso === entry.end_date;
  if (first && entry.starts_at_midday && !(last && entry.ends_at_midday)) {
    return "afternoon";
  }
  if (last && entry.ends_at_midday && !(first && entry.starts_at_midday)) {
    return "morning";
  }
  return "full";
}

export function holidayOn(holidays: CalendarHoliday[], iso: string): CalendarHoliday | undefined {
  return holidays.find((holiday) => holiday.date === iso);
}

export function entriesOn(feed: CalendarFeed, day: Date): DayEntry[] {
  const iso = toIso(day);
  if (isWeekend(day) || holidayOn(feed.holidays, iso)) {
    return [];
  }
  const result: DayEntry[] = [];
  for (const entry of feed.entries) {
    const part = partForDay(entry, iso);
    if (part) {
      result.push({ entry, part });
    }
  }
  return result.sort((a, b) => Number(b.entry.mine) - Number(a.entry.mine) || a.entry.employee.name.localeCompare(b.entry.employee.name));
}
```

```ts
// frontend/src/features/calendar/fixtures.ts
import type { CalendarEntry, CalendarFeed } from "./model";

export function makeEntry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    employee: { public_id: "11111111-1111-4111-8111-111111111111", name: "Sana Trabelsi" },
    start_date: "2026-11-03",
    end_date: "2026-11-03",
    starts_at_midday: false,
    ends_at_midday: false,
    label: "absent",
    type_code: null,
    type_name: null,
    status: null,
    request_public_id: null,
    mine: false,
    ...overrides,
  };
}

export function makeFeed(overrides: Partial<CalendarFeed> = {}): CalendarFeed {
  return { holidays: [], entries: [], ...overrides };
}
```

- [ ] **Step 4: Write the date helpers**

```ts
// frontend/src/features/calendar/dates.ts
import { addDays, format, isSameMonth, isSameYear, startOfWeek, type Locale } from "date-fns";
import { enGB, fr } from "date-fns/locale";

import type { CalendarViewMode } from "./model";
import { rangeFor } from "./model";

export function localeOf(language: string): Locale {
  return language.toLowerCase().startsWith("en") ? enGB : fr;
}

export function formatDayLong(day: Date, language: string): string {
  return format(day, "EEEE d MMMM yyyy", { locale: localeOf(language) });
}

export function formatDayShort(day: Date, language: string): string {
  return format(day, "EEE d MMM", { locale: localeOf(language) });
}

export function formatPeriodTitle(view: CalendarViewMode, anchor: Date, language: string): string {
  const locale = localeOf(language);
  if (view === "month") {
    return format(anchor, "MMMM yyyy", { locale });
  }
  const { from, to } = rangeFor("week", anchor);
  if (isSameMonth(from, to)) {
    return `${format(from, "d", { locale })} – ${format(to, "d MMMM yyyy", { locale })}`;
  }
  if (isSameYear(from, to)) {
    return `${format(from, "d MMMM", { locale })} – ${format(to, "d MMMM yyyy", { locale })}`;
  }
  return `${format(from, "d MMMM yyyy", { locale })} – ${format(to, "d MMMM yyyy", { locale })}`;
}

export function weekdayNames(language: string): { short: string; long: string }[] {
  const locale = localeOf(language);
  const monday = startOfWeek(new Date(2026, 10, 2), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(monday, index);
    return { short: format(day, "EEE", { locale }), long: format(day, "EEEE", { locale }) };
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/features/calendar`
Expected: 15 passed (12 in `model.test.ts`, 3 in `dates.test.ts`).

`date-fns` writes French weekday and month abbreviations with a full stop ("lun.", "nov."). If an assertion fails by a full stop, the installed locale data differs from this plan's; correct the expected string to what `format` prints and keep the function unchanged.

- [ ] **Step 6: Write the API hook**

```ts
// frontend/src/features/calendar/api.ts
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, call } from "@/api/client";
import { AFFECTED_KEYS } from "@/features/requests/api";

import type { CalendarFeed, CalendarScope } from "./model";

export interface CalendarParams {
  from: string;
  to: string;
  scope: CalendarScope;
  department?: number;
}

export const calendarKeys = {
  all: ["calendar"] as const,
  feed: (params: CalendarParams) => ["calendar", "feed", params] as const,
};

// A request that is sent, decided, changed or cancelled changes the calendar: plan 03b reads these keys again.
AFFECTED_KEYS.push(calendarKeys.all);

export function useCalendar(params: CalendarParams) {
  return useQuery({
    queryKey: calendarKeys.feed(params),
    queryFn: async (): Promise<CalendarFeed> =>
      call(api.GET("/api/v1/calendar", { params: { query: params } })),
    // Keep the previous period on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}
```

Run: `docker compose run --rm web npm run typecheck`
Expected: no error. The path, the query parameters and the response type are checked against `schema.d.ts`, which Task 3 regenerated.

- [ ] **Step 7: Write the texts**

```json
// frontend/src/i18n/locales/fr/calendar.json
{
  "title": "Calendrier",
  "toolbar": {
    "previous": "Période précédente",
    "next": "Période suivante",
    "today": "Aujourd'hui",
    "view": "Affichage",
    "month": "Mois",
    "week": "Semaine"
  },
  "label": {
    "absent": "Absent(e)",
    "remote": "Télétravail",
    "hidden": "Autorisation"
  },
  "part": {
    "morning": "matin",
    "afternoon": "après-midi"
  },
  "pending": "en attente",
  "you": "Vous",
  "holiday": "Jour férié : {{name}}",
  "nobody": "personne d'absent",
  "more": "+ {{count}} de plus",
  "newRequestOn": "Nouvelle demande le {{date}}",
  "newRequest": "Nouvelle demande",
  "grid": "Calendrier, {{period}}",
  "agenda": "Absences, {{period}}",
  "empty": "Personne n'est absent sur cette période.",
  "loading": "Chargement du calendrier…",
  "filter": {
    "person": "Personne",
    "type": "Type",
    "status": "Statut",
    "department": "Département",
    "everyone": "Tout le monde",
    "allTypes": "Tous les types",
    "allStatuses": "Tous les statuts",
    "allDepartments": "Tous les départements",
    "approved": "Approuvées",
    "pendingOnly": "En attente"
  },
  "hint": {
    "department": "Vous voyez les absences approuvées de votre département, sans leur motif.",
    "team": "Vous voyez les demandes de votre équipe, y compris celles en attente.",
    "company": "Vous voyez les demandes de toute l'entreprise, y compris celles en attente."
  }
}
```

```json
// frontend/src/i18n/locales/en/calendar.json
{
  "title": "Calendar",
  "toolbar": {
    "previous": "Previous period",
    "next": "Next period",
    "today": "Today",
    "view": "View",
    "month": "Month",
    "week": "Week"
  },
  "label": {
    "absent": "Absent",
    "remote": "Remote",
    "hidden": "Permission"
  },
  "part": {
    "morning": "morning",
    "afternoon": "afternoon"
  },
  "pending": "waiting",
  "you": "You",
  "holiday": "Public holiday: {{name}}",
  "nobody": "nobody away",
  "more": "+ {{count}} more",
  "newRequestOn": "New request on {{date}}",
  "newRequest": "New request",
  "grid": "Calendar, {{period}}",
  "agenda": "Absences, {{period}}",
  "empty": "Nobody is away in this period.",
  "loading": "Loading the calendar…",
  "filter": {
    "person": "Person",
    "type": "Type",
    "status": "Status",
    "department": "Department",
    "everyone": "Everyone",
    "allTypes": "All types",
    "allStatuses": "All statuses",
    "allDepartments": "All departments",
    "approved": "Approved",
    "pendingOnly": "Waiting"
  },
  "hint": {
    "department": "You see the approved absences of your department, without their reason.",
    "team": "You see your team's requests, including those still waiting.",
    "company": "You see the whole company's requests, including those still waiting."
  }
}
```

JSON files hold no comment: the first line of each block above is the file's path, not content.

The namespace needs no registration: `src/i18n/index.ts` loads every file under `locales/`. In tests a missing key throws, so a key used by a component and absent from these files fails the component's test.

Run: `docker compose run --rm web npx vitest run src/i18n/parity.test.ts`
Expected: PASS (the two `calendar.json` files have the same keys).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/calendar frontend/src/i18n frontend/src/api/types.ts
git commit -m "feat(calendar): date model, API hook and texts for the calendar"
```

---

### Task 10: The calendar component (frontend)

One component for the four pages. On a desktop it is a grid with the WAI-ARIA grid keyboard pattern: one day is in the tab order, the arrow keys move between days, and each day announces its whole content. On a phone it is an agenda: the list of days that have something on them. What a chip says is decided by the data: an entry with a `type_name` shows it, an entry without shows "Absent(e)" or "Télétravail". The component therefore cannot reveal more than the server sent.

Layout choices (master D23): cards and the grid use a border, not a shadow; radius 12px; chips use the request-type tag colours of `tokens.css` when the type is known and one neutral pair per label when it is not, so a colleague's absence has the same colour whatever its reason; a pending entry has a dashed border; today's number sits in an IRIS-blue disc.

**Files:**
- Create: `frontend/src/features/calendar/CalendarToolbar.tsx`
- Create: `frontend/src/features/calendar/CalendarView.tsx`
- Test: `frontend/src/features/calendar/CalendarView.test.tsx`

**Interfaces:**
- Consumes: Task 9 (`model.ts`, `dates.ts`, `fixtures.ts`, the `calendar` namespace); `Button` from `@/components/ui/button` (variants `primary`, `secondary` by default, `ghost`; sizes `default`, `icon`), `cn` from `@/lib/utils` and `useIsPhone` from `@/components` (plan 01b); `renderApp(ui, { route, path, me })` from `@/test/render`, `makeMe` from `@/test/fixtures` and `setPhoneViewport(phone)` from `@/test/viewport` (plan 01b); `lucide-react`; `@testing-library/user-event`.
- Produces:

```tsx
// features/calendar/CalendarToolbar.tsx
export interface CalendarToolbarProps {
  view: CalendarViewMode; anchor: Date;
  onViewChange: (view: CalendarViewMode) => void; onAnchorChange: (anchor: Date) => void;
}
export function CalendarToolbar(props: CalendarToolbarProps): JSX.Element;

// features/calendar/CalendarView.tsx
export interface CalendarViewProps {
  feed: CalendarFeed | undefined; isLoading: boolean;
  view: CalendarViewMode; anchor: Date;
  onAnchorChange: (anchor: Date) => void;
  onDayAction?: (iso: string) => void;        // My space only: start a request from a day
}
export function CalendarView(props: CalendarViewProps): JSX.Element;
export function entryText(entry: CalendarEntry, part: DayPart, t: TFunction<"calendar">): string;
```

Keyboard, with focus on a day: arrows move one day or one week; Home and End go to Monday and Sunday; Page Up and Page Down move one period; Enter or Space starts a request on that day when `onDayAction` is given; Tab enters the links and the button of the focused day.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/features/calendar/CalendarView.test.tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { setPhoneViewport } from "@/test/viewport";

import { CalendarView, type CalendarViewProps } from "./CalendarView";
import { makeEntry, makeFeed } from "./fixtures";
import { fromIso, toIso, type CalendarFeed } from "./model";

const NOVEMBER = fromIso("2026-11-15");

function setup(feed: CalendarFeed | undefined, props: Partial<CalendarViewProps> = {}) {
  const onAnchorChange = vi.fn();
  renderApp(
    <CalendarView feed={feed} isLoading={false} view="month" anchor={NOVEMBER} onAnchorChange={onAnchorChange} {...props} />,
    { route: "/me/calendar", path: "/me/calendar", me: makeMe({ roles: ["employee"] }) },
  );
  return { onAnchorChange };
}

const cell = (name: RegExp) => screen.getByRole("gridcell", { name });

describe("CalendarView, grid", () => {
  it("shows a colleague as absent with no type and no link", () => {
    setup(makeFeed({ entries: [makeEntry({ start_date: "2026-11-03", end_date: "2026-11-03" })] }));

    const tuesday = cell(/^mardi 3 novembre 2026\. Sana Trabelsi, Absent\(e\)$/);
    expect(within(tuesday).getByText("Sana Trabelsi")).toBeInTheDocument();
    expect(within(tuesday).getByText(/Absent\(e\)/)).toBeInTheDocument();
    expect(within(tuesday).queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows my own request with its type, its status and a link to it", () => {
    setup(makeFeed({ entries: [makeEntry({
      employee: { public_id: "me", name: "Amine Jaziri" }, mine: true, start_date: "2026-11-10", end_date: "2026-11-10",
      type_code: "annual", type_name: "Congé annuel", status: "pending", request_public_id: "abc",
    })] }));

    const link = within(cell(/^mardi 10 novembre 2026\. Vous, Congé annuel · en attente$/)).getByRole("link");
    expect(link).toHaveAttribute("href", "/requests/abc");
    expect(link).toHaveTextContent("Vous · Congé annuel · en attente");
  });

  it("says which half of the day", () => {
    setup(makeFeed({ entries: [
      makeEntry({ start_date: "2026-11-04", end_date: "2026-11-04", starts_at_midday: true, label: "remote" }),
      makeEntry({ employee: { public_id: "p2", name: "Karim Gharbi" }, start_date: "2026-11-05", end_date: "2026-11-06", ends_at_midday: true }),
    ] }));

    expect(cell(/^mercredi 4 novembre 2026\. Sana Trabelsi, Télétravail \(après-midi\)$/)).toBeInTheDocument();
    expect(cell(/^jeudi 5 novembre 2026\. Karim Gharbi, Absent\(e\)$/)).toBeInTheDocument();
    expect(cell(/^vendredi 6 novembre 2026\. Karim Gharbi, Absent\(e\) \(matin\)$/)).toBeInTheDocument();
  });

  it("shows a public holiday, and nobody on a holiday or a weekend", () => {
    setup(makeFeed({
      holidays: [{ date: "2026-11-20", name: "Fête nationale" }],
      entries: [makeEntry({ start_date: "2026-11-19", end_date: "2026-11-23" })],
    }));

    expect(cell(/^jeudi 19 novembre 2026\. Sana Trabelsi, Absent\(e\)$/)).toBeInTheDocument();
    const holiday = cell(/^vendredi 20 novembre 2026\. Jour férié : Fête nationale$/);
    expect(within(holiday).getByText("Fête nationale")).toBeInTheDocument();
    expect(within(holiday).queryByText("Sana Trabelsi")).not.toBeInTheDocument();
    expect(cell(/^samedi 21 novembre 2026$/)).toBeInTheDocument();
    expect(cell(/^lundi 23 novembre 2026\. Sana Trabelsi, Absent\(e\)$/)).toBeInTheDocument();
  });

  it("says that nobody is away on a quiet working day", () => {
    setup(makeFeed());
    expect(cell(/^mercredi 4 novembre 2026\. personne d'absent$/)).toBeInTheDocument();
  });

  it("collapses a crowded day in the month view and shows everyone in the week view", () => {
    const crowd = ["Ali", "Bilel", "Chiraz", "Dorra", "Emna"].map((name, index) =>
      makeEntry({ employee: { public_id: `p${index}`, name }, start_date: "2026-11-12", end_date: "2026-11-12" }));

    setup(makeFeed({ entries: crowd }));
    const thursday = cell(/^jeudi 12 novembre 2026\./);
    expect(within(thursday).getAllByText(/Absent\(e\)/)).toHaveLength(3);
    expect(within(thursday).getByText("+ 2 de plus")).toBeInTheDocument();
    expect(thursday).toHaveAccessibleName(/Emna, Absent\(e\)$/);          // the label still names everyone
  });

  it("shows everyone in the week view", () => {
    const crowd = ["Ali", "Bilel", "Chiraz", "Dorra", "Emna"].map((name, index) =>
      makeEntry({ employee: { public_id: `p${index}`, name }, start_date: "2026-11-12", end_date: "2026-11-12" }));

    setup(makeFeed({ entries: crowd }), { view: "week", anchor: fromIso("2026-11-12") });

    expect(screen.getAllByRole("gridcell")).toHaveLength(7);
    expect(within(cell(/^jeudi 12 novembre 2026\./)).getAllByText(/Absent\(e\)/)).toHaveLength(5);
  });

  it("names the grid and its weekday columns", () => {
    setup(makeFeed());
    expect(screen.getByRole("grid", { name: "Calendrier, novembre 2026" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.getAttribute("aria-label"))).toEqual(
      ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]);
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
  });
});

describe("CalendarView, keyboard", () => {
  it("keeps one day in the tab order and moves with the arrow keys", async () => {
    const user = userEvent.setup();
    setup(makeFeed());

    const focusable = screen.getAllByRole("gridcell").filter((item) => item.getAttribute("tabindex") === "0");
    expect(focusable).toHaveLength(1);
    expect(focusable[0]).toHaveAccessibleName(/^dimanche 15 novembre 2026/);

    focusable[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(cell(/^lundi 16 novembre 2026/)).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(cell(/^lundi 23 novembre 2026/)).toHaveFocus();
    await user.keyboard("{End}");
    expect(cell(/^dimanche 29 novembre 2026/)).toHaveFocus();
    await user.keyboard("{Home}");
    expect(cell(/^lundi 23 novembre 2026/)).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowLeft}");
    expect(cell(/^dimanche 15 novembre 2026/)).toHaveFocus();
  });

  it("asks for another period when the keyboard leaves the visible days", async () => {
    const user = userEvent.setup();
    const { onAnchorChange } = setup(makeFeed());

    cell(/^dimanche 15 novembre 2026/).focus();
    await user.keyboard("{PageDown}");

    expect(onAnchorChange).toHaveBeenCalledTimes(1);
    expect(toIso(onAnchorChange.mock.calls[0][0] as Date)).toBe("2026-12-15");
  });

  it("starts a request from a working day with Enter or with the day's button", async () => {
    const user = userEvent.setup();
    const onDayAction = vi.fn();
    setup(makeFeed({ holidays: [{ date: "2026-11-20", name: "Fête nationale" }] }), { onDayAction });

    cell(/^lundi 16 novembre 2026/).focus();
    await user.keyboard("{Enter}");
    expect(onDayAction).toHaveBeenLastCalledWith("2026-11-16");

    await user.click(screen.getByRole("button", { name: "Nouvelle demande le mar. 17 nov." }));
    expect(onDayAction).toHaveBeenLastCalledWith("2026-11-17");

    expect(screen.queryByRole("button", { name: "Nouvelle demande le ven. 20 nov." })).not.toBeInTheDocument();   // holiday
    expect(screen.queryByRole("button", { name: "Nouvelle demande le sam. 21 nov." })).not.toBeInTheDocument();   // weekend
  });

  it("offers no day action when the page gives none", async () => {
    const user = userEvent.setup();
    setup(makeFeed());

    expect(screen.queryByRole("button", { name: /Nouvelle demande le/ })).not.toBeInTheDocument();
    cell(/^lundi 16 novembre 2026/).focus();
    await user.keyboard("{Enter}");            // nothing happens, nothing throws
  });
});

describe("CalendarView, phone and loading", () => {
  it("is an agenda of the days that have something on them", () => {
    setPhoneViewport(true);          // plan 01b's test setup puts the desktop back after each test
    setup(makeFeed({
      holidays: [{ date: "2026-11-20", name: "Fête nationale" }],
      entries: [makeEntry({ start_date: "2026-11-03", end_date: "2026-11-04" })],
    }));

    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    const agenda = screen.getByRole("list", { name: "Absences, novembre 2026" });
    expect(within(agenda).getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "mardi 3 novembre 2026", "mercredi 4 novembre 2026", "vendredi 20 novembre 2026",
    ]);
    expect(within(agenda).getByText("Jour férié : Fête nationale")).toBeInTheDocument();
  });

  it("says so when the agenda is empty", () => {
    setPhoneViewport(true);          // plan 01b's test setup puts the desktop back after each test
    setup(makeFeed());
    expect(screen.getByText("Personne n'est absent sur cette période.")).toBeInTheDocument();
  });

  it("announces loading before the first feed arrives", () => {
    setup(undefined, { isLoading: true });
    expect(screen.getByRole("status")).toHaveTextContent("Chargement du calendrier…");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/features/calendar/CalendarView.test.tsx`
Expected: FAIL: `Failed to resolve import "./CalendarView"`.

- [ ] **Step 3: Write the toolbar**

```tsx
// frontend/src/features/calendar/CalendarToolbar.tsx
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatPeriodTitle } from "./dates";
import { shiftAnchor, type CalendarViewMode } from "./model";

export interface CalendarToolbarProps {
  view: CalendarViewMode;
  anchor: Date;
  onViewChange: (view: CalendarViewMode) => void;
  onAnchorChange: (anchor: Date) => void;
}

const VIEWS: CalendarViewMode[] = ["month", "week"];

export function CalendarToolbar({ view, anchor, onViewChange, onAnchorChange }: CalendarToolbarProps) {
  const { t, i18n } = useTranslation("calendar");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button type="button" size="icon" className="min-h-11 min-w-11 md:min-h-10 md:min-w-10"
                aria-label={t("toolbar.previous")} onClick={() => onAnchorChange(shiftAnchor(view, anchor, -1))}>
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <Button type="button" className="min-h-11 md:min-h-10" onClick={() => onAnchorChange(new Date())}>
          {t("toolbar.today")}
        </Button>
        <Button type="button" size="icon" className="min-h-11 min-w-11 md:min-h-10 md:min-w-10"
                aria-label={t("toolbar.next")} onClick={() => onAnchorChange(shiftAnchor(view, anchor, 1))}>
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
        <h2 aria-live="polite" className="ml-2 text-section font-semibold text-foreground first-letter:uppercase">
          {formatPeriodTitle(view, anchor, i18n.language)}
        </h2>
      </div>
      <div role="group" aria-label={t("toolbar.view")} className="inline-flex rounded-md bg-accent p-1">
        {VIEWS.map((mode) => (
          <button key={mode} type="button" aria-pressed={view === mode} onClick={() => onViewChange(mode)}
                  className={cn(
                    "min-h-11 rounded-sm px-3 text-body font-medium text-text-secondary md:min-h-8",
                    view === mode && "bg-card text-foreground",
                  )}>
            {t(`toolbar.${mode}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the component**

```tsx
// frontend/src/features/calendar/CalendarView.tsx
import { addDays, eachDayOfInterval, endOfWeek, format, isSameDay, isSameMonth, startOfDay, startOfWeek } from "date-fns";
import type { TFunction } from "i18next";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useIsPhone } from "@/components";
import { cn } from "@/lib/utils";

import { formatDayLong, formatDayShort, formatPeriodTitle, weekdayNames } from "./dates";
import {
  entriesOn, holidayOn, isWeekend, rangeFor, shiftAnchor, toIso, weeksFor,
  type CalendarEntry, type CalendarFeed, type CalendarViewMode, type DayEntry, type DayPart,
} from "./model";

export interface CalendarViewProps {
  feed: CalendarFeed | undefined;
  isLoading: boolean;
  view: CalendarViewMode;
  anchor: Date;
  onAnchorChange: (anchor: Date) => void;
  onDayAction?: (iso: string) => void;
}

const EMPTY_FEED: CalendarFeed = { holidays: [], entries: [] };
const MONTH_CHIPS = 3;
const MONDAY_FIRST = { weekStartsOn: 1 as const };

const TYPE_TONES: Record<string, string> = {
  annual: "bg-type-annual-bg text-type-annual",
  sick: "bg-type-sick-bg text-type-sick",
  exceptional: "bg-type-exceptional-bg text-type-exceptional",
  remote: "bg-type-remote-bg text-type-remote",
  permission: "bg-type-permission-bg text-type-permission",
};

/** The colour never depends on something the server withheld: without a type code, only the label decides. */
function toneOf(entry: CalendarEntry): string {
  if (entry.type_code && TYPE_TONES[entry.type_code]) {
    return TYPE_TONES[entry.type_code];
  }
  return entry.label === "remote" ? "bg-type-remote-bg text-type-remote" : "bg-info-bg text-info";
}

export function entryText(entry: CalendarEntry, part: DayPart, t: TFunction<"calendar">): string {
  const what = entry.type_name ?? t(`label.${entry.label}`);
  const half = part === "full" ? "" : ` (${t(`part.${part}`)})`;
  const waiting = entry.status === "pending" ? ` · ${t("pending")}` : "";
  return `${what}${half}${waiting}`;
}

function EntryChip({ item, focusable }: { item: DayEntry; focusable: boolean }) {
  const { t } = useTranslation("calendar");
  const { entry, part } = item;
  const who = entry.mine ? t("you") : entry.employee.name;
  const className = cn(
    "block truncate rounded-sm border border-border px-1.5 py-0.5 text-caption",
    toneOf(entry),
    entry.status === "pending" && "border-dashed",
  );
  const content = (
    <>
      <span className="font-semibold">{who}</span>
      {" · "}
      {entryText(entry, part, t)}
    </>
  );
  if (entry.request_public_id) {
    return (
      <Link to={`/requests/${entry.request_public_id}`} tabIndex={focusable ? 0 : -1} className={cn(className, "hover:underline")}>
        {content}
      </Link>
    );
  }
  return <span className={className}>{content}</span>;
}

export function CalendarView({ feed, isLoading, view, anchor, onAnchorChange, onDayAction }: CalendarViewProps) {
  const { t } = useTranslation("calendar");
  const isPhone = useIsPhone();

  if (isLoading && !feed) {
    return <p role="status" className="py-10 text-center text-body text-muted-foreground">{t("loading")}</p>;
  }
  const data = feed ?? EMPTY_FEED;
  return isPhone
    ? <Agenda feed={data} view={view} anchor={anchor} />
    : <Grid feed={data} view={view} anchor={anchor} onAnchorChange={onAnchorChange} onDayAction={onDayAction} />;
}

interface GridProps {
  feed: CalendarFeed;
  view: CalendarViewMode;
  anchor: Date;
  onAnchorChange: (anchor: Date) => void;
  onDayAction?: (iso: string) => void;
}

function Grid({ feed, view, anchor, onAnchorChange, onDayAction }: GridProps) {
  const { t, i18n } = useTranslation("calendar");
  const language = i18n.language;
  const weeks = useMemo(() => weeksFor(view, anchor), [view, anchor]);
  const visible = useMemo(() => weeks.flat().map(toIso), [weeks]);
  const [focusedIso, setFocusedIso] = useState(() => toIso(anchor));
  const cells = useRef(new Map<string, HTMLDivElement>());
  const moveFocus = useRef(false);

  // The day in the tab order: the last focused one while it is on screen, otherwise the anchor.
  const activeIso = visible.includes(focusedIso) ? focusedIso : toIso(anchor);

  useEffect(() => {
    if (moveFocus.current) {
      moveFocus.current = false;
      cells.current.get(activeIso)?.focus();
    }
  }, [activeIso, visible]);

  function focusDay(target: Date) {
    const day = startOfDay(target);
    moveFocus.current = true;
    setFocusedIso(toIso(day));
    if (!visible.includes(toIso(day))) {
      onAnchorChange(day);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, day: Date, canAct: boolean) {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(day, -1),
      ArrowRight: () => addDays(day, 1),
      ArrowUp: () => addDays(day, -7),
      ArrowDown: () => addDays(day, 7),
      Home: () => startOfWeek(day, MONDAY_FIRST),
      End: () => endOfWeek(day, MONDAY_FIRST),
      PageUp: () => shiftAnchor(view, day, -1),
      PageDown: () => shiftAnchor(view, day, 1),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      focusDay(move());
      return;
    }
    // Only when the day itself has the focus, not a link or the button inside it.
    if ((event.key === "Enter" || event.key === " ") && canAct && onDayAction && event.target === event.currentTarget) {
      event.preventDefault();
      onDayAction(toIso(day));
    }
  }

  const today = new Date();
  const chipLimit = view === "week" ? Number.POSITIVE_INFINITY : MONTH_CHIPS;

  return (
    <div role="grid" aria-label={t("grid", { period: formatPeriodTitle(view, anchor, language) })}
         className="overflow-hidden rounded-xl border border-border bg-card">
      <div role="row" className="grid grid-cols-7 bg-muted">
        {weekdayNames(language).map((name) => (
          <div key={name.long} role="columnheader" aria-label={name.long}
               className="px-2 py-2 text-caption font-medium text-muted-foreground first-letter:uppercase">
            <span aria-hidden="true">{name.short}</span>
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={toIso(week[0])} role="row" className="grid grid-cols-7 border-t border-divider">
          {week.map((day) => {
            const iso = toIso(day);
            const holiday = holidayOn(feed.holidays, iso);
            const items = entriesOn(feed, day);
            const working = !isWeekend(day) && !holiday;
            const outside = view === "month" && !isSameMonth(day, anchor);
            const active = iso === activeIso;
            const canAct = working && !outside;
            const shown = items.slice(0, chipLimit);
            const hidden = items.length - shown.length;
            const label = [
              formatDayLong(day, language),
              holiday ? t("holiday", { name: holiday.name }) : null,
              items.length > 0
                ? items.map((item) => `${item.entry.mine ? t("you") : item.entry.employee.name}, ${entryText(item.entry, item.part, t)}`).join("; ")
                : working ? t("nobody") : null,
            ].filter(Boolean).join(". ");

            return (
              <div key={iso} role="gridcell" aria-label={label} aria-current={isSameDay(day, today) ? "date" : undefined}
                   tabIndex={active ? 0 : -1}
                   ref={(node) => { if (node) { cells.current.set(iso, node); } else { cells.current.delete(iso); } }}
                   onFocus={() => setFocusedIso(iso)}
                   onKeyDown={(event) => onKeyDown(event, day, canAct)}
                   className={cn(
                     "group relative border-l border-divider p-1.5 first:border-l-0",
                     view === "week" ? "min-h-64" : "min-h-28",
                     (outside || !working) && "bg-muted",
                   )}>
                <div className="flex items-center justify-between">
                  <span aria-hidden="true"
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded-full text-caption font-medium tabular-nums",
                          isSameDay(day, today) ? "bg-primary text-primary-foreground" : outside ? "text-muted-foreground" : "text-text-secondary",
                        )}>
                    {format(day, "d")}
                  </span>
                  {onDayAction && canAct ? (
                    <button type="button" tabIndex={active ? 0 : -1}
                            aria-label={t("newRequestOn", { date: formatDayShort(day, language) })}
                            onClick={() => onDayAction(iso)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-primary opacity-0 hover:bg-primary-soft focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100">
                      <Plus aria-hidden="true" className="size-4" />
                    </button>
                  ) : null}
                </div>
                {holiday ? <p className="mt-1 truncate text-caption font-medium text-waiting">{holiday.name}</p> : null}
                {shown.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {shown.map((item) => (
                      <li key={`${item.entry.employee.public_id}-${item.entry.start_date}-${item.entry.label}-${item.entry.type_code ?? ""}`}>
                        <EntryChip item={item} focusable={active} />
                      </li>
                    ))}
                    {hidden > 0 ? <li className="text-caption text-muted-foreground">{t("more", { count: hidden })}</li> : null}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Agenda({ feed, view, anchor }: { feed: CalendarFeed; view: CalendarViewMode; anchor: Date }) {
  const { t, i18n } = useTranslation("calendar");
  const language = i18n.language;
  const { from, to } = rangeFor(view, anchor);
  const rows = eachDayOfInterval({ start: from, end: to })
    .filter((day) => view === "week" || isSameMonth(day, anchor))
    .map((day) => ({ day, iso: toIso(day), holiday: holidayOn(feed.holidays, toIso(day)), items: entriesOn(feed, day) }))
    .filter((row) => row.holiday || row.items.length > 0);

  if (rows.length === 0) {
    return <p className="rounded-xl border border-border bg-card p-4 text-body text-muted-foreground">{t("empty")}</p>;
  }
  return (
    <ul aria-label={t("agenda", { period: formatPeriodTitle(view, anchor, language) })} className="space-y-3">
      {rows.map((row) => (
        <li key={row.iso} className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-body font-semibold text-foreground">{formatDayLong(row.day, language)}</h3>
          {row.holiday ? <p className="mt-1 text-caption font-medium text-waiting">{t("holiday", { name: row.holiday.name })}</p> : null}
          {row.items.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {row.items.map((item) => (
                <li key={`${item.entry.employee.public_id}-${item.entry.start_date}-${item.entry.label}-${item.entry.type_code ?? ""}`}
                    className="flex min-h-11 items-center">
                  <EntryChip item={item} focusable />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/features/calendar`
Expected: 30 passed (15 from Task 9, 15 here).

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no error.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/calendar
git commit -m "feat(calendar): calendar component with month, week and phone agenda"
```

---

### Task 11: The four calendar pages (frontend)

| Page | Address | Scope | Primary action | Filters |
|---|---|---|---|---|
| My space | `/me/calendar` | `department` | New request | None |
| My team | `/team/calendar` | `team` | None | Person, type |
| HR desk | `/hr/calendar` | `company` | None | Department, person; one step away: type, status |
| Overview | `/overview/calendar` | `company` | None | As HR desk |

The view (month or week), the date and the filters live in the address, so they survive opening a request and coming back (UI 3.4). The department filter is sent to the server; person, type and status are applied in the browser to the feed already loaded, so changing them is instant. My space sends no filter at all.

**Files:**
- Create: `frontend/src/features/calendar/useCalendarState.ts`
- Create: `frontend/src/features/calendar/filters.ts`
- Create: `frontend/src/features/calendar/CompanyCalendar.tsx`
- Create: `frontend/src/features/calendar/pages/MeCalendarPage.tsx`, `TeamCalendarPage.tsx`, `HrCalendarPage.tsx`, `OverviewCalendarPage.tsx`
- Modify: `frontend/src/workspaces/me/routes.tsx`, `team/routes.tsx`, `hr/routes.tsx`, `overview/routes.tsx` (one route appended each)
- Test: `frontend/src/features/calendar/filters.test.ts`, `frontend/src/features/calendar/pages/pages.test.tsx`

**Interfaces:**
- Consumes: Tasks 9 and 10; from `@/components` (plan 01b): `PageHeader({ title, primary?, children? })` (children are a short line under the title), `FilterBar({ children, more? })` (at most three children; `more` is drawn once its button is pressed), `FilterSelect({ label, value, onChange, options })`; `Button` from `@/components/ui/button`; `useDepartments()` from `@/features/employees/api` (plan 02: the list of `{ id, code, name, name_fr, name_en, is_active, employee_count }`); `server` from `@/test/server`; `renderApp(ui, { route, path, me })`, which returns `{ router }` and shows `data-testid="elsewhere"` with the address when the page navigates away; `makeMe`.
- Produces:

```ts
// features/calendar/useCalendarState.ts
export function useCalendarState(): { view: CalendarViewMode; anchor: Date; setView(view: CalendarViewMode): void; setAnchor(anchor: Date): void };
export function useUrlParam(name: string): [string, (value: string) => void];      // "" when absent
// features/calendar/filters.ts
export interface FilterOption { value: string; label: string }
export interface EntryFilters { person: string; type: string; status: string }      // "" means no filter
export function peopleIn(feed: CalendarFeed | undefined): FilterOption[];
export function typesIn(feed: CalendarFeed | undefined): FilterOption[];
export function withAll(allLabel: string, options: FilterOption[]): FilterOption[];  // the "all" choice first
export function offered(value: string, options: FilterOption[]): string;             // the value if it is offered, else ""
export function applyFilters(feed: CalendarFeed | undefined, filters: EntryFilters): CalendarFeed | undefined;
// default exports: MeCalendarPage, TeamCalendarPage, HrCalendarPage, OverviewCalendarPage
```

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/features/calendar/filters.test.ts
import { describe, expect, it } from "vitest";

import { applyFilters, offered, peopleIn, typesIn, withAll } from "./filters";
import { makeEntry, makeFeed } from "./fixtures";

const sana = makeEntry({ employee: { public_id: "p1", name: "Sana Trabelsi" }, type_code: "sick", type_name: "Congé maladie", status: "approved" });
const karim = makeEntry({ employee: { public_id: "p2", name: "Karim Gharbi" }, type_code: "annual", type_name: "Congé annuel", status: "pending" });
const karimAgain = makeEntry({ employee: { public_id: "p2", name: "Karim Gharbi" }, type_code: "remote", type_name: "Télétravail", status: "approved", label: "remote" });
const feed = makeFeed({ entries: [sana, karim, karimAgain], holidays: [{ date: "2026-11-20", name: "Fête" }] });

describe("calendar filters", () => {
  it("lists each person once, by name", () => {
    expect(peopleIn(feed)).toEqual([{ value: "p2", label: "Karim Gharbi" }, { value: "p1", label: "Sana Trabelsi" }]);
    expect(peopleIn(undefined)).toEqual([]);
  });

  it("lists each known type once, by name", () => {
    expect(typesIn(feed)).toEqual([
      { value: "annual", label: "Congé annuel" }, { value: "sick", label: "Congé maladie" }, { value: "remote", label: "Télétravail" },
    ]);
    expect(typesIn(makeFeed({ entries: [makeEntry()] }))).toEqual([]);      // a label-only entry has no type to offer
  });

  it("puts the all choice first and falls back to it for a value that is not offered", () => {
    const options = withAll("Tout le monde", peopleIn(feed));
    expect(options[0]).toEqual({ value: "", label: "Tout le monde" });
    expect(offered("p1", options)).toBe("p1");
    expect(offered("gone", options)).toBe("");
  });

  it("narrows entries and keeps holidays", () => {
    const none = { person: "", type: "", status: "" };
    expect(applyFilters(feed, none)).toBe(feed);
    expect(applyFilters(feed, { ...none, person: "p2" })?.entries).toEqual([karim, karimAgain]);
    expect(applyFilters(feed, { ...none, type: "sick" })?.entries).toEqual([sana]);
    expect(applyFilters(feed, { ...none, status: "pending" })?.entries).toEqual([karim]);
    expect(applyFilters(feed, { person: "p2", type: "remote", status: "approved" })?.entries).toEqual([karimAgain]);
    expect(applyFilters(feed, { ...none, person: "p2" })?.holidays).toEqual(feed.holidays);
    expect(applyFilters(undefined, none)).toBeUndefined();
  });
});
```

```tsx
// frontend/src/features/calendar/pages/pages.test.tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { makeEntry, makeFeed } from "../fixtures";
import type { CalendarFeed } from "../model";
import HrCalendarPage from "./HrCalendarPage";
import MeCalendarPage from "./MeCalendarPage";
import OverviewCalendarPage from "./OverviewCalendarPage";
import TeamCalendarPage from "./TeamCalendarPage";

let seen: Record<string, string>[] = [];

function serve(feed: CalendarFeed) {
  server.use(
    http.get("/api/v1/calendar", ({ request }) => {
      seen.push(Object.fromEntries(new URL(request.url).searchParams));
      return HttpResponse.json(feed);
    }),
    http.get("/api/v1/departments", () => HttpResponse.json([
      { id: 1, code: "FIN", name: "Finance", name_fr: "Finance", name_en: "Finance", is_active: true, employee_count: 3 },
      { id: 2, code: "CLM", name: "Sinistres", name_fr: "Sinistres", name_en: "Claims", is_active: true, employee_count: 4 },
    ])),
  );
}

const detailed = makeFeed({ entries: [
  makeEntry({ employee: { public_id: "p1", name: "Sana Trabelsi" }, start_date: "2026-11-03", end_date: "2026-11-03",
              type_code: "sick", type_name: "Congé maladie", status: "approved", request_public_id: "r1" }),
  makeEntry({ employee: { public_id: "p2", name: "Karim Gharbi" }, start_date: "2026-11-10", end_date: "2026-11-10",
              type_code: "annual", type_name: "Congé annuel", status: "pending", request_public_id: "r2" }),
] });

beforeEach(() => { seen = []; });

describe("MeCalendarPage", () => {
  const me = makeMe({ roles: ["employee"] });
  const open = () => renderApp(<MeCalendarPage />, { route: "/me/calendar?date=2026-11-15", path: "/me/calendar", me });

  it("asks for the department scope and nothing else, and shows colleagues as absent", async () => {
    serve(makeFeed({ entries: [makeEntry({ start_date: "2026-11-03", end_date: "2026-11-03" })] }));
    open();

    expect(await screen.findByRole("gridcell", { name: /mardi 3 novembre 2026\. Sana Trabelsi, Absent\(e\)/ })).toBeInTheDocument();
    expect(seen[0]).toEqual({ from: "2026-10-26", to: "2026-12-06", scope: "department" });
    expect(screen.getByRole("heading", { level: 1, name: "Calendrier" })).toBeInTheDocument();
    expect(screen.getByText("Vous voyez les absences approuvées de votre département, sans leur motif.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();          // no filter on this page
  });

  it("has New request as its one primary action and starts a request from a day", async () => {
    const user = userEvent.setup();
    serve(makeFeed());
    open();

    expect(await screen.findByRole("link", { name: "Nouvelle demande" })).toHaveAttribute("href", "/me/requests/new");
    await user.click(screen.getByRole("button", { name: "Nouvelle demande le mar. 17 nov." }));
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent("/me/requests/new?start=2026-11-17");
  });

  it("moves to the next period and to the week view, keeping both in the address", async () => {
    const user = userEvent.setup();
    serve(makeFeed());
    const { router } = open();
    await screen.findByRole("grid", { name: "Calendrier, novembre 2026" });

    await user.click(screen.getByRole("button", { name: "Période suivante" }));
    expect(await screen.findByRole("grid", { name: "Calendrier, décembre 2026" })).toBeInTheDocument();
    await waitFor(() => expect(seen.at(-1)).toMatchObject({ from: "2026-11-30", to: "2027-01-03" }));

    await user.click(screen.getByRole("button", { name: "Semaine" }));
    await waitFor(() => expect(seen.at(-1)).toMatchObject({ from: "2026-12-14", to: "2026-12-20" }));
    expect(screen.getByRole("button", { name: "Semaine" })).toHaveAttribute("aria-pressed", "true");
    expect(router.state.location.search).toBe("?date=2026-12-15&view=week");
  });
});

describe("TeamCalendarPage", () => {
  const me = makeMe({ roles: ["employee", "manager"] });
  const open = () => renderApp(<TeamCalendarPage />, { route: "/team/calendar?date=2026-11-15", path: "/team/calendar", me });

  it("shows types and pending requests, and filters by person and type without asking the server again", async () => {
    const user = userEvent.setup();
    serve(detailed);
    open();

    expect(await screen.findByRole("link", { name: "Karim Gharbi · Congé annuel · en attente" })).toHaveAttribute("href", "/requests/r2");
    expect(screen.getByRole("link", { name: "Sana Trabelsi · Congé maladie" })).toBeInTheDocument();
    expect(seen[0]).toMatchObject({ scope: "team" });

    await user.selectOptions(screen.getByLabelText("Personne"), "Sana Trabelsi");
    expect(screen.queryByRole("link", { name: /Karim Gharbi/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sana Trabelsi/ })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Personne"), "Tout le monde");
    await user.selectOptions(screen.getByLabelText("Type"), "Congé annuel");
    expect(screen.queryByRole("link", { name: /Sana Trabelsi/ })).not.toBeInTheDocument();
    expect(seen).toHaveLength(1);
  });

  it("has no primary action and no way to start a request", async () => {
    serve(detailed);
    open();
    await screen.findByRole("grid");

    expect(screen.queryByRole("link", { name: "Nouvelle demande" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nouvelle demande le/ })).not.toBeInTheDocument();
  });
});

describe("HrCalendarPage and OverviewCalendarPage", () => {
  const hr = makeMe({ roles: ["employee", "hr"] });

  it("asks for the whole company and sends the department filter to the server", async () => {
    const user = userEvent.setup();
    serve(detailed);
    const { router } = renderApp(<HrCalendarPage />, { route: "/hr/calendar?date=2026-11-15", path: "/hr/calendar", me: hr });
    await screen.findByRole("link", { name: /Karim Gharbi/ });
    expect(seen[0]).toEqual({ from: "2026-10-26", to: "2026-12-06", scope: "company" });

    await user.selectOptions(await screen.findByLabelText("Département"), "Sinistres");
    await waitFor(() => expect(seen.at(-1)).toMatchObject({ scope: "company", department: "2" }));
    expect(router.state.location.search).toContain("department=2");
    expect(screen.getByLabelText("Personne")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(2);          // type and status are one step away
  });

  it("applies the status kept in the address", async () => {
    serve(detailed);
    renderApp(<HrCalendarPage />, { route: "/hr/calendar?date=2026-11-15&status=pending", path: "/hr/calendar", me: hr });

    expect(await screen.findByRole("link", { name: /Karim Gharbi/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Sana Trabelsi/ })).not.toBeInTheDocument();
  });

  it("is the same read-only calendar for an executive", async () => {
    serve(detailed);
    renderApp(<OverviewCalendarPage />, {
      route: "/overview/calendar?date=2026-11-15", path: "/overview/calendar", me: makeMe({ roles: ["employee", "exec"] }),
    });

    expect(await screen.findByRole("link", { name: /Sana Trabelsi · Congé maladie/ })).toBeInTheDocument();
    expect(seen[0]).toMatchObject({ scope: "company" });
    expect(screen.queryByRole("link", { name: "Nouvelle demande" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nouvelle demande le/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/features/calendar/filters.test.ts src/features/calendar/pages`
Expected: FAIL: `Failed to resolve import "./filters"` and `"./HrCalendarPage"`.

- [ ] **Step 3: Write the state hooks and the filters**

```ts
// frontend/src/features/calendar/useCalendarState.ts
import { isValid, parseISO, startOfDay } from "date-fns";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import { toIso, type CalendarViewMode } from "./model";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One query-string parameter as state. An empty value removes it from the address. */
export function useUrlParam(name: string): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(name) ?? "";
  const setValue = useCallback(
    (next: string) => {
      setParams(
        (previous) => {
          const copy = new URLSearchParams(previous);
          if (next) {
            copy.set(name, next);
          } else {
            copy.delete(name);
          }
          return copy;
        },
        { replace: true },
      );
    },
    [name, setParams],
  );
  return [value, setValue];
}

export function useCalendarState() {
  const [rawView, setRawView] = useUrlParam("view");
  const [rawDate, setRawDate] = useUrlParam("date");

  const view: CalendarViewMode = rawView === "week" ? "week" : "month";
  const anchor = useMemo(() => {
    const parsed = ISO_DATE.test(rawDate) ? parseISO(rawDate) : null;
    return parsed && isValid(parsed) ? parsed : startOfDay(new Date());
  }, [rawDate]);

  return {
    view,
    anchor,
    setView: (next: CalendarViewMode) => setRawView(next === "week" ? "week" : ""),
    setAnchor: (next: Date) => setRawDate(toIso(next)),
  };
}
```

```ts
// frontend/src/features/calendar/filters.ts
import type { CalendarFeed } from "./model";

export interface FilterOption {
  value: string;
  label: string;
}

export interface EntryFilters {
  person: string;
  type: string;
  status: string;
}

function unique(options: FilterOption[]): FilterOption[] {
  const byValue = new Map(options.map((option) => [option.value, option]));
  return [...byValue.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function peopleIn(feed: CalendarFeed | undefined): FilterOption[] {
  return unique((feed?.entries ?? []).map((entry) => ({ value: entry.employee.public_id, label: entry.employee.name })));
}

export function typesIn(feed: CalendarFeed | undefined): FilterOption[] {
  return unique(
    (feed?.entries ?? []).flatMap((entry) =>
      entry.type_code && entry.type_name ? [{ value: entry.type_code, label: entry.type_name }] : []),
  );
}

/** The options of a filter, with the choice that filters nothing first. */
export function withAll(allLabel: string, options: FilterOption[]): FilterOption[] {
  return [{ value: "", label: allLabel }, ...options];
}

/** A value that is no longer offered (the person has no entry in this period) reads as "all". */
export function offered(value: string, options: FilterOption[]): string {
  return options.some((option) => option.value === value) ? value : "";
}

export function applyFilters(feed: CalendarFeed | undefined, filters: EntryFilters): CalendarFeed | undefined {
  if (!feed || (!filters.person && !filters.type && !filters.status)) {
    return feed;
  }
  return {
    holidays: feed.holidays,
    entries: feed.entries.filter((entry) =>
      (!filters.person || entry.employee.public_id === filters.person)
      && (!filters.type || entry.type_code === filters.type)
      && (!filters.status || entry.status === filters.status)),
  };
}
```

- [ ] **Step 4: Write the pages**

```tsx
// frontend/src/features/calendar/pages/MeCalendarPage.tsx
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { PageHeader } from "@/components";
import { Button } from "@/components/ui/button";

import { useCalendar } from "../api";
import { CalendarToolbar } from "../CalendarToolbar";
import { CalendarView } from "../CalendarView";
import { rangeFor, toIso } from "../model";
import { useCalendarState } from "../useCalendarState";

export default function MeCalendarPage() {
  const { t } = useTranslation("calendar");
  const navigate = useNavigate();
  const { view, anchor, setView, setAnchor } = useCalendarState();
  const { from, to } = rangeFor(view, anchor);
  // No filter is ever sent in this scope: the server would ignore it anyway.
  const calendar = useCalendar({ from: toIso(from), to: toIso(to), scope: "department" });
  if (calendar.error) {
    throw calendar.error;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("title")}
        primary={
          <Button asChild variant="primary">
            <Link to="/me/requests/new">{t("newRequest")}</Link>
          </Button>
        }
      >
        {t("hint.department")}
      </PageHeader>
      <CalendarToolbar view={view} anchor={anchor} onViewChange={setView} onAnchorChange={setAnchor} />
      <CalendarView feed={calendar.data} isLoading={calendar.isPending} view={view} anchor={anchor}
                    onAnchorChange={setAnchor} onDayAction={(iso) => navigate(`/me/requests/new?start=${iso}`)} />
    </div>
  );
}
```

```tsx
// frontend/src/features/calendar/pages/TeamCalendarPage.tsx
import { useTranslation } from "react-i18next";

import { FilterBar, FilterSelect, PageHeader } from "@/components";

import { useCalendar } from "../api";
import { CalendarToolbar } from "../CalendarToolbar";
import { CalendarView } from "../CalendarView";
import { applyFilters, offered, peopleIn, typesIn, withAll } from "../filters";
import { rangeFor, toIso } from "../model";
import { useCalendarState, useUrlParam } from "../useCalendarState";

export default function TeamCalendarPage() {
  const { t } = useTranslation("calendar");
  const { view, anchor, setView, setAnchor } = useCalendarState();
  const [person, setPerson] = useUrlParam("person");
  const [type, setType] = useUrlParam("type");
  const { from, to } = rangeFor(view, anchor);
  const calendar = useCalendar({ from: toIso(from), to: toIso(to), scope: "team" });
  if (calendar.error) {
    throw calendar.error;
  }
  const people = withAll(t("filter.everyone"), peopleIn(calendar.data));
  const types = withAll(t("filter.allTypes"), typesIn(calendar.data));

  return (
    <div className="space-y-4">
      <PageHeader title={t("title")}>{t("hint.team")}</PageHeader>
      <FilterBar>
        <FilterSelect label={t("filter.person")} value={offered(person, people)} options={people} onChange={setPerson} />
        <FilterSelect label={t("filter.type")} value={offered(type, types)} options={types} onChange={setType} />
      </FilterBar>
      <CalendarToolbar view={view} anchor={anchor} onViewChange={setView} onAnchorChange={setAnchor} />
      <CalendarView feed={applyFilters(calendar.data, { person: offered(person, people), type: offered(type, types), status: "" })}
                    isLoading={calendar.isPending} view={view} anchor={anchor} onAnchorChange={setAnchor} />
    </div>
  );
}
```

```tsx
// frontend/src/features/calendar/CompanyCalendar.tsx
import { useTranslation } from "react-i18next";

import { FilterBar, FilterSelect, PageHeader } from "@/components";
import { useDepartments } from "@/features/employees/api";

import { useCalendar } from "./api";
import { CalendarToolbar } from "./CalendarToolbar";
import { CalendarView } from "./CalendarView";
import { applyFilters, offered, peopleIn, typesIn, withAll } from "./filters";
import { rangeFor, toIso } from "./model";
import { useCalendarState, useUrlParam } from "./useCalendarState";

/** The whole company with types and pending requests. Read-only: it serves the HR desk and the Overview alike. */
export function CompanyCalendar() {
  const { t } = useTranslation("calendar");
  const { view, anchor, setView, setAnchor } = useCalendarState();
  const [department, setDepartment] = useUrlParam("department");
  const [person, setPerson] = useUrlParam("person");
  const [type, setType] = useUrlParam("type");
  const [status, setStatus] = useUrlParam("status");
  const departmentList = useDepartments();
  const { from, to } = rangeFor(view, anchor);
  const departmentId = /^\d+$/.test(department) ? Number(department) : undefined;
  const calendar = useCalendar({
    from: toIso(from), to: toIso(to), scope: "company",
    ...(departmentId === undefined ? {} : { department: departmentId }),
  });
  if (calendar.error) {
    throw calendar.error;
  }

  const departments = withAll(
    t("filter.allDepartments"),
    (departmentList.data ?? [])
      .filter((item) => item.is_active)
      .map((item) => ({ value: String(item.id), label: item.name })),
  );
  const people = withAll(t("filter.everyone"), peopleIn(calendar.data));
  const types = withAll(t("filter.allTypes"), typesIn(calendar.data));
  const statuses = withAll(t("filter.allStatuses"), [
    { value: "approved", label: t("filter.approved") },
    { value: "pending", label: t("filter.pendingOnly") },
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title={t("title")}>{t("hint.company")}</PageHeader>
      <FilterBar
        more={
          <>
            <FilterSelect label={t("filter.type")} value={offered(type, types)} options={types} onChange={setType} />
            <FilterSelect label={t("filter.status")} value={offered(status, statuses)} options={statuses} onChange={setStatus} />
          </>
        }
      >
        <FilterSelect label={t("filter.department")} value={offered(department, departments)} options={departments} onChange={setDepartment} />
        <FilterSelect label={t("filter.person")} value={offered(person, people)} options={people} onChange={setPerson} />
      </FilterBar>
      <CalendarToolbar view={view} anchor={anchor} onViewChange={setView} onAnchorChange={setAnchor} />
      <CalendarView
        feed={applyFilters(calendar.data, { person: offered(person, people), type: offered(type, types), status: offered(status, statuses) })}
        isLoading={calendar.isPending} view={view} anchor={anchor} onAnchorChange={setAnchor}
      />
    </div>
  );
}
```

```tsx
// frontend/src/features/calendar/pages/HrCalendarPage.tsx
import { CompanyCalendar } from "../CompanyCalendar";

export default function HrCalendarPage() {
  return <CompanyCalendar />;
}
```

```tsx
// frontend/src/features/calendar/pages/OverviewCalendarPage.tsx
import { CompanyCalendar } from "../CompanyCalendar";

export default function OverviewCalendarPage() {
  return <CompanyCalendar />;
}
```

- [ ] **Step 5: Register the routes**

In each of the four files, add the lazy import next to the others and append the route object to the exported array. The navigation entry "Calendrier" of each workspace appears as soon as its route exists (master 9.1).

`frontend/src/workspaces/me/routes.tsx`:

```tsx
const MeCalendarPage = lazy(() => import("@/features/calendar/pages/MeCalendarPage"));
```

```tsx
  { path: "calendar", element: <MeCalendarPage /> },
```

`frontend/src/workspaces/team/routes.tsx`:

```tsx
const TeamCalendarPage = lazy(() => import("@/features/calendar/pages/TeamCalendarPage"));
```

```tsx
  { path: "calendar", element: <TeamCalendarPage /> },
```

`frontend/src/workspaces/hr/routes.tsx`:

```tsx
const HrCalendarPage = lazy(() => import("@/features/calendar/pages/HrCalendarPage"));
```

```tsx
  { path: "calendar", element: <HrCalendarPage /> },
```

`frontend/src/workspaces/overview/routes.tsx`:

```tsx
const OverviewCalendarPage = lazy(() => import("@/features/calendar/pages/OverviewCalendarPage"));
```

```tsx
  { path: "calendar", element: <OverviewCalendarPage /> },
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/features/calendar`
Expected: 42 passed (30 from Tasks 9 and 10, 4 in `filters.test.ts`, 8 in `pages.test.tsx`).

Run: `docker compose run --rm web npx vitest run src/app src/features/shell`
Expected: PASS. Plan 01b's navigation tests mock the route arrays; if one of them compares the complete list of entries drawn for a workspace with the real routes, add "Calendrier" to its expected list and change nothing else.

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no error.

- [ ] **Step 7: Look at the four pages**

Run: `docker compose up -d` and `docker compose exec app python manage.py e2e_reset`, then open `http://localhost:5173`.

- Sign in as `employee.a1@impactrisks.com` (password `Correct-Horse-42!`): "Calendrier" is in the navigation of My space. Three weeks ahead, Mounir Manager appears as "Absent(e)" with no type and no link; the request of `employee.a1` reads "Vous · Congé annuel · en attente"; there is one primary button.
- Sign in as `manager.a@impactrisks.com`, switch to My team: the pending request of Amal Employee has a dashed border and reads "Congé annuel · en attente"; her remote day reads "Télétravail".
- Sign in as `hr@impactrisks.com` and as `ceo@impactrisks.com`: the calendar shows every department with types; choosing a department reloads it.
- Narrow the window under 768px: the grid becomes a list of days.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/calendar frontend/src/workspaces
git commit -m "feat(calendar): calendar pages for My space, My team, HR desk and Overview"
```

---

### Task 12: The My space home (frontend)

UI 5.1: four blocks at most. The balance is the one prominent figure (M10). "Needs you" exists only when something needs the employee (M3). The primary action is New request (U1).

| Block | Content | When empty |
|---|---|---|
| Balance | The current balance as the figure; days held by pending requests; days approved and upcoming; a link to the balance page | Reads zero |
| Needs you | Requests sent back with the comment and "Edit and send again"; certificates due with the deadline and "Add the certificate" | The block is absent |
| In progress | Requests not yet decided: type, dates, status sentence | One line |
| Coming up | Next approved absences and remote days: type, dates, quantity | One line |

**Files:**
- Create: `frontend/src/features/home/api.ts`
- Create: `frontend/src/features/home/RequestLines.tsx`
- Create: `frontend/src/features/home/MeHomePage.tsx`
- Create: `frontend/src/i18n/locales/fr/home.json`, `frontend/src/i18n/locales/en/home.json`
- Modify: `frontend/src/api/types.ts` (four types appended)
- Modify: `frontend/src/app/homes.ts` (one line added)
- Test: `frontend/src/features/home/MeHomePage.test.tsx`

**Interfaces:**
- Consumes: the generated paths `/api/v1/home/me`, `/api/v1/home/team`, `/api/v1/home/overview`, `/api/v1/workspaces/summary` (Tasks 4 to 7); from `@/components` (plan 01b): `Block({ title, children, action? })` (a section named by its `h2`), `Figure({ label, value, hint? })`, `PageHeader`, `PageLoading`; `formatDate`, `formatDateRange` ("17 nov. 2026 – 18 nov. 2026"), `formatDateTime` ("4 nov. 2026 à 08:00"), `formatDays` ("1,5 jour"), `formatHours` from `@/lib/format`, each taking the value and a `Lang`; `useLang()` from `@/i18n`; from plan 03b: the hand-written `RequestOut` of `@/features/requests/types`, `StatusSentence({ request })` from `@/features/requests/StatusSentence`, `makeRequest(overrides)` from `@/features/requests/fixtures`, `AFFECTED_KEYS` from `@/features/requests/api`; the pages `/me/requests/new`, `/me/requests/:id/edit`, `/requests/:id` (plan 03b) and `/me/balance` (plan 04).
- Produces:

```ts
// api/types.ts (appended)
export type MeHomeWire = Ok<"/api/v1/home/me", "get">;
export type TeamHome = Ok<"/api/v1/home/team", "get">;
export type OverviewHome = Ok<"/api/v1/home/overview", "get">;
export type WorkspaceSummary = Ok<"/api/v1/workspaces/summary", "get">;

// features/home/api.ts
export interface NeedsYouItem { kind: "returned" | "certificate_due"; request: RequestOut; due_at: string | null }
export interface MeHome { balance: MeHomeWire["balance"]; needs_you: NeedsYouItem[]; in_progress: RequestOut[]; coming_up: RequestOut[] }
export type { OverviewHome, TeamHome };
export const homeKeys: { all: readonly ["home"]; me: readonly ["home", "me"]; team: readonly ["home", "team"]; overview: readonly ["home", "overview"] };
export function useMeHome(): UseQueryResult<MeHome>;
export function useTeamHome(): UseQueryResult<TeamHome>;
export function useOverviewHome(): UseQueryResult<OverviewHome>;
// features/home/RequestLines.tsx
export function RequestLines(props: { requests: RequestOut[]; show: "status" | "quantity" }): JSX.Element;
// features/home/MeHomePage.tsx: default export
```

The requests of the My space home are typed with plan 03b's `RequestOut`, the type `StatusSentence` takes; everything else comes from the generated schema.

- [ ] **Step 1: Write the texts**

```json
// frontend/src/i18n/locales/fr/home.json
{
  "me": {
    "title": "Mon espace",
    "newRequest": "Nouvelle demande",
    "balance": {
      "title": "Solde",
      "label": "de congé annuel disponible",
      "pending": "Dans des demandes en attente",
      "upcoming": "Approuvés et à venir",
      "details": "Voir le détail"
    },
    "needsYou": {
      "title": "À faire",
      "returned": "Renvoyée : {{type}}, {{dates}}",
      "edit": "Modifier et renvoyer",
      "certificate": "Certificat médical à fournir avant le {{deadline}}",
      "addCertificate": "Ajouter le certificat"
    },
    "inProgress": {
      "title": "En cours",
      "empty": "Aucune demande en cours."
    },
    "comingUp": {
      "title": "À venir",
      "empty": "Aucune absence prévue."
    }
  }
}
```

```json
// frontend/src/i18n/locales/en/home.json
{
  "me": {
    "title": "My space",
    "newRequest": "New request",
    "balance": {
      "title": "Balance",
      "label": "of annual leave available",
      "pending": "In requests still waiting",
      "upcoming": "Approved and coming up",
      "details": "See the detail"
    },
    "needsYou": {
      "title": "Needs you",
      "returned": "Sent back: {{type}}, {{dates}}",
      "edit": "Edit and send again",
      "certificate": "Medical certificate due by {{deadline}}",
      "addCertificate": "Add the certificate"
    },
    "inProgress": {
      "title": "In progress",
      "empty": "No request in progress."
    },
    "comingUp": {
      "title": "Coming up",
      "empty": "No absence planned."
    }
  }
}
```

JSON files hold no comment: the first line of each block above is the file's path, not content.

- [ ] **Step 2: Write the failing tests**

```tsx
// frontend/src/features/home/MeHomePage.test.tsx
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { makeRequest } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import type { MeHome } from "./api";
import MeHomePage from "./MeHomePage";

// The sentence itself belongs to plan 03b; here we only check that the home uses it.
vi.mock("@/features/requests/StatusSentence", () => ({
  StatusSentence: ({ request }: { request: { state: { key: string } } }) => <span>sentence:{request.state.key}</span>,
}));

function home(overrides: Partial<MeHome> = {}): MeHome {
  return {
    balance: { current: "20.00", pending: "2.00", approved_upcoming: "1.50", next_credit_amount: "2.50", next_credit_date: "2026-11-30" },
    needs_you: [],
    in_progress: [],
    coming_up: [],
    ...overrides,
  };
}

function show(data: MeHome) {
  server.use(http.get("/api/v1/home/me", () => HttpResponse.json(data)));
  renderApp(<MeHomePage />, { route: "/me", path: "/me", me: makeMe({ roles: ["employee"] }) });
}

const block = (name: string) => screen.findByRole("region", { name });
const blockTitles = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

describe("MeHomePage", () => {
  it("shows the balance as the one figure, with what is held and what is coming", async () => {
    show(home());

    const balance = await block("Solde");
    expect(within(balance).getByText("20 jours")).toBeInTheDocument();
    expect(within(balance).getByText("de congé annuel disponible")).toBeInTheDocument();
    expect(within(balance).getByText("2 jours")).toBeInTheDocument();
    expect(within(balance).getByText("1,5 jour")).toBeInTheDocument();
    expect(within(balance).getByRole("link", { name: "Voir le détail" })).toHaveAttribute("href", "/me/balance");
  });

  it("has New request as its primary action", async () => {
    show(home());
    expect(await screen.findByRole("link", { name: "Nouvelle demande" })).toHaveAttribute("href", "/me/requests/new");
    expect(screen.getByRole("heading", { level: 1, name: "Mon espace" })).toBeInTheDocument();
  });

  it("lists what needs the employee, with the way to act on each", async () => {
    show(home({ needs_you: [
      { kind: "returned", due_at: null, request: makeRequest({
        public_id: "r1", start_date: "2026-11-10", end_date: "2026-11-10", status: "returned",
        state: { key: "returned", waiting_on: [], last_actor: "Sami Ben Ali", note: "Choisissez une autre semaine" },
      }) },
      { kind: "certificate_due", due_at: "2026-11-04T08:00:00+01:00", request: makeRequest({
        public_id: "r2", type: { code: "sick", name: "Congé maladie" }, start_date: "2026-11-02", end_date: "2026-11-02",
      }) },
    ] }));

    const needs = await block("À faire");
    expect(within(needs).getByText("Renvoyée : Congé annuel, 10 nov. 2026")).toBeInTheDocument();
    expect(within(needs).getByText("Choisissez une autre semaine")).toBeInTheDocument();
    expect(within(needs).getByRole("link", { name: "Modifier et renvoyer" })).toHaveAttribute("href", "/me/requests/r1/edit");
    expect(within(needs).getByText("Certificat médical à fournir avant le 4 nov. 2026 à 08:00")).toBeInTheDocument();
    expect(within(needs).getByRole("link", { name: "Ajouter le certificat" })).toHaveAttribute("href", "/requests/r2");
  });

  it("has no Needs you block when nothing needs the employee", async () => {
    show(home());
    await block("Solde");
    expect(blockTitles()).toEqual(["Solde", "En cours", "À venir"]);
  });

  it("shows requests in progress with their status sentence and upcoming absences with their length", async () => {
    show(home({
      in_progress: [makeRequest({ public_id: "r3", start_date: "2026-11-17", end_date: "2026-11-18", quantity: "2.00" })],
      coming_up: [
        makeRequest({ public_id: "r4", start_date: "2026-11-24", end_date: "2026-11-25", quantity: "1.50", status: "approved" }),
        makeRequest({ public_id: "r5", type: { code: "permission", name: "Autorisation", unit: "hour", calendar_label: "hidden" },
                      start_date: "2026-11-26", end_date: "2026-11-26", quantity: "2.00", status: "approved" }),
      ],
    }));

    const inProgress = await block("En cours");
    const link = within(inProgress).getByRole("link", { name: /Congé annuel/ });
    expect(link).toHaveAttribute("href", "/requests/r3");
    expect(link).toHaveTextContent("Congé annuel, 17 nov. 2026 – 18 nov. 2026");
    expect(within(inProgress).getByText("sentence:waiting_manager")).toBeInTheDocument();

    const comingUp = await block("À venir");
    expect(within(comingUp).getByRole("link", { name: /Congé annuel/ })).toHaveTextContent("24 nov. 2026 – 25 nov. 2026");
    expect(within(comingUp).getByText("1,5 jour")).toBeInTheDocument();
    expect(within(comingUp).getByText("2 heures")).toBeInTheDocument();
    expect(within(comingUp).queryByText(/sentence:/)).not.toBeInTheDocument();
    expect(blockTitles()).toHaveLength(3);
  });

  it("renders for a new employee: a zero balance and one line per empty block", async () => {
    show(home({ balance: { current: "0.00", pending: "0.00", approved_upcoming: "0.00", next_credit_amount: null, next_credit_date: null } }));

    expect(within(await block("Solde")).getAllByText("0 jour")).toHaveLength(3);
    expect(within(await block("En cours")).getByText("Aucune demande en cours.")).toBeInTheDocument();
    expect(within(await block("À venir")).getByText("Aucune absence prévue.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/features/home/MeHomePage.test.tsx`
Expected: FAIL: `Failed to resolve import "./MeHomePage"`.

- [ ] **Step 4: Derive the types and write the hooks**

Append to `frontend/src/api/types.ts`:

```ts
export type MeHomeWire = Ok<"/api/v1/home/me", "get">;
export type TeamHome = Ok<"/api/v1/home/team", "get">;
export type OverviewHome = Ok<"/api/v1/home/overview", "get">;
export type WorkspaceSummary = Ok<"/api/v1/workspaces/summary", "get">;
```

```ts
// frontend/src/features/home/api.ts
import { useQuery } from "@tanstack/react-query";

import { api, call } from "@/api/client";
import type { MeHomeWire, OverviewHome, TeamHome } from "@/api/types";
import { AFFECTED_KEYS } from "@/features/requests/api";
import type { RequestOut } from "@/features/requests/types";

export type { OverviewHome, TeamHome };

export interface NeedsYouItem {
  kind: "returned" | "certificate_due";
  request: RequestOut;
  due_at: string | null;
}

/** The My space home. Its requests carry plan 03b's request type, the one its components take. */
export interface MeHome {
  balance: MeHomeWire["balance"];
  needs_you: NeedsYouItem[];
  in_progress: RequestOut[];
  coming_up: RequestOut[];
}

export const homeKeys = {
  all: ["home"] as const,
  me: ["home", "me"] as const,
  team: ["home", "team"] as const,
  overview: ["home", "overview"] as const,
};

// A request that is sent, decided, changed or cancelled changes the homes: plan 03b reads these keys again.
AFFECTED_KEYS.push(homeKeys.all);

// A home is what a person opens to see the present state, so it is read again on every visit.
export function useMeHome() {
  return useQuery({
    queryKey: homeKeys.me,
    queryFn: () => call(api.GET("/api/v1/home/me")) as Promise<unknown> as Promise<MeHome>,
    refetchOnMount: "always",
  });
}

export function useTeamHome() {
  return useQuery({
    queryKey: homeKeys.team,
    queryFn: async (): Promise<TeamHome> => call(api.GET("/api/v1/home/team")),
    refetchOnMount: "always",
  });
}

export function useOverviewHome() {
  return useQuery({
    queryKey: homeKeys.overview,
    queryFn: async (): Promise<OverviewHome> => call(api.GET("/api/v1/home/overview")),
    refetchOnMount: "always",
  });
}
```

- [ ] **Step 5: Write the list of requests, the page, and register the home**

```tsx
// frontend/src/features/home/RequestLines.tsx
import { Link } from "react-router";

import { StatusSentence } from "@/features/requests/StatusSentence";
import type { RequestOut } from "@/features/requests/types";
import { useLang } from "@/i18n";
import { formatDateRange, formatDays, formatHours } from "@/lib/format";

interface RequestLinesProps {
  requests: RequestOut[];
  show: "status" | "quantity";
}

/** A short list of the user's own requests: what, when, and either where it stands or how long it is. */
export function RequestLines({ requests, show }: RequestLinesProps) {
  const lang = useLang();
  return (
    <ul className="divide-y divide-divider">
      {requests.map((request) => (
        <li key={request.public_id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
          <Link to={`/requests/${request.public_id}`} className="text-body text-foreground hover:underline">
            <span className="font-semibold">{request.type.name}</span>
            {", "}
            {formatDateRange(request.start_date, request.end_date, lang)}
          </Link>
          {show === "status" ? (
            <StatusSentence request={request} />
          ) : (
            <span className="text-body tabular-nums text-text-secondary">
              {request.type.unit === "hour" ? formatHours(request.quantity, lang) : formatDays(request.quantity, lang)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
```

```tsx
// frontend/src/features/home/MeHomePage.tsx
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Block, Figure, PageHeader, PageLoading } from "@/components";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatDateRange, formatDateTime, formatDays } from "@/lib/format";

import { useMeHome, type NeedsYouItem } from "./api";
import { RequestLines } from "./RequestLines";

const ACTION_LINK = "inline-flex min-h-11 items-center text-body font-medium text-primary hover:underline md:min-h-0";
const QUIET = "text-body text-muted-foreground";

function NeedsYou({ items }: { items: NeedsYouItem[] }) {
  const { t } = useTranslation("home");
  const lang = useLang();
  return (
    <ul className="divide-y divide-divider">
      {items.map((item) => (
        <li key={`${item.kind}-${item.request.public_id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
          {item.kind === "returned" ? (
            <>
              <div>
                <p className="text-body text-foreground">
                  {t("me.needsYou.returned", {
                    type: item.request.type.name,
                    dates: formatDateRange(item.request.start_date, item.request.end_date, lang),
                  })}
                </p>
                {item.request.state.note ? <p className={QUIET}>{item.request.state.note}</p> : null}
              </div>
              <Link to={`/me/requests/${item.request.public_id}/edit`} className={ACTION_LINK}>{t("me.needsYou.edit")}</Link>
            </>
          ) : (
            <>
              <p className="text-body text-foreground">
                {t("me.needsYou.certificate", { deadline: item.due_at ? formatDateTime(item.due_at, lang) : "" })}
              </p>
              <Link to={`/requests/${item.request.public_id}`} className={ACTION_LINK}>{t("me.needsYou.addCertificate")}</Link>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function MeHomePage() {
  const { t } = useTranslation("home");
  const lang = useLang();
  const home = useMeHome();
  if (home.isPending) {
    return <PageLoading />;
  }
  if (home.error) {
    throw home.error;
  }
  const data = home.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("me.title")}
        primary={
          <Button asChild variant="primary">
            <Link to="/me/requests/new">{t("me.newRequest")}</Link>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Block title={t("me.balance.title")}
               action={<Link to="/me/balance" className={ACTION_LINK}>{t("me.balance.details")}</Link>}>
          <Figure label={t("me.balance.label")} value={formatDays(data.balance.current, lang)} />
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-caption text-muted-foreground">{t("me.balance.pending")}</dt>
              <dd className="text-body font-semibold tabular-nums text-foreground">{formatDays(data.balance.pending, lang)}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">{t("me.balance.upcoming")}</dt>
              <dd className="text-body font-semibold tabular-nums text-foreground">{formatDays(data.balance.approved_upcoming, lang)}</dd>
            </div>
          </dl>
        </Block>

        {data.needs_you.length > 0 ? (
          <Block title={t("me.needsYou.title")}>
            <NeedsYou items={data.needs_you} />
          </Block>
        ) : null}

        <Block title={t("me.inProgress.title")}>
          {data.in_progress.length > 0
            ? <RequestLines requests={data.in_progress} show="status" />
            : <p className={QUIET}>{t("me.inProgress.empty")}</p>}
        </Block>

        <Block title={t("me.comingUp.title")}>
          {data.coming_up.length > 0
            ? <RequestLines requests={data.coming_up} show="quantity" />
            : <p className={QUIET}>{t("me.comingUp.empty")}</p>}
        </Block>
      </div>
    </div>
  );
}
```

Add this line inside the `HOMES` object of `frontend/src/app/homes.ts`:

```ts
  me: lazy(() => import("@/features/home/MeHomePage")),
```

"Accueil" appears in the navigation of My space as soon as the workspace has a registered home (master 9.1).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/features/home/MeHomePage.test.tsx src/i18n/parity.test.ts`
Expected: 6 passed in `MeHomePage.test.tsx`; the parity test passes.

Run: `docker compose run --rm web npx vitest run src/features/requests`
Expected: PASS. Plan 03b's tests are not touched by the key added to `AFFECTED_KEYS`: invalidating a key nobody reads does nothing.

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no error.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/home frontend/src/app/homes.ts frontend/src/api/types.ts frontend/src/i18n
git commit -m "feat(home): My space home with balance, needs-you, in progress and coming up"
```

---

### Task 13: The My team home (frontend)

UI 6.1. Plan 03b built the manager's queue as `ToDecidePage`: the title, the primary action "decide the oldest request" and the `ToDecideBlock`. This task keeps that page whole and puts the two missing blocks under it, on a page that becomes the home of My team.

| Block | Content | When empty |
|---|---|---|
| To decide | Plan 03b's `ToDecidePage`, unchanged: title, primary action, queue | Its own "Nothing to decide" |
| Who is out | Team members absent or remote today and over the next seven days, with the type | One line |
| Delegation | One sentence: who covers for whom, and until when; a link to the delegations page | The block is absent |

**Files:**
- Create: `frontend/src/features/home/TeamHomePage.tsx`
- Modify: `frontend/src/i18n/locales/fr/home.json`, `frontend/src/i18n/locales/en/home.json` (keys added)
- Modify: `frontend/src/app/homes.ts` (the `team` line replaced)
- Modify: `frontend/src/test/handlers.ts` (one default answer appended)
- Test: `frontend/src/features/home/TeamHomePage.test.tsx`

**Interfaces:**
- Consumes: `useTeamHome`, `TeamHome` (Task 12); `ToDecidePage` (default export of `@/features/requests/queues/ToDecidePage`, plan 03b); `Block` from `@/components`; `formatDateRange` from `@/lib/format`; `useLang`; the `calendar` namespace keys `part.morning`, `part.afternoon` (Task 9); the page `/team/delegations` (plan 02).
- Produces: `features/home/TeamHomePage.tsx`, default export, registered as `HOMES.team`.

- [ ] **Step 1: Add the texts**

Add the `team` object to `frontend/src/i18n/locales/fr/home.json`, next to `me`:

```json
{
  "team": {
    "whoIsOut": {
      "title": "Absents et télétravail",
      "empty": "Toute l'équipe est présente ces sept prochains jours.",
      "today": "aujourd'hui"
    },
    "delegation": {
      "title": "Délégation",
      "given": "{{person}} décide à votre place, {{dates}}.",
      "received": "Vous décidez à la place de {{person}}, {{dates}}.",
      "manage": "Gérer les délégations"
    }
  }
}
```

And to `frontend/src/i18n/locales/en/home.json`:

```json
{
  "team": {
    "whoIsOut": {
      "title": "Absent and remote",
      "empty": "The whole team is in for the next seven days.",
      "today": "today"
    },
    "delegation": {
      "title": "Delegation",
      "given": "{{person}} decides in your place, {{dates}}.",
      "received": "You decide in place of {{person}}, {{dates}}.",
      "manage": "Manage delegations"
    }
  }
}
```

Merge the objects: keep the `me` keys of Task 12.

- [ ] **Step 2: Give every test a quiet team**

From Task 14 on, the People list reads `home/team` too. Append this default answer to the `handlers` array of `frontend/src/test/handlers.ts`, so a test that is about something else declares nothing:

```ts
  http.get("/api/v1/home/team", () => HttpResponse.json({ who_is_out: [], delegation: null, people: [] })),
```

- [ ] **Step 3: Write the failing tests**

```tsx
// frontend/src/features/home/TeamHomePage.test.tsx
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import type { TeamHome } from "./api";
import TeamHomePage from "./TeamHomePage";

// The queue page is plan 03b's and has its own tests; here we check where it sits.
vi.mock("@/features/requests/queues/ToDecidePage", () => ({
  default: () => <section aria-label="File à décider">queue</section>,
}));

type OutPerson = TeamHome["who_is_out"][number];

function person(overrides: Partial<OutPerson> = {}): OutPerson {
  return {
    employee: { public_id: "p1", name: "Sana Trabelsi" }, label: "absent", type_name: "Congé maladie",
    start_date: "2026-11-02", end_date: "2026-11-03", starts_at_midday: false, ends_at_midday: false, today: true,
    ...overrides,
  };
}

function show(data: Partial<TeamHome>) {
  server.use(http.get("/api/v1/home/team", () => HttpResponse.json({ who_is_out: [], delegation: null, people: [], ...data })));
  renderApp(<TeamHomePage />, { route: "/team", path: "/team", me: makeMe({ roles: ["employee", "manager"] }) });
}

const blockTitles = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

describe("TeamHomePage", () => {
  it("puts the queue first, then who is out", async () => {
    show({ who_is_out: [person()] });

    const out = await screen.findByRole("region", { name: "Absents et télétravail" });
    const queue = screen.getByRole("region", { name: "File à décider" });
    expect(queue.compareDocumentPosition(out) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(blockTitles()).toEqual(["Absents et télétravail"]);
  });

  it("lists who is out with the type, the dates, today's mark and the half-day", async () => {
    show({ who_is_out: [
      person(),
      person({ employee: { public_id: "p2", name: "Karim Gharbi" }, label: "remote", type_name: "Télétravail",
               start_date: "2026-11-05", end_date: "2026-11-05", starts_at_midday: true, today: false }),
    ] });

    const out = await screen.findByRole("region", { name: "Absents et télétravail" });
    const [first, second] = within(out).getAllByRole("listitem");
    expect(first).toHaveTextContent("Sana Trabelsi");
    expect(first).toHaveTextContent("Congé maladie, 2 nov. 2026 – 3 nov. 2026");
    expect(first).toHaveTextContent("aujourd'hui");
    expect(second).toHaveTextContent("Karim Gharbi");
    expect(second).toHaveTextContent("Télétravail, 5 nov. 2026 (après-midi)");
    expect(second).not.toHaveTextContent("aujourd'hui");
  });

  it("shrinks an empty Who is out to one line and leaves the delegation block out", async () => {
    show({});

    const out = await screen.findByRole("region", { name: "Absents et télétravail" });
    expect(within(out).getByText("Toute l'équipe est présente ces sept prochains jours.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Délégation" })).not.toBeInTheDocument();
  });

  it.each([
    ["given", "Karim Gharbi décide à votre place, 2 nov. 2026 – 6 nov. 2026."],
    ["received", "Vous décidez à la place de Karim Gharbi, 2 nov. 2026 – 6 nov. 2026."],
  ] as const)("states a delegation %s in one sentence", async (direction, sentence) => {
    show({ delegation: { direction, person: "Karim Gharbi", start_date: "2026-11-02", end_date: "2026-11-06" } });

    const delegation = await screen.findByRole("region", { name: "Délégation" });
    expect(within(delegation).getByText(sentence)).toBeInTheDocument();
    expect(within(delegation).getByRole("link", { name: "Gérer les délégations" })).toHaveAttribute("href", "/team/delegations");
    expect(blockTitles()).toEqual(["Absents et télétravail", "Délégation"]);     // with the queue: three blocks, four at most
  });

  it("adds no button of its own: the page's one primary action is the queue page's", async () => {
    show({ who_is_out: [person()] });

    await screen.findByRole("region", { name: "Absents et télétravail" });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/features/home/TeamHomePage.test.tsx`
Expected: FAIL: `Failed to resolve import "./TeamHomePage"`.

- [ ] **Step 5: Write the page and make it the home**

```tsx
// frontend/src/features/home/TeamHomePage.tsx
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Block } from "@/components";
import ToDecidePage from "@/features/requests/queues/ToDecidePage";
import { useLang } from "@/i18n";
import { formatDateRange } from "@/lib/format";

import { useTeamHome, type TeamHome } from "./api";

type OutPerson = TeamHome["who_is_out"][number];

function WhoIsOut({ people }: { people: OutPerson[] }) {
  const { t } = useTranslation("home");
  const lang = useLang();

  function halfDay(person: OutPerson): string {
    if (person.start_date !== person.end_date) {
      return "";
    }
    if (person.starts_at_midday) {
      return ` (${t("part.afternoon", { ns: "calendar" })})`;
    }
    if (person.ends_at_midday) {
      return ` (${t("part.morning", { ns: "calendar" })})`;
    }
    return "";
  }

  return (
    <ul className="divide-y divide-divider">
      {people.map((person) => (
        <li key={`${person.employee.public_id}-${person.start_date}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
          <span className="text-body font-semibold text-foreground">{person.employee.name}</span>
          <span className="text-body text-text-secondary">
            {person.type_name}
            {", "}
            {formatDateRange(person.start_date, person.end_date, lang)}
            {halfDay(person)}
            {person.today ? (
              <span className="ml-2 rounded-sm bg-waiting-bg px-1.5 py-0.5 text-caption font-medium text-waiting">
                {t("team.whoIsOut.today")}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** /team : plan 03b's queue page, then who is out and the delegation of the day (UI 6.1). */
export default function TeamHomePage() {
  const { t } = useTranslation("home");
  const lang = useLang();
  const home = useTeamHome();
  if (home.error) {
    throw home.error;
  }
  const data = home.data;
  const delegation = data?.delegation ?? null;

  return (
    <div className="space-y-4">
      <ToDecidePage />
      {data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Block title={t("team.whoIsOut.title")}>
            {data.who_is_out.length > 0
              ? <WhoIsOut people={data.who_is_out} />
              : <p className="text-body text-muted-foreground">{t("team.whoIsOut.empty")}</p>}
          </Block>
          {delegation ? (
            <Block
              title={t("team.delegation.title")}
              action={
                <Link to="/team/delegations" className="inline-flex min-h-11 items-center text-body font-medium text-primary hover:underline md:min-h-0">
                  {t("team.delegation.manage")}
                </Link>
              }
            >
              <p className="text-body text-foreground">
                {t(`team.delegation.${delegation.direction}`, {
                  person: delegation.person,
                  dates: formatDateRange(delegation.start_date, delegation.end_date, lang),
                })}
              </p>
            </Block>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

In `frontend/src/app/homes.ts`, replace the `team` line plan 03b wrote:

```ts
  team: lazy(() => import("@/features/requests/queues/ToDecidePage")),
```

with:

```ts
  team: lazy(() => import("@/features/home/TeamHomePage")),
```

`ToDecidePage` stays where it is: this page renders it, and plan 03b's tests still cover it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/features/home src/features/requests/queues src/i18n/parity.test.ts`
Expected: `TeamHomePage.test.tsx` 6 passed (4 tests and one parametrised twice); `MeHomePage.test.tsx`, plan 03b's queue tests and the parity test still pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/home frontend/src/app/homes.ts frontend/src/test/handlers.ts frontend/src/i18n
git commit -m "feat(home): My team home with who is out and delegation under the queue"
```

---

### Task 14: Presence today and annual balance in the People list (frontend)

UI 6.3 shows five attributes per person of the team: name, position, today (in, absent, remote), annual balance, requests waiting. Plan 02 built the list with name and position and an extension point for the rest; plan 03b added "requests waiting". This task adds the two that were missing. Both read the `people` list of `home/team` (Task 5): one request for the whole table, shared by every cell.

**Files:**
- Create: `frontend/src/features/home/PeopleCells.tsx`
- Modify: `frontend/src/features/employees/peopleColumns.tsx` (one import, two columns appended)
- Modify: `frontend/src/i18n/locales/fr/home.json`, `frontend/src/i18n/locales/en/home.json` (keys added)
- Test: `frontend/src/features/home/PeopleCells.test.tsx`

**Interfaces:**
- Consumes: `useTeamHome` (Task 12; `TeamHome["people"]` is `{ public_id, today: "in" | "absent" | "remote", balance }[]`); plan 02's extension point `PEOPLE_COLUMNS` of `@/features/employees/peopleColumns` (`{ id, headerKey: "namespace:key", order, cell(row) }`; name 10, position 20, plan 03b's `waiting` 50), its `TeamPeoplePage` and its test data `makeEmployeeRow`, `pageOf` from `@/features/employees/testing`; `StatusBadge` from `@/components`; `formatDays`; `makePage` from `@/test/fixtures`.
- Produces: `TodayCell({ employeeId })`, `BalanceCell({ employeeId })`; the columns `today` (order 30) and `balance` (order 40).

- [ ] **Step 1: Add the texts**

Add the `people` object to `frontend/src/i18n/locales/fr/home.json`:

```json
{
  "people": {
    "today": "Aujourd'hui",
    "balance": "Solde annuel",
    "presence": {
      "in": "Présent(e)",
      "absent": "Absent(e)",
      "remote": "En télétravail"
    }
  }
}
```

And to `frontend/src/i18n/locales/en/home.json`:

```json
{
  "people": {
    "today": "Today",
    "balance": "Annual balance",
    "presence": {
      "in": "In",
      "absent": "Absent",
      "remote": "Remote"
    }
  }
}
```

- [ ] **Step 2: Write the failing tests**

```tsx
// frontend/src/features/home/PeopleCells.test.tsx
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { PEOPLE_COLUMNS } from "@/features/employees/peopleColumns";
import TeamPeoplePage from "@/features/employees/TeamPeoplePage";
import { makeEmployeeRow, pageOf } from "@/features/employees/testing";
import { makeMe, makePage } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { BalanceCell, TodayCell } from "./PeopleCells";

const manager = makeMe({ roles: ["employee", "manager"] });

function team(people: { public_id: string; today: "in" | "absent" | "remote"; balance: string }[]) {
  let reads = 0;
  server.use(http.get("/api/v1/home/team", () => {
    reads += 1;
    return HttpResponse.json({ who_is_out: [], delegation: null, people });
  }));
  return () => reads;
}

describe("People cells", () => {
  it.each([
    ["in", "Présent(e)"],
    ["absent", "Absent(e)"],
    ["remote", "En télétravail"],
  ] as const)("says %s in words", async (today, words) => {
    team([{ public_id: "emp-1", today, balance: "7.50" }]);
    renderApp(<TodayCell employeeId="emp-1" />, { route: "/team/people", path: "/team/people", me: manager });

    expect(await screen.findByText(words)).toBeInTheDocument();
  });

  it("shows the balance in days", async () => {
    team([{ public_id: "emp-1", today: "in", balance: "7.50" }]);
    renderApp(<BalanceCell employeeId="emp-1" />, { route: "/team/people", path: "/team/people", me: manager });

    expect(await screen.findByText("7,5 jours")).toBeInTheDocument();
  });

  it("stays empty for a person the answer does not carry", async () => {
    team([]);
    const { container } = renderApp(
      <><TodayCell employeeId="emp-9" /><BalanceCell employeeId="emp-9" /></>,
      { route: "/team/people", path: "/team/people", me: manager },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.textContent).toBe("");
  });
});

describe("People list of My team", () => {
  it("registers today and annual balance between position and requests waiting", () => {
    const columns = [...PEOPLE_COLUMNS].sort((a, b) => a.order - b.order).map((column) => column.id);
    expect(columns).toEqual(["name", "position", "today", "balance", "waiting"]);
  });

  it("fills both columns for every row from one read of the team", async () => {
    const reads = team([
      { public_id: "emp-1", today: "remote", balance: "12.50" },
      { public_id: "emp-2", today: "absent", balance: "0.00" },
    ]);
    server.use(
      http.get("/api/v1/employees", () => HttpResponse.json(pageOf([
        makeEmployeeRow({ employee_number: null, manager: null, status: null }),
        makeEmployeeRow({ public_id: "emp-2", name: "Bilel Employee", employee_number: null, manager: null, status: null }),
      ]))),
      http.get("/api/v1/requests", () => HttpResponse.json(makePage([]))),       // plan 03b's "requests waiting" column
    );
    renderApp(<TeamPeoplePage />, { route: "/team/people", path: "/team/people", me: manager });

    const table = within(await screen.findByRole("table", { name: "Personnes" }));
    expect(table.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(
      ["Nom", "Poste", "Aujourd'hui", "Solde annuel", "Demandes en attente"]);
    expect(await table.findByText("En télétravail")).toBeInTheDocument();
    expect(table.getByText("12,5 jours")).toBeInTheDocument();
    expect(table.getByText("Absent(e)")).toBeInTheDocument();
    expect(table.getByText("0 jour")).toBeInTheDocument();
    expect(reads()).toBe(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/features/home/PeopleCells.test.tsx`
Expected: FAIL: `Failed to resolve import "./PeopleCells"`.

- [ ] **Step 4: Write the cells and register the columns**

```tsx
// frontend/src/features/home/PeopleCells.tsx
import { useTranslation } from "react-i18next";

import { StatusBadge, type StatusTone } from "@/components";
import { useLang } from "@/i18n";
import { formatDays } from "@/lib/format";

import { useTeamHome, type TeamHome } from "./api";

type TeamPerson = TeamHome["people"][number];

const TONES: Record<TeamPerson["today"], StatusTone> = { in: "approved", absent: "neutral", remote: "info" };

/** One team member's line in the answer every cell of the People table shares. */
function usePerson(employeeId: string): TeamPerson | undefined {
  const home = useTeamHome();
  return home.data?.people.find((person) => person.public_id === employeeId);
}

/** UI 6.3 "today": in, absent or remote. Empty until the team is known. */
export function TodayCell({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation("home");
  const person = usePerson(employeeId);
  if (!person) {
    return null;
  }
  return <StatusBadge tone={TONES[person.today]}>{t(`people.presence.${person.today}`)}</StatusBadge>;
}

/** UI 6.3 "annual balance": the posted balance today. */
export function BalanceCell({ employeeId }: { employeeId: string }) {
  const lang = useLang();
  const person = usePerson(employeeId);
  if (!person) {
    return null;
  }
  return <span className="tabular-nums">{formatDays(person.balance, lang)}</span>;
}
```

At the end of `frontend/src/features/employees/peopleColumns.tsx`, add the import with the other imports and the two registrations as the last statements of the file, the way plan 03b added its column:

```tsx
import { BalanceCell, TodayCell } from "@/features/home/PeopleCells";
```

```tsx
PEOPLE_COLUMNS.push({
  id: "today",
  headerKey: "home:people.today",
  order: 30,
  cell: (row) => <TodayCell employeeId={row.public_id} />,
});

PEOPLE_COLUMNS.push({
  id: "balance",
  headerKey: "home:people.balance",
  order: 40,
  cell: (row) => <BalanceCell employeeId={row.public_id} />,
});
```

The table now has five columns; `DataTable` accepts six (M4).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/features/home/PeopleCells.test.tsx src/i18n/parity.test.ts`
Expected: 7 passed in `PeopleCells.test.tsx` (one test parametrised three times, and four others); the parity test passes.

Run: `docker compose run --rm web npx vitest run src/features/employees src/features/requests`
Expected: PASS. Where a test of plan 02 or 03b compares the exact list of column headers of the People table, add "Aujourd'hui" and "Solde annuel" between "Poste" and "Demandes en attente" in its expected list and change nothing else. The rows need no new handler: the default answer of Task 13, Step 2 serves `home/team`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/home frontend/src/features/employees frontend/src/i18n
git commit -m "feat(home): presence today and annual balance in the People list"
```

---

### Task 15: The Overview home (frontend)

UI 8.1. Four blocks, no action of any kind (UI 8: the workspace is read-only). Numbers are shown as numbers, with no chart (M9).

| Block | Content | When empty |
|---|---|---|
| Out now | How many people are out today; per department, who is out today and who will be before Sunday, as "Absent" or "Remote" | One line |
| Absence this month | Per department: days of absence this month and last month | Always has a line per department |
| Leave owed | Total annual balance per department; the largest individual balances | One line for the largest |
| Waiting | The requests undecided for longest: who, what, waiting on whom, since when; each opens the request | One line |

**Files:**
- Create: `frontend/src/features/home/OverviewHomePage.tsx`
- Modify: `frontend/src/i18n/locales/fr/home.json`, `frontend/src/i18n/locales/en/home.json` (keys added)
- Modify: `frontend/src/app/homes.ts` (one line added)
- Test: `frontend/src/features/home/OverviewHomePage.test.tsx`

**Interfaces:**
- Consumes: `useOverviewHome`, `OverviewHome` (Task 12); `Block`, `PageHeader`, `PageLoading` from `@/components`; `formatDateRange`, `formatDateTime`, `formatDays` from `@/lib/format`; `useLang`; the `calendar` namespace keys `label.absent`, `label.remote` (Task 9); the page `/requests/:id` (plan 03b, which shows an executive the overview's view).
- Produces: `features/home/OverviewHomePage.tsx`, default export, registered as `HOMES.overview`.

- [ ] **Step 1: Add the texts**

Add the `overview` object to `frontend/src/i18n/locales/fr/home.json`:

```json
{
  "overview": {
    "title": "Vue d'ensemble",
    "outNow": {
      "title": "Absents en ce moment",
      "empty": "Tout le monde est présent cette semaine.",
      "count_one": "{{count}} personne absente ou en télétravail aujourd'hui",
      "count_other": "{{count}} personnes absentes ou en télétravail aujourd'hui",
      "today": "Aujourd'hui",
      "week": "D'ici dimanche"
    },
    "absence": {
      "title": "Absences ce mois-ci",
      "department": "Département",
      "thisMonth": "Ce mois-ci",
      "previousMonth": "Mois précédent"
    },
    "leaveOwed": {
      "title": "Congés acquis",
      "largest": "Soldes les plus élevés",
      "empty": "Aucun solde positif."
    },
    "waiting": {
      "title": "En attente",
      "empty": "Aucune demande n'attend de décision.",
      "on": "en attente de {{who}}",
      "since": "depuis le {{date}}"
    }
  }
}
```

And to `frontend/src/i18n/locales/en/home.json`:

```json
{
  "overview": {
    "title": "Overview",
    "outNow": {
      "title": "Out now",
      "empty": "Everybody is in this week.",
      "count_one": "{{count}} person absent or remote today",
      "count_other": "{{count}} people absent or remote today",
      "today": "Today",
      "week": "Before Sunday"
    },
    "absence": {
      "title": "Absence this month",
      "department": "Department",
      "thisMonth": "This month",
      "previousMonth": "Previous month"
    },
    "leaveOwed": {
      "title": "Leave owed",
      "largest": "Largest balances",
      "empty": "No positive balance."
    },
    "waiting": {
      "title": "Waiting",
      "empty": "No request is waiting for a decision.",
      "on": "waiting for {{who}}",
      "since": "since {{date}}"
    }
  }
}
```

- [ ] **Step 2: Write the failing tests**

```tsx
// frontend/src/features/home/OverviewHomePage.test.tsx
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import type { OverviewHome } from "./api";
import OverviewHomePage from "./OverviewHomePage";

const full: OverviewHome = {
  out_now: [
    { department: "Souscription",
      today: [{ name: "Sana Trabelsi", label: "absent", start_date: "2026-11-02", end_date: "2026-11-03" }],
      week: [{ name: "Sana Trabelsi", label: "absent", start_date: "2026-11-02", end_date: "2026-11-03" }] },
    { department: "Sinistres", today: [],
      week: [{ name: "Karim Gharbi", label: "remote", start_date: "2026-11-05", end_date: "2026-11-05" }] },
  ],
  absence_this_month: [
    { department: "Souscription", days: "2.00", previous_days: "1.50" },
    { department: "Sinistres", days: "0.50", previous_days: "0.00" },
  ],
  leave_owed: {
    departments: [{ department: "Souscription", total: "25.00" }, { department: "Sinistres", total: "12.00" }],
    largest: [{ name: "Amine Jaziri", department: "Souscription", balance: "20.00" },
              { name: "Karim Gharbi", department: "Sinistres", balance: "12.00" }],
  },
  waiting: [{ request_public_id: "r7", employee_name: "Amine Jaziri", type_name: "Congé annuel",
              waiting_on: ["Sami Ben Ali"], since: "2026-10-28T09:12:00+01:00" }],
};

const quiet: OverviewHome = {
  out_now: [],
  absence_this_month: [{ department: "Souscription", days: "0.00", previous_days: "0.00" }],
  leave_owed: { departments: [{ department: "Souscription", total: "0.00" }], largest: [] },
  waiting: [],
};

function show(data: OverviewHome) {
  server.use(http.get("/api/v1/home/overview", () => HttpResponse.json(data)));
  renderApp(<OverviewHomePage />, { route: "/overview", path: "/overview", me: makeMe({ roles: ["employee", "exec"] }) });
}

const block = (name: string) => screen.findByRole("region", { name });
const blockTitles = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

describe("OverviewHomePage", () => {
  it("has four blocks and no action at all", async () => {
    show(full);

    await block("Absents en ce moment");
    expect(blockTitles()).toEqual(["Absents en ce moment", "Absences ce mois-ci", "Congés acquis", "En attente"]);
    expect(screen.getByRole("heading", { level: 1, name: "Vue d'ensemble" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Nouvelle demande/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();          // no chart
  });

  it("says who is out today and who will be before Sunday, by department, with labels only", async () => {
    show(full);

    const out = await block("Absents en ce moment");
    expect(within(out).getByText("1 personne absente ou en télétravail aujourd'hui")).toBeInTheDocument();
    const [underwriting, claims] = within(out).getAllByRole("group");
    expect(underwriting).toHaveAccessibleName("Souscription");
    expect(underwriting).toHaveTextContent("Aujourd'hui : Sana Trabelsi · Absent(e)");
    expect(underwriting).not.toHaveTextContent("D'ici dimanche");            // nobody else later this week
    expect(claims).toHaveAccessibleName("Sinistres");
    expect(claims).toHaveTextContent("D'ici dimanche : Karim Gharbi · Télétravail, 5 nov. 2026");
    expect(claims).not.toHaveTextContent("Aujourd'hui");
  });

  it("gives the days of absence per department for this month and the last", async () => {
    show(full);

    const table = within(await block("Absences ce mois-ci")).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Département", "Ce mois-ci", "Mois précédent"]);
    const [, underwriting, claims] = within(table).getAllByRole("row");
    expect(within(underwriting).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["2 jours", "1,5 jour"]);
    expect(within(underwriting).getByRole("rowheader")).toHaveTextContent("Souscription");
    expect(within(claims).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["0,5 jour", "0 jour"]);
  });

  it("totals the leave owed per department and names the largest balances", async () => {
    show(full);

    const owed = await block("Congés acquis");
    expect(owed).toHaveTextContent("Souscription25 jours");
    expect(owed).toHaveTextContent("Sinistres12 jours");
    const largest = within(owed).getByRole("list", { name: "Soldes les plus élevés" });
    expect(within(largest).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Amine Jaziri, Souscription20 jours", "Karim Gharbi, Sinistres12 jours",
    ]);
  });

  it("lists what has waited longest, each line opening its request", async () => {
    show(full);

    const waiting = await block("En attente");
    const link = within(waiting).getByRole("link", { name: /Amine Jaziri/ });
    expect(link).toHaveAttribute("href", "/requests/r7");
    expect(link).toHaveTextContent("Amine Jaziri, Congé annuel");
    expect(waiting).toHaveTextContent("en attente de Sami Ben Ali");
    expect(waiting).toHaveTextContent("depuis le 28 oct. 2026 à 09:12");
  });

  it("shrinks every empty block to one line", async () => {
    show(quiet);

    expect(within(await block("Absents en ce moment")).getByText("Tout le monde est présent cette semaine.")).toBeInTheDocument();
    expect(within(await block("Congés acquis")).getByText("Aucun solde positif.")).toBeInTheDocument();
    expect(within(await block("En attente")).getByText("Aucune demande n'attend de décision.")).toBeInTheDocument();
    expect(blockTitles()).toHaveLength(4);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/features/home/OverviewHomePage.test.tsx`
Expected: FAIL: `Failed to resolve import "./OverviewHomePage"`.

- [ ] **Step 4: Write the page and register it**

```tsx
// frontend/src/features/home/OverviewHomePage.tsx
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Block, PageHeader, PageLoading } from "@/components";
import { useLang } from "@/i18n";
import { formatDateRange, formatDateTime, formatDays } from "@/lib/format";

import { useOverviewHome, type OverviewHome } from "./api";

type OutDepartment = OverviewHome["out_now"][number];
type OutName = OutDepartment["week"][number];

const QUIET = "text-body text-muted-foreground";

function OutDepartmentLines({ group }: { group: OutDepartment }) {
  const { t } = useTranslation("home");
  const lang = useLang();
  const id = useId();
  const label = (person: OutName) => t(`label.${person.label}`, { ns: "calendar" });
  const today = new Set(group.today.map((person) => `${person.name}|${person.start_date}`));
  const later = group.week.filter((person) => !today.has(`${person.name}|${person.start_date}`));

  return (
    <div role="group" aria-labelledby={id} className="py-3">
      <h3 id={id} className="text-body font-semibold text-foreground">{group.department}</h3>
      {group.today.length > 0 ? (
        <p className="text-body text-text-secondary">
          {t("overview.outNow.today")}
          {" : "}
          {group.today.map((person) => `${person.name} · ${label(person)}`).join(" ; ")}
        </p>
      ) : null}
      {later.length > 0 ? (
        <p className="text-body text-text-secondary">
          {t("overview.outNow.week")}
          {" : "}
          {later.map((person) => `${person.name} · ${label(person)}, ${formatDateRange(person.start_date, person.end_date, lang)}`).join(" ; ")}
        </p>
      ) : null}
    </div>
  );
}

/** /overview : how the company is doing on absence, and whether anything is stuck (UI 8.1). Read-only. */
export default function OverviewHomePage() {
  const { t } = useTranslation("home");
  const lang = useLang();
  const largestId = useId();
  const home = useOverviewHome();
  if (home.isPending) {
    return <PageLoading />;
  }
  if (home.error) {
    throw home.error;
  }
  const data = home.data;

  return (
    <div className="space-y-4">
      <PageHeader title={t("overview.title")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Block title={t("overview.outNow.title")}>
          {data.out_now.length === 0 ? (
            <p className={QUIET}>{t("overview.outNow.empty")}</p>
          ) : (
            <>
              <p className="text-body font-semibold text-foreground">
                {t("overview.outNow.count", { count: data.out_now.reduce((total, group) => total + group.today.length, 0) })}
              </p>
              <div className="mt-1 divide-y divide-divider">
                {data.out_now.map((group) => <OutDepartmentLines key={group.department} group={group} />)}
              </div>
            </>
          )}
        </Block>

        <Block title={t("overview.absence.title")}>
          <table className="w-full text-left text-body">
            <thead>
              <tr className="text-caption text-muted-foreground">
                <th scope="col" className="py-2 font-medium">{t("overview.absence.department")}</th>
                <th scope="col" className="py-2 text-right font-medium">{t("overview.absence.thisMonth")}</th>
                <th scope="col" className="py-2 text-right font-medium">{t("overview.absence.previousMonth")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {data.absence_this_month.map((line) => (
                <tr key={line.department}>
                  <th scope="row" className="py-2 font-medium text-foreground">{line.department}</th>
                  <td className="py-2 text-right font-semibold tabular-nums text-foreground">{formatDays(line.days, lang)}</td>
                  <td className="py-2 text-right tabular-nums text-text-secondary">{formatDays(line.previous_days, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>

        <Block title={t("overview.leaveOwed.title")}>
          <ul className="divide-y divide-divider">
            {data.leave_owed.departments.map((line) => (
              <li key={line.department} className="flex items-center justify-between py-2 text-body">
                <span className="font-medium text-foreground">{line.department}</span>
                <span className="font-semibold tabular-nums text-foreground">{formatDays(line.total, lang)}</span>
              </li>
            ))}
          </ul>
          <h3 id={largestId} className="mt-4 text-caption font-medium text-muted-foreground">{t("overview.leaveOwed.largest")}</h3>
          {data.leave_owed.largest.length === 0 ? (
            <p className={QUIET}>{t("overview.leaveOwed.empty")}</p>
          ) : (
            <ul aria-labelledby={largestId} className="divide-y divide-divider">
              {data.leave_owed.largest.map((person) => (
                <li key={`${person.name}-${person.department}`} className="flex items-center justify-between py-2 text-body">
                  <span className="text-foreground">{`${person.name}, ${person.department}`}</span>
                  <span className="tabular-nums text-text-secondary">{formatDays(person.balance, lang)}</span>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title={t("overview.waiting.title")}>
          {data.waiting.length === 0 ? (
            <p className={QUIET}>{t("overview.waiting.empty")}</p>
          ) : (
            <ul className="divide-y divide-divider">
              {data.waiting.map((line) => (
                <li key={line.request_public_id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <Link to={`/requests/${line.request_public_id}`} className="text-body font-semibold text-foreground hover:underline">
                    {`${line.employee_name}, ${line.type_name}`}
                  </Link>
                  <span className="text-body text-text-secondary">
                    {[
                      line.waiting_on.length > 0 ? t("overview.waiting.on", { who: line.waiting_on.join(", ") }) : null,
                      line.since ? t("overview.waiting.since", { date: formatDateTime(line.since, lang) }) : null,
                    ].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>
    </div>
  );
}
```

Add this line inside the `HOMES` object of `frontend/src/app/homes.ts`:

```ts
  overview: lazy(() => import("@/features/home/OverviewHomePage")),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/features/home src/i18n/parity.test.ts`
Expected: `OverviewHomePage.test.tsx` 6 passed; the other home tests and the parity test still pass.

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no error.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/home frontend/src/app/homes.ts frontend/src/i18n
git commit -m "feat(home): read-only Overview home"
```

---

### Task 16: Switcher counts (frontend)

Plan 01b's switcher shows the numbers returned by `useWorkspaceCounts()`, which so far returns `{}`. This task replaces the file, as plan 01b's contract note 11 asks, so the hook reads `workspaces/summary`. The numbers are read again every minute, when the window regains focus, and after every successful action anywhere in the application, so a manager who approves a request sees "My team: 3" become "My team: 2" without reloading (U7).

**Files:**
- Modify: `frontend/src/features/shell/workspaceCounts.ts` (whole file replaced)
- Modify: `frontend/src/test/handlers.ts` (one default answer appended)
- Test: `frontend/src/features/shell/workspaceCounts.test.tsx`

**Interfaces:**
- Consumes: the generated path `/api/v1/workspaces/summary` and the type `WorkspaceSummary` of `@/api/types` (Task 12); `WorkspaceId` from `@/app/workspaces`; `problemResponse` from `@/test/fixtures`.
- Produces (unchanged signature, master 9.3):

```ts
export const workspaceCountKeys: { summary: readonly ["workspaces", "summary"] };
export function useWorkspaceCounts(): Partial<Record<WorkspaceId, number>>;
```

- [ ] **Step 1: Give every test a quiet summary**

Every test that draws the shell now asks for the summary. Append this default answer to the `handlers` array of `frontend/src/test/handlers.ts`:

```ts
  http.get("/api/v1/workspaces/summary", () => HttpResponse.json({ me: 0, team: 0, hr: 0, overview: 0, admin: 0 })),
```

- [ ] **Step 2: Write the failing tests**

```tsx
// frontend/src/features/shell/workspaceCounts.test.tsx
import { useMutation } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { makeMe, problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { useWorkspaceCounts } from "./workspaceCounts";

function Probe() {
  const counts = useWorkspaceCounts();
  const action = useMutation({ mutationFn: async () => "done" });
  const failing = useMutation({ mutationFn: async () => { throw new Error("refused"); } });
  return (
    <div>
      <output data-testid="counts">{JSON.stringify(counts)}</output>
      <button type="button" onClick={() => action.mutate()}>act</button>
      <button type="button" onClick={() => failing.mutate()}>fail</button>
    </div>
  );
}

const me = makeMe({ roles: ["employee", "manager"] });
const counts = () => screen.getByTestId("counts");
const open = () => renderApp(<Probe />, { route: "/team", path: "/team", me });

/** Serves the summary and counts how often it was read; the team count goes down after the first read. */
function serveSummary() {
  let reads = 0;
  server.use(http.get("/api/v1/workspaces/summary", () => {
    reads += 1;
    return HttpResponse.json({ me: 0, team: reads === 1 ? 3 : 2, hr: 0, overview: 0, admin: 0 });
  }));
  return () => reads;
}

describe("useWorkspaceCounts", () => {
  it("is empty until the server answers, then holds the five numbers", async () => {
    server.use(http.get("/api/v1/workspaces/summary", () => HttpResponse.json({ me: 1, team: 3, hr: 0, overview: 0, admin: 0 })));
    open();

    expect(counts()).toHaveTextContent("{}");
    await waitFor(() => expect(counts()).toHaveTextContent('{"me":1,"team":3,"hr":0,"overview":0,"admin":0}'));
  });

  it("reads the numbers again after a successful action", async () => {
    const user = userEvent.setup();
    const reads = serveSummary();
    open();
    await waitFor(() => expect(counts()).toHaveTextContent('"team":3'));

    await user.click(screen.getByRole("button", { name: "act" }));

    await waitFor(() => expect(counts()).toHaveTextContent('"team":2'));
    expect(reads()).toBe(2);
  });

  it("does not read again after an action that failed", async () => {
    const user = userEvent.setup();
    const reads = serveSummary();
    open();
    await waitFor(() => expect(counts()).toHaveTextContent('"team":3'));

    await user.click(screen.getByRole("button", { name: "fail" }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(reads()).toBe(1);
    expect(counts()).toHaveTextContent('"team":3');
  });

  it("stays empty when the server refuses", async () => {
    server.use(http.get("/api/v1/workspaces/summary", () =>
      problemResponse(403, "auth.password_change_required", "Choisissez un nouveau mot de passe.")));
    open();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(counts()).toHaveTextContent("{}");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose run --rm web npx vitest run src/features/shell/workspaceCounts.test.tsx`
Expected: FAIL on the first three tests: the counts stay `{}` (plan 01b's hook returns an empty object and calls no endpoint).

- [ ] **Step 4: Replace the file**

```ts
// frontend/src/features/shell/workspaceCounts.ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { api, call } from "@/api/client";
import type { WorkspaceSummary } from "@/api/types";
import type { WorkspaceId } from "@/app/workspaces";

export const workspaceCountKeys = {
  summary: ["workspaces", "summary"] as const,
};

/** How many things wait in each workspace, for the switcher (UI 3.2). Empty until the server has answered. */
export function useWorkspaceCounts(): Partial<Record<WorkspaceId, number>> {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: workspaceCountKeys.summary,
    queryFn: async (): Promise<WorkspaceSummary> => call(api.GET("/api/v1/workspaces/summary")),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  // Any action that succeeded, in any feature, may have changed what waits somewhere.
  useEffect(() => {
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") {
        void queryClient.invalidateQueries({ queryKey: workspaceCountKeys.summary });
      }
    });
  }, [queryClient]);

  return data ?? {};
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose run --rm web npx vitest run src/features/shell src/app`
Expected: the 4 tests of `workspaceCounts.test.tsx` pass, and plan 01b's shell and navigation tests still pass (the hook's signature is unchanged; the default answer of Step 1 serves them).

Run: `docker compose run --rm web npm run typecheck`
Expected: no error. `event.action.type === "success"` is the TanStack Query v5 mutation-cache event of a mutation that succeeded; if the installed version types the event differently, `frontend/node_modules/@tanstack/query-core/build/modern/mutationCache.d.ts` (`MutationCacheNotifyEvent`) shows the shape to match.

- [ ] **Step 6: Look at the switcher**

With the dev stack up and `docker compose exec app python manage.py e2e_reset` run, sign in as `manager.a@impactrisks.com`: the switcher shows 1 next to My team (the request of Amal Employee). Approve that request from the queue: the number goes without a reload, the request leaves the queue, and the People list still shows her as "Présent(e)" with her balance.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/shell/workspaceCounts.ts frontend/src/features/shell/workspaceCounts.test.tsx frontend/src/test/handlers.ts
git commit -m "feat(shell): workspace switcher counts from workspaces/summary"
```

---

### Task 17: Browser journeys and the final check

Three journeys against the demo data (Task 8 guards it): the privacy of the department calendar, the executive's "check that nothing is stuck" (UI 12), and the homes on a phone. Other journeys share the database and change it, so each assertion here holds whatever they did: it reads what the server holds first and then looks at the page.

**Files:**
- Create: `frontend/e2e/calendar-homes.ts`
- Create: `frontend/e2e/calendar-privacy.spec.ts`
- Create: `frontend/e2e/overview-nothing-stuck.spec.ts`
- Create: `frontend/e2e/homes-phone.spec.ts`

**Interfaces:**
- Consumes: `frontend/playwright.config.ts` and `e2e/global-setup.ts` (plan 01b: base URL `http://localhost:5173`, `e2e_reset` before the run, a desktop and a phone project); `signIn(page, email)` from `e2e/helpers.ts` (plan 01b; it fills the form in French and does not wait); the demo accounts of master 6.11; the demo data of plans 03a and 04.
- Produces: `enter(page, name)`, `readFeed(page, scope, extra?)` in `e2e/calendar-homes.ts`.

- [ ] **Step 1: Write the helper**

```ts
// frontend/e2e/calendar-homes.ts
import { expect, type Page } from "@playwright/test";

import { signIn } from "./helpers";

/** Sign in as a demo account ("employee.a1", "manager.a", "hr", "ceo") and wait until the session is open. */
export async function enter(page: Page, name: string): Promise<void> {
  await signIn(page, `${name}@impactrisks.com`);
  await expect(page).not.toHaveURL(/\/login/);
}

function iso(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface FeedEntry {
  employee: { public_id: string; name: string };
  start_date: string;
  label: string;
  type_code: string | null;
  type_name: string | null;
  status: string | null;
  request_public_id: string | null;
  mine: boolean;
}

/** The calendar feed for the next 30 days, read with the page's own session. */
export async function readFeed(page: Page, scope: string, extra = ""): Promise<{ entries: FeedEntry[] }> {
  const from = new Date();
  const to = new Date(from);
  to.setDate(to.getDate() + 30);
  const url = `/api/v1/calendar?from=${iso(from)}&to=${iso(to)}&scope=${scope}${extra}`;
  return page.evaluate(async (address) => (await fetch(address)).json(), url);
}
```

- [ ] **Step 2: Write the journeys**

```ts
// frontend/e2e/calendar-privacy.spec.ts
import { expect, test } from "@playwright/test";

import { enter, readFeed } from "./calendar-homes";

test.describe("department calendar privacy", () => {
  test("an employee sees a colleague as absent, never why", async ({ page }) => {
    await enter(page, "employee.a1");

    // What the server sends, even when asked for a type: the manager of the department has approved leave.
    const feed = await readFeed(page, "department", "&type=annual&status=approved");
    const colleagues = feed.entries.filter((entry) => !entry.mine);
    expect(colleagues.length).toBeGreaterThan(0);
    for (const entry of colleagues) {
      expect(["absent", "remote"]).toContain(entry.label);
      expect(entry.type_code).toBeNull();
      expect(entry.type_name).toBeNull();
      expect(entry.status).toBeNull();
      expect(entry.request_public_id).toBeNull();
    }

    // What the page shows on the day that colleague is away.
    const away = colleagues.find((entry) => entry.label === "absent") ?? colleagues[0];
    await page.goto(`/me/calendar?date=${away.start_date}`);
    const chip = page.locator("span, a").filter({ hasText: away.employee.name }).filter({ hasText: /Absent|Télétravail/ }).first();
    await expect(chip).toBeVisible();
    await expect(chip).not.toContainText(/annuel|maladie|exceptionnel/i);
    await expect(page.getByRole("link", { name: new RegExp(away.employee.name) })).toHaveCount(0);
  });

  test("the manager of that colleague sees the type", async ({ page }) => {
    await enter(page, "ceo");

    const feed = await readFeed(page, "team");
    const leave = feed.entries.find((entry) => entry.type_code === "annual" && entry.status === "approved");
    expect(leave).toBeTruthy();

    await page.goto(`/team/calendar?date=${leave!.start_date}`);
    await expect(page.getByText(new RegExp(`${leave!.employee.name} · ${leave!.type_name}`)).first()).toBeVisible();
  });

  test("an employee is refused the team and company calendars", async ({ page }) => {
    await enter(page, "employee.a1");
    for (const scope of ["team", "company"]) {
      const status = await page.evaluate(async (address) => (await fetch(address)).status,
        `/api/v1/calendar?from=2026-01-01&to=2026-01-31&scope=${scope}`);
      expect(status).toBe(403);
    }
  });
});
```

```ts
// frontend/e2e/overview-nothing-stuck.spec.ts
import { expect, test } from "@playwright/test";

import { enter } from "./calendar-homes";

const BLOCKS = [/Absents en ce moment/, /Absences ce mois-ci/, /Congés acquis/, /En attente/];

test("an executive checks that nothing is stuck", async ({ page }) => {
  await enter(page, "ceo");
  await page.goto("/overview");

  // The four blocks of the Overview home, and nothing to act on in any of them.
  for (const name of BLOCKS) {
    const block = page.getByRole("region", { name });
    await expect(block).toBeVisible();
    await expect(block.getByRole("button")).toHaveCount(0);
  }

  // The Waiting block lists requests, oldest first, or says that nothing waits.
  const waiting = page.getByRole("region", { name: /En attente/ });
  const lines = waiting.getByRole("link");
  await expect(lines.first().or(waiting.getByText("Aucune demande n'attend de décision."))).toBeVisible();

  if ((await lines.count()) > 0) {
    // Opening a line shows the request. Under Overview it is read-only.
    await lines.first().click();
    await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}/);
    if (page.url().includes("/overview/")) {
      await expect(page.getByRole("button", { name: /approuver|refuser|renvoyer/i })).toHaveCount(0);
    }
  }
});
```

```ts
// frontend/e2e/homes-phone.spec.ts
import { expect, test, type Page } from "@playwright/test";

import { enter } from "./calendar-homes";

test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 768, "phone project only");

async function expectNoSidewaysScroll(page: Page) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
}

test("the My space home fits a phone: the balance first, New request within reach", async ({ page }) => {
  await enter(page, "employee.a1");
  await page.goto("/me");

  const balance = page.getByRole("region", { name: "Solde" });
  await expect(balance).toBeVisible();
  await expect(balance.getByText(/^\d+(,\d+)? jours?$/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Nouvelle demande" }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "En cours" })).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("the My team home shows who is out on a phone", async ({ page }) => {
  await enter(page, "manager.a");
  await page.goto("/team");

  const out = page.getByRole("region", { name: "Absents et télétravail" });
  await expect(out.getByRole("listitem").first().or(out.getByText("Toute l'équipe est présente ces sept prochains jours."))).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("the calendar is an agenda on a phone", async ({ page }) => {
  await enter(page, "employee.a1");
  await page.goto("/me/calendar");

  await expect(page.getByRole("button", { name: "Période suivante" })).toBeVisible();
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expectNoSidewaysScroll(page);
});
```

- [ ] **Step 3: Run the journeys**

Run: `docker compose up -d`, then `cd frontend; npx playwright test e2e/calendar-privacy.spec.ts e2e/overview-nothing-stuck.spec.ts e2e/homes-phone.spec.ts`
Expected: every test passes in the desktop project; the three tests of `homes-phone.spec.ts` are skipped there and pass in the phone project.

A failure in a journey is a defect in the page or the endpoint it exercises, and is fixed in that code with a unit test that reproduces it (in the task that owns the code), not by loosening the journey. The one legitimate adjustment here is a label, if an earlier plan worded a control differently.

- [ ] **Step 4: Run everything**

Run: `docker compose run --rm app pytest -q`
Expected: all backend tests pass, including `tests/test_permission_matrix.py`, `tests/test_messages.py` and `tests/test_openapi.py`.

Run: `docker compose run --rm app ruff check . && docker compose run --rm app ruff format --check .`
Expected: no finding.

Run: `docker compose run --rm web npx vitest run`
Expected: all frontend tests pass, including `src/i18n/parity.test.ts`.

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no error.

Run: `cd frontend; npx playwright test`
Expected: the whole browser suite passes. The journeys of plans 01b to 04 open their pages by address or through the navigation and are not affected by the homes: after sign-in a person now lands on a home where there was a redirect to the first page of the workspace. If a journey of plan 03b waited for the Requests page right after sign-in, make it open `/me/requests` itself.

- [ ] **Step 5: Check the principles on each new page**

Open each page as its role, in French then in English, at desktop width and under 768px, and tick:

| Page | One primary action | Blocks, filters or columns within the limit | Nothing unusable shown | Keyboard reaches everything | No mixed language |
|---|---|---|---|---|---|
| `/me` | New request | 3 or 4 blocks | | | |
| `/me/calendar` | New request | No filter | | | |
| `/team` | Decide the oldest (only when something waits) | 2 or 3 blocks | | | |
| `/team/people` | None | 5 columns | | | |
| `/team/calendar` | None | 2 filters | | | |
| `/hr/calendar` | None | 2 filters visible, 2 one step away | | | |
| `/overview` | None | 4 blocks, no button | | | |
| `/overview/calendar` | None | As HR | | | |

Any cell that cannot be ticked is a defect: fix it in the task that owns the page before committing.

- [ ] **Step 6: Commit**

```bash
git add frontend/e2e/calendar-homes.ts frontend/e2e/calendar-privacy.spec.ts frontend/e2e/overview-nothing-stuck.spec.ts frontend/e2e/homes-phone.spec.ts
git commit -m "test(e2e): calendar privacy, executive overview and homes on a phone"
```

---

## Spec coverage

| Requirement or section | Tasks |
|---|---|
| CAL-02 month and week views, public holidays | 2, 3 (holidays in the feed); 9, 10 (views); 11 |
| CAL-03 department, "Absent" or "Remote" only, no hourly permission | 2, 3, 8, 10, 11, 17 |
| CAL-04 manager sees reports' requests with type, including pending | 2, 3, 11 |
| CAL-05 HR and Executive Management see the whole company with type | 2, 3, 11 |
| CAL-06 a pending request is visible only to requester, manager or delegate, HR, executives | 2 (department hides it; team includes delegated teams; company needs HR or EXEC), 8 |
| PRD 7, Calendar row of the permission matrix | 3 (matrix cases), 8 (sweep) |
| PRD 7, Balance row: a manager sees the team's balance | 5 (`people`), 14 |
| PRD 10, privacy: peers see "Absent", never the type | 2, 3, 8, 10, 17 |
| A9 hourly permissions not shown on colleagues' calendars | 2, 8 |
| PRD 5.7 Employee home | 4, 12 |
| PRD 5.7 Manager home (steps awaiting decision by plan 03b; team calendar; team balances; current delegation) | 5, 13, 14; calendar in 11 |
| PRD 5.7 HR home | Built by plan 03b (master D25); HR calendar in 11 |
| PRD 5.7 Executive home | 6, 15 |
| Master D19 home and switcher endpoints in `reports` | 4 to 7 |
| UI 3.2 switcher shows how many things wait per workspace | 7, 16 |
| UI 5.1 My space home | 4, 12 |
| UI 5.7 My space calendar, start a request from a day | 10, 11 |
| UI 6.1 My team home: Who is out, Delegation | 5, 13 |
| UI 6.3 People: today and annual balance | 5, 14 |
| UI 6.5 My team calendar, filters person and type | 11 |
| UI 7.10 HR calendar, filters department and person, then type and status | 11 |
| UI 8.1 Overview home | 6, 15 |
| UI 8.4 Overview calendar | 11 |
| UI M1, M3, M4, M5, M8, M9, M10 | 10 to 15 (tests on primary action, block count, absent blocks, no chart), 17 (step 5) |
| UI U7 new state without refresh | 9 and 12 (keys read again after a change to a request), 16 |
| UI U8 phone, keyboard, screen reader | 10 (grid keyboard pattern, labels, agenda), 17 |
| UI U9 French and English | 9, 12 to 15 (parity test), 3 and 5 to 6 (names in the reader's language) |
| UI 12 journey "Check that nothing is stuck" | 17 |
| NFR-02 response time | Each endpoint makes a bounded number of queries (the feed: one for spans, one for the directory, one for holidays); measured in plan 07 |

## Contract notes

Points where the master was silent, where this plan adds to it, or where it relies on what an earlier plan chose. None changes a name, route or access set the master fixes.

**Additions to the master**

1. **`home/team` carries a third key, `people`:** `[{public_id, today, balance}]`, one line per team member in name order, with `today` in `in`, `absent`, `remote` and `balance` the posted annual balance today. It feeds the two columns of the People list that no plan had built (UI 6.3; plan 04, contract note 17; plan 03b, note 23) from one read. `today` is `absent` when an approved absence covers today (a half-day counts), else `remote`, else `in`; on a day that is not a working day everybody is `in`. The columns `today` (order 30) and `balance` (order 40) are registered in plan 02's `PEOPLE_COLUMNS` by Task 14.
2. **`apps/requests/spans.py` is new** (`request_spans`, `absence_type_codes`). The master gives no selector that returns requests as date ranges with their type's calendar label, and `day_rows` cannot tell a single morning from a single afternoon. It sits inside the `requests` app, so no other app reads its tables. Plan 03a's `base_requests()` could serve the same purpose with filters applied by the caller; `request_spans` returns plain data instead of model instances.
3. **Shapes this plan defines** (the master gives only the top-level keys): `home/me.needs_you[]` is `{kind, request, due_at}` with `kind` in `returned`, `certificate_due`; `home/team.who_is_out[]` and `home/team.delegation` (one object `{direction, person, start_date, end_date}`; a delegation given wins over one received); the four values of `home/overview`. They are written out in Tasks 4 to 6.
4. **Counting rules of `workspaces/summary`:** `team` is plan 03a's queue `mine`; a step given by name to someone who is not a manager counts under `me`; `hr` counts distinct steps across its three queues plus profile changes to decide; `admin` counts three groups of plan 01a's `accounts_needing_attention` (locked, expired temporary password, employees without account; not accounts merely waiting for a first sign-in) plus jobs whose last run failed.
5. **Error codes:** `calendar.window_invalid` (a window of more than 100 days, or ending before it starts), `calendar.scope_unknown`, `calendar.scope_not_allowed`. **Operation ids:** `calendar_feed`, `home_me`, `home_team`, `home_overview`, `workspaces_summary`. **Enumeration names** added to `ENUM_NAME_OVERRIDES`: `CalendarEntryStatusEnum`, `CalendarScopeEnum`, `NeedsYouKindEnum`, `PresenceEnum`, `DelegationDirectionEnum`; every `label` field reuses plan 03a's `CalendarLabelEnum`.

**Rules chosen where the specs are silent**

6. **The feed carries no working week.** The calendar component treats Saturday and Sunday as days without entries, and a public holiday likewise. If HR changes the `working_week` setting, the feed needs one more field and `model.ts` one more parameter; that is a change to master 7.8.
7. **Scopes:** in `department` scope the user's own entries carry full detail, including pending requests and hourly permissions, and the server ignores every filter. `team` scope lists the team, not the manager's own requests. Only people with an active record appear. `who_is_out` covers today and the seven days after.
8. **Overview figures:** "absence this month" counts the whole calendar month, approved absences only, in working days as counted today (plan 03a, note 28); "leave owed" is the posted balance today of people with an active record; "waiting" is plan 03a's `waiting_rows`, the five oldest.

**How this plan sits on the earlier ones**

9. **No demo data is added.** The journeys use plan 03a's demo requests and plan 04's demo balances; Task 8 has a test that says which three facts they rely on (a request waiting for a manager, somebody of a team out within seven days, an approved absence in the department of `employee.a1`).
10. **Refresh after an action.** `calendarKeys.all` and `homeKeys.all` are pushed to plan 03b's `AFFECTED_KEYS` (its note 7). The switcher counts are not: they listen to the mutation cache instead, because actions outside the request feature (a profile change decided, an account unlocked) change them too.
11. **Types.** Everything is derived from the generated schema in `@/api/types`, as plan 01b asks, except the requests of the My space home, which are typed with plan 03b's hand-written `RequestOut` (the type `StatusSentence` takes) through one cast in `features/home/api.ts`. When plan 03b's types are replaced by derived ones (its note 1), the cast goes.
12. **`TeamHomePage` renders plan 03b's `ToDecidePage`** and adds two blocks under it; `HOMES.team` points to it. `ToDecidePage` and its tests are unchanged.
13. **Shared test files touched:** `frontend/src/test/handlers.ts` gains default answers for `home/team` and `workspaces/summary` (as plan 02 did for its route); `backend/tests/request_flows.py` is new and only wraps plan 03a's helpers. Tests of plans 02 and 03b that compare the exact column headers of the People table need the two new names (plan 03b's note 10 foresaw it).
14. **`/me/requests/new?start=YYYY-MM-DD`.** Starting a request from a day of the calendar links to the new-request page with a `start` parameter. Plan 03b's form does not read it, so the form opens empty, which is harmless; reading it is a small addition to that form.
15. **`features/calendar/dates.ts`** adds only what `lib/format.ts` lacks: weekday names, long day names and period titles. Dates, ranges and quantities on every page of this plan come from `lib/format.ts`.

**For the plans that follow**

16. **Plan 06:** `apps/reports/api/urls.py` exists with `app_name = "reports"`; append routes to its `urlpatterns`, cases to `CASES` in `apps/reports/tests/matrix.py` (`EVERY_EMPLOYEE` is defined there), serializers and views to the existing modules or to new ones. `apps.reports` has no model and no migration.
17. **Plan 07:** `apps/reports/tests/test_privacy_sweep.py` already calls the endpoints of this plan as every persona; the sweep of the whole API can import its scenario. The calendar grid follows the WAI-ARIA grid pattern and is a good first target for the accessibility scan.
18. **Master section 11** lists "05 (desk, calendar)" for the HR desk, while D25 and 9.4 give the desk to plan 03b. This plan follows D25: it builds the HR calendar only.
