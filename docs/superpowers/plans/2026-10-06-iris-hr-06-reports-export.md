# IRIS HR 06: Reports and KPMG Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** give managers, HR and Executive Management the six reports of the PRD, give HR the one-click KPMG export, and mount the activity log and the read-only Oversight pages.

**Architecture:** a `tabular` package inside the existing `reports` app turns the selectors of `requests`, `balances` and `organisation` into one result shape (`columns`, `rows`, `totals`) that is served as JSON or as a workbook. The KPMG export is one more builder on the same shape. The frontend has one generic report page driven by a small definition table, one export page, and Oversight routes that mount pages built by earlier plans with `readOnly`.

**Tech Stack:** Python 3.13, Django 5.2, Django REST Framework, drf-spectacular, openpyxl (through `apps.core.xlsx`), pytest-django, time-machine. React 19, TypeScript strict, Tailwind CSS v4, TanStack Query v5, React Router v7, react-i18next, openapi-fetch, Vitest, Testing Library, MSW v2, Playwright, exceljs (browser tests only).

**Spec:**

- `docs/superpowers/plans/2026-10-06-iris-hr-00-master-plan.md` (binding contract; sections 6, 7.11, 8, 9)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-prd-design.md` (5.8 REP-01 to REP-08, 5.10 AUD-02 and AUD-06, 7, assumptions A6 and A7)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-ui-design.md` (6.7, 7.11, 8.5, 8.6, 10.3, 12)

**Depends on:** plans 01a to 05, executed in order. This plan was aligned with their final text; "Contract notes" at the end lists what it takes from each.

## Global Constraints

Master plan section 2 applies in full. The constraints below bear directly on this plan and are copied from the specs.

- REP-01: "Reports, each filterable by period, department, employee and type, and exportable to Excel: absences taken; balances at a date; pending approvals with age; monthly permission hours; monthly remote days; outstanding certificates."
- REP-02: "Managers run reports limited to their reports. HR and Executive Management run them for everyone."
- REP-03: "KPMG export: HR sets filters (period, department, employee, type) and downloads one Excel file. There is no preview, approval or versioning step."
- REP-04: "The export has one row per employee: employee number, name, department, annual-leave days, sick-leave days, exceptional-leave days, permission hours, remote days, annual balance at period end, meal tickets."
- REP-05: "Only approved requests count. A request that crosses the period boundary contributes only the days inside the period."
- REP-06: "Meal tickets = base per month (21, a setting) minus one for each full working day absent on a type flagged as reducing tickets. Half-days do not reduce tickets. Default flags: annual, sick and exceptional leave reduce; remote work and permissions do not."
- REP-07: "The default period is the calendar month. If a cut-off day is set, the default period runs from the day after the previous cut-off to the cut-off."
- REP-08: "The export contains no comment and no medical detail. Each export is written to the audit trail with its filters."
- AUD-02: business events include "every report export".
- Permission matrix: Reports: Employee No, Manager Team, HR All, Executive All, System Administrator No. KPMG export: HR only. Business audit: HR and Executive read. Security audit: System Administrator and Executive read.
- UI 10.3: "Each report has its filters, a result table, totals where meaningful, and an Excel export of what is shown." and "In My team every report is limited to the manager's team and has no department filter."
- UI 8: "The whole workspace is read-only: it contains no editing action at all, so nothing appears disabled."
- UI 7.11 activity log: "Sick-leave comment content appears as "changed" only."
- UI M5: "At most three filters are visible. Others are one step away."
- NFR-06: "French and English throughout: interface, notifications, exports."
- Master 2: "An app never queries another app's tables. It calls that app's services or selectors."
- Master 2: "The sick-leave comment and medical attachments are visible only to the requester and HR: in every endpoint, list, history, notification, audit entry, report and export."
- Master D14: anonymous call 401; role not allowed 403; object outside the user's reach 404.
- Plan 01a, contract notes 3 and 4: services pass `actor=` to `audit.record`; every `@extend_schema` has a unique `operation_id`; a choice set used in a response has a name in `ENUM_NAME_OVERRIDES`; the OpenAPI command fails on any warning.
- Plan 01b, contract notes 6 to 9: pages use the shared components of `@/components` and the formats of `@/lib/format`; component tests run in French and a missing translation key is an error.

## Review Focus

The inputs most likely to hurt a person using what this plan builds. Each has a test in the task named.

1. **A request that crosses the period boundary.** Leave from 29 October to 3 November, with a public holiday inside it, exported for November must count exactly the November working days, in the absences report and in the KPMG file; remote days across New Year must fall in two years. Tests: Task 5 (`test_request_crossing_the_period_is_clipped`), Task 8 (`test_remote_days_across_new_year_are_split_between_the_two_years`), Task 11 (`test_november_matches_the_hand_calculation`).
2. **Two half-days on one day.** A morning of annual leave and an afternoon of sick leave on the same date are a full working day absent and cost one meal ticket; a single half-day costs none; a remote day costs none. Tests: Task 11 (`test_two_half_days_on_one_day_cost_one_ticket`, `test_a_single_half_day_and_remote_days_cost_nothing`).
3. **Medical detail in a file that leaves the company.** No sick-leave comment or certificate name may appear in any report, any workbook, or the audit entry of an export. Tests: Task 9 (`test_certificates_report_carries_no_medical_detail`), Task 11 (`test_export_contains_no_comment`, `test_export_audit_entry_holds_filters_only`), Task 12 (`test_no_report_shows_the_sick_leave_comment`).
4. **A manager with nobody, or asking for somebody else.** A manager whose team is empty must get an empty report, never the whole company; a manager who names another team's employee must get 404; a manager who passes a department filter is refused. Tests: Task 3 (`test_empty_team_yields_nobody`, `test_employee_outside_the_team_is_not_found`, `test_department_filter_is_refused_in_team_scope`), Task 5 (`test_empty_scope_never_queries_everyone`).
5. **An absurd or malformed period, and people at the edge of one.** End before start, a ten-year span, `2026-02-30`, a missing date, a cut-off day in January, someone hired after the period and someone who left before it must each produce a clear message or the right rows, never a 500 and never a silent default. Tests: Task 3 (`test_period_problems`), Task 11 (`test_default_period_with_a_cutoff_day`, `test_default_period_in_january`, `test_someone_hired_after_the_period_is_left_out`, `test_a_leaver_appears_until_the_period_of_the_leaving_date`).

## File Structure

Backend (all under `backend/`):

| File | Responsibility |
|---|---|
| `apps/reports/tabular/__init__.py` | `setup()`: registers messages and the two settings |
| `apps/reports/tabular/messages.py` | Every server text of this plan, French and English |
| `apps/reports/tabular/types.py` | `TypeFacts`, `type_facts()`: what reports need to know about request types |
| `apps/reports/tabular/framework.py` | `Column`, `TotalLine`, `ReportResult`, `Period`, `ReportParams`, `parse_params`, `resolve_scope`, `employees_in_scope`, `People` |
| `apps/reports/tabular/render.py` | `to_json`, `to_workbook` |
| `apps/reports/tabular/absences.py`, `balances.py`, `waiting.py`, `monthly.py`, `certificates.py` | One builder per report |
| `apps/reports/tabular/registry.py` | `REPORTS`, `run_report`, `export_report` (with the audit event), `filter_options` |
| `apps/reports/kpmg.py` | `default_period`, `months_covered`, `build_kpmg`, `export_kpmg` |
| `apps/reports/api/report_serializers.py`, `report_views.py` | The four endpoints of this plan |
| `apps/reports/api/urls.py` (modify: append) | Four routes |
| `apps/reports/apps.py` (modify) | `ready()` calls `tabular.setup()` |
| `config/settings.py` (modify) | Three entries in `ENUM_NAME_OVERRIDES` |
| `apps/reports/tests/scenario.py`, `conftest.py` | The hand-calculable November used by every test |
| `apps/reports/tests/test_tabular_*.py`, `test_kpmg.py`, `test_report_api.py` | Tests |
| `apps/reports/tests/matrix.py` (modify: append) | Permission cases |

Frontend (all under `frontend/`):

| File | Responsibility |
|---|---|
| `src/api/types.ts` (modify: append) | Types derived from the generated schema |
| `src/features/reports/api.ts` | Query hooks, addresses of the downloads |
| `src/features/reports/definitions.ts` | Which report has which filters and which workspaces |
| `src/features/reports/cells.ts` | One cell as text, by kind and language |
| `src/features/reports/download.ts` | `saveBlob` |
| `src/features/reports/ReportFilters.tsx` | The filters of a report, built from the shared filter controls |
| `src/features/reports/ReportTable.tsx` | The result table and its totals |
| `src/features/reports/ReportsIndexPage.tsx`, `ReportPage.tsx` | The two generic pages |
| `src/features/reports/KpmgExportPage.tsx` | The export page |
| `src/features/reports/ActivityLogPage.tsx`, `activity.ts` | The business audit with its people, kinds of event and kinds of item |
| `src/features/reports/oversight/*.tsx` | Oversight index, its two hubs, its frame and its routes |
| `src/i18n/locales/{fr,en}/reports.json` | Texts of this plan |
| `src/i18n/locales/{fr,en}/settings.json`, `audit.json` (modify: add keys) | Labels of the two settings; texts of the business audit actions |
| `src/workspaces/{team,hr,overview}/routes.tsx` (modify: append) | Routes |
| `e2e/kpmg-export.spec.ts`, `e2e/team-report.spec.ts` | Browser journeys |

The scenario every backend test uses (fixture `november`, built in Task 1). The clock is frozen at 1 December 2026, 09:00 Tunis. 3 November 2026 is a public holiday. The owner (Amal Employee, E004) has an opening balance of 20 days dated 30 September 2026. The real ledger is behind the request engine (`ledger_port`). No month-end credit is posted (`credit_start_date` is empty). Every request is entered by HR with an exception, so that dates in the past are accepted.

| Who | Request | Working days or hours | Inside November |
|---|---|---|---|
| owner | Annual leave, Thu 29 Oct to Tue 3 Nov | 29 Oct, 30 Oct, 2 Nov = 3 days (3 Nov is a holiday) | 1 day (2 Nov) |
| owner | Annual leave, Fri 13 Nov, morning | 0.5 day | 0.5 day |
| owner | Sick leave, Fri 13 Nov, afternoon, comment "Migraine, see Dr Karray" | 0.5 day | 0.5 day |
| owner | Remote work, Wed 18 to Thu 19 Nov | 2 days | 2 days |
| owner | Hourly permission, Tue 24 Nov, 09:00 to 11:30 | 2.5 hours | 2.5 hours |
| owner | Exceptional leave, Mon 30 Nov to Tue 1 Dec | 2 days | 1 day (30 Nov) |
| owner | Annual leave, Mon 9 to Tue 10 Nov, **pending** | not counted | not counted |
| outsider | Sick leave, Mon 9 to Wed 11 Nov | 3 days | 3 days |

Hand calculation for November 2026:

| Employee | Annual | Sick | Exceptional | Permission hours | Remote | Balance on 30 Nov | Meal tickets |
|---|---|---|---|---|---|---|---|
| owner | 1.5 | 0.5 | 1 | 2.5 | 2 | 20 − 3 − 0.5 = 16.5 | 21 − 3 = 18 (2 Nov; 13 Nov as two halves; 30 Nov) |
| outsider | 0 | 3 | 0 | 0 | 0 | 0 | 21 − 3 = 18 |
| everyone else | 0 | 0 | 0 | 0 | 0 | 0 | 21 |

---

### Task 1: Request type facts and the November scenario

Reports need a few facts about each request type (its unit, its calendar label, whether it reduces meal tickets) and its name in two languages. `reports` may not read the `requests` tables, so it reads them through plan 03a's selector `request_types` and keeps only what it needs. This task also builds the data every later test uses.

**Files:**
- Create: `backend/apps/reports/tabular/__init__.py` (a docstring only; Task 2 completes it)
- Create: `backend/apps/reports/tabular/types.py`
- Create: `backend/apps/reports/tests/scenario.py`
- Create: `backend/apps/reports/tests/conftest.py`
- Test: `backend/apps/reports/tests/test_tabular_types.py`, `backend/apps/reports/tests/test_scenario.py`

**Interfaces:**
- Consumes:
  - plan 03a: `apps.requests.selectors.request_types(*, active_only: bool) -> QuerySet[RequestType]`, `day_rows`; `apps.requests.services.RequestData`, `resolve_approvers(step) -> list[User]`, `decide_step`; the test helpers of `apps/requests/tests/helpers.py`: `approved(world, *, employee, actor, request_type, data, override_reason)`, `submitted(world, ...)` with the same options, `pending_step(request)`, `fresh(instance)`; `apps.calendar.services.create_holiday(*, actor, date, name_fr, name_en, recurs_yearly=False)`
  - plan 04: `apps.balances.services.post_opening(*, actor, employee, amount, effective_date, reason)`; the fixture `ledger_port` of `backend/conftest.py` (without it every test runs with the null balance port and nothing is posted to the ledger)
  - plan 01a: `apps.settings.services.clear_cache`; the cast `world` (master 6.11; plan 02 gives every cast employee the hire date 6 January 2020)
- Produces:
  - `apps.reports.tabular.types.TypeFacts` (frozen dataclass: `code`, `name_fr`, `name_en`, `unit`, `calendar_label`, `reduces_meal_tickets`; method `name(lang: str) -> str`)
  - `apps.reports.tabular.types.type_facts() -> dict[str, TypeFacts]`: every type, active or not, keyed by code, in display order
  - `apps.reports.tests.scenario`: `AFTER_NOVEMBER`, `SICK_COMMENT`, `approved(world, *, employee, request_type, start, end=None, **flags) -> Request`, `pending(world, *, employee, request_type, start, end=None, **flags) -> Request`, `approve_fully(request) -> Request`. `flags` are `RequestData` fields: `starts_at_midday`, `ends_at_midday`, `start_time`, `end_time`, `exceptional_event_id`, `comment`.
  - pytest fixture `november` (a `SimpleNamespace` with `annual_long`, `annual_half`, `sick_half`, `remote`, `permission`, `exceptional`, `pending_annual`, `outsider_sick`); the test body runs with the clock frozen at `2026-12-01 09:00` Africa/Tunis and with the real ledger

- [ ] **Step 1: Write the failing test for the type facts**

Create `backend/apps/reports/tests/test_tabular_types.py`:

```python
import pytest

from apps.reports.tabular.types import type_facts

pytestmark = pytest.mark.django_db


def test_type_facts_list_every_seeded_type(world):
    facts = type_facts()

    assert {"annual", "sick", "exceptional", "permission", "remote"} <= set(facts)
    assert facts["permission"].unit == "hour"
    assert facts["annual"].unit == "day"
    assert facts["remote"].calendar_label == "remote"


def test_type_facts_carry_the_meal_ticket_flag(world):
    facts = type_facts()

    assert facts["annual"].reduces_meal_tickets is True
    assert facts["sick"].reduces_meal_tickets is True
    assert facts["exceptional"].reduces_meal_tickets is True
    assert facts["remote"].reduces_meal_tickets is False
    assert facts["permission"].reduces_meal_tickets is False


def test_type_facts_name_follows_the_language(world):
    fact = type_facts()["annual"]

    assert fact.name("fr") == world.annual.name_fr
    assert fact.name("en") == world.annual.name_en
    assert fact.name("de") == world.annual.name_fr
```

- [ ] **Step 2: Run it to see it fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_types.py -v`
Expected: collection ERROR with `ModuleNotFoundError: No module named 'apps.reports.tabular'`

- [ ] **Step 3: Write the type facts**

Create `backend/apps/reports/tabular/__init__.py`:

```python
"""Tabular reports and the KPMG export (plan 06)."""
```

Create `backend/apps/reports/tabular/types.py`:

```python
"""What reports need to know about request types, read through the requests app's own selector."""

from __future__ import annotations

from dataclasses import dataclass

from apps.requests import selectors as request_selectors


@dataclass(frozen=True)
class TypeFacts:
    code: str
    name_fr: str
    name_en: str
    unit: str  # "day" | "hour"
    calendar_label: str  # "absent" | "remote" | "hidden"
    reduces_meal_tickets: bool

    def name(self, lang: str) -> str:
        return self.name_en if lang == "en" else self.name_fr


def type_facts() -> dict[str, TypeFacts]:
    """Every request type, active or not, keyed by code, in display order.

    Inactive types are kept: a report on last year must still name a type HR has since retired.
    """
    return {
        request_type.code: TypeFacts(
            code=request_type.code,
            name_fr=request_type.name_fr,
            name_en=request_type.name_en,
            unit=request_type.unit,
            calendar_label=request_type.calendar_label,
            reduces_meal_tickets=request_type.reduces_meal_tickets,
        )
        for request_type in request_selectors.request_types(active_only=False)
    }
```

- [ ] **Step 4: Run it to see it pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_types.py -v`
Expected: 3 passed

- [ ] **Step 5: Write the failing test for the scenario**

Create `backend/apps/reports/tests/test_scenario.py`:

```python
from datetime import date
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.balances import selectors as balance_selectors
from apps.requests import selectors as request_selectors

pytestmark = pytest.mark.django_db


def test_the_clock_is_frozen_after_november(november):
    assert timezone.localdate() == date(2026, 12, 1)


def test_every_scenario_request_reached_its_status(november):
    for name in ("annual_long", "annual_half", "sick_half", "remote", "permission", "exceptional", "outsider_sick"):
        assert getattr(november, name).status == "approved", name
    assert november.pending_annual.status == "pending"


def test_quantities_match_the_table_of_the_plan(november):
    assert november.annual_long.quantity == Decimal("3")  # 29 Oct, 30 Oct, 2 Nov; 3 Nov is a holiday
    assert november.annual_half.quantity == Decimal("0.5")
    assert november.sick_half.quantity == Decimal("0.5")
    assert november.remote.quantity == Decimal("2")
    assert november.permission.quantity == Decimal("2.5")
    assert november.exceptional.quantity == Decimal("2")
    assert november.outsider_sick.quantity == Decimal("3")


def test_the_real_ledger_is_behind_the_requests(world, november):
    # Opening 20, less the three days of the long leave and the half day of 13 November.
    assert balance_selectors.balance_on(world.owner.id, date(2026, 11, 30)) == Decimal("16.5")


def test_day_rows_see_the_scenario(world, november):
    rows = request_selectors.day_rows(
        start=date(2026, 11, 1), end=date(2026, 11, 30), statuses=["approved"], employee_ids=[world.owner.id]
    )

    days = sorted(row.day for row in rows)
    assert days[0] == date(2026, 11, 2)
    assert date(2026, 11, 3) not in days
    assert days[-1] == date(2026, 11, 30)
    assert sum(1 for row in rows if row.day == date(2026, 11, 13)) == 2
```

- [ ] **Step 6: Run it to see it fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_scenario.py -v`
Expected: ERROR with `fixture 'november' not found`

- [ ] **Step 7: Write the scenario helpers**

Create `backend/apps/reports/tests/scenario.py`. It adds to plan 03a's helpers only a call shape with dates and the HR exception that lets a test enter requests dated in the past.

```python
"""Requests for report tests: entered by HR with an exception, through plan 03a's helpers."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from apps.requests import services as request_services
from apps.requests.services import RequestData
from apps.requests.tests import helpers as request_helpers

AFTER_NOVEMBER = datetime(2026, 12, 1, 9, 0, tzinfo=ZoneInfo("Africa/Tunis"))
SICK_COMMENT = "Migraine, see Dr Karray"
EXCEPTION = "Scenario data"


def _options(world, employee, request_type, start: date, end: date | None, flags: dict) -> dict:
    return {
        "employee": employee,
        "actor": world.hr_user,
        "request_type": request_type,
        "data": RequestData(start_date=start, end_date=end or start, **flags),
        "override_reason": EXCEPTION,
    }


def approved(world, *, employee, request_type, start: date, end: date | None = None, **flags):
    """A request approved at every step by whoever may decide it. `flags` are RequestData fields."""
    return request_helpers.approved(world, **_options(world, employee, request_type, start, end, flags))


def pending(world, *, employee, request_type, start: date, end: date | None = None, **flags):
    """The same request, sent and left undecided."""
    return request_helpers.submitted(world, **_options(world, employee, request_type, start, end, flags))


def approve_fully(request):
    """Take a pending request through the rest of its chain."""
    current = request_helpers.fresh(request)
    while current.status == "pending":
        step = request_helpers.pending_step(current)
        approver = request_services.resolve_approvers(step)[0]
        current = request_services.decide_step(
            actor=approver, step=step, decision="approve", expected_version=current.version
        )
    return current
```

- [ ] **Step 8: Write the fixture**

Create `backend/apps/reports/tests/conftest.py`:

```python
from datetime import date, time
from decimal import Decimal
from types import SimpleNamespace

import pytest
import time_machine

from apps.balances import services as balance_services
from apps.calendar import services as calendar_services
from apps.reports.tests import scenario
from apps.settings import services as settings_service


@pytest.fixture
def november(world, ledger_port):
    """The hand-calculable November 2026 described at the top of plan 06, on the real ledger."""
    with time_machine.travel(scenario.AFTER_NOVEMBER, tick=False):
        settings_service.clear_cache()
        calendar_services.create_holiday(
            actor=world.hr_user, date=date(2026, 11, 3), name_fr="Jour férié de test", name_en="Test holiday"
        )
        balance_services.post_opening(
            actor=world.hr_user,
            employee=world.owner,
            amount=Decimal("20"),
            effective_date=date(2026, 9, 30),
            reason="Opening balance",
        )
        made = SimpleNamespace()
        made.annual_long = scenario.approved(
            world, employee=world.owner, request_type=world.annual, start=date(2026, 10, 29), end=date(2026, 11, 3)
        )
        made.annual_half = scenario.approved(
            world, employee=world.owner, request_type=world.annual, start=date(2026, 11, 13), ends_at_midday=True
        )
        made.sick_half = scenario.approved(
            world,
            employee=world.owner,
            request_type=world.sick,
            start=date(2026, 11, 13),
            starts_at_midday=True,
            comment=scenario.SICK_COMMENT,
        )
        made.remote = scenario.approved(
            world, employee=world.owner, request_type=world.remote, start=date(2026, 11, 18), end=date(2026, 11, 19)
        )
        made.permission = scenario.approved(
            world,
            employee=world.owner,
            request_type=world.permission,
            start=date(2026, 11, 24),
            start_time=time(9, 0),
            end_time=time(11, 30),
        )
        made.exceptional = scenario.approved(
            world,
            employee=world.owner,
            request_type=world.exceptional,
            start=date(2026, 11, 30),
            end=date(2026, 12, 1),
            exceptional_event_id=world.event.id,
        )
        made.pending_annual = scenario.pending(
            world, employee=world.owner, request_type=world.annual, start=date(2026, 11, 9), end=date(2026, 11, 10)
        )
        made.outsider_sick = scenario.approved(
            world, employee=world.outsider, request_type=world.sick, start=date(2026, 11, 9), end=date(2026, 11, 11)
        )
        yield made
    settings_service.clear_cache()
```

- [ ] **Step 9: Run it to see it pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_scenario.py apps/reports/tests/test_tabular_types.py -v`
Expected: 8 passed

If a scenario request is refused, the refusal names the rule (`request.<code>`). The HR exception lifts past dates, notice, limits, event days and balance (plan 03a, contract notes 22 and 25), and never an overlap: the morning and the afternoon of 13 November are two halves of one day, which the overlap rule allows.

- [ ] **Step 10: Commit**

```bash
git add backend/apps/reports/tabular backend/apps/reports/tests/scenario.py backend/apps/reports/tests/conftest.py backend/apps/reports/tests/test_tabular_types.py backend/apps/reports/tests/test_scenario.py
git commit -m "test(reports): request type facts and the November scenario"
```

---

### Task 2: Messages, settings and package setup

**Files:**
- Modify: `backend/apps/reports/tabular/__init__.py` (replace the docstring-only file of Task 1)
- Create: `backend/apps/reports/tabular/messages.py`
- Modify: `backend/apps/reports/apps.py` (a `ready()` method)
- Test: `backend/apps/reports/tests/test_tabular_setup.py`

**Interfaces:**
- Consumes: `apps.core.i18n.register_messages`, `translate`; `apps.settings.registry.SettingDef` (`key`, `group`, `kind`, `default`, `minimum`, `maximum`), `register`; `apps.settings.services.get`, `set_value`, `list_group`, `clear_cache`.
- Produces: `apps.reports.tabular.setup() -> None`; message codes `reports.*` (listed in full below); settings `meal_tickets_per_month` (hr, int, default 21, 0 to 31) and `export_cutoff_day` (hr, int_or_null, default null, 1 to 28).

- [ ] **Step 1: Write the failing test**

Create `backend/apps/reports/tests/test_tabular_setup.py`:

```python
import pytest

from apps.core.errors import DomainError
from apps.core.i18n import all_messages, translate
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db


def test_report_texts_exist_in_both_languages():
    assert translate("reports.title_absences", "fr") == "Absences prises"
    assert translate("reports.title_absences", "en") == "Absences taken"
    assert translate("reports.col_meal_tickets", "fr") == "Tickets restaurant"
    assert translate("reports.period_too_long", "en", days=731) == (
        "The period is longer than 731 days. Choose a shorter period."
    )


def test_every_month_has_a_label():
    codes = all_messages()
    for month in range(1, 13):
        assert f"reports.col_m{month:02d}" in codes


def test_the_two_settings_are_registered_with_their_defaults(world):
    settings_service.clear_cache()
    rows = {row.key: row for row in settings_service.list_group("hr")}

    assert rows["meal_tickets_per_month"].default == 21
    assert rows["export_cutoff_day"].default is None
    assert settings_service.get("meal_tickets_per_month") == 21
    assert settings_service.get("export_cutoff_day") is None


def test_cutoff_day_stays_inside_every_month(world):
    with pytest.raises(DomainError) as refused:
        settings_service.set_value(actor=world.hr_user, key="export_cutoff_day", value=29)
    assert refused.value.code == "settings.out_of_range"

    settings_service.set_value(actor=world.hr_user, key="export_cutoff_day", value=25)
    assert settings_service.get("export_cutoff_day") == 25

    settings_service.set_value(actor=world.hr_user, key="export_cutoff_day", value=None)
    assert settings_service.get("export_cutoff_day") is None
```

- [ ] **Step 2: Run it to see it fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_setup.py -v`
Expected: FAIL; the first test fails because `translate("reports.title_absences", "fr")` has no such code, the third with `KeyError: 'meal_tickets_per_month'`.

- [ ] **Step 3: Write the messages**

Create `backend/apps/reports/tabular/messages.py`:

```python
"""Server texts of reports and exports. Checked for language parity by backend/tests/test_messages.py."""

MESSAGES = {
    # problems
    "reports.unknown_report": {
        "en": "This report does not exist. Go back to the list of reports.",
        "fr": "Ce rapport n'existe pas. Revenez à la liste des rapports.",
    },
    "reports.hr_only": {
        "en": "This report is reserved for HR.",
        "fr": "Ce rapport est réservé aux RH.",
    },
    "reports.scope_not_allowed": {
        "en": "You cannot run this report for that group of people.",
        "fr": "Vous ne pouvez pas lancer ce rapport pour ce groupe de personnes.",
    },
    "reports.unknown_scope": {
        "en": "Choose your team or the whole company.",
        "fr": "Choisissez votre équipe ou toute l'entreprise.",
    },
    "reports.period_required": {
        "en": "Choose a start date and an end date.",
        "fr": "Choisissez une date de début et une date de fin.",
    },
    "reports.period_order": {
        "en": "The end date is before the start date. Choose an end date on or after the start.",
        "fr": "La date de fin précède la date de début. Choisissez une date de fin égale ou postérieure au début.",
    },
    "reports.period_too_long": {
        "en": "The period is longer than {days} days. Choose a shorter period.",
        "fr": "La période dépasse {days} jours. Choisissez une période plus courte.",
    },
    "reports.invalid_date": {
        "en": "This is not a valid date. Pick one from the calendar.",
        "fr": "Cette date n'est pas valide. Choisissez-en une dans le calendrier.",
    },
    "reports.invalid_year": {
        "en": "Choose a year between 2000 and 2100.",
        "fr": "Choisissez une année entre 2000 et 2100.",
    },
    "reports.invalid_filter": {
        "en": "This filter value is not valid. Pick one from the list.",
        "fr": "Cette valeur de filtre n'est pas valide. Choisissez-en une dans la liste.",
    },
    "reports.filter_not_available": {
        "en": "This filter is not available for this report. Remove it.",
        "fr": "Ce filtre n'est pas disponible pour ce rapport. Retirez-le.",
    },
    "reports.unknown_type": {
        "en": "This request type does not exist. Pick one from the list.",
        "fr": "Ce type de demande n'existe pas. Choisissez-en un dans la liste.",
    },
    "reports.unknown_step": {
        "en": "This step does not exist. Pick one from the list.",
        "fr": "Cette étape n'existe pas. Choisissez-en une dans la liste.",
    },
    "reports.employee_not_found": {
        "en": "This person is not available. Pick someone from the list.",
        "fr": "Cette personne n'est pas disponible. Choisissez quelqu'un dans la liste.",
    },
    "reports.nothing_to_export": {
        "en": "Nothing to export for this selection. Widen the period or remove a filter.",
        "fr": "Rien à exporter pour cette sélection. Élargissez la période ou retirez un filtre.",
    },
    # titles
    "reports.title_absences": {"en": "Absences taken", "fr": "Absences prises"},
    "reports.title_balances": {"en": "Balances at a date", "fr": "Soldes à une date"},
    "reports.title_waiting": {"en": "Requests waiting", "fr": "Demandes en attente"},
    "reports.title_permission_hours": {"en": "Permission hours by month", "fr": "Heures de permission par mois"},
    "reports.title_remote_days": {"en": "Remote days by month", "fr": "Jours de télétravail par mois"},
    "reports.title_certificates": {"en": "Certificates outstanding", "fr": "Certificats en attente"},
    "reports.title_kpmg": {"en": "KPMG export", "fr": "Export KPMG"},
    # totals and steps
    "reports.total": {"en": "Total", "fr": "Total"},
    "reports.step_line_manager": {"en": "The manager", "fr": "Le responsable"},
    "reports.step_hr_role": {"en": "HR", "fr": "RH"},
    "reports.step_named_person": {"en": "A named person", "fr": "Une personne désignée"},
    # columns of the six reports
    "reports.col_employee": {"en": "Employee", "fr": "Salarié"},
    "reports.col_department": {"en": "Department", "fr": "Département"},
    "reports.col_type": {"en": "Type", "fr": "Type"},
    "reports.col_period": {"en": "Dates", "fr": "Dates"},
    "reports.col_from": {"en": "From", "fr": "Du"},
    "reports.col_to": {"en": "To", "fr": "Au"},
    "reports.col_days": {"en": "Days", "fr": "Jours"},
    "reports.col_hours": {"en": "Hours", "fr": "Heures"},
    "reports.col_balance": {"en": "Balance on the date", "fr": "Solde à la date"},
    "reports.col_pending": {"en": "Days pending", "fr": "Jours en attente"},
    "reports.col_approved_upcoming": {"en": "Days approved and upcoming", "fr": "Jours approuvés à venir"},
    "reports.col_requester": {"en": "Requester", "fr": "Demandeur"},
    "reports.col_waiting_on": {"en": "Waiting on", "fr": "En attente de"},
    "reports.col_since": {"en": "Since", "fr": "Depuis"},
    "reports.col_age_days": {"en": "Days waiting", "fr": "Jours d'attente"},
    "reports.col_reminded": {"en": "Reminded", "fr": "Relancé"},
    "reports.col_alerted": {"en": "HR alerted", "fr": "RH alertées"},
    "reports.col_total": {"en": "Total", "fr": "Total"},
    "reports.col_due": {"en": "Certificate due", "fr": "Certificat attendu"},
    "reports.col_overdue_hours": {"en": "Overdue (hours)", "fr": "Retard (heures)"},
    "reports.col_m01": {"en": "Jan", "fr": "Janv."},
    "reports.col_m02": {"en": "Feb", "fr": "Févr."},
    "reports.col_m03": {"en": "Mar", "fr": "Mars"},
    "reports.col_m04": {"en": "Apr", "fr": "Avr."},
    "reports.col_m05": {"en": "May", "fr": "Mai"},
    "reports.col_m06": {"en": "Jun", "fr": "Juin"},
    "reports.col_m07": {"en": "Jul", "fr": "Juil."},
    "reports.col_m08": {"en": "Aug", "fr": "Août"},
    "reports.col_m09": {"en": "Sep", "fr": "Sept."},
    "reports.col_m10": {"en": "Oct", "fr": "Oct."},
    "reports.col_m11": {"en": "Nov", "fr": "Nov."},
    "reports.col_m12": {"en": "Dec", "fr": "Déc."},
    # columns of the KPMG export (REP-04)
    "reports.col_employee_number": {"en": "Employee number", "fr": "Matricule"},
    "reports.col_name": {"en": "Name", "fr": "Nom"},
    "reports.col_annual_days": {"en": "Annual leave (days)", "fr": "Congé annuel (jours)"},
    "reports.col_sick_days": {"en": "Sick leave (days)", "fr": "Congé maladie (jours)"},
    "reports.col_exceptional_days": {"en": "Exceptional leave (days)", "fr": "Congé exceptionnel (jours)"},
    "reports.col_permission_hours": {"en": "Permissions (hours)", "fr": "Permissions (heures)"},
    "reports.col_remote_days": {"en": "Remote work (days)", "fr": "Télétravail (jours)"},
    "reports.col_balance_end": {"en": "Annual balance at period end", "fr": "Solde annuel en fin de période"},
    "reports.col_meal_tickets": {"en": "Meal tickets", "fr": "Tickets restaurant"},
}
```

- [ ] **Step 4: Write the setup function**

Replace `backend/apps/reports/tabular/__init__.py` with:

```python
"""Tabular reports and the KPMG export (plan 06). `setup()` is called once from ReportsConfig.ready()."""

from apps.core.i18n import register_messages
from apps.settings.registry import SettingDef, register

from .messages import MESSAGES

_done = False


def setup() -> None:
    global _done
    if _done:
        return
    register_messages(MESSAGES)
    register(SettingDef(key="meal_tickets_per_month", group="hr", kind="int", default=21, minimum=0, maximum=31))
    register(SettingDef(key="export_cutoff_day", group="hr", kind="int_or_null", default=None, minimum=1, maximum=28))
    _done = True
```

- [ ] **Step 5: Call it when the app starts**

Plan 05 created `backend/apps/reports/apps.py` with the two class attributes and no `ready` method. Replace the file with:

```python
from django.apps import AppConfig


class ReportsConfig(AppConfig):
    name = "apps.reports"
    label = "reports"

    def ready(self) -> None:
        from apps.reports import tabular

        tabular.setup()
```

- [ ] **Step 6: Run the tests**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_setup.py tests/test_messages.py -v`
Expected: all pass. `tests/test_messages.py` now also checks every `reports.*` code for both languages and identical placeholders.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/reports/tabular/__init__.py backend/apps/reports/tabular/messages.py backend/apps/reports/apps.py backend/apps/reports/tests/test_tabular_setup.py
git commit -m "feat(reports): register report texts and the meal-ticket and cut-off settings"
```

---

### Task 3: Report framework: parameters, scope and people

**Files:**
- Create: `backend/apps/reports/tabular/framework.py`
- Test: `backend/apps/reports/tests/test_tabular_framework.py`

**Interfaces:**
- Consumes: `apps.accounts.roles.Role`, `has_role`; `apps.core.i18n.active_language` (used by the callers of this module); `apps.core.errors.DomainError`, `NotAllowed`, `NotFound`, `Problem`; `apps.core.i18n.translate`; `apps.organisation.reach.team_ids`; `apps.organisation.selectors.employees_for`, `full_name`, `department_name`.
- Produces (all in `apps.reports.tabular.framework`):
  - `Column(key: str, label: str, kind: str)`; kind is `text`, `number`, `date`, `datetime` or `period`
  - `Period(start: date, end: date)`: the value of a `period` cell
  - `TotalLine(group: str, label: str, values: Mapping[str, Any])`; group is `overall`, `by_employee` or `by_type`
  - `ReportResult(columns: list[Column], rows: list[dict[str, Any]], totals: list[TotalLine] | None = None)`
  - `ReportParams(scope, start=None, end=None, on=None, year=None, department_id=None, employee_public_id=None, type_code=None, step=None)` with `as_audit() -> dict[str, str]`
  - `resolve_scope(user, requested: str | None) -> str` (`"team"` or `"all"`)
  - `parse_params(query: Mapping[str, str], *, user, accepts: frozenset[str], today: date | None = None) -> ReportParams`; `accepts` is a subset of `{"period", "on", "year", "department", "employee", "type", "step"}`
  - `employees_in_scope(user, params: ReportParams, *, include_archived: bool) -> list[Employee]`, sorted by name
  - `People(employees, lang)` with `name(employee_id) -> str` and `department(employee_id) -> str`
  - `col(key: str, kind: str = "text", lang: str | None = None) -> Column` (label from `reports.col_<key>`)
  - constants `SCOPE_TEAM`, `SCOPE_ALL`, `MAX_PERIOD_DAYS = 731`, `STEP_RULES`

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/reports/tests/test_tabular_framework.py`:

```python
from datetime import date

import pytest
from apps.core.errors import DomainError, NotAllowed, NotFound
from apps.organisation import selectors as organisation_selectors
from apps.organisation import services as organisation_services
from apps.reports.tabular import framework
from apps.reports.tabular.framework import (
    People,
    ReportParams,
    col,
    employees_in_scope,
    parse_params,
    resolve_scope,
)

pytestmark = pytest.mark.django_db

TODAY = date(2026, 12, 1)
NO_PERIOD = frozenset({"on", "year", "department", "employee", "type", "step"})


def _ids(user, params, *, include_archived=False):
    return {employee.id for employee in employees_in_scope(user, params, include_archived=include_archived)}


# --- scope ---------------------------------------------------------------


def test_scope_defaults_to_the_widest_the_user_holds(world):
    assert resolve_scope(world.hr_user, None) == "all"
    assert resolve_scope(world.exec_user, None) == "all"
    assert resolve_scope(world.manager_user, None) == "team"


def test_an_executive_who_manages_people_may_ask_for_the_team(world):
    assert resolve_scope(world.exec_user, "team") == "team"


def test_scope_all_is_refused_to_a_manager(world):
    with pytest.raises(NotAllowed) as refused:
        resolve_scope(world.manager_user, "all")
    assert refused.value.code == "reports.scope_not_allowed"


def test_scope_team_is_refused_to_someone_who_manages_nobody(world):
    with pytest.raises(NotAllowed) as refused:
        resolve_scope(world.hr_user, "team")
    assert refused.value.code == "reports.scope_not_allowed"


def test_unknown_scope_is_a_problem_on_the_scope_field(world):
    with pytest.raises(DomainError) as refused:
        resolve_scope(world.hr_user, "everyone")
    assert refused.value.code == "reports.unknown_scope"
    assert refused.value.problems[0].field == "scope"


# --- parameters ----------------------------------------------------------


def test_period_is_parsed_and_other_dates_default_to_today(world):
    params = parse_params(
        {"from": "2026-11-01", "to": "2026-11-30"},
        user=world.hr_user,
        accepts=frozenset({"period", "on", "year"}),
        today=TODAY,
    )

    assert (params.start, params.end) == (date(2026, 11, 1), date(2026, 11, 30))
    assert params.on == TODAY
    assert params.year == 2026


@pytest.mark.parametrize(
    ("query", "code", "field"),
    [
        ({}, "reports.period_required", "from"),
        ({"from": "2026-11-01"}, "reports.period_required", "to"),
        ({"from": "2026-11-30", "to": "2026-11-01"}, "reports.period_order", "to"),
        ({"from": "2016-01-01", "to": "2026-01-01"}, "reports.period_too_long", "to"),
        ({"from": "2026-02-30", "to": "2026-03-01"}, "reports.invalid_date", "from"),
        ({"from": "2026-11-01", "to": "next week"}, "reports.invalid_date", "to"),
    ],
)
def test_period_problems(world, query, code, field):
    with pytest.raises(DomainError) as refused:
        parse_params(query, user=world.hr_user, accepts=frozenset({"period"}), today=TODAY)

    problem = refused.value.problems[0]
    assert (problem.code, problem.field) == (code, field)


@pytest.mark.parametrize(
    ("query", "code", "field"),
    [
        ({"on": "yesterday"}, "reports.invalid_date", "on"),
        ({"year": "20x6"}, "reports.invalid_year", "year"),
        ({"year": "1990"}, "reports.invalid_year", "year"),
        ({"department": "abc"}, "reports.invalid_filter", "department"),
        ({"step": "ceo"}, "reports.unknown_step", "step"),
    ],
)
def test_other_filter_problems(world, query, code, field):
    with pytest.raises(DomainError) as refused:
        parse_params(query, user=world.hr_user, accepts=NO_PERIOD, today=TODAY)

    problem = refused.value.problems[0]
    assert (problem.code, problem.field) == (code, field)


def test_a_filter_the_report_does_not_accept_is_refused(world):
    with pytest.raises(DomainError) as refused:
        parse_params({"type": "annual"}, user=world.hr_user, accepts=frozenset({"on"}), today=TODAY)

    problem = refused.value.problems[0]
    assert (problem.code, problem.field) == ("reports.filter_not_available", "type")


def test_department_filter_is_refused_in_team_scope(world):
    with pytest.raises(DomainError) as refused:
        parse_params({"department": str(world.dept_a.id)}, user=world.manager_user, accepts=NO_PERIOD, today=TODAY)

    problem = refused.value.problems[0]
    assert (problem.code, problem.field) == ("reports.filter_not_available", "department")


def test_all_filters_are_kept(world):
    params = parse_params(
        {
            "department": str(world.dept_b.id),
            "employee": str(world.outsider.public_id),
            "type": "sick",
            "step": "hr_role",
            "year": "2025",
            "on": "2026-10-15",
        },
        user=world.hr_user,
        accepts=NO_PERIOD,
        today=TODAY,
    )

    assert params.department_id == world.dept_b.id
    assert params.employee_public_id == str(world.outsider.public_id)
    assert params.type_code == "sick"
    assert params.step == "hr_role"
    assert params.year == 2025
    assert params.on == date(2026, 10, 15)


def test_params_as_audit_keeps_only_what_was_set():
    params = ReportParams(scope="all", start=date(2026, 11, 1), end=date(2026, 11, 30), type_code="sick")

    assert params.as_audit() == {"scope": "all", "from": "2026-11-01", "to": "2026-11-30", "type": "sick"}


# --- who is in the report --------------------------------------------------


def test_hr_reaches_everyone(world):
    ids = _ids(world.hr_user, ReportParams(scope="all"))

    assert {world.owner.id, world.outsider.id, world.ceo.id, world.hr.id} <= ids


def test_team_scope_is_the_managers_team(world):
    assert _ids(world.manager_user, ReportParams(scope="team")) == {world.owner.id, world.peer.id}


def test_team_scope_of_an_executive_is_their_direct_reports(world):
    assert _ids(world.exec_user, ReportParams(scope="team")) == {
        world.manager.id,
        world.other_manager.id,
        world.hr.id,
    }


def test_empty_team_yields_nobody(world, monkeypatch):
    monkeypatch.setattr(framework.reach, "team_ids", lambda user, **kwargs: set())

    assert employees_in_scope(world.manager_user, ReportParams(scope="team"), include_archived=False) == []


def test_employee_outside_the_team_is_not_found(world):
    params = ReportParams(scope="team", employee_public_id=str(world.outsider.public_id))

    with pytest.raises(NotFound) as refused:
        employees_in_scope(world.manager_user, params, include_archived=False)
    assert refused.value.code == "reports.employee_not_found"


def test_employee_filter_keeps_one_person(world):
    params = ReportParams(scope="all", employee_public_id=str(world.owner.public_id))

    assert _ids(world.hr_user, params) == {world.owner.id}


def test_department_filter_narrows(world):
    ids = _ids(world.hr_user, ReportParams(scope="all", department_id=world.dept_b.id))

    assert world.outsider.id in ids
    assert world.owner.id not in ids


def test_archived_employees_appear_only_on_request(world):
    organisation_services.archive_employee(
        actor=world.hr_user, employee=world.peer, leaving_date=date(2026, 11, 30), reason="Resignation"
    )

    assert world.peer.id not in _ids(world.hr_user, ReportParams(scope="all"))
    assert world.peer.id in _ids(world.hr_user, ReportParams(scope="all"), include_archived=True)


def test_employees_come_sorted_by_name(world):
    employees = employees_in_scope(world.hr_user, ReportParams(scope="all"), include_archived=False)
    names = [organisation_selectors.full_name(employee).casefold() for employee in employees]

    assert names == sorted(names)


# --- helpers -------------------------------------------------------------


def test_people_gives_names_and_departments(world):
    people = People([world.owner, world.outsider], "fr")

    assert people.name(world.owner.id) == organisation_selectors.full_name(world.owner)
    assert people.department(world.outsider.id) == organisation_selectors.department_name(world.outsider, "fr")


def test_col_takes_its_label_from_the_catalogue():
    column = col("days", "number", "fr")

    assert (column.key, column.label, column.kind) == ("days", "Jours", "number")

```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_framework.py -v`
Expected: collection ERROR with `ModuleNotFoundError: No module named 'apps.reports.tabular.framework'`

- [ ] **Step 3: Write the framework**

Create `backend/apps/reports/tabular/framework.py`:

```python
"""Shared pieces of every tabular report: result shape, parameters, reach."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date
from typing import Any

