# IRIS HR Platform, Plan 04: Balances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every employee an annual-leave balance that is the sum of an append-only ledger (opening balance, automatic month-end credits, leave taken and restored by the request engine, HR adjustments), with the pages that show it and change it.

**Architecture:** A new Django app, `balances`, owns one table, `LedgerEntry`, which the database refuses to update or delete. The app implements the `BalancePort` that the request engine of plan 03a already calls, so annual leave is checked against the projected balance and posted to the ledger without any change to `apps.requests`. A daily Procrastinate task posts the month-end credits that are missing. The React feature `balances` adds the My space Balance page, the HR adjustment sheet, and a block and a fact on the employee record.

**Tech Stack:** Python 3.13, Django 5.2, Django REST Framework, drf-spectacular, PostgreSQL 17 (PL/pgSQL triggers), Procrastinate, pytest-django, time-machine. React 19, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query v5, React Router v7, react-i18next, react-hook-form with zod, openapi-fetch, Vitest, Testing Library, MSW v2, Playwright.

**Spec:**

- `docs/superpowers/plans/2026-10-06-iris-hr-00-master-plan.md` (binding contract: sections 6, 7.10, 8, 9)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-prd-design.md` (5.4, 6.2, 6.3, 7, 8.5, 9.5)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-ui-design.md` (5.6, 7.9, and the balance figures of 5.3, 6.2, 6.3, 7.8)
- `docs/design/README.md`, `docs/design/iris-hr-tokens.css`

## Global Constraints

Master plan section 2 applies in full. The constraints below bear directly on this plan and are copied from the specs.

- BAL-01: "The annual-leave balance of an employee is the sum of their ledger entries. Entries are never edited or deleted; a correction is a new entry."
- BAL-02: "Entry kinds: opening balance, month-end credit, leave taken, restoration, adjustment."
- BAL-03: "On the last day of each month every active employee is credited 2.5 days (a setting). The credit is pro-rated in the month of joining and of leaving. It cannot be posted twice for the same employee and month, and months missed while the server was down are posted on the next run."
- BAL-04: "Balances carry over indefinitely. There is no year-end reset, cap or expiry."
- BAL-05: "HR adjusts a balance by posting a positive or negative entry with a mandatory reason. The employee is notified and sees the entry."
- PRD 6.2: "For a month in which the employee joins or leaves: 2.5 x (calendar days employed in the month / calendar days in the month), rounded to the nearest 0.5." "The entry is dated the last day of the month." "Archived employees are not credited after their leaving date."
- PRD 6.3: "A new annual-leave request is accepted only if, with its days included, the projected balance is zero or more on every date from its first day up to the last date on which the employee has any posted or reserved leave."
- PRD 6.3: "When a request is finally approved, one "leave taken" entry is posted per calendar month the leave touches, dated the first leave day in that month, for the days in that month. Cancelling or shortening posts matching restoration entries."
- PRD 7, permission matrix. Balance and ledger: Employee Own, Manager Team, HR All, Executive All, System Administrator No. Adjust balance: HR only.
- Master D8: "Append-only audit and ledger are enforced by database triggers that reject UPDATE, DELETE and TRUNCATE."
- Master D11: "New HR setting `credit_start_date`. No month-end credit is posted for a month ending before it, and nothing is posted while it is empty. Opening balances are stated as of the day before."
- Master D18: "A pending amendment reserves only the days it adds. Its own affordability check ignores the request it replaces."
- Master 6.4: "Quantities are `Decimal` in Python, `DecimalField(max_digits=7, decimal_places=2)` in the database, strings in JSON."
- Master 2: "An app never queries another app's tables. It calls that app's services or selectors."
- Master 7.10: `LedgerEntry.request_id` is a "plain integer referencing a request, no cross-app foreign key".
- UI M10: "The figure a person came for is shown first and alone. An employee sees one balance, not a table of balances."
- UI 3.4: "Where the PRD requires a reason, the action cannot be confirmed without one." "Days allow halves; hours allow quarters."
- Design README: "One primary button per page; no disabled controls — what a role can't use is not shown." Focused tasks are "a 480px right sheet — full screen on phone".

## Review Focus

The five inputs most likely to hurt a person using balances. Each has a test in the task that owns the code.

1. **Leave across a month or a year boundary.** Leave from 28 December to 8 January must produce one ledger line per month, each dated the first leave day of that month, and a later cancellation or shortening must net out on those same dates. Tests: Task 6 (`test_leave_across_two_months_and_two_years_is_posted_per_month`, the four restoration tests), Task 10 (`test_final_approval_posts_one_line_per_month`), Task 11.
2. **The clock.** The credit job after weeks of downtime, in February and in a leap February, for someone who joined or left mid-month, run the day before month end, on the last day, and twice in a day. Tests: Task 2 (all of `test_month_credit.py`), Task 3 (`test_months_missed_while_the_server_was_down_are_caught_up`, `test_running_twice_posts_nothing_more`, `test_the_credit_is_posted_on_the_last_day_and_not_the_day_before`).
3. **Leave that earlier requests already need.** A new request for next week must be refused when approving it would leave approved leave in December unaffordable, and pending requests and pending amendments must hold their days. Tests: Task 5 (`test_a_later_approved_leave_makes_an_earlier_request_unaffordable`, `test_pending_days_are_held`), Task 10 (`test_a_request_that_would_starve_approved_later_leave_is_refused`, `test_a_pending_amendment_holds_only_the_days_it_adds`).
4. **Go-live gaps.** No credit start date yet, an employee with no ledger line at all, an opening balance of zero, an opening balance entered twice, a date in the year 9999 typed into "balance on a date". Tests: Task 3 (`test_nothing_is_posted_while_the_start_date_is_empty`), Task 7 (`test_a_second_opening_balance_is_refused`, `test_an_opening_balance_may_be_zero_or_negative`), Task 8 (`test_an_employee_without_any_entry_has_a_zero_balance_everywhere`, `test_a_date_too_far_ahead_is_refused`), Task 14 (`shows a zero balance and an empty history for a new employee`).
5. **HR typing an adjustment.** A comma instead of a dot ("1,5"), a reason made of spaces, a double click on Save, a removal that leaves the balance negative. Tests: Task 7 (`test_a_reason_of_spaces_is_refused`, `test_hr_can_remove_more_days_than_the_balance_holds`), Task 15 (`accepts a comma as the decimal separator`, `does not send without a reason`, `sends once when Save is clicked twice`, `shows a negative resulting balance`).

## Before you start

Plans 01a, 01b, 02, 03a and 03b are complete and merged. Check the baseline before the first task:

```bash
docker compose up -d
docker compose run --rm app pytest -q
docker compose run --rm web npx vitest run
```

Expected: both suites pass. Write down the two totals; every task below adds to them and none may reduce them.

This plan consumes interfaces that the master plan fixes but whose code was written by other plans. If a name used here does not exist exactly as written (an import path, a prop), align this plan's code with the existing name and do not change the earlier plan's behaviour. The section "Contract notes" at the end lists every such assumption.

## File map

Backend, all new unless marked:

| File | Responsibility |
|---|---|
| `backend/apps/balances/apps.py` | App config: truncate bypass outside production, settings, messages, notification event, port |
| `backend/apps/balances/models.py` | `LedgerKind`, `LedgerEntry` and its constraints |
| `backend/apps/balances/migrations/0001_initial.py` | Table (generated) |
| `backend/apps/balances/migrations/0002_append_only.py` | Triggers that refuse UPDATE, DELETE, TRUNCATE |
| `backend/apps/balances/messages.py` | French and English texts |
| `backend/apps/balances/services.py` | Credit rule, month-end job body, leave postings, opening balance, adjustment |
| `backend/apps/balances/selectors.py` | Balance on a date, projection, affordability, figures, ledger lines |
| `backend/apps/balances/port.py` | `LedgerBalancePort`, the implementation of `apps.requests.ports.BalancePort` |
| `backend/apps/balances/tasks.py` | The daily Procrastinate task |
| `backend/apps/balances/seed.py` | Demo balances |
| `backend/apps/balances/api/serializers.py`, `views.py`, `urls.py` | The three endpoints of master 7.10 |
| `backend/apps/balances/tests/` | `world.py` (builders), `conftest.py`, `flows.py`, `matrix.py`, `test_*.py` |
| `backend/apps/organisation/selectors.py` (modify) | Append `all_employees()` |
| `backend/conftest.py` (modify) | Append the two port fixtures |
| `backend/config/settings.py`, `backend/config/api_urls.py`, `backend/tests/test_permission_matrix.py`, `backend/apps/core/management/commands/seed_demo.py` (modify) | One line each |

Frontend, all new unless marked:

| File | Responsibility |
|---|---|
| `frontend/src/features/balances/api.ts` | Query keys and hooks |
| `frontend/src/features/balances/format.ts` | Signed amounts, typed day counts |
| `frontend/src/features/balances/BalanceSummary.tsx` | The figure and its three companions |
| `frontend/src/features/balances/BalanceOnDate.tsx` | Balance on a chosen date |
| `frontend/src/features/balances/LedgerTable.tsx` | The history, entry by entry |
| `frontend/src/features/balances/BalancePage.tsx` | My space, Balance |
| `frontend/src/features/balances/AdjustBalanceSheet.tsx` | Adjustment and opening balance |
| `frontend/src/features/balances/BalanceBlock.tsx`, `BalanceFact.tsx` | The employee-record block and fact |
| `frontend/src/i18n/locales/fr/balances.json`, `en/balances.json` | Texts |
| `frontend/e2e/balance.spec.ts` | The browser journey |
| `frontend/src/workspaces/me/routes.tsx`, `frontend/src/features/employees/recordBlocks.tsx`, `frontend/src/i18n/locales/*/settings.json` (modify) | One appended element or key group each |

---

### Task 1: The ledger table that cannot be rewritten

**Files:**
- Create: `backend/apps/balances/__init__.py`, `backend/apps/balances/apps.py`, `backend/apps/balances/models.py`
- Create: `backend/apps/balances/migrations/__init__.py`, `backend/apps/balances/migrations/0001_initial.py` (generated), `backend/apps/balances/migrations/0002_append_only.py`
- Create: `backend/apps/balances/tests/__init__.py`, `backend/apps/balances/tests/world.py`
- Modify: `backend/config/settings.py` (one line in `INSTALLED_APPS`)
- Test: `backend/apps/balances/tests/test_ledger_model.py`

**Interfaces:**
- Consumes: `organisation.Employee` (foreign key target), `settings.AUTH_USER_MODEL`, the `world` fixture of `backend/conftest.py` (`world.owner`, `world.peer`).
- Produces:
  - `apps.balances.models.LedgerKind` with values `opening`, `credit`, `taken`, `restored`, `adjustment`.
  - `apps.balances.models.LedgerEntry(employee, kind, amount, effective_date, period, request_id, reason, created_by, created_at)`.
  - `apps.balances.apps.truncate_bypass_enabled() -> bool`.
  - Test builders in `apps.balances.tests.world`: `TUNIS`, `at(year, month, day, hour=9) -> datetime`, `days(*dates, portion="1") -> dict[date, Decimal]`, `make_entry(employee, kind, amount, on, *, period="", request_id=None, reason="", created_by=None) -> LedgerEntry`, `give_opening(employee, days, on=date(2025, 12, 31)) -> LedgerEntry`, `give_credit(employee, year, month, days="2.5") -> LedgerEntry`.

- [ ] **Step 1: Write the test builders**

Create `backend/apps/balances/tests/__init__.py` as an empty file, then `backend/apps/balances/tests/world.py`:

```python
"""Builders for ledger tests. The standard cast starts with an empty ledger."""

from __future__ import annotations

import calendar
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from apps.balances.models import LedgerEntry, LedgerKind

TUNIS = ZoneInfo("Africa/Tunis")


def at(year: int, month: int, day: int, hour: int = 9) -> datetime:
    """A moment in Tunis time, for time_machine.travel."""
    return datetime(year, month, day, hour, 0, tzinfo=TUNIS)


def days(*dates: date, portion: str = "1") -> dict[date, Decimal]:
    """Leave days as the request engine passes them: date -> 1 or 0.5."""
    return {day: Decimal(portion) for day in dates}


def make_entry(
    employee,
    kind: str,
    amount: str | Decimal,
    on: date,
    *,
    period: str = "",
    request_id: int | None = None,
    reason: str = "",
    created_by=None,
) -> LedgerEntry:
    return LedgerEntry.objects.create(
        employee=employee,
        kind=kind,
        amount=Decimal(str(amount)),
        effective_date=on,
        period=period,
        request_id=request_id,
        reason=reason,
        created_by=created_by,
    )


def give_opening(employee, days: str | Decimal, on: date = date(2025, 12, 31)) -> LedgerEntry:
    return make_entry(employee, LedgerKind.OPENING, days, on, reason="Opening balance")


def give_credit(employee, year: int, month: int, days: str | Decimal = "2.5") -> LedgerEntry:
    last = date(year, month, calendar.monthrange(year, month)[1])
    return make_entry(employee, LedgerKind.CREDIT, days, last, period=f"{year:04d}-{month:02d}")
```

- [ ] **Step 2: Write the failing tests**

Create `backend/apps/balances/tests/test_ledger_model.py`:

```python
from datetime import date
from decimal import Decimal

import pytest
from django.db import IntegrityError, connection, transaction

from apps.balances.apps import truncate_bypass_enabled
from apps.balances.models import LedgerEntry, LedgerKind
from apps.balances.tests.world import give_credit, give_opening, make_entry


def test_entries_are_listed_by_effective_date_then_by_creation(world):
    late = make_entry(world.owner, LedgerKind.ADJUSTMENT, "1", date(2026, 3, 1), reason="Late")
    opening = give_opening(world.owner, "4", date(2025, 12, 31))
    same_day = make_entry(world.owner, LedgerKind.ADJUSTMENT, "-1", date(2026, 3, 1), reason="Same day")

    assert list(LedgerEntry.objects.filter(employee=world.owner)) == [opening, late, same_day]


def test_an_entry_cannot_be_updated(world):
    entry = give_opening(world.owner, "4")
    entry.amount = Decimal("40")

    with pytest.raises(IntegrityError), transaction.atomic():
        entry.save()

    entry.refresh_from_db()
    assert entry.amount == Decimal("4")


def test_a_bulk_update_is_refused(world):
    give_opening(world.owner, "4")

    with pytest.raises(IntegrityError), transaction.atomic():
        LedgerEntry.objects.filter(employee=world.owner).update(amount=Decimal("40"))


def test_an_entry_cannot_be_deleted(world):
    entry = give_opening(world.owner, "4")

    with pytest.raises(IntegrityError), transaction.atomic():
        entry.delete()

    assert LedgerEntry.objects.filter(pk=entry.pk).exists()


def test_truncate_is_refused_when_the_bypass_is_off(world):
    give_opening(world.owner, "4")

    with connection.cursor() as cursor:
        # Plan 01a's conftest switches every TRUNCATE guard off in the test database
        # (tests.db.disable_truncate_guards); switch this one back on for the test. The change
        # is rolled back with the test's transaction, as in plan 01a's own audit test.
        cursor.execute("ALTER TABLE balances_ledgerentry ENABLE TRIGGER balances_ledger_no_truncate")
        # Django creates foreign keys as deferred; PostgreSQL refuses any TRUNCATE on a table
        # with pending deferred checks, so run them now to reach the trigger under test.
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cursor.execute("SET LOCAL iris.allow_truncate = 'off'")
        with pytest.raises(IntegrityError), transaction.atomic():
            cursor.execute("TRUNCATE balances_ledgerentry")

    assert LedgerEntry.objects.count() == 1


def test_truncate_is_possible_outside_production_so_that_resets_work(world):
    give_opening(world.owner, "4")

    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cursor.execute("SHOW iris.allow_truncate")
        assert cursor.fetchone()[0] == "on"
        cursor.execute("TRUNCATE balances_ledgerentry")

    assert LedgerEntry.objects.count() == 0


@pytest.mark.parametrize(
    ("environment", "expected"),
    [("development", True), ("test", True), ("production", False)],
)
def test_the_truncate_bypass_never_applies_in_production(monkeypatch, environment, expected):
    monkeypatch.setenv("ENVIRONMENT", environment)

    assert truncate_bypass_enabled() is expected


def test_one_credit_per_employee_and_month(world):
    give_credit(world.owner, 2026, 1)

    with pytest.raises(IntegrityError), transaction.atomic():
        give_credit(world.owner, 2026, 1)

    give_credit(world.peer, 2026, 1)
    give_credit(world.owner, 2026, 2)
    assert LedgerEntry.objects.filter(kind=LedgerKind.CREDIT).count() == 3


def test_one_opening_balance_per_employee(world):
    give_opening(world.owner, "4")

    with pytest.raises(IntegrityError), transaction.atomic():
        give_opening(world.owner, "6")

    give_opening(world.peer, "6")


def test_a_credit_names_its_month_and_other_entries_do_not(world):
    with pytest.raises(IntegrityError), transaction.atomic():
        make_entry(world.owner, LedgerKind.CREDIT, "2.5", date(2026, 1, 31))

    with pytest.raises(IntegrityError), transaction.atomic():
        make_entry(world.owner, LedgerKind.ADJUSTMENT, "1", date(2026, 1, 31), period="2026-01", reason="x")


def test_leave_entries_name_their_request(world):
    with pytest.raises(IntegrityError), transaction.atomic():
        make_entry(world.owner, LedgerKind.TAKEN, "-1", date(2026, 2, 9))

    with pytest.raises(IntegrityError), transaction.atomic():
        make_entry(world.owner, LedgerKind.RESTORED, "1", date(2026, 2, 9))


@pytest.mark.parametrize(
    ("kind", "amount", "extra"),
    [
        (LedgerKind.CREDIT, "-2.5", {"period": "2026-01"}),
        (LedgerKind.CREDIT, "0", {"period": "2026-01"}),
        (LedgerKind.TAKEN, "1", {"request_id": 1}),
        (LedgerKind.RESTORED, "-1", {"request_id": 1}),
        (LedgerKind.ADJUSTMENT, "0", {"reason": "x"}),
    ],
)
def test_the_sign_of_an_entry_follows_its_kind(world, kind, amount, extra):
    with pytest.raises(IntegrityError), transaction.atomic():
        make_entry(world.owner, kind, amount, date(2026, 1, 31), **extra)


def test_an_opening_balance_may_be_zero_or_negative(world):
    give_opening(world.owner, "0")
    give_opening(world.peer, "-1.5")

    assert LedgerEntry.objects.filter(kind=LedgerKind.OPENING).count() == 2
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/balances/tests/test_ledger_model.py -v`
Expected: collection error, `ModuleNotFoundError: No module named 'apps.balances.apps'`.

- [ ] **Step 4: Create the app and the model**

Create `backend/apps/balances/__init__.py` and `backend/apps/balances/migrations/__init__.py` as empty files.

Create `backend/apps/balances/apps.py`:

```python
import os

from django.apps import AppConfig
from django.db.backends.signals import connection_created


def truncate_bypass_enabled() -> bool:
    """TRUNCATE on the ledger is possible only outside production (test teardown, `e2e_reset`)."""
    return os.environ.get("ENVIRONMENT", "production") != "production"


def _allow_truncate(sender, connection, **kwargs) -> None:
    if connection.vendor == "postgresql" and truncate_bypass_enabled():
        with connection.cursor() as cursor:
            cursor.execute("SET iris.allow_truncate = 'on'")


class BalancesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.balances"
    label = "balances"

    def ready(self) -> None:
        connection_created.connect(_allow_truncate, dispatch_uid="balances.allow_truncate")
```

Create `backend/apps/balances/models.py`:

```python
from django.conf import settings
from django.db import models
from django.db.models import Q


class LedgerKind(models.TextChoices):
    OPENING = "opening", "Opening balance"
    CREDIT = "credit", "Month-end credit"
    TAKEN = "taken", "Leave taken"
    RESTORED = "restored", "Restoration"
    ADJUSTMENT = "adjustment", "Adjustment"


class LedgerEntry(models.Model):
    """One line of an employee's annual-leave ledger. Never updated, never deleted (BAL-01)."""

    employee = models.ForeignKey(
        "organisation.Employee", on_delete=models.PROTECT, related_name="ledger_entries"
    )
    kind = models.CharField(max_length=12, choices=LedgerKind.choices)
    amount = models.DecimalField(max_digits=7, decimal_places=2)
    effective_date = models.DateField()
    period = models.CharField(max_length=7, blank=True, default="")
    request_id = models.BigIntegerField(null=True, blank=True)
    reason = models.CharField(max_length=500, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["effective_date", "id"]
        indexes = [
            models.Index(fields=["employee", "effective_date"], name="balances_emp_date_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["employee", "period"],
                condition=Q(kind="credit"),
                name="balances_one_credit_per_month",
            ),
            models.UniqueConstraint(
                fields=["employee"],
                condition=Q(kind="opening"),
                name="balances_one_opening_per_employee",
            ),
            models.CheckConstraint(
                condition=(Q(kind="credit") & ~Q(period="")) | (~Q(kind="credit") & Q(period="")),
                name="balances_period_only_on_credit",
            ),
            models.CheckConstraint(
                condition=Q(kind__in=["taken", "restored"], request_id__isnull=False)
                | ~Q(kind__in=["taken", "restored"]),
                name="balances_leave_entries_name_request",
            ),
            models.CheckConstraint(
                condition=Q(kind="opening")
                | Q(kind="credit", amount__gt=0)
                | Q(kind="taken", amount__lt=0)
                | Q(kind="restored", amount__gt=0)
                | (Q(kind="adjustment") & ~Q(amount=0)),
                name="balances_amount_sign",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.effective_date} {self.kind} {self.amount}"
```

In `backend/config/settings.py`, append one line to `INSTALLED_APPS`, after the line of `apps.requests`:

```python
    "apps.balances",
```

- [ ] **Step 5: Generate the table migration**

Run: `docker compose run --rm app python manage.py makemigrations balances`
Expected output:

```
Migrations for 'balances':
  apps/balances/migrations/0001_initial.py
    + Create model LedgerEntry
```

Open the generated file and confirm it creates the index `balances_emp_date_idx` and the five constraints named in the model, and that its dependencies name `organisation` and the user model.

- [ ] **Step 6: Write the append-only triggers**

Create `backend/apps/balances/migrations/0002_append_only.py`:

```python
from django.db import migrations

FORWARD = """
CREATE OR REPLACE FUNCTION balances_ledger_append_only() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'TRUNCATE' AND current_setting('iris.allow_truncate', true) = 'on' THEN
        RETURN NULL;
    END IF;
    RAISE EXCEPTION 'balances_ledgerentry is append-only: % is not allowed', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER balances_ledger_no_update_delete
    BEFORE UPDATE OR DELETE ON balances_ledgerentry
    FOR EACH ROW EXECUTE FUNCTION balances_ledger_append_only();

CREATE TRIGGER balances_ledger_no_truncate
    BEFORE TRUNCATE ON balances_ledgerentry
    FOR EACH STATEMENT EXECUTE FUNCTION balances_ledger_append_only();
"""

REVERSE = """
DROP TRIGGER IF EXISTS balances_ledger_no_truncate ON balances_ledgerentry;
DROP TRIGGER IF EXISTS balances_ledger_no_update_delete ON balances_ledgerentry;
DROP FUNCTION IF EXISTS balances_ledger_append_only();
"""


class Migration(migrations.Migration):
    dependencies = [("balances", "0001_initial")]

    operations = [migrations.RunSQL(sql=FORWARD, reverse_sql=REVERSE)]
```

`restrict_violation` is SQLSTATE 23001, which Django raises as `IntegrityError`. The session setting `iris.allow_truncate` is switched on by `apps.py` for every connection opened outside production, so that `flush` (test teardown, `e2e_reset`) keeps working; a production connection never sets it, and UPDATE and DELETE are refused everywhere.

Run: `docker compose run --rm app python manage.py migrate balances`
Expected: `Applying balances.0001_initial... OK` and `Applying balances.0002_append_only... OK`.

- [ ] **Step 7: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/balances/tests/test_ledger_model.py -v`
Expected: PASS, 19 passed.

Then confirm that a database reset still works with the new triggers:

Run: `docker compose exec app python manage.py e2e_reset`
Expected: the command ends without error. An error mentioning `append-only` means the connection did not receive `iris.allow_truncate`; check that `ENVIRONMENT` is `development` in `.env`.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/balances backend/config/settings.py
git commit -m "feat(balances): append-only ledger table with database triggers"
```

### Task 2: The monthly credit rule

**Files:**
- Create: `backend/apps/balances/services.py`
- Create: `backend/apps/balances/tests/conftest.py`
- Modify: `backend/apps/balances/apps.py` (register the two settings)
- Test: `backend/apps/balances/tests/test_month_credit.py`

**Interfaces:**
- Consumes: `apps.settings.registry.SettingDef`, `register`; `apps.settings.services.get`, `clear_cache` (imported as `settings_service`); the route `settings:hr-item`; `apps.organisation.services.archive_employee(*, actor, employee, leaving_date, reason)`; fixtures `world`, `client_for`.
- Produces, in `apps.balances.services`:
  - `ZERO: Decimal`
  - `monthly_rate() -> Decimal`
  - `credit_start_date() -> date | None`
  - `round_to_half(value: Decimal) -> Decimal` (a tie goes up)
  - `month_end(year: int, month: int) -> date`
  - `period_of(year: int, month: int) -> str` (`"2026-03"`)
  - `leaving_date(employee) -> date | None`
  - `employed_days(employee, year: int, month: int) -> int`
  - `month_credit(employee: Employee, year: int, month: int) -> Decimal`
- Produces the fixtures `ledger_settings` (`ledger_settings(rate="2.5", start=None)`) and `real_settings` (empties the settings cache before and after a test that uses the real settings).

The rule, stated once. An employee earns the monthly rate for every month in which they are employed on every calendar day. In the month they join or leave they earn `rate x days employed / days in the month`, rounded to the nearest half day; an exact tie (x.25 or x.75) goes up. Employment runs from `hire_date` to the leaving date, both included. Status does not matter: a suspended employee earns the credit (assumption A2), and an archived employee earns it up to the leaving date and never after.

- [ ] **Step 1: Write the settings fixture**

Create `backend/apps/balances/tests/conftest.py`:

```python
from datetime import date
from decimal import Decimal

import pytest

from apps.settings import services as settings_service


@pytest.fixture
def ledger_settings(monkeypatch):
    """Fixes the two ledger settings for a test: `ledger_settings(rate="2.5", start=date(...))`.

    Every other setting key still reaches the real settings service.
    """
    values: dict[str, object] = {}
    real_get = settings_service.get

    def fake_get(key: str):
        return values[key] if key in values else real_get(key)

    monkeypatch.setattr(settings_service, "get", fake_get)

    def configure(*, rate: str = "2.5", start: date | None = None) -> None:
        values["monthly_credit_days"] = Decimal(rate)
        values["credit_start_date"] = start

    return configure


@pytest.fixture
def real_settings():
    """For the few tests that read or write a setting for real: start and end with an empty cache."""
    settings_service.clear_cache()
    yield
    settings_service.clear_cache()
```

- [ ] **Step 2: Write the failing tests**

Create `backend/apps/balances/tests/test_month_credit.py`:

```python
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
import time_machine
from django.urls import reverse

from apps.balances import services
from apps.balances.tests.world import at
from apps.organisation import services as organisation_services
from apps.settings import services as settings_service

LONG_AGO = date(2020, 1, 6)


def person(hired: date, left: date | None = None, status: str = "active"):
    """Stands in for an Employee: the rule reads only these three attributes."""
    return SimpleNamespace(hire_date=hired, archived_at=left, status="archived" if left else status)


def test_a_full_month_earns_the_monthly_rate(ledger_settings):
    ledger_settings()

    assert services.month_credit(person(LONG_AGO), 2026, 3) == Decimal("2.5")


def test_the_rate_is_the_setting(ledger_settings):
    ledger_settings(rate="2")

    assert services.month_credit(person(LONG_AGO), 2026, 4) == Decimal("2")
    # joined 16 April: 15 of 30 days, 2 x 15 / 30 = 1.0
    assert services.month_credit(person(date(2026, 4, 16)), 2026, 4) == Decimal("1")


@pytest.mark.parametrize(
    ("hired", "year", "month", "expected"),
    [
        (date(2026, 3, 1), 2026, 3, "2.5"),   # the first day is a full month
        (date(2026, 3, 16), 2026, 3, "1.5"),  # 16 of 31 days: 1.29 -> 1.5
        (date(2026, 3, 25), 2026, 3, "0.5"),  # 7 of 31 days: 0.56 -> 0.5
        (date(2026, 3, 31), 2026, 3, "0"),    # 1 of 31 days: 0.08 -> 0
        (date(2026, 2, 15), 2026, 2, "1.5"),  # 14 of 28 days: exactly 1.25, the tie goes up
        (date(2028, 2, 15), 2028, 2, "1.5"),  # leap February, 15 of 29 days: 1.29 -> 1.5
        (date(2028, 2, 20), 2028, 2, "1"),    # leap February, 10 of 29 days: 0.86 -> 1.0
    ],
)
def test_the_month_of_joining_is_pro_rated(ledger_settings, hired, year, month, expected):
    ledger_settings()

    assert services.month_credit(person(hired), year, month) == Decimal(expected)


@pytest.mark.parametrize(
    ("left", "expected"),
    [
        (date(2026, 11, 30), "2.5"),  # the last day is a full month
        (date(2026, 11, 15), "1.5"),  # 15 of 30 days: exactly 1.25, the tie goes up
        (date(2026, 11, 10), "1"),    # 10 of 30 days: 0.83 -> 1.0
        (date(2026, 11, 1), "0"),     # 1 of 30 days: 0.08 -> 0
    ],
)
def test_the_month_of_leaving_is_pro_rated(ledger_settings, left, expected):
    ledger_settings()

    assert services.month_credit(person(LONG_AGO, left), 2026, 11) == Decimal(expected)


def test_joining_and_leaving_in_the_same_month(ledger_settings):
    ledger_settings()

    # 10 to 20 November: 11 of 30 days, 0.92 -> 1.0
    assert services.month_credit(person(date(2026, 11, 10), date(2026, 11, 20)), 2026, 11) == Decimal("1")


def test_nothing_is_earned_outside_employment(ledger_settings):
    ledger_settings()

    assert services.month_credit(person(date(2026, 3, 16)), 2026, 2) == Decimal("0")
    assert services.month_credit(person(LONG_AGO, date(2026, 11, 10)), 2026, 12) == Decimal("0")


def test_a_suspended_employee_earns_the_credit(ledger_settings):
    ledger_settings()

    assert services.month_credit(person(LONG_AGO, status="suspended"), 2026, 3) == Decimal("2.5")


def test_an_archived_record_without_a_leaving_date_earns_nothing(ledger_settings):
    ledger_settings()
    leaver = SimpleNamespace(hire_date=LONG_AGO, archived_at=None, status="archived")

    assert services.month_credit(leaver, 2026, 3) == Decimal("0")


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("0", "0"),
        ("0.24", "0"),
        ("0.74", "0.5"),
        ("0.75", "1"),
        ("1.24", "1"),
        ("1.25", "1.5"),
        ("1.26", "1.5"),
        ("2.5", "2.5"),
    ],
)
def test_rounding_to_the_nearest_half_sends_ties_up(value, expected):
    assert services.round_to_half(Decimal(value)) == Decimal(expected)


def test_month_end_knows_leap_years():
    assert services.month_end(2026, 2) == date(2026, 2, 28)
    assert services.month_end(2028, 2) == date(2028, 2, 29)
    assert services.period_of(2026, 3) == "2026-03"


def test_the_leaving_date_is_read_from_an_archived_employee(world, ledger_settings):
    """Guards the one assumption this plan makes about plan 02's model: where the leaving date is kept."""
    ledger_settings()
    owner = world.owner
    owner.hire_date = LONG_AGO
    owner.save(update_fields=["hire_date"])

    with time_machine.travel(at(2026, 11, 10), tick=False):
        organisation_services.archive_employee(
            actor=world.hr_user, employee=owner, leaving_date=date(2026, 11, 10), reason="Resignation"
        )
    owner.refresh_from_db()

    assert services.leaving_date(owner) == date(2026, 11, 10)
    assert services.month_credit(owner, 2026, 11) == Decimal("1")
    assert services.month_credit(owner, 2026, 12) == Decimal("0")


def test_the_two_settings_are_registered_with_their_defaults(db, real_settings):
    assert services.monthly_rate() == Decimal("2.5")
    assert services.credit_start_date() is None


def test_hr_sets_the_credit_start_date_through_the_api(world, client_for, real_settings):
    response = client_for(world.hr_user).put(
        reverse("settings:hr-item", kwargs={"key": "credit_start_date"}),
        {"value": "2026-01-01"},
        format="json",
    )

    assert response.status_code == 200
    settings_service.clear_cache()
    assert services.credit_start_date() == date(2026, 1, 1)
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/balances/tests/test_month_credit.py -v`
Expected: collection error, `ImportError: cannot import name 'services' from 'apps.balances'`.

