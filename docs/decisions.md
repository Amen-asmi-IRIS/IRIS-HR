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

## Decisions of the master plan

The master plan (`docs/superpowers/plans/2026-10-06-iris-hr-00-master-plan.md`, section 3) gives each of these
with what the specification says and why. D1 to D25 were taken while planning (2026-10-06); D26 to D53 while
building, several of them by the project owner on the date given. All of them await the owner's review unless a
date of decision is given.

| # | Decision |
|---|---|
| D1 | The repository is the project folder, beside its documents (the owner, 2026-10-07) |
| D2 | Ten plans; steps 1 and 3 are split into a backend and a frontend plan |
| D3 | Notifications are built in step 1 |
| D4 | Delegation belongs to the organisation module and is built in step 2 |
| D5 | Attachments are a module of their own, linked from their owners |
| D6 | The account-to-employee link is stored on the employee |
| D7 | Columns added to the data model of the specification |
| D8 | The audit trail and the ledger refuse UPDATE, DELETE and TRUNCATE through database triggers; the test database switches the TRUNCATE guards off |
| D9 | Server messages come from a catalogue in two languages; notifications are written on the server |
| D10 | The certificate deadline is the type's, else the HR parameter |
| D11 | Month-end credits start from a date HR sets; opening balances are stated as of the day before |
| D12 | A half-day on a day that is not worked is refused, as is a single day flagged at both ends |
| D13 | A manager who exists but cannot act leaves the step waiting, flagged to HR at once |
| D14 | Not signed in: 401. Role not allowed: 403. Outside one's reach: 404 |
| D15 | Five variables added to `.env.example` |
| D16 | Twenty failed sign-ins per network address per lock-out window |
| D17 | Counting a sick leave as annual leave converts the whole request; it stays confidential |
| D18 | A change waiting for approval reserves only the days it adds |
| D19 | Home screens and switcher counts are served by the reports module |
| D20 | The development stack runs in Docker; browser tests run against it |
| D21 | A draft never sent is deleted when discarded |
| D22 | Changing a public holiday does not recompute approved requests |
| D23 | Layout follows the design tokens; the design canvas is not in the repository |
| D24 | Managers and HR can list the names of active employees when choosing a delegate or a new approver |
| D25 | The HR desk and the manager's queue are built in step 3 |
| D26 | One account may hold Executive Management and System Administrator; an administrator cannot change their own roles |
| D27 | Administrators are told of a failing job after its third consecutive failure, once per job per day |
| D28 | A draft is seen and edited only by the account that created it |
| D29 | Once a manager's step is flagged as stuck, HR may decide it directly |
| D30 | When every step of a chain only informed or was skipped, an HR step is added so that a person decides |
| D31 | Counting sick leave as annual leave is the HR decision on the request |
| D32 | An employee cannot edit or resend a request HR entered with an exception; HR never acts on its own request |
| D33 | A comment is offered on every request type |
| D34 | Discarding a draft and withdrawing a request can be undone for five seconds; what is typed in a request form is kept in the browser tab |
| D35 | Month-end credit follows the dates of employment; a tie rounds up; a credit that rounds to zero posts no line |
| D36 | An opening balance may be any number, once per employee; an adjustment may take a balance below zero |
| D37 | Which request types feed which KPMG column |
| D38 | Meal tickets: one lost per date on which reducing absences add up to a full day; the base times the whole months of the period; joiners and leavers get the full base |
| D39 | The export includes everyone employed during the period; the cut-off day is 1 to 28; after the cut-off the default period is the one just closed |
| D40 | Overview offers five reports; the certificates report stays with HR |
| D41 | Column sorting on accounts, the two logs, employees and request lists; queues, notifications, the ledger and delegations keep a fixed order on screen |
| D42 | The running version on a server is recorded by the update command, never in `.env` |
| D43 | A release candidate `v0.9.0` is used for the rehearsal; `v1.0.0` is tagged after it |
| D44 | A departure disables the account and leaves its assigned roles; such an account cannot be enabled again (the owner, 2026-10-07) |
| D45 | An employee is notified in the application when a request is sent in their name (the owner, 2026-10-08) |
| D46 | On a sick leave, the reason HR types for a correction, a cancellation or a reassignment is stored nowhere readable (the owner, 2026-10-08) |
| D47 | The HR rule of a chain counts only HR holders with an employee record; with none, executives decide, else the administrators are told |
| D48 | On a phone, a workspace with more than five entries shows four tabs and "More"; long labels have a short label (the owner, 2026-10-08) |
| D49 | An HR holder may adjust their own balance and enter their own opening balance; every executive is notified (the owner, 2026-10-13) |
| D50 | A person hired on or after the credit start date is offered no opening balance; days brought from elsewhere are an adjustment |
| D51 | The pipeline runs by hand, on pull requests and for a release, not on every push (the owner, 2026-10-13) |
| D52 | On the homes, a sick leave waiting for HR counts as away, marked as waiting (the owner, 2026-10-13) |
| D53 | Without a payroll cut-off day, the KPMG export proposes the last calendar month that is over (the owner, 2026-10-14) |