from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.core.errors import DomainError, NotAllowed, NotFound, Problem
from apps.core.i18n import translate
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors

SCOPE_TEAM = "team"
SCOPE_ALL = "all"
MAX_PERIOD_DAYS = 731
STEP_RULES = ("line_manager", "hr_role", "named_person")
FILTERS = ("department", "employee", "type", "step")


@dataclass(frozen=True)
class Column:
    key: str
    label: str
    kind: str  # "text" | "number" | "date" | "datetime" | "period"


@dataclass(frozen=True)
class Period:
    """The value of a cell of kind "period": one attribute on screen, two date columns in a workbook."""

    start: date
    end: date


@dataclass(frozen=True)
class TotalLine:
    group: str  # "overall" | "by_employee" | "by_type"
    label: str
    values: Mapping[str, Any]


@dataclass(frozen=True)
class ReportResult:
    columns: list[Column]
    rows: list[dict[str, Any]]
    totals: list[TotalLine] | None = None


@dataclass(frozen=True)
class ReportParams:
    scope: str
    start: date | None = None
    end: date | None = None
    on: date | None = None
    year: int | None = None
    department_id: int | None = None
    employee_public_id: str | None = None
    type_code: str | None = None
    step: str | None = None

    def as_audit(self) -> dict[str, str]:
        """The filters as they are written to the audit trail: query names, only what was set."""
        pairs = {
            "scope": self.scope,
            "from": self.start.isoformat() if self.start else None,
            "to": self.end.isoformat() if self.end else None,
            "on": self.on.isoformat() if self.on else None,
            "year": str(self.year) if self.year is not None else None,
            "department": str(self.department_id) if self.department_id is not None else None,
            "employee": self.employee_public_id,
            "type": self.type_code,
            "step": self.step,
        }
        return {key: value for key, value in pairs.items() if value is not None}


def col(key: str, kind: str = "text", lang: str | None = None) -> Column:
    return Column(key=key, label=translate(f"reports.col_{key}", lang), kind=kind)


def resolve_scope(user, requested: str | None) -> str:
    wide = has_role(user, Role.HR, Role.EXEC)
    if not requested:
        return SCOPE_ALL if wide else SCOPE_TEAM
    if requested == SCOPE_ALL:
        if not wide:
            raise NotAllowed("reports.scope_not_allowed")
        return SCOPE_ALL
    if requested == SCOPE_TEAM:
        if not has_role(user, Role.MANAGER):
            raise NotAllowed("reports.scope_not_allowed")
        return SCOPE_TEAM
    raise DomainError("reports.unknown_scope", field="scope")


def _date(raw: str, field: str, problems: list[Problem]) -> date | None:
    try:
        return date.fromisoformat(raw)
    except ValueError:
        problems.append(Problem("reports.invalid_date", field))
        return None


def parse_params(
    query: Mapping[str, str], *, user, accepts: frozenset[str], today: date | None = None
) -> ReportParams:
    today = today or timezone.localdate()
    scope = resolve_scope(user, query.get("scope"))
    problems: list[Problem] = []
    values: dict[str, Any] = {"scope": scope}

    if "period" in accepts:
        raw_from, raw_to = query.get("from"), query.get("to")
        if not raw_from or not raw_to:
            problems.append(Problem("reports.period_required", "to" if raw_from else "from"))
        else:
            start = _date(raw_from, "from", problems)
            end = _date(raw_to, "to", problems)
            if start and end:
                if end < start:
                    problems.append(Problem("reports.period_order", "to"))
                elif (end - start).days > MAX_PERIOD_DAYS:
                    problems.append(Problem("reports.period_too_long", "to", {"days": MAX_PERIOD_DAYS}))
                else:
                    values["start"], values["end"] = start, end

    if "on" in accepts:
        raw_on = query.get("on")
        values["on"] = _date(raw_on, "on", problems) if raw_on else today

    if "year" in accepts:
        raw_year = query.get("year")
        if not raw_year:
            values["year"] = today.year
        elif raw_year.isdigit() and 2000 <= int(raw_year) <= 2100:
            values["year"] = int(raw_year)
        else:
            problems.append(Problem("reports.invalid_year", "year"))

    for name in FILTERS:
        raw = query.get(name)
        if not raw:
            continue
        if name not in accepts or (name == "department" and scope == SCOPE_TEAM):
            problems.append(Problem("reports.filter_not_available", name))
        elif name == "department":
            if raw.isdigit():
                values["department_id"] = int(raw)
            else:
                problems.append(Problem("reports.invalid_filter", "department"))
        elif name == "employee":
            values["employee_public_id"] = raw
        elif name == "type":
            values["type_code"] = raw
        elif raw in STEP_RULES:
            values["step"] = raw
        else:
            problems.append(Problem("reports.unknown_step", "step"))

    if problems:
        raise DomainError(problems[0].code, problems=problems)
    return ReportParams(**values)


def employees_in_scope(user, params: ReportParams, *, include_archived: bool) -> list:
    """The employees a report may show, after the employee and department filters, sorted by name.

    Filtering happens in Python on what the organisation selector returns: this app never
    queries organisation tables itself, and the company has a few dozen people.
    """
    employees = list(organisation_selectors.employees_for(user, include_archived=include_archived))
    if params.scope == SCOPE_TEAM:
        team = reach.team_ids(user)
        employees = [employee for employee in employees if employee.id in team]
    if params.employee_public_id:
        employees = [employee for employee in employees if str(employee.public_id) == params.employee_public_id]
        if not employees:
            raise NotFound("reports.employee_not_found")
    if params.department_id is not None:
        employees = [employee for employee in employees if employee.department_id == params.department_id]
    return sorted(employees, key=lambda employee: (organisation_selectors.full_name(employee).casefold(), employee.id))


class People:
    """Names and department names of the employees of one report, looked up by id."""

    def __init__(self, employees: Iterable, lang: str) -> None:
        self._by_id = {employee.id: employee for employee in employees}
        self._lang = lang
        self._departments: dict[int | None, str] = {}

    def name(self, employee_id: int) -> str:
        return organisation_selectors.full_name(self._by_id[employee_id])

    def department(self, employee_id: int) -> str:
        employee = self._by_id[employee_id]
        key = employee.department_id
        if key not in self._departments:
            self._departments[key] = organisation_selectors.department_name(employee, self._lang)
        return self._departments[key]

    def department_options(self) -> list[tuple[int, str]]:
        """(id, name) of every department that has someone in this report, sorted by name."""
        for employee_id in self._by_id:
            self.department(employee_id)
        return sorted(
            ((key, name) for key, name in self._departments.items() if key is not None),
            key=lambda pair: pair[1].casefold(),
        )
```

- [ ] **Step 4: Run them to see them pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_framework.py -v`
Expected: all pass (32 tests with the parametrised cases).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/reports/tabular/framework.py backend/apps/reports/tests/test_tabular_framework.py
git commit -m "feat(reports): add the report framework with parameters, scope and reach"
```

---

### Task 4: Rendering a result as JSON and as a workbook

**Files:**
- Create: `backend/apps/reports/tabular/render.py`
- Test: `backend/apps/reports/tests/test_tabular_render.py`

**Interfaces:**
- Consumes: `apps.core.xlsx.build_workbook(*, title, columns, rows) -> bytes` (headers in row 1, data from row 2; it makes the sheet title safe and writes aware datetimes as Tunis wall-clock time) and `apps.core.xlsx.Column(key, header, kind)`; `framework.Column`, `Period`, `ReportResult`, `TotalLine`; `apps.core.i18n.translate`.
- Produces (in `apps.reports.tabular.render`):
  - `to_json(result: ReportResult) -> dict[str, Any]`: `{"columns": [{key, label, kind}], "rows": [...], "totals": {"lines": [{group, label, values}]} | None}`. Cells: `Decimal` becomes a string with two decimals, a date or datetime its ISO form, a `Period` becomes `{"start", "end"}`, `None` stays null.
  - `to_workbook(result: ReportResult, *, title: str, lang: str | None = None) -> bytes`: one sheet; a `period` column becomes two date columns ("Du", "Au"); total lines follow the data rows.
  - `XLSX_MEDIA_TYPE`

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/reports/tests/test_tabular_render.py`:

```python
from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO

from openpyxl import load_workbook

from apps.reports.tabular.framework import Column, Period, ReportResult, TotalLine
from apps.reports.tabular.render import to_json, to_workbook

RESULT = ReportResult(
    columns=[
        Column("employee", "Salarié", "text"),
        Column("period", "Dates", "period"),
        Column("days", "Jours", "number"),
        Column("since", "Depuis", "datetime"),
        Column("due", "Échéance", "date"),
    ],
    rows=[
        {
            "employee": "Amal Trabelsi",
            "period": Period(date(2026, 11, 2), date(2026, 11, 3)),
            "days": Decimal("1.5"),
            "since": datetime(2026, 11, 2, 8, 30, tzinfo=UTC),
            "due": date(2026, 11, 4),
        },
        {
            "employee": "Sami Ben Ali",
            "period": Period(date(2026, 11, 9), date(2026, 11, 9)),
            "days": None,
            "since": None,
            "due": None,
        },
    ],
    totals=[
        TotalLine("overall", "Total", {"days": Decimal("1.5")}),
        TotalLine("by_employee", "Amal Trabelsi", {"days": Decimal("1.5")}),
    ],
)


def _grid(content: bytes) -> list[tuple]:
    return list(load_workbook(BytesIO(content)).active.iter_rows(values_only=True))


def _header_index(grid: list[tuple], first_label: str) -> int:
    return next(index for index, row in enumerate(grid) if row and row[0] == first_label)


def _as_date(value):
    return value.date() if isinstance(value, datetime) else value


def test_json_cells_are_plain_values():
    body = to_json(RESULT)

    assert body["columns"][1] == {"key": "period", "label": "Dates", "kind": "period"}
    first = body["rows"][0]
    assert first["employee"] == "Amal Trabelsi"
    assert first["period"] == {"start": "2026-11-02", "end": "2026-11-03"}
    assert first["days"] == "1.50"
    assert first["since"] == "2026-11-02T08:30:00+00:00"
    assert first["due"] == "2026-11-04"
    assert body["rows"][1]["days"] is None
    assert body["rows"][1]["since"] is None


def test_json_totals_are_lines_or_null():
    assert to_json(RESULT)["totals"] == {
        "lines": [
            {"group": "overall", "label": "Total", "values": {"days": "1.50"}},
            {"group": "by_employee", "label": "Amal Trabelsi", "values": {"days": "1.50"}},
        ]
    }
    assert to_json(ReportResult(columns=[], rows=[]))["totals"] is None


def test_workbook_splits_a_period_into_two_date_columns():
    grid = _grid(to_workbook(RESULT, title="Absences prises", lang="fr"))
    header = _header_index(grid, "Salarié")

    assert grid[header] == ("Salarié", "Du", "Au", "Jours", "Depuis", "Échéance")
    first = grid[header + 1]
    assert first[0] == "Amal Trabelsi"
    assert _as_date(first[1]) == date(2026, 11, 2)
    assert _as_date(first[2]) == date(2026, 11, 3)
    assert first[3] == 1.5
    assert _as_date(first[5]) == date(2026, 11, 4)


def test_workbook_datetimes_are_tunis_wall_clock_without_zone():
    grid = _grid(to_workbook(RESULT, title="Absences prises", lang="fr"))
    header = _header_index(grid, "Salarié")

    assert grid[header + 1][4] == datetime(2026, 11, 2, 9, 30)


def test_workbook_keeps_empty_cells_empty():
    grid = _grid(to_workbook(RESULT, title="Absences prises", lang="fr"))
    header = _header_index(grid, "Salarié")

    assert grid[header + 2][3] is None
    assert grid[header + 2][4] is None


def test_workbook_ends_with_the_total_lines():
    grid = _grid(to_workbook(RESULT, title="Absences prises", lang="fr"))
    header = _header_index(grid, "Salarié")

    overall, by_employee = grid[header + 3], grid[header + 4]
    assert (overall[0], overall[3]) == ("Total", 1.5)
    assert (by_employee[0], by_employee[3]) == ("Total – Amal Trabelsi", 1.5)


def test_english_headers_for_an_english_reader():
    grid = _grid(to_workbook(RESULT, title="Absences taken", lang="en"))
    header = _header_index(grid, "Salarié")

    assert grid[header][1:3] == ("From", "To")

```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_render.py -v`
Expected: collection ERROR with `ModuleNotFoundError: No module named 'apps.reports.tabular.render'`

- [ ] **Step 3: Write the renderer**

Create `backend/apps/reports/tabular/render.py`:

```python
"""Turns a ReportResult into the JSON body of the API or into a workbook."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from django.utils import timezone

from apps.core.i18n import translate
from apps.core.xlsx import Column as SheetColumn
from apps.core.xlsx import build_workbook

from .framework import Period, ReportResult

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_TWO_PLACES = Decimal("0.01")


def _json_cell(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value.quantize(_TWO_PLACES))
    if isinstance(value, Period):
        return {"start": value.start.isoformat(), "end": value.end.isoformat()}
    if isinstance(value, datetime | date):
        return value.isoformat()
    return value


def to_json(result: ReportResult) -> dict[str, Any]:
    return {
        "columns": [{"key": column.key, "label": column.label, "kind": column.kind} for column in result.columns],
        "rows": [{key: _json_cell(value) for key, value in row.items()} for row in result.rows],
        "totals": None
        if result.totals is None
        else {
            "lines": [
                {
                    "group": line.group,
                    "label": line.label,
                    "values": {key: _json_cell(value) for key, value in line.values.items()},
                }
                for line in result.totals
            ]
        },
    }


def _sheet_cell(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime) and timezone.is_aware(value):
        # Excel has no time zones: write the Tunis wall-clock time.
        return timezone.localtime(value).replace(tzinfo=None)
    return value


def _sheet_columns(result: ReportResult, lang: str | None) -> list[SheetColumn]:
    columns: list[SheetColumn] = []
    for column in result.columns:
        if column.kind == "period":
            columns.append(SheetColumn(key=f"{column.key}_start", header=translate("reports.col_from", lang), kind="date"))
            columns.append(SheetColumn(key=f"{column.key}_end", header=translate("reports.col_to", lang), kind="date"))
        else:
            columns.append(SheetColumn(key=column.key, header=column.label, kind=column.kind))
    return columns


def _sheet_row(result: ReportResult, row: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for column in result.columns:
        value = row.get(column.key)
        if column.kind == "period":
            out[f"{column.key}_start"] = value.start if value else None
            out[f"{column.key}_end"] = value.end if value else None
        else:
            out[column.key] = _sheet_cell(value)
    return out


def _total_rows(result: ReportResult, lang: str | None) -> list[dict[str, Any]]:
    if not result.totals:
        return []
    label_key = next((column.key for column in result.columns if column.kind == "text"), result.columns[0].key)
    word = translate("reports.total", lang)
    rows = []
    for line in result.totals:
        row = {key: _sheet_cell(value) for key, value in line.values.items()}
        row[label_key] = word if line.group == "overall" else f"{word} – {line.label}"
        rows.append(row)
    return rows


def to_workbook(result: ReportResult, *, title: str, lang: str | None = None) -> bytes:
    rows = [_sheet_row(result, row) for row in result.rows] + _total_rows(result, lang)
    return build_workbook(title=title, columns=_sheet_columns(result, lang), rows=rows)
```

- [ ] **Step 4: Run them to see them pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_render.py -v`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/reports/tabular/render.py backend/apps/reports/tests/test_tabular_render.py
git commit -m "feat(reports): render report results as JSON and as a workbook"
```

---

### Task 5: Report "Absences taken"

One line per approved request, clipped to the period, with totals per employee and per type (UI 10.3). The expected figures are those of the scenario table at the top of this plan.

**Files:**
- Create: `backend/apps/reports/tabular/absences.py`
- Test: `backend/apps/reports/tests/test_tabular_absences.py`

**Interfaces:**
- Consumes: `apps.requests.selectors.day_rows(*, start, end, statuses, employee_ids=None, type_codes=None) -> list[DayRow]`; `types.type_facts()` (Task 1); `framework.employees_in_scope`, `People`, `col`, `Period`, `ReportResult`, `TotalLine`, `parse_params`; the `november` fixture.
- Produces: `apps.reports.tabular.absences.ACCEPTS: frozenset[str]` and `absences.build(user, params: ReportParams, lang: str, now: datetime) -> ReportResult`. Every report builder of this plan has this signature. Columns: `employee`, `department`, `type`, `period`, `days`, `hours`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/reports/tests/test_tabular_absences.py`:

```python
from datetime import date
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.core.errors import DomainError
from apps.organisation import selectors as organisation_selectors
from apps.organisation import services as organisation_services
from apps.reports.tabular import absences, framework
from apps.reports.tabular.framework import Period, parse_params

pytestmark = pytest.mark.django_db

NOVEMBER = {"from": "2026-11-01", "to": "2026-11-30"}


def _run(user, lang="fr", **extra):
    params = parse_params({**NOVEMBER, **extra}, user=user, accepts=absences.ACCEPTS, today=date(2026, 12, 1))
    return absences.build(user, params, lang, timezone.now())


def _name(employee):
    return organisation_selectors.full_name(employee)


def _row(result, employee, type_name, start):
    return next(
        row
        for row in result.rows
        if row["employee"] == _name(employee) and row["type"] == type_name and row["period"].start == start
    )


def _total(result, group, label=None):
    return next(line for line in result.totals if line.group == group and (label is None or line.label == label))


def test_hr_sees_every_approved_absence_of_the_month(world, november):
    result = _run(world.hr_user)

    assert [column.key for column in result.columns] == ["employee", "department", "type", "period", "days", "hours"]
    assert len(result.rows) == 7
    # The pending request of 9 and 10 November is not there.
    assert not any(
        row["employee"] == _name(world.owner) and row["period"].start == date(2026, 11, 9) for row in result.rows
    )


def test_request_crossing_the_period_is_clipped(world, november):
    result = _run(world.hr_user)

    long_leave = _row(result, world.owner, world.annual.name_fr, date(2026, 11, 2))
    assert long_leave["period"] == Period(date(2026, 11, 2), date(2026, 11, 2))  # 3 November is a holiday
    assert long_leave["days"] == Decimal("1")

    exceptional = _row(result, world.owner, world.exceptional.name_fr, date(2026, 11, 30))
    assert exceptional["period"] == Period(date(2026, 11, 30), date(2026, 11, 30))
    assert exceptional["days"] == Decimal("1")


def test_half_days_count_as_halves_and_permissions_in_hours(world, november):
    result = _run(world.hr_user)

    half = _row(result, world.owner, world.annual.name_fr, date(2026, 11, 13))
    assert (half["days"], half["hours"]) == (Decimal("0.5"), None)

    permission = _row(result, world.owner, world.permission.name_fr, date(2026, 11, 24))
    assert (permission["days"], permission["hours"]) == (None, Decimal("2.5"))


def test_totals_overall_per_employee_and_per_type(world, november):
    result = _run(world.hr_user)

    assert _total(result, "overall").values == {"days": Decimal("8"), "hours": Decimal("2.5")}
    assert _total(result, "by_employee", _name(world.owner)).values == {"days": Decimal("5"), "hours": Decimal("2.5")}
    assert _total(result, "by_employee", _name(world.outsider)).values == {"days": Decimal("3"), "hours": Decimal("0")}
    assert _total(result, "by_type", world.annual.name_fr).values == {"days": Decimal("1.5"), "hours": None}
    assert _total(result, "by_type", world.sick.name_fr).values == {"days": Decimal("3.5"), "hours": None}
    assert _total(result, "by_type", world.exceptional.name_fr).values == {"days": Decimal("1"), "hours": None}
    assert _total(result, "by_type", world.remote.name_fr).values == {"days": Decimal("2"), "hours": None}
    assert _total(result, "by_type", world.permission.name_fr).values == {"days": None, "hours": Decimal("2.5")}


def test_type_filter(world, november):
    result = _run(world.hr_user, type="sick")

    assert {row["type"] for row in result.rows} == {world.sick.name_fr}
    assert _total(result, "overall").values["days"] == Decimal("3.5")


def test_unknown_type_is_refused(world, november):
    with pytest.raises(DomainError) as refused:
        _run(world.hr_user, type="sabbatical")

    assert refused.value.code == "reports.unknown_type"
    assert refused.value.problems[0].field == "type"


def test_a_manager_sees_the_team_only(world, november):
    result = _run(world.manager_user)

    assert {row["employee"] for row in result.rows} == {_name(world.owner)}
    assert len(result.rows) == 6
    assert _total(result, "overall").values == {"days": Decimal("5"), "hours": Decimal("2.5")}


def test_employee_and_department_filters(world, november):
    by_employee = _run(world.hr_user, employee=str(world.outsider.public_id))
    by_department = _run(world.hr_user, department=str(world.dept_b.id))

    assert [row["employee"] for row in by_employee.rows] == [_name(world.outsider)]
    assert [row["employee"] for row in by_department.rows] == [_name(world.outsider)]
    assert by_department.rows[0]["days"] == Decimal("3")


def test_empty_scope_never_queries_everyone(world, november, monkeypatch):
    def forbidden(**kwargs):
        raise AssertionError("day_rows must not be called when nobody is in scope")

    monkeypatch.setattr(framework.reach, "team_ids", lambda user, **kwargs: set())
    monkeypatch.setattr(absences.request_selectors, "day_rows", forbidden)

    result = _run(world.manager_user)

    assert result.rows == []
    assert result.totals is None


def test_rows_are_sorted_by_employee_then_date(world, november):
    result = _run(world.hr_user)

    keys = [(row["employee"].casefold(), row["period"].start) for row in result.rows]
    assert keys == sorted(keys)


def test_an_archived_employee_keeps_the_absences_of_their_last_month(world, november):
    organisation_services.archive_employee(
        actor=world.hr_user, employee=world.outsider, leaving_date=date(2026, 11, 30), reason="Resignation"
    )

    result = _run(world.hr_user)

    assert _name(world.outsider) in {row["employee"] for row in result.rows}


def test_labels_follow_the_readers_language(world, november):
    result = _run(world.hr_user, lang="en")

    assert [column.label for column in result.columns] == ["Employee", "Department", "Type", "Dates", "Days", "Hours"]
    assert world.sick.name_en in {row["type"] for row in result.rows}
    assert _total(result, "overall").label == "Total"
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_absences.py -v`
Expected: collection ERROR with `ImportError: cannot import name 'absences' from 'apps.reports.tabular'`

- [ ] **Step 3: Write the builder**

Create `backend/apps/reports/tabular/absences.py`:

```python
"""Absences taken: one line per approved request, clipped to the period (REP-01, REP-05)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from apps.core.errors import DomainError
from apps.core.i18n import translate
from apps.requests import selectors as request_selectors

from .framework import People, Period, ReportParams, ReportResult, TotalLine, col, employees_in_scope
from .types import type_facts

ACCEPTS = frozenset({"period", "department", "employee", "type"})
ZERO = Decimal("0")