- [ ] **Step 4: Write the rule**

Create `backend/apps/balances/services.py`:

```python
"""Rules and writes of the annual-leave ledger (PRD 5.4, 6.2, 6.3)."""

from __future__ import annotations

import calendar
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal

from django.utils import timezone

from apps.settings import services as settings_service

ZERO = Decimal("0")


def monthly_rate() -> Decimal:
    """Days credited for a full month (HR setting `monthly_credit_days`)."""
    return Decimal(str(settings_service.get("monthly_credit_days")))


def credit_start_date() -> date | None:
    """First day from which month-end credits are posted (HR setting `credit_start_date`, D11)."""
    value = settings_service.get("credit_start_date")
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def round_to_half(value: Decimal) -> Decimal:
    """Nearest half day. An exact tie (x.25, x.75) goes up."""
    return (value * 2).quantize(Decimal("1"), rounding=ROUND_HALF_UP) / 2


def month_end(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


def period_of(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def leaving_date(employee) -> date | None:
    """Last day of employment of a leaver.

    Plan 02 keeps it on the employee record; this accepts a `leaving_date` column or
    `archived_at`, as a date or as a timestamp.
    """
    value = getattr(employee, "leaving_date", None) or getattr(employee, "archived_at", None)
    if value is None:
        return None
    if isinstance(value, datetime):
        return timezone.localtime(value).date() if timezone.is_aware(value) else value.date()
    return value


def employed_days(employee, year: int, month: int) -> int:
    """Calendar days of the month on which the employee is employed, both ends included."""
    left = leaving_date(employee)
    if left is None and getattr(employee, "status", "") == "archived":
        return 0
    start = max(date(year, month, 1), employee.hire_date)
    end = month_end(year, month) if left is None else min(month_end(year, month), left)
    return max(0, (end - start).days + 1)


def month_credit(employee, year: int, month: int) -> Decimal:
    """Days earned for one month (PRD 6.2): the rate, pro-rated in the month of joining or leaving."""
    days_in_month = calendar.monthrange(year, month)[1]
    employed = employed_days(employee, year, month)
    if employed == 0:
        return ZERO
    rate = monthly_rate()
    if employed == days_in_month:
        return rate
    return round_to_half(rate * employed / days_in_month)
```

`import calendar` is the standard library: this module lives in `apps.balances`, and the project's own calendar app is `apps.calendar`.

- [ ] **Step 5: Register the two settings**

In `backend/apps/balances/apps.py`, replace the `ready` method of `BalancesConfig` with:

```python
    def ready(self) -> None:
        from decimal import Decimal

        from apps.settings.registry import SettingDef, register

        connection_created.connect(_allow_truncate, dispatch_uid="balances.allow_truncate")
        register(
            SettingDef(
                key="monthly_credit_days",
                group="hr",
                kind="decimal",
                default=Decimal("2.5"),
                minimum=Decimal("0"),
                maximum=Decimal("31"),
            )
        )
        register(SettingDef(key="credit_start_date", group="hr", kind="date_or_null", default=None))
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/balances/tests/test_month_credit.py -v`
Expected: PASS, 29 passed.

If `test_the_leaving_date_is_read_from_an_archived_employee` fails, plan 02 keeps the leaving date in a column this plan did not foresee: open `backend/apps/organisation/models.py`, find the date column that `archive_employee` writes, and read that column in `leaving_date()`. Change nothing else.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/balances
git commit -m "feat(balances): monthly credit rule with pro-rating and half-day rounding"
```

### Task 3: The month-end credit job

**Files:**
- Modify: `backend/apps/organisation/selectors.py` (append one function)
- Modify: `backend/apps/balances/services.py` (append the job body)
- Create: `backend/apps/balances/tasks.py`
- Modify: `backend/apps/balances/tests/conftest.py` (append the `cast` fixture)
- Test: `backend/apps/balances/tests/test_month_end_job.py`

**Interfaces:**
- Consumes: `apps.audit.services.record(*, action, category=BUSINESS, obj=None, object_type="", object_id="", object_label="", changes=None, actor=UNSET)` (imported as `audit`); `apps.core.jobs.recorded(name)`, `RETRY`; `procrastinate.contrib.django.app`; `apps.core.models.JobStatus(name, last_ok, ...)`; `apps.audit.models.AuditEvent`.
- Produces:
  - `apps.organisation.selectors.all_employees() -> QuerySet[Employee]` (every record, whatever its status; for system jobs that have no user).
  - `apps.balances.services.months_ending_between(start: date, end: date) -> list[tuple[int, int]]`.
  - `apps.balances.services.post_month_end_credits(*, today: date | None = None) -> int` (number of lines posted).
  - Procrastinate task `balances.month_end_credit`, daily at 01:00.
  - The fixture `cast` (the standard cast, every employee hired on 2020-01-06).

- [ ] **Step 1: Add the `cast` fixture**

In `backend/apps/balances/tests/conftest.py`, add this line to the imports at the top, above the import of `settings_service`:

```python
from apps.organisation import selectors as organisation_selectors
```

and append this fixture to the end of the file:

```python
@pytest.fixture
def cast(world):
    """The standard cast with a known hire date, so that every credit is a full month."""
    organisation_selectors.all_employees().update(hire_date=date(2020, 1, 6))
    for name in ("ceo", "hr", "manager", "owner", "peer", "other_manager", "outsider"):
        getattr(world, name).refresh_from_db()
    return world
```

- [ ] **Step 2: Write the failing tests**

Create `backend/apps/balances/tests/test_month_end_job.py`:

```python
from datetime import date
from decimal import Decimal

import time_machine

from apps.audit.models import AuditEvent
from apps.balances import services, tasks
from apps.balances.models import LedgerEntry, LedgerKind
from apps.balances.tests.world import at, give_credit
from apps.core.models import JobStatus
from apps.organisation import selectors as organisation_selectors
from apps.organisation import services as organisation_services


def credits_of(employee) -> list[tuple[str, date, Decimal]]:
    entries = LedgerEntry.objects.filter(employee=employee, kind=LedgerKind.CREDIT)
    return [(entry.period, entry.effective_date, entry.amount) for entry in entries]


def headcount() -> int:
    return organisation_selectors.all_employees().count()


def test_all_employees_includes_archived_records(cast):
    with time_machine.travel(at(2026, 2, 10), tick=False):
        organisation_services.archive_employee(
            actor=cast.hr_user, employee=cast.peer, leaving_date=date(2026, 2, 10), reason="Resignation"
        )

    everyone = set(organisation_selectors.all_employees().values_list("pk", flat=True))

    assert {cast.owner.pk, cast.peer.pk, cast.ceo.pk} <= everyone


def test_nothing_is_posted_while_the_start_date_is_empty(cast, ledger_settings):
    ledger_settings(start=None)

    assert services.post_month_end_credits(today=date(2026, 1, 31)) == 0
    assert LedgerEntry.objects.count() == 0


def test_every_employee_is_credited_at_month_end(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))

    posted = services.post_month_end_credits(today=date(2026, 1, 31))

    assert posted == headcount()
    assert credits_of(cast.owner) == [("2026-01", date(2026, 1, 31), Decimal("2.5"))]
    entry = LedgerEntry.objects.get(employee=cast.owner)
    assert entry.created_by is None
    assert entry.request_id is None
    assert entry.reason == ""


def test_the_credit_is_posted_on_the_last_day_and_not_the_day_before(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))

    assert services.post_month_end_credits(today=date(2026, 1, 30)) == 0
    assert services.post_month_end_credits(today=date(2026, 1, 31)) == headcount()


def test_no_credit_for_a_month_that_ends_before_the_start_date(cast, ledger_settings):
    ledger_settings(start=date(2026, 3, 1))

    services.post_month_end_credits(today=date(2026, 4, 2))

    assert credits_of(cast.owner) == [("2026-03", date(2026, 3, 31), Decimal("2.5"))]


def test_months_missed_while_the_server_was_down_are_caught_up(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))

    posted = services.post_month_end_credits(today=date(2026, 4, 2))

    assert posted == 3 * headcount()
    assert credits_of(cast.owner) == [
        ("2026-01", date(2026, 1, 31), Decimal("2.5")),
        ("2026-02", date(2026, 2, 28), Decimal("2.5")),
        ("2026-03", date(2026, 3, 31), Decimal("2.5")),
    ]


def test_running_twice_posts_nothing_more(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    first = services.post_month_end_credits(today=date(2026, 1, 31))
    lines = LedgerEntry.objects.count()

    second = services.post_month_end_credits(today=date(2026, 1, 31))

    assert first > 0
    assert second == 0
    assert LedgerEntry.objects.count() == lines


def test_a_run_completes_what_an_interrupted_run_left(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    give_credit(cast.owner, 2026, 1)

    posted = services.post_month_end_credits(today=date(2026, 1, 31))

    assert posted == headcount() - 1
    assert len(credits_of(cast.owner)) == 1
    assert len(credits_of(cast.peer)) == 1


def test_a_joiner_is_credited_in_proportion(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    cast.owner.hire_date = date(2026, 3, 16)
    cast.owner.save(update_fields=["hire_date"])

    services.post_month_end_credits(today=date(2026, 3, 31))

    # nothing for January and February; 16 of 31 days in March: 1.29 -> 1.5
    assert credits_of(cast.owner) == [("2026-03", date(2026, 3, 31), Decimal("1.5"))]


def test_someone_who_joined_on_the_last_day_gets_no_line(cast, ledger_settings):
    ledger_settings(start=date(2026, 3, 1))
    cast.owner.hire_date = date(2026, 3, 31)
    cast.owner.save(update_fields=["hire_date"])

    services.post_month_end_credits(today=date(2026, 3, 31))

    assert credits_of(cast.owner) == []


def test_a_leaver_is_credited_for_the_part_of_the_last_month_and_never_after(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    with time_machine.travel(at(2026, 2, 10), tick=False):
        organisation_services.archive_employee(
            actor=cast.hr_user, employee=cast.owner, leaving_date=date(2026, 2, 10), reason="Resignation"
        )

    services.post_month_end_credits(today=date(2026, 4, 2))

    # 10 of 28 days in February: 0.89 -> 1.0; nothing for March
    assert credits_of(cast.owner) == [
        ("2026-01", date(2026, 1, 31), Decimal("2.5")),
        ("2026-02", date(2026, 2, 28), Decimal("1")),
    ]


def test_the_rate_in_force_on_the_day_of_the_run_is_used(cast, ledger_settings):
    ledger_settings(rate="3", start=date(2026, 1, 1))

    services.post_month_end_credits(today=date(2026, 1, 31))

    assert credits_of(cast.owner) == [("2026-01", date(2026, 1, 31), Decimal("3"))]


def test_a_run_is_audited_once_and_an_empty_run_is_not(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))

    services.post_month_end_credits(today=date(2026, 2, 28))
    services.post_month_end_credits(today=date(2026, 2, 28))

    events = AuditEvent.objects.filter(action="ledger.credits_posted")
    assert events.count() == 1
    event = events.get()
    assert event.actor is None
    assert event.object_label == "2026-01, 2026-02"
    assert event.changes == {"lines": {"before": None, "after": 2 * headcount()}}


def test_the_daily_task_runs_the_job_and_records_its_status(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))

    with time_machine.travel(at(2026, 2, 1, hour=1), tick=False):
        tasks.month_end_credit(0)

    assert tasks.month_end_credit.name == "balances.month_end_credit"
    assert LedgerEntry.objects.filter(kind=LedgerKind.CREDIT, period="2026-01").count() == headcount()
    assert JobStatus.objects.get(name="balances.month_end_credit").last_ok is True
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/balances/tests/test_month_end_job.py -v`
Expected: collection error, `ImportError: cannot import name 'tasks' from 'apps.balances'`.

- [ ] **Step 4: Add the selector to `organisation`**

Append to the end of `backend/apps/organisation/selectors.py`:

```python
def all_employees() -> "QuerySet[Employee]":
    """Every employee record, whatever its status. For system jobs, which have no user (plan 04)."""
    return Employee.objects.all()
```

The module already imports `Employee`. The annotation is a string so that it does not depend on how the module imports `QuerySet`.

- [ ] **Step 5: Write the job body**

In `backend/apps/balances/services.py`, extend the imports at the top to:

```python
from __future__ import annotations

import calendar
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.organisation import selectors as organisation_selectors
from apps.settings import services as settings_service

from .models import LedgerEntry, LedgerKind
```

Then append to the end of the file:

```python
def months_ending_between(start: date, end: date) -> list[tuple[int, int]]:
    """(year, month) of every month whose last day falls between the two dates, both included."""
    months: list[tuple[int, int]] = []
    year, month = start.year, start.month
    while month_end(year, month) <= end:
        months.append((year, month))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


@transaction.atomic
def post_month_end_credits(*, today: date | None = None) -> int:
    """Posts every month-end credit that is due and missing. Safe to run any number of times.

    A month is due when its last day is on or after `credit_start_date` and on or before today.
    The unique constraint on (employee, period) is the final guard against a double credit.
    """
    today = today or timezone.localdate()
    start = credit_start_date()
    if start is None:
        return 0
    months = months_ending_between(start, today)
    if not months:
        return 0

    already = set(
        LedgerEntry.objects.filter(kind=LedgerKind.CREDIT).values_list("employee_id", "period")
    )
    lines: list[LedgerEntry] = []
    for employee in organisation_selectors.all_employees():
        for year, month in months:
            period = period_of(year, month)
            if (employee.id, period) in already:
                continue
            amount = month_credit(employee, year, month)
            if amount <= ZERO:
                continue
            lines.append(
                LedgerEntry(
                    employee=employee,
                    kind=LedgerKind.CREDIT,
                    amount=amount,
                    effective_date=month_end(year, month),
                    period=period,
                )
            )
    if not lines:
        return 0

    before = LedgerEntry.objects.filter(kind=LedgerKind.CREDIT).count()
    LedgerEntry.objects.bulk_create(lines, ignore_conflicts=True)
    posted = LedgerEntry.objects.filter(kind=LedgerKind.CREDIT).count() - before
    if posted:
        audit.record(
            action="ledger.credits_posted",
            object_type="ledgerentry",
            object_label=", ".join(sorted({line.period for line in lines})),
            changes={"lines": {"before": None, "after": posted}},
            actor=None,
        )
    return posted
```

- [ ] **Step 6: Write the task**

First confirm the decorator pattern in use: open `backend/apps/accounts/tasks.py` (plan 01a) and check that it stacks `@app.periodic`, `@app.task(..., retry=RETRY, queueing_lock=...)` and `@recorded(...)` in this order and takes a `timestamp: int` argument. If it differs, follow that file.

Create `backend/apps/balances/tasks.py`:

```python
from procrastinate.contrib.django import app

from apps.core.jobs import RETRY, recorded

from . import services


@app.periodic(cron="0 1 * * *")
@app.task(name="balances.month_end_credit", retry=RETRY, queueing_lock="balances.month_end_credit")
@recorded("balances.month_end_credit")
def month_end_credit(timestamp: int) -> None:
    services.post_month_end_credits()
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/balances/tests/test_month_end_job.py -v`
Expected: PASS, 14 passed.

- [ ] **Step 8: Check the worker registers the task**

Run: `docker compose up -d worker && docker compose logs --tail 50 worker`
Expected: the worker starts without an import error. Then:

Run: `docker compose exec app python manage.py shell -c "from apps.balances import tasks; print(tasks.month_end_credit.name)"`
Expected: `balances.month_end_credit`.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/balances backend/apps/organisation/selectors.py
git commit -m "feat(balances): idempotent month-end credit job with catch-up"
```

### Task 4: The balance on a date and the projected balance

**Files:**
- Create: `backend/apps/balances/selectors.py`
- Modify: `backend/apps/balances/tests/conftest.py` (append the `reservations` fixture)
- Test: `backend/apps/balances/tests/test_projection.py`

**Interfaces:**
- Consumes: `apps.requests.selectors.reserved_days(employee_id: int, *, ignoring_request_id: int | None = None) -> dict[date, Decimal]`; `apps.organisation.selectors.all_employees()`; `services.credit_start_date`, `months_ending_between`, `period_of`, `month_credit`, `month_end`.
- Produces, in `apps.balances.selectors`:
  - `balance_on(employee_id: int, on: date) -> Decimal` (posted entries only)
  - `balances_at(on: date, *, employee_ids: Iterable[int] | None = None) -> dict[int, Decimal]`
  - `projected_credits(employee, *, upto: date) -> list[tuple[date, Decimal]]`
  - `balance_events(employee_id: int, *, upto: date, extra_days: Mapping[date, Decimal] | None = None, ignoring_request_id: int | None = None, reserved: Mapping[date, Decimal] | None = None) -> list[tuple[date, Decimal]]`
  - `projected_balance(employee_id: int, on: date, *, extra_days: Mapping[date, Decimal] | None = None, ignoring_request_id: int | None = None) -> Decimal`
- Produces the fixture `reservations` (`hold = reservations; hold(employee, {date: "1"})`).

The definitions of PRD 6.3, as implemented. For a date *d*:

| Term | Implementation |
|---|---|
| Posted(d) | Sum of ledger lines dated on or before *d* |
| Projected credits(d) | For every month ending between `credit_start_date` and *d* that has no credit line yet: `month_credit` at the current rate, dated the month's last day. None while `credit_start_date` is empty |
| Reserved(d) | `requests.selectors.reserved_days`, restricted to days on or before *d* |
| Projected balance(d) | Posted(d) + Projected credits(d) - Reserved(d) - extra days on or before *d* |

`ignoring_request_id` removes that request's ledger lines and its reservations from every term (D18).

- [ ] **Step 1: Add the `reservations` fixture**

In `backend/apps/balances/tests/conftest.py`, add to the imports at the top:

```python
from apps.requests import selectors as request_selectors
```

and append to the end of the file:

```python
@pytest.fixture
def reservations(monkeypatch):
    """Replaces the days held by pending requests with a fixed set, so ledger tests need no requests.

    `hold = reservations; hold(employee, {date(2026, 11, 2): "1"})`. Without a call, nobody holds anything.
    """
    held: dict[int, dict[date, Decimal]] = {}

    def fake_reserved_days(employee_id: int, *, ignoring_request_id: int | None = None) -> dict[date, Decimal]:
        return dict(held.get(employee_id, {}))

    monkeypatch.setattr(request_selectors, "reserved_days", fake_reserved_days)

    def hold(employee, held_days: dict[date, str]) -> None:
        held[employee.id] = {day: Decimal(portion) for day, portion in held_days.items()}

    return hold
```

- [ ] **Step 2: Write the failing tests**

Create `backend/apps/balances/tests/test_projection.py`:

```python
from datetime import date
from decimal import Decimal

import pytest
import time_machine

from apps.balances import selectors
from apps.balances.models import LedgerKind
from apps.balances.tests.world import at, days, give_credit, give_opening, make_entry
from apps.organisation import services as organisation_services

pytestmark = pytest.mark.usefixtures("reservations")


def test_the_balance_on_a_date_counts_lines_dated_on_or_before_it(cast, ledger_settings):
    ledger_settings()
    owner = cast.owner
    give_opening(owner, "4", date(2025, 12, 31))
    give_credit(owner, 2026, 1)
    make_entry(owner, LedgerKind.TAKEN, "-3", date(2026, 2, 9), request_id=1)

    assert selectors.balance_on(owner.id, date(2025, 12, 30)) == Decimal("0")
    assert selectors.balance_on(owner.id, date(2025, 12, 31)) == Decimal("4")
    assert selectors.balance_on(owner.id, date(2026, 1, 31)) == Decimal("6.5")
    assert selectors.balance_on(owner.id, date(2026, 2, 8)) == Decimal("6.5")
    assert selectors.balance_on(owner.id, date(2026, 2, 9)) == Decimal("3.5")


def test_the_balance_of_an_empty_ledger_is_zero(cast):
    assert selectors.balance_on(cast.owner.id, date(2026, 6, 30)) == Decimal("0")


def test_balances_at_a_date_for_several_employees(cast):
    give_opening(cast.owner, "4", date(2025, 12, 31))
    give_credit(cast.owner, 2026, 1)
    give_credit(cast.owner, 2026, 2)

    asked = selectors.balances_at(date(2026, 1, 31), employee_ids=[cast.owner.id, cast.peer.id])
    everyone = selectors.balances_at(date(2026, 1, 31))

    assert asked == {cast.owner.id: Decimal("6.5"), cast.peer.id: Decimal("0")}
    assert everyone == {cast.owner.id: Decimal("6.5")}


def test_without_a_start_date_the_projection_is_the_posted_balance(cast, ledger_settings):
    ledger_settings(start=None)
    give_opening(cast.owner, "4", date(2025, 12, 31))

    assert selectors.projected_balance(cast.owner.id, date(2027, 12, 31)) == Decimal("4")


def test_the_projection_adds_the_credits_still_to_come(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))

    assert selectors.projected_balance(cast.owner.id, date(2026, 10, 30)) == Decimal("1")
    assert selectors.projected_balance(cast.owner.id, date(2026, 10, 31)) == Decimal("3.5")
    assert selectors.projected_balance(cast.owner.id, date(2026, 12, 15)) == Decimal("6")
    assert selectors.projected_balance(cast.owner.id, date(2026, 12, 31)) == Decimal("8.5")


def test_a_month_already_credited_is_not_counted_twice(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))
    give_credit(cast.owner, 2026, 10)

    assert selectors.projected_balance(cast.owner.id, date(2026, 11, 15)) == Decimal("3.5")


def test_the_projection_subtracts_held_days_on_or_before_the_date(cast, ledger_settings, reservations):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))
    reservations(cast.owner, {date(2026, 11, 2): "1", date(2026, 11, 3): "1", date(2026, 12, 1): "0.5"})

    assert selectors.projected_balance(cast.owner.id, date(2026, 11, 1)) == Decimal("3.5")
    assert selectors.projected_balance(cast.owner.id, date(2026, 11, 2)) == Decimal("2.5")
    assert selectors.projected_balance(cast.owner.id, date(2026, 11, 3)) == Decimal("1.5")
    assert selectors.projected_balance(cast.owner.id, date(2026, 11, 30)) == Decimal("4")
    assert selectors.projected_balance(cast.owner.id, date(2026, 12, 1)) == Decimal("3.5")


def test_the_projection_subtracts_extra_days(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))
    asked = days(date(2026, 11, 2), date(2026, 11, 3))

    assert selectors.projected_balance(cast.owner.id, date(2026, 11, 2), extra_days=asked) == Decimal("2.5")
    assert selectors.projected_balance(cast.owner.id, date(2026, 11, 3), extra_days=asked) == Decimal("1.5")


def test_ignoring_a_request_leaves_out_its_lines_and_keeps_the_others(cast, ledger_settings):
    ledger_settings(start=None)
    owner = cast.owner
    give_opening(owner, "5", date(2026, 9, 30))
    make_entry(owner, LedgerKind.TAKEN, "-2", date(2026, 11, 2), request_id=77)
    make_entry(owner, LedgerKind.TAKEN, "-1", date(2026, 11, 9), request_id=78)
    month_end = date(2026, 11, 30)

    assert selectors.projected_balance(owner.id, month_end) == Decimal("2")
    assert selectors.projected_balance(owner.id, month_end, ignoring_request_id=77) == Decimal("4")
    assert selectors.projected_balance(owner.id, month_end, ignoring_request_id=78) == Decimal("3")


def test_a_leaver_earns_no_projected_credit_after_leaving(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))
    with time_machine.travel(at(2026, 10, 20), tick=False):
        organisation_services.archive_employee(
            actor=cast.hr_user, employee=cast.owner, leaving_date=date(2026, 10, 20), reason="Resignation"
        )

    # 20 of 31 days in October: 1.61 -> 1.5; nothing for November and December
    assert selectors.projected_balance(cast.owner.id, date(2026, 12, 31)) == Decimal("2.5")
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/balances/tests/test_projection.py -v`
Expected: collection error, `ImportError: cannot import name 'selectors' from 'apps.balances'`.

- [ ] **Step 4: Write the selectors**

Create `backend/apps/balances/selectors.py`:

```python
"""Reads of the annual-leave ledger: balances, projection, affordability (PRD 6.3)."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date
from decimal import Decimal

from django.db.models import Q, QuerySet, Sum

from apps.organisation import selectors as organisation_selectors
from apps.requests import selectors as request_selectors

from . import services
from .models import LedgerEntry, LedgerKind

ZERO = Decimal("0")


def _entries(employee_id: int, *, ignoring_request_id: int | None = None) -> QuerySet[LedgerEntry]:
    entries = LedgerEntry.objects.filter(employee_id=employee_id)
    if ignoring_request_id is not None:
        entries = entries.filter(Q(request_id__isnull=True) | ~Q(request_id=ignoring_request_id))
    return entries


def _employee(employee_id: int):
    return organisation_selectors.all_employees().get(pk=employee_id)


def balance_on(employee_id: int, on: date) -> Decimal:
    """Posted(d) of PRD 6.3: the sum of the lines dated on or before the date."""
    total = _entries(employee_id).filter(effective_date__lte=on).aggregate(total=Sum("amount"))["total"]
    return total if total is not None else ZERO


def balances_at(on: date, *, employee_ids: Iterable[int] | None = None) -> dict[int, Decimal]:
    """Posted balance of several employees on a date.

    With `employee_ids`, every id asked for is in the result (zero when it has no line).
    Without, only employees that have at least one line are in the result.
    """
    entries = LedgerEntry.objects.filter(effective_date__lte=on)
    wanted = None if employee_ids is None else list(employee_ids)
    if wanted is not None:
        entries = entries.filter(employee_id__in=wanted)
    totals = {
        row["employee_id"]: row["total"]
        for row in entries.order_by().values("employee_id").annotate(total=Sum("amount"))
    }
    if wanted is None:
        return totals
    return {employee_id: totals.get(employee_id, ZERO) for employee_id in wanted}


def projected_credits(employee, *, upto: date) -> list[tuple[date, Decimal]]:
    """Month-end credits the job has not posted yet, dated on or before `upto`, at the current rate."""
    start = services.credit_start_date()
    if start is None:
        return []
    posted = set(
        LedgerEntry.objects.filter(employee_id=employee.id, kind=LedgerKind.CREDIT).values_list("period", flat=True)
    )
    credits: list[tuple[date, Decimal]] = []
    for year, month in services.months_ending_between(start, upto):
        if services.period_of(year, month) in posted:
            continue
        amount = services.month_credit(employee, year, month)
        if amount > ZERO:
            credits.append((services.month_end(year, month), amount))
    return credits


def balance_events(
    employee_id: int,
    *,
    upto: date,
    extra_days: Mapping[date, Decimal] | None = None,
    ignoring_request_id: int | None = None,
    reserved: Mapping[date, Decimal] | None = None,
) -> list[tuple[date, Decimal]]:
    """Every dated change to the projected balance up to `upto`, in no particular order.

    Posted lines, credits still to come, days held by pending requests (as negatives) and
    `extra_days` (as negatives). `reserved` lets a caller that already has the held days pass them in.
    """
    posted = _entries(employee_id, ignoring_request_id=ignoring_request_id).filter(effective_date__lte=upto)
    events: list[tuple[date, Decimal]] = list(posted.values_list("effective_date", "amount"))
    events += projected_credits(_employee(employee_id), upto=upto)
    if reserved is None:
        reserved = request_selectors.reserved_days(employee_id, ignoring_request_id=ignoring_request_id)
    events += [(day, -portion) for day, portion in reserved.items() if day <= upto]
    events += [(day, -portion) for day, portion in (extra_days or {}).items() if day <= upto]
    return events


def projected_balance(
    employee_id: int,
    on: date,
    *,
    extra_days: Mapping[date, Decimal] | None = None,
    ignoring_request_id: int | None = None,
) -> Decimal:
    """Projected balance(d) of PRD 6.3, with `extra_days` counted as held."""
    events = balance_events(
        employee_id, upto=on, extra_days=extra_days, ignoring_request_id=ignoring_request_id
    )
    return sum((amount for _, amount in events), ZERO)
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/balances/tests/test_projection.py -v`
Expected: PASS, 10 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/balances
git commit -m "feat(balances): balance on a date and projected balance"
```

### Task 5: The affordability rule

**Files:**
- Modify: `backend/apps/balances/selectors.py` (append)
- Test: `backend/apps/balances/tests/test_affordability.py`

**Interfaces:**
- Consumes: `balance_events`, `_entries`, `request_selectors.reserved_days` (Task 4).
- Produces, in `apps.balances.selectors`:
  - `Affordability(ok: bool, shortfall: Decimal = ZERO, first_negative_on: date | None = None)` (frozen dataclass)
  - `affordability(employee_id: int, new_days: Mapping[date, Decimal], *, ignoring_request_id: int | None = None) -> Affordability`

The rule of PRD 6.3: with the new days counted, the projected balance must be zero or more at the end of every day from the first new day up to the last date on which the employee has posted leave (a `taken` line), held days, or new days. The balance is a step function, so it is enough to evaluate it on the first day and then on every later date that carries an event. The shortfall is how far below zero the lowest point is.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/balances/tests/test_affordability.py`:

```python
from datetime import date
from decimal import Decimal

import pytest

from apps.balances import selectors
from apps.balances.models import LedgerKind
from apps.balances.selectors import Affordability
from apps.balances.tests.world import days, give_opening, make_entry

pytestmark = pytest.mark.usefixtures("reservations")

OCT_12_TO_14 = days(date(2026, 10, 12), date(2026, 10, 13), date(2026, 10, 14))
DEC_7_TO_9 = days(date(2026, 12, 7), date(2026, 12, 8), date(2026, 12, 9))
NOV_16_17 = days(date(2026, 11, 16), date(2026, 11, 17))
NEW_YEAR = days(
    date(2026, 12, 28), date(2026, 12, 29), date(2026, 12, 30), date(2026, 12, 31), date(2027, 1, 1),
    date(2027, 1, 4), date(2027, 1, 5), date(2027, 1, 6), date(2027, 1, 7), date(2027, 1, 8),
)


def test_exactly_enough_is_accepted(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "3", date(2026, 9, 30))

    assert selectors.affordability(cast.owner.id, OCT_12_TO_14) == Affordability(ok=True)


def test_half_a_day_short_is_refused_with_the_shortfall_and_the_first_bad_day(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "2.5", date(2026, 9, 30))

    # after 12 Oct: 1.5; after 13 Oct: 0.5; after 14 Oct: -0.5
    assert selectors.affordability(cast.owner.id, OCT_12_TO_14) == Affordability(
        ok=False, shortfall=Decimal("0.5"), first_negative_on=date(2026, 10, 14)
    )


def test_leave_not_yet_earned_is_accepted_when_earned_by_its_first_day(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))

    # on 7 Dec: 1 + 2.5 (Oct) + 2.5 (Nov) - 1 = 5; then 4; then 3
    assert selectors.affordability(cast.owner.id, DEC_7_TO_9).ok is True


def test_the_same_leave_too_early_is_refused(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))

    # after 12 Oct: 0; after 13 Oct: -1; after 14 Oct: -2; the October credit comes too late
    assert selectors.affordability(cast.owner.id, OCT_12_TO_14) == Affordability(
        ok=False, shortfall=Decimal("2"), first_negative_on=date(2026, 10, 13)
    )


def test_a_later_approved_leave_makes_an_earlier_request_unaffordable(cast, ledger_settings):
    ledger_settings(start=None)
    give_opening(cast.owner, "5", date(2026, 9, 30))
    make_entry(cast.owner, LedgerKind.TAKEN, "-5", date(2026, 12, 21), request_id=77)

    # after 17 Nov: 3; on 21 Dec the approved leave takes 5: -2
    assert selectors.affordability(cast.owner.id, NOV_16_17) == Affordability(
        ok=False, shortfall=Decimal("2"), first_negative_on=date(2026, 12, 21)
    )


def test_credits_earned_in_between_keep_the_later_leave_affordable(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "5", date(2026, 9, 30))
    make_entry(cast.owner, LedgerKind.TAKEN, "-5", date(2026, 12, 21), request_id=77)

    # 16 Nov: 5 + 2.5 - 1 = 6.5; 17 Nov: 5.5; 30 Nov: 8; 21 Dec: 3
    assert selectors.affordability(cast.owner.id, NOV_16_17).ok is True


def test_pending_days_are_held(cast, ledger_settings, reservations):
    ledger_settings(start=None)
    give_opening(cast.owner, "5", date(2026, 9, 30))
    reservations(cast.owner, {date(2026, 11, 2): "1", date(2026, 11, 3): "1", date(2026, 11, 4): "1"})
    asked = days(date(2026, 10, 19), date(2026, 10, 20), date(2026, 10, 21))

    # after 21 Oct: 2; 2 Nov: 1; 3 Nov: 0; 4 Nov: -1
    assert selectors.affordability(cast.owner.id, asked) == Affordability(
        ok=False, shortfall=Decimal("1"), first_negative_on=date(2026, 11, 4)
    )


def test_moving_approved_leave_does_not_need_the_balance_twice(cast, ledger_settings):
    ledger_settings(start=None)
    give_opening(cast.owner, "2", date(2026, 9, 30))
    make_entry(cast.owner, LedgerKind.TAKEN, "-2", date(2026, 11, 2), request_id=77)
    moved = days(date(2026, 11, 9), date(2026, 11, 10))

    assert selectors.affordability(cast.owner.id, moved) == Affordability(
        ok=False, shortfall=Decimal("2"), first_negative_on=date(2026, 11, 9)
    )
    assert selectors.affordability(cast.owner.id, moved, ignoring_request_id=77) == Affordability(ok=True)


def test_no_days_means_nothing_to_check(cast, ledger_settings):
    ledger_settings()

    assert selectors.affordability(cast.owner.id, {}) == Affordability(ok=True)


def test_a_balance_already_negative_is_short_from_the_first_day(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "-1", date(2026, 9, 30))

    assert selectors.affordability(cast.owner.id, days(date(2026, 10, 12))) == Affordability(
        ok=False, shortfall=Decimal("2"), first_negative_on=date(2026, 10, 12)
    )


def test_half_days_are_counted_as_halves(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "0.5", date(2026, 9, 30))
    one_half = days(date(2026, 10, 9), portion="0.5")
    two_halves = days(date(2026, 10, 9), date(2026, 10, 12), portion="0.5")

    assert selectors.affordability(cast.owner.id, one_half).ok is True
    assert selectors.affordability(cast.owner.id, two_halves) == Affordability(
        ok=False, shortfall=Decimal("0.5"), first_negative_on=date(2026, 10, 12)
    )


def test_leave_across_the_new_year_uses_the_december_credit(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "5", date(2026, 9, 30))
    give_opening(cast.peer, "2", date(2026, 9, 30))

    # owner: 28 Dec 9, 29 Dec 8, 30 Dec 7, 31 Dec 7 - 1 + 2.5 = 8.5, then down to 2.5 on 8 Jan
    assert selectors.affordability(cast.owner.id, NEW_YEAR).ok is True
    # peer: 28 Dec 6, 29 Dec 5, 30 Dec 4, 31 Dec 5.5, then down to -0.5 on 8 Jan
    assert selectors.affordability(cast.peer.id, NEW_YEAR) == Affordability(
        ok=False, shortfall=Decimal("0.5"), first_negative_on=date(2027, 1, 8)
    )


def test_days_given_back_count_again(cast, ledger_settings):
    ledger_settings(start=None)
    give_opening(cast.owner, "2", date(2026, 9, 30))
    make_entry(cast.owner, LedgerKind.TAKEN, "-2", date(2026, 11, 2), request_id=77)
    make_entry(cast.owner, LedgerKind.RESTORED, "2", date(2026, 11, 2), request_id=77)

    assert selectors.affordability(cast.owner.id, NOV_16_17).ok is True


def test_a_negative_adjustment_dated_inside_the_range_is_seen(cast, ledger_settings):
    ledger_settings(start=None)
    give_opening(cast.owner, "3", date(2026, 9, 30))
    make_entry(cast.owner, LedgerKind.ADJUSTMENT, "-2", date(2026, 10, 13), reason="Correction")

    # after 12 Oct: 2; after 13 Oct: 2 - 1 - 2 = -1; after 14 Oct: -2
    assert selectors.affordability(cast.owner.id, OCT_12_TO_14) == Affordability(
        ok=False, shortfall=Decimal("2"), first_negative_on=date(2026, 10, 13)
    )
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/balances/tests/test_affordability.py -v`
Expected: collection error, `ImportError: cannot import name 'Affordability' from 'apps.balances.selectors'`.

- [ ] **Step 3: Write the rule**

In `backend/apps/balances/selectors.py`, replace the standard-library and Django imports at the top with the lines below (they add `defaultdict`, `dataclass` and `Max`); the project imports under them stay as they are:

```python
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.db.models import Max, Q, QuerySet, Sum
```

Then append to the end of the file:

```python
@dataclass(frozen=True)
class Affordability:
    ok: bool
    shortfall: Decimal = ZERO
    first_negative_on: date | None = None


def affordability(
    employee_id: int,
    new_days: Mapping[date, Decimal],
    *,
    ignoring_request_id: int | None = None,
) -> Affordability:
    """PRD 6.3: can the employee afford these days without making any later leave unaffordable?

    With the new days counted, the projected balance must be zero or more at the end of every
    day from the first new day up to the last date carrying posted leave, held days or new days.
    """
    if not new_days:
        return Affordability(ok=True)

    first = min(new_days)
    reserved = request_selectors.reserved_days(employee_id, ignoring_request_id=ignoring_request_id)
    last_posted_leave = (
        _entries(employee_id, ignoring_request_id=ignoring_request_id)
        .filter(kind=LedgerKind.TAKEN)
        .aggregate(last=Max("effective_date"))["last"]
    )
    horizon = max(new_days)
    if reserved:
        horizon = max(horizon, max(reserved))
    if last_posted_leave is not None:
        horizon = max(horizon, last_posted_leave)

    events = balance_events(
        employee_id,
        upto=horizon,
        extra_days=new_days,
        ignoring_request_id=ignoring_request_id,
        reserved=reserved,
    )

    balance = ZERO
    later: dict[date, Decimal] = defaultdict(Decimal)
    for day, amount in events:
        if day <= first:
            balance += amount
        else:
            later[day] += amount

    lowest = balance
    first_negative = first if balance < ZERO else None
    for day in sorted(later):
        balance += later[day]
        lowest = min(lowest, balance)
        if balance < ZERO and first_negative is None:
            first_negative = day

    if lowest >= ZERO:
        return Affordability(ok=True)
    return Affordability(ok=False, shortfall=-lowest, first_negative_on=first_negative)
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/balances/tests/test_affordability.py -v`
Expected: PASS, 14 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/balances
git commit -m "feat(balances): affordability rule over the projected balance"
```

### Task 6: The ledger behind the request engine's balance port

**Files:**
- Modify: `backend/apps/balances/services.py` (append `post_taken`, `post_restored`)
- Create: `backend/apps/balances/port.py`
- Modify: `backend/apps/balances/apps.py` (install the port)
- Modify: `backend/conftest.py` (append two fixtures)
- Modify: `backend/apps/balances/tests/conftest.py` (append `port_at_start_up`)
- Test: `backend/apps/balances/tests/test_port.py`

**Interfaces:**
- Consumes, from `apps.requests.ports` (plan 03a): `BalanceVerdict(ok, shortfall=Decimal("0"), first_negative_on=None)`, `BalancePreview(now, on_start, after)`, `BalancePort`, `NullBalancePort`, `set_balance_port(port)`, `balance_port()`.
- Produces:
  - `apps.balances.services.post_taken(*, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor: User | None) -> list[LedgerEntry]`
  - `apps.balances.services.post_restored(*, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor: User | None, reason: str) -> list[LedgerEntry]`
  - `apps.balances.port.LedgerBalancePort` with `check`, `preview`, `post_taken`, `post_restored` exactly as `BalancePort` declares them; `apps.balances.port.install() -> None`.
  - Fixtures in `backend/conftest.py`: `_null_balance_port` (autouse) and `ledger_port`.

Three rules this task fixes:

1. **Posting.** One `taken` line per calendar month the leave touches, dated the first leave day in that month, for the days in that month.
2. **Giving back.** One `restored` line per calendar month. It is dated like the most recent `taken` line of the same request and month that is dated on or before the first day given back, so that the pair nets out from the same date; when there is no such line, it is dated the first day given back.
3. **Preview.** `now` is the posted balance today. `on_start` is the projected balance on the first leave day without the new days. `after` is the projected balance on the last leave day with them.

Plan 03a's tests were written against the null port. From this task on the real port is installed at start-up, so `backend/conftest.py` puts the null port back for every test that does not ask for `ledger_port`.

- [ ] **Step 1: Add the fixtures**

Append to the end of `backend/conftest.py`:

```python
@pytest.fixture(autouse=True)
def _null_balance_port():
    """Every test runs without balances unless it asks for `ledger_port` (plan 04)."""
    from apps.requests import ports

    installed = ports.balance_port()
    ports.set_balance_port(ports.NullBalancePort())
    yield
    ports.set_balance_port(installed)


@pytest.fixture
def ledger_port(_null_balance_port):
    """Puts the real ledger behind the request engine for one test."""
    from apps.balances.port import LedgerBalancePort
    from apps.requests import ports

    ports.set_balance_port(LedgerBalancePort())
```

In `backend/apps/balances/tests/conftest.py`, add to the imports at the top:

```python
from apps.requests import ports as request_ports
```

and append to the end of the file:

```python
# Read when pytest imports this file: Django has started, no fixture has run yet.
_PORT_AT_START_UP = request_ports.balance_port()


@pytest.fixture
def port_at_start_up():
    """The port that was installed when Django started."""
    return _PORT_AT_START_UP
```

- [ ] **Step 2: Write the failing tests**

Create `backend/apps/balances/tests/test_port.py`:

```python
from datetime import date
from decimal import Decimal

import pytest
import time_machine

from apps.balances import selectors, services
from apps.balances.models import LedgerEntry, LedgerKind
from apps.balances.port import LedgerBalancePort
from apps.balances.tests.world import at, days, give_opening
from apps.requests import ports
from apps.requests.ports import BalancePreview, BalanceVerdict

pytestmark = pytest.mark.usefixtures("reservations")

NOV_2_TO_6 = days(date(2026, 11, 2), date(2026, 11, 3), date(2026, 11, 4), date(2026, 11, 5), date(2026, 11, 6))
NOV_10_TO_12 = days(date(2026, 11, 10), date(2026, 11, 11), date(2026, 11, 12))
OCT_12_TO_14 = days(date(2026, 10, 12), date(2026, 10, 13), date(2026, 10, 14))
DEC_7_TO_9 = days(date(2026, 12, 7), date(2026, 12, 8), date(2026, 12, 9))
NEW_YEAR = days(
    date(2026, 12, 28), date(2026, 12, 29), date(2026, 12, 30), date(2026, 12, 31), date(2027, 1, 1),
    date(2027, 1, 4), date(2027, 1, 5), date(2027, 1, 6), date(2027, 1, 7), date(2027, 1, 8),
)


def lines_of(employee, kind) -> list[tuple[date, Decimal]]:
    entries = LedgerEntry.objects.filter(employee=employee, kind=kind)
    return [(entry.effective_date, entry.amount) for entry in entries]


def take(cast, leave_days, request_id=77):
    return services.post_taken(
        request_id=request_id, employee_id=cast.owner.id, days=leave_days, actor=cast.hr_user
    )


def give_back(cast, leave_days, request_id=77, reason="Cancelled by HR"):
    return services.post_restored(
        request_id=request_id, employee_id=cast.owner.id, days=leave_days, actor=cast.hr_user, reason=reason
    )


def test_the_ledger_port_is_installed_when_django_starts(port_at_start_up):
    assert isinstance(port_at_start_up, LedgerBalancePort)


def test_tests_run_without_balances_unless_they_ask():
    assert isinstance(ports.balance_port(), ports.NullBalancePort)


def test_the_ledger_port_fixture_puts_the_ledger_in_place(ledger_port):
    assert isinstance(ports.balance_port(), LedgerBalancePort)


def test_leave_in_one_month_is_one_line_dated_its_first_day(cast):
    take(cast, NOV_2_TO_6)

    assert lines_of(cast.owner, LedgerKind.TAKEN) == [(date(2026, 11, 2), Decimal("-5"))]
    line = LedgerEntry.objects.get(employee=cast.owner)
    assert line.request_id == 77
    assert line.created_by == cast.hr_user
    assert line.period == ""


def test_leave_across_two_months_and_two_years_is_posted_per_month(cast):
    take(cast, NEW_YEAR)

    assert lines_of(cast.owner, LedgerKind.TAKEN) == [
        (date(2026, 12, 28), Decimal("-4")),
        (date(2027, 1, 1), Decimal("-6")),
    ]


def test_half_days_are_posted_as_halves(cast):
    take(cast, {date(2026, 10, 8): Decimal("1"), date(2026, 10, 9): Decimal("0.5")})

    assert lines_of(cast.owner, LedgerKind.TAKEN) == [(date(2026, 10, 8), Decimal("-1.5"))]


def test_no_days_post_nothing(cast):
    assert take(cast, {}) == []
    assert give_back(cast, {}) == []
    assert LedgerEntry.objects.count() == 0


def test_cancelling_gives_back_every_day_on_the_date_of_the_line_it_undoes(cast):
    give_opening(cast.owner, "10", date(2026, 9, 30))
    take(cast, NOV_2_TO_6)

    give_back(cast, NOV_2_TO_6)

    assert lines_of(cast.owner, LedgerKind.RESTORED) == [(date(2026, 11, 2), Decimal("5"))]
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 2)) == Decimal("10")