## Other rules decided while building

Rules from the plans' "Contract notes" that a person meets and that no line above states.

| # | Decision | Source |
|---|---|---|
| B1 | A refused sign-in answers 400 with its reason (429 for the address limit); 401 means only "no session" | Master 13.1 |
| B2 | An administrator cannot reset, disable or change the roles of their own account; the last active administrator cannot be removed | Plan 01a |
| B3 | A delegation is not transitive | Plan 02 |
| B4 | An HR holder cannot decide their own profile change | Plan 02 |
| B5 | A change to an approved request is approved or refused, never sent back | Master 13.2 |
| B6 | In the department calendar a person's own entries show their type and status; colleagues show only "absent" or "remote", approved only, never an hourly permission | Plan 05 |
| B7 | A request covers at most 366 days | Plan 03a, review |
| B8 | A decision recorded on behalf must name one of the people the step is for | Plan 03a, review |
| B9 | A type counted in hours never makes someone "out" on a home or in the department calendar, whatever its label | Plan 05, review |

## Decisions taken during hardening (plan 07)

| # | Decision | Why |
|---|---|---|
| H1 | Nobody acts on their own request through any HR action, reassignment included | PRD 3 says "in any role" |
| H2 | Every paginated list takes a whitelisted `ordering`; the four large tables sort from their headers; queues and histories keep their own order on screen | PRD 9.3 and UI 3.4; a queue's order is its meaning (D41) |
| H3 | The calendar feed carries HR's working week and the page follows it | The page assumed Saturday and Sunday |
| H4 | A day chosen on the calendar fills the request form (`?start=`, `?end=`) | UI 5.7 |
| H5 | The nightly backup is two GnuPG files (AES-256) in the backup volume, 14 days kept; pre-update dumps are kept apart and never pruned by the nightly job | PRD 12.7 |
| H6 | Browser tests run on one engine per run (Chromium, Firefox, Edge); the phone viewport is Chromium's | The journeys of a run share one database |
| H7 | Performance is measured with 100 loaded employees and 20 sessions; the measure that counts is the one on the office server | NFR-01, NFR-02 |
| H8 | When a sheet or a confirmation closes, the focus returns to the button that opened it, or to the page content when that button is gone | WCAG 2.4.3 |
| H9 | The report results of UI 10.3 are tables of their own, not lists of items, and may be wider than six columns | UI 10.3 defines them so |

## Waiting for the project owner

| Subject | Where it is described |
|---|---|
| Review of every decision above that has no date of decision | This file; master plan, section 3 |
| Sponsor agreement to approval inside the system | PRD, open item 1 |
| The file HR sends KPMG today; then D37, D38, D39 | PRD, open item 2 |
| Exceptional-leave events and their days; public holidays; confirmation of the credit, remote-work and meal-ticket rules | PRD, open item 3 |
| An off-site destination for backups | PRD, open item 4; `docs/runbook/restore.md`, section 1 |
| Declaration to the regulator; legal check of keeping archived data indefinitely | PRD, open item 6 |
| The office server, its internal name and a company certificate for it | PRD, open item 7; `docs/runbook/install.md`, sections 1 and 5 |
| The names of the HR and System Administrator holders | PRD, open item 8 |
