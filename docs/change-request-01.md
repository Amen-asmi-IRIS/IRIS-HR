# IRIS HR — Change request 01

## Rules for Claude Code

1. Read `README.md` first and follow it.
2. Do one work package (WP) at a time, in order. Before you code a WP, show a short plan: the files you will change, what you will remove and any migration. Then wait for approval.
3. If a line below is unclear or conflicts with the code, ask. Do not guess.
4. Put every visible text in both the `fr` and the `en` locale files. `src/i18n/parity.test.ts` must pass.
5. Remove a feature end to end: its page, route, navigation entry, API endpoint, serializer, service, notifications, unit tests, browser journeys in `frontend/e2e/`, locale keys and permission-matrix lines. Leave no dead code.
6. Make every model change through a migration. No production data exists yet, so you may drop columns and tables. Ask before deleting rows that hold real configuration.
7. After an API change, run `powershell -File scripts/dev.ps1 openapi`.
8. A WP is done only when all five checks pass: backend tests, backend lint, frontend tests, frontend lint and typecheck (commands in `README.md`). In the same WP, update or delete the browser journeys that cover the pages it changes, then run them, for example `npx playwright test sign-in` from `frontend/`. Run the full browser journey suite at the end of WP6. Journeys empty the development database.
9. When a WP changes them, update `docs/permission-matrix.md` and `docs/guides/`, and add a D line to `docs/decisions.md`.
10. Do not touch `.env`, the compose files, `proxy/`, `scripts/server/` or `.github/`.
11. At the end of each WP, list what changed and stop. I test it and commit it.

## Decisions

The "Instruction" column holds my instructions. The "To confirm" column holds assumptions I have not decided yet. Edit them or delete them before starting.

| # | Subject | Instruction | To confirm |
|---|---|---|---|
| C1 | Departments | There are exactly four departments: EH&B, RD, REA and SUP. No settings page for them. | Create the four with a data migration. HR picks one of them on the employee form. List the existing departments in the WP plan and ask me how to map them. |
| C2 | Positions | Remove positions. | Remove them from the form, record, lists, API and database. |
| C3 | Parameters | Remove the Parameters page from HR settings. | The HR parameters move to Administration > Parameters, owned by the System Administrator, so that "credits start on" can still be set at go-live. |
| C4 | Request types and approval steps | Remove both settings pages. | Freeze the request types and approval steps exactly as they are in the database today. Remove their write endpoints. |
| C5 | Delegation | Remove delegation completely. | When a manager is absent, HR moves the requests with the existing "Reassign" action. |
| C6 | Exceptional leave | Remove the event field and the exceptional-leave events settings page. | The employee enters the dates; HR validates the number of days. |
| C7 | Hourly permission | Remove AM/PM. | Show times in 24-hour format (for example 08:00–17:30) in both languages. |
| C8 | Half days | Annual leave: remove "start at midday" and "finish at midday". Sick leave: remove "finish at midday on the last day". Remote work: remove "finish at midday on the last day". | Leave every other midday option as it is. |
| C9 | Request form | Make the form a pop-up instead of a full page, and make it look less dull. | A dialog on desktop and a full-screen sheet on phone. Every "New request" entry point opens it, including the calendar "+". The `/me/requests/new` link still works and opens the same pop-up. Restyle with the existing design tokens. |
| C10 | Employee home | Merge Balance into Home. | Remove the Balance navigation entry. |
| C11 | Employee profile | Remove "My past proposals". | Employees can still propose a change. |
| C12 | Birthdays | Add birthdays to the calendars. | Show day and month only, never the year or age. They appear on the team, department and company calendars, for active employees whose date of birth is recorded, and anyone who can open a calendar sees the birthdays on it. |
| C13 | Manager workspace | A manager has one space: Home, My requests, To decide, People, Department history, Calendar, Profile. | The separate "My team" workspace is removed for managers. The Executive (overview) workspace does not change. |
| C14 | Department history | Rename the team "Requests" page to "Department history" / "Historique du département". | Its content does not change. |
| C15 | To decide | Build it from cards, one per decision. Remove the "Decide the oldest" button. | Each card shows the employee, type, dates, number of days, submission date and document status. Approve and Refuse buttons are on the card, and refusing follows the same rules as today. |
| C16 | Manager and balances | A manager does not see an employee's balance. | This covers the employee record, decision cards, team lists and everywhere else. Enforce it in the API responses for the manager role, not only in the interface. |
| C17 | Reports | Remove the report pages for managers and HR. | In the WP6 plan, list every report and log page per role, and I confirm which ones go. The Administration security log stays. |
| C18 | KPMG export | Remove it. | Remove the page, endpoint, tests and browser journey. |
| C19 | HR report | The HR desk has one "Report" button. It lists the employees, their balance, and their requests by type with a count for each. | One row per active employee: name, department, current annual-leave balance, then one column per request type counting approved requests in the chosen year (default: the current year). The table can be downloaded as Excel. |
| C20 | Holidays | Rename the page to "Company and public holidays". | French label: "Jours fériés et fermetures de l'entreprise". It works the same way. |