def test_shortening_gives_back_the_released_days_from_the_same_date(cast):
    give_opening(cast.owner, "10", date(2026, 9, 30))
    take(cast, NOV_2_TO_6)

    give_back(cast, days(date(2026, 11, 5), date(2026, 11, 6)), reason="Shortened by HR")

    assert lines_of(cast.owner, LedgerKind.RESTORED) == [(date(2026, 11, 2), Decimal("2"))]
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 2)) == Decimal("7")
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 30)) == Decimal("7")


def test_giving_back_after_a_correction_follows_the_latest_line(cast):
    give_opening(cast.owner, "10", date(2026, 9, 30))
    take(cast, NOV_2_TO_6)
    give_back(cast, NOV_2_TO_6, reason="Dates corrected by HR")
    take(cast, NOV_10_TO_12)

    give_back(cast, NOV_10_TO_12)

    assert lines_of(cast.owner, LedgerKind.RESTORED) == [
        (date(2026, 11, 2), Decimal("5")),
        (date(2026, 11, 10), Decimal("3")),
    ]
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 9)) == Decimal("10")
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 30)) == Decimal("10")


def test_giving_back_across_months_mirrors_each_month(cast):
    take(cast, NEW_YEAR)

    give_back(cast, NEW_YEAR)

    assert lines_of(cast.owner, LedgerKind.RESTORED) == [
        (date(2026, 12, 28), Decimal("4")),
        (date(2027, 1, 1), Decimal("6")),
    ]


def test_giving_back_without_a_matching_line_is_dated_the_first_day_given_back(cast):
    give_back(cast, days(date(2026, 11, 5), date(2026, 11, 6)))

    assert lines_of(cast.owner, LedgerKind.RESTORED) == [(date(2026, 11, 5), Decimal("2"))]


def test_the_reason_and_the_actor_are_kept_on_the_line(cast):
    take(cast, NOV_2_TO_6)

    give_back(cast, NOV_2_TO_6, reason="Project deadline moved")

    line = LedgerEntry.objects.get(employee=cast.owner, kind=LedgerKind.RESTORED)
    assert line.reason == "Project deadline moved"
    assert line.created_by == cast.hr_user
    assert line.request_id == 77


def test_check_reports_the_shortfall(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "2.5", date(2026, 9, 30))
    port = LedgerBalancePort()

    assert port.check(employee_id=cast.owner.id, new_days=days(date(2026, 10, 12))) == BalanceVerdict(ok=True)
    assert port.check(employee_id=cast.owner.id, new_days=OCT_12_TO_14) == BalanceVerdict(
        ok=False, shortfall=Decimal("0.5"), first_negative_on=date(2026, 10, 14)
    )


def test_check_ignores_the_request_being_replaced(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "5", date(2026, 9, 30))
    take(cast, NOV_2_TO_6)
    port = LedgerBalancePort()

    assert port.check(employee_id=cast.owner.id, new_days=NOV_10_TO_12).ok is False
    assert port.check(employee_id=cast.owner.id, new_days=NOV_10_TO_12, ignoring_request_id=77).ok is True


@time_machine.travel(at(2026, 10, 5), tick=False)
def test_preview_gives_the_balance_now_on_the_first_day_and_after(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))

    preview = LedgerBalancePort().preview(employee_id=cast.owner.id, new_days=DEC_7_TO_9)

    # now 1; on 7 Dec 1 + 2.5 + 2.5 = 6; after the three days 3
    assert preview == BalancePreview(now=Decimal("1"), on_start=Decimal("6"), after=Decimal("3"))


@time_machine.travel(at(2026, 10, 5), tick=False)
def test_preview_of_leave_across_a_month_end_counts_the_credit_in_between(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "5", date(2026, 9, 30))

    preview = LedgerBalancePort().preview(employee_id=cast.owner.id, new_days=NEW_YEAR)

    # on 28 Dec 5 + 5 = 10; on 8 Jan 5 + 7.5 - 10 = 2.5
    assert preview == BalancePreview(now=Decimal("5"), on_start=Decimal("10"), after=Decimal("2.5"))


def test_preview_without_days_is_empty(cast, ledger_settings):
    ledger_settings()

    assert LedgerBalancePort().preview(employee_id=cast.owner.id, new_days={}) is None


def test_the_port_posts_through_the_ledger(cast):
    port = LedgerBalancePort()

    port.post_taken(request_id=77, employee_id=cast.owner.id, days=NOV_2_TO_6, actor=cast.hr_user)
    port.post_restored(
        request_id=77, employee_id=cast.owner.id, days=NOV_2_TO_6, actor=cast.hr_user, reason="Cancelled by HR"
    )

    assert lines_of(cast.owner, LedgerKind.TAKEN) == [(date(2026, 11, 2), Decimal("-5"))]
    assert lines_of(cast.owner, LedgerKind.RESTORED) == [(date(2026, 11, 2), Decimal("5"))]
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/balances/tests/test_port.py -v`
Expected: collection error, `ModuleNotFoundError: No module named 'apps.balances.port'`.

- [ ] **Step 4: Write the two postings**

In `backend/apps/balances/services.py`, add to the imports at the top, after the `import calendar` line:

```python
from collections.abc import Mapping
```

and append to the end of the file:

```python
def _by_month(days: Mapping[date, Decimal]) -> dict[tuple[int, int], dict[date, Decimal]]:
    months: dict[tuple[int, int], dict[date, Decimal]] = {}
    for day, portion in days.items():
        months.setdefault((day.year, day.month), {})[day] = portion
    return months


@transaction.atomic
def post_taken(*, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor) -> list[LedgerEntry]:
    """Leave finally approved: one line per calendar month, dated the first leave day of that month."""
    lines: list[LedgerEntry] = []
    for _month, month_days in sorted(_by_month(days).items()):
        total = sum(month_days.values(), ZERO)
        if total <= ZERO:
            continue
        lines.append(
            LedgerEntry(
                employee_id=employee_id,
                kind=LedgerKind.TAKEN,
                amount=-total,
                effective_date=min(month_days),
                request_id=request_id,
                created_by=actor,
            )
        )
    return LedgerEntry.objects.bulk_create(lines)


@transaction.atomic
def post_restored(
    *, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor, reason: str
) -> list[LedgerEntry]:
    """Approved days released: one line per calendar month.

    A line is dated like the most recent `taken` line of the same request and month that is dated
    on or before the first day given back, so that the two net out from the same date.
    """
    lines: list[LedgerEntry] = []
    for (year, month), month_days in sorted(_by_month(days).items()):
        total = sum(month_days.values(), ZERO)
        if total <= ZERO:
            continue
        first_day = min(month_days)
        undone = (
            LedgerEntry.objects.filter(
                employee_id=employee_id,
                kind=LedgerKind.TAKEN,
                request_id=request_id,
                effective_date__year=year,
                effective_date__month=month,
                effective_date__lte=first_day,
            )
            .order_by("-effective_date", "-id")
            .values_list("effective_date", flat=True)
            .first()
        )
        lines.append(
            LedgerEntry(
                employee_id=employee_id,
                kind=LedgerKind.RESTORED,
                amount=total,
                effective_date=undone or first_day,
                request_id=request_id,
                reason=(reason or "")[:500],
                created_by=actor,
            )
        )
    return LedgerEntry.objects.bulk_create(lines)