@dataclass(frozen=True)
class _Line:
    employee_id: int
    type_code: str
    start: date
    end: date
    days: Decimal | None
    hours: Decimal | None


def build(user, params: ReportParams, lang: str, now: datetime) -> ReportResult:
    columns = [
        col("employee", "text", lang),
        col("department", "text", lang),
        col("type", "text", lang),
        col("period", "period", lang),
        col("days", "number", lang),
        col("hours", "number", lang),
    ]
    facts = type_facts()
    if params.type_code and params.type_code not in facts:
        raise DomainError("reports.unknown_type", field="type")

    employees = employees_in_scope(user, params, include_archived=True)
    if not employees:
        # Never hand an empty id list to day_rows: "no filter" and "nobody" must not be confused.
        return ReportResult(columns=columns, rows=[], totals=None)
    people = People(employees, lang)

    day_rows = request_selectors.day_rows(
        start=params.start,
        end=params.end,
        statuses=["approved"],
        employee_ids=[employee.id for employee in employees],
        type_codes=[params.type_code] if params.type_code else None,
    )
    by_request: dict[int, list] = defaultdict(list)
    for row in day_rows:
        by_request[row.request_id].append(row)

    lines: list[_Line] = []
    for items in by_request.values():
        first = items[0]
        hourly = facts[first.type_code].unit == "hour"
        lines.append(
            _Line(
                employee_id=first.employee_id,
                type_code=first.type_code,
                start=min(item.day for item in items),
                end=max(item.day for item in items),
                days=None if hourly else sum((item.portion for item in items), ZERO),
                hours=sum((item.hours or ZERO for item in items), ZERO) if hourly else None,
            )
        )
    lines.sort(key=lambda line: (people.name(line.employee_id).casefold(), line.start, line.type_code))

    rows = [
        {
            "employee": people.name(line.employee_id),
            "department": people.department(line.employee_id),
            "type": facts[line.type_code].name(lang),
            "period": Period(line.start, line.end),
            "days": line.days,
            "hours": line.hours,
        }
        for line in lines
    ]
    return ReportResult(columns=columns, rows=rows, totals=_totals(lines, people, facts, lang) if lines else None)


def _totals(lines: list[_Line], people: People, facts: dict, lang: str) -> list[TotalLine]:
    def days_of(selected: list[_Line]) -> Decimal:
        return sum((line.days or ZERO for line in selected), ZERO)

    def hours_of(selected: list[_Line]) -> Decimal:
        return sum((line.hours or ZERO for line in selected), ZERO)

    totals = [
        TotalLine("overall", translate("reports.total", lang), {"days": days_of(lines), "hours": hours_of(lines)})
    ]

    employee_ids = sorted({line.employee_id for line in lines}, key=lambda eid: people.name(eid).casefold())
    for employee_id in employee_ids:
        own = [line for line in lines if line.employee_id == employee_id]
        totals.append(TotalLine("by_employee", people.name(employee_id), {"days": days_of(own), "hours": hours_of(own)}))

    for code, fact in facts.items():
        of_type = [line for line in lines if line.type_code == code]
        if not of_type:
            continue
        if fact.unit == "hour":
            values = {"days": None, "hours": hours_of(of_type)}
        else:
            values = {"days": days_of(of_type), "hours": None}
        totals.append(TotalLine("by_type", fact.name(lang), values))
    return totals
```

- [ ] **Step 4: Run them to see them pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_absences.py -v`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/reports/tabular/absences.py backend/apps/reports/tests/test_tabular_absences.py
git commit -m "feat(reports): add the absences taken report"
```

---

### Task 6: Report "Balances at a date"

**Files:**
- Create: `backend/apps/reports/tabular/balances.py`
- Test: `backend/apps/reports/tests/test_tabular_balances.py`

**Interfaces:**
- Consumes: `apps.balances.selectors.balances_at(on, *, employee_ids=None) -> dict[int, Decimal]`, `figures(employee_id, *, today=None) -> BalanceFigures` (`pending`, `approved_upcoming`); the framework of Task 3.
- Produces: `apps.reports.tabular.balances.ACCEPTS` and `balances.build(user, params, lang, now) -> ReportResult`. Columns: `employee`, `department`, `balance`, `pending`, `approved_upcoming`. One `overall` total line. Archived employees are not listed.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/reports/tests/test_tabular_balances.py`:

```python
from datetime import date
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.balances import selectors as balance_selectors
from apps.organisation import selectors as organisation_selectors
from apps.organisation import services as organisation_services
from apps.reports.tabular import balances, framework
from apps.reports.tabular.framework import parse_params

pytestmark = pytest.mark.django_db


def _run(user, lang="fr", **query):
    params = parse_params(query, user=user, accepts=balances.ACCEPTS, today=date(2026, 12, 1))
    return balances.build(user, params, lang, timezone.now())


def _name(employee):
    return organisation_selectors.full_name(employee)


def _row(result, employee):
    return next(row for row in result.rows if row["employee"] == _name(employee))


def test_columns(world, november):
    result = _run(world.hr_user, on="2026-11-30")

    assert [column.key for column in result.columns] == [
        "employee",
        "department",
        "balance",
        "pending",
        "approved_upcoming",
    ]


def test_balance_on_a_date_can_be_explained_by_hand(world, november):
    # Opening 20 on 30 Sep; 2 days taken on 29 and 30 Oct; 1 day on 2 Nov; half a day on 13 Nov.
    assert _row(_run(world.hr_user, on="2026-09-29"), world.owner)["balance"] == Decimal("0")
    assert _row(_run(world.hr_user, on="2026-10-31"), world.owner)["balance"] == Decimal("18")
    assert _row(_run(world.hr_user, on="2026-11-12"), world.owner)["balance"] == Decimal("17")
    assert _row(_run(world.hr_user, on="2026-11-30"), world.owner)["balance"] == Decimal("16.5")


def test_someone_without_entries_has_zero(world, november):
    assert _row(_run(world.hr_user, on="2026-11-30"), world.peer)["balance"] == Decimal("0")


def test_pending_and_upcoming_come_from_the_balance_figures(world, november):
    on = date(2026, 11, 5)
    figures = balance_selectors.figures(world.owner.id, today=on)

    row = _row(_run(world.hr_user, on=on.isoformat()), world.owner)

    assert row["pending"] == figures.pending
    assert row["approved_upcoming"] == figures.approved_upcoming


def test_the_date_defaults_to_today(world, november):
    assert _row(_run(world.hr_user), world.owner)["balance"] == Decimal("16.5")


def test_overall_total(world, november):
    result = _run(world.hr_user, on="2026-11-30")

    overall = result.totals[0]
    assert overall.group == "overall"
    assert overall.values["balance"] == Decimal("16.5")
    assert overall.values["pending"] == sum((row["pending"] for row in result.rows), Decimal("0"))


def test_a_manager_sees_the_team_only(world, november):
    result = _run(world.manager_user, on="2026-11-30")

    assert {row["employee"] for row in result.rows} == {_name(world.owner), _name(world.peer)}


def test_department_filter(world, november):
    result = _run(world.hr_user, on="2026-11-30", department=str(world.dept_b.id))

    names = {row["employee"] for row in result.rows}
    assert _name(world.outsider) in names
    assert _name(world.owner) not in names


def test_people_who_left_are_not_listed(world, november):
    organisation_services.archive_employee(
        actor=world.hr_user, employee=world.peer, leaving_date=date(2026, 11, 30), reason="Resignation"
    )

    result = _run(world.hr_user, on="2026-11-30")

    assert _name(world.peer) not in {row["employee"] for row in result.rows}


def test_empty_scope_never_queries_everyone(world, november, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("balances_at must not be called when nobody is in scope")

    monkeypatch.setattr(framework.reach, "team_ids", lambda user, **kwargs: set())
    monkeypatch.setattr(balances.balance_selectors, "balances_at", forbidden)

    result = _run(world.manager_user, on="2026-11-30")

    assert result.rows == []
    assert result.totals is None
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_balances.py -v`
Expected: collection ERROR with `ImportError: cannot import name 'balances' from 'apps.reports.tabular'`

- [ ] **Step 3: Write the builder**

Create `backend/apps/reports/tabular/balances.py`:

```python
"""Balances at a date: the posted balance on the date, days pending, days approved and upcoming."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from apps.balances import selectors as balance_selectors
from apps.core.i18n import translate

from .framework import People, ReportParams, ReportResult, TotalLine, col, employees_in_scope

ACCEPTS = frozenset({"on", "department", "employee"})
ZERO = Decimal("0")


def build(user, params: ReportParams, lang: str, now: datetime) -> ReportResult:
    columns = [
        col("employee", "text", lang),
        col("department", "text", lang),
        col("balance", "number", lang),
        col("pending", "number", lang),
        col("approved_upcoming", "number", lang),
    ]
    employees = employees_in_scope(user, params, include_archived=False)
    if not employees:
        return ReportResult(columns=columns, rows=[], totals=None)
    people = People(employees, lang)

    posted = balance_selectors.balances_at(params.on, employee_ids=[employee.id for employee in employees])
    rows = []
    for employee in employees:
        figures = balance_selectors.figures(employee.id, today=params.on)
        rows.append(
            {
                "employee": people.name(employee.id),
                "department": people.department(employee.id),
                "balance": posted.get(employee.id, ZERO),
                "pending": figures.pending,
                "approved_upcoming": figures.approved_upcoming,
            }
        )

    overall = {
        key: sum((row[key] for row in rows), ZERO) for key in ("balance", "pending", "approved_upcoming")
    }
    return ReportResult(
        columns=columns, rows=rows, totals=[TotalLine("overall", translate("reports.total", lang), overall)]
    )
```

- [ ] **Step 4: Run them to see them pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_balances.py -v`
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/reports/tabular/balances.py backend/apps/reports/tests/test_tabular_balances.py
git commit -m "feat(reports): add the balances at a date report"
```

---

### Task 7: Report "Requests waiting"

**Files:**
- Create: `backend/apps/reports/tabular/waiting.py`
- Test: `backend/apps/reports/tests/test_tabular_waiting.py`

**Interfaces:**
- Consumes: `apps.requests.selectors.waiting_rows(*, employee_ids=None) -> list[WaitingRow]` (each with `request`, `step`, `waiting_on: list[str]`, `since: datetime | None`, `reminded_at`, `flagged_at`; the longest wait first); `types.type_facts()` (Task 1); the framework of Task 3.
- Produces: `apps.reports.tabular.waiting.ACCEPTS` and `waiting.build(user, params, lang, now) -> ReportResult`. Columns: `requester`, `type`, `period`, `waiting_on`, `since`, `age_days`, `reminded`, `alerted`. No totals. The longest wait first, as the selector returns them.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/reports/tests/test_tabular_waiting.py`:

```python
from datetime import date, timedelta

import pytest
from django.utils import timezone

from apps.core.errors import DomainError
from apps.organisation import selectors as organisation_selectors
from apps.reports.tabular import framework, waiting
from apps.reports.tabular.framework import Period, parse_params

pytestmark = pytest.mark.django_db


def _run(user, lang="fr", now=None, **query):
    params = parse_params(query, user=user, accepts=waiting.ACCEPTS, today=date(2026, 12, 1))
    return waiting.build(user, params, lang, now or timezone.now())


def _name(employee):
    return organisation_selectors.full_name(employee)


def test_columns(world, november):
    result = _run(world.hr_user)

    assert [column.key for column in result.columns] == [
        "requester",
        "type",
        "period",
        "waiting_on",
        "since",
        "age_days",
        "reminded",
        "alerted",
    ]
    assert result.totals is None


def test_hr_sees_the_request_nobody_decided(world, november):
    result = _run(world.hr_user)

    assert len(result.rows) == 1
    row = result.rows[0]
    assert row["requester"] == _name(world.owner)
    assert row["type"] == world.annual.name_fr
    assert row["period"] == Period(date(2026, 11, 9), date(2026, 11, 10))
    assert _name(world.manager) in row["waiting_on"]
    assert row["since"] == timezone.now()  # the clock is frozen: the step became active at this instant
    assert row["reminded"] is None
    assert row["alerted"] is None


def test_age_is_counted_in_whole_days(world, november):
    assert _run(world.hr_user).rows[0]["age_days"] == 0

    later = timezone.now() + timedelta(days=3, hours=5)

    assert _run(world.hr_user, now=later).rows[0]["age_days"] == 3


def test_step_filter(world, november):
    assert len(_run(world.hr_user, step="line_manager").rows) == 1
    assert _run(world.hr_user, step="hr_role").rows == []


def test_type_filter(world, november):
    assert len(_run(world.hr_user, type="annual").rows) == 1
    assert _run(world.hr_user, type="sick").rows == []


def test_unknown_type_is_refused(world, november):
    with pytest.raises(DomainError) as refused:
        _run(world.hr_user, type="sabbatical")

    assert refused.value.code == "reports.unknown_type"


def test_department_filter(world, november):
    assert len(_run(world.hr_user, department=str(world.dept_a.id)).rows) == 1
    assert _run(world.hr_user, department=str(world.dept_b.id)).rows == []


def test_each_manager_sees_their_own_team(world, november):
    assert len(_run(world.manager_user).rows) == 1
    assert _run(world.other_manager_user).rows == []


def test_empty_scope_never_queries_everyone(world, november, monkeypatch):
    def forbidden(**kwargs):
        raise AssertionError("waiting_rows must not be called when nobody is in scope")

    monkeypatch.setattr(framework.reach, "team_ids", lambda user, **kwargs: set())
    monkeypatch.setattr(waiting.request_selectors, "waiting_rows", forbidden)

    assert _run(world.manager_user).rows == []
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_waiting.py -v`
Expected: collection ERROR with `ImportError: cannot import name 'waiting' from 'apps.reports.tabular'`

- [ ] **Step 3: Write the builder**

Create `backend/apps/reports/tabular/waiting.py`:

```python
"""Requests waiting: every request with a pending step, who it waits on and for how long."""

from __future__ import annotations

from datetime import datetime

from apps.core.errors import DomainError
from apps.requests import selectors as request_selectors

from .framework import People, Period, ReportParams, ReportResult, col, employees_in_scope
from .types import type_facts

ACCEPTS = frozenset({"department", "type", "step"})


def build(user, params: ReportParams, lang: str, now: datetime) -> ReportResult:
    columns = [
        col("requester", "text", lang),
        col("type", "text", lang),
        col("period", "period", lang),
        col("waiting_on", "text", lang),
        col("since", "datetime", lang),
        col("age_days", "number", lang),
        col("reminded", "datetime", lang),
        col("alerted", "datetime", lang),
    ]
    facts = type_facts()
    if params.type_code and params.type_code not in facts:
        raise DomainError("reports.unknown_type", field="type")

    employees = employees_in_scope(user, params, include_archived=True)
    if not employees:
        return ReportResult(columns=columns, rows=[], totals=None)
    people = People(employees, lang)

    items = request_selectors.waiting_rows(employee_ids=[employee.id for employee in employees])
    rows = []
    for item in items:  # the selector returns the longest wait first
        request = item.request
        code = request.request_type.code
        if params.type_code and code != params.type_code:
            continue
        if params.step and item.step.approver_rule != params.step:
            continue
        rows.append(
            {
                "requester": people.name(request.employee_id),
                "type": facts[code].name(lang),
                "period": Period(request.start_date, request.end_date),
                "waiting_on": ", ".join(item.waiting_on),
                "since": item.since,
                "age_days": None if item.since is None else max(0, (now - item.since).days),
                "reminded": item.reminded_at,
                "alerted": item.flagged_at,
            }
        )
    return ReportResult(columns=columns, rows=rows, totals=None)
```

- [ ] **Step 4: Run them to see them pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_waiting.py -v`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/reports/tabular/waiting.py backend/apps/reports/tests/test_tabular_waiting.py
git commit -m "feat(reports): add the requests waiting report"
```

---

### Task 8: Reports "Permission hours by month" and "Remote days by month"

One row per employee, twelve month columns and a total, for one year. Both reports share one builder.

**Files:**
- Create: `backend/apps/reports/tabular/monthly.py`
- Test: `backend/apps/reports/tests/test_tabular_monthly.py`

**Interfaces:**
- Consumes: `apps.requests.selectors.day_rows`; `types.type_facts()` (Task 1); the framework of Task 3; `scenario.approved`.
- Produces: `apps.reports.tabular.monthly.ACCEPTS`, `MONTH_KEYS` (`["m01", …, "m12"]`), `build_permission_hours(user, params, lang, now)` and `build_remote_days(user, params, lang, now)`, both returning `ReportResult`. Columns: `employee`, `m01` to `m12`, `total`. A month without anything is `None`. Employees with nothing in the year are not listed. One `overall` total line.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/reports/tests/test_tabular_monthly.py`:

```python
from datetime import date
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.organisation import selectors as organisation_selectors
from apps.reports.tabular import framework, monthly
from apps.reports.tabular.framework import parse_params
from apps.reports.tests import scenario

pytestmark = pytest.mark.django_db


def _run(builder, user, lang="fr", **query):
    params = parse_params(query, user=user, accepts=monthly.ACCEPTS, today=date(2026, 12, 1))
    return builder(user, params, lang, timezone.now())


def _name(employee):
    return organisation_selectors.full_name(employee)


def _row(result, employee):
    return next(row for row in result.rows if row["employee"] == _name(employee))


def test_columns_are_the_employee_twelve_months_and_a_total(world, november):
    result = _run(monthly.build_permission_hours, world.hr_user, year="2026")

    assert [column.key for column in result.columns] == ["employee", *monthly.MONTH_KEYS, "total"]
    assert result.columns[11].label == "Nov."
    assert all(column.kind == "number" for column in result.columns[1:])


def test_permission_hours_fall_in_their_month(world, november):
    result = _run(monthly.build_permission_hours, world.hr_user, year="2026")

    assert [row["employee"] for row in result.rows] == [_name(world.owner)]
    owner = result.rows[0]
    assert owner["m11"] == Decimal("2.5")
    assert owner["m10"] is None
    assert owner["total"] == Decimal("2.5")
    assert result.totals[0].values["m11"] == Decimal("2.5")
    assert result.totals[0].values["total"] == Decimal("2.5")


def test_remote_days_fall_in_their_month(world, november):
    result = _run(monthly.build_remote_days, world.hr_user, year="2026")

    owner = _row(result, world.owner)
    assert owner["m11"] == Decimal("2")
    assert owner["total"] == Decimal("2")


def test_remote_days_across_new_year_are_split_between_the_two_years(world, november):
    scenario.approved(
        world, employee=world.peer, request_type=world.remote, start=date(2026, 12, 31), end=date(2027, 1, 1)
    )

    this_year = _run(monthly.build_remote_days, world.hr_user, year="2026")
    next_year = _run(monthly.build_remote_days, world.hr_user, year="2027")

    assert _row(this_year, world.peer)["m12"] == Decimal("1")
    assert _row(this_year, world.peer)["total"] == Decimal("1")
    assert _row(next_year, world.peer)["m01"] == Decimal("1")
    assert [row["employee"] for row in next_year.rows] == [_name(world.peer)]


def test_the_year_defaults_to_the_current_one(world, november):
    result = _run(monthly.build_remote_days, world.hr_user)

    assert _row(result, world.owner)["m11"] == Decimal("2")


def test_a_year_with_nothing_is_empty(world, november):
    result = _run(monthly.build_permission_hours, world.hr_user, year="2025")

    assert result.rows == []
    assert result.totals is None


def test_a_manager_sees_the_team_only(world, november):
    assert [row["employee"] for row in _run(monthly.build_remote_days, world.manager_user, year="2026").rows] == [
        _name(world.owner)
    ]
    assert _run(monthly.build_remote_days, world.other_manager_user, year="2026").rows == []


def test_empty_scope_never_queries_everyone(world, november, monkeypatch):
    def forbidden(**kwargs):
        raise AssertionError("day_rows must not be called when nobody is in scope")

    monkeypatch.setattr(framework.reach, "team_ids", lambda user, **kwargs: set())
    monkeypatch.setattr(monthly.request_selectors, "day_rows", forbidden)

    assert _run(monthly.build_remote_days, world.manager_user, year="2026").rows == []


def test_no_matching_type_never_queries_every_type(world, november, monkeypatch):
    def forbidden(**kwargs):
        raise AssertionError("day_rows must not be called without a type to look for")

    day_types_only = {code: fact for code, fact in monthly.type_facts().items() if fact.unit == "day"}
    monkeypatch.setattr(monthly, "type_facts", lambda: day_types_only)
    monkeypatch.setattr(monthly.request_selectors, "day_rows", forbidden)

    assert _run(monthly.build_permission_hours, world.hr_user, year="2026").rows == []
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_monthly.py -v`
Expected: collection ERROR with `ImportError: cannot import name 'monthly' from 'apps.reports.tabular'`

- [ ] **Step 3: Write the builder**

Create `backend/apps/reports/tabular/monthly.py`:

```python
"""Permission hours by month and remote days by month: one row per employee for one year."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from datetime import date, datetime
from decimal import Decimal

from apps.core.i18n import translate
from apps.requests import selectors as request_selectors

from .framework import People, ReportParams, ReportResult, TotalLine, col, employees_in_scope
from .types import type_facts

ACCEPTS = frozenset({"year", "department", "employee"})
MONTH_KEYS = [f"m{month:02d}" for month in range(1, 13)]
ZERO = Decimal("0")


def build_permission_hours(user, params: ReportParams, lang: str, now: datetime) -> ReportResult:
    return _build(user, params, lang, pick=lambda fact: fact.unit == "hour", hourly=True)


def build_remote_days(user, params: ReportParams, lang: str, now: datetime) -> ReportResult:
    return _build(
        user, params, lang, pick=lambda fact: fact.unit == "day" and fact.calendar_label == "remote", hourly=False
    )


def _build(user, params: ReportParams, lang: str, *, pick: Callable, hourly: bool) -> ReportResult:
    columns = [
        col("employee", "text", lang),
        *[col(key, "number", lang) for key in MONTH_KEYS],
        col("total", "number", lang),
    ]
    employees = employees_in_scope(user, params, include_archived=True)
    codes = [code for code, fact in type_facts().items() if pick(fact)]
    if not employees or not codes:
        # An empty list must never reach day_rows, where it could be read as "no filter".
        return ReportResult(columns=columns, rows=[], totals=None)
    people = People(employees, lang)

    day_rows = request_selectors.day_rows(
        start=date(params.year, 1, 1),
        end=date(params.year, 12, 31),
        statuses=["approved"],
        employee_ids=[employee.id for employee in employees],
        type_codes=codes,
    )
    grid: dict[int, dict[str, Decimal]] = defaultdict(dict)
    for row in day_rows:
        key = f"m{row.day.month:02d}"
        amount = (row.hours or ZERO) if hourly else row.portion
        grid[row.employee_id][key] = grid[row.employee_id].get(key, ZERO) + amount

    rows = []
    for employee in employees:  # already sorted by name
        months = grid.get(employee.id, {})
        total = sum(months.values(), ZERO)
        if total == ZERO:
            continue
        line: dict = {"employee": people.name(employee.id)}
        line.update({key: months.get(key) or None for key in MONTH_KEYS})
        line["total"] = total
        rows.append(line)
    if not rows:
        return ReportResult(columns=columns, rows=[], totals=None)

    overall: dict = {key: sum((row[key] or ZERO for row in rows), ZERO) or None for key in MONTH_KEYS}
    overall["total"] = sum((row["total"] for row in rows), ZERO)
    return ReportResult(
        columns=columns, rows=rows, totals=[TotalLine("overall", translate("reports.total", lang), overall)]
    )
```

- [ ] **Step 4: Run them to see them pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_monthly.py -v`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/reports/tabular/monthly.py backend/apps/reports/tests/test_tabular_monthly.py
git commit -m "feat(reports): add the monthly permission hours and remote days reports"
```

---

### Task 9: Report "Certificates outstanding"

HR only (the role check itself is in Task 10; this task builds the content and proves it carries no medical detail).

**Files:**
- Create: `backend/apps/reports/tabular/certificates.py`
- Test: `backend/apps/reports/tests/test_tabular_certificates.py`

**Interfaces:**
- Consumes: `apps.requests.selectors.outstanding_certificates(*, employee_ids=None, now=None) -> list[CertificateRow]` (each with `request`, `due_at: datetime | None`, `overdue: timedelta | None`); the framework of Task 3; `scenario.pending`, `scenario.SICK_COMMENT`.
- Produces: `apps.reports.tabular.certificates.ACCEPTS` and `certificates.build(user, params, lang, now) -> ReportResult`. Columns: `employee`, `department`, `period`, `due`, `overdue_hours`. No totals. Earliest deadline first.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/reports/tests/test_tabular_certificates.py`:

```python
from datetime import date, timedelta

import pytest
from django.utils import timezone

from apps.organisation import selectors as organisation_selectors
from apps.reports.tabular import certificates
from apps.reports.tabular.framework import Period, parse_params
from apps.reports.tests import scenario

pytestmark = pytest.mark.django_db


@pytest.fixture
def undocumented(world, november):
    """A sick leave of the peer, declared now, with a comment and no certificate."""
    return scenario.pending(
        world,
        employee=world.peer,
        request_type=world.sick,
        start=date(2026, 11, 26),
        end=date(2026, 11, 27),
        comment=scenario.SICK_COMMENT,
    )


def _run(user, lang="fr", now=None, **query):
    params = parse_params(query, user=user, accepts=certificates.ACCEPTS, today=date(2026, 12, 1))
    return certificates.build(user, params, lang, now or timezone.now())


def _row(result, employee):
    name = organisation_selectors.full_name(employee)
    return next(row for row in result.rows if row["employee"] == name)


def test_columns(world, undocumented):
    result = _run(world.hr_user)

    assert [column.key for column in result.columns] == ["employee", "department", "period", "due", "overdue_hours"]
    assert result.totals is None


def test_a_sick_leave_without_certificate_is_listed_with_its_deadline(world, undocumented):
    row = _row(_run(world.hr_user), world.peer)

    assert row["period"] == Period(date(2026, 11, 26), date(2026, 11, 27))
    assert row["due"] == undocumented.certificate_due_at
    assert row["overdue_hours"] is None


def test_overdue_is_counted_in_whole_hours(world, undocumented):
    later = undocumented.certificate_due_at + timedelta(hours=25, minutes=40)

    row = _row(_run(world.hr_user, now=later), world.peer)

    assert row["overdue_hours"] == 25


def test_department_filter(world, undocumented):
    in_a = _run(world.hr_user, department=str(world.dept_a.id))
    in_b = _run(world.hr_user, department=str(world.dept_b.id))

    peer = organisation_selectors.full_name(world.peer)
    assert peer in {row["employee"] for row in in_a.rows}
    assert peer not in {row["employee"] for row in in_b.rows}


def test_certificates_report_carries_no_medical_detail(world, undocumented):
    result = _run(world.hr_user)

    everything = repr(result)
    assert scenario.SICK_COMMENT not in everything
    assert "Karray" not in everything
    assert "comment" not in {column.key for column in result.columns}


def test_empty_scope_never_queries_everyone(world, undocumented, monkeypatch):
    def forbidden(**kwargs):
        raise AssertionError("outstanding_certificates must not be called when nobody is in scope")

    monkeypatch.setattr(certificates, "employees_in_scope", lambda user, params, include_archived: [])
    monkeypatch.setattr(certificates.request_selectors, "outstanding_certificates", forbidden)

    assert _run(world.hr_user).rows == []
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_certificates.py -v`
Expected: collection ERROR with `ImportError: cannot import name 'certificates' from 'apps.reports.tabular'`

- [ ] **Step 3: Write the builder**

Create `backend/apps/reports/tabular/certificates.py`:

```python
"""Certificates outstanding: sick leaves still waiting for their medical certificate. Dates only, never content."""

from __future__ import annotations

from datetime import datetime

from apps.requests import selectors as request_selectors

from .framework import People, Period, ReportParams, ReportResult, col, employees_in_scope

ACCEPTS = frozenset({"department"})