## Work packages

Do them in this order. Each one builds on the ones before it.

| WP | Content | Why here |
|---|---|---|
| WP1 Removals | C5, C11 | Delegation is part of approval routing. Removing it first simplifies every later request change. |
| WP2 Organisation and settings | C1, C2, C3, C20 | The four departments must exist before the department calendars and birthdays of WP4 are built. |
| WP3 Requests | C6, C7, C8, C9, then C4 | The request types change first; their configuration is frozen last. The pop-up comes before WP5 places it in the manager space. |
| WP4 Employee space | C10, C12 | The manager space of WP5 reuses this Home. |
| WP5 Manager space | C13, C14, C15, C16 | The "Decide the oldest" button goes when the page is rebuilt as cards. Reports are left out of the unified space. |
| WP6 Reports | C17, C18, C19 | The new report reuses the balance and request-count queries and the Excel download before the old reports and the KPMG export are deleted. |

## Prompt for each WP

> Read docs/change-request-01.md. Do WP1 only. Plan first and wait for my OK.

## Progress

State on 2026-10-16, when work stopped. Nothing is committed.

### WPs done

None.

### Current WP: WP1 (C5, C11), in progress

Plan approved. Answers given: a refusal notification carries HR's comment (C11); journey 7 becomes a Reassign journey (C5).

Done:

- Backend, C5: the delegation model, services, selectors, endpoints, serializers, routes, scheduled job, messages and notifications are removed.
  - A line-manager step goes to the manager only.
  - A person's team is their direct reports only.
  - A departure no longer touches delegations.
  - The team home no longer returns `delegation`.
  - Queue items no longer return `via_delegation_from`.
- Backend, migration `organisation/0005_remove_delegation`: it deletes the old delegation notifications and the job status row, then drops the table. It is applied to the development database, and `makemigrations --check` finds nothing.
- Backend, C11:
  - A refusal with a comment now sends the new event `profile_change.rejected_with_comment`, which carries the comment.
  - The `profile_change.rejected` text is reworded.
- Backend tests:
  - The delegation tests are deleted.
  - The four tests that needed two people able to decide one step now flag the step, so the manager and HR can both decide it.
  - Two profile-change notification tests are added.
- Ruff: `ruff check` and `ruff format --check` pass.
- Frontend:
  - Deleted: `features/delegations/`, `DelegationOffer`, `ManagerDelegateSheet` and the `delegations` locale files.
  - The route and the navigation entry are removed.
  - Edited: `RequestMineView`, `RequestHrView`, `StuckPage`, `ToDecideBlock`, `TeamBlock`, `TeamHomePage`, `employees/api.ts`, `reports/activity.ts`, the request types and fixtures, and the test handlers.
  - Locale keys are removed in fr and en, including the three C11 profile keys.
  - The parity test's team count goes from 6 to 5.
  - Unit tests updated: `DepartureSheet`, `PeopleCells`, `TeamHomePage`, `ToDecide`.
- Browser journeys: `name-a-delegate.spec.ts` and `go-on-leave-as-a-manager.spec.ts` are deleted.

Remains:

- Frontend unit tests:
  - `HrQueues.test.tsx`, `actions.test.tsx`, `RequestHrView.test.tsx` and `EmployeeRecordPage.test.tsx` still mock or import deleted delegation modules.
  - `form/chain.test.ts`: delete the "manager and delegate" case.
  - `status.test.ts`: rename its delegate case.
- C11, frontend: remove "My past proposals" from `MyProfilePage.tsx` and its test. The page still uses the locale keys already removed.
- Browser journeys:
  - New `cover-for-an-absent-manager.spec.ts`.
  - `JOURNEYS.md`: row 7, and drop `name-a-delegate` from "Other specs".
  - `support/pages.ts` and `support/checks.ts`.
  - Retarget the task-sheet checks in `a11y.spec.ts` and `phone-fit.spec.ts` to the HR employee record's departure sheet.
  - `correct-an-address.spec.ts`: remove the past-proposals step.
- `powershell -File scripts/dev.ps1 openapi`. `backend/openapi.yaml` and `frontend/src/api/schema.d.ts` still describe delegation.
- Docs:
  - `docs/permission-matrix.md`: remove the three delegation lines.
  - `docs/guides/hr.md`, `employee.fr.md` and `employee.en.md`.
  - `docs/decisions.md`: add D54 and D55.
  - `docs/runbook/rehearsal.md`: step C6.
  - `CHANGELOG.md`.
- The five checks, the browser journeys for the changed pages, and a final search for leftover delegation code.

### Failing tests

- Backend (`pytest -q`): the full suite was still running when work stopped, so its result is not known.
- Frontend (`npm test`, lint, typecheck): not run. As they stand, these fail:
  - the four test files above that still import deleted modules;
  - the `MyProfilePage` test, whose locale keys are already removed.
- Browser journeys: not run.