```

- [ ] **Step 5: Write the port**

Create `backend/apps/balances/port.py`:

```python
"""The ledger behind the request engine's balance port (master plan 7.9)."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from decimal import Decimal

from django.utils import timezone

from apps.requests.ports import BalancePreview, BalanceVerdict, set_balance_port

from . import selectors, services


class LedgerBalancePort:
    """Implements `apps.requests.ports.BalancePort` on the annual-leave ledger."""

    def check(
        self,
        *,
        employee_id: int,
        new_days: Mapping[date, Decimal],
        ignoring_request_id: int | None = None,
    ) -> BalanceVerdict:
        verdict = selectors.affordability(employee_id, new_days, ignoring_request_id=ignoring_request_id)
        return BalanceVerdict(
            ok=verdict.ok, shortfall=verdict.shortfall, first_negative_on=verdict.first_negative_on
        )

    def preview(
        self,
        *,
        employee_id: int,
        new_days: Mapping[date, Decimal],
        ignoring_request_id: int | None = None,
    ) -> BalancePreview | None:
        if not new_days:
            return None
        return BalancePreview(
            now=selectors.balance_on(employee_id, timezone.localdate()),
            on_start=selectors.projected_balance(
                employee_id, min(new_days), ignoring_request_id=ignoring_request_id
            ),
            after=selectors.projected_balance(
                employee_id, max(new_days), extra_days=new_days, ignoring_request_id=ignoring_request_id
            ),
        )

    def post_taken(
        self, *, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor
    ) -> None:
        services.post_taken(request_id=request_id, employee_id=employee_id, days=days, actor=actor)

    def post_restored(
        self, *, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor, reason: str
    ) -> None:
        services.post_restored(
            request_id=request_id, employee_id=employee_id, days=days, actor=actor, reason=reason
        )


def install() -> None:
    set_balance_port(LedgerBalancePort())
```

- [ ] **Step 6: Install the port at start-up**

In `backend/apps/balances/apps.py`, replace the `ready` method of `BalancesConfig` with:

```python
    def ready(self) -> None:
        from decimal import Decimal

        from apps.settings.registry import SettingDef, register

        from .port import install

        connection_created.connect(_allow_truncate, dispatch_uid="balances.allow_truncate")
        register(
            SettingDef(
                key="monthly_credit_days",
                group="hr",
                kind="decimal",
                default=Decimal("2.5"),
                minimum=Decimal("0"),
                maximum=Decimal("31"),
            )
        )
        register(SettingDef(key="credit_start_date", group="hr", kind="date_or_null", default=None))
        install()
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/balances/tests/test_port.py -v`
Expected: PASS, 19 passed.

- [ ] **Step 8: Check that the request engine's own tests still run without balances**

Run: `docker compose run --rm app pytest apps/requests -q`
Expected: the same number of passed tests as in the baseline of "Before you start", none failed. A failure with `request.balance_insufficient` means the autouse fixture of Step 1 is not in `backend/conftest.py`.

From this step until Task 12 the running development stack checks annual leave against a ledger that has no demo balances yet. `seed_demo` and `e2e_reset` may therefore refuse the demo annual-leave requests of plan 03a; do not run them between this task and Task 12, which seeds the balances first.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/balances backend/conftest.py
git commit -m "feat(balances): ledger implementation of the request engine's balance port"
```

### Task 7: Opening balances and adjustments

**Files:**
- Create: `backend/apps/balances/messages.py`
- Modify: `backend/apps/balances/services.py` (append)
- Modify: `backend/apps/balances/apps.py` (register messages and the notification event)
- Test: `backend/apps/balances/tests/test_adjustments.py`

**Interfaces:**
- Consumes: `apps.core.errors.DomainError`, `Conflict`; `apps.core.i18n.register_messages`, `translate(code, lang=None, /, **params)`; `apps.notifications.services.register_event(code, *, link)`, `notify(*, users, event, params=None, target_type="", target_public_id="", dedupe_key=None)`; `apps.organisation.reach.lock_employee(employee_id)`; `apps.organisation.selectors.full_name(employee)`; `Employee.user` (the linked account or `None`); `apps.notifications.models.Notification(user, event_code, parameters, target_type, target_public_id)`.
- Produces, in `apps.balances.services`:
  - `signed_days(amount: Decimal) -> str` (`"+1.5"`, `"-2"`)
  - `post_opening(*, actor: User, employee: Employee, amount: Decimal, effective_date: date, reason: str) -> LedgerEntry`
  - `adjust(*, actor: User, employee: Employee, amount: Decimal, effective_date: date, reason: str) -> LedgerEntry`
- Error codes: `balances.reason_required` (field `reason`), `balances.zero_amount` (field `amount`), `balances.opening_exists` (409), `balances.date_out_of_range` (field `on`, used in Task 8).
- Notification event `balance.adjusted`, link `/me/balance`, params `amount`, `reason`.
- Audit actions `ledger.opening_posted`, `ledger.adjusted`.

Rules: a reason is mandatory for both and spaces are not a reason. An opening balance may be any number, zero included, and exists at most once per employee. An adjustment may be positive or negative, never zero, and may take the balance below zero. The employee is notified of an adjustment (BAL-05), not of the opening balance, which HR enters at go-live before accounts exist. Both lock the employee, so they cannot interleave with a balance check.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/balances/tests/test_adjustments.py`:

```python
from datetime import date
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.audit.models import AuditEvent
from apps.balances import selectors, services
from apps.balances.models import LedgerEntry, LedgerKind
from apps.core.errors import Conflict, DomainError
from apps.core.i18n import translate
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

    assert (entry.kind, entry.amount, entry.effective_date) == (LedgerKind.OPENING, Decimal("4"), date(2025, 12, 31))
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


def test_an_opening_balance_does_not_notify(world):
    opening(world)

    assert Notification.objects.filter(event_code="balance.adjusted").count() == 0


def test_hr_adds_days_with_a_reason(world):
    opening(world)

    entry = adjustment(world)

    assert (entry.kind, entry.amount, entry.effective_date) == (LedgerKind.ADJUSTMENT, Decimal("1.5"), date(2026, 7, 15))
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
    assert (notification.target_type, notification.target_public_id) == ("balance", str(world.owner.public_id))


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
    lock = next(i for i, sql in enumerate(statements) if "FOR UPDATE" in sql and "organisation_employee" in sql)
    write = next(i for i, sql in enumerate(statements) if sql.startswith("INSERT") and "balances_ledgerentry" in sql)
    assert lock < write


@pytest.mark.parametrize(
    ("amount", "expected"),
    [("1.50", "+1.5"), ("-2.00", "-2"), ("10", "+10"), ("-0.5", "-0.5")],
)
def test_amounts_are_written_with_their_sign_and_without_padding(amount, expected):
    assert services.signed_days(Decimal(amount)) == expected


def test_the_texts_exist_in_both_languages():
    for code in ("balances.reason_required", "balances.zero_amount", "balances.opening_exists"):
        assert translate(code, "fr") != translate(code, "en")

    body = translate("notification.balance.adjusted.body", "fr", amount="+1.5", reason="Correction")
    assert "+1.5" in body
    assert "Correction" in body
    assert translate("notification.balance.adjusted.title", "en") == "Your leave balance was adjusted"
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/balances/tests/test_adjustments.py -v`
Expected: FAIL, the first test with `AttributeError: module 'apps.balances.services' has no attribute 'post_opening'`.

- [ ] **Step 3: Write the texts**

Create `backend/apps/balances/messages.py`:

```python
MESSAGES = {
    "balances.reason_required": {
        "en": "Give the reason. It is kept in the history and shown to the employee.",
        "fr": "Indiquez le motif. Il est conservé dans l'historique et visible par l'employé.",
    },
    "balances.zero_amount": {
        "en": "Enter a number of days other than zero.",
        "fr": "Saisissez un nombre de jours différent de zéro.",
    },
    "balances.opening_exists": {
        "en": "This employee already has an opening balance. Post an adjustment to correct it.",
        "fr": "Cet employé a déjà un solde d'ouverture. Passez un ajustement pour le corriger.",
    },
    "balances.date_out_of_range": {
        "en": "Choose a date within the next two years.",
        "fr": "Choisissez une date dans les deux prochaines années.",
    },
    "notification.balance.adjusted.title": {
        "en": "Your leave balance was adjusted",
        "fr": "Votre solde de congés a été ajusté",
    },
    "notification.balance.adjusted.body": {
        "en": "HR adjusted your annual leave balance by {amount} days. Reason: {reason}",
        "fr": "Les RH ont ajusté votre solde de congés annuels de {amount} jours. Motif : {reason}",
    },
}
```

- [ ] **Step 4: Write the two services**

In `backend/apps/balances/services.py`, extend the project imports at the top to:

```python
from apps.audit import services as audit
from apps.core.errors import Conflict, DomainError
from apps.notifications import services as notifications
from apps.organisation import reach
from apps.organisation import selectors as organisation_selectors
from apps.settings import services as settings_service

from .models import LedgerEntry, LedgerKind
```

and append to the end of the file:

```python
def signed_days(amount: Decimal) -> str:
    """An amount as a notification writes it: "+1.5", "-2"."""
    magnitude = f"{abs(amount).normalize():f}"
    return f"{'-' if amount < ZERO else '+'}{magnitude}"


def _clean_reason(reason: str) -> str:
    cleaned = (reason or "").strip()
    if not cleaned:
        raise DomainError("balances.reason_required", field="reason")
    return cleaned[:500]


def _audit_line(action: str, entry: LedgerEntry, employee, actor) -> None:
    audit.record(
        action=action,
        obj=entry,
        object_label=organisation_selectors.full_name(employee),
        changes={
            "employee": {"before": None, "after": str(employee.public_id)},
            "amount": {"before": None, "after": f"{entry.amount.normalize():f}"},
            "effective_date": {"before": None, "after": entry.effective_date.isoformat()},
            "reason": {"before": None, "after": entry.reason},
        },
        actor=actor,
    )


@transaction.atomic
def post_opening(*, actor, employee, amount: Decimal, effective_date: date, reason: str) -> LedgerEntry:
    """The balance an employee starts with at go-live (BAL-06). Once per employee; any number."""
    reason = _clean_reason(reason)
    reach.lock_employee(employee.id)
    if LedgerEntry.objects.filter(employee_id=employee.id, kind=LedgerKind.OPENING).exists():
        raise Conflict("balances.opening_exists")
    entry = LedgerEntry.objects.create(
        employee_id=employee.id,
        kind=LedgerKind.OPENING,
        amount=amount,
        effective_date=effective_date,
        reason=reason,
        created_by=actor,
    )
    _audit_line("ledger.opening_posted", entry, employee, actor)
    return entry


@transaction.atomic
def adjust(*, actor, employee, amount: Decimal, effective_date: date, reason: str) -> LedgerEntry:
    """A correction by HR (BAL-05): a new line, positive or negative, never zero."""
    reason = _clean_reason(reason)
    if amount == ZERO:
        raise DomainError("balances.zero_amount", field="amount")
    reach.lock_employee(employee.id)
    entry = LedgerEntry.objects.create(
        employee_id=employee.id,
        kind=LedgerKind.ADJUSTMENT,
        amount=amount,
        effective_date=effective_date,
        reason=reason,
        created_by=actor,
    )
    _audit_line("ledger.adjusted", entry, employee, actor)
    user = getattr(employee, "user", None)
    if user is not None:
        notifications.notify(
            users=[user],
            event="balance.adjusted",
            params={"amount": signed_days(amount), "reason": reason},
            target_type="balance",
            target_public_id=str(employee.public_id),
        )
    return entry
```

- [ ] **Step 5: Register the texts and the event**

In `backend/apps/balances/apps.py`, replace the `ready` method of `BalancesConfig` with its final form:

```python
    def ready(self) -> None:
        from decimal import Decimal

        from apps.core.i18n import register_messages
        from apps.notifications.services import register_event
        from apps.settings.registry import SettingDef, register

        from .messages import MESSAGES
        from .port import install

        connection_created.connect(_allow_truncate, dispatch_uid="balances.allow_truncate")
        register_messages(MESSAGES)
        register(
            SettingDef(
                key="monthly_credit_days",
                group="hr",
                kind="decimal",
                default=Decimal("2.5"),
                minimum=Decimal("0"),
                maximum=Decimal("31"),
            )
        )
        register(SettingDef(key="credit_start_date", group="hr", kind="date_or_null", default=None))
        register_event("balance.adjusted", link="/me/balance")
        install()
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/balances/tests/test_adjustments.py tests/test_messages.py -v`
Expected: PASS. `test_adjustments.py` contributes 19 passed; `tests/test_messages.py` (plan 01a) confirms that every new code has both languages and the same placeholders.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/balances
git commit -m "feat(balances): opening balance and HR adjustment with audit and notification"
```

### Task 8: The figures a person reads and the history line by line

**Files:**
- Modify: `backend/apps/balances/selectors.py` (append)
- Test: `backend/apps/balances/tests/test_figures.py`

**Interfaces:**
- Consumes: `apps.requests.selectors.reserved_days`, `day_rows(*, start, end, statuses, employee_ids=None, type_codes=None) -> list[DayRow]`, `DayRow(request_id, request_public_id, employee_id, type_code, day, portion, hours, status)`; `apps.accounts.services.display_name(user) -> str`; `apps.core.errors.DomainError`.
- Produces, in `apps.balances.selectors`:
  - `BalanceFigures(current, pending, approved_upcoming, next_credit_amount, next_credit_date)` (frozen dataclass)
  - `figures(employee_id: int, *, today: date | None = None) -> BalanceFigures`
  - `next_credit(employee_id: int, *, today: date) -> tuple[Decimal | None, date | None]`
  - `has_opening(employee_id: int) -> bool`
  - `AsOf(on: date, balance: Decimal, projected: bool)` and `as_of(employee_id: int, on: date, *, today: date | None = None) -> AsOf`
  - `LedgerLine(id, kind, amount, effective_date, period, reason, request_public_id, created_by, created_at, balance_after)` (frozen dataclass)
  - `ledger_lines(employee_id: int) -> list[LedgerLine]` (oldest first)
  - `ledger_line(employee_id: int, entry_id: int) -> LedgerLine`

What each figure means (BAL-07, UI 5.6):

| Figure | Definition |
|---|---|
| `current` | Sum of the lines dated today or earlier |
| `pending` | Days held by pending requests and pending amendments (`reserved_days`) |
| `approved_upcoming` | Days of approved leave whose ledger line is dated after today, net of days given back |
| `next_credit_amount`, `next_credit_date` | The first month-end from this month (or from `credit_start_date` if later) that is not credited yet and is worth more than zero; nothing when `credit_start_date` is empty or the employee has left |

The balance on a chosen date is the posted balance for today and the past, and the projected balance for the future, up to two years ahead.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/balances/tests/test_figures.py`:

```python
from datetime import date, timedelta
from decimal import Decimal

import pytest
import time_machine

from apps.accounts import services as account_services
from apps.balances import selectors
from apps.balances.models import LedgerKind
from apps.balances.selectors import AsOf, BalanceFigures
from apps.balances.tests.world import at, give_credit, give_opening, make_entry
from apps.core.errors import DomainError
from apps.organisation import services as organisation_services
from apps.requests import selectors as request_selectors
from apps.requests.selectors import DayRow

pytestmark = pytest.mark.usefixtures("reservations")

TODAY = date(2026, 10, 5)


def test_an_employee_without_any_entry_has_a_zero_balance_everywhere(cast, ledger_settings):
    ledger_settings(start=None)
    owner = cast.owner

    assert selectors.figures(owner.id, today=TODAY) == BalanceFigures(
        current=Decimal("0"),
        pending=Decimal("0"),
        approved_upcoming=Decimal("0"),
        next_credit_amount=None,
        next_credit_date=None,
    )
    assert selectors.ledger_lines(owner.id) == []
    assert selectors.has_opening(owner.id) is False
    assert selectors.as_of(owner.id, TODAY, today=TODAY) == AsOf(on=TODAY, balance=Decimal("0"), projected=False)
    # a zero must never be written "-0.00"
    assert not selectors.figures(owner.id, today=TODAY).approved_upcoming.is_signed()


def test_the_current_balance_counts_lines_up_to_today(cast, ledger_settings):
    ledger_settings(start=None)
    owner = cast.owner
    give_opening(owner, "4", date(2025, 12, 31))
    give_credit(owner, 2026, 1)
    make_entry(owner, LedgerKind.TAKEN, "-2", TODAY, request_id=1)
    make_entry(owner, LedgerKind.TAKEN, "-3", date(2026, 12, 21), request_id=2)

    figures = selectors.figures(owner.id, today=TODAY)

    assert figures.current == Decimal("4.5")
    assert figures.approved_upcoming == Decimal("3")


def test_days_given_back_reduce_what_is_upcoming(cast, ledger_settings):
    ledger_settings(start=None)
    make_entry(cast.owner, LedgerKind.TAKEN, "-5", date(2026, 12, 21), request_id=2)
    make_entry(cast.owner, LedgerKind.RESTORED, "2", date(2026, 12, 21), request_id=2)

    assert selectors.figures(cast.owner.id, today=TODAY).approved_upcoming == Decimal("3")


def test_pending_is_what_requests_are_holding(cast, ledger_settings, reservations):
    ledger_settings(start=None)
    reservations(cast.owner, {date(2026, 11, 2): "1", date(2026, 11, 3): "0.5"})

    assert selectors.figures(cast.owner.id, today=TODAY).pending == Decimal("1.5")


def test_the_next_credit_is_the_end_of_this_month(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))

    assert selectors.next_credit(cast.owner.id, today=TODAY) == (Decimal("2.5"), date(2026, 10, 31))


def test_once_this_month_is_credited_the_next_credit_is_next_month(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    give_credit(cast.owner, 2026, 10)

    assert selectors.next_credit(cast.owner.id, today=date(2026, 10, 31)) == (Decimal("2.5"), date(2026, 11, 30))


def test_the_december_credit_is_followed_by_january(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    give_credit(cast.owner, 2026, 12)

    assert selectors.next_credit(cast.owner.id, today=date(2026, 12, 31)) == (Decimal("2.5"), date(2027, 1, 31))


def test_no_next_credit_without_a_start_date(cast, ledger_settings):
    ledger_settings(start=None)

    assert selectors.next_credit(cast.owner.id, today=TODAY) == (None, None)


def test_the_next_credit_waits_for_the_start_date(cast, ledger_settings):
    ledger_settings(start=date(2026, 12, 1))

    assert selectors.next_credit(cast.owner.id, today=TODAY) == (Decimal("2.5"), date(2026, 12, 31))


def test_the_next_credit_of_a_joiner_is_pro_rated(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    cast.owner.hire_date = date(2026, 10, 16)
    cast.owner.save(update_fields=["hire_date"])

    # 16 of 31 days in October: 1.29 -> 1.5
    assert selectors.next_credit(cast.owner.id, today=date(2026, 10, 20)) == (Decimal("1.5"), date(2026, 10, 31))


def test_a_leaver_has_no_next_credit(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    with time_machine.travel(at(2026, 9, 30), tick=False):
        organisation_services.archive_employee(
            actor=cast.hr_user, employee=cast.owner, leaving_date=date(2026, 9, 30), reason="Resignation"
        )

    assert selectors.next_credit(cast.owner.id, today=TODAY) == (None, None)


def test_ledger_lines_carry_a_running_balance_oldest_first(cast):
    owner = cast.owner
    make_entry(owner, LedgerKind.TAKEN, "-3", date(2026, 2, 9), request_id=1)
    make_entry(owner, LedgerKind.ADJUSTMENT, "1", date(2026, 2, 9), reason="Correction", created_by=cast.hr_user)
    give_credit(owner, 2026, 1)
    give_opening(owner, "4", date(2025, 12, 31))

    lines = selectors.ledger_lines(owner.id)

    assert [(line.kind, line.effective_date, line.amount, line.balance_after) for line in lines] == [
        ("opening", date(2025, 12, 31), Decimal("4"), Decimal("4")),
        ("credit", date(2026, 1, 31), Decimal("2.5"), Decimal("6.5")),
        ("taken", date(2026, 2, 9), Decimal("-3"), Decimal("3.5")),
        ("adjustment", date(2026, 2, 9), Decimal("1"), Decimal("4.5")),
    ]
    assert lines[1].created_by is None
    assert lines[1].period == "2026-01"
    assert lines[3].created_by == account_services.display_name(cast.hr_user)
    assert lines[3].reason == "Correction"
    assert selectors.ledger_line(owner.id, lines[2].id) == lines[2]


def test_ledger_lines_name_the_request_behind_leave(cast, monkeypatch):
    public_id = "0b0e7a36-6f0f-4a53-9a59-0f1c2d3e4f50"
    make_entry(cast.owner, LedgerKind.TAKEN, "-2", date(2026, 11, 2), request_id=77)
    give_opening(cast.owner, "4", date(2025, 12, 31))
    asked: dict = {}

    def fake_day_rows(**kwargs):
        asked.update(kwargs)
        return [
            DayRow(
                request_id=77,
                request_public_id=public_id,
                employee_id=cast.owner.id,
                type_code="annual",
                day=date(2026, 11, 2),
                portion=Decimal("1"),
                hours=None,
                status="cancelled",
            )
        ]

    monkeypatch.setattr(request_selectors, "day_rows", fake_day_rows)

    opening, taken = selectors.ledger_lines(cast.owner.id)

    assert opening.request_public_id is None
    assert taken.request_public_id == public_id
    assert asked["employee_ids"] == [cast.owner.id]
    assert {"approved", "cancelled", "withdrawn"} <= set(asked["statuses"])
    assert asked["start"] <= date(2026, 11, 2) <= asked["end"]


def test_lines_without_a_request_ask_the_request_engine_nothing(cast, monkeypatch):
    give_opening(cast.owner, "4", date(2025, 12, 31))

    def must_not_be_called(**kwargs):
        raise AssertionError("day_rows was called for a ledger without leave lines")

    monkeypatch.setattr(request_selectors, "day_rows", must_not_be_called)

    assert len(selectors.ledger_lines(cast.owner.id)) == 1


def test_the_balance_on_a_past_date_is_the_posted_balance(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    give_opening(cast.owner, "4", date(2025, 12, 31))
    give_credit(cast.owner, 2026, 1)

    assert selectors.as_of(cast.owner.id, date(2026, 1, 31), today=TODAY) == AsOf(
        on=date(2026, 1, 31), balance=Decimal("6.5"), projected=False
    )


def test_the_balance_on_a_future_date_is_projected(cast, ledger_settings, reservations):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))
    reservations(cast.owner, {date(2026, 11, 2): "1"})

    # 1 + 2.5 (Oct) + 2.5 (Nov) - 1 held = 5
    assert selectors.as_of(cast.owner.id, date(2026, 12, 15), today=TODAY) == AsOf(
        on=date(2026, 12, 15), balance=Decimal("5"), projected=True
    )


def test_a_date_too_far_ahead_is_refused(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    limit = TODAY + timedelta(days=731)

    assert selectors.as_of(cast.owner.id, limit, today=TODAY).projected is True
    with pytest.raises(DomainError) as refused:
        selectors.as_of(cast.owner.id, date(9999, 12, 31), today=TODAY)

    assert refused.value.code == "balances.date_out_of_range"
    assert refused.value.problems[0].field == "on"


def test_has_opening_knows_whether_the_opening_balance_was_entered(cast):
    give_opening(cast.owner, "0", date(2025, 12, 31))

    assert selectors.has_opening(cast.owner.id) is True
    assert selectors.has_opening(cast.peer.id) is False
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/balances/tests/test_figures.py -v`
Expected: collection error, `ImportError: cannot import name 'AsOf' from 'apps.balances.selectors'`.

- [ ] **Step 3: Write the selectors**

In `backend/apps/balances/selectors.py`, change the imports at the top to their final form:

```python
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models import Max, Q, QuerySet, Sum
from django.utils import timezone

from apps.accounts import services as account_services
from apps.core.errors import DomainError
from apps.organisation import selectors as organisation_selectors
from apps.requests import selectors as request_selectors

from . import services
from .models import LedgerEntry, LedgerKind

ZERO = Decimal("0")
ALL_REQUEST_STATUSES = ("draft", "pending", "returned", "approved", "rejected", "withdrawn", "cancelled")
PROJECTION_LIMIT_DAYS = 731
```

and append to the end of the file:

```python
@dataclass(frozen=True)
class BalanceFigures:
    current: Decimal
    pending: Decimal
    approved_upcoming: Decimal
    next_credit_amount: Decimal | None
    next_credit_date: date | None


@dataclass(frozen=True)
class AsOf:
    on: date
    balance: Decimal
    projected: bool


@dataclass(frozen=True)
class LedgerLine:
    id: int
    kind: str
    amount: Decimal
    effective_date: date
    period: str
    reason: str
    request_public_id: str | None
    created_by: str | None
    created_at: datetime
    balance_after: Decimal


def next_credit(employee_id: int, *, today: date) -> tuple[Decimal | None, date | None]:
    """Amount and date of the next month-end credit the employee will receive, or nothing."""
    start = services.credit_start_date()
    if start is None:
        return None, None
    employee = _employee(employee_id)
    posted = set(
        LedgerEntry.objects.filter(employee_id=employee_id, kind=LedgerKind.CREDIT).values_list("period", flat=True)
    )
    first = max(today, start)
    year, month = first.year, first.month
    for _ in range(3):
        if services.period_of(year, month) not in posted:
            amount = services.month_credit(employee, year, month)
            if amount > ZERO:
                return amount, services.month_end(year, month)
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return None, None


def figures(employee_id: int, *, today: date | None = None) -> BalanceFigures:
    """The four figures of BAL-07."""
    today = today or timezone.localdate()
    held = request_selectors.reserved_days(employee_id)
    upcoming = (
        _entries(employee_id)
        .filter(kind__in=[LedgerKind.TAKEN, LedgerKind.RESTORED], effective_date__gt=today)
        .aggregate(total=Sum("amount"))["total"]
    )
    amount, day = next_credit(employee_id, today=today)
    return BalanceFigures(
        current=balance_on(employee_id, today),
        pending=sum(held.values(), ZERO),
        approved_upcoming=ZERO - (upcoming or ZERO),
        next_credit_amount=amount,
        next_credit_date=day,
    )


def has_opening(employee_id: int) -> bool:
    return LedgerEntry.objects.filter(employee_id=employee_id, kind=LedgerKind.OPENING).exists()


def as_of(employee_id: int, on: date, *, today: date | None = None) -> AsOf:
    """The balance on a date of the reader's choice: posted up to today, projected after."""
    today = today or timezone.localdate()
    if on > today + timedelta(days=PROJECTION_LIMIT_DAYS):
        raise DomainError("balances.date_out_of_range", field="on")
    if on > today:
        return AsOf(on=on, balance=projected_balance(employee_id, on), projected=True)
    return AsOf(on=on, balance=balance_on(employee_id, on), projected=False)


def _request_public_ids(employee_id: int, entries: list[LedgerEntry]) -> dict[int, str]:
    """public_id of the requests behind leave lines, read through the request engine's day rows.

    The window is a year either side of the lines, so that a request whose dates were corrected
    after posting is still found.
    """
    dated = [entry.effective_date for entry in entries if entry.request_id is not None]
    if not dated:
        return {}
    rows = request_selectors.day_rows(
        start=min(dated) - timedelta(days=366),
        end=max(dated) + timedelta(days=366),
        statuses=ALL_REQUEST_STATUSES,
        employee_ids=[employee_id],
    )
    return {row.request_id: str(row.request_public_id) for row in rows}


def ledger_lines(employee_id: int) -> list[LedgerLine]:
    """Every line of the employee, oldest first, each with the balance after it."""
    entries = list(
        LedgerEntry.objects.filter(employee_id=employee_id)
        .select_related("created_by")
        .order_by("effective_date", "id")
    )
    public_ids = _request_public_ids(employee_id, entries)
    running = ZERO
    lines: list[LedgerLine] = []
    for entry in entries:
        running += entry.amount
        lines.append(
            LedgerLine(
                id=entry.id,
                kind=entry.kind,
                amount=entry.amount,
                effective_date=entry.effective_date,
                period=entry.period,
                reason=entry.reason,
                request_public_id=public_ids.get(entry.request_id),
                created_by=account_services.display_name(entry.created_by) if entry.created_by_id else None,
                created_at=entry.created_at,
                balance_after=running,
            )
        )
    return lines


def ledger_line(employee_id: int, entry_id: int) -> LedgerLine:
    return next(line for line in ledger_lines(employee_id) if line.id == entry_id)
```

`ZERO - (upcoming or ZERO)` rather than a unary minus: `-Decimal("0")` is a negative zero, which a serializer would print as `-0.00`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/balances/tests/test_figures.py -v`
Expected: PASS, 18 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/balances
git commit -m "feat(balances): balance figures, balance on a chosen date and ledger lines"
```

### Task 9: The three endpoints

**Files:**
- Create: `backend/apps/balances/api/__init__.py`, `backend/apps/balances/api/serializers.py`, `backend/apps/balances/api/views.py`, `backend/apps/balances/api/urls.py`
- Create: `backend/apps/balances/tests/matrix.py`
- Modify: `backend/config/api_urls.py` (one line), `backend/tests/test_permission_matrix.py` (one line in `MATRIX_MODULES`), `backend/apps/balances/messages.py` (one entry)
- Test: `backend/apps/balances/tests/test_api.py`, `backend/tests/test_permission_matrix.py`

**Interfaces:**
- Consumes: `apps.accounts.roles.Role`; `apps.core.pagination.DefaultPagination`; `apps.organisation.selectors.get_employee_for(user, public_id: str) -> Employee` (raises `NotFound` outside reach), `full_name(employee)`; fixtures `client_for(user)`, `anon_client`, `world.user_for(P.X)`; `tests.matrix.Case`, `P`, `only(*allowed, hide=())`.
- Produces `apps.balances.tests.matrix.CASES`.
- Produces the routes of master 7.10:

| Path | Method | Access | Name | Returns |
|---|---|---|---|---|
| `balances/{employee_public_id}` | GET (`?on=YYYY-MM-DD`) | EMPLOYEE, HR, EXEC; reach own, team, all | `balances:figures` | `BalanceOut` |
| `balances/{employee_public_id}/ledger` | GET (`?page=`, `?page_size=`) | the same | `balances:ledger` | paginated `LedgerLineOut`, newest first |
| `balances/{employee_public_id}/adjustments` | POST | HR | `balances:adjustments` | 201 `LedgerLineOut` |

- `BalanceOut`: `{employee: {public_id, name}, current, pending, approved_upcoming, next_credit_amount, next_credit_date, has_opening, as_of: {date, balance, projected} | null}`. Amounts are strings with two decimals.
- `LedgerLineOut`: `{id, kind, amount, effective_date, period, reason, request_public_id, created_by, created_at, balance_after}`.
- `AdjustmentIn`: `{kind, amount, effective_date, reason}` with `kind` equal to `opening` or `adjustment`; any other value is refused with the new code `balances.unknown_kind` on the field `kind`.

`kind` is a plain string in the OpenAPI description, checked by the serializer. Several serializers of the project have a field called `kind`, and declaring one more enumeration under that name would make the generated enum names unstable.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/balances/tests/test_api.py`:

```python
import uuid
from datetime import date, timedelta

import pytest
import time_machine
from django.urls import reverse

from apps.balances.models import LedgerEntry, LedgerKind
from apps.balances.tests.world import at, give_credit, give_opening, make_entry
from apps.organisation import selectors as organisation_selectors
from tests.matrix import P

pytestmark = pytest.mark.usefixtures("reservations")


def url(name: str, employee) -> str:
    return reverse(f"balances:{name}", kwargs={"employee_public_id": employee.public_id})


ADJUSTMENT = {
    "kind": "adjustment",
    "amount": "-1.5",
    "effective_date": "2026-07-15",
    "reason": "Two half days recorded twice",
}


@time_machine.travel(at(2026, 10, 5), tick=False)
def test_an_employee_reads_their_own_balance(cast, client_for, ledger_settings, reservations):
    ledger_settings(start=date(2026, 1, 1))
    owner = cast.owner
    give_opening(owner, "4", date(2025, 12, 31))
    make_entry(owner, LedgerKind.TAKEN, "-3", date(2026, 12, 21), request_id=1)
    reservations(owner, {date(2026, 11, 2): "1"})

    response = client_for(cast.owner_user).get(url("figures", owner))

    assert response.status_code == 200
    assert response.json() == {
        "employee": {"public_id": str(owner.public_id), "name": organisation_selectors.full_name(owner)},
        "current": "4.00",
        "pending": "1.00",
        "approved_upcoming": "3.00",
        "next_credit_amount": "2.50",
        "next_credit_date": "2026-10-31",
        "has_opening": True,
        "as_of": None,
    }


@time_machine.travel(at(2026, 10, 5), tick=False)
def test_the_balance_on_a_future_date_is_marked_as_projected(cast, client_for, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", date(2026, 9, 30))

    response = client_for(cast.owner_user).get(url("figures", cast.owner), {"on": "2026-12-15"})

    assert response.status_code == 200
    assert response.json()["as_of"] == {"date": "2026-12-15", "balance": "6.00", "projected": True}


@time_machine.travel(at(2026, 10, 5), tick=False)
def test_the_balance_on_a_past_date_is_the_posted_balance(cast, client_for, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    give_opening(cast.owner, "4", date(2025, 12, 31))
    give_credit(cast.owner, 2026, 1)

    response = client_for(cast.owner_user).get(url("figures", cast.owner), {"on": "2026-01-15"})

    assert response.json()["as_of"] == {"date": "2026-01-15", "balance": "4.00", "projected": False}


def test_a_date_that_is_not_a_date_is_refused_next_to_the_field(cast, client_for, ledger_settings):
    ledger_settings()

    response = client_for(cast.owner_user).get(url("figures", cast.owner), {"on": "tomorrow"})

    assert response.status_code == 400
    assert response.json()["errors"][0]["field"] == "on"


def test_a_date_too_far_ahead_is_refused(cast, client_for, ledger_settings):
    ledger_settings()

    response = client_for(cast.owner_user).get(url("figures", cast.owner), {"on": "9999-12-31"})

    assert response.status_code == 400
    assert response.json()["code"] == "balances.date_out_of_range"
    assert response.json()["errors"][0]["field"] == "on"


@pytest.mark.parametrize(
    ("persona", "status"),
    [
        (P.OWNER, 200),
        (P.MANAGER, 200),
        (P.HR, 200),
        (P.EXEC, 200),
        (P.PEER, 404),
        (P.OTHER_MANAGER, 404),
        (P.OUTSIDER, 404),
        (P.SYSADMIN, 403),
    ],
)
def test_who_may_read_a_balance(cast, client_for, ledger_settings, persona, status):
    ledger_settings()
    client = client_for(cast.user_for(persona))

    assert client.get(url("figures", cast.owner)).status_code == status
    assert client.get(url("ledger", cast.owner)).status_code == status


def test_an_anonymous_call_is_sent_to_sign_in(cast, anon_client):
    assert anon_client.get(url("figures", cast.owner)).status_code == 401
    assert anon_client.get(url("ledger", cast.owner)).status_code == 401
    assert anon_client.post(url("adjustments", cast.owner), ADJUSTMENT, format="json").status_code == 401


def test_the_ledger_is_paginated_newest_first_with_the_balance_after_each_line(cast, client_for):
    owner = cast.owner
    give_opening(owner, "4", date(2025, 12, 31))
    give_credit(owner, 2026, 1)
    make_entry(owner, LedgerKind.ADJUSTMENT, "-1", date(2026, 2, 9), reason="Correction", created_by=cast.hr_user)

    response = client_for(cast.owner_user).get(url("ledger", owner))

    body = response.json()
    assert response.status_code == 200
    assert (body["count"], body["next"], body["previous"]) == (3, None, None)
    assert [(line["kind"], line["amount"], line["balance_after"]) for line in body["results"]] == [
        ("adjustment", "-1.00", "5.50"),
        ("credit", "2.50", "6.50"),
        ("opening", "4.00", "4.00"),
    ]
    assert set(body["results"][0]) == {
        "id", "kind", "amount", "effective_date", "period", "reason",
        "request_public_id", "created_by", "created_at", "balance_after",
    }
    assert body["results"][0]["reason"] == "Correction"
    assert body["results"][1]["period"] == "2026-01"
    assert body["results"][1]["created_by"] is None


def test_the_ledger_pages(cast, client_for):
    for offset in range(30):
        make_entry(cast.owner, LedgerKind.ADJUSTMENT, "1", date(2026, 1, 1) + timedelta(days=offset), reason="Line")
    client = client_for(cast.owner_user)

    first = client.get(url("ledger", cast.owner)).json()
    second = client.get(url("ledger", cast.owner), {"page": 2}).json()

    assert first["count"] == 30
    assert len(first["results"]) == 25
    assert len(second["results"]) == 5
    assert first["results"][0]["balance_after"] == "30.00"
    assert second["results"][-1]["balance_after"] == "1.00"


def test_hr_posts_an_adjustment(cast, client_for):
    give_opening(cast.owner, "4", date(2025, 12, 31))

    response = client_for(cast.hr_user).post(url("adjustments", cast.owner), ADJUSTMENT, format="json")

    assert response.status_code == 201
    body = response.json()
    assert (body["kind"], body["amount"], body["balance_after"]) == ("adjustment", "-1.50", "2.50")
    entry = LedgerEntry.objects.get(pk=body["id"])
    assert (entry.employee, entry.created_by, entry.effective_date) == (cast.owner, cast.hr_user, date(2026, 7, 15))


def test_hr_posts_the_opening_balance_once(cast, client_for):
    client = client_for(cast.hr_user)
    opening = {"kind": "opening", "amount": "12", "effective_date": "2025-12-31", "reason": "Carried over"}

    first = client.post(url("adjustments", cast.owner), opening, format="json")
    second = client.post(url("adjustments", cast.owner), opening, format="json")

    assert first.status_code == 201
    assert first.json()["kind"] == "opening"
    assert second.status_code == 409
    assert second.json()["code"] == "balances.opening_exists"


def test_an_adjustment_without_a_reason_is_refused_next_to_the_field(cast, client_for):
    response = client_for(cast.hr_user).post(
        url("adjustments", cast.owner), {**ADJUSTMENT, "reason": "   "}, format="json"
    )

    assert response.status_code == 400
    assert response.json()["code"] == "balances.reason_required"
    assert response.json()["errors"][0]["field"] == "reason"
    assert LedgerEntry.objects.count() == 0


def test_an_adjustment_of_zero_is_refused(cast, client_for):
    response = client_for(cast.hr_user).post(
        url("adjustments", cast.owner), {**ADJUSTMENT, "amount": "0"}, format="json"
    )

    assert response.status_code == 400
    assert response.json()["code"] == "balances.zero_amount"
    assert response.json()["errors"][0]["field"] == "amount"


def test_an_unknown_kind_is_refused(cast, client_for):
    response = client_for(cast.hr_user).post(
        url("adjustments", cast.owner), {**ADJUSTMENT, "kind": "credit"}, format="json"
    )

    assert response.status_code == 400
    assert response.json()["errors"][0]["field"] == "kind"
    assert LedgerEntry.objects.count() == 0


@pytest.mark.parametrize("persona", [P.OWNER, P.MANAGER, P.EXEC, P.SYSADMIN])
def test_only_hr_adjusts(cast, client_for, persona):
    response = client_for(cast.user_for(persona)).post(url("adjustments", cast.owner), ADJUSTMENT, format="json")

    assert response.status_code == 403
    assert LedgerEntry.objects.count() == 0


def test_an_unknown_employee_is_not_found(cast, client_for):
    missing = reverse("balances:figures", kwargs={"employee_public_id": uuid.uuid4()})

    assert client_for(cast.hr_user).get(missing).status_code == 404
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm app pytest apps/balances/tests/test_api.py -v`
Expected: FAIL, every test with `django.urls.exceptions.NoReverseMatch: 'balances' is not a registered namespace`.