def build(user, params: ReportParams, lang: str, now: datetime) -> ReportResult:
    columns = [
        col("employee", "text", lang),
        col("department", "text", lang),
        col("period", "period", lang),
        col("due", "datetime", lang),
        col("overdue_hours", "number", lang),
    ]
    employees = employees_in_scope(user, params, include_archived=True)
    if not employees:
        return ReportResult(columns=columns, rows=[], totals=None)
    people = People(employees, lang)

    items = request_selectors.outstanding_certificates(employee_ids=[employee.id for employee in employees], now=now)
    rows = []
    for item in items:  # the selector returns the earliest deadline first
        request = item.request
        rows.append(
            {
                "employee": people.name(request.employee_id),
                "department": people.department(request.employee_id),
                "period": Period(request.start_date, request.end_date),
                "due": item.due_at,
                "overdue_hours": None if item.overdue is None else int(item.overdue.total_seconds() // 3600),
            }
        )
    return ReportResult(columns=columns, rows=rows, totals=None)
```

- [ ] **Step 4: Run them to see them pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_certificates.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/reports/tabular/certificates.py backend/apps/reports/tests/test_tabular_certificates.py
git commit -m "feat(reports): add the certificates outstanding report"
```

---

### Task 10: Registry, running, exporting and filter options

**Files:**
- Create: `backend/apps/reports/tabular/registry.py`
- Test: `backend/apps/reports/tests/test_tabular_registry.py`

**Interfaces:**
- Consumes: the five builder modules; `framework.parse_params`, `resolve_scope`, `employees_in_scope`, `People`; `types.type_facts`; `apps.core.i18n.active_language`; `render.to_workbook`; `apps.audit.services.record`.
- Produces (in `apps.reports.tabular.registry`):
  - `ReportDef(name, title_code, accepts, build, hr_only=False)` and `REPORTS: dict[str, ReportDef]` with the keys `absences`, `balances`, `waiting`, `permission-hours`, `remote-days`, `certificates`
  - `ReportRun(definition, params, result, lang)`
  - `run_report(*, user, name: str, query: Mapping[str, str], now: datetime | None = None) -> ReportRun`; raises `NotFound("reports.unknown_report")`, `NotAllowed("reports.hr_only")`
  - `export_report(*, user, name: str, query: Mapping[str, str], now: datetime | None = None) -> tuple[bytes, str]` (workbook, file name `"<name>_<YYYY-MM-DD>.xlsx"`); writes the business audit event `report.exported` with `changes = {"filters": {...}, "rows": <count>}`
  - `filter_options(*, user, scope: str | None) -> dict`: `{"scope", "departments": [{"id", "name"}], "employees": [{"public_id", "name"}], "actors": [{"public_id", "name"}], "types": [{"code", "name"}], "steps": [{"code", "name"}]}`. `departments` and `actors` are empty in team scope. `actors` lists the accounts of the employees in scope (account `public_id`, the value the audit API filters on): HR may not list accounts, and the activity log needs them for its "who" filter (plan 01b, contract note 12).

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/reports/tests/test_tabular_registry.py`:

```python
from io import BytesIO

import pytest
from django.utils import translation
from openpyxl import load_workbook

from apps.audit.models import AuditEvent
from apps.core.errors import NotAllowed, NotFound
from apps.organisation import selectors as organisation_selectors
from apps.reports.tabular.registry import REPORTS, export_report, filter_options, run_report

pytestmark = pytest.mark.django_db

NOVEMBER = {"from": "2026-11-01", "to": "2026-11-30"}


def _grid(content: bytes) -> list[tuple]:
    return list(load_workbook(BytesIO(content)).active.iter_rows(values_only=True))


def _header_index(grid, first_label):
    return next(index for index, row in enumerate(grid) if row and row[0] == first_label)


def test_the_six_reports_are_registered():
    assert set(REPORTS) == {"absences", "balances", "waiting", "permission-hours", "remote-days", "certificates"}
    assert [name for name, definition in REPORTS.items() if definition.hr_only] == ["certificates"]


def test_unknown_report_is_not_found(world):
    with pytest.raises(NotFound) as refused:
        run_report(user=world.hr_user, name="payroll", query={})

    assert refused.value.code == "reports.unknown_report"


def test_run_returns_definition_parameters_and_result(world, november):
    run = run_report(user=world.hr_user, name="absences", query=NOVEMBER)

    assert run.definition.name == "absences"
    assert run.params.scope == "all"
    assert len(run.result.rows) == 7


def test_a_manager_runs_reports_for_the_team(world, november):
    run = run_report(user=world.manager_user, name="absences", query=NOVEMBER)

    assert run.params.scope == "team"
    assert len(run.result.rows) == 6


def test_certificates_are_for_hr_only(world, november):
    for user in (world.manager_user, world.exec_user):
        with pytest.raises(NotAllowed) as refused:
            run_report(user=user, name="certificates", query={})
        assert refused.value.code == "reports.hr_only"

    assert run_report(user=world.hr_user, name="certificates", query={}).definition.hr_only is True


def test_export_returns_a_workbook_and_a_file_name(world, november):
    with translation.override("fr"):
        content, filename = export_report(user=world.hr_user, name="absences", query=NOVEMBER)

    assert filename == "absences_2026-12-01.xlsx"
    grid = _grid(content)
    header = _header_index(grid, "Salarié")
    assert grid[header][:7] == ("Salarié", "Département", "Type", "Du", "Au", "Jours", "Heures")
    assert grid[header + 8][0] == "Total"  # seven data rows, then the overall total
    assert grid[header + 8][5] == 8


def test_export_follows_the_readers_language(world, november):
    with translation.override("en"):
        content, _ = export_report(user=world.hr_user, name="absences", query=NOVEMBER)

    assert _grid(content)[_header_index(_grid(content), "Employee")][3:5] == ("From", "To")


def test_export_is_audited_with_its_filters(world, november):
    export_report(user=world.hr_user, name="absences", query={**NOVEMBER, "type": "sick"})

    event = AuditEvent.objects.filter(action="report.exported").latest("at")
    assert event.category == "business"
    assert event.actor == world.hr_user
    assert (event.object_type, event.object_id) == ("report", "absences")
    assert event.changes == {
        "filters": {"scope": "all", "from": "2026-11-01", "to": "2026-11-30", "type": "sick"},
        "rows": 2,
    }


def test_looking_at_a_report_is_not_an_export(world, november):
    run_report(user=world.hr_user, name="absences", query=NOVEMBER)

    assert not AuditEvent.objects.filter(action="report.exported").exists()


def test_filter_options_for_hr(world, november):
    with translation.override("fr"):
        options = filter_options(user=world.hr_user, scope=None)

    assert options["scope"] == "all"
    assert {"id": world.dept_a.id, "name": organisation_selectors.department_name(world.owner, "fr")} in options[
        "departments"
    ]
    assert {
        "public_id": str(world.owner.public_id),
        "name": organisation_selectors.full_name(world.owner),
    } in options["employees"]
    assert {"code": "annual", "name": world.annual.name_fr} in options["types"]
    assert [step["code"] for step in options["steps"]] == ["line_manager", "hr_role", "named_person"]
    assert options["steps"][1]["name"] == "RH"
    assert {
        "public_id": str(world.manager_user.public_id),
        "name": organisation_selectors.full_name(world.manager),
    } in options["actors"]
    assert str(world.sysadmin_user.public_id) not in {actor["public_id"] for actor in options["actors"]}


def test_filter_options_for_a_manager_are_the_team_without_departments(world, november):
    options = filter_options(user=world.manager_user, scope="team")

    assert options["scope"] == "team"
    assert options["departments"] == []
    assert options["actors"] == []
    assert {employee["public_id"] for employee in options["employees"]} == {
        str(world.owner.public_id),
        str(world.peer.public_id),
    }


def test_filter_options_refuse_a_scope_the_user_does_not_hold(world):
    with pytest.raises(NotAllowed):
        filter_options(user=world.manager_user, scope="all")
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_registry.py -v`
Expected: collection ERROR with `ModuleNotFoundError: No module named 'apps.reports.tabular.registry'`

- [ ] **Step 3: Write the registry**

Create `backend/apps/reports/tabular/registry.py`:

```python
"""The six reports by name; running one; exporting one (audited); the options of their filters."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from django.utils import timezone

from apps.accounts.roles import Role, has_role
from apps.audit import services as audit
from apps.core.errors import NotAllowed, NotFound
from apps.core.i18n import active_language, translate

from . import absences, balances, certificates, monthly, waiting
from .framework import (
    SCOPE_ALL,
    STEP_RULES,
    People,
    ReportParams,
    ReportResult,
    employees_in_scope,
    parse_params,
    resolve_scope,
)
from .render import to_workbook
from .types import type_facts


@dataclass(frozen=True)
class ReportDef:
    name: str
    title_code: str
    accepts: frozenset[str]
    build: Callable[[Any, ReportParams, str, datetime], ReportResult]
    hr_only: bool = False


@dataclass(frozen=True)
class ReportRun:
    definition: ReportDef
    params: ReportParams
    result: ReportResult
    lang: str


REPORTS: dict[str, ReportDef] = {
    definition.name: definition
    for definition in (
        ReportDef("absences", "reports.title_absences", absences.ACCEPTS, absences.build),
        ReportDef("balances", "reports.title_balances", balances.ACCEPTS, balances.build),
        ReportDef("waiting", "reports.title_waiting", waiting.ACCEPTS, waiting.build),
        ReportDef(
            "permission-hours", "reports.title_permission_hours", monthly.ACCEPTS, monthly.build_permission_hours
        ),
        ReportDef("remote-days", "reports.title_remote_days", monthly.ACCEPTS, monthly.build_remote_days),
        ReportDef(
            "certificates", "reports.title_certificates", certificates.ACCEPTS, certificates.build, hr_only=True
        ),
    )
}


def run_report(*, user, name: str, query: Mapping[str, str], now: datetime | None = None) -> ReportRun:
    definition = REPORTS.get(name)
    if definition is None:
        raise NotFound("reports.unknown_report")
    if definition.hr_only and not has_role(user, Role.HR):
        raise NotAllowed("reports.hr_only")
    now = now or timezone.now()
    params = parse_params(query, user=user, accepts=definition.accepts, today=timezone.localtime(now).date())
    if definition.hr_only and params.scope != SCOPE_ALL:
        raise NotAllowed("reports.hr_only")
    lang = active_language()
    return ReportRun(definition=definition, params=params, result=definition.build(user, params, lang, now), lang=lang)


def export_report(*, user, name: str, query: Mapping[str, str], now: datetime | None = None) -> tuple[bytes, str]:
    now = now or timezone.now()
    run = run_report(user=user, name=name, query=query, now=now)
    title = translate(run.definition.title_code, run.lang)
    content = to_workbook(run.result, title=title, lang=run.lang)
    audit.record(
        action="report.exported",
        object_type="report",
        object_id=name,
        object_label=title,
        changes={"filters": run.params.as_audit(), "rows": len(run.result.rows)},
        actor=user,
    )
    return content, f"{name}_{timezone.localtime(now).date().isoformat()}.xlsx"


def filter_options(*, user, scope: str | None) -> dict[str, Any]:
    """What the filters of a report page may offer this user: never more than the report itself would show."""
    resolved = resolve_scope(user, scope)
    lang = active_language()
    employees = employees_in_scope(user, ReportParams(scope=resolved), include_archived=True)
    people = People(employees, lang)
    whole_company = resolved == SCOPE_ALL
    return {
        "scope": resolved,
        "departments": [{"id": key, "name": name} for key, name in people.department_options()] if whole_company else [],
        "employees": [{"public_id": str(employee.public_id), "name": people.name(employee.id)} for employee in employees],
        # `employee.user` is the account this employee row points to (master D6); only its public id is read.
        "actors": [
            {"public_id": str(employee.user.public_id), "name": people.name(employee.id)}
            for employee in employees
            if employee.user_id is not None
        ]
        if whole_company
        else [],
        "types": [{"code": code, "name": fact.name(lang)} for code, fact in type_facts().items()],
        "steps": [{"code": rule, "name": translate(f"reports.step_{rule}", lang)} for rule in STEP_RULES],
    }
```

- [ ] **Step 4: Run them to see them pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_tabular_registry.py -v`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/reports/tabular/registry.py backend/apps/reports/tests/test_tabular_registry.py
git commit -m "feat(reports): register the six reports with audited export and filter options"
```

---

### Task 11: KPMG export

One row per employee with the ten columns of REP-04, for a period, as a workbook. The test of this task is the step's "done when": a month that matches the hand calculation at the top of this plan.

**Files:**
- Create: `backend/apps/reports/kpmg.py`
- Test: `backend/apps/reports/tests/test_kpmg.py`

**Interfaces:**
- Consumes: `apps.requests.selectors.day_rows`; `types.type_facts`; `apps.balances.selectors.balances_at`; `apps.settings.services.get`; `apps.audit.services.record`; `apps.core.i18n.active_language`; `framework.parse_params`, `employees_in_scope`, `People`, `col`; `render.to_workbook`; `Employee.hire_date` and `Employee.archived_at` (the leaving date; plan 02, contract note 1).
- Produces (in `apps.reports.kpmg`):
  - `KPMG_COLUMNS: tuple[tuple[str, str], ...]` (key, kind) in file order: `employee_number`, `name`, `department`, `annual_days`, `sick_days`, `exceptional_days`, `permission_hours`, `remote_days`, `balance_end`, `meal_tickets`
  - `months_covered(start: date, end: date) -> int` (whole months of the period, at least 1)
  - `default_period(*, today: date | None = None) -> tuple[date, date, int | None]` (start, end, cut-off day)
  - `build_kpmg(*, user, query: Mapping[str, str], now: datetime | None = None) -> tuple[ReportParams, ReportResult]`; raises `DomainError("reports.nothing_to_export")`
  - `export_kpmg(*, user, query: Mapping[str, str], now: datetime | None = None) -> tuple[bytes, str]` (workbook, `"kpmg_<from>_<to>.xlsx"`); writes the business audit event `export.kpmg`

Rules fixed here (see Contract notes): the annual, sick and exceptional columns count the types with those codes; permission hours count every hour-based type; remote days count every day-based type whose calendar label is `remote`. A meal ticket is lost for each date on which the portions of ticket-reducing types add up to a full day. The base is the setting times `months_covered`. The type filter narrows the five absence columns; meal tickets and the balance are always complete. An employee appears when hired on or before the period end and still employed on its first day: someone who left appears in every period up to the one that contains the leaving date, and in none after.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/reports/tests/test_kpmg.py`:

```python
from datetime import date
from decimal import Decimal
from io import BytesIO

import pytest
from django.utils import translation
from openpyxl import load_workbook

from apps.audit.models import AuditEvent
from apps.core.errors import DomainError
from apps.organisation import selectors as organisation_selectors
from apps.organisation import services as organisation_services
from apps.reports.kpmg import KPMG_COLUMNS, build_kpmg, default_period, export_kpmg, months_covered
from apps.reports.tests import scenario
from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db

NOVEMBER = {"from": "2026-11-01", "to": "2026-11-30"}


def _rows(user, query=None, **extra):
    with translation.override("fr"):
        _, result = build_kpmg(user=user, query={**(query or NOVEMBER), **extra})
    return {row["employee_number"]: row for row in result.rows}


def _grid(content: bytes) -> list[tuple]:
    return list(load_workbook(BytesIO(content)).active.iter_rows(values_only=True))


def test_the_ten_columns_of_the_file(world, november):
    with translation.override("fr"):
        _, result = build_kpmg(user=world.hr_user, query=NOVEMBER)

    assert [column.key for column in result.columns] == [key for key, _ in KPMG_COLUMNS]
    assert [column.label for column in result.columns] == [
        "Matricule",
        "Nom",
        "Département",
        "Congé annuel (jours)",
        "Congé maladie (jours)",
        "Congé exceptionnel (jours)",
        "Permissions (heures)",
        "Télétravail (jours)",
        "Solde annuel en fin de période",
        "Tickets restaurant",
    ]
    assert result.totals is None


def test_november_matches_the_hand_calculation(world, november):
    rows = _rows(world.hr_user)

    owner = rows[world.owner.employee_number]
    assert owner["name"] == organisation_selectors.full_name(world.owner)
    assert owner["annual_days"] == Decimal("1.5")
    assert owner["sick_days"] == Decimal("0.5")
    assert owner["exceptional_days"] == Decimal("1")
    assert owner["permission_hours"] == Decimal("2.5")
    assert owner["remote_days"] == Decimal("2")
    assert owner["balance_end"] == Decimal("16.5")
    assert owner["meal_tickets"] == 18

    outsider = rows[world.outsider.employee_number]
    assert outsider["sick_days"] == Decimal("3")
    assert outsider["annual_days"] == Decimal("0")
    assert outsider["balance_end"] == Decimal("0")
    assert outsider["meal_tickets"] == 18

    peer = rows[world.peer.employee_number]
    assert [peer[key] for key, kind in KPMG_COLUMNS[3:8]] == [Decimal("0")] * 5
    assert peer["meal_tickets"] == 21


def test_one_row_per_employee(world, november):
    rows = _rows(world.hr_user)

    assert set(rows) == {
        employee.employee_number
        for employee in (
            world.ceo,
            world.hr,
            world.manager,
            world.owner,
            world.peer,
            world.other_manager,
            world.outsider,
        )
    }


def test_only_approved_requests_count(world, november):
    before = _rows(world.hr_user)[world.owner.employee_number]
    assert before["annual_days"] == Decimal("1.5")

    scenario.approve_fully(november.pending_annual)  # 9 and 10 November

    after = _rows(world.hr_user)[world.owner.employee_number]
    assert after["annual_days"] == Decimal("3.5")
    assert after["meal_tickets"] == 16


def test_two_half_days_on_one_day_cost_one_ticket(world, november):
    rows = _rows(world.hr_user, {"from": "2026-11-13", "to": "2026-11-13"})

    owner = rows[world.owner.employee_number]
    assert (owner["annual_days"], owner["sick_days"]) == (Decimal("0.5"), Decimal("0.5"))
    assert owner["meal_tickets"] == 20


def test_a_single_half_day_and_remote_days_cost_nothing(world, november):
    scenario.approved(
        world, employee=world.peer, request_type=world.annual, start=date(2026, 11, 16), ends_at_midday=True
    )
    scenario.approved(world, employee=world.peer, request_type=world.remote, start=date(2026, 11, 17))

    peer = _rows(world.hr_user)[world.peer.employee_number]

    assert peer["annual_days"] == Decimal("0.5")
    assert peer["remote_days"] == Decimal("1")
    assert peer["meal_tickets"] == 21


def test_type_filter_narrows_the_absence_columns_only(world, november):
    owner = _rows(world.hr_user, type="sick")[world.owner.employee_number]

    assert owner["sick_days"] == Decimal("0.5")
    assert owner["annual_days"] == Decimal("0")
    assert owner["remote_days"] == Decimal("0")
    assert owner["meal_tickets"] == 18
    assert owner["balance_end"] == Decimal("16.5")


def test_department_and_employee_filters(world, november):
    by_department = _rows(world.hr_user, department=str(world.dept_b.id))
    by_employee = _rows(world.hr_user, employee=str(world.owner.public_id))

    assert world.outsider.employee_number in by_department
    assert world.owner.employee_number not in by_department
    assert set(by_employee) == {world.owner.employee_number}


def test_nothing_to_export(world, november):
    with pytest.raises(DomainError) as refused:
        _rows(world.hr_user, department="999999")

    assert refused.value.code == "reports.nothing_to_export"


def test_someone_hired_after_the_period_is_left_out(world, november):
    organisation_services.update_employee(
        actor=world.hr_user, employee=world.peer, data={"hire_date": date(2026, 12, 1)}
    )

    assert world.peer.employee_number not in _rows(world.hr_user)


def test_a_leaver_appears_until_the_period_of_the_leaving_date(world, november):
    organisation_services.archive_employee(
        actor=world.hr_user, employee=world.peer, leaving_date=date(2026, 11, 20), reason="Resignation"
    )

    assert world.peer.employee_number in _rows(world.hr_user)  # left during November
    assert world.peer.employee_number in _rows(world.hr_user, {"from": "2026-11-20", "to": "2026-11-20"})
    assert world.peer.employee_number not in _rows(world.hr_user, {"from": "2026-11-21", "to": "2026-11-30"})
    assert world.peer.employee_number not in _rows(world.hr_user, {"from": "2026-12-01", "to": "2026-12-31"})


@pytest.mark.parametrize(
    ("start", "end", "months"),
    [
        (date(2026, 11, 1), date(2026, 11, 30), 1),
        (date(2026, 10, 26), date(2026, 11, 25), 1),
        (date(2026, 11, 10), date(2026, 11, 20), 1),
        (date(2026, 11, 30), date(2026, 12, 1), 1),
        (date(2026, 11, 1), date(2026, 12, 31), 2),
        (date(2026, 10, 26), date(2026, 12, 25), 2),
        (date(2026, 1, 1), date(2026, 12, 31), 12),
    ],
)
def test_months_covered(start, end, months):
    assert months_covered(start, end) == months


def test_a_two_month_period_doubles_the_base(world, november):
    peer = _rows(world.hr_user, {"from": "2026-11-01", "to": "2026-12-31"})[world.peer.employee_number]

    assert peer["meal_tickets"] == 42


def test_the_base_is_a_setting_and_tickets_never_go_below_zero(world, november):
    settings_service.set_value(actor=world.hr_user, key="meal_tickets_per_month", value=20)
    assert _rows(world.hr_user)[world.peer.employee_number]["meal_tickets"] == 20

    settings_service.set_value(actor=world.hr_user, key="meal_tickets_per_month", value=1)
    assert _rows(world.hr_user)[world.owner.employee_number]["meal_tickets"] == 0


def test_default_period_is_the_calendar_month(world):
    settings_service.clear_cache()

    assert default_period(today=date(2026, 11, 18)) == (date(2026, 11, 1), date(2026, 11, 30), None)
    assert default_period(today=date(2027, 2, 10)) == (date(2027, 2, 1), date(2027, 2, 28), None)


def test_default_period_with_a_cutoff_day(world):
    settings_service.set_value(actor=world.hr_user, key="export_cutoff_day", value=25)

    assert default_period(today=date(2026, 11, 18)) == (date(2026, 10, 26), date(2026, 11, 25), 25)
    assert default_period(today=date(2026, 11, 27)) == (date(2026, 10, 26), date(2026, 11, 25), 25)
    assert default_period(today=date(2027, 3, 3)) == (date(2027, 2, 26), date(2027, 3, 25), 25)


def test_default_period_in_january(world):
    settings_service.set_value(actor=world.hr_user, key="export_cutoff_day", value=25)

    assert default_period(today=date(2027, 1, 10)) == (date(2026, 12, 26), date(2027, 1, 25), 25)


def test_export_file_name_and_cells(world, november):
    with translation.override("fr"):
        content, filename = export_kpmg(user=world.hr_user, query=NOVEMBER)

    assert filename == "kpmg_2026-11-01_2026-11-30.xlsx"
    grid = _grid(content)
    header = next(index for index, row in enumerate(grid) if row and row[0] == "Matricule")
    owner = next(row for row in grid[header + 1 :] if row[0] == world.owner.employee_number)
    assert owner[3:10] == (1.5, 0.5, 1, 2.5, 2, 16.5, 18)


def test_export_headers_follow_the_readers_language(world, november):
    with translation.override("en"):
        content, _ = export_kpmg(user=world.hr_user, query=NOVEMBER)

    assert any(row and row[0] == "Employee number" and row[9] == "Meal tickets" for row in _grid(content))


def test_export_contains_no_comment(world, november):
    content, _ = export_kpmg(user=world.hr_user, query=NOVEMBER)

    text = " ".join(str(cell) for row in _grid(content) for cell in row if cell is not None)
    assert scenario.SICK_COMMENT not in text
    assert "Karray" not in text


def test_export_audit_entry_holds_filters_only(world, november):
    export_kpmg(user=world.hr_user, query={**NOVEMBER, "department": str(world.dept_a.id)})

    event = AuditEvent.objects.filter(action="export.kpmg").latest("at")
    assert event.category == "business"
    assert event.actor == world.hr_user
    assert (event.object_type, event.object_id) == ("export", "kpmg")
    assert event.changes["filters"] == {
        "scope": "all",
        "from": "2026-11-01",
        "to": "2026-11-30",
        "department": str(world.dept_a.id),
    }
    assert set(event.changes) == {"filters", "rows"}
    assert "Karray" not in repr(event.changes)
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_kpmg.py -v`
Expected: collection ERROR with `ModuleNotFoundError: No module named 'apps.reports.kpmg'`

- [ ] **Step 3: Write the export**

Create `backend/apps/reports/kpmg.py`:

```python
"""The KPMG export (REP-03 to REP-08): absence figures per employee for one payroll period."""

from __future__ import annotations

import calendar
from collections import Counter, defaultdict
from collections.abc import Mapping
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.audit import services as audit
from apps.balances import selectors as balance_selectors
from apps.core.errors import DomainError
from apps.core.i18n import active_language, translate
from apps.requests import selectors as request_selectors
from apps.settings import services as settings_service

from .tabular.framework import People, ReportParams, ReportResult, col, employees_in_scope, parse_params
from .tabular.render import to_workbook
from .tabular.types import type_facts

ACCEPTS = frozenset({"period", "department", "employee", "type"})
KPMG_COLUMNS: tuple[tuple[str, str], ...] = (
    ("employee_number", "text"),
    ("name", "text"),
    ("department", "text"),
    ("annual_days", "number"),
    ("sick_days", "number"),
    ("exceptional_days", "number"),
    ("permission_hours", "number"),
    ("remote_days", "number"),
    ("balance_end", "number"),
    ("meal_tickets", "number"),
)
ABSENCE_KEYS = ("annual_days", "sick_days", "exceptional_days", "permission_hours", "remote_days")
BY_CODE = {"annual": "annual_days", "sick": "sick_days", "exceptional": "exceptional_days"}
ZERO = Decimal("0")
FULL_DAY = Decimal("1")


def months_covered(start: date, end: date) -> int:
    """Whole months of a period, at least one: 1 to 30 Nov is 1, 26 Oct to 25 Nov is 1, 1 Nov to 31 Dec is 2."""
    months = (end.year - start.year) * 12 + (end.month - start.month) + (1 if end.day >= start.day else 0)
    return max(1, months)


def default_period(*, today: date | None = None) -> tuple[date, date, int | None]:
    """REP-07: the calendar month, or the payroll period ending on this month's cut-off day."""
    today = today or timezone.localdate()
    cutoff = settings_service.get("export_cutoff_day")
    if cutoff is None:
        last_day = calendar.monthrange(today.year, today.month)[1]
        return today.replace(day=1), today.replace(day=last_day), None
    end = today.replace(day=cutoff)  # the setting is capped at 28, so the day exists in every month
    last_of_previous_month = today.replace(day=1) - timedelta(days=1)
    start = last_of_previous_month.replace(day=cutoff) + timedelta(days=1)
    return start, end, cutoff


def _employed_in(employee, start: date, end: date) -> bool:
    """Hired on or before the last day of the period, and not gone before its first day.

    `archived_at` is the leaving date HR recorded (plan 02); it is empty while the person is employed.
    """
    if employee.hire_date > end:
        return False
    return employee.archived_at is None or employee.archived_at >= start


def _column_of(fact) -> str | None:
    if fact.unit == "hour":
        return "permission_hours"
    if fact.calendar_label == "remote":
        return "remote_days"
    return BY_CODE.get(fact.code)


def build_kpmg(*, user, query: Mapping[str, str], now: datetime | None = None) -> tuple[ReportParams, ReportResult]:
    now = now or timezone.now()
    lang = active_language()
    without_scope = {key: value for key, value in query.items() if key != "scope"}
    params = parse_params(without_scope, user=user, accepts=ACCEPTS, today=timezone.localtime(now).date())
    facts = type_facts()
    if params.type_code and params.type_code not in facts:
        raise DomainError("reports.unknown_type", field="type")
    columns = [col(key, kind, lang) for key, kind in KPMG_COLUMNS]

    employees = [
        employee
        for employee in employees_in_scope(user, params, include_archived=True)
        if _employed_in(employee, params.start, params.end)
    ]
    if not employees:
        raise DomainError("reports.nothing_to_export")
    people = People(employees, lang)

    day_rows = request_selectors.day_rows(
        start=params.start,
        end=params.end,
        statuses=["approved"],
        employee_ids=[employee.id for employee in employees],
    )

    sums: dict[int, dict[str, Decimal]] = defaultdict(lambda: dict.fromkeys(ABSENCE_KEYS, ZERO))
    absent_portion: dict[tuple[int, date], Decimal] = defaultdict(lambda: ZERO)
    for row in day_rows:
        fact = facts[row.type_code]
        if fact.unit == "day" and fact.reduces_meal_tickets:
            absent_portion[(row.employee_id, row.day)] += row.portion
        if params.type_code and row.type_code != params.type_code:
            continue
        column = _column_of(fact)
        if column is None:
            continue
        sums[row.employee_id][column] += (row.hours or ZERO) if fact.unit == "hour" else row.portion

    tickets_lost = Counter(
        employee_id for (employee_id, _day), portion in absent_portion.items() if portion >= FULL_DAY
    )
    base = settings_service.get("meal_tickets_per_month") * months_covered(params.start, params.end)
    balances = balance_selectors.balances_at(params.end, employee_ids=[employee.id for employee in employees])

    rows = []
    for employee in employees:
        row = {
            "employee_number": employee.employee_number,
            "name": people.name(employee.id),
            "department": people.department(employee.id),
        }
        row.update(sums[employee.id])
        row["balance_end"] = balances.get(employee.id, ZERO)
        row["meal_tickets"] = max(0, base - tickets_lost[employee.id])
        rows.append(row)
    return params, ReportResult(columns=columns, rows=rows, totals=None)


def export_kpmg(*, user, query: Mapping[str, str], now: datetime | None = None) -> tuple[bytes, str]:
    params, result = build_kpmg(user=user, query=query, now=now)
    lang = active_language()
    period = f"{params.start.isoformat()} {params.end.isoformat()}"
    content = to_workbook(result, title=f"KPMG {period}", lang=lang)
    audit.record(
        action="export.kpmg",
        object_type="export",
        object_id="kpmg",
        object_label=f"{translate('reports.title_kpmg', lang)} {period}",
        changes={"filters": params.as_audit(), "rows": len(result.rows)},
        actor=user,
    )
    return content, f"kpmg_{params.start.isoformat()}_{params.end.isoformat()}.xlsx"
```

- [ ] **Step 4: Run them to see them pass**

Run: `docker compose run --rm app pytest apps/reports/tests/test_kpmg.py -v`
Expected: 27 passed (21 tests, one of them with seven cases).

- [ ] **Step 5: Run every backend test of this plan so far**

Run: `docker compose run --rm app pytest apps/reports -q`
Expected: all pass, none skipped.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/reports/kpmg.py backend/apps/reports/tests/test_kpmg.py
git commit -m "feat(reports): add the KPMG export with meal tickets and period clipping"
```

---

### Task 12: The API: four endpoints, permission cases and OpenAPI

**Files:**
- Create: `backend/apps/reports/api/report_serializers.py`
- Create: `backend/apps/reports/api/report_views.py`
- Modify: `backend/apps/reports/api/urls.py` (one import, four routes)
- Modify: `backend/config/settings.py` (three entries in `ENUM_NAME_OVERRIDES`)
- Modify: `backend/apps/reports/tests/matrix.py` (append cases to `CASES`)
- Modify: `backend/openapi.yaml`, `frontend/src/api/schema.d.ts` (regenerated)
- Test: `backend/apps/reports/tests/test_report_api.py`

**Interfaces:**
- Consumes: `registry.run_report`, `export_report`, `filter_options`; `render.to_json`, `XLSX_MEDIA_TYPE`; `kpmg.export_kpmg`, `default_period`; `apps.accounts.roles.Role`; `tests.matrix.Case`, `P`, `only`; fixtures `client_for`, `anon_client`, `world`, `november`.
- Produces (paths relative to `/api/v1`):

| Path | Access | Route name | Returns |
|---|---|---|---|
| `GET report-filters?scope=` | MANAGER, HR, EXEC | `reports:report-filters` | `ReportFiltersOut`: `{scope, departments, employees, actors, types, steps}` |
| `GET reports/{name}` | MANAGER, HR, EXEC (`certificates`: HR) | `reports:report` | `ReportOut`; with `format=xlsx` a workbook download |
| `GET exports/kpmg?from=&to=&department=&employee=&type=` | HR | `reports:kpmg-export` | a workbook download; 400 `reports.nothing_to_export` |
| `GET exports/kpmg/default-period` | HR | `reports:kpmg-default-period` | `{"start", "end", "cutoff_day"}` |

  Query parameters of `reports/{name}`: `scope`, `from`, `to`, `on`, `year`, `department`, `employee`, `type`, `step`, `format`.
  `ReportOut`: `{"columns": [{"key", "label", "kind"}], "rows": [{...}], "totals": {"lines": [{"group", "label", "values"}]} | null}`.
  Operation ids (plan 01a requires one per method): `reports_filters`, `reports_run`, `kpmg_export`, `kpmg_default_period`. Enumeration names: `ReportColumnKindEnum`, `ReportTotalGroupEnum`, `ReportScopeEnum`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/reports/tests/test_report_api.py`:

```python
from datetime import date
from io import BytesIO

import pytest
from django.urls import reverse
from openpyxl import load_workbook

from apps.audit.models import AuditEvent
from apps.organisation import selectors as organisation_selectors
from apps.reports.tabular.render import XLSX_MEDIA_TYPE
from apps.reports.tests import scenario

pytestmark = pytest.mark.django_db

NOVEMBER = {"from": "2026-11-01", "to": "2026-11-30"}


@pytest.fixture(autouse=True)
def french_readers(world):
    """Labels are asserted in French; the language of each account decides the language of the answer."""
    for user in (world.hr_user, world.manager_user, world.exec_user):
        user.language = "fr"
        user.save(update_fields=["language"])


def _report(name="absences"):
    return reverse("reports:report", kwargs={"name": name})


def test_a_report_as_json(world, november, client_for):
    response = client_for(world.hr_user).get(_report(), NOVEMBER)

    assert response.status_code == 200
    body = response.json()
    assert [column["key"] for column in body["columns"]] == ["employee", "department", "type", "period", "days", "hours"]
    assert len(body["rows"]) == 7
    first = body["rows"][0]
    assert set(first["period"]) == {"start", "end"}
    assert body["totals"]["lines"][0] == {"group": "overall", "label": "Total", "values": {"days": "8.00", "hours": "2.50"}}


def test_a_report_as_a_workbook(world, november, client_for):
    response = client_for(world.hr_user).get(_report(), {**NOVEMBER, "format": "xlsx"})

    assert response.status_code == 200
    assert response["Content-Type"] == XLSX_MEDIA_TYPE
    assert response["Content-Disposition"] == 'attachment; filename="absences_2026-12-01.xlsx"'
    assert response["X-Content-Type-Options"] == "nosniff"
    assert load_workbook(BytesIO(response.content)).active.max_row >= 8
    assert AuditEvent.objects.filter(action="report.exported", object_id="absences").count() == 1


def test_json_does_not_write_an_export_event(world, november, client_for):
    client_for(world.hr_user).get(_report(), NOVEMBER)

    assert not AuditEvent.objects.filter(action="report.exported").exists()


def test_labels_follow_the_language_of_the_account(world, november, client_for):
    world.hr_user.language = "en"
    world.hr_user.save(update_fields=["language"])

    body = client_for(world.hr_user).get(_report(), NOVEMBER).json()

    assert body["columns"][0]["label"] == "Employee"


def test_unknown_report_is_404(world, client_for):
    response = client_for(world.hr_user).get(_report("payroll"))

    assert response.status_code == 404
    assert response.json()["code"] == "reports.unknown_report"


def test_a_missing_period_is_a_field_problem(world, client_for):
    response = client_for(world.hr_user).get(_report())

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "reports.period_required"
    assert body["errors"][0]["field"] == "from"
    assert body["errors"][0]["detail"]


def test_a_manager_gets_the_team(world, november, client_for):
    body = client_for(world.manager_user).get(_report(), NOVEMBER).json()

    assert {row["employee"] for row in body["rows"]} == {organisation_selectors.full_name(world.owner)}


def test_a_manager_cannot_ask_for_everyone(world, november, client_for):
    response = client_for(world.manager_user).get(_report(), {**NOVEMBER, "scope": "all"})

    assert response.status_code == 403
    assert response.json()["code"] == "reports.scope_not_allowed"


def test_a_manager_cannot_name_someone_outside_the_team(world, november, client_for):
    response = client_for(world.manager_user).get(_report(), {**NOVEMBER, "employee": str(world.outsider.public_id)})

    assert response.status_code == 404
    assert response.json()["code"] == "reports.employee_not_found"


def test_an_employee_without_a_team_is_refused(world, november, client_for):
    assert client_for(world.owner_user).get(_report(), NOVEMBER).status_code == 403


def test_certificates_are_for_hr(world, november, client_for):
    assert client_for(world.hr_user).get(_report("certificates")).status_code == 200
    for user in (world.manager_user, world.exec_user):
        response = client_for(user).get(_report("certificates"))
        assert response.status_code == 403
        assert response.json()["code"] == "reports.hr_only"


def test_no_report_shows_the_sick_leave_comment(world, november, client_for):
    scenario.pending(
        world,
        employee=world.peer,
        request_type=world.sick,
        start=date(2026, 11, 26),
        comment=scenario.SICK_COMMENT,
    )
    client = client_for(world.hr_user)

    for name, query in (
        ("absences", NOVEMBER),
        ("balances", {}),
        ("waiting", {}),
        ("permission-hours", {}),
        ("remote-days", {}),
        ("certificates", {}),
    ):
        response = client.get(_report(name), query)
        assert response.status_code == 200, name
        assert "Karray" not in response.content.decode(), name
        workbook = client.get(_report(name), {**query, "format": "xlsx"})
        cells = load_workbook(BytesIO(workbook.content)).active.iter_rows(values_only=True)
        assert "Karray" not in " ".join(str(cell) for row in cells for cell in row if cell is not None), name


def test_filter_options(world, november, client_for):
    url = reverse("reports:report-filters")

    hr = client_for(world.hr_user).get(url).json()
    manager = client_for(world.manager_user).get(url, {"scope": "team"}).json()

    assert hr["scope"] == "all"
    assert {"code": "sick", "name": world.sick.name_fr} in hr["types"]
    assert str(world.manager_user.public_id) in {actor["public_id"] for actor in hr["actors"]}
    assert manager["scope"] == "team"
    assert manager["departments"] == []
    assert manager["actors"] == []
    assert len(manager["employees"]) == 2


def test_kpmg_export_downloads_a_workbook(world, november, client_for):
    response = client_for(world.hr_user).get(reverse("reports:kpmg-export"), NOVEMBER)

    assert response.status_code == 200
    assert response["Content-Type"] == XLSX_MEDIA_TYPE
    assert response["Content-Disposition"] == 'attachment; filename="kpmg_2026-11-01_2026-11-30.xlsx"'
    assert response["Cache-Control"] == "no-store"
    assert AuditEvent.objects.filter(action="export.kpmg").count() == 1


def test_kpmg_export_with_nothing_to_export(world, november, client_for):
    response = client_for(world.hr_user).get(reverse("reports:kpmg-export"), {**NOVEMBER, "department": "999999"})

    assert response.status_code == 400
    assert response.json()["code"] == "reports.nothing_to_export"
    assert not AuditEvent.objects.filter(action="export.kpmg").exists()


def test_kpmg_export_is_for_hr_only(world, november, client_for, anon_client):
    url = reverse("reports:kpmg-export")

    assert anon_client.get(url, NOVEMBER).status_code == 401
    for user in (world.exec_user, world.manager_user, world.owner_user, world.sysadmin_user):
        assert client_for(user).get(url, NOVEMBER).status_code == 403


def test_kpmg_default_period(world, november, client_for):
    response = client_for(world.hr_user).get(reverse("reports:kpmg-default-period"))

    assert response.status_code == 200
    assert response.json() == {"start": "2026-12-01", "end": "2026-12-31", "cutoff_day": None}
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm app pytest apps/reports/tests/test_report_api.py -v`
Expected: every test FAILS with `django.urls.exceptions.NoReverseMatch: Reverse for 'report' not found` (or `'report-filters'`, `'kpmg-export'`, `'kpmg-default-period'`).

- [ ] **Step 3: Write the serializers**

Create `backend/apps/reports/api/report_serializers.py`. They describe the responses for the OpenAPI document; the views return the dictionaries built by the services.

```python
from rest_framework import serializers

# Named in ENUM_NAME_OVERRIDES (config/settings.py), so the generated client has stable type names.
COLUMN_KINDS = ["text", "number", "date", "datetime", "period"]
TOTAL_GROUPS = ["overall", "by_employee", "by_type"]
SCOPES = ["team", "all"]


class ReportColumnOut(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    kind = serializers.ChoiceField(choices=COLUMN_KINDS)


class ReportTotalLineOut(serializers.Serializer):
    group = serializers.ChoiceField(choices=TOTAL_GROUPS)
    label = serializers.CharField()
    values = serializers.DictField()


class ReportTotalsOut(serializers.Serializer):
    lines = ReportTotalLineOut(many=True)


class ReportOut(serializers.Serializer):
    columns = ReportColumnOut(many=True)
    rows = serializers.ListField(child=serializers.DictField())
    totals = ReportTotalsOut(allow_null=True)


class DepartmentOptionOut(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class EmployeeOptionOut(serializers.Serializer):
    public_id = serializers.CharField()
    name = serializers.CharField()


class CodeOptionOut(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()


class ReportFiltersOut(serializers.Serializer):
    scope = serializers.ChoiceField(choices=SCOPES)
    departments = DepartmentOptionOut(many=True)
    employees = EmployeeOptionOut(many=True)
    actors = EmployeeOptionOut(many=True)
    types = CodeOptionOut(many=True)
    steps = CodeOptionOut(many=True)


class KpmgDefaultPeriodOut(serializers.Serializer):
    start = serializers.DateField()
    end = serializers.DateField()
    cutoff_day = serializers.IntegerField(allow_null=True)
```

- [ ] **Step 4: Write the views**

Create `backend/apps/reports/api/report_views.py`:

```python
from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role
from apps.reports import kpmg
from apps.reports.tabular import registry
from apps.reports.tabular.render import XLSX_MEDIA_TYPE, to_json

from .report_serializers import KpmgDefaultPeriodOut, ReportFiltersOut, ReportOut

REPORT_NAMES = ["absences", "balances", "waiting", "permission-hours", "remote-days", "certificates"]


def _query(name: str, description: str, enum: list[str] | None = None) -> OpenApiParameter:
    return OpenApiParameter(
        name=name, type=str, location=OpenApiParameter.QUERY, required=False, description=description, enum=enum
    )


SCOPE = _query("scope", "team (the caller's team) or all (the company); defaults to the widest the caller holds", ["team", "all"])
PERIOD = [_query("from", "First day of the period, ISO date"), _query("to", "Last day of the period, ISO date")]
PEOPLE = [
    _query("department", "Department id"),
    _query("employee", "Employee public id"),
    _query("type", "Request type code"),
]


class IgnoreFormatNegotiation(DefaultContentNegotiation):
    """`format` is a parameter of the report here, not DRF's renderer override.

    Without this, DRF reads `?format=xlsx` as a request for a renderer named "xlsx", finds none
    (the API renders JSON only) and answers 404 before the view runs.
    """

    def select_renderer(self, request, renderers, format_suffix=None):
        return renderers[0], renderers[0].media_type


def xlsx_response(content: bytes, filename: str) -> HttpResponse:
    response = HttpResponse(content, content_type=XLSX_MEDIA_TYPE)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "no-store"
    return response


class ReportFiltersView(APIView):
    access = {"GET": {Role.MANAGER, Role.HR, Role.EXEC}}
    http_method_names = ["get"]

    @extend_schema(operation_id="reports_filters", parameters=[SCOPE], responses=ReportFiltersOut)
    def get(self, request):
        return Response(registry.filter_options(user=request.user, scope=request.query_params.get("scope")))


class ReportView(APIView):
    access = {"GET": {Role.MANAGER, Role.HR, Role.EXEC}}
    http_method_names = ["get"]
    content_negotiation_class = IgnoreFormatNegotiation

    @extend_schema(
        operation_id="reports_run",
        parameters=[
            OpenApiParameter(name="name", type=str, location=OpenApiParameter.PATH, enum=REPORT_NAMES),
            SCOPE,
            *PERIOD,
            _query("on", "Date of the balances report, ISO date; defaults to today"),
            _query("year", "Year of the monthly reports; defaults to the current year"),
            *PEOPLE,
            _query("step", "Step the request waits on", ["line_manager", "hr_role", "named_person"]),
            _query("format", "xlsx to download the same content as a workbook", ["xlsx"]),
        ],
        responses={(200, "application/json"): ReportOut, (200, XLSX_MEDIA_TYPE): OpenApiTypes.BINARY},
    )
    def get(self, request, name):
        query = request.query_params.dict()
        if query.get("format") == "xlsx":
            content, filename = registry.export_report(user=request.user, name=name, query=query)
            return xlsx_response(content, filename)
        run = registry.run_report(user=request.user, name=name, query=query)
        return Response(to_json(run.result))


class KpmgExportView(APIView):
    access = {"GET": {Role.HR}}
    http_method_names = ["get"]

    @extend_schema(
        operation_id="kpmg_export",
        parameters=[*PERIOD, *PEOPLE],
        responses={(200, XLSX_MEDIA_TYPE): OpenApiTypes.BINARY},
    )
    def get(self, request):
        content, filename = kpmg.export_kpmg(user=request.user, query=request.query_params.dict())
        return xlsx_response(content, filename)


class KpmgDefaultPeriodView(APIView):
    access = {"GET": {Role.HR}}
    http_method_names = ["get"]

    @extend_schema(operation_id="kpmg_default_period", responses=KpmgDefaultPeriodOut)
    def get(self, request):
        start, end, cutoff_day = kpmg.default_period()
        return Response({"start": start.isoformat(), "end": end.isoformat(), "cutoff_day": cutoff_day})
```

- [ ] **Step 5: Add the routes and name the enumerations**

In `backend/apps/reports/api/urls.py` (created by plan 05 with `app_name = "reports"` and `from apps.reports.api import views`), add the import under the existing one and append the four routes to `urlpatterns`:

```python
from apps.reports.api import report_views
```

```python
    path("report-filters", report_views.ReportFiltersView.as_view(), name="report-filters"),
    path("reports/<str:name>", report_views.ReportView.as_view(), name="report"),
    path("exports/kpmg", report_views.KpmgExportView.as_view(), name="kpmg-export"),
    path("exports/kpmg/default-period", report_views.KpmgDefaultPeriodView.as_view(), name="kpmg-default-period"),
```

In `backend/config/settings.py`, add to `SPECTACULAR_SETTINGS["ENUM_NAME_OVERRIDES"]`, after the entries of plan 05 (plan 01a's rule: one name per choice set):

```python
        "ReportColumnKindEnum": "apps.reports.api.report_serializers.COLUMN_KINDS",
        "ReportTotalGroupEnum": "apps.reports.api.report_serializers.TOTAL_GROUPS",
        "ReportScopeEnum": "apps.reports.api.report_serializers.SCOPES",
```

- [ ] **Step 6: Run the API tests**

Run: `docker compose run --rm app pytest apps/reports/tests/test_report_api.py -v`
Expected: 17 passed.

If `test_a_report_as_a_workbook` answers 404 with DRF's own "Not found", the `format` query parameter is still being read as a renderer override: confirm that `content_negotiation_class = IgnoreFormatNegotiation` is set on `ReportView` and that the installed DRF still calls `select_renderer(request, renderers, format_suffix)` (`docker compose run --rm app python -c "import inspect, rest_framework.negotiation as n; print(inspect.signature(n.DefaultContentNegotiation.select_renderer))"`).

- [ ] **Step 7: Run the permission matrix to see it demand the new routes**

Run: `docker compose run --rm app pytest tests/test_permission_matrix.py -q`
Expected: FAIL naming the four uncovered routes: `reports:report-filters GET`, `reports:report GET`, `reports:kpmg-export GET`, `reports:kpmg-default-period GET`.

- [ ] **Step 8: Add the permission cases**

Append to the end of `backend/apps/reports/tests/matrix.py` (plan 05 created it with `from tests.matrix import Case, P, only` and a `CASES` list):

```python
NOVEMBER_2026 = {"from": "2026-11-01", "to": "2026-11-30"}

CASES += [
    Case(
        route="reports:report-filters",
        method="GET",
        expect=only(P.MANAGER, P.OTHER_MANAGER, P.HR, P.EXEC),
        label="filter options: managers, HR, executives",
    ),
    Case(
        route="reports:report",
        method="GET",
        expect=only(P.MANAGER, P.OTHER_MANAGER, P.HR, P.EXEC),
        kwargs=lambda w: {"name": "absences"},
        query=lambda w: NOVEMBER_2026,
        label="a report: managers for their team, HR and executives for everyone",
    ),
    Case(
        route="reports:report",
        method="GET",
        expect=only(P.OTHER_MANAGER, P.HR, P.EXEC, hide=[P.MANAGER]),
        kwargs=lambda w: {"name": "absences"},
        query=lambda w: {**NOVEMBER_2026, "employee": str(w.outsider.public_id)},
        label="a report on someone outside the manager's team is hidden",
    ),
    Case(
        route="reports:report",
        method="GET",
        expect=only(P.HR),
        kwargs=lambda w: {"name": "certificates"},
        label="outstanding certificates: HR only",
    ),
    Case(
        route="reports:kpmg-export",
        method="GET",
        expect=only(P.HR),
        query=lambda w: NOVEMBER_2026,
        label="KPMG export: HR only",
    ),
    Case(
        route="reports:kpmg-default-period",
        method="GET",
        expect=only(P.HR),
        label="KPMG default period: HR only",
    ),
]
```

- [ ] **Step 9: Run the matrix and the whole backend**

Run: `docker compose run --rm app pytest tests/test_permission_matrix.py -q`
Expected: PASS.

Run: `docker compose run --rm app pytest -q`
Expected: PASS except `tests/test_openapi.py`, which fails because `backend/openapi.yaml` is stale.

- [ ] **Step 10: Regenerate the OpenAPI document and the client types**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: no line starting with `Warning` (plan 01a, Task 21, lists the usual causes: a missing `operation_id`, or a choice set without a name in `ENUM_NAME_OVERRIDES`); `backend/openapi.yaml` gains the paths `/api/v1/report-filters`, `/api/v1/reports/{name}`, `/api/v1/exports/kpmg`, `/api/v1/exports/kpmg/default-period` and the schemas `ReportOut`, `ReportFiltersOut`, `KpmgDefaultPeriodOut`; `frontend/src/api/schema.d.ts` is rewritten.

Run: `docker compose run --rm app pytest tests/test_openapi.py -q`
Expected: PASS.

Run: `docker compose run --rm app ruff check . && docker compose run --rm app ruff format --check .`
Expected: no findings.

- [ ] **Step 11: Commit**

```bash
git add backend/apps/reports/api/report_serializers.py backend/apps/reports/api/report_views.py backend/apps/reports/api/urls.py backend/apps/reports/tests/test_report_api.py backend/apps/reports/tests/matrix.py backend/config/settings.py backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(reports): expose reports, filter options and the KPMG export through the API"
```

---

### Task 13: Frontend foundations: types, hooks, definitions, cell text, texts

**Files:**
- Modify: `frontend/src/api/types.ts` (append six types)
- Create: `frontend/src/features/reports/api.ts`
- Create: `frontend/src/features/reports/definitions.ts`
- Create: `frontend/src/features/reports/cells.ts`
- Create: `frontend/src/features/reports/download.ts`
- Create: `frontend/src/features/reports/activity.ts`
- Create: `frontend/src/i18n/locales/fr/reports.json`, `frontend/src/i18n/locales/en/reports.json`
- Modify: `frontend/src/i18n/locales/fr/settings.json`, `frontend/src/i18n/locales/en/settings.json` (two keys each)
- Modify: `frontend/src/i18n/locales/fr/audit.json`, `frontend/src/i18n/locales/en/audit.json` (texts of the business actions)
- Test: `frontend/src/features/reports/cells.test.ts`, `frontend/src/features/reports/definitions.test.ts`, `frontend/src/features/reports/activity.test.ts`

**Interfaces:**
- Consumes (plan 01b): `api`, `call` from `@/api/client`; the private helpers `Ok` and `Query` of `@/api/types`; `formatDate`, `formatDateRange`, `formatDateTime`, `formatNumber` from `@/lib/format` (each takes the value and a `Lang`); `Lang` from `@/i18n`, which loads every file under `locales/` by itself; `actionLabel` reads `audit:actions.<object>.<verb>`. The generated paths of Task 12.
- Produces:
  - `@/api/types`: `ReportFilterOptions`, `ReportOut`, `ReportQueryParams`, `ReportName`, `KpmgDefaultPeriod`, `KpmgQueryParams`
  - `features/reports/api.ts`: `ReportScope`, `ReportCell`, `ReportColumn`, `ColumnKind`, `ReportTotalLine`, `ReportData`, `ReportQuery`, `KpmgQuery`; `reportKeys`; `useReportFilters(scope)`, `useReport(name, scope, query)`, `useKpmgDefaultPeriod()`; `reportExportUrl(name, scope, query): string`; `downloadKpmg(query): Promise<Blob>`
  - `features/reports/definitions.ts`: `ReportWorkspace`, `FilterKey`, `ReportDefinition`, `REPORT_DEFINITIONS`, `scopeOf(workspace)`, `reportsFor(workspace)`, `findReport(name, workspace)`, `filtersFor(definition, workspace)`, `defaultQuery(definition, today)`, `toIsoDate(date)`
  - `features/reports/cells.ts`: `formatCell(value, kind, lang): string`
  - `features/reports/download.ts`: `saveBlob(blob, filename): void`
  - `features/reports/activity.ts`: `BUSINESS_ACTIONS: string[]`, `ITEM_TYPES: string[]`
  - the `reports` namespace; `audit:actions.*` for every business action of plans 02, 03a, 04 and 06

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/reports/cells.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDate, formatDateRange, formatDateTime } from "@/lib/format";
import { formatCell } from "./cells";

describe("formatCell", () => {
  it("shows nothing for an empty cell", () => {
    expect(formatCell(null, "number", "fr")).toBe("");
    expect(formatCell(undefined, "text", "fr")).toBe("");
    expect(formatCell("", "date", "fr")).toBe("");
  });

  it("writes numbers the way the reader's language does, without trailing zeros", () => {
    expect(formatCell("1.50", "number", "fr")).toBe("1,5");
    expect(formatCell("1.50", "number", "en")).toBe("1.5");
    expect(formatCell("8.00", "number", "fr")).toBe("8");
    expect(formatCell(3, "number", "en")).toBe("3");
  });

  it("writes days, moments and periods as the rest of the application does", () => {
    expect(formatCell("2026-11-03", "date", "fr")).toBe(formatDate("2026-11-03", "fr"));
    expect(formatCell("2026-11-02T08:30:00+00:00", "datetime", "en")).toBe(formatDateTime("2026-11-02T08:30:00+00:00", "en"));
    expect(formatCell({ start: "2026-11-02", end: "2026-11-03" }, "period", "fr")).toBe(
      formatDateRange("2026-11-02", "2026-11-03", "fr"),
    );
    expect(formatCell({ start: "2026-11-13", end: "2026-11-13" }, "period", "fr")).toBe(formatDate("2026-11-13", "fr"));
  });

  it("leaves text as it is", () => {
    expect(formatCell("Amal Employee", "text", "fr")).toBe("Amal Employee");
  });
});
```

Create `frontend/src/features/reports/definitions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { REPORT_DEFINITIONS, defaultQuery, filtersFor, findReport, reportsFor, scopeOf } from "./definitions";

const names = (workspace: "team" | "hr" | "overview") => reportsFor(workspace).map((report) => report.name);

describe("report definitions", () => {
  it("gives My team five reports, the HR desk six and Overview five", () => {
    expect(names("team")).toEqual(["absences", "balances", "waiting", "permission-hours", "remote-days"]);
    expect(names("hr")).toEqual([...names("team"), "certificates"]);
    expect(names("overview")).toEqual(names("team"));
  });

  it("never shows more than three filters at once", () => {
    for (const definition of REPORT_DEFINITIONS) {
      expect(definition.visible.length).toBeLessThanOrEqual(3);
    }
  });

  it("has no department filter in My team", () => {
    const absences = findReport("absences", "team")!;
    const balances = findReport("balances", "team")!;

    expect(filtersFor(absences, "team")).toEqual({ visible: ["period", "employee", "type"], more: [] });
    expect(filtersFor(balances, "team")).toEqual({ visible: ["on", "employee"], more: [] });
    expect(filtersFor(absences, "hr")).toEqual({ visible: ["period", "employee", "type"], more: ["department"] });
  });

  it("does not find a report outside its workspaces", () => {
    expect(findReport("certificates", "overview")).toBeUndefined();
    expect(findReport("payroll", "hr")).toBeUndefined();
    expect(findReport(undefined, "hr")).toBeUndefined();
  });

  it("maps a workspace to the scope the API expects", () => {
    expect(scopeOf("team")).toBe("team");
    expect(scopeOf("hr")).toBe("all");
    expect(scopeOf("overview")).toBe("all");
  });

  it("starts each report on a sensible selection", () => {
    const today = new Date(2026, 10, 18);

    expect(defaultQuery(findReport("absences", "hr")!, today)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(defaultQuery(findReport("balances", "hr")!, today)).toEqual({ on: "2026-11-18" });
    expect(defaultQuery(findReport("remote-days", "hr")!, today)).toEqual({ year: "2026" });
    expect(defaultQuery(findReport("waiting", "hr")!, today)).toEqual({});
  });
});
```

Create `frontend/src/features/reports/activity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { BUSINESS_ACTIONS, ITEM_TYPES } from "./activity";

describe("the activity log's vocabulary", () => {
  it("has a text in both languages for every business action", () => {
    for (const action of BUSINESS_ACTIONS) {
      for (const lng of ["fr", "en"]) {
        expect(i18n.exists(`audit:actions.${action}`, { lng }), `${action} in ${lng}`).toBe(true);
      }
    }
  });

  it("has a name in both languages for every kind of item", () => {
    for (const type of ITEM_TYPES) {
      for (const lng of ["fr", "en"]) {
        expect(i18n.exists(`reports:activity.items.${type}`, { lng }), `${type} in ${lng}`).toBe(true);
      }
    }
  });

  it("covers the actions this plan records", () => {
    expect(BUSINESS_ACTIONS).toEqual(expect.arrayContaining(["report.exported", "export.kpmg", "step.decided", "employee.archived"]));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/reports`
Expected: FAIL with `Failed to resolve import "./cells"`, `"./definitions"` and `"./activity"`.

- [ ] **Step 3: Derive the types**

Append to `frontend/src/api/types.ts` (the helpers `Ok` and `Query` are defined at the top of that file):

```ts
// Reports and the KPMG export (plan 06).
export type ReportFilterOptions = Ok<"/api/v1/report-filters", "get">;
export type ReportOut = Ok<"/api/v1/reports/{name}", "get">;
export type ReportQueryParams = Query<"/api/v1/reports/{name}", "get">;
export type ReportName = paths["/api/v1/reports/{name}"]["get"]["parameters"]["path"]["name"];
export type KpmgDefaultPeriod = Ok<"/api/v1/exports/kpmg/default-period", "get">;
export type KpmgQueryParams = Query<"/api/v1/exports/kpmg", "get">;
```

- [ ] **Step 4: Write the API module**

Create `frontend/src/features/reports/api.ts`:

```ts
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, call } from "@/api/client";
import type { KpmgQueryParams, ReportName, ReportOut, ReportQueryParams } from "@/api/types";

export type ReportScope = "team" | "all";
export type ReportColumn = ReportOut["columns"][number];
export type ColumnKind = ReportColumn["kind"];

/** One cell. The generated schema can only say "any value"; the API sends one of these (plan 06, Task 4). */
export type ReportCell = string | number | null | { start: string; end: string };

export interface ReportTotalLine {
  group: "overall" | "by_employee" | "by_type";
  label: string;
  values: Record<string, ReportCell>;
}

export type ReportData = Omit<ReportOut, "rows" | "totals"> & {
  rows: Record<string, ReportCell>[];
  totals: { lines: ReportTotalLine[] } | null;
};

/** The filters of a report as they stand in the address: query names, text values. */
export type ReportQuery = Partial<Record<"from" | "to" | "on" | "year" | "department" | "employee" | "type" | "step", string>>;
export type KpmgQuery = Partial<Record<"from" | "to" | "department" | "employee" | "type", string>>;

export const reportKeys = {
  all: ["reports"] as const,
  filters: (scope: ReportScope) => ["reports", "filters", scope] as const,
  run: (name: ReportName, scope: ReportScope, query: ReportQuery) => ["reports", "run", name, scope, query] as const,
  kpmgDefault: ["reports", "kpmg", "default-period"] as const,
};

export function useReportFilters(scope: ReportScope) {
  return useQuery({
    queryKey: reportKeys.filters(scope),
    queryFn: () => call(api.GET("/api/v1/report-filters", { params: { query: { scope } } })),
    staleTime: 5 * 60 * 1000,
  });
}

export function useReport(name: ReportName, scope: ReportScope, query: ReportQuery) {
  return useQuery({
    queryKey: reportKeys.run(name, scope, query),
    queryFn: async () => {
      const params = { path: { name }, query: { ...query, scope } as ReportQueryParams };
      return (await call(api.GET("/api/v1/reports/{name}", { params }))) as unknown as ReportData;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** The address of the workbook of a report, for a plain download link (as plan 01b does for the logs). */
export function reportExportUrl(name: ReportName, scope: ReportScope, query: ReportQuery): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) search.set(key, value);
  }
  search.set("scope", scope);
  search.set("format", "xlsx");
  return `/api/v1/reports/${name}?${search.toString()}`;
}

export function useKpmgDefaultPeriod() {
  return useQuery({
    queryKey: reportKeys.kpmgDefault,
    queryFn: () => call(api.GET("/api/v1/exports/kpmg/default-period")),
  });
}

/**
 * The KPMG workbook. It is fetched rather than linked, because "nothing to export" and a wrong period
 * must be said on the page, not shown as a raw answer in a new tab.
 */
export async function downloadKpmg(query: KpmgQuery): Promise<Blob> {
  const fetched = api.GET("/api/v1/exports/kpmg", { params: { query: query as KpmgQueryParams }, parseAs: "blob" });
  return (await call(fetched as Promise<{ data?: unknown; error?: unknown; response: Response }>)) as Blob;
}
```

- [ ] **Step 5: Write the cell text and the download helper**

Create `frontend/src/features/reports/cells.ts`:

```ts
import type { Lang } from "@/i18n";
import { formatDate, formatDateRange, formatDateTime, formatNumber } from "@/lib/format";
import type { ColumnKind, ReportCell } from "./api";

/** One cell of a report as text, written like every other date and number of the application. */
export function formatCell(value: ReportCell | undefined, kind: ColumnKind, lang: Lang): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "object") return kind === "period" ? formatDateRange(value.start, value.end, lang) : "";
  if (kind === "number") return formatNumber(value, lang);
  if (kind === "date") return formatDate(String(value), lang);
  if (kind === "datetime") return formatDateTime(String(value), lang);
  return String(value);
}
```

Create `frontend/src/features/reports/download.ts`:

```ts
/** Hands a file the API returned to the browser's download manager. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 6: Write the definitions**

Create `frontend/src/features/reports/definitions.ts`:

```ts
import type { ReportName } from "@/api/types";
import type { ReportQuery, ReportScope } from "./api";

export type ReportWorkspace = "team" | "hr" | "overview";
export type FilterKey = "period" | "on" | "year" | "department" | "employee" | "type" | "step";

export interface ReportDefinition {
  name: ReportName;
  workspaces: ReportWorkspace[];
  /** At most three (UI rule M5; plan 01b's FilterBar refuses a fourth). */
  visible: FilterKey[];
  /** One step away, behind "More filters". */
  more: FilterKey[];
}

const EVERYWHERE: ReportWorkspace[] = ["team", "hr", "overview"];

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  { name: "absences", workspaces: EVERYWHERE, visible: ["period", "employee", "type"], more: ["department"] },
  { name: "balances", workspaces: EVERYWHERE, visible: ["on", "department", "employee"], more: [] },
  { name: "waiting", workspaces: EVERYWHERE, visible: ["department", "type", "step"], more: [] },
  { name: "permission-hours", workspaces: EVERYWHERE, visible: ["year", "department", "employee"], more: [] },
  { name: "remote-days", workspaces: EVERYWHERE, visible: ["year", "department", "employee"], more: [] },
  // Certificate status is HR's alone (UI 10.2 and 10.3), so Overview has five reports.
  { name: "certificates", workspaces: ["hr"], visible: ["department"], more: [] },
];

export function scopeOf(workspace: ReportWorkspace): ReportScope {
  return workspace === "team" ? "team" : "all";
}

export function reportsFor(workspace: ReportWorkspace): ReportDefinition[] {
  return REPORT_DEFINITIONS.filter((definition) => definition.workspaces.includes(workspace));
}

export function findReport(name: string | undefined, workspace: ReportWorkspace): ReportDefinition | undefined {
  return reportsFor(workspace).find((definition) => definition.name === name);
}

/** In My team a report is limited to the team and has no department filter (UI 10.3). */
export function filtersFor(
  definition: ReportDefinition,
  workspace: ReportWorkspace,
): { visible: FilterKey[]; more: FilterKey[] } {
  const keep = (key: FilterKey) => workspace !== "team" || key !== "department";
  return { visible: definition.visible.filter(keep), more: definition.more.filter(keep) };
}

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The selection a report opens on: the current month, today, or the current year. */
export function defaultQuery(definition: ReportDefinition, today: Date): ReportQuery {
  const keys = [...definition.visible, ...definition.more];
  const query: ReportQuery = {};
  if (keys.includes("period")) {
    query.from = toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1));
    query.to = toIsoDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  }
  if (keys.includes("on")) query.on = toIsoDate(today);
  if (keys.includes("year")) query.year = String(today.getFullYear());
  return query;
}
```

- [ ] **Step 7: List what the activity log can filter on**

Create `frontend/src/features/reports/activity.ts`. The codes are the audit actions the plans record (plan 02; plan 03a, contract note 7; plan 04, contract note 13; this plan) and the item types they are recorded on (`object_type` is the lower-case model name).

```ts
/** Business audit actions, in the order the "kind of event" filter lists them. */
export const BUSINESS_ACTIONS: string[] = [
  "request.created",
  "request.updated",
  "request.submitted",
  "request.withdrawn",
  "request.discarded",
  "request.approved",
  "request.rejected",
  "request.returned",
  "request.corrected",
  "request.cancelled",
  "request.reclassified",
  "request.attachment_added",
  "step.decided",
  "step.recorded_on_behalf",
  "step.reassigned",
  "amendment.opened",
  "amendment.withdrawn",
  "amendment.approved",
  "amendment.rejected",
  "employee.created",
  "employee.updated",
  "employee.archived",
  "document.added",
  "document.visibility_changed",
  "attachment.uploaded",
  "attachment.downloaded",
  "profile_change.proposed",
  "profile_change.accepted",
  "profile_change.rejected",
  "profile_change.withdrawn",
  "delegation.created",
  "delegation.ended",
  "delegation.cancelled",
  "ledger.opening_posted",
  "ledger.adjusted",
  "ledger.credits_posted",
  "department.created",
  "department.updated",
  "department.activated",
  "department.deactivated",
  "position.created",
  "position.updated",
  "position.activated",
  "position.deactivated",
  "holiday.created",
  "holiday.updated",
  "holiday.deleted",
  "holiday.copied",
  "requesttype.created",
  "requesttype.updated",
  "requesttype.steps_replaced",
  "exceptionalevent.created",
  "exceptionalevent.updated",
  "setting.changed",
  "report.exported",
  "export.kpmg",
  "audit.exported",
];

/** Kinds of item an event is recorded on, for the filter behind "More filters". */
export const ITEM_TYPES: string[] = [
  "request",
  "employee",
  "ledgerentry",
  "delegation",
  "profilechange",
  "department",
  "position",
  "publicholiday",
  "requesttype",
  "exceptionalevent",
  "setting",
  "report",
  "export",
];
```

- [ ] **Step 8: Write the French texts**

Create `frontend/src/i18n/locales/fr/reports.json`. The words "Du", "Au", "Tous", "Plus de filtres" and "Exporter vers Excel" are plan 01b's (`common:filters.*`, `common:actions.export`) and are not repeated here.

```json
{
  "title": "Rapports",
  "team_note": "Ces rapports portent sur votre équipe.",
  "names": {
    "absences": "Absences prises",
    "balances": "Soldes à une date",
    "waiting": "Demandes en attente",
    "permission-hours": "Heures de permission par mois",
    "remote-days": "Jours de télétravail par mois",
    "certificates": "Certificats en attente"
  },
  "descriptions": {
    "absences": "Qui a été absent, quand et combien de temps.",
    "balances": "Le solde de congés de chacun à la date de votre choix.",
    "waiting": "Les demandes que personne n'a encore décidées, et depuis quand.",
    "permission-hours": "Les heures de permission de chacun, mois par mois.",
    "remote-days": "Les jours de télétravail de chacun, mois par mois.",
    "certificates": "Les arrêts maladie dont le certificat manque encore."
  },
  "filters": {
    "period": "Période",
    "on": "À la date du",
    "year": "Année",
    "department": "Département",
    "employee": "Salarié",
    "type": "Type",
    "step": "Étape"
  },
  "fields": {
    "from": "Date de début",
    "to": "Date de fin",
    "on": "Date",
    "year": "Année",
    "department": "Département",
    "employee": "Salarié",
    "type": "Type",
    "step": "Étape"
  },
  "problem": "{{field}} : {{message}}",
  "empty": {
    "title": "Rien à afficher pour cette sélection.",
    "hint": "Élargissez la période ou retirez un filtre."
  },
  "table_label": "Résultat : {{name}}",
  "totals": {
    "by_employee": "Totaux par salarié",
    "by_type": "Totaux par type"
  },
  "kpmg": {
    "title": "Export KPMG",
    "intro": "Choisissez la période, puis exportez le fichier à transmettre à KPMG.",
    "period_month": "Période proposée : le mois en cours.",
    "period_cutoff": "Période proposée : du lendemain de la dernière clôture jusqu'au jour de clôture (le {{day}}).",
    "columns_title": "Colonnes du fichier",
    "columns": {
      "employee_number": "Matricule",
      "name": "Nom",
      "department": "Département",
      "annual_days": "Congé annuel (jours)",
      "sick_days": "Congé maladie (jours)",
      "exceptional_days": "Congé exceptionnel (jours)",
      "permission_hours": "Permissions (heures)",
      "remote_days": "Télétravail (jours)",
      "balance_end": "Solde annuel en fin de période",
      "meal_tickets": "Tickets restaurant"
    },
    "rules_title": "Règles appliquées",
    "rules": {
      "approved": "Seules les demandes approuvées sont comptées.",
      "period": "Les jours situés hors de la période sont exclus.",
      "tickets": "Tickets restaurant : le nombre mensuel fixé dans les paramètres, moins un par jour ouvré entier d'absence ; une demi-journée isolée et le télétravail ne réduisent pas les tickets."
    },
    "exported": "Le fichier a été téléchargé.",
    "nothing_title": "Rien à exporter pour cette sélection."
  },
  "activity": {
    "title": "Journal d'activité",
    "description": "Qui a fait quoi, sur quoi, et quand.",
    "items": {
      "request": "Demande",
      "employee": "Employé",
      "ledgerentry": "Ligne de solde",
      "delegation": "Délégation",
      "profilechange": "Modification de profil",
      "department": "Département",
      "position": "Poste",
      "publicholiday": "Jour férié",
      "requesttype": "Type de demande",
      "exceptionalevent": "Événement exceptionnel",
      "setting": "Paramètre",
      "report": "Rapport",
      "export": "Export"
    }
  },
  "oversight": {
    "title": "Supervision",
    "read_only": "Tout ce qui suit est en consultation seule.",
    "back": "Retour à la supervision",
    "entries": {
      "activity": { "title": "Journal d'activité", "description": "Les actions sur les données RH." },
      "security": { "title": "Journal de sécurité", "description": "Connexions, mots de passe, comptes et rôles." },
      "hr-settings": { "title": "Réglages RH", "description": "Types de demande, étapes, événements, jours fériés, paramètres." },
      "system": { "title": "Comptes et système", "description": "Comptes, paramètres techniques et état du système." }
    },
    "system": {
      "status": "État du système",
      "accounts": "Comptes",
      "parameters": "Paramètres système"
    }
  }
}
```

- [ ] **Step 9: Write the English texts**

Create `frontend/src/i18n/locales/en/reports.json`:

```json
{
  "title": "Reports",
  "team_note": "These reports cover your team.",
  "names": {
    "absences": "Absences taken",
    "balances": "Balances at a date",
    "waiting": "Requests waiting",
    "permission-hours": "Permission hours by month",
    "remote-days": "Remote days by month",
    "certificates": "Certificates outstanding"
  },
  "descriptions": {
    "absences": "Who was away, when and for how long.",
    "balances": "Everyone's leave balance on the date you choose.",
    "waiting": "Requests nobody has decided yet, and since when.",
    "permission-hours": "Everyone's permission hours, month by month.",
    "remote-days": "Everyone's remote days, month by month.",
    "certificates": "Sick leaves still missing their certificate."
  },
  "filters": {
    "period": "Period",
    "on": "On",
    "year": "Year",
    "department": "Department",
    "employee": "Employee",
    "type": "Type",
    "step": "Step"
  },
  "fields": {
    "from": "Start date",
    "to": "End date",
    "on": "Date",
    "year": "Year",
    "department": "Department",
    "employee": "Employee",
    "type": "Type",
    "step": "Step"
  },
  "problem": "{{field}}: {{message}}",
  "empty": {
    "title": "Nothing to show for this selection.",
    "hint": "Widen the period or remove a filter."
  },
  "table_label": "Result: {{name}}",
  "totals": {
    "by_employee": "Totals per employee",
    "by_type": "Totals per type"
  },
  "kpmg": {
    "title": "KPMG export",
    "intro": "Choose the period, then export the file to send to KPMG.",
    "period_month": "Proposed period: the current month.",
    "period_cutoff": "Proposed period: from the day after the last cut-off to the cut-off day (the {{day}}).",
    "columns_title": "Columns of the file",
    "columns": {
      "employee_number": "Employee number",
      "name": "Name",
      "department": "Department",
      "annual_days": "Annual leave (days)",
      "sick_days": "Sick leave (days)",
      "exceptional_days": "Exceptional leave (days)",
      "permission_hours": "Permissions (hours)",
      "remote_days": "Remote work (days)",
      "balance_end": "Annual balance at period end",
      "meal_tickets": "Meal tickets"
    },
    "rules_title": "Rules applied",
    "rules": {
      "approved": "Only approved requests are counted.",
      "period": "Days outside the period are excluded.",
      "tickets": "Meal tickets: the monthly number set in the parameters, minus one for each full working day absent; a single half-day and remote work do not reduce tickets."
    },
    "exported": "The file has been downloaded.",
    "nothing_title": "Nothing to export for this selection."
  },
  "activity": {
    "title": "Activity log",
    "description": "Who did what, on what, and when.",
    "items": {
      "request": "Request",
      "employee": "Employee",
      "ledgerentry": "Balance line",
      "delegation": "Delegation",
      "profilechange": "Profile change",
      "department": "Department",
      "position": "Position",
      "publicholiday": "Public holiday",
      "requesttype": "Request type",
      "exceptionalevent": "Exceptional event",
      "setting": "Parameter",
      "report": "Report",
      "export": "Export"
    }
  },
  "oversight": {
    "title": "Oversight",
    "read_only": "Everything below is read-only.",
    "back": "Back to Oversight",
    "entries": {
      "activity": { "title": "Activity log", "description": "Actions on HR data." },
      "security": { "title": "Security log", "description": "Sign-ins, passwords, accounts and roles." },
      "hr-settings": { "title": "HR settings", "description": "Request types, steps, events, public holidays, parameters." },
      "system": { "title": "Accounts and system", "description": "Accounts, technical parameters and system status." }
    },
    "system": {
      "status": "System status",
      "accounts": "Accounts",
      "parameters": "System parameters"
    }
  }
}
```

- [ ] **Step 10: Label the two settings**

`SettingsGroupPage` (plan 01b) reads `settings:<key>.label` and `settings:<key>.hint`. Add these two entries at the top level of `frontend/src/i18n/locales/fr/settings.json`:

```json
  "meal_tickets_per_month": {
    "label": "Tickets restaurant par mois",
    "hint": "Nombre de tickets avant déduction des jours d'absence."
  },
  "export_cutoff_day": {
    "label": "Jour de clôture de la paie",
    "hint": "Entre 1 et 28. Laissez vide pour que l'export KPMG propose le mois civil."
  }
```

and at the top level of `frontend/src/i18n/locales/en/settings.json`:

```json
  "meal_tickets_per_month": {
    "label": "Meal tickets per month",
    "hint": "Number of tickets before absence days are deducted."
  },
  "export_cutoff_day": {
    "label": "Payroll cut-off day",
    "hint": "Between 1 and 28. Leave empty for the KPMG export to propose the calendar month."
  }
```

- [ ] **Step 11: Name the business actions in the logs**

Plan 01b's logs show an action by its text under `audit:actions.<object>.<verb>` and by its code when there is none (its contract note 12). No earlier plan added the texts of the business actions. In `frontend/src/i18n/locales/fr/audit.json`, add these objects inside the existing `"actions"` object, next to `auth`, `account`, `role`, `setting` and `audit`:

```json
    "request": {
      "created": "Demande créée",
      "updated": "Demande modifiée",
      "submitted": "Demande envoyée",
      "withdrawn": "Demande retirée",
      "discarded": "Brouillon supprimé",
      "approved": "Demande approuvée",
      "rejected": "Demande refusée",
      "returned": "Demande renvoyée pour correction",
      "corrected": "Demande corrigée par les RH",
      "cancelled": "Demande annulée par les RH",
      "reclassified": "Arrêt maladie compté en congé annuel",
      "attachment_added": "Fichier ajouté à une demande"
    },
    "step": {
      "decided": "Décision prise",
      "recorded_on_behalf": "Décision enregistrée pour un approbateur",
      "reassigned": "Étape confiée à quelqu'un d'autre"
    },
    "amendment": {
      "opened": "Modification demandée",
      "withdrawn": "Modification retirée",
      "approved": "Modification approuvée",
      "rejected": "Modification refusée"
    },
    "employee": {
      "created": "Employé créé",
      "updated": "Fiche employé modifiée",
      "archived": "Départ enregistré"
    },
    "document": {
      "added": "Document ajouté",
      "visibility_changed": "Partage d'un document modifié"
    },
    "attachment": {
      "uploaded": "Fichier déposé",
      "downloaded": "Fichier consulté"
    },
    "profile_change": {
      "proposed": "Modification de profil proposée",
      "accepted": "Modification de profil acceptée",
      "rejected": "Modification de profil refusée",
      "withdrawn": "Modification de profil retirée"
    },
    "delegation": {
      "created": "Délégation créée",
      "ended": "Délégation terminée",
      "cancelled": "Délégation annulée"
    },
    "ledger": {
      "opening_posted": "Solde d'ouverture saisi",
      "adjusted": "Solde ajusté",
      "credits_posted": "Crédits mensuels versés"
    },
    "department": {
      "created": "Département créé",
      "updated": "Département modifié",
      "activated": "Département réactivé",
      "deactivated": "Département désactivé"
    },
    "position": {
      "created": "Poste créé",
      "updated": "Poste modifié",
      "activated": "Poste réactivé",
      "deactivated": "Poste désactivé"
    },
    "holiday": {
      "created": "Jour férié ajouté",
      "updated": "Jour férié modifié",
      "deleted": "Jour férié supprimé",
      "copied": "Jours fériés copiés vers une autre année"
    },
    "requesttype": {
      "created": "Type de demande créé",
      "updated": "Type de demande modifié",
      "steps_replaced": "Étapes d'un type modifiées"
    },
    "exceptionalevent": {
      "created": "Événement exceptionnel créé",
      "updated": "Événement exceptionnel modifié"
    },
    "report": {
      "exported": "Rapport exporté"
    },
    "export": {
      "kpmg": "Export KPMG"
    }
```

In `frontend/src/i18n/locales/en/audit.json`, add inside `"actions"`:

```json
    "request": {
      "created": "Request created",
      "updated": "Request changed",
      "submitted": "Request sent",
      "withdrawn": "Request withdrawn",
      "discarded": "Draft discarded",
      "approved": "Request approved",
      "rejected": "Request refused",
      "returned": "Request sent back for correction",
      "corrected": "Request corrected by HR",
      "cancelled": "Request cancelled by HR",
      "reclassified": "Sick leave counted as annual leave",
      "attachment_added": "File added to a request"
    },
    "step": {
      "decided": "Decision taken",
      "recorded_on_behalf": "Decision recorded for an approver",
      "reassigned": "Step given to someone else"
    },
    "amendment": {
      "opened": "Change asked for",
      "withdrawn": "Change withdrawn",
      "approved": "Change approved",
      "rejected": "Change refused"
    },
    "employee": {
      "created": "Employee created",
      "updated": "Employee record changed",
      "archived": "Departure recorded"
    },
    "document": {
      "added": "Document added",
      "visibility_changed": "Sharing of a document changed"
    },
    "attachment": {
      "uploaded": "File uploaded",
      "downloaded": "File opened"
    },
    "profile_change": {
      "proposed": "Profile change proposed",
      "accepted": "Profile change accepted",
      "rejected": "Profile change refused",
      "withdrawn": "Profile change withdrawn"
    },
    "delegation": {
      "created": "Delegation created",
      "ended": "Delegation ended",
      "cancelled": "Delegation cancelled"
    },
    "ledger": {
      "opening_posted": "Opening balance entered",
      "adjusted": "Balance adjusted",
      "credits_posted": "Monthly credits posted"
    },
    "department": {
      "created": "Department created",
      "updated": "Department changed",
      "activated": "Department reactivated",
      "deactivated": "Department deactivated"
    },
    "position": {
      "created": "Position created",
      "updated": "Position changed",
      "activated": "Position reactivated",
      "deactivated": "Position deactivated"
    },
    "holiday": {
      "created": "Public holiday added",
      "updated": "Public holiday changed",
      "deleted": "Public holiday removed",
      "copied": "Public holidays copied to another year"
    },
    "requesttype": {
      "created": "Request type created",
      "updated": "Request type changed",
      "steps_replaced": "Steps of a type changed"
    },
    "exceptionalevent": {
      "created": "Exceptional event created",
      "updated": "Exceptional event changed"
    },
    "report": {
      "exported": "Report exported"
    },
    "export": {
      "kpmg": "KPMG export"
    }
```

- [ ] **Step 12: Run the tests**

Run: `docker compose run --rm web npx vitest run src/features/reports src/i18n/parity.test.ts`
Expected: PASS: 4 tests in `cells.test.ts`, 6 in `definitions.test.ts`, 3 in `activity.test.ts`, and the parity test, which now also compares the two `reports.json`, `settings.json` and `audit.json` files.

Run: `docker compose run --rm web npx vitest run src/features/audit src/features/employees src/features/requests`
Expected: one failure, in `src/features/audit/AuditLogPage.test.tsx`: the test "reads the business log and does not list accounts for a reader who may not" looked for the code `employee.archived`, which now has a text. In that test replace `within(table).getByText("employee.archived")` by `within(table).getByText("Départ enregistré")` and run the command again. Expected: PASS. If another test of an earlier plan compared an action's code in a history, give it the French text of Step 11 in the same way.

Run: `docker compose run --rm web npm run typecheck`
Expected: no errors. If `api.GET("/api/v1/reports/{name}", …)` does not type-check, the generated `schema.d.ts` is stale: run `powershell -File scripts/dev.ps1 openapi` again.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/features frontend/src/i18n/locales
git commit -m "feat(reports): report hooks, definitions, cell text and the texts of the activity log"
```

---

### Task 14: Frontend: report filters, report problems and the report table

**Files:**
- Create: `frontend/src/features/reports/ReportFilters.tsx`
- Create: `frontend/src/features/reports/ReportProblems.tsx`
- Create: `frontend/src/features/reports/ReportTable.tsx`
- Test: `frontend/src/features/reports/ReportFilters.test.tsx`, `frontend/src/features/reports/ReportTable.test.tsx`

**Interfaces:**
- Consumes (plan 01b): `FilterBar({ children, more? })` from `@/components/FilterBar` (it throws when given more than three children, and puts `more` behind the button "Plus de filtres"); `FilterDateRange({ label, from, to, onFrom, onTo })`, `FilterSelect({ label, value, onChange, options })`, `FilterText({ label, value, onChange, type })` from `@/components/filters`; `FieldProblem` from `@/api/problem`; `useLang` from `@/i18n`; `renderApp`, `makeMe`. Task 13's types, `formatCell`, `FilterKey`.
- Produces:
  - `ReportFilters({ filters, options, values, onChange })`: `filters` is the result of `filtersFor`; `options` is `ReportFilterOptions | undefined`; `values` is a `ReportQuery`; `onChange(patch: ReportQuery)` receives the changed keys, an empty string meaning "no filter"
  - `ReportProblems({ problems })`: the problems the server reported on a selection, each named after its filter, as one alert under the filters
  - `ReportTable({ data, label })`: `data` is a `ReportData`; `label` names the table for assistive technology

Report tables are not built on `DataTable`: UI 10.3 defines reports with up to fourteen columns (a year by month), which `DataTable` (six columns, cards on a phone) cannot show. `ReportTable` is a plain table in a horizontally scrollable, keyboard-focusable region.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/reports/ReportFilters.test.tsx`:

```tsx
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReportFilterOptions } from "@/api/types";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { ReportFilters } from "./ReportFilters";
import { ReportProblems } from "./ReportProblems";

