# IRIS HR Platform, Plan 07: Hardening and Go-Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** prove that the software built by plans 01a to 06 is safe, correct at its edges, recoverable and usable, then take it from an empty server to a rehearsed go-live with a runbook and release `v1.0.0`.

**Architecture:** this plan mostly verifies. It adds a cross-module suite in `backend/tests/hardening/`, the nightly encrypted backup job with its restore command, a browser suite that audits every page and completes the journeys, operational scripts for the server, and the documents people need to run the system. It also closes the gaps the earlier plans left for it: a sort on every list, the working week on the calendar, the day carried from the calendar to the request form, and Firefox and Edge in the browser runs. Every check goes through the interfaces fixed in the master plan and in the "Contract notes" of plans 01a to 06, never through another plan's private helpers.

**Tech Stack:** Python 3.13, Django 5.2, Django REST Framework, PostgreSQL 17 client tools (`pg_dump`, `pg_restore`, `createdb`, `dropdb`), GnuPG, Procrastinate, pytest-django, time-machine, openpyxl; Playwright with `@axe-core/playwright`; Bash (LF endings); Caddy 2; Docker Compose.

**Spec:**

- `docs/superpowers/plans/2026-10-06-iris-hr-00-master-plan.md` (binding contract; read it first)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-prd-design.md` (sections 2, 7, 9.5, 9.6, 10, 11, 12.7 to 12.10, 13, 17)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-ui-design.md` (sections 2, 3, 11, 12)
- The "Contract notes" at the end of plans 01a, 01b, 02, 03a, 03b, 04, 05 and 06: what each built where the master was silent, and what each left to this plan

## Global Constraints

Master plan section 2 applies in full. The constraints below bear directly on this plan and are copied from the specs.

- "No role can read data outside its reach; this is proven by an automated permission test on every endpoint." (PRD 2)
- "An automated test calls every endpoint as every role and asserts the expected result. A new endpoint without an entry fails the build." (PRD 10)
- "The System Administrator cannot open business data." (PRD 10)
- "Nobody acts on their own request, in any role." (PRD 3)
- "No request is ever approved automatically." (REQ-14)
- "A notification links to its item. Its text never contains a sick-leave comment or any detail of a medical document." (NOT-03)
- "The content of sick-leave comments is not copied into the audit trail; the event records only that the field changed." (AUD-05)
- "The export contains no comment and no medical detail." (REP-08)
- Jobs: "Each job run twice produces the same result as once." (PRD 12.8)
- "A failed job is retried with back-off and, if it still fails, raises an in-app notification to System Administrators and an error in the logs." (PRD 9.5)
- "A nightly job writes an encrypted dump of the database and an encrypted archive of the file volume to a backup volume on the server, and keeps 14 days." (PRD 12.7)
- "The server `.env` files are backed up separately from the data. Without the file-encryption key, medical attachments cannot be read." (PRD 12.3)
- NFR-01: "100 users, 20 concurrent, on one server with 4 cores, 8 GB of memory and SSD storage".
- NFR-02: "95% of API calls answer in under 500 ms; pages are usable within 2 seconds on the office network".
- NFR-04: "Nightly dump kept 14 days on the server."
- NFR-07: "Current Chrome, Edge and Firefox, on desktop and phone".
- NFR-08: "WCAG 2.1 AA as the target".
- "Transport: HTTPS on the office network with a certificate for an internal hostname. HSTS enabled." (PRD 10)
- "Web: CSRF protection, strict content-security policy, secure cookie flags, clickjacking protection." (PRD 10)
- "Files are served as downloads with safe headers and are never executed or rendered inline from the application's origin." (PRD 9.6)
- "Test and production are separate Compose projects on the same server." (PRD 12.2)
- "The whole sequence is rehearsed on the test stack first." (PRD 12.9)
- "Documents: installation, update and restore runbook; administrator guide; HR guide; employee guide in French and English; this specification; a record of later decisions." (PRD 12.10)
- "Semantic versioning with a changelog." and "A restore from the latest dump is tested every quarter on the test stack." (PRD 12.10)
- Step 7 is done when "the rehearsal completes from an empty server using only the runbook". (PRD 13)
- UI principles U1 to U9, M1 to M10 and R1 to R5 (UI 2), in particular: "A workspace has at most six navigation entries" (M2), "A home has at most four blocks" (M3), "One primary action per page" (M1), "Nothing is shown that the user cannot use: no disabled menu entries" (M8), "internal codes and status names are never shown" (U3), "No screen mixes the two" (U9).

Conventions of this plan:

- The cross-module tests of this plan live in `backend/tests/hardening/`, with a `conftest.py` that switches the real balance port on. They import the public names fixed by the master plan and by the plans' contract notes, and nothing private. Tests of code this plan adds to an app live in that app (`apps/core/tests/test_backup.py`, `apps/calendar/tests/test_feed_working_week.py`).
- A verification test is expected to **pass at once**, because earlier plans built the behaviour. When one fails, the failure is a defect in the earlier plan's code: fix the code in the owning app, never the test, unless the step says the test encodes an assumption to align.
- Tests that freeze the clock use Monday 2 November 2026, 09:00 in Tunis.

## Review Focus

The ten items of master section 10 are all verified here. The five most likely to hurt a person, with the task that pins each:

1. **Leaked medical detail.** A marker string placed in a sick-leave comment and in the certificate's file name must not come back from any endpoint, notification, audit row, report, export or log line for anyone but the requester and HR. Pinned in Task 2.
2. **Nobody to approve, or the requester approves.** The CEO's request, a request whose manager was archived, the only HR holder's own request, a delegate's own request: each must end waiting on somebody else, never approved by itself and never by its author. Pinned in Task 3.
3. **Two actions at once.** Two approvers on one step, two submissions against one balance, a final approval racing a withdrawal, a double click on Send: exactly one wins and the ledger agrees with the final status. Pinned in Task 8.
4. **A backup that cannot be restored.** The nightly files must decrypt with the passphrase and restore into an empty database with the same row counts, and a missing passphrase must fail loudly, not write a plain dump. Pinned in Task 5.
5. **Periods that cross a boundary.** Leave from 28 December to 6 January must be split 4 and 3 in the ledger, in the absence report and in the two monthly KPMG files, with the right meal tickets. Pinned in Task 4.

The other five are pinned as follows: half-days on non-working boundaries and configuration changed mid-flight in Task 4; the clock in Tasks 4, 6 and 8; hostile uploads and sign-in edge cases in Task 7; a session ending while a form is open in Task 11.

---

### Task 0: Baseline, the whole suite green before hardening starts

**Files:**
- Modify: only the callers named by a failing check (Step 2)

**Interfaces:**
- Consumes: every check of plans 01a to 06.
- Produces: a commit on which `pytest`, `ruff`, `vitest`, `eslint`, `tsc` and Playwright all pass. Every later task of this plan starts from it.

The eight plans were written side by side. Each lists, in its "Contract notes", the names it had to assume from the others. This task runs everything once and settles those assumptions, so that a failure met later in this plan is a real defect and not a leftover of integration.

- [ ] **Step 1: Run every check**

Run, from the repository root, one line at a time:

```bash
docker compose up -d
docker compose run --rm app pytest -q
docker compose run --rm app ruff check .
docker compose run --rm app ruff format --check .
powershell -File scripts/dev.ps1 openapi
git status --short backend/openapi.yaml frontend/src/api/schema.d.ts
docker compose run --rm web npm run typecheck
docker compose run --rm web npm run lint
docker compose run --rm web npx vitest run
cd frontend; npx playwright test; cd ..
```

Expected: every command ends without error, and `git status` prints nothing for the two generated files (the committed API description is current).

- [ ] **Step 2: Settle the assumptions that a check reports**

The type check is where a wrong assumption shows first. The rule for every case: the component, hook or service is right as its own plan built it; the caller is changed.

The mismatches known when the set was reviewed were corrected in the plans themselves, so they should not appear here: plan 04's table columns (`key`), its `Pager` props and its use of `useLang()`, and the default answers that plans 03b and 04 append to `frontend/src/test/handlers.ts` for the People table and the employee record. Two cases can still show up, because they depend on the order in which lists were extended:

| Where | Written as | What the owning plan built | Change in the caller |
|---|---|---|---|
| tests of plans 02 and 03b that compare the exact columns of the People table or the blocks of a record | lists written before plans 03b, 04 and 05 registered theirs | `PEOPLE_COLUMNS`: name, position, today, balance, requests waiting; `RECORD_BLOCKS`: personal, team, documents, requests, balance, proposals, history | Add the missing names to the expected lists (plan 03b note 10, plan 05 note 13) |
| a journey of plan 03b that waits for the Requests page right after sign-in | written before My space had a home | plan 05: a person lands on the home | Make the journey open `/me/requests` itself, as plan 05 says where it runs the whole browser suite |

For any other error, open the "Contract notes" of the two plans involved; the note says which side assumed. Fix the caller, rerun the failing command, and commit each fix on its own:

```bash
git commit -am "fix(integration): <caller> uses <name> as plan <NN> built it"
```

- [ ] **Step 3: Record the baseline**

Run: `git tag hardening-baseline && git log --oneline -1`

Expected: the tag is created on a commit where every command of Step 1 passes. If a later task breaks something that passed here, `git diff hardening-baseline` shows what changed.

---

### Task 1: Permission matrix completion

**Files:**
- Create: `backend/tests/hardening/__init__.py`
- Create: `backend/tests/hardening/conftest.py`
- Create: `backend/tests/hardening/helpers.py`
- Create: `backend/tests/hardening/routes.py`
- Create: `backend/tests/hardening/contract_access.py`
- Create: `backend/tests/hardening/matrix_reach.py`
- Create: `backend/tests/hardening/test_access_contract.py`
- Create: `backend/tests/hardening/test_reach.py`
- Create: `backend/apps/core/management/commands/permission_report.py`
- Modify: `backend/tests/test_permission_matrix.py` (append one entry to `MATRIX_MODULES`)

**Interfaces:**
- Consumes: `tests.matrix` (`P`, `Case` with its `format` field, `only`, `ALLOW`, `DENY`, `HIDE`, `LOGIN`) and `MATRIX_MODULES` of plan 01a; fixtures `world`, `client_for` (it calls `force_login`), `anon_client`, `ledger_port` (plan 04); `apps.accounts.roles.Role`; `apps.accounts.permissions` sentinels `AUTHENTICATED`, `PUBLIC`; view attribute `access`; `apps.requests.services` (`RequestData`, `create_draft`, `submit`, `decide_step`, `attach_file`); `apps.requests.models` (`Request`, `RequestStep`, `StepStatus`, `Decision`); `apps.balances.services.post_opening`; `apps.organisation.services` (`create_delegation`, `propose_profile_change`, `add_document`); `apps.notifications.services.notify`.
- Produces, for the later tasks of this plan:
  - `tests.hardening.helpers`: `NOW`, `MARKER`, `PDF_BYTES`, `pdf(name: str) -> SimpleUploadedFile`, `frozen` (fixture), `give_balance(world, employee, days: str) -> None`, `make_request(world, *, user, employee, request_type, start, end, comment="", **flags) -> Request`, `pending_step(request) -> RequestStep | None`, `decide(request, user, decision=Decision.APPROVE, comment="") -> Request`, `approve_fully(world, request) -> Request`.
  - `tests.hardening.routes`: `ApiRoute(name, path, methods, view, converters)`, `iter_api_routes() -> list[ApiRoute]`, `dummy_kwargs(route) -> dict`.
  - `tests.hardening.contract_access.EXPECTED: dict[tuple[str, str], frozenset[str]]`.
  - Management command `permission_report`.

- [ ] **Step 1: Create the package and the shared helpers**

`backend/tests/hardening/__init__.py` is an empty file.

`backend/tests/hardening/conftest.py`. Plan 04 puts a null balance port in place for every test that does not ask for `ledger_port` (its contract note 2). This suite verifies the finished system, so balances are always on:

```python
import pytest


@pytest.fixture(autouse=True)
def _real_ledger(request):
    """Every hardening test that uses the cast runs with the real balance port of plan 04."""
    if "world" in request.fixturenames:
        request.getfixturevalue("ledger_port")
```

`backend/tests/hardening/helpers.py`:

```python
"""Shared builders for the hardening suite. Only master-plan interfaces are used."""
from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
import time_machine
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.balances import services as balance_services
from apps.requests import services as request_services
from apps.requests.models import Decision, Request, RequestStep, StepStatus
from apps.requests.services import RequestData

# Monday 2 November 2026, 09:00 in Tunis (UTC+1).
NOW = datetime(2026, 11, 2, 8, 0, tzinfo=UTC)
TODAY = date(2026, 11, 2)

MARKER = "ZZMARKERZZ"

PDF_BYTES = (
    b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n"
    b"trailer\n<< /Root 1 0 R >>\n%%EOF\n"
)


def pdf(name: str = "document.pdf") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, PDF_BYTES, content_type="application/pdf")


@pytest.fixture
def frozen():
    with time_machine.travel(NOW, tick=False) as traveller:
        yield traveller


def give_balance(world, employee, days: str) -> None:
    """Post an opening balance dated the day before the frozen clock."""
    balance_services.post_opening(
        actor=world.hr_user,
        employee=employee,
        amount=Decimal(days),
        effective_date=date(2026, 11, 1),
        reason="Opening balance for tests",
    )


def make_request(world, *, user, employee, request_type, start: date, end: date,
                 comment: str = "", submit: bool = True, **flags) -> Request:
    data = RequestData(start_date=start, end_date=end, comment=comment, **flags)
    request = request_services.create_draft(
        actor=user, employee=employee, request_type=request_type, data=data
    )
    if submit:
        request = request_services.submit(actor=user, request=request)
    return request


def pending_step(request: Request) -> RequestStep | None:
    return (
        RequestStep.objects.filter(
            request=request, amendment__isnull=True, status=StepStatus.PENDING
        )
        .order_by("-round", "position")
        .first()
    )


def decide(request: Request, user, decision: Decision = Decision.APPROVE, comment: str = "") -> Request:
    request.refresh_from_db()
    step = pending_step(request)
    assert step is not None, "no pending step to decide"
    return request_services.decide_step(
        actor=user, step=step, decision=decision, comment=comment,
        expected_version=request.version,
    )


def approve_fully(world, request: Request) -> Request:
    """Approve the owner's or the peer's request: line manager, then HR."""
    request = decide(request, world.manager_user)
    return decide(request, world.hr_user)
```

- [ ] **Step 2: Confirm the import paths this suite assumes**

Run: `docker compose run --rm app python -c "import django; django.setup(); from tests.matrix import P, Case, only, ALLOW, DENY, HIDE, LOGIN; from apps.requests.models import Decision, Request, RequestStep, StepStatus, RequestStatus, Channel; from apps.requests.services import RequestData, create_draft, submit, decide_step; from apps.accounts.permissions import AUTHENTICATED, PUBLIC; print('ok')"` with `DJANGO_SETTINGS_MODULE=config.settings` already set by the image.

Expected: `ok`.

If an import fails, the name lives in another module of the same app (for example the enumerations in `apps/requests/enums.py`). Do not move code. Fix the import line in `helpers.py`, and in every later file of this plan that uses the same name, to the real location, and record the change in the commit message.

- [ ] **Step 3: Write the route walker**

`backend/tests/hardening/routes.py`:

```python
"""Enumerates every API route with its view class, methods and path converters."""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from django.urls import URLPattern, URLResolver, get_resolver

API_PREFIX = "api/v1/"


@dataclass(frozen=True)
class ApiRoute:
    name: str                 # "requests:request-detail"
    path: str                 # "api/v1/requests/<uuid:public_id>"
    methods: tuple[str, ...]  # ("GET", "PATCH", "DELETE")
    view: type
    converters: dict          # {"public_id": <UUIDConverter>}


def _walk(patterns, prefix: str, namespaces: tuple[str, ...], converters: dict):
    for entry in patterns:
        route = prefix + str(entry.pattern)
        found = {**converters, **getattr(entry.pattern, "converters", {})}
        if isinstance(entry, URLResolver):
            deeper = namespaces + ((entry.namespace,) if entry.namespace else ())
            yield from _walk(entry.url_patterns, route, deeper, found)
        elif isinstance(entry, URLPattern):
            view = getattr(entry.callback, "cls", None) or getattr(entry.callback, "view_class", None)
            if view is None or not route.startswith(API_PREFIX) or not entry.name:
                continue
            access = getattr(view, "access", {})
            name = ":".join((*namespaces, entry.name))
            yield ApiRoute(name=name, path=route, methods=tuple(sorted(access)), view=view, converters=found)


def iter_api_routes() -> list[ApiRoute]:
    return sorted(_walk(get_resolver().url_patterns, "", (), {}), key=lambda r: r.name)


def dummy_kwargs(route: ApiRoute) -> dict:
    """Arguments that resolve the URL without pointing at any real object."""
    values = {}
    for key, converter in route.converters.items():
        kind = type(converter).__name__
        if kind == "UUIDConverter":
            values[key] = uuid.UUID("00000000-0000-4000-8000-000000000000")
        elif kind == "IntConverter":
            values[key] = 999999
        else:
            values[key] = "none"
    return values
```

- [ ] **Step 4: Write the contract table**

`backend/tests/hardening/contract_access.py` restates sections 7.1 to 7.11 of the master plan as data. `"auth"` and `"public"` stand for the two sentinels.

```python
"""The access contract of the master plan (sections 7.1 to 7.11) as data.

Key: (route name, method). Value: the roles allowed, or {"auth"} / {"public"}.
"""
from __future__ import annotations

E, M, H, X, S = "employee", "manager", "hr", "exec", "sysadmin"
AUTH = frozenset({"auth"})
PUBLIC = frozenset({"public"})


def roles(*names: str) -> frozenset[str]:
    return frozenset(names)


EXPECTED: dict[tuple[str, str], frozenset[str]] = {
    # 7.1 core
    ("core:health", "GET"): PUBLIC,
    ("core:admin-status", "GET"): roles(S, X),
    # 7.2 accounts
    ("accounts:csrf", "GET"): PUBLIC,
    ("accounts:login", "POST"): PUBLIC,
    ("accounts:logout", "POST"): AUTH,
    ("accounts:me", "GET"): AUTH,
    ("accounts:me", "PATCH"): AUTH,
    ("accounts:password", "POST"): AUTH,
    ("accounts:account-list", "GET"): roles(S, X),
    ("accounts:account-list", "POST"): roles(S),
    ("accounts:account-candidates", "GET"): roles(S),
    ("accounts:account-detail", "GET"): roles(S, X),
    ("accounts:account-reset-password", "POST"): roles(S),
    ("accounts:account-roles", "POST"): roles(S),
    ("accounts:account-role", "DELETE"): roles(S),
    ("accounts:account-disable", "POST"): roles(S),
    ("accounts:account-enable", "POST"): roles(S),
    ("accounts:account-unlock", "POST"): roles(S),
    # 7.3 audit
    ("audit:business", "GET"): roles(H, X),
    ("audit:security", "GET"): roles(S, X),
    ("audit:business-export", "GET"): roles(H, X),
    ("audit:security-export", "GET"): roles(S, X),
    # 7.4 settings
    ("settings:hr", "GET"): roles(H, X),
    ("settings:hr-item", "PUT"): roles(H),
    ("settings:system", "GET"): roles(S, X),
    ("settings:system-item", "PUT"): roles(S),
    # 7.5 notifications
    ("notifications:list", "GET"): AUTH,
    ("notifications:unread-count", "GET"): AUTH,
    ("notifications:read", "POST"): AUTH,
    ("notifications:read-all", "POST"): AUTH,
    # 7.6 files
    ("files:download", "GET"): AUTH,
    # 7.7 organisation
    ("organisation:department-list", "GET"): roles(H, X),
    ("organisation:department-list", "POST"): roles(H),
    ("organisation:department-detail", "PATCH"): roles(H),
    ("organisation:position-list", "GET"): roles(H, X),
    ("organisation:position-list", "POST"): roles(H),
    ("organisation:position-detail", "PATCH"): roles(H),
    ("organisation:employee-list", "GET"): roles(M, H, X),
    ("organisation:employee-list", "POST"): roles(H),
    ("organisation:employee-directory", "GET"): roles(M, H, X),
    ("organisation:employee-me", "GET"): roles(E),
    ("organisation:employee-detail", "GET"): roles(E, H, X),
    ("organisation:employee-detail", "PATCH"): roles(H),
    ("organisation:employee-archive-preview", "GET"): roles(H),
    ("organisation:employee-archive", "POST"): roles(H),
    ("organisation:employee-documents", "GET"): roles(E, H, X),
    ("organisation:employee-documents", "POST"): roles(H),
    ("organisation:employee-document", "PATCH"): roles(H),
    ("organisation:employee-history", "GET"): roles(H, X),
    ("organisation:profile-change-list", "GET"): roles(E, H),
    ("organisation:profile-change-list", "POST"): roles(E),
    ("organisation:profile-change-detail", "GET"): roles(E, H),
    ("organisation:profile-change-decide", "POST"): roles(H),
    ("organisation:profile-change-withdraw", "POST"): roles(E),
    ("organisation:delegation-list", "GET"): roles(M, H),
    ("organisation:delegation-list", "POST"): roles(M, H),
    ("organisation:delegation-end", "POST"): roles(M, H),
    # 7.8 calendar
    ("calendar:holiday-list", "GET"): roles(E, H, X),
    ("calendar:holiday-list", "POST"): roles(H),
    ("calendar:holiday-detail", "PATCH"): roles(H),
    ("calendar:holiday-detail", "DELETE"): roles(H),
    ("calendar:holiday-copy", "POST"): roles(H),
    ("calendar:holiday-impact", "GET"): roles(H),
    ("calendar:feed", "GET"): roles(E, H, X),
    # 7.9 requests
    ("requests:type-list", "GET"): roles(E, H, X),
    ("requests:type-list", "POST"): roles(H),
    ("requests:type-detail", "GET"): roles(H, X),
    ("requests:type-detail", "PATCH"): roles(H),
    ("requests:type-steps", "GET"): roles(H, X),
    ("requests:type-steps", "PUT"): roles(H),
    ("requests:type-chain-preview", "GET"): roles(H),
    ("requests:event-list", "GET"): roles(E, H, X),
    ("requests:event-list", "POST"): roles(H),
    ("requests:event-detail", "PATCH"): roles(H),
    ("requests:request-list", "GET"): roles(E, H, X),
    ("requests:request-list", "POST"): roles(E, H),
    ("requests:request-preview", "POST"): roles(E, H),
    ("requests:request-detail", "GET"): roles(E, H, X),
    ("requests:request-detail", "PATCH"): roles(E, H),
    ("requests:request-detail", "DELETE"): roles(E, H),
    ("requests:request-submit", "POST"): roles(E, H),
    ("requests:request-withdraw", "POST"): roles(E),
    ("requests:request-attachments", "GET"): roles(E, H, X),
    ("requests:request-attachments", "POST"): roles(E, H),
    ("requests:request-amendments", "GET"): roles(E, H, X),
    ("requests:request-amendments", "POST"): roles(E),
    ("requests:amendment-withdraw", "POST"): roles(E),
    ("requests:request-correct", "POST"): roles(H),
    ("requests:request-cancel", "POST"): roles(H),
    ("requests:request-reclassify", "POST"): roles(H),
    ("requests:request-history", "GET"): roles(E, H, X),
    ("requests:approval-list", "GET"): roles(E, H, X),
    ("requests:step-decide", "POST"): roles(E, H, X),
    ("requests:step-record-on-behalf", "POST"): roles(H),
    ("requests:step-reassign", "POST"): roles(H),
    # 7.10 balances
    ("balances:figures", "GET"): roles(E, H, X),
    ("balances:ledger", "GET"): roles(E, H, X),
    ("balances:adjustments", "POST"): roles(H),
    # 7.11 reports
    ("reports:home-me", "GET"): roles(E),
    ("reports:home-team", "GET"): roles(M),
    ("reports:home-overview", "GET"): roles(X),
    ("reports:workspace-summary", "GET"): AUTH,
    ("reports:report-filters", "GET"): roles(M, H, X),      # added by plan 06 (its contract note 1)
    ("reports:report", "GET"): roles(M, H, X),
    ("reports:kpmg-export", "GET"): roles(H),
    ("reports:kpmg-default-period", "GET"): roles(H),
}

# Routes the System Administrator may call. Everything else is business data.
SYSADMIN_MAY_CALL = frozenset(
    key for key, allowed in EXPECTED.items()
    if S in allowed or allowed in (AUTH, PUBLIC)
)
```

- [ ] **Step 5: Write the contract test**

`backend/tests/hardening/test_access_contract.py`:

```python
"""Every route declares exactly the access the master plan gives it (PRD 7, PRD 10 'Proof')."""
from __future__ import annotations

import pytest
from django.urls import reverse

from apps.accounts.permissions import AUTHENTICATED, PUBLIC
from tests.hardening.contract_access import EXPECTED, SYSADMIN_MAY_CALL
from tests.hardening.routes import dummy_kwargs, iter_api_routes


def _declared(view, method) -> frozenset[str]:
    value = view.access[method]
    if value is AUTHENTICATED or value == AUTHENTICATED:
        return frozenset({"auth"})
    if value is PUBLIC or value == PUBLIC:
        return frozenset({"public"})
    return frozenset(str(role) for role in value)


def _declared_pairs() -> dict[tuple[str, str], frozenset[str]]:
    return {
        (route.name, method): _declared(route.view, method)
        for route in iter_api_routes()
        for method in route.methods
    }


def test_every_route_is_in_the_contract():
    missing = sorted(set(_declared_pairs()) - set(EXPECTED))
    assert missing == [], f"routes with no line in contract_access.EXPECTED: {missing}"


def test_every_contract_line_exists_as_a_route():
    gone = sorted(set(EXPECTED) - set(_declared_pairs()))
    assert gone == [], f"contract lines with no route: {gone}"


def test_declared_access_equals_the_contract():
    declared = _declared_pairs()
    wrong = {
        key: {"declared": sorted(declared[key]), "contract": sorted(EXPECTED[key])}
        for key in declared
        if key in EXPECTED and declared[key] != EXPECTED[key]
    }
    assert wrong == {}


def test_views_expose_no_undeclared_method():
    for route in iter_api_routes():
        allowed = {m.upper() for m in route.view.http_method_names} - {"OPTIONS", "HEAD"}
        assert allowed <= set(route.methods), f"{route.name} accepts {allowed - set(route.methods)} without access"


@pytest.mark.django_db
def test_system_administrator_is_refused_on_every_business_route(world, client_for):
    client = client_for(world.sysadmin_user)
    wrong = []
    for route in iter_api_routes():
        for method in route.methods:
            if (route.name, method) in SYSADMIN_MAY_CALL:
                continue
            url = reverse(route.name, kwargs=dummy_kwargs(route))
            response = client.generic(method, url, data="{}", content_type="application/json")
            if response.status_code != 403:
                wrong.append((route.name, method, response.status_code))
    assert wrong == [], f"System Administrator was not refused with 403: {wrong}"


@pytest.mark.django_db
def test_anonymous_is_refused_everywhere_but_public_routes(anon_client):
    wrong = []
    for route in iter_api_routes():
        for method in route.methods:
            if EXPECTED.get((route.name, method)) == frozenset({"public"}):
                continue
            url = reverse(route.name, kwargs=dummy_kwargs(route))
            response = anon_client.generic(method, url, data="{}", content_type="application/json")
            if response.status_code != 401:
                wrong.append((route.name, method, response.status_code))
    assert wrong == [], f"anonymous calls not answered with 401: {wrong}"
```

- [ ] **Step 6: Run the contract test**

Run: `docker compose run --rm app pytest tests/hardening/test_access_contract.py -v`

Expected: 6 passed. This is a verification test and should pass at once.

When it fails:

- `test_every_route_is_in_the_contract` lists a route: an earlier plan added an endpoint the master does not name. Read the plan's "Contract notes" for it, add the line to `EXPECTED` with the access that note gives, and add the route to `docs/decisions.md` (Task 15).
- `test_declared_access_equals_the_contract` lists a difference: the view is wrong unless the owning plan's "Contract notes" justify it. Fix the view's `access`, rerun the owning app's tests.
- The System Administrator test lists a route: the role check runs after the object lookup. Move the lookup after the permission check in that view.

- [ ] **Step 7: Write the report command and its test**

`backend/apps/core/management/commands/permission_report.py`:

```python
"""Prints the access each API route declares, as a Markdown table."""
from django.core.management.base import BaseCommand
from django.urls import URLPattern, URLResolver, get_resolver

from apps.accounts.permissions import AUTHENTICATED, PUBLIC

ROLE_ORDER = ["employee", "manager", "hr", "exec", "sysadmin"]


def _routes(patterns, prefix="", namespaces=()):
    for entry in patterns:
        route = prefix + str(entry.pattern)
        if isinstance(entry, URLResolver):
            deeper = namespaces + ((entry.namespace,) if entry.namespace else ())
            yield from _routes(entry.url_patterns, route, deeper)
        elif isinstance(entry, URLPattern):
            view = getattr(entry.callback, "cls", None) or getattr(entry.callback, "view_class", None)
            if view is not None and route.startswith("api/v1/") and entry.name:
                yield ":".join((*namespaces, entry.name)), route, view


def _cell(value) -> str:
    if value == AUTHENTICATED:
        return "any signed-in account"
    if value == PUBLIC:
        return "public"
    names = sorted((str(role) for role in value), key=ROLE_ORDER.index)
    return ", ".join(names)


class Command(BaseCommand):
    help = "Print every API route with the roles allowed on each method."

    def handle(self, *args, **options):
        lines = ["| Route | Path | Method | Allowed |", "|---|---|---|---|"]
        for name, route, view in sorted(_routes(get_resolver().url_patterns)):
            for method in sorted(getattr(view, "access", {})):
                lines.append(f"| `{name}` | `/{route}` | {method} | {_cell(view.access[method])} |")
        self.stdout.write("\n".join(lines))
```

Append to `backend/tests/hardening/test_access_contract.py`:

```python
def test_permission_report_lists_every_route():
    from io import StringIO

    from django.core.management import call_command

    out = StringIO()
    call_command("permission_report", stdout=out)
    text = out.getvalue()
    for (name, method) in EXPECTED:
        assert f"`{name}`" in text, name
    assert "| `requests:step-decide` |" in text
    assert "employee, hr, exec" in text
```

Run: `docker compose run --rm app pytest tests/hardening/test_access_contract.py::test_permission_report_lists_every_route -v`

Expected: PASS.

Then write the report into the repository so reviewers can read it without running code:

Run: `docker compose run --rm app python manage.py permission_report > docs/permission-matrix.md`

Expected: `docs/permission-matrix.md` holds a table with one line per route and method (about 115 lines). Open it and compare it by eye with the table of PRD section 7; note any surprise in `docs/decisions.md` (Task 15).

- [ ] **Step 8: Commit**

```bash
git add backend/tests/hardening/__init__.py backend/tests/hardening/conftest.py backend/tests/hardening/helpers.py backend/tests/hardening/routes.py backend/tests/hardening/contract_access.py backend/tests/hardening/test_access_contract.py backend/apps/core/management/commands/permission_report.py docs/permission-matrix.md
git commit -m "test: check every route's declared access against the contract"
```

- [ ] **Step 9: Write the row-level cases**

These cases use the harness of plan 01a, so each one runs as all nine personas. They cover every route that takes an identifier and has a reach rule: own, team and all. Objects are built on first use and remembered on the `world` object, which is new for each test. The cases use real dates relative to today because the harness does not freeze the clock.

`backend/tests/hardening/matrix_reach.py`:

```python
"""Row-level permission cases: one object owned by `owner`, called by every persona."""
from __future__ import annotations

from datetime import date, timedelta

from django.utils import timezone

from apps.notifications.models import Notification
from apps.organisation import services as organisation_services
from apps.requests import services as request_services
from apps.requests.models import RequestStep, StepStatus
from apps.requests.services import RequestData
from tests.hardening.helpers import pdf
from tests.matrix import Case, P, only

EVERY_EMPLOYEE = [P.OWNER, P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC]


def _monday(weeks_ahead: int = 0) -> date:
    today = timezone.localdate()
    return today - timedelta(days=today.weekday()) + timedelta(weeks=weeks_ahead)


def _memo(world, key: str, build):
    cache = world.__dict__.setdefault("_hardening", {})
    if key not in cache:
        cache[key] = build()
    return cache[key]


def remote_request(w):
    """A pending remote-work day of `owner`, waiting for `manager`."""
    def build():
        day = _monday(2)
        draft = request_services.create_draft(
            actor=w.owner_user, employee=w.owner, request_type=w.remote,
            data=RequestData(start_date=day, end_date=day, comment="Plumber at home"),
        )
        return request_services.submit(actor=w.owner_user, request=draft)
    return _memo(w, "remote_request", build)


def remote_draft(w):
    def build():
        day = _monday(3)
        return request_services.create_draft(
            actor=w.owner_user, employee=w.owner, request_type=w.remote,
            data=RequestData(start_date=day, end_date=day),
        )
    return _memo(w, "remote_draft", build)


def manager_step(w) -> RequestStep:
    return RequestStep.objects.get(request=remote_request(w), status=StepStatus.PENDING)


def sick_request(w):
    """A sick-leave declaration of `owner` with a certificate, waiting for HR."""
    def build():
        day = _monday(0)
        draft = request_services.create_draft(
            actor=w.owner_user, employee=w.owner, request_type=w.sick,
            data=RequestData(start_date=day, end_date=day, comment="Flu"),
        )
        request = request_services.submit(actor=w.owner_user, request=draft)
        link = request_services.attach_file(actor=w.owner_user, request=request, upload=pdf("certificate.pdf"))
        return request, link.attachment
    return _memo(w, "sick_request", build)


def proof_attachment(w):
    """The proof attached to an exceptional-leave request of `owner`."""
    def build():
        day = _monday(4)
        draft = request_services.create_draft(
            actor=w.owner_user, employee=w.owner, request_type=w.exceptional,
            data=RequestData(start_date=day, end_date=day, exceptional_event_id=w.event.id),
        )
        request = request_services.submit(actor=w.owner_user, request=draft)
        return request_services.attach_file(actor=w.owner_user, request=request, upload=pdf("proof.pdf")).attachment
    return _memo(w, "proof_attachment", build)


def profile_change(w):
    return _memo(w, "profile_change", lambda: organisation_services.propose_profile_change(
        user=w.owner_user, changes={"phone": "+216 20 000 001"}))


def delegation(w):
    """An upcoming delegation from `manager` to `other_manager`, starting in 30 days."""
    today = timezone.localdate()
    return _memo(w, "delegation", lambda: organisation_services.create_delegation(
        actor=w.manager_user, manager=w.manager, delegate=w.other_manager,
        start_date=today + timedelta(days=30), end_date=today + timedelta(days=37)))


def document(w, *, shared: bool):
    key = f"document_{shared}"
    return _memo(w, key, lambda: organisation_services.add_document(
        actor=w.hr_user, employee=w.owner, upload=pdf("contract.pdf"),
        label="Contract", visible_to_employee=shared))


def manager_notification(w) -> Notification:
    remote_request(w)
    return Notification.objects.filter(user=w.manager_user).order_by("-id").first()


def _others(*allowed: P) -> list[P]:
    """Every persona with an employee record that is not allowed: they must get 404."""
    return [p for p in EVERY_EMPLOYEE if p not in allowed]


OWN_TEAM_ALL = only(P.OWNER, P.MANAGER, P.HR, P.EXEC, hide=[P.PEER, P.OTHER_MANAGER, P.OUTSIDER])

CASES = [
    # Employee record: own, team, all (PRD 7 "View employee record").
    Case("organisation:employee-detail", "GET", OWN_TEAM_ALL,
         kwargs=lambda w: {"public_id": w.owner.public_id}, label="reach: employee record"),
    # Documents: own if shared, HR, EXEC. The manager has no access (PRD 7 "Employee documents").
    Case("organisation:employee-documents", "GET",
         only(P.OWNER, P.HR, P.EXEC, hide=_others(P.OWNER, P.HR, P.EXEC)),
         kwargs=lambda w: {"public_id": w.owner.public_id}, label="reach: employee documents"),
    Case("organisation:profile-change-detail", "GET",
         only(P.OWNER, P.HR, hide=_others(P.OWNER, P.HR)),
         kwargs=lambda w: {"public_id": profile_change(w).public_id}, label="reach: profile change"),
    Case("organisation:profile-change-withdraw", "POST",
         only(P.OWNER, hide=_others(P.OWNER)),
         kwargs=lambda w: {"public_id": profile_change(w).public_id}, label="reach: withdraw profile change"),
    # Requests: own, team, all.
    Case("requests:request-detail", "GET", OWN_TEAM_ALL,
         kwargs=lambda w: {"public_id": remote_request(w).public_id}, label="reach: request"),
    Case("requests:request-history", "GET", OWN_TEAM_ALL,
         kwargs=lambda w: {"public_id": remote_request(w).public_id}, label="reach: request history"),
    Case("requests:request-attachments", "GET", OWN_TEAM_ALL,
         kwargs=lambda w: {"public_id": remote_request(w).public_id}, label="reach: request attachments"),
    Case("requests:request-amendments", "GET", OWN_TEAM_ALL,
         kwargs=lambda w: {"public_id": remote_request(w).public_id}, label="reach: request amendments"),
    Case("requests:request-withdraw", "POST",
         only(P.OWNER, hide=_others(P.OWNER)),
         kwargs=lambda w: {"public_id": remote_request(w).public_id},
         body=lambda w: {}, label="reach: withdraw"),
    # Only the line manager can decide the manager step (PRD 7 "Decide manager step").
    Case("requests:step-decide", "POST",
         only(P.MANAGER, hide=_others(P.MANAGER)),
         kwargs=lambda w: {"id": manager_step(w).id},
         body=lambda w: {"decision": "approve", "comment": "", "version": remote_request(w).version},
         label="reach: decide manager step"),
    # Balance and ledger: own, team, all.
    Case("balances:figures", "GET", OWN_TEAM_ALL,
         kwargs=lambda w: {"employee_public_id": w.owner.public_id}, label="reach: balance"),
    Case("balances:ledger", "GET", OWN_TEAM_ALL,
         kwargs=lambda w: {"employee_public_id": w.owner.public_id}, label="reach: ledger"),
    # Files. The System Administrator is signed in, so the answer is 404, not 403.
    Case("files:download", "GET",
         only(P.OWNER, P.HR, hide=[*_others(P.OWNER, P.HR), P.SYSADMIN]),
         kwargs=lambda w: {"public_id": sick_request(w)[1].public_id}, label="reach: medical certificate"),
    Case("files:download", "GET",
         only(P.OWNER, P.MANAGER, P.HR, P.EXEC, hide=[P.PEER, P.OTHER_MANAGER, P.OUTSIDER, P.SYSADMIN]),
         kwargs=lambda w: {"public_id": proof_attachment(w).public_id}, label="reach: proof"),
    Case("files:download", "GET",
         only(P.OWNER, P.HR, P.EXEC, hide=[*_others(P.OWNER, P.HR, P.EXEC), P.SYSADMIN]),
         kwargs=lambda w: {"public_id": document(w, shared=True).attachment.public_id},
         label="reach: shared employee document"),
    Case("files:download", "GET",
         only(P.HR, P.EXEC, hide=[*_others(P.HR, P.EXEC), P.SYSADMIN]),
         kwargs=lambda w: {"public_id": document(w, shared=False).attachment.public_id},
         label="reach: unshared employee document"),
    # A delegation can be ended by its manager and by HR, not by the delegate.
    Case("organisation:delegation-end", "POST",
         only(P.MANAGER, P.HR, hide=[P.OTHER_MANAGER, P.EXEC]),
         kwargs=lambda w: {"public_id": delegation(w).public_id}, label="reach: end delegation"),
    # A notification belongs to one account.
    Case("notifications:read", "POST",
         only(P.MANAGER, hide=[*_others(P.MANAGER), P.SYSADMIN]),
         kwargs=lambda w: {"id": manager_notification(w).id}, label="reach: notification"),
]
```

- [ ] **Step 10: Register the cases with the harness**

In `backend/tests/test_permission_matrix.py`, append one entry to the `MATRIX_MODULES` list:

```python
    "tests.hardening.matrix_reach",
```

Run: `docker compose run --rm app pytest tests/test_permission_matrix.py -v -k "reach"`

Expected: every `reach:` case passes for all nine personas (18 cases, 162 checks). These are verification tests and should pass at once.

When one fails, read the persona and the status:

- A persona expected `404` receives `200`: a reach leak. Fix the selector of the owning app (`get_employee_for`, `get_request_for`, the files access rule) so that it raises `NotFound`.
- A persona expected `404` receives `403`, or the reverse: the view answers with the wrong one of the two refusals. Master decision D14 fixes the rule: role not allowed on the endpoint is 403, object outside reach is 404. Fix the view.
- `P.OWNER` or another allowed persona receives `404` for an object it built: the builder above used a keyword the service does not accept. Align the builder with the service signature in the master plan section 7.

- [ ] **Step 11: Write the reach tests that the harness cannot express**

These cover refusals where either 403 or 404 is acceptable, the limited fields a manager receives, department reach on the calendar, and delegated reach over time.

`backend/tests/hardening/test_reach.py`:

```python
"""Reach rules beyond single calls: writes, limited fields, department, delegation over time."""
from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
import time_machine
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.organisation import services as organisation_services
from tests.hardening import matrix_reach as objects
from tests.hardening.helpers import approve_fully, decide, frozen, make_request  # noqa: F401  (frozen is a fixture)
from tests.matrix import P

User = get_user_model()
REFUSED = (403, 404)


def _fresh(user):
    """A new instance, so that roles cached on the object are recomputed."""
    return User.objects.get(pk=user.pk)


@pytest.mark.django_db
@pytest.mark.parametrize("persona", [P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.EXEC, P.SYSADMIN])
def test_nobody_but_the_owner_changes_a_draft(world, client_for, persona):
    draft = objects.remote_draft(world)
    client = client_for(world.user_for(persona))
    detail = reverse("requests:request-detail", kwargs={"public_id": draft.public_id})
    submit = reverse("requests:request-submit", kwargs={"public_id": draft.public_id})
    attach = reverse("requests:request-attachments", kwargs={"public_id": draft.public_id})
    body = {"start_date": str(draft.start_date), "end_date": str(draft.end_date),
            "starts_at_midday": False, "ends_at_midday": False, "start_time": None, "end_time": None,
            "exceptional_event": None, "comment": "changed by someone else", "version": draft.version}

    assert client.patch(detail, body, format="json").status_code in REFUSED
    assert client.delete(detail).status_code in REFUSED
    assert client.post(submit, {"version": draft.version}, format="json").status_code in REFUSED
    assert client.post(attach, {"file": objects.pdf("x.pdf")}, format="multipart").status_code in REFUSED

    draft.refresh_from_db()
    assert draft.comment == ""
    assert draft.status == "draft"


@pytest.mark.django_db
@pytest.mark.parametrize("persona", [P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.EXEC])
def test_nobody_but_the_owner_opens_an_amendment(world, client_for, persona):
    request = objects.remote_request(world)
    approve_fully(world, request)
    url = reverse("requests:request-amendments", kwargs={"public_id": request.public_id})
    response = client_for(world.user_for(persona)).post(url, {"kind": "cancel", "reason": "not mine"}, format="json")
    assert response.status_code in REFUSED


@pytest.mark.django_db
def test_a_manager_receives_only_the_team_fields(world, client_for):
    url = reverse("organisation:employee-detail", kwargs={"public_id": world.owner.public_id})
    team_view = client_for(world.manager_user).get(url).json()
    hr_view = client_for(world.hr_user).get(url).json()

    private = {"date_of_birth", "gender", "personal_email", "address", "emergency_contact_name",
               "emergency_contact_phone", "contract_type", "contract_start_date", "contract_end_date", "hire_date"}
    assert private & set(team_view) == set(), f"a manager received private fields: {private & set(team_view)}"
    assert private <= set(hr_view)


@pytest.mark.django_db
def test_the_employee_list_is_cut_to_the_team(world, client_for):
    url = reverse("organisation:employee-list")
    ids = {row["public_id"] for row in client_for(world.manager_user).get(url, {"page_size": 100}).json()["results"]}
    assert ids == {str(world.owner.public_id), str(world.peer.public_id)}
    everyone = client_for(world.hr_user).get(url, {"page_size": 100}).json()["count"]
    assert everyone == 7  # ceo, hr, manager, owner, peer, other_manager, outsider


@pytest.mark.django_db
def test_requests_scopes_follow_roles(world, client_for):
    objects.remote_request(world)
    url = reverse("requests:request-list")
    assert client_for(world.owner_user).get(url, {"scope": "team"}).status_code == 403
    assert client_for(world.owner_user).get(url, {"scope": "all"}).status_code == 403
    assert client_for(world.manager_user).get(url, {"scope": "all"}).status_code == 403
    assert client_for(world.manager_user).get(url, {"scope": "team"}).json()["count"] == 1
    assert client_for(world.other_manager_user).get(url, {"scope": "team"}).json()["count"] == 0
    assert client_for(world.hr_user).get(url, {"scope": "all"}).json()["count"] == 1
    assert client_for(world.exec_user).get(url, {"scope": "all"}).json()["count"] == 1


@pytest.mark.django_db
def test_hr_queues_are_closed_to_everyone_else(world, client_for):
    url = reverse("requests:approval-list")
    for queue in ("hr", "certificates", "stuck"):
        for persona in (P.OWNER, P.MANAGER, P.EXEC):
            response = client_for(world.user_for(persona)).get(url, {"queue": queue})
            assert response.status_code == 403, (queue, persona)
        assert client_for(world.hr_user).get(url, {"queue": queue}).status_code == 200


@pytest.mark.django_db
def test_department_calendar_shows_peers_without_the_type(world, client_for, frozen):
    in_department = make_request(world, user=world.peer_user, employee=world.peer, request_type=world.remote,
                                 start=date(2026, 11, 9), end=date(2026, 11, 9))
    approve_fully(world, in_department)
    elsewhere = make_request(world, user=world.outsider_user, employee=world.outsider, request_type=world.remote,
                             start=date(2026, 11, 9), end=date(2026, 11, 9))
    decide(decide(elsewhere, world.other_manager_user), world.hr_user)

    url = reverse("calendar:feed")
    params = {"from": "2026-11-01", "to": "2026-11-30", "scope": "department"}
    entries = client_for(world.owner_user).get(url, params).json()["entries"]

    names = {entry["employee"]["public_id"] for entry in entries}
    assert str(world.peer.public_id) in names
    assert str(world.outsider.public_id) not in names
    peer_entry = next(e for e in entries if e["employee"]["public_id"] == str(world.peer.public_id))
    assert peer_entry["label"] == "remote"
    assert peer_entry["type_code"] is None and peer_entry["type_name"] is None
    assert peer_entry["status"] is None and peer_entry["request_public_id"] is None

    assert client_for(world.owner_user).get(url, {**params, "scope": "team"}).status_code == 403
    assert client_for(world.owner_user).get(url, {**params, "scope": "company"}).status_code == 403
    assert client_for(world.manager_user).get(url, {**params, "scope": "company"}).status_code == 403


@pytest.mark.django_db
def test_delegated_reach_exists_only_during_the_delegation(world, client_for):
    """`manager` delegates to `other_manager` from Monday 9 to Friday 13 November 2026."""
    with time_machine.travel(datetime(2026, 11, 2, 8, 0, tzinfo=UTC), tick=False) as clock:
        request = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.remote,
                               start=date(2026, 11, 16), end=date(2026, 11, 16))
        organisation_services.create_delegation(
            actor=world.manager_user, manager=world.manager, delegate=world.other_manager,
            start_date=date(2026, 11, 9), end_date=date(2026, 11, 13))

        detail = reverse("requests:request-detail", kwargs={"public_id": request.public_id})
        record = reverse("organisation:employee-detail", kwargs={"public_id": world.owner.public_id})
        balance = reverse("balances:figures", kwargs={"employee_public_id": world.owner.public_id})
        queue = reverse("requests:approval-list")

        def as_delegate():
            return client_for(_fresh(world.other_manager_user))

        # Before the delegation starts.
        assert as_delegate().get(detail).status_code == 404
        assert as_delegate().get(record).status_code == 404
        assert as_delegate().get(balance).status_code == 404

        # During the delegation: the delegate sees what the manager sees and can act.
        clock.move_to(datetime(2026, 11, 10, 8, 0, tzinfo=UTC))
        assert as_delegate().get(detail).status_code == 200
        assert as_delegate().get(record).status_code == 200
        assert as_delegate().get(balance).status_code == 200
        items = as_delegate().get(queue, {"queue": "mine"}).json()["results"]
        assert [item["request"]["public_id"] for item in items] == [str(request.public_id)]
        assert items[0]["via_delegation_from"]
        # The manager keeps the same rights during the delegation (REQ-11).
        assert client_for(_fresh(world.manager_user)).get(detail).status_code == 200

        # After it ends.
        clock.move_to(datetime(2026, 11, 14, 8, 0, tzinfo=UTC))
        assert as_delegate().get(detail).status_code == 404
        assert as_delegate().get(record).status_code == 404
        assert as_delegate().get(queue, {"queue": "mine"}).json()["count"] == 0
```

- [ ] **Step 12: Run the reach tests**

Run: `docker compose run --rm app pytest tests/hardening/test_reach.py -v`

Expected: 17 passed (6 + 5 parametrised, then 6 single tests). These are verification tests and should pass at once.

When one fails:

- A write by a non-owner succeeds: the service does not check the actor. In `apps/requests/services`, `update_request`, `discard_draft`, `submit` and `attach_file` must raise `NotAllowed("core.not_allowed")` when the actor is neither the request's employee nor an HR holder acting on behalf.
- A manager receives private fields: `organisation:employee-detail` picks the wrong serializer. It must use `EmployeeTeamOut` when the viewer is neither the employee, nor HR, nor EXEC.
- `test_the_employee_list_is_cut_to_the_team` counts differently for HR: the standard cast of the executed plan 02 differs from the master table in section 6.11. Align the cast, not the test.
- The delegation test fails on the first `404`: `organisation.reach.acting_for` ignores the dates. It must count a delegation only when `start_date <= on <= end_date` and `ended_at` is empty.

- [ ] **Step 13: Commit**

```bash
git add backend/tests/hardening/matrix_reach.py backend/tests/hardening/test_reach.py backend/tests/test_permission_matrix.py
git commit -m "test: row-level reach cases for every endpoint that takes an identifier"
```

### Task 2: Sensitive-content sweep

**Files:**
- Create: `backend/tests/hardening/test_sensitive_sweep.py`

**Interfaces:**
- Consumes: `tests.hardening.helpers` (`MARKER`, `pdf`, `frozen`, `give_balance`, `make_request`, `decide`); `apps.requests.services` (`attach_file`, `hr_correct`, `reclassify_as_annual`, `RequestData`); `apps.audit.models.AuditEvent`; `apps.notifications.models.Notification`; every GET route of master section 7; `openpyxl`.
- Produces: nothing used by later tasks.

The sweep places the string `ZZMARKERZZ` in a sick-leave comment and in the certificate's file name, takes the request through four stages, and at each stage fetches every reading endpoint as every persona. Three rules are asserted:

1. Only the requester and HR ever receive the marker.
2. Nobody, including the requester and HR, receives it from notifications, the audit trail, the calendar, a home screen, a report or an export.
3. It is in no audit row, no notification row and no log record.

- [ ] **Step 1: Write the sweep**

`backend/tests/hardening/test_sensitive_sweep.py`:

```python
"""The sick-leave comment and the certificate name reach only the requester and HR (review focus 9)."""
from __future__ import annotations

import json
import logging
from datetime import date
from io import BytesIO

import openpyxl
import pytest
from django.urls import reverse

from apps.audit.models import AuditEvent
from apps.notifications.models import Notification
from apps.requests import services as request_services
from apps.requests.services import RequestData
from tests.hardening.helpers import MARKER, decide, frozen, give_balance, make_request, pdf  # noqa: F401
from tests.matrix import P

MAY_SEE = {P.OWNER, P.HR}
EVERYONE = [P.OWNER, P.PEER, P.MANAGER, P.OTHER_MANAGER, P.OUTSIDER, P.HR, P.EXEC, P.SYSADMIN]
STAGES = ["pending", "approved", "corrected", "reclassified"]
PERIOD = {"from": "2026-11-01", "to": "2026-11-30"}
# What each report of plan 06 asks for (its `ReportQuery`): a period, a date (`on`), a year, or nothing.
REPORT_QUERIES = {
    "absences": PERIOD,
    "balances": {"on": "2026-11-30"},
    "waiting": {},
    "permission-hours": {"year": "2026"},
    "remote-days": {"year": "2026"},
    "certificates": {},
}


def _text(response) -> str:
    """The whole response as searchable text: headers, JSON body, or every cell of a workbook."""
    if getattr(response, "streaming", False):
        body = b"".join(response.streaming_content)
    else:
        body = response.content
    headers = "\n".join(f"{key}: {value}" for key, value in response.headers.items())
    if body[:2] == b"PK":
        workbook = openpyxl.load_workbook(BytesIO(body), read_only=True)
        cells = [str(cell) for sheet in workbook for row in sheet.iter_rows(values_only=True)
                 for cell in row if cell is not None]
        return headers + "\n" + "\n".join(workbook.sheetnames) + "\n" + "\n".join(cells)
    return headers + "\n" + body.decode("utf-8", errors="replace")


def _detail_urls(world, request, attachment):
    """Places where the requester and HR are entitled to the comment or the file name."""
    rid = {"public_id": request.public_id}
    return [
        ("request", reverse("requests:request-detail", kwargs=rid), {}),
        ("request attachments", reverse("requests:request-attachments", kwargs=rid), {}),
        ("request history", reverse("requests:request-history", kwargs=rid), {}),
        ("request amendments", reverse("requests:request-amendments", kwargs=rid), {}),
        ("download", reverse("files:download", kwargs={"public_id": attachment.public_id}), {}),
        ("requests mine", reverse("requests:request-list"), {"scope": "mine"}),
        ("requests team", reverse("requests:request-list"), {"scope": "team"}),
        ("requests all", reverse("requests:request-list"), {"scope": "all"}),
        ("requests decided", reverse("requests:request-list"), {"scope": "decided"}),
        ("queue mine", reverse("requests:approval-list"), {"queue": "mine"}),
        ("queue hr", reverse("requests:approval-list"), {"queue": "hr"}),
        ("queue certificates", reverse("requests:approval-list"), {"queue": "certificates"}),
        ("queue stuck", reverse("requests:approval-list"), {"queue": "stuck"}),
    ]


def _closed_urls(world):
    """Places where the marker must never appear, whoever asks."""
    owner = {"public_id": world.owner.public_id}
    urls = [
        ("notifications", reverse("notifications:list"), {"page_size": 100}),
        ("audit business", reverse("audit:business"), {"page_size": 100}),
        ("audit business export", reverse("audit:business-export"), {}),
        ("audit security", reverse("audit:security"), {"page_size": 100}),
        ("audit security export", reverse("audit:security-export"), {}),
        ("calendar department", reverse("calendar:feed"), {**PERIOD, "scope": "department"}),
        ("calendar team", reverse("calendar:feed"), {**PERIOD, "scope": "team"}),
        ("calendar company", reverse("calendar:feed"), {**PERIOD, "scope": "company"}),
        ("home me", reverse("reports:home-me"), {}),
        ("home team", reverse("reports:home-team"), {}),
        ("home overview", reverse("reports:home-overview"), {}),
        ("workspace summary", reverse("reports:workspace-summary"), {}),
        ("kpmg export", reverse("reports:kpmg-export"), PERIOD),
        ("kpmg default period", reverse("reports:kpmg-default-period"), {}),
        ("report filters", reverse("reports:report-filters"), {}),
        ("employee", reverse("organisation:employee-detail", kwargs=owner), {}),
        ("employee history", reverse("organisation:employee-history", kwargs=owner), {}),
        ("employees", reverse("organisation:employee-list"), {"page_size": 100}),
        ("balance", reverse("balances:figures", kwargs={"employee_public_id": world.owner.public_id}), {}),
        ("ledger", reverse("balances:ledger", kwargs={"employee_public_id": world.owner.public_id}), {}),
        ("admin status", reverse("core:admin-status"), {}),
        ("holiday impact", reverse("calendar:holiday-impact"), {"date": "2026-11-02"}),
    ]
    for name, query in REPORT_QUERIES.items():
        url = reverse("reports:report", kwargs={"name": name})
        urls.append((f"report {name}", url, query))
        urls.append((f"report {name} xlsx", url, {**query, "format": "xlsx"}))
    return urls


def _build(world, stage: str):
    give_balance(world, world.owner, "20")
    request = make_request(
        world, user=world.owner_user, employee=world.owner, request_type=world.sick,
        start=date(2026, 11, 2), end=date(2026, 11, 3), comment=f"{MARKER} migraine with fever",
    )
    link = request_services.attach_file(
        actor=world.owner_user, request=request, upload=pdf(f"{MARKER}-certificat.pdf"))
    request.refresh_from_db()
    if stage in ("approved", "corrected"):
        request = decide(request, world.hr_user)
    if stage == "corrected":
        request = request_services.hr_correct(
            actor=world.hr_user, request=request, reason="Returned one day earlier",
            data=RequestData(start_date=date(2026, 11, 2), end_date=date(2026, 11, 2),
                             comment=f"{MARKER} migraine with fever"),
        )
    if stage == "reclassified":
        request = request_services.reclassify_as_annual(actor=world.hr_user, request=request)
    return request, link.attachment


@pytest.mark.django_db
@pytest.mark.parametrize("stage", STAGES)
def test_the_marker_reaches_only_the_requester_and_hr(world, client_for, frozen, caplog, stage):
    caplog.set_level(logging.DEBUG)
    request, attachment = _build(world, stage)
    leaks: list[str] = []
    answered: dict[str, set[int]] = {}

    for persona in EVERYONE:
        client = client_for(world.user_for(persona))
        for label, url, params in _detail_urls(world, request, attachment):
            response = client.get(url, params)
            answered.setdefault(label, set()).add(response.status_code)
            if persona not in MAY_SEE and MARKER in _text(response):
                leaks.append(f"{stage}: {persona} read the marker in '{label}' ({url})")

    # The downloads above were audited; the closed places are read last so they include those rows.
    for persona in EVERYONE:
        client = client_for(world.user_for(persona))
        for label, url, params in _closed_urls(world):
            response = client.get(url, params)
            answered.setdefault(label, set()).add(response.status_code)
            if MARKER in _text(response):
                leaks.append(f"{stage}: {persona} read the marker in '{label}' ({url})")

    assert leaks == []

    # The sweep is only meaningful if every place answered 200 to somebody.
    silent = sorted(label for label, codes in answered.items() if 200 not in codes)
    assert silent == [], f"no persona received 200 from: {silent}"


@pytest.mark.django_db
@pytest.mark.parametrize("stage", STAGES)
def test_the_requester_and_hr_still_see_their_own_content(world, client_for, frozen, stage):
    request, attachment = _build(world, stage)
    detail = reverse("requests:request-detail", kwargs={"public_id": request.public_id})
    download = reverse("files:download", kwargs={"public_id": attachment.public_id})
    for user in (world.owner_user, world.hr_user):
        body = client_for(user).get(detail).json()
        assert MARKER in (body["comment"] or ""), f"{user.email} lost the comment at stage {stage}"
        assert body["comment_hidden"] is False
        assert any(MARKER in item["name"] for item in body["attachments"])
        assert client_for(user).get(download).status_code == 200
    for user in (world.manager_user, world.exec_user):
        body = client_for(user).get(detail).json()
        assert body["comment"] is None and body["comment_hidden"] is True
        assert body["attachments"] == [] or all(item["kind"] != "medical" for item in body["attachments"])
        assert body["certificate"] is None


@pytest.mark.django_db
@pytest.mark.parametrize("stage", STAGES)
def test_the_marker_is_in_no_audit_row_no_notification_and_no_log(world, client_for, frozen, caplog, stage):
    caplog.set_level(logging.DEBUG)
    request, attachment = _build(world, stage)
    download = reverse("files:download", kwargs={"public_id": attachment.public_id})
    assert client_for(world.hr_user).get(download).status_code == 200

    for event in AuditEvent.objects.all():
        row = json.dumps([event.action, event.object_label, event.changes], default=str)
        assert MARKER not in row, f"audit row {event.action} carries the marker"
    assert AuditEvent.objects.filter(action="attachment.downloaded").exists()

    for notification in Notification.objects.all():
        row = json.dumps([notification.event_code, notification.parameters], default=str)
        assert MARKER not in row, f"notification {notification.event_code} carries the marker"

    for record in caplog.records:
        assert MARKER not in json.dumps(record.__dict__, default=str), f"log record from {record.name} carries the marker"


@pytest.mark.django_db
def test_a_manager_is_told_of_the_sick_leave_without_any_detail(world, client_for, frozen):
    request, _ = _build(world, "pending")
    rows = client_for(world.manager_user).get(reverse("notifications:list")).json()["results"]
    declared = [row for row in rows if row["event"] == "sick.declared"]
    assert len(declared) == 1
    assert MARKER not in declared[0]["title"] + declared[0]["body"]
    assert declared[0]["link"].endswith(str(request.public_id))
```

- [ ] **Step 2: Run the sweep**

Run: `docker compose run --rm app pytest tests/hardening/test_sensitive_sweep.py -v`

Expected: 13 passed. This is a verification suite and should pass at once. Plan 05 already sweeps its own endpoints (`apps/reports/tests/test_privacy_sweep.py`) and plan 06 its reports; this sweep covers the whole API in four stages of one request.

When it fails:

- A leak line names a place and a persona. The fix belongs to the app that serves the place:
  - `request…`, `requests …`, `queue …`: the request serializer must return `comment: null`, `comment_hidden: true`, `certificate: null` and no `medical` attachment unless the viewer is the request's employee or an HR holder. The rule reads `Request.sensitive`, never the current type, so that a reclassified request stays restricted (master decision D17).
  - `request history`: the history must be built from audit rows whose `changes` were written with `audit.diff(..., redact=["comment"])`, and attachment events must not carry the file name for a sensitive request.
  - `audit …`: the audit row itself holds the text. Find the `audit.record` call for that action and pass the comment through `redact`; for attachments of kind `medical`, use the attachment's `public_id` as `object_label`, never `original_name`.
  - `notifications`: a `notify(...)` call passes the comment or the file name in `params`. Remove the parameter.
  - `report …`, `kpmg export`, `calendar …`, `home …`: the selector copies `comment`. Reports and exports never read that column (REP-08).
- "no persona received 200 from: [...]" names a place that the sweep could not exercise. The usual cause is a query parameter the endpoint requires and the sweep does not send. Read the owning plan's view, add the parameter to `PERIOD` or `REPORT_QUERIES`, and rerun. This is the one case where the test is aligned to the code.
- `test_the_requester_and_hr_still_see_their_own_content` fails at stage `reclassified`: the request lost its `sensitive` flag when its type changed. Keep the flag.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/hardening/test_sensitive_sweep.py
git commit -m "test: sweep every reading endpoint for leaked sick-leave detail"
```

### Task 3: Self-action sweep and "nobody to approve"

**Files:**
- Create: `backend/tests/hardening/test_self_action.py`

**Interfaces:**
- Consumes: `tests.hardening.helpers`; `apps.requests.services` (`resolve_approvers`, `can_act_on`, `decide_step`, `send_reminders_and_flags`, `check_certificate_deadlines`); `apps.requests.models` (`RequestStep`, `StepStatus`, `RequestStatus`); `apps.organisation.services` (`create_delegation`, `archive_employee`, `announce_delegation_transitions`); `apps.accounts.services.remove_role`; `apps.accounts.roles.Role`; `apps.balances.services.post_month_end_credits`; `apps.notifications.models.Notification`; routes `requests:step-decide`, `requests:step-record-on-behalf`, `requests:step-reassign`, `requests:request-correct`, `requests:request-cancel`, `requests:request-reclassify`, `requests:type-steps`, `requests:approval-list`.
- Produces: nothing used by later tasks.

- [ ] **Step 1: Write the tests**

`backend/tests/hardening/test_self_action.py`:

```python
"""Nobody decides their own request, and a request never approves itself (review focus 3, REQ-14)."""
from __future__ import annotations

from datetime import date, time, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone

from apps.accounts import services as account_services
from apps.accounts.roles import Role
from apps.balances import services as balance_services
from apps.core.errors import DomainError
from apps.notifications.models import Notification
from apps.organisation import services as organisation_services
from apps.requests import services as request_services
from apps.requests.models import Decision, RequestStatus, RequestStep, StepStatus
from tests.hardening.helpers import NOW, decide, frozen, give_balance, make_request, pending_step  # noqa: F401

User = get_user_model()
REFUSED = (400, 403, 404, 409)
MONDAY = date(2026, 11, 16)


def _fresh(user):
    return User.objects.get(pk=user.pk)


def _type_and_data(world, code: str) -> tuple[object, dict]:
    if code == "annual":
        return world.annual, {"start": MONDAY, "end": MONDAY}
    if code == "sick":
        return world.sick, {"start": date(2026, 11, 2), "end": date(2026, 11, 2)}
    if code == "exceptional":
        return world.exceptional, {"start": MONDAY, "end": MONDAY, "exceptional_event_id": world.event.id}
    if code == "permission":
        return world.permission, {"start": MONDAY, "end": MONDAY, "start_time": time(9, 0), "end_time": time(11, 0)}
    return world.remote, {"start": MONDAY, "end": MONDAY}


def _decide_url(step):
    return reverse("requests:step-decide", kwargs={"id": step.id})


@pytest.mark.django_db
@pytest.mark.parametrize("code", ["annual", "sick", "exceptional", "permission", "remote"])
def test_the_requester_cannot_decide_any_step_of_any_type(world, client_for, frozen, code):
    give_balance(world, world.owner, "20")
    request_type, data = _type_and_data(world, code)
    request = make_request(world, user=world.owner_user, employee=world.owner, request_type=request_type, **data)
    client = client_for(world.owner_user)

    while (step := pending_step(request)) is not None:
        request.refresh_from_db()
        body = {"decision": "approve", "comment": "", "version": request.version}
        assert client.post(_decide_url(step), body, format="json").status_code == 404
        assert not request_services.can_act_on(world.owner_user, step)
        assert world.owner_user not in request_services.resolve_approvers(step)
        with pytest.raises(DomainError):
            request_services.decide_step(actor=world.owner_user, step=step, decision=Decision.APPROVE,
                                         expected_version=request.version)
        on_behalf = reverse("requests:step-record-on-behalf", kwargs={"id": step.id})
        reassign = reverse("requests:step-reassign", kwargs={"id": step.id})
        assert client.post(on_behalf, {}, format="multipart").status_code == 403
        assert client.post(reassign, {}, format="json").status_code == 403
        # Let the rightful approver move the request on, then try again at the next step.
        approver = request_services.resolve_approvers(step)[0]
        request = decide(request, approver)

    request.refresh_from_db()
    assert request.status == RequestStatus.APPROVED
    deciders = set(RequestStep.objects.filter(request=request, status=StepStatus.APPROVED)
                   .values_list("decided_by_id", flat=True))
    assert world.owner.id not in deciders


@pytest.mark.django_db
def test_a_managers_own_request_goes_to_their_manager(world, client_for, frozen):
    request = make_request(world, user=world.manager_user, employee=world.manager,
                           request_type=world.remote, start=MONDAY, end=MONDAY)
    step = pending_step(request)
    assert request_services.resolve_approvers(step) == [world.exec_user]
    body = {"decision": "approve", "comment": "", "version": request.version}
    assert client_for(world.manager_user).post(_decide_url(step), body, format="json").status_code == 404
    mine = client_for(world.manager_user).get(reverse("requests:approval-list"), {"queue": "mine"}).json()
    assert mine["count"] == 0


@pytest.mark.django_db
def test_a_delegate_cannot_decide_their_own_request(world, client_for, frozen):
    organisation_services.create_delegation(
        actor=world.manager_user, manager=world.manager, delegate=world.owner,
        start_date=date(2026, 11, 2), end_date=date(2026, 11, 30))
    owner = _fresh(world.owner_user)
    mine = make_request(world, user=owner, employee=world.owner, request_type=world.remote, start=MONDAY, end=MONDAY)
    theirs = make_request(world, user=world.peer_user, employee=world.peer, request_type=world.remote,
                          start=MONDAY, end=MONDAY)

    own_step, peer_step = pending_step(mine), pending_step(theirs)
    assert request_services.resolve_approvers(own_step) == [world.manager_user]
    assert set(request_services.resolve_approvers(peer_step)) == {world.manager_user, world.owner_user}

    client = client_for(owner)
    body = {"decision": "approve", "comment": "", "version": mine.version}
    assert client.post(_decide_url(own_step), body, format="json").status_code == 404
    queue = client.get(reverse("requests:approval-list"), {"queue": "mine"}).json()["results"]
    assert [item["request"]["public_id"] for item in queue] == [str(theirs.public_id)]


@pytest.mark.django_db
def test_a_named_approver_who_is_the_requester_is_replaced_by_hr(world, client_for, frozen):
    steps_url = reverse("requests:type-steps", kwargs={"id": world.remote.id})
    chain = {"steps": [{"approver_rule": "named_person", "named_person": str(world.owner.public_id),
                        "mode": "approve", "reminder_after_days": 2, "flag_after_days": 4}]}
    assert client_for(world.hr_user).put(steps_url, chain, format="json").status_code == 200

    request = make_request(world, user=world.owner_user, employee=world.owner,
                           request_type=world.remote, start=MONDAY, end=MONDAY)
    step = pending_step(request)
    assert request_services.resolve_approvers(step) == [world.hr_user]
    body = {"decision": "approve", "comment": "", "version": request.version}
    assert client_for(world.owner_user).post(_decide_url(step), body, format="json").status_code == 404

    # For anybody else the named person decides.
    other = make_request(world, user=world.peer_user, employee=world.peer,
                         request_type=world.remote, start=MONDAY, end=MONDAY)
    assert request_services.resolve_approvers(pending_step(other)) == [world.owner_user]


@pytest.mark.django_db
def test_the_only_hr_holder_cannot_validate_or_alter_their_own_request(world, client_for, frozen):
    request = make_request(world, user=world.hr_user, employee=world.hr,
                           request_type=world.remote, start=MONDAY, end=MONDAY)
    request = decide(request, world.exec_user)                      # the line manager of `hr` is the CEO
    hr_step = pending_step(request)
    assert request_services.resolve_approvers(hr_step) == [world.exec_user]   # PRD 6.9: no other HR holder

    client = client_for(world.hr_user)
    rid = {"public_id": request.public_id}
    body = {"decision": "approve", "comment": "", "version": request.version}
    assert client.post(_decide_url(hr_step), body, format="json").status_code == 404
    on_behalf = {"decided_by": str(world.ceo.public_id), "decision": "approve",
                 "decided_at": timezone.now().isoformat(), "channel": "verbal",
                 "note": "He said yes", "version": request.version}
    assert client.post(reverse("requests:step-record-on-behalf", kwargs={"id": hr_step.id}),
                       on_behalf, format="multipart").status_code in REFUSED
    assert client.post(reverse("requests:step-reassign", kwargs={"id": hr_step.id}),
                       {"new_approver": str(world.peer.public_id), "reason": "Quicker"},
                       format="json").status_code in REFUSED
    assert client.post(reverse("requests:request-cancel", kwargs=rid),
                       {"reason": "Changed my mind"}, format="json").status_code in REFUSED
    correction = {"start_date": "2026-11-17", "end_date": "2026-11-17", "starts_at_midday": False,
                  "ends_at_midday": False, "start_time": None, "end_time": None, "reason": "Other day"}
    assert client.post(reverse("requests:request-correct", kwargs=rid),
                       correction, format="json").status_code in REFUSED

    request.refresh_from_db()
    hr_step.refresh_from_db()
    assert request.status == RequestStatus.PENDING
    assert request.start_date == MONDAY
    assert hr_step.status == StepStatus.PENDING

    request = decide(request, world.exec_user)
    assert request.status == RequestStatus.APPROVED


@pytest.mark.django_db
def test_hr_cannot_reclassify_their_own_sick_leave(world, client_for, frozen):
    request = make_request(world, user=world.hr_user, employee=world.hr, request_type=world.sick,
                           start=date(2026, 11, 2), end=date(2026, 11, 2))
    url = reverse("requests:request-reclassify", kwargs={"public_id": request.public_id})
    assert client_for(world.hr_user).post(url, {}, format="json").status_code in REFUSED
    request.refresh_from_db()
    assert request.request_type_id == world.sick.id


@pytest.mark.django_db
def test_the_ceo_has_no_manager_so_only_hr_decides(world, client_for, frozen):
    request = make_request(world, user=world.exec_user, employee=world.ceo,
                           request_type=world.remote, start=MONDAY, end=MONDAY)
    first = RequestStep.objects.filter(request=request).order_by("position").first()
    assert first.status == StepStatus.SKIPPED
    step = pending_step(request)
    assert request_services.resolve_approvers(step) == [world.hr_user]
    body = {"decision": "approve", "comment": "", "version": request.version}
    assert client_for(world.exec_user).post(_decide_url(step), body, format="json").status_code == 404
    assert request.status == RequestStatus.PENDING
    assert decide(request, world.hr_user).status == RequestStatus.APPROVED


@pytest.mark.django_db
def test_with_no_hr_holder_the_ceos_request_waits_and_administrators_are_told(world, frozen):
    account_services.remove_role(actor=world.sysadmin_user, user=world.hr_user, role=Role.HR)
    request = make_request(world, user=world.exec_user, employee=world.ceo,
                           request_type=world.remote, start=MONDAY, end=MONDAY)
    step = pending_step(request)
    assert step is not None and request_services.resolve_approvers(step) == []
    assert request.status == RequestStatus.PENDING
    assert Notification.objects.filter(user=world.sysadmin_user, event_code="hr_step.unattended").count() == 1


@pytest.mark.django_db
def test_an_archived_manager_leaves_the_step_pending_and_flagged(world, client_for, frozen):
    organisation_services.archive_employee(actor=world.hr_user, employee=world.manager,
                                           leaving_date=date(2026, 11, 1), reason="Left the company")
    request = make_request(world, user=world.owner_user, employee=world.owner,
                           request_type=world.remote, start=MONDAY, end=MONDAY)
    step = pending_step(request)
    assert step.approver_rule == "line_manager"
    assert step.status == StepStatus.PENDING          # not skipped (master decision D13)
    assert step.flagged_at is not None
    assert request_services.resolve_approvers(step) == []
    stuck = client_for(world.hr_user).get(reverse("requests:approval-list"), {"queue": "stuck"}).json()["results"]
    assert [item["request"]["public_id"] for item in stuck] == [str(request.public_id)]


@pytest.mark.django_db
def test_no_job_ever_approves_a_request(world, frozen):
    give_balance(world, world.owner, "20")
    waiting = [
        make_request(world, user=world.owner_user, employee=world.owner, request_type=world.annual,
                     start=MONDAY, end=MONDAY),
        make_request(world, user=world.owner_user, employee=world.owner, request_type=world.sick,
                     start=date(2026, 11, 2), end=date(2026, 11, 2)),
    ]
    for days in (1, 3, 5, 30, 90):
        later = NOW + timedelta(days=days)
        request_services.send_reminders_and_flags(now=later)
        request_services.check_certificate_deadlines(now=later)
        organisation_services.announce_delegation_transitions(today=later.date())
        balance_services.post_month_end_credits(today=later.date())
    for request in waiting:
        request.refresh_from_db()
        assert request.status == RequestStatus.PENDING
    decided = RequestStep.objects.filter(request__in=waiting, status=StepStatus.APPROVED)
    assert not decided.exists()
```

- [ ] **Step 2: Run the tests**

Run: `docker compose run --rm app pytest tests/hardening/test_self_action.py -v`

Expected: 14 passed. This is a verification suite and should pass at once.

When it fails:

- The requester's decision is accepted, or an HR holder alters their own request. Plan 03a already refuses an HR holder who corrects, cancels, reclassifies or records a decision on their own request (its contract note 18); it does not list reassignment, so `reassign_step` is where the guard is most likely missing. Add one guard and call it first in `decide_step`, `record_on_behalf`, `reassign_step`, `hr_correct`, `hr_cancel` and `reclassify_as_annual` of `apps/requests/services`:

```python
def forbid_own_request(actor, request) -> None:
    """Nobody acts on their own request, in any role (PRD 3)."""
    employee = reach.employee_of(actor)
    if employee is not None and employee.id == request.employee_id:
        raise NotAllowed("request.own_request")
```

  `reach` is `apps.organisation.reach` and `NotAllowed` is `apps.core.errors.NotAllowed`. The API then answers 403; the step endpoints keep answering 404 because `can_act_on` is false for the requester.
- `resolve_approvers` returns the requester: section 6.9 of the PRD is not applied. The line-manager rule excludes a delegate who is the requester; the HR rule excludes the requester and falls back to EXEC holders except the requester; a named person who is the requester is treated as the HR rule.
- The archived-manager test finds the step `skipped`: apply master decision D13. A step is skipped only when `employee.manager_id` is empty.
- `test_no_job_ever_approves_a_request` fails: a job changes a step's status. Jobs may only set `reminded_at`, `flagged_at` and raise notifications.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/hardening/test_self_action.py
git commit -m "test: nobody decides their own request and nothing approves itself"
```

### Task 4: Rule edges across modules

**Files:**
- Create: `backend/tests/hardening/test_rule_edges.py`

**Interfaces:**
- Consumes: `tests.hardening.helpers`; routes `requests:request-preview`, `requests:request-list`, `requests:request-submit`, `requests:type-steps`, `requests:type-detail`, `calendar:holiday-impact`, `reports:report`, `reports:kpmg-export`; `apps.calendar.services.create_holiday`; `apps.requests.selectors.day_rows`; `apps.balances.selectors` (`balance_on`, `balances_at`); `apps.balances.services` (`month_credit`, `post_month_end_credits`); `apps.balances.models.LedgerEntry`; `apps.settings.services` as `settings_service`; `apps.organisation.services.archive_employee`; `apps.organisation.selectors.full_name`.
- Produces: nothing used by later tasks.

This task verifies, end to end and across apps, review-focus items 1 (half-days and non-working boundaries), 2 (periods that cross a boundary), 5 (configuration changed mid-flight) and 6 (the clock). The unit tests of plans 03a, 04 and 06 cover each rule alone; these tests follow one request through every module.

Calendar used by the tests: Saturday 14 November 2026, Monday 16, Tuesday 17; Monday 28 December 2026 to Wednesday 6 January 2027, with Friday 1 January entered as a public holiday.

- [ ] **Step 1: Write the tests**

`backend/tests/hardening/test_rule_edges.py`:

```python
"""Review focus 1, 2, 5 and 6, followed through requests, ledger, reports and the KPMG file."""
from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO

import openpyxl
import pytest
from django.urls import reverse

from apps.balances import selectors as balance_selectors
from apps.balances import services as balance_services
from apps.balances.models import LedgerEntry
from apps.calendar import services as calendar_services
from apps.organisation import selectors as organisation_selectors
from apps.organisation import services as organisation_services
from apps.organisation.models import Employee
from apps.requests import selectors as request_selectors
from apps.requests.models import RequestStatus, RequestStep
from apps.settings import services as settings_service
from tests.hardening.helpers import approve_fully, decide, frozen, give_balance, make_request  # noqa: F401

SAT, SUN, MON, TUE, WED = (date(2026, 11, d) for d in (14, 15, 16, 17, 18))


def _preview(client, **fields):
    body = {"type": "remote", "start_date": None, "end_date": None, "starts_at_midday": False,
            "ends_at_midday": False, "start_time": None, "end_time": None,
            "exceptional_event": None, "override": False}
    body.update({key: (value.isoformat() if isinstance(value, date) else value) for key, value in fields.items()})
    response = client.post(reverse("requests:request-preview"), body, format="json")
    assert response.status_code == 200, response.content
    return response.json()


def _codes(preview) -> set[str]:
    return {problem["code"] for problem in preview["problems"]}


# ---------------------------------------------------------------- focus 1: boundaries

@pytest.mark.django_db
def test_a_weekend_inside_a_request_is_not_counted(world, client_for, frozen):
    preview = _preview(client_for(world.owner_user), start_date=SAT, end_date=MON)
    assert preview["quantity"] == "1.00"
    assert preview["problems"] == []
    assert {(row["date"], row["reason"]) for row in preview["skipped_days"]} == {
        ("2026-11-14", "weekend"), ("2026-11-15", "weekend")}


@pytest.mark.django_db
def test_a_half_day_on_a_saturday_is_refused_with_its_own_message(world, client_for, frozen):
    preview = _preview(client_for(world.owner_user), start_date=SAT, end_date=MON, starts_at_midday=True)
    assert "request.half_day_on_non_working_day" in _codes(preview)


@pytest.mark.django_db
def test_a_single_day_flagged_at_both_ends_is_refused(world, client_for, frozen):
    client = client_for(world.owner_user)
    preview = _preview(client, start_date=MON, end_date=MON, starts_at_midday=True, ends_at_midday=True)
    assert preview["problems"], "a day that is both afternoon-only and morning-only must be refused"
    assert all(code.startswith("request.") for code in _codes(preview))

    body = {"type": "remote", "start_date": "2026-11-16", "end_date": "2026-11-16", "starts_at_midday": True,
            "ends_at_midday": True, "start_time": None, "end_time": None, "exceptional_event": None, "comment": ""}
    created = client.post(reverse("requests:request-list"), body, format="json")
    if created.status_code == 201:      # a draft may be saved; it must not be sendable
        draft = created.json()
        sent = client.post(reverse("requests:request-submit", kwargs={"public_id": draft["public_id"]}),
                           {"version": draft["version"]}, format="json")
        assert sent.status_code == 400
    else:
        assert created.status_code == 400


@pytest.mark.django_db
def test_a_request_of_only_non_working_days_is_refused(world, client_for, frozen):
    preview = _preview(client_for(world.owner_user), start_date=SAT, end_date=SUN)
    assert "request.no_working_day" in _codes(preview)


@pytest.mark.django_db
def test_a_holiday_at_the_end_is_skipped_and_cannot_carry_a_half_day(world, client_for, frozen):
    calendar_services.create_holiday(actor=world.hr_user, date=TUE, name_fr="Jour férié", name_en="Public holiday")
    client = client_for(world.owner_user)

    preview = _preview(client, start_date=MON, end_date=TUE)
    assert preview["quantity"] == "1.00"
    assert ("2026-11-17", "holiday") in {(row["date"], row["reason"]) for row in preview["skipped_days"]}

    preview = _preview(client, start_date=MON, end_date=TUE, ends_at_midday=True)
    assert "request.half_day_on_non_working_day" in _codes(preview)


@pytest.mark.django_db
def test_morning_and_afternoon_of_one_day_can_hold_two_different_requests(world, client_for, frozen):
    give_balance(world, world.owner, "5")
    morning = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.annual,
                           start=MON, end=MON, ends_at_midday=True)
    afternoon = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.remote,
                             start=MON, end=MON, starts_at_midday=True)
    assert morning.quantity == Decimal("0.5") and afternoon.quantity == Decimal("0.5")
    preview = _preview(client_for(world.owner_user), start_date=MON, end_date=MON, ends_at_midday=True)
    assert "request.overlap" in _codes(preview)


# ---------------------------------------------------------------- focus 2: crossing a boundary

def _kpmg_row(client, world, start: str, end: str) -> list:
    response = client.get(reverse("reports:kpmg-export"), {"from": start, "to": end})
    assert response.status_code == 200, response.content
    body = b"".join(response.streaming_content) if getattr(response, "streaming", False) else response.content
    sheet = openpyxl.load_workbook(BytesIO(body), read_only=True).worksheets[0]
    for row in sheet.iter_rows(values_only=True):
        if str(row[0]) == str(world.owner.employee_number):
            return list(row)
    raise AssertionError("the owner is missing from the KPMG file")


def _owner_total(client, world, start: str, end: str) -> Decimal:
    """Sum of the first numeric column of the absence report over the owner's rows."""
    report = client.get(reverse("reports:report", kwargs={"name": "absences"}), {"from": start, "to": end}).json()
    number_key = next(column["key"] for column in report["columns"] if column["kind"] == "number")
    name = organisation_selectors.full_name(world.owner)
    rows = [row for row in report["rows"] if any(name in str(value) for value in row.values())]
    return sum((Decimal(str(row[number_key])) for row in rows), Decimal("0"))


@pytest.mark.django_db
def test_leave_across_the_new_year_is_split_everywhere(world, client_for, frozen):
    """28 December 2026 to 6 January 2027: 4 working days in December, 3 in January."""
    calendar_services.create_holiday(actor=world.hr_user, date=date(2027, 1, 1),
                                     name_fr="Jour de l'an", name_en="New Year's Day", recurs_yearly=True)
    give_balance(world, world.owner, "20")
    request = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.annual,
                           start=date(2026, 12, 28), end=date(2027, 1, 6))
    assert request.quantity == Decimal("7")
    request = approve_fully(world, request)
    assert request.status == RequestStatus.APPROVED

    # Ledger: one entry per month, dated the first leave day of the month (PRD 6.3).
    taken = list(LedgerEntry.objects.filter(employee=world.owner, kind="taken")
                 .order_by("effective_date").values_list("effective_date", "amount"))
    assert taken == [(date(2026, 12, 28), Decimal("-4")), (date(2027, 1, 4), Decimal("-3"))]
    assert balance_selectors.balance_on(world.owner.id, date(2026, 12, 27)) == Decimal("20")
    assert balance_selectors.balance_on(world.owner.id, date(2026, 12, 31)) == Decimal("16")
    assert balance_selectors.balance_on(world.owner.id, date(2027, 1, 31)) == Decimal("13")
    assert balance_selectors.balances_at(date(2026, 12, 31), employee_ids=[world.owner.id]) == {
        world.owner.id: Decimal("16")}

    # Day rows clipped to each month (the basis of reports and export).
    def portions(start, end):
        rows = request_selectors.day_rows(start=start, end=end, statuses=["approved"],
                                          employee_ids=[world.owner.id])
        return sum((row.portion for row in rows), Decimal("0"))
    assert portions(date(2026, 12, 1), date(2026, 12, 31)) == Decimal("4")
    assert portions(date(2027, 1, 1), date(2027, 1, 31)) == Decimal("3")

    hr = client_for(world.hr_user)
    assert _owner_total(hr, world, "2026-12-01", "2026-12-31") == Decimal("4")
    assert _owner_total(hr, world, "2027-01-01", "2027-01-31") == Decimal("3")

    # KPMG file, columns of REP-04: number, name, department, annual, sick, exceptional,
    # permission hours, remote days, balance at period end, meal tickets.
    december = _kpmg_row(hr, world, "2026-12-01", "2026-12-31")
    january = _kpmg_row(hr, world, "2027-01-01", "2027-01-31")
    assert Decimal(str(december[3])) == Decimal("4") and Decimal(str(january[3])) == Decimal("3")
    assert Decimal(str(december[8])) == Decimal("16") and Decimal(str(january[8])) == Decimal("13")
    assert int(december[9]) == 21 - 4 and int(january[9]) == 21 - 3


@pytest.mark.django_db
def test_cancelling_split_leave_restores_each_month(world, client_for, frozen):
    give_balance(world, world.owner, "20")
    request = approve_fully(world, make_request(
        world, user=world.owner_user, employee=world.owner, request_type=world.annual,
        start=date(2026, 11, 30), end=date(2026, 12, 2)))
    response = client_for(world.hr_user).post(
        reverse("requests:request-cancel", kwargs={"public_id": request.public_id}),
        {"reason": "Project deadline moved"}, format="json")
    assert response.status_code == 200
    taken = list(LedgerEntry.objects.filter(employee=world.owner, kind="taken")
                 .order_by("effective_date").values_list("effective_date", "amount"))
    assert taken == [(date(2026, 11, 30), Decimal("-1")), (date(2026, 12, 1), Decimal("-2"))]
    restored = sorted(LedgerEntry.objects.filter(employee=world.owner, kind="restored")
                      .values_list("amount", flat=True))
    assert restored == [Decimal("1"), Decimal("2")]            # one restoration per month, mirroring the two entries
    assert balance_selectors.balance_on(world.owner.id, date(2026, 12, 31)) == Decimal("20")
    assert LedgerEntry.objects.filter(employee=world.owner).count() == 5   # nothing edited or deleted (BAL-01)


# ---------------------------------------------------------------- focus 5: configuration mid-flight

@pytest.mark.django_db
def test_changing_configuration_does_not_touch_requests_already_sent(world, client_for, frozen):
    give_balance(world, world.peer, "20")
    pending = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.remote,
                           start=MON, end=MON)
    approved = approve_fully(world, make_request(
        world, user=world.peer_user, employee=world.peer, request_type=world.annual, start=MON, end=WED))
    steps_before = list(RequestStep.objects.filter(request=pending).order_by("position")
                        .values_list("position", "approver_rule", "mode", "status"))
    ledger_before = list(LedgerEntry.objects.filter(employee=world.peer).values_list("kind", "amount"))

    hr = client_for(world.hr_user)
    one_step = {"steps": [{"approver_rule": "hr_role", "named_person": None, "mode": "approve",
                           "reminder_after_days": 1, "flag_after_days": 1}]}
    assert hr.put(reverse("requests:type-steps", kwargs={"id": world.remote.id}), one_step, format="json").status_code == 200
    assert hr.patch(reverse("requests:type-detail", kwargs={"id": world.remote.id}),
                    {"cap_quantity": "0.50", "is_active": False}, format="json").status_code == 200
    calendar_services.create_holiday(actor=world.hr_user, date=TUE, name_fr="Jour férié", name_en="Public holiday")
    settings_service.set_value(actor=world.hr_user, key="working_week", value=[1, 2, 3, 4])

    # The pending request keeps the chain it was sent with (REQ-04) and still completes.
    assert list(RequestStep.objects.filter(request=pending).order_by("position")
                .values_list("position", "approver_rule", "mode", "status")) == steps_before
    done = decide(decide(pending, world.manager_user), world.hr_user)
    assert done.status == RequestStatus.APPROVED

    # The approved leave keeps its quantity and its ledger entries (master decision D22).
    approved.refresh_from_db()
    assert approved.quantity == Decimal("3")
    assert list(LedgerEntry.objects.filter(employee=world.peer).values_list("kind", "amount")) == ledger_before

    # HR is shown the approved request that the new holiday touches.
    impact = hr.get(reverse("calendar:holiday-impact"), {"date": "2026-11-17"})
    assert str(approved.public_id) in impact.content.decode()

    # New requests follow the new configuration.
    body = {"type": "remote", "start_date": "2026-11-23", "end_date": "2026-11-23", "starts_at_midday": False,
            "ends_at_midday": False, "start_time": None, "end_time": None, "exceptional_event": None, "comment": ""}
    refused = client_for(world.outsider_user).post(reverse("requests:request-list"), body, format="json")
    assert refused.status_code == 400, "a deactivated type must refuse new requests"


# ---------------------------------------------------------------- focus 6: the clock

def _credits(**filters):
    return LedgerEntry.objects.filter(kind="credit", **filters)


@pytest.mark.django_db
def test_month_end_credit_catches_up_is_idempotent_and_pro_rates(world, frozen):
    Employee.objects.update(hire_date=date(2020, 1, 1))
    Employee.objects.filter(pk=world.outsider.pk).update(hire_date=date(2027, 2, 8))
    for employee in (world.outsider, world.peer):
        employee.refresh_from_db()
    settings_service.set_value(actor=world.hr_user, key="credit_start_date", value="2026-11-01")

    # Nothing is posted before the first month end.
    assert balance_services.post_month_end_credits(today=date(2026, 11, 29)) == 0

    # The server was down for three months: November, December and January are posted in one run.
    assert balance_services.post_month_end_credits(today=date(2027, 2, 1)) == 18      # 6 employees x 3 months
    assert set(_credits().values_list("period", flat=True)) == {"2026-11", "2026-12", "2027-01"}
    assert set(_credits().values_list("amount", flat=True)) == {Decimal("2.5")}
    assert set(_credits(period="2026-11").values_list("effective_date", flat=True)) == {date(2026, 11, 30)}
    assert not _credits(employee=world.outsider).exists()                               # not hired yet

    # Twice in a day changes nothing.
    assert balance_services.post_month_end_credits(today=date(2027, 2, 1)) == 0
    assert _credits().count() == 18

    # The peer leaves on 10 March 2027.
    frozen.move_to(datetime(2027, 3, 10, 8, 0, tzinfo=UTC))
    organisation_services.archive_employee(actor=world.hr_user, employee=world.peer,
                                           leaving_date=date(2027, 3, 10), reason="Resignation")
    world.peer.refresh_from_db()

    # February has 28 days: hired on the 8th means 21 days, 2.5 x 21 / 28 = 1.875, rounded to 2.0.
    assert balance_services.month_credit(world.outsider, 2027, 2) == Decimal("2.0")
    # March: 10 days of 31, 2.5 x 10 / 31 = 0.81, rounded to 1.0. April: nothing.
    assert balance_services.month_credit(world.peer, 2027, 3) == Decimal("1.0")
    assert balance_services.month_credit(world.peer, 2027, 4) == Decimal("0")

    frozen.move_to(datetime(2027, 5, 1, 8, 0, tzinfo=UTC))
    balance_services.post_month_end_credits(today=date(2027, 5, 1))
    assert _credits(employee=world.outsider, period="2027-02").get().amount == Decimal("2.0")
    assert _credits(employee=world.outsider, period="2027-03").get().amount == Decimal("2.5")
    assert _credits(employee=world.peer, period="2027-03").get().amount == Decimal("1.0")
    assert not _credits(employee=world.peer, period="2027-04").exists()
    assert _credits(period="2027-02").values("employee_id").distinct().count() == _credits(period="2027-02").count()


@pytest.mark.django_db
def test_no_credit_is_posted_while_the_start_date_is_empty(world, frozen):
    assert settings_service.get("credit_start_date") is None
    assert balance_services.post_month_end_credits(today=date(2027, 6, 1)) == 0
    assert not _credits().exists()
```

- [ ] **Step 2: Run the tests**

Run: `docker compose run --rm app pytest tests/hardening/test_rule_edges.py -v`

Expected: 11 passed. This is a verification suite and should pass at once.

When it fails:

- A quantity or a problem code differs: the rule in `apps/calendar/workdays.py` or `apps/requests/services` departs from PRD 6.1 and master decision D12. Fix the rule.
- The ledger split is wrong: `BalancePort.post_taken` must post one entry per calendar month the leave touches, dated the first leave day in that month, with a negative amount; `post_restored` posts the mirror entries with a positive amount.
- `_kpmg_row` cannot find the owner or a column is off by one: the export departs from the column order of REP-04, or the open item "KPMG sample file" changed the layout. If the layout was changed on purpose, update the three column indexes in the test and say so in `docs/decisions.md`. Otherwise fix the export.
- The KPMG call answers 400: plan 06 named the period parameters differently from `from` and `to`. Use its names in `_kpmg_row` and `_owner_total`.
- `set_value` refuses `"2026-11-01"`: the `date_or_null` kind expects a `date`. Pass `date(2026, 11, 1)` instead; the stored value must still read back as a `date` from `settings_service.get`.
- The credit count is not 18: check that the cast has seven active employees and that the job skips an employee not yet hired at the month end.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/hardening/test_rule_edges.py
git commit -m "test: follow boundary, split-period, mid-flight and clock cases across modules"
```

### Task 5: Nightly backup and restore

**Files:**
- Create: `backend/apps/core/backup.py`
- Create: `backend/apps/core/management/commands/backup_now.py`
- Create: `backend/apps/core/management/commands/restore_backup.py`
- Create: `backend/apps/core/tests/test_backup.py`
- Create: `scripts/server/restore.sh`
- Create: `scripts/server/tests/restore.test.sh`
- Modify: `backend/apps/core/tasks.py` (append the `ops.backup` task)

**Interfaces:**
- Consumes:
  - Plan 01a: `apps.core.jobs.recorded` (a dictionary returned by the job is stored as JSON in `JobStatus.last_detail`), `apps.core.jobs.RETRY`, `apps.core.models.JobStatus`, `procrastinate.contrib.django.app`; `admin/status`, whose `backup` block reads `size_bytes` and `storage_used_bytes` from the last successful `ops.backup` run (its contract note 29); `settings.DATABASES["default"]`; the backend image, which carries `pg_dump` 17 and `gpg`; fixed paths `/data/files` and `/data/backups`; environment variable `BACKUP_PASSPHRASE`.
  - Plan 01b: `scripts/server/lib.sh` (`ROOT`, `log`, `die`, `env_value`, `compose`, `require_server_stack`); `scripts/server/dump.sh`, which writes pre-update dumps to `/data/backups/pre-update/<UTC time>-<label>.dump.gpg` with `gpg --symmetric --cipher-algo AES256` and `BACKUP_PASSPHRASE`; the style of `scripts/server/tests/update.test.sh`.
- Produces:
  - `apps.core.backup.run_backup(*, now: datetime | None = None, backup_dir: Path | None = None, files_dir: Path | None = None, keep_days: int = 14, database: str | None = None) -> BackupResult`
  - `BackupResult(at: str, database_file: str, files_file: str, size_bytes: int, storage_used_bytes: int, removed: list[str])` with `as_status() -> dict` (the job's return value)
  - `apps.core.backup.latest(backup_dir: Path | None = None) -> tuple[Path, Path] | None`
  - `apps.core.backup.restore_database(*, dump_file: Path, target_db: str, create: bool) -> None` (reads the nightly dumps and the dumps of `dump.sh`: same format, same encryption)
  - `apps.core.backup.restore_files(*, archive_file: Path, files_dir: Path | None = None) -> int`
  - `apps.core.backup.count_rows(database: str, table: str) -> int`, `apps.core.backup.drop_database(name: str) -> None`
  - `apps.core.backup.BackupError`
  - Job `ops.backup` (daily 23:30 in Tunis, cron `30 22 * * *` in UTC); management commands `backup_now` and `restore_backup`.
  - `scripts/server/restore.sh --check [db-file]` and `scripts/server/restore.sh --replace [db-file] [files-file]`.
  - File names: `db-YYYYMMDD-HHMMSS.dump.gpg` and `files-YYYYMMDD-HHMMSS.tar.gz.gpg` in `/data/backups`, local time. The folder `/data/backups/pre-update/` belongs to `dump.sh` and is never pruned by this job.

- [ ] **Step 1: Confirm the tools and the volumes**

Run: `docker compose run --rm app sh -c "pg_dump --version && pg_restore --version && createdb --version && gpg --version | head -1 && ls -d /data/files /data/backups"`

Expected: `pg_dump (PostgreSQL) 17.x`, `pg_restore (PostgreSQL) 17.x`, `createdb (PostgreSQL) 17.x`, `gpg (GnuPG) 2.x`, then the two folders. Plan 01a builds the image with these tools and mounts both volumes on `app` and `worker`; plan 01b's `dump.sh` relies on the same.

If the last line reports a missing folder for the `worker` service (`docker compose run --rm worker ls -d /data/files /data/backups`), add the missing volume line to `worker` in `compose.yaml`, copying it from `app`: the job runs in the worker.

- [ ] **Step 2: Write the failing tests**

`backend/apps/core/tests/test_backup.py`:

```python
"""The nightly backup is encrypted, restorable and pruned (PRD 12.7, NFR-04)."""
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.urls import reverse

from apps.core import backup
from apps.core.models import JobStatus

User = get_user_model()
pytestmark = pytest.mark.django_db(transaction=True)
NOW = datetime(2026, 11, 2, 22, 30, tzinfo=UTC)


@pytest.fixture
def dirs(tmp_path, monkeypatch):
    backups, files = tmp_path / "backups", tmp_path / "files"
    files.mkdir()
    (files / "ab").mkdir()
    (files / "ab" / "0123456789.bin").write_bytes(b"stored attachment bytes")
    monkeypatch.setenv("BACKUP_PASSPHRASE", "correct horse battery staple")
    monkeypatch.setattr(backup, "BACKUP_DIR", backups)
    monkeypatch.setattr(backup, "FILES_DIR", files)
    return backups, files


def test_backup_writes_two_encrypted_files(world, dirs):
    backups, _ = dirs
    result = backup.run_backup(now=NOW)

    database_file, files_file = backups / result.database_file, backups / result.files_file
    assert result.database_file == "db-20261102-233000.dump.gpg"          # 22:30 UTC is 23:30 in Tunis
    assert result.files_file == "files-20261102-233000.tar.gz.gpg"
    assert database_file.stat().st_size > 0 and files_file.stat().st_size > 0
    assert result.size_bytes == database_file.stat().st_size + files_file.stat().st_size
    assert result.storage_used_bytes == result.size_bytes

    raw = database_file.read_bytes()
    assert not raw.startswith(b"PGDMP"), "the dump was written without encryption"
    assert world.hr_user.email.encode() not in raw
    assert b"stored attachment bytes" not in files_file.read_bytes()
    assert sorted(p.name for p in backups.iterdir()) == [result.database_file, result.files_file]


def test_backup_restores_into_a_scratch_database(world, dirs):
    backups, _ = dirs
    result = backup.run_backup(now=NOW)
    scratch = f"iris_restore_check_{uuid.uuid4().hex[:8]}"
    try:
        backup.restore_database(dump_file=backups / result.database_file, target_db=scratch, create=True)
        assert backup.count_rows(scratch, "accounts_user") == User.objects.count()
        assert backup.count_rows(scratch, "accounts_user") >= 8
    finally:
        backup.drop_database(scratch)


def test_files_archive_round_trip(world, dirs, tmp_path):
    backups, _ = dirs
    result = backup.run_backup(now=NOW)
    target = tmp_path / "restored"
    count = backup.restore_files(archive_file=backups / result.files_file, files_dir=target)
    assert count == 1
    assert (target / "ab" / "0123456789.bin").read_bytes() == b"stored attachment bytes"


def test_a_wrong_passphrase_cannot_decrypt(world, dirs, tmp_path, monkeypatch):
    backups, _ = dirs
    result = backup.run_backup(now=NOW)
    monkeypatch.setenv("BACKUP_PASSPHRASE", "not the passphrase")
    with pytest.raises(backup.BackupError):
        backup.restore_files(archive_file=backups / result.files_file, files_dir=tmp_path / "restored")
    assert not (tmp_path / "restored" / "ab").exists()


def test_a_missing_passphrase_fails_and_writes_nothing(world, dirs, monkeypatch):
    backups, _ = dirs
    monkeypatch.setenv("BACKUP_PASSPHRASE", "")
    with pytest.raises(backup.BackupError, match="BACKUP_PASSPHRASE"):
        backup.run_backup(now=NOW)
    assert not backups.exists() or list(backups.iterdir()) == []


def test_a_failed_dump_leaves_no_file_behind(world, dirs):
    backups, _ = dirs
    with pytest.raises(backup.BackupError, match="pg_dump"):
        backup.run_backup(now=NOW, database="database_that_does_not_exist")
    assert [p.name for p in backups.iterdir()] == []


def test_files_older_than_fourteen_days_are_removed(world, dirs):
    backups, _ = dirs
    backups.mkdir()
    old = ["db-20261018-233000.dump.gpg", "files-20261018-233000.tar.gz.gpg"]        # 15 days before
    kept = ["db-20261020-233000.dump.gpg", "files-20261020-233000.tar.gz.gpg"]       # 13 days before
    for name in [*old, *kept, "notes.txt"]:
        (backups / name).write_bytes(b"x")

    result = backup.run_backup(now=NOW)

    assert sorted(result.removed) == sorted(old)
    names = {p.name for p in backups.iterdir()}
    assert names == {*kept, "notes.txt", result.database_file, result.files_file}
    assert result.storage_used_bytes == sum(p.stat().st_size for p in backups.iterdir())


def test_latest_returns_the_newest_pair(world, dirs):
    backups, _ = dirs
    assert backup.latest() is None
    backup.run_backup(now=NOW - timedelta(days=1))
    newest = backup.run_backup(now=NOW)
    database_file, files_file = backup.latest()
    assert (database_file.name, files_file.name) == (newest.database_file, newest.files_file)


def test_the_job_fills_the_status_page(world, dirs, client_for):
    from procrastinate.contrib.django import app

    app.tasks["ops.backup"](0)

    status = JobStatus.objects.get(name="ops.backup")
    assert status.last_ok is True
    detail = json.loads(status.last_detail)
    assert detail["size_bytes"] > 0

    body = client_for(world.sysadmin_user).get(reverse("core:admin-status")).json()
    assert body["backup"]["size_bytes"] == detail["size_bytes"]
    assert body["backup"]["storage_used_bytes"] == detail["storage_used_bytes"]
    assert body["backup"]["last_at"] is not None
    assert any(job["name"] == "ops.backup" and job["last_ok"] for job in body["jobs"])


def test_backup_now_and_restore_check_commands(world, dirs, capsys):
    from django.core.management import call_command

    call_command("backup_now")
    assert "db-" in capsys.readouterr().out
    call_command("restore_backup", "--scratch")
    out = capsys.readouterr().out
    assert "accounts_user" in out and "Restore check passed" in out
    assert settings.DATABASES["default"]["NAME"] in out or "iris_restore_check" in out
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose run --rm app pytest apps/core/tests/test_backup.py -v`

Expected: FAIL at import with `ImportError: cannot import name 'backup' from 'apps.core'`.

- [ ] **Step 4: Write the backup module**

`backend/apps/core/backup.py`:

```python
"""Nightly encrypted backup of the database and the file volume, and its restore (PRD 12.7).

Files are encrypted with GnuPG (AES-256, symmetric) using BACKUP_PASSPHRASE. Nothing is ever
written to the backup directory unencrypted except inside a work directory removed before return.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import tarfile
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.utils import timezone

BACKUP_DIR = Path("/data/backups")
FILES_DIR = Path("/data/files")
KEEP_DAYS = 14
STAMP = "%Y%m%d-%H%M%S"
NAME = re.compile(r"^(db|files)-(\d{8}-\d{6})\.(dump|tar\.gz)\.gpg$")


class BackupError(RuntimeError):
    """A backup or restore step failed. The message never contains the passphrase."""


@dataclass(frozen=True)
class BackupResult:
    at: str
    database_file: str
    files_file: str
    size_bytes: int
    storage_used_bytes: int
    removed: list[str] = field(default_factory=list)

    def as_status(self) -> dict:
        """What the job returns. `recorded` stores a dictionary as JSON; `admin/status` reads the two sizes."""
        return {
            "size_bytes": self.size_bytes,
            "storage_used_bytes": self.storage_used_bytes,
            "database_file": self.database_file,
            "files_file": self.files_file,
            "removed": len(self.removed),
        }


def _passphrase() -> str:
    value = os.environ.get("BACKUP_PASSPHRASE", "")
    if not value.strip():
        raise BackupError("BACKUP_PASSPHRASE is empty; refusing to write an unencrypted backup")
    return value


def _database() -> dict:
    return settings.DATABASES["default"]


def _pg_args() -> list[str]:
    database = _database()
    return ["--host", database["HOST"], "--port", str(database.get("PORT") or 5432),
            "--username", database["USER"]]


def _pg_env() -> dict:
    return {**os.environ, "PGPASSWORD": _database()["PASSWORD"]}


def _run(command: list[str], *, env: dict | None = None, stdin: bytes | None = None) -> subprocess.CompletedProcess:
    try:
        result = subprocess.run(command, env=env, input=stdin, capture_output=True, check=False)
    except FileNotFoundError as error:
        raise BackupError(f"{command[0]} is not installed in this image") from error
    if result.returncode != 0:
        tail = result.stderr.decode(errors="replace").strip()[-400:]
        raise BackupError(f"{command[0]} failed with code {result.returncode}: {tail}")
    return result


def _gpg(arguments: list[str], passphrase: str) -> None:
    with tempfile.TemporaryDirectory(prefix="gnupg-") as home:
        _run(["gpg", "--homedir", home, "--batch", "--yes", "--quiet", "--pinentry-mode", "loopback",
              "--passphrase-fd", "0", *arguments], stdin=passphrase.encode() + b"\n")


def encrypt(source: Path, target: Path, passphrase: str) -> None:
    _gpg(["--symmetric", "--cipher-algo", "AES256", "--output", str(target), str(source)], passphrase)


def decrypt(source: Path, target: Path, passphrase: str) -> None:
    _gpg(["--output", str(target), "--decrypt", str(source)], passphrase)


def prune(backup_dir: Path, *, now: datetime, keep_days: int = KEEP_DAYS) -> list[str]:
    """Delete nightly files whose time stamp is older than `keep_days`.

    Other files and the `pre-update` folder of dump.sh are left alone.
    """
    cutoff = timezone.localtime(now) - timedelta(days=keep_days)
    removed = []
    for path in sorted(backup_dir.iterdir()):
        match = NAME.match(path.name)
        if not match or not path.is_file():
            continue
        taken = datetime.strptime(match.group(2), STAMP).replace(tzinfo=cutoff.tzinfo)
        if taken < cutoff:
            path.unlink()
            removed.append(path.name)
    return removed


def run_backup(*, now: datetime | None = None, backup_dir: Path | None = None, files_dir: Path | None = None,
               keep_days: int = KEEP_DAYS, database: str | None = None) -> BackupResult:
    passphrase = _passphrase()
    now = now or timezone.now()
    backup_dir = backup_dir or BACKUP_DIR
    files_dir = files_dir or FILES_DIR
    database = database or _database()["NAME"]
    stamp = timezone.localtime(now).strftime(STAMP)
    backup_dir.mkdir(parents=True, exist_ok=True)
    database_target = backup_dir / f"db-{stamp}.dump.gpg"
    files_target = backup_dir / f"files-{stamp}.tar.gz.gpg"

    try:
        with tempfile.TemporaryDirectory(dir=backup_dir, prefix=".work-") as work_name:
            work = Path(work_name)
            dump = work / "db.dump"
            _run(["pg_dump", *_pg_args(), "--format=custom", "--no-owner", "--file", str(dump), database],
                 env=_pg_env())
            encrypt(dump, database_target, passphrase)
            dump.unlink()
            archive = work / "files.tar.gz"
            with tarfile.open(archive, "w:gz") as tar:
                if files_dir.exists():
                    tar.add(files_dir, arcname="files")
            encrypt(archive, files_target, passphrase)
    except Exception:
        database_target.unlink(missing_ok=True)
        files_target.unlink(missing_ok=True)
        raise

    removed = prune(backup_dir, now=now, keep_days=keep_days)
    size = database_target.stat().st_size + files_target.stat().st_size
    # Everything on the backup volume counts, the pre-update dumps of dump.sh included.
    used = sum(path.stat().st_size for path in backup_dir.rglob("*") if path.is_file())
    return BackupResult(at=timezone.localtime(now).isoformat(), database_file=database_target.name,
                        files_file=files_target.name, size_bytes=size, storage_used_bytes=used, removed=removed)


def latest(backup_dir: Path | None = None) -> tuple[Path, Path] | None:
    """The newest database file and the files archive taken with it."""
    backup_dir = backup_dir or BACKUP_DIR
    if not backup_dir.exists():
        return None
    dumps = sorted(path for path in backup_dir.iterdir() if path.name.startswith("db-") and NAME.match(path.name))
    for dump in reversed(dumps):
        stamp = NAME.match(dump.name).group(2)
        archive = backup_dir / f"files-{stamp}.tar.gz.gpg"
        if archive.exists():
            return dump, archive
    return None


def restore_database(*, dump_file: Path, target_db: str, create: bool) -> None:
    passphrase = _passphrase()
    with tempfile.TemporaryDirectory(prefix="restore-") as work_name:
        plain = Path(work_name) / "db.dump"
        decrypt(dump_file, plain, passphrase)
        if create:
            _run(["createdb", *_pg_args(), target_db], env=_pg_env())
        _run(["pg_restore", *_pg_args(), "--dbname", target_db, "--clean", "--if-exists", "--no-owner",
              "--exit-on-error", str(plain)], env=_pg_env())


def restore_files(*, archive_file: Path, files_dir: Path | None = None) -> int:
    """Unpack the files archive into `files_dir`. Returns the number of files written."""
    passphrase = _passphrase()
    files_dir = files_dir or FILES_DIR
    with tempfile.TemporaryDirectory(prefix="restore-") as work_name:
        work = Path(work_name)
        plain = work / "files.tar.gz"
        decrypt(archive_file, plain, passphrase)
        unpacked = work / "unpacked"
        with tarfile.open(plain, "r:gz") as tar:
            tar.extractall(unpacked, filter="data")
        source = unpacked / "files"
        files_dir.mkdir(parents=True, exist_ok=True)
        if source.exists():
            shutil.copytree(source, files_dir, dirs_exist_ok=True)
        return sum(1 for path in files_dir.rglob("*") if path.is_file())


def count_rows(database: str, table: str) -> int:
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", table):
        raise BackupError(f"not a table name: {table}")
    result = _run(["psql", *_pg_args(), "--dbname", database, "--tuples-only", "--no-align",
                   "--command", f"SELECT count(*) FROM {table}"], env=_pg_env())
    return int(result.stdout.decode().strip())


def drop_database(name: str) -> None:
    _run(["dropdb", *_pg_args(), "--if-exists", "--force", name], env=_pg_env())
```

- [ ] **Step 5: Write the two commands**

`backend/apps/core/management/commands/backup_now.py`:

```python
"""Take a backup immediately. Used before a restore and by the runbook."""
from django.core.management.base import BaseCommand, CommandError

from apps.core import backup


class Command(BaseCommand):
    help = "Write an encrypted database dump and files archive to /data/backups."

    def handle(self, *args, **options):
        try:
            result = backup.run_backup()
        except backup.BackupError as error:
            raise CommandError(str(error)) from error
        self.stdout.write(f"{result.database_file}\n{result.files_file}\n"
                          f"{result.size_bytes} bytes written, {result.storage_used_bytes} bytes used in total")
```

`backend/apps/core/management/commands/restore_backup.py`:

```python
"""Restore a backup: into a scratch database to prove it works, or in place."""
import uuid
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.core import backup

CHECK_TABLES = ["accounts_user", "audit_auditevent", "organisation_employee", "requests_request",
                "balances_ledgerentry", "files_attachment"]


class Command(BaseCommand):
    help = "Restore the newest backup (or the named files). --scratch proves a backup; --in-place replaces live data."

    def add_arguments(self, parser):
        parser.add_argument("--db", help="database file name in /data/backups; default: the newest")
        parser.add_argument("--files", help="files archive name in /data/backups; default: the one taken with --db")
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--scratch", action="store_true", help="restore into a temporary database, count, drop it")
        mode.add_argument("--in-place", action="store_true", help="replace the live database and the files")
        parser.add_argument("--yes", action="store_true", help="required with --in-place")

    def _pick(self, options) -> tuple[Path, Path | None]:
        if options["db"]:
            database_file = backup.BACKUP_DIR / options["db"]
            stamp = backup.NAME.match(database_file.name)
            paired = backup.BACKUP_DIR / f"files-{stamp.group(2)}.tar.gz.gpg" if stamp else None
            files_file = backup.BACKUP_DIR / options["files"] if options["files"] else paired
        else:
            pair = backup.latest()
            if pair is None:
                raise CommandError(f"no backup found in {backup.BACKUP_DIR}")
            database_file, files_file = pair
        if not database_file.exists():
            raise CommandError(f"{database_file} does not exist")
        return database_file, files_file if files_file and files_file.exists() else None

    def handle(self, *args, **options):
        database_file, files_file = self._pick(options)
        try:
            if options["scratch"]:
                self._scratch(database_file)
            else:
                if not options["yes"]:
                    raise CommandError("--in-place replaces live data; repeat the command with --yes")
                self._in_place(database_file, files_file)
        except backup.BackupError as error:
            raise CommandError(str(error)) from error

    def _scratch(self, database_file: Path) -> None:
        scratch = f"iris_restore_check_{uuid.uuid4().hex[:8]}"
        self.stdout.write(f"Restoring {database_file.name} into {scratch}")
        try:
            backup.restore_database(dump_file=database_file, target_db=scratch, create=True)
            for table in CHECK_TABLES:
                try:
                    self.stdout.write(f"  {table}: {backup.count_rows(scratch, table)} rows")
                except backup.BackupError:
                    self.stdout.write(f"  {table}: not in this backup")
            if backup.count_rows(scratch, "accounts_user") < 1:
                raise CommandError("the restored database has no account; the backup is not usable")
        finally:
            backup.drop_database(scratch)
        self.stdout.write(self.style.SUCCESS("Restore check passed"))

    def _in_place(self, database_file: Path, files_file: Path | None) -> None:
        live = settings.DATABASES["default"]["NAME"]
        self.stdout.write(f"Restoring {database_file.name} into {live}")
        backup.restore_database(dump_file=database_file, target_db=live, create=False)
        if files_file is not None:
            count = backup.restore_files(archive_file=files_file)
            self.stdout.write(f"Restored files from {files_file.name}: {count} files present")
        else:
            self.stdout.write(self.style.WARNING("No files archive restored"))
        self.stdout.write(self.style.SUCCESS("Restore finished"))
```

- [ ] **Step 6: Register the job**

Append to `backend/apps/core/tasks.py`, after the heartbeat task of plan 01a:

```python
# --- plan 07: nightly backup -------------------------------------------------------------
from apps.core.jobs import RETRY  # noqa: E402  (`app` and `recorded` are imported at the top of the file)


# Procrastinate reads cron expressions in UTC (plan 01a, contract note 6).
# Tunis is UTC+1 all year, so 22:30 UTC is 23:30 local.
@app.periodic(cron="30 22 * * *")
@app.task(name="ops.backup", retry=RETRY, queueing_lock="ops.backup")
@recorded("ops.backup")
def backup(timestamp: int) -> dict:
    """Returns the sizes that `admin/status` shows (plan 01a, contract note 29)."""
    from apps.core import backup as backup_service

    return backup_service.run_backup().as_status()
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `docker compose run --rm app pytest apps/core/tests/test_backup.py -v`

Expected: 10 passed.

Then run the status tests of plan 01a, which describe the `backup` block from their side: `docker compose run --rm app pytest apps/core -q`

Expected: all passed. `test_the_job_fills_the_status_page` is the test that joins the two plans: the job returns a dictionary, `recorded` stores it as JSON, and `backup_info()` of plan 01a reads `size_bytes` and `storage_used_bytes` from it. If it fails while the other nine pass, compare the keys returned by `BackupResult.as_status()` with the keys `backup_info()` reads; they must be the same two names.

These tests are transactional (`transaction=True`): `pg_dump` runs in another connection and must see committed rows. See the note in Task 8 on what restores the database after a transactional test.

- [ ] **Step 8: Write the failing test of the server restore script**

`scripts/server/tests/restore.test.sh`, in the form of plan 01b's `update.test.sh`:

```bash
#!/usr/bin/env bash
# Tests scripts/server/restore.sh with stand-ins for docker, curl and sleep.
# Run: bash scripts/server/tests/restore.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESTORE="$HERE/../restore.sh"

failures=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
is() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got '$2', expected '$3')"; fi; }
contains() { if grep -q -- "$3" <<<"$2"; then pass "$1"; else fail "$1"; fi; }
lacks() { if grep -q -- "$3" <<<"$2"; then fail "$1"; else pass "$1"; fi; }
line_of() { grep -n -m 1 -- "$1" "$BOX/calls.log" | cut -d: -f1; }
in_order() {
  local description="$1" last=0 line; shift
  for pattern in "$@"; do
    line="$(line_of "$pattern")"
    if [ -z "$line" ] || [ "$line" -le "$last" ]; then fail "$description (at: $pattern)"; return; fi
    last="$line"
  done
  pass "$description"
}
stub() {
  local name="$1"; shift
  { echo '#!/usr/bin/env bash'; printf '%s\n' "$@"; } > "$BOX/bin/$name"
  chmod +x "$BOX/bin/$name"
}
new_box() {
  BOX="$(mktemp -d)"
  mkdir -p "$BOX/bin" "$BOX/scripts/server/state"
  printf '%s\n' \
    'COMPOSE_PATH_SEPARATOR=:' 'COMPOSE_FILE=compose.yaml:compose.server.yaml' 'APP_VERSION=v1.0.0' \
    'SITE_HOSTNAME=hr.test.local' 'HTTPS_PORT=8443' 'POSTGRES_DB=iris_hr' > "$BOX/.env"
  echo v1.1.0 > "$BOX/scripts/server/state/release"
  : > "$BOX/calls.log"
  echo ok > "$BOX/health"
  stub docker 'echo "docker[APP_VERSION=${APP_VERSION:-}] $*" >> "$IRIS_ROOT/calls.log"' 'exit 0'
  stub curl 'echo "curl $*" >> "$IRIS_ROOT/calls.log"' '[ "$(cat "$IRIS_ROOT/health")" = ok ]'
  stub sleep 'exit 0'
  STACK="$(basename "$BOX")"
}
run_restore() { IRIS_ROOT="$BOX" IRIS_HEALTH_TRIES=2 PATH="$BOX/bin:$PATH" bash "$RESTORE" "$@" 2>&1; }
calls() { cat "$BOX/calls.log"; }

# 1. Without a mode it changes nothing.
new_box
out="$(run_restore)"; code=$?
is "no mode: exit code 2" "$code" "2"
contains "no mode: shows the usage" "$out" "Usage: scripts/server/restore.sh --check"
out="$(run_restore db-20261102-233000.dump.gpg)"; code=$?
is "a file without a mode: exit code 2" "$code" "2"
is "a wrong argument calls nothing" "$(calls)" ""
rm -rf "$BOX"

# 2. It refuses to run on a development stack.
new_box
sed -i 's/compose.server.yaml/compose.dev.yaml/' "$BOX/.env"
out="$(run_restore --check)"; code=$?
is "a development .env: exit code 1" "$code" "1"
contains "a development .env: says why" "$out" "not a server stack"
is "a development .env: calls nothing" "$(calls)" ""
rm -rf "$BOX"

# 3. --check restores into a scratch database and stops nothing.
new_box
out="$(run_restore --check)"; code=$?
is "check: exit code 0" "$code" "0"
contains "check: asks for the scratch restore" "$(calls)" "docker\[APP_VERSION=v1.1.0\] compose run .*app python manage.py restore_backup --scratch$"
lacks "check: stops nothing" "$(calls)" "compose stop"
lacks "check: starts nothing" "$(calls)" "compose up"
rm -rf "$BOX"

# 4. --check with a file names it.
new_box
out="$(run_restore --check pre-update/20261102T220000Z-before-v1.2.0.dump.gpg)"; code=$?
is "check a named dump: exit code 0" "$code" "0"
contains "check a named dump: the file is passed" "$(calls)" "restore_backup --scratch --db pre-update/20261102T220000Z-before-v1.2.0.dump.gpg$"
rm -rf "$BOX"

# 5. --replace asks for the stack name and stops when it is not typed.
new_box
out="$(run_restore --replace <<<"wrong-name")"; code=$?
is "wrong name: exit code 1" "$code" "1"
contains "wrong name: says nothing was changed" "$out" "Nothing was changed"
is "wrong name: calls nothing" "$(calls)" ""
rm -rf "$BOX"

# 6. --replace: back up, stop, restore, migrate, start, health; on the deployed version.
new_box
out="$(run_restore --replace <<<"$STACK")"; code=$?
is "replace: exit code 0" "$code" "0"
in_order "replace: the steps run in order" \
  "compose run .*manage.py backup_now" "compose stop proxy app worker" \
  "compose run .*manage.py restore_backup --in-place --yes$" "compose run .*manage.py migrate --noinput" \
  "compose up -d --no-build" "curl .*https://hr.test.local:8443/api/v1/health"
lacks "replace: never the version of .env" "$(calls)" "APP_VERSION=v1.0.0"
contains "replace: says it is complete" "$out" "Restore complete"
rm -rf "$BOX"

# 7. --replace with named files passes both.
new_box
out="$(run_restore --replace db-20261102-233000.dump.gpg files-20261102-233000.tar.gz.gpg <<<"$STACK")"; code=$?
is "replace named files: exit code 0" "$code" "0"
contains "replace named files: both are passed" "$(calls)" \
  "restore_backup --in-place --yes --db db-20261102-233000.dump.gpg --files files-20261102-233000.tar.gz.gpg$"
rm -rf "$BOX"

# 8. A stack that does not come back: say so, exit 1.
new_box
echo down > "$BOX/health"
out="$(run_restore --replace <<<"$STACK")"; code=$?
is "unhealthy: exit code 1" "$code" "1"
contains "unhealthy: says so" "$out" "did not become healthy"
is "unhealthy: it tried as often as it was told" "$(grep -c '^curl ' "$BOX/calls.log")" "2"
rm -rf "$BOX"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "restore.test.sh: all passed"
```

Run: `bash scripts/server/tests/restore.test.sh`

Expected: lines starting with `FAIL` (`bash: …/restore.sh: No such file or directory`), ending with `check(s) failed`.

- [ ] **Step 9: Write the server restore script**

`scripts/server/restore.sh` (LF line endings, executable):

```bash
#!/usr/bin/env bash
# Restores a backup on this stack, or proves that a backup restores.
#
# Usage: scripts/server/restore.sh --check [db-file]
#            restores into a scratch database, counts the rows, drops it; changes nothing
#        scripts/server/restore.sh --replace [db-file] [files-file]
#            replaces the database and the files of this stack
#
# File names are relative to /data/backups in the backup volume: a nightly pair
# (db-YYYYMMDD-HHMMSS.dump.gpg, files-YYYYMMDD-HHMMSS.tar.gz.gpg) or a dump made by dump.sh
# (pre-update/<UTC time>-<label>.dump.gpg, database only). Without a name: the newest nightly pair.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# /health answers 503 until the worker's first heartbeat: 36 tries, 5 seconds apart.
HEALTH_TRIES="${IRIS_HEALTH_TRIES:-36}"

usage() {
  log "Usage: scripts/server/restore.sh --check [db-file]"
  log "       scripts/server/restore.sh --replace [db-file] [files-file]"
  exit 2
}

# The work is done inside the backend image, which carries pg_restore and gpg.
manage() { compose run --rm -T app python manage.py "$@"; }

wait_for_health() {
  local host port
  host="$(env_value SITE_HOSTNAME)"
  port="$(env_value HTTPS_PORT)"
  port="${port:-443}"
  for _ in $(seq 1 "$HEALTH_TRIES"); do
    if curl --fail --silent --insecure --max-time 5 --output /dev/null \
      --resolve "$host:$port:127.0.0.1" "https://$host:$port/api/v1/health"; then
      return 0
    fi
    sleep 5
  done
  return 1
}

main() {
  local mode="${1:-}" db_file="${2:-}" files_file="${3:-}" stack answer
  case "$mode" in
    --check | --replace) ;;
    *) usage ;;
  esac
  require_server_stack

  if [ "$mode" = "--check" ]; then
    if [ -n "$db_file" ]; then
      manage restore_backup --scratch --db "$db_file"
    else
      manage restore_backup --scratch
    fi
    return 0
  fi

  stack="$(basename "$ROOT")"
  log "This REPLACES the database and the files of the stack '$stack' ($(env_value SITE_HOSTNAME))."
  log "A backup of the current state is taken first."
  read -r -p "Type the stack name to continue: " answer || answer=""
  [ "$answer" = "$stack" ] || die "Aborted. Nothing was changed."

  log ""
  log "[1/5] Backing up the current state"
  manage backup_now >&2

  log "[2/5] Stopping proxy, app and worker"
  compose stop proxy app worker

  log "[3/5] Restoring"
  local arguments=(restore_backup --in-place --yes)
  if [ -n "$db_file" ]; then arguments+=(--db "$db_file"); fi
  if [ -n "$files_file" ]; then arguments+=(--files "$files_file"); fi
  manage "${arguments[@]}"

  log "[4/5] Applying the migrations of the deployed version ($(deployed_version))"
  manage migrate --noinput

  log "[5/5] Starting, then waiting for /health, up to $((HEALTH_TRIES * 5)) seconds"
  compose up -d --no-build
  if wait_for_health; then
    log ""
    log "Restore complete."
    return 0
  fi
  die "The stack did not become healthy. See: scripts/server/compose.sh logs --tail 100 app worker proxy"
}

main "$@"
```

Run: `bash scripts/server/tests/restore.test.sh`

Expected: twenty-five lines starting with `ok`, then `restore.test.sh: all passed`.

Mark the two files as executable and check their line endings, as plan 01b does for its scripts:

```bash
git add scripts/server/restore.sh scripts/server/tests/restore.test.sh
git update-index --chmod=+x scripts/server/restore.sh scripts/server/tests/restore.test.sh
git ls-files --eol scripts/server/restore.sh scripts/server/tests/restore.test.sh
```

Expected: both lines start with `i/lf`. If the pipeline of plan 01b runs the script tests by name (`bash scripts/server/tests/update.test.sh`), append `bash scripts/server/tests/restore.test.sh` to the same step of `.github/workflows/ci.yml`.

- [ ] **Step 10: Try the backup on the development stack**

Run: `docker compose up -d && docker compose exec app python manage.py backup_now && docker compose exec app python manage.py restore_backup --scratch`

Expected: two file names, a byte count, then one line per table with its row count and `Restore check passed`.

- [ ] **Step 11: Commit**

```bash
git add backend/apps/core/backup.py backend/apps/core/management/commands/backup_now.py backend/apps/core/management/commands/restore_backup.py backend/apps/core/tests/test_backup.py backend/apps/core/tasks.py scripts/server/restore.sh scripts/server/tests/restore.test.sh .github/workflows/ci.yml
git commit -m "feat: nightly encrypted backup with restore command and script"
```

### Task 6: Job suite

**Files:**
- Create: `backend/tests/hardening/test_jobs.py`

**Interfaces:**
- Consumes: `procrastinate.contrib.django.app` (`app.tasks`, `app.periodic_registry`); `apps.core.jobs` (`recorded`, `RETRY`); `apps.core.models.JobStatus`; routes `core:health`, `core:admin-status`; `apps.core.backup` (Task 5); `apps.accounts.services.create_account`; `apps.organisation.services.create_delegation`; `apps.settings.services`; models `Notification`, `AuditEvent`, `LedgerEntry`, `Request`, `RequestStep`, `django.contrib.sessions.models.Session`.
- Produces: nothing used by later tasks.

The seven jobs of master section 6.9 are `core.heartbeat`, `accounts.cleanup`, `organisation.delegation_transitions`, `requests.reminders_and_flags`, `requests.certificate_deadlines`, `balances.month_end_credit` and `ops.backup`. Each job's own plan tests its logic. This task proves three things for all of them together: each is registered and scheduled, each run twice leaves the same state as once, and a job that fails three times in a row (its retries used up) reaches the System Administrators, once per day, and the status page.

- [ ] **Step 1: Confirm the Procrastinate attributes the tests read**

Run: `docker compose run --rm app python -c "import django; django.setup(); from procrastinate.contrib.django import app; t = app.tasks['core.heartbeat']; print(t.queueing_lock, type(t.retry_strategy).__name__); print(sorted({p.task.name for p in app.periodic_registry.periodic_tasks.values()}))"`

Expected: `core.heartbeat RetryStrategy` (or `None RetryStrategy` if the heartbeat has no lock) and the list of scheduled task names.

If an attribute has another name in the installed version, read `python -c "import procrastinate, inspect; print(inspect.getsource(procrastinate.tasks.Task.__init__))"` and `...periodic.PeriodicRegistry`, then use the real names in the two helper functions `_lock` and `_scheduled_names` of the test file below. Nothing else in the file depends on them.

- [ ] **Step 2: Write the tests**

`backend/tests/hardening/test_jobs.py`:

```python
"""All scheduled jobs: registered, idempotent, and loud when they fail (PRD 9.5, PRD 12.8)."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.urls import reverse
from procrastinate.contrib.django import app

from apps.accounts import services as account_services
from apps.audit.models import AuditEvent
from apps.balances.models import LedgerEntry
from apps.core import backup
from apps.core.jobs import RETRY, recorded
from apps.core.models import JobStatus
from apps.notifications.models import Notification
from apps.organisation import services as organisation_services
from apps.organisation.models import Employee
from apps.requests.models import Request, RequestStep
from apps.settings import services as settings_service
from tests.hardening.helpers import NOW, frozen, make_request  # noqa: F401

User = get_user_model()
JOBS = [
    "core.heartbeat",
    "accounts.cleanup",
    "organisation.delegation_transitions",
    "requests.reminders_and_flags",
    "requests.certificate_deadlines",
    "balances.month_end_credit",
    "ops.backup",
]
A_WEEK_LATER = datetime(2026, 11, 9, 8, 0, tzinfo=UTC)      # Monday 9 November 2026, 09:00 in Tunis


def _lock(task):
    return task.queueing_lock


def _scheduled_names() -> set[str]:
    return {periodic.task.name for periodic in app.periodic_registry.periodic_tasks.values()}


def _run(name: str) -> None:
    app.tasks[name](0)          # every task takes the scheduler's timestamp as its one argument


def test_every_job_of_the_contract_is_registered_and_scheduled():
    assert set(JOBS) <= set(app.tasks), sorted(set(JOBS) - set(app.tasks))
    assert set(JOBS) <= _scheduled_names(), sorted(set(JOBS) - _scheduled_names())


def test_jobs_retry_three_times_and_cannot_pile_up():
    assert RETRY.max_attempts == 3
    for name in JOBS:
        if name == "core.heartbeat":
            continue
        assert _lock(app.tasks[name]) == name, f"{name} has no queueing lock, two runs could overlap"


@pytest.fixture
def busy_world(world, frozen, tmp_path, monkeypatch):
    """A state in which every job has something to do one week later."""
    monkeypatch.setenv("BACKUP_PASSPHRASE", "correct horse battery staple")
    monkeypatch.setattr(backup, "BACKUP_DIR", tmp_path / "backups")
    monkeypatch.setattr(backup, "FILES_DIR", tmp_path / "files")
    (tmp_path / "files").mkdir()

    Employee.objects.update(hire_date=date(2020, 1, 1))
    settings_service.set_value(actor=world.hr_user, key="credit_start_date", value="2026-10-01")
    # A manager step that will need a reminder and a flag.
    make_request(world, user=world.owner_user, employee=world.owner, request_type=world.remote,
                 start=date(2026, 11, 23), end=date(2026, 11, 23))
    # A sick leave whose certificate will be overdue.
    make_request(world, user=world.peer_user, employee=world.peer, request_type=world.sick,
                 start=date(2026, 11, 2), end=date(2026, 11, 2))
    # A delegation that starts in a week.
    organisation_services.create_delegation(
        actor=world.manager_user, manager=world.manager, delegate=world.other_manager,
        start_date=date(2026, 11, 9), end_date=date(2026, 11, 13))
    # A temporary password that will have expired, and a session that already has.
    account_services.create_account(actor=world.sysadmin_user, email="temp.user@impactrisks.com",
                                    full_name="Temp User")
    Session.objects.create(session_key="expired-session-key", session_data="", expire_date=NOW - timedelta(days=1))

    frozen.move_to(A_WEEK_LATER)
    return tmp_path


def _fingerprint(tmp_path) -> dict:
    backups = tmp_path / "backups"
    return {
        "notifications": sorted(Notification.objects.values_list("user_id", "event_code", "target_public_id")),
        "audit": AuditEvent.objects.count(),
        "ledger": sorted(LedgerEntry.objects.values_list("employee_id", "kind", "period", "amount")),
        "steps": sorted(RequestStep.objects.values_list("id", "status", "reminded_at", "flagged_at")),
        "requests": sorted(Request.objects.values_list("id", "status", "version")),
        "sessions": Session.objects.count(),
        "accounts": sorted(User.objects.values_list("id", "is_active", "must_change_password",
                                                    "temp_password_expires_at")),
        "backup_files": sorted(path.name for path in backups.iterdir()) if backups.exists() else [],
    }


@pytest.mark.django_db
@pytest.mark.parametrize("name", JOBS)
def test_a_job_run_twice_equals_once(busy_world, name):
    _run(name)
    once = _fingerprint(busy_world)
    _run(name)
    twice = _fingerprint(busy_world)
    assert twice == once
    status = JobStatus.objects.get(name=name)
    assert status.last_ok is True and status.last_finished_at is not None


@pytest.mark.django_db
def test_each_job_did_its_work_on_the_first_run(busy_world, world):
    """Guards the test above: idempotence means nothing if the first run did nothing."""
    before = _fingerprint(busy_world)
    for name in JOBS:
        _run(name)
    after = _fingerprint(busy_world)

    events = {event for _, event, _ in after["notifications"]} - {event for _, event, _ in before["notifications"]}
    assert {"step.reminder", "step.flagged", "certificate.overdue", "delegation.started"} <= events
    assert any(reminded and flagged for _, _, reminded, flagged in after["steps"])
    assert len(after["ledger"]) - len(before["ledger"]) == 7          # October credit for the seven employees
    assert after["sessions"] == before["sessions"] - 1
    assert len(after["backup_files"]) == 2
    assert after["requests"] == before["requests"]                    # no job changes a request's status


@pytest.mark.django_db
def test_all_jobs_together_twice_equal_once(busy_world):
    for name in JOBS:
        _run(name)
    once = _fingerprint(busy_world)
    for name in reversed(JOBS):
        _run(name)
    assert _fingerprint(busy_world) == once


@pytest.mark.django_db
def test_a_failing_job_tells_administrators_after_its_third_failure_once_a_day(world, client_for, frozen):
    """Plan 01a, contract note 14: the three attempts of RETRY are used up, then System Administrators are told."""
    @recorded("test.always_fails")
    def broken(timestamp: int = 0) -> None:
        raise RuntimeError("disk full")

    told = Notification.objects.filter(event_code="job.failed")
    for attempt in (1, 2):
        with pytest.raises(RuntimeError):
            broken()
        assert JobStatus.objects.get(name="test.always_fails").consecutive_failures == attempt
        assert told.count() == 0, "nobody is told while a retry is still to come"

    with pytest.raises(RuntimeError):
        broken()
    status = JobStatus.objects.get(name="test.always_fails")
    assert status.last_ok is False
    assert status.consecutive_failures == 3
    assert status.last_detail == "RuntimeError: disk full"
    assert told.filter(user=world.sysadmin_user).count() == 1
    assert told.exclude(user=world.sysadmin_user).count() == 0

    with pytest.raises(RuntimeError):          # a fourth failure the same day tells nobody again
        broken()
    assert told.count() == 1

    body = client_for(world.sysadmin_user).get(reverse("core:admin-status")).json()
    assert body["jobs"][0]["name"] == "test.always_fails"          # failures first
    assert body["jobs"][0]["last_ok"] is False

    frozen.move_to(NOW + timedelta(days=1))
    with pytest.raises(RuntimeError):
        broken()
    assert told.filter(user=world.sysadmin_user).count() == 2      # once per job per day


@pytest.mark.django_db
def test_a_job_that_recovers_is_shown_as_healthy_again(world, frozen):
    calls = {"count": 0}

    @recorded("test.recovers")
    def flaky(timestamp: int = 0) -> None:
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("first attempt fails")

    with pytest.raises(RuntimeError):
        flaky()
    flaky()
    status = JobStatus.objects.get(name="test.recovers")
    assert status.last_ok is True
    assert status.consecutive_failures == 0          # a success starts the count again
    assert not Notification.objects.filter(event_code="job.failed").exists()


@pytest.mark.django_db
def test_health_turns_degraded_when_the_worker_stops(anon_client, frozen):
    _run("core.heartbeat")
    healthy = anon_client.get(reverse("core:health"))
    assert healthy.status_code == 200 and healthy.json()["worker"] == "ok"

    frozen.move_to(NOW + timedelta(minutes=4))
    stale = anon_client.get(reverse("core:health"))
    assert stale.status_code == 503
    assert stale.json()["worker"] != "ok" and stale.json()["database"] == "ok"
```

- [ ] **Step 3: Run the tests**

Run: `docker compose run --rm app pytest tests/hardening/test_jobs.py -v`

Expected: 14 passed (2 registration tests, 7 parametrised, 5 single). This is a verification suite and should pass at once.

When it fails:

- A job is not registered or not scheduled: its `tasks.py` lacks `@app.periodic` or the module is not imported. Compare it with the pattern in master section 6.9.
- `test_a_job_run_twice_equals_once[<name>]` shows a difference between `once` and `twice`. The difference names the cause:
  - `notifications` grew: the job raises a notification without a `dedupe_key`. Pass one built from the item and the event, for example `f"step:{step.id}:reminder"`.
  - `ledger` grew: the unique constraint on `(employee, period)` for credits is missing or the job catches the wrong exception.
  - `steps` changed: the job rewrites `reminded_at` or `flagged_at` when already set. Set each once.
  - `audit` grew: the job records an audit event on a run that changed nothing. Record only when something changed.
- `test_each_job_did_its_work_on_the_first_run` fails on the ledger count: the credit job needs `credit_start_date` in the form this installation stores it; see the note in Task 4. On `sessions`: `accounts.cleanup` must delete sessions whose `expire_date` has passed.
- The failing-job test fails: the rule is plan 01a's (`apps/core/jobs.py`). `_failed` adds one to `consecutive_failures`, notifies when it reaches `NOTIFY_AFTER_FAILURES` (3) with the key `job.failed:<name>:<local date>`, and `_succeeded` puts the count back to zero.
- The health test answers 503 before the travel: `health` is degraded until the first heartbeat (plan 01a, contract note 23), so the test runs the heartbeat first; if it still fails, `_worker_ok` does not read the `core.heartbeat` row.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/hardening/test_jobs.py
git commit -m "test: every scheduled job is registered, idempotent and loud on failure"
```

### Task 7: Web hardening checks

**Files:**
- Create: `backend/tests/hardening/test_web_hardening.py`
- Create: `backend/tests/hardening/test_sign_in_edges.py`
- Create: `backend/tests/hardening/test_upload_edges.py`
- Create: `scripts/server/check-headers.sh`

**Interfaces:**
- Consumes: routes `accounts:csrf`, `accounts:login`, `accounts:me`, `accounts:password`, `accounts:account-list`, `notifications:read-all`, `core:health`, `files:download`, `requests:request-attachments`; `apps.accounts.services` (`create_account`, `disable_account`); `apps.organisation.services` (`archive_employee`, `add_document`); `apps.files.services` (`store_upload`, `read_for_download`); `apps.settings.services`; `apps.core.errors.DomainError`; the password `Correct-Horse-42!` of the standard cast.
- Produces: `scripts/server/check-headers.sh <https-base-url> [http-port]`, used again in Tasks 16 and 17.

- [ ] **Step 1: Write the session, cookie, CSRF and header tests**

`backend/tests/hardening/test_web_hardening.py`:

```python
"""Cookies, CSRF, session end and response headers (PRD 10 'Web', ACC-04)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import date, timedelta

import pytest
from django.conf import settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts import services as account_services
from apps.organisation import services as organisation_services
from apps.settings import services as settings_service
from tests.hardening.helpers import NOW, frozen, pdf  # noqa: F401

PASSWORD = "Correct-Horse-42!"


def _sign_in(user, **extra) -> APIClient:
    client = APIClient(**extra)
    response = client.post(reverse("accounts:login"), {"email": user.email, "password": PASSWORD}, format="json")
    assert response.status_code == 200, response.content
    client.login_response = response
    return client


@pytest.mark.django_db
def test_the_session_cookie_is_httponly_lax_and_ends_with_the_browser(world):
    cookie = _sign_in(world.owner_user).login_response.cookies[settings.SESSION_COOKIE_NAME]
    assert cookie["httponly"] is True
    assert cookie["samesite"] == "Lax"
    assert cookie["max-age"] == "" and cookie["expires"] == "", "the cookie must not outlive the browser"


@pytest.mark.parametrize("environment", ["test", "production"])
def test_server_settings_are_strict_outside_development(environment):
    keys = ["DEBUG", "SESSION_COOKIE_SECURE", "CSRF_COOKIE_SECURE", "SESSION_COOKIE_HTTPONLY",
            "SESSION_COOKIE_SAMESITE", "SESSION_EXPIRE_AT_BROWSER_CLOSE", "SECURE_CONTENT_TYPE_NOSNIFF",
            "X_FRAME_OPTIONS", "ALLOWED_HOSTS", "SECURE_HSTS_SECONDS", "SECURE_REFERRER_POLICY"]
    code = ("import django, json; django.setup(); from django.conf import settings as s; "
            f"print(json.dumps({{k: getattr(s, k, None) for k in {keys!r}}}))")
    env = {**os.environ, "ENVIRONMENT": environment, "SITE_HOSTNAME": "hr.example.test",
           "DJANGO_ALLOWED_HOSTS": "hr.example.test"}
    result = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr
    values = json.loads(result.stdout.strip().splitlines()[-1])
    assert values["DEBUG"] is False
    assert values["SESSION_COOKIE_SECURE"] is True and values["CSRF_COOKIE_SECURE"] is True
    assert values["SESSION_COOKIE_HTTPONLY"] is True
    assert values["SESSION_COOKIE_SAMESITE"] == "Lax"
    assert values["SESSION_EXPIRE_AT_BROWSER_CLOSE"] is True
    assert values["SECURE_CONTENT_TYPE_NOSNIFF"] is True
    assert values["X_FRAME_OPTIONS"] == "DENY"
    assert values["ALLOWED_HOSTS"] == ["hr.example.test"]
    assert values["SECURE_HSTS_SECONDS"] >= 31536000
    assert values["SECURE_REFERRER_POLICY"] == "same-origin"


def test_the_process_refuses_to_start_without_a_required_variable():
    env = {key: value for key, value in os.environ.items() if key != "FILE_ENCRYPTION_KEY"}
    result = subprocess.run([sys.executable, "-c", "import django; django.setup()"],
                            env=env, capture_output=True, text=True, check=False)
    assert result.returncode != 0
    assert "FILE_ENCRYPTION_KEY" in result.stderr


@pytest.mark.django_db
def test_a_state_changing_call_without_the_csrf_token_is_refused(world):
    client = APIClient(enforce_csrf_checks=True)
    client.get(reverse("accounts:csrf"))
    token = client.cookies["csrftoken"].value
    signed_in = client.post(reverse("accounts:login"), {"email": world.owner_user.email, "password": PASSWORD},
                            format="json", HTTP_X_CSRFTOKEN=token)
    assert signed_in.status_code == 200

    url = reverse("notifications:read-all")
    assert client.post(url, {}, format="json").status_code == 403
    assert client.post(url, {}, format="json", HTTP_X_CSRFTOKEN="wrong-token").status_code == 403
    token = client.cookies["csrftoken"].value            # Django rotates the token at sign-in
    assert client.post(url, {}, format="json", HTTP_X_CSRFTOKEN=token).status_code == 204


@pytest.mark.django_db
def test_a_session_ends_after_two_hours_without_activity(world, frozen):
    client = _sign_in(world.owner_user)
    me = reverse("accounts:me")
    frozen.move_to(NOW + timedelta(minutes=119))
    assert client.get(me).status_code == 200              # activity restarts the two hours
    frozen.move_to(NOW + timedelta(minutes=119 + 119))
    assert client.get(me).status_code == 200
    frozen.move_to(NOW + timedelta(minutes=119 + 119 + 121))
    assert client.get(me).status_code == 401


@pytest.mark.django_db
def test_the_inactivity_limit_is_the_setting(world, frozen):
    settings_service.set_value(actor=world.sysadmin_user, key="session_timeout_minutes", value=10)
    settings_service.clear_cache()
    client = _sign_in(world.owner_user)
    frozen.move_to(NOW + timedelta(minutes=11))
    assert client.get(reverse("accounts:me")).status_code == 401


@pytest.mark.django_db
def test_disabling_an_account_ends_its_sessions_at_once(world):
    client = _sign_in(world.owner_user)
    assert client.get(reverse("accounts:me")).status_code == 200
    account_services.disable_account(actor=world.sysadmin_user, user=world.owner_user)
    assert client.get(reverse("accounts:me")).status_code == 401


@pytest.mark.django_db
def test_archiving_an_employee_ends_their_sessions_at_once(world, frozen):
    client = _sign_in(world.peer_user)
    organisation_services.archive_employee(actor=world.hr_user, employee=world.peer,
                                           leaving_date=date(2026, 11, 2), reason="Left")
    assert client.get(reverse("accounts:me")).status_code == 401
    again = APIClient().post(reverse("accounts:login"),
                             {"email": world.peer_user.email, "password": PASSWORD}, format="json")
    assert again.json()["code"] == "auth.disabled"


@pytest.mark.django_db
def test_api_responses_carry_safe_headers_and_a_request_id(world, anon_client):
    response = anon_client.get(reverse("core:health"))
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert len(response.headers["X-Request-ID"]) >= 16

    refused = anon_client.get(reverse("accounts:me"))
    assert refused.status_code == 401
    assert refused.headers["Content-Type"].startswith("application/problem+json")
    assert refused.json()["request_id"] == refused.headers["X-Request-ID"]
    assert {"type", "title", "status", "code", "detail", "errors", "request_id"} <= set(refused.json())


@pytest.mark.django_db
def test_a_file_is_served_as_a_download_only(world, client_for):
    document = organisation_services.add_document(actor=world.hr_user, employee=world.owner,
                                                  upload=pdf("contrat.pdf"), label="Contrat",
                                                  visible_to_employee=True)
    url = reverse("files:download", kwargs={"public_id": document.attachment.public_id})
    response = client_for(world.owner_user).get(url)
    assert response.status_code == 200
    assert response.headers["Content-Disposition"].lower().startswith("attachment")
    assert "inline" not in response.headers["Content-Disposition"].lower()
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Content-Type"] in ("application/pdf", "application/octet-stream")
    assert "sandbox" in response.headers.get("Content-Security-Policy", "sandbox")


@pytest.mark.django_db
def test_an_unknown_path_under_the_api_is_a_problem_document_not_a_debug_page(world, client_for):
    response = client_for(world.owner_user).get("/api/v1/this-does-not-exist")
    assert response.status_code == 404
    assert b"Traceback" not in response.content and b"DEBUG" not in response.content
```

- [ ] **Step 2: Write the sign-in edge tests (review focus 8)**

`backend/tests/hardening/test_sign_in_edges.py`:

```python
"""Sign-in at its edges: case, spaces, lookalike domains, lock-out, temporary passwords, address limit."""
from __future__ import annotations

import json
import logging
from datetime import timedelta

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts import services as account_services
from apps.audit.models import AuditEvent
from tests.hardening.helpers import NOW, frozen  # noqa: F401

PASSWORD = "Correct-Horse-42!"
LOGIN = "accounts:login"


def _try(email: str, password: str = PASSWORD, ip: str = "10.20.0.7"):
    return APIClient(REMOTE_ADDR=ip).post(reverse(LOGIN), {"email": email, "password": password}, format="json")


@pytest.mark.django_db
def test_case_and_surrounding_spaces_do_not_matter(world):
    email = world.owner_user.email
    assert _try(email.upper()).status_code == 200
    assert _try(f"  {email.title()}  ").status_code == 200
    assert _try(f"\t{email}\n").status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize("email", [
    "employee.a1@impactrisks.com.evil.org",
    "employee.a1@notimpactrisks.com",
    "employee.a1@impactrisks.co",
    "employee.a1@impactrisks.com@evil.org",
    "employee.a1@IMPACTRISKS.COM.",
    "employee.a1",
])
def test_a_lookalike_address_is_refused_for_its_domain(world, email):
    response = _try(email)
    assert response.status_code != 200
    assert response.json()["code"] in ("auth.domain_not_allowed", "auth.invalid_credentials")
    if "@" in email and not email.endswith("."):
        assert response.json()["code"] == "auth.domain_not_allowed"


@pytest.mark.django_db
def test_the_administrator_cannot_create_an_account_outside_the_domain(world, client_for):
    response = client_for(world.sysadmin_user).post(
        reverse("accounts:account-list"),
        {"email": "contractor@gmail.com", "full_name": "A Contractor", "roles": []}, format="json")
    assert response.status_code == 400
    assert response.json()["code"] == "auth.domain_not_allowed"


@pytest.mark.django_db
def test_a_wrong_password_and_an_unknown_address_look_the_same(world):
    wrong = _try(world.owner_user.email, "Not-The-Password-1!")
    unknown = _try("nobody.here@impactrisks.com", "Not-The-Password-1!")
    assert wrong.status_code == unknown.status_code != 200
    assert wrong.json()["code"] == unknown.json()["code"] == "auth.invalid_credentials"
    assert wrong.json()["detail"] == unknown.json()["detail"]


@pytest.mark.django_db
def test_five_failures_lock_the_account_even_for_the_right_password(world, frozen):
    email = world.owner_user.email
    for _ in range(5):
        assert _try(email, "Not-The-Password-1!").json()["code"] == "auth.invalid_credentials"
    locked = _try(email)
    assert locked.status_code != 200 and locked.json()["code"] == "auth.locked"
    assert AuditEvent.objects.filter(category="security", action="auth.locked").count() == 1

    frozen.move_to(NOW + timedelta(minutes=14))
    assert _try(email).json()["code"] == "auth.locked"
    frozen.move_to(NOW + timedelta(minutes=16))
    assert _try(email).status_code == 200


@pytest.mark.django_db
def test_an_expired_temporary_password_is_refused_with_its_own_message(world, frozen):
    user, temporary = account_services.create_account(actor=world.sysadmin_user,
                                                      email="new.person@impactrisks.com", full_name="New Person")
    frozen.move_to(NOW + timedelta(hours=25))
    response = _try(user.email, temporary)
    assert response.status_code != 200 and response.json()["code"] == "auth.temp_password_expired"


@pytest.mark.django_db
def test_a_temporary_password_opens_nothing_but_the_password_change(world, frozen):
    user, temporary = account_services.create_account(actor=world.sysadmin_user,
                                                      email="new.person@impactrisks.com", full_name="New Person")
    client = APIClient()
    signed_in = client.post(reverse(LOGIN), {"email": user.email, "password": temporary}, format="json")
    assert signed_in.status_code == 200 and signed_in.json()["must_change_password"] is True

    blocked = client.get(reverse("notifications:list"))
    assert blocked.status_code == 403 and blocked.json()["code"] == "auth.password_change_required"

    change = reverse("accounts:password")
    from django.contrib.auth.password_validation import CommonPasswordValidator

    common = next(word for word in sorted(CommonPasswordValidator().passwords) if len(word) >= 12)
    weak = client.post(change, {"current_password": temporary, "new_password": common}, format="json")
    assert weak.status_code == 400 and weak.json()["code"] == "auth.weak_password"
    same = client.post(change, {"current_password": temporary, "new_password": temporary}, format="json")
    assert same.status_code == 400 and same.json()["code"] == "auth.weak_password"
    like_name = client.post(change, {"current_password": temporary, "new_password": "New.Person.2026"}, format="json")
    assert like_name.status_code == 400 and like_name.json()["code"] == "auth.weak_password"
    short = client.post(change, {"current_password": temporary, "new_password": "Xk9!vT2q"}, format="json")
    assert short.status_code == 400 and short.json()["code"] == "auth.weak_password"

    assert client.post(change, {"current_password": temporary, "new_password": "Granite-Lantern-58!"},
                       format="json").status_code == 204
    assert client.get(reverse("notifications:list")).status_code == 200
    assert _try(user.email, temporary).json()["code"] == "auth.invalid_credentials"


@pytest.mark.django_db
def test_twenty_failures_from_one_address_block_that_address_only(world, frozen):
    for index in range(20):
        assert _try(f"nobody{index}@impactrisks.com", "Not-The-Password-1!", ip="10.20.0.50").status_code != 200
    blocked = _try(world.owner_user.email, ip="10.20.0.50")
    assert blocked.status_code == 429 and blocked.json()["code"] == "auth.rate_limited"
    assert _try(world.owner_user.email, ip="10.20.0.51").status_code == 200

    frozen.move_to(NOW + timedelta(minutes=16))
    assert _try(world.owner_user.email, ip="10.20.0.50").status_code == 200


@pytest.mark.django_db
def test_a_password_never_reaches_the_audit_trail_or_the_logs(world, caplog):
    caplog.set_level(logging.DEBUG)
    secret = "Zz-Secret-Marker-91!"
    _try(world.owner_user.email, secret)
    _try("nobody.here@impactrisks.com", secret)
    for event in AuditEvent.objects.all():
        assert secret not in json.dumps([event.object_label, event.changes], default=str)
    for record in caplog.records:
        assert secret not in json.dumps(record.__dict__, default=str)
    assert AuditEvent.objects.filter(category="security", action="auth.login_failed").count() == 2
```

- [ ] **Step 3: Write the upload edge tests (review focus 7)**

`backend/tests/hardening/test_upload_edges.py`:

```python
"""Hostile and sloppy uploads (PRD 9.6, REQ-16, review focus 7)."""
from __future__ import annotations

import hashlib
from datetime import date

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.core.errors import DomainError
from apps.files import services as file_services
from apps.requests import services as request_services
from tests.hardening.helpers import PDF_BYTES, frozen, make_request, pdf  # noqa: F401

EXECUTABLE = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff" + b"\x00" * 128
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
SCRIPT = b"<html><script>alert(1)</script></html>"


def _store(world, name: str, content: bytes, content_type: str, kind: str = "employee_document"):
    upload = SimpleUploadedFile(name, content, content_type=content_type)
    return file_services.store_upload(actor=world.hr_user, upload=upload, kind=kind)


@pytest.mark.django_db
@pytest.mark.parametrize("name, content, content_type, code", [
    ("report.pdf", EXECUTABLE, "application/pdf", "files.content_mismatch"),
    ("scan.jpg", PNG, "image/jpeg", "files.content_mismatch"),
    ("page.png", SCRIPT, "image/png", "files.content_mismatch"),
    ("setup.exe", EXECUTABLE, "application/octet-stream", "files.type_not_allowed"),
    ("notes.html", SCRIPT, "text/html", "files.type_not_allowed"),
    ("archive.pdf.exe", PDF_BYTES, "application/pdf", "files.type_not_allowed"),
    ("empty.pdf", b"", "application/pdf", "files.empty"),
    ("huge.pdf", PDF_BYTES + b"\x00" * (11 * 1024 * 1024), "application/pdf", "files.too_large"),
])
def test_a_bad_upload_is_refused_with_a_specific_code(world, name, content, content_type, code):
    with pytest.raises(DomainError) as error:
        _store(world, name, content, content_type)
    assert error.value.code == code


@pytest.mark.django_db
@pytest.mark.parametrize("name", [
    "../../évaluation finale.pdf",
    "..\\..\\windows\\system32\\évaluation.pdf",
    "/etc/passwd.pdf",
    "contrat signé (2026) — Amira Ben Salah.pdf",
    "a" * 300 + ".pdf",
])
def test_a_strange_name_is_stored_safely_and_given_back_clean(world, name):
    attachment = _store(world, name, PDF_BYTES, "application/pdf")
    assert ".." not in attachment.storage_path
    assert "évaluation" not in attachment.storage_path and "contrat" not in attachment.storage_path
    assert "/" not in attachment.original_name and "\\" not in attachment.original_name
    assert attachment.original_name.endswith(".pdf")
    assert len(attachment.original_name) <= 255
    assert attachment.size == len(PDF_BYTES)
    assert attachment.sha256 == hashlib.sha256(PDF_BYTES).hexdigest()


@pytest.mark.django_db
def test_two_uploads_of_one_name_do_not_overwrite_each_other(world):
    first = _store(world, "certificat.pdf", PDF_BYTES, "application/pdf")
    second = _store(world, "certificat.pdf", PDF_BYTES + b"%second\n", "application/pdf")
    assert first.storage_path != second.storage_path
    assert first.public_id != second.public_id


@pytest.mark.django_db
def test_a_medical_file_is_encrypted_and_comes_back_intact(world, frozen):
    request = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.sick,
                           start=date(2026, 11, 2), end=date(2026, 11, 2))
    link = request_services.attach_file(actor=world.owner_user, request=request, upload=pdf("certificat.pdf"))
    attachment = link.attachment
    assert attachment.kind == "medical" and attachment.is_encrypted is True
    content, name, content_type = file_services.read_for_download(user=world.owner_user, attachment=attachment)
    assert content == PDF_BYTES and name == "certificat.pdf" and content_type == "application/pdf"


@pytest.mark.django_db
def test_the_api_refuses_a_renamed_executable_and_keeps_the_request_unchanged(world, client_for, frozen):
    request = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.sick,
                           start=date(2026, 11, 2), end=date(2026, 11, 2))
    url = reverse("requests:request-attachments", kwargs={"public_id": request.public_id})
    client = client_for(world.owner_user)

    bad = SimpleUploadedFile("certificat.pdf", EXECUTABLE, content_type="application/pdf")
    response = client.post(url, {"file": bad}, format="multipart")
    assert response.status_code == 400 and response.json()["code"] == "files.content_mismatch"
    assert response.json()["errors"][0]["field"] == "file"

    missing = client.post(url, {}, format="multipart")
    assert missing.status_code == 400

    def listed() -> list:
        body = client.get(url).json()
        return body["results"] if isinstance(body, dict) else body

    assert listed() == []
    good = client.post(url, {"file": pdf("certificat.pdf")}, format="multipart")
    assert good.status_code == 201
    assert [item["name"] for item in listed()] == ["certificat.pdf"]
```

- [ ] **Step 4: Run the three files**

Run: `docker compose run --rm app pytest tests/hardening/test_web_hardening.py tests/hardening/test_sign_in_edges.py tests/hardening/test_upload_edges.py -v`

Expected: 12 + 14 + 16 = 42 passed. These are verification tests and should pass at once.

When one fails:

- Cookie or settings assertions: the values are in the "Transport and browser security" block of `config/settings.py` (plan 01a). Outside development the session and CSRF cookies are `Secure` and HSTS is one year; in every environment the session cookie is `HttpOnly`, `SameSite=Lax`, `SESSION_EXPIRE_AT_BROWSER_CLOSE` is true and `X_FRAME_OPTIONS = "DENY"`.
- Inactivity: `apps.accounts.middleware` must compare the last activity stored in the session with `settings_service.get("session_timeout_minutes")` on every request, flush the session when exceeded, and otherwise store the new time.
- A sign-in test: the rule is in `apps.accounts.services.authenticate`. The email is stripped and lower-cased before anything else; the domain test compares the part after the last `@` with `ALLOWED_EMAIL_DOMAIN`; the address limit counts `auth.login_failed` audit rows of the address inside the lock-out window and is checked before the password.
- `test_the_administrator_cannot_create_an_account_outside_the_domain` returns another code: use `auth.domain_not_allowed` in `create_account`; the sign-in page and the create-account page show the same sentence.
- An upload test: the check order in `apps.files.services.store_upload` is empty, then size, then extension against `upload_allowed_types`, then magic bytes against the extension. The stored name is generated; `original_name` is the base name after the last `/` or `\`, cut to 255 characters while keeping the extension.
- `field` is not `file` in the API error: the view must attach the `DomainError` to the `file` field.

- [ ] **Step 5: Write the header check for a deployed stack**

The Django test client cannot see what Caddy adds. This script checks a running stack from the outside. `scripts/server/check-headers.sh` (LF line endings, executable):

```bash
#!/usr/bin/env bash
# Check the security headers, redirects and exposed ports of a deployed stack.
#
#   scripts/server/check-headers.sh https://hr-test.iris.local:8443 [http-port]
#
# Optional: CHECK_EMAIL and CHECK_PASSWORD of any account, to check the session cookie too.
set -uo pipefail

BASE="${1:?usage: check-headers.sh https://host[:port] [http-port]}"
HTTP_PORT="${2:-80}"
HOSTPORT="${BASE#https://}"
HOST="${HOSTPORT%%:*}"
FAILED=0

pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; FAILED=1; }
want() { if grep -Eiq -- "$3" <<<"$2"; then pass "$1"; else fail "$1"; fi; }
reject() { if grep -Eiq -- "$3" <<<"$2"; then fail "$1"; else pass "$1"; fi; }
head_of() { curl -sk --max-time 10 -D - -o /dev/null "$1" | tr -d '\r'; }

PAGE="$(head_of "$BASE/")"
API="$(head_of "$BASE/api/v1/health")"
CSP="$(grep -i '^content-security-policy:' <<<"$PAGE" || true)"

want   "page answers 200"                         "$PAGE" '^HTTP/[0-9.]+ 200'
want   "HSTS on the page, at least six months"    "$PAGE" '^strict-transport-security: .*max-age=(1[5-9][0-9]{6}|[2-9][0-9]{7}|[0-9]{9,})'
want   "HSTS on the API"                          "$API"  '^strict-transport-security: '
want   "content-security-policy present"          "$CSP"  "default-src 'self'"
reject "no unsafe script source"                  "$CSP"  "script-src[^;]*'unsafe-(inline|eval)'"
reject "no wildcard source"                       "$CSP"  "(default|script|connect|img|font)-src[^;]* \*( |;|$)"
want   "framing forbidden"                        "$PAGE" "(frame-ancestors 'none'|^x-frame-options: deny)"
want   "nosniff on the page"                      "$PAGE" '^x-content-type-options: nosniff'
want   "nosniff on the API"                       "$API"  '^x-content-type-options: nosniff'
want   "referrer policy set"                      "$PAGE" '^referrer-policy: (no-referrer|same-origin|strict-origin)'
reject "no framework banner"                      "$API"  '^(server|x-powered-by): .*(gunicorn|python|wsgi|django)'
want   "API health is ok"                         "$(curl -sk --max-time 10 "$BASE/api/v1/health")" '"status": ?"ok"'

REDIRECT="$(curl -s --max-time 10 -o /dev/null -w '%{http_code} %{redirect_url}' "http://$HOST:$HTTP_PORT/" || true)"
want   "plain HTTP redirects to HTTPS"            "$REDIRECT" '^30[18] https://'

CSRF="$(head_of "$BASE/api/v1/auth/csrf")"
want   "CSRF cookie is Secure"                    "$CSRF" '^set-cookie: csrftoken=[^;]+;.*secure'
want   "CSRF cookie is SameSite=Lax"              "$CSRF" '^set-cookie: csrftoken=[^;]+;.*samesite=lax'

if [[ -n "${CHECK_EMAIL:-}" && -n "${CHECK_PASSWORD:-}" ]]; then
  # Sign-in needs the CSRF token like every unsafe call (plan 01a, contract note 10).
  JAR="$(mktemp)"
  TOKEN="$(curl -sk --max-time 10 -c "$JAR" "$BASE/api/v1/auth/csrf" | sed -E 's/.*"csrf_token": ?"([^"]+)".*/\1/')"
  LOGIN="$(curl -sk --max-time 10 -b "$JAR" -D - -o /dev/null -H 'Content-Type: application/json' \
            -H "X-CSRFToken: $TOKEN" -H "Origin: $BASE" -H "Referer: $BASE/login" \
            -d "{\"email\":\"$CHECK_EMAIL\",\"password\":\"$CHECK_PASSWORD\"}" "$BASE/api/v1/auth/login" | tr -d '\r')"
  rm -f "$JAR"
  SESSION="$(grep -i '^set-cookie: sessionid=' <<<"$LOGIN" || true)"
  want   "sign-in succeeded"                      "$LOGIN"   '^HTTP/[0-9.]+ 200'
  want   "session cookie is Secure"               "$SESSION" 'secure'
  want   "session cookie is HttpOnly"             "$SESSION" 'httponly'
  want   "session cookie is SameSite=Lax"         "$SESSION" 'samesite=lax'
  reject "session cookie ends with the browser"   "$SESSION" '(max-age|expires)='
else
  echo "skip  session cookie (set CHECK_EMAIL and CHECK_PASSWORD to check it)"
fi

for PORT in 8000 5432; do
  if (exec 3<>"/dev/tcp/$HOST/$PORT") 2>/dev/null; then
    fail "port $PORT is reachable from here; only the proxy may be published"
  else
    pass "port $PORT is closed"
  fi
done

if [[ "$FAILED" -eq 0 ]]; then echo "All checks passed."; else echo "Some checks failed."; fi
exit "$FAILED"
```

Run: `git add --chmod=+x scripts/server/check-headers.sh && docker compose run --rm --no-deps -v "${PWD}/scripts:/scripts:ro" app bash -n /scripts/server/check-headers.sh && echo syntax-ok`

Expected: `syntax-ok`.

The script runs for real against the test stack in Task 16, where every line must read `ok`. When a line fails there, the fix is in `proxy/Caddyfile` (headers, redirect) or in `compose.server.yaml` (published ports).

- [ ] **Step 6: Commit**

```bash
git add backend/tests/hardening/test_web_hardening.py backend/tests/hardening/test_sign_in_edges.py backend/tests/hardening/test_upload_edges.py scripts/server/check-headers.sh
git commit -m "test: verify cookies, CSRF, session end, sign-in edges, uploads and proxy headers"
```

### Task 8: Concurrency checks

**Files:**
- Create: `backend/tests/hardening/test_concurrency.py`

**Interfaces:**
- Consumes: `tests.hardening.helpers`; `apps.requests.services` (`create_draft`, `submit`, `withdraw`, `decide_step`, `RequestData`); `apps.requests.models` (`Request`, `RequestStep`, `RequestStatus`, `StepStatus`, `Decision`); `apps.balances.services.post_month_end_credits`; `apps.balances.models.LedgerEntry`; `apps.organisation.services.create_delegation`; `apps.settings.services`; `apps.core.errors.DomainError`; routes `requests:step-decide`, `requests:request-submit`.
- Produces: nothing used by later tasks.

These tests run real parallel transactions: each racer is a thread with its own database connection, released together by a barrier. They need committed data, so they use `transaction=True`. No earlier plan has a transactional test: plan 04 chose sequential tests instead (its contract note 4). After such a test Django empties every table; plan 01a switches the TRUNCATE guards off for the test session, plan 04 lets its ledger be truncated outside production, and plan 03a's cast builder puts the five request types back (its contract note 1), so the next test starts from a full cast.

- [ ] **Step 1: Write the tests**

`backend/tests/hardening/test_concurrency.py`:

```python
"""Two actions at once: exactly one wins and the other is told (REQ-18, PRD 6.3, review focus 4)."""
from __future__ import annotations

import threading
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connections
from django.urls import reverse
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.balances import services as balance_services
from apps.balances.models import LedgerEntry
from apps.core.errors import DomainError
from apps.notifications.models import Notification
from apps.organisation import services as organisation_services
from apps.organisation.models import Employee
from apps.requests import services as request_services
from apps.requests.models import Decision, Request, RequestStatus, RequestStep, StepStatus
from apps.settings import services as settings_service
from tests.hardening.helpers import decide, frozen, give_balance, make_request, pending_step  # noqa: F401

User = get_user_model()
pytestmark = pytest.mark.django_db(transaction=True)
MON, TUE = date(2026, 11, 16), date(2026, 11, 17)
NEXT_MON, NEXT_TUE = date(2026, 11, 23), date(2026, 11, 24)


def race(*calls):
    """Run the callables at the same instant, each in its own thread and connection.

    Returns, in order, what each returned or the exception it raised.
    """
    barrier = threading.Barrier(len(calls))
    outcomes: list[object] = [None] * len(calls)

    def runner(index: int, call) -> None:
        try:
            barrier.wait(timeout=10)
            outcomes[index] = call()
        except Exception as error:  # noqa: BLE001  (the exception is the result under test)
            outcomes[index] = error
        finally:
            connections.close_all()

    threads = [threading.Thread(target=runner, args=(index, call)) for index, call in enumerate(calls)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)
        assert not thread.is_alive(), "a racer is still running: probable deadlock"
    return outcomes


def split(outcomes):
    won = [outcome for outcome in outcomes if not isinstance(outcome, Exception)]
    lost = [outcome for outcome in outcomes if isinstance(outcome, Exception)]
    unexpected = [outcome for outcome in lost if not isinstance(outcome, DomainError)]
    assert unexpected == [], f"a racer failed with something other than a domain error: {unexpected!r}"
    return won, lost


def _decide(user_id: int, step_id: int, version: int, decision: Decision, comment: str = ""):
    return lambda: request_services.decide_step(
        actor=User.objects.get(pk=user_id), step=RequestStep.objects.get(pk=step_id),
        decision=decision, comment=comment, expected_version=version)


def test_two_approvers_on_one_step_cannot_both_succeed(world, frozen):
    organisation_services.create_delegation(
        actor=world.manager_user, manager=world.manager, delegate=world.other_manager,
        start_date=date(2026, 11, 2), end_date=date(2026, 11, 30))
    request = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.remote,
                           start=MON, end=MON)
    step = pending_step(request)

    won, lost = split(race(
        _decide(world.manager_user.id, step.id, request.version, Decision.APPROVE),
        _decide(world.other_manager_user.id, step.id, request.version, Decision.APPROVE),
    ))

    assert len(won) == 1 and len(lost) == 1
    assert lost[0].code == "request.already_processed" and lost[0].status == 409
    step.refresh_from_db()
    assert step.status == StepStatus.APPROVED
    assert AuditEvent.objects.filter(action="step.decided").count() == 1
    assert RequestStep.objects.filter(request=request, status=StepStatus.PENDING).count() == 1   # the HR step


def test_an_approval_and_a_refusal_at_once_leave_one_clear_outcome(world, frozen):
    organisation_services.create_delegation(
        actor=world.manager_user, manager=world.manager, delegate=world.other_manager,
        start_date=date(2026, 11, 2), end_date=date(2026, 11, 30))
    request = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.remote,
                           start=MON, end=MON)
    step = pending_step(request)

    won, lost = split(race(
        _decide(world.manager_user.id, step.id, request.version, Decision.APPROVE),
        _decide(world.other_manager_user.id, step.id, request.version, Decision.REJECT, "Team meeting that day"),
    ))

    assert len(won) == 1 and len(lost) == 1
    request.refresh_from_db()
    step.refresh_from_db()
    assert (request.status, step.status) in {
        (RequestStatus.PENDING, StepStatus.APPROVED), (RequestStatus.REJECTED, StepStatus.REJECTED)}
    told = Notification.objects.filter(user=world.owner_user, event_code__in=["request.rejected", "request.approved"])
    assert told.count() == (1 if request.status == RequestStatus.REJECTED else 0)


def test_two_submissions_cannot_both_spend_the_same_balance(world, frozen):
    give_balance(world, world.owner, "3")
    first = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.annual,
                         start=MON, end=TUE, submit=False)
    second = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.annual,
                          start=NEXT_MON, end=NEXT_TUE, submit=False)

    def send(request_id: int):
        return lambda: request_services.submit(actor=User.objects.get(pk=world.owner_user.id),
                                               request=Request.objects.get(pk=request_id))

    won, lost = split(race(send(first.id), send(second.id)))

    assert len(won) == 1 and len(lost) == 1
    assert lost[0].code == "request.balance_insufficient"
    statuses = sorted(Request.objects.filter(employee=world.owner).values_list("status", flat=True))
    assert statuses == ["draft", "pending"]


def test_two_overlapping_requests_cannot_both_be_sent(world, frozen):
    first = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.remote,
                         start=MON, end=MON, submit=False)
    second = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.exceptional,
                          start=MON, end=MON, exceptional_event_id=world.event.id, submit=False)

    def send(request_id: int):
        return lambda: request_services.submit(actor=User.objects.get(pk=world.owner_user.id),
                                               request=Request.objects.get(pk=request_id))

    won, lost = split(race(send(first.id), send(second.id)))
    assert len(won) == 1 and len(lost) == 1
    assert lost[0].code == "request.overlap"


def test_a_double_click_on_send_creates_one_chain(world, frozen):
    draft = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.remote,
                         start=MON, end=MON, submit=False)

    def send():
        return request_services.submit(actor=User.objects.get(pk=world.owner_user.id),
                                       request=Request.objects.get(pk=draft.id), expected_version=draft.version)

    won, lost = split(race(send, send))
    assert len(won) == 1 and len(lost) == 1
    assert lost[0].status == 409
    steps = list(RequestStep.objects.filter(request=draft).values_list("round", "position"))
    assert len(steps) == len(set(steps)) == 2
    assert Notification.objects.filter(user=world.manager_user, event_code="step.to_decide").count() == 1


def test_a_final_approval_racing_a_withdrawal_ends_in_one_state(world, frozen):
    give_balance(world, world.owner, "5")
    request = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.annual,
                           start=MON, end=TUE)
    request = decide(request, world.manager_user)
    hr_step = pending_step(request)

    def withdraw():
        return request_services.withdraw(actor=User.objects.get(pk=world.owner_user.id),
                                         request=Request.objects.get(pk=request.id))

    won, lost = split(race(
        _decide(world.hr_user.id, hr_step.id, request.version, Decision.APPROVE),
        withdraw,
    ))

    assert len(won) == 1 and len(lost) == 1
    request.refresh_from_db()
    assert request.status in (RequestStatus.APPROVED, RequestStatus.WITHDRAWN)
    taken = LedgerEntry.objects.filter(employee=world.owner, kind="taken")
    if request.status == RequestStatus.APPROVED:
        assert lost[0].code in ("request.not_withdrawable", "request.already_processed")
        assert sum(entry.amount for entry in taken) == Decimal("-2")
    else:
        assert lost[0].code == "request.already_processed"
        assert not taken.exists()


def test_the_api_answers_200_and_409_to_two_decisions(world, frozen):
    organisation_services.create_delegation(
        actor=world.manager_user, manager=world.manager, delegate=world.other_manager,
        start_date=date(2026, 11, 2), end_date=date(2026, 11, 30))
    request = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.remote,
                           start=MON, end=MON)
    step = pending_step(request)
    url = reverse("requests:step-decide", kwargs={"id": step.id})
    body = {"decision": "approve", "comment": "", "version": request.version}

    def call(user_id: int):
        def run():
            client = APIClient()
            client.force_authenticate(User.objects.get(pk=user_id))
            response = client.post(url, body, format="json")
            return response.status_code, response.json()
        return run

    outcomes = race(call(world.manager_user.id), call(world.other_manager_user.id))
    assert sorted(status for status, _ in outcomes) == [200, 409]
    loser = next(payload for status, payload in outcomes if status == 409)
    assert loser["code"] == "request.already_processed"
    assert loser["detail"]                                   # a sentence the interface can show (UI 3.4)


def test_two_credit_runs_at_once_post_each_credit_once(world, frozen):
    Employee.objects.update(hire_date=date(2020, 1, 1))
    settings_service.set_value(actor=world.hr_user, key="credit_start_date", value="2026-10-01")

    def run():
        return balance_services.post_month_end_credits(today=date(2026, 11, 2))

    outcomes = race(run, run)
    assert not any(isinstance(outcome, Exception) for outcome in outcomes), outcomes
    credits = LedgerEntry.objects.filter(kind="credit", period="2026-10")
    assert credits.count() == 7
    assert credits.values("employee_id").distinct().count() == 7
```

- [ ] **Step 2: Run each test ten times**

A race that is lost one time in five still passes a single run. Run the file repeatedly:

Run: `docker compose run --rm app sh -c "for i in 1 2 3 4 5 6 7 8 9 10; do pytest tests/hardening/test_concurrency.py -q -p no:cacheprovider || exit 1; done"`

Expected: ten times `8 passed`. This is a verification suite and should pass at once.

If the run after this file fails in another test with missing request types or an "append-only" error, the teardown of a transactional test left the database in a state the next test cannot use. Check, in this order: `tests/db.py` disables the TRUNCATE trigger of every append-only table (plan 01a, note 28), the connection carries `iris.allow_truncate = on` (plan 04, note 3), and `apps/requests/tests/world.py` reseeds the types when they are gone (plan 03a, note 1).

When it fails, even once in ten:

- Two approvers both succeed, or the count of `step.decided` is 2: `decide_step` must, inside its transaction, lock the request row (`Request.objects.select_for_update().get(pk=step.request_id)`), reload the step, and raise `Conflict("request.already_processed")` when the request's `version` differs from `expected_version` or the step is no longer pending.
- Two submissions both pass the balance or the overlap check: `submit` must call `reach.lock_employee(request.employee_id)` before it validates, and must validate after the lock is held (PRD 6.3 and 6.4).
- A double submission creates four steps: `submit` must lock the request row and refuse a request that is no longer a draft or returned.
- The withdrawal race leaves ledger entries on a withdrawn request: `withdraw` must take the same request lock as `decide_step` before it reads the status.
- "probable deadlock": two code paths take the employee lock and the request lock in opposite orders. Fix the order everywhere: employee first, then request.
- The credit race raises `IntegrityError`: catch it per employee inside a savepoint (`with transaction.atomic():` around each insert) and count the entry as already posted.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/hardening/test_concurrency.py
git commit -m "test: real parallel transactions for decisions, submissions, withdrawal and credits"
```

### Task 9: Performance at the stated size

**Files:**
- Create: `backend/tests/hardening/load.py`
- Create: `backend/tests/hardening/test_load.py`
- Create: `backend/tests/hardening/perf_measure.py`

**Interfaces:**
- Consumes: `apps.organisation.services` (`create_department`, `create_position`, `create_employee`); `apps.accounts.services` (`create_account`, `assign_role`); `apps.accounts.roles.Role`; `apps.balances.services.post_opening`; `apps.requests.services` (`create_draft`, `submit`, `decide_step`, `resolve_approvers`, `RequestData`); `apps.requests.models`; the API routes read by an ordinary working day.
- Produces:
  - `tests.hardening.load.build(*, employees: int = 100, months: int = 12) -> dict[str, int]` (idempotent; refuses to run when `ENVIRONMENT=production`); accounts `load.hr@impactrisks.com`, `load.ceo@impactrisks.com`, `load.m1@…` to `load.m4@…`, `load.e001@…` onwards, all with the password `Correct-Horse-42!`.
  - `python tests/hardening/perf_measure.py --base URL [--host-header NAME] [--insecure] [--users 20] [--rounds 15] [--limit-ms 500]`, exit code 0 when every 95th percentile is under the limit. On a server stack the session cookie is `Secure`, so the script must go through the proxy with an `https` address.

NFR-01 sets the size (100 users, 20 concurrent, 4 cores, 8 GB) and NFR-02 the target (95% of API calls under 500 ms). The measurement that counts is the one taken on the office server during Task 17. The local run in this task finds slow queries early.

- [ ] **Step 1: Write the failing test for the load builder**

`backend/tests/hardening/test_load.py`:

```python
"""The load builder produces a company the API can serve."""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from apps.organisation.models import Employee
from apps.requests.models import Request, RequestStatus
from tests.hardening import load

User = get_user_model()


@pytest.mark.django_db
def test_build_creates_people_accounts_and_approved_history(world):
    counts = load.build(employees=6, months=2)

    assert counts["employees"] == 6 + 6          # the six asked for, plus HR, the CEO and four managers
    assert Employee.objects.filter(employee_number__startswith="L").count() == 12
    assert User.objects.filter(email__startswith="load.").count() == 12
    loaded = Request.objects.filter(employee__employee_number__startswith="L")
    assert counts["requests"] == loaded.count() >= 6 * 2 * 3
    assert set(loaded.values_list("status", flat=True)) == {RequestStatus.APPROVED}

    client = APIClient()
    signed_in = client.post(reverse("accounts:login"),
                            {"email": "load.e001@impactrisks.com", "password": load.PASSWORD}, format="json")
    assert signed_in.status_code == 200 and signed_in.json()["must_change_password"] is False
    assert client.get(reverse("requests:request-list"), {"scope": "mine"}).json()["count"] >= 6


@pytest.mark.django_db
def test_build_twice_changes_nothing(world):
    first = load.build(employees=6, months=1)
    second = load.build(employees=6, months=1)
    assert second == first


def test_build_refuses_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    with pytest.raises(RuntimeError, match="production"):
        load.build(employees=1, months=1)
```

Run: `docker compose run --rm app pytest tests/hardening/test_load.py -v`

Expected: FAIL at import with `ImportError: cannot import name 'load' from 'tests.hardening'`.

- [ ] **Step 2: Write the load builder**

`backend/tests/hardening/load.py`:

```python
"""Builds a company of the size NFR-01 states, with a year of approved requests.

Test tooling only. Everything goes through the services of the master plan, so the data is what
real use would produce, including audit rows, notifications and ledger entries.
"""
from __future__ import annotations

import os
from datetime import date, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.accounts import services as account_services
from apps.accounts.roles import Role
from apps.balances import services as balance_services
from apps.core.errors import DomainError
from apps.organisation import services as organisation_services
from apps.organisation.models import Employee
from apps.requests import services as request_services
from apps.requests.models import Decision, Request, RequestStep, RequestType, StepStatus
from apps.requests.services import RequestData

User = get_user_model()
PASSWORD = "Correct-Horse-42!"
DEPARTMENTS = [("LD1", "Souscription", "Underwriting"), ("LD2", "Sinistres", "Claims"),
               ("LD3", "Finance", "Finance"), ("LD4", "Opérations", "Operations")]


def _employee_data(*, number: str, first: str, last: str, email: str, department, position, manager) -> dict:
    """The one place that knows the shape of `create_employee`'s data.

    If plan 02 named a key differently, change it here and nowhere else; the names below are the
    columns of PRD 8.2.
    """
    return {
        "employee_number": number, "first_name": first, "last_name": last,
        "professional_email": email, "hire_date": date(2020, 1, 6),
        "contract_start_date": date(2020, 1, 6), "contract_type": "permanent",
        "department": department, "position": position, "manager": manager,
    }


def _account(employee: Employee, *roles: Role) -> User:
    user, _temporary = account_services.create_account(actor=None, employee_public_id=str(employee.public_id))
    for role in roles:
        account_services.assign_role(actor=None, user=user, role=role)
    user.set_password(PASSWORD)
    user.must_change_password = False
    user.temp_password_expires_at = None
    user.save(update_fields=["password", "must_change_password", "temp_password_expires_at"])
    return user


def _approve(request: Request) -> None:
    while True:
        request.refresh_from_db()
        step = (RequestStep.objects.filter(request=request, status=StepStatus.PENDING)
                .order_by("-round", "position").first())
        if step is None:
            return
        approver = request_services.resolve_approvers(step)[0]
        request_services.decide_step(actor=approver, step=step, decision=Decision.APPROVE,
                                     expected_version=request.version)


def _first_monday(year: int, month: int) -> date:
    first = date(year, month, 1)
    return first + timedelta(days=(7 - first.weekday()) % 7)


def _months_back(today: date, count: int) -> list[tuple[int, int]]:
    months, year, month = [], today.year, today.month
    for _ in range(count):
        month -= 1
        if month == 0:
            year, month = year - 1, 12
        months.append((year, month))
    return months


def _counts() -> dict[str, int]:
    return {
        "employees": Employee.objects.filter(employee_number__startswith="L").count(),
        "requests": Request.objects.filter(employee__employee_number__startswith="L").count(),
    }


def build(*, employees: int = 100, months: int = 12) -> dict[str, int]:
    if os.environ.get("ENVIRONMENT") == "production":
        raise RuntimeError("the load builder must never run in production")
    if User.objects.filter(email="load.hr@impactrisks.com").exists():
        return _counts()

    types = {code: RequestType.objects.get(code=code) for code in ("annual", "sick", "permission", "remote")}
    today = timezone.localdate()

    with transaction.atomic():
        position = organisation_services.create_position(
            actor=None, code="LP1", title_fr="Collaborateur", title_en="Staff member")
        departments = [organisation_services.create_department(actor=None, code=code, name_fr=fr, name_en=en)
                       for code, fr, en in DEPARTMENTS]

        def person(number: str, first: str, last: str, slug: str, department, manager) -> Employee:
            return organisation_services.create_employee(actor=None, data=_employee_data(
                number=number, first=first, last=last, email=f"load.{slug}@impactrisks.com",
                department=department, position=position, manager=manager))

        ceo = person("L0001", "Leila", "Direction", "ceo", departments[2], None)
        _account(ceo, Role.EXEC)
        hr = person("L0002", "Hana", "Ressources", "hr", departments[3], ceo)
        hr_user = _account(hr, Role.HR)
        managers = []
        for index, department in enumerate(departments, start=1):
            manager = person(f"L001{index}", "Manager", f"Equipe{index}", f"m{index}", department, ceo)
            _account(manager)
            managers.append(manager)
        staff = []
        for index in range(1, employees + 1):
            slot = (index - 1) % len(departments)
            employee = person(f"L1{index:03d}", "Employe", f"Numero{index:03d}", f"e{index:03d}",
                              departments[slot], managers[slot])
            _account(employee)
            staff.append(employee)

        for employee in [*managers, *staff]:
            balance_services.post_opening(actor=hr_user, employee=employee, amount=Decimal("40"),
                                          effective_date=today - timedelta(days=400), reason="Load data")

    for year, month in _months_back(today, months):
        monday = _first_monday(year, month)
        for index, employee in enumerate(staff):
            plans = [
                (types["annual"], RequestData(start_date=monday, end_date=monday + timedelta(days=1))),
                (types["remote"], RequestData(start_date=monday + timedelta(days=2),
                                              end_date=monday + timedelta(days=2))),
                (types["permission"], RequestData(start_date=monday + timedelta(days=3),
                                                  end_date=monday + timedelta(days=3),
                                                  start_time=time(9, 0), end_time=time(11, 0))),
            ]
            if index % 3 == 0:
                plans.append((types["sick"], RequestData(start_date=monday + timedelta(days=4),
                                                         end_date=monday + timedelta(days=4), comment="Load")))
            for request_type, data in plans:
                try:
                    with transaction.atomic():
                        draft = request_services.create_draft(actor=hr_user, employee=employee,
                                                              request_type=request_type, data=data,
                                                              override_reason="Load data")
                        _approve(request_services.submit(actor=hr_user, request=draft))
                except DomainError:
                    continue        # for example a public holiday on that day in this database
    return _counts()
```

- [ ] **Step 3: Run the builder test**

Run: `docker compose run --rm app pytest tests/hardening/test_load.py -v`

Expected: 3 passed.

If `create_employee` rejects the data, read the error: it names the key. Adjust `_employee_data` only (for example `department` may be expected as an id). If `create_department` or `create_position` refuses `actor=None`, pass an HR account created first with `account_services.create_account(actor=None, email="load.setup@impactrisks.com", full_name="Load Setup", roles=[Role.HR])`.

- [ ] **Step 4: Write the measurement script**

`backend/tests/hardening/perf_measure.py` uses only the standard library, so it also runs inside the server image.

```python
"""Measure the read endpoints of a working day under concurrent sessions (NFR-01, NFR-02).

    python tests/hardening/perf_measure.py --base http://localhost:8000 --users 20

Exit code 0 when the 95th percentile of every endpoint is under the limit and no call failed.
"""
from __future__ import annotations

import argparse
import http.cookiejar
import json
import ssl
import statistics
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

PASSWORD = "Correct-Horse-42!"
TODAY = date.today()
MONTH = {"from": TODAY.replace(day=1).isoformat(), "to": TODAY.isoformat()}
EVERYONE = [
    ("me", "/auth/me", {}),
    ("unread count", "/notifications/unread-count", {}),
    ("notifications", "/notifications", {}),
    ("my requests", "/requests", {"scope": "mine"}),
    ("my home", "/home/me", {}),
    ("department calendar", "/calendar", {**MONTH, "scope": "department"}),
    ("request types", "/request-types", {}),
    ("holidays", "/holidays", {"year": str(TODAY.year)}),
    ("my balance", "/balances/{employee}", {}),
    ("my ledger", "/balances/{employee}/ledger", {}),
    ("workspace summary", "/workspaces/summary", {}),
]
BY_ROLE = {
    "manager": [
        ("to decide", "/approvals", {"queue": "mine"}),
        ("team home", "/home/team", {}),
        ("team requests", "/requests", {"scope": "team"}),
        ("team calendar", "/calendar", {**MONTH, "scope": "team"}),
        ("team people", "/employees", {}),
    ],
    "hr": [
        ("hr queue", "/approvals", {"queue": "hr"}),
        ("certificates queue", "/approvals", {"queue": "certificates"}),
        ("all requests", "/requests", {"scope": "all"}),
        ("all employees", "/employees", {"page_size": "100"}),
        ("company calendar", "/calendar", {**MONTH, "scope": "company"}),
        ("absence report", "/reports/absences", MONTH),
        ("balance report", "/reports/balances", {"on": TODAY.isoformat()}),
        ("kpmg export", "/exports/kpmg", MONTH),
        ("activity log", "/audit/business", {}),
    ],
    "exec": [
        ("overview home", "/home/overview", {}),
        ("all requests", "/requests", {"scope": "all"}),
        ("company calendar", "/calendar", {**MONTH, "scope": "company"}),
    ],
}


class Session:
    def __init__(self, base: str, host_header: str | None, email: str, insecure: bool = False) -> None:
        self.base, self.host_header, self.email = base.rstrip("/") + "/api/v1", host_header, email
        handlers: list = [urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())]
        if insecure:
            handlers.append(urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))  # noqa: S323
        self.opener = urllib.request.build_opener(*handlers)
        self.me: dict = {}
        self.csrf = ""

    def _request(self, path: str, params: dict | None = None, body: dict | None = None) -> tuple[int, bytes, float]:
        url = self.base + path + ("?" + urllib.parse.urlencode(params) if params else "")
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        if self.host_header:
            request.add_header("Host", self.host_header)
        if body is not None:
            request.add_header("X-CSRFToken", self.csrf)
            request.add_header("Origin", f"http://{self.host_header}" if self.host_header else self.base.split("/api/")[0])
        started = time.perf_counter()
        try:
            with self.opener.open(request, timeout=30) as response:
                payload, status = response.read(), response.status
        except urllib.error.HTTPError as error:
            payload, status = error.read(), error.code
        return status, payload, (time.perf_counter() - started) * 1000

    def sign_in(self) -> None:
        # Sign-in needs the CSRF token like every unsafe call (plan 01a, contract note 10).
        _, payload, _ = self._request("/auth/csrf")
        self.csrf = json.loads(payload)["csrf_token"]
        status, payload, _ = self._request("/auth/login", body={"email": self.email, "password": PASSWORD})
        if status != 200:
            raise SystemExit(f"cannot sign in as {self.email}: {status} {payload[:200]!r}")
        self.me = json.loads(payload)

    def endpoints(self) -> list[tuple[str, str, dict]]:
        chosen = list(EVERYONE)
        for role in self.me.get("roles", []):
            chosen += BY_ROLE.get(role, [])
        employee = (self.me.get("employee") or {}).get("public_id", "")
        return [(label, path.replace("{employee}", employee), params) for label, path, params in chosen
                if "{employee}" not in path or employee]

    def run(self, rounds: int, timings: dict, failures: list, lock: threading.Lock) -> None:
        for _ in range(rounds):
            for label, path, params in self.endpoints():
                status, _, elapsed = self._request(path, params)
                with lock:
                    if status == 200:
                        timings.setdefault(label, []).append(elapsed)
                    else:
                        failures.append((self.email, label, status))


def accounts(users: int) -> list[str]:
    fixed = ["load.hr@impactrisks.com", "load.ceo@impactrisks.com", "load.m1@impactrisks.com",
             "load.m2@impactrisks.com", "load.m3@impactrisks.com", "load.m4@impactrisks.com"]
    staff = [f"load.e{index:03d}@impactrisks.com" for index in range(1, max(users - len(fixed), 0) + 1)]
    return (fixed + staff)[:users]


def percentile_95(values: list[float]) -> float:
    return statistics.quantiles(values, n=20)[18] if len(values) >= 2 else values[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, help="for example http://localhost:8000")
    parser.add_argument("--host-header", default=None)
    parser.add_argument("--insecure", action="store_true",
                        help="accept the certificate of Caddy's own authority (a server stack reached through its proxy)")
    parser.add_argument("--users", type=int, default=20)
    parser.add_argument("--rounds", type=int, default=15)
    parser.add_argument("--limit-ms", type=float, default=500.0)
    options = parser.parse_args()

    sessions = [Session(options.base, options.host_header, email, options.insecure) for email in accounts(options.users)]
    for session in sessions:
        session.sign_in()

    timings: dict[str, list[float]] = {}
    failures: list[tuple[str, str, int]] = []
    lock = threading.Lock()
    threads = [threading.Thread(target=session.run, args=(options.rounds, timings, failures, lock))
               for session in sessions]
    started = time.perf_counter()
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    total = sum(len(values) for values in timings.values())
    seconds = time.perf_counter() - started

    print(f"{options.users} concurrent sessions, {total} calls in {seconds:.1f} s ({total / seconds:.0f} calls/s)\n")
    print(f"{'endpoint':<24}{'calls':>7}{'median':>10}{'p95':>10}{'max':>10}")
    slow = []
    for label in sorted(timings):
        values = timings[label]
        p95 = percentile_95(values)
        flag = "" if p95 < options.limit_ms else "   SLOW"
        print(f"{label:<24}{len(values):>7}{statistics.median(values):>9.0f}ms{p95:>8.0f}ms{max(values):>8.0f}ms{flag}")
        if p95 >= options.limit_ms:
            slow.append(label)
    overall = percentile_95([value for values in timings.values() for value in values])
    print(f"\nall calls: p95 = {overall:.0f} ms (limit {options.limit_ms:.0f} ms)")

    for email, label, status in failures[:20]:
        print(f"FAILED {label} as {email}: HTTP {status}")
    if slow or failures or overall >= options.limit_ms:
        print(f"\nNOT MET: {len(slow)} slow endpoint(s), {len(failures)} failed call(s)")
        return 1
    print("\nNFR-02 met.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Load the development database and measure**

The development server (`runserver`) is not what production runs. Measure against Gunicorn with four workers, the production command, in a throw-away container.

Run, one line at a time:

```bash
docker compose up -d
docker compose exec app python manage.py shell -c "from tests.hardening.load import build; print(build(employees=100, months=12))"
docker compose run --rm -d --name iris-perf app gunicorn config.wsgi:application --bind 0.0.0.0:8001 --workers 4
docker compose exec app python tests/hardening/perf_measure.py --base http://iris-perf:8001 --host-header localhost --users 20 --rounds 15
docker stop iris-perf
```

Expected: the build prints `{'employees': 106, 'requests': 4008}` after a few minutes (100 employees, 12 months, 3 requests each plus 34 sick leaves a month); the measurement prints one line per endpoint and ends with `NFR-02 met.`

When an endpoint is marked `SLOW`:

1. Find its queries: `docker compose exec app python manage.py shell -c "from django.test.utils import CaptureQueriesContext; from django.db import connection; from rest_framework.test import APIClient; from django.contrib.auth import get_user_model; c = APIClient(); c.force_authenticate(get_user_model().objects.get(email='load.hr@impactrisks.com')); ctx = CaptureQueriesContext(connection); ctx.__enter__(); c.get('/api/v1/requests', {'scope': 'all'}); ctx.__exit__(None, None, None); print(len(ctx)); [print(q['time'], q['sql'][:160]) for q in sorted(ctx, key=lambda q: -float(q['time']))[:10]]"` (replace the path with the slow one).
2. More than about fifteen queries for one page of a list means a query per row. Add `select_related` or `prefetch_related` to the selector of the owning app and add a query-count assertion to that app's API test, for example `with django_assert_max_num_queries(15): client.get(url)`.
3. One slow query means a missing index. The usual candidates are `Request(employee, status)`, `Request(start_date, end_date)`, `RequestStep(status, approver_rule)`, `LedgerEntry(employee, effective_date)`, `AuditEvent(category, at)`, `Notification(user, read_at)`. Add the index with a migration in the owning app.
4. Rerun the measurement until it ends with `NFR-02 met.`

Then remove the load data from the development database: `powershell -File scripts/dev.ps1 reset` followed by `docker compose exec app python manage.py seed_demo`.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/hardening/load.py backend/tests/hardening/test_load.py backend/tests/hardening/perf_measure.py
git commit -m "test: load builder for 100 users and a p95 measurement of the read endpoints"
```

Commit any index or selector fix separately, in the owning app, as `perf: <what and why>`.

### Task 10: Accessibility, keyboard, phone, browsers and text parity

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json` (add `@axe-core/playwright`)
- Modify: `frontend/playwright.config.ts` (one engine per run, chosen by `E2E_BROWSER`)
- Modify: `.github/workflows/ci.yml` (the browser job runs once per engine)
- Create: `frontend/e2e/support/session.ts`
- Create: `frontend/e2e/support/data.ts`
- Create: `frontend/e2e/support/pages.ts`
- Create: `frontend/e2e/support/checks.ts`
- Create: `frontend/e2e/a11y.spec.ts`
- Create: `frontend/e2e/keyboard.spec.ts`
- Create: `frontend/e2e/phone-fit.spec.ts`
- Create: `backend/tests/hardening/test_message_catalogue.py`

**Interfaces:**
- Consumes:
  - Plan 01b: `frontend/playwright.config.ts` (projects `desktop` and `phone`, one worker, `E2E_BASE_URL`, `e2e/global-setup.ts` running `e2e_reset`); `e2e/helpers.ts` (`PASSWORD`, `SYSADMIN`, `signIn`, `signOut`, `fillSignIn`); the Sign in page's language buttons "Français" and "English"; `GET /api/v1/auth/csrf`, which returns `{csrf_token}` and must precede every unsafe call, sign-in included (plan 01a, contract note 10).
  - Plan 02: `e2e/people.ts` (`HR`, `MANAGER`, `OTHER_MANAGER`, `EMPLOYEE`, `landed`); the page labels its journeys use.
  - Plan 03b: `e2e/requests.ts` (`tuesday`, `ownWeek`, `frDate`, `row`, `toDecide`, `become`, `askFor`, `approveAsManager`); journeys 1, 2, 3, 6 and 8 of `ownWeek` are taken by plan 03b, 10 and 11 by plan 06.
  - The routes registered by plans 01b to 06 (listed in `pages.ts` below); the API of master section 7; `apps.core.i18n.all_messages`.
- Produces, for Tasks 11 and 12:
  - `e2e/support/session.ts`: `Api` (`get`, `send`, `attempt`), `Persona`, `USERS`, `enterAs(page, persona, language?) -> Promise<Api>`, `apiAs(baseURL, persona) -> Promise<Api>`, `apiOf(page) -> Api`, `open(page, path)`, `baseUrlOf(testInfo)`.
  - `e2e/support/data.ts`: `createRequest(api, fields)`, `decideNext(api, queue, publicId, decision?)`, `approveFully(baseURL, publicId)`, `Fixtures`, `ensureFixtures(baseURL)`.
  - `e2e/support/pages.ts`: `PageSpec`, `PAGES`, `HUBS`, `resolve(spec, fixtures)`.
  - `e2e/support/checks.ts`: `expectNoAxeViolations(page)`, `expectOneLanguage(page, language)`, `expectNoRawKeys(page)`, `tabTo(page, target)`.
  - `E2E_BROWSER=chromium|firefox|edge npx playwright test`: the suite on one engine.

The journeys of plans 01b to 06 sign in through the Sign in page, in French, and that is right for a journey. The audits of this task open about sixty pages in two languages; they sign in through the API inside the browser's own context, which takes a few milliseconds and depends on no wording.

- [ ] **Step 1: Add the axe engine**

Run on the host (Playwright runs on the host, master decision D20), then refresh the container's modules:

```bash
cd frontend
npm install --save-dev @axe-core/playwright
cd ..
docker compose run --rm web npm ci
```

Expected: `package.json` gains `"@axe-core/playwright"` under `devDependencies`; `npm ci` ends without error.

- [ ] **Step 2: Let a run choose its browser engine (NFR-07)**

Plan 01b runs the journeys on Chromium, on a desktop and a phone viewport, and leaves Firefox and Edge to this plan (its contract note 14). The journeys of one run share one database and take their dates from the project name (`ownWeek` distinguishes `phone` from everything else), so two desktop engines cannot run in the same invocation. The engine is therefore chosen per run, and the project is still called `desktop`.

Replace `frontend/playwright.config.ts`. Plan 01b's file reads:

```ts
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
```

The whole file becomes:

```ts
import { defineConfig, devices } from "@playwright/test";

// NFR-07: current Chrome, Edge and Firefox, on desktop and phone.
// One engine per run, chosen by E2E_BROWSER, because the journeys of a run share one database and take
// their dates from the project name ("desktop" or "phone"). Each run resets the database first.
const ENGINES = {
  chromium: { ...devices["Desktop Chrome"] },
  firefox: { ...devices["Desktop Firefox"] },
  edge: { ...devices["Desktop Edge"], channel: "msedge" },
} as const;

type Engine = keyof typeof ENGINES;
const engine = (process.env.E2E_BROWSER ?? "chromium") as Engine;
if (!(engine in ENGINES)) {
  throw new Error(`E2E_BROWSER must be one of: ${Object.keys(ENGINES).join(", ")}`);
}

// The journeys run against the development stack (docker compose up -d) and share one database,
// so they run one after the other.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    locale: "fr-FR",
    timezoneId: "Africa/Tunis",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: ENGINES[engine] },
    // A phone viewport is emulated by Chromium only (Chrome and Edge on Android are Chromium).
    // Firefox on a phone is checked by hand at the rehearsal (Task 17).
    ...(engine === "chromium" ? [{ name: "phone", use: { ...devices["Pixel 7"] } }] : []),
  ],
});
```

Install the two engines once, on the host:

Run: `cd frontend; npx playwright install firefox; npx playwright install msedge`

Expected: Firefox is downloaded; for Edge, Playwright reports that Microsoft Edge is already installed on Windows 11, or installs it.

In `.github/workflows/ci.yml`, the job `e2e` of plan 01b begins:

```yaml
  e2e:
    name: Browser journeys
    runs-on: ubuntu-24.04
    needs: [backend, frontend]
    steps:
```

and holds these two steps:

```yaml
      - name: Install Playwright and its browser
        working-directory: frontend
        run: |
          npm ci
          npx playwright install --with-deps chromium
```

```yaml
      - name: Journeys
        working-directory: frontend
        run: npx playwright test
```

Change the head of the job to:

```yaml
  e2e:
    name: Browser journeys (${{ matrix.browser }})
    runs-on: ubuntu-24.04
    needs: [backend, frontend]
    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox, edge]
    steps:
```

and the two steps to:

```yaml
      - name: Install Playwright and its browser
        working-directory: frontend
        run: |
          npm ci
          npx playwright install --with-deps ${{ matrix.browser == 'edge' && 'msedge' || matrix.browser }}
```

```yaml
      - name: Journeys
        working-directory: frontend
        env:
          E2E_BROWSER: ${{ matrix.browser }}
        run: npx playwright test
```

In the same job, change the artifact name `playwright-report` to `playwright-report-${{ matrix.browser }}`, so the three runs do not overwrite each other's report.

- [ ] **Step 3: Write the session helper**

`frontend/e2e/support/session.ts`:

```ts
import { type APIRequestContext, type Page, type TestInfo, expect, request as playwrightRequest } from "@playwright/test";

import { PASSWORD } from "../helpers";

/** The demo accounts (master 6.11). The journeys use them by name; the audits by role. */
export const USERS = {
  sysadmin: "sysadmin@impactrisks.com",
  ceo: "ceo@impactrisks.com",
  hr: "hr@impactrisks.com",
  manager: "manager.a@impactrisks.com",
  owner: "employee.a1@impactrisks.com",
  peer: "employee.a2@impactrisks.com",
  otherManager: "manager.b@impactrisks.com",
  outsider: "employee.b1@impactrisks.com",
} as const;

export type Persona = keyof typeof USERS;
export type Language = "fr" | "en";
type Method = "post" | "put" | "patch" | "delete";

/** The REST API with the CSRF token added, failing loudly on an unexpected status. */
export class Api {
  constructor(readonly context: APIRequestContext) {}

  private async token(): Promise<string> {
    const state = await this.context.storageState();
    return state.cookies.find((cookie) => cookie.name === "csrftoken")?.value ?? "";
  }

  async get<T = any>(path: string, params?: Record<string, string>): Promise<T> {
    const response = await this.context.get(`/api/v1${path}`, { params });
    expect(response.status(), `GET ${path}: ${await response.text()}`).toBe(200);
    return response.json();
  }

  async send<T = any>(method: Method, path: string, data?: unknown): Promise<T> {
    const response = await this.context.fetch(`/api/v1${path}`, {
      method: method.toUpperCase(),
      headers: { "X-CSRFToken": await this.token() },
      data: data ?? {},
    });
    expect(response.status(), `${method.toUpperCase()} ${path}: ${await response.text()}`).toBeLessThan(300);
    return response.status() === 204 ? (undefined as T) : response.json();
  }

  /** Like `send`, but returns the status without asserting it. */
  async attempt(method: Method, path: string, data?: unknown): Promise<number> {
    const response = await this.context.fetch(`/api/v1${path}`, {
      method: method.toUpperCase(),
      headers: { "X-CSRFToken": await this.token() },
      data: data ?? {},
    });
    return response.status();
  }
}

async function login(context: APIRequestContext, email: string, password: string): Promise<Api> {
  const api = new Api(context);
  await context.get("/api/v1/auth/csrf");               // sets the csrftoken cookie: sign-in needs it too
  await api.send("post", "/auth/login", { email, password });
  return api;
}

/** Opens a session for a demo account in the browser's own context, without the Sign in page. */
export async function enterAs(page: Page, persona: Persona, language: Language = "fr"): Promise<Api> {
  const api = await login(page.context().request, USERS[persona], PASSWORD);
  await api.send("patch", "/auth/me", { language });
  return api;
}

/** The API with the session the page already has (after a sign-in through the page). */
export function apiOf(page: Page): Api {
  return new Api(page.context().request);
}

/** An API session with no browser, for preparing data. */
export async function apiAs(baseURL: string, persona: Persona): Promise<Api> {
  const context = await playwrightRequest.newContext({ baseURL, ignoreHTTPSErrors: true });
  return login(context, USERS[persona], PASSWORD);
}

/** Opens a page and waits until it has settled. */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main")).toBeVisible();
}

export function baseUrlOf(testInfo: TestInfo): string {
  return testInfo.project.use.baseURL ?? "http://localhost:5173";
}
```

- [ ] **Step 4: Write the data helper**

`frontend/e2e/support/data.ts`. The audits need one request in each of three states. They are created once per database through the API, on Tuesdays far beyond the weeks any journey uses (`ownWeek` gives weeks 8 to 29).

```ts
import { tuesday } from "../requests";
import { type Api, apiAs } from "./session";

export interface RequestFields {
  type: "annual" | "sick" | "exceptional" | "permission" | "remote";
  start_date: string;
  end_date?: string;
  comment?: string;
  submit?: boolean;
}

export async function createRequest(api: Api, fields: RequestFields): Promise<any> {
  const { submit = true, ...rest } = fields;
  const draft = await api.send("post", "/requests", {
    end_date: rest.start_date, starts_at_midday: false, ends_at_midday: false, start_time: null,
    end_time: null, exceptional_event: null, comment: "", ...rest,
  });
  if (!submit) return draft;
  return api.send("post", `/requests/${draft.public_id}/submit`, { version: draft.version });
}

/** Decides the step of `publicId` that waits in the caller's queue. */
export async function decideNext(api: Api, queue: "mine" | "hr", publicId: string,
                                 decision: "approve" | "reject" | "return" = "approve", comment = ""): Promise<void> {
  const page = await api.get("/approvals", { queue, page_size: "100" });
  const item = page.results.find((entry: any) => entry.request.public_id === publicId);
  if (!item) throw new Error(`request ${publicId} is not in the '${queue}' queue`);
  await api.send("post", `/steps/${item.step_id}/decide`, { decision, comment, version: item.request.version });
}

/** Approves a request of employee.a1 or employee.a2: their manager, then HR. */
export async function approveFully(baseURL: string, publicId: string): Promise<void> {
  await decideNext(await apiAs(baseURL, "manager"), "mine", publicId);
  await decideNext(await apiAs(baseURL, "hr"), "hr", publicId);
}

export interface Fixtures {
  ownerEmployee: string;      // public_id of the record of employee.a1
  ownerAccount: string;       // public_id of the account of employee.a1
  pending: string;            // a request of employee.a1 waiting for the manager
  draft: string;              // a draft of employee.a1
  approved: string;           // an approved, future request of employee.a1
}

const MARK = "Audit";
let cached: Fixtures | undefined;

/** Creates, once per database, the items that pages with an identifier need. Safe to call again. */
export async function ensureFixtures(baseURL: string): Promise<Fixtures> {
  if (cached) return cached;
  const owner = await apiAs(baseURL, "owner");
  const sysadmin = await apiAs(baseURL, "sysadmin");
  const me = await owner.get("/auth/me");
  const mine = (await owner.get("/requests", { scope: "mine", page_size: "100" })).results
    .filter((request: any) => (request.comment ?? "").startsWith(MARK));
  const find = (status: string) => mine.find((request: any) => request.status === status)?.public_id as string | undefined;

  let pending = find("pending");
  if (!pending) {
    pending = (await createRequest(owner, { type: "remote", start_date: tuesday(60), comment: `${MARK} en attente` })).public_id;
  }
  let draft = find("draft");
  if (!draft) {
    draft = (await createRequest(owner, { type: "remote", start_date: tuesday(62), comment: `${MARK} brouillon`, submit: false })).public_id;
  }
  let approved = find("approved");
  if (!approved) {
    approved = (await createRequest(owner, { type: "remote", start_date: tuesday(64), comment: `${MARK} approuvée` })).public_id;
    await approveFully(baseURL, approved!);
  }
  const accounts = await sysadmin.get("/accounts", { search: me.email });
  cached = {
    ownerEmployee: me.employee.public_id,
    ownerAccount: accounts.results[0].public_id,
    pending: pending!, draft: draft!, approved: approved!,
  };
  return cached;
}
```

- [ ] **Step 5: Write the page inventory**

`frontend/e2e/support/pages.ts` lists UI section 11 with the addresses the plans registered. The two hubs of Oversight are followed one level down by the spec, so their sub-pages need no entry here.

```ts
import type { Fixtures } from "./data";
import type { Persona } from "./session";

export interface PageSpec {
  id: string;
  persona: Persona;
  path: string | ((fixtures: Fixtures) => string);
  home?: boolean;                                 // a workspace home (at most four blocks)
}

const REPORTS = ["absences", "balances", "waiting", "permission-hours", "remote-days"];

export const PAGES: PageSpec[] = [
  { id: "change password", persona: "owner", path: "/password" },
  { id: "notifications", persona: "owner", path: "/notifications" },
  { id: "not available", persona: "owner", path: "/me/requests/00000000-0000-4000-8000-000000000000" },
  // My space
  { id: "me: home", persona: "owner", path: "/me", home: true },
  { id: "me: requests", persona: "owner", path: "/me/requests" },
  { id: "me: new request, the kind", persona: "owner", path: "/me/requests/new" },
  { id: "me: new request, the form", persona: "owner", path: "/me/requests/new?type=remote" },
  { id: "me: edit request", persona: "owner", path: (f) => `/me/requests/${f.draft}/edit` },
  { id: "me: request", persona: "owner", path: (f) => `/me/requests/${f.pending}` },
  { id: "me: change or cancel", persona: "owner", path: (f) => `/me/requests/${f.approved}/change` },
  { id: "me: calendar", persona: "owner", path: "/me/calendar" },
  { id: "me: balance", persona: "owner", path: "/me/balance" },
  { id: "me: profile", persona: "owner", path: "/me/profile" },
  { id: "me: propose a change", persona: "owner", path: "/me/profile/change" },
  // My team
  { id: "team: to decide", persona: "manager", path: "/team", home: true },
  { id: "team: request", persona: "manager", path: (f) => `/team/requests/${f.pending}` },
  { id: "team: people", persona: "manager", path: "/team/people" },
  { id: "team: person", persona: "manager", path: (f) => `/team/people/${f.ownerEmployee}` },
  { id: "team: requests", persona: "manager", path: "/team/requests" },
  { id: "team: calendar", persona: "manager", path: "/team/calendar" },
  { id: "team: delegations", persona: "manager", path: "/team/delegations" },
  { id: "team: reports", persona: "manager", path: "/team/reports" },
  ...REPORTS.map((name): PageSpec => ({ id: `team: report ${name}`, persona: "manager", path: `/team/reports/${name}` })),
  // HR desk
  { id: "hr: desk", persona: "hr", path: "/hr", home: true },
  { id: "hr: to validate", persona: "hr", path: "/hr/validate" },
  { id: "hr: certificates", persona: "hr", path: "/hr/certificates" },
  { id: "hr: stuck", persona: "hr", path: "/hr/stuck" },
  { id: "hr: profile changes", persona: "hr", path: "/hr/profile-changes" },
  { id: "hr: requests", persona: "hr", path: "/hr/requests" },
  { id: "hr: new request", persona: "hr", path: "/hr/requests/new" },
  { id: "hr: request", persona: "hr", path: (f) => `/hr/requests/${f.approved}` },
  { id: "hr: employees", persona: "hr", path: "/hr/employees" },
  { id: "hr: new employee", persona: "hr", path: "/hr/employees/new" },
  { id: "hr: employee record", persona: "hr", path: (f) => `/hr/employees/${f.ownerEmployee}` },
  { id: "hr: edit employee", persona: "hr", path: (f) => `/hr/employees/${f.ownerEmployee}/edit` },
  { id: "hr: calendar", persona: "hr", path: "/hr/calendar" },
  { id: "hr: reports", persona: "hr", path: "/hr/reports" },
  ...[...REPORTS, "certificates"].map((name): PageSpec => ({ id: `hr: report ${name}`, persona: "hr", path: `/hr/reports/${name}` })),
  { id: "hr: kpmg export", persona: "hr", path: "/hr/reports/kpmg" },
  { id: "hr: activity log", persona: "hr", path: "/hr/reports/activity" },
  { id: "hr: settings", persona: "hr", path: "/hr/settings" },
  ...["departments", "request-types", "steps", "events", "holidays", "parameters"].map(
    (subject): PageSpec => ({ id: `hr: settings ${subject}`, persona: "hr", path: `/hr/settings/${subject}` })),
  // Overview
  { id: "overview: home", persona: "ceo", path: "/overview", home: true },
  { id: "overview: people", persona: "ceo", path: "/overview/people" },
  { id: "overview: person", persona: "ceo", path: (f) => `/overview/people/${f.ownerEmployee}` },
  { id: "overview: requests", persona: "ceo", path: "/overview/requests" },
  { id: "overview: request", persona: "ceo", path: (f) => `/overview/requests/${f.approved}` },
  { id: "overview: calendar", persona: "ceo", path: "/overview/calendar" },
  { id: "overview: reports", persona: "ceo", path: "/overview/reports" },
  ...REPORTS.map((name): PageSpec => ({ id: `overview: report ${name}`, persona: "ceo", path: `/overview/reports/${name}` })),
  { id: "overview: oversight", persona: "ceo", path: "/overview/oversight" },
  // Administration
  { id: "admin: status", persona: "sysadmin", path: "/admin", home: true },
  { id: "admin: accounts", persona: "sysadmin", path: "/admin/accounts" },
  { id: "admin: create account", persona: "sysadmin", path: "/admin/accounts/new" },
  { id: "admin: account", persona: "sysadmin", path: (f) => `/admin/accounts/${f.ownerAccount}` },
  { id: "admin: parameters", persona: "sysadmin", path: "/admin/parameters" },
  { id: "admin: security log", persona: "sysadmin", path: "/admin/security-log" },
];

/** Pages whose links lead to read-only copies of other pages (plan 06); the spec follows each link once. */
export const HUBS: { id: string; persona: Persona; path: string }[] = [
  { id: "overview: oversight, HR settings", persona: "ceo", path: "/overview/oversight/hr-settings" },
  { id: "overview: oversight, accounts and system", persona: "ceo", path: "/overview/oversight/system" },
];

export function resolve(spec: PageSpec, fixtures: Fixtures): string {
  return typeof spec.path === "function" ? spec.path(fixtures) : spec.path;
}
```

- [ ] **Step 6: Write the shared checks**

`frontend/e2e/support/checks.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { type Locator, type Page, expect } from "@playwright/test";

import type { Language } from "./session";

/** WCAG 2.1 A and AA rules of axe-core. A violation prints the rule, its help text and the nodes. */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((violation) => ({
    rule: violation.id,
    help: violation.help,
    nodes: violation.nodes.slice(0, 5).map((node) => node.target.join(" ")),
  }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
}

// Interface words that exist in one language only. A French page that shows an English one mixes languages (U9).
const ENGLISH_ONLY = /\b(Save|Cancel|Search|Loading|Delete|Edit|Settings|Sign out|Requests|Employees|Approve|Refuse|Withdraw|Send back|Waiting for|Not available|Nothing to)\b/;
const FRENCH_ONLY = /\b(Enregistrer|Annuler|Rechercher|Chargement|Supprimer|Modifier|Paramètres|Se déconnecter|Demandes|Employés|Approuver|Refuser|Retirer|Renvoyer|En attente|Indisponible|Rien à)\b/;

export async function expectOneLanguage(page: Page, language: Language): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", language);
  const text = await page.locator("body").innerText();
  const foreign = (language === "fr" ? ENGLISH_ONLY : FRENCH_ONLY).exec(text);
  expect(foreign?.[0] ?? null, `a page in "${language}" shows "${foreign?.[0]}"`).toBeNull();
}

/** A translation key shown instead of its text looks like `requests:form.title` or `requests.form.title`. */
export async function expectNoRawKeys(page: Page): Promise<void> {
  const text = await page.locator("body").innerText();
  const keys = text.match(/\b(common|nav|auth|shell|notifications|accounts|settings|audit|employees|profile|delegations|requests|balances|calendar|home|reports|errors)[:.][A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+\b/g);
  expect(keys ?? [], `untranslated keys on ${page.url()}`).toEqual([]);
}

/** Moves the focus to `target` with the Tab key alone and checks that the focus can be seen. */
export async function tabTo(page: Page, target: Locator, maxPresses = 150): Promise<void> {
  await expect(target).toBeVisible();
  for (let press = 0; press < maxPresses; press += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      const ring = await target.evaluate((element) => {
        const style = getComputedStyle(element);
        return style.boxShadow !== "none" || (style.outlineStyle !== "none" && style.outlineWidth !== "0px");
      });
      expect(ring, "the focused element shows no focus indicator").toBe(true);
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error(`the Tab key did not reach ${target} in ${maxPresses} presses`);
}
```

- [ ] **Step 7: Write the accessibility spec**

`frontend/e2e/a11y.spec.ts`:

```ts
import { type Page, expect, test } from "@playwright/test";

import { createAdministrator, PASSWORD, signIn, signOut, SYSADMIN, uniqueEmail } from "./helpers";
import { expectNoAxeViolations, expectNoRawKeys, expectOneLanguage } from "./support/checks";
import { type Fixtures, ensureFixtures } from "./support/data";
import { HUBS, PAGES, resolve } from "./support/pages";
import { type Language, baseUrlOf, enterAs, open } from "./support/session";

const LANGUAGES: Language[] = ["fr", "en"];
const SIGN_IN = { fr: "Français", en: "English" } as const;
let fixtures: Fixtures;

test.beforeAll(async ({}, testInfo) => {
  fixtures = await ensureFixtures(baseUrlOf(testInfo));
});

async function audit(page: Page, language: Language): Promise<void> {
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page).toHaveTitle(/\S/);
  await expectOneLanguage(page, language);
  await expectNoRawKeys(page);
  await expectNoAxeViolations(page);
}

for (const language of LANGUAGES) {
  test.describe(`accessibility (${language})`, () => {
    test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, "the phone project is covered by phone-fit.spec.ts");

    test("sign in", async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("button", { name: SIGN_IN[language], exact: true }).click();
      await expect(page.locator("main")).toBeVisible();
      await audit(page, language);
    });

    for (const spec of PAGES) {
      test(spec.id, async ({ page }) => {
        await enterAs(page, spec.persona, language);
        await open(page, resolve(spec, fixtures));
        await audit(page, language);
      });
    }

    for (const hub of HUBS) {
      test(`pages reached from ${hub.id}`, async ({ page }) => {
        await enterAs(page, hub.persona, language);
        await open(page, hub.path);
        await audit(page, language);
        const links = await page.locator(`main a[href^="/overview/oversight/"]`).evaluateAll((anchors) =>
          [...new Set(anchors.map((anchor) => anchor.getAttribute("href")!))]);
        expect(links.length, `${hub.path} links to no page`).toBeGreaterThan(0);
        for (const link of links) {
          await test.step(link, async () => {
            await open(page, link);
            await audit(page, language);
          });
        }
      });
    }

    test("an open task sheet", async ({ page }) => {
      await enterAs(page, "manager", language);
      await open(page, "/team/delegations");
      const trigger = page.locator("main").getByRole("button").first();      // the page's primary action
      await trigger.click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      await expectNoAxeViolations(page);
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await expect(trigger).toBeFocused();                                   // the focus returns to what opened the sheet
    });
  });
}

test.describe("accessibility of the first sign-in", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, "desktop only");

  test("choose a new password", async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, "audit");
    await signIn(page, SYSADMIN.email, PASSWORD, "fr");
    const temporary = await createAdministrator(page, "Audit Essai", email);
    await signOut(page, SYSADMIN.name, "fr");

    await signIn(page, email, temporary, "fr");
    await expect(page).toHaveURL(/\/password\/new$/);
    await expect(page.locator("h1")).toHaveCount(1);
    await expectOneLanguage(page, "fr");
    await expectNoRawKeys(page);
    await expectNoAxeViolations(page);
  });
});
```

- [ ] **Step 8: Write the keyboard spec**

The three most frequent journeys of UI section 12 are walked with the keyboard alone: Tab to reach, Enter to act. Plan 01b's date inputs are the browser's own (`type="date"`, its contract note 24); once the Tab key has reached one, the spec writes the date into the focused element with `fill`, which is how Playwright types into a date input whatever the regional format. The labels are those of the journeys of plans 02 and 03b.

`frontend/e2e/keyboard.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { EMPLOYEE, HR, MANAGER } from "./people";
import { approveAsManager, askFor, become, ownWeek, row, toDecide, tuesday } from "./requests";
import { tabTo } from "./support/checks";

test.describe("keyboard only", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, "a phone has no Tab key");

  test("ask for leave from the home page", async ({ page }, testInfo) => {
    const day = tuesday(ownWeek(testInfo, 20));
    await become(page, null, EMPLOYEE);
    await page.goto("/me");

    await tabTo(page, page.getByRole("link", { name: "Nouvelle demande" }).first());
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Quel type de demande ?", exact: true })).toBeVisible();

    await tabTo(page, page.getByRole("link", { name: /^Télétravail/ }));
    await page.keyboard.press("Enter");

    await tabTo(page, page.getByLabel("Début", { exact: true }));
    await page.locator(":focus").fill(day);
    await tabTo(page, page.getByLabel("Fin", { exact: true }));
    await page.locator(":focus").fill(day);
    await expect(page.getByRole("complementary", { name: "Calculé pour vous" }).getByText("1 jour", { exact: true })).toBeVisible();

    await tabTo(page, page.getByRole("button", { name: "Envoyer", exact: true }));
    await page.keyboard.press("Enter");
    await expect(page.getByText("Demande envoyée.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Résumé de la demande" }).getByText(`En attente de ${MANAGER.name}`)).toBeVisible();
  });

  test("decide a request from the list", async ({ page }, testInfo) => {
    const day = tuesday(ownWeek(testInfo, 21));
    await become(page, null, EMPLOYEE);
    await askFor(page, "Télétravail", day);

    await become(page, EMPLOYEE, MANAGER);
    await page.goto("/team");
    const item = toDecide(page, EMPLOYEE.name, day);
    await tabTo(page, item.getByRole("button", { name: "Approuver", exact: true }));
    await page.keyboard.press("Enter");

    const sheet = page.getByRole("dialog", { name: "Approuver la demande" });
    await expect(sheet).toBeVisible();
    // The focus is inside the sheet as soon as it opens, and Tab stays inside it.
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
    await tabTo(page, sheet.getByRole("button", { name: "Approuver", exact: true }));
    await page.keyboard.press("Enter");

    await expect(page.getByText(`Demande de ${EMPLOYEE.name} approuvée.`)).toBeVisible();
    await expect(item).toHaveCount(0);
    // The focus was not dropped on the body: the next Tab continues from the page.
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
  });

  test("validate a request from the queue", async ({ page }, testInfo) => {
    const day = tuesday(ownWeek(testInfo, 22));
    await become(page, null, EMPLOYEE);
    await askFor(page, "Télétravail", day);
    await become(page, EMPLOYEE, MANAGER);
    await approveAsManager(page, EMPLOYEE.name, day);

    await become(page, MANAGER, HR);
    await page.goto("/hr/validate");
    const line = row(page, EMPLOYEE.name, day);
    await tabTo(page, line.getByRole("button", { name: "Approuver", exact: true }));
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: "Approuver la demande" });
    await tabTo(page, sheet.getByRole("button", { name: "Approuver", exact: true }));
    await page.keyboard.press("Enter");

    await expect(page.getByText(`Demande de ${EMPLOYEE.name} approuvée.`)).toBeVisible();
    await expect(line).toHaveCount(0);
  });

  test("the first Tab on a page offers a way past the navigation", async ({ page }) => {
    await become(page, null, HR);
    await page.goto("/hr/employees");
    await expect(page.getByRole("main")).toBeVisible();
    await page.keyboard.press("Tab");
    const first = page.locator(":focus");
    const insideMain = await first.evaluate((element) => Boolean(element.closest("main")));
    const isSkipLink = await first.evaluate((element) => element.tagName === "A" && (element.getAttribute("href") ?? "").startsWith("#"));
    expect(insideMain || isSkipLink, "the first focusable element is neither a skip link nor inside the content").toBe(true);
  });
});
```

- [ ] **Step 9: Write the phone spec**

Plan 05 checks three screens on a phone (`homes-phone.spec.ts`). This spec applies the same three checks to every page of the inventory.

`frontend/e2e/phone-fit.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/checks";
import { type Fixtures, ensureFixtures } from "./support/data";
import { PAGES, resolve } from "./support/pages";
import { baseUrlOf, enterAs, open } from "./support/session";

let fixtures: Fixtures;

test.describe("phone", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 768, "runs in the phone project only");

  test.beforeAll(async ({}, testInfo) => {
    fixtures = await ensureFixtures(baseUrlOf(testInfo));
  });

  for (const spec of PAGES) {
    test(`${spec.id} fits a phone`, async ({ page }) => {
      await enterAs(page, spec.persona);
      await open(page, resolve(spec, fixtures));

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);

      const small = await page
        .locator("button:visible, [role=button]:visible, nav a:visible, select:visible, input:visible:not([type=checkbox]):not([type=radio]):not([type=hidden])")
        .evaluateAll((elements) => elements
          .map((element) => ({
            name: (element.getAttribute("aria-label") ?? element.textContent ?? element.tagName).trim().slice(0, 40),
            box: element.getBoundingClientRect(),
          }))
          .filter(({ box }) => box.width > 0 && (box.height < 44 || box.width < 44))
          .map(({ name, box }) => `${name} (${Math.round(box.width)}x${Math.round(box.height)})`));
      expect(small, "touch targets under 44px").toEqual([]);

      await expectNoAxeViolations(page);
    });
  }

  test("a focused task fills the screen", async ({ page }) => {
    await enterAs(page, "manager");
    await open(page, "/team/delegations");
    await page.getByRole("button", { name: "Nommer un délégué", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    const viewport = page.viewportSize()!;
    expect(Math.round(box!.width)).toBe(viewport.width);
    expect(Math.round(box!.height)).toBeGreaterThanOrEqual(viewport.height - 1);
  });

  test("navigation is a bottom bar with the entries of the workspace only", async ({ page }) => {
    await enterAs(page, "hr");
    await open(page, "/hr");
    const bar = page.getByRole("navigation").filter({ has: page.locator('a[href="/hr/employees"]') }).last();
    const box = await bar.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 2);
    const hrefs = await bar.locator("a").evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")!));
    expect(hrefs.every((href) => href === "/hr" || href.startsWith("/hr/"))).toBe(true);
    expect(new Set(hrefs).size).toBeLessThanOrEqual(6);
  });
});
```

- [ ] **Step 10: Write the server message catalogue test**

The interface's own parity test (`src/i18n/parity.test.ts`, plan 01b) covers the JSON files, and `tests/test_messages.py` (plan 01a) checks that each registered text exists in both languages with the same placeholders. Server texts reach the screen too. This test checks them against the contract: every code and event the master names has its texts, and no text is a copy of the other language.

`backend/tests/hardening/test_message_catalogue.py`:

```python
"""Every code and event of the contract has French and English text, and they differ (U9, NFR-06)."""
from __future__ import annotations

import re
import string

from apps.core.i18n import all_messages, translate

ERROR_CODES = [
    "core.not_allowed", "core.not_found", "core.unexpected", "core.validation",
    "auth.invalid_credentials", "auth.domain_not_allowed", "auth.locked", "auth.disabled",
    "auth.temp_password_expired", "auth.rate_limited", "auth.password_change_required",
    "auth.wrong_current_password", "auth.weak_password",
    "accounts.email_taken", "accounts.employee_has_account", "accounts.employee_unknown",
    "accounts.roles_incompatible", "accounts.last_sysadmin", "accounts.cannot_change_self",
    "settings.unknown_key", "settings.invalid_value", "settings.out_of_range",
    "files.too_large", "files.type_not_allowed", "files.content_mismatch", "files.empty",
    # `organisation.in_use` is left out: plan 02 has no delete route, so it is never raised (its contract note 2).
    *[f"organisation.{name}" for name in (
        "number_taken", "email_taken", "email_domain", "contract_dates", "manager_loop", "manager_self",
        "already_archived", "nothing_to_change", "field_not_proposable", "change_already_open",
        "change_already_decided", "delegation_overlap", "delegation_self", "delegation_dates",
        "delegation_not_manager")],
    *[f"request.{name}" for name in (
        "actor_without_record", "end_before_start", "no_working_day", "half_day_not_allowed",
        "half_day_on_non_working_day", "past_dates", "notice", "overlap", "balance_insufficient",
        "cap_exceeded", "event_required", "event_days_exceeded", "permission_non_working_day",
        "permission_times", "permission_overlaps_absence", "reason_required", "comment_required",
        "not_editable", "not_withdrawable", "already_processed", "own_request", "not_started_only",
        "amendment_open", "type_inactive", "chain_needs_approver")],
    "balances.reason_required", "balances.zero_amount", "balances.opening_exists",
    "calendar.window_invalid", "reports.unknown_report", "reports.nothing_to_export",
]
EVENTS = [
    "account.password_reset", "job.failed", "error.unexpected",
    "profile_change.proposed", "profile_change.accepted", "profile_change.rejected",
    "delegation.started", "delegation.ended",
    "step.to_decide", "step.reminder", "step.flagged", "step.informed", "request.approved", "request.rejected",
    "request.returned", "request.withdrawn", "request.cancelled", "request.corrected",
    "amendment.submitted", "amendment.approved", "amendment.rejected", "sick.declared",
    "certificate.due_soon", "certificate.overdue", "delegation.prompt", "hr_step.unattended",
    "balance.adjusted",
]
# Texts that are rightly the same in both languages. Add a code here only with the reason beside it.
SAME_ON_PURPOSE: set[str] = set()
ONLY_SYMBOLS = re.compile(r"^[\W\d{}a-z_]*$")      # placeholders, digits and punctuation: nothing to translate


def _placeholders(text: str) -> set[str]:
    return {name for _, name, _, _ in string.Formatter().parse(text) if name}


def test_every_error_code_of_the_contract_has_both_texts():
    catalogue = all_messages()
    missing = [code for code in ERROR_CODES
               if not catalogue.get(code, {}).get("fr") or not catalogue.get(code, {}).get("en")]
    assert missing == []


def test_every_notification_event_has_a_title_and_a_body_in_both_languages():
    catalogue = all_messages()
    missing = [f"notification.{event}.{part}" for event in EVENTS for part in ("title", "body")
               if not catalogue.get(f"notification.{event}.{part}", {}).get("fr")
               or not catalogue.get(f"notification.{event}.{part}", {}).get("en")]
    assert missing == []


def test_no_text_is_a_copy_of_the_other_language():
    copies = [code for code, texts in all_messages().items()
              if texts.get("fr") == texts.get("en")
              and code not in SAME_ON_PURPOSE and not ONLY_SYMBOLS.match(texts.get("fr", ""))]
    assert copies == [], f"untranslated: {copies}"


def test_every_text_renders_in_both_languages():
    for code, texts in all_messages().items():
        params = {name: "X" for name in _placeholders(texts["en"]) | _placeholders(texts["fr"])}
        for language in ("fr", "en"):
            rendered = translate(code, language, **params)
            assert rendered and "{" not in rendered, (code, language)


def test_every_error_text_is_a_sentence():
    for code in ERROR_CODES:
        for language in ("fr", "en"):
            text = all_messages()[code][language]
            assert len(text.split()) >= 3, f"{code} ({language}) is not a sentence: {text!r}"
            assert text[0].isupper() and text.rstrip()[-1] in ".!?", f"{code} ({language}): {text!r}"


def test_no_notification_about_sickness_has_room_for_a_comment_or_a_file():
    forbidden = {"comment", "file", "file_name", "filename", "certificate", "note", "reason", "type"}
    for event in ("sick.declared", "certificate.due_soon", "certificate.overdue"):
        for part in ("title", "body"):
            used = _placeholders(all_messages()[f"notification.{event}.{part}"]["en"])
            assert used & forbidden == set(), f"{event}.{part} uses {used & forbidden}"
```

- [ ] **Step 11: Run everything in this task**

Run: `docker compose run --rm app pytest tests/hardening/test_message_catalogue.py -v`

Expected: 6 passed. A code listed as missing was raised somewhere without a text, or was renamed: add the two texts to the `messages.py` of the app that owns the prefix. A text listed as a copy is either untranslated (translate it) or rightly identical (add its code to `SAME_ON_PURPOSE` with the reason).

Run on the host, with the development stack up: `cd frontend; npx playwright test e2e/a11y.spec.ts e2e/keyboard.spec.ts e2e/phone-fit.spec.ts`

Expected: all passed. The desktop project runs `a11y` (159 tests: 79 per language and the first sign-in) and `keyboard` (4 tests); the phone project runs `phone-fit` (77 tests).

These specs are verification, but expect work here: it is the first time every page meets axe, a phone and a keyboard at once. Handle failures by kind, in the component that plan 01b or the page's own plan built.

- `color-contrast`: a text and background pair outside the tokens. Use a token pair; `docs/design/README.md` states that every pair of the token file meets AA. The lightest text colour allowed is `--muted-foreground`.
- `label`, `button-name`, `link-name`, `select-name`: give the control a visible label through its bound input, or an `aria-label` from a translation key for an icon-only button.
- `aria-dialog-name`: `TaskSheet` and `ConfirmDialog` must pass their `title` to the dialog's accessible name.
- Zero or two `h1`: `PageHeader` renders the only `h1`; a block uses `h2`. A read-only page mounted inside an Oversight frame (plan 06, note 19) must not bring a second `h1`.
- A wrong `lang`: `src/i18n/index.ts` must set `document.documentElement.lang` on every language change.
- "a page in "fr" shows …": a hard-coded English string, or a server text returned in the wrong language. The client must send `Accept-Language`, and the server uses the account's language once signed in.
- "untranslated keys": a key missing from one language file; the parity test of plan 01b should already have said so.
- "the page scrolls sideways": a table that did not switch to cards (`DataTable` does below 768px), plan 06's `ReportTable` with twelve months, or a fixed width. A wide table scrolls inside its own container, never the page.
- "touch targets under 44px": on a phone, controls take a minimum height and width of 44px (`max-md:min-h-11 max-md:min-w-11`), as plan 01b's primitives do.
- "the Tab key did not reach …": the control is not focusable (a `div` with a click handler). Use a `button` or a link.
- The focus does not return to the trigger after Escape: Radix does this by default; remove any `onCloseAutoFocus` that prevents it.

Fix the component, rerun the one test with `npx playwright test e2e/a11y.spec.ts -g "<page id>"`, and commit each fix on its own as `fix(a11y): <what>`.

Then run the whole suite once on each of the other two engines:

Run: `cd frontend; $env:E2E_BROWSER = "firefox"; npx playwright test; $env:E2E_BROWSER = "edge"; npx playwright test; Remove-Item Env:E2E_BROWSER`

Expected: every spec passes on Firefox and on Edge (desktop project only; `phone-fit` and `homes-phone` are skipped). A spec that passes on Chromium and fails elsewhere usually waits for something Chromium does faster; fix the page or the wait, never by skipping the engine.

- [ ] **Step 12: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/playwright.config.ts frontend/e2e/support frontend/e2e/a11y.spec.ts frontend/e2e/keyboard.spec.ts frontend/e2e/phone-fit.spec.ts backend/tests/hardening/test_message_catalogue.py .github/workflows/ci.yml
git commit -m "test: axe on every page in both languages, keyboard journeys, phone fit, three browser engines"
```

### Task 11: The complete journey suite

**Files:**
- Create: `frontend/e2e/JOURNEYS.md`
- Create: `frontend/e2e/home-journeys.spec.ts`
- Create: `frontend/e2e/new-employee-to-kpmg.spec.ts`
- Create: `frontend/e2e/session-ends.spec.ts`
- Create: `frontend/e2e/journey-coverage.spec.ts`

**Interfaces:**
- Consumes: `e2e/helpers.ts` (`PASSWORD`, `SYSADMIN`, `signIn`, `signOut`, `fillSignIn`), `e2e/people.ts` (`HR`, `MANAGER`, `EMPLOYEE`, `landed`, `newPerson`, `fullName`, `createEmployee`), `e2e/requests.ts` (`PDF`, `tuesday`, `ownWeek`, `pastWeek`, `frDate`, `row`, `become`, `askFor`, `approveAsManager`, `validateAsHr`), `e2e/support/session.ts` (`apiOf`), `exceljs` (a dev dependency since plan 06); the fourteen journey specs of plans 01b to 06; the My space home of plan 05 (blocks "Solde", "À faire", "En cours", "À venir"); plan 03b's form, which keeps unsent text in the tab's session storage (its contract note 13).
- Produces: nothing used by later tasks. `ownWeek` journeys 12 to 15 and `pastWeek` journey 6 are taken by this task; 20 to 22 by Task 10.

UI section 12 lists fourteen journeys, and PRD 12.8 names them as the browser tests. Plans 01b to 06 wrote all fourteen. Two of them start on Requests where the UI says Home, because My space had no home when plan 03b was written (its contract note 25). This task records which spec walks which journey, walks those two from the home, adds one journey that crosses every role, and adds the journey of review-focus item 10.

- [ ] **Step 1: Record the journeys**

`frontend/e2e/JOURNEYS.md`:

```markdown
# Browser journeys

The journeys of the UI document, section 12, and the spec that walks each one.
`journey-coverage.spec.ts` fails when a file named here does not exist.

| # | Journey | Workspace | Path | Spec |
|---|---|---|---|---|
| 1 | Ask for leave | My space | Home, New request, Send | `ask-for-leave.spec.ts`, `home-journeys.spec.ts` |
| 2 | Decide a request | My team | To decide, Approve | `decide-a-request.spec.ts` |
| 3 | Validate a request | HR desk | Desk, To validate, Approve | `validate-a-request.spec.ts` |
| 4 | Report sickness, add the certificate later | My space | New request; later: Home ("Needs you"), Add certificate | `report-sickness.spec.ts`, `home-journeys.spec.ts` |
| 5 | Handle a missing certificate | HR desk | Desk, Certificates, Count as annual leave | `handle-a-missing-certificate.spec.ts` |
| 6 | Change approved dates | My space | Requests, the request, Change dates | `change-approved-dates.spec.ts` |
| 7 | Go on leave as a manager | My team | The delegation offer when the leave is approved, Confirm | `go-on-leave-as-a-manager.spec.ts` |
| 8 | Unblock a stuck request | HR desk | Desk, Stuck with a manager, Record the decision | `unblock-a-stuck-request.spec.ts` |
| 9 | Correct an address | My space, then HR desk | Profile, Propose a change; Desk, Profile changes, Accept | `correct-an-address.spec.ts` |
| 10 | Prepare the month for KPMG | HR desk | Reports, KPMG export, Export | `kpmg-export.spec.ts` |
| 11 | Welcome a new employee | HR desk, then Administration | Employees, New employee; Status, Create account | `welcome-an-employee.spec.ts` |
| 12 | Record a departure | HR desk | Employees, the record, Record a departure | `record-a-departure.spec.ts` |
| 13 | Check that nothing is stuck | Overview | Overview ("Waiting") | `overview-nothing-stuck.spec.ts` |
| 14 | Check the system | Administration | Status | `check-system.spec.ts` |
| 15 | From a new employee to the KPMG file | All | First sign-in, New request, Approve, Validate, Export | `new-employee-to-kpmg.spec.ts` |
| 16 | A session ends while a form is open | My space | New request, Save for later; the session ends; Sign in | `session-ends.spec.ts` |

Other specs: `sign-in`, `create-account`, `first-sign-in` (plan 01b); `name-a-delegate` (plan 02); `balance` (plan 04);
`calendar-privacy`, `homes-phone` (plan 05); `team-report` (plan 06); `a11y`, `keyboard`, `phone-fit`, `ui-rules` (plan 07).
```

- [ ] **Step 2: Write the coverage check**

`frontend/e2e/journey-coverage.spec.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));

test("every journey of the UI document has a spec that exists", () => {
  const text = fs.readFileSync(path.join(HERE, "JOURNEYS.md"), "utf8");
  const rows = text.split("\n").filter((line) => /^\| \d+ \|/.test(line));
  expect(rows).toHaveLength(16);
  for (const line of rows) {
    const cells = line.split("|").map((cell) => cell.trim());
    const specs = cells[5].split(",").map((name) => name.replace(/`/g, "").trim()).filter(Boolean);
    expect(specs.length, `no spec named for: ${cells[2]}`).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(fs.existsSync(path.join(HERE, spec)), `${spec} does not exist`).toBe(true);
    }
  }
});
```

Run: `cd frontend; npx playwright test e2e/journey-coverage.spec.ts --project=desktop`

Expected: FAIL with `home-journeys.spec.ts does not exist`. The fourteen specs of the earlier plans are found; the three of this task are not written yet.

- [ ] **Step 3: Walk journeys 1 and 4 from the home page**

`frontend/e2e/home-journeys.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { EMPLOYEE, MANAGER } from "./people";
import { PDF, become, ownWeek, pastWeek, tuesday } from "./requests";
import { apiOf } from "./support/session";

test("journey 1 from the home: Home, New request, Send", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 13));
  await become(page, null, EMPLOYEE);
  await page.goto("/me");
  await expect(page.getByRole("region", { name: "Solde" })).toBeVisible();

  await page.getByRole("link", { name: "Nouvelle demande" }).first().click();          // Home -> New request
  await page.getByRole("link", { name: /^Télétravail/ }).click();
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  await expect(page.getByRole("complementary", { name: "Calculé pour vous" }).getByText("1 jour", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();            // -> Send
  await expect(page.getByText("Demande envoyée.")).toBeVisible();

  // Back on the home, the request is in progress and says whom it waits for.
  await page.goto("/me");
  await expect(page.getByRole("region", { name: "En cours" }).getByText(`En attente de ${MANAGER.name}`).first()).toBeVisible();
});

test("journey 4 from the home: sickness declared, then Home (Needs you), Add certificate", async ({ page }, testInfo) => {
  const day = tuesday(pastWeek(testInfo, 6));
  await become(page, null, EMPLOYEE);
  await page.goto("/me/requests/new");
  await page.getByRole("link", { name: /^Congé maladie/ }).click();
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByText("Demande envoyée.")).toBeVisible();

  // Later: the home says a certificate is due, and leads to the request.
  const home = await apiOf(page).get("/home/me");
  const due = home.needs_you.find((item: any) => item.kind === "certificate_due" && item.request.start_date === day);
  expect(due, "the home does not list the certificate as due").toBeTruthy();

  await page.goto("/me");
  const needs = page.getByRole("region", { name: "À faire" });
  await expect(needs).toBeVisible();
  await needs.locator(`a[href$="${due.request.public_id}"]`).first().click();           // Home ("Needs you") -> the request
  const summary = page.getByRole("region", { name: "Résumé de la demande" });
  await summary.getByRole("button", { name: "Ajouter le certificat", exact: true }).click();   // -> Add certificate
  const sheet = page.getByRole("dialog", { name: "Ajouter le certificat" });
  await sheet.getByLabel("Certificat médical", { exact: true }).setInputFiles({
    name: "certificat.pdf", mimeType: "application/pdf", buffer: PDF });
  await sheet.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(sheet).toHaveCount(0);

  // Nothing is asked of the employee for this request any more.
  await expect.poll(async () => {
    const after = await apiOf(page).get("/home/me");
    return after.needs_you.some((item: any) => item.request.public_id === due.request.public_id);
  }).toBe(false);
  await page.goto("/me");
  await expect(page.locator(`main a[href$="${due.request.public_id}"]`).filter({ hasText: "Ajouter le certificat" })).toHaveCount(0);
});
```

- [ ] **Step 4: Write the cross-role journey**

One person is followed from the day HR enters them to the line they occupy in the KPMG file. Every step is taken in the interface, in French, by the role that takes it in real life; only the opening balance is posted through the API, because plan 04's journey (`balance.spec.ts`) already walks that sheet.

`frontend/e2e/new-employee-to-kpmg.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";

import { PASSWORD, signIn, signOut, SYSADMIN } from "./helpers";
import { HR, MANAGER, createEmployee, fullName, landed, newPerson } from "./people";
import { approveAsManager, askFor, become, ownWeek, tuesday, validateAsHr } from "./requests";
import { apiOf } from "./support/session";

const OWN_PASSWORD = "Nouveau-Cheval-2026!";

test("journey 15: from a new employee's first sign-in to the KPMG file", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const person = newPerson(testInfo, "Lina");
  const name = fullName(person);
  const day = tuesday(ownWeek(testInfo, 12));
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  let employeeId = "";
  let temporary = "";

  await test.step("HR enters the record and the opening balance (go-live steps 3 and 4)", async () => {
    await signIn(page, HR.email, PASSWORD, "fr");
    await landed(page);
    await createEmployee(page, person);                                        // ends on the new record
    employeeId = new URL(page.url()).pathname.split("/").pop()!;
    await apiOf(page).send("post", `/balances/${employeeId}/adjustments`,
      { kind: "opening", amount: "10.00", effective_date: yesterday, reason: "Solde d'ouverture" });
    await signOut(page, HR.name, "fr");
  });

  await test.step("the administrator creates the account (go-live step 5)", async () => {
    await signIn(page, SYSADMIN.email, PASSWORD, "fr");
    await expect(page.getByRole("heading", { level: 1, name: "État", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Créer un compte", exact: true }).click();
    await page.getByLabel("Employé", { exact: true }).selectOption({ label: name });
    await page.getByRole("button", { name: "Créer le compte", exact: true }).click();
    const result = page.getByRole("region", { name: `Compte créé pour ${name}` });
    await expect(result).toBeVisible();
    temporary = (await result.locator("p").first().innerText()).trim();
    await page.getByRole("button", { name: "Terminé", exact: true }).click();
    await signOut(page, SYSADMIN.name, "fr");
  });

  await test.step("the employee chooses a password and finds a balance of ten days", async () => {
    await signIn(page, person.email, temporary, "fr");
    await expect(page.getByRole("heading", { level: 1, name: "Choisissez un nouveau mot de passe", exact: true })).toBeVisible();
    await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(OWN_PASSWORD);
    await page.getByLabel("Confirmez le nouveau mot de passe", { exact: true }).fill(OWN_PASSWORD);
    await page.getByRole("button", { name: "Enregistrer le mot de passe", exact: true }).click();
    await expect(page).toHaveURL(/\/me$/);                                     // one workspace: My space, on its home
    await expect(page.getByRole("region", { name: "Solde" }).getByText(/^10 jours$/).first()).toBeVisible();
  });

  await test.step("the employee asks for one day of annual leave", async () => {
    await askFor(page, "Congé annuel", day);
    await expect(page.getByRole("region", { name: "Résumé de la demande" }).getByText(`En attente de ${MANAGER.name}`)).toBeVisible();
  });

  await test.step("the manager approves, HR validates", async () => {
    await become(page, { name }, MANAGER);
    await approveAsManager(page, name, day);
    await become(page, MANAGER, HR);
    await validateAsHr(page, name, day);
  });

  await test.step("the balance, the history and the KPMG file agree", async () => {
    const api = apiOf(page);                                                   // the HR session
    const balance = await api.get(`/balances/${employeeId}`);
    expect(Number(balance.current)).toBe(10);                                  // the leave is still ahead
    expect(Number(balance.approved_upcoming)).toBe(1);
    expect(Number(balance.pending)).toBe(0);

    const requests = await api.get("/requests", { scope: "all", employee: employeeId });
    expect(requests.count).toBe(1);
    const history = await api.get(`/requests/${requests.results[0].public_id}/history`);
    expect(history.filter((entry: any) => entry.action === "step.decided")).toHaveLength(2);
    expect(history.every((entry: any) => entry.at && entry.actor)).toBe(true);  // who and when, for every line

    await page.goto("/hr/reports");
    await page.getByRole("link", { name: "Export KPMG", exact: true }).click();
    await page.getByLabel("Au", { exact: true }).fill(day);
    await page.getByLabel("Du", { exact: true }).fill(day);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exporter vers Excel", exact: true }).click();
    const download = await downloading;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(await download.path());
    const sheet = workbook.worksheets[0];
    const cells = (row: number) => (sheet.getRow(row).values as unknown[]).slice(1);
    let line: unknown[] | null = null;
    for (let row = 2; row <= sheet.rowCount; row += 1) {
      if (cells(row)[1] === name) line = cells(row);
    }
    expect(line, `${name} is in the file`).not.toBeNull();
    expect(line![0]).toBe(person.number);
    expect(line![3]).toBe(1);                                                  // annual leave, in days
    expect(line![8]).toBe(9);                                                  // balance on the last day of the period
    expect(line![9]).toBe(20);                                                 // 21 meal tickets less one full day
  });
});
```

- [ ] **Step 5: Write the session journey (review focus 10)**

`frontend/e2e/session-ends.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { fillSignIn, PASSWORD } from "./helpers";
import { EMPLOYEE } from "./people";
import { become, ownWeek, row, tuesday } from "./requests";

test("journey 16: the session ends, the user signs in again and finds the page and the draft", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 14));
  await become(page, null, EMPLOYEE);
  await page.goto("/me/requests/new");
  await page.getByRole("link", { name: /^Télétravail/ }).click();
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  await page.getByRole("button", { name: "Enregistrer pour plus tard", exact: true }).click();
  await expect(page.getByText("Brouillon enregistré.")).toBeVisible();
  await expect(page).toHaveURL(/\/me\/requests$/);

  await page.context().clearCookies();                                         // two hours pass
  await page.reload();
  await expect(page).toHaveURL(/\/login\?next=/);

  await fillSignIn(page, EMPLOYEE.email, PASSWORD, "fr");
  await expect(page).toHaveURL(/\/me\/requests$/);                             // back on the page they were on
  await expect(row(page, "Télétravail", day)).toContainText("Pas encore envoyée");   // the draft was not lost
});

test("journey 16, unsaved: what was typed is still in the form after signing in again", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 15));
  await become(page, null, EMPLOYEE);
  await page.goto("/me/requests/new");
  await page.getByRole("link", { name: /^Télétravail/ }).click();
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  await page.getByLabel("Commentaire (facultatif)", { exact: true }).fill("Rendez-vous avec le plombier");
  const form = page.url();

  await page.context().clearCookies();                                         // the session ends before Send
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByText("Une erreur est survenue")).toHaveCount(0);      // sign-in, not an error page

  await fillSignIn(page, EMPLOYEE.email, PASSWORD, "fr");
  await expect(page).toHaveURL(form);
  await expect(page.getByLabel("Début", { exact: true })).toHaveValue(day);
  await expect(page.getByLabel("Commentaire (facultatif)", { exact: true })).toHaveValue("Rendez-vous avec le plombier");

  // Nothing was sent while signed out; sending now works.
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByText("Demande envoyée.")).toBeVisible();
});
```

- [ ] **Step 6: Run the journeys of this task, then the whole suite**

Run on the host, with the development stack up: `cd frontend; npx playwright test e2e/journey-coverage.spec.ts e2e/home-journeys.spec.ts e2e/new-employee-to-kpmg.spec.ts e2e/session-ends.spec.ts`

Expected: 6 tests passed in the desktop project and 6 in the phone project. These specs are written after the pages they exercise and are expected to pass at once.

When one fails:

- A label is not found: open the report (`npx playwright show-report`); it shows the page at the moment of the failure. A label that differs from the page means a text changed in a translation file after its journey was written: correct the spec, as plan 01b's Task 24 says.
- Journey 4 finds no "À faire" block: `home/me` (plan 05) must list a sick leave whose certificate is due under `needs_you` with `kind: "certificate_due"`, and `MeHomePage` must render the block when the list is not empty.
- Journey 15 reads another balance than 9 in the file: a month-end credit was posted between the opening balance and the export. The demo seed sets `credit_start_date`; the figure is then 9 plus the credits dated on or before the leave day, which the test cannot know. Clear the setting for the run (`docker compose exec app python manage.py shell -c "from apps.settings.models import Setting; Setting.objects.filter(key='credit_start_date').delete()"`), or assert `line[8]` against `balance.current - 1` read just before the export.
- Journey 16 lands on the home instead of the page left: the client's 401 handler must go to `/login?next=<the current address>`, and the Sign in page must navigate to `next` after success (plan 01b's `sign-in.spec.ts` checks this for an address typed while signed out).
- The unsaved journey finds an empty form: plan 03b's draft keeper stores what is typed per account and per form in the tab's session storage and restores it when the form opens (its contract note 13). The storage must not be cleared on a 401.

Then run everything once: `cd frontend; npx playwright test`

Expected: the whole suite passes in both projects, and `journey-coverage` confirms the sixteen journeys.

- [ ] **Step 7: Commit**

```bash
git add frontend/e2e/JOURNEYS.md frontend/e2e/journey-coverage.spec.ts frontend/e2e/home-journeys.spec.ts frontend/e2e/new-employee-to-kpmg.spec.ts frontend/e2e/session-ends.spec.ts
git commit -m "test: map the fourteen journeys, walk two from the home, add the cross-role and session journeys"
```

### Task 12: UI principle audit

**Files:**
- Create: `frontend/e2e/ui-rules.spec.ts`
- Create: `docs/ui-audit.md`

**Interfaces:**
- Consumes: `e2e/support/pages.ts` (`PAGES`, `resolve`), `e2e/support/data.ts` (`ensureFixtures`), `e2e/support/session.ts` (`enterAs`, `open`, `baseUrlOf`) from Task 10; plan 01b's components: `PageHeader` renders the only `h1`, a block renders an `h2`, a primary button carries the class `bg-primary`, the navigation is a `nav` element, `DataTable` and `FilterBar` already refuse a seventh column and a fourth visible filter.
- Produces: nothing used by later tasks.

The UI document writes its principles "so that a page can be checked against" them (UI 2). Each plan ticked a table for its own pages. This task checks the rules a machine can read on every page at once, and gives the reviewer one checklist for the rest.

- [ ] **Step 1: Write the automated rules**

`frontend/e2e/ui-rules.spec.ts`:

```ts
import { type Page, expect, test } from "@playwright/test";

import { type Fixtures, ensureFixtures } from "./support/data";
import { PAGES, resolve } from "./support/pages";
import { type Persona, baseUrlOf, enterAs, open } from "./support/session";

let fixtures: Fixtures;

test.beforeAll(async ({}, testInfo) => {
  fixtures = await ensureFixtures(baseUrlOf(testInfo));
});

// Values the API uses and a person must never read (U3). The French pages are checked, so the English
// words of the list cannot be legitimate text.
const CODES = /\b(waiting_manager|waiting_hr|waiting_person|line_manager|hr_role|named_person|deducts_annual|required_within_deadline|pending|approved|rejected|withdrawn|cancelled|returned|draft)\b/;
// The twelve-month tables of UI 10.3 are wider than six columns by definition (plan 06, contract note 18).
const WIDE_TABLES = /\/reports\/(permission-hours|remote-days)$/;
const WORKSPACE_OF: Record<Persona, string[]> = {
  owner: ["/me"], peer: ["/me"], outsider: ["/me"],
  manager: ["/me", "/team"], otherManager: ["/me", "/team"],
  hr: ["/me", "/hr"],
  ceo: ["/me", "/team", "/overview"],
  sysadmin: ["/admin"],
};
const ALL_WORKSPACES = ["/me", "/team", "/hr", "/overview", "/admin"];

async function visibleCount(page: Page, selector: string): Promise<number> {
  return page.locator(selector).filter({ visible: true }).count();
}

for (const spec of PAGES) {
  test(`rules on ${spec.id}`, async ({ page }) => {
    await enterAs(page, spec.persona, "fr");
    const path = resolve(spec, fixtures);
    await open(page, path);
    const workspace = `/${path.split("/")[1]}`;

    // M1: one primary action per page.
    expect(await visibleCount(page, "main :is(button, a).bg-primary"), "primary actions").toBeLessThanOrEqual(1);

    // M8: nothing is shown that cannot be used.
    expect(await visibleCount(page, 'main :is(button, input, select, textarea)[disabled], main [aria-disabled="true"]'),
      "disabled controls").toBe(0);

    // M2: at most six navigation entries, all of the current workspace (R1, R2).
    if (ALL_WORKSPACES.includes(workspace)) {
      const entries = await page.locator(`nav a[href="${workspace}"], nav a[href^="${workspace}/"]`).evaluateAll((anchors) =>
        [...new Set(anchors.map((anchor) => anchor.getAttribute("href")))]);
      expect(entries.length, "navigation entries").toBeGreaterThan(0);
      expect(entries.length, "navigation entries").toBeLessThanOrEqual(6);
    }

    // R4: a person is offered their own workspaces and no other.
    for (const other of ALL_WORKSPACES) {
      const offered = (await page.locator(`a[href="${other}"]`).count()) > 0;
      if (!WORKSPACE_OF[spec.persona].includes(other)) {
        expect(offered, `${spec.persona} is offered ${other}`).toBe(false);
      }
    }

    // M3: a home has at most four blocks.
    if (spec.home) {
      expect(await visibleCount(page, "main h2"), "blocks on a home").toBeLessThanOrEqual(4);
    }

    // M4: a list shows at most six attributes per item.
    if (!WIDE_TABLES.test(path)) {
      for (const table of await page.locator("main table").all()) {
        expect(await table.locator("thead th").count(), "columns of a table").toBeLessThanOrEqual(6);
      }
    }

    // U3: no internal code or status name.
    const text = await page.locator("main").innerText();
    const code = CODES.exec(text);
    expect(code?.[0] ?? null, `the page shows the code "${code?.[0]}"`).toBeNull();

    // R2, M8: the Overview workspace offers no editing action at all (UI 8).
    if (workspace === "/overview") {
      const acting = page.locator("main").getByRole("button", { name: /^(Approuver|Refuser|Renvoyer|Modifier|Enregistrer|Supprimer|Créer|Ajouter|Nouveau|Nouvelle)/ });
      expect(await acting.count(), "editing actions in Overview").toBe(0);
    }

    // UI 9: the Administration workspace holds no business data.
    if (workspace === "/admin") {
      expect(text, "business words in Administration").not.toMatch(/\b(Solde|Congé|Télétravail|Certificat)\b/);
    }
  });
}

test("a person with one workspace sees no switcher entry, a person with several sees each", async ({ page }) => {
  await enterAs(page, "owner", "fr");
  await open(page, "/me");
  for (const other of ["/team", "/hr", "/overview", "/admin"]) {
    await expect(page.locator(`a[href="${other}"]`)).toHaveCount(0);
  }

  await enterAs(page, "ceo", "fr");
  await open(page, "/overview");
  const switcher = page.getByRole("button", { name: /Vue d'ensemble/ }).first();
  if (await switcher.isVisible().catch(() => false)) await switcher.click();      // a menu, if the switcher is one
  for (const mine of ["/me", "/team", "/overview"]) {
    expect(await page.locator(`a[href="${mine}"]`).count(), `the CEO is offered ${mine}`).toBeGreaterThan(0);
  }
});

test("personal matters stay in My space for HR and executives (R5)", async ({ page }) => {
  for (const persona of ["hr", "ceo"] as const) {
    await enterAs(page, persona, "fr");
    await open(page, "/me/requests");
    await expect(page.getByRole("link", { name: "Nouvelle demande" }).first()).toBeVisible();
    await open(page, "/me/profile");
    await expect(page.locator("h1")).toHaveCount(1);
  }
});
```

- [ ] **Step 2: Run the rules**

Run on the host, with the development stack up: `cd frontend; npx playwright test e2e/ui-rules.spec.ts`

Expected: 77 tests passed in each project (one per page of the inventory, and two more). This is a verification spec and should pass at once: plans 01b to 06 each ticked these rules for their pages.

When a rule fails, the message names the rule and the page. The fix is in the page:

- "primary actions" above one: one action is the purpose of the page (UI 3.1, 5 to 9); every other becomes `variant="secondary"` or a link. An action repeated inside an empty state is rendered without the primary variant, as plan 01b's `AccountsPage` does.
- "disabled controls": remove the control when it cannot be used, or let it act and explain (M8). A pager shows no button for a page that does not exist.
- "the page shows the code …": the cell prints a value of the API. Map it to a sentence in the feature's translation file. For an audit log, the object type and the action have texts under `audit:` (plan 01b, note 12).
- "is offered /hr" for someone without the role: the shell rendered a link from another workspace. `workspaces.ts` is the only source of navigation, filtered by `me.workspaces`.
- "blocks on a home" above four: a fifth block does not belong on a home (M3).
- "columns of a table" above six: move the least-used attribute inside the item (M4).
- The switcher test cannot find a link for the CEO: if the switcher is a menu whose entries are not links, replace the three lines of the loop by the role the switcher uses (`menuitem`) and its three names; the rule stays the same.

- [ ] **Step 3: Write the checklist for the rules a person must judge**

`docs/ui-audit.md`:

```markdown
# Interface audit

The principles of the UI document, section 2. The browser suite checks the rules marked "automatic" on every page
(`frontend/e2e/ui-rules.spec.ts`, `a11y.spec.ts`, `keyboard.spec.ts`, `phone-fit.spec.ts`, the journeys).
The others are judged by a person, once per workspace, before each release that changes pages.
Tick each box as each of the five people it concerns: an employee, a manager, HR, an executive, the administrator.

## How to run it

1. `docker compose up -d`, then `docker compose exec app python manage.py e2e_reset`.
2. Sign in as `employee.a1@impactrisks.com`, `manager.a@`, `hr@`, `ceo@`, `sysadmin@` (password in the README), in French, then in English.
3. Use a desktop window, then a phone (or the browser's phone mode at 412 px).

## User friendly

| # | Rule | How it is checked | My space | My team | HR desk | Overview | Administration |
|---|---|---|---|---|---|---|---|
| U1 | The most frequent task starts from the home in one step | By hand: New request, Approve, the oldest item of a queue, nothing, Create account | [ ] | [ ] | [ ] | n/a | [ ] |
| U2 | Every request says where it stands, who it waits on, what happens next | Journeys 1 to 8; by hand on one request per state | [ ] | [ ] | [ ] | [ ] | n/a |
| U3 | Plain words, no code, one word for one thing | Automatic for codes; by hand: the same thing has the same name on every page | [ ] | [ ] | [ ] | [ ] | [ ] |
| U4 | Quantities, balances, limits and approvers are shown, never asked | By hand on the request form of each type | [ ] | n/a | [ ] | n/a | n/a |
| U5 | An error is next to its cause, says what to do, loses nothing typed | By hand: each message of UI 5.3, 7.9, 9.3; journey 16 | [ ] | [ ] | [ ] | n/a | [ ] |
| U6 | Nothing irreversible without a confirmation that states the consequence; undo where possible | By hand: discard, withdraw (undo), record a departure, disable an account | [ ] | [ ] | [ ] | n/a | [ ] |
| U7 | Every action is acknowledged and the page shows the new state | Journeys; by hand after each action of the page | [ ] | [ ] | [ ] | n/a | [ ] |
| U8 | Phone, keyboard alone, screen reader | Automatic (axe, keyboard journeys, phone fit); by hand: one journey with a screen reader | [ ] | [ ] | [ ] | [ ] | [ ] |
| U9 | French and English complete, never mixed | Automatic (parity tests, language check on every page) | auto | auto | auto | auto | auto |

## Minimal

| # | Rule | How it is checked | My space | My team | HR desk | Overview | Administration |
|---|---|---|---|---|---|---|---|
| M1 | One primary action per page | Automatic | auto | auto | auto | auto | auto |
| M2 | At most six navigation entries | Automatic | auto | auto | auto | auto | auto |
| M3 | At most four blocks on a home; an empty block shrinks or goes | Automatic for the count; by hand: empty the queues and look | [ ] | [ ] | [ ] | [ ] | [ ] |
| M4 | At most six attributes per item | Automatic (and refused by `DataTable`) | auto | auto | auto | auto | auto |
| M5 | At most three visible filters | Refused by `FilterBar`; by hand: no filter outside a filter bar | [ ] | [ ] | [ ] | [ ] | [ ] |
| M6 | A detail page opens on a summary and its actions; the rest is one step away | By hand: a request, an employee record, an account | [ ] | [ ] | [ ] | [ ] | [ ] |
| M7 | A form shows only the fields of the choice made | By hand: the form of each of the five types | [ ] | n/a | [ ] | n/a | n/a |
| M8 | Nothing shown that cannot be used | Automatic for disabled controls; by hand: no empty column, no dead menu entry | [ ] | [ ] | [ ] | [ ] | [ ] |
| M9 | Nothing without information or action | By hand: every figure leads somewhere or answers a daily question | [ ] | [ ] | [ ] | [ ] | [ ] |
| M10 | The figure a person came for is first and alone | By hand: the balance on the My space home and on Balance | [ ] | n/a | n/a | n/a | n/a |

## Specific to each user type

| # | Rule | How it is checked |
|---|---|---|
| R1 | Each role has its own home, navigation, primary action and words | Automatic for navigation; by hand: read the five homes side by side |
| R2 | A workspace contains only what the role does | Automatic for Overview (no editing action) and Administration (no business data) |
| R3 | The same request reads from the viewer's angle | By hand: open one request as its author, its manager, HR and an executive; compare the status sentence with UI 3.5 |
| R4 | A person with several roles switches workspace; workspaces are never merged | Automatic |
| R5 | Personal matters live in My space for everybody | Automatic |

## Result

| Date | Version | Audited by | Findings | Fixed in |
|---|---|---|---|---|
| | | | | |
```

- [ ] **Step 4: Walk the checklist once**

Open `docs/ui-audit.md` and tick every box that is not "auto", signing in as each of the five people in both languages. Record each finding in the last table and fix it in the page before going on; each fix is a commit `fix(ui): <rule> on <page>` with a unit test in the page's own test file.

Expected: every box ticked, the result table filled with the date and the commit of each fix, or the word "none".

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e/ui-rules.spec.ts docs/ui-audit.md
git commit -m "test: check the interface principles on every page, with a checklist for the rest"
```

### Task 13: Sortable lists

**Files:**
- Create: `backend/apps/core/ordering.py`
- Create: `backend/tests/hardening/test_ordering.py`
- Modify: `backend/apps/core/messages.py` (one text)
- Modify: the list views of `accounts`, `audit`, `notifications` (plan 01a), `organisation` (plan 02), `requests` (plan 03a) and `balances` (plan 04), two lines each
- Modify: `backend/openapi.yaml`, `frontend/src/api/schema.d.ts` (regenerated)
- Modify: `frontend/src/components/DataTable.tsx`, `frontend/src/components/lists.test.tsx`
- Modify: `frontend/src/i18n/locales/fr/common.json`, `frontend/src/i18n/locales/en/common.json`
- Modify: `frontend/src/features/accounts/AccountsPage.tsx`, `frontend/src/features/audit/AuditLogPage.tsx` (plan 01b), `frontend/src/features/employees/EmployeesPage.tsx` (plan 02), `frontend/src/features/requests/lists/RequestsList.tsx` (plan 03b)
- Create: `frontend/src/components/sortableLists.test.tsx`

**Interfaces:**
- Consumes: `apps.core.pagination` (`paginate`, `PAGE_PARAMETERS`), `apps.core.errors.DomainError`, `apps.core.i18n` (plan 01a); `useListParams`, which already keeps `ordering` in the address and returns `sort` and `setSort` (plan 01b, contract note 7); `GET employees` and `GET requests`, which already take `ordering` (plans 02 and 03a).
- Produces:
  - `apps.core.ordering.apply_ordering(request, queryset, allowed: Mapping[str, Sequence], default: str | None = None)`, `chosen_ordering(request, allowed, default) -> str | None`, `ordering_parameter(allowed, default) -> OpenApiParameter`; error code `core.ordering_invalid` (400, field `ordering`).
  - An `ordering` query parameter on `GET accounts`, `audit/business`, `audit/security` and their exports, `notifications`, `delegations`, `profile-changes`, `employees/{public_id}/history`, `approvals`, `balances/{employee_public_id}/ledger`.
  - `Column<T>.sortBy?: string` and `DataTable` props `sort?: string`, `onSort?: (next: string) => void`.

PRD 9.3 says "lists are paginated, filterable and sortable" and UI 3.4 says the same of every list. Plan 01b notes that the two lists of step 1 have no sort because plan 01a exposes no sort parameter, and no plan gave `DataTable` a header that sorts. Two endpoints already take `ordering` (employees, requests); this task gives the parameter to the others and gives the four large tables headers that sort.

Where a list is a queue or a record of events (the queues of approvals and profile changes, notifications, the ledger, delegations), its own order is its meaning: oldest first for work to do, newest first for a history. Those pages keep that order and offer no header to change it; the API still accepts `ordering` for them.

- [ ] **Step 1: Write the failing backend tests**

`backend/tests/hardening/test_ordering.py`:

```python
"""Every paginated list takes a whitelisted `ordering` (PRD 9.3)."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from io import BytesIO

import openpyxl
import pytest
import yaml
from django.conf import settings
from django.urls import reverse

from apps.balances import services as balance_services
from apps.notifications import services as notifications
from apps.organisation import services as organisation_services
from tests.hardening.helpers import frozen, give_balance, make_request  # noqa: F401

LISTS = [
    # (route, kwargs builder, persona attribute, an ordering it must accept)
    ("accounts:account-list", lambda w: {}, "sysadmin_user", "-last_login_at"),
    ("audit:security", lambda w: {}, "sysadmin_user", "at"),
    ("audit:business", lambda w: {}, "hr_user", "action"),
    ("audit:security-export", lambda w: {}, "sysadmin_user", "at"),
    ("notifications:list", lambda w: {}, "owner_user", "created_at"),
    ("organisation:delegation-list", lambda w: {}, "manager_user", "start_date"),
    ("organisation:profile-change-list", lambda w: {}, "hr_user", "-created_at"),
    ("organisation:employee-history", lambda w: {"public_id": w.owner.public_id}, "hr_user", "at"),
    ("requests:approval-list", lambda w: {}, "manager_user", "-waiting_since"),
    ("balances:ledger", lambda w: {"employee_public_id": w.owner.public_id}, "owner_user", "date"),
]


def _results(response) -> list:
    assert response.status_code == 200, response.content
    return response.json()["results"]


@pytest.mark.django_db
@pytest.mark.parametrize(("route", "kwargs", "who", "ordering"), LISTS, ids=[row[0] for row in LISTS])
def test_a_list_accepts_its_orderings_and_refuses_any_other(world, client_for, route, kwargs, who, ordering):
    client = client_for(getattr(world, who))
    url = reverse(route, kwargs=kwargs(world))

    assert client.get(url).status_code == 200                         # without the parameter, as before
    assert client.get(url, {"ordering": ordering}).status_code == 200

    refused = client.get(url, {"ordering": "password"})
    assert refused.status_code == 400
    body = refused.json()
    assert body["code"] == "core.ordering_invalid"
    assert body["errors"][0]["field"] == "ordering"
    assert ordering in body["detail"]                                  # the message lists what is allowed


@pytest.mark.django_db
def test_accounts_sort_by_email_name_and_last_sign_in(world, client_for, frozen):
    client = client_for(world.sysadmin_user)
    url = reverse("accounts:account-list")

    emails = [row["email"] for row in _results(client.get(url, {"page_size": 100}))]
    assert emails == sorted(emails)                                    # the default stays email
    reverse_emails = [row["email"] for row in _results(client.get(url, {"ordering": "-email", "page_size": 100}))]
    assert reverse_emails == sorted(emails, reverse=True)
    names = [row["name"] for row in _results(client.get(url, {"ordering": "name", "page_size": 100}))]
    assert names == sorted(names)

    # Someone who signed in sorts before someone who never did, when the newest sign-in is asked first.
    from apps.accounts.models import User
    User.objects.update(last_login_at=None)
    User.objects.filter(pk=world.peer_user.pk).update(last_login_at=datetime(2026, 11, 1, 9, 0, tzinfo=UTC))
    User.objects.filter(pk=world.owner_user.pk).update(last_login_at=datetime(2026, 11, 2, 9, 0, tzinfo=UTC))
    newest = [row["email"] for row in _results(client.get(url, {"ordering": "-last_login_at", "page_size": 100}))]
    assert newest[:2] == [world.owner_user.email, world.peer_user.email]
    oldest = [row["email"] for row in _results(client.get(url, {"ordering": "last_login_at", "page_size": 100}))]
    assert oldest[-2:] == [world.peer_user.email, world.owner_user.email]


@pytest.mark.django_db
def test_the_logs_sort_by_time_and_the_export_follows(world, client_for, frozen):
    for minutes, user in enumerate([world.owner_user, world.peer_user, world.manager_user]):
        frozen.move_to(datetime(2026, 11, 2, 8, minutes, tzinfo=UTC))
        organisation_services.propose_profile_change(user=user, changes={"phone": f"+216 20 000 00{minutes}"})
    client = client_for(world.hr_user)
    url = reverse("audit:business")

    newest_first = [row["at"] for row in _results(client.get(url))]
    assert newest_first == sorted(newest_first, reverse=True) and len(newest_first) >= 3
    oldest_first = [row["at"] for row in _results(client.get(url, {"ordering": "at"}))]
    assert oldest_first == sorted(newest_first)
    by_action = [row["action"] for row in _results(client.get(url, {"ordering": "action"}))]
    assert by_action == sorted(by_action)

    exported = client.get(reverse("audit:business-export"), {"ordering": "at"})
    body = b"".join(exported.streaming_content) if getattr(exported, "streaming", False) else exported.content
    rows = list(openpyxl.load_workbook(BytesIO(body)).worksheets[0].iter_rows(min_row=2, values_only=True))
    times = [next(cell for cell in row if isinstance(cell, datetime)) for row in rows]      # the "when" column
    assert times == sorted(times) and len(times) >= 3


@pytest.mark.django_db
def test_notifications_and_histories_can_be_read_oldest_first(world, client_for, frozen):
    for minutes in range(3):
        frozen.move_to(datetime(2026, 11, 2, 8, minutes, tzinfo=UTC))
        notifications.notify(users=[world.owner_user], event="account.password_reset",
                             params={"by": "Sonia Admin"}, dedupe_key=f"test:{minutes}")
    client = client_for(world.owner_user)
    url = reverse("notifications:list")
    default = [row["id"] for row in _results(client.get(url))]
    assert default == sorted(default, reverse=True)                    # newest first, as before
    assert [row["id"] for row in _results(client.get(url, {"ordering": "created_at"}))] == sorted(default)


@pytest.mark.django_db
def test_delegations_and_profile_changes_sort_by_date(world, client_for, frozen):
    for start in (date(2026, 12, 7), date(2026, 11, 16), date(2027, 1, 11)):
        organisation_services.create_delegation(actor=world.manager_user, manager=world.manager,
                                                delegate=world.other_manager, start_date=start,
                                                end_date=start + timedelta(days=4))
    client = client_for(world.manager_user)
    url = reverse("organisation:delegation-list")
    ascending = [row["start_date"] for row in _results(client.get(url, {"ordering": "start_date"}))]
    assert ascending == ["2026-11-16", "2026-12-07", "2027-01-11"]
    descending = [row["start_date"] for row in _results(client.get(url, {"ordering": "-start_date"}))]
    assert descending == list(reversed(ascending))

    for minutes, user in enumerate([world.owner_user, world.peer_user]):
        frozen.move_to(datetime(2026, 11, 2, 8, minutes, tzinfo=UTC))
        organisation_services.propose_profile_change(user=user, changes={"phone": f"+216 20 000 01{minutes}"})
    hr = client_for(world.hr_user)
    changes = reverse("organisation:profile-change-list")
    waiting = [row["employee"]["name"] for row in _results(hr.get(changes, {"status": "pending"}))]
    assert waiting == ["Amal Employee", "Bilel Employee"]                              # a queue: oldest first
    newest = [row["employee"]["name"] for row in _results(hr.get(changes, {"status": "pending", "ordering": "-created_at"}))]
    assert newest == list(reversed(waiting))


@pytest.mark.django_db
def test_the_queue_and_the_ledger_keep_their_order_unless_asked(world, client_for, frozen):
    first = make_request(world, user=world.owner_user, employee=world.owner, request_type=world.remote,
                         start=date(2026, 11, 23), end=date(2026, 11, 23))
    frozen.move_to(datetime(2026, 11, 2, 9, 0, tzinfo=UTC))
    second = make_request(world, user=world.peer_user, employee=world.peer, request_type=world.remote,
                          start=date(2026, 11, 16), end=date(2026, 11, 16))
    manager = client_for(world.manager_user)
    url = reverse("requests:approval-list")

    def ids(**query):
        return [item["request"]["public_id"] for item in _results(manager.get(url, {"queue": "mine", **query}))]

    assert ids() == [str(first.public_id), str(second.public_id)]                      # oldest first
    assert ids(ordering="-waiting_since") == [str(second.public_id), str(first.public_id)]
    assert ids(ordering="start_date") == [str(second.public_id), str(first.public_id)]

    give_balance(world, world.owner, "10")
    balance_services.adjust(actor=world.hr_user, employee=world.owner, amount=Decimal("1"),
                            effective_date=date(2026, 11, 2), reason="Correction")
    owner = client_for(world.owner_user)
    ledger = reverse("balances:ledger", kwargs={"employee_public_id": world.owner.public_id})
    newest_first = [row["kind"] for row in _results(owner.get(ledger))]
    assert newest_first == ["adjustment", "opening"]
    assert [row["kind"] for row in _results(owner.get(ledger, {"ordering": "date"}))] == ["opening", "adjustment"]


def test_the_api_description_names_the_parameter():
    schema = yaml.safe_load((settings.BASE_DIR / "openapi.yaml").read_text(encoding="utf-8"))
    for path in ("/api/v1/accounts", "/api/v1/audit/business", "/api/v1/audit/security", "/api/v1/notifications",
                 "/api/v1/delegations", "/api/v1/profile-changes", "/api/v1/approvals",
                 "/api/v1/balances/{employee_public_id}/ledger", "/api/v1/employees/{public_id}/history",
                 "/api/v1/employees", "/api/v1/requests"):
        names = [parameter["name"] for parameter in schema["paths"][path]["get"]["parameters"]]
        assert "ordering" in names, path
```

Run: `docker compose run --rm app pytest tests/hardening/test_ordering.py -v`

Expected: FAIL. The parametrised test fails ten times on `assert refused.status_code == 400` (an unknown parameter is ignored today), and the others on the orders asked for.

If `settings.BASE_DIR` is not the `backend` folder in plan 01a's settings, read the description the way `backend/tests/test_openapi.py` does.

- [ ] **Step 2: Write the helper and its text**

`backend/apps/core/ordering.py`:

```python
"""A whitelisted `ordering` query parameter for list endpoints (PRD 9.3: lists are sortable).

A view names the orders it allows; the client can ask for nothing else, so no column name
ever travels from the address bar to the database.
"""

from collections.abc import Mapping, Sequence

from drf_spectacular.utils import OpenApiParameter

from apps.core.errors import DomainError

Orderings = Mapping[str, Sequence]


def ordering_parameter(allowed: Orderings, default: str | None = None) -> OpenApiParameter:
    usual = f"`{default}`" if default else "the list's own order"
    return OpenApiParameter(
        "ordering", str, enum=sorted(allowed),
        description=f"Sort order; {usual} when absent. A leading minus sign means descending.",
    )


def chosen_ordering(request, allowed: Orderings, default: str | None = None) -> str | None:
    """The ordering asked for, the default when none is, or a problem when it is not allowed."""
    value = request.query_params.get("ordering") or default
    if value is not None and value not in allowed:
        raise DomainError("core.ordering_invalid", field="ordering", allowed=", ".join(sorted(allowed)))
    return value


def apply_ordering(request, queryset, allowed: Orderings, default: str | None = None):
    """`queryset` in the order asked for. Without `ordering` and without a default it is returned as it is."""
    value = chosen_ordering(request, allowed, default)
    return queryset if value is None else queryset.order_by(*allowed[value])
```

In `backend/apps/core/messages.py`, add one entry to `MESSAGES`, after `core.not_found`:

```python
    "core.ordering_invalid": {
        "en": "This list cannot be sorted that way. Allowed values: {allowed}.",
        "fr": "Cette liste ne peut pas être triée ainsi. Valeurs possibles : {allowed}.",
    },
```

- [ ] **Step 3: Give the parameter to the lists of plan 01a**

**Accounts.** In the module that defines `AccountListView` (`backend/apps/accounts/api/account_views.py`), plan 01a wrote:

```python
    @extend_schema(
        operation_id="accounts_list",
        parameters=[AccountFilterIn, *PAGE_PARAMETERS],
        responses=paginated(AccountOut),
    )
    def get(self, request):
        filters = AccountFilterIn(data=request.query_params)
        filters.is_valid(raise_exception=True)
        return paginate(request, self, selectors.accounts(**filters.validated_data), AccountOut)
```

Add the imports `from django.db.models import F` and `from apps.core.ordering import apply_ordering, ordering_parameter`, add this constant above the class:

```python
ACCOUNT_ORDERINGS = {
    "email": ("email",),
    "-email": ("-email",),
    "name": ("full_name", "email"),
    "-name": ("-full_name", "-email"),
    # Accounts that never signed in come last when the newest sign-in is asked first.
    "last_login_at": (F("last_login_at").asc(nulls_first=True), "email"),
    "-last_login_at": (F("last_login_at").desc(nulls_last=True), "email"),
}
```

and change the method to:

```python
    @extend_schema(
        operation_id="accounts_list",
        parameters=[AccountFilterIn, ordering_parameter(ACCOUNT_ORDERINGS, "email"), *PAGE_PARAMETERS],
        responses=paginated(AccountOut),
    )
    def get(self, request):
        filters = AccountFilterIn(data=request.query_params)
        filters.is_valid(raise_exception=True)
        found = apply_ordering(request, selectors.accounts(**filters.validated_data), ACCOUNT_ORDERINGS, "email")
        return paginate(request, self, found, AccountOut)
```

**Audit.** In `backend/apps/audit/api/views.py`, the list and the export share `_filtered`, which ends:

```python
        date_from=date_from,
        date_to=date_to,
    )
    return given, events
```

Add the import `from apps.core.ordering import apply_ordering, ordering_parameter`, add above `_filtered`:

```python
AUDIT_ORDERINGS = {
    "-at": ("-at", "-id"),
    "at": ("at", "id"),
    "action": ("action", "-at"),
    "-action": ("-action", "-at"),
}
```

change the end of `_filtered` to:

```python
        date_from=date_from,
        date_to=date_to,
    )
    return given, apply_ordering(request, events, AUDIT_ORDERINGS, "-at")
```

and in the four `@extend_schema` of the file, add `ordering_parameter(AUDIT_ORDERINGS, "-at")` after `AuditFilterIn` in `parameters` (for the two lists: `parameters=[AuditFilterIn, ordering_parameter(AUDIT_ORDERINGS, "-at"), *PAGE_PARAMETERS]`; for the two exports: `parameters=[AuditFilterIn, ordering_parameter(AUDIT_ORDERINGS, "-at")]`). An export then follows the order of the list it was started from.

**Notifications.** In `backend/apps/notifications/api/views.py`, the list reads:

```python
        parameters=[
            OpenApiParameter("unread", bool, description="Send 1 to list unread notifications only."),
            *PAGE_PARAMETERS,
        ],
        responses=paginated(NotificationOut),
    )
    def get(self, request):
        unread_only = request.query_params.get("unread", "").lower() in ("1", "true")
        notifications = services.for_user(request.user, unread_only=unread_only)
        return paginate(request, self, notifications, NotificationOut)
```

Add the same import, add above the class:

```python
NOTIFICATION_ORDERINGS = {"-created_at": ("-created_at", "-id"), "created_at": ("created_at", "id")}
```

and change it to:

```python
        parameters=[
            OpenApiParameter("unread", bool, description="Send 1 to list unread notifications only."),
            ordering_parameter(NOTIFICATION_ORDERINGS, "-created_at"),
            *PAGE_PARAMETERS,
        ],
        responses=paginated(NotificationOut),
    )
    def get(self, request):
        unread_only = request.query_params.get("unread", "").lower() in ("1", "true")
        notifications = services.for_user(request.user, unread_only=unread_only)
        notifications = apply_ordering(request, notifications, NOTIFICATION_ORDERINGS, "-created_at")
        return paginate(request, self, notifications, NotificationOut)
```

- [ ] **Step 4: Give the parameter to the lists of plans 02, 03a and 04**

In `backend/apps/organisation/api/views.py`, add the import `from apps.core.ordering import apply_ordering, ordering_parameter` and these constants above the first view:

```python
DELEGATION_ORDERINGS = {
    "-start_date": ("-start_date", "-id"),
    "start_date": ("start_date", "id"),
    "end_date": ("end_date", "id"),
    "-end_date": ("-end_date", "-id"),
}
PROFILE_CHANGE_ORDERINGS = {"created_at": ("created_at", "id"), "-created_at": ("-created_at", "-id")}
HISTORY_ORDERINGS = {"-at": ("-at", "-id"), "at": ("at", "id")}
```

**Delegations.** Plan 02 wrote:

```python
        parameters=[s.DelegationListQuery, *PAGE_PARAMETERS],
        responses=paginated(s.DelegationOut),
    )
    def get(self, request):
        query = s.DelegationListQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        queryset = selectors.delegations_for(
            request.user,
            scope=query.validated_data.get("scope", "mine"),
            manager_public_id=query.validated_data.get("manager"),
        )
        return paginate(request, self, queryset, s.DelegationOut)
```

Change the first line to `parameters=[s.DelegationListQuery, ordering_parameter(DELEGATION_ORDERINGS, "-start_date"), *PAGE_PARAMETERS],` and the last to:

```python
        queryset = apply_ordering(request, queryset, DELEGATION_ORDERINGS, "-start_date")
        return paginate(request, self, queryset, s.DelegationOut)
```

**Profile changes.** The selector orders a queue oldest first and a history newest first; that stays the default. In `ProfileChangeListView.get`, change `parameters=[s.ProfileChangeListQuery, *PAGE_PARAMETERS],` to `parameters=[s.ProfileChangeListQuery, ordering_parameter(PROFILE_CHANGE_ORDERINGS), *PAGE_PARAMETERS],` and the last line of the method, `return paginate(request, self, queryset, s.ProfileChangeOut)`, to:

```python
        queryset = apply_ordering(request, queryset, PROFILE_CHANGE_ORDERINGS)     # no default: the selector's own order
        return paginate(request, self, queryset, s.ProfileChangeOut)
```

**Employee history.** Plan 02 wrote:

```python
        parameters=PAGE_PARAMETERS,
        responses=paginated(AuditEventOut),
    )
    def get(self, request, public_id):
        employee = selectors.get_employee_for(request.user, public_id)
        events = audit_selectors.events_for_object("employee", str(employee.public_id)).order_by("-at", "-id")
        return paginate(request, self, events, AuditEventOut)
```

Change it to:

```python
        parameters=[ordering_parameter(HISTORY_ORDERINGS, "-at"), *PAGE_PARAMETERS],
        responses=paginated(AuditEventOut),
    )
    def get(self, request, public_id):
        employee = selectors.get_employee_for(request.user, public_id)
        events = audit_selectors.events_for_object("employee", str(employee.public_id))
        events = apply_ordering(request, events, HISTORY_ORDERINGS, "-at")
        return paginate(request, self, events, AuditEventOut)
```

**Approvals.** In `backend/apps/requests/api/views.py`, `ApprovalListView.get` of plan 03a holds:

```python
            OpenApiParameter("department", int),
            *PAGE_PARAMETERS,
        ],
```

and, further down:

```python
            waiting = waiting.filter(request__employee_id__in=list(members.values_list("pk", flat=True)))
        paginator = DefaultPagination()
```

Add the import, add above the class:

```python
APPROVAL_ORDERINGS = {
    "waiting_since": ("activated_at", "id"),
    "-waiting_since": ("-activated_at", "-id"),
    "start_date": ("request__start_date", "id"),
    "-start_date": ("-request__start_date", "-id"),
}
```

and change the two places to:

```python
            OpenApiParameter("department", int),
            ordering_parameter(APPROVAL_ORDERINGS),
            *PAGE_PARAMETERS,
        ],
```

```python
            waiting = waiting.filter(request__employee_id__in=list(members.values_list("pk", flat=True)))
        waiting = apply_ordering(request, waiting, APPROVAL_ORDERINGS)             # no default: a queue is oldest first
        paginator = DefaultPagination()
```

**Ledger.** In `backend/apps/balances/api/views.py`, `LedgerView` of plan 04 returns a list, not a queryset:

```python
        return list(reversed(selectors.ledger_lines(employee.id)))

    @extend_schema(responses=LedgerLineOut(many=True))
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)
```

Add the import `from apps.core.ordering import chosen_ordering, ordering_parameter`, add above the class `LEDGER_ORDERINGS = {"-date": (), "date": ()}`, and change the three lines to:

```python
        lines = selectors.ledger_lines(employee.id)                                 # oldest first, with the running balance
        oldest_first = chosen_ordering(self.request, LEDGER_ORDERINGS, "-date") == "date"
        return lines if oldest_first else list(reversed(lines))

    @extend_schema(parameters=[ordering_parameter(LEDGER_ORDERINGS, "-date")], responses=LedgerLineOut(many=True))
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)
```

- [ ] **Step 5: Regenerate the API description and run the backend tests**

Run: `powershell -File scripts/dev.ps1 openapi`

Expected: `backend/openapi.yaml` and `frontend/src/api/schema.d.ts` gain an `ordering` parameter on nine operations.

Run: `docker compose run --rm app pytest tests/hardening/test_ordering.py tests/test_openapi.py tests/test_messages.py -v`

Expected: all passed (16 tests in `test_ordering.py`).

Run: `docker compose run --rm app pytest apps/accounts apps/audit apps/notifications apps/organisation apps/requests apps/balances -q`

Expected: all passed: nothing changes for a call without the parameter. If `notifications.notify` refuses `params={"by": …}` in the notification test, give it the parameters its text uses (read `notification.account.password_reset.body` in `apps/accounts/messages.py`).

Commit:

```bash
git add backend/apps/core/ordering.py backend/apps/core/messages.py backend/apps/accounts backend/apps/audit backend/apps/notifications backend/apps/organisation backend/apps/requests backend/apps/balances backend/openapi.yaml backend/tests/hardening/test_ordering.py frontend/src/api/schema.d.ts
git commit -m "feat(api): a whitelisted ordering parameter on every paginated list"
```

- [ ] **Step 6: Write the failing tests of the sortable table**

Append to `frontend/src/components/lists.test.tsx` (plan 01b's test file for `DataTable`, `Pager`, `FilterBar` and `useListParams`; it already imports `render`, `screen`, `within`, `userEvent`, `vi`, `DataTable` and its `setPhoneViewport` helper):

```tsx
describe("DataTable, sorting", () => {
  interface Person { id: string; name: string; email: string }
  const people: Person[] = [
    { id: "1", name: "Amal Employee", email: "employee.a1@impactrisks.com" },
    { id: "2", name: "Bilel Employee", email: "employee.a2@impactrisks.com" },
  ];
  const sortableColumns = [
    { key: "name", header: "Nom", cell: (row: Person) => row.name, sortBy: "name" },
    { key: "email", header: "Adresse", cell: (row: Person) => row.email, sortBy: "email" },
    { key: "state", header: "État", cell: () => "Actif" },
  ];
  const table = (sort: string, onSort: (next: string) => void) => (
    <DataTable label="Comptes" columns={sortableColumns} rows={people} rowKey={(row) => row.id} empty={<p>Vide</p>} sort={sort} onSort={onSort} />
  );

  it("offers a sort on the columns that have one, and says which way the list is sorted", async () => {
    const onSort = vi.fn();
    const { rerender } = render(table("", onSort));
    const headers = within(screen.getByRole("table", { name: "Comptes" })).getAllByRole("columnheader");
    expect(headers.map((cell) => cell.textContent)).toEqual(["Nom", "Adresse", "État"]);      // the texts do not change
    expect(headers.map((cell) => cell.getAttribute("aria-sort"))).toEqual(["none", "none", null]);
    expect(within(headers[2]).queryByRole("button")).not.toBeInTheDocument();                // no sort, no button (M8)

    await userEvent.click(within(headers[0]).getByRole("button", { name: "Nom" }));
    expect(onSort).toHaveBeenLastCalledWith("name");

    rerender(table("name", onSort));
    expect(screen.getAllByRole("columnheader")[0]).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(screen.getByRole("button", { name: "Nom" }));
    expect(onSort).toHaveBeenLastCalledWith("-name");

    rerender(table("-name", onSort));
    expect(screen.getAllByRole("columnheader")[0]).toHaveAttribute("aria-sort", "descending");
    await userEvent.click(screen.getByRole("button", { name: "Nom" }));
    expect(onSort).toHaveBeenLastCalledWith("name");
  });

  it("is a plain table when no sort handler is given", () => {
    render(<DataTable label="Comptes" columns={sortableColumns} rows={people} rowKey={(row) => row.id} empty={<p>Vide</p>} />);
    expect(screen.queryByRole("button", { name: "Nom" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")[0]).not.toHaveAttribute("aria-sort");
  });

  it("offers the same sorts as one choice on a phone", async () => {
    setPhoneViewport(true);
    const onSort = vi.fn();
    render(table("-email", onSort));
    const choice = screen.getByRole("combobox", { name: "Trier par" });
    expect(choice).toHaveValue("-email");
    expect(within(choice).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Ordre habituel", "Nom, croissant", "Nom, décroissant", "Adresse, croissant", "Adresse, décroissant",
    ]);
    await userEvent.selectOptions(choice, "name");
    expect(onSort).toHaveBeenCalledWith("name");
    setPhoneViewport(false);
  });
});
```

Run: `docker compose run --rm web npx vitest run src/components/lists.test.tsx`

Expected: FAIL in the three new tests (`aria-sort` is null, there is no button named "Nom", no choice named "Trier par"); the tests of plan 01b still pass.

- [ ] **Step 7: Teach `DataTable` to sort**

In `frontend/src/i18n/locales/fr/common.json`, inside the existing `"list"` object (it holds `"pagination"`), add:

```json
    "sort": {
      "label": "Trier par",
      "usual": "Ordre habituel",
      "ascending": "{{column}}, croissant",
      "descending": "{{column}}, décroissant",
      "hint": "Trier"
    }
```

and in `frontend/src/i18n/locales/en/common.json`, at the same place:

```json
    "sort": {
      "label": "Sort by",
      "usual": "Usual order",
      "ascending": "{{column}}, ascending",
      "descending": "{{column}}, descending",
      "hint": "Sort"
    }
```

Replace `frontend/src/components/DataTable.tsx`. Plan 01b's `Column` and props are kept; three optional names are added (`Column.sortBy`, `sort`, `onSort`), and nothing changes for a table that does not use them.

```tsx
import { Fragment, type ReactNode, useId } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PageLoading } from "./PageLoading";
import { useIsPhone } from "./useIsPhone";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "start" | "end";
  /** The `ordering` value of the API that sorts by this column, ascending ("name"); "-name" is descending. */
  sortBy?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** When given, the first column becomes the button that opens the row; its cell must be plain text. */
  onRowOpen?: (row: T) => void;
  /** What to show when there is no row: why, and the action that would fill the list. */
  empty: ReactNode;
  isLoading?: boolean;
  /** Accessible name of the table. */
  label?: string;
  /** The current `ordering` ("", "name" or "-name"), as `useListParams().sort` gives it. */
  sort?: string;
  /** When given, each column with `sortBy` can sort the list. Pass `useListParams().setSort`. */
  onSort?: (next: string) => void;
}

type Direction = "ascending" | "descending" | "none";

function directionOf(column: { sortBy?: string }, sort: string | undefined): Direction {
  if (!column.sortBy) return "none";
  if (sort === column.sortBy) return "ascending";
  if (sort === `-${column.sortBy}`) return "descending";
  return "none";
}

export function DataTable<T>({ columns, rows, rowKey, onRowOpen, empty, isLoading = false, label, sort, onSort }: DataTableProps<T>) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const sortId = useId();
  if (columns.length > 6) throw new Error("A list shows at most six attributes per item (UI rule M4).");
  if (isLoading) return <PageLoading />;
  if (rows.length === 0 || columns.length === 0) return <>{empty}</>;

  const [first, ...others] = columns;
  const sortable = onSort ? columns.filter((column) => column.sortBy) : [];
  const lead = (row: T) =>
    onRowOpen ? (
      <button type="button" onClick={() => onRowOpen(row)} className="cursor-pointer text-left font-semibold text-primary hover:underline">
        {first.cell(row)}
      </button>
    ) : (
      <span className="font-semibold text-foreground">{first.cell(row)}</span>
    );

  if (phone) {
    return (
      <>
        {sortable.length > 0 && (
          <div className="mb-3 flex min-h-11 items-center gap-2 text-body text-text-secondary">
            <label htmlFor={sortId}>{t("list.sort.label")}</label>
            <select
              id={sortId}
              value={sort ?? ""}
              onChange={(event) => onSort?.(event.target.value)}
              className="min-h-11 flex-1 rounded-md border border-input bg-card px-3 text-foreground"
            >
              <option value="">{t("list.sort.usual")}</option>
              {sortable.map((column) => (
                <Fragment key={column.key}>
                  <option value={column.sortBy}>{t("list.sort.ascending", { column: column.header })}</option>
                  <option value={`-${column.sortBy}`}>{t("list.sort.descending", { column: column.header })}</option>
                </Fragment>
              ))}
            </select>
          </div>
        )}
        <ul aria-label={label} className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={rowKey(row)} className="rounded-xl border border-border bg-card p-4">
              <div className="flex min-h-11 items-center text-body">{lead(row)}</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
                {others.map((column) => (
                  <Fragment key={column.key}>
                    <dt className="text-muted-foreground">{column.header}</dt>
                    <dd className="m-0 text-right text-foreground">{column.cell(row)}</dd>
                  </Fragment>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table aria-label={label} className="w-full border-collapse text-body">
        <thead>
          <tr className="h-10 bg-muted text-caption font-medium text-muted-foreground">
            {columns.map((column) => {
              const alignment = cn("px-4 font-medium", column.align === "end" ? "text-right" : "text-left");
              if (!onSort || !column.sortBy) {
                return (
                  <th key={column.key} scope="col" className={alignment}>
                    {column.header}
                  </th>
                );
              }
              const direction = directionOf(column, sort);
              const Icon = direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ArrowUpDown;
              // A first click sorts ascending, a second descending, a third ascending again.
              const next = direction === "ascending" ? `-${column.sortBy}` : column.sortBy;
              return (
                <th key={column.key} scope="col" aria-sort={direction} className={alignment}>
                  <button
                    type="button"
                    title={t("list.sort.hint")}
                    onClick={() => onSort(next)}
                    className={cn(
                      "inline-flex h-10 cursor-pointer items-center gap-1 font-medium hover:text-foreground",
                      direction !== "none" && "text-foreground",
                    )}
                  >
                    {column.header}
                    <Icon aria-hidden="true" className="size-3.5" />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="h-15 border-t border-divider hover:bg-muted">
              <td className="px-4">{lead(row)}</td>
              {others.map((column) => (
                <td key={column.key} className={cn("px-4 text-foreground", column.align === "end" && "text-right")}>
                  {column.cell(row)}
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

Run: `docker compose run --rm web npx vitest run src/components/lists.test.tsx src/i18n/parity.test.ts`

Expected: all passed, the three new tests included.

- [ ] **Step 8: Write the failing tests of the four pages**

`frontend/src/components/sortableLists.test.tsx`. Each test renders a page, clicks the first header that sorts, and checks what the page then asks of the API and writes in the address.

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import AccountsPage from "@/features/accounts/AccountsPage";
import AuditLogPage from "@/features/audit/AuditLogPage";
import EmployeesPage from "@/features/employees/EmployeesPage";
import { makeRequest } from "@/features/requests/fixtures";
import { RequestsList } from "@/features/requests/lists/RequestsList";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";

const page = (results: unknown[]) => ({ count: results.length, next: null, previous: null, results });

/** Serves a list and remembers the `ordering` of each call. */
function serve(path: string, results: unknown[]): (string | null)[] {
  const asked: (string | null)[] = [];
  server.use(http.get(path, ({ request }) => {
    asked.push(new URL(request.url).searchParams.get("ordering"));
    return HttpResponse.json(page(results));
  }));
  return asked;
}

async function clickFirstSort(): Promise<HTMLElement> {
  const header = (await screen.findAllByRole("columnheader")).find((cell) => cell.hasAttribute("aria-sort"));
  expect(header, "no column of this table can sort").toBeDefined();
  await userEvent.click(within(header!).getByRole("button"));
  return header!;
}

describe("the large tables can be sorted", () => {
  it("accounts, by name", async () => {
    const asked = serve("/api/v1/accounts", [{
      public_id: "a1", email: "employee.a1@impactrisks.com", name: "Amal Employee", state: "active",
      roles: [], last_login_at: null, has_employee: true,
    }]);
    renderApp(<AccountsPage />, { route: "/admin/accounts", me: makeMe({ roles: ["sysadmin"], workspaces: ["admin"] }) });

    const header = await clickFirstSort();
    await waitFor(() => expect(asked.at(-1)).toBe("name"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(within(header).getByRole("button"));
    await waitFor(() => expect(asked.at(-1)).toBe("-name"));
  });

  it("a log, by time", async () => {
    const asked = serve("/api/v1/audit/security", [{
      id: 1, at: "2026-11-02T09:00:00+01:00", actor: "Sonia Admin", category: "security", action: "auth.login",
      object_type: "user", object_id: "u1", object_label: "sysadmin@impactrisks.com", changes: {},
      ip_address: "10.0.0.5", request_id: "r1",
    }]);
    server.use(http.get("/api/v1/accounts", () => HttpResponse.json(page([]))));
    renderApp(<AuditLogPage category="security" />, { route: "/admin/security-log", me: makeMe({ roles: ["sysadmin"], workspaces: ["admin"] }) });

    await clickFirstSort();
    await waitFor(() => expect(asked.at(-1)).toBe("at"));                 // oldest first
    const exported = screen.getAllByRole("link").find((link) => (link.getAttribute("href") ?? "").includes("/audit/security/export"));
    expect(exported?.getAttribute("href")).toContain("ordering=at");      // the export follows the list
  });

  it("employees, by name", async () => {
    const asked = serve("/api/v1/employees", [{
      public_id: "e1", name: "Amal Employee", employee_number: "E004",
      department: { id: 1, name: "Souscription" }, position: { id: 1, title: "Chargé de clientèle" },
      manager: { public_id: "e3", name: "Mounir Manager" }, status: "active",
    }]);
    server.use(http.get("/api/v1/departments", () => HttpResponse.json(page([]))));
    renderApp(<EmployeesPage mode="hr" />, { route: "/hr/employees", me: makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] }) });

    await clickFirstSort();
    await waitFor(() => expect(asked.at(-1)).toBe("name"));
  });

  it("requests, by date", async () => {
    const asked = serve("/api/v1/requests", [makeRequest()]);
    renderApp(
      <RequestsList scope="mine" columns={["type", "when", "quantity", "status"]} filters={["status"]} empty={<p>Vide</p>} label="Mes demandes" />,
      { route: "/me/requests", me: makeMe({ roles: ["employee"], workspaces: ["me"] }) },
    );

    const header = await clickFirstSort();
    await waitFor(() => expect(asked.at(-1)).toBe("start_date"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
  });
});
```

Run: `docker compose run --rm web npx vitest run src/components/sortableLists.test.tsx`

Expected: FAIL four times with "no column of this table can sort".

If a page asks for a route the test does not serve (the default handlers of `src/test/handlers.ts` cover the routes plans 02 and 05 registered), the failure names the unhandled request: add one `server.use(http.get(<route>, () => HttpResponse.json(page([]))))` line to that test. If `makeMe` or a prop of `RequestsList` has another shape in the finished code, the type check says so; follow the signature in `src/test/fixtures.ts` and `RequestsList.tsx`.

- [ ] **Step 9: Give the four pages their sorts**

**Accounts** (`frontend/src/features/accounts/AccountsPage.tsx`, plan 01b). The page already passes `list.query`, which carries `ordering`, to `useAccounts`. In the `columns` array, add `sortBy` to three columns:

```tsx
    { key: "name", header: t("accounts:list.name"), cell: (account) => account.name, sortBy: "name" },
    { key: "email", header: t("accounts:list.email"), cell: (account) => account.email, sortBy: "email" },
```

```tsx
    {
      key: "last",
      header: t("accounts:list.lastSignIn"),
      cell: (account) => (account.last_login_at ? formatDateTime(account.last_login_at, lang) : t("state.never")),
      sortBy: "last_login_at",
    },
```

and, where the page writes

```tsx
      <DataTable
        label={t("accounts:list.title")}
        columns={columns}
```

add the two props:

```tsx
      <DataTable
        label={t("accounts:list.title")}
        columns={columns}
        sort={list.sort}
        onSort={list.setSort}
```

**Logs** (`frontend/src/features/audit/AuditLogPage.tsx`, plan 01b). The page builds its query by hand:

```tsx
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "") query[key] = value;
  }
  const events = useAuditEvents(category, query);
```

Add one line before the hook, so the order travels with the filters:

```tsx
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "") query[key] = value;
  }
  if (list.sort) query.ordering = list.sort;
  const events = useAuditEvents(category, query);
```

Change two columns:

```tsx
    { key: "at", header: t("audit:columns.when"), cell: (event) => formatDateTime(event.at, lang), sortBy: "at" },
```

```tsx
    { key: "action", header: t("audit:columns.what"), cell: (event) => actionLabel(event.action, t, i18n), sortBy: "action" },
```

change the export link from `href={auditExportUrl(category, filters)}` to:

```tsx
          <a href={auditExportUrl(category, { ...filters, ...(list.sort ? { ordering: list.sort } : {}) })} download className={buttonVariants({ variant: "primary" })}>
```

and add `sort={list.sort}` and `onSort={list.setSort}` after `columns={columns}` on the `DataTable`. `auditExportUrl(category, filters: Record<string, string>)` writes every entry it is given into the address, so the order needs no other change.

**Employees** (`frontend/src/features/employees/EmployeesPage.tsx`, plan 02). The page reads

```tsx
  const { filters, page, setFilter, setPage } = useListParams({ search: "", department: "", status: "" });
```

and calls `useEmployees({ scope: "all", …, page })`. Change the first line and add one entry to the call:

```tsx
  const { filters, page, sort, setFilter, setPage, setSort } = useListParams({ search: "", department: "", status: "" });
```

```tsx
    status: (filters.status || undefined) as EmployeeListParams["status"],
    ordering: (sort || undefined) as EmployeeListParams["ordering"],
    page,
```

In the `columns` array, add `sortBy: "name",` after `header: t("directory.columns.name"),` of the first column, and change the second to:

```tsx
    { key: "number", header: t("directory.columns.number"), cell: (row: EmployeeRow) => row.employee_number, sortBy: "employee_number" },
```

Add `sort={sort}` and `onSort={setSort}` after `columns={columns}` on the `DataTable`.

**Requests** (`frontend/src/features/requests/lists/RequestsList.tsx`, plan 03b). The component already sends `ordering: params.sort`. Change one cell and the table:

```tsx
    when: { key: "when", header: t("common.dates"), cell: (request) => describeWhen(request, t, lang), sortBy: "start_date" },
```

```tsx
        <DataTable
          label={label}
          columns={columns.map((column) => cells[column])}
          sort={params.sort}
          onSort={params.setSort}
```

This one change gives the sort to My requests, the team's requests, HR's requests and the Overview's, which all render `RequestsList`.

- [ ] **Step 10: Run the frontend checks and commit**

Run: `docker compose run --rm web npx vitest run src/components src/features/accounts src/features/audit src/features/employees src/features/requests`

Expected: all passed, the four new page tests included. A test of an earlier plan that looked for a column header as plain text still finds it: the header's text is unchanged, it is now inside a button.

Run: `docker compose run --rm web npm run typecheck && docker compose run --rm web npm run lint`

Expected: no error.

Run on the host: `cd frontend; npx playwright test e2e/a11y.spec.ts -g "accounts|security log|employees|requests" --project=desktop`

Expected: all passed: a header that sorts is a button with a visible name, and `aria-sort` is a valid attribute of a column header.

```bash
git add frontend/src/components/DataTable.tsx frontend/src/components/lists.test.tsx frontend/src/components/sortableLists.test.tsx frontend/src/i18n/locales frontend/src/features/accounts/AccountsPage.tsx frontend/src/features/audit/AuditLogPage.tsx frontend/src/features/employees/EmployeesPage.tsx frontend/src/features/requests/lists/RequestsList.tsx
git commit -m "feat(ui): column headers that sort on accounts, logs, employees and requests"
```

### Task 14: The calendar follows the working week, and a day of the calendar fills the form

**Files:**
- Create: `backend/apps/calendar/tests/test_feed_working_week.py`
- Modify: `backend/apps/calendar/feed.py`, `backend/apps/calendar/api/feed_serializers.py` (plan 05)
- Modify: `backend/openapi.yaml`, `frontend/src/api/schema.d.ts` (regenerated)
- Modify: `frontend/src/features/calendar/model.ts`, `frontend/src/features/calendar/fixtures.ts`, `frontend/src/features/calendar/CalendarView.tsx`, `frontend/src/features/calendar/model.test.ts`, `frontend/src/features/calendar/CalendarView.test.tsx` (plan 05)
- Modify: `frontend/src/features/requests/form/RequestForm.tsx`, `frontend/src/features/requests/form/NewRequestPage.tsx`, `frontend/src/features/requests/form/NewRequestPage.test.tsx` (plan 03b)

**Interfaces:**
- Consumes: the HR setting `working_week` (ISO weekdays, Monday = 1; plan 03a); `calendar_feed`, `CalendarFeed`, `CalendarOut`, `feed_payload` (plan 05); `isWeekend`, `entriesOn`, `makeFeed`, `Grid` (plan 05); `RequestForm` with `initialDate`, `NewRequestPage` (plan 03b); `serveRequestForm`, `setDate` of plan 03b's tests.
- Produces:
  - `GET calendar` returns a third key, `working_week: number[]`. This adds to master 7.8.
  - `isWeekend(day: Date, workingWeek?: readonly number[]): boolean` and `isoWeekday(day: Date): number` in `features/calendar/model.ts`.
  - `RequestFormProps.initialEnd?: string`; `/me/requests/new` reads `start` and `end` from the address, and still reads `date`.

Two things were left open between plans. Plan 05's calendar treats Saturday and Sunday as days off whatever HR's `working_week` says (its contract note 6): after HR changes the setting, the calendar would grey the wrong days and offer "new request" on a day off. And plan 05's calendar opens the request form with `?start=<day>` while plan 03b's form reads `?date=` (plan 05, note 14): the form opens empty, so "start a new request from a day" (UI 5.7) does not carry the day.

- [ ] **Step 1: Write the failing test of the feed**

`backend/apps/calendar/tests/test_feed_working_week.py`:

```python
"""The calendar feed carries HR's working week, so the page greys the right days (PRD 6.1, UI 5.7)."""

import pytest
from django.urls import reverse

from apps.settings import services as settings_service

pytestmark = pytest.mark.django_db
WINDOW = {"from": "2026-11-01", "to": "2026-11-30", "scope": "department"}


def test_the_feed_says_which_days_are_worked(world, client_for):
    body = client_for(world.owner_user).get(reverse("calendar:feed"), WINDOW).json()
    assert set(body) == {"holidays", "entries", "working_week"}
    assert body["working_week"] == [1, 2, 3, 4, 5]


def test_the_feed_follows_the_setting(world, client_for):
    settings_service.set_value(actor=world.hr_user, key="working_week", value=[1, 2, 3, 4, 7])
    settings_service.clear_cache()
    for user, scope in ((world.owner_user, "department"), (world.manager_user, "team"), (world.hr_user, "company")):
        body = client_for(user).get(reverse("calendar:feed"), {**WINDOW, "scope": scope}).json()
        assert body["working_week"] == [1, 2, 3, 4, 7], scope
```

Run: `docker compose run --rm app pytest apps/calendar/tests/test_feed_working_week.py -v`

Expected: FAIL with `assert {'entries', 'holidays'} == {'entries', 'holidays', 'working_week'}`.

- [ ] **Step 2: Add the working week to the feed**

In `backend/apps/calendar/feed.py`, plan 05 wrote:

```python
@dataclass(frozen=True)
class CalendarFeed:
    holidays: list[FeedHoliday]
    entries: list[FeedEntry]
```

and, at the end of `calendar_feed`:

```python
    return CalendarFeed(holidays=holidays, entries=entries)
```

Add the import `from apps.settings import services as settings_service` (if the module does not have it yet) and change the two places to:

```python
@dataclass(frozen=True)
class CalendarFeed:
    holidays: list[FeedHoliday]
    entries: list[FeedEntry]
    # ISO weekdays that are worked (Monday = 1), from HR's `working_week` setting.
    working_week: tuple[int, ...] = (1, 2, 3, 4, 5)
```

```python
    working_week = tuple(sorted(int(day) for day in settings_service.get("working_week")))
    return CalendarFeed(holidays=holidays, entries=entries, working_week=working_week)
```

In `backend/apps/calendar/api/feed_serializers.py`, plan 05 wrote:

```python
class CalendarOut(serializers.Serializer):
    holidays = CalendarHolidayOut(many=True)
    entries = CalendarEntryOut(many=True)
```

and `feed_payload` begins:

```python
    return {
        "holidays": [
```

Change them to:

```python
class CalendarOut(serializers.Serializer):
    holidays = CalendarHolidayOut(many=True)
    entries = CalendarEntryOut(many=True)
    working_week = serializers.ListField(child=serializers.IntegerField(min_value=1, max_value=7))
```

```python
    return {
        "working_week": list(feed.working_week),
        "holidays": [
```

Run: `docker compose run --rm app pytest apps/calendar -q`

Expected: all passed. If a test of plan 05 compares the exact keys of the feed (`set(body) == {"holidays", "entries"}`), add `"working_week"` to its set: the feed now has three keys.

Run: `powershell -File scripts/dev.ps1 openapi`

Expected: `CalendarOut` in `backend/openapi.yaml` and `CalendarFeed` in `frontend/src/api/schema.d.ts` gain `working_week`.

- [ ] **Step 3: Write the failing tests of the calendar page**

Append to `frontend/src/features/calendar/model.test.ts`, inside the file (it already imports `entriesOn`, `isWeekend`, `makeEntry`, `makeFeed` and defines `day`):

```ts
describe("the working week of the feed", () => {
  const sundayToThursday = [1, 2, 3, 4, 7];

  it("takes the days off from the feed, Monday to Friday without one", () => {
    expect(isWeekend(day("2026-11-06"))).toBe(false);                        // a Friday, usually worked
    expect(isWeekend(day("2026-11-06"), sundayToThursday)).toBe(true);
    expect(isWeekend(day("2026-11-07"), sundayToThursday)).toBe(true);       // Saturday
    expect(isWeekend(day("2026-11-08"), sundayToThursday)).toBe(false);      // Sunday is worked
  });

  it("shows nobody on a day off and somebody on a worked Sunday", () => {
    const away = makeEntry({ start_date: "2026-11-05", end_date: "2026-11-09" });
    const feed = makeFeed({ entries: [away], working_week: sundayToThursday });
    expect(entriesOn(feed, day("2026-11-06"))).toEqual([]);                  // Friday
    expect(entriesOn(feed, day("2026-11-08"))).toHaveLength(1);              // Sunday
    expect(entriesOn(makeFeed({ entries: [away] }), day("2026-11-08"))).toEqual([]);   // the usual week
  });
});
```

Append to `frontend/src/features/calendar/CalendarView.test.tsx`, inside `describe("CalendarView, grid", …)`:

```tsx
  it("offers a new request on the days HR's working week includes, and on no other", () => {
    const onDayAction = vi.fn();
    setup(makeFeed({ working_week: [1, 2, 3, 4, 7] }), { onDayAction });

    expect(screen.getByRole("button", { name: "Nouvelle demande le dim. 22 nov." })).toBeInTheDocument();          // Sunday, worked
    expect(screen.queryByRole("button", { name: "Nouvelle demande le ven. 20 nov." })).not.toBeInTheDocument();    // Friday, off
    expect(screen.queryByRole("button", { name: "Nouvelle demande le sam. 21 nov." })).not.toBeInTheDocument();    // Saturday, off
  });
```

Run: `docker compose run --rm web npx vitest run src/features/calendar/model.test.ts src/features/calendar/CalendarView.test.tsx`

Expected: FAIL in the three new tests; the type check also reports that `working_week` is missing from `makeFeed` and `EMPTY_FEED`, because the regenerated type now requires it.

- [ ] **Step 4: Make the calendar use the feed's week**

In `frontend/src/features/calendar/model.ts`, plan 05 wrote:

```ts
export function isWeekend(day: Date): boolean {
  const weekday = getDay(day);
  return weekday === 0 || weekday === 6;
}
```

and, in `entriesOn`:

```ts
  if (isWeekend(day) || holidayOn(feed.holidays, iso)) {
```

Change them to:

```ts
const USUAL_WEEK: readonly number[] = [1, 2, 3, 4, 5];

/** ISO weekday: Monday = 1 … Sunday = 7, as HR's `working_week` setting counts them. */
export function isoWeekday(day: Date): number {
  const weekday = getDay(day);
  return weekday === 0 ? 7 : weekday;
}

/** A day outside the working week. The week comes from the feed; without one, Monday to Friday. */
export function isWeekend(day: Date, workingWeek: readonly number[] = USUAL_WEEK): boolean {
  return !workingWeek.includes(isoWeekday(day));
}
```

```ts
  if (isWeekend(day, feed.working_week) || holidayOn(feed.holidays, iso)) {
```

In `frontend/src/features/calendar/fixtures.ts`, change the body of `makeFeed` from `return { holidays: [], entries: [], ...overrides };` to:

```ts
  return { holidays: [], entries: [], working_week: [1, 2, 3, 4, 5], ...overrides };
```

In `frontend/src/features/calendar/CalendarView.tsx`, change `const EMPTY_FEED: CalendarFeed = { holidays: [], entries: [] };` to:

```tsx
const EMPTY_FEED: CalendarFeed = { holidays: [], entries: [], working_week: [1, 2, 3, 4, 5] };
```

and, in `Grid`, the line `const working = !isWeekend(day) && !holiday;` to:

```tsx
            const working = !isWeekend(day, feed.working_week) && !holiday;
```

The agenda shown on a phone reads its days through `entriesOn`, so it needs no change.

Run: `docker compose run --rm web npx vitest run src/features/calendar src/features/home`

Expected: all passed. A fixture of plan 05 that builds a feed by hand instead of through `makeFeed` (for example in `src/test/handlers.ts`) must gain `working_week: [1, 2, 3, 4, 5]`; the type check names each one.

- [ ] **Step 5: Write the failing tests of the form**

Append to `frontend/src/features/requests/form/NewRequestPage.test.tsx`, after the existing `describe` (the file already imports `screen`, `serveRequestForm`, `setDate` and defines `open`):

```tsx
describe("New request from a day of the calendar (UI 5.7)", () => {
  it("fills both dates from ?start=", async () => {
    serveRequestForm();
    open("/me/requests/new?type=remote&start=2026-11-17");
    expect(await screen.findByLabelText("Début")).toHaveValue("2026-11-17");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-17");
  });

  it("takes the last day from ?end= when it is given", async () => {
    serveRequestForm();
    open("/me/requests/new?type=remote&start=2026-11-17&end=2026-11-19");
    expect(await screen.findByLabelText("Début")).toHaveValue("2026-11-17");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-19");
  });

  it("keeps ?start= through the choice of the type", async () => {
    serveRequestForm();
    open("/me/requests/new?start=2026-11-17");
    expect(await screen.findByRole("link", { name: /Télétravail/ })).toHaveAttribute(
      "href",
      "/me/requests/new?start=2026-11-17&type=remote",
    );
  });

  it("ignores a value that is not a date", async () => {
    serveRequestForm();
    open("/me/requests/new?type=remote&start=demain&end=2026-13-45");
    expect(await screen.findByLabelText("Début")).toHaveValue("");
    expect(screen.getByLabelText("Fin")).toHaveValue("");
  });

  it("prefers the day chosen on the calendar to text kept from an earlier visit", async () => {
    serveRequestForm();
    const first = open("/me/requests/new?type=remote");
    await screen.findByLabelText("Début");
    setDate("Début", "2026-12-01");
    setDate("Fin", "2026-12-01");
    first.unmount();

    open("/me/requests/new?type=remote&start=2026-11-17");
    expect(await screen.findByLabelText("Début")).toHaveValue("2026-11-17");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-17");
  });
});
```

Run: `docker compose run --rm web npx vitest run src/features/requests/form/NewRequestPage.test.tsx`

Expected: FAIL in the first, second and fifth new tests (the dates are empty, or those of the earlier visit); the tests of plan 03b still pass.

- [ ] **Step 6: Make the form read the day**

In `frontend/src/features/requests/form/RequestForm.tsx`, plan 03b wrote, in `RequestFormProps`:

```tsx
  /** Pre-fills both dates (a day chosen on the calendar). */
  initialDate?: string;
```

and:

```tsx
export function RequestForm({ type, mode, formId, employeeId, existing, initialDate, onDone, onCancel }: RequestFormProps) {
```

```tsx
  const [initial] = useState<FormValues>(() =>
    existing ? fromRequest(existing) : { ...EMPTY, start_date: initialDate ?? "", end_date: initialDate ?? "" },
  );
  const schema = useMemo(() => buildSchema(type, t), [type, t]);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initial });
  const keeper = useDraftKeeper(viewer.publicId, formId, form);
```

Add `useEffect` to the names the file imports from `react`, and change the four places to:

```tsx
  /** Pre-fills the first day (a day chosen on the calendar), and the last day too unless `initialEnd` is given. */
  initialDate?: string;
  /** Pre-fills the last day when it differs from the first. */
  initialEnd?: string;
```

```tsx
export function RequestForm({ type, mode, formId, employeeId, existing, initialDate, initialEnd, onDone, onCancel }: RequestFormProps) {
```

```tsx
  const [initial] = useState<FormValues>(() =>
    existing
      ? fromRequest(existing)
      : { ...EMPTY, start_date: initialDate ?? "", end_date: initialEnd ?? initialDate ?? "" },
  );
  const schema = useMemo(() => buildSchema(type, t), [type, t]);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initial });
  const keeper = useDraftKeeper(viewer.publicId, formId, form);
  // The keeper restores what was typed on an earlier visit. A day just chosen on the calendar wins over it:
  // this effect runs after the keeper's own, once, when the form opens.
  useEffect(() => {
    if (!existing && initialDate) {
      form.setValue("start_date", initialDate, { shouldDirty: true });
      form.setValue("end_date", initialEnd ?? initialDate, { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

In `frontend/src/features/requests/form/NewRequestPage.tsx`, plan 03b wrote:

```tsx
/** /me/requests/new : step one without `?type=`, step two with it. `?date=` pre-fills the dates. */
```

```tsx
  const code = search.get("type");
  const date = search.get("date") ?? undefined;
```

```tsx
              initialDate={date}
```

Change them to:

```tsx
/**
 * /me/requests/new : step one without `?type=`, step two with it.
 * `?start=` (and `?end=`) pre-fill the dates: the calendar of plan 05 sends `start`. `?date=` is still read.
 */
```

```tsx
  const code = search.get("type");
  const isDate = (value: string | null): value is string =>
    value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
  const given = search.get("start") ?? search.get("date");
  const start = isDate(given) ? given : undefined;
  const end = start && isDate(search.get("end")) ? (search.get("end") as string) : undefined;
```

```tsx
              initialDate={start}
              initialEnd={end}
```

The choice of the type already copies every parameter of the address into its links (`new URLSearchParams(search)`), so `start` and `end` travel through step one without a change.

Run: `docker compose run --rm web npx vitest run src/features/requests/form src/features/calendar`

Expected: all passed, the five new tests and the seven of plan 03b included.

- [ ] **Step 7: See it in the browser and commit**

Run on the host: `cd frontend; npx playwright test e2e/calendar-privacy.spec.ts e2e/homes-phone.spec.ts e2e/ask-for-leave.spec.ts`

Expected: all passed: nothing changes for the usual week or for a form opened without a day.

Then check by hand, once: sign in as `employee.a1@impactrisks.com`, open `/me/calendar`, choose "Nouvelle demande" on a working day, choose a type: both dates hold that day. Sign in as `hr@impactrisks.com`, set the working days to Sunday through Thursday in `/hr/settings/parameters`, and reopen a calendar: Friday and Saturday are greyed, Sunday offers a new request. Put the setting back.

```bash
git add backend/apps/calendar backend/openapi.yaml frontend/src/api/schema.d.ts frontend/src/features/calendar frontend/src/features/requests/form
git commit -m "fix: the calendar follows HR's working week and a chosen day fills the request form"
```

### Task 15: Runbook, guides, decisions and changelog

**Files:**
- Create: `scripts/tests/docs.test.sh`
- Create: `docs/runbook/install.md`, `docs/runbook/update.md`, `docs/runbook/restore.md`
- Create: `docs/guides/administrator.md`, `docs/guides/hr.md`, `docs/guides/employee.fr.md`, `docs/guides/employee.en.md`
- Create: `docs/decisions.md`
- Modify: `CHANGELOG.md` (append the entry of `v1.0.0`)
- Modify: `README.md` (append a "Documents" section)

**Interfaces:**
- Consumes: `scripts/server/update.sh`, `compose.sh`, `check-env.sh`, `dump.sh`, `scripts/server/state/release` (plan 01b, Task 22) and the installation steps of its Task 26; `scripts/server/restore.sh`, `backup_now`, `restore_backup` (Task 5); `scripts/server/check-headers.sh` (Task 7); `create_sysadmin` (plan 01a); the pages and their French and English names as plans 01b to 06 built them; master section 3 and the "Contract notes" of every plan.
- Produces: the documents PRD 12.10 lists: "installation, update and restore runbook; administrator guide; HR guide; employee guide in French and English; this specification; a record of later decisions", and the changelog entry of the first release. Task 17 follows `install.md` on an empty stack and corrects it where it was wrong.

A runbook is written for the person who has it open while the system is down. Each step is one command and what it must print.

- [ ] **Step 1: Write the check that fails while a document is missing**

`scripts/tests/docs.test.sh` (LF line endings):

```bash
#!/usr/bin/env bash
# Checks that every document of PRD 12.10 exists and that the commands it names exist too.
# Run: bash scripts/tests/docs.test.sh
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

failures=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }

DOCUMENTS=(
  docs/runbook/install.md docs/runbook/update.md docs/runbook/restore.md
  docs/guides/administrator.md docs/guides/hr.md docs/guides/employee.fr.md docs/guides/employee.en.md
  docs/decisions.md docs/ui-audit.md docs/permission-matrix.md CHANGELOG.md
  docs/superpowers/specs/2026-10-05-iris-hr-platform-prd-design.md
  docs/superpowers/specs/2026-10-05-iris-hr-platform-ui-design.md
)
for document in "${DOCUMENTS[@]}"; do
  if [ -s "$document" ]; then pass "$document exists"; else fail "$document is missing or empty"; fi
done

# Every server script a runbook names must exist and be executable in git.
for script in $(grep -ohE 'scripts/server/[a-z-]+\.sh' docs/runbook/*.md 2>/dev/null | sort -u); do
  if git ls-files --error-unmatch "$script" >/dev/null 2>&1; then pass "$script is in the repository"; else fail "a runbook names $script, which does not exist"; fi
done

# Every management command a document names must exist.
for command in $(grep -ohE 'manage\.py [a-z_]+' docs/runbook/*.md docs/guides/*.md 2>/dev/null | awk '{print $2}' | sort -u); do
  case "$command" in migrate | shell | procrastinate) pass "manage.py $command (built in)"; continue ;; esac
  if ls backend/apps/*/management/commands/"$command".py >/dev/null 2>&1; then pass "manage.py $command exists"; else fail "a document names manage.py $command, which does not exist"; fi
done

# The two employee guides have the same sections.
french="$(grep -c '^## ' docs/guides/employee.fr.md 2>/dev/null || echo 0)"
english="$(grep -c '^## ' docs/guides/employee.en.md 2>/dev/null || echo 0)"
if [ "$french" -gt 0 ] && [ "$french" = "$english" ]; then pass "the employee guide has $french sections in both languages"; else fail "the employee guides differ: $french sections in French, $english in English"; fi

# The changelog has the release.
if grep -q '^## v1\.0\.0' CHANGELOG.md 2>/dev/null; then pass "CHANGELOG.md has v1.0.0"; else fail "CHANGELOG.md has no entry for v1.0.0"; fi

# No document tells an operator to edit .env during an update, or to use plain docker compose on the server.
if grep -nE '^\s*docker compose ' docs/runbook/*.md 2>/dev/null | grep -v 'development' >/dev/null; then
  fail "a runbook uses plain 'docker compose' on the server; it must be scripts/server/compose.sh"
else
  pass "the runbooks use scripts/server/compose.sh"
fi

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "docs.test.sh: all passed"
```

Run: `bash scripts/tests/docs.test.sh`

Expected: `FAIL` for each of the eight documents of this task and for the changelog entry, ending with `check(s) failed`. (`docs/ui-audit.md` and `docs/permission-matrix.md` exist since Tasks 12 and 1.)

- [ ] **Step 2: Write the installation runbook**

`docs/runbook/install.md`:

````markdown
# Runbook: install a stack

For the person who installs the IRIS HR platform on the office server. It creates one stack: the test stack,
or the production stack. The two live side by side on the same server, each in its own folder with its own
database, files, address and `.env`.

Time: about 45 minutes. You need: a shell on the server as the service account, the GitHub token of step 2,
and the address the stack will answer on.

| | Test stack | Production stack |
|---|---|---|
| Folder | `/opt/iris-hr/test` | `/opt/iris-hr/prod` |
| `ENVIRONMENT` | `test` | `production` |
| `HTTPS_PORT`, `HTTP_PORT` | `8443`, `8080` | `443`, `80` |
| `SITE_HOSTNAME` | for example `hr-test.impactrisks.lan` | for example `hr.impactrisks.lan` |

Rule for every command below: on the server, never type `docker compose` directly. Use
`scripts/server/compose.sh`, which stays on the version the last update deployed.

## 1. Check the server

- Ubuntu LTS, 4 cores, 8 GB of memory, SSD, full-disk encryption switched on at installation.
- The name of the stack resolves, from an office machine, to the server's address (ask whoever runs the office DNS).
- The firewall lets the office network reach the two ports of the stack, and nothing else from outside the office.

```bash
docker --version && docker compose version && git --version && curl --version | head -n 1
lsblk -o NAME,TYPE,FSTYPE | grep -c crypt
```

Expected: four version lines, then a number above zero (the disk is encrypted).

## 2. Give the service account read access to the code and the images

Create, on GitHub, a token with only "Contents: read" on the repository and "Packages: read". Then, as the
service account (a member of the `docker` group, not `root`):

```bash
git config --global credential.helper store
git clone https://github.com/<owner>/iris-hr.git /opt/iris-hr/<test or prod>
docker login ghcr.io --username <github user>
chmod 600 ~/.git-credentials ~/.docker/config.json
```

Expected: `Resolving deltas: 100%`, then `Login Succeeded`.

## 3. Write the `.env` of the stack

```bash
cd /opt/iris-hr/<test or prod>
cp .env.example .env
chmod 600 .env
openssl rand -hex 32                           # DJANGO_SECRET_KEY
openssl rand -hex 24                           # POSTGRES_PASSWORD
openssl rand -hex 24                           # BACKUP_PASSPHRASE
openssl rand -base64 32 | tr '+/' '-_'         # FILE_ENCRYPTION_KEY
```

Edit `.env`. Set the values of the table at the top, and:

| Variable | Value |
|---|---|
| `COMPOSE_FILE` | `compose.yaml:compose.server.yaml` |
| `APP_VERSION` | the version you install, for example `v1.0.0` |
| `IMAGE_PREFIX` | `ghcr.io/<owner in lower case>/iris-hr` |
| `DJANGO_ALLOWED_HOSTS` | the same name as `SITE_HOSTNAME` |
| `DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD`, `BACKUP_PASSPHRASE`, `FILE_ENCRYPTION_KEY` | the four values generated above; never reuse those of the other stack |

```bash
scripts/server/check-env.sh
```

Expected: `The .env is complete.`

**Keep a copy of this `.env` somewhere that is not this server** (the company's password safe). Without
`FILE_ENCRYPTION_KEY`, medical certificates cannot be read after a restore. Without `BACKUP_PASSPHRASE`, no
backup can be read at all.

## 4. Install the version

```bash
sha256sum .env > /tmp/env.before
scripts/server/update.sh v1.0.0
sha256sum --check /tmp/env.before
scripts/server/compose.sh ps
```

Expected: the seven steps, `First installation: there is no database to dump` at step 3, then
`Update to v1.0.0 complete.`; `.env: OK`; `app`, `db`, `proxy` and `worker` running, and only `proxy` with
published ports.

If step 7 fails: `DJANGO_ALLOWED_HOSTS` does not contain `SITE_HOSTNAME` (the API answers 400), or the registry
refuses the pull (`denied`: the token lacks "Packages: read", or `IMAGE_PREFIX` has an upper-case letter).

## 5. Let office machines trust the certificate

If the company supplies a certificate for the name, put its two files in `proxy/certs/` as the comment in
`proxy/Caddyfile` says, and run `scripts/server/compose.sh restart proxy`. Otherwise the stack uses Caddy's own
authority; export its root certificate and install it on the office machines ("Trusted Root Certification
Authorities" on Windows):

```bash
scripts/server/compose.sh exec -T proxy cat /data/caddy/pki/authorities/local/root.crt > iris-hr-root.crt
```

## 6. Check the stack from the outside

```bash
scripts/server/check-headers.sh https://<SITE_HOSTNAME>:<HTTPS_PORT> <HTTP_PORT>
```

Expected: every line starts with `ok`, the last line is `All checks passed.`

## 7. Create the first System Administrator

```bash
scripts/server/compose.sh exec app python manage.py create_sysadmin --email <first.last>@impactrisks.com --name "<First Last>"
```

Expected: a line `Temporary password: …`. It is shown once and expires after 24 hours. Hand it over in person.

## 8. Take the first backup and prove that it restores

```bash
scripts/server/compose.sh exec app python manage.py backup_now
scripts/server/restore.sh --check
```

Expected: two file names and a byte count, then a row count per table and `Restore check passed`. From now on a
backup is written every night at 23:30 and kept 14 days; the Status page of the Administration workspace shows
the last one.

## 9. Enter the company (production stack only)

This is the go-live sequence. Rehearse it on the test stack first.

| Step | Who | Where |
|---|---|---|
| 1. Give the HR role to the HR Responsible, the Executive role to the CEO and the Deputy CEO | System Administrator | Administration, Accounts, Create account |
| 2. Parameters: monthly credit, working days, certificate deadline, meal tickets, cut-off day. Leave "credits start on" empty for now | HR | HR desk, Settings, Parameters |
| 3. Public holidays of the year; exceptional-leave events and their days | HR | HR desk, Settings |
| 4. Departments and positions | HR | HR desk, Settings, Departments and positions |
| 5. Employees, managers first so that each employee can be given a manager | HR | HR desk, Employees, New employee |
| 6. The opening balance of each employee, dated the day before go-live | HR | The employee's record, Balance |
| 7. "Credits start on": the first day of the go-live month | HR | HR desk, Settings, Parameters |
| 8. An account for each employee; hand over each temporary password in person | System Administrator | Administration, Status, "Employees with no account" |

After step 7 the month-end credit is posted on the last day of each month. Before it, nothing is credited, so the
opening balances can be entered over several days.

## 10. Hand over

- [ ] The `.env` is in the password safe, apart from the server.
- [ ] The System Administrator and HR have their guides (`docs/guides/`).
- [ ] The date of the next quarterly restore test is in the administrator's calendar (`restore.md`, section 4).
````

- [ ] **Step 3: Write the update runbook**

`docs/runbook/update.md`:

````markdown
# Runbook: update a stack

For the person who moves a stack to a new version. Always update the test stack first, use it for a day, then
update production outside business hours.

Time: about 10 minutes, of which 1 to 3 minutes without service.

## 1. Before

- Read the entry of the version in `CHANGELOG.md`. An entry that says "new variable" lists what to add to `.env`.
- Check that last night's backup exists: Administration, Status, "Backup". If it is older than a day, see
  `restore.md`, section 5, before going further.

## 2. Update

```bash
cd /opt/iris-hr/<test or prod>
sha256sum .env > /tmp/env.before
scripts/server/update.sh vX.Y.Z
sha256sum --check /tmp/env.before
```

Expected: seven numbered steps, then `Update to vX.Y.Z complete.` and `.env: OK`.

What the command does: it fetches the version, compares your `.env` with the `.env.example` of that version,
dumps the database into the backup volume (`/data/backups/pre-update/`), pulls the two images, applies the
database migrations, restarts the containers and waits for `/api/v1/health`. It never writes to `.env`.

## 3. When it stops at step 2

```
The .env lacks variables that this version needs:
  NEW_VARIABLE
Nothing was changed.
```

Open `.env.example` of the new version (`git show vX.Y.Z:.env.example`), read what the variable means, add it to
`.env`, and run the command again. The stack was not touched.

## 4. When it stops at step 7

The new version did not become healthy. The command prints three lines: how to read the logs, how to return to
the previous version, and where the dump taken before the update is.

```bash
APP_VERSION=vX.Y.Z docker compose logs --tail 100 app worker proxy      # the one place where plain docker compose is right: the version is not recorded yet
scripts/server/update.sh <previous version>
```

Returning to the previous version restarts the previous images. A migration that the new version applied stays
applied; versions are written so that the previous one still runs on it (a column is never removed in the version
that stops using it). If the previous version does not become healthy either, restore the dump taken before the
update: `restore.md`, section 3, with the file the update printed.

## 5. After

```bash
scripts/server/compose.sh ps
scripts/server/check-headers.sh https://<SITE_HOSTNAME>:<HTTPS_PORT> <HTTP_PORT>
```

- Sign in, open Administration, Status: "Everything works", the new version, every scheduled job with a recent run.
- Tell HR the update is done and what the changelog says changed for them.

## 6. Every month

- Operating-system patches on the server: `sudo apt update && sudo apt upgrade`, then reboot outside business
  hours. The stacks start again by themselves; check Status afterwards.
- Dependency updates arrive as a new version of the application. Install it as above.
````

- [ ] **Step 4: Write the restore runbook**

`docs/runbook/restore.md`:

````markdown
# Runbook: backups and restore

## 1. What is backed up, and what is not

Every night at 23:30 the worker writes two files to the backup volume of the stack (`/data/backups`):

| File | Content |
|---|---|
| `db-YYYYMMDD-HHMMSS.dump.gpg` | The whole database |
| `files-YYYYMMDD-HHMMSS.tar.gz.gpg` | Every uploaded file (medical certificates stay encrypted inside it) |

Both are encrypted with `BACKUP_PASSPHRASE`. Fourteen days are kept. Each update also leaves a database dump in
`/data/backups/pre-update/` (the ten newest are kept).

**Not in the backup: the `.env` of the stack.** Keep it in the password safe. Without `BACKUP_PASSPHRASE` no
backup can be read; without `FILE_ENCRYPTION_KEY` the medical certificates inside a restored backup cannot be read.

**Known limit.** The backups are on the same server as the data. A fire, a theft or a failed disk loses both,
until an off-site destination is chosen (PRD, open item 4). Until then, copy the backup volume to an encrypted
external disk once a week and keep the disk in another building:

```bash
sudo rsync -a --delete "$(docker volume inspect -f '{{ .Mountpoint }}' <test or prod>_backup_data)/" /media/<disk>/iris-hr-<test or prod>/
```

## 2. See the backups

```bash
cd /opt/iris-hr/<test or prod>
scripts/server/compose.sh exec app ls -lh /data/backups /data/backups/pre-update
```

The Status page of the Administration workspace shows the time and size of the last backup and the space used.
A backup that failed three times in a row raises a notification to every System Administrator.

## 3. Restore a stack

This replaces the database and the files of the stack with those of a backup. Everything entered since that
backup is lost. The command takes a fresh backup of the current state first, so a wrong restore can be undone.

```bash
cd /opt/iris-hr/<test or prod>
scripts/server/restore.sh --replace                                   # the newest nightly pair
scripts/server/restore.sh --replace db-20261102-233000.dump.gpg files-20261102-233000.tar.gz.gpg
scripts/server/restore.sh --replace pre-update/<file>.dump.gpg        # a dump taken before an update: database only
```

It asks you to type the name of the stack (`test` or `prod`), then prints five steps and `Restore complete.`
About five minutes without service.

Afterwards: sign in, open Status, and tell HR which day the data is from.

## 4. Every quarter: prove that a backup restores

On the production stack, in the first week of January, April, July and October (the check changes nothing and the stack keeps running):

```bash
cd /opt/iris-hr/prod
scripts/server/restore.sh --check
```

Expected: `Restoring db-… into iris_restore_check_…`, one line per table with its number of rows, then
`Restore check passed`. The check restores into a scratch database, counts, and drops it; the stack keeps running.

The check proves the database. Once a year, prove the whole path, files included, on the test stack with production's backup:

1. Copy the newest pair from the production backup volume into the test backup volume.
2. Put production's `BACKUP_PASSPHRASE` and `FILE_ENCRYPTION_KEY` in the test stack's `.env` for the duration of the test, and restart it: `scripts/server/compose.sh up -d`.
3. `scripts/server/restore.sh --replace <db file> <files file>` on the test stack.
4. Sign in as HR on the test stack, open an employee's record and download a medical certificate: it must open.
5. Put the test stack's own two values back in its `.env` and reinstall it (`install.md`, from section 4).

Record each test:

| Date | Stack | Backup file | Result | By |
|---|---|---|---|---|
| | | | | |

## 5. When there is no recent backup

Status shows the backup job among the failures, or a last backup older than a day.

```bash
scripts/server/compose.sh logs --tail 100 worker
scripts/server/compose.sh exec app python manage.py backup_now
scripts/server/compose.sh exec app df -h /data/backups
```

- `BACKUP_PASSPHRASE is empty`: the variable is missing from `.env`. Put it back from the password safe.
- `No space left on device`: the volume is full. Fourteen days of backups of this system need a few gigabytes; find what else filled the disk.
- `pg_dump failed`: the database is not answering; `scripts/server/compose.sh ps` and the logs of `db`.

## 6. The server is lost

1. Install a new server and a stack with `install.md`, sections 1 to 4, using the `.env` from the password safe.
2. Copy the newest pair of backup files from the external disk into the new stack's backup volume.
3. `scripts/server/restore.sh --replace <db file> <files file>`.
4. `install.md`, sections 5 and 6.

What was entered after the last backup that left the building is lost. That is the recovery point of this
installation until an off-site destination exists.
````

- [ ] **Step 5: Write the administrator guide**

`docs/guides/administrator.md`:

````markdown
# Guide for the System Administrator

You keep the platform running and decide who can sign in. You do not see requests, balances, documents or any
detail of an employee beyond their name and professional address: the Administration workspace holds none of it,
and the application refuses it to your role.

## What you open every morning: Status

| Block | What it tells you | What to do |
|---|---|---|
| Health | One line when everything works; otherwise which part fails (application, database, background jobs), with the version and the environment | See "When something is wrong" below |
| Accounts needing attention | Locked accounts; temporary passwords never used or expired; employees with no account yet | Unlock, reset, or create the account |
| Scheduled work | Each job, its last run and its result; failures first | A job that failed three times in a row also sends you a notification |
| Backup | Time and size of last night's backup, space used | Older than a day: `docs/runbook/restore.md`, section 5 |

## Create an account

1. Status or Accounts, then "Create account".
2. Choose the employee from the list of employees who have none. Their name and professional address come from
   the record HR entered. For an administrator who is not an employee, type a name and an address instead.
3. Tick the roles, if any (see below), and create.
4. The temporary password is shown **once**. Hand it over in person. It expires after 24 hours; the person must
   choose their own password at first sign-in.

Only addresses ending in `@impactrisks.com` are accepted.

## Roles

| Role | Give it to | Effect |
|---|---|---|
| HR | The HR Responsible and anyone IRIS names | The HR desk: all employees, all requests, medical certificates, settings |
| Executive Management | The CEO and the Deputy CEO | Overview: everything in read-only, except medical content; the security log |
| System Administrator | The technical maintainer | This workspace |

Employee and Manager are never given by hand: an account linked to an employee record is an employee, and
whoever has people reporting to them, or stands in for such a person, is a manager.

One account cannot be both HR and System Administrator. You cannot change your own roles, reset or disable your
own account, and the last administrator cannot be removed: ask another administrator.

## Passwords and locked accounts

- **Forgotten password.** Open the account, "Reset password", hand over the new temporary password in person.
  The person is told at next sign-in that their password was reset, and by whom. There is no "forgot password"
  link: you are the only way.
- **Locked account.** Five wrong passwords lock an account for 15 minutes. It unlocks by itself; "Unlock" does it
  at once. Ask the person first whether the attempts were theirs. The security log shows the address they came from.
- **Someone leaves.** HR records the departure; the account is disabled at that moment and every session of the
  person ends. You have nothing to do.
- **Disable an account** yourself only for an account with no employee record, or in an emergency.

## Parameters

| Parameter | Default | Meaning |
|---|---|---|
| Inactivity limit | 120 minutes | A session ends after this long without activity, and when the browser closes |
| Failed attempts before lock-out | 5 | |
| Lock-out duration | 15 minutes | Also the window of the per-address limit |
| Failed attempts per network address | 20 | Sign-in is refused from an address that failed this often in the window |
| Temporary-password lifetime | 24 hours | |
| Maximum upload size | 10 MB | |
| Accepted file types | PDF, JPG, PNG | |

Each line shows who changed it last and when. Every change is in the security log with the value before and after.

## Security log

Sign-ins, failed sign-ins, lock-outs, sign-outs, password changes and resets, accounts created and disabled,
role changes, parameter changes; each with the account, the time and the network address. Filter by period,
account and kind of event; a column header sorts; "Export" downloads what is shown. Executive Management reads
the same log.

Look at it when Status lists a locked account, and once a week for failed sign-ins from an address you do not know.

## When something is wrong

| You see | Do |
|---|---|
| Health: background jobs fail | On the server: `scripts/server/compose.sh logs --tail 100 worker`, then `scripts/server/compose.sh restart worker` |
| Health: database fails | `scripts/server/compose.sh ps`; the logs of `db`; the disk may be full: `df -h` |
| The page "being updated" outside an update | `scripts/server/compose.sh ps`, then `scripts/server/compose.sh up -d` |
| A user quotes a reference from "Something went wrong" | You received a notification with the same reference; search the logs for it: `scripts/server/compose.sh logs app \| grep <reference>` |
| No backup since yesterday | `docs/runbook/restore.md`, section 5 |

## Your recurring tasks

| When | What | Where |
|---|---|---|
| Every morning | Status | Administration |
| Every week | Failed sign-ins in the security log; copy of the backup volume to the external disk | `docs/runbook/restore.md`, section 1 |
| Every month | Operating-system patches; the new version of the application if there is one | `docs/runbook/update.md` |
| Every quarter | Restore test | `docs/runbook/restore.md`, section 4 |

## What you can technically reach, and must not

With a shell on the server you could read the database. The application cannot prevent that. Server logins are
personal and recorded by the operating system; the key that decrypts medical certificates is kept apart from the
data. Never copy the database or the backups off the server except as the restore runbook says.
````

- [ ] **Step 6: Write the HR guide**

`docs/guides/hr.md`:

````markdown
# Guide for HR

The HR desk is your workspace. Your own leave, balance and profile are in My space, like everyone's. You never
decide your own request: another HR holder does, or an executive when you are the only one.

## Every day: the desk

| Queue | What is in it | What you do |
|---|---|---|
| To validate | Requests the manager approved (and sick leaves, which come to you directly) | Approve, refuse with a reason, or send back with a comment |
| Certificates | Sick leaves with no certificate: overdue, and due soon | Attach the certificate the employee gave you; or count the days as annual leave; or refuse |
| Stuck with a manager | Requests a manager has not decided after four working days, or whose manager cannot act | Record the decision the manager gave you; give the step to someone else; name a delegate for that manager |
| Profile changes | Changes employees propose to their own details | Accept or refuse; the record changes when you accept |

A queue with nothing in it says so in one line. No request is ever approved by the passing of time.

## Validate a request

The line shows who, the type, the dates, the count and the state of the document. Opening it shows the balance
now and after, the manager's decision and comment, and the files. The check against the balance is made again
at the moment you approve.

- **Approve**: the request is final. Annual leave is deducted from the balance, one line per month it touches.
- **Refuse**: a reason is required; the employee reads it.
- **Send back**: a comment is required; the employee corrects and sends again, and the steps start over.

## Sick leave

The employee declares, on the day or afterwards. The manager is informed and decides nothing. The certificate is
due 48 hours after the declaration; the employee is reminded 12 hours before, and you are told when it is overdue.
The comment and the certificate are seen by the employee and by HR only: not the manager, not executives, and they
appear in no notification, report or export.

- **Count as annual leave** turns the whole declaration into annual leave. The balance is checked; if it is short
  you may allow an exception with a reason.
- An extension is a new declaration that follows the first.

## When the decision was given outside the system

Open the request, "Record a decision made outside the system": who decided (the manager by default), the outcome,
when, how (verbally or on paper), a note (required), and the scan of the signed form if there is one. The history
shows that you recorded it and for whom.

## Enter a request for an employee

Requests, "New request for an employee". Choose the employee, then the form is theirs. "Allow an exception", with
a reason, lifts the balance, the weekly limit, the days of an event and the rule on past dates. The request then
follows its normal steps.

## Correct, shorten or cancel

Any request, even one that has started or ended: open it, "Correct, shorten or cancel", give the new dates or
cancel, and a reason (required). The employee and the manager are told. Days given back return to the balance.

## Employees

- **New employee**: number, name, professional address (`@impactrisks.com`), department, position, manager,
  contract. Enter managers before the people who report to them. Then tell the System Administrator, who creates
  the account; the Status page of the administrator lists employees with no account.
- **Documents**: add a file to the record and choose whether the employee sees it.
- **A departure**: "Record a departure", with the leaving date and a reason. The page lists what follows before you
  confirm: the account is disabled, no credit is posted after the leaving date, requests left open, and the people
  who need a new manager. A record is never deleted; people who left are found with the filter "left".

## Balances

The balance is the sum of the lines of the history: opening balance, month-end credits, leave taken, days given
back, your adjustments. Nothing is ever edited or deleted; a correction is a new line with its reason.

- **Opening balance**: once per employee, on their record, dated the day before the system starts counting.
- **Month-end credit**: 2.5 days on the last day of each month, pro-rated in the month someone joins or leaves,
  rounded to the nearest half day. It starts from the date in Settings, Parameters, "credits start on".
- **Adjust**: days to add or remove, a date, a reason. The employee is told and sees the line.

## The KPMG export

Reports, "KPMG export". The period is the month, or the payroll period if a cut-off day is set. One Excel file,
one line per employee: number, name, department, days of annual, sick and exceptional leave, permission hours,
remote days, annual balance at the end of the period, meal tickets.

- Only approved requests count; a request that crosses the period counts only for the days inside it.
- Meal tickets: 21 per month, less one for each full day of annual, sick or exceptional leave. Half-days and
  remote days do not reduce them.
- The file holds no comment and nothing medical. Each export is written in the activity log.

## Reports and the activity log

Six reports: absences taken, balances at a date, requests waiting, permission hours by month, remote days by
month, certificates outstanding. Each has its filters and an Excel export of what is shown. The activity log
shows who did what, on what and when, with the values before and after; the content of a sick-leave comment
appears only as "changed".

## Settings

| Subject | Note |
|---|---|
| Request types | A change applies to requests sent afterwards. A type in use is deactivated, not removed |
| Steps of a type | Who acts at each step, and after how many working days a reminder and an alert are sent. At least one step must decide |
| Exceptional-leave events | Name in both languages, days allowed, whether a proof is required |
| Public holidays | By year. "Copy to next year" copies the fixed dates. Changing a holiday does not change requests already approved: the page lists them, and you correct them |
| Parameters | Monthly credit, working days, certificate deadline and warning, meal tickets per month, payroll cut-off day, the date credits start on |
| Departments and positions | An item in use is deactivated, not removed |

## Each December

Enter next year's public holidays (copy the fixed ones, add the others), before employees plan January.
````

- [ ] **Step 7: Write the employee guide, in French and in English**

The two files have the same twelve sections, in the same order. `docs/guides/employee.fr.md`:

````markdown
# Guide de l'employé

La plateforme RH d'IRIS remplace le fichier Excel et le formulaire papier. Elle est accessible depuis le réseau
du bureau, sur ordinateur et sur téléphone.

## Se connecter

Votre identifiant est votre adresse professionnelle `@impactrisks.com`. L'administrateur système vous remet un
mot de passe temporaire, valable 24 heures : à la première connexion, vous choisissez le vôtre (12 caractères au
moins). Mot de passe oublié ou compte verrouillé : adressez-vous à l'administrateur système. La session se ferme
après deux heures sans activité et à la fermeture du navigateur.

## Votre espace

« Mon espace » s'ouvre sur votre solde de congés, ce qui attend une action de votre part (« À faire »), vos
demandes en cours et vos prochaines absences. Le menu donne accès à vos demandes, au calendrier, au solde et à
votre profil. La langue (français ou anglais) se change dans le menu ; elle est mémorisée.

## Demander un congé ou une autre absence

« Nouvelle demande », puis le type : congé annuel, congé maladie, congé exceptionnel, permission (quelques
heures) ou télétravail. Vous indiquez les dates ; le nombre de jours ouvrés, votre solde avant et après, et les
personnes qui décideront sont calculés et affichés. « Envoyer » transmet la demande ; « Enregistrer pour plus
tard » la garde en brouillon. Si une règle n'est pas respectée (solde insuffisant, chevauchement, limite de
télétravail), le message dit laquelle et quoi faire.

## Suivre, modifier ou retirer une demande

Chaque demande dit où elle en est : « En attente de » votre responsable, puis des RH, puis « Approuvée ». Tant
que personne n'a décidé, vous pouvez la modifier ou la retirer. Après la décision du responsable, vous pouvez
encore la retirer. Une demande renvoyée revient vers vous avec un commentaire : corrigez-la et renvoyez-la. Une
demande approuvée qui n'a pas commencé se modifie ou s'annule par « Modifier les dates » ; l'ancienne reste
valable jusqu'à l'approbation du changement.

## Maladie et certificat

Déclarez l'absence le jour même ou après. Votre responsable est informé de l'absence, sans plus. Le certificat
médical peut être joint tout de suite ou dans les 48 heures : l'accueil vous le rappelle. Votre commentaire et
votre certificat ne sont vus que par les RH.

## Votre solde

2,5 jours sont ajoutés le dernier jour de chaque mois ; le solde se reporte d'une année sur l'autre. La page
« Solde » montre le solde du jour, les jours des demandes en attente, les congés approuvés à venir, le prochain
crédit et l'historique ligne par ligne.

## Le calendrier

Il montre les jours fériés, vos demandes, et les collègues de votre département indiqués « Absent » ou
« Télétravail », sans le motif. Depuis un jour ouvré, vous pouvez commencer une demande pour ce jour.

## Votre profil

Vous voyez vos informations et les documents que les RH partagent avec vous. Pour corriger vos coordonnées, votre
adresse ou votre contact d'urgence : « Proposer une modification ». Le changement s'applique une fois accepté par
les RH.

## Notifications

La cloche indique ce qui s'est passé : demande approuvée, refusée, renvoyée, certificat à fournir, solde ajusté.
Il n'y a pas d'e-mail : ouvrez l'application pour suivre vos demandes.

## Si vous encadrez une équipe

« Mon équipe » liste les demandes à décider, avec le solde après et les collègues déjà absents ces jours-là :
approuver, refuser (motif obligatoire) ou renvoyer (commentaire obligatoire). Avant un congé, nommez un délégué
dans « Délégations » : il décidera à votre place pendant la période. Vous ne décidez jamais de votre propre
demande.

## Confidentialité

Vos collègues voient que vous êtes absent, jamais pourquoi. Votre responsable voit le type de vos demandes, pas
le détail d'un arrêt maladie. Les RH voient tout ; la direction voit tout sauf le contenu médical. Chaque
consultation d'un certificat médical est enregistrée.

## En cas de problème

Un message d'erreur donne une référence : communiquez-la à l'administrateur système. Si l'application affiche
« mise à jour en cours », réessayez dans quelques minutes.
````

`docs/guides/employee.en.md`:

````markdown
# Employee guide

The IRIS HR platform replaces the Excel file and the paper form. It is reached from the office network, on a
computer or a phone.

## Sign in

Your identifier is your professional address `@impactrisks.com`. The System Administrator gives you a temporary
password, valid for 24 hours: at your first sign-in you choose your own (12 characters at least). Forgotten
password or locked account: ask the System Administrator. The session ends after two hours without activity and
when the browser closes.

## Your space

"My space" opens on your leave balance, what is waiting for you ("Needs you"), your requests in progress and your
next absences. The menu leads to your requests, the calendar, the balance and your profile. The language (French
or English) is changed in the menu; it is remembered.

## Ask for leave or another absence

"New request", then the kind: annual leave, sick leave, exceptional leave, permission (a few hours) or remote
work. You give the dates; the number of working days, your balance before and after, and the people who will
decide are worked out and shown. "Send" submits the request; "Save for later" keeps it as a draft. When a rule is
not met (balance too low, overlap, remote-work limit), the message says which one and what to do.

## Follow, change or withdraw a request

Each request says where it stands: "Waiting for" your manager, then HR, then "Approved". Until somebody has
decided, you can edit it or withdraw it. After the manager's decision you can still withdraw it. A request sent
back returns to you with a comment: correct it and send it again. An approved request that has not started is
changed or cancelled with "Change dates"; the original stays valid until the change is approved.

## Sickness and certificate

Declare the absence on the day or afterwards. Your manager is told of the absence and nothing more. The medical
certificate can be attached at once or within 48 hours: the home page reminds you. Your comment and your
certificate are seen by HR only.

## Your balance

2.5 days are added on the last day of each month; the balance carries over from year to year. The "Balance" page
shows today's balance, the days held by pending requests, approved leave still to come, the next credit and the
history line by line.

## The calendar

It shows public holidays, your requests, and the colleagues of your department marked "Absent" or "Remote",
without the reason. From a working day you can start a request for that day.

## Your profile

You see your details and the documents HR shares with you. To correct your contact details, your address or your
emergency contact: "Propose a change". The change applies once HR accepts it.

## Notifications

The bell shows what happened: request approved, refused, sent back, certificate due, balance adjusted. There is no
email: open the application to follow your requests.

## If you manage a team

"My team" lists the requests to decide, with the balance after and the colleagues already away on those days:
approve, refuse (a reason is required) or send back (a comment is required). Before a leave, name a delegate in
"Delegations": they decide in your place during that period. You never decide your own request.

## Privacy

Your colleagues see that you are away, never why. Your manager sees the kind of your requests, not the detail of
a sick leave. HR sees everything; executive management sees everything except medical content. Every time a
medical certificate is opened, it is recorded.

## If something goes wrong

An error message gives a reference: quote it to the System Administrator. If the application says "being updated",
try again in a few minutes.
````

- [ ] **Step 8: Write the record of decisions**

`docs/decisions.md`:

````markdown
# Record of decisions

The specification (`docs/superpowers/specs/`) holds the decisions taken before the build, in its section 14.
This file holds every decision taken since. Add a line when a rule, a default, a route or a screen is decided
or changed; never rewrite an old line, add a new one that replaces it.

## How to add a decision

| Field | Content |
|---|---|
| # | The next number |
| Date | The day it was decided |
| Decision | One sentence, in the present tense |
| Why | The reason, and what was set aside |
| Decided by | A name |
| Replaces | The number of the line it replaces, if any |

## Decisions taken while planning the build (2026-10-06)

The master plan, section 3, gives each of these with its reason.

| # | Decision |
|---|---|
| D1 | The repository is the project folder, beside its documents |
| D2 | Ten plans; steps 1 and 3 are split into backend and frontend |
| D3 | Notifications are built in step 1 |
| D4 | Delegation belongs to the organisation module and is built in step 2 |
| D5 | Attachments are a module of their own, linked from their owners |
| D6 | The account-to-employee link is stored on the employee |
| D7 | Columns added to the data model of the specification |
| D8 | The audit trail and the ledger are protected by database triggers |
| D9 | Server messages come from a catalogue in two languages; notifications are written on the server |
| D10 | The certificate deadline is the type's, else the HR parameter |
| D11 | Month-end credits start from a date HR sets |
| D12 | A half-day on a day that is not worked is refused |
| D13 | A manager who exists but cannot act leaves the step waiting, flagged to HR at once |
| D14 | Not signed in: 401. Role not allowed: 403. Outside one's reach: 404 |
| D15 | Five variables added to `.env.example` |
| D16 | Twenty failed sign-ins per network address per lock-out window |
| D17 | Counting a sick leave as annual leave converts the whole request; it stays confidential |
| D18 | A change waiting for approval reserves only the days it adds |
| D19 | Home screens and switcher counts are served by the reports module |
| D20 | The development stack runs in Docker; browser tests run on the host |
| D21 | A draft never sent is deleted when discarded |
| D22 | Changing a public holiday does not recompute approved requests |
| D23 | Layout follows the design tokens; the design canvas is not in the repository |
| D24 | Managers and HR can list the names of active employees when choosing a delegate |
| D25 | The HR desk and the manager's queue are built in step 3 |

## Decisions taken while building

Each plan ends with "Contract notes". The notes below change what a person sees or what KPMG receives, and are
repeated here so that they are found in one place. The number in brackets is the plan and its note.

| # | Decision | Source |
|---|---|---|
| B1 | Sign-in refusals answer 400 with their reason; 401 means only "no session" | 01a, note 9 |
| B2 | An administrator cannot reset, disable or change the roles of their own account; the last administrator cannot be removed | 01a, note 12 |
| B3 | Administrators are told of a failing job after its third failure in a row, once per job per day | 01a, note 14 |
| B4 | Executive Management and System Administrator may be held together; only HR and System Administrator may not | 01a, note 30 |
| B5 | The version in use on a server is recorded by the update, not written to `.env`; operators use `scripts/server/compose.sh` | 01b, note 15 |
| B6 | A delegation is not transitive | 02, note 5 |
| B7 | An HR holder cannot decide their own profile change | 02, note 6 |
| B8 | A draft is seen and edited only by the account that created it | 03a, note 17 |
| B9 | HR may decide a manager's step itself once it is flagged | 03a, note 19 |
| B10 | When every step of a chain only informs or is skipped, an HR step is added so that a person decides | 03a, note 20 |
| B11 | A change to an approved request is approved or refused, never sent back | 03a, note 11 |
| B12 | Discarding a draft and withdrawing a request can be undone for five seconds | 03b, note 12 |
| B13 | What is typed in a request form is kept in the browser tab until the request is saved | 03b, note 13 |
| B14 | The right to a month's credit follows the dates of employment, not the status on the last day | 04, note 5 |
| B15 | A credit of exactly a quarter day rounds up | 04, note 7 |
| B16 | One opening balance per employee; it may be zero or negative | 04, note 8 |
| B17 | In the department calendar, a person's own entries show full detail | 05, note 7 |
| B18 | Which request type feeds which column of the KPMG file | 06, note 6 |
| B19 | Meal tickets: a full day is lost when half-days of reducing types add up to one; joiners and leavers get the full base | 06, notes 7 and 8 |
| B20 | With a cut-off day, the default export period ends on this month's cut-off | 06, note 9 |
| B21 | The Overview workspace has five reports; the certificates report is HR's | 06, note 11 |

## Decisions taken during hardening (plan 07)

| # | Decision | Why |
|---|---|---|
| H1 | Nobody acts on their own request through any HR action, reassignment included | PRD 3 says "in any role"; plan 03a had not listed reassignment |
| H2 | Every paginated list takes a whitelisted `ordering`; the four large tables sort from their headers; queues and histories keep their own order on screen | PRD 9.3 and UI 3.4 ask for sortable lists; a queue's order is its meaning |
| H3 | The calendar feed carries HR's working week and the page follows it | The page assumed Saturday and Sunday |
| H4 | A day chosen on the calendar fills the request form (`?start=`, `?end=`) | UI 5.7 |
| H5 | The nightly backup is two GnuPG files (AES-256) in the backup volume, 14 days kept; pre-update dumps are kept apart and never pruned by the nightly job | PRD 12.7 |
| H6 | Browser tests run on one engine per run (Chromium, Firefox, Edge); the phone viewport is Chromium's | The journeys of a run share one database |
| H7 | Performance is measured through the proxy on the office server with 100 loaded employees and 20 sessions | NFR-01, NFR-02 |

## Waiting for the project owner

| Subject | Where it is described |
|---|---|
| Sponsor agreement to approval inside the system | PRD, open item 1 |
| The file HR sends KPMG today; then B18, B19, B20 | PRD, open item 2; plan 06, note 21 |
| Exceptional-leave events and their days; public holidays; confirmation of the credit, remote-work and meal-ticket rules | PRD, open item 3 |
| An off-site destination for backups | PRD, open item 4; `docs/runbook/restore.md`, section 1 |
| Declaration to the regulator; legal check of keeping archived data indefinitely | PRD, open item 6 |
| A company certificate for the internal name | PRD, open item 7; `docs/runbook/install.md`, section 5 |
| B4: whether an executive may also be an administrator | 01a, note 30 |
````

- [ ] **Step 9: Add the release to the changelog and the documents to the README**

Append to `CHANGELOG.md`, after the last entry:

```markdown
## v1.0.0

The first release: build steps 1 to 7 of the specification.

- Employee records, departments, positions, documents, profile changes decided by HR, departures.
- Five request types (annual, sick, exceptional leave, hourly permission, remote work) through configurable
  approval steps: line manager, then HR; delegation; decisions recorded on behalf; changes after approval.
- Annual-leave balance as a ledger: opening balance, month-end credit, leave taken, days given back, adjustments.
- Department calendar, a home for each role, in-app notifications.
- Six reports and the KPMG export; activity log and security log.
- Nightly encrypted backup with a restore command; `scripts/server/restore.sh`.
- Every paginated list can be sorted; the calendar follows HR's working week.
- French and English throughout; checked for WCAG 2.1 AA on every page; Chrome, Edge and Firefox.

No new variable in `.env` since v0.1.0 unless an entry above says so.
```

Read the entries the earlier plans added between `v0.1.0` and this one. If one of them introduced a variable in `.env.example`, replace the last line by the list of those variables: an operator reads this entry before updating (`docs/runbook/update.md`, section 1).

Append to `README.md`:

```markdown
## Documents

| For | Document |
|---|---|
| Installing a stack | `docs/runbook/install.md` |
| Updating a stack | `docs/runbook/update.md` |
| Backups and restore | `docs/runbook/restore.md` |
| The System Administrator | `docs/guides/administrator.md` |
| HR | `docs/guides/hr.md` |
| Every employee | `docs/guides/employee.fr.md`, `docs/guides/employee.en.md` |
| What was decided, and why | `docs/superpowers/specs/` (before the build), `docs/decisions.md` (since) |
| Who may call what | `docs/permission-matrix.md` |
| Checking the interface | `docs/ui-audit.md` |
| Versions | `CHANGELOG.md` |
```

- [ ] **Step 10: Run the check and commit**

Run: `bash scripts/tests/docs.test.sh`

Expected: every line starts with `ok`, ending with `docs.test.sh: all passed`. A line `a runbook names scripts/server/<name>.sh, which does not exist` means the runbook and the scripts disagree: correct the runbook to the script's real name.

```bash
git add scripts/tests/docs.test.sh docs/runbook docs/guides docs/decisions.md CHANGELOG.md README.md
git update-index --chmod=+x scripts/tests/docs.test.sh
git commit -m "docs: runbook, guides for the administrator, HR and employees, decisions, changelog of v1.0.0"
```

### Task 16: The production stack and the server's hardening

**Files:**
- Create: `scripts/server/harden-check.sh`
- Create: `scripts/server/tests/harden-check.test.sh`
- Modify: `CHANGELOG.md` (the entry of the release candidate `v0.9.0`)
- Modify: `.github/workflows/ci.yml` (run the new script test where plan 01b runs the others)

**Interfaces:**
- Consumes: `scripts/server/lib.sh` (`ROOT`, `ENV_FILE`, `log`, `env_value`, `compose`, `require_server_stack`), `update.sh`, `compose.sh` (plan 01b); `check-headers.sh` (Task 7); `restore.sh` (Task 5); `docs/runbook/install.md` (Task 15); the `Release` workflow, which publishes the two images on a tag `vX.Y.Z` (plan 01b).
- Produces: `scripts/server/harden-check.sh` (exit 0 when no check fails); a production stack in `/opt/iris-hr/prod` running `v0.9.0`, beside the test stack in `/opt/iris-hr/test`, each with its own `.env`, volumes, address and ports (PRD 12.2).

The owner's go-ahead is needed for this task: it creates the stack that will hold real data. It also needs the server, the internal name and, if there is one, the certificate of PRD open item 7.

- [ ] **Step 1: Write the failing test of the check script**

`scripts/server/tests/harden-check.test.sh`, in the form of plan 01b's script tests:

```bash
#!/usr/bin/env bash
# Tests the parts of scripts/server/harden-check.sh that do not need a real server:
# the .env rules. Run: bash scripts/server/tests/harden-check.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$HERE/../harden-check.sh"

failures=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
is() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got '$2', expected '$3')"; fi; }
contains() { if grep -q -- "$3" <<<"$2"; then pass "$1"; else fail "$1"; fi; }
lacks() { if grep -q -- "$3" <<<"$2"; then fail "$1"; else pass "$1"; fi; }

# The rules on file modes need a file system that has them (Linux, the pipeline). Git Bash on Windows has none.
probe="$(mktemp)"; chmod 600 "$probe"
if [ "$(stat -c '%a' "$probe" 2>/dev/null)" != "600" ]; then
  rm -f "$probe"
  echo "skipped: this file system has no permission bits; the pipeline runs this test on Linux"
  exit 0
fi
rm -f "$probe"

new_box() {
  BASE="$(mktemp -d)"
  BOX="$BASE/prod"
  mkdir -p "$BOX/bin" "$BASE/test"
  printf '%s\n' \
    'COMPOSE_PATH_SEPARATOR=:' 'COMPOSE_FILE=compose.yaml:compose.server.yaml' 'ENVIRONMENT=production' \
    'APP_VERSION=v0.9.0' 'SITE_HOSTNAME=hr.impactrisks.lan' 'DJANGO_ALLOWED_HOSTS=hr.impactrisks.lan' \
    'HTTPS_PORT=443' 'HTTP_PORT=80' 'DJANGO_SECRET_KEY=prod-secret-0123456789abcdef0123456789abcdef' \
    'POSTGRES_PASSWORD=prod-database-password' 'FILE_ENCRYPTION_KEY=prod-file-key-0123456789' 'BACKUP_PASSPHRASE=prod-passphrase-0123456789' \
    > "$BOX/.env"
  chmod 600 "$BOX/.env"
  printf '%s\n' \
    'DJANGO_SECRET_KEY=change-me' 'POSTGRES_PASSWORD=change-me' 'FILE_ENCRYPTION_KEY=change-me' 'BACKUP_PASSPHRASE=change-me' \
    > "$BOX/.env.example"
  sed -e 's/prod-/test-/g' -e 's/ENVIRONMENT=production/ENVIRONMENT=test/' -e 's/=443/=8443/' -e 's/=80$/=8080/' \
      -e 's/hr.impactrisks.lan/hr-test.impactrisks.lan/g' "$BOX/.env" > "$BASE/test/.env"
  chmod 600 "$BASE/test/.env"
}
# Only the .env rules are run: the checks of the machine itself are skipped with IRIS_ENV_ONLY=1.
run_check() { IRIS_ROOT="$BOX" IRIS_ENV_ONLY=1 bash "$CHECK" 2>&1; }

# 1. A sound .env passes.
new_box
out="$(run_check)"; code=$?
is "a sound .env: exit code 0" "$code" "0"
lacks "a sound .env: no failure" "$out" "^FAIL"
rm -rf "$BASE"

# 2. A .env that others can read fails.
new_box
chmod 644 "$BOX/.env"
out="$(run_check)"; code=$?
is "a readable .env: exit code 1" "$code" "1"
contains "a readable .env: says so" "$out" "FAIL  .env is readable by others"
rm -rf "$BASE"

# 3. A value left as in .env.example fails, and the value is not printed.
new_box
sed -i 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=change-me/' "$BOX/.env"
out="$(run_check)"; code=$?
is "an example value: exit code 1" "$code" "1"
contains "an example value: names the variable" "$out" "FAIL  POSTGRES_PASSWORD still has the value of .env.example"
lacks "an example value: never prints a secret" "$out" "prod-secret"
rm -rf "$BASE"

# 4. A secret shared with the other stack fails.
new_box
sed -i 's/^FILE_ENCRYPTION_KEY=.*/FILE_ENCRYPTION_KEY=test-file-key-0123456789/' "$BOX/.env"
out="$(run_check)"; code=$?
is "a shared secret: exit code 1" "$code" "1"
contains "a shared secret: names the variable" "$out" "FAIL  FILE_ENCRYPTION_KEY is the same in the stack 'test'"
rm -rf "$BASE"

# 5. Allowed hosts that differ from the site name fail; so does a development environment.
new_box
sed -i 's/^DJANGO_ALLOWED_HOSTS=.*/DJANGO_ALLOWED_HOSTS=*/' "$BOX/.env"
sed -i 's/^ENVIRONMENT=.*/ENVIRONMENT=development/' "$BOX/.env"
out="$(run_check)"; code=$?
is "wrong hosts and environment: exit code 1" "$code" "1"
contains "wrong hosts: says so" "$out" "FAIL  DJANGO_ALLOWED_HOSTS must be exactly SITE_HOSTNAME"
contains "wrong environment: says so" "$out" "FAIL  ENVIRONMENT must be test or production"
rm -rf "$BASE"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "harden-check.test.sh: all passed"
```

Run: `bash scripts/server/tests/harden-check.test.sh`

Expected: lines starting with `FAIL` (`bash: …/harden-check.sh: No such file or directory`), ending with `check(s) failed`.

- [ ] **Step 2: Write the check script**

`scripts/server/harden-check.sh` (LF line endings, executable):

```bash
#!/usr/bin/env bash
# Checks how a stack and its server are set up (PRD section 10 and 12.3).
# It reads; it changes nothing and prints no secret.
#
# Usage: scripts/server/harden-check.sh        run in the stack directory, as the service account
# Exit:  0 no check failed   1 at least one failed
# Lines: "ok" passed, "FAIL" must be fixed, "hand" cannot be read from here and must be checked by a person.
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

FAILED=0
ok() { echo "ok    $1"; }
bad() { echo "FAIL  $1"; FAILED=1; }
hand() { echo "hand  $1"; }

SECRETS="DJANGO_SECRET_KEY POSTGRES_PASSWORD FILE_ENCRYPTION_KEY BACKUP_PASSPHRASE"

value_in() { # file, name
  sed -e 's/\r$//' "$1" | { grep -E "^$2=" || true; } | tail -n 1 | cut -d= -f2-
}

check_env() {
  local mode name mine other stack
  [ -f "$ENV_FILE" ] || { bad "there is no .env in $ROOT"; return; }

  mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo unknown)"
  case "$mode" in
    600 | 400) ok ".env is readable by its owner only" ;;
    *) bad ".env is readable by others (mode $mode); run: chmod 600 .env" ;;
  esac
  if git -C "$ROOT" ls-files --error-unmatch .env >/dev/null 2>&1; then bad ".env is tracked by git"; else ok ".env is not in git"; fi

  case "$(env_value COMPOSE_FILE)" in
    *compose.server.yaml*) ok "COMPOSE_FILE names compose.server.yaml" ;;
    *) bad "COMPOSE_FILE does not name compose.server.yaml" ;;
  esac
  case "$(env_value ENVIRONMENT)" in
    test | production) ok "ENVIRONMENT is $(env_value ENVIRONMENT)" ;;
    *) bad "ENVIRONMENT must be test or production" ;;
  esac
  if [ "$(env_value DJANGO_ALLOWED_HOSTS)" = "$(env_value SITE_HOSTNAME)" ] && [ -n "$(env_value SITE_HOSTNAME)" ]; then
    ok "DJANGO_ALLOWED_HOSTS is SITE_HOSTNAME"
  else
    bad "DJANGO_ALLOWED_HOSTS must be exactly SITE_HOSTNAME"
  fi

  for name in $SECRETS; do
    mine="$(env_value "$name")"
    if [ -z "$mine" ]; then bad "$name is empty"; continue; fi
    if [ -f "$ROOT/.env.example" ] && [ "$mine" = "$(value_in "$ROOT/.env.example" "$name")" ]; then
      bad "$name still has the value of .env.example"
      continue
    fi
    if [ "${#mine}" -lt 16 ]; then bad "$name is shorter than 16 characters"; continue; fi
    ok "$name is set"
    # No secret may be shared with another stack on this server.
    for other in "$ROOT"/../*/.env; do
      [ -f "$other" ] || continue
      [ "$(cd "$(dirname "$other")" && pwd)" = "$ROOT" ] && continue
      stack="$(basename "$(dirname "$other")")"
      if [ "$mine" = "$(value_in "$other" "$name")" ]; then bad "$name is the same in the stack '$stack'"; fi
    done
  done
}

check_machine() {
  local file exposed
  if [ "$(id -u)" = "0" ]; then bad "this is run as root; use the service account"; else ok "run as $(id -un), not root"; fi
  if id -nG | tr ' ' '\n' | grep -qx docker; then ok "the account is in the docker group"; else bad "the account is not in the docker group"; fi

  for file in "$HOME/.git-credentials" "$HOME/.docker/config.json"; do
    [ -f "$file" ] || continue
    case "$(stat -c '%a' "$file")" in
      600 | 400) ok "$file is readable by its owner only" ;;
      *) bad "$file is readable by others; run: chmod 600 $file" ;;
    esac
  done

  if lsblk -o TYPE 2>/dev/null | grep -q crypt; then ok "a disk is encrypted (LUKS)"; else bad "no encrypted disk found: full-disk encryption is required"; fi

  if grep -Eqs '^\s*PermitRootLogin\s+no' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf; then
    ok "root cannot sign in over SSH"
  else
    bad "PermitRootLogin is not 'no' in the SSH configuration: logins must be personal"
  fi
  if grep -Eqs '^\s*PasswordAuthentication\s+no' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf; then
    ok "SSH accepts keys only"
  else
    hand "SSH still accepts passwords; prefer keys (PasswordAuthentication no)"
  fi

  if command -v ufw >/dev/null 2>&1 && sudo -n ufw status 2>/dev/null | grep -q '^Status: active'; then
    ok "the firewall is active"
    hand "read 'sudo ufw status': ports $(env_value HTTPS_PORT) and $(env_value HTTP_PORT) open to the office network only, SSH to the administrators' addresses only"
  else
    hand "the firewall could not be read without a password; run 'sudo ufw status' and check that it is active and limited to the office network"
  fi

  exposed="$(compose ps --format '{{.Service}} {{.Ports}}' 2>/dev/null | grep -v '^proxy ' | grep -- '->' || true)"
  if [ -z "$exposed" ]; then ok "only the proxy publishes ports"; else bad "a container other than the proxy publishes a port: $exposed"; fi

  if compose exec -T app sh -c 'ls /data/backups/db-*.dump.gpg >/dev/null 2>&1'; then
    ok "at least one nightly backup exists"
  else
    bad "no nightly backup yet; run: scripts/server/compose.sh exec app python manage.py backup_now"
  fi

  hand "the .env of this stack is in the password safe, apart from this server"
  hand "the operating system installs security updates (unattended-upgrades), and the last reboot is less than a month old: $(uptime -s 2>/dev/null || echo unknown)"
}

check_env
if [ "${IRIS_ENV_ONLY:-}" != "1" ]; then
  require_server_stack
  check_machine
fi

echo
if [ "$FAILED" -eq 0 ]; then echo "No check failed. Read the 'hand' lines."; else echo "At least one check failed."; fi
exit "$FAILED"
```

Run: `bash scripts/server/tests/harden-check.test.sh`

Expected: twelve lines starting with `ok`, then `harden-check.test.sh: all passed`. On Windows the test prints `skipped: this file system has no permission bits` instead; run it in the app container (`docker compose run --rm --no-deps -v "${PWD}/scripts:/scripts:ro" app bash /scripts/server/tests/harden-check.test.sh`) to see the twelve lines.

```bash
git add scripts/server/harden-check.sh scripts/server/tests/harden-check.test.sh
git update-index --chmod=+x scripts/server/harden-check.sh scripts/server/tests/harden-check.test.sh
git ls-files --eol scripts/server/harden-check.sh
```

Expected: the line starts with `i/lf`. Append `bash scripts/server/tests/harden-check.test.sh` to the step of `.github/workflows/ci.yml` that runs the script tests of plan 01b.

- [ ] **Step 3: Publish a release candidate**

Everything built so far is published as `v0.9.0`, so the server can install it. `v1.0.0` is tagged after the rehearsal (Task 17).

Add to `CHANGELOG.md`, above the entry `## v1.0.0` written in Task 15:

```markdown
## v0.9.0

Release candidate of 1.0.0, installed for the go-live rehearsal. Same content as v1.0.0 below, before the
corrections of the rehearsal.
```

```bash
docker compose run --rm app pytest -q
docker compose run --rm web npx vitest run
git add CHANGELOG.md .github/workflows/ci.yml scripts/server
git commit -m "chore: release candidate v0.9.0"
git push
git tag v0.9.0
git push origin v0.9.0
gh run watch
```

Expected: both test runs pass before the tag; the `Release` workflow ends green and the registry holds `iris-hr-backend:v0.9.0` and `iris-hr-proxy:v0.9.0`.

- [ ] **Step 4: Bring the test stack to the release candidate**

On the server:

```bash
cd /opt/iris-hr/test
scripts/server/update.sh v0.9.0
scripts/server/check-headers.sh "https://$(grep '^SITE_HOSTNAME=' .env | cut -d= -f2):8443" 8080
```

Expected: `Update to v0.9.0 complete.`, then every line of the header check starts with `ok` and it ends with `All checks passed.` A `FAIL` line is fixed in `proxy/Caddyfile` or `compose.server.yaml`, tested with `bash proxy/tests/smoke.sh`, and published as `v0.9.1` before going on.

- [ ] **Step 5: Create the production stack**

Follow `docs/runbook/install.md`, sections 1 to 8, with the production column of its table and the version `v0.9.0`. Use only the runbook: where a step is unclear or wrong, note it; Task 17 corrects the runbook.

Then check that the two stacks share nothing:

```bash
docker volume ls --format '{{.Name}}' | grep -E '^(test|prod)_' | sort
cd /opt/iris-hr/prod && scripts/server/compose.sh ps
cd /opt/iris-hr/test && scripts/server/compose.sh ps
```

Expected: six volumes or more, each name starting with `test_` or `prod_` (`db_data`, `files_data`, `backup_data` for each, and the proxy's own); in each stack `app`, `db`, `proxy` and `worker` are running; production's proxy publishes 443 and 80, the test stack's 8443 and 8080.

- [ ] **Step 6: Run the hardening check on both stacks**

```bash
cd /opt/iris-hr/prod && scripts/server/harden-check.sh
cd /opt/iris-hr/test && scripts/server/harden-check.sh
scripts/server/check-headers.sh "https://$(grep '^SITE_HOSTNAME=' /opt/iris-hr/prod/.env | cut -d= -f2)" 80
```

Expected: `No check failed. Read the 'hand' lines.` for each stack, and `All checks passed.` for production's headers. Fix every `FAIL` on the server (it is configuration, not code) and run the check again.

Go through the `hand` lines with the person responsible for the office network, and record the result here:

| Check | Production | Test | Checked by, date |
|---|---|---|---|
| Firewall active; the two ports of each stack open to the office network only | [ ] | [ ] | |
| SSH limited to named administrators, by key | [ ] | [ ] | |
| Full-disk encryption (the `ok` line above) | [ ] | [ ] | |
| The `.env` of each stack is in the password safe | [ ] | [ ] | |
| Security updates of the operating system are installed automatically | [ ] | n/a | |
| From a machine outside the office network, the address does not answer | [ ] | [ ] | |

- [ ] **Step 7: Commit what the server taught**

No file changes when nothing had to be corrected. Otherwise commit the corrections to `proxy/`, `compose.server.yaml` or `scripts/server/` with their tests:

```bash
git status --short
git commit -am "fix(server): <what the first production install showed>"
```

### Task 17: Go-live rehearsal and release 1.0.0

**Files:**
- Create: `docs/runbook/rehearsal.md`
- Modify: `docs/runbook/install.md`, `docs/runbook/update.md`, `docs/runbook/restore.md` (whatever the rehearsal shows to be wrong or missing)
- Modify: `CHANGELOG.md` (corrections of the rehearsal, under `v1.0.0`)

**Interfaces:**
- Consumes: everything. The test stack at `v0.9.0` (Task 16); the runbook and guides (Task 15); `tests/hardening/load.py` and `perf_measure.py` (Task 9); `check-headers.sh` (Task 7); `harden-check.sh` (Task 16); `restore.sh` (Task 5).
- Produces: `docs/runbook/rehearsal.md` filled in and signed; version `v1.0.0` in the registry, on the test stack and on the production stack. PRD 13, step 7: "The rehearsal completes from an empty server using only the runbook."

The rehearsal is done by the people who will do the real thing: the System Administrator installs, the HR Responsible enters data, one manager and one employee use it. The developer watches and writes down every place where someone had to ask. Each such place is a defect of the runbook or of a guide, and is corrected before the release.

- [ ] **Step 1: Write the rehearsal record**

`docs/runbook/rehearsal.md`:

````markdown
# Go-live rehearsal

The sequence of the specification (12.9), played on the test stack from nothing, using only `install.md` and the
guides. Tick a line when it was done without help; write in "Notes" whenever someone had to ask or guess.

| | |
|---|---|
| Date | |
| Version | |
| System Administrator | |
| HR | |
| Manager, employee | |
| Observer | |

## A. From an empty stack (System Administrator, with `install.md`)

| # | Step | Done without help | Notes |
|---|---|---|---|
| A1 | The test stack is emptied: no container, no volume | [ ] | |
| A2 | `install.md` sections 1 to 4: the version is installed, `.env` untouched | [ ] | |
| A3 | Section 5: an office machine opens the address without a certificate warning | [ ] | |
| A4 | Section 6: the header check passes | [ ] | |
| A5 | Section 7: the first administrator signs in and chooses a password | [ ] | |
| A6 | Section 8: first backup, and `restore.sh --check` passes | [ ] | |
| A7 | `harden-check.sh`: no check failed | [ ] | |

## B. Enter the company (HR and the administrator, with their guides and `install.md` section 9)

Use five real people of one department, with their real manager.

| # | Step | Done without help | Notes |
|---|---|---|---|
| B1 | The administrator creates HR's account and gives the HR role; an executive's account with the Executive role | [ ] | |
| B2 | HR sets the parameters, leaving "credits start on" empty | [ ] | |
| B3 | HR enters this year's public holidays and two exceptional-leave events | [ ] | |
| B4 | HR enters one department and two positions | [ ] | |
| B5 | HR enters the manager, then four employees who report to them | [ ] | |
| B6 | HR enters each opening balance from the Excel file | [ ] | |
| B7 | HR sets "credits start on" to the first day of this month | [ ] | |
| B8 | The administrator creates the five accounts from the Status page and hands over the passwords | [ ] | |

## C. A week of use, in an hour (everyone, with the employee guide)

| # | Step | Done without help | Notes |
|---|---|---|---|
| C1 | An employee signs in for the first time, in French, on a phone | [ ] | |
| C2 | The employee asks for two days of annual leave in under a minute | [ ] | |
| C3 | The manager approves from the list; HR validates; the employee sees "Approved" and the balance | [ ] | |
| C4 | An employee declares a sick day; HR sees it; the manager sees the absence and nothing medical | [ ] | |
| C5 | The employee adds the certificate from the home page | [ ] | |
| C6 | The manager goes on leave and names a delegate; the delegate decides a request | [ ] | |
| C7 | HR records a decision given on paper | [ ] | |
| C8 | An employee proposes a new phone number; HR accepts | [ ] | |
| C9 | HR exports the month for KPMG; the figures match the Excel file kept in parallel for these five people | [ ] | |
| C10 | The executive opens Overview and finds who is out and what is waiting | [ ] | |
| C11 | The same journey as C2, in English, on Firefox and on Edge | [ ] | |
| C12 | On a phone with Firefox: sign in, home, new request, the calendar | [ ] | |

## D. Operations (System Administrator, with `update.md` and `restore.md`)

| # | Step | Done without help | Notes |
|---|---|---|---|
| D1 | `update.sh` to the same version: a dump is taken, the stack comes back, `.env` untouched | [ ] | |
| D2 | A variable is removed from `.env` on purpose: `update.sh` stops at step 2 and names it; it is put back | [ ] | |
| D3 | `backup_now`, then one more request is entered, then `restore.sh --replace`: the request is gone, the rest is there | [ ] | |
| D4 | A medical certificate downloaded after the restore opens | [ ] | |
| D5 | The worker is stopped for five minutes: Status says so; it is started again | [ ] | |
| D6 | An account is locked by five wrong passwords: Status lists it, the security log shows it, the administrator unlocks it | [ ] | |

## E. Size (observer)

| # | Step | Result |
|---|---|---|
| E1 | 100 employees and a year of requests are loaded | requests: |
| E2 | 20 sessions: the 95th percentile of every endpoint is under 500 ms | slowest: ms |
| E3 | A page is usable within 2 seconds from an office machine (home of each workspace, with the browser's network panel) | slowest: s |
| E4 | The stack is emptied again and reinstalled clean | [ ] |

## Corrections made after the rehearsal

| Where someone had to ask | Document or page corrected | Commit |
|---|---|---|
| | | |

## Sign-off

The rehearsal is complete when every line of A to D is ticked "without help" in one sitting, after corrections.

| Role | Name | Date |
|---|---|---|
| System Administrator | | |
| HR | | |
| Project owner | | |
````

```bash
git add docs/runbook/rehearsal.md
git commit -m "docs: the go-live rehearsal record"
```

- [ ] **Step 2: Empty the test stack**

On the server. **Check the folder twice: this removes the database, the files and the backups of the stack it is run in.**

```bash
cd /opt/iris-hr/test && pwd
scripts/server/compose.sh down --volumes
rm -f scripts/server/state/release scripts/server/state/previous
docker volume ls --format '{{.Name}}' | grep -c '^test_' || true
```

Expected: `/opt/iris-hr/test`; the containers and volumes of the test stack are removed; the last command prints `0`. The `.env` of the test stack stays: the rehearsal starts at `install.md` section 4. (To rehearse sections 2 and 3 as well, move the folder away and clone again.)

- [ ] **Step 3: Play parts A to D**

Give `docs/runbook/install.md`, `update.md`, `restore.md` and the three guides to the people named in the record, and let them work. Do not help; write down each question.

Expected: every line of A, B, C and D is done. A line that could not be done without help is not ticked; its note says what was missing.

Two lines need a word:

- C9: the Excel file HR keeps today is the reference. A difference is either a rule to confirm with HR (`docs/decisions.md`, "Waiting for the project owner") or a defect; write which.
- C12 is the one check of NFR-07 that no automated run covers: Firefox on a phone.

- [ ] **Step 4: Measure at the stated size (part E)**

Still on the test stack, as the service account. The tests folder is mounted from the clone, in case the image does not carry it; the measurement goes through the proxy, because the session cookie is `Secure` on a server.

```bash
cd /opt/iris-hr/test
scripts/server/compose.sh run --rm -T -v "$PWD/backend/tests:/app/tests:ro" app \
  python manage.py shell -c "from tests.hardening.load import build; print(build(employees=100, months=12))"
python3 backend/tests/hardening/perf_measure.py \
  --base "https://$(grep '^SITE_HOSTNAME=' .env | cut -d= -f2):8443" --insecure --users 20 --rounds 15
```

Expected: `{'employees': 106, 'requests': 4008}` (a few less if a public holiday of part B falls on a generated day), then one line per endpoint and `NFR-02 met.` Write the request count and the slowest 95th percentile in the record.

If an endpoint is marked `SLOW` here and was not on the development machine, the server is the difference: check `docker stats` during the run (memory of `db`, CPU of `app`), the number of Gunicorn workers in `compose.server.yaml` (four for four cores), and the disk. If it was slow on both, the fix is the one of Task 9, Step 5.

For E3, open the home of each workspace from an office machine with the network panel open and note the time to the last request.

Then empty the stack again (Step 2) and install it clean with `install.md` (line E4): the load data must not stay.

- [ ] **Step 5: Correct what the rehearsal showed**

For each note of the record:

- A step of a runbook was wrong, missing or unclear: correct the runbook. Run `bash scripts/tests/docs.test.sh` afterwards.
- A guide did not say how: add the sentence to the guide, in both languages for the employee guide.
- A page did not let someone do it: that is a defect. Reproduce it with a test in the page's own test file, fix the page, and rerun `npx playwright test` for the journey concerned.
- A rule surprised HR: add it to "Waiting for the project owner" in `docs/decisions.md`, with what HR expected.

Fill in "Corrections made after the rehearsal" with the commit of each. Then play again the lines that were not ticked, with the corrected documents, until parts A to D are ticked in one sitting.

```bash
git add docs CHANGELOG.md
git commit -m "docs: corrections from the go-live rehearsal"
```

- [ ] **Step 6: Run everything one last time**

On the development machine:

```bash
docker compose up -d
docker compose run --rm app pytest -q
docker compose run --rm app ruff check . && docker compose run --rm app ruff format --check .
docker compose run --rm web npx vitest run
docker compose run --rm web npm run typecheck && docker compose run --rm web npm run lint
bash scripts/server/tests/check-env.test.sh && bash scripts/server/tests/update.test.sh && bash scripts/server/tests/restore.test.sh && bash scripts/server/tests/harden-check.test.sh
bash scripts/tests/docs.test.sh
cd frontend; npx playwright test; cd ..
```

Expected: every command passes. In particular `tests/test_permission_matrix.py` (every endpoint as every role), `tests/hardening/` (the sweeps of this plan) and the sixteen journeys.

Then the suite on the two other engines, as in Task 10, Step 11.

- [ ] **Step 7: Release 1.0.0**

Under `## v1.0.0` in `CHANGELOG.md`, add one line per correction of Step 5 that changed the application (not the documents). Then:

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for v1.0.0"
git push
gh run watch
git tag v1.0.0
git push origin v1.0.0
gh run watch
```

Expected: the pipeline is green on the last commit before the tag is pushed; the `Release` workflow then publishes `iris-hr-backend:v1.0.0` and `iris-hr-proxy:v1.0.0`.

- [ ] **Step 8: Put 1.0.0 on the two stacks**

On the server, the test stack first, as `docs/runbook/update.md` says:

```bash
cd /opt/iris-hr/test && scripts/server/update.sh v1.0.0 && scripts/server/check-headers.sh "https://$(grep '^SITE_HOSTNAME=' .env | cut -d= -f2):8443" 8080
cd /opt/iris-hr/prod && scripts/server/update.sh v1.0.0 && scripts/server/check-headers.sh "https://$(grep '^SITE_HOSTNAME=' .env | cut -d= -f2)" 80
cd /opt/iris-hr/prod && scripts/server/harden-check.sh && scripts/server/restore.sh --check
```

Expected: `Update to v1.0.0 complete.` twice, `All checks passed.` twice, `No check failed.` and `Restore check passed`.

Production is now ready for the go-live sequence of `docs/runbook/install.md`, section 9. The date is the project owner's decision, and three items of the specification must be closed before real data is entered: the sponsor's agreement to approval in the system (open item 1), an off-site destination for backups or the weekly copy of `restore.md` section 1 accepted in writing (open item 4), and the declaration to the regulator (open item 6).

- [ ] **Step 9: Sign the record and commit**

Have the three people of the sign-off table of `docs/runbook/rehearsal.md` put their name and the date. Then:

```bash
git add docs/runbook/rehearsal.md
git commit -m "docs: go-live rehearsal completed on v1.0.0"
git push
```

Build step 7 is done: the rehearsal completed from an empty stack using only the runbook.

---

## Spec coverage

| Requirement or section | Task |
|---|---|
| PRD 2, success criterion 5 and PRD 10 "Proof": every endpoint as every role | 1 |
| PRD 7, permission matrix: declared access against the contract; own, team, department and all reach; delegated reach; System Administrator denied on business data | 1 |
| PRD 3 "Nobody acts on their own request"; PRD 6.9 approver resolution at its edges; REQ-14 | 3 |
| PRD 10 "Privacy"; NOT-03; AUD-05; REP-08; master constraint on sick-leave content | 2 |
| PRD 6.1 (half-days, non-working boundaries); 6.3 (ledger split by month); REP-05, REP-06 (period boundaries, meal tickets); REQ-04 (chain snapshot); BAL-03 (credit: catch-up, pro-rating, idempotence); master D12, D22 | 4 |
| PRD 9.5 "Database and file dump"; 12.7 backups; NFR-04; PRD 12.3 (secrets apart from data) | 5 |
| PRD 9.5 failed job notifies administrators; PRD 12.8 "each job run twice produces the same result as once"; PRD 9.7 `/health` | 6 |
| PRD 10 "Web", "Accounts", "Uploads", "Transport"; ACC-01 to ACC-06; PRD 9.6 downloads; REQ-16; PRD 9.7 start-up validation | 7 |
| REQ-18; PRD 6.3 and 6.4 "under a lock on the employee"; BAL-03 unique credit | 8 |
| NFR-01, NFR-02 | 9, 17 |
| NFR-06, NFR-07, NFR-08; UI U8, U9; master constraints on languages and phone | 10 |
| PRD 12.8 browser level; UI 12, the fourteen journeys; UI 3.4 "Session end" | 11 |
| UI 2: U1 to U9, M1 to M10, R1 to R5 | 12 |
| PRD 9.3 "lists are paginated, filterable and sortable"; UI 3.4 "Lists" | 13 |
| PRD 6.1 working week on the calendar; CAL-02; UI 5.7 "start a new request from a day" | 14 |
| PRD 12.10 documents, changelog, quarterly restore test; PRD 12.9 as a runbook | 15 |
| PRD 12.1, 12.2 (test and production as separate Compose projects); PRD 10 "At rest", "Network", "Separation of duties"; PRD 17 mitigations that are configuration | 16 |
| PRD 12.9 rehearsal; PRD 13 step 7; semantic versioning and release | 17 |
| NFR-03 (upgrades outside business hours), NFR-11 (traceability) | 15 (update runbook), 2 and 11 (audit rows and history checked) |
| Whole-set integration of plans 01a to 06 | 0 |

Master section 10, the ten review-focus items: 1 in Task 4; 2 in Task 4; 3 in Task 3; 4 in Task 8; 5 in Task 4; 6 in Tasks 4, 6 and 8; 7 in Task 7; 8 in Task 7; 9 in Task 2; 10 in Task 11.

## Contract notes

Points where the master is silent, where this plan adds to it, or where it changes a file of an earlier plan.

**Additions to the master**

1. `GET calendar` returns a third key, `working_week` (Task 14). Master 7.8 lists two. Plan 05 named this as the change its calendar needed (its contract note 6).
2. Nine list endpoints gain an `ordering` query parameter, and there is a new error code, `core.ordering_invalid` (Task 13). `GET employees` and `GET requests` keep the parameter their own plans gave them, with their own behaviour for an unknown value (400 for employees, the default order for requests).
3. `DataTable` gains `sort` and `onSort`, and `Column` gains `sortBy` (Task 13). The page-level sort is wired on accounts, the two logs, employees and every list of requests. Queues, notifications, the ledger, delegations and the history of a record keep their own order on screen by design (decision H2); their endpoints accept `ordering`.
4. `RequestForm` gains `initialEnd`; `/me/requests/new` reads `start` and `end` and still reads `date` (Task 14).
5. New files outside the master's layout: `backend/tests/hardening/` (the suite of this plan), `backend/apps/core/backup.py` and `ordering.py`, the commands `backup_now`, `restore_backup` and `permission_report`, `scripts/server/restore.sh`, `check-headers.sh` and `harden-check.sh` with their tests, `scripts/tests/docs.test.sh`, `frontend/e2e/support/`, `docs/runbook/`, `docs/guides/`, `docs/decisions.md`, `docs/ui-audit.md`, `docs/permission-matrix.md`.
6. `frontend/playwright.config.ts` is replaced: one engine per run, chosen by `E2E_BROWSER`; the project names `desktop` and `phone` are unchanged, so no journey changes (Task 10). The browser job of the pipeline runs once per engine.

**Changes to files of earlier plans, beyond their extension points**

7. Task 13 edits list views of plans 01a, 02, 03a and 04 (two lines each) and four pages of plans 01b, 02 and 03b; Task 14 edits two files of plan 05 on each side and two of plan 03b. Each change quotes the lines it replaces. If the executed code differs from the quoted lines, the change is still two lines: the `ordering_parameter` in the schema and the `apply_ordering` call before `paginate`.
8. Task 5 appends the `ops.backup` task to `apps/core/tasks.py` and returns the two keys plan 01a's `backup_info()` reads (its contract note 29).
9. Task 0 changes callers where one plan assumed a name of another. The cases known when the set was reviewed (plan 04's table columns, pager props and language helper) were corrected in plan 04 itself; the table there lists the two that depend on execution order.

**Assumptions about the executed code**

10. Enumerations (`Decision`, `RequestStatus`, `StepStatus`) and models are imported from `apps.requests.models`, `apps.balances.models`, `apps.organisation.models`, `apps.audit.models`, `apps.notifications.models`, `apps.core.models`. Task 1, Step 2 checks the imports before any test is written.
11. The harness of plan 01a runs each case as each persona in its own test, with a fresh cast; the builders of `matrix_reach.py` rely on that.
12. Transactional tests (Tasks 5 and 8) are the first of the set. They rely on three things earlier plans provide: TRUNCATE guards off in tests (01a, note 28), the ledger's bypass outside production (04, note 3), and the cast builder reseeding request types (03a, note 1). Task 8, Step 2 says what to check if a later test fails after them.
13. `settings_service.set_value` accepts an ISO string for `credit_start_date` (plan 04, note 16) and a list of ISO weekdays for `working_week`.
14. The KPMG file has the ten columns of REP-04 in that order (plan 06's journey reads them the same way). When the sample file of PRD open item 2 changes the layout, the column indexes in Task 4 and in journey 15 change with it.
15. The French labels used by the browser specs are those of the journeys of plans 01b, 02, 03b, 05 and 06. A label that changed in a translation file is corrected in the spec, as plan 01b's Task 24 says.
16. The production image may not carry `backend/tests`; Task 17 mounts the folder from the clone for the load builder and runs the measurement script, which needs only Python 3, on the server itself.

**Rules chosen where the specs are silent**

17. Nobody acts on their own request through reassignment either (decision H1). Plan 03a lists the other HR actions (its note 18); `test_the_only_hr_holder_cannot_validate_or_alter_their_own_request` adds reassignment, and Task 3 gives the guard to add if it fails.
18. `storage_used_bytes` counts everything on the backup volume, the pre-update dumps of `dump.sh` included; the nightly job prunes only its own files.
19. `restore.sh --replace` takes a backup first, stops the proxy, the application and the worker, restores, applies the migrations of the deployed version, and waits for `/health`. `--check` restores into a scratch database and changes nothing; it is what the quarterly test runs on production.
20. A release candidate `v0.9.0` is published for the rehearsal; `v1.0.0` is tagged after it.

**For the project owner**

21. Tasks 16 and 17 need the server, the internal names, the people of the rehearsal and the owner's go-ahead. Going live with real data needs three open items of the specification closed (Task 17, Step 8).
22. Until an off-site destination exists, the weekly copy of the backup volume to an encrypted external disk (`docs/runbook/restore.md`, section 1) is the only protection against the loss of the server.
23. Firefox on a phone is checked by hand at the rehearsal; no automated run emulates it.