- [ ] **Step 3: Write the serializers**

Create `backend/apps/balances/api/__init__.py` as an empty file, then `backend/apps/balances/api/serializers.py`:

```python
from rest_framework import serializers

from apps.core.i18n import translate

AMOUNT = {"max_digits": 7, "decimal_places": 2}


class BalanceQuery(serializers.Serializer):
    on = serializers.DateField(required=False)


class BalanceEmployeeOut(serializers.Serializer):
    public_id = serializers.UUIDField()
    name = serializers.CharField()


class BalanceAsOfOut(serializers.Serializer):
    date = serializers.DateField(source="on")
    balance = serializers.DecimalField(**AMOUNT)
    projected = serializers.BooleanField()


class BalanceOut(serializers.Serializer):
    employee = BalanceEmployeeOut()
    current = serializers.DecimalField(**AMOUNT)
    pending = serializers.DecimalField(**AMOUNT)
    approved_upcoming = serializers.DecimalField(**AMOUNT)
    next_credit_amount = serializers.DecimalField(**AMOUNT, allow_null=True)
    next_credit_date = serializers.DateField(allow_null=True)
    has_opening = serializers.BooleanField()
    as_of = BalanceAsOfOut(allow_null=True)


class LedgerLineOut(serializers.Serializer):
    id = serializers.IntegerField()
    kind = serializers.CharField()
    amount = serializers.DecimalField(**AMOUNT)
    effective_date = serializers.DateField()
    period = serializers.CharField(allow_blank=True)
    reason = serializers.CharField(allow_blank=True)
    request_public_id = serializers.CharField(allow_null=True)
    created_by = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()
    balance_after = serializers.DecimalField(**AMOUNT)


class AdjustmentIn(serializers.Serializer):
    kind = serializers.CharField()
    amount = serializers.DecimalField(**AMOUNT)
    effective_date = serializers.DateField()
    reason = serializers.CharField(allow_blank=True, max_length=500)

    def validate_kind(self, value: str) -> str:
        if value not in ("opening", "adjustment"):
            raise serializers.ValidationError(translate("balances.unknown_kind"), code="invalid_choice")
        return value
```

Add the text of the new code to `backend/apps/balances/messages.py`, as a new entry of `MESSAGES` after `balances.date_out_of_range`:

```python
    "balances.unknown_kind": {
        "en": "Choose an opening balance or an adjustment.",
        "fr": "Choisissez un solde d'ouverture ou un ajustement.",
    },
```

- [ ] **Step 4: Write the views**

Create `backend/apps/balances/api/views.py`:

```python
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import Role
from apps.core.pagination import DefaultPagination
from apps.organisation import selectors as organisation_selectors

from .. import selectors, services
from .serializers import AdjustmentIn, BalanceOut, BalanceQuery, LedgerLineOut

READERS = {Role.EMPLOYEE, Role.HR, Role.EXEC}


class BalanceFiguresView(APIView):
    access = {"GET": READERS}
    http_method_names = ["get"]

    @extend_schema(parameters=[BalanceQuery], responses=BalanceOut)
    def get(self, request, employee_public_id):
        employee = organisation_selectors.get_employee_for(request.user, str(employee_public_id))
        query = BalanceQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        on = query.validated_data.get("on")
        figures = selectors.figures(employee.id)
        payload = {
            "employee": {"public_id": employee.public_id, "name": organisation_selectors.full_name(employee)},
            "current": figures.current,
            "pending": figures.pending,
            "approved_upcoming": figures.approved_upcoming,
            "next_credit_amount": figures.next_credit_amount,
            "next_credit_date": figures.next_credit_date,
            "has_opening": selectors.has_opening(employee.id),
            "as_of": selectors.as_of(employee.id, on) if on is not None else None,
        }
        return Response(BalanceOut(payload).data)


class LedgerView(ListAPIView):
    access = {"GET": READERS}
    http_method_names = ["get"]
    serializer_class = LedgerLineOut
    pagination_class = DefaultPagination
    filter_backends = []

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return []
        employee = organisation_selectors.get_employee_for(
            self.request.user, str(self.kwargs["employee_public_id"])
        )
        return list(reversed(selectors.ledger_lines(employee.id)))

    @extend_schema(responses=LedgerLineOut(many=True))
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


class AdjustmentView(APIView):
    access = {"POST": {Role.HR}}
    http_method_names = ["post"]

    @extend_schema(request=AdjustmentIn, responses={201: LedgerLineOut})
    def post(self, request, employee_public_id):
        employee = organisation_selectors.get_employee_for(request.user, str(employee_public_id))
        data = AdjustmentIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = dict(data.validated_data)
        post = services.post_opening if values.pop("kind") == "opening" else services.adjust
        entry = post(actor=request.user, employee=employee, **values)
        line = selectors.ledger_line(employee.id, entry.id)
        return Response(LedgerLineOut(line).data, status=status.HTTP_201_CREATED)
```

- [ ] **Step 5: Write the routes**

Create `backend/apps/balances/api/urls.py`:

```python
from django.urls import path

from . import views

app_name = "balances"

urlpatterns = [
    path("balances/<uuid:employee_public_id>", views.BalanceFiguresView.as_view(), name="figures"),
    path("balances/<uuid:employee_public_id>/ledger", views.LedgerView.as_view(), name="ledger"),
    path("balances/<uuid:employee_public_id>/adjustments", views.AdjustmentView.as_view(), name="adjustments"),
]
```

In `backend/config/api_urls.py`, append one line to `urlpatterns`, after the line that includes `apps.requests.api.urls` and in the same form:

```python
    path("", include("apps.balances.api.urls")),
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `docker compose run --rm app pytest apps/balances/tests/test_api.py -v`
Expected: PASS, 26 passed.

- [ ] **Step 7: See the permission matrix refuse the new routes**

Run: `docker compose run --rm app pytest tests/test_permission_matrix.py -q`
Expected: FAIL. The coverage check names `balances:figures`, `balances:ledger` and `balances:adjustments` as routes without a case: a route that the matrix does not know fails the build.

- [ ] **Step 8: Write the matrix cases**

Create `backend/apps/balances/tests/matrix.py`:

```python
from tests.matrix import Case, P, only

READERS = only(P.OWNER, P.MANAGER, P.HR, P.EXEC, hide=[P.PEER, P.OTHER_MANAGER, P.OUTSIDER])


def _owner(world) -> dict:
    return {"employee_public_id": world.owner.public_id}


def _adjustment(world) -> dict:
    return {
        "kind": "adjustment",
        "amount": "1.00",
        "effective_date": "2026-07-15",
        "reason": "Permission matrix",
    }


CASES = [
    Case(route="balances:figures", method="GET", expect=READERS, kwargs=_owner, label="the owner's balance"),
    Case(route="balances:ledger", method="GET", expect=READERS, kwargs=_owner, label="the owner's ledger"),
    Case(
        route="balances:adjustments",
        method="POST",
        expect=only(P.HR),
        kwargs=_owner,
        body=_adjustment,
        label="adjusting the owner's balance",
    ),
]
```

In `backend/tests/test_permission_matrix.py`, append one line to `MATRIX_MODULES`, after the entry of `apps.requests`:

```python
    "apps.balances.tests.matrix",
```

Run: `docker compose run --rm app pytest tests/test_permission_matrix.py -q`
Expected: PASS. The three routes are exercised as every persona: the owner, the manager, HR and the executive read; the peer, the other manager and the outsider get 404; the System Administrator gets 403; an anonymous call gets 401; only HR posts.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/balances backend/config/api_urls.py backend/tests/test_permission_matrix.py
git commit -m "feat(balances): balance, ledger and adjustment endpoints with their permission cases"
```

### Task 10: The request engine with the ledger behind it

This task adds no production code. It proves, through the services of plan 03a, that annual leave is now checked, held, posted and given back. Every test asks for the `ledger_port` fixture and freezes the clock on Monday 5 October 2026. The test database holds no public holiday, so every Monday to Friday is a working day.

**Files:**
- Create: `backend/apps/balances/tests/flows.py`
- Test: `backend/apps/balances/tests/test_with_requests.py`

**Interfaces:**
- Consumes, from `apps.requests.services` (master 7.9): `RequestData`, `create_draft(*, actor, employee, request_type, data, override_reason="")`, `submit(*, actor, request, expected_version=None)`, `withdraw(*, actor, request)`, `decide_step(*, actor, step, decision, comment="", expected_version)`, `open_amendment(*, actor, request, kind, data, reason)`, `hr_correct(*, actor, request, data, reason)`, `hr_cancel(*, actor, request, reason)`, `reclassify_as_annual(*, actor, request, override_reason="")`.
- Consumes, from `apps.requests.selectors`: `queue(user, name) -> QuerySet[RequestStep]`, `reserved_days(employee_id, *, ignoring_request_id=None)`.
- Consumes: `apps.requests.models.Decision` (`APPROVE`, `RETURN`); the routes `requests:request-preview` and `requests:request-detail`; `world.annual`, `world.sick`; the error code `request.balance_insufficient` with its param `shortfall`.
- Produces, in `apps.balances.tests.flows`: `draft(world, start, end, *, actor=None, request_type=None, override_reason="", **flags) -> Request`, `send(world, start, end, **kwargs) -> Request`, `decide(world, request, *, approver, queue, decision=Decision.APPROVE, comment="") -> Request`, `approve(world, request) -> Request`, `let_hr_finish(world, request) -> Request`, `problem_codes(error) -> list[str]`, `shortfall(error) -> Decimal`.

- [ ] **Step 1: Write the helpers that drive the request engine**

Create `backend/apps/balances/tests/flows.py`:

```python
"""Driving plan 03a's request engine from ledger tests (master plan 7.9)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from apps.requests import selectors as request_selectors
from apps.requests import services as request_services
from apps.requests.models import Decision
from apps.requests.services import RequestData


def draft(world, start: date, end: date, *, actor=None, request_type=None, override_reason: str = "", **flags):
    """A draft for the owner. `flags` go to RequestData (`ends_at_midday=True`, ...)."""
    return request_services.create_draft(
        actor=actor or world.owner_user,
        employee=world.owner,
        request_type=request_type or world.annual,
        data=RequestData(start_date=start, end_date=end, **flags),
        override_reason=override_reason,
    )


def send(world, start: date, end: date, **kwargs):
    """Drafts and submits. Raises what `submit` raises."""
    actor = kwargs.get("actor") or world.owner_user
    return request_services.submit(actor=actor, request=draft(world, start, end, **kwargs))


def decide(world, request, *, approver, queue: str, decision=Decision.APPROVE, comment: str = ""):
    """The approver decides the step that is waiting for them on this request or on its open amendment."""
    request.refresh_from_db()
    step = request_selectors.queue(approver, queue).get(request=request)
    return request_services.decide_step(
        actor=approver, step=step, decision=decision, comment=comment, expected_version=request.version
    )


def approve(world, request):
    """The owner's chain: the line manager, then HR."""
    request = decide(world, request, approver=world.manager_user, queue="mine")
    return decide(world, request, approver=world.hr_user, queue="hr")


def let_hr_finish(world, request):
    """After a reclassification: approve the HR step if the engine left one to decide."""
    request.refresh_from_db()
    if request.status == "pending":
        request = decide(world, request, approver=world.hr_user, queue="hr")
    return request


def problem_codes(error) -> list[str]:
    return [problem.code for problem in error.problems]


def shortfall(error) -> Decimal:
    problem = next(p for p in error.problems if p.code == "request.balance_insufficient")
    return Decimal(str(problem.params["shortfall"]))
```

- [ ] **Step 2: Write the tests**

Create `backend/apps/balances/tests/test_with_requests.py`:

```python
from datetime import date
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from apps.balances import selectors, services
from apps.balances.models import LedgerEntry, LedgerKind
from apps.balances.tests import flows
from apps.balances.tests.world import at, give_opening
from apps.core.errors import DomainError
from apps.requests import selectors as request_selectors
from apps.requests import services as request_services
from apps.requests.models import Decision
from apps.requests.services import RequestData

pytestmark = pytest.mark.usefixtures("ledger_port")

SEPT_30 = date(2026, 9, 30)


@pytest.fixture(autouse=True)
def monday_5_october_2026(time_machine):
    """Every test of this file runs on Monday 5 October 2026, 09:00 in Tunis."""
    time_machine.move_to(at(2026, 10, 5), tick=False)


def lines_of(employee, kind) -> list[tuple[date, Decimal]]:
    entries = LedgerEntry.objects.filter(employee=employee, kind=kind)
    return [(entry.effective_date, entry.amount) for entry in entries]


def test_a_request_beyond_the_balance_is_refused_with_the_shortfall(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "2", SEPT_30)

    with pytest.raises(DomainError) as refused:
        flows.send(cast, date(2026, 10, 19), date(2026, 10, 21))

    assert "request.balance_insufficient" in flows.problem_codes(refused.value)
    assert flows.shortfall(refused.value) == Decimal("1")
    assert request_selectors.reserved_days(cast.owner.id) == {}


def test_leave_not_yet_earned_is_accepted_when_earned_by_its_start(cast, ledger_settings):
    ledger_settings(start=date(2026, 10, 1))
    give_opening(cast.owner, "1", SEPT_30)

    request = flows.send(cast, date(2026, 12, 7), date(2026, 12, 9))

    assert request.status == "pending"
    assert selectors.figures(cast.owner.id).pending == Decimal("3")


def test_days_held_by_a_pending_request_cannot_be_asked_twice(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "3", SEPT_30)
    flows.send(cast, date(2026, 10, 19), date(2026, 10, 21))

    with pytest.raises(DomainError) as refused:
        flows.send(cast, date(2026, 10, 26), date(2026, 10, 26))

    assert flows.shortfall(refused.value) == Decimal("1")


def test_a_request_that_would_starve_approved_later_leave_is_refused(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "5", SEPT_30)
    flows.approve(cast, flows.send(cast, date(2026, 12, 21), date(2026, 12, 25)))

    with pytest.raises(DomainError) as refused:
        flows.send(cast, date(2026, 11, 16), date(2026, 11, 17))

    assert flows.shortfall(refused.value) == Decimal("2")


def test_final_approval_posts_one_line_per_month(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "12", SEPT_30)

    request = flows.approve(cast, flows.send(cast, date(2026, 12, 28), date(2027, 1, 8)))

    assert request.status == "approved"
    assert lines_of(cast.owner, LedgerKind.TAKEN) == [
        (date(2026, 12, 28), Decimal("-4")),
        (date(2027, 1, 1), Decimal("-6")),
    ]
    assert set(LedgerEntry.objects.filter(kind=LedgerKind.TAKEN).values_list("request_id", flat=True)) == {request.id}
    figures = selectors.figures(cast.owner.id)
    assert (figures.current, figures.pending, figures.approved_upcoming) == (Decimal("12"), Decimal("0"), Decimal("10"))


def test_hr_can_exceed_the_balance_with_a_reason(cast, ledger_settings):
    ledger_settings()

    request = flows.send(
        cast, date(2026, 10, 19), date(2026, 10, 21), actor=cast.hr_user, override_reason="Agreed with the CEO"
    )
    request = flows.approve(cast, request)

    assert request.status == "approved"
    assert selectors.balance_on(cast.owner.id, date(2026, 10, 19)) == Decimal("-3")


def test_the_balance_is_checked_again_at_final_approval(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "3", SEPT_30)
    request = flows.send(cast, date(2026, 10, 19), date(2026, 10, 21))
    services.adjust(
        actor=cast.hr_user,
        employee=cast.owner,
        amount=Decimal("-2"),
        effective_date=date(2026, 10, 6),
        reason="Leave of September never recorded",
    )
    request = flows.decide(cast, request, approver=cast.manager_user, queue="mine")

    with pytest.raises(DomainError) as refused:
        flows.decide(cast, request, approver=cast.hr_user, queue="hr")

    assert flows.shortfall(refused.value) == Decimal("2")
    request.refresh_from_db()
    assert request.status == "pending"
    assert lines_of(cast.owner, LedgerKind.TAKEN) == []


def test_the_employee_is_locked_before_the_ledger_is_read(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "5", SEPT_30)
    draft = flows.draft(cast, date(2026, 10, 19), date(2026, 10, 21))

    with CaptureQueriesContext(connection) as queries:
        request_services.submit(actor=cast.owner_user, request=draft)

    statements = [query["sql"] for query in queries.captured_queries]
    lock = next(i for i, sql in enumerate(statements) if "FOR UPDATE" in sql and "organisation_employee" in sql)
    read = next(i for i, sql in enumerate(statements) if "balances_ledgerentry" in sql)
    assert lock < read


def test_cancelling_approved_leave_gives_the_days_back(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "5", SEPT_30)
    request = flows.approve(cast, flows.send(cast, date(2026, 11, 2), date(2026, 11, 6)))
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 2)) == Decimal("0")

    request_services.hr_cancel(actor=cast.hr_user, request=request, reason="Project deadline moved")

    assert lines_of(cast.owner, LedgerKind.RESTORED) == [(date(2026, 11, 2), Decimal("5"))]
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 2)) == Decimal("5")
    assert LedgerEntry.objects.get(kind=LedgerKind.RESTORED).reason == "Project deadline moved"


def test_shortening_approved_leave_gives_back_the_released_days(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "5", SEPT_30)
    request = flows.approve(cast, flows.send(cast, date(2026, 11, 2), date(2026, 11, 6)))

    request_services.hr_correct(
        actor=cast.hr_user,
        request=request,
        data=RequestData(start_date=date(2026, 11, 2), end_date=date(2026, 11, 4)),
        reason="Back two days early",
    )

    assert selectors.balance_on(cast.owner.id, date(2026, 11, 2)) == Decimal("2")
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 30)) == Decimal("2")


def test_moving_approved_leave_needs_no_extra_balance(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "2", SEPT_30)
    request = flows.approve(cast, flows.send(cast, date(2026, 11, 2), date(2026, 11, 3)))

    request_services.open_amendment(
        actor=cast.owner_user,
        request=request,
        kind="change",
        data=RequestData(start_date=date(2026, 11, 9), end_date=date(2026, 11, 10)),
        reason="Family event moved",
    )
    # the original stays in force until the change is approved
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 30)) == Decimal("0")
    flows.approve(cast, request)

    assert selectors.balance_on(cast.owner.id, date(2026, 11, 5)) == Decimal("2")
    assert selectors.balance_on(cast.owner.id, date(2026, 11, 10)) == Decimal("0")
    assert (date(2026, 11, 9), Decimal("-2")) in lines_of(cast.owner, LedgerKind.TAKEN)


def test_an_approved_cancellation_gives_the_days_back(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "2", SEPT_30)
    request = flows.approve(cast, flows.send(cast, date(2026, 11, 2), date(2026, 11, 3)))

    request_services.open_amendment(
        actor=cast.owner_user, request=request, kind="cancel", data=None, reason="Trip cancelled"
    )
    flows.approve(cast, request)

    assert selectors.balance_on(cast.owner.id, date(2026, 11, 30)) == Decimal("2")


def test_a_pending_amendment_holds_only_the_days_it_adds(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "3", SEPT_30)
    request = flows.approve(cast, flows.send(cast, date(2026, 11, 2), date(2026, 11, 3)))

    request_services.open_amendment(
        actor=cast.owner_user,
        request=request,
        kind="change",
        data=RequestData(start_date=date(2026, 11, 2), end_date=date(2026, 11, 4)),
        reason="One more day",
    )

    assert request_selectors.reserved_days(cast.owner.id) == {date(2026, 11, 4): Decimal("1")}
    with pytest.raises(DomainError) as refused:
        flows.send(cast, date(2026, 10, 26), date(2026, 10, 26))
    assert flows.shortfall(refused.value) == Decimal("1")


def test_sick_leave_counted_as_annual_leave_is_deducted(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "5", SEPT_30)
    request = flows.send(cast, date(2026, 10, 1), date(2026, 10, 2), request_type=cast.sick)
    assert selectors.figures(cast.owner.id).pending == Decimal("0")

    request = request_services.reclassify_as_annual(actor=cast.hr_user, request=request)
    request = flows.let_hr_finish(cast, request)

    assert request.status == "approved"
    assert lines_of(cast.owner, LedgerKind.TAKEN) == [(date(2026, 10, 1), Decimal("-2"))]
    assert selectors.balance_on(cast.owner.id, date(2026, 10, 5)) == Decimal("3")


def test_counting_sick_leave_as_annual_needs_the_balance_or_a_reason(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "1", SEPT_30)
    request = flows.send(cast, date(2026, 10, 1), date(2026, 10, 2), request_type=cast.sick)

    with pytest.raises(DomainError) as refused:
        request_services.reclassify_as_annual(actor=cast.hr_user, request=request)
    assert flows.shortfall(refused.value) == Decimal("1")

    request.refresh_from_db()
    request = request_services.reclassify_as_annual(
        actor=cast.hr_user, request=request, override_reason="No certificate; agreed with the employee"
    )
    flows.let_hr_finish(cast, request)

    assert selectors.balance_on(cast.owner.id, date(2026, 10, 5)) == Decimal("-1")


def test_a_withdrawn_request_holds_nothing(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "3", SEPT_30)
    request = flows.send(cast, date(2026, 10, 19), date(2026, 10, 21))

    request_services.withdraw(actor=cast.owner_user, request=request)

    assert flows.send(cast, date(2026, 10, 26), date(2026, 10, 28)).status == "pending"


def test_a_request_sent_back_holds_nothing(cast, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "3", SEPT_30)
    request = flows.send(cast, date(2026, 10, 19), date(2026, 10, 21))

    flows.decide(
        cast, request, approver=cast.manager_user, queue="mine", decision=Decision.RETURN, comment="Pick other dates"
    )

    assert request_selectors.reserved_days(cast.owner.id) == {}
    assert flows.send(cast, date(2026, 10, 26), date(2026, 10, 28)).status == "pending"


def test_the_form_preview_and_the_decision_view_carry_the_balance(cast, client_for, ledger_settings):
    ledger_settings()
    give_opening(cast.owner, "5", SEPT_30)
    asked = {
        "type": "annual",
        "start_date": "2026-10-19",
        "end_date": "2026-10-21",
        "starts_at_midday": False,
        "ends_at_midday": False,
        "start_time": None,
        "end_time": None,
        "exceptional_event": None,
        "override": False,
    }

    preview = client_for(cast.owner_user).post(reverse("requests:request-preview"), asked, format="json")

    assert preview.status_code == 200
    balance = preview.json()["balance"]
    assert (Decimal(balance["now"]), Decimal(balance["on_start"]), Decimal(balance["after"])) == (5, 5, 2)

    request = flows.send(cast, date(2026, 10, 19), date(2026, 10, 21))
    detail = client_for(cast.manager_user).get(
        reverse("requests:request-detail", kwargs={"public_id": request.public_id})
    )

    assert detail.status_code == 200
    context = detail.json()["decision_context"]["balance"]
    assert (Decimal(context["now"]), Decimal(context["after"])) == (5, 2)
```

- [ ] **Step 3: Run the tests**

Run: `docker compose run --rm app pytest apps/balances/tests/test_with_requests.py -v`
Expected: PASS, 18 passed.

These tests meet plan 03a's code for the first time. Read a failure in this order:

1. An `ImportError` or `AttributeError` on a name of `apps.requests` (for example `Decision` living in another module): correct the import in `flows.py` or in the test. The behaviour is not in question.
2. A wrong ledger line or balance: the defect is in `apps/balances` (Tasks 4 to 7). Fix it there, with a unit test in the task's own test file first.
3. A request accepted or refused against the rules above although the port answers correctly (check with `LedgerBalancePort().check(...)` in a shell): plan 03a does not call the port as master 7.9 requires (`check` at submission and at final approval inside the employee lock, `ignoring_request_id` for a request being replaced or re-checked, `post_taken` on final approval, `post_restored` when approved days are released, no check when an override reason is present). Stop and report it; do not change `apps/requests` from this plan.

- [ ] **Step 4: Run both apps together**

Run: `docker compose run --rm app pytest apps/balances apps/requests -q`
Expected: no failure. The request engine's tests run with the null port, the ledger's with the real one, in the same process.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/balances/tests
git commit -m "test(balances): annual leave is checked, held, posted and given back through the request engine"
```

### Task 11: One employee, one year, by hand

The "done when" of this build step: the balance of a test employee matches a hand calculation across a year. The year below has an opening balance, twelve credits, leave inside a month, leave across a month boundary, an HR adjustment, leave that HR cancels, a half day and leave in December.

| Effective date | What happened | Days | Balance after |
|---|---|---|---|
| 2025-12-31 | Opening balance | +4 | 4 |
| 2026-01-31 | Credit | +2.5 | 6.5 |
| 2026-02-28 | Credit | +2.5 | 9 |
| 2026-03-09 | Leave 9 to 13 March | -5 | 4 |
| 2026-03-31 | Credit | +2.5 | 6.5 |
| 2026-04-30 | Credit | +2.5 | 9 |
| 2026-05-28 | Leave 28 May to 2 June, days in May | -2 | 7 |
| 2026-05-31 | Credit | +2.5 | 9.5 |
| 2026-06-01 | Leave 28 May to 2 June, days in June | -2 | 7.5 |
| 2026-06-30 | Credit | +2.5 | 10 |
| 2026-07-15 | HR adjustment | -1 | 9 |
| 2026-07-31 | Credit | +2.5 | 11.5 |
| 2026-08-17 | Leave 17 to 21 August | -5 | 6.5 |
| 2026-08-17 | The same leave, cancelled by HR on 10 August | +5 | 11.5 |
| 2026-08-31 | Credit | +2.5 | 14 |
| 2026-09-30 | Credit | +2.5 | 16.5 |
| 2026-10-09 | Morning of 9 October | -0.5 | 16 |
| 2026-10-31 | Credit | +2.5 | 18.5 |
| 2026-11-30 | Credit | +2.5 | 21 |
| 2026-12-21 | Leave 21 to 24 December | -4 | 17 |
| 2026-12-31 | Credit | +2.5 | 19.5 |

Check: 4 + 12 x 2.5 - 5 - 2 - 2 - 1 - 5 + 5 - 0.5 - 4 = 19.5.

**Files:**
- Test: `backend/apps/balances/tests/test_a_year_by_hand.py`

**Interfaces:**
- Consumes: everything Tasks 1 to 10 produce; no new name.
- Produces: nothing.

- [ ] **Step 1: Write the test**

Create `backend/apps/balances/tests/test_a_year_by_hand.py`:

```python
from datetime import date
from decimal import Decimal

import pytest
import time_machine

from apps.balances import selectors, services
from apps.balances.selectors import BalanceFigures
from apps.balances.tests import flows
from apps.balances.tests.world import at
from apps.requests import services as request_services

pytestmark = pytest.mark.usefixtures("ledger_port")

D = Decimal


