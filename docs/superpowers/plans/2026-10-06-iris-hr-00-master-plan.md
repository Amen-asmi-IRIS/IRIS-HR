# IRIS HR Platform: Master Implementation Plan

> **For agentic workers:** this document is the index and the binding contract for a set of ten plans. It contains no tasks. Read it in full before executing any plan of the set, then execute the plans in the order of section 1 with superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** build the first release of the IRIS HR platform end to end: accounts, organisation, request engine, balances, calendar, notifications, reports, KPMG export, administration, audit, deployment and go-live.

**Architecture:** a modular monolith. One Django project exposes a REST API under `/api/v1`; one React single-page app consumes it through a client generated from the OpenAPI description; one Procrastinate worker runs scheduled jobs from the same image; PostgreSQL is the only data store. Caddy terminates HTTPS and serves the React build.

**Tech stack:** Python 3.13, Django 5.2 LTS, Django REST Framework, drf-spectacular, PostgreSQL 17 (psycopg 3), Procrastinate, argon2-cffi, cryptography, openpyxl, pytest, Ruff, uv. React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query v5, React Router v7, react-i18next, react-hook-form, zod, openapi-typescript, openapi-fetch, date-fns, Vitest, Testing Library, MSW, Playwright, ESLint. Caddy 2, Gunicorn, Docker Compose, GitHub Actions, GitHub Container Registry.

**Specs:**

- `docs/superpowers/specs/2026-10-05-iris-hr-platform-prd-design.md` (the PRD; rules, permissions, data, deployment)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-ui-design.md` (the UI document; workspaces, pages, content)
- `docs/design/README.md`, `docs/design/iris-hr-tokens.css`, `docs/design/iris-hr-design-tokens.json` (visual tokens and rules)

Where a plan and this master disagree, this master wins. Where this master and a spec disagree, section 3 lists the difference and why; anything not listed there is a mistake in the plan.

---

## 1. The plan set

All files are in `docs/superpowers/plans/`. Execute in this order. Each plan ends with working, tested software.

| # | File | PRD build step | Delivers | Done when |
|---|---|---|---|---|
| 01a | `2026-10-06-iris-hr-01a-foundation-backend.md` | 1 | Repository, dev stack, Django project, core, accounts and roles, sessions, audit, settings, notification core, job runner, permission-matrix harness, OpenAPI | The API signs a user in, enforces roles and audits every action; `pytest` is green |
| 01b | `2026-10-06-iris-hr-01b-foundation-frontend-delivery.md` | 1 | React app, shell, sign-in pages, Administration workspace, proxy image, pipeline, server update command | A user can sign in on the test stack in both languages and every action is audited |
| 02 | `2026-10-06-iris-hr-02-organisation.md` | 2 | Files, departments, positions, employees, reach, delegation, documents, profile-change proposals, archiving, and their pages | HR can enter the whole company and an employee can propose a change |
| 03a | `2026-10-06-iris-hr-03a-request-engine-backend.md` | 3 | Holidays, day counting, request types, chains, lifecycle, steps, on-behalf, amendments, attachments, queues, reminder and certificate jobs | All five types run end to end through the API without balances |
| 03b | `2026-10-06-iris-hr-03b-request-engine-frontend.md` | 3 | Request form, request views per role, queues, HR actions, HR settings pages | All five types run end to end in the browser |
| 04 | `2026-10-06-iris-hr-04-balances.md` | 4 | Ledger, month-end credit, projection check, adjustments, balance pages | The balance of a test employee matches a hand calculation across a year |
| 05 | `2026-10-06-iris-hr-05-calendar-homes.md` | 5 | Calendar feed and pages, the My space and Overview homes, the remaining My team blocks, switcher counts | Each role's home screen shows its real work |
| 06 | `2026-10-06-iris-hr-06-reports-export.md` | 6 | Six reports, KPMG export, activity log, Oversight pages | HR exports a month that matches a hand calculation |
| 07 | `2026-10-06-iris-hr-07-hardening-go-live.md` | 7 | Matrix completion, sensitive-content sweep, backups and restore, accessibility, full journey suite, runbook and guides, rehearsal | The rehearsal completes from an empty server using only the runbook |

Dependencies are strictly top to bottom. A plan may rely on everything this master assigns to an earlier plan.

| # | Tasks | Lines |
|---|---|---|
| 01a | 23 | 13,354 |
| 01b | 26 | 13,680 |
| 02 | 22 | 13,634 |
| 03a | 24 | 13,376 |
| 03b | 20 | 17,936 |
| 04 | 17 | 6,414 |
| 05 | 17 | 6,796 |
| 06 | 19 | 7,176 |
| 07 | 18 (numbered 0 to 17) | 8,767 |

Every plan ends with a "Spec coverage" table and a "Contract notes" section. The contract notes say what the plan decided where this master was silent and what it expects from its neighbours; section 13 summarises them. Nothing in the set has been executed: the repository does not exist yet, so no code or command in any plan has been run.

## 2. Global constraints

Every task of every plan implicitly includes this section. Values are copied from the specs.

**Platform and versions**

- Python 3.13. Django 5.2 LTS. Django REST Framework. PostgreSQL 17.
- React 19 and TypeScript, built with Vite. Tailwind CSS v4 with shadcn/ui. TanStack Query. React Router. `react-i18next`.
- One worker process using Procrastinate. No separate broker. No cache server.
- Containers: `proxy` (Caddy with the React build), `app` (Gunicorn), `worker` (same image), `db` (PostgreSQL 17, pinned).
- Dependencies are pinned by lock files (`backend/uv.lock`, `frontend/package-lock.json`).
- The running system makes no outbound network call. Fonts are self-hosted. No CDN, no analytics, no email.

**Security and privacy**

- The login identifier is the professional email. Only addresses ending in `@impactrisks.com` are accepted, compared case-insensitively. The domain comes from `ALLOWED_EMAIL_DOMAIN`.
- Passwords have at least 12 characters, are rejected if found in a common-password list or similar to the user's name or email, and are stored with Argon2. No forced periodic change.
- After 5 consecutive failed sign-ins an account is locked for 15 minutes. Both numbers are settings.
- A session ends after 2 hours of inactivity (a setting) and when the browser closes.
- Server-side session in a cookie marked HttpOnly, Secure and SameSite=Lax, with CSRF protection. No tokens in browser storage.
- One account cannot hold both HR and System Administrator.
- Nobody acts on their own request, in any role.
- No request is ever approved automatically.
- The sick-leave comment and medical attachments are visible only to the requester and HR: in every endpoint, list, history, notification, audit entry, report and export.
- The audit trail is append-only.
- Uploads: PDF, JPG and PNG up to 10 MB each. The declared type is checked against the content. Files are served as downloads only.
- Real `.env` files are never committed. An update never writes to a `.env`.

**Backend engineering**

- REST and JSON under `/api/v1`. Dates use ISO 8601. Lists are paginated, filterable and sortable.
- Errors use one problem-details format: type, title, status, translated detail, per-field errors, request identifier.
- Business rules live in services, never in views or serializers.
- An app never queries another app's tables. It calls that app's services or selectors.
- Every endpoint declares its allowed roles. An endpoint without an entry in the permission matrix fails the build.
- State-changing actions are explicit sub-resources, not generic updates.
- Concurrent decisions are rejected with 409 using the request's version number.
- Timestamps are stored with time zone and shown in Africa/Tunis time.
- Migrations go forwards only. A change that removes or renames a column is split across two versions.
- Logs are structured JSON on standard output and never contain passwords, comments or file contents.

**Frontend engineering**

- French and English are complete and equal. No screen mixes the two. Every user-visible string comes from a translation file.
- The interface hides what a role cannot do, but every rule is enforced by the API.
- One primary action per page. At most six navigation entries per workspace. At most four blocks on a home. At most six attributes per list item. At most three visible filters. No disabled controls: what a role cannot use is not shown.
- Statuses are shown as sentences from the viewer's angle, never as codes.
- Colours, type, radius and motion come from `docs/design/iris-hr-tokens.css`. IRIS blue `#0070B0` carries text and buttons. Logo cyan `#0AA2D0` is for the logo and graphics only.
- Focused tasks (decisions, HR actions, balance adjustment, departure, delegation) open in a 480px right sheet, full screen on a phone.
- Every page works on a phone, with a keyboard alone and with a screen reader. Target WCAG 2.1 AA. Touch targets are 44px on a phone.

**Process**

- Test first. Every task writes the failing test, sees it fail, implements, sees it pass, commits.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- Shell scripts are stored with LF line endings.

## 3. Decisions made while planning

The specs leave these points open or the plan departs from them. Each is small and reversible. **These need the project owner's review.**