const options: ReportFilterOptions = {
  scope: "all",
  departments: [
    { id: 1, name: "Souscription" },
    { id: 2, name: "Sinistres" },
  ],
  employees: [
    { public_id: "e-1", name: "Amal Employee" },
    { public_id: "e-2", name: "Bilel Employee" },
  ],
  actors: [],
  types: [
    { code: "annual", name: "Congé annuel" },
    { code: "sick", name: "Congé maladie" },
  ],
  steps: [
    { code: "line_manager", name: "Le responsable" },
    { code: "hr_role", name: "RH" },
  ],
};

const me = makeMe({ roles: ["employee", "hr"] });

function show(props: Partial<Parameters<typeof ReportFilters>[0]> = {}) {
  const onChange = vi.fn();
  renderApp(
    <ReportFilters
      filters={{ visible: ["period", "employee", "type"], more: ["department"] }}
      options={options}
      values={{ from: "2026-11-01", to: "2026-11-30" }}
      onChange={onChange}
      {...props}
    />,
    { route: "/hr/reports/absences", me },
  );
  return onChange;
}

describe("ReportFilters", () => {
  it("shows three filters and keeps the others one step away", async () => {
    const user = userEvent.setup();
    show();

    const period = screen.getByRole("group", { name: "Période" });
    expect(within(period).getByLabelText("Du")).toHaveValue("2026-11-01");
    expect(within(period).getByLabelText("Au")).toHaveValue("2026-11-30");
    expect(screen.getByRole("combobox", { name: "Salarié" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Département" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Plus de filtres" }));

    expect(screen.getByRole("combobox", { name: "Département" })).toBeInTheDocument();
  });

  it("offers what the API allows, with an entry for no filter", () => {
    show();

    const employee = screen.getByRole("combobox", { name: "Salarié" });
    expect(within(employee).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Tous",
      "Amal Employee",
      "Bilel Employee",
    ]);
  });

  it("reports a change as a patch", async () => {
    const onChange = show();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByRole("combobox", { name: "Type" }), "sick");
    expect(onChange).toHaveBeenLastCalledWith({ type: "sick" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Salarié" }), "");
    expect(onChange).toHaveBeenLastCalledWith({ employee: "" });

    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2026-11-15" } });
    expect(onChange).toHaveBeenLastCalledWith({ to: "2026-11-15" });
  });

  it("draws the other kinds of filter", () => {
    show({
      filters: { visible: ["on", "year", "step"], more: [] },
      values: { on: "2026-11-18", year: "2026" },
    });

    expect(screen.getByLabelText("À la date du")).toHaveValue("2026-11-18");
    expect(screen.getByRole("combobox", { name: "Année" })).toHaveValue("2026");
    expect(within(screen.getByRole("combobox", { name: "Étape" })).getByRole("option", { name: "RH" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Plus de filtres" })).not.toBeInTheDocument();
  });
});

describe("ReportProblems", () => {
  const problem = (field: string | null, detail: string) => ({ field, code: "reports.x", detail, params: {} });

  it("names the filter each problem is about", () => {
    renderApp(
      <ReportProblems
        problems={[
          problem("to", "La date de fin précède la date de début."),
          problem(null, "Rien à afficher."),
        ]}
      />,
      { route: "/hr/reports/absences", me },
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Date de fin : La date de fin précède la date de début.");
    expect(alert).toHaveTextContent("Rien à afficher.");
  });

  it("shows a problem on a field it does not know by its message alone", () => {
    renderApp(<ReportProblems problems={[problem("scope", "Choisissez votre équipe.")]} />, { route: "/hr/reports/absences", me });

    expect(screen.getByRole("alert")).toHaveTextContent(/^Choisissez votre équipe\.$/);
  });

  it("draws nothing when there is no problem", () => {
    renderApp(<ReportProblems problems={[]} />, { route: "/hr/reports/absences", me });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
```

Create `frontend/src/features/reports/ReportTable.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatDate, formatDateRange } from "@/lib/format";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import type { ReportData } from "./api";
import { ReportTable } from "./ReportTable";

const me = makeMe({ roles: ["employee", "hr"] });

const absences: ReportData = {
  columns: [
    { key: "employee", label: "Salarié", kind: "text" },
    { key: "type", label: "Type", kind: "text" },
    { key: "period", label: "Dates", kind: "period" },
    { key: "days", label: "Jours", kind: "number" },
    { key: "hours", label: "Heures", kind: "number" },
  ],
  rows: [
    { employee: "Amal Employee", type: "Congé annuel", period: { start: "2026-11-02", end: "2026-11-03" }, days: "1.50", hours: null },
    { employee: "Amal Employee", type: "Permission", period: { start: "2026-11-24", end: "2026-11-24" }, days: null, hours: "2.50" },
  ],
  totals: {
    lines: [
      { group: "overall", label: "Total", values: { days: "1.50", hours: "2.50" } },
      { group: "by_employee", label: "Amal Employee", values: { days: "1.50", hours: "2.50" } },
      { group: "by_type", label: "Congé annuel", values: { days: "1.50", hours: null } },
    ],
  },
};

describe("ReportTable", () => {
  it("shows the result as a labelled, scrollable table", () => {
    renderApp(<ReportTable data={absences} label="Résultat : Absences prises" />, { route: "/hr/reports/absences", me });

    const region = screen.getByRole("region", { name: "Résultat : Absences prises" });
    expect(region).toHaveAttribute("tabindex", "0");
    const table = within(region).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Salarié",
      "Type",
      "Dates",
      "Jours",
      "Heures",
    ]);
    expect(within(table).getByText(formatDateRange("2026-11-02", "2026-11-03", "fr"))).toBeInTheDocument();
    expect(within(table).getByText(formatDate("2026-11-24", "fr"))).toBeInTheDocument();
    expect(within(table).getAllByText("1,5").length).toBeGreaterThan(0);
  });

  it("ends the table with the overall total", () => {
    renderApp(<ReportTable data={absences} label="Résultat" />, { route: "/hr/reports/absences", me });

    const total = screen.getByRole("row", { name: /^Total/ });
    expect(within(total).getByText("1,5")).toBeInTheDocument();
    expect(within(total).getByText("2,5")).toBeInTheDocument();
  });

  it("shows the totals per employee and per type under their own headings", () => {
    renderApp(<ReportTable data={absences} label="Résultat" />, { route: "/hr/reports/absences", me });

    const perEmployee = screen.getByRole("table", { name: "Totaux par salarié" });
    expect(within(perEmployee).getByRole("rowheader", { name: "Amal Employee" })).toBeInTheDocument();
    const perType = screen.getByRole("table", { name: "Totaux par type" });
    expect(within(perType).getByRole("rowheader", { name: "Congé annuel" })).toBeInTheDocument();
  });

  it("shows no totals when the report has none", () => {
    renderApp(<ReportTable data={{ ...absences, totals: null }} label="Résultat" />, { route: "/hr/reports/absences", me });

    expect(screen.queryByRole("row", { name: /^Total/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Totaux par type" })).not.toBeInTheDocument();
  });

  it("shows every column of a year by month", () => {
    const months = Array.from({ length: 12 }, (_, index) => `m${String(index + 1).padStart(2, "0")}`);
    const yearly: ReportData = {
      columns: [
        { key: "employee", label: "Salarié", kind: "text" },
        ...months.map((key) => ({ key, label: key, kind: "number" as const })),
        { key: "total", label: "Total", kind: "number" },
      ],
      rows: [{ employee: "Amal Employee", ...Object.fromEntries(months.map((key) => [key, null])), m11: "2.00", total: "2.00" }],
      totals: null,
    };

    renderApp(<ReportTable data={yearly} label="Résultat" />, { route: "/hr/reports/remote-days", me });

    expect(screen.getAllByRole("columnheader")).toHaveLength(14);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/reports/ReportFilters.test.tsx src/features/reports/ReportTable.test.tsx`
Expected: FAIL with `Failed to resolve import "./ReportFilters"` and `"./ReportTable"`.

- [ ] **Step 3: Write the filters of a report**

Create `frontend/src/features/reports/ReportFilters.tsx`:

```tsx
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ReportFilterOptions } from "@/api/types";
import { FilterBar } from "@/components/FilterBar";
import { FilterDateRange, FilterSelect, FilterText } from "@/components/filters";
import type { ReportQuery } from "./api";
import type { FilterKey } from "./definitions";

interface Option {
  value: string;
  label: string;
}

interface ReportFiltersProps {
  filters: { visible: FilterKey[]; more: FilterKey[] };
  options: ReportFilterOptions | undefined;
  values: ReportQuery;
  /** The changed keys; an empty string means "no filter". */
  onChange: (patch: ReportQuery) => void;
}

function yearOptions(selected: string | undefined): Option[] {
  const current = new Date().getFullYear();
  const years = new Set<string>(Array.from({ length: 5 }, (_, index) => String(current - index)));
  if (selected) years.add(selected);
  return [...years].sort((a, b) => Number(b) - Number(a)).map((year) => ({ value: year, label: year }));
}

export function ReportFilters({ filters, options, values, onChange }: ReportFiltersProps) {
  const { t } = useTranslation("reports");
  const all: Option = { value: "", label: t("common:filters.all") };

  const control = (key: FilterKey): ReactNode => {
    switch (key) {
      case "period":
        return (
          <FilterDateRange
            key="period"
            label={t("filters.period")}
            from={values.from ?? ""}
            to={values.to ?? ""}
            onFrom={(value) => onChange({ from: value })}
            onTo={(value) => onChange({ to: value })}
          />
        );
      case "on":
        return (
          <FilterText
            key="on"
            type="date"
            label={t("filters.on")}
            value={values.on ?? ""}
            onChange={(value) => onChange({ on: value })}
          />
        );
      case "year":
        return (
          <FilterSelect
            key="year"
            label={t("filters.year")}
            value={values.year ?? ""}
            options={yearOptions(values.year)}
            onChange={(value) => onChange({ year: value })}
          />
        );
      case "department":
        return (
          <FilterSelect
            key="department"
            label={t("filters.department")}
            value={values.department ?? ""}
            options={[all, ...(options?.departments ?? []).map((item) => ({ value: String(item.id), label: item.name }))]}
            onChange={(value) => onChange({ department: value })}
          />
        );
      case "employee":
        return (
          <FilterSelect
            key="employee"
            label={t("filters.employee")}
            value={values.employee ?? ""}
            options={[all, ...(options?.employees ?? []).map((item) => ({ value: item.public_id, label: item.name }))]}
            onChange={(value) => onChange({ employee: value })}
          />
        );
      case "type":
        return (
          <FilterSelect
            key="type"
            label={t("filters.type")}
            value={values.type ?? ""}
            options={[all, ...(options?.types ?? []).map((item) => ({ value: item.code, label: item.name }))]}
            onChange={(value) => onChange({ type: value })}
          />
        );
      case "step":
        return (
          <FilterSelect
            key="step"
            label={t("filters.step")}
            value={values.step ?? ""}
            options={[all, ...(options?.steps ?? []).map((item) => ({ value: item.code, label: item.name }))]}
            onChange={(value) => onChange({ step: value })}
          />
        );
    }
  };

  return (
    <FilterBar more={filters.more.length > 0 ? <>{filters.more.map(control)}</> : undefined}>
      {filters.visible.map(control)}
    </FilterBar>
  );
}
```

- [ ] **Step 4: Write the problems of a selection**

Create `frontend/src/features/reports/ReportProblems.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import type { FieldProblem } from "@/api/problem";

// The query names that have a text under `reports:fields`.
const NAMED = new Set(["from", "to", "on", "year", "department", "employee", "type", "step"]);

/** What the server refused in a selection, directly under the filters, each problem named after its filter. */
export function ReportProblems({ problems }: { problems: FieldProblem[] }) {
  const { t } = useTranslation("reports");
  if (problems.length === 0) return null;
  return (
    <div role="alert" className="mb-4 flex flex-col gap-1 text-body text-refused">
      {problems.map((problem, index) => (
        <p key={`${problem.field ?? "general"}-${problem.code}-${index}`} className="m-0">
          {problem.field && NAMED.has(problem.field)
            ? t("problem", { field: t(`fields.${problem.field}`), message: problem.detail })
            : problem.detail}
        </p>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Write the report table**

Create `frontend/src/features/reports/ReportTable.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { useLang, type Lang } from "@/i18n";
import type { ReportColumn, ReportData, ReportTotalLine } from "./api";
import { formatCell } from "./cells";

const CELL = "px-4 py-3 align-top";
const HEAD = "bg-muted px-4 py-2 text-caption font-medium text-muted-foreground";
const FRAME = "overflow-x-auto rounded-xl border border-border bg-card";

function alignment(column: ReportColumn): string {
  return column.kind === "number" ? "text-right" : "text-left";
}

interface ReportTableProps {
  data: ReportData;
  /** Names the result for assistive technology, for example "Résultat : Absences prises". */
  label: string;
}

export function ReportTable({ data, label }: ReportTableProps) {
  const { t } = useTranslation("reports");
  const lang = useLang();
  const lines = data.totals?.lines ?? [];
  const overall = lines.filter((line) => line.group === "overall");
  const [first, ...others] = data.columns;

  return (
    <>
      <div role="region" aria-label={label} tabIndex={0} className={FRAME}>
        <table className="w-full border-collapse text-body tabular">
          <thead>
            <tr>
              {data.columns.map((column) => (
                <th key={column.key} scope="col" className={`${HEAD} ${alignment(column)} whitespace-nowrap`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => (
              // Rows of a report have no identity of their own: their position is their key.
              <tr key={index} className="border-t border-divider">
                {data.columns.map((column) => (
                  <td key={column.key} className={`${CELL} ${alignment(column)}`}>
                    {formatCell(row[column.key], column.kind, lang)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {overall.length > 0 && first && (
            <tfoot>
              {overall.map((line) => (
                <tr key={line.label} className="border-t border-border font-semibold">
                  <th scope="row" className={`${CELL} text-left`}>
                    {line.label}
                  </th>
                  {others.map((column) => (
                    <td key={column.key} className={`${CELL} ${alignment(column)}`}>
                      {formatCell(line.values[column.key], column.kind, lang)}
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>

      {(["by_employee", "by_type"] as const).map((group) => (
        <TotalsGroup
          key={group}
          title={t(`totals.${group}`)}
          lines={lines.filter((line) => line.group === group)}
          columns={data.columns}
          lang={lang}
        />
      ))}
    </>
  );
}

interface TotalsGroupProps {
  title: string;
  lines: ReportTotalLine[];
  columns: ReportColumn[];
  lang: Lang;
}

function TotalsGroup({ title, lines, columns, lang }: TotalsGroupProps) {
  if (lines.length === 0) return null;
  const valued = columns.filter((column) => lines.some((line) => column.key in line.values));
  return (
    <div className={`${FRAME} mt-6`}>
      <table className="w-full border-collapse text-body tabular">
        <caption className="px-4 py-3 text-left text-section font-semibold">{title}</caption>
        <thead>
          <tr>
            <td className={HEAD} />
            {valued.map((column) => (
              <th key={column.key} scope="col" className={`${HEAD} ${alignment(column)}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.label} className="border-t border-divider">
              <th scope="row" className={`${CELL} text-left font-normal`}>
                {line.label}
              </th>
              {valued.map((column) => (
                <td key={column.key} className={`${CELL} ${alignment(column)}`}>
                  {formatCell(line.values[column.key], column.kind, lang)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `docker compose run --rm web npx vitest run src/features/reports/ReportFilters.test.tsx src/features/reports/ReportTable.test.tsx`
Expected: 12 passed (7 and 5).

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no findings.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/reports
git commit -m "feat(reports): report filters, report problems and the report table"
```

---

### Task 15: Frontend: the report page, the reports index and their routes

**Files:**
- Create: `frontend/src/features/reports/ReportPage.tsx`
- Create: `frontend/src/features/reports/ReportsIndexPage.tsx`
- Modify: `frontend/src/workspaces/team/routes.tsx`, `frontend/src/workspaces/hr/routes.tsx`, `frontend/src/workspaces/overview/routes.tsx` (append routes)
- Test: `frontend/src/features/reports/ReportPage.test.tsx`, `frontend/src/features/reports/ReportsIndexPage.test.tsx`, `frontend/src/features/reports/routes.test.ts`

**Interfaces:**
- Consumes (plan 01b): `PageHeader({ title, primary?, back?, children? })`, `EmptyState({ title, hint? })`, `NotAvailable()`, `PageLoading()`, `ProblemBoundary` from `@/components/<Name>`; `Button` (`variant`, `asChild`) and `buttonVariants` from `@/components/ui/button`; `ProblemError` from `@/api/problem`; `common:actions.export` ("Exporter vers Excel"); the navigation entries `/team/reports`, `/hr/reports`, `/overview/reports` of `app/workspaces.ts`, which appear once a route matches; `problemResponse`, `makeMe` from `@/test/fixtures`. Tasks 13 and 14.
- Produces:
  - `ReportsIndexPage({ workspace })` (default export): the reports of a workspace; on the HR desk its primary action is the KPMG export and it also lists the activity log
  - `ReportPage({ workspace, name? })` (default export): one report; `name` defaults to the `:name` route parameter; filters live in the address; its one primary action is the download link "Exporter vers Excel"
  - routes `reports` and `reports/:name` in `teamRoutes`, `hrRoutes`, `overviewRoutes`

A selection the server refuses with 400 is explained under the filters. Every other error is thrown to the shell's `ProblemBoundary`, which shows "not available" for 403 and 404 (plan 01b's convention).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/reports/ReportPage.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportFilterOptions } from "@/api/types";
import { ProblemBoundary } from "@/components/ProblemBoundary";
import { makeMe, problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import type { ReportData } from "./api";
import ReportPage from "./ReportPage";

vi.mock("@/components/NotAvailable", () => ({ NotAvailable: () => <p>not-available</p> }));

const NOVEMBER = "from=2026-11-01&to=2026-11-30";

const options: ReportFilterOptions = {
  scope: "all",
  departments: [{ id: 1, name: "Souscription" }],
  employees: [{ public_id: "e-1", name: "Amal Employee" }],
  actors: [],
  types: [
    { code: "annual", name: "Congé annuel" },
    { code: "sick", name: "Congé maladie" },
  ],
  steps: [{ code: "hr_role", name: "RH" }],
};

const absences: ReportData = {
  columns: [
    { key: "employee", label: "Salarié", kind: "text" },
    { key: "type", label: "Type", kind: "text" },
    { key: "period", label: "Dates", kind: "period" },
    { key: "days", label: "Jours", kind: "number" },
  ],
  rows: [{ employee: "Amal Employee", type: "Congé annuel", period: { start: "2026-11-02", end: "2026-11-02" }, days: "1.00" }],
  totals: { lines: [{ group: "overall", label: "Total", values: { days: "1.00" } }] },
};

const hr = makeMe({ roles: ["employee", "hr"] });
const manager = makeMe({ roles: ["employee", "manager"] });

let asked: URL[] = [];

function show(workspace: "team" | "hr" | "overview", name: string, search: string, me = hr) {
  renderApp(
    <ProblemBoundary>
      <ReportPage workspace={workspace} name={name} />
    </ProblemBoundary>,
    { route: `/${workspace}/reports/${name}${search ? `?${search}` : ""}`, me },
  );
}

beforeEach(() => {
  asked = [];
  server.use(
    http.get("/api/v1/report-filters", () => HttpResponse.json(options)),
    http.get("/api/v1/reports/absences", ({ request }) => {
      asked.push(new URL(request.url));
      return HttpResponse.json(absences);
    }),
  );
});

describe("ReportPage", () => {
  it("shows the report for the selection in the address", async () => {
    show("hr", "absences", NOVEMBER);

    expect(await screen.findByRole("heading", { level: 1, name: "Absences prises" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Résultat : Absences prises" })).toBeInTheDocument();
    expect(screen.getByLabelText("Du")).toHaveValue("2026-11-01");
    expect(screen.getByLabelText("Au")).toHaveValue("2026-11-30");
    expect(Object.fromEntries(asked[0].searchParams)).toEqual({ from: "2026-11-01", to: "2026-11-30", scope: "all" });
  });

  it("has one primary action: a download of exactly what is shown", async () => {
    show("hr", "absences", `${NOVEMBER}&type=annual`);

    await screen.findByRole("region", { name: "Résultat : Absences prises" });
    const links = screen.getAllByRole("link", { name: "Exporter vers Excel" });
    expect(links).toHaveLength(1);
    const address = new URL(links[0].getAttribute("href")!, "http://localhost");
    expect(address.pathname).toBe("/api/v1/reports/absences");
    expect(Object.fromEntries(address.searchParams)).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
      type: "annual",
      scope: "all",
      format: "xlsx",
    });
    expect(links[0]).toHaveAttribute("download");
  });

  it("limits a manager to the team and offers no department filter", async () => {
    show("team", "absences", NOVEMBER, manager);

    await screen.findByRole("region", { name: "Résultat : Absences prises" });
    expect(asked[0].searchParams.get("scope")).toBe("team");
    expect(screen.getByText("Ces rapports portent sur votre équipe.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Département" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Plus de filtres" })).not.toBeInTheDocument();
  });

  it("asks again when a filter changes, and keeps the others", async () => {
    const user = userEvent.setup();
    show("hr", "absences", NOVEMBER);
    await screen.findByRole("region", { name: "Résultat : Absences prises" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Type" }), "sick");

    await waitFor(() => expect(asked.at(-1)?.searchParams.get("type")).toBe("sick"));
    expect(asked.at(-1)?.searchParams.get("from")).toBe("2026-11-01");
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue("sick");
  });

  it("says why the result is empty and offers no export", async () => {
    server.use(http.get("/api/v1/reports/absences", () => HttpResponse.json({ ...absences, rows: [], totals: null })));

    show("hr", "absences", NOVEMBER);

    expect(await screen.findByText("Rien à afficher pour cette sélection.")).toBeInTheDocument();
    expect(screen.getByText("Élargissez la période ou retirez un filtre.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Exporter vers Excel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("explains a refused selection under the filters and keeps what was chosen", async () => {
    server.use(
      http.get("/api/v1/reports/absences", () =>
        problemResponse(400, "reports.period_order", "La date de fin précède la date de début.", [{ field: "to" }]),
      ),
    );

    show("hr", "absences", "from=2026-11-30&to=2026-11-01");

    expect(await screen.findByRole("alert")).toHaveTextContent("Date de fin : La date de fin précède la date de début.");
    expect(screen.getByLabelText("Du")).toHaveValue("2026-11-30");
    expect(screen.getByLabelText("Au")).toHaveValue("2026-11-01");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Exporter vers Excel" })).not.toBeInTheDocument();
  });

  it("shows 'not available' when the selection names someone out of reach", async () => {
    server.use(
      http.get("/api/v1/reports/absences", () =>
        problemResponse(404, "reports.employee_not_found", "Cette personne n'est pas disponible."),
      ),
    );

    show("team", "absences", `${NOVEMBER}&employee=someone-else`, manager);

    expect(await screen.findByText("not-available")).toBeInTheDocument();
  });

  it("shows nothing of a report the workspace does not have", () => {
    show("overview", "certificates", "", makeMe({ roles: ["employee", "exec"] }));

    expect(screen.getByText("not-available")).toBeInTheDocument();
    expect(asked).toHaveLength(0);
  });
});
```

Create `frontend/src/features/reports/ReportsIndexPage.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import ReportsIndexPage from "./ReportsIndexPage";

const REPORTS = [
  "Absences prises",
  "Soldes à une date",
  "Demandes en attente",
  "Heures de permission par mois",
  "Jours de télétravail par mois",
];

describe("ReportsIndexPage", () => {
  it("gives the HR desk six reports, the activity log and the KPMG export as primary action", () => {
    renderApp(<ReportsIndexPage workspace="hr" />, { route: "/hr/reports", me: makeMe({ roles: ["employee", "hr"] }) });

    for (const name of [...REPORTS, "Certificats en attente"]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /^Absences prises/ })).toHaveAttribute("href", "/hr/reports/absences");
    expect(screen.getByRole("link", { name: "Export KPMG" })).toHaveAttribute("href", "/hr/reports/kpmg");
    expect(screen.getByRole("link", { name: /^Journal d'activité/ })).toHaveAttribute("href", "/hr/reports/activity");
  });

  it("gives My team five reports about the team and nothing else", () => {
    renderApp(<ReportsIndexPage workspace="team" />, {
      route: "/team/reports",
      me: makeMe({ roles: ["employee", "manager"] }),
    });

    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByText("Ces rapports portent sur votre équipe.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Certificats/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Export KPMG" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Soldes à une date/ })).toHaveAttribute("href", "/team/reports/balances");
  });

  it("gives Overview the reports without the KPMG export", () => {
    renderApp(<ReportsIndexPage workspace="overview" />, {
      route: "/overview/reports",
      me: makeMe({ roles: ["employee", "exec"] }),
    });

    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.queryByRole("link", { name: "Export KPMG" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Journal d'activité/ })).not.toBeInTheDocument();
  });
});
```

Create `frontend/src/features/reports/routes.test.ts`:

```ts
import type { RouteObject } from "react-router";
import { describe, expect, it } from "vitest";
import { hrRoutes } from "@/workspaces/hr/routes";
import { overviewRoutes } from "@/workspaces/overview/routes";
import { teamRoutes } from "@/workspaces/team/routes";

const paths = (routes: RouteObject[]) => routes.map((route) => route.path);

describe("report routes", () => {
  it("are registered in the three workspaces that have reports", () => {
    for (const routes of [teamRoutes, hrRoutes, overviewRoutes]) {
      expect(paths(routes)).toEqual(expect.arrayContaining(["reports", "reports/:name"]));
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/reports/ReportPage.test.tsx src/features/reports/ReportsIndexPage.test.tsx src/features/reports/routes.test.ts`
Expected: FAIL with `Failed to resolve import "./ReportPage"` and `"./ReportsIndexPage"`; `routes.test.ts` fails on the missing paths.

- [ ] **Step 3: Write the report page**

Create `frontend/src/features/reports/ReportPage.tsx`:

```tsx
import { Download } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router";
import { ProblemError } from "@/api/problem";
import { EmptyState } from "@/components/EmptyState";
import { NotAvailable } from "@/components/NotAvailable";
import { PageHeader } from "@/components/PageHeader";
import { PageLoading } from "@/components/PageLoading";
import { buttonVariants } from "@/components/ui/button";
import { reportExportUrl, useReport, useReportFilters, type ReportQuery } from "./api";
import {
  defaultQuery,
  filtersFor,
  findReport,
  scopeOf,
  type FilterKey,
  type ReportDefinition,
  type ReportWorkspace,
} from "./definitions";
import { ReportFilters } from "./ReportFilters";
import { ReportProblems } from "./ReportProblems";
import { ReportTable } from "./ReportTable";

type QueryName = keyof ReportQuery;

function queryNames(keys: FilterKey[]): QueryName[] {
  return keys.flatMap((key): QueryName[] => (key === "period" ? ["from", "to"] : [key]));
}

interface ReportPageProps {
  workspace: ReportWorkspace;
  /** Defaults to the `:name` route parameter. */
  name?: string;
}

/** One report of UI 10.3: its filters, its result, its totals, and the download of what is shown. */
export default function ReportPage({ workspace, name }: ReportPageProps) {
  const params = useParams();
  const definition = findReport(name ?? params.name, workspace);
  if (!definition) return <NotAvailable />;
  return <ReportBody key={definition.name} definition={definition} workspace={workspace} />;
}

function ReportBody({ definition, workspace }: { definition: ReportDefinition; workspace: ReportWorkspace }) {
  const { t } = useTranslation("reports");
  const scope = scopeOf(workspace);
  const filters = useMemo(() => filtersFor(definition, workspace), [definition, workspace]);
  const [searchParams, setSearchParams] = useSearchParams();

  // What the address says, completed by the selection the report opens on.
  const query = useMemo(() => {
    const defaults = defaultQuery(definition, new Date());
    const selected: ReportQuery = {};
    for (const key of queryNames([...filters.visible, ...filters.more])) {
      const value = searchParams.get(key) ?? defaults[key];
      if (value) selected[key] = value;
    }
    return selected;
  }, [definition, filters, searchParams]);

  const options = useReportFilters(scope);
  const report = useReport(definition.name, scope, query);

  // A selection the server refuses is explained under the filters; anything else goes to the shell's boundary.
  const refused = report.error instanceof ProblemError && report.error.status === 400 ? report.error : null;
  if (report.error && !refused) throw report.error;

  const change = (patch: ReportQuery) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const title = t(`names.${definition.name}`);
  const data = refused ? undefined : report.data;
  const hasRows = data !== undefined && data.rows.length > 0;

  return (
    <>
      <PageHeader
        title={title}
        back={`/${workspace}/reports`}
        primary={
          hasRows ? (
            <a href={reportExportUrl(definition.name, scope, query)} download className={buttonVariants({ variant: "primary" })}>
              <Download aria-hidden="true" />
              {t("common:actions.export")}
            </a>
          ) : undefined
        }
      >
        {workspace === "team" ? t("team_note") : undefined}
      </PageHeader>
      <ReportFilters filters={filters} options={options.data} values={query} onChange={change} />
      <ReportProblems problems={refused?.errors ?? []} />
      {report.isPending && <PageLoading />}
      {data !== undefined && !hasRows && <EmptyState title={t("empty.title")} hint={t("empty.hint")} />}
      {hasRows && <ReportTable data={data} label={t("table_label", { name: title })} />}
    </>
  );
}
```

- [ ] **Step 4: Write the reports index**

Create `frontend/src/features/reports/ReportsIndexPage.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { reportsFor, type ReportWorkspace } from "./definitions";

const ENTRY = "block rounded-xl border border-border bg-card px-6 py-5 hover:bg-muted focus-visible:bg-muted";

interface ReportsIndexPageProps {
  workspace: ReportWorkspace;
}

/** The reports a workspace has. On the HR desk: the KPMG export first, and the activity log (UI 7.11). */
export default function ReportsIndexPage({ workspace }: ReportsIndexPageProps) {
  const { t } = useTranslation("reports");
  const isHr = workspace === "hr";

  return (
    <>
      <PageHeader
        title={t("title")}
        primary={
          isHr ? (
            <Button asChild variant="primary">
              <Link to="/hr/reports/kpmg">{t("kpmg.title")}</Link>
            </Button>
          ) : undefined
        }
      >
        {workspace === "team" ? t("team_note") : undefined}
      </PageHeader>
      <ul className="grid max-w-3xl gap-3">
        {reportsFor(workspace).map((report) => (
          <li key={report.name}>
            <Link to={`/${workspace}/reports/${report.name}`} className={ENTRY}>
              <span className="block text-section font-semibold text-foreground">{t(`names.${report.name}`)}</span>
              <span className="block text-body text-muted-foreground">{t(`descriptions.${report.name}`)}</span>
            </Link>
          </li>
        ))}
        {isHr && (
          <li>
            <Link to="/hr/reports/activity" className={ENTRY}>
              <span className="block text-section font-semibold text-foreground">{t("activity.title")}</span>
              <span className="block text-body text-muted-foreground">{t("activity.description")}</span>
            </Link>
          </li>
        )}
      </ul>
    </>
  );
}
```

- [ ] **Step 5: Register the routes**

In each of the three files below, add the two imports next to the existing imports and append the two route objects to the exported array.

`frontend/src/workspaces/team/routes.tsx` (array `teamRoutes`):

```tsx
import ReportPage from "@/features/reports/ReportPage";
import ReportsIndexPage from "@/features/reports/ReportsIndexPage";
```

```tsx
  { path: "reports", element: <ReportsIndexPage workspace="team" /> },
  { path: "reports/:name", element: <ReportPage workspace="team" /> },
```

`frontend/src/workspaces/hr/routes.tsx` (array `hrRoutes`):

```tsx
import ReportPage from "@/features/reports/ReportPage";
import ReportsIndexPage from "@/features/reports/ReportsIndexPage";
```

```tsx
  { path: "reports", element: <ReportsIndexPage workspace="hr" /> },
  { path: "reports/:name", element: <ReportPage workspace="hr" /> },
```

`frontend/src/workspaces/overview/routes.tsx` (array `overviewRoutes`):

```tsx
import ReportPage from "@/features/reports/ReportPage";
import ReportsIndexPage from "@/features/reports/ReportsIndexPage";
```

```tsx
  { path: "reports", element: <ReportsIndexPage workspace="overview" /> },
  { path: "reports/:name", element: <ReportPage workspace="overview" /> },
```

- [ ] **Step 6: Run the tests**

Run: `docker compose run --rm web npx vitest run src/features/reports`
Expected: all pass: 8 tests in `ReportPage.test.tsx`, 3 in `ReportsIndexPage.test.tsx`, 1 in `routes.test.ts`, plus the tests of Tasks 13 and 14.

Run: `docker compose run --rm web npx vitest run src/app src/features/shell`
Expected: PASS. A test of plan 01b that lists the navigation entries drawn for a workspace now also finds "Rapports" in My team, the HR desk and Overview; where it compares an exact list, add the entry.

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no findings.

- [ ] **Step 7: See it in the browser**

Run: `docker compose up -d` then `docker compose exec app python manage.py seed_demo`. Sign in at `http://localhost:5173` as `manager.a@impactrisks.com` (password `Correct-Horse-42!`), open My team, Reports, Absences taken.
Expected: "Rapports" is in the My team navigation; the report shows the current month for the team; there is no Department filter; the address changes when a filter changes and survives a reload.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/reports frontend/src/workspaces
git commit -m "feat(reports): report pages for My team, the HR desk and Overview"
```

---

### Task 16: Frontend: the KPMG export page

UI 7.11: asked: the period and, optionally, department, employee, type. Shown: the columns of the file and the rules applied, one sentence each. Action: Export to Excel. State: nothing to export for this selection.

**Files:**
- Create: `frontend/src/features/reports/KpmgExportPage.tsx`
- Modify: `frontend/src/workspaces/hr/routes.tsx` (append one route)
- Modify: `frontend/src/features/reports/routes.test.ts` (one more test)
- Test: `frontend/src/features/reports/KpmgExportPage.test.tsx`

**Interfaces:**
- Consumes: `useKpmgDefaultPeriod`, `useReportFilters`, `downloadKpmg`, `KpmgQuery`, `ReportQuery` (Task 13); `ReportFilters`, `ReportProblems` (Task 14); `saveBlob`; plan 01b's `PageHeader`, `EmptyState`, `Block({ title, children })` from `@/components/Block`, `toast(message)` from `@/components/toast`, `Button`, `ProblemError`, `FieldProblem`, `problemText(error, t)` from `@/api/problemText`; `common:actions.export`.
- Produces: `KpmgExportPage()` (default export) at `/hr/reports/kpmg`; `KPMG_COLUMN_KEYS` (the ten keys, in file order).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/reports/KpmgExportPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMe, problemResponse } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import KpmgExportPage from "./KpmgExportPage";

const saveBlob = vi.hoisted(() => vi.fn());
vi.mock("./download", () => ({ saveBlob }));

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const hr = makeMe({ roles: ["employee", "hr"] });
let asked: URL[] = [];

function show() {
  renderApp(<KpmgExportPage />, { route: "/hr/reports/kpmg", me: hr });
}

async function ready() {
  await waitFor(() => expect(screen.getByLabelText("Du")).toHaveValue("2026-11-01"));
}

beforeEach(() => {
  asked = [];
  saveBlob.mockClear();
  server.use(
    http.get("/api/v1/exports/kpmg/default-period", () =>
      HttpResponse.json({ start: "2026-11-01", end: "2026-11-30", cutoff_day: null }),
    ),
    http.get("/api/v1/report-filters", () =>
      HttpResponse.json({
        scope: "all",
        departments: [{ id: 1, name: "Souscription" }],
        employees: [{ public_id: "e-1", name: "Amal Employee" }],
        actors: [],
        types: [{ code: "sick", name: "Congé maladie" }],
        steps: [],
      }),
    ),
    http.get("/api/v1/exports/kpmg", ({ request }) => {
      asked.push(new URL(request.url));
      return new HttpResponse(new Blob(["workbook"]), { headers: { "Content-Type": XLSX } });
    }),
  );
});

describe("KpmgExportPage", () => {
  it("opens on the proposed period", async () => {
    show();

    await ready();
    expect(screen.getByLabelText("Au")).toHaveValue("2026-11-30");
    expect(screen.getByText("Période proposée : le mois en cours.")).toBeInTheDocument();
  });

  it("explains a period that follows the payroll cut-off", async () => {
    server.use(
      http.get("/api/v1/exports/kpmg/default-period", () =>
        HttpResponse.json({ start: "2026-10-26", end: "2026-11-25", cutoff_day: 25 }),
      ),
    );

    show();

    await waitFor(() => expect(screen.getByLabelText("Du")).toHaveValue("2026-10-26"));
    expect(screen.getByLabelText("Au")).toHaveValue("2026-11-25");
    expect(screen.getByText(/jusqu'au jour de clôture \(le 25\)/)).toBeInTheDocument();
  });

  it("states the ten columns of the file and the three rules", () => {
    show();

    const columns = within(screen.getByRole("list", { name: "Colonnes du fichier" })).getAllByRole("listitem");
    expect(columns.map((item) => item.textContent)).toEqual([
      "Matricule",
      "Nom",
      "Département",
      "Congé annuel (jours)",
      "Congé maladie (jours)",
      "Congé exceptionnel (jours)",
      "Permissions (heures)",
      "Télétravail (jours)",
      "Solde annuel en fin de période",
      "Tickets restaurant",
    ]);
    const rules = within(screen.getByRole("list", { name: "Règles appliquées" })).getAllByRole("listitem");
    expect(rules).toHaveLength(3);
    expect(rules[0]).toHaveTextContent("Seules les demandes approuvées sont comptées.");
    expect(rules[1]).toHaveTextContent("Les jours situés hors de la période sont exclus.");
    expect(rules[2]).toHaveTextContent(/moins un par jour ouvré entier d'absence/);
  });

  it("has one primary action and keeps the type filter one step away", () => {
    show();

    expect(screen.getAllByRole("button", { name: "Exporter vers Excel" })).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Département" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Salarié" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Type" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plus de filtres" })).toBeInTheDocument();
  });

  it("exports the selection in one click and says so", async () => {
    const user = userEvent.setup();
    show();
    await ready();

    await user.selectOptions(screen.getByRole("combobox", { name: "Département" }), "1");
    await user.click(screen.getByRole("button", { name: "Exporter vers Excel" }));

    expect(await screen.findByText("Le fichier a été téléchargé.")).toBeInTheDocument();
    expect(asked).toHaveLength(1);
    expect(Object.fromEntries(asked[0].searchParams)).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
      department: "1",
    });
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "kpmg_2026-11-01_2026-11-30.xlsx");
  });

  it("says when there is nothing to export", async () => {
    server.use(
      http.get("/api/v1/exports/kpmg", () =>
        problemResponse(400, "reports.nothing_to_export", "Élargissez la période ou retirez un filtre."),
      ),
    );
    const user = userEvent.setup();
    show();
    await ready();

    await user.click(screen.getByRole("button", { name: "Exporter vers Excel" }));

    expect(await screen.findByText("Rien à exporter pour cette sélection.")).toBeInTheDocument();
    expect(screen.getByText("Élargissez la période ou retirez un filtre.")).toBeInTheDocument();
    expect(saveBlob).not.toHaveBeenCalled();
    expect(screen.queryByText("Le fichier a été téléchargé.")).not.toBeInTheDocument();
  });

  it("explains a refused period under the filters and keeps what was chosen", async () => {
    server.use(
      http.get("/api/v1/exports/kpmg", () =>
        problemResponse(400, "reports.period_order", "La date de fin précède la date de début.", [{ field: "to" }]),
      ),
    );
    const user = userEvent.setup();
    show();
    await ready();

    await user.click(screen.getByRole("button", { name: "Exporter vers Excel" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Date de fin : La date de fin précède la date de début.");
    expect(screen.getByLabelText("Du")).toHaveValue("2026-11-01");
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("forgets a refusal as soon as the selection changes", async () => {
    server.use(
      http.get("/api/v1/exports/kpmg", () =>
        problemResponse(400, "reports.nothing_to_export", "Élargissez la période ou retirez un filtre."),
      ),
    );
    const user = userEvent.setup();
    show();
    await ready();
    await user.click(screen.getByRole("button", { name: "Exporter vers Excel" }));
    await screen.findByText("Rien à exporter pour cette sélection.");

    await user.selectOptions(screen.getByRole("combobox", { name: "Salarié" }), "e-1");

    expect(screen.queryByText("Rien à exporter pour cette sélection.")).not.toBeInTheDocument();
  });
});
```

Add this test inside the `describe` of `frontend/src/features/reports/routes.test.ts`:

```ts
  it("gives the HR desk the KPMG export", () => {
    expect(paths(hrRoutes)).toContain("reports/kpmg");
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/reports/KpmgExportPage.test.tsx src/features/reports/routes.test.ts`
Expected: FAIL with `Failed to resolve import "./KpmgExportPage"`; the new route test fails with `expected [...] to include 'reports/kpmg'`.

- [ ] **Step 3: Write the page**

Create `frontend/src/features/reports/KpmgExportPage.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { ProblemError, type FieldProblem } from "@/api/problem";
import { problemText } from "@/api/problemText";
import { Block } from "@/components/Block";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { downloadKpmg, useKpmgDefaultPeriod, useReportFilters, type KpmgQuery, type ReportQuery } from "./api";
import type { FilterKey } from "./definitions";
import { saveBlob } from "./download";
import { ReportFilters } from "./ReportFilters";
import { ReportProblems } from "./ReportProblems";

export const KPMG_COLUMN_KEYS = [
  "employee_number",
  "name",
  "department",
  "annual_days",
  "sick_days",
  "exceptional_days",
  "permission_hours",
  "remote_days",
  "balance_end",
  "meal_tickets",
] as const;

const RULE_KEYS = ["approved", "period", "tickets"] as const;
const FILTERS: { visible: FilterKey[]; more: FilterKey[] } = {
  visible: ["period", "department", "employee"],
  more: ["type"],
};
const QUERY_NAMES = ["from", "to", "department", "employee", "type"] as const;

type Outcome =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "nothing"; detail: string }
  | { kind: "refused"; problems: FieldProblem[] };

/** The monthly file for KPMG (UI 7.11): one period, optional filters, one click. */
export default function KpmgExportPage() {
  const { t } = useTranslation("reports");
  const proposed = useKpmgDefaultPeriod();
  const options = useReportFilters("all");
  const [searchParams, setSearchParams] = useSearchParams();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });

  // What the address says, completed by the period the server proposes (REP-07).
  const query = useMemo(() => {
    const defaults: KpmgQuery = { from: proposed.data?.start, to: proposed.data?.end };
    const selected: KpmgQuery = {};
    for (const key of QUERY_NAMES) {
      const value = searchParams.get(key) ?? defaults[key];
      if (value) selected[key] = value;
    }
    return selected;
  }, [proposed.data, searchParams]);

  const change = (patch: ReportQuery) => {
    setOutcome({ kind: "idle" });
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const exportNow = async () => {
    if (outcome.kind === "busy") return;
    setOutcome({ kind: "busy" });
    try {
      const blob = await downloadKpmg(query);
      saveBlob(blob, `kpmg_${query.from}_${query.to}.xlsx`);
      setOutcome({ kind: "idle" });
      toast(t("kpmg.exported"));
    } catch (error) {
      if (error instanceof ProblemError && error.code === "reports.nothing_to_export") {
        setOutcome({ kind: "nothing", detail: error.detail });
      } else if (error instanceof ProblemError && error.status === 400) {
        setOutcome({ kind: "refused", problems: error.errors });
      } else {
        setOutcome({ kind: "idle" });
        toast(problemText(error, t));
      }
    }
  };

  const cutoffDay = proposed.data?.cutoff_day ?? null;

  return (
    <>
      <PageHeader
        title={t("kpmg.title")}
        back="/hr/reports"
        primary={
          <Button variant="primary" onClick={exportNow} aria-busy={outcome.kind === "busy"}>
            {t("common:actions.export")}
          </Button>
        }
      >
        {t("kpmg.intro")}
      </PageHeader>

      <ReportFilters filters={FILTERS} options={options.data} values={query} onChange={change} />
      {proposed.data && (
        <p className="mb-4 text-caption text-muted-foreground">
          {cutoffDay === null ? t("kpmg.period_month") : t("kpmg.period_cutoff", { day: cutoffDay })}
        </p>
      )}
      {outcome.kind === "refused" && <ReportProblems problems={outcome.problems} />}
      {outcome.kind === "nothing" && (
        <div className="mb-4">
          <EmptyState title={t("kpmg.nothing_title")} hint={outcome.detail} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Block title={t("kpmg.columns_title")}>
          <ol aria-label={t("kpmg.columns_title")} className="m-0 grid list-decimal gap-1 pl-5 text-body">
            {KPMG_COLUMN_KEYS.map((key) => (
              <li key={key}>{t(`kpmg.columns.${key}`)}</li>
            ))}
          </ol>
        </Block>
        <Block title={t("kpmg.rules_title")}>
          <ul aria-label={t("kpmg.rules_title")} className="m-0 flex list-disc flex-col gap-2 pl-5 text-body">
            {RULE_KEYS.map((key) => (
              <li key={key}>{t(`kpmg.rules.${key}`)}</li>
            ))}
          </ul>
        </Block>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Register the route**

In `frontend/src/workspaces/hr/routes.tsx` add the import and append the route to `hrRoutes`:

```tsx
import KpmgExportPage from "@/features/reports/KpmgExportPage";
```

```tsx
  { path: "reports/kpmg", element: <KpmgExportPage /> },
```

- [ ] **Step 5: Run the tests**

Run: `docker compose run --rm web npx vitest run src/features/reports/KpmgExportPage.test.tsx src/features/reports/routes.test.ts`
Expected: 8 passed in `KpmgExportPage.test.tsx`, 2 in `routes.test.ts`.

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no findings.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/reports frontend/src/workspaces/hr/routes.tsx
git commit -m "feat(reports): the KPMG export page"
```

---

### Task 17: Frontend: the activity log under HR Reports

The page is plan 01b's `AuditLogPage`. HR may not list accounts, so that page cannot fill its "who" filter for HR, and it knows no business action (plan 01b, contract note 12). This task wraps it: the people come from `report-filters` (`actors`, Task 10), the kinds of event and of item from Task 13. It also pins, from the HR side, the rule of UI 7.11: "Sick-leave comment content appears as "changed" only."

**Files:**
- Create: `frontend/src/features/reports/ActivityLogPage.tsx`
- Modify: `frontend/src/workspaces/hr/routes.tsx` (append one route)
- Modify: `frontend/src/features/reports/routes.test.ts` (one more test)
- Test: `frontend/src/features/reports/ActivityLogPage.test.tsx`

**Interfaces:**
- Consumes (plan 01b): `AuditLogPage({ category, actors?, actionOptions?, itemTypeOptions? })`, default export of `@/features/audit/AuditLogPage`, each option being `{ value, label }`; `actionLabel(action, t, i18n)` from `@/features/audit/labels`; `GET /api/v1/audit/business` (paginated `AuditEventOut`; filters `actor`, `action`, `object_type`); `DataTable` makes the first cell of a row (here the date and time) the button that opens it; `EventSheet` shows a redacted value as `audit:event.changed` ("modifié"). `makePage` from `@/test/fixtures`; `formatDateTime` from `@/lib/format`. Task 13: `useReportFilters`, `BUSINESS_ACTIONS`, `ITEM_TYPES`.
- Produces: `ActivityLogPage()` (default export), mounted at `/hr/reports/activity` here and at `/overview/oversight/activity` in Task 18.

- [ ] **Step 1: Write the failing tests**

Add this test inside the `describe` of `frontend/src/features/reports/routes.test.ts`:

```ts
  it("gives the HR desk the activity log", () => {
    expect(paths(hrRoutes)).toContain("reports/activity");
  });
```

Create `frontend/src/features/reports/ActivityLogPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateTime } from "@/lib/format";
import { makeMe, makePage } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import ActivityLogPage from "./ActivityLogPage";

const hr = makeMe({ roles: ["employee", "hr"] });

const event = {
  id: 1,
  at: "2026-11-13T10:00:00+01:00",
  actor: "Senna RH",
  category: "business",
  action: "request.updated",
  object_type: "request",
  object_id: "0b0e7a52-7f0b-4f0e-9a55-2f2f0f1f9c11",
  object_label: "Congé maladie, Amal Employee",
  changes: {
    comment: { changed: true },
    end_date: { before: "2026-11-13", after: "2026-11-14" },
  },
  ip_address: "10.0.0.5",
  request_id: "req-9",
};

let asked: URLSearchParams[] = [];
const accountsListed = vi.fn();

function show() {
  renderApp(<ActivityLogPage />, { route: "/hr/reports/activity", path: "/hr/reports/activity", me: hr });
}

beforeEach(() => {
  asked = [];
  accountsListed.mockClear();
  server.use(
    http.get("/api/v1/report-filters", () =>
      HttpResponse.json({
        scope: "all",
        departments: [],
        employees: [],
        actors: [{ public_id: "u-9", name: "Senna RH" }],
        types: [],
        steps: [],
      }),
    ),
    http.get("/api/v1/audit/business", ({ request }) => {
      asked.push(new URL(request.url).searchParams);
      return HttpResponse.json(makePage([event]));
    }),
    http.get("/api/v1/accounts", () => {
      accountsListed();
      return HttpResponse.json(makePage([]));
    }),
  );
});

describe("ActivityLogPage", () => {
  it("names what happened instead of showing its code", async () => {
    show();

    const table = await screen.findByRole("table", { name: "Journal d'activité" });
    expect(within(table).getByText("Demande modifiée")).toBeInTheDocument();
    expect(within(table).queryByText("request.updated")).not.toBeInTheDocument();
  });

  it("lets HR filter by person without listing the accounts", async () => {
    const user = userEvent.setup();
    show();

    const who = await screen.findByRole("combobox", { name: "Qui" });
    await waitFor(() => expect(within(who).getByRole("option", { name: "Senna RH" })).toBeInTheDocument());
    await user.selectOptions(who, "u-9");

    await waitFor(() => expect(asked.at(-1)?.get("actor")).toBe("u-9"));
    expect(accountsListed).not.toHaveBeenCalled();
  });

  it("offers the kinds of event and, one step away, the kinds of item", async () => {
    const user = userEvent.setup();
    show();

    const kinds = await screen.findByRole("combobox", { name: "Type d'événement" });
    expect(within(kinds).getByRole("option", { name: "Départ enregistré" })).toBeInTheDocument();
    expect(within(kinds).getByRole("option", { name: "Export KPMG" })).toBeInTheDocument();
    await user.selectOptions(kinds, "export.kpmg");
    await waitFor(() => expect(asked.at(-1)?.get("action")).toBe("export.kpmg"));

    await user.click(screen.getByRole("button", { name: "Plus de filtres" }));
    const items = screen.getByRole("combobox", { name: "Type d'élément" });
    await user.selectOptions(items, "request");
    await waitFor(() => expect(asked.at(-1)?.get("object_type")).toBe("request"));
    expect(within(items).getByRole("option", { name: "Demande" })).toBeInTheDocument();
  });

  it("shows a redacted field as changed, never as a value", async () => {
    const user = userEvent.setup();
    show();

    await user.click(await screen.findByRole("button", { name: formatDateTime(event.at, "fr") }));

    const sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveTextContent("comment");
    expect(sheet).toHaveTextContent("modifié");
    expect(sheet).not.toHaveTextContent("true");
    expect(sheet).not.toHaveTextContent("[object Object]");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/reports/routes.test.ts src/features/reports/ActivityLogPage.test.tsx`
Expected: FAIL with `Failed to resolve import "./ActivityLogPage"`; the route test fails with `expected [...] to include 'reports/activity'`.

- [ ] **Step 3: Write the page**

Create `frontend/src/features/reports/ActivityLogPage.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import AuditLogPage from "@/features/audit/AuditLogPage";
import { actionLabel } from "@/features/audit/labels";
import { BUSINESS_ACTIONS, ITEM_TYPES } from "./activity";
import { useReportFilters } from "./api";

/**
 * The business audit (UI 7.11). The log page itself is plan 01b's; this gives it the people, the kinds
 * of event and the kinds of item to filter on. The people come from `report-filters`, which HR and
 * Executive Management may read: HR cannot list accounts.
 */
export default function ActivityLogPage() {
  const { t, i18n } = useTranslation();
  const options = useReportFilters("all");

  const actors = (options.data?.actors ?? []).map((actor) => ({ value: actor.public_id, label: actor.name }));
  const actionOptions = BUSINESS_ACTIONS.map((action) => ({ value: action, label: actionLabel(action, t, i18n) }));
  const itemTypeOptions = ITEM_TYPES.map((type) => ({ value: type, label: t(`reports:activity.items.${type}`) }));

  return <AuditLogPage category="business" actors={actors} actionOptions={actionOptions} itemTypeOptions={itemTypeOptions} />;
}
```

- [ ] **Step 4: Register the route**

In `frontend/src/workspaces/hr/routes.tsx` add the import and append the route to `hrRoutes`:

```tsx
import ActivityLogPage from "@/features/reports/ActivityLogPage";
```

```tsx
  { path: "reports/activity", element: <ActivityLogPage /> },
```

- [ ] **Step 5: Run the tests**

Run: `docker compose run --rm web npx vitest run src/features/reports/routes.test.ts src/features/reports/ActivityLogPage.test.tsx`
Expected: 3 passed in `routes.test.ts`, 4 in `ActivityLogPage.test.tsx`.

If the last test fails on "true" or on a missing "modifié", the defect is in how plan 01b's `EventSheet` draws a change of the form `{"changed": true}`: correct it there, in `features/audit/EventSheet.tsx`, and keep this test as written.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/reports frontend/src/workspaces/hr/routes.tsx
git commit -m "feat(reports): the activity log under HR reports, with its filters"
```

---

### Task 18: Frontend: Overview, Oversight

UI 8.6: four entries, all read-only: activity log, security log, HR settings, accounts and system. Every page is one that an earlier plan built; this task only mounts them with `readOnly` and adds the index, two small hubs and a frame with a way back.

**Files:**
- Create: `frontend/src/features/reports/oversight/OversightIndexPage.tsx`
- Create: `frontend/src/features/reports/oversight/OversightHubPage.tsx`
- Create: `frontend/src/features/reports/oversight/OversightFrame.tsx`
- Create: `frontend/src/features/reports/oversight/routes.tsx`
- Modify: `frontend/src/workspaces/overview/routes.tsx` (one import, one spread element)
- Modify: `frontend/src/features/reports/routes.test.ts` (one more test)
- Test: `frontend/src/features/reports/oversight/oversight.test.tsx`

**Interfaces:**
- Consumes (default exports; `readOnly` leaves a page without any action and without its back link):
  - plan 01b: `@/features/audit/AuditLogPage` (`category`); `@/features/settings/SettingsGroupPage` (`group`, `readOnly`); `@/features/accounts/StatusPage`, `AccountsPage` (opens an account with a relative address), `AccountPage` (reads the `:id` parameter, links back with a relative address), each with `readOnly`
  - plan 02: `@/features/employees/DepartmentsPositionsPage` (`readOnly`); `HR_SETTINGS_SUBJECTS` from `@/features/settings/hrSubjects` (`{ id, path, titleKey, descriptionKey, order }`, keys fully qualified; ids `request-types`, `steps`, `events`, `holidays`, `parameters`, `departments`)
  - plan 03b: `@/features/requests/settings/RequestTypesPage`, `TypeStepsPage` (reads `?type=`), `EventsPage`, `HolidaysPage`, each with `readOnly`
  - Task 17: `ActivityLogPage`
- Produces:
  - `oversightRoutes: RouteObject[]` in `features/reports/oversight/routes.tsx`, paths relative to the Overview workspace
  - `OversightIndexPage()`, `OversightHubPage({ hub: "hr-settings" | "system" })` (default exports), `OversightFrame({ back, children })`
  - `OVERSIGHT_HR_SUBJECTS` (the ids of the HR settings subjects that have a read-only page)

Addresses:

| Address | Page |
|---|---|
| `/overview/oversight` | Index: four entries |
| `/overview/oversight/activity` | `ActivityLogPage` |
| `/overview/oversight/security` | `AuditLogPage category="security"` |
| `/overview/oversight/hr-settings` | Hub: the subjects of the HR settings index, in its order |
| `/overview/oversight/hr-settings/request-types` | `RequestTypesPage readOnly` |
| `/overview/oversight/hr-settings/steps` | `TypeStepsPage readOnly` |
| `/overview/oversight/hr-settings/events` | `EventsPage readOnly` |
| `/overview/oversight/hr-settings/holidays` | `HolidaysPage readOnly` |
| `/overview/oversight/hr-settings/parameters` | `SettingsGroupPage group="hr" readOnly` |
| `/overview/oversight/hr-settings/departments` | `DepartmentsPositionsPage readOnly` |
| `/overview/oversight/system` | Hub: system status, accounts, system parameters |
| `/overview/oversight/system/status` | `StatusPage readOnly` |
| `/overview/oversight/system/accounts` | `AccountsPage readOnly` |
| `/overview/oversight/system/accounts/:id` | `AccountPage readOnly` |
| `/overview/oversight/system/parameters` | `SettingsGroupPage group="system" readOnly` |

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/reports/oversight/oversight.test.tsx`:

```tsx
import { cleanup, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import OversightHubPage from "./OversightHubPage";
import OversightIndexPage from "./OversightIndexPage";
import { oversightRoutes } from "./routes";

const { mounted, stub } = vi.hoisted(() => {
  const mounted: { page: string; props: Record<string, unknown> }[] = [];
  const stub = (page: string) => ({
    default: (props: Record<string, unknown>) => {
      mounted.push({ page, props });
      return page;
    },
  });
  return { mounted, stub };
});

vi.mock("@/features/audit/AuditLogPage", () => stub("AuditLogPage"));
vi.mock("@/features/reports/ActivityLogPage", () => stub("ActivityLogPage"));
vi.mock("@/features/settings/SettingsGroupPage", () => stub("SettingsGroupPage"));
vi.mock("@/features/accounts/StatusPage", () => stub("StatusPage"));
vi.mock("@/features/accounts/AccountsPage", () => stub("AccountsPage"));
vi.mock("@/features/accounts/AccountPage", () => stub("AccountPage"));
vi.mock("@/features/employees/DepartmentsPositionsPage", () => stub("DepartmentsPositionsPage"));
vi.mock("@/features/requests/settings/RequestTypesPage", () => stub("RequestTypesPage"));
vi.mock("@/features/requests/settings/TypeStepsPage", () => stub("TypeStepsPage"));
vi.mock("@/features/requests/settings/EventsPage", () => stub("EventsPage"));
vi.mock("@/features/requests/settings/HolidaysPage", () => stub("HolidaysPage"));
vi.mock("@/features/settings/hrSubjects", () => ({
  HR_SETTINGS_SUBJECTS: [
    { id: "departments", path: "/hr/settings/departments", titleKey: "reports:oversight.system.accounts", descriptionKey: "reports:oversight.read_only", order: 60 },
    { id: "request-types", path: "/hr/settings/request-types", titleKey: "reports:oversight.system.status", descriptionKey: "reports:oversight.read_only", order: 10 },
    { id: "something-new", path: "/hr/settings/something-new", titleKey: "reports:title", descriptionKey: "reports:title", order: 70 },
  ],
}));

const exec = makeMe({ roles: ["employee", "exec"] });

function show(path: string) {
  const route = oversightRoutes.find((candidate) => candidate.path === path);
  if (!route) throw new Error(`no oversight route for ${path}`);
  renderApp(<>{route.element}</>, { route: `/overview/${path}`, path: `/overview/${path}`, me: exec });
}

function linksUnder(prefix: string): (string | null)[] {
  return screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"))
    .filter((href) => href?.startsWith(prefix));
}

beforeEach(() => {
  mounted.length = 0;
});

describe("Oversight", () => {
  it("lists the four entries of the UI document and no action", () => {
    renderApp(<OversightIndexPage />, { route: "/overview/oversight", path: "/overview/oversight", me: exec });

    expect(screen.getByRole("heading", { level: 1, name: "Supervision" })).toBeInTheDocument();
    expect(screen.getByText("Tout ce qui suit est en consultation seule.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Journal d'activité/ })).toHaveAttribute("href", "/overview/oversight/activity");
    expect(screen.getByRole("link", { name: /^Journal de sécurité/ })).toHaveAttribute("href", "/overview/oversight/security");
    expect(screen.getByRole("link", { name: /^Réglages RH/ })).toHaveAttribute("href", "/overview/oversight/hr-settings");
    expect(screen.getByRole("link", { name: /^Comptes et système/ })).toHaveAttribute("href", "/overview/oversight/system");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("lists the HR settings in the order of the HR index, and only those it can show", () => {
    renderApp(<OversightHubPage hub="hr-settings" />, { route: "/overview/oversight/hr-settings", path: "/overview/oversight/hr-settings", me: exec });

    expect(linksUnder("/overview/oversight/hr-settings/")).toEqual([
      "/overview/oversight/hr-settings/request-types",
      "/overview/oversight/hr-settings/departments",
    ]);
    expect(screen.getByRole("link", { name: /^Retour/ })).toHaveAttribute("href", "/overview/oversight");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("lists the system pages an executive may read", () => {
    renderApp(<OversightHubPage hub="system" />, { route: "/overview/oversight/system", path: "/overview/oversight/system", me: exec });

    expect(linksUnder("/overview/oversight/system/")).toEqual([
      "/overview/oversight/system/status",
      "/overview/oversight/system/accounts",
      "/overview/oversight/system/parameters",
    ]);
  });

  it.each([
    ["oversight/activity", "ActivityLogPage", {}, "/overview/oversight"],
    ["oversight/security", "AuditLogPage", { category: "security" }, "/overview/oversight"],
    ["oversight/hr-settings/request-types", "RequestTypesPage", { readOnly: true }, "/overview/oversight/hr-settings"],
    ["oversight/hr-settings/steps", "TypeStepsPage", { readOnly: true }, "/overview/oversight/hr-settings"],
    ["oversight/hr-settings/events", "EventsPage", { readOnly: true }, "/overview/oversight/hr-settings"],
    ["oversight/hr-settings/holidays", "HolidaysPage", { readOnly: true }, "/overview/oversight/hr-settings"],
    ["oversight/hr-settings/parameters", "SettingsGroupPage", { group: "hr", readOnly: true }, "/overview/oversight/hr-settings"],
    ["oversight/hr-settings/departments", "DepartmentsPositionsPage", { readOnly: true }, "/overview/oversight/hr-settings"],
    ["oversight/system/status", "StatusPage", { readOnly: true }, "/overview/oversight/system"],
    ["oversight/system/accounts", "AccountsPage", { readOnly: true }, "/overview/oversight/system"],
    ["oversight/system/parameters", "SettingsGroupPage", { group: "system", readOnly: true }, "/overview/oversight/system"],
  ])("%s mounts %s with a way back", (path, page, props, back) => {
    show(path);

    expect(mounted.at(-1)).toEqual({ page, props });
    expect(screen.getByRole("link", { name: "Retour à la supervision" })).toHaveAttribute("href", back);
  });

  it("mounts an account read-only and leaves the way back to the page itself", () => {
    show("oversight/system/accounts/:id");

    expect(mounted.at(-1)).toEqual({ page: "AccountPage", props: { readOnly: true } });
    expect(screen.queryByRole("link", { name: "Retour à la supervision" })).not.toBeInTheDocument();
  });

  it("mounts every page that has actions with readOnly, so that none is rendered", () => {
    for (const route of oversightRoutes) {
      renderApp(<>{route.element}</>, { route: `/overview/${route.path}`, path: `/overview/${route.path}`, me: exec });
      cleanup();
    }

    const withActions = mounted.filter((entry) => entry.page !== "AuditLogPage" && entry.page !== "ActivityLogPage");
    expect(withActions).toHaveLength(10);
    expect(withActions.every((entry) => entry.props.readOnly === true)).toBe(true);
    expect(oversightRoutes).toHaveLength(15);
  });
});
```

Add this test inside the `describe` of `frontend/src/features/reports/routes.test.ts`:

```ts
  it("gives Overview the oversight pages", () => {
    expect(paths(overviewRoutes)).toEqual(
      expect.arrayContaining([
        "oversight",
        "oversight/activity",
        "oversight/security",
        "oversight/hr-settings",
        "oversight/system",
      ]),
    );
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/reports/oversight src/features/reports/routes.test.ts`
Expected: FAIL with `Failed to resolve import "./OversightHubPage"`; the new route test fails on the missing paths.

- [ ] **Step 3: Write the frame**

A read-only page drops its own back link (it would lead to the HR desk or to Administration). The frame gives the reader a way back inside Overview.

Create `frontend/src/features/reports/oversight/OversightFrame.tsx`:

```tsx
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

interface OversightFrameProps {
  /** Where "back" leads: the Oversight index or one of its two hubs. */
  back: string;
  children: ReactNode;
}

export function OversightFrame({ back, children }: OversightFrameProps) {
  const { t } = useTranslation("reports");
  return (
    <>
      <Link to={back} className="mb-2 inline-flex min-h-11 items-center gap-2 text-body font-medium text-primary hover:underline md:min-h-0">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("oversight.back")}
      </Link>
      {children}
    </>
  );
}
```

- [ ] **Step 4: Write the index**

Create `frontend/src/features/reports/oversight/OversightIndexPage.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";

const ENTRIES = ["activity", "security", "hr-settings", "system"] as const;
const ENTRY = "block rounded-xl border border-border bg-card px-6 py-5 hover:bg-muted focus-visible:bg-muted";

/** Overview, Oversight (UI 8.6): four entries, nothing to change anywhere. */
export default function OversightIndexPage() {
  const { t } = useTranslation("reports");
  return (
    <>
      <PageHeader title={t("oversight.title")}>{t("oversight.read_only")}</PageHeader>
      <ul className="grid max-w-3xl gap-3">
        {ENTRIES.map((entry) => (
          <li key={entry}>
            <Link to={`/overview/oversight/${entry}`} className={ENTRY}>
              <span className="block text-section font-semibold text-foreground">{t(`oversight.entries.${entry}.title`)}</span>
              <span className="block text-body text-muted-foreground">{t(`oversight.entries.${entry}.description`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
```

- [ ] **Step 5: Write the hub**

Create `frontend/src/features/reports/oversight/OversightHubPage.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";
import { HR_SETTINGS_SUBJECTS } from "@/features/settings/hrSubjects";

/** The HR settings subjects that have a read-only page under Oversight (see `routes.tsx`). */
export const OVERSIGHT_HR_SUBJECTS = ["request-types", "steps", "events", "holidays", "parameters", "departments"];

const SYSTEM_ENTRIES = ["status", "accounts", "parameters"] as const;
const ENTRY = "block rounded-xl border border-border bg-card px-6 py-5 hover:bg-muted focus-visible:bg-muted";

export type OversightHub = "hr-settings" | "system";

interface HubEntry {
  to: string;
  title: string;
  description?: string;
}

/** One of the two hubs of Oversight: the HR settings, or the accounts and the system. */
export default function OversightHubPage({ hub }: { hub: OversightHub }) {
  const { t } = useTranslation("reports");

  // The HR hub follows the HR desk's own settings index: same subjects, same order, same words.
  const entries: HubEntry[] =
    hub === "hr-settings"
      ? [...HR_SETTINGS_SUBJECTS]
          .filter((subject) => OVERSIGHT_HR_SUBJECTS.includes(subject.id))
          .sort((a, b) => a.order - b.order)
          .map((subject) => ({
            to: `/overview/oversight/hr-settings/${subject.id}`,
            title: t(subject.titleKey),
            description: t(subject.descriptionKey),
          }))
      : SYSTEM_ENTRIES.map((entry) => ({
          to: `/overview/oversight/system/${entry}`,
          title: t(`oversight.system.${entry}`),
        }));

  return (
    <>
      <PageHeader title={t(`oversight.entries.${hub}.title`)} back="/overview/oversight">
        {t("oversight.read_only")}
      </PageHeader>
      <ul className="grid max-w-3xl gap-3">
        {entries.map((entry) => (
          <li key={entry.to}>
            <Link to={entry.to} className={ENTRY}>
              <span className="block text-section font-semibold text-foreground">{entry.title}</span>
              {entry.description && <span className="block text-body text-muted-foreground">{entry.description}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
```

- [ ] **Step 6: Write the routes**

Create `frontend/src/features/reports/oversight/routes.tsx`:

```tsx
import type { RouteObject } from "react-router";
import AccountPage from "@/features/accounts/AccountPage";
import AccountsPage from "@/features/accounts/AccountsPage";
import StatusPage from "@/features/accounts/StatusPage";
import AuditLogPage from "@/features/audit/AuditLogPage";
import DepartmentsPositionsPage from "@/features/employees/DepartmentsPositionsPage";
import ActivityLogPage from "@/features/reports/ActivityLogPage";
import EventsPage from "@/features/requests/settings/EventsPage";
import HolidaysPage from "@/features/requests/settings/HolidaysPage";
import RequestTypesPage from "@/features/requests/settings/RequestTypesPage";
import TypeStepsPage from "@/features/requests/settings/TypeStepsPage";
import SettingsGroupPage from "@/features/settings/SettingsGroupPage";
import { OversightFrame } from "./OversightFrame";
import OversightHubPage from "./OversightHubPage";
import OversightIndexPage from "./OversightIndexPage";

const TOP = "/overview/oversight";
const HR = "/overview/oversight/hr-settings";
const SYSTEM = "/overview/oversight/system";

/**
 * Overview, Oversight (UI 8.6). Paths are relative to the Overview workspace. Every page that has
 * actions elsewhere is mounted with `readOnly`: nothing here can change anything.
 */
export const oversightRoutes: RouteObject[] = [
  { path: "oversight", element: <OversightIndexPage /> },
  {
    path: "oversight/activity",
    element: (
      <OversightFrame back={TOP}>
        <ActivityLogPage />
      </OversightFrame>
    ),
  },
  {
    path: "oversight/security",
    element: (
      <OversightFrame back={TOP}>
        <AuditLogPage category="security" />
      </OversightFrame>
    ),
  },
  { path: "oversight/hr-settings", element: <OversightHubPage hub="hr-settings" /> },
  {
    path: "oversight/hr-settings/request-types",
    element: (
      <OversightFrame back={HR}>
        <RequestTypesPage readOnly />
      </OversightFrame>
    ),
  },
  {
    path: "oversight/hr-settings/steps",
    element: (
      <OversightFrame back={HR}>
        <TypeStepsPage readOnly />
      </OversightFrame>
    ),
  },
  {
    path: "oversight/hr-settings/events",
    element: (
      <OversightFrame back={HR}>
        <EventsPage readOnly />
      </OversightFrame>
    ),
  },
  {
    path: "oversight/hr-settings/holidays",
    element: (
      <OversightFrame back={HR}>
        <HolidaysPage readOnly />
      </OversightFrame>
    ),
  },
  {
    path: "oversight/hr-settings/parameters",
    element: (
      <OversightFrame back={HR}>
        <SettingsGroupPage group="hr" readOnly />
      </OversightFrame>
    ),
  },
  {
    path: "oversight/hr-settings/departments",
    element: (
      <OversightFrame back={HR}>
        <DepartmentsPositionsPage readOnly />
      </OversightFrame>
    ),
  },
  { path: "oversight/system", element: <OversightHubPage hub="system" /> },
  {
    path: "oversight/system/status",
    element: (
      <OversightFrame back={SYSTEM}>
        <StatusPage readOnly />
      </OversightFrame>
    ),
  },
  {
    path: "oversight/system/accounts",
    element: (
      <OversightFrame back={SYSTEM}>
        <AccountsPage readOnly />
      </OversightFrame>
    ),
  },
  // The account page links back to the list above by itself (a relative address, plan 01b).
  { path: "oversight/system/accounts/:id", element: <AccountPage readOnly /> },
  {
    path: "oversight/system/parameters",
    element: (
      <OversightFrame back={SYSTEM}>
        <SettingsGroupPage group="system" readOnly />
      </OversightFrame>
    ),
  },
];
```

- [ ] **Step 7: Register them in the Overview workspace**

In `frontend/src/workspaces/overview/routes.tsx` add the import and append one element to `overviewRoutes`:

```tsx
import { oversightRoutes } from "@/features/reports/oversight/routes";
```

```tsx
  ...oversightRoutes,
```

- [ ] **Step 8: Run the tests**

Run: `docker compose run --rm web npx vitest run src/features/reports`
Expected: all pass; `oversight.test.tsx` has 16 tests (3, then 11 parametrised, then 2) and `routes.test.ts` has 4.

Run: `docker compose run --rm web npx vitest run src/app src/features/shell`
Expected: PASS; "Supervision" now appears in the navigation of Overview (add it where a test of plan 01b compares the exact list of entries).

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no findings.

- [ ] **Step 9: Read the pages as an executive**

Run: `docker compose up -d`, sign in at `http://localhost:5173` as `ceo@impactrisks.com` (password `Correct-Horse-42!`), open Overview, Oversight ("Vue d'ensemble", "Supervision").

Expected:
- The four entries open. The HR settings hub lists the six subjects of the HR desk's settings index, in the same order.
- Accounts and system, Accounts: opening an account stays under `/overview/oversight/system/accounts/…`, and the page shows no reset, unlock, disable or role control.
- HR settings, each subject: no "Nouveau", "Modifier", "Enregistrer", "Ajouter" or "Supprimer" anywhere; a request type still opens to be read.
- The security log lists the accounts in its "Qui" filter (Executive Management may list them); the activity log lists the employees who have an account.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/reports frontend/src/workspaces/overview/routes.tsx
git commit -m "feat(reports): the read-only Oversight pages of Overview"
```

---

### Task 19: Browser journeys: the month for KPMG, and a manager's team report

Two journeys of UI section 12: "Prepare the month for KPMG" (HR desk: Reports, KPMG export, Export) and a manager reading a report about the team. Both open the downloaded workbook and read its cells.

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json` (dev dependency `exceljs`)
- Create: `frontend/e2e/kpmg-export.spec.ts`
- Create: `frontend/e2e/team-report.spec.ts`

**Interfaces:**
- Consumes: plan 01b's Playwright set-up (projects `desktop` and `phone`, one database for both, `e2e_reset` before the suite); plan 02's `e2e/people.ts` (`HR`, `MANAGER`, `EMPLOYEE`); plan 03b's `e2e/requests.ts`: `become(page, from, to)`, `askFor(page, type, day)`, `approveAsManager(page, name, day)`, `validateAsHr(page, name, day)`, `tuesday(weeks)`, `ownWeek(testInfo, journey)` (journeys 1, 2, 3, 6 and 8 are taken; this plan uses 10 and 11).
- Produces: nothing other plans consume.

- [ ] **Step 1: Add the workbook reader**

Playwright runs on this machine, not in a container (master D20), so the dependency is installed on the host and then in the container's own `node_modules`.

Run, from `frontend/`: `npm install --save-dev exceljs`
Then, from the repository root: `docker compose run --rm web npm ci`
Expected: `exceljs` is in `devDependencies` of `frontend/package.json`; both commands end without error.

- [ ] **Step 2: Write the KPMG journey**

Create `frontend/e2e/kpmg-export.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { EMPLOYEE, HR, MANAGER } from "./people";
import { approveAsManager, askFor, become, ownWeek, tuesday, validateAsHr } from "./requests";

const COLUMNS = [
  "Matricule",
  "Nom",
  "Département",
  "Congé annuel (jours)",
  "Congé maladie (jours)",
  "Congé exceptionnel (jours)",
  "Permissions (heures)",
  "Télétravail (jours)",
  "Solde annuel en fin de période",
  "Tickets restaurant",
];

test("HR prepares the figures for KPMG with one export", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 10));

  // One remote day for Amal, approved by her manager and validated by HR.
  await become(page, null, EMPLOYEE);
  await askFor(page, "Télétravail", day);
  await become(page, EMPLOYEE, MANAGER);
  await approveAsManager(page, EMPLOYEE.name, day);
  await become(page, MANAGER, HR);
  await validateAsHr(page, EMPLOYEE.name, day);

  // Reports, KPMG export: the page says what the file will contain and by which rules.
  await page.goto("/hr/reports");
  await page.getByRole("link", { name: "Export KPMG", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Export KPMG", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Colonnes du fichier" }).getByRole("listitem")).toHaveText(COLUMNS);
  await expect(page.getByRole("list", { name: "Règles appliquées" }).getByRole("listitem")).toHaveCount(3);

  // The period is the one day of the request. The end is set first so that it never precedes the start.
  await page.getByLabel("Au", { exact: true }).fill(day);
  await page.getByLabel("Du", { exact: true }).fill(day);

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter vers Excel", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`kpmg_${day}_${day}.xlsx`);
  await expect(page.getByText("Le fichier a été téléchargé.")).toBeVisible();

  // The file: the ten columns of REP-04, one row per employee, and Amal's remote day.
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await download.path());
  const sheet = workbook.worksheets[0];
  const cells = (row: number) => (sheet.getRow(row).values as unknown[]).slice(1);
  expect(cells(1)).toEqual(COLUMNS);
  let amal: unknown[] | null = null;
  for (let row = 2; row <= sheet.rowCount; row += 1) {
    if (cells(row)[1] === EMPLOYEE.name) amal = cells(row);
  }
  expect(amal, "Amal's row is in the file").not.toBeNull();
  expect(amal![7]).toBe(1); // remote work, in days
  expect(amal!.slice(3, 7)).toEqual([0, 0, 0, 0]); // no leave and no permission that day
  expect(amal![9]).toBe(21); // remote work does not reduce meal tickets

  // The export is in the activity log, with who made it.
  await page.goto("/hr/reports/activity");
  const exported = page
    .getByRole("main")
    .locator("tbody tr, ul[aria-label] > li")
    .filter({ hasText: "Export KPMG" })
    .filter({ hasText: HR.name });
  await expect(exported.first()).toBeVisible();
});
```

- [ ] **Step 3: Write the manager's journey**

Create `frontend/e2e/team-report.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { EMPLOYEE, HR, MANAGER } from "./people";
import { approveAsManager, askFor, become, ownWeek, tuesday, validateAsHr } from "./requests";

test("a manager reads and exports a report about the team", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 11));

  await become(page, null, EMPLOYEE);
  await askFor(page, "Télétravail", day);
  await become(page, EMPLOYEE, MANAGER);
  await approveAsManager(page, EMPLOYEE.name, day);
  await become(page, MANAGER, HR);
  await validateAsHr(page, EMPLOYEE.name, day);
  await become(page, HR, MANAGER);

  // My team, Reports: five reports about the team, none about certificates.
  await page.goto("/team/reports");
  await expect(page.getByText("Ces rapports portent sur votre équipe.")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Certificats en attente/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Export KPMG", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: /^Absences prises/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Absences prises", exact: true })).toBeVisible();

  // No department filter in My team; the period narrows the result to the day of the request.
  await expect(page.getByRole("combobox", { name: "Département" })).toHaveCount(0);
  await page.getByLabel("Au", { exact: true }).fill(day);
  await page.getByLabel("Du", { exact: true }).fill(day);
  const result = page.getByRole("region", { name: "Résultat : Absences prises" });
  const line = result.getByRole("row").filter({ hasText: EMPLOYEE.name }).filter({ hasText: "Télétravail" });
  await expect(line).toHaveCount(1);

  // The selection is in the address: it survives a reload.
  await page.reload();
  await expect(line).toHaveCount(1);
  await expect(page.getByLabel("Du", { exact: true })).toHaveValue(day);

  // The download is what is shown.
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exporter vers Excel", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^absences_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await download.path());
  const sheet = workbook.worksheets[0];
  const cells = (row: number) => (sheet.getRow(row).values as unknown[]).slice(1);
  expect(cells(1)).toEqual(["Salarié", "Département", "Type", "Du", "Au", "Jours", "Heures"]);
  expect(cells(2)[0]).toBe(EMPLOYEE.name);
  expect(cells(2)[2]).toBe("Télétravail");
  expect(cells(2)[5]).toBe(1);
});
```

- [ ] **Step 4: Run the two journeys**

Run: `docker compose up -d`
Run, from `frontend/`: `npx playwright test kpmg-export team-report`
Expected: 4 passed (two journeys, on `desktop` and on `phone`). The suite empties the development database and loads the demo data before it starts.

If `askFor` reports that the weekly limit of remote work is exceeded, the demo data already holds remote days in that week: choose two other journey numbers for `ownWeek` (any above 11) in both files.

- [ ] **Step 5: Run everything**

Run: `docker compose run --rm app pytest -q`
Expected: PASS.

Run: `docker compose run --rm app ruff check . && docker compose run --rm app ruff format --check .`
Expected: no findings.

Run: `docker compose run --rm web npx vitest run && docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: PASS, no findings.

Run, from `frontend/`: `npx playwright test`
Expected: PASS, every journey of plans 01b to 06 on both projects.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/e2e/kpmg-export.spec.ts frontend/e2e/team-report.spec.ts
git commit -m "test(reports): browser journeys for the KPMG export and a team report"
```

---

## Spec coverage

| Requirement or section | Tasks |
|---|---|
| REP-01 six reports, filterable, exportable to Excel | 3 (filters), 4 (workbook), 5 to 9 (the six reports), 10 (export), 12 (API), 14 and 15 (pages) |
| REP-02 managers limited to their reports; HR and executives for everyone | 3 (`resolve_scope`, `employees_in_scope`), 10, 12 (matrix), 15, 19 |
| REP-03 KPMG export: filters, one Excel file, no preview, approval or versioning | 11, 12, 16, 19 |
| REP-04 one row per employee, ten columns | 11 (`KPMG_COLUMNS`), 16 (the columns stated on the page), 19 |
| REP-05 approved requests only; days outside the period excluded | 5, 8, 11 |
| REP-06 meal tickets: base, full days on flagged types, half-days | 2 (setting), 11 |
| REP-07 default period: calendar month or cut-off | 2 (setting), 11 (`default_period`), 12, 16 |
| REP-08 no comment, no medical detail; each export audited with its filters | 9, 11, 12, 17 (the export in the log), 19 |
| AUD-02 every report export is a business event | 10 (`report.exported`), 11 (`export.kpmg`) |
| AUD-06 HR and executives read business events; filters by actor, item, action, period | 17, 18 (the audit API itself is plan 01a's) |
| Permission matrix: Reports, KPMG export, audit reading | 12 (matrix cases), 15, 17, 18 |
| NFR-06 exports in French and English | 2 (texts), 4, 10, 11 |
| ADM-05 meal-ticket base and export cut-off day | 2, 13 (labels) |
| A6, A7 | 11 |
| UI 6.7 My team, Reports (five, team-scoped) | 13, 15, 19 |
| UI 7.11 HR desk, Reports: KPMG export first, six reports, activity log | 15, 16, 17 |
| UI 8.5 Overview, Reports | 13, 15 (five reports; see Contract notes 11) |
| UI 8.6 Overview, Oversight | 18 |
| UI 10.3 each report: filters, result table, totals, Excel export of what is shown | 5 to 9, 14, 15 |
| UI M5 at most three visible filters | 13 (`definitions.test.ts`), 14 |
| UI 12 journey "Prepare the month for KPMG" | 19 |
| Master 6.7 settings `meal_tickets_per_month`, `export_cutoff_day` | 2 |
| Master 7.11 `reports/{name}`, `exports/kpmg`, `exports/kpmg/default-period` | 12 |
| Master 9.3 `AuditLogPage` mounted for the activity log and under Oversight; `readOnly` pages under Oversight | 17, 18 |
| Master 9.4 pages of plan 06 | 15, 16, 17, 18 |
| Master 10, item 2 (periods that cross a boundary, export side) and item 9 (medical detail in a report or export) | 5, 8, 9, 11, 12 |

## Contract notes

Where the master is silent, where this plan adds to it, and what it takes from the plans before it. Nothing here changes a name, route or access set the master fixes.

**Additions to the master**

1. **One more route, `GET report-filters`** (`reports:report-filters`; MANAGER, HR, EXEC; operation id `reports_filters`). It returns `{scope, departments, employees, actors, types, steps}` for the caller's scope: what the filters of a report may offer, never more than the report would show. A manager gets the team and no departments. `actors` are the accounts of the employees in scope (account `public_id` and name): the audit API filters on an account id, HR may not list accounts, and plan 01b's log page asks plan 06 for the people (its contract note 12).
2. **`reports/{name}` takes `scope`** (`team` or `all`), like `GET requests`. Without it, HR and executives get `all` and a manager gets `team`. An executive who manages people can ask for `team`; My team sends it.
3. **Shapes.** A report column has a fifth kind, `period`: its cell is `{start, end}`, one attribute on screen and two date columns in the workbook. `totals` is `{lines: [{group, label, values}]}` with `group` in `overall`, `by_employee`, `by_type`; in a workbook the lines follow the data rows. `exports/kpmg/default-period` returns `{start, end, cutoff_day}`. `exports/kpmg` answers 400 `reports.nothing_to_export` when the selection has nobody.
4. **Names.** Error codes: `reports.unknown_report`, `hr_only`, `scope_not_allowed`, `unknown_scope`, `period_required`, `period_order`, `period_too_long`, `invalid_date`, `invalid_year`, `invalid_filter`, `filter_not_available`, `unknown_type`, `unknown_step`, `employee_not_found`, `nothing_to_export`. Operation ids: `reports_filters`, `reports_run`, `kpmg_export`, `kpmg_default_period`. Enumeration names: `ReportColumnKindEnum`, `ReportTotalGroupEnum`, `ReportScopeEnum`. Audit actions: `report.exported` (object type `report`, object id the report's name) and `export.kpmg` (object type `export`), both with `changes = {filters, rows}`.
5. **Bounds of the two settings.** `meal_tickets_per_month`: 0 to 31. `export_cutoff_day`: 1 to 28, so that the day exists in every month.

**Rules chosen where the specs are silent**

6. **Which type feeds which KPMG column.** Annual, sick and exceptional days are the types with the seeded codes `annual`, `sick`, `exceptional`; permission hours are every hour-based type; remote days are every day-based type whose calendar label is `remote`. A type HR adds later appears in no column, though it reduces meal tickets when flagged. To be settled with the KPMG sample (PRD open item 2).
7. **Meal tickets.** A ticket is lost for each date on which the portions of ticket-reducing types add up to a full day, so a morning of annual leave and an afternoon of sick leave on one date cost one ticket, and a single half-day costs none. The base is the setting times the whole months of the period (at least one): 26 October to 25 November is one month, 1 November to 31 December two. The result never goes below zero. The type filter narrows the five absence columns only: tickets and balance stay complete, since a partial ticket count would be wrong.
8. **Who is in the export.** Everyone hired on or before the last day of the period and still employed on its first day (`Employee.archived_at`, the leaving date, is empty or not before the period). A joiner or a leaver gets the full base of tickets: the PRD gives no pro-rating. The balance is the posted ledger balance on the last day of the period.
9. **Default period with a cut-off day** always ends on this month's cut-off day: before the cut-off it is the running period, after it the one just closed, which is when HR exports.
10. **Limits.** A period is at most 731 days. A department filter with `scope=team` is refused (400), not ignored. An employee filter naming someone outside the caller's scope answers 404 (master D14).
11. **Overview has five reports.** UI 8.5 says "the six reports", but UI 10.2 and 10.3 and master 7.11 keep certificate status and the certificates report for HR. The API refuses it to an executive, so the page does not offer it.
12. **Content of the reports.** "Absences taken" lists every approved request of every type, remote work and permissions included (the type column and the totals per type tell them apart). "Requests waiting" has one column more than UI 10.3, the age in whole days (REP-01: "with age"). The monthly reports list only people who have something in the year. People who left appear in a report where they have rows, and not in "Balances at a date".

**How this plan sits on the earlier ones**

13. **Plan 01a.** `build_workbook` is used as built (headers in row 1, safe sheet title, local time for datetimes); `audit.record` always receives `actor=`; every method has an `operation_id` and every choice set a name. `format` is a parameter of `reports/{name}`, so that view carries a content-negotiation class that ignores DRF's own `?format=` override.
14. **Plan 02.** Reads `Employee.hire_date`, `archived_at`, `employee_number`, `department_id`, and `employee.user.public_id` for `actors`, on rows returned by `employees_for`; filters and sorts them in Python instead of querying organisation tables.
15. **Plan 03a.** Request types are read through its selector `request_types(active_only=False)`; nothing is appended to its files. Its test helpers build the scenario. Day rows are counted with today's holidays (its note 28), so the figures of a past month change if HR adds a holiday inside it afterwards; master D22 already makes HR correct the affected requests.
16. **Plan 04.** The scenario asks for `ledger_port`; `figures(employee_id, today=<the report's date>)` gives the pending and upcoming days of "Balances at a date".
17. **Plan 05.** `apps/reports/apps.py` is replaced to add `ready()` (it had none); routes, matrix cases and enumeration names are appended. `apps/requests/spans.py` is not needed here.
18. **Plan 01b.** Filters are its `FilterDateRange`, `FilterSelect` and `FilterText`. Those controls have no error line, so a problem the server reports on a filter is shown directly under the filter bar, named after the filter. Report results use this plan's `ReportTable`, because `DataTable` stops at six columns and UI 10.3 defines a twelve-month table. A report is downloaded through a plain link, as its logs are; the KPMG file is fetched, so that "nothing to export" is said on the page. Types are appended to `@/api/types`; one type is narrowed by hand (`ReportCell`), because the schema can only describe a cell as "any value". The texts of all business audit actions of plans 02, 03a, 04 and 06 are added to `audit.json` (its note 12), which changes one assertion of its own `AuditLogPage.test.tsx` (Task 13, Step 12). Its navigation tests gain "Rapports" and "Supervision" where they compare exact lists.
19. **Plans 02 and 03b.** The Oversight hub of HR settings is drawn from `HR_SETTINGS_SUBJECTS`, so it follows the HR desk's index; a subject added later appears there only after a read-only route is added for it (`OVERSIGHT_HR_SUBJECTS`). The steps page is mounted at `oversight/hr-settings/steps` and reads `?type=`, as on the HR desk. Read-only pages have no back link, so each is wrapped in a small frame with one.

**For the plans that follow and the project owner**

20. **Plan 07.** The privacy sweep can add the four routes of this plan; `test_no_report_shows_the_sick_leave_comment` (Task 12) already calls every report as JSON and as a workbook. `exceljs` is a dev dependency used by the browser tests only. The browser journeys use the journey numbers 10 and 11 of `ownWeek`.
21. **Project owner.** Three choices above change what KPMG receives and deserve a look when the sample file arrives: which types feed which column (6), meal tickets for half-days, long periods, joiners and leavers (7, 8), and the default period after the cut-off (9).