def test_a_year_of_one_employee_matches_the_hand_calculation(cast, ledger_settings):
    ledger_settings(start=date(2026, 1, 1))
    owner = cast.owner

    def month_end_run(month: int) -> None:
        services.post_month_end_credits(today=services.month_end(2026, month))

    def leave(asked_on, start: date, end: date, **flags):
        with time_machine.travel(asked_on, tick=False):
            return flows.approve(cast, flows.send(cast, start, end, **flags))

    services.post_opening(
        actor=cast.hr_user,
        employee=owner,
        amount=D("4"),
        effective_date=date(2025, 12, 31),
        reason="Balance carried over from the 2025 file",
    )
    month_end_run(1)
    month_end_run(2)
    leave(at(2026, 3, 2), date(2026, 3, 9), date(2026, 3, 13))
    month_end_run(3)
    month_end_run(4)
    leave(at(2026, 5, 18), date(2026, 5, 28), date(2026, 6, 2))
    month_end_run(5)
    month_end_run(6)
    services.adjust(
        actor=cast.hr_user,
        employee=owner,
        amount=D("-1"),
        effective_date=date(2026, 7, 15),
        reason="A day of 2025 recorded twice",
    )
    month_end_run(7)
    august = leave(at(2026, 8, 3), date(2026, 8, 17), date(2026, 8, 21))
    with time_machine.travel(at(2026, 8, 10), tick=False):
        request_services.hr_cancel(actor=cast.hr_user, request=august, reason="Project deadline moved")
    month_end_run(8)
    month_end_run(9)
    leave(at(2026, 10, 1), date(2026, 10, 9), date(2026, 10, 9), ends_at_midday=True)
    month_end_run(10)
    month_end_run(11)
    leave(at(2026, 12, 7), date(2026, 12, 21), date(2026, 12, 24))
    month_end_run(12)

    lines = selectors.ledger_lines(owner.id)

    assert [(line.effective_date, line.kind, line.amount, line.balance_after) for line in lines] == [
        (date(2025, 12, 31), "opening", D("4"), D("4")),
        (date(2026, 1, 31), "credit", D("2.5"), D("6.5")),
        (date(2026, 2, 28), "credit", D("2.5"), D("9")),
        (date(2026, 3, 9), "taken", D("-5"), D("4")),
        (date(2026, 3, 31), "credit", D("2.5"), D("6.5")),
        (date(2026, 4, 30), "credit", D("2.5"), D("9")),
        (date(2026, 5, 28), "taken", D("-2"), D("7")),
        (date(2026, 5, 31), "credit", D("2.5"), D("9.5")),
        (date(2026, 6, 1), "taken", D("-2"), D("7.5")),
        (date(2026, 6, 30), "credit", D("2.5"), D("10")),
        (date(2026, 7, 15), "adjustment", D("-1"), D("9")),
        (date(2026, 7, 31), "credit", D("2.5"), D("11.5")),
        (date(2026, 8, 17), "taken", D("-5"), D("6.5")),
        (date(2026, 8, 17), "restored", D("5"), D("11.5")),
        (date(2026, 8, 31), "credit", D("2.5"), D("14")),
        (date(2026, 9, 30), "credit", D("2.5"), D("16.5")),
        (date(2026, 10, 9), "taken", D("-0.5"), D("16")),
        (date(2026, 10, 31), "credit", D("2.5"), D("18.5")),
        (date(2026, 11, 30), "credit", D("2.5"), D("21")),
        (date(2026, 12, 21), "taken", D("-4"), D("17")),
        (date(2026, 12, 31), "credit", D("2.5"), D("19.5")),
    ]
    # every leave line leads back to its request, the cancelled one included
    assert all(line.request_public_id for line in lines if line.kind in ("taken", "restored"))

    year_end = date(2026, 12, 31)
    assert selectors.balance_on(owner.id, date(2026, 6, 15)) == D("7.5")
    assert selectors.balance_on(owner.id, date(2026, 8, 20)) == D("11.5")
    assert selectors.balances_at(year_end, employee_ids=[owner.id]) == {owner.id: D("19.5")}
    assert selectors.figures(owner.id, today=year_end) == BalanceFigures(
        current=D("19.5"),
        pending=D("0"),
        approved_upcoming=D("0"),
        next_credit_amount=D("2.5"),
        next_credit_date=date(2027, 1, 31),
    )
    # nothing left to post: the year is complete and a new run changes nothing
    assert services.post_month_end_credits(today=year_end) == 0
```

- [ ] **Step 2: Run the test**

Run: `docker compose run --rm app pytest apps/balances/tests/test_a_year_by_hand.py -v`
Expected: PASS, 1 passed.

If a line differs from the table, the table is right: it is the hand calculation the step is measured against. Find the task that owns the differing line (credits: Tasks 2 and 3; leave lines: Task 6; adjustment: Task 7; order and running balance: Task 8), add a failing unit test there, and fix the code.

- [ ] **Step 3: Run the whole backend suite**

Run: `docker compose run --rm app pytest -q`
Expected: PASS, no failure.

- [ ] **Step 4: Commit**

```bash
git add backend/apps/balances/tests/test_a_year_by_hand.py
git commit -m "test(balances): a year of one employee matches the hand calculation"
```

### Task 12: Demo balances and the regenerated API description

**Files:**
- Create: `backend/apps/balances/seed.py`
- Modify: `backend/apps/core/management/commands/seed_demo.py` (one line in `SEEDERS`)
- Test: `backend/apps/balances/tests/test_seed.py`
- Regenerate: `backend/openapi.yaml`, `frontend/src/api/schema.d.ts`

**Interfaces:**
- Consumes: `apps.accounts.roles.Role`, `users_with_role(role)`; `apps.organisation.selectors.directory()` (active employees); `Employee.professional_email`; `settings_service.set_value(*, actor, key, value)`; the fixture `real_settings` (Task 2).
- Produces: `apps.balances.seed.seed() -> None` and `apps.balances.seed.WITHOUT_OPENING`.

The standard cast is not extended: it keeps an empty ledger, so that tests of every plan state their own balances with the builders of `apps/balances/tests/world.py`. `build_world()` is therefore left as it is.

Demo data: month-end credits start on the first day of the month three months back; every active employee gets an opening balance of 12 days dated the day before, except `employee.b1@impactrisks.com`, whose opening balance the browser test of Task 17 records by hand; then the credit job runs once.

- [ ] **Step 1: Write the failing seed test**

Create `backend/apps/balances/tests/test_seed.py`:

```python
from datetime import date
from decimal import Decimal

import time_machine

from apps.balances import seed, selectors, services
from apps.balances.models import LedgerEntry, LedgerKind
from apps.balances.tests.world import at


def test_demo_data_gives_everyone_but_one_an_opening_balance_and_three_credits(cast, real_settings):
    cast.outsider.professional_email = seed.WITHOUT_OPENING
    cast.outsider.save(update_fields=["professional_email"])

    with time_machine.travel(at(2026, 10, 5), tick=False):
        seed.seed()
        lines_after_the_first_run = LedgerEntry.objects.count()
        seed.seed()

    assert services.credit_start_date() == date(2026, 7, 1)
    assert LedgerEntry.objects.count() == lines_after_the_first_run
    assert LedgerEntry.objects.get(employee=cast.owner, kind=LedgerKind.OPENING).effective_date == date(2026, 6, 30)
    assert selectors.has_opening(cast.outsider.id) is False
    # 12 days of opening balance, then the credits of July, August and September
    assert selectors.balance_on(cast.owner.id, date(2026, 10, 5)) == Decimal("19.5")
    assert selectors.balance_on(cast.outsider.id, date(2026, 10, 5)) == Decimal("7.5")