| # | Decision | Spec says | Why |
|---|---|---|---|
| D1 | The repository is the project folder itself, `C:\Users\aymen.mathlouthi\OneDrive - Impactrisks\Documents\Megara Projects\HR_Project` (the owner's decision, 2026-10-07). `docs/superpowers` and `docs/design` are already in it; the two logo files are copied to `docs/brand`. The other files of `docs/` are source material and stay out of git through a local rule in `.git/info/exclude`. The Compose project is named after the folder: `hr_project`. | Nothing | The owner wants the code beside its documents. The folder is synced by OneDrive: if git or Docker reports a locked or missing file, pause the sync and retry. |
| D2 | Ten documents: steps 1 and 3 are split into a backend and a frontend plan. | One plan per step | Each half is independently testable and a single file stays readable. |
| D3 | The notification model, service, endpoints, header popover and list page are built in step 1. | Notifications in step 5 | Steps 1 to 4 raise notifications. Step 5 keeps calendar and home screens. |
| D4 | `Delegation` belongs to the `organisation` app and is built in step 2. | Listed under `requests`, step 3 | Team reach depends on it. Step 3 adds only the prompt after a manager's leave is approved. |
| D5 | A new `files` app owns `Attachment`. Owners link to it through their own tables (`EmployeeDocument`, `RequestAttachment`). `Attachment` has no `request` column. | `Attachment` in `requests` with an optional `request` | Employee documents (step 2) need attachments before the request engine exists. |
| D6 | The account-to-employee link is stored as `Employee.user` (one-to-one, optional). `user.employee` is the reverse accessor. | `User.employee` | Same relation; `accounts` no longer depends on `organisation`. |
| D7 | Added columns: `User.public_id`, `User.full_name`, `User.password_reset_at`, `User.last_workspace`; `Department.name_fr/name_en`; `Position.title_fr/title_en`; `RequestType.description_fr/description_en`; `Request.sensitive`, `Request.reclassified_from`; `RequestStep.round`, `RequestStep.reminder_after_days`, `RequestStep.flag_after_days`; `Amendment.public_id`, `new_start_time`, `new_end_time`, `new_quantity`; `PublicHoliday.recurs_yearly`; `Notification.dedupe_key`; table `core_jobstatus`. | Section 8 field lists | Each is required by a stated rule (bilingual names, restarted chains, copy of fixed holidays, idempotent jobs, status page). |
| D8 | Append-only audit and ledger are enforced by database triggers that reject UPDATE, DELETE and TRUNCATE. The TRUNCATE guards are switched off in the test database so that test teardown works; `e2e_reset` drops the schema. As built in plan 04, the ledger's TRUNCATE guard is like the audit trail's and has no bypass outside production. UPDATE and DELETE are refused everywhere. | "The database account can insert and read but cannot change or delete" | The environment defines one database account, and a table owner cannot be denied by REVOKE. |
| D9 | Server messages come from a Python catalogue keyed by error code with French and English text, checked by a test. Notifications are rendered on the server in the recipient's language. | "Translated detail" | No gettext compile step on Windows; the same catalogue will serve email later. |
| D10 | Certificate deadline: the type's `document_deadline_hours` if set, otherwise the HR setting `certificate_deadline_hours` (48). | Both a type attribute and an HR setting | One rule instead of two competing values. |
| D11 | New HR setting `credit_start_date`. No month-end credit is posted for a month ending before it, and nothing is posted while it is empty. Opening balances are stated as of the day before. | Not covered | Without it, the first run would credit every month since each employee's hire date. |
| D12 | A half-day flag on a boundary date that is not a working day is refused, as is a single day flagged at both ends. | Not covered | The quantity would otherwise be ambiguous. |
| D13 | A line-manager step whose manager exists but cannot act (archived, no account, disabled) stays pending and is flagged to HR at once. It is skipped only when the employee has no manager at all. | 6.9 covers only "no manager" | A missing approval must never look like an approval. |
| D14 | Anonymous call: 401. Role not allowed on the endpoint: 403. Object outside the user's reach: 404. | UI 3.4 "not available, without revealing whether it exists" | Makes the rule testable. |
| D15 | Extra variables in `.env.example`: `COMPOSE_FILE`, `COMPOSE_PATH_SEPARATOR`, `HTTPS_PORT`, `HTTP_PORT`, `IMAGE_PREFIX` (for example `ghcr.io/<github-owner>/iris-hr`; images are `${IMAGE_PREFIX}-backend:${APP_VERSION}` and `${IMAGE_PREFIX}-proxy:${APP_VERSION}`). | Fixed list in 12.3 | Plain `docker compose` then works on both machines; test and production share one server (A13) and cannot both bind 443; the registry owner is not known to the code. |
| D16 | Sign-in is limited to 20 failed attempts per network address per lock-out window (setting `login_ip_max_attempts`). | "Rate-limited per network address" | Gives the rule a number. |
| D17 | Reclassifying sick leave as annual leave converts the whole request. The comment and certificate stay restricted afterwards. | "Reclassifies the days" | Simplest reading; a partial conversion is a correction followed by a new request. |
| D18 | A pending amendment reserves only the days it adds. Its own affordability check ignores the request it replaces. | "Pending amendments" are reserved | Moving approved leave to other dates must not need the balance twice. |
| D19 | Home-screen and switcher-count endpoints live in the `reports` app. | Not covered | They are read-only aggregations over several modules. |
| D20 | The whole development stack runs in Docker, including the Vite server. Playwright runs on the host against it. | "Live reload" | One command starts everything; browsers are simpler on the host. |
| D21 | Discarding a draft that was never submitted deletes the row. The discard is audited. | "Can be discarded" | It was never a business record. |
| D22 | Changing a public holiday does not recompute requests already approved. HR sees the affected requests and corrects them. | UI 7.12 "a warning" | Silent changes to approved quantities would break the ledger's explainability. |
| D23 | The design canvas is not reachable from the repository. Layout follows the tokens and the rules of `docs/design/README.md`; the plans fix the remaining layout choices. | README points to the canvas | Executors cannot open it. |
| D24 | Managers and HR can list the names of all active employees when choosing a delegate or a new approver (`/employees/directory`). | Manager sees Team | A delegate is usually outside the team. Only name and department are exposed. |
| D25 | The HR desk and the manager's To decide page are built in step 3, in their final form. Step 5 adds the My space and Overview homes, the "Who is out" and "Delegation" blocks of My team, the calendars and the switcher counts. | Home screens in step 5 | The queues of step 3 need an entry point, and the HR desk is nothing but those queues. |

The step plans made further choices where the specs are silent. Those that change what a person sees or what HR sends out are listed here; each plan's "Contract notes" has the rest. **These also need the project owner's review.**

| # | Decision | Plan | Spec says |
|---|---|---|---|
| D26 | One account may hold both Executive Management and System Administrator. An administrator cannot change their own roles, and every role change is in the security log. | 01a | Only HR with System Administrator is forbidden |
| D27 | System Administrators are notified of a failing job after its third consecutive failure, once per job per day. | 01a | "If it still fails" |
| D28 | A draft is seen and edited only by the account that created it. A draft HR prepares for an employee appears to the employee once HR sends it. | 03a | Not covered |
| D29 | Once a manager's step is flagged as stuck, HR may decide it directly. Before that, HR records the manager's decision or gives the step to someone else. | 03a | Matrix: "on behalf, or when flagged" |
| D30 | When every step of a chain was only informed or skipped, an HR step is added so that a person decides. | 03a | REQ-14 forbids automatic approval |
| D31 | Counting sick leave as annual leave is the HR decision on the request: it approves the open HR step. | 03a | Not covered |
| D32 | A request HR entered with an exception cannot be edited or resent by the employee; they can withdraw it. HR never grants an exception to, corrects, cancels, reclassifies, reassigns or records a decision on its own request. | 03a, 07 | "Nobody acts on their own request" |
| D33 | A comment is offered on every request type. | 03b | Listed for three types, forbidden for none |
| D34 | Discarding a draft and withdrawing a request are announced at once and sent five seconds later, with an undo. What is typed in a request form is kept in the browser tab until it is saved, so a session that ends loses nothing. | 03b | U6 "offers the undo"; UI 3.4 session end |
| D35 | Month-end credit: a person is credited for the days between hire date and leaving date, whatever their status on the last day; a tie rounds up (1.25 becomes 1.5); a credit that rounds to zero posts no line. | 04 | 6.2 says both "status on that date" and "pro-rated in the month of leaving" |
| D36 | An opening balance may be any number, once per employee. An HR adjustment may take a balance below zero. | 04 | Not covered |
| D37 | KPMG columns: annual, sick and exceptional days are the three seeded types; permission hours are every hour-based type; remote days are every type shown as "remote". A type HR adds later feeds no column. | 06 | REP-04 names the columns only |
| D38 | Meal tickets: one is lost for each date on which ticket-reducing absences add up to a full day. The base is multiplied by the whole months of the period. Joiners and leavers get the full base. | 06 | REP-06; no pro-rating stated |
| D39 | The export includes everyone employed during the period, leavers up to the period that contains their leaving date. The cut-off day is limited to 1 to 28. After the cut-off, the default period is the one just closed. | 06 | REP-07 |
| D40 | Overview offers five reports. The certificates report stays with HR. | 06 | UI 8.5 says six; UI 10.3 says HR only |
| D41 | Column sorting is offered on accounts, the two logs, employees and request lists. Queues, notifications, the ledger and delegations keep a fixed order. | 07 | "Lists are sortable" |
| D42 | On the server the running version is recorded by the update command in its own file, never in `.env`; `scripts/server/compose.sh` uses it. | 01b | "An update never writes to a `.env`" and `APP_VERSION` in `.env` |
| D43 | A release candidate `v0.9.0` is used for the rehearsal; `v1.0.0` is tagged after it. | 07 | Not covered |
| D44 | Recording a departure disables the account and leaves its assigned roles (HR, Executive Management) on it, for the record. An administrator cannot re-enable an account whose employee has left: `enable_account` refuses with its own error code and a message that says why. Decided by the project owner on 2026-10-07; built at the review of plan 03a. | 02 | ACC-10 says only that the account is disabled |
| D45 | When a request is sent in an employee's name by someone else (HR entering it), the employee receives an in-app notification that links to it. Decided by the project owner on 2026-10-08. | 03a, at review | NOT-02 has no such event |
| D46 | On a sick leave, the reason HR types for a correction, a cancellation or a reassignment is used once and stored nowhere readable: the audit trail records only that one was given, and the ledger line has no reason. Decided by the project owner on 2026-10-08, who preferred that nothing restricted can leak over being able to read the reason later. | 03a | Not covered |
| D48 | On the phone tab bar, a workspace with more than five entries shows its first four (in the order of `app/workspaces.ts`) and a fifth tab "Plus" / "More" that opens the rest; an entry whose full label is too long for its tab has a short label for the phone. Six tabs do not fit at 360 px. Decided by the project owner on 2026-10-08; built at the review of plan 03b. | 03b, at review | UI 3: up to six entries, no phone layout given |
| D49 | An HR holder may adjust their own balance and enter their own opening balance (IRIS has one HR holder), and each such change sends an in-app notification to every Executive Management holder, with the amount and the reason. Decided by the project owner on 2026-10-13; built at the review of plan 04. | 04, at review | Not covered; D32 covers requests only |
| D50 | A person hired on or after `credit_start_date` is offered no opening balance: their monthly credits are their balance, and days brought from elsewhere go in as an adjustment. | 04, at review | D11 |
| D51 | The `CI` workflow no longer runs on every push. It runs when started by hand (`gh workflow run CI --ref main`), once at the end of each plan and of each review, on pull requests, and when the release workflow calls it. Every commit is still pushed. Until a run is started, the local checks (backend suite, its three checks, Vitest, lint, typecheck, the journeys through `scripts/e2e-container.sh`) are the gate. Decided by the project owner on 2026-10-13, after the account's free Actions minutes ran out. | 05 | PRD 12.4: "on every push and pull request" |
| D52 | On the homes (My team's "Who is out" and People "today", Overview's "Out now"), a sick leave that waits for HR counts as away, marked as waiting; every other pending request still does not. Decided by the project owner on 2026-10-13. | 05, at review | Plan 05's contract note 1: approved requests only |
| D53 | With no payroll cut-off day, the KPMG export proposes the last calendar month that is over (on 3 December: November). Decided by the project owner on 2026-10-14. | 06, at review | REP-07, A7: "the calendar month" |
| D47 | The HR rule of a chain counts only the HR holders who can decide (who have an employee record). When there is none, PRD 6.9 applies as written: executives decide, else the System Administrators are told the step is unattended. | 03a, at review | 6.9 |

## 4. Repository layout

```
iris-hr/
├── .env.example                 documents every variable
├── .gitattributes               LF for *.sh, Caddyfile, Dockerfile, *.py, *.yaml
├── .gitignore
├── README.md
├── CHANGELOG.md
├── compose.yaml                 shared: db, app, worker
├── compose.dev.yaml             dev: source mounted, ports open, web (Vite)
├── compose.server.yaml          server: registry images, proxy, restart policies
├── .github/workflows/ci.yml
├── .github/workflows/release.yml
├── scripts/
│   ├── dev.ps1                  init | update | reset | seed | openapi
│   └── server/                  check-env.sh, update.sh, dump.sh, restore.sh
├── proxy/                       Dockerfile, Caddyfile, maintenance.html
├── docs/                        specs, plans, design, runbook, guides
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml, uv.lock
│   ├── manage.py
│   ├── conftest.py              pytest fixtures: api clients, world
│   ├── config/                  env.py, settings.py, urls.py, api_urls.py, wsgi.py, logging.py
│   ├── tests/                   cross-app tests: matrix.py, world.py, test_permission_matrix.py, test_openapi.py, test_messages.py
│   └── apps/
│       ├── core/                errors, i18n, context, middleware, models, pagination, xlsx, jobs, health and status API
│       ├── accounts/            User, RoleAssignment, auth, roles, permissions
│       ├── audit/               AuditEvent
│       ├── settings/            Setting, registry
│       ├── notifications/       Notification, events
│       ├── files/               Attachment, storage, encryption            (plan 02)
│       ├── organisation/        Department, Position, Employee, Delegation, EmployeeDocument, ProfileChange, reach  (plan 02)
│       ├── calendar/            PublicHoliday, working days; calendar feed (plans 03a, 05)
│       ├── requests/            RequestType, ChainStep, ExceptionalEvent, Request, Amendment, RequestStep, RequestAttachment (plan 03a)
│       ├── balances/            LedgerEntry                                 (plan 04)
│       └── reports/             home screens, reports, KPMG export          (plans 05, 06)
└── frontend/
    ├── package.json, package-lock.json, vite.config.ts, tsconfig*.json, eslint.config.js, components.json, index.html
    ├── playwright.config.ts, e2e/
    └── src/
        ├── main.tsx
        ├── app/                 providers.tsx, router.tsx, guards.tsx, workspaces.ts
        ├── api/                 schema.d.ts (generated), client.ts, problem.ts
        ├── i18n/                index.ts, locales/fr/*.json, locales/en/*.json
        ├── styles/              index.css, tokens.css
        ├── lib/                 format.ts, dates.ts
        ├── components/ui/       shadcn primitives
        ├── components/          shared building blocks (section 9.2)
        ├── features/            auth, shell, notifications, accounts, settings, audit, employees, profile, delegations, requests, balances, calendar, home, reports
        ├── workspaces/          me/routes.tsx, team/routes.tsx, hr/routes.tsx, overview/routes.tsx, admin/routes.tsx
        └── test/                setup.ts, server.ts, render.tsx, fixtures.ts
```

Every backend app has this shape. A file is created only when it has content.

```
apps/<app>/
  __init__.py  apps.py  models.py  messages.py
  services.py        writes; a package `services/` when it grows past ~400 lines
  selectors.py       reads, already filtered by reach
  tasks.py           Procrastinate tasks: thin wrappers around services
  seed.py            demo data for dev and browser tests
  api/serializers.py  api/views.py  api/urls.py
  migrations/
  tests/__init__.py  tests/test_*.py  tests/matrix.py  tests/world.py
```

## 5. Commands

The dev `.env` sets `COMPOSE_FILE=compose.yaml:compose.dev.yaml` and `COMPOSE_PATH_SEPARATOR=:`, so plain `docker compose` loads the dev stack. All commands run from the repository root.

| Purpose | Command |
|---|---|
| First run | `powershell -File scripts/dev.ps1 init` |
| Start | `docker compose up -d` |
| Backend tests | `docker compose run --rm app pytest <path> -v` |
| One backend test | `docker compose run --rm app pytest apps/accounts/tests/test_auth.py::test_name -v` |
| Backend lint | `docker compose run --rm app ruff check . && docker compose run --rm app ruff format --check .` |
| Migrations | `docker compose run --rm app python manage.py makemigrations <app>` then `... migrate` |
| Frontend tests | `docker compose run --rm web npx vitest run <path>` |
| Frontend lint and types | `docker compose run --rm web npm run lint && docker compose run --rm web npm run typecheck` |
| Regenerate API types | `powershell -File scripts/dev.ps1 openapi` (writes `backend/openapi.yaml` and `frontend/src/api/schema.d.ts`) |
| Demo data | `docker compose exec app python manage.py seed_demo` |
| Browser tests | `cd frontend; npx playwright test` (resets and seeds the dev database first) |

URLs in development: app at `http://localhost:5173`, API at `http://localhost:8000/api/v1` (also proxied by Vite under `/api`).

## 6. Backend conventions

### 6.1 Settings and environment

`config/env.py` reads and validates every variable at import; a missing or malformed value raises `EnvError` naming the variable, and the process exits. Required: `ENVIRONMENT` (`development`, `test`, `production`), `APP_VERSION`, `SITE_HOSTNAME`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `FILE_ENCRYPTION_KEY` (a Fernet key), `BACKUP_PASSPHRASE`, `ALLOWED_EMAIL_DOMAIN`, `TIME_ZONE`, `DEFAULT_LANGUAGE` (`fr` or `en`), `LOG_LEVEL`. The database host is the compose service `db`, port 5432.

Fixed paths inside the containers: files at `/data/files`, backups at `/data/backups`.

### 6.2 Errors

```python
# apps/core/errors.py
@dataclass(frozen=True)
class Problem:
    code: str
    field: str | None = None
    params: Mapping[str, Any] = dataclasses.field(default_factory=dict)   # the attribute above is named `field`

class DomainError(Exception):
    status = 400
    def __init__(self, code: str, *, field: str | None = None,
                 problems: Sequence[Problem] | None = None, **params: Any) -> None: ...
    # .code, .params, .problems (always at least one Problem)

class NotAllowed(DomainError): status = 403     # default code "core.not_allowed"
class NotFound(DomainError):   status = 404     # default code "core.not_found"
class Conflict(DomainError):   status = 409
class RateLimited(DomainError): status = 429
```

Services raise these. `apps.core.api.exception_handler` (the DRF `EXCEPTION_HANDLER`) turns every error, including DRF validation errors and unexpected exceptions, into:

```json
{
  "type": "urn:iris-hr:problem:request.overlap",
  "title": "Bad Request",
  "status": 400,
  "code": "request.overlap",
  "detail": "Ces dates chevauchent une autre demande (12/03 au 14/03).",
  "errors": [{"field": "start_date", "code": "request.overlap", "detail": "…", "params": {}}],
  "request_id": "3f2a…"
}
```

Content type `application/problem+json`. `errors` always has at least one entry; `field` is null for a problem that belongs to no input. An unexpected exception returns status 500 with code `core.unexpected`, logs the traceback with the request id, and notifies System Administrators (event `error.unexpected`, de-duplicated per hour).

### 6.3 Messages

```python
# apps/core/i18n.py
def register_messages(messages: Mapping[str, Mapping[str, str]]) -> None   # {"request.overlap": {"en": "...", "fr": "..."}}
def translate(code: str, lang: str | None = None, /, **params: Any) -> str  # lang defaults to the active language
def all_messages() -> Mapping[str, Mapping[str, str]]
```

Each app keeps its texts in `messages.py` as `MESSAGES = {...}` and registers them in `AppConfig.ready()`. Codes are `<app>.<snake_case>`. Placeholders use `str.format` names. `backend/tests/test_messages.py` fails if a code lacks `en` or `fr`, or if the two texts use different placeholders. `apps.core.middleware.LanguageMiddleware` activates the signed-in user's language, else the request's `Accept-Language` (`fr` or `en`), else `DEFAULT_LANGUAGE`.

### 6.4 Services, selectors, views

```python
# apps/<app>/services.py: writes
@transaction.atomic
def archive_employee(*, actor: User, employee: Employee, leaving_date: date, reason: str) -> Employee:
    if employee.status == EmployeeStatus.ARCHIVED:
        raise Conflict("organisation.already_archived")
    before = audit.snapshot(employee, ["status", "archived_at", "archive_reason"])
    ...
    audit.record(action="employee.archived", obj=employee,
                 changes=audit.diff(before, audit.snapshot(employee, [...])))
    return employee
```

- Keyword-only arguments. `actor` is the `User` performing the action, or `None` for the system.
- A write is one transaction: rule checks, change, audit record and notifications commit together.
- Functions that depend on the clock take `today: date | None = None` or `now: datetime | None = None` and default to `timezone.localdate()` / `timezone.now()`.
- Selectors return querysets or dataclasses already limited to what the given user may see.
- Quantities are `Decimal` in Python, `DecimalField(max_digits=7, decimal_places=2)` in the database, strings in JSON.

```python
# apps/<app>/api/views.py: thin
class EmployeeArchiveView(APIView):
    access = {"POST": {Role.HR}}

    @extend_schema(request=ArchiveIn, responses=EmployeeOut)
    def post(self, request, public_id):
        employee = selectors.get_employee_for(request.user, public_id)   # raises NotFound outside reach
        data = ArchiveIn(data=request.data); data.is_valid(raise_exception=True)
        employee = services.archive_employee(actor=request.user, employee=employee, **data.validated_data)
        return Response(EmployeeOut(employee, context={"request": request}).data)
```

- Every view class sets `access`: a mapping from HTTP method to a set of `Role`, or to `AUTHENTICATED`, or to `PUBLIC`. `apps.accounts.permissions.RolePermission` is the only default permission class and denies a method that is not declared. Views list their methods in `http_method_names`.
- Every view method carries `@extend_schema` with its request and response serializers, so the generated client is typed.
- URL modules set `app_name` and name every route; routes are reversed as `"<app_name>:<name>"`.
- Authentication is `apps.accounts.authentication.SessionAuth` (session cookie, CSRF enforced, 401 for anonymous).
- While `user.must_change_password` is true, every endpoint except `accounts:me`, `accounts:password`, `accounts:logout` and `accounts:csrf` answers 403 with code `auth.password_change_required`.

### 6.5 Audit

```python
# apps/audit/services.py
BUSINESS = "business"; SECURITY = "security"
def record(*, action: str, category: str = BUSINESS, obj: models.Model | None = None,
           object_type: str = "", object_id: str = "", object_label: str = "",
           changes: Mapping[str, Any] | None = None, actor: User | None | Unset = UNSET) -> AuditEvent
def snapshot(instance: models.Model, fields: Iterable[str]) -> dict[str, Any]
def diff(before: Mapping[str, Any], after: Mapping[str, Any], *, redact: Iterable[str] = ()) -> dict[str, dict]
    # {"phone": {"before": "…", "after": "…"}}; a redacted field becomes {"changed": True}
```

`actor`, network address and request id default to the current request (`apps.core.context`). With `obj`, `object_type` is the model's lower-case name, `object_id` its `public_id` if it has one, else its primary key. Actions are `<object>.<verb>` (`employee.archived`, `step.decided`, `auth.login_failed`). Sick-leave comments are always passed through `redact`.

### 6.6 Notifications

```python
# apps/notifications/services.py
def register_event(code: str, *, link: str) -> None          # link template, e.g. "/requests/{target}"
def notify(*, users: Iterable[User], event: str, params: Mapping[str, Any] | None = None,
           target_type: str = "", target_public_id: str = "", dedupe_key: str | None = None) -> list[Notification]
```

Texts are the catalogue entries `notification.<event>.title` and `notification.<event>.body`, formatted with `params`. A `(user, dedupe_key)` pair is stored once. Params never carry a comment or a file name of a sensitive request. The API returns `{id, event, title, body, link, created_at, read_at}` rendered in the reader's language.

### 6.7 Settings

```python
# apps/settings/registry.py
@dataclass(frozen=True)
class SettingDef:
    key: str; group: str            # "hr" | "system"
    kind: str                       # "int" | "decimal" | "bool" | "weekdays" | "str_list" | "int_or_null" | "date_or_null"
    default: Any; minimum: Any = None; maximum: Any = None
def register(defn: SettingDef) -> None

# apps/settings/services.py   (import as: from apps.settings import services as settings_service)
def get(key: str) -> Any
def set_value(*, actor: User, key: str, value: Any) -> Setting      # validates, checks the actor's role for the group, audits before and after
def list_group(group: str) -> list[SettingRow]                      # key, kind, value, default, minimum, maximum, updated_by_name, updated_at
def clear_cache() -> None
```

Values are cached per process for 30 seconds; `set_value` clears the local cache. HR-group changes are audited as business events, system-group changes as security events.

| Key | Group | Kind | Default | Registered in |
|---|---|---|---|---|
| `session_timeout_minutes` | system | int | 120 | 01a |
| `lockout_threshold` | system | int | 5 | 01a |
| `lockout_minutes` | system | int | 15 | 01a |
| `login_ip_max_attempts` | system | int | 20 | 01a |
| `temp_password_hours` | system | int | 24 | 01a |
| `upload_max_mb` | system | int | 10 | 01a |
| `upload_allowed_types` | system | str_list | `["pdf","jpg","png"]` | 01a |
| `working_week` | hr | weekdays | `[1,2,3,4,5]` (ISO, Monday = 1) | 03a |
| `certificate_deadline_hours` | hr | int | 48 | 03a |
| `certificate_warning_hours` | hr | int | 12 | 03a |
| `monthly_credit_days` | hr | decimal | 2.5 | 04 |
| `credit_start_date` | hr | date_or_null | null | 04 |
| `meal_tickets_per_month` | hr | int | 21 | 06 |
| `export_cutoff_day` | hr | int_or_null | null | 06 |

### 6.8 Roles and reach

```python
# apps/accounts/roles.py
class Role(StrEnum): EMPLOYEE = "employee"; MANAGER = "manager"; HR = "hr"; EXEC = "exec"; SYSADMIN = "sysadmin"
ASSIGNABLE = frozenset({Role.HR, Role.EXEC, Role.SYSADMIN})
def roles_of(user) -> frozenset[Role]                                # assigned roles plus derived ones; cached on the user object
def has_role(user, *roles: Role) -> bool
def register_derived_role_provider(fn: Callable[[User], Iterable[Role]]) -> None
def users_with_role(role: Role) -> QuerySet[User]                    # active accounts holding an assignable role
```

`organisation` registers the provider that adds `EMPLOYEE` and `MANAGER` (plan 02). Workspaces follow roles: `me` = EMPLOYEE, `team` = MANAGER, `hr` = HR, `overview` = EXEC, `admin` = SYSADMIN.

```python
# apps/organisation/reach.py   (plan 02)
def employee_of(user) -> Employee | None
def acting_for(employee_id: int, *, on: date | None = None) -> set[int]      # the id itself plus managers who delegated to it on that date
def team_ids(user, *, on: date | None = None) -> set[int]                    # employees whose manager is in acting_for(user's employee)
def department_peer_ids(user) -> set[int]                                    # active employees of the user's department, including the user
def can_see_employee(user, employee: Employee) -> bool                       # own, team, or HR/EXEC
def lock_employee(employee_id: int) -> Employee                              # SELECT ... FOR UPDATE inside the caller's transaction
```

### 6.9 Jobs

```python
# apps/core/jobs.py
def recorded(name: str) -> Callable        # decorator: upserts core.JobStatus (started, finished, ok, detail, consecutive_failures); after the third consecutive failure notifies SYSADMINs (job.failed, once per day per job); always re-raises
RETRY = ...                                # Procrastinate retry strategy: 3 attempts, exponential back-off
```

```python
# apps/<app>/tasks.py
from procrastinate.contrib.django import app

@app.periodic(cron="0 * * * *")
@app.task(name="requests.reminders_and_flags", retry=RETRY, queueing_lock="requests.reminders_and_flags")
@recorded("requests.reminders_and_flags")
def reminders_and_flags(timestamp: int) -> None:
    services.send_reminders_and_flags()
```

The idempotent logic is the service function; tests call it twice and compare. The executor confirms the decorator names against the installed Procrastinate version before writing the first task (plan 01a). Cron expressions are written in UTC; Tunis is UTC+1 all year, so the local times in the table below are one hour later than the expression (daily 06:00 is `0 5 * * *`).

| Job | Schedule | Plan |
|---|---|---|
| `core.heartbeat` | every minute | 01a |
| `accounts.cleanup` (expired sessions, expired temporary passwords) | daily 02:30 | 01a |
| `organisation.delegation_transitions` | daily 06:00 | 02 |
| `requests.reminders_and_flags` | hourly | 03a |
| `requests.certificate_deadlines` | hourly | 03a |
| `balances.month_end_credit` | daily 01:00 | 04 |
| `ops.backup` | daily 23:30 | 07 |

### 6.10 Tests

- pytest with pytest-django and `time-machine`; `--import-mode=importlib`. Tests live in `apps/<app>/tests/`; cross-app tests in `backend/tests/`.
- No factory library. Each app exposes plain builder functions in `apps/<app>/tests/world.py` (`make_employee(...)`, `make_request(...)`).
- `backend/conftest.py` provides `world` (the standard cast, section 6.11), `client_for(user)` (a DRF `APIClient` signed in as that user) and `anon_client`.
- A service test asserts behaviour and the audit record. An API test asserts status, body shape and the problem code.

```python
def test_archiving_disables_the_account(world):
    services.archive_employee(actor=world.hr_user, employee=world.owner,
                              leaving_date=date(2026, 11, 30), reason="Resignation")
    world.owner_user.refresh_from_db()
    assert world.owner_user.is_active is False
    assert AuditEvent.objects.filter(action="employee.archived", object_id=str(world.owner.public_id)).exists()
```

### 6.11 The permission matrix and the standard cast

```python
# backend/tests/matrix.py
class P(StrEnum):
    ANON = "anon"; OWNER = "owner"; PEER = "peer"; MANAGER = "manager"; OTHER_MANAGER = "other_manager"
    OUTSIDER = "outsider"; HR = "hr"; EXEC = "exec"; SYSADMIN = "sysadmin"

ALLOW = "allow"      # any status except 401, 403, 404
DENY = 403; HIDE = 404; LOGIN = 401

@dataclass(frozen=True)
class Case:
    route: str                                   # "accounts:account-detail"
    method: str                                  # "GET"
    expect: Mapping[P, object]
    kwargs: Callable[[World], dict] = lambda w: {}
    body: Callable[[World], dict | None] = lambda w: None
    query: Callable[[World], dict] = lambda w: {}
    label: str = ""

def only(*allowed: P, hide: Iterable[P] = ()) -> dict[P, object]
    # allowed -> ALLOW, hide -> HIDE, ANON -> LOGIN, everyone else -> DENY
```

Each app lists its cases in `apps/<app>/tests/matrix.py` as `CASES`. `backend/tests/test_permission_matrix.py` (plan 01a) imports the modules named in `MATRIX_MODULES`, runs every case as every persona, and fails if any `(route, method)` found under `/api/v1` has no case.

The standard cast, built by `backend/tests/world.py`:

| Attribute | Who | Added by |
|---|---|---|
| `sysadmin_user` | System Administrator, no employee record | 01a |
| `exec_user`, `hr_user` | Holders of EXEC and HR | 01a |
| `owner_user`, `peer_user`, `manager_user`, `other_manager_user`, `outsider_user` | Accounts without assigned roles | 01a |
| `dept_a`, `dept_b`, `position` | Two departments, one position | 02 |
| `ceo` (employee of `exec_user`) | No manager | 02 |
| `hr` (employee of `hr_user`) | Department B, reports to `ceo` | 02 |
| `manager` | Department A, reports to `ceo`; manages `owner` and `peer` | 02 |
| `owner`, `peer` | Department A, report to `manager` | 02 |
| `other_manager` | Department B, reports to `ceo`; manages `outsider` | 02 |
| `outsider` | Department B, reports to `other_manager` | 02 |
| `annual`, `sick`, `exceptional`, `permission`, `remote`, `event` | The five seeded request types and one exceptional event | 03a |

`world.user_for(P.X)` returns the account of a persona (`None` for `ANON`). All demo and test accounts use the password `Correct-Horse-42!`.

`seed_demo` creates the same cast for development and browser tests, with these sign-in addresses: `sysadmin@impactrisks.com`, `ceo@impactrisks.com`, `hr@impactrisks.com`, `manager.a@impactrisks.com`, `employee.a1@impactrisks.com` (the owner), `employee.a2@impactrisks.com` (the peer), `manager.b@impactrisks.com`, `employee.b1@impactrisks.com` (the outsider). Plan 01a seeds the accounts; each later plan's `seed.py` adds its own data to them.

## 7. Backend contract by app

Access sets use role names; `AUTH` means any signed-in account; `PUBLIC` means no session. Paths are relative to `/api/v1`. The route name is `<app_name>:<name>`.

### 7.1 core (plan 01a)

- `TimeStampedModel` (`created_at`, `updated_at`), `PublicIdModel` (`public_id` UUID, unique, not editable).
- `apps.core.context`: `current_request_id()`, `current_actor()`, `current_ip()`; set by `RequestContextMiddleware`. `apps.core.net.client_ip(request)`.
- `apps.core.pagination.DefaultPagination`: page-number, 25 per page, `page_size` up to 100; body `{count, next, previous, results}`.
- `apps.core.xlsx.build_workbook(*, title: str, columns: Sequence[Column], rows: Iterable[Mapping]) -> bytes` with `Column(key, header, kind)`, kind in `text`, `number`, `date`, `datetime`.
- `core.JobStatus(name unique, schedule, last_started_at, last_finished_at, last_ok, last_detail)`.

| Path | Methods and access | Name |
|---|---|---|
| `health` | GET PUBLIC | `core:health` |
| `admin/status` | GET SYSADMIN, EXEC | `core:admin-status` |

`health` returns `{status, app, database, worker, version, environment}`, 503 when the database fails or the heartbeat is older than 3 minutes. `admin/status` returns `{health, accounts: {locked, awaiting_first_sign_in, temp_expired, employees_without_account}, jobs, backup}`: each `accounts` list holds `{public_id, name, email}`; `jobs` holds `{name, schedule, last_started_at, last_finished_at, last_ok, last_detail, next_run_at}`, failures first; `backup` is `{last_at, size_bytes, storage_used_bytes}` or null, read from the `ops.backup` job status that plan 07 writes.

Management commands: `create_sysadmin --email --name`, `seed_demo`, `e2e_reset` (both refuse to run when `ENVIRONMENT=production`).

### 7.2 accounts (plan 01a)

`User`: `public_id`, `email`, `password`, `full_name`, `is_active`, `must_change_password`, `temp_password_expires_at`, `failed_attempts`, `locked_until`, `last_login_at`, `previous_login_at`, `password_reset_by`, `password_reset_at`, `language`, `last_workspace`, `created_at`, `created_by`. `RoleAssignment`: `user`, `role`, `assigned_by`, `assigned_at`.

```python
# apps/accounts/services.py
def authenticate(*, email: str, password: str, ip: str) -> User
def start_session(request, user: User) -> None
def end_session(request) -> None
def change_password(*, user: User, current_password: str, new_password: str) -> None
def create_account(*, actor: User | None, email: str = "", full_name: str = "",
                   employee_public_id: str | None = None, roles: Iterable[Role] = ()) -> tuple[User, str]   # (user, temporary password)
def reset_password(*, actor: User, user: User) -> str
def assign_role(*, actor: User | None, user: User, role: Role) -> RoleAssignment
def remove_role(*, actor: User, user: User, role: Role) -> None
def disable_account(*, actor: User | None, user: User) -> None
def enable_account(*, actor: User, user: User) -> None
def unlock_account(*, actor: User, user: User) -> None
def display_name(user: User) -> str                                   # employee name if linked, else full_name, else email

# apps/accounts/ports.py: implemented by organisation in plan 02
@dataclass(frozen=True)
class EmployeeRef: public_id: str; full_name: str; email: str
class EmployeeDirectory(Protocol):
    def candidate(self, public_id: str) -> EmployeeRef | None         # active employee without an account
    def candidates(self) -> list[EmployeeRef]
    def link(self, *, user_id: int, public_id: str) -> None
    def ref_for_user(self, user_id: int) -> EmployeeRef | None
def set_employee_directory(directory: EmployeeDirectory) -> None
def employee_directory() -> EmployeeDirectory                          # a null directory until plan 02
```

Error codes: `auth.invalid_credentials`, `auth.domain_not_allowed`, `auth.locked` (param `until`), `auth.disabled`, `auth.temp_password_expired`, `auth.rate_limited`, `auth.password_change_required`, `auth.wrong_current_password`, `auth.weak_password`, `accounts.email_taken`, `accounts.employee_has_account`, `accounts.employee_unknown`, `accounts.roles_incompatible`, `accounts.last_sysadmin`, `accounts.cannot_change_self`.

| Path | Methods and access | Name |
|---|---|---|
| `auth/csrf` | GET PUBLIC | `accounts:csrf` |
| `auth/login` | POST PUBLIC | `accounts:login` |
| `auth/logout` | POST AUTH | `accounts:logout` |
| `auth/me` | GET, PATCH AUTH | `accounts:me` |
| `auth/password` | POST AUTH | `accounts:password` |
| `accounts` | GET SYSADMIN, EXEC; POST SYSADMIN | `accounts:account-list` |
| `accounts/candidates` | GET SYSADMIN | `accounts:account-candidates` |
| `accounts/{public_id}` | GET SYSADMIN, EXEC | `accounts:account-detail` |
| `accounts/{public_id}/reset-password` | POST SYSADMIN | `accounts:account-reset-password` |
| `accounts/{public_id}/roles` | POST SYSADMIN | `accounts:account-roles` |
| `accounts/{public_id}/roles/{role}` | DELETE SYSADMIN | `accounts:account-role` |
| `accounts/{public_id}/disable`, `/enable`, `/unlock` | POST SYSADMIN | `accounts:account-disable`, `-enable`, `-unlock` |

Shapes:

- `Me`: `{public_id, email, name, language, roles, workspaces, last_workspace, must_change_password, previous_login_at, password_reset: {by, at} | null, employee: {public_id, name} | null, environment, version}`.
- `POST auth/login` takes `{email, password}` and returns `Me`. `GET auth/me` returns `Me`. `PATCH auth/me` takes `language` and `last_workspace` and returns `Me`. `POST auth/password` takes `{current_password, new_password}` and returns 204. `POST auth/logout` returns 204.
- `AccountOut`: `{public_id, email, name, state, roles, last_login_at, has_employee}`. `state` is one of `active`, `awaiting_first_sign_in`, `locked`, `disabled`.
- `AccountDetailOut`: `AccountOut` plus `{role_assignments: [{role, assigned_by, assigned_at}], previous_login_at, failed_attempts, locked_until, created_at, created_by, recent_events: [AuditEventOut]}`.
- `GET accounts` is paginated `AccountOut`, filters `search`, `state`, `role`. `POST accounts` takes `{email?, full_name?, employee?, roles}` (`employee` is an employee `public_id`) and returns 201 `{account: AccountOut, temporary_password, expires_at}`.
- `POST …/reset-password` returns `{temporary_password, expires_at}`. `POST …/roles` takes `{role}`. Role and state actions return `AccountDetailOut`.
- `GET accounts/candidates` returns `[{public_id, full_name, email}]`.

Notification event: `account.password_reset` (to the user).

### 7.3 audit (plan 01a)

`AuditEvent`: `at`, `actor`, `category`, `action`, `object_type`, `object_id`, `object_label`, `changes`, `ip_address`, `request_id`. Triggers reject UPDATE, DELETE, TRUNCATE.

| Path | Methods and access | Name |
|---|---|---|
| `audit/business` | GET HR, EXEC | `audit:business` |
| `audit/security` | GET SYSADMIN, EXEC | `audit:security` |
| `audit/business/export` | GET HR, EXEC | `audit:business-export` |
| `audit/security/export` | GET SYSADMIN, EXEC | `audit:security-export` |

Filters: `actor` (account `public_id`), `action`, `object_type`, `object_id`, `from`, `to`. Lists are paginated `AuditEventOut`: `{id, at, actor, category, action, object_type, object_id, object_label, changes, ip_address, request_id}` where `actor` is a display name or null for the system. Exports return a workbook of the filtered list. Selector `events_for_object(object_type: str, object_id: str) -> QuerySet[AuditEvent]` serves histories in other apps.

### 7.4 settings (plan 01a)

| Path | Methods and access | Name |
|---|---|---|
| `settings/hr` | GET HR, EXEC | `settings:hr` |
| `settings/hr/{key}` | PUT HR | `settings:hr-item` |
| `settings/system` | GET SYSADMIN, EXEC | `settings:system` |
| `settings/system/{key}` | PUT SYSADMIN | `settings:system-item` |

The GET endpoints return a list of `SettingOut`: `{key, kind, value, default, minimum, maximum, updated_by, updated_at}`. PUT takes `{value}` and returns `SettingOut`. Error codes: `settings.unknown_key`, `settings.invalid_value`, `settings.out_of_range`.

### 7.5 notifications (plan 01a)

`Notification`: `user`, `event_code`, `parameters`, `target_type`, `target_public_id`, `dedupe_key`, `created_at`, `read_at`.

| Path | Methods and access | Name |
|---|---|---|
| `notifications` | GET AUTH (`?unread=1`) | `notifications:list` |
| `notifications/unread-count` | GET AUTH | `notifications:unread-count` |
| `notifications/{id}/read` | POST AUTH | `notifications:read` |
| `notifications/read-all` | POST AUTH | `notifications:read-all` |

`GET notifications` is paginated `{id, event, title, body, link, created_at, read_at}`, newest first. `unread-count` returns `{count}`. The two POST endpoints return 204.

Events registered in 01a: `account.password_reset`, `job.failed`, `error.unexpected`.

### 7.6 files (plan 02)

`Attachment`: `public_id`, `kind` (`medical`, `proof`, `scanned_form`, `employee_document`), `original_name`, `content_type`, `size`, `sha256`, `storage_path`, `is_encrypted`, `uploaded_by`, `uploaded_at`.

```python
# apps/files/services.py
def store_upload(*, actor: User, upload: UploadedFile, kind: str) -> Attachment     # size, extension and magic-byte checks; medical files are encrypted with Fernet
def read_for_download(*, user: User, attachment: Attachment) -> tuple[bytes, str, str]   # (content, download name, content type); checks access; audits medical and employee_document
def register_access_rule(kind: str, rule: Callable[[User, Attachment], bool]) -> None
```

Error codes: `files.too_large`, `files.type_not_allowed`, `files.content_mismatch`, `files.empty`.

| Path | Methods and access | Name |
|---|---|---|
| `attachments/{public_id}/download` | GET AUTH (404 unless an access rule allows) | `files:download` |

### 7.7 organisation (plan 02)

Models as PRD 8.2 with D4, D6 and D7. `Employee` and `ProfileChange` and `Delegation` carry `public_id`. Proposable fields: `first_name`, `last_name`, `date_of_birth`, `gender`, `personal_email`, `phone`, `address`, `emergency_contact_name`, `emergency_contact_phone`.

```python
# apps/organisation/services.py
def create_department(*, actor, code, name_fr, name_en) -> Department        # likewise update_department, set_department_active
def create_position(*, actor, code, title_fr, title_en, grade="") -> Position  # likewise update_position, set_position_active
def create_employee(*, actor: User, data: Mapping[str, Any]) -> Employee
def update_employee(*, actor: User, employee: Employee, data: Mapping[str, Any]) -> Employee
def archive_preview(*, employee: Employee) -> ArchivePreview                  # reports needing a manager, plus sections from contributors
def archive_employee(*, actor: User, employee: Employee, leaving_date: date, reason: str) -> Employee
def register_archive_contributor(fn: Callable[[Employee], ArchiveSection | None]) -> None   # ArchiveSection(key: str, items: list[ArchiveItem(label, link)])
def add_document(*, actor: User, employee: Employee, upload: UploadedFile, label: str, visible_to_employee: bool) -> EmployeeDocument
def set_document_visibility(*, actor: User, document: EmployeeDocument, visible_to_employee: bool) -> EmployeeDocument
def propose_profile_change(*, user: User, changes: Mapping[str, Any], note: str = "") -> ProfileChange
def decide_profile_change(*, actor: User, change: ProfileChange, accept: bool, comment: str = "") -> ProfileChange
def withdraw_profile_change(*, user: User, change: ProfileChange) -> ProfileChange
def create_delegation(*, actor: User, manager: Employee, delegate: Employee, start_date: date, end_date: date) -> Delegation
def end_delegation(*, actor: User, delegation: Delegation, today: date | None = None) -> Delegation   # ends an active one today; cancels an upcoming one
def announce_delegation_transitions(*, today: date | None = None) -> int     # job body

# apps/organisation/selectors.py
def get_employee_for(user, public_id: str) -> Employee                        # NotFound outside reach
def employees_for(user, *, include_archived: bool = False) -> QuerySet[Employee]
def directory() -> QuerySet[Employee]                                         # active employees, for pickers
def direct_reports(employee: Employee) -> QuerySet[Employee]
def manager_user(employee: Employee) -> User | None                           # the manager's active account
def acting_users_for_manager(manager: Employee, *, on: date | None = None, excluding_employee_id: int | None = None) -> list[User]   # manager and active delegates with usable accounts
def full_name(employee: Employee) -> str
def department_name(employee: Employee, lang: str) -> str
def active_delegations(*, manager: Employee | None = None, delegate: Employee | None = None, on: date | None = None) -> QuerySet[Delegation]
```

Error codes are prefixed `organisation.`: `number_taken`, `email_taken`, `email_domain`, `contract_dates`, `manager_loop`, `manager_self`, `in_use`, `already_archived`, `nothing_to_change`, `field_not_proposable`, `change_already_open`, `change_already_decided`, `delegation_overlap`, `delegation_self`, `delegation_dates`, `delegation_not_manager`.

| Path | Methods and access | Name |
|---|---|---|
| `departments`, `positions` | GET HR, EXEC; POST HR | `organisation:department-list`, `:position-list` |
| `departments/{id}`, `positions/{id}` | PATCH HR | `organisation:department-detail`, `:position-detail` |
| `employees` | GET MANAGER, HR, EXEC (reach); POST HR | `organisation:employee-list` |
| `employees/directory` | GET MANAGER, HR, EXEC | `organisation:employee-directory` |
| `employees/me` | GET EMPLOYEE | `organisation:employee-me` |
| `employees/{public_id}` | GET EMPLOYEE, HR, EXEC (reach, else 404); PATCH HR | `organisation:employee-detail` |
| `employees/{public_id}/archive-preview` | GET HR | `organisation:employee-archive-preview` |
| `employees/{public_id}/archive` | POST HR | `organisation:employee-archive` |
| `employees/{public_id}/documents` | GET EMPLOYEE (own, shared only), HR, EXEC; POST HR | `organisation:employee-documents` |
| `employees/{public_id}/documents/{id}` | PATCH HR | `organisation:employee-document` |
| `employees/{public_id}/history` | GET HR, EXEC | `organisation:employee-history` |
| `profile-changes` | GET EMPLOYEE (own), HR (all); POST EMPLOYEE | `organisation:profile-change-list` |
| `profile-changes/{public_id}` | GET EMPLOYEE (own), HR | `organisation:profile-change-detail` |
| `profile-changes/{public_id}/decide` | POST HR | `organisation:profile-change-decide` |
| `profile-changes/{public_id}/withdraw` | POST EMPLOYEE (own) | `organisation:profile-change-withdraw` |
| `delegations` | GET MANAGER, HR; POST MANAGER, HR | `organisation:delegation-list` |
| `delegations/{public_id}/end` | POST MANAGER (own), HR | `organisation:delegation-end` |

A manager reading an employee of their team receives only name, department, position, professional email and phone (`EmployeeTeamOut`). Own record, HR and EXEC receive `EmployeeOut`.

Notification events: `profile_change.proposed` (HR), `profile_change.accepted`, `profile_change.rejected` (employee), `delegation.started`, `delegation.ended` (manager and delegate).

### 7.8 calendar (plans 03a and 05)

`PublicHoliday`: `date` (unique), `name_fr`, `name_en`, `recurs_yearly`.

```python
# apps/calendar/workdays.py   (plan 03a)
def is_working_day(day: date) -> bool
def working_days(start: date, end: date) -> list[date]                  # inclusive
def day_portions(start: date, end: date, *, starts_at_midday: bool, ends_at_midday: bool) -> dict[date, Decimal]   # working day -> 1 or 0.5
def skipped_days(start: date, end: date) -> list[tuple[date, str]]      # ("weekend" | "holiday")
def add_working_days(start: date, count: int) -> date
def working_days_between(earlier: datetime, later: datetime) -> int     # whole working days elapsed
# apps/calendar/services.py
def create_holiday(*, actor, date, name_fr, name_en, recurs_yearly=False) -> PublicHoliday   # likewise update_holiday, delete_holiday
def copy_recurring_holidays(*, actor, from_year: int, to_year: int) -> list[PublicHoliday]
# apps/calendar/selectors.py
def holidays_between(start: date, end: date) -> QuerySet[PublicHoliday]
def calendar_feed(user, *, start: date, end: date, scope: str, department_id=None, employee_public_id=None, type_code=None, status=None) -> CalendarFeed   # plan 05
```

| Path | Methods and access | Name | Plan |
|---|---|---|---|
| `holidays` | GET EMPLOYEE, HR, EXEC (`?year=`); POST HR | `calendar:holiday-list` | 03a |
| `holidays/{id}` | PATCH, DELETE HR | `calendar:holiday-detail` | 03a |
| `holidays/copy` | POST HR | `calendar:holiday-copy` | 03a |
| `holidays/impact` | GET HR (`?date=`) | `calendar:holiday-impact` | 03a |
| `calendar` | GET EMPLOYEE, HR, EXEC (`?from=&to=&scope=department|team|company`) | `calendar:feed` | 05 |

`calendar` returns `{holidays: [{date, name}], entries: [{employee: {public_id, name}, start_date, end_date, starts_at_midday, ends_at_midday, label, type_code, type_name, status, request_public_id, mine}]}`. In `department` scope, entries of other people carry `label` (`absent` or `remote`) and null `type_code`, `type_name`, `status`, `request_public_id`, show approved requests only, and omit types whose `calendar_label` is `hidden`. `team` requires MANAGER, `company` requires HR or EXEC.

### 7.9 requests (plan 03a)

Models as PRD 8.4 with D4, D5, D7. Enumerations: `RequestStatus` (`draft`, `pending`, `returned`, `approved`, `rejected`, `withdrawn`, `cancelled`), `StepStatus` (`waiting`, `pending`, `approved`, `rejected`, `returned`, `notified`, `skipped`), `AmendmentStatus` (`pending`, `approved`, `rejected`, `withdrawn`), `ApproverRule` (`line_manager`, `hr_role`, `named_person`), `StepMode` (`approve`, `notify`), `Channel` (`in_app`, `verbal`, `paper`), `Decision` (`approve`, `reject`, `return`). Seeded type codes: `annual`, `sick`, `exceptional`, `permission`, `remote`.

`RequestStep` rows belong to a `round` (1, 2, …); a resubmission after a return creates a new round and keeps the old rows. `RequestStep.decided_by` references `organisation.Employee` (the person whose decision it is, who may have no account when the decision was given on paper); `RequestStep.recorded_by` references `accounts.User` (the HR holder who entered it) and is empty for a decision made in the application. A user without an employee record cannot decide a step (`request.actor_without_record`). `RequestAttachment`: `request`, `attachment`, `step` (optional), `added_by`, `added_at`.

```python
# apps/requests/services/   (a package; names are importable from apps.requests.services)
@dataclass(frozen=True)
class RequestData:
    start_date: date; end_date: date
    starts_at_midday: bool = False; ends_at_midday: bool = False
    start_time: time | None = None; end_time: time | None = None
    exceptional_event_id: int | None = None; comment: str = ""

def compute_quantity(request_type: RequestType, data: RequestData) -> Decimal
def leave_days(request_type: RequestType, data: RequestData) -> dict[date, Decimal]     # {} for hour-based types
def validate(*, employee: Employee, request_type: RequestType, data: RequestData, override: bool = False,
             ignoring_request_id: int | None = None, today: date | None = None) -> list[Problem]
def preview(*, actor: User, employee: Employee, request_type: RequestType, data: RequestData, override: bool = False) -> Preview
def create_draft(*, actor: User, employee: Employee, request_type: RequestType, data: RequestData, override_reason: str = "") -> Request
def update_request(*, actor: User, request: Request, data: RequestData, expected_version: int) -> Request
def discard_draft(*, actor: User, request: Request) -> None
def submit(*, actor: User, request: Request, expected_version: int | None = None) -> Request
def withdraw(*, actor: User, request: Request) -> Request
def decide_step(*, actor: User, step: RequestStep, decision: Decision, comment: str = "", expected_version: int) -> Request
def record_on_behalf(*, actor: User, step: RequestStep, decided_by: Employee, decision: Decision, decided_at: datetime,
                     channel: Channel, note: str, scan: UploadedFile | None = None, expected_version: int) -> Request
def reassign_step(*, actor: User, step: RequestStep, new_approver: Employee, reason: str) -> RequestStep
def open_amendment(*, actor: User, request: Request, kind: str, data: RequestData | None, reason: str) -> Amendment
def withdraw_amendment(*, actor: User, amendment: Amendment) -> Amendment
def hr_correct(*, actor: User, request: Request, data: RequestData, reason: str) -> Request
def hr_cancel(*, actor: User, request: Request, reason: str) -> Request
def reclassify_as_annual(*, actor: User, request: Request, override_reason: str = "") -> Request
def attach_file(*, actor: User, request: Request, upload: UploadedFile) -> RequestAttachment
def resolve_approvers(step: RequestStep) -> list[User]
def can_act_on(user: User, step: RequestStep) -> bool
def send_reminders_and_flags(*, now: datetime | None = None) -> dict[str, int]
def check_certificate_deadlines(*, now: datetime | None = None) -> dict[str, int]

# apps/requests/selectors.py
@dataclass(frozen=True)
class DayRow:
    request_id: int; request_public_id: str; employee_id: int; type_code: str
    day: date; portion: Decimal; hours: Decimal | None; status: str
def day_rows(*, start: date, end: date, statuses: Iterable[str], employee_ids: Iterable[int] | None = None,
             type_codes: Iterable[str] | None = None) -> list[DayRow]     # one row per working day of each day-based request clipped to the period; one row per hourly permission
def requests_for(user, scope: str) -> QuerySet[Request]                   # "mine" | "team" | "all" | "decided"
def get_request_for(user, public_id: str) -> Request
def queue(user, name: str) -> QuerySet[RequestStep]                        # "mine" | "hr" | "certificates" | "stuck"
def reserved_days(employee_id: int, *, ignoring_request_id: int | None = None) -> dict[date, Decimal]   # pending requests of deducting types plus days added by pending amendments
def waiting_rows(*, employee_ids: Iterable[int] | None = None) -> list[WaitingRow]      # request, step, waiting_on (names), since, reminded_at, flagged_at
def outstanding_certificates(*, employee_ids: Iterable[int] | None = None, now: datetime | None = None) -> list[CertificateRow]  # request, due_at, overdue (timedelta | None)
def certificate_status(request: Request, *, now: datetime | None = None) -> str         # "not_needed" | "attached" | "due" | "overdue" | "missing"
def decision_context(request: Request) -> DecisionContext                                # balance (from the port), teammates_away, cap usage
def requests_touching(day: date) -> QuerySet[Request]                                    # approved requests covering a date, for the holiday warning
```

The balance port, defined by `requests` and implemented by `balances`:

```python
# apps/requests/ports.py
@dataclass(frozen=True)
class BalanceVerdict: ok: bool; shortfall: Decimal = Decimal("0"); first_negative_on: date | None = None
@dataclass(frozen=True)
class BalancePreview: now: Decimal; on_start: Decimal; after: Decimal

class BalancePort(Protocol):
    def check(self, *, employee_id: int, new_days: Mapping[date, Decimal], ignoring_request_id: int | None = None) -> BalanceVerdict: ...
    def preview(self, *, employee_id: int, new_days: Mapping[date, Decimal], ignoring_request_id: int | None = None) -> BalancePreview | None: ...
    def post_taken(self, *, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor: User | None) -> None: ...
    def post_restored(self, *, request_id: int, employee_id: int, days: Mapping[date, Decimal], actor: User | None, reason: str) -> None: ...

def set_balance_port(port: BalancePort) -> None
def balance_port() -> BalancePort            # NullBalancePort until plan 04: check -> ok, preview -> None, posts do nothing
```

`requests` calls `check` at submission and again at final approval for types whose `balance_effect` is `deducts_annual`, inside `reach.lock_employee`. It calls `post_taken` on final approval and `post_restored` when approved days are released (cancellation, shortening, amendment, HR correction). `ignoring_request_id` makes the port disregard that request's ledger entries and reservations.

Error codes are prefixed `request.`: `actor_without_record`, `end_before_start`, `no_working_day`, `half_day_not_allowed`, `half_day_on_non_working_day`, `past_dates`, `notice`, `overlap` (params `other`), `balance_insufficient` (param `shortfall`), `cap_exceeded` (params `limit`, `used`), `event_required`, `event_days_exceeded` (param `allowed`), `permission_non_working_day`, `permission_times`, `permission_overlaps_absence`, `reason_required`, `comment_required`, `not_editable`, `not_withdrawable`, `already_processed`, `own_request`, `not_started_only`, `amendment_open`, `type_inactive`, `chain_needs_approver`.

| Path | Methods and access | Name |
|---|---|---|
| `request-types` | GET EMPLOYEE, HR, EXEC; POST HR | `requests:type-list` |
| `request-types/{id}` | GET HR, EXEC; PATCH HR | `requests:type-detail` |
| `request-types/{id}/steps` | GET HR, EXEC; PUT HR | `requests:type-steps` |
| `request-types/{id}/chain-preview` | GET HR (`?employee=`) | `requests:type-chain-preview` |
| `exceptional-events` | GET EMPLOYEE, HR, EXEC; POST HR | `requests:event-list` |
| `exceptional-events/{id}` | PATCH HR | `requests:event-detail` |
| `requests` | GET EMPLOYEE, HR, EXEC (`?scope=`); POST EMPLOYEE, HR | `requests:request-list` |
| `requests/preview` | POST EMPLOYEE, HR | `requests:request-preview` |
| `requests/{public_id}` | GET EMPLOYEE, HR, EXEC; PATCH, DELETE EMPLOYEE, HR | `requests:request-detail` |
| `requests/{public_id}/submit` | POST EMPLOYEE, HR | `requests:request-submit` |
| `requests/{public_id}/withdraw` | POST EMPLOYEE | `requests:request-withdraw` |
| `requests/{public_id}/attachments` | GET EMPLOYEE, HR, EXEC; POST EMPLOYEE, HR | `requests:request-attachments` |
| `requests/{public_id}/amendments` | GET EMPLOYEE, HR, EXEC; POST EMPLOYEE | `requests:request-amendments` |
| `amendments/{public_id}/withdraw` | POST EMPLOYEE | `requests:amendment-withdraw` |
| `requests/{public_id}/correct`, `/cancel`, `/reclassify` | POST HR | `requests:request-correct`, `-cancel`, `-reclassify` |
| `requests/{public_id}/history` | GET EMPLOYEE, HR, EXEC | `requests:request-history` |
| `approvals` | GET EMPLOYEE, HR, EXEC (`?queue=`) | `requests:approval-list` |
| `steps/{id}/decide` | POST EMPLOYEE, HR, EXEC (404 unless `can_act_on`) | `requests:step-decide` |
| `steps/{id}/record-on-behalf`, `/reassign` | POST HR | `requests:step-record-on-behalf`, `-reassign` |

Scopes: `mine` (own), `team` (needs MANAGER), `all` (needs HR or EXEC), `decided` (steps the user decided). Queues `hr`, `certificates` and `stuck` need HR.

The request representation, shared by every list, queue and detail:

```jsonc
// RequestOut
{
  "public_id": "…", "version": 3,
  "employee": {"public_id": "…", "name": "…", "department": "…"},
  "type": {"code": "annual", "name": "…", "unit": "day", "calendar_label": "absent"},
  "start_date": "2026-11-03", "end_date": "2026-11-05",
  "starts_at_midday": false, "ends_at_midday": false, "start_time": null, "end_time": null,
  "quantity": "3.00",
  "event": null,                              // {"id": 1, "name": "…"}
  "comment": "…", "comment_hidden": false,    // comment is null and comment_hidden true when the viewer may not read it
  "status": "pending",
  "state": {
    "key": "waiting_manager",                 // draft | waiting_manager | waiting_hr | waiting_person | returned | approved | rejected | withdrawn | cancelled
    "waiting_on": ["Sami Ben Ali"],
    "last_actor": null,                       // who approved, returned or refused last
    "note": null,                             // the return comment or the refusal reason
    "since": "2026-10-28T09:12:00+01:00"
  },
  "certificate": {"status": "not_needed", "due_at": null},   // null for viewers who may not see it (D-sensitive)
  "amendment": null,                          // {"public_id": "…", "kind": "change", "status": "pending", "state_key": "waiting_hr", "waiting_on": ["HR"]}
  "has_override": false, "created_by_hr": false,
  "viewer": {"relation": "owner", "actions": ["edit", "withdraw"], "step_id": null},
  "submitted_at": "…", "decided_at": null, "created_at": "…"
}
// RequestDetailOut = RequestOut plus
//   "steps": [{"id", "round", "position", "rule", "mode", "status", "approvers": [names], "decided_by", "decided_at", "recorded_by", "channel", "comment", "amendment_public_id"}],
//   "attachments": [{"public_id", "kind", "name", "size", "uploaded_by", "uploaded_at"}],     // filtered by the viewer's rights
//   "amendments": [{"public_id", "kind", "status", "reason", "new_start_date", "new_end_date", "new_quantity", "created_at", "decided_at"}],
//   "decision_context": {"balance": {"now", "after"} | null, "teammates_away": [{"name", "label", "start_date", "end_date"}], "cap": {"used", "limit"} | null} | null
```

`viewer.relation` is `owner`, `approver`, `team`, `hr` or `overview`. `viewer.actions` is the complete list of what this viewer may do now, from: `edit`, `submit`, `discard`, `withdraw`, `amend`, `withdraw_amendment`, `attach`, `decide`, `record_on_behalf`, `reassign`, `correct`, `cancel`, `reclassify`. The frontend shows exactly these actions.

`POST requests/preview` takes `{type, employee?, start_date, end_date, starts_at_midday, ends_at_midday, start_time, end_time, exceptional_event, override}` and returns `{quantity, skipped_days: [{date, reason}], chain: [{position, rule, mode, approvers: [names]}], balance: {now, on_start, after} | null, usage: {cap: {used, limit, period} | null, month_hours: "…" | null, event_days_allowed: "…" | null}, certificate_due_at, problems: [{field, code, detail, params}]}`.

`GET approvals` returns paginated items `{step_id, request: RequestOut, waiting_since, via_delegation_from: name | null, decision_context}`.

Request bodies:

| Call | Body | Returns |
|---|---|---|
| `POST requests` | `{type, employee?, start_date, end_date, starts_at_midday, ends_at_midday, start_time, end_time, exceptional_event, comment, override_reason?}`; `type` is a type code; `employee` (a `public_id`) and `override_reason` are accepted from HR only | 201 `RequestDetailOut` (a draft) |
| `PATCH requests/{public_id}` | The same fields except `type` and `employee`, plus `version` | `RequestDetailOut` |
| `POST …/submit` | `{version}` | `RequestDetailOut` |
| `POST …/withdraw` | `{}` | `RequestDetailOut` |
| `POST …/attachments` | multipart `file` | 201 attachment item |
| `POST …/amendments` | `{kind, start_date?, end_date?, starts_at_midday?, ends_at_midday?, start_time?, end_time?, reason}`; `kind` is `cancel` or `change` | 201 `RequestDetailOut` |
| `POST …/correct` | `{start_date, end_date, starts_at_midday, ends_at_midday, start_time, end_time, reason}` | `RequestDetailOut` |
| `POST …/cancel` | `{reason}` | `RequestDetailOut` |
| `POST …/reclassify` | `{override_reason?}` | `RequestDetailOut` |
| `POST steps/{id}/decide` | `{decision, comment, version}` | `RequestDetailOut` |
| `POST steps/{id}/record-on-behalf` | multipart `{decided_by, decision, decided_at, channel, note, version, scan?}`; `decided_by` is an employee `public_id` | `RequestDetailOut` |
| `POST steps/{id}/reassign` | `{new_approver, reason}`; `new_approver` is an employee `public_id` | `RequestDetailOut` |
| `PUT request-types/{id}/steps` | `{steps: [{approver_rule, named_person, mode, reminder_after_days, flag_after_days}]}` in order; `named_person` is an employee `public_id` or null | The list of steps |
| `GET request-types/{id}/chain-preview?employee=` | | `[{position, rule, mode, approvers: [names]}]` |
| `GET requests/{public_id}/history` | | `[{at, actor, action, summary, changes}]`, oldest first, already filtered for the viewer |

`RequestTypeOut` carries every column of `RequestType` under its column name, plus `name` and `description` in the reader's language. `GET request-types` returns active types for EMPLOYEE and all types for HR and EXEC. `ExceptionalEventOut`: `{id, name_fr, name_en, name, days_allowed, proof_required, is_active}`.

Notification events: `step.to_decide`, `step.reminder`, `step.flagged` (HR), `request.approved`, `request.rejected`, `request.returned`, `request.withdrawn`, `request.cancelled`, `request.corrected`, `amendment.submitted`, `amendment.approved`, `amendment.rejected`, `sick.declared` (manager), `certificate.due_soon` (employee), `certificate.overdue` (HR), `delegation.prompt` (manager whose leave was approved), `hr_step.unattended` (System Administrators).

### 7.10 balances (plan 04)

`LedgerEntry`: `employee`, `kind` (`opening`, `credit`, `taken`, `restored`, `adjustment`), `amount` (signed), `effective_date`, `period`, `request_id` (plain integer referencing a request, no cross-app foreign key), `reason`, `created_by`, `created_at`. Unique on `(employee, period)` where `kind = credit`. Triggers reject UPDATE, DELETE, TRUNCATE.

```python
# apps/balances/services.py
def month_credit(employee: Employee, year: int, month: int) -> Decimal      # 6.2, pro-rated, rounded to the nearest 0.5
def post_month_end_credits(*, today: date | None = None) -> int             # job body; idempotent; catches up missed months
def post_opening(*, actor: User, employee: Employee, amount: Decimal, effective_date: date, reason: str) -> LedgerEntry
def adjust(*, actor: User, employee: Employee, amount: Decimal, effective_date: date, reason: str) -> LedgerEntry
# apps/balances/selectors.py
@dataclass(frozen=True)
class BalanceFigures: current: Decimal; pending: Decimal; approved_upcoming: Decimal; next_credit_amount: Decimal | None; next_credit_date: date | None
def figures(employee_id: int, *, today: date | None = None) -> BalanceFigures
def balance_on(employee_id: int, on: date) -> Decimal                        # posted entries only
def projected_balance(employee_id: int, on: date, *, extra_days: Mapping[date, Decimal] | None = None, ignoring_request_id: int | None = None) -> Decimal
def ledger_lines(employee_id: int) -> list[LedgerLine]                       # entry plus running balance, oldest first
def balances_at(on: date, *, employee_ids: Iterable[int] | None = None) -> dict[int, Decimal]
```

| Path | Methods and access | Name |
|---|---|---|
| `balances/{employee_public_id}` | GET EMPLOYEE, HR, EXEC (own, team, all; `?on=`) | `balances:figures` |
| `balances/{employee_public_id}/ledger` | GET same | `balances:ledger` |
| `balances/{employee_public_id}/adjustments` | POST HR (`kind` = `opening` or `adjustment`) | `balances:adjustments` |

Error codes: `balances.reason_required`, `balances.zero_amount`, `balances.opening_exists`. Notification event: `balance.adjusted`.

### 7.11 reports (plans 05 and 06)

| Path | Methods and access | Name | Plan |
|---|---|---|---|
| `home/me` | GET EMPLOYEE | `reports:home-me` | 05 |
| `home/team` | GET MANAGER | `reports:home-team` | 05 |
| `home/overview` | GET EXEC | `reports:home-overview` | 05 |
| `workspaces/summary` | GET AUTH | `reports:workspace-summary` | 05 |
| `reports/{name}` | GET MANAGER, HR, EXEC (`certificates`: HR only; `?format=xlsx`) | `reports:report` | 06 |
| `exports/kpmg` | GET HR | `reports:kpmg-export` | 06 |
| `exports/kpmg/default-period` | GET HR | `reports:kpmg-default-period` | 06 |

`home/me` returns `{balance: BalanceFigures, needs_you: [...], in_progress: [RequestOut], coming_up: [RequestOut]}`. `home/team` returns `{who_is_out: [...], delegation: {...} | null}`; the To decide block reads `approvals?queue=mine`. `home/overview` returns `{out_now, absence_this_month, leave_owed, waiting}`. The HR desk has no endpoint of its own: its four blocks read `approvals?queue=hr`, `?queue=certificates`, `?queue=stuck` and `profile-changes?status=pending`.

Report names: `absences`, `balances`, `waiting`, `permission-hours`, `remote-days`, `certificates`. Every report returns `{columns: [{key, label, kind}], rows: [...], totals: {...} | null}`; with `format=xlsx` it returns the same content as a workbook and writes a `report.exported` audit event. `workspaces/summary` returns `{me, team, hr, overview, admin}` with the count of things waiting in each.

## 8. Frontend conventions

### 8.1 API access

`src/api/schema.d.ts` is generated from `backend/openapi.yaml` and committed; the pipeline fails if it is stale.

```ts
// src/api/client.ts
export const api = createClient<paths>({ baseUrl: "/", credentials: "same-origin" });
// middleware: X-CSRFToken from the csrftoken cookie on unsafe methods; Accept-Language from i18n; 401 -> redirect to /login?next=…
export async function call<T>(promise: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T>;  // throws ProblemError

// src/api/problem.ts
export interface FieldProblem { field: string | null; code: string; detail: string; params: Record<string, unknown> }
export class ProblemError extends Error { status: number; code: string; detail: string; errors: FieldProblem[]; requestId: string }
```

Each feature keeps its hooks in `features/<feature>/api.ts`:

```ts
export const requestKeys = { all: ["requests"] as const, list: (p: ListParams) => ["requests", "list", p] as const, detail: (id: string) => ["requests", "detail", id] as const };

export function useRequest(id: string) {
  return useQuery({ queryKey: requestKeys.detail(id), queryFn: () => call(api.GET("/api/v1/requests/{public_id}", { params: { path: { public_id: id } } })) });
}
export function useWithdrawRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call(api.POST("/api/v1/requests/{public_id}/withdraw", { params: { path: { public_id: id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: requestKeys.all }),
  });
}
```

A mutation always invalidates the keys it affects, so pages show the new state without a refresh (U7). A 409 shows the "someone else acted first" message and refetches.

### 8.2 Forms

react-hook-form with a zod schema. `useProblemForm(form)` returns an `onError(problem)` that sets each `FieldProblem` on its input and collects field-less problems in a summary above the form. A failed submission never clears the form (U5).

### 8.3 Text

- Namespaces, one JSON file per language each: `common`, `nav`, `auth`, `shell`, `notifications`, `accounts`, `settings`, `audit`, `employees`, `profile`, `delegations`, `requests`, `balances`, `calendar`, `home`, `reports`, `errors`.
- A plan that creates a feature creates its namespace. `nav.json` and `common.json` are created complete in plan 01b.
- `src/i18n/parity.test.ts` (plan 01b) fails when the French and English files of a namespace have different keys.
- `lib/format.ts`: `formatDate`, `formatDateRange`, `formatDateTime`, `formatDays` ("2,5 jours" / "2.5 days"), `formatHours`, all taking the active language and the Africa/Tunis zone.
- Server texts (problem `detail`, notification `title` and `body`) are shown as received.

### 8.4 Tests

- Vitest with Testing Library and MSW. `test/render.tsx` exports `renderApp(ui, { route, me })`, which wraps providers, a memory router and a signed-in user; `test/fixtures.ts` exports `makeMe({ roles, workspaces })`; `test/server.ts` exports the MSW `server`.
- A page test covers: what is shown first, the primary action, each message the UI document lists for the page, and the absence of actions the viewer may not use.
- Queries use roles and accessible names (`getByRole("button", { name: … })`), never test ids for interactive elements.

```tsx
it("offers withdraw but not edit once the manager has decided", async () => {
  server.use(http.get("/api/v1/requests/abc", () => HttpResponse.json(makeRequest({ viewer: { relation: "owner", actions: ["withdraw"], step_id: null } }))));
  renderApp(<RequestPage />, { route: "/requests/abc", me: makeMe({ roles: ["employee"] }) });
  expect(await screen.findByRole("button", { name: "Retirer la demande" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Modifier" })).not.toBeInTheDocument();
});
```

- Playwright specs live in `frontend/e2e/`, one file per journey of UI section 12. `e2e/global-setup.ts` runs `e2e_reset`. Two projects: desktop Chromium and a phone viewport.

## 9. Frontend contract

### 9.1 Shell and workspaces (plan 01b)

`app/workspaces.ts` defines the five workspaces and their complete navigation as in the UI document section 3.1:

```ts
export type WorkspaceId = "me" | "team" | "hr" | "overview" | "admin";
export interface NavEntry { path: string; labelKey: string; icon: LucideIcon }
export interface Workspace { id: WorkspaceId; labelKey: string; home: string; nav: NavEntry[] }
export const WORKSPACES: Record<WorkspaceId, Workspace>;
export const LANDING_ORDER: WorkspaceId[] = ["admin", "hr", "overview", "team", "me"];
```

A navigation entry is rendered only when its path matches a registered route, so each plan makes entries appear by adding routes, never by editing `workspaces.ts`. A workspace is offered when the user has it (`me.workspaces`) and it has at least one rendered entry.

Each `workspaces/<id>/routes.tsx` exports a `RouteObject[]` (`meRoutes`, `teamRoutes`, `hrRoutes`, `overviewRoutes`, `adminRoutes`) whose paths are relative to the workspace. Later plans append elements to these arrays. `app/router.tsx` mounts them under `/me`, `/team`, `/hr`, `/overview`, `/admin` inside `AppShell`, each behind `RequireWorkspace`.

The index route of a workspace renders the component registered for it in `app/homes.ts`, or redirects to the first rendered navigation entry when none is registered:

```ts
// app/homes.ts: one line per workspace; a plan adds a line or replaces the value of a line
export const HOMES: Partial<Record<WorkspaceId, LazyExoticComponent<ComponentType>>> = {
  admin: lazy(() => import("@/features/accounts/StatusPage")),
};
```

| Key | Set by | Component |
|---|---|---|
| `admin` | 01b | `features/accounts/StatusPage` |
| `team` | 03b, replaced by 05 | `features/requests/queues/ToDecidePage`, then `features/home/TeamHomePage` (which renders 03b's `ToDecideBlock`) |
| `hr` | 03b | `features/home/HrDeskPage` |
| `me`, `overview` | 05 | `features/home/MeHomePage`, `features/home/OverviewHomePage` |

Page components are default exports. `/requests/:id` (plan 03b) picks the view from `viewer.relation` and switches the shell to the matching workspace.

Layout (D23): on desktop a 240px sidebar holds the logo, the workspace switcher, the navigation and, at the bottom, notifications, language and the user menu; content sits on the canvas with a maximum width of 1440px. On a phone a 60px top bar holds the workspace name, notifications and the user menu, and a 64px bottom tab bar holds the navigation. On the test stack a strip states that this is not production.

### 9.2 Shared components (plan 01b)

In `src/components/`. Later plans use these and do not create alternatives.

| Component | Purpose |
|---|---|
| `PageHeader` | Title and the page's one primary action (`title`, `primary?: ReactNode`, `back?: To`) |
| `DataTable` | A table of at most six columns that becomes a list of cards on a phone (`columns`, `rows`, `rowKey`, `onRowOpen?`, `empty`, `isLoading`) |
| `Pager` | Page navigation for a paginated list |
| `FilterBar` | Up to three visible filters, the rest behind "More filters" (`children`, `more?`) |
| `useListParams` | Filters, sort and page kept in the URL so they survive opening an item and coming back |
| `EmptyState` | Why a list is empty and the action that would fill it |
| `TaskSheet` | The 480px right sheet for a focused task, full screen on a phone (`open`, `onOpenChange`, `title`, `children`, `footer`) |
| `ConfirmDialog` | A confirmation that states the consequence (`title`, `consequence`, `confirmLabel`, `onConfirm`, `destructive?`) |
| `Field`, `FormSummary`, `useProblemForm` | A labelled input with its error; the summary of field-less problems |
| `StatusBadge` | A coloured dot and a sentence (`tone`: `waiting`, `approved`, `refused`, `info`, `neutral`) |
| `Disclosure` | A "one step away" block, closed by default |
| `Figure` | The one large number of a page |
| `DateField`, `DateRangeFields`, `TimeField`, `SelectField`, `TextField`, `TextAreaField`, `FileField`, `SwitchField` | Form inputs bound to react-hook-form |
| `toast` | Acknowledgement of an action, with optional undo |
| `ProblemBoundary`, `NotAvailable`, `SomethingWentWrong` | The pages of UI 10.4 |

### 9.3 Extension points between plans

| File | Created by | Extended by |
|---|---|---|
| `workspaces/*/routes.tsx` | 01b | every later plan appends routes |
| `app/homes.ts` | 01b | 03b, 05 (table in 9.1) |
| `features/shell/workspaceCounts.ts` (`useWorkspaceCounts(): Partial<Record<WorkspaceId, number>>`, shown in the switcher) | 01b (returns `{}`) | 05 replaces it (reads `workspaces/summary`) |
| `features/accounts/SubjectFields.tsx` (who the account is for) | 01b (name and email) | 02 replaces it (employee picker or name and email) |
| `features/employees/recordBlocks.tsx`: `RECORD_BLOCKS: RecordBlock[]`, each `{ id, titleKey, order, modes: RecordMode[], render(employee, mode) }`, and `RECORD_FACTS: RecordFact[]`, each `{ id, labelKey, order, modes: RecordMode[], render(employee) }` for the "shown first" line; `RecordMode = "hr" | "team" | "overview"` | 02 | 03b appends the Requests block; 04 appends the Balance block and the balance fact |
| `features/settings/SettingsGroupPage.tsx` (`{ group: "hr" | "system"; readOnly?: boolean }`; renders any settings group from the API; labels from `settings.json` under `<key>.label` and `<key>.hint`) | 01b | 03b mounts it for the HR group; 03b, 04, 06 add labels |
| `features/audit/AuditLogPage.tsx` (`{ category: "security" | "business" }`) | 01b | 06 mounts it for the activity log and under Oversight |
| `features/requests/RequestView.tsx` | 03b | none: balance context appears when the API returns it |
| `features/employees/EmployeePicker.tsx`, `features/delegations/DelegationSheet.tsx` | 02 | used by 03b |
| `i18n/locales/*/settings.json` | 01b | 03b, 04, 06 add keys |

Every settings, accounts, status and log page component takes `readOnly?: boolean`. When true it renders no action at all. Plan 06 mounts these pages under Overview, Oversight with `readOnly`. This covers `StatusPage`, `AccountsPage`, `AccountPage` (01b), `DepartmentsPositionsPage` (02) and `RequestTypesPage`, `TypeStepsPage`, `EventsPage`, `HolidaysPage` (03b).

Backend files extended by appending one line per plan: `INSTALLED_APPS` in `config/settings.py`, `config/api_urls.py`, `MATRIX_MODULES` in `backend/tests/test_permission_matrix.py`, `build_world()` in `backend/tests/world.py`, `SEEDERS` in `apps/core/management/commands/seed_demo.py`.

### 9.4 Pages and the plan that builds them

| Workspace | Pages | Plan |
|---|---|---|
| None | Sign in, choose a new password, after-sign-in notice, change password, notifications, not available, something went wrong, being updated | 01b |
| Administration | Status, accounts, create account, account, parameters, security log | 01b |
| HR desk | Employees, employee record, new and edit employee, record a departure, profile changes, settings index, departments and positions | 02 |
| My space | Profile, propose a change | 02 |
| My team | People, person, delegations | 02 |
| Overview | People, person | 02 |
| My space | Requests, new and edit request, request (my view), change or cancel | 03b |
| My team | To decide (the queue), request (manager view), requests | 03b |
| HR desk | Desk, to validate, certificates, stuck with a manager, requests, new request for an employee, request (HR view) with HR actions, settings: request types, steps, events, public holidays, parameters | 03b |
| Overview | Requests, request (overview view) | 03b |
| My space | Balance | 04 |
| HR desk | Adjust a balance, opening balance | 04 |
| All four | Calendar | 05 |
| My space, Overview | Home | 05 |
| My team | The "Who is out" and "Delegation" blocks around the To decide queue | 05 |
| My team, HR desk, Overview | Reports | 06 |
| HR desk | KPMG export, activity log | 06 |
| Overview | Oversight | 06 |

## 10. Review focus for the whole set

The inputs most likely to hurt a person using this software. Each plan repeats those it owns and adds its own; plan 07 verifies all of them end to end.

1. **Half-days and non-working boundaries.** A request starting on a Saturday, ending on a holiday, or a single day flagged at both ends must produce an obvious quantity or a clear refusal (owner: 03a).
2. **Periods that cross a boundary.** Leave spanning two months, two years or the export period must be split correctly in the ledger, the reports and the KPMG file (owners: 04, 06).
3. **Nobody to approve.** A requester with no manager (the CEO), with an archived manager, who is the only HR holder, or who is their own delegate must end with a request that somebody other than themselves decides (owner: 03a).
4. **Two actions at once.** A double click on Send, two approvers on one step, an approval racing a withdrawal: exactly one succeeds and the other is told what happened (owner: 03a, 03b).
5. **Configuration changed mid-flight.** A chain, a type, a holiday or the working week edited while requests are pending or approved must not change requests already submitted (owner: 03a).
6. **The clock.** Month-end credit after downtime, in February, for someone who joined or left mid-month, and run twice in a day (owner: 04).
7. **Hostile or sloppy uploads.** A renamed executable, an empty file, a 50 MB file, a name with accents or path separators (owner: 02).
8. **Sign-in edge cases.** Mixed-case email, surrounding spaces, a lookalike domain, a locked account with the right password, an expired temporary password (owner: 01a).
9. **Leaked medical detail.** The sick-leave comment or certificate name appearing in a list, a notification, the audit trail, a report, an export or a manager's view (owners: 03a, 07).
10. **A session that ends while a form is open.** The user signs in again and finds the draft (owner: 03b).

## 11. Spec coverage

| Spec section | Plan |
|---|---|
| PRD 5.1 Accounts (ACC-01 to ACC-11) | 01a (API), 01b (pages); ACC-10 completed in 02 |
| PRD 5.2 Organisation (ORG-01 to ORG-08) | 02 |
| PRD 5.3 Requests (REQ-01 to REQ-18) | 03a (API), 03b (pages); REQ-11 in 02; REQ-12 in 03a |
| PRD 5.4 Balances (BAL-01 to BAL-07) | 04 |
| PRD 5.5 Calendar (CAL-01 to CAL-06) | CAL-01 in 03a; the rest in 05 |
| PRD 5.6 Notifications (NOT-01 to NOT-05) | 01a, 01b; events in the plan that raises them |
| PRD 5.7 Home screens | 05 |
| PRD 5.8 Reports and export (REP-01 to REP-08) | 06 |
| PRD 5.9 Administration (ADM-01 to ADM-07) | ADM-06, ADM-07 in 01a/01b; ADM-01 to ADM-05 in 03a/03b; settings keys per section 6.7 |
| PRD 5.10 Audit (AUD-01 to AUD-06) | 01a; activity-log page in 06; security-log page in 01b |
| PRD 6 Business rules | 6.1, 6.4 to 6.9 in 03a; 6.2, 6.3 in 04 |
| PRD 7 Permission matrix | Each plan for its endpoints; completed and swept in 07 |
| PRD 9.5 Jobs | Section 6.9 |
| PRD 9.6 Files | 02 |
| PRD 10 Security | 01a (accounts, sessions, CSRF), 01b (headers, HTTPS), 02 (uploads), 07 (verification) |
| PRD 11 Non-functional | NFR-02 measured in 07; NFR-06, NFR-08 in every frontend plan and checked in 07 |
| PRD 12 Deployment | 12.1 to 12.6 in 01a/01b; 12.7 backups, 12.9 go-live, 12.10 documents in 07 |
| UI 2 Principles | Global constraints; checked per page in each frontend plan; audited in 07 |
| UI 3 to 4 Shell and sign-in | 01b |
| UI 5 My space | 02 (profile), 03b (requests), 04 (balance), 05 (home, calendar) |
| UI 6 My team | 02 (people, delegations), 03b (queue, requests), 05 (home blocks, calendar), 06 (reports) |
| UI 7 HR desk | 02 (employees, profile changes), 03b (desk, queues, requests, settings), 04 (balances), 05 (calendar), 06 (reports) |
| UI 8 Overview | 02 (people), 03b (requests), 05 (home, calendar), 06 (reports, oversight) |
| UI 9 Administration | 01b |
| UI 10 to 12 Shared content, inventory, journeys | With the pages; journeys as browser tests in each plan and completed in 07 |

## 12. Open items that touch the plans

| PRD open item | Effect on the plans |
|---|---|
| 2. KPMG sample file | Plan 06 builds the columns of REP-04. Aligning them with the sample is one task to redo when it arrives. |
| 3. Exceptional events, holidays, confirmation of A2, A5, A6 | Production starts with no events and no holidays; HR enters them at go-live. Demo data carries examples. |
| 4. Cloud backup destination | Plan 07 writes encrypted backups to the server's backup volume only. |
| 7. Server hardware, hostname, certificate | Plan 01b uses Caddy's internal certificate authority by default and accepts a supplied certificate. |
| 8. Names of HR and System Administrator holders | Needed at the rehearsal in plan 07. |

## 13. What the step plans added to this contract

The nine step plans were written against sections 4 to 9. Where one of them had to decide something those sections leave open, it recorded the choice in its own "Contract notes". This section collects the choices that more than one plan depends on. Where a step plan and sections 6 to 9 differ on a point listed here, the step plan is right.

### 13.1 Conventions every plan follows

| Convention | Set by |
|---|---|
| Services pass `actor=actor` to `audit.record`. The default (the request's user) is right only inside a request. | 01a |
| Every `@extend_schema` sets a unique `operation_id`; every `SerializerMethodField` has `@extend_schema_field`; every choice set has an entry in `ENUM_NAME_OVERRIDES`. The OpenAPI test fails on any warning. Each plan that adds an endpoint regenerates `backend/openapi.yaml`. | 01a |
| Each `seed.py` exposes `seed()`, safe to run twice. `SEEDERS` runs in this order: accounts, organisation, calendar, balances, requests. | 01a, 03a, 04 |
| A refused sign-in answers 400 with its code (429 for the address limit). 401 means only "no session". CSRF is enforced on every unsafe call, sign-in included: the web app calls `GET auth/csrf` (it returns `{csrf_token}`) before its first POST. | 01a |
| A validation error from DRF has the top-level code `core.validation`; each entry has the code `validation.<DRF code>` and a dotted `field` path. `DomainError.code` is optional; each class has a default. | 01a |
| `health` answers 503 until the worker's first heartbeat, about 90 seconds after a restart. The update command waits up to three minutes. | 01a, 01b |
| The cast builder reseeds the five request types after a transactional test has emptied the tables. | 01a, 03a |
| Frontend tests run in French; a missing translation key throws; the test server refuses a request nobody answers. A plan whose component is drawn inside another plan's page appends a default answer to `frontend/src/test/handlers.ts`. | 01b, 02, 03b, 04, 05 |
| Response and request types are derived from the generated schema in `@/api/types`. Plan 03b's request types are written by hand, with a compile-time check against the schema. | 01b, 03b |
| The exact props of the shared components are in plan 01b's contract note 7 (`DataTable` columns have a `key`; `Pager` takes `page`, `pageSize`, `total`, `onPage`; `useLang()` gives the language the formatters take). | 01b |
| `docs/execution-notes.md` records, plan by plan, every public name, shape or command that ended up different from the plans once the code was run. Each implementer reads it before starting and adds to it. Where it and a plan differ, it is right. | all |
| A view whose route a page calls on a timer (`refetchInterval`) declares `background = True` on the view class. Such a call is still checked against the inactivity limit (past it: 401 and the session is ended) but never pushes the limit back; otherwise a page left open would keep its session for ever. Marked: `notifications/unread-count`, `admin/status`; plan 05 marks `workspaces/summary`. Each marked route has a line in `apps/accounts/tests/test_background_calls.py`. Opening the Status page alone is therefore not activity. | 01a, at review |
| A failed sign-in is logged with the text typed in the email box only when it has the shape of an email address; otherwise the label is the constant `apps.accounts.emails.NOT_AN_ADDRESS`, so that a password typed in the wrong box never reaches the security log. | 01a, at review |
| The services that change roles or an account's active state take the advisory lock `ADMINISTRATION_LOCK` for the length of their transaction. A plan that adds another advisory lock uses a different key. | 01a, at review |
| A page that holds a form over a query writes `if (query.error && !awayWithData(query)) throw query.error` (`awayWithData` from `@/api/problem`), not the plain `if (query.error) throw query.error` that the code blocks of plans 02, 03b and 04 show: otherwise a save attempted while the application is away replaces the form and loses what was typed. A read-only page keeps the plain line, so that it says "being updated" instead of showing old figures. | 01b, at review |
| Anything a page keeps in browser storage about a person is cleared at sign-out, in the place where `forgetLists()` is called (`useLogout`). | 01b, at review |
| A service that writes fixed text into an audit event's `object_label` adds its case to `objectLabel` in `features/audit/labels.ts` with both translations. | 01b |
| A server text (notification, error detail) writes a number of days or hours as `{x:days}` or `{x:hours}`, never "{x} jours": `apps.core.i18n` then writes it in the reader's language with the right separator and singular or plural. | 04, at review |
| A balance "at a date" counts the ledger lines posted up to that date. The month-end credit is written in the first hour after the month's last day and dated that day, so a figure read on or before a month's last day has no credit for that month. Plan 06: for a report or export, add the credits due up to the period end that are not posted yet, whether the period ends in the past, today or later (a month that has just ended may not have been credited yet), and say so in a note (on the page, and on a separate "Notes" sheet of a workbook, never under the data). | 04, at review |
| A link to a download or an export is written with `DownloadLink` from `@/components`, not as a plain `<a>`: it stays a link with its `href` (tests on `role="link"` and `href` hold), and an ordinary click goes through the API client, so that a session that has ended leads to Sign in and back instead of showing the API's raw answer. Applies to the attachments of plan 03b and the exports of plans 06 and 07. | 02, at review |
| "No manager" means `employee.manager_id is None`, never `manager_user() is None`: the reports of someone who left keep that person as manager until HR names a new one, and `manager_user()` returns nobody for them. A request then follows D13 (the step stays pending and is flagged to HR), not the "no manager" rule of 6.9. | 02, at review |
| A field a role may not read never becomes a search term, a filter or an ordering of a list that role can call. | 02, at review |
| A journey that reads a list just after acting on it reads the line of its own item (`locator("tbody tr, li").filter({ hasText: <its unique text> })`), never "the one row in this state": the two browser projects share one database. | 02 |
| The proxy refuses a request body over 64 MiB on `/api/*` with 413; the upload form has a sentence for it. | 02, at review |
| On the developer machine the browser journeys run with `bash scripts/e2e-container.sh [playwright arguments]`, never with a browser started on the host, and no `npm ci` or `npm install` runs on the host: the project folder is synced by OneDrive. Packages are added with `docker compose run --rm web npm install <name>`. The pipeline runs the standard commands and is the reference. | 01b |

### 13.2 Routes and shapes added

| Addition | Plan |
|---|---|
| `GET employees` takes `scope`, `search`, `department`, `manager`, `status`, `ordering`, and returns one row shape, `EmployeeListOut`. `Employee.archived_at` is a date: the leaving date. `ProfileChange` has a `note`. | 02 |
| `POST requests/preview` takes an optional `request`, so that an edited request does not collide with itself. `PATCH requests/{public_id}` takes no `override_reason`. `GET approvals` also takes `type` and `department`. A change to an approved request is approved or refused, never sent back. | 03a |
| Notification event `step.informed`, for a manager who is informed and not asked to decide. | 03a |
| `BalanceOut` adds `employee`, `has_opening` and `as_of`. The ledger endpoint is paginated, newest first. | 04 |
| `home/team` carries `people`: `[{public_id, today, balance}]`, which feeds the "today" and "annual balance" columns of My team, People. | 05 |
| `GET report-filters` (MANAGER, HR, EXEC): the filter options for the caller's scope, and the accounts the activity log can filter on. `reports/{name}` takes `scope`; a column has a fifth kind, `period`; `totals` is `{lines: [...]}`. | 06 |
| `GET calendar` returns `working_week`. Nine list endpoints take `ordering`; an unknown value answers `core.ordering_invalid`. | 07 |
| Error codes `request.period_too_long` (one request covers at most 366 days), `request.decided_by_not_approver` (a decision recorded on behalf names someone the step is for), `accounts.employee_left` (D44). `files.services.store_upload` takes `confidential=False`; `selectors.history(request, *, private=True)`. `PATCH requests/{public_id}` on a waiting request is for its requester only; HR changes it by a correction. | 03a, at review |
| `BalanceOut` adds `opening_date` and `can_enter_opening`; error codes `balances.opening_after_start`, `balances.opening_not_offered`; notification events `balance.own_adjustment`, `balance.own_opening` (D49); the month-end job posts the months whose last day is over, at 01:00 Tunis on the 1st. | 04, at review |
| `organisation.services.register_departure_listener(fn)`: the listeners run inside the departure's transaction. `EmployeeDirectory.has_left(user_id)`. `AccountDetailOut.can_enable`. | 03a, at review |

### 13.3 Extension points added

| File | Created by | Extended by |
|---|---|---|
| `frontend/src/app/sharedRoutes.tsx` (routes inside the shell that belong to no workspace) | 01b | 03b appends `/requests/:id` |
| `features/employees/peopleColumns.tsx`, `PEOPLE_COLUMNS` (name 10, position 20) | 02 | 05 appends today (30) and balance (40); 03b appends requests waiting (50) |
| `features/employees/recordBlocks.tsx`: lists are extended with `push` at the end of the file. Blocks: personal 10, team 20, documents 30, requests 40, balance 50, proposals 60, history 90. The balance fact has order 65. | 02 | 03b, 04 |
| `features/settings/hrSubjects.ts`, `HR_SETTINGS_SUBJECTS` (the entries of the HR settings index) | 02 | 03b appends five subjects; 06 draws Oversight from it |
| `AFFECTED_KEYS` in `features/requests/api.ts` (query keys refetched after any change to a request) | 03b | 04 and 05 push theirs |
| `backend/conftest.py` | 01a | 02 adds the temporary files folder; 04 adds `_null_balance_port` and `ledger_port` |
| `organisation.selectors.all_employees()`; `requests.selectors.public_ids()`; `apps/requests/spans.py` | 04, 03a, 05 | |

### 13.4 Corrections made when the set was reviewed

- Plan 04 was written before the others existed. Its table columns, pager props, language helper, record-block registration and one database test were corrected against the final text of plans 01a, 01b and 02.
- Plans 03b and 04 now add a default test answer for the routes their People column and balance fact call, so that plan 02's page tests keep passing.
- Plan 07's first task no longer carries fixes for plan 04; it keeps the two cases that depend on execution order.
- Three gaps left by earlier plans are closed by plan 07: sortable lists (task 13), the working week on the calendar and the day carried from the calendar to the request form (task 14).

### 13.5 Known limits

- My team, People asks for one "requests waiting" count per person on the page, 25 at most.
- The HR queues are read in one call of a hundred rows; the document-status filter is applied in the browser.
- Days in calendars and reports are counted with today's holidays, so the figures of a past month change if HR adds a holiday inside it afterwards (D22).
- Firefox on a phone is checked by hand at the rehearsal.
- The KPMG columns follow REP-04 until the sample file arrives (D37 to D39).
- For plan 07 task 16: plain HTTP to a name other than `SITE_HOSTNAME` (the server's address, for example) answers an empty 200 with a `Server` header and no redirect; the proxy advertises HTTP/3 while `compose.server.yaml` publishes TCP only.
- A person who left and comes back needs a new employee record and a new account under another address: the old account cannot be enabled (D44) and the old address stays with the archived record. A way to reopen an archived record is deferred until it is needed (the owner's decision, 2026-10-08). Plan 07 writes this in the runbook.
- A step whose decider's account the administrator disables is flagged to HR at the next hourly run, not at once; a departure flags at once.
- An executive reading the business audit log sees that a file was added to a sick leave (not its name or content); the request's own history hides that line from them.
- `release.yml` has never run. If its publish job fails at the first tag with "Attestation is not supported for the docker driver", add `docker/setup-buildx-action` before the two build steps.

### 13.6 Tasks that act outside the developer's machine

The code is pushed to the private repository `https://github.com/Aymen53M/IRIS-HR` after every commit: the project owner created it and asked for this on 2026-10-07. The owner name in every `<owner>` placeholder of the plans is `Aymen53M`, so `IMAGE_PREFIX` is `ghcr.io/aymen53m/iris-hr`. Pushes are plain: never forced, and pushed history is never rewritten. Plan 01b task 24 therefore creates no repository; it pushes and watches the pipeline.

The tasks below still need the project owner's go-ahead and the information named in the task before they run. Until then they are skipped, and so is any step that pushes a version tag or publishes an image.

| Plan and task | What it does | Needs |
|---|---|---|
| 01b, task 26 | Installs the test stack on the office server | The server, its host name, a read-only token |
| 07, task 16 | Sets up the production stack and hardens the server | The server, internal names |
| 07, task 17 | Runs the go-live rehearsal and tags the release | The people of the rehearsal; three PRD open items closed before real data |