```

Run: `docker compose run --rm app pytest apps/balances/tests/test_seed.py -v`
Expected: collection error, `ImportError: cannot import name 'seed' from 'apps.balances'`.

- [ ] **Step 2: Write the seeder**

Create `backend/apps/balances/seed.py`:

```python
"""Demo balances for development and browser tests."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.accounts.roles import Role, users_with_role
from apps.organisation import selectors as organisation_selectors
from apps.settings import services as settings_service

from . import selectors, services

# Left without an opening balance: the browser test of plan 04 records it by hand.
WITHOUT_OPENING = "employee.b1@impactrisks.com"
OPENING_DAYS = Decimal("12")


def _first_day_of_month(today: date, months_back: int) -> date:
    year, month = today.year, today.month - months_back
    while month < 1:
        year, month = year - 1, month + 12
    return date(year, month, 1)


def seed() -> None:
    """Idempotent: a second run adds nothing."""
    hr_user = users_with_role(Role.HR).first()
    today = timezone.localdate()

    if services.credit_start_date() is None:
        start = _first_day_of_month(today, 3)
        settings_service.set_value(actor=hr_user, key="credit_start_date", value=start.isoformat())
        settings_service.clear_cache()
    start = services.credit_start_date()

    for employee in organisation_selectors.directory():
        if employee.professional_email == WITHOUT_OPENING or selectors.has_opening(employee.id):
            continue
        services.post_opening(
            actor=hr_user,
            employee=employee,
            amount=OPENING_DAYS,
            effective_date=start - timedelta(days=1),
            reason="Demo opening balance",
        )

    services.post_month_end_credits(today=today)
```

Run: `docker compose run --rm app pytest apps/balances/tests/test_seed.py -v`
Expected: PASS, 1 passed.

- [ ] **Step 3: Plug the seeder into `seed_demo`, before the requests**

Open `backend/apps/core/management/commands/seed_demo.py`. `SEEDERS` lists one entry per app, in the order they run. Add the balances seeder in the same form as its neighbours (a dotted module path, or the function), **between the entry of `organisation` and the entry of `requests`**:

```python
SEEDERS = [
    "apps.accounts.seed",
    "apps.organisation.seed",
    "apps.balances.seed",
    "apps.requests.seed",
]
```

The position matters: from this plan on the running application checks annual leave against the ledger, so demo requests submitted by the requests seeder need the demo balances to exist first. If the command calls a function of another name than `seed` in each module, add that name to `apps/balances/seed.py` as an alias (`run = seed`).

Run: `docker compose exec app python manage.py e2e_reset`
Expected: the command ends without error. Then:

Run: `docker compose exec app python manage.py shell -c "from apps.balances.models import LedgerEntry; print(LedgerEntry.objects.filter(kind='opening').count(), LedgerEntry.objects.filter(kind='credit').count() > 0)"`
Expected: `6 True` (the demo cast has seven employees, one of them without an opening balance).

- [ ] **Step 4: Regenerate the API description and the client types**

Run: `powershell -File scripts/dev.ps1 openapi`
Expected: `backend/openapi.yaml` and `frontend/src/api/schema.d.ts` are rewritten. Check the diff:

Run: `git diff --stat backend/openapi.yaml frontend/src/api/schema.d.ts`
Expected: both files changed. `backend/openapi.yaml` now holds the paths `/api/v1/balances/{employee_public_id}`, `/api/v1/balances/{employee_public_id}/ledger`, `/api/v1/balances/{employee_public_id}/adjustments` and the schemas `BalanceOut`, `BalanceEmployeeOut`, `BalanceAsOfOut`, `LedgerLineOut`, `PaginatedLedgerLineOutList`, `AdjustmentIn`.

- [ ] **Step 5: Run the whole backend suite and the linters**

Run: `docker compose run --rm app pytest -q`
Expected: PASS, no failure. The total is the baseline of "Before you start" plus the 188 tests of `apps/balances/tests`, plus the cases the matrix test generates for the three new routes.

Run: `docker compose run --rm app ruff check . && docker compose run --rm app ruff format --check .`
Expected: no finding. Fix what Ruff reports in `apps/balances` (line length in particular: wrap, do not shorten names) and run again.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/balances backend/apps/core/management/commands/seed_demo.py backend/openapi.yaml frontend/src/api/schema.d.ts
git commit -m "feat(balances): demo balances and regenerated API types"
```

### Task 13: Frontend data hooks, texts and the balance summary

**Files:**
- Create: `frontend/src/features/balances/api.ts`
- Create: `frontend/src/features/balances/format.ts`
- Create: `frontend/src/features/balances/testing.ts`
- Create: `frontend/src/features/balances/BalanceSummary.tsx`
- Create: `frontend/src/i18n/locales/fr/balances.json`, `frontend/src/i18n/locales/en/balances.json`
- Test: `frontend/src/features/balances/format.test.ts`, `frontend/src/features/balances/BalanceSummary.test.tsx`

**Interfaces:**
- Consumes (plan 01b, checked against its final text):
  - `api`, `call` from `@/api/client`; `components` from `@/api/schema`.
  - `Figure` from `@/components` with props `{ label: string; value: ReactNode; hint? }`.
  - `formatDays(value: number | string, lang: Lang): string` ("2,5 jours" / "2.5 days") and `formatDate(value, lang: Lang): string` from `@/lib/format`; `useLang(): Lang` from `@/i18n` gives the language to pass.
  - `renderApp(ui, { route, me })` from `@/test/render`; `makeMe({ roles, workspaces })` from `@/test/fixtures`. Tests run in French.
- Produces:
  - `features/balances/api.ts`: types `Balance`, `LedgerLine`, `LedgerPage`, `AdjustmentKind`, `AdjustmentInput`; `balanceKeys`; hooks `useBalance(employeeId: string | undefined)`, `useBalanceOn(employeeId: string, on: string | undefined)`, `useLedger(employeeId: string, page: number)`, `useAdjustBalance(employeeId: string)`.
  - `features/balances/format.ts`: `formatSigned(amount: string | number, lang: string): string`, `parseDays(text: string): number | null`.
  - `features/balances/testing.ts`: `EMPLOYEE_ID`, `makeBalance(overrides?)`, `makeLedgerLine(overrides?)`, `ledgerPage(lines)`.
  - `BalanceSummary({ balance: Balance; compact?: boolean })`.
  - The translation namespace `balances`.

- [ ] **Step 1: Write the texts**

Create `frontend/src/i18n/locales/fr/balances.json`:

```json
{
  "title": "Solde",
  "current": "Solde de congés annuels",
  "pending": "En attente de décision",
  "approvedUpcoming": "Approuvés à venir",
  "nextCredit": "Prochain crédit mensuel",
  "nextCreditValue": "{{amount}} le {{date}}",
  "onDate": {
    "title": "Solde à une date",
    "label": "Date",
    "posted": "Solde au {{date}} : {{balance}}",
    "projected": "Solde prévu au {{date}} : {{balance}}",
    "projectedHint": "Tient compte des crédits mensuels à venir, des congés approuvés et des demandes en attente de décision."
  },
  "ledger": {
    "title": "Historique",
    "date": "Date",
    "what": "Écriture",
    "amount": "Jours",
    "after": "Solde après",
    "why": "Demande ou motif",
    "request": "Voir la demande",
    "empty": "Aucune écriture pour l'instant.",
    "emptyHint": "Le premier crédit mensuel ou le solde d'ouverture apparaîtra ici."
  },
  "kind": {
    "opening": "Solde d'ouverture",
    "credit": "Crédit mensuel",
    "taken": "Congé pris",
    "restored": "Jours restitués",
    "adjustment": "Ajustement RH"
  },
  "adjust": {
    "titleAdjustment": "Ajuster le solde : {{name}}",
    "titleOpening": "Solde d'ouverture : {{name}}",
    "current": "Solde actuel : {{balance}}",
    "direction": "Action",
    "add": "Ajouter des jours",
    "remove": "Retirer des jours",
    "amount": "Nombre de jours",
    "openingAmount": "Solde d'ouverture (jours)",
    "openingHint": "Indiquez le solde à la veille du début des crédits mensuels.",
    "date": "Date d'effet",
    "reason": "Motif",
    "reasonHint": "Le motif est conservé dans l'historique et visible par l'employé.",
    "after": "Solde après : {{balance}}",
    "save": "Enregistrer",
    "cancel": "Annuler",
    "done": "Solde mis à jour.",
    "amountInvalid": "Saisissez un nombre de jours, par exemple 1,5.",
    "amountPositive": "Saisissez un nombre supérieur à zéro.",
    "dateRequired": "Choisissez la date d'effet.",
    "reasonRequired": "Indiquez le motif. Il est conservé dans l'historique."
  },
  "block": {
    "title": "Solde",
    "adjust": "Ajuster",
    "opening": "Saisir le solde d'ouverture"
  },
  "fact": {
    "label": "Solde annuel"
  }
}
```

Create `frontend/src/i18n/locales/en/balances.json`:

```json
{
  "title": "Balance",
  "current": "Annual leave balance",
  "pending": "Waiting for a decision",
  "approvedUpcoming": "Approved and upcoming",
  "nextCredit": "Next monthly credit",
  "nextCreditValue": "{{amount}} on {{date}}",
  "onDate": {
    "title": "Balance on a date",
    "label": "Date",
    "posted": "Balance on {{date}}: {{balance}}",
    "projected": "Expected balance on {{date}}: {{balance}}",
    "projectedHint": "Counts the monthly credits still to come, approved leave and requests waiting for a decision."
  },
  "ledger": {
    "title": "History",
    "date": "Date",
    "what": "Entry",
    "amount": "Days",
    "after": "Balance after",
    "why": "Request or reason",
    "request": "See the request",
    "empty": "No entry yet.",
    "emptyHint": "The first monthly credit or the opening balance will appear here."
  },
  "kind": {
    "opening": "Opening balance",
    "credit": "Monthly credit",
    "taken": "Leave taken",
    "restored": "Days restored",
    "adjustment": "Adjusted by HR"
  },
  "adjust": {
    "titleAdjustment": "Adjust the balance: {{name}}",
    "titleOpening": "Opening balance: {{name}}",
    "current": "Current balance: {{balance}}",
    "direction": "Action",
    "add": "Add days",
    "remove": "Remove days",
    "amount": "Number of days",
    "openingAmount": "Opening balance (days)",
    "openingHint": "State the balance as of the day before monthly credits start.",
    "date": "Effective date",
    "reason": "Reason",
    "reasonHint": "The reason is kept in the history and shown to the employee.",
    "after": "Balance after: {{balance}}",
    "save": "Save",
    "cancel": "Cancel",
    "done": "Balance updated.",
    "amountInvalid": "Enter a number of days, for example 1.5.",
    "amountPositive": "Enter a number greater than zero.",
    "dateRequired": "Choose the effective date.",
    "reasonRequired": "Give the reason. It is kept in the history."
  },
  "block": {
    "title": "Balance",
    "adjust": "Adjust",
    "opening": "Record the opening balance"
  },
  "fact": {
    "label": "Annual balance"
  }
}
```

Then make the namespace known. Open `frontend/src/i18n/index.ts`: if it lists namespaces or imports one JSON file per namespace, add `balances` exactly the way `employees` is added, for both languages; if it loads every file under `locales/` with `import.meta.glob`, there is nothing to add.

Run: `docker compose run --rm web npx vitest run src/i18n/parity.test.ts`
Expected: PASS. The French and English files of `balances` have the same keys.

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/features/balances/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatSigned, parseDays } from "./format";

describe("formatSigned", () => {
  it("writes the sign of a ledger line", () => {
    expect(formatSigned("2.50", "en")).toBe("+2.5");
    expect(formatSigned("-5.00", "en")).toBe("-5");
    expect(formatSigned(0, "en")).toBe("0");
  });

  it("uses the decimal comma in French", () => {
    expect(formatSigned("2.50", "fr")).toBe("+2,5");
    expect(formatSigned("-0.50", "fr")).toBe("-0,5");
  });
});

describe("parseDays", () => {
  it("accepts a comma or a dot as the decimal separator", () => {
    expect(parseDays("1,5")).toBe(1.5);
    expect(parseDays("1.5")).toBe(1.5);
    expect(parseDays(" 2 ")).toBe(2);
    expect(parseDays("-1")).toBe(-1);
  });

  it("refuses what is not a number", () => {
    expect(parseDays("")).toBeNull();
    expect(parseDays("   ")).toBeNull();
    expect(parseDays("abc")).toBeNull();
    expect(parseDays("1.2.3")).toBeNull();
    expect(parseDays("1,5 jours")).toBeNull();
  });
});
```

Create `frontend/src/features/balances/BalanceSummary.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";

import { BalanceSummary } from "./BalanceSummary";
import { makeBalance } from "./testing";

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });

describe("BalanceSummary", () => {
  it("shows the balance first, then what is held, what is upcoming and the next credit", () => {
    renderApp(<BalanceSummary balance={makeBalance()} />, { route: "/", me });

    const summary = screen.getByRole("region", { name: "Solde de congés annuels" });
    expect(within(summary).getByText(/12,5\s*jours/)).toBeInTheDocument();
    expect(within(summary).getByText("En attente de décision").nextElementSibling).toHaveTextContent(/3\s*jours/);
    expect(within(summary).getByText("Approuvés à venir").nextElementSibling).toHaveTextContent(/2\s*jours/);
    expect(within(summary).getByText("Prochain crédit mensuel").nextElementSibling).toHaveTextContent(
      /2,5\s*jours.*31.*2026/,
    );
  });

  it("leaves the next credit out when none is planned", () => {
    renderApp(
      <BalanceSummary balance={makeBalance({ next_credit_amount: null, next_credit_date: null })} />,
      { route: "/", me },
    );

    expect(screen.queryByText("Prochain crédit mensuel")).not.toBeInTheDocument();
  });

  it("shows a negative balance as it is", () => {
    renderApp(<BalanceSummary balance={makeBalance({ current: "-2.00" })} />, { route: "/", me });

    expect(screen.getByRole("region", { name: "Solde de congés annuels" })).toHaveTextContent(/[-−]2\s*jours/);
  });
});
```

Run: `docker compose run --rm web npx vitest run src/features/balances`
Expected: FAIL, `Failed to resolve import "./format"` and `"./BalanceSummary"`.

- [ ] **Step 3: Write the hooks**

Create `frontend/src/features/balances/api.ts`:

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, call } from "@/api/client";
import type { components } from "@/api/schema";

export type Balance = components["schemas"]["BalanceOut"];
export type LedgerLine = components["schemas"]["LedgerLineOut"];
export type LedgerPage = components["schemas"]["PaginatedLedgerLineOutList"];
export type AdjustmentKind = "opening" | "adjustment";
export type AdjustmentInput = Omit<components["schemas"]["AdjustmentIn"], "kind"> & { kind: AdjustmentKind };

export const balanceKeys = {
  all: ["balances"] as const,
  employee: (employeeId: string) => ["balances", employeeId] as const,
  figures: (employeeId: string) => ["balances", employeeId, "figures"] as const,
  on: (employeeId: string, on: string) => ["balances", employeeId, "on", on] as const,
  ledger: (employeeId: string, page: number) => ["balances", employeeId, "ledger", page] as const,
};

/** The figures of one employee. Disabled until the employee is known. */
export function useBalance(employeeId: string | undefined) {
  return useQuery({
    queryKey: balanceKeys.figures(employeeId ?? ""),
    enabled: Boolean(employeeId),
    queryFn: () =>
      call(
        api.GET("/api/v1/balances/{employee_public_id}", {
          params: { path: { employee_public_id: employeeId as string } },
        }),
      ),
  });
}

/** The same figures with the balance on a chosen date. Disabled until a date is chosen. */
export function useBalanceOn(employeeId: string, on: string | undefined) {
  return useQuery({
    queryKey: balanceKeys.on(employeeId, on ?? ""),
    enabled: Boolean(on),
    retry: false,
    queryFn: () =>
      call(
        api.GET("/api/v1/balances/{employee_public_id}", {
          params: { path: { employee_public_id: employeeId }, query: { on: on as string } },
        }),
      ),
  });
}

/** One page of the history, newest first. The previous page stays on screen while the next loads. */
export function useLedger(employeeId: string, page: number) {
  return useQuery({
    queryKey: balanceKeys.ledger(employeeId, page),
    placeholderData: keepPreviousData,
    queryFn: () =>
      call(
        api.GET("/api/v1/balances/{employee_public_id}/ledger", {
          params: { path: { employee_public_id: employeeId }, query: { page } },
        }),
      ),
  });
}

/** Posts an opening balance or an adjustment, then refreshes everything shown about this employee's balance. */
export function useAdjustBalance(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AdjustmentInput) =>
      call(
        api.POST("/api/v1/balances/{employee_public_id}/adjustments", {
          params: { path: { employee_public_id: employeeId } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: balanceKeys.employee(employeeId) }),
  });
}
```

- [ ] **Step 4: Write the formatters and the test fixtures**

Create `frontend/src/features/balances/format.ts`:

```ts
/** "+2.5", "-5" ("+2,5" in French): the signed amount of a ledger line, without its unit. */
export function formatSigned(amount: string | number, lang: string): string {
  return new Intl.NumberFormat(lang, { signDisplay: "exceptZero", maximumFractionDigits: 2 }).format(
    Number(amount),
  );
}

/** A number of days as a person types it: "1,5" and "1.5" both mean one and a half. Null when it is not a number. */
export function parseDays(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}
```

Create `frontend/src/features/balances/testing.ts`:

```ts
import type { Balance, LedgerLine, LedgerPage } from "./api";

export const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";

export function makeBalance(overrides: Partial<Balance> = {}): Balance {
  return {
    employee: { public_id: EMPLOYEE_ID, name: "Amel Trabelsi" },
    current: "12.50",
    pending: "3.00",
    approved_upcoming: "2.00",
    next_credit_amount: "2.50",
    next_credit_date: "2026-10-31",
    has_opening: true,
    as_of: null,
    ...overrides,
  };
}

export function makeLedgerLine(overrides: Partial<LedgerLine> = {}): LedgerLine {
  return {
    id: 1,
    kind: "credit",
    amount: "2.50",
    effective_date: "2026-09-30",
    period: "2026-09",
    reason: "",
    request_public_id: null,
    created_by: null,
    created_at: "2026-09-30T01:00:00+01:00",
    balance_after: "12.50",
    ...overrides,
  };
}

export function ledgerPage(lines: LedgerLine[], count = lines.length): LedgerPage {
  return { count, next: null, previous: null, results: lines };
}
```

- [ ] **Step 5: Write the summary**

Create `frontend/src/features/balances/BalanceSummary.tsx`:

```tsx
import { useTranslation } from "react-i18next";

import { Figure } from "@/components";
import { useLang } from "@/i18n";
import { formatDate, formatDays } from "@/lib/format";

import type { Balance } from "./api";

interface Props {
  balance: Balance;
  /** In a block of the employee record the balance is a line of text, not the page's one large figure. */
  compact?: boolean;
}

export function BalanceSummary({ balance, compact = false }: Props) {
  const { t } = useTranslation("balances");
  const lang = useLang();
  const current = formatDays(balance.current, lang);

  return (
    <section aria-label={t("current")} className="rounded-xl border bg-card px-6 py-5">
      {compact ? (
        <p className="text-section font-semibold" data-figure>
          {current}
        </p>
      ) : (
        <Figure value={current} label={t("current")} />
      )}
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-caption text-muted-foreground">{t("pending")}</dt>
          <dd className="text-body font-semibold">{formatDays(balance.pending, lang)}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">{t("approvedUpcoming")}</dt>
          <dd className="text-body font-semibold">{formatDays(balance.approved_upcoming, lang)}</dd>
        </div>
        {balance.next_credit_amount !== null && balance.next_credit_date !== null && (
          <div>
            <dt className="text-caption text-muted-foreground">{t("nextCredit")}</dt>
            <dd className="text-body font-semibold">
              {t("nextCreditValue", {
                amount: formatDays(balance.next_credit_amount, lang),
                date: formatDate(balance.next_credit_date, lang),
              })}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/balances`
Expected: PASS, 7 passed (4 in `format.test.ts`, 3 in `BalanceSummary.test.tsx`).

If an import of `@/components`, `@/lib/format`, `@/test/render` or `@/test/fixtures` does not resolve, or a prop is named differently, align this file with the name plan 01b gave it; the assumed names are listed in "Contract notes".

- [ ] **Step 7: Lint, type-check and commit**

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no error.

```bash
git add frontend/src/features/balances frontend/src/i18n
git commit -m "feat(balances): balance hooks, texts and summary"
```

### Task 14: My space, Balance

UI 5.6. Shown first: the current balance as the one large figure, the days held by pending requests, the days approved and upcoming, the next monthly credit. One step away, in two closed blocks: the balance on a date of the reader's choice, and the history entry by entry. The page has no action: an employee reads their balance here and asks for leave from Home or Requests.

**Files:**
- Create: `frontend/src/features/balances/LedgerTable.tsx`
- Create: `frontend/src/features/balances/BalanceOnDate.tsx`
- Create: `frontend/src/features/balances/BalancePage.tsx`
- Modify: `frontend/src/workspaces/me/routes.tsx` (append one route)
- Test: `frontend/src/features/balances/BalancePage.test.tsx`, `frontend/src/workspaces/me/routes.balance.test.ts`

**Interfaces:**
- Consumes (plan 01b, checked against its final text):
  - From `@/components`: `PageHeader({ title, primary?, back? })`; `Disclosure({ title: string; children })`, closed by default, whose toggle is a button named by `title` with `aria-expanded`; `DataTable<T>({ columns: { key: string; header: string; cell: (row: T) => ReactNode; align?: "start" | "end" }[]; rows: T[]; rowKey: (row: T) => string; onRowOpen?; empty: ReactNode; isLoading?: boolean })`; `Pager({ page: number; pageSize: number; total: number; onPage: (page: number) => void })`, which renders nothing when one page is enough; `EmptyState({ title: string; hint?: string })`; `NotAvailable`.
  - `useLang()` from `@/i18n`, which returns the `Lang` (`"fr" | "en"`) that `formatDays` and `formatDate` take.
  - `Input` from `@/components/ui/input`, `Label` from `@/components/ui/label` (shadcn).
  - `useMe()` from `@/features/auth/api`, a query whose `data` is `Me` (`me.employee?.public_id`).
  - `ProblemError` from `@/api/problem`; `server` from `@/test/server`.
  - `meRoutes: RouteObject[]` in `@/workspaces/me/routes`; the navigation entry "Balance" of My space points to `/me/balance` and appears once that route exists.
- Produces: `LedgerTable({ employeeId: string })`, `BalanceOnDate({ employeeId: string })`, the default export `BalancePage`, the route `/me/balance`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/balances/BalancePage.test.tsx`:

```tsx
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import type { Balance, LedgerLine } from "./api";
import BalancePage from "./BalancePage";
import { EMPLOYEE_ID, ledgerPage, makeBalance, makeLedgerLine } from "./testing";

const me = {
  ...makeMe({ roles: ["employee"], workspaces: ["me"] }),
  employee: { public_id: EMPLOYEE_ID, name: "Amel Trabelsi" },
};

const LINES: LedgerLine[] = [
  makeLedgerLine({ id: 3, kind: "adjustment", amount: "-1.00", effective_date: "2026-10-02", period: "", reason: "Un jour compté deux fois", created_by: "Sana Gharbi", balance_after: "12.50" }),
  makeLedgerLine({ id: 2, kind: "credit", amount: "2.50", effective_date: "2026-09-30", period: "2026-09", balance_after: "13.50" }),
  makeLedgerLine({ id: 1, kind: "taken", amount: "-2.00", effective_date: "2026-09-14", period: "", request_public_id: "req-1", balance_after: "11.00" }),
];

const TOO_FAR = {
  type: "urn:iris-hr:problem:balances.date_out_of_range",
  title: "Bad Request",
  status: 400,
  code: "balances.date_out_of_range",
  detail: "Choisissez une date dans les deux prochaines années.",
  errors: [
    { field: "on", code: "balances.date_out_of_range", detail: "Choisissez une date dans les deux prochaines années.", params: {} },
  ],
  request_id: "r-1",
};

function serve(balance: Balance = makeBalance(), lines: LedgerLine[] = LINES) {
  server.use(
    http.get(`/api/v1/balances/${EMPLOYEE_ID}`, ({ request }) => {
      const on = new URL(request.url).searchParams.get("on");
      if (on === "9999-12-31") {
        return HttpResponse.json(TOO_FAR, { status: 400, headers: { "Content-Type": "application/problem+json" } });
      }
      const asOf = on ? { date: on, balance: "17.50", projected: on > "2026-10-05" } : null;
      return HttpResponse.json({ ...balance, as_of: asOf });
    }),
    http.get(`/api/v1/balances/${EMPLOYEE_ID}/ledger`, () => HttpResponse.json(ledgerPage(lines))),
  );
}

function show() {
  renderApp(<BalancePage />, { route: "/me/balance", me });
  return userEvent.setup();
}

describe("My space, Balance", () => {
  it("shows the balance first and keeps the history one step away", async () => {
    serve();
    show();

    const summary = await screen.findByRole("region", { name: "Solde de congés annuels" });
    expect(within(summary).getByText(/12,5\s*jours/)).toBeInTheDocument();
    expect(within(summary).getByText("En attente de décision")).toBeInTheDocument();
    expect(within(summary).getByText("Approuvés à venir")).toBeInTheDocument();
    expect(within(summary).getByText("Prochain crédit mensuel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Solde" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Historique" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Solde à une date" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Ajuster" })).not.toBeInTheDocument();
  });

  it("opens the history entry by entry, with the balance after each line and what is behind it", async () => {
    serve();
    const user = show();

    await user.click(await screen.findByRole("button", { name: "Historique" }));

    // getAll: the shared table may render each line twice, as a row and as a phone card
    expect((await screen.findAllByText("Ajustement RH")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Crédit mensuel").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Congé pris").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+2,5").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^[-−]2$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/13,5\s*jours/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Un jour compté deux fois").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Voir la demande" })[0]).toHaveAttribute("href", "/requests/req-1");
  });

  it("gives the expected balance on a future date and says it is a projection", async () => {
    serve();
    const user = show();

    await user.click(await screen.findByRole("button", { name: "Solde à une date" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-31" } });

    expect(await screen.findByText(/Solde prévu au .+ : 17,5\s*jours/)).toBeInTheDocument();
    expect(screen.getByText(/Tient compte des crédits mensuels à venir/)).toBeInTheDocument();
  });

  it("gives the posted balance on a past date", async () => {
    serve();
    const user = show();

    await user.click(await screen.findByRole("button", { name: "Solde à une date" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-31" } });

    expect(await screen.findByText(/Solde au .+ : 17,5\s*jours/)).toBeInTheDocument();
    expect(screen.queryByText(/Tient compte des crédits mensuels à venir/)).not.toBeInTheDocument();
  });

  it("shows the server's message next to the date when it is too far ahead", async () => {
    serve();
    const user = show();

    await user.click(await screen.findByRole("button", { name: "Solde à une date" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "9999-12-31" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Choisissez une date dans les deux prochaines années.");
    expect(screen.getByLabelText("Date")).toHaveValue("9999-12-31");
  });

  it("shows a zero balance and an empty history for a new employee", async () => {
    serve(
      makeBalance({ current: "0.00", pending: "0.00", approved_upcoming: "0.00", next_credit_amount: null, next_credit_date: null, has_opening: false }),
      [],
    );
    const user = show();

    const summary = await screen.findByRole("region", { name: "Solde de congés annuels" });
    expect(summary).toHaveTextContent(/0\s*jours?/);
    expect(within(summary).queryByText("Prochain crédit mensuel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Historique" }));
    expect((await screen.findAllByText("Aucune écriture pour l'instant.")).length).toBeGreaterThan(0);
  });
});
```

Create `frontend/src/workspaces/me/routes.balance.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { meRoutes } from "./routes";

describe("My space routes", () => {
  it("serve the balance page at /me/balance", () => {
    expect(meRoutes.some((route) => route.path === "balance")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/balances/BalancePage.test.tsx src/workspaces/me/routes.balance.test.ts`
Expected: FAIL, `Failed to resolve import "./BalancePage"` and, in the route test, `expected false to be true`.

- [ ] **Step 3: Write the history table**

Create `frontend/src/features/balances/LedgerTable.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { DataTable, EmptyState, Pager } from "@/components";
import { useLang } from "@/i18n";
import { formatDate, formatDays } from "@/lib/format";

import { useLedger, type LedgerLine } from "./api";
import { formatSigned } from "./format";

const PAGE_SIZE = 25;

const KIND_KEYS: Record<string, string> = {
  opening: "kind.opening",
  credit: "kind.credit",
  taken: "kind.taken",
  restored: "kind.restored",
  adjustment: "kind.adjustment",
};

function Behind({ line, label }: { line: LedgerLine; label: string }) {
  return (
    <span className="flex flex-col gap-1">
      {line.request_public_id && (
        <Link className="text-primary underline-offset-4 hover:underline" to={`/requests/${line.request_public_id}`}>
          {label}
        </Link>
      )}
      {line.reason && <span>{line.reason}</span>}
    </span>
  );
}

/** The history of one employee's balance, newest first: five attributes per line. */
export function LedgerTable({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation("balances");
  const lang = useLang();
  const [page, setPage] = useState(1);
  const ledger = useLedger(employeeId, page);

  // Plan 01b's DataTable identifies a column by `key`.
  const columns = [
    { key: "date", header: t("ledger.date"), cell: (line: LedgerLine) => formatDate(line.effective_date, lang) },
    { key: "what", header: t("ledger.what"), cell: (line: LedgerLine) => t(KIND_KEYS[line.kind] ?? "kind.adjustment") },
    {
      key: "amount",
      header: t("ledger.amount"),
      align: "end" as const,
      cell: (line: LedgerLine) => formatSigned(line.amount, lang),
    },
    {
      key: "after",
      header: t("ledger.after"),
      align: "end" as const,
      cell: (line: LedgerLine) => formatDays(line.balance_after, lang),
    },
    {
      key: "why",
      header: t("ledger.why"),
      cell: (line: LedgerLine) => <Behind line={line} label={t("ledger.request")} />,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={columns}
        rows={ledger.data?.results ?? []}
        rowKey={(line: LedgerLine) => String(line.id)}
        empty={<EmptyState title={t("ledger.empty")} hint={t("ledger.emptyHint")} />}
        isLoading={ledger.isLoading}
      />
      {/* Plan 01b's Pager renders nothing when one page is enough. */}
      <Pager page={page} pageSize={PAGE_SIZE} total={ledger.data?.count ?? 0} onPage={setPage} />
    </div>
  );
}
```

- [ ] **Step 4: Write the balance on a date**

Create `frontend/src/features/balances/BalanceOnDate.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ProblemError } from "@/api/problem";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLang } from "@/i18n";
import { formatDate, formatDays } from "@/lib/format";

import { useBalanceOn } from "./api";

/** The balance on a date of the reader's choice: posted for the past, expected for the future. */
export function BalanceOnDate({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation("balances");
  const lang = useLang();
  const [on, setOn] = useState("");
  const result = useBalanceOn(employeeId, on || undefined);
  const asOf = on ? (result.data?.as_of ?? null) : null;
  const problem = on && result.error instanceof ProblemError ? result.error : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor="balance-on-date">{t("onDate.label")}</Label>
        <Input
          id="balance-on-date"
          type="date"
          value={on}
          onChange={(event) => setOn(event.target.value)}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? "balance-on-date-error" : undefined}
        />
        {problem && (
          <p id="balance-on-date-error" role="alert" className="text-caption text-destructive">
            {problem.detail}
          </p>
        )}
      </div>
      <div aria-live="polite">
        {asOf && (
          <>
            <p className="text-body font-semibold">
              {t(asOf.projected ? "onDate.projected" : "onDate.posted", {
                date: formatDate(asOf.date, lang),
                balance: formatDays(asOf.balance, lang),
              })}
            </p>
            {asOf.projected && <p className="text-caption text-muted-foreground">{t("onDate.projectedHint")}</p>}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the page**

Create `frontend/src/features/balances/BalancePage.tsx`:

```tsx
import { useTranslation } from "react-i18next";

import { Disclosure, NotAvailable, PageHeader } from "@/components";
import { useMe } from "@/features/auth/api";

import { useBalance } from "./api";
import { BalanceOnDate } from "./BalanceOnDate";
import { BalanceSummary } from "./BalanceSummary";
import { LedgerTable } from "./LedgerTable";

/** My space, Balance (UI 5.6): the figure first, the date question and the history one step away. */
export default function BalancePage() {
  const { t } = useTranslation("balances");
  const { data: me } = useMe();
  const employeeId = me?.employee?.public_id;
  const balance = useBalance(employeeId);

  if (me && !employeeId) return <NotAvailable />;
  if (balance.isError) throw balance.error;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} />
      {employeeId && balance.data && (
        <>
          <BalanceSummary balance={balance.data} />
          <Disclosure title={t("onDate.title")}>
            <BalanceOnDate employeeId={employeeId} />
          </Disclosure>
          <Disclosure title={t("ledger.title")}>
            <LedgerTable employeeId={employeeId} />
          </Disclosure>
        </>
      )}
    </div>
  );
}
```

An error of the balance query is thrown to the shell's error boundary (`ProblemBoundary`, plan 01b), which shows "Something went wrong" with the request reference.

- [ ] **Step 6: Register the route**

In `frontend/src/workspaces/me/routes.tsx`, add the import next to the other page imports:

```tsx
import BalancePage from "@/features/balances/BalancePage";
```

and append one element to the end of the `meRoutes` array:

```tsx
  { path: "balance", element: <BalancePage /> },
```

The "Balance" entry of My space's navigation appears by itself: plan 01b renders a navigation entry as soon as its path, `/me/balance`, is a registered route.

- [ ] **Step 7: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/balances src/workspaces/me/routes.balance.test.ts`
Expected: PASS, 14 passed (7 from Task 13, 6 in `BalancePage.test.tsx`, 1 in the route test).

- [ ] **Step 8: Look at the page**

Run: `docker compose up -d` and open `http://localhost:5173/me/balance` signed in as `employee.a1@impactrisks.com` (password `Correct-Horse-42!`).
Expected: "Balance" (or "Solde") is in the navigation of My space; the page shows one large figure, three small ones below it, and two closed blocks. Narrow the window to a phone width: the three small figures stack, the history becomes a list of cards, nothing scrolls sideways. Tab through the page: the two blocks open with Enter or Space.

- [ ] **Step 9: Lint, type-check and commit**

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no error.

```bash
git add frontend/src/features/balances frontend/src/workspaces/me
git commit -m "feat(balances): My space balance page with history and balance on a date"
```

### Task 15: The adjustment and opening-balance sheet

UI 7.9, "Adjust a balance": current balance; days to add or remove; effective date; mandatory reason; resulting balance. "The same form records the opening balance at go-live." It is a focused task, so it opens in the right sheet. The Save button is never disabled: saving without a reason shows the message next to the field and sends nothing.

**Files:**
- Create: `frontend/src/features/balances/AdjustBalanceSheet.tsx`
- Test: `frontend/src/features/balances/AdjustBalanceSheet.test.tsx`

**Interfaces:**
- Consumes (plan 01b, as assumed; see "Contract notes"):
  - From `@/components`: `TaskSheet({ open, onOpenChange, title, children, footer })`, rendered as a dialog named by `title`; `TextField`, `DateField`, `TextAreaField` with props `{ control, name, label, hint? }`, each rendering a control labelled by `label` and its error below; `FormSummary({ problems })`; `useProblemForm(form)` returning `{ onError(problem: ProblemError): void; summary }`; `toast(message: string)`.
  - `Button` from `@/components/ui/button` (shadcn; variants `default` and `secondary`).
  - `useBalance`, `useAdjustBalance`, `AdjustmentKind` (Task 13); `parseDays` (Task 13).
- Produces: `AdjustBalanceSheet({ employeeId: string; kind: AdjustmentKind; open: boolean; onOpenChange: (open: boolean) => void })` and `signedAmount(kind, direction, amount): number | null`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/balances/AdjustBalanceSheet.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { AdjustBalanceSheet } from "./AdjustBalanceSheet";
import type { AdjustmentKind, Balance } from "./api";
import { EMPLOYEE_ID, makeBalance, makeLedgerLine } from "./testing";

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

function problem(status: number, code: string, field: string | null, detail: string) {
  return HttpResponse.json(
    {
      type: `urn:iris-hr:problem:${code}`,
      title: "Refused",
      status,
      code,
      detail,
      errors: [{ field, code, detail, params: {} }],
      request_id: "r-1",
    },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

function setup({
  kind = "adjustment",
  balance = makeBalance(),
  refuse,
}: { kind?: AdjustmentKind; balance?: Balance; refuse?: () => Response } = {}) {
  const posted: Record<string, unknown>[] = [];
  let reads = 0;
  const onOpenChange = vi.fn();
  server.use(
    http.get(`/api/v1/balances/${EMPLOYEE_ID}`, () => {
      reads += 1;
      return HttpResponse.json(balance);
    }),
    http.post(`/api/v1/balances/${EMPLOYEE_ID}/adjustments`, async ({ request }) => {
      posted.push((await request.json()) as Record<string, unknown>);
      return refuse ? refuse() : HttpResponse.json(makeLedgerLine({ kind }), { status: 201 });
    }),
  );
  renderApp(<AdjustBalanceSheet employeeId={EMPLOYEE_ID} kind={kind} open onOpenChange={onOpenChange} />, {
    route: "/",
    me,
  });
  return { user: userEvent.setup(), posted, onOpenChange, reads: () => reads };
}

const days = () => screen.getByLabelText(/Nombre de jours/);
const reason = () => screen.getByLabelText(/Motif/);
const save = () => screen.getByRole("button", { name: "Enregistrer" });

describe("AdjustBalanceSheet", () => {
  it("shows the current balance and the balance after as the days are typed", async () => {
    const { user } = setup();

    expect(await screen.findByRole("dialog", { name: "Ajuster le solde : Amel Trabelsi" })).toBeInTheDocument();
    expect(screen.getByText(/Solde actuel : 12,5\s*jours/)).toBeInTheDocument();

    await user.type(days(), "1,5");

    expect(screen.getByText(/Solde après : 14\s*jours/)).toBeInTheDocument();
  });

  it("accepts a comma as the decimal separator", async () => {
    const { user, posted, onOpenChange } = setup();
    await screen.findByText(/Solde actuel/);

    await user.type(days(), "1,5");
    await user.type(reason(), "Deux demi-journées comptées deux fois");
    await user.click(save());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(posted).toEqual([
      {
        kind: "adjustment",
        amount: "1.5",
        effective_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        reason: "Deux demi-journées comptées deux fois",
      },
    ]);
  });

  it("removes days when asked to", async () => {
    const { user, posted } = setup();
    await screen.findByText(/Solde actuel/);

    await user.click(screen.getByRole("radio", { name: "Retirer des jours" }));
    await user.type(days(), "2");
    expect(screen.getByText(/Solde après : 10,5\s*jours/)).toBeInTheDocument();
    await user.type(reason(), "Congé de septembre jamais saisi");
    await user.click(save());

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].amount).toBe("-2");
  });

  it("shows a negative resulting balance", async () => {
    const { user } = setup({ balance: makeBalance({ current: "1.00" }) });
    await screen.findByText(/Solde actuel/);

    await user.click(screen.getByRole("radio", { name: "Retirer des jours" }));
    await user.type(days(), "3");

    expect(screen.getByText(/Solde après : [-−]2\s*jours/)).toBeInTheDocument();
  });

  it("does not send without a reason", async () => {
    const { user, posted, onOpenChange } = setup();
    await screen.findByText(/Solde actuel/);

    await user.type(days(), "1");
    await user.click(save());
    expect(await screen.findByText("Indiquez le motif. Il est conservé dans l'historique.")).toBeInTheDocument();

    await user.type(reason(), "   ");
    await user.click(save());

    expect(await screen.findByText("Indiquez le motif. Il est conservé dans l'historique.")).toBeInTheDocument();
    expect(posted).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(days()).toHaveValue("1");
  });

  it("does not send an adjustment of zero or of text", async () => {
    const { user, posted } = setup();
    await screen.findByText(/Solde actuel/);
    await user.type(reason(), "Correction");

    await user.type(days(), "0");
    await user.click(save());
    expect(await screen.findByText("Saisissez un nombre supérieur à zéro.")).toBeInTheDocument();

    await user.clear(days());
    await user.type(days(), "deux");
    await user.click(save());
    expect(await screen.findByText("Saisissez un nombre de jours, par exemple 1,5.")).toBeInTheDocument();

    expect(posted).toHaveLength(0);
  });

  it("sends once when Save is clicked twice", async () => {
    const { user, posted, onOpenChange } = setup();
    await screen.findByText(/Solde actuel/);

    await user.type(days(), "1");
    await user.type(reason(), "Correction");
    await user.dblClick(save());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(posted).toHaveLength(1);
  });

  it("puts a server refusal next to its field and keeps what was typed", async () => {
    const { user, onOpenChange } = setup({
      refuse: () => problem(400, "max_decimal_places", "amount", "Pas plus de deux décimales."),
    });
    await screen.findByText(/Solde actuel/);

    await user.type(days(), "1.234");
    await user.type(reason(), "Correction");
    await user.click(save());

    expect(await screen.findByText("Pas plus de deux décimales.")).toBeInTheDocument();
    expect(days()).toHaveValue("1.234");
    expect(reason()).toHaveValue("Correction");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("records an opening balance, zero included", async () => {
    const { user, posted } = setup({ kind: "opening", balance: makeBalance({ has_opening: false }) });

    expect(await screen.findByRole("dialog", { name: "Solde d'ouverture : Amel Trabelsi" })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Solde d'ouverture \(jours\)/), "0");
    await user.type(reason(), "Aucun reliquat en 2025");
    await user.click(save());

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ kind: "opening", amount: "0", reason: "Aucun reliquat en 2025" });
  });

  it("says when the opening balance already exists", async () => {
    const message = "Cet employé a déjà un solde d'ouverture. Passez un ajustement pour le corriger.";
    const { user, onOpenChange } = setup({
      kind: "opening",
      refuse: () => problem(409, "balances.opening_exists", null, message),
    });
    await screen.findByText(/Solde actuel/);

    await user.type(screen.getByLabelText(/Solde d'ouverture \(jours\)/), "12");
    await user.type(reason(), "Reliquat 2025");
    await user.click(save());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("refreshes the balance after saving", async () => {
    const { user, reads, onOpenChange } = setup();
    await screen.findByText(/Solde actuel/);
    const before = reads();

    await user.type(days(), "1");
    await user.type(reason(), "Correction");
    await user.click(save());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/balances/AdjustBalanceSheet.test.tsx`
Expected: FAIL, `Failed to resolve import "./AdjustBalanceSheet"`.

- [ ] **Step 3: Write the sheet**

Create `frontend/src/features/balances/AdjustBalanceSheet.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import type { ProblemError } from "@/api/problem";
import { DateField, FormSummary, TaskSheet, TextAreaField, TextField, toast, useProblemForm } from "@/components";
import { Button } from "@/components/ui/button";
import { useLang } from "@/i18n";
import { formatDays } from "@/lib/format";

import { useAdjustBalance, useBalance, type AdjustmentKind } from "./api";
import { parseDays } from "./format";

interface Props {
  employeeId: string;
  kind: AdjustmentKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormValues {
  direction: "add" | "remove";
  amount: string;
  effective_date: string;
  reason: string;
}

const FORM_ID = "adjust-balance-form";

function todayInTunis(): string {
  // "en-CA" writes a date as YYYY-MM-DD, the value a date input expects
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" });
}

/** The signed number of days the form stands for, or null while the amount is not a number. */
export function signedAmount(kind: AdjustmentKind, direction: FormValues["direction"], amount: string): number | null {
  const days = parseDays(amount);
  if (days === null) return null;
  return kind === "adjustment" && direction === "remove" ? -days : days;
}

/** HR adds or removes days, or records the opening balance (UI 7.9). */
export function AdjustBalanceSheet({ employeeId, kind, open, onOpenChange }: Props) {
  const { t } = useTranslation("balances");
  const lang = useLang();
  const balance = useBalance(employeeId);
  const adjust = useAdjustBalance(employeeId);
  const sending = useRef(false);

  const schema = useMemo(
    () =>
      z.object({
        direction: z.enum(["add", "remove"]),
        amount: z
          .string()
          .refine((value) => parseDays(value) !== null, t("adjust.amountInvalid"))
          .refine((value) => kind === "opening" || (parseDays(value) ?? 1) > 0, t("adjust.amountPositive")),
        effective_date: z.string().min(1, t("adjust.dateRequired")),
        reason: z.string().refine((value) => value.trim().length > 0, t("adjust.reasonRequired")),
      }),
    [kind, t],
  );
  const defaults: FormValues = { direction: "add", amount: "", effective_date: todayInTunis(), reason: "" };
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { onError, summary } = useProblemForm(form);

  const [direction, amount] = form.watch(["direction", "amount"]);
  const signed = signedAmount(kind, direction, amount);
  const current = balance.data ? Number(balance.data.current) : null;
  const after = current !== null && signed !== null ? current + signed : null;

  const submit = form.handleSubmit((values) => {
    const days = signedAmount(kind, values.direction, values.amount);
    if (days === null || sending.current) return;
    sending.current = true;
    adjust.mutate(
      { kind, amount: String(days), effective_date: values.effective_date, reason: values.reason.trim() },
      {
        onSuccess: () => {
          toast(t("adjust.done"));
          form.reset(defaults);
          onOpenChange(false);
        },
        onError: (error) => onError(error as ProblemError),
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  });

  return (
    <TaskSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t(kind === "opening" ? "adjust.titleOpening" : "adjust.titleAdjustment", {
        name: balance.data?.employee.name ?? "",
      })}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("adjust.cancel")}
          </Button>
          <Button type="submit" form={FORM_ID}>
            {t("adjust.save")}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <FormSummary problems={summary} />
        {current !== null && <p className="text-body">{t("adjust.current", { balance: formatDays(current, lang) })}</p>}
        {kind === "adjustment" && (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-body font-medium">{t("adjust.direction")}</legend>
            <label className="flex min-h-11 items-center gap-3 text-body">
              <input type="radio" value="add" className="size-4 accent-primary" {...form.register("direction")} />
              {t("adjust.add")}
            </label>
            <label className="flex min-h-11 items-center gap-3 text-body">
              <input type="radio" value="remove" className="size-4 accent-primary" {...form.register("direction")} />
              {t("adjust.remove")}
            </label>
          </fieldset>
        )}
        <TextField
          control={form.control}
          name="amount"
          label={t(kind === "opening" ? "adjust.openingAmount" : "adjust.amount")}
          hint={kind === "opening" ? t("adjust.openingHint") : undefined}
        />
        <DateField control={form.control} name="effective_date" label={t("adjust.date")} />
        <TextAreaField control={form.control} name="reason" label={t("adjust.reason")} hint={t("adjust.reasonHint")} />
        <p aria-live="polite" className="text-body font-semibold">
          {after !== null && t("adjust.after", { balance: formatDays(after, lang) })}
        </p>
      </form>
    </TaskSheet>
  );
}
```

The `sending` ref, not `adjust.isPending`, guards against a double click: two clicks can both run before React re-renders with the pending state.

- [ ] **Step 4: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/balances/AdjustBalanceSheet.test.tsx`
Expected: PASS, 11 passed.

- [ ] **Step 5: Lint, type-check and commit**

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no error.

```bash
git add frontend/src/features/balances
git commit -m "feat(balances): adjustment and opening-balance sheet"
```

### Task 16: The Balance block and fact of the employee record, and the settings labels

UI 7.9 puts on the employee record, shown first, the "current annual balance", and one step away a Balance block: "History, entry by entry" with the HR action "Adjust". UI 6.3 gives a manager "their balance and its history" for a person of the team, and UI 8.2 gives an executive the same record read-only. Plan 02 renders the record from two lists, `RECORD_BLOCKS` and `RECORD_FACTS`; this task appends one element to each.

**Files:**
- Create: `frontend/src/features/balances/BalanceBlock.tsx`
- Create: `frontend/src/features/balances/BalanceFact.tsx`
- Modify: `frontend/src/features/employees/recordBlocks.tsx` (append one block and one fact)
- Modify: `frontend/src/test/handlers.ts` (one default answer appended)
- Modify: `frontend/src/i18n/locales/fr/settings.json`, `frontend/src/i18n/locales/en/settings.json` (two key groups each)
- Test: `frontend/src/features/balances/BalanceBlock.test.tsx`, `frontend/src/features/balances/recordBlocks.test.tsx`, `frontend/src/features/balances/settingsLabels.test.ts`

**Interfaces:**
- Consumes (plan 02, master 9.3): `RECORD_BLOCKS: RecordBlock[]` with elements `{ id, titleKey, order, modes: RecordMode[], render(employee, mode) }`; `RECORD_FACTS: RecordFact[]` with elements `{ id, labelKey, order, modes: RecordMode[], render(employee) }`; `RecordMode = "hr" | "team" | "overview"`; `employee.public_id`.
- Consumes (plan 01b): `SettingsGroupPage` reads the label and the hint of a setting from `settings.json` under `<key>.label` and `<key>.hint`.
- Produces: `BalanceBlock({ employeeId: string; mode: RecordMode })`, `BalanceFact({ employeeId: string })`, the block and the fact with id `balance`, and the labels of `monthly_credit_days` and `credit_start_date`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/balances/BalanceBlock.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import type { Balance } from "./api";
import { BalanceBlock } from "./BalanceBlock";
import { EMPLOYEE_ID, ledgerPage, makeBalance, makeLedgerLine } from "./testing";

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

function serve(balance: Balance) {
  server.use(
    http.get(`/api/v1/balances/${EMPLOYEE_ID}`, () => HttpResponse.json(balance)),
    http.get(`/api/v1/balances/${EMPLOYEE_ID}/ledger`, () => HttpResponse.json(ledgerPage([makeLedgerLine()]))),
  );
}

function show(mode: "hr" | "team" | "overview") {
  renderApp(<BalanceBlock employeeId={EMPLOYEE_ID} mode={mode} />, { route: "/", me });
  return userEvent.setup();
}

describe("BalanceBlock", () => {
  it("lets HR adjust, and record the opening balance while there is none", async () => {
    serve(makeBalance({ has_opening: false }));
    const user = show("hr");

    expect(await screen.findByRole("button", { name: "Ajuster" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Saisir le solde d'ouverture" }));

    expect(await screen.findByRole("dialog", { name: "Solde d'ouverture : Amel Trabelsi" })).toBeInTheDocument();
  });

  it("offers only the adjustment once the opening balance exists", async () => {
    serve(makeBalance({ has_opening: true }));
    const user = show("hr");

    await user.click(await screen.findByRole("button", { name: "Ajuster" }));

    expect(await screen.findByRole("dialog", { name: "Ajuster le solde : Amel Trabelsi" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Saisir le solde d'ouverture" })).not.toBeInTheDocument();
  });

  it("closes the sheet when it asks to", async () => {
    serve(makeBalance());
    const user = show("hr");

    await user.click(await screen.findByRole("button", { name: "Ajuster" }));
    await user.click(await screen.findByRole("button", { name: "Annuler" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it.each(["team", "overview"] as const)("shows the figures and the history without any action in %s mode", async (mode) => {
    serve(makeBalance({ has_opening: false }));
    show(mode);

    expect(await screen.findByRole("region", { name: "Solde de congés annuels" })).toHaveTextContent(/12,5\s*jours/);
    expect((await screen.findAllByText("Crédit mensuel")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Ajuster" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Saisir le solde d'ouverture" })).not.toBeInTheDocument();
  });
});
```

Create `frontend/src/features/balances/recordBlocks.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { RECORD_BLOCKS, RECORD_FACTS } from "@/features/employees/recordBlocks";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

import { EMPLOYEE_ID, makeBalance } from "./testing";

describe("the employee record", () => {
  it("has a Balance block for HR, managers and executives", () => {
    const block = RECORD_BLOCKS.find((candidate) => candidate.id === "balance");

    expect(block?.titleKey).toBe("balances:block.title");
    expect(block?.modes).toEqual(["hr", "team", "overview"]);
  });

  it("shows the current annual balance among the facts shown first", async () => {
    server.use(http.get(`/api/v1/balances/${EMPLOYEE_ID}`, () => HttpResponse.json(makeBalance())));
    const fact = RECORD_FACTS.find((candidate) => candidate.id === "balance");

    expect(fact?.labelKey).toBe("balances:fact.label");
    expect(fact?.modes).toEqual(["hr", "team", "overview"]);
    renderApp(<p>{fact?.render({ public_id: EMPLOYEE_ID } as never)}</p>, {
      route: "/",
      me: makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] }),
    });

    expect(await screen.findByText(/12,5\s*jours/)).toBeInTheDocument();
  });
});
```

Create `frontend/src/features/balances/settingsLabels.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import en from "@/i18n/locales/en/settings.json";
import fr from "@/i18n/locales/fr/settings.json";

type Labels = Record<string, { label?: string; hint?: string } | undefined>;

describe("HR parameters", () => {
  it.each(["monthly_credit_days", "credit_start_date"])("label the setting %s in both languages", (key) => {
    for (const texts of [fr as Labels, en as Labels]) {
      expect(texts[key]?.label).toBeTruthy();
      expect(texts[key]?.hint).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/balances/BalanceBlock.test.tsx src/features/balances/recordBlocks.test.tsx src/features/balances/settingsLabels.test.ts`
Expected: FAIL: `Failed to resolve import "./BalanceBlock"`; in `recordBlocks.test.tsx`, `expected undefined to be 'balances:block.title'`; in `settingsLabels.test.ts`, `expected undefined to be truthy`.

- [ ] **Step 3: Write the block and the fact**

Create `frontend/src/features/balances/BalanceBlock.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { RecordMode } from "@/features/employees/recordBlocks";

import { AdjustBalanceSheet } from "./AdjustBalanceSheet";
import { useBalance, type AdjustmentKind } from "./api";
import { BalanceSummary } from "./BalanceSummary";
import { LedgerTable } from "./LedgerTable";

/** The Balance block of an employee record: figures, history and, for HR only, the two actions. */
export function BalanceBlock({ employeeId, mode }: { employeeId: string; mode: RecordMode }) {
  const { t } = useTranslation("balances");
  const balance = useBalance(employeeId);
  const [sheet, setSheet] = useState<AdjustmentKind | null>(null);

  if (balance.isError) throw balance.error;
  if (!balance.data) return null;

  return (
    <div className="flex flex-col gap-4">
      <BalanceSummary balance={balance.data} compact />
      {mode === "hr" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setSheet("adjustment")}>
            {t("block.adjust")}
          </Button>
          {!balance.data.has_opening && (
            <Button type="button" variant="secondary" onClick={() => setSheet("opening")}>
              {t("block.opening")}
            </Button>
          )}
        </div>
      )}
      <LedgerTable employeeId={employeeId} />
      {sheet && (
        <AdjustBalanceSheet
          employeeId={employeeId}
          kind={sheet}
          open
          onOpenChange={(open) => {
            if (!open) setSheet(null);
          }}
        />
      )}
    </div>
  );
}
```

Both actions are secondary buttons: the page's one primary action stays "Edit" (UI 7.9). In `team` and `overview` mode no action is rendered at all, so nothing appears disabled.

Create `frontend/src/features/balances/BalanceFact.tsx`:

```tsx
import { useLang } from "@/i18n";
import { formatDays } from "@/lib/format";

import { useBalance } from "./api";

/** The current annual balance, for the line of facts shown first on an employee record. */
export function BalanceFact({ employeeId }: { employeeId: string }) {
  const lang = useLang();
  const balance = useBalance(employeeId);

  return <>{balance.data ? formatDays(balance.data.current, lang) : "…"}</>;
}
```

The fact and the block ask for the same query key, so an employee record makes one balance request.

- [ ] **Step 4: Append the block and the fact to the record**

Plan 02 extends its two lists with a `push` at the end of the file, and its orders leave 50 free for the Balance block (between Requests, 40, and Change proposals, 60) and 65 free for the balance fact. In `frontend/src/features/employees/recordBlocks.tsx`, add the imports with the other imports:

```tsx
import { BalanceBlock } from "@/features/balances/BalanceBlock";
import { BalanceFact } from "@/features/balances/BalanceFact";
```

and add the two registrations as the last statements of the file:

```tsx
RECORD_BLOCKS.push({
  id: "balance",
  titleKey: "balances:block.title",
  order: 50,
  modes: ["hr", "team", "overview"],
  render: (employee, mode) => <BalanceBlock employeeId={employee.public_id} mode={mode} />,
});

RECORD_FACTS.push({
  id: "balance",
  labelKey: "balances:fact.label",
  order: 65,
  modes: ["hr", "team", "overview"],
  render: (employee) => <BalanceFact employeeId={employee.public_id} />,
});
```

UI 7.9 orders the blocks: Personal details, Team, Documents, Requests, Balance, Change proposals, History.

The fact is part of what a record shows first, so from now on every test that renders an employee record asks for a balance, and the test server refuses a request nobody answers. Give it a default answer, as plan 02 did for its own route. In `frontend/src/test/handlers.ts`, add the import:

```ts
import { makeBalance } from "@/features/balances/testing";
```

and append this element to the `handlers` array:

```ts
  http.get("/api/v1/balances/:employeeId", () => HttpResponse.json(makeBalance())),
```

A test that needs particular figures still declares its own answer with `server.use`, which takes precedence. The block itself asks for nothing until it is opened, because plan 01b's `Disclosure` mounts its children only while open.

- [ ] **Step 5: Add the settings labels**

In `frontend/src/i18n/locales/fr/settings.json`, add these two entries to the top-level object:

```json
  "monthly_credit_days": {
    "label": "Crédit mensuel de congés (jours)",
    "hint": "Crédité à chaque employé le dernier jour du mois, au prorata le mois d'arrivée et de départ."
  },
  "credit_start_date": {
    "label": "Début des crédits mensuels",
    "hint": "Aucun crédit n'est passé pour un mois qui se termine avant cette date, et aucun tant qu'elle est vide. Choisissez le premier jour d'un mois ; les soldes d'ouverture sont saisis à la veille de cette date."
  }
```

In `frontend/src/i18n/locales/en/settings.json`, add:

```json
  "monthly_credit_days": {
    "label": "Monthly leave credit (days)",
    "hint": "Credited to every employee on the last day of the month, pro-rated in the month of joining and of leaving."
  },
  "credit_start_date": {
    "label": "Start of monthly credits",
    "hint": "No credit is posted for a month that ends before this date, and none while it is empty. Choose the first day of a month; opening balances are stated as of the day before."
  }
```

Keep each file valid JSON: put a comma after the entry that used to be the last one.

- [ ] **Step 6: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/balances src/i18n/parity.test.ts`
Expected: PASS. `BalanceBlock.test.tsx` contributes 5 passed, `recordBlocks.test.tsx` 2, `settingsLabels.test.ts` 2.

- [ ] **Step 7: Look at the pages**

With `docker compose up -d` running and the demo data seeded:

1. Sign in as `hr@impactrisks.com`, open HR desk, Employees, then any employee. Expected: the annual balance is among the facts shown first; the Balance block shows the figures, "Adjust" and the history; "Record the opening balance" appears only for `employee.b1`.
2. Open HR desk, Settings, Parameters. Expected: "Monthly leave credit (days)" and "Start of monthly credits" are listed with their hints and can be changed.
3. Sign in as `manager.a@impactrisks.com`, open My team, People, then a person. Expected: the Balance block shows figures and history and no button.
4. Sign in as `ceo@impactrisks.com`, open Overview, People, then a person. Expected: the same, without any button.

- [ ] **Step 8: Lint, type-check and commit**

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck`
Expected: no error.

```bash
git add frontend/src/features/balances frontend/src/features/employees/recordBlocks.tsx frontend/src/test/handlers.ts frontend/src/i18n
git commit -m "feat(balances): balance block and fact on the employee record, settings labels"
```

### Task 17: Balance figures in the request views, and the browser journey

Plan 03b already renders the balance figures of the request form (UI 5.3) and of the decision views (UI 6.2, 7.8) whenever the API returns them, and Task 10 proved that the API now returns them. This task proves the last link once in a component test, then runs the journey in a real browser.

**Files:**
- Test: `frontend/src/features/balances/requestViews.test.tsx`
- Create: `frontend/e2e/balance.spec.ts`

**Interfaces:**
- Consumes (plan 03b, as assumed; see "Contract notes"): the default export `RequestPage` of `@/features/requests/RequestPage`, the page behind `/requests/:id`, rendered in tests as in master 8.4 (`renderApp(<RequestPage />, { route: "/requests/abc", me })`); it shows `decision_context.balance.now` and `.after` with `formatDays`.
- Consumes the API of master 7.2, 7.7, 7.9 and 7.10 from the browser test: `auth/csrf`, `auth/login`, `auth/me`, `employees`, `requests`, `requests/{public_id}/submit`, `approvals`, `steps/{id}/decide`, `balances/{employee_public_id}`.
- Consumes the demo accounts of master 6.11 and the Playwright set-up of plan 01b (`e2e/global-setup.ts` runs `e2e_reset`; a desktop and a phone project; `baseURL` `http://localhost:5173`).
- Produces: nothing new.

- [ ] **Step 1: Write the component test**

Create `frontend/src/features/balances/requestViews.test.tsx`:

```tsx
import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import RequestPage from "@/features/requests/RequestPage";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const me = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });

/** A pending annual-leave request as its line manager receives it (master 7.9, RequestDetailOut). */
function pendingRequest(balance: { now: string; after: string } | null) {
  return {
    public_id: "abc",
    version: 1,
    employee: { public_id: "e-1", name: "Amel Trabelsi", department: "Souscription" },
    type: { code: "annual", name: "Congé annuel", unit: "day", calendar_label: "absent" },
    start_date: "2026-11-02",
    end_date: "2026-11-04",
    starts_at_midday: false,
    ends_at_midday: false,
    start_time: null,
    end_time: null,
    quantity: "3.00",
    event: null,
    comment: null,
    comment_hidden: false,
    status: "pending",
    state: { key: "waiting_manager", waiting_on: ["Sami Ben Ali"], last_actor: null, note: null, since: "2026-10-28T09:00:00+01:00" },
    certificate: { status: "not_needed", due_at: null },
    amendment: null,
    has_override: false,
    created_by_hr: false,
    viewer: { relation: "approver", actions: ["decide"], step_id: 7 },
    submitted_at: "2026-10-28T09:00:00+01:00",
    decided_at: null,
    created_at: "2026-10-28T08:55:00+01:00",
    steps: [
      { id: 7, round: 1, position: 1, rule: "line_manager", mode: "approve", status: "pending", approvers: ["Sami Ben Ali"], decided_by: null, decided_at: null, recorded_by: null, channel: null, comment: "", amendment_public_id: null },
      { id: 8, round: 1, position: 2, rule: "hr_role", mode: "approve", status: "waiting", approvers: ["Sana Gharbi"], decided_by: null, decided_at: null, recorded_by: null, channel: null, comment: "", amendment_public_id: null },
    ],
    attachments: [],
    amendments: [],
    decision_context: { balance, teammates_away: [], cap: null },
  };
}

function show(balance: { now: string; after: string } | null) {
  server.use(http.get("/api/v1/requests/abc", () => HttpResponse.json(pendingRequest(balance))));
  renderApp(<RequestPage />, { route: "/requests/abc", me });
}

describe("the decision view of a request", () => {
  it("shows the balance now and after once the API returns them", async () => {
    show({ now: "17.50", after: "14.50" });

    await waitFor(() => expect(document.body).toHaveTextContent("17,5"));
    expect(document.body).toHaveTextContent("14,5");
  });

  it("shows no balance figure while the API returns none", async () => {
    show(null);

    await waitFor(() => expect(document.body).toHaveTextContent("Amel Trabelsi"));
    expect(document.body).not.toHaveTextContent("17,5");
    expect(document.body).not.toHaveTextContent("14,5");
  });
});
```

- [ ] **Step 2: Run the component test**

Run: `docker compose run --rm web npx vitest run src/features/balances/requestViews.test.tsx`
Expected: PASS, 2 passed. Nothing is implemented in this step: the view is plan 03b's and already reads `decision_context.balance`.

If the import of `RequestPage` does not resolve, find the component that plan 03b mounts at `/requests/:id` (`frontend/src/app/router.tsx`) and import that one. If the first test fails because the view ignores `decision_context.balance`, plan 03b did not deliver what master 9.3 states ("balance context appears when the API returns it"); stop and report it.

- [ ] **Step 3: Write the browser journey**

Create `frontend/e2e/balance.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Correct-Horse-42!";

interface Paged<T> {
  results: T[];
}
interface EmployeeRow {
  public_id: string;
  professional_email: string;
}
interface BalanceBody {
  current: string;
  approved_upcoming: string;
  has_opening: boolean;
}
interface RequestBody {
  public_id: string;
  version: number;
}
interface ApprovalRow {
  step_id: number;
  request: RequestBody;
}
interface MeBody {
  employee: { public_id: string } | null;
}

// The journey does not depend on the language of the account: every text is matched in both.
const text = {
  balanceBlock: /^(Balance|Solde)$/,
  recordOpening: /^(Record the opening balance|Saisir le solde d'ouverture)$/,
  openingSheet: /^(Opening balance: |Solde d'ouverture : )/,
  openingAmount: /Opening balance \(days\)|Solde d'ouverture \(jours\)/,
  reason: /Reason|Motif/,
  save: /^(Save|Enregistrer)$/,
  summary: /^(Annual leave balance|Solde de congés annuels)$/,
  upcoming: /Approved and upcoming|Approuvés à venir/,
  history: /^(History|Historique)$/,
  openingLine: /^(Opening balance|Solde d'ouverture)$/,
  takenLine: /^(Leave taken|Congé pris)$/,
  seeRequest: /^(See the request|Voir la demande)$/,
};

/** "17.50" -> a pattern for "17.5 days" and "17,5 jours". */
function daysPattern(value: string): RegExp {
  const [whole, fraction] = String(Math.abs(Number(value))).split(".");
  const amount = fraction ? `${whole}[.,]${fraction}` : whole;
  return new RegExp(`(^|[^0-9.,])${amount}\\s*(days?|jours?)`);
}

function isoDate(day: Date): string {
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

/** A Monday and the Tuesday after it, about two months ahead: clear of demo requests and of the notice period. */
function mondayAndTuesdayAhead(): [string, string] {
  const monday = new Date();
  monday.setDate(monday.getDate() + 60);
  while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1);
  const tuesday = new Date(monday);
  tuesday.setDate(monday.getDate() + 1);
  return [isoDate(monday), isoDate(tuesday)];
}

async function csrf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === "csrftoken")?.value ?? "";
}

async function call<T>(page: Page, method: string, url: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(url, {
    method,
    data,
    headers: { "X-CSRFToken": await csrf(page) },
  });
  expect(response.ok(), `${method} ${url} answered ${response.status()}`).toBeTruthy();
  return (response.status() === 204 ? null : await response.json()) as T;
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.context().clearCookies();
  await page.request.get("/api/v1/auth/csrf");
  await call(page, "POST", "/api/v1/auth/login", { email, password: PASSWORD });
}

async function ownEmployeeId(page: Page): Promise<string> {
  const me = await call<MeBody>(page, "GET", "/api/v1/auth/me");
  expect(me.employee, "the account has an employee record").not.toBeNull();
  return (me.employee as { public_id: string }).public_id;
}

test("an employee reads their balance and opens the history", async ({ page }) => {
  await signIn(page, "employee.a1@impactrisks.com");
  const employeeId = await ownEmployeeId(page);
  const balance = await call<BalanceBody>(page, "GET", `/api/v1/balances/${employeeId}`);

  await page.goto("/me/balance");

  await expect(page.getByRole("region", { name: text.summary })).toContainText(daysPattern(balance.current));
  await page.getByRole("button", { name: text.history }).click();
  // `visible: true`: the shared table may keep a hidden copy of each line for the other layout
  await expect(page.getByText(text.openingLine).filter({ visible: true }).first()).toBeVisible();
  const fitsTheScreen = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fitsTheScreen, "the page does not scroll sideways").toBeTruthy();
});

test("HR records an opening balance, the employee books leave, the balance and the history show it", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "This journey changes data; it runs once, on the desktop project.");

  // 1. HR records the opening balance of employee.b1 on the employee record
  await signIn(page, "hr@impactrisks.com");
  const employees = await call<Paged<EmployeeRow>>(page, "GET", "/api/v1/employees?page_size=100");
  const b1 = employees.results.find((row) => row.professional_email === "employee.b1@impactrisks.com");
  expect(b1, "the demo cast has employee.b1").toBeTruthy();
  const employeeId = (b1 as EmployeeRow).public_id;
  const atFirst = await call<BalanceBody>(page, "GET", `/api/v1/balances/${employeeId}`);
  expect(atFirst.has_opening, "the demo data leaves employee.b1 without an opening balance").toBe(false);

  await page.goto(`/hr/employees/${employeeId}`);
  const record = page.getByRole("button", { name: text.recordOpening });
  const block = page.getByRole("button", { name: text.balanceBlock });
  await expect(record.or(block).first()).toBeVisible();
  if (!(await record.isVisible())) await block.click();
  await record.click();

  const sheet = page.getByRole("dialog", { name: text.openingSheet });
  await sheet.getByLabel(text.openingAmount).fill("10");
  await sheet.getByLabel(text.reason).fill("Carried over from the 2025 file");
  await page.getByRole("button", { name: text.save }).click();

  await expect(sheet).toBeHidden();
  await expect(page.getByText(text.openingLine).filter({ visible: true }).first()).toBeVisible();
  await expect(record).toHaveCount(0);

  // 2. the employee sees the new balance
  await signIn(page, "employee.b1@impactrisks.com");
  const withOpening = await call<BalanceBody>(page, "GET", `/api/v1/balances/${employeeId}`);
  expect(Number(withOpening.current)).toBe(Number(atFirst.current) + 10);
  await page.goto("/me/balance");
  await expect(page.getByRole("region", { name: text.summary })).toContainText(daysPattern(withOpening.current));

  // 3. the employee books two days; the form itself belongs to plan 03b's journeys, so the API is used here
  const [start, end] = mondayAndTuesdayAhead();
  const draft = await call<RequestBody>(page, "POST", "/api/v1/requests", {
    type: "annual",
    start_date: start,
    end_date: end,
    starts_at_midday: false,
    ends_at_midday: false,
    start_time: null,
    end_time: null,
    exceptional_event: null,
    comment: "",
  });
  await call(page, "POST", `/api/v1/requests/${draft.public_id}/submit`, { version: draft.version });

  // 4. the line manager, then HR, approve
  for (const [email, queue] of [
    ["manager.b@impactrisks.com", "mine"],
    ["hr@impactrisks.com", "hr"],
  ] as const) {
    await signIn(page, email);
    const approvals = await call<Paged<ApprovalRow>>(page, "GET", `/api/v1/approvals?queue=${queue}&page_size=100`);
    const waiting = approvals.results.find((row) => row.request.public_id === draft.public_id);
    expect(waiting, `the request waits in the "${queue}" queue of ${email}`).toBeTruthy();
    const item = waiting as ApprovalRow;
    await call(page, "POST", `/api/v1/steps/${item.step_id}/decide`, {
      decision: "approve",
      comment: "",
      version: item.request.version,
    });
  }

  // 5. the days are approved and upcoming, and the history leads back to the request
  await signIn(page, "employee.b1@impactrisks.com");
  const afterwards = await call<BalanceBody>(page, "GET", `/api/v1/balances/${employeeId}`);
  expect(Number(afterwards.approved_upcoming)).toBeGreaterThan(0);
  expect(Number(afterwards.current)).toBe(Number(withOpening.current));

  await page.goto("/me/balance");
  const summary = page.getByRole("region", { name: text.summary });
  await expect(summary).toContainText(text.upcoming);
  await expect(summary).toContainText(daysPattern(afterwards.approved_upcoming));
  await page.getByRole("button", { name: text.history }).click();
  await expect(page.getByText(text.takenLine).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: text.seeRequest }).filter({ visible: true }).first()).toHaveAttribute(
    "href",
    `/requests/${draft.public_id}`,
  );
});
```

- [ ] **Step 4: Run the journey**

Run: `docker compose up -d`, then `cd frontend; npx playwright test e2e/balance.spec.ts`
Expected: 3 passed, 1 skipped (the read-only test runs on the desktop and the phone project; the journey runs on the desktop project and is skipped on the phone).

Read a failure in this order:

1. `POST /api/v1/auth/login answered 403`: the login call needs a token that `auth/csrf` did not set; compare with the sign-in helper of plan 01b's own specs in `frontend/e2e/` and use that helper instead of `signIn`.
2. `the demo data leaves employee.b1 without an opening balance`: the balances seeder gave it one; see `WITHOUT_OPENING` in Task 12.
3. `POST /api/v1/requests/.../submit answered 400`: read the response in the Playwright trace. `request.overlap` means the chosen days collide with a demo request of `employee.b1`; move `mondayAndTuesdayAhead` further ahead.
4. A text that is not found on the employee record: the block is plan 02's rendering of `RECORD_BLOCKS`; open the page by hand and adapt the two locators `record` and `block` to how the block is opened.
5. `filter({ visible: true })` is not a function: the installed Playwright is older than 1.51; replace each `.filter({ visible: true })` by `.locator("visible=true")`.

- [ ] **Step 5: Run everything**

Run: `docker compose run --rm app pytest -q`
Expected: PASS, no failure.

Run: `docker compose run --rm web npx vitest run`
Expected: PASS, no failure. This plan added 36 frontend tests: 7, 7, 11, 9 and 2 in Tasks 13 to 17.

Run: `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck && docker compose run --rm app ruff check . && docker compose run --rm app pytest tests/test_openapi.py -q`
Expected: no error; the committed API description is current.

Run: `cd frontend; npx playwright test`
Expected: every journey of the earlier plans still passes. Their employees now have a demo balance of at least 12 days, which their requests draw on.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/balances/requestViews.test.tsx frontend/e2e/balance.spec.ts
git commit -m "test(balances): balance figures in the decision view and the opening-to-leave browser journey"
```

---

## Spec coverage

| Requirement or section | Tasks |
|---|---|
| BAL-01 balance is the sum of the ledger; lines never edited or deleted | 1 (constraints, triggers), 4 (`balance_on`), 7 (a correction is a new line) |
| BAL-02 entry kinds | 1 |
| BAL-03 month-end credit, pro-rating, no double posting, catch-up | 2, 3 |
| BAL-04 carry-over without limit | 4 (no reset anywhere: a 2025 opening counts in 2026 and 2027), 5 (leave across the new year) |
| BAL-05 HR adjustment with mandatory reason, employee notified | 7, 9, 15 |
| BAL-06 opening balance at go-live | 7, 9, 12 (demo data), 15, 16 |
| BAL-07 current, pending, approved upcoming, full ledger; reach own, team, all | 8, 9 (with the matrix cases), 14, 16 |
| PRD 6.2 credit rule, date, eligibility; A1, A2 | 2, 3 |
| PRD 6.3 definitions | 4 |
| PRD 6.3 acceptance rule | 5, 10 |
| PRD 6.3 check at submission and at final approval, under the employee lock | 10 (through plan 03a), 7 (adjustments take the same lock) |
| PRD 6.3 a returned request reserves nothing | 10 |
| PRD 6.3 one line per month, matching restorations | 6, 10, 11 |
| PRD 7 permission matrix, balance rows | 9 |
| PRD 8.5 `LedgerEntry` | 1 |
| PRD 9.5 month-end credit job, idempotent | 3 |
| PRD 13 step 4 "matches a hand calculation across a year" | 11 |
| NOT-02 "balance adjusted" | 7 |
| AUD-02 creates of business data | 3 (one event per credit run), 7 (one event per manual line) |
| ADM-05 monthly credit setting | 2 (key), 16 (label) |
| Master D8 ledger triggers | 1 |
| Master D11 `credit_start_date` | 2, 3, 4, 8, 12, 16 |
| Master D18 amendments | 4, 5, 6, 10 |
| Master 7.10 services, selectors, routes, error codes, event | 2 to 9 |
| Master 6.9 job `balances.month_end_credit`, daily 01:00 | 3 |
| UI 5.6 My space, Balance | 13, 14 |
| UI 5.3, 6.2, 6.3, 7.8 balance figures in request views | 10 (API), 17 (view) |
| UI 6.3 person: balance and its history | 16 (`team` mode) |
| UI 7.9 current annual balance shown first; Balance block; "Adjust a balance"; opening balance | 15, 16 |
| UI 7.12 parameters: monthly credit | 16 |
| UI 8.2 employee record read-only | 16 (`overview` mode) |
| UI 2 principles on these pages (M1, M8, M10, U4, U5, U7, U9) | 13 to 16 |
| Master 10 review focus, items 2 and 6 | Review Focus 1 and 2 above |

Not in this plan, by the master's assignment: the balance block of the My space home (plan 05), the "Balances at a date" report (plan 06, which reads `selectors.balances_at`), the verification sweep (plan 07).

## Contract notes

Points where the master plan is silent, or where this plan had to assume how a parallel plan named something. Each is to be reconciled by whoever integrates the set.

**Decisions taken in this plan**

1. **`organisation.selectors.all_employees()` is appended by this plan** (Task 3). Master 7.7 has no selector that a system job can call without a user and that includes archived employees, and both the credit job and the projection need one. It is an addition to a plan 02 file outside the extension points of master 9.3; it would sit better in plan 02.
2. **`backend/conftest.py` gains two fixtures** (Task 6): `_null_balance_port` (autouse) and `ledger_port`. Once the real port is installed at start-up, plan 03a's tests, written against the null port, would otherwise fail for lack of balance. Also outside the extension points of 9.3.
3. **TRUNCATE on the ledger is refused in production only** (Task 1). The trigger lets a TRUNCATE through when the session setting `iris.allow_truncate` is `on`, and `apps.balances` sets it on every connection when `ENVIRONMENT` is not `production`, so that `flush` (test teardown, `e2e_reset`) works. UPDATE and DELETE are refused everywhere. D8 reads "reject UPDATE, DELETE and TRUNCATE" without this nuance. If plan 01a solved the same problem for the audit table in another way, the two should be made alike.
4. **No threaded test.** "Two simultaneous submissions" is proved by the order of the SQL statements (the employee row is locked before the ledger is read; Tasks 7 and 10) and by sequential tests, because a transactional test's TRUNCATE teardown depends on how plan 01a's audit triggers treat TRUNCATE.
5. **Eligibility for a credit is the employment window, not the status on the last day** (Task 2). PRD 6.2 says both "eligible: status active or suspended on that date" and "pro-rated in the month of leaving"; a leaver is archived by month end, so only the window satisfies both and BAL-03. Employment runs from `hire_date` to the leaving date, both included. A credit that rounds to zero posts no line. Credits already posted for months after a leaving date recorded late are not reversed; HR adjusts.
6. **Where the leaving date is read** (Task 2). The master does not name the column. `services.leaving_date()` accepts `Employee.leaving_date` or `Employee.archived_at`, as a date or a timestamp, and one test goes through `archive_employee` to guard it. If `archived_at` is the moment of archiving rather than the leaving date, that test fails and names the fix.
7. **Rounding ties go up** (1.25 becomes 1.5). The PRD says "nearest 0.5" only.
8. **Opening balances**: any number, zero and negative included; one per employee, enforced by a unique constraint; no notification. `balances.zero_amount` applies to adjustments. An adjustment may take the balance below zero.
9. **Dating of restorations** (Task 6): like the most recent `taken` line of the same request and month dated on or before the first day given back, else the first day given back. The PRD says "matching restoration entries".
10. **`approved_upcoming` is read from the ledger** (lines dated after today), not from requests, so that it never double counts leave in progress.
11. **Shapes not fixed by the master** (Task 9): `BalanceOut` adds `employee`, `has_opening` and `as_of`; the ledger endpoint is paginated and newest first; `LedgerLineOut` is defined here; `kind` is a plain string in the schema. New error codes: `balances.date_out_of_range` (a chosen date more than 731 days ahead) and `balances.unknown_kind`.
12. **Request links in the history** (Task 8) are resolved through `requests.selectors.day_rows` over a window of a year either side, with every status. A selector `requests.selectors.public_ids(ids)` in plan 03a would be simpler and exact.
13. **Audit granularity**: one event per credit run (`ledger.credits_posted`), one per manual line (`ledger.opening_posted`, `ledger.adjusted`). `taken` and `restored` lines are not audited separately: the decision that caused them is.
14. **Demo data and the cast** (Task 12): the standard cast keeps an empty ledger and `build_world()` is not extended. The balances seeder runs before the requests seeder, not last. `employee.b1` is seeded without an opening balance for the browser journey. The seeder function is assumed to be called `seed`.
15. **Balance preview**: `now` is the posted balance today; `on_start` the projected balance on the first leave day without the new days; `after` the projected balance on the last leave day with them.
16. **Settings values** are normalised on reading (`Decimal(str(...))`, ISO date string or date), and `credit_start_date` is written as an ISO string, because the master does not say what `settings_service.get` returns for `decimal` and `date_or_null`.
17. **Not covered: the annual balance in the manager's People list.** UI 6.3 shows, per person of the team, the annual balance next to name, position and today's presence. Plan 02 builds that list before balances exist, the master defines no extension point for its columns and no endpoint that returns several balances at once, and master 9.4 assigns the column to no plan. `BalanceFact` (Task 16) would fill a cell at one request per person, which a team's size allows; `selectors.balances_at` is ready for an endpoint that returns them together. The person page behind each line does show the balance (Task 16).

**Names taken from the other plans**

This plan was written before the others were final. The rows for plans 01b, 02, 03a and 03b were checked against their final text afterwards, and the code of Tasks 13 to 16 was corrected where it differed (the `key` of a table column, the props of `Pager`, and `useLang()` for the language).

| Name | From | Used in |
|---|---|---|
| `apps.requests.models.Decision` with `APPROVE` and `RETURN`; `apps.requests.ports.NullBalancePort`; `RequestStep.request`; `Request.status`, `.version`, `.id` | 03a | Tasks 6, 10, 11 |
| `Employee.hire_date`, `.status`, `.professional_email`, `.user`, `.public_id`; table `organisation_employee` | 02 | Tasks 2, 3, 7, 10, 12 |
| `apps.core.models.JobStatus`; `apps.audit.models.AuditEvent`; `apps.notifications.models.Notification`; a seeder function named `seed`; string entries in `SEEDERS` and `MATRIX_MODULES`; `settings.py` and `api_urls.py` listing apps as plain lines | 01a | Tasks 1, 3, 7, 9, 12 |
| The Procrastinate task object can be called directly (`tasks.month_end_credit(0)`) | 01a | Task 3 |
| A barrel `@/components` exporting every component of master 9.2 | 01b | Tasks 13 to 16 |
| `Figure({ value, label })`; `Disclosure({ title, children })` with a button carrying `aria-expanded`; `DataTable` columns `{ key, header, cell, align? }` and `rowKey` as a function; `Pager({ page, pageSize, total, onPage })`; `EmptyState({ title, hint? })`; `TaskSheet` rendered as a dialog named by its title; `TextField`, `DateField`, `TextAreaField` with `{ control, name, label, hint? }`; `FormSummary({ problems })`; `useProblemForm(form)` returning `{ onError, summary }`; `toast(message)` | 01b | Tasks 13 to 16 |
| `formatDays(value: string \| number, lang: Lang)`, `formatDate(value, lang: Lang)`, with `lang` from `useLang()` of `@/i18n`; `useMe()` from `@/features/auth/api` returning a query; `renderApp`'s `me` option is a `Me` object; component tests run in French; a new namespace needs at most one registration in `src/i18n/index.ts`; routes may use `element` | 01b | Tasks 13 to 16 |
| `titleKey` and `labelKey` accept a namespaced key (`balances:block.title`); `render` receives an object with `public_id` | 02 | Task 16 |
| `RequestPage` is the default export of `@/features/requests/RequestPage` and renders `decision_context.balance` | 03b | Task 17 |
| The generated schema names `BalanceOut`, `LedgerLineOut`, `AdjustmentIn`, `PaginatedLedgerLineOutList` | drf-spectacular defaults | Task 13 |
