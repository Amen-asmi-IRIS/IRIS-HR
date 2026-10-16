# IRIS HR Request Engine Frontend Implementation Plan (03b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make all five request types usable end to end in the browser: the employee's request form and views, the manager's queue and decisions, HR's desk, queues and corrective actions, the executive's read-only views, and HR's configuration of types, steps, events, holidays and parameters.

**Architecture:** one feature folder, `frontend/src/features/requests/`, built on the API of plan 03a and composed into the four workspaces through the route arrays and registries of plan 01b. The server decides everything (quantity, chain, status, the list of actions a viewer may take); the feature renders what it receives and never re-implements a rule. One form component serves every type and every state of a request, one view component serves every role, and one decision sheet serves every approver.

**Tech Stack:** React 19, TypeScript (strict), Vite, Tailwind CSS v4 with `tokens.css`, shadcn/ui, TanStack Query v5, React Router v7, react-i18next, react-hook-form with zod, openapi-fetch, date-fns, Vitest, Testing Library, MSW v2, Playwright.

**Spec:**

- `docs/superpowers/plans/2026-10-06-iris-hr-00-master-plan.md` (binding contract; sections 7.8, 7.9, 8, 9 and 10 are the ones this plan implements against)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-ui-design.md` (sections 3.4, 3.5, 5.2 to 5.5, 6.1, 6.2, 6.4, 7.1 to 7.4, 7.6 to 7.8, 7.12, 8.3, 10.2, 12)
- `docs/superpowers/specs/2026-10-05-iris-hr-platform-prd-design.md` (sections 5.3, 5.9, 6, 7)
- `docs/design/README.md`, `docs/design/iris-hr-tokens.css`

## Global Constraints

Master plan section 2 applies in full. The constraints below bear directly on this plan and are copied from the specs.

From the UI document:

- U2: "Every request says in plain words where it stands, who it is waiting on, and what happens next."
- U4: "The system does the work it can. Quantities, balances, limits and approvers are computed and shown, never asked for."
- U5: "An error appears next to its cause, says what is wrong and what to do about it. What the user typed is never lost."
- U6: "Nothing irreversible happens without a confirmation that states the consequence. Where something can be undone (withdraw, discard), the interface offers the undo instead of a warning."
- U7: "Every action is acknowledged, and the page shows the new state without a manual refresh."
- M1: "One primary action per page. Every other action is visibly secondary."
- M4: "A list shows at most six attributes per item. The rest is inside the item."
- M5: "At most three filters are visible. Others are one step away."
- M6: "A detail page opens on a summary and the actions available. History, step-by-step detail and technical information are one step away."
- M7: "A form shows only the fields that apply to the choice made."
- M8: "Nothing is shown that the user cannot use: no disabled menu entries, no greyed-out actions for another role, no empty columns."
- R3: "The same item is presented from the viewer's angle. A request is "mine" to the employee, "to decide" to the manager, "to validate" to HR, and "to oversee" to an executive."
- 3.4 Mandatory reasons: "Where the PRD requires a reason, the action cannot be confirmed without one."
- 3.4 Not allowed: "A page or item outside the user's reach shows "not available", without revealing whether it exists."
- 3.4 Session end: "After 2 hours of inactivity the user returns to Sign in and then to the page they were on. A request saved as a draft is not lost."
- 3.4 Concurrent action: "If someone else acted first, the user is told and sees the current state."
- 3.4 Sensitive content: "Sick-leave comments and medical attachments appear only to the requester and HR, on every page, list, history and notification."
- 7.12: "A change to a type or its steps applies to requests sent afterwards; the page says so."

From the PRD:

- REQ-01: "The quantity (days or hours) is always computed by the server."
- REQ-07: "Until the first decision, the employee can edit or withdraw the request. After the first decision and before final approval the employee can withdraw but not edit."
- REQ-08: "The original stays in force, and the balance is unchanged, until the amendment is approved. One amendment can be open per request."
- REQ-16: "Accepted formats are PDF, JPG and PNG up to 10 MB each."
- REQ-18: "Two approvers acting on the same step at the same moment cannot both succeed; the second receives "already processed"."

From the master plan, section 7.9:

- "`viewer.actions` is the complete list of what this viewer may do now [...]. The frontend shows exactly these actions."

From `docs/design/README.md`:

- "One primary button per page; no disabled controls — what a role can't use is not shown."
- "Statuses are sentences from the viewer's angle, with a coloured dot."
- "Logo cyan `#0AA2D0` is for the logo and graphics only; IRIS blue `#0070B0` carries text and buttons."
- "Every text/background pair meets WCAG 2.1 AA; touch targets are 44px on phone."
- "Sick-leave comments and certificates appear only to the requester and HR."
- "Focused tasks (decisions, HR actions, balance adjustment, departure, delegation) are drawn as a 480px right sheet — full screen on phone."

Rules specific to this plan:

- Every user-visible string of this feature lives in the `requests` namespace (`frontend/src/i18n/locales/fr/requests.json` and `en/requests.json`). From other namespaces it uses only `common:concurrent` (the sentence for "someone else acted first"), `errors:unexpected`, `errors:network` and `errors:unavailable` (plan 01b), and the three labels it adds to `settings.json`.
- No component of this feature computes a quantity, a balance, a limit, an approver or a permission. It displays what the API returns.
- A button that starts a request to the server ignores further clicks until the answer arrives. It is never rendered disabled.

## Review Focus

The five failure modes most likely to hurt a person using these pages. Each has a test in the task named.

1. **A double click on Send or on Confirm.** Exactly one request is created and one decision is posted (Task 5, test "a double click on Send creates one request"; Task 10, test "a double click on Confirm posts one decision").
2. **Someone else acted first.** A decision or a save answered 409 tells the user in plain words, closes the sheet and shows the current state; nothing is retried silently (Task 10, test "tells the approver when someone else decided first, and shows the current state"; Task 8, test "a withdrawal that arrives too late says so"; Task 13, test "says so and closes when someone else acted first").
3. **The session ends while a form is open.** After signing in again the user finds what they had typed, on the same form, and is told so; a draft saved before is untouched (Task 4, test "keeps what was typed and gives it back"; Task 5, test "restores what was typed after the page is left and reopened").
4. **Input that cannot be right.** An end before the start, an end time before the start time, a text file renamed `.pdf.txt`, a 12 MB scan: the message appears on the field concerned, before anything is sent, and every other field keeps its value (Task 4, schema tests; Task 5, test "a refused file leaves every other field as typed").
5. **Restricted content reaching the wrong screen.** When the API withholds the sick-leave comment and certificate (`comment_hidden: true`, `certificate: null`, no medical attachment), the manager's and the executive's views render no comment block, no document status, no file list and no decision button, in the detail page and in every list and queue (Task 12, test "a sick-leave declaration is information only"; Task 18, test "never shows the comment or the certificate").

## Interfaces this plan relies on

Everything below exists when this plan starts. The signatures are those of the final plans 01b, 02 and 03a; the first test of Task 1 (`shared.contract.test.tsx`) pins the ones this feature uses most, so that a later change to a shared building block is noticed here.

```ts
// plan 01b ------------------------------------------------------------------------------------
// @/components (barrel; each name is also exported from its own file)
PageHeader(props: { title: string; primary?: ReactNode; back?: To; children?: ReactNode })
DataTable<T>(props: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; onRowOpen?: (row: T) => void;
                      empty: ReactNode; isLoading?: boolean; label?: string })
type Column<T> = { key: string; header: string; cell: (row: T) => ReactNode; align?: "start" | "end" }
  // with onRowOpen, the first column becomes the button that opens the row: its cell must be plain text
Pager(props: { page: number; pageSize: number; total: number; onPage: (page: number) => void })
FilterBar(props: { children: ReactNode; more?: ReactNode })            // throws above three children
FilterSelect(props: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] })
FilterDateRange(props: { label: string; from: string; to: string; onFrom: (value: string) => void; onTo: (value: string) => void })
useListParams<F extends Record<string, string>>(defaults: F):
  { filters: F; page: number; sort: string; query: Record<string, string | number>;
    setFilter: (key: keyof F & string, value: string) => void; setPage: (page: number) => void; setSort: (sort: string) => void }
backToList(path: string): string                                        // the list's address with the filters it last had
EmptyState(props: { title: string; hint?: string; action?: ReactNode })
Block(props: { title: string; children: ReactNode; action?: ReactNode })
TaskSheet(props: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; footer?: ReactNode })
FormSummary(props: { problems: string[] })
StatusBadge(props: { tone: StatusTone; children: ReactNode })          // StatusTone = "waiting" | "approved" | "refused" | "info" | "neutral"
Disclosure(props: { title: string; children: ReactNode; defaultOpen?: boolean })   // children are mounted only while open
PageLoading()
TextField | TextAreaField | DateField | TimeField | SwitchField<T>(props: { control: Control<T>; name: FieldPath<T>; label: string; hint?: string; optional?: boolean })
SelectField<T>(props: BoundFieldProps<T> & { options: { value: string; label: string }[]; placeholder?: string })
FileField<T>(props: BoundFieldProps<T> & { accept?: string })           // form value: File | null
  // every input is the browser's own, found by its label; `optional` adds "(facultatif)" / "(optional)" to the label;
  // TextField passes other input attributes through (type, inputMode, max); SwitchField has no error line of its own
ConfirmDialog(props: { title: string; consequence: string; confirmLabel: string; onConfirm: () => void; destructive?: boolean;
                       open?: boolean; onOpenChange?: (open: boolean) => void })
toast(message: string, options?: { undo?: () => void }): void          // stays five seconds
NotAvailable()
SomethingWentWrong(props: { requestId?: string })

// @/components/ui/button      Button: variant "primary" | "secondary" (the default) | "ghost" | "destructive" | "link";
//                             size "default" | "sm" | "icon" | "inline"; asChild; type defaults to "button"
// @/lib/utils                 cn(...classes)
// @/lib/format                formatDate, formatDateRange, formatDateTime, formatDays, formatHours: (value(s), lang: Lang) => string
// @/lib/dates                 todayISO(): string
// @/i18n                      default export: the i18next instance; type Lang = "fr" | "en"; useLang(): Lang.
//                             Every locales/<lang>/<namespace>.json is loaded; in tests a missing key throws.
// @/features/auth/api         useCurrentUser(): Me                     (Me as master 7.2)
// @/features/settings/SettingsGroupPage   default export, { group: "hr" | "system"; readOnly? }; labels from settings.json
// @/app/workspaces            type WorkspaceId
// @/app/navigation            workspaceOfPath(pathname): WorkspaceId | null
// @/app/homes                 HOMES                                    (one line per workspace)
// @/app/sharedRoutes          sharedRoutes: RouteObject[]              (pages inside the shell, absolute paths)
// @/api/client                api, call
// @/api/problem               ProblemError { status, code, detail, errors: FieldProblem[], requestId }, FieldProblem
// @/test/render               renderApp(ui, { route?, path?, me?, queryClient? }): mounts `ui` at `path` and shows
//                             <p data-testid="elsewhere">{pathname + search}</p> for every other address
// @/test/fixtures             makeMe(overrides), makePage(results), problemResponse(status, code, detail, fields?)
// @/test/server               server (MSW; an unhandled request is an error)
// e2e/helpers.ts              PASSWORD, signIn(page, email)

// plan 02 -------------------------------------------------------------------------------------
// @/features/employees/EmployeePicker    EmployeePicker(props: { label: string; value: string | null; onChange: (publicId: string | null) => void;
//                                          exclude?: string[]; error?: string; hint?: string; allowNone?: boolean; noneLabel?: string })
// @/features/delegations/DelegationSheet DelegationSheet(props: { open: boolean; onOpenChange: (open: boolean) => void;
//                                          manager?: { public_id: string; name: string }; defaultStart?: string; defaultEnd?: string })
// /team/delegations?from=&to=            plan 02's page opens the sheet with these dates filled in
// @/features/employees/api               useEmployee(id: string | undefined), isFullRecord(employee); a full record carries manager: { public_id, name } | null
// @/features/employees/recordBlocks      RECORD_BLOCKS: RecordBlock[] with { id, titleKey: "namespace:key", order, modes, render(employee, mode) }; order 40 is free for Requests
// @/features/employees/peopleColumns     PEOPLE_COLUMNS: PeopleColumn[] with { id, headerKey: "namespace:key", order, cell(row) }; order 50 is kept for "requests waiting"
// @/features/settings/hrSubjects         HR_SETTINGS_SUBJECTS: { id, path, titleKey, descriptionKey, order }[]; departments are at order 60
// @/features/profile/api                 useProfileChanges({ scope: "all", status: "pending" }): a page with `count` and rows { public_id, employee: { name }, created_at }
// /hr/profile-changes                    plan 02's page; it has no entry in the navigation, so the HR desk links to it
// e2e/people.ts                          HR, MANAGER, OTHER_MANAGER, EMPLOYEE ({ email, name }), landed(page), stamp(testInfo)

// plan 03a ------------------------------------------------------------------------------------
// The routes and shapes of master 7.8 and 7.9, with these precisions (its contract notes 8 to 19):
//   POST requests/preview takes an optional `request` (public id): the request being edited or amended, so it does not collide with itself
//   PATCH requests/{public_id} takes no override_reason: the exception is fixed when HR creates the request
//   a change to an approved request is approved or refused, never sent back
//   GET requests filters: status, type, employee, department, year, from, to, on_behalf, has_override, ordering
//   GET approvals filters: queue, type, department
//   request-types, exceptional-events, holidays, steps, chain-preview and history answer plain lists; requests and approvals are paginated
//   ChainStepOut.named_person is { public_id, name } | null; flag_after_days is null on HR steps
//   GET holidays/impact?date= answers [{ public_id, employee, type, start_date, end_date, quantity }] (employee and type are names)
//   certificate is null for everyone but the requester and HR; on a restricted request, step comments, the return or
//   refusal note and amendment reasons are null as well
//   a draft is seen by the account that created it only; HR may decide a manager's step once it is flagged
```

Two deliberate choices at the API boundary:

- **Types.** `features/requests/types.ts` restates the JSON shapes of master 7.8 and 7.9 by hand, and `types.contract.ts` fails the type check when a field this feature reads is missing from the generated `schema.d.ts`. The code is therefore written against the contract, and a backend that drifts from it is detected in one file. This departs from plan 01b's convention that types are derived in `@/api/types` (its contract note 8); the reason and the way back are in the Contract notes at the end.
- **Casts.** Query strings and bodies are passed to the generated client through two small casts (`compact`, `json`) and responses through `shaped<T>`. Paths and path parameters stay fully typed. The casts keep this plan compiling whatever names drf-spectacular gives the serializers; they can be removed call by call once the generated types are seen to agree.

## File structure

Everything is under `frontend/`. Files marked (M) exist already and receive one added element or line.

```
src/features/requests/
  types.ts                      the shapes of master 7.8 and 7.9
  types.contract.ts             compile-time check against the generated schema
  platform.ts                   the few things other plans own: viewer, language, text, list unwrapping, workspace choice
  Gate.tsx                      loading / not available / something went wrong around a query
  api.ts                        every call, key, query and mutation of the feature
  problems.ts                   server problems onto form fields
  text.ts                       "3 to 5 November, from midday", "2.5 days"
  status.ts                     the status sentences of UI 3.5 (pure functions)
  dates.ts                      the dates of a request as an amendment or a correction edits them
  StatusSentence.tsx  TypeTag.tsx  DocumentStatus.tsx
  fixtures.ts                   test data: TYPES, makeRequest, makeRequestDetail, makeApprovalItem, makePreview
  undoable.ts                   discard and withdraw with a five-second undo
  form/
    schema.ts                   form values, zod schema, values to and from the API
    problemFields.ts            which field a problem code belongs to
    useDebounced.ts  useSingleFlight.ts  draftKeeper.ts
    chain.ts                    "Your manager, Sami Ben Ali, then HR"
    FieldError.tsx              the error line of an input that shows none (the half-day switches)
    TypeChoice.tsx              step one
    PreviewPanel.tsx            what the system computed
    RequestForm.tsx             step two, for every type and every state
    NewRequestPage.tsx  EditRequestPage.tsx
  lists/
    filters.tsx                 the filters a request list can offer
    RequestsList.tsx            table, filters, pager for any scope
  views/
    registry.ts                 viewer relation -> view component
    parts.tsx                   steps, files, changes, history blocks
    RequestMineView.tsx  RequestManagerView.tsx  RequestHrView.tsx  RequestOverviewView.tsx
  RequestView.tsx               the page body shared by every view
  RequestPage.tsx               /<workspace>/requests/:id
  RequestRedirect.tsx           /requests/:id
  AddFileSheet.tsx
  mine/  MyRequestsPage.tsx  ChangeOrCancelPage.tsx
  decisions/  DecisionSheet.tsx  DecisionContext.tsx
  queues/  ToDecideBlock.tsx  ToDecidePage.tsx  QueueTable.tsx  ToValidatePage.tsx  CertificatesPage.tsx  StuckPage.tsx
  team/  TeamRequestsPage.tsx
  hr/  HrRequestsPage.tsx  HrNewRequestPage.tsx
       actions/  ActionSheet.tsx  RecordOnBehalfSheet.tsx  ReassignSheet.tsx  CorrectSheet.tsx  ReclassifySheet.tsx
                 ManagerDelegateSheet.tsx
  overview/  OverviewRequestsPage.tsx
  settings/  RequestTypesPage.tsx  TypeStepsPage.tsx  EventsPage.tsx  HolidaysPage.tsx
  EmployeeRequestsBlock.tsx     the Requests block of the employee record
  WaitingCount.tsx              "requests waiting" of a person, for the People list of My team
  DelegationOffer.tsx           the offer to name a delegate for the dates of an approved leave
src/features/home/HrDeskPage.tsx
src/test/formActions.ts  src/test/formatMock.ts  src/test/requestServer.ts  src/test/employeePickerMock.tsx
src/i18n/locales/fr/requests.json  src/i18n/locales/en/requests.json
src/i18n/locales/*/settings.json                  (M) three labels
src/workspaces/{me,team,hr,overview}/routes.tsx   (M) routes appended
src/app/homes.ts                                  (M) team and hr
src/app/sharedRoutes.tsx                          (M) one shell-level route, /requests/:id
src/features/employees/recordBlocks.tsx           (M) one block appended (order 40)
src/features/employees/peopleColumns.tsx          (M) one column appended (order 50)
src/features/settings/hrSubjects.ts               (M) five subjects appended
e2e/requests.ts                                   helpers of the eight journeys
e2e/ask-for-leave.spec.ts  decide-a-request.spec.ts  validate-a-request.spec.ts  report-sickness.spec.ts
    handle-a-missing-certificate.spec.ts  change-approved-dates.spec.ts  go-on-leave-as-a-manager.spec.ts
    unblock-a-stuck-request.spec.ts
```

Routes added (paths relative to the workspace):

| Workspace | Path | Page |
|---|---|---|
| me | `requests` | `MyRequestsPage` |
| me | `requests/new` | `NewRequestPage` |
| me | `requests/:id` | `RequestPage` |
| me | `requests/:id/edit` | `EditRequestPage` |
| me | `requests/:id/change` | `ChangeOrCancelPage` |
| team | index (`HOMES.team`) | `ToDecidePage` |
| team | `requests`, `requests/:id` | `TeamRequestsPage`, `RequestPage` |
| hr | index (`HOMES.hr`) | `HrDeskPage` |
| hr | `validate`, `certificates`, `stuck` | `ToValidatePage`, `CertificatesPage`, `StuckPage` |
| hr | `requests`, `requests/new`, `requests/:id`, `requests/:id/edit` | `HrRequestsPage`, `HrNewRequestPage`, `RequestPage`, `EditRequestPage` |
| hr | `settings/request-types`, `settings/steps`, `settings/events`, `settings/holidays` | `RequestTypesPage`, `TypeStepsPage`, `EventsPage`, `HolidaysPage` |
| hr | `settings/parameters` | plan 01b's `SettingsGroupPage` for the group `hr` |
| overview | `requests`, `requests/:id` | `OverviewRequestsPage`, `RequestPage` |
| shell | `/requests/:id` | `RequestRedirect` (sends the viewer to the workspace that matches `viewer.relation`) |

The tasks, in the order they are built:

| Tasks | What they deliver |
|---|---|
| 1 to 4 | Types, API hooks, fixtures; status sentences; the choice of a type; the building blocks of the form |
| 5 to 9 | My space: new request, edit, the list, the request page and the owner's view, change or cancel |
| 10 to 12 | Decisions: the sheet, the manager's queue, the manager's view and the team's requests |
| 13 to 16 | HR desk: corrective actions, the desk and its queues, every request and a new one for an employee, the HR view |
| 17 | HR settings: request types, steps, events, public holidays, parameters |
| 18, 19 | Overview's list and view; requests on the employee record and in the People list, the delegation offer |
| 20 | The eight browser journeys |

Commands used throughout (master section 5):

- One test file: `docker compose run --rm web npx vitest run src/features/requests/<file>`
- Types and lint: `docker compose run --rm web npm run typecheck` and `docker compose run --rm web npm run lint`
- Translation parity: `docker compose run --rm web npx vitest run src/i18n/parity.test.ts`

---

### Task 1: Types, API hooks, test fixtures

**Files:**
- Create: `frontend/src/features/requests/types.ts`
- Create: `frontend/src/features/requests/types.contract.ts`
- Create: `frontend/src/features/requests/platform.ts`
- Create: `frontend/src/features/requests/Gate.tsx`
- Create: `frontend/src/features/requests/api.ts`
- Create: `frontend/src/features/requests/fixtures.ts`
- Create: `frontend/src/test/formActions.ts`
- Create: `frontend/src/test/formatMock.ts`
- Create: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json`
- Modify: `frontend/src/api/schema.d.ts` (regenerated, if plan 03a's last task has not already committed it)
- Test: `frontend/src/features/requests/shared.contract.test.tsx`
- Test: `frontend/src/features/requests/api.test.tsx`

**Interfaces:**
- Consumes: `api`, `call` from `@/api/client`; `ProblemError`, `FieldProblem` from `@/api/problem`; `useCurrentUser` from `@/features/auth/api`; `useLang`, `Lang` from `@/i18n`; `workspaceOfPath` from `@/app/navigation`; `renderApp`, `makeMe`, `makePage`, `problemResponse`, `server`; the shared components listed above.
- Produces:
  - `types.ts`: `RequestOut`, `RequestDetail`, `StepOut`, `AttachmentOut`, `AmendmentOut`, `DecisionContext`, `ApprovalItem`, `Preview`, `ChainStepPreview`, `HistoryItem`, `RequestTypeOut`, `RequestTypeInput`, `ChainStepOut`, `ChainStepInput`, `ExceptionalEventOut`, `ExceptionalEventInput`, `HolidayOut`, `HolidayInput`, `HolidayImpact`, `RequestFields`, `CreateRequestBody`, `UpdateRequestBody`, `PreviewBody`, `AmendmentBody`, `CorrectBody`, `DecideBody`, `RecordOnBehalfInput`, `ReassignBody`, `RequestListParams`, `ApprovalParams`, and the unions `RequestStatus`, `StateKey`, `StepStatus`, `AmendmentStatus`, `ApproverRule`, `StepMode`, `Channel`, `Decision`, `ViewerRelation`, `RequestAction`, `CertificateStatus`, `Unit`, `CalendarLabel`, `Scope`, `QueueName`.
  - `platform.ts`: `Paginated<T>`, `rowsOf(data)`, `Translate`, `useRequestsText(): { t: Translate; lang: Lang }`, `useViewer(): Viewer`, `workspaceFor(relation, workspaces): WorkspaceId`, `useWorkspacePrefix(): WorkspaceId`.
  - `Gate.tsx`: `Gate<T>({ query, children })`.
  - `api.ts`: `requestKeys`, `configKeys`, `AFFECTED_KEYS`, `refreshRequests(qc)`, `requestsApi`, `configApi`, `isConflict(error)`, `isNotFound(error)`, and the hooks `useRequestList`, `useRequest`, `useRequestHistory`, `usePreview`, `useApprovals`, `useCreateRequest`, `useUpdateRequest`, `useSubmitRequest`, `useWithdrawRequest`, `useDiscardRequest`, `useAttachFile`, `useOpenAmendment`, `useWithdrawAmendment`, `useCorrectRequest`, `useCancelRequest`, `useReclassifyRequest`, `useDecideStep`, `useRecordOnBehalf`, `useReassignStep`, `useRequestTypes`, `useSaveType`, `useTypeSteps`, `useSaveTypeSteps`, `useChainPreview`, `useEvents`, `useSaveEvent`, `useHolidays`, `useSaveHoliday`, `useDeleteHoliday`, `useCopyHolidays`, `useHolidayImpact`, `useDepartmentOptions`.
  - `fixtures.ts` (imported as `@/features/requests/fixtures`, also by plans 04 to 06): `paginated` (plan 01b's `makePage`), `problemResponse` (plan 01b's), `TYPES`, `makeType`, `makeRequest`, `makeRequestDetail`, `makeStep`, `makeApprovalItem`, `makePreview`, `makeEvent`, `makeHoliday`.
  - `src/test/formActions.ts`: `setDate`, `setTime`, `setText`, `chooseOption`, `toggle`, `pickFile`. `src/test/formatMock.ts`: `formatMock`, `mockedFormat(importOriginal)`.

- [ ] **Step 1: Regenerate the API types**

Plan 03a added the request endpoints and regenerated `backend/openapi.yaml`. Bring the client's types up to date (this changes nothing if it was already done).

Run: `powershell -File scripts/dev.ps1 openapi`

Then: `docker compose run --rm web sh -c "grep -c '/api/v1/requests/{public_id}' src/api/schema.d.ts && grep -c '/api/v1/steps/{id}/decide' src/api/schema.d.ts && grep -c '/api/v1/approvals' src/api/schema.d.ts"`

Expected: three numbers, each at least 1. A zero means plan 03a is not finished; stop here.

- [ ] **Step 2: Check what the earlier plans left in place**

Run: `docker compose run --rm web sh -c "grep -c 'import.meta.glob' src/i18n/index.ts && grep -c 'escapeValue: false' src/i18n/index.ts && ls src/components/index.ts src/app/sharedRoutes.tsx src/features/employees/EmployeePicker.tsx src/features/delegations/DelegationSheet.tsx src/features/settings/hrSubjects.ts src/features/employees/peopleColumns.tsx"`

Expected: `1`, `1`, then the six paths. A missing path means plan 01b or 02 is not finished; stop here. The glob means a new `requests.json` is picked up without touching `src/i18n/index.ts`; `escapeValue: false` means a name such as "N'Diaye" is shown as typed.

- [ ] **Step 3: Write the shapes**

`frontend/src/features/requests/types.ts`:

```ts
import type { FieldProblem } from "@/api/problem";

export type RequestStatus = "draft" | "pending" | "returned" | "approved" | "rejected" | "withdrawn" | "cancelled";
export type StateKey =
  | "draft" | "waiting_manager" | "waiting_hr" | "waiting_person"
  | "returned" | "approved" | "rejected" | "withdrawn" | "cancelled";
export type StepStatus = "waiting" | "pending" | "approved" | "rejected" | "returned" | "notified" | "skipped";
export type AmendmentStatus = "pending" | "approved" | "rejected" | "withdrawn";
export type ApproverRule = "line_manager" | "hr_role" | "named_person";
export type StepMode = "approve" | "notify";
export type Channel = "in_app" | "verbal" | "paper";
export type Decision = "approve" | "reject" | "return";
export type ViewerRelation = "owner" | "approver" | "team" | "hr" | "overview";
export type RequestAction =
  | "edit" | "submit" | "discard" | "withdraw" | "amend" | "withdraw_amendment" | "attach"
  | "decide" | "record_on_behalf" | "reassign" | "correct" | "cancel" | "reclassify";
export type CertificateStatus = "not_needed" | "attached" | "due" | "overdue" | "missing";
export type Unit = "day" | "hour";
export type CalendarLabel = "absent" | "remote" | "hidden";
export type Scope = "mine" | "team" | "all" | "decided";
export type QueueName = "mine" | "hr" | "certificates" | "stuck";

export interface RequestOut {
  public_id: string;
  version: number;
  employee: { public_id: string; name: string; department: string };
  type: { code: string; name: string; unit: Unit; calendar_label: CalendarLabel };
  start_date: string;
  end_date: string;
  starts_at_midday: boolean;
  ends_at_midday: boolean;
  start_time: string | null;
  end_time: string | null;
  quantity: string;
  event: { id: number; name: string } | null;
  comment: string | null;
  comment_hidden: boolean;
  status: RequestStatus;
  state: { key: StateKey; waiting_on: string[]; last_actor: string | null; note: string | null; since: string | null };
  certificate: { status: CertificateStatus; due_at: string | null } | null;
  amendment: {
    public_id: string;
    kind: "cancel" | "change";
    status: AmendmentStatus;
    state_key: StateKey;
    waiting_on: string[];
  } | null;
  has_override: boolean;
  created_by_hr: boolean;
  viewer: { relation: ViewerRelation; actions: RequestAction[]; step_id: number | null };
  submitted_at: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface StepOut {
  id: number;
  round: number;
  position: number;
  rule: ApproverRule;
  mode: StepMode;
  status: StepStatus;
  approvers: string[];
  decided_by: string | null;
  decided_at: string | null;
  recorded_by: string | null;
  channel: Channel | null;
  comment: string | null;
  amendment_public_id: string | null;
}

export interface AttachmentOut {
  public_id: string;
  /** "medical", "proof" or "scanned_form"; a plain string in the API description. */
  kind: string;
  name: string;
  size: number;
  uploaded_by: string;
  uploaded_at: string;
}

export interface AmendmentOut {
  public_id: string;
  kind: "cancel" | "change";
  status: AmendmentStatus;
  /** Null when the request is restricted and the viewer may not read it. */
  reason: string | null;
  new_start_date: string | null;
  new_end_date: string | null;
  new_quantity: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface DecisionContext {
  balance: { now: string; after: string } | null;
  teammates_away: { name: string; label: "absent" | "remote"; start_date: string; end_date: string }[];
  cap: { used: string; limit: string } | null;
}

export interface RequestDetail extends RequestOut {
  steps: StepOut[];
  attachments: AttachmentOut[];
  amendments: AmendmentOut[];
  decision_context: DecisionContext | null;
}

export interface ApprovalItem {
  step_id: number;
  request: RequestOut;
  waiting_since: string | null;
  via_delegation_from: string | null;
  decision_context: DecisionContext;
}

export interface ChainStepPreview {
  position: number;
  rule: ApproverRule;
  mode: StepMode;
  approvers: string[];
}

export interface Preview {
  quantity: string;
  skipped_days: { date: string; reason: "weekend" | "holiday" }[];
  chain: ChainStepPreview[];
  balance: { now: string; on_start: string; after: string } | null;
  usage: {
    cap: { used: string; limit: string; period: "week" | "month" } | null;
    month_hours: string | null;
    event_days_allowed: string | null;
  };
  certificate_due_at: string | null;
  problems: FieldProblem[];
}

export interface HistoryItem {
  at: string;
  actor: string | null;
  action: string;
  summary: string;
  changes: Record<string, unknown> | null;
}

export interface RequestTypeOut {
  id: number;
  code: string;
  name: string;
  description: string;
  name_fr: string;
  name_en: string;
  description_fr: string;
  description_en: string;
  unit: Unit;
  allows_half_day: boolean;
  balance_effect: "deducts_annual" | "none";
  document_rule: "none" | "required_within_deadline";
  document_deadline_hours: number | null;
  allows_past_dates: boolean;
  notice_days: number;
  cap_quantity: string | null;
  cap_period: "none" | "week" | "month";
  reduces_meal_tickets: boolean;
  calendar_label: CalendarLabel;
  is_sensitive: boolean;
  uses_events: boolean;
  is_active: boolean;
  sort_order: number;
}

export type RequestTypeInput = Omit<RequestTypeOut, "id" | "name" | "description">;

/** A step as it is sent: the named person is an employee `public_id`. */
export interface ChainStepInput {
  approver_rule: ApproverRule;
  named_person: string | null;
  mode: StepMode;
  reminder_after_days: number;
  /** Empty on HR steps: they are reminded, never flagged. */
  flag_after_days: number | null;
}

/** A step as it is read: the named person comes with their name. */
export interface ChainStepOut {
  id: number;
  position: number;
  approver_rule: ApproverRule;
  named_person: { public_id: string; name: string } | null;
  mode: StepMode;
  reminder_after_days: number;
  flag_after_days: number | null;
}

export interface ExceptionalEventOut {
  id: number;
  name_fr: string;
  name_en: string;
  name: string;
  days_allowed: string;
  proof_required: boolean;
  is_active: boolean;
}

export type ExceptionalEventInput = Omit<ExceptionalEventOut, "id" | "name">;

export interface HolidayOut {
  id: number;
  date: string;
  name_fr: string;
  name_en: string;
  name: string;
  recurs_yearly: boolean;
}

export type HolidayInput = Omit<HolidayOut, "id" | "name">;

/** An approved request that covers the date of a holiday being added, moved or removed. */
export interface HolidayImpact {
  public_id: string;
  employee: string;
  type: string;
  start_date: string;
  end_date: string;
  quantity: string;
}

export interface RequestFields {
  start_date: string;
  end_date: string;
  starts_at_midday: boolean;
  ends_at_midday: boolean;
  start_time: string | null;
  end_time: string | null;
  exceptional_event: number | null;
  comment: string;
}

export interface CreateRequestBody extends RequestFields {
  type: string;
  employee?: string;
  override_reason?: string;
}

/** The exception of an HR request is fixed when it is created: a change never carries `override_reason`. */
export interface UpdateRequestBody extends RequestFields {
  version: number;
}

export interface PreviewBody extends Omit<RequestFields, "comment"> {
  type: string;
  employee?: string;
  /** The request being edited or amended, so that it does not collide with itself. */
  request?: string;
  override: boolean;
}

export interface AmendmentBody {
  kind: "cancel" | "change";
  start_date?: string;
  end_date?: string;
  starts_at_midday?: boolean;
  ends_at_midday?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  reason: string;
}

export interface CorrectBody {
  start_date: string;
  end_date: string;
  starts_at_midday: boolean;
  ends_at_midday: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string;
}

export interface DecideBody {
  decision: Decision;
  comment: string;
  version: number;
}

export interface RecordOnBehalfInput {
  decided_by: string;
  decision: Decision;
  decided_at: string;
  channel: "verbal" | "paper";
  note: string;
  version: number;
  scan: File | null;
}

export interface ReassignBody {
  new_approver: string;
  reason: string;
}

export interface RequestListParams {
  scope: Scope;
  status?: string;
  type?: string;
  year?: string;
  employee?: string;
  from?: string;
  to?: string;
  department?: string;
  on_behalf?: string;
  has_override?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface ApprovalParams {
  queue: QueueName;
  type?: string;
  department?: string;
  page?: number;
  page_size?: number;
}
```

- [ ] **Step 4: Write the adapter and the query gate**

`frontend/src/features/requests/platform.ts`:

```ts
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { workspaceOfPath } from "@/app/navigation";
import type { WorkspaceId } from "@/app/workspaces";
import { useCurrentUser } from "@/features/auth/api";
import { useLang, type Lang } from "@/i18n";
import type { ViewerRelation } from "./types";

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** A list read the same way whether it arrives bare (configuration lists) or paginated. */
export function rowsOf<T>(data: T[] | Paginated<T> | undefined): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : data.results;
}

/** `t` in the shape every helper of this feature takes. A key of another namespace is written "namespace:key". */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The `requests` texts and the active language. */
export function useRequestsText(): { t: Translate; lang: Lang } {
  const { t } = useTranslation("requests");
  const lang = useLang();
  const translate = useCallback<Translate>((key, options) => String(t(key, options ?? {})), [t]);
  return { t: translate, lang };
}

export interface Viewer {
  publicId: string;
  name: string;
  workspaces: WorkspaceId[];
}

/** The signed-in person, for pages behind the shell's guards. */
export function useViewer(): Viewer {
  const me = useCurrentUser();
  return { publicId: me.public_id, name: me.name, workspaces: me.workspaces as WorkspaceId[] };
}

const PREFERENCE: Record<ViewerRelation, WorkspaceId[]> = {
  owner: ["me"],
  // Never Overview: it is read-only, and a decision could not be taken there.
  approver: ["team", "hr", "me"],
  team: ["team", "overview", "hr", "me"],
  hr: ["hr", "me"],
  overview: ["overview", "me"],
};

/** The workspace in which this viewer should see a request. Never one they do not have. */
export function workspaceFor(relation: ViewerRelation, workspaces: readonly WorkspaceId[]): WorkspaceId {
  return PREFERENCE[relation].find((id) => workspaces.includes(id)) ?? workspaces[0] ?? "me";
}

const WITH_REQUESTS: WorkspaceId[] = ["me", "team", "hr", "overview"];

/** The workspace of the current address: "/hr/requests/abc" -> "hr". "me" outside those that show requests. */
export function useWorkspacePrefix(): WorkspaceId {
  const workspace = workspaceOfPath(useLocation().pathname);
  return workspace !== null && WITH_REQUESTS.includes(workspace) ? workspace : "me";
}
```

`frontend/src/features/requests/Gate.tsx`:

```tsx
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ProblemError } from "@/api/problem";
import { NotAvailable, PageLoading, SomethingWentWrong } from "@/components";

interface GateProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}

/**
 * Loading, "not available" (404 and 403 alike, UI 3.4) or "something went wrong" around one query.
 * Plan 01b's pages throw the error to the shell's boundary; this component shows the same two
 * pages in place, so that it also serves a block inside a page and a page rendered alone in a test.
 */
export function Gate<T>({ query, children }: GateProps<T>) {
  if (query.isPending) return <PageLoading />;
  if (query.isError) {
    const error = query.error;
    if (error instanceof ProblemError && (error.status === 404 || error.status === 403)) return <NotAvailable />;
    return <SomethingWentWrong requestId={error instanceof ProblemError ? error.requestId : undefined} />;
  }
  return <>{children(query.data)}</>;
}
```

- [ ] **Step 5: Write the test helpers and the fixtures**

`frontend/src/test/formActions.ts`:

```ts
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type Finder = Pick<typeof screen, "getByLabelText">;
type Label = string | RegExp;

/** The only place that knows how the shared form inputs are operated in a test. */
export function setDate(label: Label, iso: string, scope: Finder = screen): void {
  fireEvent.change(scope.getByLabelText(label), { target: { value: iso } });
}

export function setTime(label: Label, hhmm: string, scope: Finder = screen): void {
  fireEvent.change(scope.getByLabelText(label), { target: { value: hhmm } });
}

export function setText(label: Label, value: string, scope: Finder = screen): void {
  fireEvent.change(scope.getByLabelText(label), { target: { value } });
}

export async function chooseOption(label: Label, option: string, scope: Finder = screen): Promise<void> {
  await userEvent.selectOptions(scope.getByLabelText(label), option);
}

export async function toggle(label: Label, scope: Finder = screen): Promise<void> {
  await userEvent.click(scope.getByLabelText(label));
}

export async function pickFile(label: Label, file: File, scope: Finder = screen): Promise<void> {
  await userEvent.upload(scope.getByLabelText(label), file);
}
```

`frontend/src/test/formatMock.ts`:

```ts
/**
 * Stand-ins for `@/lib/format`, so a test can assert on a whole sentence without depending on a locale.
 * Use: vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
 */
export const formatMock = {
  formatDate: (value: string) => `D(${value})`,
  formatDateRange: (start: string, end: string) => `R(${start}..${end})`,
  formatDateTime: (value: string) => `T(${value})`,
  formatDays: (value: string | number) => `${Number(value)} j`,
  formatHours: (value: string | number) => `${Number(value)} h`,
};

/** The real module with the five functions above replaced, so that code using the others still works. */
export async function mockedFormat(importOriginal: () => Promise<unknown>) {
  return { ...((await importOriginal()) as object), ...formatMock };
}
```

`frontend/src/features/requests/fixtures.ts` (test data; no page imports it, so it never reaches the build):

```ts
import type {
  ApprovalItem, ExceptionalEventOut, HolidayOut, Preview, RequestDetail, RequestOut, RequestTypeOut, StepOut,
} from "./types";

// A page of a paginated list and an answer in the problem format, as plan 01b's test helpers build them.
export { makePage as paginated, problemResponse } from "@/test/fixtures";

const ANNUAL: RequestTypeOut = {
  id: 1,
  code: "annual",
  name: "Congé annuel",
  description: "Vos jours de congé payé.",
  name_fr: "Congé annuel",
  name_en: "Annual leave",
  description_fr: "Vos jours de congé payé.",
  description_en: "Your paid leave days.",
  unit: "day",
  allows_half_day: true,
  balance_effect: "deducts_annual",
  document_rule: "none",
  document_deadline_hours: null,
  allows_past_dates: false,
  notice_days: 0,
  cap_quantity: null,
  cap_period: "none",
  reduces_meal_tickets: true,
  calendar_label: "absent",
  is_sensitive: false,
  uses_events: false,
  is_active: true,
  sort_order: 1,
};

/** The five seeded types, as plan 03a's data migration creates them (PRD 5.3). */
export const TYPES: Record<"annual" | "sick" | "exceptional" | "permission" | "remote", RequestTypeOut> = {
  annual: ANNUAL,
  sick: {
    ...ANNUAL,
    id: 2,
    code: "sick",
    name: "Congé maladie",
    description: "Déclarez une absence pour maladie.",
    name_fr: "Congé maladie",
    name_en: "Sick leave",
    description_fr: "Déclarez une absence pour maladie.",
    description_en: "Report an absence due to illness.",
    balance_effect: "none",
    document_rule: "required_within_deadline",
    allows_past_dates: true,
    is_sensitive: true,
    sort_order: 2,
  },
  exceptional: {
    ...ANNUAL,
    id: 3,
    code: "exceptional",
    name: "Congé exceptionnel",
    description: "Pour un événement familial.",
    name_fr: "Congé exceptionnel",
    name_en: "Exceptional leave",
    description_fr: "Pour un événement familial.",
    description_en: "For a family event.",
    allows_half_day: false,
    balance_effect: "none",
    uses_events: true,
    sort_order: 3,
  },
  permission: {
    ...ANNUAL,
    id: 4,
    code: "permission",
    name: "Autorisation de sortie",
    description: "Une absence de quelques heures.",
    name_fr: "Autorisation de sortie",
    name_en: "Hourly permission",
    description_fr: "Une absence de quelques heures.",
    description_en: "A few hours away.",
    unit: "hour",
    allows_half_day: false,
    balance_effect: "none",
    reduces_meal_tickets: false,
    calendar_label: "hidden",
    sort_order: 4,
  },
  remote: {
    ...ANNUAL,
    id: 5,
    code: "remote",
    name: "Télétravail",
    description: "Travailler depuis chez vous.",
    name_fr: "Télétravail",
    name_en: "Remote work",
    description_fr: "Travailler depuis chez vous.",
    description_en: "Work from home.",
    balance_effect: "none",
    cap_quantity: "2.00",
    cap_period: "week",
    reduces_meal_tickets: false,
    calendar_label: "remote",
    sort_order: 5,
  },
};

export function makeType(code: keyof typeof TYPES, overrides: Partial<RequestTypeOut> = {}): RequestTypeOut {
  return { ...TYPES[code], ...overrides };
}

export type RequestOverrides = Partial<Omit<RequestOut, "state" | "viewer" | "employee" | "type">> & {
  state?: Partial<RequestOut["state"]>;
  viewer?: Partial<RequestOut["viewer"]>;
  employee?: Partial<RequestOut["employee"]>;
  type?: Partial<RequestOut["type"]>;
};

/** A pending three-day annual leave of Amal Trabelsi, waiting for her manager, seen by herself. */
export function makeRequest(overrides: RequestOverrides = {}): RequestOut {
  const { state, viewer, employee, type, ...rest } = overrides;
  return {
    public_id: "req-1",
    version: 1,
    employee: { public_id: "emp-owner", name: "Amal Trabelsi", department: "Souscription", ...employee },
    type: { code: "annual", name: "Congé annuel", unit: "day", calendar_label: "absent", ...type },
    start_date: "2026-11-09",
    end_date: "2026-11-11",
    starts_at_midday: false,
    ends_at_midday: false,
    start_time: null,
    end_time: null,
    quantity: "3.00",
    event: null,
    comment: null,
    comment_hidden: false,
    status: "pending",
    state: {
      key: "waiting_manager",
      waiting_on: ["Sami Ben Ali"],
      last_actor: null,
      note: null,
      since: "2026-10-28T09:12:00+01:00",
      ...state,
    },
    certificate: { status: "not_needed", due_at: null },
    amendment: null,
    has_override: false,
    created_by_hr: false,
    viewer: { relation: "owner", actions: ["edit", "withdraw"], step_id: null, ...viewer },
    submitted_at: "2026-10-28T09:12:00+01:00",
    decided_at: null,
    created_at: "2026-10-28T09:10:00+01:00",
    ...rest,
  };
}

export function makeStep(overrides: Partial<StepOut> = {}): StepOut {
  return {
    id: 7,
    round: 1,
    position: 1,
    rule: "line_manager",
    mode: "approve",
    status: "pending",
    approvers: ["Sami Ben Ali"],
    decided_by: null,
    decided_at: null,
    recorded_by: null,
    channel: null,
    comment: null,
    amendment_public_id: null,
    ...overrides,
  };
}

export type DetailOverrides = RequestOverrides &
  Partial<Pick<RequestDetail, "steps" | "attachments" | "amendments" | "decision_context">>;

export function makeRequestDetail(overrides: DetailOverrides = {}): RequestDetail {
  const { steps, attachments, amendments, decision_context, ...rest } = overrides;
  return {
    ...makeRequest(rest),
    steps: steps ?? [
      makeStep(),
      makeStep({ id: 8, position: 2, rule: "hr_role", status: "waiting", approvers: ["Leila Gharbi"] }),
    ],
    attachments: attachments ?? [],
    amendments: amendments ?? [],
    decision_context: decision_context ?? null,
  };
}

export interface ApprovalOverrides {
  step_id?: number;
  request?: RequestOverrides;
  waiting_since?: string;
  via_delegation_from?: string | null;
  decision_context?: ApprovalItem["decision_context"];
}

/** The same request as seen by the manager who must decide it. */
export function makeApprovalItem(overrides: ApprovalOverrides = {}): ApprovalItem {
  return {
    step_id: overrides.step_id ?? 7,
    request: makeRequest({
      ...overrides.request,
      viewer: { relation: "approver", actions: ["decide"], step_id: overrides.step_id ?? 7, ...overrides.request?.viewer },
    }),
    waiting_since: overrides.waiting_since ?? "2026-10-28T09:12:00+01:00",
    via_delegation_from: overrides.via_delegation_from ?? null,
    decision_context: overrides.decision_context ?? { balance: null, teammates_away: [], cap: null },
  };
}

export function makePreview(overrides: Partial<Preview> = {}): Preview {
  return {
    quantity: "3.00",
    skipped_days: [],
    chain: [
      { position: 1, rule: "line_manager", mode: "approve", approvers: ["Sami Ben Ali"] },
      { position: 2, rule: "hr_role", mode: "approve", approvers: ["Leila Gharbi"] },
    ],
    balance: null,
    usage: { cap: null, month_hours: null, event_days_allowed: null },
    certificate_due_at: null,
    problems: [],
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<ExceptionalEventOut> = {}): ExceptionalEventOut {
  return {
    id: 1,
    name_fr: "Mariage",
    name_en: "Marriage",
    name: "Mariage",
    days_allowed: "3.00",
    proof_required: true,
    is_active: true,
    ...overrides,
  };
}

export function makeHoliday(overrides: Partial<HolidayOut> = {}): HolidayOut {
  return {
    id: 1,
    date: "2026-05-01",
    name_fr: "Fête du travail",
    name_en: "Labour Day",
    name: "Fête du travail",
    recurs_yearly: true,
    ...overrides,
  };
}

```

- [ ] **Step 6: Write the test that pins the shared building blocks**

`frontend/src/features/requests/shared.contract.test.tsx`:

```tsx
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  DataTable, DateField, Disclosure, EmptyState, FileField, FilterBar, FilterDateRange, FilterSelect, FormSummary,
  PageHeader, Pager, SelectField, StatusBadge, SwitchField, TaskSheet, TextAreaField, TextField, TimeField, toast,
  useListParams,
} from "@/components";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateRange, formatDateTime, formatDays, formatHours } from "@/lib/format";
import { makeMe } from "@/test/fixtures";
import { chooseOption, pickFile, setDate, setText, setTime, toggle } from "@/test/formActions";
import { renderApp } from "@/test/render";

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });

interface Values {
  text: string;
  note: string;
  day: string;
  hour: string;
  choice: string;
  flag: boolean;
  file: File | null;
}

function Fields({ onValues }: { onValues: (values: Values) => void }) {
  const form = useForm<Values>({
    defaultValues: { text: "", note: "", day: "", hour: "", choice: "", flag: false, file: null },
  });
  return (
    <form onSubmit={form.handleSubmit(onValues)}>
      <TextField control={form.control} name="text" label="Texte" hint="Une aide" />
      <TextAreaField control={form.control} name="note" label="Note" optional />
      <DateField control={form.control} name="day" label="Jour" />
      <TimeField control={form.control} name="hour" label="Heure" />
      <SelectField
        control={form.control}
        name="choice"
        label="Choix"
        placeholder="Choisir"
        options={[
          { value: "a", label: "Option A" },
          { value: "b", label: "Option B" },
        ]}
      />
      <SwitchField control={form.control} name="flag" label="Drapeau" />
      <FileField control={form.control} name="file" label="Fichier" />
      <Button type="submit" variant="primary">
        Valider
      </Button>
    </form>
  );
}

function Params() {
  const params = useListParams({ status: "", from: "", to: "" });
  return (
    <>
      <output aria-label="valeur">{`${params.filters.status}|${params.page}|${JSON.stringify(params.query)}`}</output>
      <button onClick={() => params.setPage(3)}>page trois</button>
      <FilterBar more={<span>filtre de plus</span>}>
        <FilterSelect
          label="Situation"
          value={params.filters.status}
          onChange={(value) => params.setFilter("status", value)}
          options={[
            { value: "", label: "Toutes" },
            { value: "approved", label: "Approuvées" },
          ]}
        />
        <FilterDateRange
          label="Période"
          from={params.filters.from}
          to={params.filters.to}
          onFrom={(value) => params.setFilter("from", value)}
          onTo={(value) => params.setFilter("to", value)}
        />
      </FilterBar>
      <Link to="/me/requests/req-1">ailleurs</Link>
    </>
  );
}

function Sheet() {
  const [open, setOpen] = useState(true);
  return (
    <TaskSheet open={open} onOpenChange={setOpen} title="Une tâche" footer={<Button onClick={() => setOpen(false)}>Terminer</Button>}>
      <p>Contenu de la tâche</p>
    </TaskSheet>
  );
}

describe("the shared building blocks this feature is written against", () => {
  it("form inputs are found by their label and give plain values", async () => {
    const onValues = vi.fn();
    renderApp(<Fields onValues={onValues} />, { route: "/me", path: "/me", me });
    setText("Texte", "bonjour");
    setText("Note (facultatif)", "une note");
    setDate("Jour", "2026-11-09");
    setTime("Heure", "14:30");
    await chooseOption("Choix", "Option B");
    await toggle("Drapeau");
    const file = new File(["%PDF-1.4"], "certificat.pdf", { type: "application/pdf" });
    await pickFile("Fichier", file);
    await userEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(onValues).toHaveBeenCalledTimes(1);
    expect(onValues.mock.calls[0][0]).toEqual({
      text: "bonjour",
      note: "une note",
      day: "2026-11-09",
      hour: "14:30",
      choice: "b",
      flag: true,
      file,
    });
  });

  it("a table opens a row from its first column, which is plain text", async () => {
    const onRowOpen = vi.fn();
    renderApp(
      <>
        <PageHeader title="Mes demandes" back="/me" primary={<Button variant="primary">Nouvelle demande</Button>} />
        <DataTable
          columns={[
            { key: "name", header: "Nom", cell: (row: { id: string; name: string }) => row.name },
            { key: "status", header: "Situation", cell: () => <StatusBadge tone="waiting">En attente de Sami</StatusBadge> },
          ]}
          rows={[{ id: "1", name: "Amal" }]}
          rowKey={(row) => row.id}
          onRowOpen={onRowOpen}
          empty={<EmptyState title="Rien ici" hint="Pourquoi" />}
          isLoading={false}
        />
        <Pager page={1} pageSize={25} total={60} onPage={() => undefined} />
        <FormSummary problems={["Un problème général"]} />
      </>,
      { route: "/me", path: "/me", me },
    );
    expect(screen.getByRole("heading", { name: "Mes demandes" })).toBeInTheDocument();
    expect(screen.getByText("En attente de Sami")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Un problème général");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Amal" }));
    expect(onRowOpen).toHaveBeenCalledWith({ id: "1", name: "Amal" });
  });

  it("an empty table shows why it is empty", () => {
    renderApp(
      <DataTable
        columns={[{ key: "name", header: "Nom", cell: (row: { id: string }) => row.id }]}
        rows={[]}
        rowKey={(row) => row.id}
        empty={<EmptyState title="Rien ici" hint="Pourquoi" />}
      />,
      { route: "/me", path: "/me", me },
    );
    expect(screen.getByText("Rien ici")).toBeInTheDocument();
    expect(screen.getByText("Pourquoi")).toBeInTheDocument();
  });

  it("a disclosure mounts its content only once opened", async () => {
    renderApp(
      <Disclosure title="Historique">
        <p>Détail</p>
      </Disclosure>,
      { route: "/me", path: "/me", me },
    );
    expect(screen.queryByText("Détail")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Historique"));
    expect(screen.getByText("Détail")).toBeInTheDocument();
  });

  it("a task sheet is a dialog named by its title", async () => {
    renderApp(<Sheet />, { route: "/me", path: "/me", me });
    const dialog = screen.getByRole("dialog", { name: "Une tâche" });
    expect(within(dialog).getByText("Contenu de la tâche")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Terminer" }));
    expect(screen.queryByRole("dialog", { name: "Une tâche" })).not.toBeInTheDocument();
  });

  it("list parameters live in the address, and a new filter returns to the first page", async () => {
    renderApp(<Params />, { route: "/me/requests", path: "/me/requests", me });
    expect(screen.getByLabelText("valeur")).toHaveTextContent('|1|{"page":1}');
    await userEvent.click(screen.getByRole("button", { name: "page trois" }));
    expect(screen.getByLabelText("valeur")).toHaveTextContent("|3|");
    await chooseOption("Situation", "Approuvées");
    expect(screen.getByLabelText("valeur")).toHaveTextContent('approved|1|{"page":1,"status":"approved"}');
    setDate("Du", "2026-11-01");
    setDate("Au", "2026-11-30");
    expect(screen.getByLabelText("valeur")).toHaveTextContent('"from":"2026-11-01","to":"2026-11-30"');
  });

  it("a page that navigates away leaves its address in sight", async () => {
    renderApp(<Params />, { route: "/me/requests", path: "/me/requests", me });
    await userEvent.click(screen.getByRole("link", { name: "ailleurs" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/req-1");
  });

  it("formatters take a value and a language", () => {
    for (const lang of ["fr", "en"] as const) {
      expect(formatDate("2026-11-09", lang)).toMatch(/2026/);
      expect(formatDateRange("2026-11-09", "2026-11-11", lang)).toMatch(/11/);
      expect(formatDateTime("2026-11-09T14:30:00+01:00", lang)).toMatch(/14/);
      expect(formatDays("2.5", lang)).toMatch(/2[.,]5/);
      expect(formatHours("1.25", lang)).toMatch(/1[.,]25/);
    }
  });

  it("a toast acknowledges an action and can offer to take it back", async () => {
    const undo = vi.fn();
    renderApp(<p>page</p>, { route: "/me", path: "/me", me });
    act(() => toast("Brouillon supprimé.", { undo }));
    expect(await screen.findByText("Brouillon supprimé.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Annuler l'action" }));
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 7: Run it**

Run: `docker compose run --rm web npx vitest run src/features/requests/shared.contract.test.tsx`

Expected: PASS, 9 tests. This test is not expected to fail first: it states how this feature uses what plan 01b built. If a case fails, a shared building block differs from plan 01b as written. Read the component, keep its behaviour, and change this test and the call sites of the tasks that follow to match; change nothing in `src/components/`. If only the way an input is operated differs, change the helpers of `src/test/formActions.ts` and nothing else.

- [ ] **Step 8: Write the failing test of the API layer**

`frontend/src/features/requests/api.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  makeRequest, makeRequestDetail, makeType, paginated, problemResponse, TYPES,
} from "@/features/requests/fixtures";
import { server } from "@/test/server";
import {
  isConflict, requestsApi, useAttachFile, useDecideStep, useRequestList, useRequestTypes, useSaveTypeSteps,
} from "./api";

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

describe("requests API layer", () => {
  it("sends the scope and only the filters that are set", async () => {
    let search = "";
    server.use(
      http.get("/api/v1/requests", ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json(paginated([makeRequest()]));
      }),
    );
    const { result } = renderHook(
      () => useRequestList({ scope: "mine", status: "approved", type: "", year: "2026", page: 1, page_size: 25 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const query = new URLSearchParams(search);
    expect(query.get("scope")).toBe("mine");
    expect(query.get("status")).toBe("approved");
    expect(query.get("year")).toBe("2026");
    expect(query.has("type")).toBe(false);
    expect(result.current.data?.results[0].public_id).toBe("req-1");
  });

  it("posts a decision with the version and refreshes every request query", async () => {
    let listCalls = 0;
    let body: unknown;
    server.use(
      http.get("/api/v1/requests", () => {
        listCalls += 1;
        return HttpResponse.json(paginated([makeRequest()]));
      }),
      http.post("/api/v1/steps/7/decide", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeRequestDetail({ status: "approved" }));
      }),
    );
    const { result } = renderHook(() => ({ list: useRequestList({ scope: "team" }), decide: useDecideStep() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    await act(async () => {
      await result.current.decide.mutateAsync({ stepId: 7, body: { decision: "approve", comment: "", version: 3 } });
    });
    expect(body).toEqual({ decision: "approve", comment: "", version: 3 });
    await waitFor(() => expect(listCalls).toBe(2));
  });

  it("reports a 409 as a conflict and still refreshes", async () => {
    let listCalls = 0;
    server.use(
      http.get("/api/v1/requests", () => {
        listCalls += 1;
        return HttpResponse.json(paginated([makeRequest()]));
      }),
      http.post("/api/v1/steps/7/decide", () =>
        problemResponse(409, "request.already_processed", "Cette demande a déjà été traitée."),
      ),
    );
    const { result } = renderHook(() => ({ list: useRequestList({ scope: "team" }), decide: useDecideStep() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    let caught: unknown;
    await act(async () => {
      try {
        await result.current.decide.mutateAsync({ stepId: 7, body: { decision: "approve", comment: "", version: 3 } });
      } catch (error) {
        caught = error;
      }
    });
    expect(isConflict(caught)).toBe(true);
    await waitFor(() => expect(listCalls).toBe(2));
  });

  it("creates a draft, then submits it with the version it received", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("/api/v1/requests", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(makeRequestDetail({ public_id: "new-1", version: 4, status: "draft" }), { status: 201 });
      }),
      http.post("/api/v1/requests/new-1/submit", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(makeRequestDetail({ public_id: "new-1", version: 5 }));
      }),
    );
    const draft = await requestsApi.create({
      type: "annual",
      start_date: "2026-11-09",
      end_date: "2026-11-11",
      starts_at_midday: false,
      ends_at_midday: false,
      start_time: null,
      end_time: null,
      exceptional_event: null,
      comment: "",
    });
    const sent = await requestsApi.submit(draft.public_id, draft.version);
    expect(bodies[0]).toMatchObject({ type: "annual", start_date: "2026-11-09", end_date: "2026-11-11" });
    expect(bodies[1]).toEqual({ version: 4 });
    expect(sent.version).toBe(5);
  });

  it("uploads a file to the request it belongs to", async () => {
    let uploads = 0;
    server.use(
      http.post("/api/v1/requests/req-1/attachments", () => {
        uploads += 1;
        return HttpResponse.json(
          { public_id: "att-1", kind: "medical", name: "certificat.pdf", size: 8, uploaded_by: "Amal Trabelsi", uploaded_at: "2026-10-28T10:00:00+01:00" },
          { status: 201 },
        );
      }),
    );
    const { result } = renderHook(() => useAttachFile(), { wrapper });
    const file = new File(["%PDF-1.4"], "certificat.pdf", { type: "application/pdf" });
    await act(async () => {
      await result.current.mutateAsync({ id: "req-1", file });
    });
    expect(uploads).toBe(1);
  });

  it("replaces the steps of a type, in order", async () => {
    let body: unknown;
    server.use(
      http.put("/api/v1/request-types/1/steps", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json([]);
      }),
    );
    const { result } = renderHook(() => useSaveTypeSteps(), { wrapper });
    const steps = [
      { approver_rule: "line_manager" as const, named_person: null, mode: "approve" as const, reminder_after_days: 2, flag_after_days: 4 },
      { approver_rule: "hr_role" as const, named_person: null, mode: "approve" as const, reminder_after_days: 2, flag_after_days: 4 },
    ];
    await act(async () => {
      await result.current.mutateAsync({ typeId: 1, steps });
    });
    expect(body).toEqual({ steps });
  });

  it("reads a configuration list whether it arrives bare or paginated", async () => {
    server.use(http.get("/api/v1/request-types", () => HttpResponse.json(paginated([TYPES.annual, makeType("sick")]))));
    const { result } = renderHook(() => useRequestTypes(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((type) => type.code)).toEqual(["annual", "sick"]);
  });
});
```

- [ ] **Step 9: Run it to see it fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/api.test.tsx`

Expected: FAIL with "Failed to resolve import "./api"".

- [ ] **Step 10: Write the API layer**

`frontend/src/features/requests/api.ts`:

```ts
import {
  keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey,
} from "@tanstack/react-query";
import { api, call } from "@/api/client";
import { ProblemError } from "@/api/problem";
import { rowsOf, type Paginated } from "./platform";
import type {
  AmendmentBody, ApprovalItem, ApprovalParams, AttachmentOut, ChainStepInput, ChainStepOut, ChainStepPreview,
  CorrectBody, CreateRequestBody, DecideBody, ExceptionalEventInput, ExceptionalEventOut, HistoryItem, HolidayImpact,
  HolidayInput, HolidayOut, Preview, PreviewBody, ReassignBody, RecordOnBehalfInput, RequestDetail, RequestListParams,
  RequestOut, RequestTypeInput, RequestTypeOut, UpdateRequestBody,
} from "./types";

// ---------------------------------------------------------------- boundary helpers

/** Responses are read as the shapes of `types.ts`; `types.contract.ts` checks them against the schema. */
const shaped = <T>(promise: Promise<unknown>) => promise as Promise<T>;

/** A query string without its empty values. */
function compact(params: object): never {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== undefined && value !== null) out[key] = value as string | number | boolean;
  }
  return out as never;
}

const json = (value: unknown) => value as never;

function multipart(fields: Record<string, string | Blob | null>): () => FormData {
  return () => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value !== null) data.append(key, value);
    }
    return data;
  };
}

const byPublicId = (public_id: string) => ({ path: { public_id } });
const byId = (id: number) => ({ path: { id } });

// ---------------------------------------------------------------- keys

export const requestKeys = {
  all: ["requests"] as const,
  list: (params: RequestListParams) => ["requests", "list", params] as const,
  detail: (id: string) => ["requests", "detail", id] as const,
  history: (id: string) => ["requests", "history", id] as const,
  preview: (body: PreviewBody | null) => ["requests", "preview", body] as const,
  approvals: (params: ApprovalParams) => ["requests", "approvals", params] as const,
};

const CONFIG_ROOT = ["request-config"] as const;

export const configKeys = {
  all: CONFIG_ROOT,
  types: [...CONFIG_ROOT, "types"] as const,
  steps: (typeId: number) => [...CONFIG_ROOT, "steps", typeId] as const,
  chainPreview: (typeId: number, employee: string) => [...CONFIG_ROOT, "chain-preview", typeId, employee] as const,
  events: [...CONFIG_ROOT, "events"] as const,
  holidays: (year: number) => [...CONFIG_ROOT, "holidays", year] as const,
  holidayImpact: (date: string) => [...CONFIG_ROOT, "holiday-impact", date] as const,
  departments: (lang: string) => [...CONFIG_ROOT, "departments", lang] as const,
};

/**
 * Query keys refetched after every change to a request. Plans 04 and 05 append their own
 * (balances, home blocks, switcher counts) so those refresh without a manual reload.
 */
export const AFFECTED_KEYS: QueryKey[] = [requestKeys.all];

export async function refreshRequests(qc: QueryClient): Promise<void> {
  await Promise.all(AFFECTED_KEYS.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export function isConflict(error: unknown): boolean {
  return error instanceof ProblemError && error.status === 409;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ProblemError && error.status === 404;
}

// ---------------------------------------------------------------- calls

export const requestsApi = {
  list: (params: RequestListParams) =>
    shaped<Paginated<RequestOut>>(call(api.GET("/api/v1/requests", { params: { query: compact(params) } }))),
  detail: (id: string) =>
    shaped<RequestDetail>(call(api.GET("/api/v1/requests/{public_id}", { params: byPublicId(id) }))),
  history: (id: string) =>
    shaped<HistoryItem[]>(call(api.GET("/api/v1/requests/{public_id}/history", { params: byPublicId(id) }))),
  preview: (body: PreviewBody) =>
    shaped<Preview>(call(api.POST("/api/v1/requests/preview", { body: json(body) }))),
  create: (body: CreateRequestBody) =>
    shaped<RequestDetail>(call(api.POST("/api/v1/requests", { body: json(body) }))),
  update: (id: string, body: UpdateRequestBody) =>
    shaped<RequestDetail>(
      call(api.PATCH("/api/v1/requests/{public_id}", { params: byPublicId(id), body: json(body) })),
    ),
  discard: (id: string) =>
    shaped<void>(call(api.DELETE("/api/v1/requests/{public_id}", { params: byPublicId(id) }))),
  submit: (id: string, version: number) =>
    shaped<RequestDetail>(
      call(api.POST("/api/v1/requests/{public_id}/submit", { params: byPublicId(id), body: json({ version }) })),
    ),
  withdraw: (id: string) =>
    shaped<RequestDetail>(
      call(api.POST("/api/v1/requests/{public_id}/withdraw", { params: byPublicId(id), body: json({}) })),
    ),
  attach: (id: string, file: File) =>
    shaped<AttachmentOut>(
      call(
        api.POST("/api/v1/requests/{public_id}/attachments", {
          params: byPublicId(id),
          body: json({ file }),
          bodySerializer: multipart({ file }),
        }),
      ),
    ),
  openAmendment: (id: string, body: AmendmentBody) =>
    shaped<RequestDetail>(
      call(api.POST("/api/v1/requests/{public_id}/amendments", { params: byPublicId(id), body: json(body) })),
    ),
  withdrawAmendment: (amendmentId: string) =>
    shaped<RequestDetail>(
      call(api.POST("/api/v1/amendments/{public_id}/withdraw", { params: byPublicId(amendmentId), body: json({}) })),
    ),
  correct: (id: string, body: CorrectBody) =>
    shaped<RequestDetail>(
      call(api.POST("/api/v1/requests/{public_id}/correct", { params: byPublicId(id), body: json(body) })),
    ),
  cancel: (id: string, reason: string) =>
    shaped<RequestDetail>(
      call(api.POST("/api/v1/requests/{public_id}/cancel", { params: byPublicId(id), body: json({ reason }) })),
    ),
  reclassify: (id: string, overrideReason: string) =>
    shaped<RequestDetail>(
      call(
        api.POST("/api/v1/requests/{public_id}/reclassify", {
          params: byPublicId(id),
          body: json(overrideReason ? { override_reason: overrideReason } : {}),
        }),
      ),
    ),
  approvals: (params: ApprovalParams) =>
    shaped<Paginated<ApprovalItem>>(call(api.GET("/api/v1/approvals", { params: { query: compact(params) } }))),
  decide: (stepId: number, body: DecideBody) =>
    shaped<RequestDetail>(call(api.POST("/api/v1/steps/{id}/decide", { params: byId(stepId), body: json(body) }))),
  recordOnBehalf: (stepId: number, input: RecordOnBehalfInput) =>
    shaped<RequestDetail>(
      call(
        api.POST("/api/v1/steps/{id}/record-on-behalf", {
          params: byId(stepId),
          body: json(input),
          bodySerializer: multipart({
            decided_by: input.decided_by,
            decision: input.decision,
            decided_at: input.decided_at,
            channel: input.channel,
            note: input.note,
            version: String(input.version),
            scan: input.scan,
          }),
        }),
      ),
    ),
  reassign: (stepId: number, body: ReassignBody) =>
    shaped<RequestDetail>(call(api.POST("/api/v1/steps/{id}/reassign", { params: byId(stepId), body: json(body) }))),
};

interface DepartmentRow {
  id: number;
  name?: string;
  name_fr?: string;
  name_en?: string;
}

export const configApi = {
  types: async () =>
    rowsOf(await shaped<RequestTypeOut[] | Paginated<RequestTypeOut>>(call(api.GET("/api/v1/request-types")))),
  createType: (body: RequestTypeInput) =>
    shaped<RequestTypeOut>(call(api.POST("/api/v1/request-types", { body: json(body) }))),
  updateType: (id: number, body: Partial<RequestTypeInput>) =>
    shaped<RequestTypeOut>(call(api.PATCH("/api/v1/request-types/{id}", { params: byId(id), body: json(body) }))),
  steps: async (typeId: number) =>
    rowsOf(
      await shaped<ChainStepOut[] | Paginated<ChainStepOut>>(
        call(api.GET("/api/v1/request-types/{id}/steps", { params: byId(typeId) })),
      ),
    ),
  saveSteps: (typeId: number, steps: ChainStepInput[]) =>
    shaped<ChainStepOut[]>(
      call(api.PUT("/api/v1/request-types/{id}/steps", { params: byId(typeId), body: json({ steps }) })),
    ),
  chainPreview: (typeId: number, employee: string) =>
    shaped<ChainStepPreview[]>(
      call(
        api.GET("/api/v1/request-types/{id}/chain-preview", {
          params: { path: { id: typeId }, query: compact({ employee }) },
        }),
      ),
    ),
  events: async () =>
    rowsOf(
      await shaped<ExceptionalEventOut[] | Paginated<ExceptionalEventOut>>(call(api.GET("/api/v1/exceptional-events"))),
    ),
  createEvent: (body: ExceptionalEventInput) =>
    shaped<ExceptionalEventOut>(call(api.POST("/api/v1/exceptional-events", { body: json(body) }))),
  updateEvent: (id: number, body: ExceptionalEventInput) =>
    shaped<ExceptionalEventOut>(
      call(api.PATCH("/api/v1/exceptional-events/{id}", { params: byId(id), body: json(body) })),
    ),
  holidays: async (year: number) =>
    rowsOf(
      await shaped<HolidayOut[] | Paginated<HolidayOut>>(
        call(api.GET("/api/v1/holidays", { params: { query: compact({ year }) } })),
      ),
    ),
  createHoliday: (body: HolidayInput) =>
    shaped<HolidayOut>(call(api.POST("/api/v1/holidays", { body: json(body) }))),
  updateHoliday: (id: number, body: HolidayInput) =>
    shaped<HolidayOut>(call(api.PATCH("/api/v1/holidays/{id}", { params: byId(id), body: json(body) }))),
  deleteHoliday: (id: number) => shaped<void>(call(api.DELETE("/api/v1/holidays/{id}", { params: byId(id) }))),
  copyHolidays: (fromYear: number, toYear: number) =>
    shaped<HolidayOut[]>(
      call(api.POST("/api/v1/holidays/copy", { body: json({ from_year: fromYear, to_year: toYear }) })),
    ),
  holidayImpact: async (date: string) =>
    rowsOf(
      await shaped<HolidayImpact[] | Paginated<HolidayImpact>>(
        call(api.GET("/api/v1/holidays/impact", { params: { query: compact({ date }) } })),
      ),
    ),
  departments: async (lang: string) =>
    rowsOf(await shaped<DepartmentRow[] | Paginated<DepartmentRow>>(call(api.GET("/api/v1/departments")))).map(
      (row) => ({
        value: String(row.id),
        label: row.name ?? (lang.startsWith("en") ? row.name_en : row.name_fr) ?? String(row.id),
      }),
    ),
};

// ---------------------------------------------------------------- request queries and mutations

export function useRequestList(params: RequestListParams) {
  return useQuery({
    queryKey: requestKeys.list(params),
    queryFn: () => requestsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useRequest(id: string) {
  return useQuery({
    queryKey: requestKeys.detail(id),
    queryFn: () => requestsApi.detail(id),
    enabled: id !== "",
    retry: false,
  });
}

export function useRequestHistory(id: string) {
  return useQuery({ queryKey: requestKeys.history(id), queryFn: () => requestsApi.history(id), retry: false });
}

export function usePreview(body: PreviewBody | null) {
  return useQuery({
    queryKey: requestKeys.preview(body),
    queryFn: () => requestsApi.preview(body as PreviewBody),
    enabled: body !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useApprovals(params: ApprovalParams) {
  return useQuery({
    queryKey: requestKeys.approvals(params),
    queryFn: () => requestsApi.approvals(params),
    placeholderData: keepPreviousData,
  });
}

function useRequestMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn, onSettled: () => refreshRequests(qc) });
}

export const useCreateRequest = () => useRequestMutation(requestsApi.create);
export const useUpdateRequest = () =>
  useRequestMutation(({ id, body }: { id: string; body: UpdateRequestBody }) => requestsApi.update(id, body));
export const useSubmitRequest = () =>
  useRequestMutation(({ id, version }: { id: string; version: number }) => requestsApi.submit(id, version));
export const useWithdrawRequest = () => useRequestMutation(requestsApi.withdraw);
export const useDiscardRequest = () => useRequestMutation(requestsApi.discard);
export const useAttachFile = () =>
  useRequestMutation(({ id, file }: { id: string; file: File }) => requestsApi.attach(id, file));
export const useOpenAmendment = () =>
  useRequestMutation(({ id, body }: { id: string; body: AmendmentBody }) => requestsApi.openAmendment(id, body));
export const useWithdrawAmendment = () => useRequestMutation(requestsApi.withdrawAmendment);
export const useCorrectRequest = () =>
  useRequestMutation(({ id, body }: { id: string; body: CorrectBody }) => requestsApi.correct(id, body));
export const useCancelRequest = () =>
  useRequestMutation(({ id, reason }: { id: string; reason: string }) => requestsApi.cancel(id, reason));
export const useReclassifyRequest = () =>
  useRequestMutation(({ id, overrideReason }: { id: string; overrideReason: string }) =>
    requestsApi.reclassify(id, overrideReason),
  );
export const useDecideStep = () =>
  useRequestMutation(({ stepId, body }: { stepId: number; body: DecideBody }) => requestsApi.decide(stepId, body));
export const useRecordOnBehalf = () =>
  useRequestMutation(({ stepId, input }: { stepId: number; input: RecordOnBehalfInput }) =>
    requestsApi.recordOnBehalf(stepId, input),
  );
export const useReassignStep = () =>
  useRequestMutation(({ stepId, body }: { stepId: number; body: ReassignBody }) => requestsApi.reassign(stepId, body));

// ---------------------------------------------------------------- configuration queries and mutations

function useConfigMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>, alsoRequests = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: configKeys.all });
      if (alsoRequests) await refreshRequests(qc);
    },
  });
}

export function useRequestTypes() {
  return useQuery({ queryKey: configKeys.types, queryFn: configApi.types, staleTime: 60_000 });
}

export const useSaveType = () =>
  useConfigMutation(({ id, body }: { id: number | null; body: RequestTypeInput }) => {
    if (id === null) return configApi.createType(body);
    // The code and the unit of a type are fixed once it exists (plan 03a): they are not sent again.
    const changes: Partial<RequestTypeInput> = { ...body };
    delete changes.code;
    delete changes.unit;
    return configApi.updateType(id, changes);
  });

export function useTypeSteps(typeId: number | null) {
  return useQuery({
    queryKey: configKeys.steps(typeId ?? 0),
    queryFn: () => configApi.steps(typeId as number),
    enabled: typeId !== null,
  });
}

export const useSaveTypeSteps = () =>
  useConfigMutation(({ typeId, steps }: { typeId: number; steps: ChainStepInput[] }) =>
    configApi.saveSteps(typeId, steps),
  );

export function useChainPreview(typeId: number | null, employee: string | null) {
  return useQuery({
    queryKey: configKeys.chainPreview(typeId ?? 0, employee ?? ""),
    queryFn: () => configApi.chainPreview(typeId as number, employee as string),
    enabled: typeId !== null && employee !== null,
    retry: false,
  });
}

export function useEvents(enabled = true) {
  return useQuery({ queryKey: configKeys.events, queryFn: configApi.events, enabled, staleTime: 60_000 });
}

export const useSaveEvent = () =>
  useConfigMutation(({ id, body }: { id: number | null; body: ExceptionalEventInput }) =>
    id === null ? configApi.createEvent(body) : configApi.updateEvent(id, body),
  );

export function useHolidays(year: number) {
  return useQuery({ queryKey: configKeys.holidays(year), queryFn: () => configApi.holidays(year) });
}

export const useSaveHoliday = () =>
  useConfigMutation(
    ({ id, body }: { id: number | null; body: HolidayInput }) =>
      id === null ? configApi.createHoliday(body) : configApi.updateHoliday(id, body),
    true,
  );
export const useDeleteHoliday = () => useConfigMutation(configApi.deleteHoliday, true);
export const useCopyHolidays = () =>
  useConfigMutation(
    ({ fromYear, toYear }: { fromYear: number; toYear: number }) => configApi.copyHolidays(fromYear, toYear),
    true,
  );

export function useHolidayImpact(date: string) {
  return useQuery({
    queryKey: configKeys.holidayImpact(date),
    queryFn: () => configApi.holidayImpact(date),
    enabled: date !== "",
    retry: false,
  });
}

/** Departments as select options. Only HR and executives may read them: pass `enabled` accordingly. */
export function useDepartmentOptions(lang: string, enabled = true) {
  return useQuery({
    queryKey: configKeys.departments(lang),
    queryFn: () => configApi.departments(lang),
    enabled,
    staleTime: 300_000,
  });
}
```

Plan 02 already sends a file through the same client (`useAddDocument` in `frontend/src/features/employees/api.ts`). Open it and send the two multipart calls here (`attach`, `recordOnBehalf`) the same way: if it passes a `FormData` built beforehand, or removes the JSON `Content-Type` by hand, do the same in place of `bodySerializer`. The test "uploads a file to the request it belongs to" only proves that the call is made; the browser journeys of Task 20 prove the file arrives.

- [ ] **Step 11: Run the test to see it pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/api.test.tsx`

Expected: PASS, 7 tests.

- [ ] **Step 12: Add the check against the generated schema**

`frontend/src/features/requests/types.contract.ts`:

```ts
import type { paths } from "@/api/schema";
import type { ApprovalItem, Preview, RequestDetail, RequestOut } from "./types";

/**
 * Fails the type check when the generated API description lacks a field this feature reads.
 * A failure here means a response differs from master plan section 7.9, or that its serializer
 * is not described to drf-spectacular. The fix belongs in the backend (plan 03a), not in types.ts.
 */
type Body<R> = R extends { content: { "application/json": infer B } } ? B : never;
type Ok<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { responses: infer R }
  ? R extends { 200: infer A }
    ? Body<A>
    : R extends { 201: infer B }
      ? Body<B>
      : never
  : never;
type Known<T> = [T] extends [never] ? { __response_not_described__: true } : NonNullable<T>;
type MissingKeys<Mine, Generated> = Exclude<keyof Mine, keyof Known<Generated>>;
type Complete<Missing extends never> = Missing;
type Row<L> = L extends { results?: (infer R)[] } ? R : L extends (infer R)[] ? R : never;
type Prop<T, K extends string> = K extends keyof Known<T> ? Known<T>[K] : never;

type GeneratedDetail = Ok<"/api/v1/requests/{public_id}", "get">;
type GeneratedList = Ok<"/api/v1/requests", "get">;
type GeneratedApprovals = Ok<"/api/v1/approvals", "get">;
type GeneratedPreview = Ok<"/api/v1/requests/preview", "post">;

export type DetailIsComplete = Complete<MissingKeys<RequestDetail, GeneratedDetail>>;
export type StateIsComplete = Complete<MissingKeys<RequestOut["state"], Prop<GeneratedDetail, "state">>>;
export type ViewerIsComplete = Complete<MissingKeys<RequestOut["viewer"], Prop<GeneratedDetail, "viewer">>>;
export type ListRowIsComplete = Complete<MissingKeys<RequestOut, Row<GeneratedList>>>;
export type ApprovalIsComplete = Complete<MissingKeys<ApprovalItem, Row<GeneratedApprovals>>>;
export type PreviewIsComplete = Complete<MissingKeys<Preview, GeneratedPreview>>;
```

Run: `docker compose run --rm web npm run typecheck`

Expected: no error. An error on one of the six `...IsComplete` lines names the missing field in its message (`Type '"viewer"' does not satisfy the constraint 'never'`). That is a defect of the backend against the master contract: stop and have it corrected there.

- [ ] **Step 13: Create the translation files**

`frontend/src/i18n/locales/fr/requests.json`:

```json
{
  "common": {
    "hr": "les RH",
    "cancel": "Annuler",
    "save": "Enregistrer",
    "open": "Ouvrir",
    "edit": "Modifier",
    "send": "Envoyer",
    "newRequest": "Nouvelle demande",
    "discard": "Supprimer le brouillon",
    "withdraw": "Retirer la demande",
    "yes": "Oui",
    "no": "Non",
    "all": "Tous",
    "seeAll": "Tout voir",
    "reason": "Motif",
    "who": "Qui",
    "department": "Département",
    "type": "Type",
    "dates": "Dates",
    "quantity": "Durée",
    "status": "Situation"
  }
}
```

`frontend/src/i18n/locales/en/requests.json`:

```json
{
  "common": {
    "hr": "HR",
    "cancel": "Cancel",
    "save": "Save",
    "open": "Open",
    "edit": "Edit",
    "send": "Send",
    "newRequest": "New request",
    "discard": "Discard the draft",
    "withdraw": "Withdraw the request",
    "yes": "Yes",
    "no": "No",
    "all": "All",
    "seeAll": "See all",
    "reason": "Reason",
    "who": "Who",
    "department": "Department",
    "type": "Type",
    "dates": "Dates",
    "quantity": "Length",
    "status": "Status"
  }
}
```

Every later task adds top-level sections to these two files. A step that says "add to both translation files" gives the French and the English section; insert each as a new top-level key, keeping the files valid JSON.

Run: `docker compose run --rm web npx vitest run src/i18n/parity.test.ts`

Expected: PASS.

- [ ] **Step 14: Lint and commit**

Run: `docker compose run --rm web npm run lint`

Expected: no error.

```bash
git add frontend/src/api/schema.d.ts frontend/src/features/requests frontend/src/test frontend/src/i18n/locales
git commit -m "feat(requests): API hooks, types and test fixtures for the request pages"
```

### Task 2: Status sentences, type tags, dates and quantities in words

**Files:**
- Create: `frontend/src/features/requests/status.ts`
- Create: `frontend/src/features/requests/text.ts`
- Create: `frontend/src/features/requests/StatusSentence.tsx`
- Create: `frontend/src/features/requests/TypeTag.tsx`
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (sections `status`, `certificate`, `amendment`, `when`, `next`)
- Test: `frontend/src/features/requests/status.test.ts`
- Test: `frontend/src/features/requests/text.test.ts`
- Test: `frontend/src/features/requests/StatusSentence.test.tsx`

**Interfaces:**
- Consumes: `RequestOut`, `RequestDetail` (Task 1); `Translate`, `useRequestsText` (Task 1); `Lang` from `@/i18n`; `formatDate`, `formatDateRange`, `formatDateTime`, `formatDays`, `formatHours` from `@/lib/format`; `StatusBadge` from `@/components`; `cn` from `@/lib/utils`.
- Produces:
  - `status.ts`: `type Tone`, `type Angle = "requester" | "actor" | "observer"`, `interface Sentence { tone: Tone; text: string }`, `angleOf(request: RequestOut): Angle`, `stateSentence(request, t): Sentence`, `certificateSentence(request, t, lang): Sentence | null`, `amendmentSentence(request, t): Sentence | null`, `headline(request, t, lang): Sentence`, `allSentences(request, t, lang): Sentence[]`, `nextStep(request: RequestDetail, t): string | null`.
  - `text.ts`: `describeWhen(request, t, lang): string`, `describeQuantity(request, lang): string`.
  - `StatusSentence({ request, detail? })`, `TypeTag({ code, name })`.

How a status reads (UI 3.5), as implemented here:

| `state.key` | Requester (`viewer.relation = owner`) | Actor (`viewer.actions` has `decide`) | Observer (everyone else) |
|---|---|---|---|
| `draft` | Not sent yet | Not sent yet | Not sent yet |
| `waiting_manager`, `waiting_person` | Waiting for *names* | Waiting for your decision | Waiting for *names* |
| `waiting_hr` | Approved by *last actor*; waiting for HR (or "Waiting for HR") | To validate | as the requester |
| `returned` | Sent back to you: *note* | Sent back to *requester* | Sent back to *requester* |
| `approved` | Approved | Approved | Approved |
| `rejected` | Refused: *note* | Refused | Refused |
| `withdrawn` | Withdrawn by you | Withdrawn by *requester* | Withdrawn by *requester* |
| `cancelled` | Cancelled | Cancelled | Cancelled |

A pending request whose certificate is `due` or `overdue` reads "Certificate due by *date*". An open amendment reads "Your change is waiting for *who*" to the requester and "Change to decide" to the actor. In a list the one sentence shown is, in order of precedence: the amendment, the certificate, the state.

- [ ] **Step 1: Add the texts to both translation files**

French (`fr/requests.json`):

```json
  "status": {
    "draft": "Pas encore envoyée",
    "approved": "Approuvée",
    "cancelled": "Annulée",
    "rejected": "Refusée",
    "waitingFor": "En attente de {{names}}",
    "waitingNobody": "En attente d'une décision",
    "waitingHr": "En attente des RH",
    "approvedByWaitingHr": "Approuvée par {{actor}} ; en attente des RH",
    "actor": {
      "waiting": "En attente de votre décision",
      "toValidate": "À valider"
    },
    "requester": {
      "returned": "Renvoyée vers vous : {{note}}",
      "returnedNoNote": "Renvoyée vers vous",
      "rejected": "Refusée : {{note}}",
      "withdrawn": "Retirée par vous"
    },
    "observer": {
      "returned": "Renvoyée à {{requester}}",
      "withdrawn": "Retirée par {{requester}}"
    }
  },
  "certificate": {
    "due": "Certificat à fournir avant le {{date}}",
    "overdue": "Certificat en retard, attendu le {{date}}",
    "missing": "Justificatif pas encore fourni"
  },
  "amendment": {
    "requester": "Votre modification attend {{who}}",
    "actor": "Modification à décider",
    "observer": "Une modification attend {{who}}"
  },
  "when": {
    "morning": "{{date}}, le matin",
    "afternoon": "{{date}}, l'après-midi",
    "rangeFromMidday": "{{range}}, à partir de midi le premier jour",
    "rangeUntilMidday": "{{range}}, jusqu'à midi le dernier jour",
    "rangeBoth": "{{range}}, de midi le premier jour à midi le dernier",
    "hours": "{{date}}, de {{from}} à {{to}}"
  },
  "next": {
    "draft": "Rien n'est réservé tant que la demande n'est pas envoyée.",
    "returned": "Corrigez-la puis renvoyez-la : elle repartira de la première étape.",
    "approved": "Vous pouvez encore changer les dates ou l'annuler tant qu'elle n'a pas commencé.",
    "last": "C'est la dernière étape.",
    "thenHr": "Ensuite, les RH la valident.",
    "thenPerson": "Ensuite, {{names}} décide.",
    "thenSomeone": "Ensuite, elle passe à l'étape suivante."
  }
```

English (`en/requests.json`):

```json
  "status": {
    "draft": "Not sent yet",
    "approved": "Approved",
    "cancelled": "Cancelled",
    "rejected": "Refused",
    "waitingFor": "Waiting for {{names}}",
    "waitingNobody": "Waiting for a decision",
    "waitingHr": "Waiting for HR",
    "approvedByWaitingHr": "Approved by {{actor}}; waiting for HR",
    "actor": {
      "waiting": "Waiting for your decision",
      "toValidate": "To validate"
    },
    "requester": {
      "returned": "Sent back to you: {{note}}",
      "returnedNoNote": "Sent back to you",
      "rejected": "Refused: {{note}}",
      "withdrawn": "Withdrawn by you"
    },
    "observer": {
      "returned": "Sent back to {{requester}}",
      "withdrawn": "Withdrawn by {{requester}}"
    }
  },
  "certificate": {
    "due": "Certificate due by {{date}}",
    "overdue": "Certificate overdue, was due {{date}}",
    "missing": "Proof not provided yet"
  },
  "amendment": {
    "requester": "Your change is waiting for {{who}}",
    "actor": "Change to decide",
    "observer": "A change is waiting for {{who}}"
  },
  "when": {
    "morning": "{{date}}, morning",
    "afternoon": "{{date}}, afternoon",
    "rangeFromMidday": "{{range}}, from midday on the first day",
    "rangeUntilMidday": "{{range}}, until midday on the last day",
    "rangeBoth": "{{range}}, from midday on the first day to midday on the last",
    "hours": "{{date}}, {{from}} to {{to}}"
  },
  "next": {
    "draft": "Nothing is reserved until you send it.",
    "returned": "Correct it and send it again: it restarts at the first step.",
    "approved": "You can still change the dates or cancel it until it starts.",
    "last": "This is the last step.",
    "thenHr": "Then HR validates it.",
    "thenPerson": "Then {{names}} decides.",
    "thenSomeone": "Then it goes to the next step."
  }
```

- [ ] **Step 2: Write the failing tests**

`frontend/src/features/requests/status.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { makeRequest, makeRequestDetail, makeStep } from "@/features/requests/fixtures";
import type { Translate } from "./platform";
import {
  allSentences, amendmentSentence, angleOf, certificateSentence, headline, nextStep, stateSentence,
} from "./status";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

const translator = (lng: string): Translate => (key, options) => String(i18n.t(key, { ns: "requests", lng, ...options }));
const fr = translator("fr");
const en = translator("en");

const asActor = { relation: "approver" as const, actions: ["decide" as const], step_id: 7 };
const asObserver = { relation: "overview" as const, actions: [], step_id: null };

describe("the angle a request is read from", () => {
  it("is the requester's for one's own request, whatever else one may do", () => {
    expect(angleOf(makeRequest())).toBe("requester");
  });
  it("is the actor's for the person who can decide", () => {
    expect(angleOf(makeRequest({ viewer: asActor }))).toBe("actor");
  });
  it("is an observer's for everyone else", () => {
    expect(angleOf(makeRequest({ viewer: asObserver }))).toBe("observer");
    expect(angleOf(makeRequest({ viewer: { relation: "hr", actions: ["correct", "cancel"], step_id: null } }))).toBe("observer");
  });
});

describe("status sentences to the requester (UI 3.5)", () => {
  it.each([
    ["a draft", makeRequest({ status: "draft", state: { key: "draft", waiting_on: [] } }), "Pas encore envoyée", "Not sent yet"],
    ["waiting on the manager", makeRequest(), "En attente de Sami Ben Ali", "Waiting for Sami Ben Ali"],
    [
      "waiting on the manager and a delegate",
      makeRequest({ state: { waiting_on: ["Sami Ben Ali", "Nadia Karoui"] } }),
      "En attente de Sami Ben Ali, Nadia Karoui",
      "Waiting for Sami Ben Ali, Nadia Karoui",
    ],
    [
      "waiting on nobody who can act",
      makeRequest({ state: { waiting_on: [] } }),
      "En attente d'une décision",
      "Waiting for a decision",
    ],
    [
      "waiting on HR after the manager",
      makeRequest({ state: { key: "waiting_hr", waiting_on: ["Leila Gharbi"], last_actor: "Sami Ben Ali" } }),
      "Approuvée par Sami Ben Ali ; en attente des RH",
      "Approved by Sami Ben Ali; waiting for HR",
    ],
    [
      "waiting on HR with no earlier decision",
      makeRequest({ state: { key: "waiting_hr", waiting_on: ["Leila Gharbi"], last_actor: null } }),
      "En attente des RH",
      "Waiting for HR",
    ],
    [
      "sent back",
      makeRequest({ status: "returned", state: { key: "returned", waiting_on: [], last_actor: "Sami Ben Ali", note: "Trop long" } }),
      "Renvoyée vers vous : Trop long",
      "Sent back to you: Trop long",
    ],
    [
      "sent back without a comment",
      makeRequest({ status: "returned", state: { key: "returned", waiting_on: [], note: null } }),
      "Renvoyée vers vous",
      "Sent back to you",
    ],
    ["approved", makeRequest({ status: "approved", state: { key: "approved", waiting_on: [] } }), "Approuvée", "Approved"],
    [
      "refused",
      makeRequest({ status: "rejected", state: { key: "rejected", waiting_on: [], note: "Effectif insuffisant" } }),
      "Refusée : Effectif insuffisant",
      "Refused: Effectif insuffisant",
    ],
    [
      "withdrawn",
      makeRequest({ status: "withdrawn", state: { key: "withdrawn", waiting_on: [] } }),
      "Retirée par vous",
      "Withdrawn by you",
    ],
    ["cancelled", makeRequest({ status: "cancelled", state: { key: "cancelled", waiting_on: [] } }), "Annulée", "Cancelled"],
  ])("%s", (_name, request, french, english) => {
    expect(stateSentence(request, fr).text).toBe(french);
    expect(stateSentence(request, en).text).toBe(english);
  });

  it("shows a note with an apostrophe as typed", () => {
    const request = makeRequest({ status: "returned", state: { key: "returned", waiting_on: [], note: "Décalez d'une semaine" } });
    expect(stateSentence(request, fr).text).toBe("Renvoyée vers vous : Décalez d'une semaine");
  });
});

describe("status sentences to the person who must act and to observers", () => {
  it("tells the approver the request waits for them", () => {
    const request = makeRequest({ viewer: asActor });
    expect(stateSentence(request, fr).text).toBe("En attente de votre décision");
    expect(stateSentence(request, en).text).toBe("Waiting for your decision");
  });

  it("tells HR the request is to validate", () => {
    const request = makeRequest({
      state: { key: "waiting_hr", waiting_on: ["Leila Gharbi"], last_actor: "Sami Ben Ali" },
      viewer: { relation: "hr", actions: ["decide"], step_id: 8 },
    });
    expect(stateSentence(request, fr).text).toBe("À valider");
    expect(stateSentence(request, en).text).toBe("To validate");
  });

  it("names the requester when a request was sent back or withdrawn", () => {
    const returned = makeRequest({ status: "returned", state: { key: "returned", waiting_on: [], note: "Trop long" }, viewer: asObserver });
    const withdrawn = makeRequest({ status: "withdrawn", state: { key: "withdrawn", waiting_on: [] }, viewer: asObserver });
    expect(stateSentence(returned, fr).text).toBe("Renvoyée à Amal Trabelsi");
    expect(stateSentence(returned, en).text).toBe("Sent back to Amal Trabelsi");
    expect(stateSentence(withdrawn, fr).text).toBe("Retirée par Amal Trabelsi");
    expect(stateSentence(withdrawn, en).text).toBe("Withdrawn by Amal Trabelsi");
  });

  it("does not repeat the refusal reason to others", () => {
    const request = makeRequest({ status: "rejected", state: { key: "rejected", waiting_on: [], note: "Effectif insuffisant" }, viewer: asObserver });
    expect(stateSentence(request, fr).text).toBe("Refusée");
  });

  it("tells an observer who the request waits for", () => {
    expect(stateSentence(makeRequest({ viewer: asObserver }), en).text).toBe("Waiting for Sami Ben Ali");
  });
});

describe("tones", () => {
  it.each([
    ["draft", "neutral"],
    ["waiting_manager", "waiting"],
    ["waiting_hr", "waiting"],
    ["waiting_person", "waiting"],
    ["returned", "info"],
    ["approved", "approved"],
    ["rejected", "refused"],
    ["withdrawn", "neutral"],
    ["cancelled", "neutral"],
  ] as const)("%s is %s", (key, tone) => {
    expect(stateSentence(makeRequest({ state: { key, waiting_on: ["Sami Ben Ali"] } }), fr).tone).toBe(tone);
  });
});

describe("certificate and amendment sentences", () => {
  const sick = { code: "sick", name: "Congé maladie" };

  it("says when the certificate is due", () => {
    const request = makeRequest({ type: sick, certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" } });
    expect(certificateSentence(request, fr, "fr")).toEqual({
      tone: "waiting",
      text: "Certificat à fournir avant le T(2026-11-11T09:00:00+01:00)",
    });
    expect(certificateSentence(request, en, "en")?.text).toBe("Certificate due by T(2026-11-11T09:00:00+01:00)");
  });

  it("says when the certificate is overdue and when a proof is missing", () => {
    const overdue = makeRequest({ type: sick, certificate: { status: "overdue", due_at: "2026-11-11T09:00:00+01:00" } });
    const missing = makeRequest({ certificate: { status: "missing", due_at: null } });
    expect(certificateSentence(overdue, fr, "fr")).toEqual({
      tone: "refused",
      text: "Certificat en retard, attendu le T(2026-11-11T09:00:00+01:00)",
    });
    expect(certificateSentence(missing, en, "en")?.text).toBe("Proof not provided yet");
  });

  it("says nothing when no document is expected, when it is attached, or when the viewer may not know", () => {
    expect(certificateSentence(makeRequest(), fr, "fr")).toBeNull();
    expect(certificateSentence(makeRequest({ certificate: { status: "attached", due_at: null } }), fr, "fr")).toBeNull();
    expect(certificateSentence(makeRequest({ certificate: null }), fr, "fr")).toBeNull();
  });

  it("reads an open change from each angle", () => {
    const amendment = { public_id: "am-1", kind: "change" as const, status: "pending" as const, state_key: "waiting_hr" as const, waiting_on: ["Leila Gharbi"] };
    const approved = { status: "approved" as const, state: { key: "approved" as const, waiting_on: [] } };
    expect(amendmentSentence(makeRequest({ ...approved, amendment }), fr)?.text).toBe("Votre modification attend les RH");
    expect(amendmentSentence(makeRequest({ ...approved, amendment }), en)?.text).toBe("Your change is waiting for HR");
    expect(
      amendmentSentence(makeRequest({ ...approved, amendment: { ...amendment, state_key: "waiting_manager", waiting_on: ["Sami Ben Ali"] } }), en)?.text,
    ).toBe("Your change is waiting for Sami Ben Ali");
    expect(amendmentSentence(makeRequest({ ...approved, amendment, viewer: asActor }), fr)?.text).toBe("Modification à décider");
    expect(amendmentSentence(makeRequest({ ...approved, amendment, viewer: asObserver }), en)?.text).toBe("A change is waiting for HR");
  });

  it("ignores a change that is no longer open", () => {
    const amendment = { public_id: "am-1", kind: "change" as const, status: "rejected" as const, state_key: "rejected" as const, waiting_on: [] };
    expect(amendmentSentence(makeRequest({ amendment }), fr)).toBeNull();
  });
});

describe("the one sentence of a list and the sentences of a detail page", () => {
  const amendment = { public_id: "am-1", kind: "change" as const, status: "pending" as const, state_key: "waiting_hr" as const, waiting_on: [] };

  it("prefers the open change, then the certificate, then the state", () => {
    const withChange = makeRequest({ status: "approved", state: { key: "approved", waiting_on: [] }, amendment });
    const withCertificate = makeRequest({
      state: { key: "waiting_hr", waiting_on: [], last_actor: null },
      certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" },
    });
    expect(headline(withChange, en, "en").text).toBe("Your change is waiting for HR");
    expect(headline(withCertificate, en, "en").text).toBe("Certificate due by T(2026-11-11T09:00:00+01:00)");
    expect(headline(makeRequest(), en, "en").text).toBe("Waiting for Sami Ben Ali");
  });

  it("does not put a certificate sentence on a request that is no longer pending", () => {
    const rejected = makeRequest({
      status: "rejected",
      state: { key: "rejected", waiting_on: [], note: "Sans certificat" },
      certificate: { status: "overdue", due_at: "2026-11-11T09:00:00+01:00" },
    });
    expect(headline(rejected, en, "en").text).toBe("Refused: Sans certificat");
  });

  it("lists every sentence on the detail page, the state first", () => {
    const request = makeRequest({
      state: { key: "waiting_hr", waiting_on: [], last_actor: null },
      certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" },
    });
    expect(allSentences(request, en, "en").map((sentence) => sentence.text)).toEqual([
      "Waiting for HR",
      "Certificate due by T(2026-11-11T09:00:00+01:00)",
    ]);
  });
});

describe("what happens next (U2)", () => {
  it("names the step that follows the current one", () => {
    expect(nextStep(makeRequestDetail(), en)).toBe("Then HR validates it.");
    const twoManagers = makeRequestDetail({
      steps: [makeStep(), makeStep({ id: 8, position: 2, rule: "named_person", status: "waiting", approvers: ["Hatem Jlassi"] })],
    });
    expect(nextStep(twoManagers, fr)).toBe("Ensuite, Hatem Jlassi décide.");
  });

  it("says when the current step is the last", () => {
    const atHr = makeRequestDetail({
      state: { key: "waiting_hr", waiting_on: ["Leila Gharbi"], last_actor: "Sami Ben Ali" },
      steps: [makeStep({ status: "approved" }), makeStep({ id: 8, position: 2, rule: "hr_role", status: "pending" })],
    });
    expect(nextStep(atHr, en)).toBe("This is the last step.");
  });

  it("looks only at the latest round after a request was sent back and sent again", () => {
    const secondRound = makeRequestDetail({
      steps: [
        makeStep({ id: 1, round: 1, status: "returned" }),
        makeStep({ id: 2, round: 1, position: 2, rule: "hr_role", status: "waiting" }),
        makeStep({ id: 3, round: 2, status: "approved" }),
        makeStep({ id: 4, round: 2, position: 2, rule: "hr_role", status: "pending" }),
      ],
    });
    expect(nextStep(secondRound, en)).toBe("This is the last step.");
  });

  it("guides a draft, a returned request and an approved one that can still change", () => {
    expect(nextStep(makeRequestDetail({ status: "draft", state: { key: "draft", waiting_on: [] } }), en)).toBe(
      "Nothing is reserved until you send it.",
    );
    expect(nextStep(makeRequestDetail({ status: "returned", state: { key: "returned", waiting_on: [] } }), fr)).toBe(
      "Corrigez-la puis renvoyez-la : elle repartira de la première étape.",
    );
    expect(
      nextStep(makeRequestDetail({ status: "approved", state: { key: "approved", waiting_on: [] }, viewer: { actions: ["amend"] } }), en),
    ).toBe("You can still change the dates or cancel it until it starts.");
  });

  it("says nothing to people other than the requester, and nothing once it is over", () => {
    expect(nextStep(makeRequestDetail({ viewer: asActor }), en)).toBeNull();
    expect(nextStep(makeRequestDetail({ status: "rejected", state: { key: "rejected", waiting_on: [] } }), en)).toBeNull();
    expect(
      nextStep(makeRequestDetail({ status: "approved", state: { key: "approved", waiting_on: [] }, viewer: { actions: [] } }), en),
    ).toBeNull();
  });
});
```

`frontend/src/features/requests/text.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { makeRequest } from "@/features/requests/fixtures";
import type { Translate } from "./platform";
import { describeQuantity, describeWhen } from "./text";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

const translator = (lng: string): Translate => (key, options) => String(i18n.t(key, { ns: "requests", lng, ...options }));
const fr = translator("fr");
const en = translator("en");

describe("dates in words", () => {
  it("gives a range as a range", () => {
    expect(describeWhen(makeRequest(), fr, "fr")).toBe("R(2026-11-09..2026-11-11)");
  });

  it("gives a single day as one date", () => {
    expect(describeWhen(makeRequest({ end_date: "2026-11-09" }), fr, "fr")).toBe("D(2026-11-09)");
  });

  it("says morning or afternoon for a single half-day", () => {
    const day = { end_date: "2026-11-09" };
    expect(describeWhen(makeRequest({ ...day, ends_at_midday: true }), fr, "fr")).toBe("D(2026-11-09), le matin");
    expect(describeWhen(makeRequest({ ...day, ends_at_midday: true }), en, "en")).toBe("D(2026-11-09), morning");
    expect(describeWhen(makeRequest({ ...day, starts_at_midday: true }), fr, "fr")).toBe("D(2026-11-09), l'après-midi");
    expect(describeWhen(makeRequest({ ...day, starts_at_midday: true }), en, "en")).toBe("D(2026-11-09), afternoon");
  });

  it("says which end of a range is a half-day", () => {
    expect(describeWhen(makeRequest({ starts_at_midday: true }), en, "en")).toBe(
      "R(2026-11-09..2026-11-11), from midday on the first day",
    );
    expect(describeWhen(makeRequest({ ends_at_midday: true }), en, "en")).toBe(
      "R(2026-11-09..2026-11-11), until midday on the last day",
    );
    expect(describeWhen(makeRequest({ starts_at_midday: true, ends_at_midday: true }), fr, "fr")).toBe(
      "R(2026-11-09..2026-11-11), de midi le premier jour à midi le dernier",
    );
  });

  it("gives a permission as a date and two times, without seconds", () => {
    const permission = makeRequest({
      type: { code: "permission", name: "Autorisation de sortie", unit: "hour" },
      end_date: "2026-11-09",
      start_time: "14:00:00",
      end_time: "16:30:00",
      quantity: "2.50",
    });
    expect(describeWhen(permission, fr, "fr")).toBe("D(2026-11-09), de 14:00 à 16:30");
    expect(describeWhen(permission, en, "en")).toBe("D(2026-11-09), 14:00 to 16:30");
  });
});

describe("quantities in words", () => {
  it("counts days for day-based types and hours for the others", () => {
    expect(describeQuantity(makeRequest({ quantity: "2.50" }), "fr")).toBe("2.5 j");
    expect(describeQuantity(makeRequest({ type: { unit: "hour" }, quantity: "1.25" }), "fr")).toBe("1.25 h");
  });
});
```

`frontend/src/features/requests/StatusSentence.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { makeRequest } from "@/features/requests/fixtures";
import { StatusSentence } from "./StatusSentence";
import { TypeTag } from "./TypeTag";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });
const sickWithoutCertificate = makeRequest({
  type: { code: "sick", name: "Congé maladie" },
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" },
});

describe("StatusSentence", () => {
  it("shows one sentence in a list", () => {
    renderApp(<StatusSentence request={sickWithoutCertificate} />, { route: "/me/requests", me });
    expect(screen.getByText("Certificat à fournir avant le T(2026-11-11T09:00:00+01:00)")).toBeInTheDocument();
    expect(screen.queryByText("En attente des RH")).not.toBeInTheDocument();
  });

  it("shows every sentence on a detail page", () => {
    renderApp(<StatusSentence request={sickWithoutCertificate} detail />, { route: "/me/requests/req-1", me });
    expect(screen.getByText("En attente des RH")).toBeInTheDocument();
    expect(screen.getByText("Certificat à fournir avant le T(2026-11-11T09:00:00+01:00)")).toBeInTheDocument();
  });

  it("never shows a status code", () => {
    renderApp(<StatusSentence request={makeRequest()} detail />, { route: "/me/requests/req-1", me });
    expect(screen.queryByText(/waiting_manager|pending/)).not.toBeInTheDocument();
  });
});

describe("TypeTag", () => {
  it("shows the name of the type and carries its code for styling", () => {
    renderApp(<TypeTag code="sick" name="Congé maladie" />, { route: "/me", me });
    expect(screen.getByText("Congé maladie")).toHaveAttribute("data-type", "sick");
  });

  it("styles a type added later by HR like a neutral one", () => {
    renderApp(<TypeTag code="training_day" name="Journée de formation" />, { route: "/me", me });
    expect(screen.getByText("Journée de formation").className).toContain("bg-type-remote-bg");
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/status.test.ts src/features/requests/text.test.ts src/features/requests/StatusSentence.test.tsx`

Expected: FAIL with "Failed to resolve import "./status"" (and the same for `./text`, `./StatusSentence`).

- [ ] **Step 4: Write the pure functions**

`frontend/src/features/requests/status.ts`:

```ts
import type { Lang } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import type { Translate } from "./platform";
import type { RequestDetail, RequestOut, StateKey } from "./types";

export type Tone = "waiting" | "approved" | "refused" | "info" | "neutral";
export type Angle = "requester" | "actor" | "observer";

export interface Sentence {
  tone: Tone;
  text: string;
}

const TONES: Record<StateKey, Tone> = {
  draft: "neutral",
  waiting_manager: "waiting",
  waiting_hr: "waiting",
  waiting_person: "waiting",
  returned: "info",
  approved: "approved",
  rejected: "refused",
  withdrawn: "neutral",
  cancelled: "neutral",
};

/** From whose side the request is read (UI 3.5, R3). */
export function angleOf(request: RequestOut): Angle {
  if (request.viewer.relation === "owner") return "requester";
  return request.viewer.actions.includes("decide") ? "actor" : "observer";
}

export function stateSentence(request: RequestOut, t: Translate): Sentence {
  const { key, waiting_on: waitingOn, last_actor: lastActor, note } = request.state;
  const angle = angleOf(request);
  const tone = TONES[key];
  const requester = request.employee.name;

  if (key === "waiting_manager" || key === "waiting_person") {
    if (angle === "actor") return { tone, text: t("status.actor.waiting") };
    return {
      tone,
      text: waitingOn.length > 0 ? t("status.waitingFor", { names: waitingOn.join(", ") }) : t("status.waitingNobody"),
    };
  }
  if (key === "waiting_hr") {
    if (angle === "actor") return { tone, text: t("status.actor.toValidate") };
    return { tone, text: lastActor ? t("status.approvedByWaitingHr", { actor: lastActor }) : t("status.waitingHr") };
  }
  if (key === "returned") {
    if (angle !== "requester") return { tone, text: t("status.observer.returned", { requester }) };
    return { tone, text: note ? t("status.requester.returned", { note }) : t("status.requester.returnedNoNote") };
  }
  if (key === "rejected") {
    return { tone, text: angle === "requester" && note ? t("status.requester.rejected", { note }) : t("status.rejected") };
  }
  if (key === "withdrawn") {
    return {
      tone,
      text: angle === "requester" ? t("status.requester.withdrawn") : t("status.observer.withdrawn", { requester }),
    };
  }
  return { tone, text: t(`status.${key}`) };
}

/** "Certificate due by ...". Null when nothing is expected, or when the viewer is not told (certificate is null). */
export function certificateSentence(request: RequestOut, t: Translate, lang: Lang): Sentence | null {
  const certificate = request.certificate;
  if (!certificate) return null;
  if (certificate.status === "due" && certificate.due_at) {
    return { tone: "waiting", text: t("certificate.due", { date: formatDateTime(certificate.due_at, lang) }) };
  }
  if (certificate.status === "overdue" && certificate.due_at) {
    return { tone: "refused", text: t("certificate.overdue", { date: formatDateTime(certificate.due_at, lang) }) };
  }
  if (certificate.status === "missing") return { tone: "waiting", text: t("certificate.missing") };
  return null;
}

export function amendmentSentence(request: RequestOut, t: Translate): Sentence | null {
  const amendment = request.amendment;
  if (!amendment || amendment.status !== "pending") return null;
  const angle = angleOf(request);
  if (angle === "actor") return { tone: "waiting", text: t("amendment.actor") };
  const who = amendment.state_key === "waiting_hr" ? t("common.hr") : amendment.waiting_on.join(", ");
  return { tone: "waiting", text: t(angle === "requester" ? "amendment.requester" : "amendment.observer", { who }) };
}

/** The one sentence shown in a list: the open change, else the certificate of a pending request, else the state. */
export function headline(request: RequestOut, t: Translate, lang: Lang): Sentence {
  return (
    amendmentSentence(request, t) ??
    (request.status === "pending" ? certificateSentence(request, t, lang) : null) ??
    stateSentence(request, t)
  );
}

/** Every sentence of the detail page, the state first. */
export function allSentences(request: RequestOut, t: Translate, lang: Lang): Sentence[] {
  const certificate = request.status === "pending" ? certificateSentence(request, t, lang) : null;
  return [stateSentence(request, t), certificate, amendmentSentence(request, t)].filter(
    (sentence): sentence is Sentence => sentence !== null,
  );
}

/** What happens after the current state, told to the requester only (U2). */
export function nextStep(request: RequestDetail, t: Translate): string | null {
  if (angleOf(request) !== "requester") return null;
  if (request.status === "draft") return t("next.draft");
  if (request.status === "returned") return t("next.returned");
  if (request.status === "approved") return request.viewer.actions.includes("amend") ? t("next.approved") : null;
  if (request.status !== "pending") return null;

  const own = request.steps.filter((step) => step.amendment_public_id === null);
  const round = Math.max(0, ...own.map((step) => step.round));
  const upcoming = own
    .filter((step) => step.round === round && step.status === "waiting" && step.mode === "approve")
    .sort((a, b) => a.position - b.position)[0];
  if (!upcoming) return t("next.last");
  if (upcoming.rule === "hr_role") return t("next.thenHr");
  return upcoming.approvers.length > 0
    ? t("next.thenPerson", { names: upcoming.approvers.join(", ") })
    : t("next.thenSomeone");
}
```

`frontend/src/features/requests/text.ts`:

```ts
import type { Lang } from "@/i18n";
import { formatDate, formatDateRange, formatDays, formatHours } from "@/lib/format";
import type { Translate } from "./platform";
import type { RequestOut } from "./types";

type Dated = Pick<
  RequestOut,
  "type" | "start_date" | "end_date" | "starts_at_midday" | "ends_at_midday" | "start_time" | "end_time"
>;

const hhmm = (time: string | null) => (time ?? "").slice(0, 5);

/** "9 to 11 November, from midday on the first day", "9 November, morning", "9 November, 14:00 to 16:30". */
export function describeWhen(request: Dated, t: Translate, lang: Lang): string {
  if (request.type.unit === "hour") {
    return t("when.hours", {
      date: formatDate(request.start_date, lang),
      from: hhmm(request.start_time),
      to: hhmm(request.end_time),
    });
  }
  if (request.start_date === request.end_date) {
    const date = formatDate(request.start_date, lang);
    if (request.starts_at_midday) return t("when.afternoon", { date });
    if (request.ends_at_midday) return t("when.morning", { date });
    return date;
  }
  const range = formatDateRange(request.start_date, request.end_date, lang);
  if (request.starts_at_midday && request.ends_at_midday) return t("when.rangeBoth", { range });
  if (request.starts_at_midday) return t("when.rangeFromMidday", { range });
  if (request.ends_at_midday) return t("when.rangeUntilMidday", { range });
  return range;
}

/** "2.5 days" or "1.25 hours", as the server counted them. */
export function describeQuantity(request: Pick<RequestOut, "type" | "quantity">, lang: Lang): string {
  return request.type.unit === "hour" ? formatHours(request.quantity, lang) : formatDays(request.quantity, lang);
}
```

- [ ] **Step 5: Write the two components**

`frontend/src/features/requests/StatusSentence.tsx`:

```tsx
import { StatusBadge } from "@/components";
import { useRequestsText } from "./platform";
import { allSentences, headline } from "./status";
import type { RequestOut } from "./types";

interface StatusSentenceProps {
  request: RequestOut;
  /** On a detail page, show every sentence; in a list, only the one that matters most. */
  detail?: boolean;
}

export function StatusSentence({ request, detail = false }: StatusSentenceProps) {
  const { t, lang } = useRequestsText();
  const sentences = detail ? allSentences(request, t, lang) : [headline(request, t, lang)];
  return (
    <div className="flex flex-col items-start gap-1">
      {sentences.map((sentence) => (
        <StatusBadge key={sentence.text} tone={sentence.tone}>
          {sentence.text}
        </StatusBadge>
      ))}
    </div>
  );
}
```

`frontend/src/features/requests/TypeTag.tsx`:

```tsx
import { cn } from "@/lib/utils";

// Complete class names, so Tailwind finds them. Colours are the request-type tokens of tokens.css.
const STYLES: Record<string, string> = {
  annual: "bg-type-annual-bg text-type-annual border-[var(--type-annual-border)]",
  sick: "bg-type-sick-bg text-type-sick border-[var(--type-sick-border)]",
  exceptional: "bg-type-exceptional-bg text-type-exceptional border-[var(--type-exceptional-border)]",
  remote: "bg-type-remote-bg text-type-remote border-[var(--type-remote-border)]",
  permission: "bg-type-permission-bg text-type-permission border-[var(--type-permission-border)]",
};

interface TypeTagProps {
  code: string;
  name: string;
}

/** The kind of a request, as a small tag. A type HR adds later takes the neutral style. */
export function TypeTag({ code, name }: TypeTagProps) {
  return (
    <span
      data-type={code}
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-caption font-medium",
        STYLES[code] ?? STYLES.remote,
      )}
    >
      {name}
    </span>
  );
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/status.test.ts src/features/requests/text.test.ts src/features/requests/StatusSentence.test.tsx src/i18n/parity.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/requests frontend/src/i18n/locales
git commit -m "feat(requests): status sentences from the viewer's angle, type tags, dates in words"
```

---

### Task 3: New request, step one: what kind?

**Files:**
- Create: `frontend/src/features/requests/form/TypeChoice.tsx`
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (section `choice`)
- Test: `frontend/src/features/requests/form/TypeChoice.test.tsx`

**Interfaces:**
- Consumes: `useRequestTypes` (Task 1), `Gate` (Task 1), `TypeTag` (Task 2), `EmptyState` from `@/components`.
- Produces: `TypeChoice({ hrefFor }: { hrefFor: (code: string) => string })`. It lists the active types in `sort_order`, each as a link carrying the type's name and its one-line description (UI 5.3, step one).

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "choice": {
    "title": "Quel type de demande ?",
    "none": "Aucun type de demande n'est disponible pour le moment.",
    "noneHint": "Les RH peuvent vous dire pourquoi."
  }
```

English:

```json
  "choice": {
    "title": "What kind of request?",
    "none": "No kind of request is available at the moment.",
    "noneHint": "HR can tell you why."
  }
```

- [ ] **Step 2: Write the failing test**

`frontend/src/features/requests/form/TypeChoice.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { makeType, TYPES } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import { TypeChoice } from "./TypeChoice";

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });
const hrefFor = (code: string) => `/me/requests/new?type=${code}`;

describe("New request, step one", () => {
  it("offers each active type with one line saying what it is for", async () => {
    server.use(
      http.get("/api/v1/request-types", () =>
        HttpResponse.json([TYPES.annual, TYPES.sick, makeType("remote", { is_active: false })]),
      ),
    );
    renderApp(<TypeChoice hrefFor={hrefFor} />, { route: "/me/requests/new", path: "/me/requests/new", me });
    const annual = await screen.findByRole("link", { name: /Congé annuel/ });
    expect(annual).toHaveAttribute("href", "/me/requests/new?type=annual");
    expect(within(annual).getByText("Vos jours de congé payé.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Congé maladie/ })).toHaveAttribute("href", "/me/requests/new?type=sick");
    expect(screen.queryByRole("link", { name: /Télétravail/ })).not.toBeInTheDocument();
  });

  it("lists the types in the order HR gave them", async () => {
    server.use(
      http.get("/api/v1/request-types", () =>
        HttpResponse.json([makeType("remote", { sort_order: 1 }), makeType("annual", { sort_order: 2 })]),
      ),
    );
    renderApp(<TypeChoice hrefFor={hrefFor} />, { route: "/me/requests/new", path: "/me/requests/new", me });
    const links = await screen.findAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/me/requests/new?type=remote",
      "/me/requests/new?type=annual",
    ]);
  });

  it("says so when no type is available", async () => {
    server.use(http.get("/api/v1/request-types", () => HttpResponse.json([])));
    renderApp(<TypeChoice hrefFor={hrefFor} />, { route: "/me/requests/new", path: "/me/requests/new", me });
    expect(await screen.findByText("Aucun type de demande n'est disponible pour le moment.")).toBeInTheDocument();
  });

  it("offers nothing but the choice itself", async () => {
    server.use(http.get("/api/v1/request-types", () => HttpResponse.json([TYPES.annual])));
    renderApp(<TypeChoice hrefFor={hrefFor} />, { route: "/me/requests/new", path: "/me/requests/new", me });
    await screen.findByRole("link", { name: /Congé annuel/ });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/form/TypeChoice.test.tsx`

Expected: FAIL with "Failed to resolve import "./TypeChoice"".

- [ ] **Step 4: Write the component**

`frontend/src/features/requests/form/TypeChoice.tsx`:

```tsx
import { Link } from "react-router";
import { EmptyState } from "@/components";
import { useRequestTypes } from "../api";
import { Gate } from "../Gate";
import { useRequestsText } from "../platform";
import { TypeTag } from "../TypeTag";

interface TypeChoiceProps {
  /** The address of step two for a type code. */
  hrefFor: (code: string) => string;
}

/** Step one of a new request: the active types, each with one line saying what it is for. */
export function TypeChoice({ hrefFor }: TypeChoiceProps) {
  const { t } = useRequestsText();
  const types = useRequestTypes();
  return (
    <Gate query={types}>
      {(all) => {
        const active = all.filter((type) => type.is_active).sort((a, b) => a.sort_order - b.sort_order);
        if (active.length === 0) return <EmptyState title={t("choice.none")} hint={t("choice.noneHint")} />;
        return (
          <ul aria-label={t("choice.title")} className="grid gap-3 sm:grid-cols-2">
            {active.map((type) => (
              <li key={type.code}>
                <Link
                  to={hrefFor(type.code)}
                  className="flex min-h-11 flex-col items-start gap-2 rounded-xl border border-border bg-card px-6 py-5 transition-colors duration-150 hover:bg-muted"
                >
                  <TypeTag code={type.code} name={type.name} />
                  <span className="text-body text-text-secondary">{type.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        );
      }}
    </Gate>
  );
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/form/TypeChoice.test.tsx src/i18n/parity.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/requests/form frontend/src/i18n/locales
git commit -m "feat(requests): choice of the request type"
```

---

### Task 4: The building blocks of the form

The form of Task 5 is assembled from small units that each have one job and their own tests: the values and their validation, the field a server problem belongs to, the sentence that says who will decide, a guard against double sending, and the keeper that survives a lost session.

**Files:**
- Create: `frontend/src/features/requests/problems.ts`
- Create: `frontend/src/features/requests/form/problemFields.ts`
- Create: `frontend/src/features/requests/form/schema.ts`
- Create: `frontend/src/features/requests/form/chain.ts`
- Create: `frontend/src/features/requests/form/useDebounced.ts`
- Create: `frontend/src/features/requests/form/useSingleFlight.ts`
- Create: `frontend/src/features/requests/form/draftKeeper.ts`
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (sections `formErrors`, `keeper`, `chain`)
- Test: `frontend/src/features/requests/problems.test.tsx`
- Test: `frontend/src/features/requests/form/problemFields.test.ts`
- Test: `frontend/src/features/requests/form/schema.test.ts`
- Test: `frontend/src/features/requests/form/chain.test.ts`
- Test: `frontend/src/features/requests/form/hooks.test.tsx`
- Test: `frontend/src/features/requests/form/draftKeeper.test.tsx`

**Interfaces:**
- Consumes: `ProblemError`, `FieldProblem`; `Translate`; `RequestTypeOut`, `RequestOut`, `RequestFields`, `ChainStepPreview` (Task 1).
- Produces:
  - `problems.ts`: `serverProblems<T>(form: UseFormReturn<T>, error: unknown, t: Translate, resolve: (problem: FieldProblem) => Path<T> | null): FieldProblem[]` (sets field errors, returns the problems that belong to no field); `details(problems: FieldProblem[]): string[]` (their sentences, for `FormSummary`); `byName<T>(names: readonly Path<T>[], byCode?: Record<string, Path<T>>): (problem: FieldProblem) => Path<T> | null`. Plan 01b's `useProblemForm` is not used: these forms need a table from problem code to input, which it does not have.
  - `form/problemFields.ts`: `FORM_FIELDS`, `type FormField`, `fieldFor(problem: FieldProblem, visible: ReadonlySet<FormField>): FormField | null`.
  - `form/schema.ts`: `interface FormValues`, `EMPTY: FormValues`, `MAX_FILE_BYTES`, `fileProblem(file: File, t: Translate): string | null`, `buildSchema(type: RequestTypeOut, t: Translate)`, `visibleFields(type, options: { hr: boolean; override: boolean; proofRequired: boolean }): Set<FormField>`, `toFields(values: FormValues, type: RequestTypeOut): RequestFields`, `fromRequest(request: RequestOut): FormValues`, `previewReady(values: FormValues, type: RequestTypeOut): boolean`.
  - `form/chain.ts`: `chainSentence(chain: ChainStepPreview[], t: Translate, mode: "me" | "hr"): string`.
  - `form/useDebounced.ts`: `useDebounced<T extends string | number | boolean>(value: T, delayMs: number): T`.
  - `form/useSingleFlight.ts`: `useSingleFlight<A extends unknown[]>(run: (...args: A) => Promise<void>): [(...args: A) => Promise<void>, boolean]`.
  - `form/draftKeeper.ts`: `keeperKey(viewerId: string, formId: string): string`, `purgeOthers(viewerId: string): void`, `useDraftKeeper(viewerId: string, formId: string, form: UseFormReturn<FormValues>): { restored: boolean; clear: () => void }`.

Where each message of UI 5.3 lands:

| Problem code (master 7.9, 7.6) | Field |
|---|---|
| `request.end_before_start`, `request.event_days_exceeded`, `request.balance_insufficient` | `end_date` |
| `request.no_working_day`, `request.overlap`, `request.past_dates`, `request.notice`, `request.cap_exceeded`, `request.permission_non_working_day`, `request.permission_overlaps_absence` | `start_date` |
| `request.half_day_not_allowed`, `request.half_day_on_non_working_day` | the half-day switch the server names, else `starts_at_midday` |
| `request.half_day_both_ends` (plan 03a) | `ends_at_midday` |
| `request.dates_required` (plan 03a) | `start_date` |
| `request.permission_times` | `end_time` |
| `request.event_required` | `exceptional_event` |
| `request.reason_required` | `override_reason` |
| `files.too_large`, `files.type_not_allowed`, `files.content_mismatch`, `files.empty` | `file` |

A problem whose field is not on screen for the chosen type goes to the summary above the form.

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "formErrors": {
    "required": "Ce champ est nécessaire.",
    "endBeforeStart": "La fin doit être le même jour que le début, ou après.",
    "bothHalves": "Pour une seule journée, choisissez le matin ou l'après-midi, pas les deux.",
    "times": "L'heure de fin doit être après l'heure de début.",
    "eventRequired": "Choisissez l'événement concerné.",
    "reasonRequired": "Indiquez le motif : il est obligatoire.",
    "fileType": "Ce type de fichier n'est pas accepté. Utilisez un PDF, un JPG ou un PNG.",
    "fileSize": "Ce fichier dépasse 10 Mo. Réduisez-le ou scannez-le en plus basse résolution.",
    "fileEmpty": "Ce fichier est vide. Choisissez-en un autre."
  },
  "keeper": {
    "restored": "Nous avons gardé ce que vous aviez saisi. Vérifiez-le avant d'envoyer.",
    "startOver": "Repartir d'un formulaire vide"
  },
  "chain": {
    "yourManager": "votre responsable, {{names}}",
    "theManager": "son responsable, {{names}}",
    "noManager": "aucun responsable (étape passée)",
    "informed": "{{who}} (pour information)",
    "then": ", puis ",
    "nobody": "personne pour l'instant"
  }
```

English:

```json
  "formErrors": {
    "required": "This field is needed.",
    "endBeforeStart": "The end must be the same day as the start, or later.",
    "bothHalves": "For a single day, choose the morning or the afternoon, not both.",
    "times": "The end time must be after the start time.",
    "eventRequired": "Choose the event concerned.",
    "reasonRequired": "Give the reason: it is mandatory.",
    "fileType": "This kind of file is not accepted. Use a PDF, a JPG or a PNG.",
    "fileSize": "This file is larger than 10 MB. Reduce it or scan it at a lower resolution.",
    "fileEmpty": "This file is empty. Choose another one."
  },
  "keeper": {
    "restored": "We kept what you had typed. Check it before sending.",
    "startOver": "Start again from an empty form"
  },
  "chain": {
    "yourManager": "your manager, {{names}}",
    "theManager": "their manager, {{names}}",
    "noManager": "no manager (step skipped)",
    "informed": "{{who}} (for information)",
    "then": ", then ",
    "nobody": "nobody for now"
  }
```

- [ ] **Step 2: Write the failing tests**

`frontend/src/features/requests/form/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { makeRequest, TYPES } from "@/features/requests/fixtures";
import type { Translate } from "../platform";
import type { RequestTypeOut } from "../types";
import { buildSchema, EMPTY, fromRequest, MAX_FILE_BYTES, previewReady, toFields, visibleFields, type FormValues } from "./schema";

const t: Translate = (key, options) => String(i18n.t(key, { ns: "requests", lng: "fr", ...options }));

function errorsOf(type: RequestTypeOut, values: Partial<FormValues>): Record<string, string> {
  const result = buildSchema(type, t).safeParse({ ...EMPTY, ...values });
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message]));
}

function fileOf(name: string, type: string, size = 2048): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("form validation before anything is sent", () => {
  it("accepts a plain annual leave", () => {
    expect(errorsOf(TYPES.annual, { start_date: "2026-11-09", end_date: "2026-11-11" })).toEqual({});
  });

  it("asks for both dates", () => {
    expect(errorsOf(TYPES.annual, {})).toEqual({
      start_date: "Ce champ est nécessaire.",
      end_date: "Ce champ est nécessaire.",
    });
  });

  it("refuses an end before the start, on the end field", () => {
    expect(errorsOf(TYPES.annual, { start_date: "2026-11-11", end_date: "2026-11-09" })).toEqual({
      end_date: "La fin doit être le même jour que le début, ou après.",
    });
  });

  it("refuses a single day flagged at both ends, and accepts either half (master D12)", () => {
    const day = { start_date: "2026-11-09", end_date: "2026-11-09" };
    expect(errorsOf(TYPES.annual, { ...day, starts_at_midday: true, ends_at_midday: true })).toEqual({
      ends_at_midday: "Pour une seule journée, choisissez le matin ou l'après-midi, pas les deux.",
    });
    expect(errorsOf(TYPES.annual, { ...day, starts_at_midday: true })).toEqual({});
    expect(errorsOf(TYPES.annual, { ...day, ends_at_midday: true })).toEqual({});
    expect(
      errorsOf(TYPES.annual, { start_date: "2026-11-09", end_date: "2026-11-10", starts_at_midday: true, ends_at_midday: true }),
    ).toEqual({});
  });

  it("asks a permission for one date and two times, the second after the first", () => {
    expect(errorsOf(TYPES.permission, { start_date: "2026-11-09" })).toEqual({
      start_time: "Ce champ est nécessaire.",
      end_time: "Ce champ est nécessaire.",
    });
    expect(errorsOf(TYPES.permission, { start_date: "2026-11-09", start_time: "16:00", end_time: "14:00" })).toEqual({
      end_time: "L'heure de fin doit être après l'heure de début.",
    });
    expect(errorsOf(TYPES.permission, { start_date: "2026-11-09", start_time: "14:00", end_time: "14:00" })).toEqual({
      end_time: "L'heure de fin doit être après l'heure de début.",
    });
    expect(errorsOf(TYPES.permission, { start_date: "2026-11-09", start_time: "14:00", end_time: "16:00" })).toEqual({});
  });

  it("asks an exceptional leave for its event", () => {
    expect(errorsOf(TYPES.exceptional, { start_date: "2026-11-09", end_date: "2026-11-10" })).toEqual({
      exceptional_event: "Choisissez l'événement concerné.",
    });
  });

  it("asks for the reason when an exception is allowed", () => {
    const dates = { start_date: "2026-11-09", end_date: "2026-11-11" };
    expect(errorsOf(TYPES.annual, { ...dates, override: true, override_reason: "   " })).toEqual({
      override_reason: "Indiquez le motif : il est obligatoire.",
    });
    expect(errorsOf(TYPES.annual, { ...dates, override: true, override_reason: "Accord de la direction" })).toEqual({});
  });

  it("refuses a file that is not a PDF, a JPG or a PNG, even renamed", () => {
    const dates = { start_date: "2026-11-09", end_date: "2026-11-09" };
    const message = "Ce type de fichier n'est pas accepté. Utilisez un PDF, un JPG ou un PNG.";
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("certificat.pdf.txt", "text/plain") })).toEqual({ file: message });
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("installeur.exe", "application/x-msdownload") })).toEqual({ file: message });
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("certificat.pdf", "text/html") })).toEqual({ file: message });
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("Certificat médical é.PDF", "application/pdf") })).toEqual({});
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("photo.jpeg", "image/jpeg") })).toEqual({});
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("scan.png", "") })).toEqual({});
  });

  it("refuses a file larger than 10 MB and an empty file", () => {
    const dates = { start_date: "2026-11-09", end_date: "2026-11-09" };
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("scan.pdf", "application/pdf", MAX_FILE_BYTES + 1) })).toEqual({
      file: "Ce fichier dépasse 10 Mo. Réduisez-le ou scannez-le en plus basse résolution.",
    });
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("scan.pdf", "application/pdf", MAX_FILE_BYTES) })).toEqual({});
    expect(errorsOf(TYPES.sick, { ...dates, file: fileOf("vide.pdf", "application/pdf", 0) })).toEqual({
      file: "Ce fichier est vide. Choisissez-en un autre.",
    });
  });
});

describe("values to and from the API", () => {
  it("sends a permission as one date and two times", () => {
    expect(
      toFields({ ...EMPTY, start_date: "2026-11-09", end_date: "", start_time: "14:00", end_time: "16:30", comment: " Banque " }, TYPES.permission),
    ).toEqual({
      start_date: "2026-11-09",
      end_date: "2026-11-09",
      starts_at_midday: false,
      ends_at_midday: false,
      start_time: "14:00",
      end_time: "16:30",
      exceptional_event: null,
      comment: "Banque",
    });
  });

  it("sends the half-day flags only for a type that allows them", () => {
    const values = { ...EMPTY, start_date: "2026-11-09", end_date: "2026-11-10", starts_at_midday: true, ends_at_midday: true };
    expect(toFields(values, TYPES.annual)).toMatchObject({ starts_at_midday: true, ends_at_midday: true, start_time: null, end_time: null });
    expect(toFields(values, TYPES.exceptional)).toMatchObject({ starts_at_midday: false, ends_at_midday: false });
  });

  it("sends the event as a number, and only for a type that uses events", () => {
    const values = { ...EMPTY, start_date: "2026-11-09", end_date: "2026-11-10", exceptional_event: "4" };
    expect(toFields(values, TYPES.exceptional).exceptional_event).toBe(4);
    expect(toFields(values, TYPES.annual).exceptional_event).toBeNull();
  });

  it("reads a request back into form values", () => {
    const request = makeRequest({
      type: { code: "permission", unit: "hour" },
      end_date: "2026-11-09",
      start_time: "14:00:00",
      end_time: "16:30:00",
      comment: "Banque",
      has_override: true,
    });
    // The exception of an HR request is fixed when it is created: it is never read back into the form.
    expect(fromRequest(request)).toEqual({
      ...EMPTY,
      start_date: "2026-11-09",
      end_date: "2026-11-09",
      start_time: "14:00",
      end_time: "16:30",
      comment: "Banque",
    });
    expect(fromRequest(makeRequest({ event: { id: 4, name: "Mariage" } })).exceptional_event).toBe("4");
  });
});

describe("what the form shows and when it can ask for a preview", () => {
  const none = { hr: false, override: false, proofRequired: false };

  it("shows only the fields of the chosen type (M7)", () => {
    expect([...visibleFields(TYPES.annual, none)].sort()).toEqual(
      ["comment", "end_date", "ends_at_midday", "start_date", "starts_at_midday"].sort(),
    );
    expect([...visibleFields(TYPES.sick, none)]).toContain("file");
    expect([...visibleFields(TYPES.exceptional, none)].sort()).toEqual(["comment", "end_date", "exceptional_event", "start_date"].sort());
    expect([...visibleFields(TYPES.exceptional, { ...none, proofRequired: true })]).toContain("file");
    expect([...visibleFields(TYPES.permission, none)].sort()).toEqual(["comment", "end_time", "start_date", "start_time"].sort());
    expect([...visibleFields(TYPES.annual, { hr: true, override: true, proofRequired: false })]).toContain("override_reason");
    expect([...visibleFields(TYPES.annual, { hr: true, override: false, proofRequired: false })]).not.toContain("override_reason");
  });

  it("waits for coherent dates before asking the server", () => {
    expect(previewReady({ ...EMPTY, start_date: "2026-11-09" }, TYPES.annual)).toBe(false);
    expect(previewReady({ ...EMPTY, start_date: "2026-11-11", end_date: "2026-11-09" }, TYPES.annual)).toBe(false);
    expect(previewReady({ ...EMPTY, start_date: "2026-11-09", end_date: "2026-11-11" }, TYPES.annual)).toBe(true);
    expect(previewReady({ ...EMPTY, start_date: "2026-11-09", start_time: "14:00" }, TYPES.permission)).toBe(false);
    expect(previewReady({ ...EMPTY, start_date: "2026-11-09", start_time: "14:00", end_time: "16:00" }, TYPES.permission)).toBe(true);
    expect(previewReady({ ...EMPTY, start_date: "2026-11-09", end_date: "2026-11-10" }, TYPES.exceptional)).toBe(false);
    expect(previewReady({ ...EMPTY, start_date: "2026-11-09", end_date: "2026-11-10", exceptional_event: "1" }, TYPES.exceptional)).toBe(true);
  });
});
```

`frontend/src/features/requests/form/problemFields.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FORM_FIELDS, fieldFor, type FormField } from "./problemFields";

const ALL = new Set<FormField>(FORM_FIELDS);
const problem = (code: string, field: string | null = null) => ({ field, code, detail: "", params: {} });

describe("the field a server problem belongs to (UI 5.3)", () => {
  it.each([
    ["request.end_before_start", "end_date"],
    ["request.no_working_day", "start_date"],
    ["request.overlap", "start_date"],
    ["request.past_dates", "start_date"],
    ["request.notice", "start_date"],
    ["request.balance_insufficient", "end_date"],
    ["request.cap_exceeded", "start_date"],
    ["request.event_required", "exceptional_event"],
    ["request.event_days_exceeded", "end_date"],
    ["request.permission_non_working_day", "start_date"],
    ["request.permission_times", "end_time"],
    ["request.permission_overlaps_absence", "start_date"],
    ["request.half_day_not_allowed", "starts_at_midday"],
    ["request.half_day_on_non_working_day", "starts_at_midday"],
    ["request.half_day_both_ends", "ends_at_midday"],
    ["request.dates_required", "start_date"],
    ["request.reason_required", "override_reason"],
    ["files.type_not_allowed", "file"],
    ["files.too_large", "file"],
    ["files.content_mismatch", "file"],
    ["files.empty", "file"],
  ])("%s goes to %s", (code, field) => {
    expect(fieldFor(problem(code), ALL)).toBe(field);
  });

  it("trusts the field the server names when the form has it", () => {
    expect(fieldFor(problem("request.half_day_on_non_working_day", "ends_at_midday"), ALL)).toBe("ends_at_midday");
    expect(fieldFor(problem("required", "comment"), ALL)).toBe("comment");
  });

  it("understands the server's own names for the same input", () => {
    expect(fieldFor(problem("required", "exceptional_event_id"), ALL)).toBe("exceptional_event");
  });

  it("sends a problem to the summary when its field is not on screen", () => {
    const permissionFields = new Set<FormField>(["start_date", "start_time", "end_time", "comment"]);
    expect(fieldFor(problem("request.balance_insufficient"), permissionFields)).toBeNull();
    expect(fieldFor(problem("files.too_large"), permissionFields)).toBeNull();
  });

  it("sends an unknown problem to the summary", () => {
    expect(fieldFor(problem("request.type_inactive"), ALL)).toBeNull();
    expect(fieldFor(problem("anything", "not_a_field"), ALL)).toBeNull();
  });
});
```

`frontend/src/features/requests/problems.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { problemResponse } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import { requestsApi } from "./api";
import type { Translate } from "./platform";
import { byName, details, serverProblems } from "./problems";

const t: Translate = (key, options) => String(i18n.t(key, { ns: "requests", lng: "fr", ...options }));

interface Values {
  comment: string;
  reason: string;
}

async function errorFor(status: number, code: string, errors: { field: string | null; code: string; detail: string; params: Record<string, unknown> }[]) {
  server.use(http.post("/api/v1/requests/req-1/withdraw", () => problemResponse(status, code, errors[0]?.detail ?? "", errors)));
  return requestsApi.withdraw("req-1").catch((error: unknown) => error);
}

describe("server problems on a form", () => {
  it("puts each problem on its field and returns the others", async () => {
    const { result } = renderHook(() => useForm<Values>({ defaultValues: { comment: "", reason: "" } }));
    const error = await errorFor(400, "validation", [
      { field: "comment", code: "request.comment_required", detail: "Dites ce qu'il faut corriger.", params: {} },
      { field: null, code: "request.type_inactive", detail: "Ce type n'est plus proposé.", params: {} },
    ]);
    const loose = serverProblems(result.current, error, t, byName<Values>(["comment", "reason"]));
    expect(result.current.getFieldState("comment").error?.message).toBe("Dites ce qu'il faut corriger.");
    expect(loose.map((problem) => problem.detail)).toEqual(["Ce type n'est plus proposé."]);
  });

  it("uses a code-to-field table when the server names no field", async () => {
    const { result } = renderHook(() => useForm<Values>({ defaultValues: { comment: "", reason: "" } }));
    const error = await errorFor(400, "validation", [
      { field: null, code: "request.reason_required", detail: "Le motif est obligatoire.", params: {} },
    ]);
    const resolve = byName<Values>(["comment", "reason"], { "request.reason_required": "reason" });
    expect(serverProblems(result.current, error, t, resolve)).toEqual([]);
    expect(result.current.getFieldState("reason").error?.message).toBe("Le motif est obligatoire.");
  });

  it("turns a conflict into one plain sentence", async () => {
    const { result } = renderHook(() => useForm<Values>({ defaultValues: { comment: "", reason: "" } }));
    const error = await errorFor(409, "request.already_processed", [
      { field: null, code: "request.already_processed", detail: "Déjà traité.", params: {} },
    ]);
    const loose = serverProblems(result.current, error, t, byName<Values>(["comment", "reason"]));
    expect(details(loose)).toEqual(["Quelqu'un d'autre a agi avant vous. La page affiche maintenant l'état actuel."]);
  });

  it("turns anything that is not a problem answer into the generic sentence", () => {
    const { result } = renderHook(() => useForm<Values>({ defaultValues: { comment: "", reason: "" } }));
    const loose = serverProblems(result.current, new TypeError("Failed to fetch"), t, byName<Values>(["comment", "reason"]));
    expect(details(loose)).toEqual(["Une erreur est survenue. Veuillez réessayer."]);
  });

  it("says so when the application is away", async () => {
    const { result } = renderHook(() => useForm<Values>({ defaultValues: { comment: "", reason: "" } }));
    server.use(http.post("/api/v1/requests/req-1/withdraw", () => new HttpResponse("Bad Gateway", { status: 502 })));
    const error = await requestsApi.withdraw("req-1").catch((failure: unknown) => failure);
    expect(details(serverProblems(result.current, error, t, byName<Values>(["comment", "reason"])))).toEqual([
      "L'application est en cours de mise à jour. Elle sera de retour dans un instant.",
    ]);
  });
});
```

`frontend/src/features/requests/form/chain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import type { Translate } from "../platform";
import type { ChainStepPreview } from "../types";
import { chainSentence } from "./chain";

const translator = (lng: string): Translate => (key, options) => String(i18n.t(key, { ns: "requests", lng, ...options }));
const fr = translator("fr");
const en = translator("en");

const manager: ChainStepPreview = { position: 1, rule: "line_manager", mode: "approve", approvers: ["Sami Ben Ali"] };
const hr: ChainStepPreview = { position: 2, rule: "hr_role", mode: "approve", approvers: ["Leila Gharbi"] };

describe("who will decide, in order and by name (UI 5.3)", () => {
  it("names the manager, then HR", () => {
    expect(chainSentence([manager, hr], fr, "me")).toBe("Votre responsable, Sami Ben Ali, puis les RH");
    expect(chainSentence([manager, hr], en, "me")).toBe("Your manager, Sami Ben Ali, then HR");
  });

  it("names the manager and the delegate who can act for them", () => {
    const withDelegate = { ...manager, approvers: ["Sami Ben Ali", "Nadia Karoui"] };
    expect(chainSentence([withDelegate, hr], en, "me")).toBe("Your manager, Sami Ben Ali, Nadia Karoui, then HR");
  });

  it("speaks of the employee's manager when HR fills the form", () => {
    expect(chainSentence([manager, hr], fr, "hr")).toBe("Son responsable, Sami Ben Ali, puis les RH");
    expect(chainSentence([manager, hr], en, "hr")).toBe("Their manager, Sami Ben Ali, then HR");
  });

  it("says when the manager is only informed, as for sick leave", () => {
    const informed = { ...manager, mode: "notify" as const };
    expect(chainSentence([informed, hr], fr, "me")).toBe("Votre responsable, Sami Ben Ali (pour information), puis les RH");
    expect(chainSentence([informed, hr], en, "me")).toBe("Your manager, Sami Ben Ali (for information), then HR");
  });

  it("says when there is no manager to ask", () => {
    const none = { ...manager, approvers: [] };
    expect(chainSentence([none, hr], en, "me")).toBe("No manager (step skipped), then HR");
  });

  it("names a named person as they are", () => {
    const named: ChainStepPreview = { position: 1, rule: "named_person", mode: "approve", approvers: ["Hatem Jlassi"] };
    expect(chainSentence([named, hr], en, "me")).toBe("Hatem Jlassi, then HR");
  });

  it("says so when nobody is set to decide", () => {
    expect(chainSentence([], en, "me")).toBe("Nobody for now");
  });
});
```

`frontend/src/features/requests/form/hooks.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDebounced } from "./useDebounced";
import { useSingleFlight } from "./useSingleFlight";

afterEach(() => {
  vi.useRealTimers();
});

describe("useSingleFlight", () => {
  it("runs once however many times it is called while busy", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const work = vi.fn(async () => {
      await gate;
    });
    const { result } = renderHook(() => useSingleFlight(work));
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current[0]();
      second = result.current[0]();
    });
    expect(result.current[1]).toBe(true);
    await act(async () => {
      release();
      await Promise.all([first, second]);
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect(result.current[1]).toBe(false);
  });

  it("can run again once the first run has finished", async () => {
    const work = vi.fn(async () => undefined);
    const { result } = renderHook(() => useSingleFlight(work));
    await act(async () => {
      await result.current[0]();
    });
    await act(async () => {
      await result.current[0]();
    });
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("is free again after a failure", async () => {
    const work = vi.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useSingleFlight(work));
    await act(async () => {
      await expect(result.current[0]()).rejects.toThrow("boom");
    });
    expect(result.current[1]).toBe(false);
    await act(async () => {
      await expect(result.current[0]()).rejects.toThrow("boom");
    });
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("passes its arguments through", async () => {
    const work = vi.fn<(count: number, label: string) => Promise<void>>(async () => undefined);
    const { result } = renderHook(() => useSingleFlight(work));
    await act(async () => {
      await result.current[0](3, "x");
    });
    expect(work).toHaveBeenCalledWith(3, "x");
  });
});

describe("useDebounced", () => {
  it("gives the value only once it has stopped changing", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebounced(value, 300), { initialProps: { value: "a" } });
    expect(result.current).toBe("a");
    rerender({ value: "ab" });
    rerender({ value: "abc" });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe("a");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("abc");
  });
});
```

`frontend/src/features/requests/form/draftKeeper.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it } from "vitest";
import { keeperKey, purgeOthers, useDraftKeeper } from "./draftKeeper";
import { EMPTY, type FormValues } from "./schema";

function Probe({ viewer = "user-1", formId }: { viewer?: string; formId: string }) {
  const form = useForm<FormValues>({ defaultValues: EMPTY });
  const keeper = useDraftKeeper(viewer, formId, form);
  return (
    <form>
      <label>
        Début
        <input {...form.register("start_date")} />
      </label>
      <label>
        Commentaire
        <input {...form.register("comment")} />
      </label>
      {keeper.restored && <p>restauré</p>}
      <button type="button" onClick={() => form.setValue("file", new File(["x"], "certificat.pdf"))}>
        fichier
      </button>
      <button type="button" onClick={keeper.clear}>
        effacer
      </button>
    </form>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("the keeper of unsent values (UI 3.4, session end)", () => {
  it("keeps what was typed and gives it back", async () => {
    const first = render(<Probe formId="new:annual" />);
    await userEvent.type(screen.getByLabelText("Début"), "2026-11-09");
    await userEvent.type(screen.getByLabelText("Commentaire"), "Voyage en famille");
    first.unmount();

    render(<Probe formId="new:annual" />);
    expect(await screen.findByText("restauré")).toBeInTheDocument();
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Commentaire")).toHaveValue("Voyage en famille");
  });

  it("says nothing was kept for a form nobody touched", () => {
    render(<Probe formId="new:annual" />);
    expect(screen.queryByText("restauré")).not.toBeInTheDocument();
  });

  it("keeps each form apart", async () => {
    const first = render(<Probe formId="new:annual" />);
    await userEvent.type(screen.getByLabelText("Commentaire"), "Voyage");
    first.unmount();
    render(<Probe formId="new:sick" />);
    expect(screen.getByLabelText("Commentaire")).toHaveValue("");
    expect(screen.queryByText("restauré")).not.toBeInTheDocument();
  });

  it("forgets once cleared", async () => {
    const first = render(<Probe formId="new:annual" />);
    await userEvent.type(screen.getByLabelText("Commentaire"), "Voyage");
    await userEvent.click(screen.getByRole("button", { name: "effacer" }));
    first.unmount();
    render(<Probe formId="new:annual" />);
    expect(screen.getByLabelText("Commentaire")).toHaveValue("");
  });

  it("never stores the chosen file", async () => {
    render(<Probe formId="new:sick" />);
    await userEvent.type(screen.getByLabelText("Commentaire"), "Grippe");
    await userEvent.click(screen.getByRole("button", { name: "fichier" }));
    const stored = window.sessionStorage.getItem(keeperKey("user-1", "new:sick")) ?? "";
    expect(stored).toContain("Grippe");
    expect(stored).not.toContain("certificat.pdf");
    expect(JSON.parse(stored)).not.toHaveProperty("file");
  });

  it("removes what another person left in this tab", async () => {
    const first = render(<Probe viewer="user-1" formId="new:sick" />);
    await userEvent.type(screen.getByLabelText("Commentaire"), "Grippe");
    first.unmount();
    render(<Probe viewer="user-2" formId="new:sick" />);
    expect(screen.getByLabelText("Commentaire")).toHaveValue("");
    expect(window.sessionStorage.getItem(keeperKey("user-1", "new:sick"))).toBeNull();
  });

  it("leaves other things in the tab's storage alone", () => {
    window.sessionStorage.setItem("something-else", "1");
    purgeOthers("user-2");
    expect(window.sessionStorage.getItem("something-else")).toBe("1");
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/problems.test.tsx src/features/requests/form`

Expected: FAIL. `TypeChoice.test.tsx` passes; the six new files fail with "Failed to resolve import" for `./schema`, `./problemFields`, `./problems`, `./chain`, `./useDebounced`, `./useSingleFlight`, `./draftKeeper`.

- [ ] **Step 4: Write the problem helpers**

`frontend/src/features/requests/problems.ts`:

```ts
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { ProblemError, type FieldProblem } from "@/api/problem";
import type { Translate } from "./platform";

/**
 * Shows a failed call on a form: each problem on the input `resolve` names (U5), the first one focused.
 * Returns the problems that belong to no input, for the summary above the form.
 * A 409, an outage and an unexpected failure each become one plain sentence.
 */
export function serverProblems<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
  t: Translate,
  resolve: (problem: FieldProblem) => Path<T> | null,
): FieldProblem[] {
  if (!(error instanceof ProblemError)) {
    return [{ field: null, code: "core.unexpected", detail: t("errors:unexpected"), params: {} }];
  }
  if (error.status === 409) {
    return [{ field: null, code: error.code, detail: t("common:concurrent"), params: {} }];
  }
  if (error.errors.length === 0) {
    // An outage or an answer that is not in the problem format: plan 01b's sentences.
    const key = error.status === 0 ? "errors:network" : error.unavailable ? "errors:unavailable" : "errors:unexpected";
    return [{ field: null, code: error.code, detail: error.detail || t(key), params: {} }];
  }
  const loose: FieldProblem[] = [];
  let focus = true;
  for (const problem of error.errors) {
    const field = resolve(problem);
    if (field === null) {
      loose.push(problem);
      continue;
    }
    form.setError(field, { type: `server:${problem.code}`, message: problem.detail }, { shouldFocus: focus });
    focus = false;
  }
  return loose;
}

/** The sentences of a list of problems, as `FormSummary` takes them. */
export function details(problems: FieldProblem[]): string[] {
  return problems.map((problem) => problem.detail);
}

/** A resolver for a form whose inputs carry the server's field names, with an optional table by problem code. */
export function byName<T extends FieldValues>(
  names: readonly Path<T>[],
  byCode: Record<string, Path<T>> = {},
): (problem: FieldProblem) => Path<T> | null {
  return (problem) => {
    if (problem.field && (names as readonly string[]).includes(problem.field)) return problem.field as Path<T>;
    return byCode[problem.code] ?? null;
  };
}
```

`frontend/src/features/requests/form/problemFields.ts`:

```ts
import type { FieldProblem } from "@/api/problem";

export const FORM_FIELDS = [
  "start_date",
  "end_date",
  "starts_at_midday",
  "ends_at_midday",
  "start_time",
  "end_time",
  "exceptional_event",
  "comment",
  "file",
  "override_reason",
] as const;

export type FormField = (typeof FORM_FIELDS)[number];

const BY_CODE: Record<string, FormField> = {
  "request.end_before_start": "end_date",
  "request.no_working_day": "start_date",
  "request.half_day_not_allowed": "starts_at_midday",
  "request.half_day_on_non_working_day": "starts_at_midday",
  "request.half_day_both_ends": "ends_at_midday",
  "request.dates_required": "start_date",
  "request.past_dates": "start_date",
  "request.notice": "start_date",
  "request.overlap": "start_date",
  "request.balance_insufficient": "end_date",
  "request.cap_exceeded": "start_date",
  "request.event_required": "exceptional_event",
  "request.event_days_exceeded": "end_date",
  "request.permission_non_working_day": "start_date",
  "request.permission_times": "end_time",
  "request.permission_overlaps_absence": "start_date",
  "request.reason_required": "override_reason",
  "files.too_large": "file",
  "files.type_not_allowed": "file",
  "files.content_mismatch": "file",
  "files.empty": "file",
};

const ALIASES: Record<string, FormField> = {
  exceptional_event_id: "exceptional_event",
  event: "exceptional_event",
  date: "start_date",
};

/** The input a problem is shown on, or null when it belongs to the summary above the form. */
export function fieldFor(problem: FieldProblem, visible: ReadonlySet<FormField>): FormField | null {
  let field: FormField | undefined;
  if (problem.field) {
    field = (FORM_FIELDS as readonly string[]).includes(problem.field)
      ? (problem.field as FormField)
      : ALIASES[problem.field];
  }
  field ??= BY_CODE[problem.code];
  return field && visible.has(field) ? field : null;
}
```

- [ ] **Step 5: Write the form values and their validation**

`frontend/src/features/requests/form/schema.ts`:

```ts
import { z } from "zod";
import type { Translate } from "../platform";
import type { RequestFields, RequestOut, RequestTypeOut } from "../types";
import type { FormField } from "./problemFields";

export interface FormValues {
  start_date: string;
  end_date: string;
  starts_at_midday: boolean;
  ends_at_midday: boolean;
  start_time: string;
  end_time: string;
  exceptional_event: string;
  comment: string;
  file: File | null;
  override: boolean;
  override_reason: string;
}

export const EMPTY: FormValues = {
  start_date: "",
  end_date: "",
  starts_at_midday: false,
  ends_at_midday: false,
  start_time: "",
  end_time: "",
  exceptional_event: "",
  comment: "",
  file: null,
  override: false,
  override_reason: "",
};

/** REQ-16: PDF, JPG and PNG up to 10 MB. The server checks again, including the content. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_NAME = /\.(pdf|jpe?g|png)$/i;

/** Client-side checks that need no server: what is missing, and what cannot be right. */
export function buildSchema(type: RequestTypeOut, t: Translate) {
  return z
    .object({
      start_date: z.string(),
      end_date: z.string(),
      starts_at_midday: z.boolean(),
      ends_at_midday: z.boolean(),
      start_time: z.string(),
      end_time: z.string(),
      exceptional_event: z.string(),
      comment: z.string(),
      file: z.custom<File | null>((value) => value === null || value instanceof File),
      override: z.boolean(),
      override_reason: z.string(),
    })
    .superRefine((values, context) => {
      const issue = (path: FormField, message: string) => context.addIssue({ code: "custom", path: [path], message });

      // Every rule lives in this one refinement, so all messages appear together.
      if (!values.start_date) issue("start_date", t("formErrors.required"));
      if (type.unit === "day") {
        if (!values.end_date) issue("end_date", t("formErrors.required"));
        else if (values.start_date && values.end_date < values.start_date) issue("end_date", t("formErrors.endBeforeStart"));
        const singleDay = values.start_date !== "" && values.start_date === values.end_date;
        if (type.allows_half_day && singleDay && values.starts_at_midday && values.ends_at_midday) {
          issue("ends_at_midday", t("formErrors.bothHalves"));
        }
      } else {
        if (!values.start_time) issue("start_time", t("formErrors.required"));
        if (!values.end_time) issue("end_time", t("formErrors.required"));
        if (values.start_time && values.end_time && values.end_time <= values.start_time) {
          issue("end_time", t("formErrors.times"));
        }
      }
      if (type.uses_events && !values.exceptional_event) issue("exceptional_event", t("formErrors.eventRequired"));
      if (values.override && values.override_reason.trim() === "") issue("override_reason", t("formErrors.reasonRequired"));

      const fileMessage = values.file ? fileProblem(values.file, t) : null;
      if (fileMessage) issue("file", fileMessage);
    });
}

/** Why a chosen file cannot be sent, or null when it can. Shared by every place a file is chosen. */
export function fileProblem(file: File, t: Translate): string | null {
  const typeIsWrong = file.type !== "" && !ALLOWED_TYPES.includes(file.type);
  if (!ALLOWED_NAME.test(file.name) || typeIsWrong) return t("formErrors.fileType");
  if (file.size === 0) return t("formErrors.fileEmpty");
  if (file.size > MAX_FILE_BYTES) return t("formErrors.fileSize");
  return null;
}

/** The inputs shown for a type (M7). */
export function visibleFields(
  type: RequestTypeOut,
  options: { hr: boolean; override: boolean; proofRequired: boolean },
): Set<FormField> {
  const fields = new Set<FormField>(["start_date", "comment"]);
  if (type.unit === "day") {
    fields.add("end_date");
    if (type.allows_half_day) {
      fields.add("starts_at_midday");
      fields.add("ends_at_midday");
    }
  } else {
    fields.add("start_time");
    fields.add("end_time");
  }
  if (type.uses_events) fields.add("exceptional_event");
  if (type.document_rule === "required_within_deadline" || options.proofRequired) fields.add("file");
  if (options.hr && options.override) fields.add("override_reason");
  return fields;
}

/** Form values as the request fields of the API (master 7.9). A permission has one date and two times. */
export function toFields(values: FormValues, type: RequestTypeOut): RequestFields {
  const hourly = type.unit === "hour";
  const halfDays = !hourly && type.allows_half_day;
  return {
    start_date: values.start_date,
    end_date: hourly ? values.start_date : values.end_date,
    starts_at_midday: halfDays && values.starts_at_midday,
    ends_at_midday: halfDays && values.ends_at_midday,
    start_time: hourly ? values.start_time : null,
    end_time: hourly ? values.end_time : null,
    exceptional_event: type.uses_events && values.exceptional_event ? Number(values.exceptional_event) : null,
    comment: values.comment.trim(),
  };
}

export function fromRequest(request: RequestOut): FormValues {
  return {
    ...EMPTY,
    start_date: request.start_date,
    end_date: request.end_date,
    starts_at_midday: request.starts_at_midday,
    ends_at_midday: request.ends_at_midday,
    start_time: (request.start_time ?? "").slice(0, 5),
    end_time: (request.end_time ?? "").slice(0, 5),
    exceptional_event: request.event ? String(request.event.id) : "",
    comment: request.comment ?? "",
  };
}

/** Whether there is enough, and nothing obviously wrong, to ask the server what it computes. */
export function previewReady(values: FormValues, type: RequestTypeOut): boolean {
  if (!values.start_date) return false;
  if (type.uses_events && !values.exceptional_event) return false;
  if (type.unit === "hour") {
    return values.start_time !== "" && values.end_time !== "" && values.end_time > values.start_time;
  }
  return values.end_date !== "" && values.end_date >= values.start_date;
}
```

- [ ] **Step 6: Write the sentence that says who will decide**

`frontend/src/features/requests/form/chain.ts`:

```ts
import type { Translate } from "../platform";
import type { ChainStepPreview } from "../types";

/** "Your manager, Sami Ben Ali, then HR". The names come from the server; nothing is resolved here (U4). */
export function chainSentence(chain: ChainStepPreview[], t: Translate, mode: "me" | "hr"): string {
  if (chain.length === 0) return capitalise(t("chain.nobody"));
  const parts = chain.map((step) => {
    const names = step.approvers.join(", ");
    let who: string;
    if (step.rule === "hr_role") who = t("common.hr");
    else if (step.rule === "line_manager") {
      who = names ? t(mode === "me" ? "chain.yourManager" : "chain.theManager", { names }) : t("chain.noManager");
    } else who = names || t("chain.nobody");
    return step.mode === "notify" ? t("chain.informed", { who }) : who;
  });
  return capitalise(parts.join(t("chain.then")));
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
```

- [ ] **Step 7: Write the three hooks**

`frontend/src/features/requests/form/useDebounced.ts`:

```ts
import { useEffect, useState } from "react";

/** The value, once it has stopped changing for `delayMs`. Pass a primitive: an object is new on every render. */
export function useDebounced<T extends string | number | boolean>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
```

`frontend/src/features/requests/form/useSingleFlight.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wraps an action so that calls made while it is running are ignored: a double click sends once.
 * Returns the guarded action and whether it is running. The control stays enabled (M8); it only
 * shows that it is busy.
 */
export function useSingleFlight<A extends unknown[]>(
  run: (...args: A) => Promise<void>,
): [(...args: A) => Promise<void>, boolean] {
  const busy = useRef(false);
  const latest = useRef(run);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    latest.current = run;
  });

  const guarded = useCallback(async (...args: A) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await latest.current(...args);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, []);

  return [guarded, pending];
}
```

`frontend/src/features/requests/form/draftKeeper.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { EMPTY, type FormValues } from "./schema";

const PREFIX = "iris-hr:request-form:";

type Kept = Omit<FormValues, "file">;

export function keeperKey(viewerId: string, formId: string): string {
  return `${PREFIX}${viewerId}:${formId}`;
}

function read(key: string): Kept | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Kept) : null;
  } catch {
    return null;
  }
}

function write(key: string, values: FormValues): void {
  try {
    // `file: undefined` is dropped by JSON.stringify: a file is never stored.
    window.sessionStorage.setItem(key, JSON.stringify({ ...values, file: undefined }));
  } catch {
    // Storage is unavailable (private window, quota): nothing is kept, and the form still works.
  }
}

function remove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}

/** Removes what another person left in this tab, so one account never sees another's unsent text. */
export function purgeOthers(viewerId: string): void {
  try {
    const mine = `${PREFIX}${viewerId}:`;
    const doomed: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key && key.startsWith(PREFIX) && !key.startsWith(mine)) doomed.push(key);
    }
    doomed.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Storage is unavailable.
  }
}

/**
 * Keeps the unsent values of a form in the tab's session storage, so that a session that ends
 * while the form is open (the client then goes to Sign in and back) does not cost what was typed.
 * Storage lasts as long as the tab, like the session cookie. Give the form a React `key` equal to
 * `formId` so that a different form starts from its own kept values.
 */
export function useDraftKeeper(
  viewerId: string,
  formId: string,
  form: UseFormReturn<FormValues>,
): { restored: boolean; clear: () => void } {
  const key = keeperKey(viewerId, formId);
  const [restored, setRestored] = useState(() => read(key) !== null);

  useEffect(() => {
    purgeOthers(viewerId);
    const kept = read(key);
    if (kept) form.reset({ ...EMPTY, ...kept, file: null }, { keepDefaultValues: true });
  }, [key, viewerId, form]);

  useEffect(() => {
    const subscription = form.watch((values) => write(key, { ...EMPTY, ...values } as FormValues));
    return () => subscription.unsubscribe();
  }, [key, form]);

  const clear = useCallback(() => {
    remove(key);
    setRestored(false);
  }, [key]);

  return { restored, clear };
}
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/problems.test.tsx src/features/requests/form src/i18n/parity.test.ts`

Expected: PASS.

If "removes what another person left in this tab" fails because the first person's values are restored before the purge, check that the purge runs in the same effect as the restore and before it, as written above.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/requests frontend/src/i18n/locales
git commit -m "feat(requests): form values, validation, problem mapping, single flight and draft keeper"
```

---

### Task 5: New request, step two: the form

**Files:**
- Create: `frontend/src/features/requests/form/FieldError.tsx`
- Create: `frontend/src/features/requests/form/PreviewPanel.tsx`
- Create: `frontend/src/features/requests/form/RequestForm.tsx`
- Create: `frontend/src/features/requests/form/NewRequestPage.tsx`
- Create: `frontend/src/test/requestServer.ts`
- Modify: `frontend/src/workspaces/me/routes.tsx` (append one route)
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (section `form`)
- Test: `frontend/src/features/requests/form/RequestForm.test.tsx`
- Test: `frontend/src/features/requests/form/NewRequestPage.test.tsx`

**Interfaces:**
- Consumes: everything of Task 4; `requestsApi`, `refreshRequests`, `useEvents`, `usePreview`, `useRequestTypes` (Task 1); `TypeChoice` (Task 3); `useViewer`, `useRequestsText`; the bound inputs, `FormSummary`, `PageHeader`, `toast`, `NotAvailable` from `@/components`.
- Produces:
  - `RequestForm(props: RequestFormProps)` with `interface RequestFormProps { type: RequestTypeOut; mode: "me" | "hr"; formId: string; employeeId?: string; existing?: RequestDetail; initialDate?: string; onDone: (result: { request: RequestDetail; sent: boolean }) => void; onCancel: () => void }`. Give it `key={formId}`.
  - `PreviewPanel({ type, preview, mode })`.
  - `FieldError({ control, name })`: the error line of an input that shows none of its own. Plan 01b's `SwitchField` has no error line, so the half-day choices get theirs from this (also in Tasks 9 and 13).
  - `NewRequestPage` (default export) at `/me/requests/new`: step one without `?type=`, step two with it; `?date=yyyy-mm-dd` pre-fills both dates.
  - `serveRequestForm(options?): FormCalls` in `src/test/requestServer.ts`, reused by Tasks 6 and 15.

What the form asks and shows, driven by the attributes of the type and never by its code (UI 5.3, NFR-10):

| Attribute of the type | Asked | Shown, not asked (from `requests/preview`) |
|---|---|---|
| `unit = day` | Start, end | Working days counted; days not counted as weekend or holiday |
| `allows_half_day` | Start at midday on the first day; finish at midday on the last day | |
| `unit = hour` | Date, from, to | Hours counted; `usage.month_hours` |
| `uses_events` | Event | `usage.event_days_allowed` |
| `document_rule = required_within_deadline`, or the chosen event requires proof | A file, now or later | `certificate_due_at` |
| `is_sensitive` | | That the comment and certificate are seen by HR only |
| any | Comment (optional) | `balance` when not null; `usage.cap` when not null; who will decide, by name |
| HR mode, until the draft exists | Allow an exception, with a mandatory reason | That the request then follows its normal steps |

Sending is three calls at most: save the draft (`POST requests`, or `PATCH` when it already exists), upload the file if one was chosen, then `POST …/submit` when the saved request's `viewer.actions` contains `submit`. If a later call fails, the draft stays and the next attempt updates it instead of creating a second one.

Two precisions of plan 03a shape the form. The preview is asked with `request: <public id>` as soon as the request exists, so that it does not collide with itself. And the exception of an HR request is fixed when the request is created (`PATCH` takes no `override_reason`): the choice is offered until the draft exists, then replaced by a sentence saying so.

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "form": {
    "title": "{{type}}",
    "start": "Début",
    "end": "Fin",
    "date": "Date",
    "from": "De",
    "to": "À",
    "startsAtMidday": "Commencer à midi le premier jour",
    "endsAtMidday": "Finir à midi le dernier jour",
    "event": "Événement",
    "eventPlaceholder": "Choisir un événement",
    "comment": "Commentaire",
    "commentSensitiveHint": "Vu uniquement par les RH.",
    "certificate": "Certificat médical",
    "proof": "Justificatif",
    "fileLaterHint": "PDF, JPG ou PNG, 10 Mo au plus. Vous pouvez l'ajouter maintenant ou plus tard.",
    "fileHint": "PDF, JPG ou PNG, 10 Mo au plus.",
    "override": "Autoriser une exception",
    "overrideHint": "Lève les contrôles de solde, de limite, de jours accordés et de dates passées.",
    "overrideReason": "Motif de l'exception",
    "overrideFixed": "L'exception se décide à la création de la demande : elle ne peut plus être changée ici.",
    "followsSteps": "La demande suit ensuite ses étapes normales.",
    "balanceHint": "Vous pouvez demander aux RH s'ils peuvent accorder une exception.",
    "balanceHintHr": "Pour passer outre, activez « Autoriser une exception » et indiquez le motif.",
    "sending": "Envoi en cours…",
    "saveForLater": "Enregistrer pour plus tard",
    "saveChanges": "Enregistrer les modifications",
    "sendAgain": "Renvoyer",
    "sent": "Demande envoyée.",
    "saved": "Brouillon enregistré.",
    "changed": "Modifications enregistrées.",
    "computed": "Calculé pour vous",
    "computedEmpty": "Indiquez les dates : le décompte apparaîtra ici.",
    "daysCounted": "Jours ouvrés comptés",
    "hoursCounted": "Heures comptées",
    "notCounted": "Non comptés",
    "skipped": {
      "weekend": "{{date}} (week-end)",
      "holiday": "{{date}} (jour férié)"
    },
    "balanceNow": "Solde aujourd'hui",
    "balanceOnStart": "Solde au premier jour",
    "balanceAfter": "Solde après cette demande",
    "eventAllowed": "Jours accordés pour cet événement",
    "monthHours": "Heures déjà prises ce mois-ci",
    "cap": {
      "week": "Déjà pris cette semaine",
      "month": "Déjà pris ce mois-ci"
    },
    "capValue": "{{used}} sur {{limit}}",
    "certificateDue": "Certificat à fournir avant le",
    "whoDecides": "Qui décidera",
    "sensitiveNote": "Votre commentaire et votre certificat ne sont vus que par les RH."
  }
```

English:

```json
  "form": {
    "title": "{{type}}",
    "start": "Start",
    "end": "End",
    "date": "Date",
    "from": "From",
    "to": "To",
    "startsAtMidday": "Start at midday on the first day",
    "endsAtMidday": "Finish at midday on the last day",
    "event": "Event",
    "eventPlaceholder": "Choose an event",
    "comment": "Comment",
    "commentSensitiveHint": "Seen by HR only.",
    "certificate": "Medical certificate",
    "proof": "Proof",
    "fileLaterHint": "PDF, JPG or PNG, 10 MB at most. You can add it now or later.",
    "fileHint": "PDF, JPG or PNG, 10 MB at most.",
    "override": "Allow an exception",
    "overrideHint": "Lifts the checks on balance, limit, days allowed and past dates.",
    "overrideReason": "Reason for the exception",
    "overrideFixed": "The exception is decided when the request is created: it can no longer be changed here.",
    "followsSteps": "The request then follows its normal steps.",
    "balanceHint": "You can ask HR whether an exception is possible.",
    "balanceHintHr": "To go ahead anyway, turn on \"Allow an exception\" and give the reason.",
    "sending": "Sending…",
    "saveForLater": "Save for later",
    "saveChanges": "Save the changes",
    "sendAgain": "Send again",
    "sent": "Request sent.",
    "saved": "Draft saved.",
    "changed": "Changes saved.",
    "computed": "Worked out for you",
    "computedEmpty": "Give the dates: the count will appear here.",
    "daysCounted": "Working days counted",
    "hoursCounted": "Hours counted",
    "notCounted": "Not counted",
    "skipped": {
      "weekend": "{{date}} (weekend)",
      "holiday": "{{date}} (public holiday)"
    },
    "balanceNow": "Balance today",
    "balanceOnStart": "Balance on the first day",
    "balanceAfter": "Balance after this request",
    "eventAllowed": "Days allowed for this event",
    "monthHours": "Hours already taken this month",
    "cap": {
      "week": "Already taken this week",
      "month": "Already taken this month"
    },
    "capValue": "{{used}} of {{limit}}",
    "certificateDue": "Certificate due by",
    "whoDecides": "Who will decide",
    "sensitiveNote": "Your comment and your certificate are seen by HR only."
  }
```

- [ ] **Step 2: Write the test server for request forms**

`frontend/src/test/requestServer.ts`:

```ts
import { http, HttpResponse } from "msw";
import type { Preview, PreviewBody, RequestTypeOut } from "@/features/requests/types";
import { makeEvent, makePreview, makeRequestDetail, TYPES, type DetailOverrides } from "@/features/requests/fixtures";
import { server } from "./server";

export interface FormCalls {
  preview: PreviewBody[];
  create: Record<string, unknown>[];
  update: Record<string, unknown>[];
  submit: Record<string, unknown>[];
  attach: number;
}

export interface FormServerOptions {
  types?: RequestTypeOut[];
  preview?: Preview | ((body: PreviewBody) => Preview);
  /** The request the server holds once created; defaults to a draft "new-1" at version 1. */
  draft?: DetailOverrides;
}

const DRAFT: DetailOverrides = {
  public_id: "new-1",
  status: "draft",
  state: { key: "draft", waiting_on: [] },
  viewer: { actions: ["edit", "submit", "discard"] },
  submitted_at: null,
};

/**
 * Installs the handlers a request form talks to and records what it sends.
 * The version grows by one with every change, as on the real server.
 * A test overrides one handler by calling `server.use` after this function.
 */
export function serveRequestForm(options: FormServerOptions = {}): FormCalls {
  const calls: FormCalls = { preview: [], create: [], update: [], submit: [], attach: 0 };
  const draft: DetailOverrides = { ...DRAFT, ...options.draft };
  const id = draft.public_id ?? "new-1";
  let version = draft.version ?? 1;
  const current = () => makeRequestDetail({ ...draft, version });

  server.use(
    http.get("/api/v1/request-types", () => HttpResponse.json(options.types ?? Object.values(TYPES))),
    http.get("/api/v1/exceptional-events", () =>
      HttpResponse.json([
        makeEvent(),
        makeEvent({ id: 2, name: "Naissance", name_fr: "Naissance", name_en: "Birth", days_allowed: "2.00", proof_required: false }),
      ]),
    ),
    http.post("/api/v1/requests/preview", async ({ request }) => {
      const body = (await request.json()) as PreviewBody;
      calls.preview.push(body);
      const preview = options.preview;
      return HttpResponse.json(typeof preview === "function" ? preview(body) : (preview ?? makePreview()));
    }),
    http.post("/api/v1/requests", async ({ request }) => {
      calls.create.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json(current(), { status: 201 });
    }),
    http.patch(`/api/v1/requests/${id}`, async ({ request }) => {
      calls.update.push((await request.json()) as Record<string, unknown>);
      version += 1;
      return HttpResponse.json(current());
    }),
    http.get(`/api/v1/requests/${id}`, () => HttpResponse.json(current())),
    http.post(`/api/v1/requests/${id}/attachments`, () => {
      calls.attach += 1;
      version += 1;
      return HttpResponse.json(
        { public_id: "att-1", kind: "medical", name: "certificat.pdf", size: 8, uploaded_by: "Amal Trabelsi", uploaded_at: "2026-10-28T10:00:00+01:00" },
        { status: 201 },
      );
    }),
    http.post(`/api/v1/requests/${id}/submit`, async ({ request }) => {
      calls.submit.push((await request.json()) as Record<string, unknown>);
      version += 1;
      return HttpResponse.json(makeRequestDetail({ public_id: id, version }));
    }),
  );
  return calls;
}
```

- [ ] **Step 3: Write the failing tests of the form**

`frontend/src/features/requests/form/RequestForm.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMe } from "@/test/fixtures";
import { chooseOption, pickFile, setDate, setText, setTime, toggle } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makePreview, problemResponse, TYPES } from "@/features/requests/fixtures";
import { serveRequestForm } from "@/test/requestServer";
import { server } from "@/test/server";
import type { RequestTypeOut } from "../types";
import { RequestForm, type RequestFormProps } from "./RequestForm";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });

function show(type: RequestTypeOut, props: Partial<RequestFormProps> = {}) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  const formId = props.formId ?? `new:${type.code}`;
  const view = renderApp(
    <RequestForm key={formId} type={type} mode="me" formId={formId} onDone={onDone} onCancel={onCancel} {...props} />,
    { route: "/me/requests/new", me },
  );
  return { onDone, onCancel, view };
}

function fillDates(start = "2026-11-09", end = "2026-11-11") {
  setDate("Début", start);
  setDate("Fin", end);
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("the form shows only the fields of the chosen type (M7)", () => {
  it("an annual leave asks for dates, half-days and a comment", () => {
    serveRequestForm();
    show(TYPES.annual);
    expect(screen.getByLabelText("Début")).toBeInTheDocument();
    expect(screen.getByLabelText("Fin")).toBeInTheDocument();
    expect(screen.getByLabelText("Commencer à midi le premier jour")).toBeInTheDocument();
    expect(screen.getByLabelText("Finir à midi le dernier jour")).toBeInTheDocument();
    expect(screen.getByLabelText("Commentaire (facultatif)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Événement")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("De")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Certificat médical")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Autoriser une exception")).not.toBeInTheDocument();
  });

  it("a permission asks for one date and two times", () => {
    serveRequestForm();
    show(TYPES.permission);
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.getByLabelText("De")).toBeInTheDocument();
    expect(screen.getByLabelText("À")).toBeInTheDocument();
    expect(screen.queryByLabelText("Fin")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Commencer à midi le premier jour")).not.toBeInTheDocument();
  });

  it("an exceptional leave asks for its event, and for proof when the event needs it", async () => {
    serveRequestForm();
    show(TYPES.exceptional);
    expect(screen.queryByLabelText("Commencer à midi le premier jour")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Justificatif")).not.toBeInTheDocument();
    await screen.findByRole("option", { name: "Mariage" });
    await chooseOption("Événement", "Mariage");
    expect(await screen.findByLabelText("Justificatif")).toBeInTheDocument();
    await chooseOption("Événement", "Naissance");
    await waitFor(() => expect(screen.queryByLabelText("Justificatif")).not.toBeInTheDocument());
  });

  it("a sick leave offers the certificate now or later and says who sees it", () => {
    serveRequestForm();
    show(TYPES.sick);
    expect(screen.getByLabelText("Certificat médical")).toBeInTheDocument();
    expect(screen.getByText(/Vous pouvez l'ajouter maintenant ou plus tard/)).toBeInTheDocument();
    expect(screen.getByText("Votre commentaire et votre certificat ne sont vus que par les RH.")).toBeInTheDocument();
  });
});

describe("the form shows what the system computed (U4)", () => {
  it("counts the days, lists those not counted, gives the balance and says who will decide", async () => {
    const calls = serveRequestForm({
      preview: makePreview({
        quantity: "3.00",
        skipped_days: [
          { date: "2026-11-07", reason: "weekend" },
          { date: "2026-11-10", reason: "holiday" },
        ],
        balance: { now: "12.50", on_start: "15.00", after: "12.00" },
      }),
    });
    show(TYPES.annual);
    fillDates("2026-11-06", "2026-11-12");
    expect(await screen.findByText("3 j")).toBeInTheDocument();
    expect(screen.getByText("D(2026-11-07) (week-end) · D(2026-11-10) (jour férié)")).toBeInTheDocument();
    expect(screen.getByText("12.5 j")).toBeInTheDocument();
    expect(screen.getByText("15 j")).toBeInTheDocument();
    expect(screen.getByText("12 j")).toBeInTheDocument();
    expect(screen.getByText("Votre responsable, Sami Ben Ali, puis les RH")).toBeInTheDocument();
    expect(calls.preview.at(-1)).toEqual({
      type: "annual",
      start_date: "2026-11-06",
      end_date: "2026-11-12",
      starts_at_midday: false,
      ends_at_midday: false,
      start_time: null,
      end_time: null,
      exceptional_event: null,
      override: false,
    });
  });

  it("shows no balance line when the type does not use the balance", async () => {
    serveRequestForm({ preview: makePreview({ balance: null }) });
    show(TYPES.remote);
    fillDates();
    expect(await screen.findByText("3 j")).toBeInTheDocument();
    expect(screen.queryByText("Solde aujourd'hui")).not.toBeInTheDocument();
  });

  it("shows the remote days already taken and the limit", async () => {
    serveRequestForm({
      preview: makePreview({ quantity: "1.00", usage: { cap: { used: "1.00", limit: "2.00", period: "week" }, month_hours: null, event_days_allowed: null } }),
    });
    show(TYPES.remote);
    fillDates("2026-11-09", "2026-11-09");
    expect(await screen.findByText("Déjà pris cette semaine")).toBeInTheDocument();
    expect(screen.getByText("1 j sur 2 j")).toBeInTheDocument();
  });

  it("shows the hours of a permission and those already taken this month", async () => {
    serveRequestForm({
      preview: makePreview({ quantity: "2.50", usage: { cap: null, month_hours: "4.00", event_days_allowed: null } }),
    });
    show(TYPES.permission);
    setDate("Date", "2026-11-09");
    setTime("De", "14:00");
    setTime("À", "16:30");
    expect(await screen.findByText("2.5 h")).toBeInTheDocument();
    expect(screen.getByText("Heures déjà prises ce mois-ci")).toBeInTheDocument();
    expect(screen.getByText("4 h")).toBeInTheDocument();
  });

  it("shows the days an event allows and when the certificate is due", async () => {
    serveRequestForm({
      preview: makePreview({
        usage: { cap: null, month_hours: null, event_days_allowed: "3.00" },
        certificate_due_at: "2026-11-11T09:00:00+01:00",
      }),
    });
    show(TYPES.exceptional);
    await screen.findByRole("option", { name: "Mariage" });
    await chooseOption("Événement", "Mariage");
    fillDates();
    expect(await screen.findByText("Jours accordés pour cet événement")).toBeInTheDocument();
    expect(screen.getByText("T(2026-11-11T09:00:00+01:00)")).toBeInTheDocument();
  });

  it("asks the server nothing while the dates cannot be right", async () => {
    const calls = serveRequestForm();
    show(TYPES.annual);
    fillDates("2026-11-11", "2026-11-09");
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(calls.preview).toHaveLength(0);
    expect(screen.getByText("Indiquez les dates : le décompte apparaîtra ici.")).toBeInTheDocument();
  });
});

describe("sending", () => {
  it("saves the draft, submits it with its version and reports the result", async () => {
    const calls = serveRequestForm();
    const { onDone } = show(TYPES.annual);
    fillDates();
    setText("Commentaire (facultatif)", "Voyage en famille");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(calls.create).toEqual([
      {
        type: "annual",
        start_date: "2026-11-09",
        end_date: "2026-11-11",
        starts_at_midday: false,
        ends_at_midday: false,
        start_time: null,
        end_time: null,
        exceptional_event: null,
        comment: "Voyage en famille",
      },
    ]);
    expect(calls.submit).toEqual([{ version: 1 }]);
    expect(onDone.mock.calls[0][0].sent).toBe(true);
    expect(onDone.mock.calls[0][0].request.public_id).toBe("new-1");
  });

  it("a double click on Send creates one request", async () => {
    const calls = serveRequestForm();
    const { onDone } = show(TYPES.annual);
    fillDates();
    await userEvent.dblClick(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(calls.create).toHaveLength(1);
    expect(calls.submit).toHaveLength(1);
  });

  it("saves for later without sending", async () => {
    const calls = serveRequestForm();
    const { onDone } = show(TYPES.annual);
    fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer pour plus tard" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(calls.create).toHaveLength(1);
    expect(calls.submit).toHaveLength(0);
    expect(onDone.mock.calls[0][0].sent).toBe(false);
  });

  it("uploads the certificate between saving and sending", async () => {
    const calls = serveRequestForm();
    const { onDone } = show(TYPES.sick);
    fillDates("2026-11-09", "2026-11-10");
    await pickFile("Certificat médical", new File(["%PDF-1.4"], "certificat.pdf", { type: "application/pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(calls.attach).toBe(1);
    expect(calls.submit).toEqual([{ version: 2 }]);
  });

  it("cancel leaves without saving anything", async () => {
    const calls = serveRequestForm();
    const { onCancel } = show(TYPES.annual);
    fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(calls.create).toHaveLength(0);
  });
});

describe("messages (UI 5.3) and what is never lost (U5)", () => {
  const overlap = { field: "start_date", code: "request.overlap", detail: "Ces dates chevauchent votre demande du 10 novembre.", params: {} };

  it("shows a problem the server finds before anything is sent, and does not send", async () => {
    const calls = serveRequestForm({
      preview: (body) => makePreview({ problems: body.start_date === "2026-11-09" ? [overlap] : [] }),
    });
    const { onDone } = show(TYPES.annual);
    fillDates();
    expect(await screen.findByText("Ces dates chevauchent votre demande du 10 novembre.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(screen.getByText("Ces dates chevauchent votre demande du 10 novembre.")).toBeInTheDocument();
    expect(calls.create).toHaveLength(0);
    expect(onDone).not.toHaveBeenCalled();

    fillDates("2026-11-16", "2026-11-18");
    await waitFor(() =>
      expect(screen.queryByText("Ces dates chevauchent votre demande du 10 novembre.")).not.toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("explains an insufficient balance and that HR can make an exception", async () => {
    serveRequestForm({
      preview: makePreview({
        problems: [{ field: null, code: "request.balance_insufficient", detail: "Il vous manque 1,5 jour.", params: { shortfall: "1.50" } }],
      }),
    });
    show(TYPES.annual);
    fillDates();
    expect(await screen.findByText("Il vous manque 1,5 jour.")).toBeInTheDocument();
    expect(screen.getByText("Vous pouvez demander aux RH s'ils peuvent accorder une exception.")).toBeInTheDocument();
  });

  it("puts a problem with no field on screen in the summary", async () => {
    serveRequestForm({
      preview: makePreview({
        problems: [{ field: null, code: "request.type_inactive", detail: "Ce type de demande n'est plus proposé.", params: {} }],
      }),
    });
    show(TYPES.annual);
    fillDates();
    expect(await screen.findByText("Ce type de demande n'est plus proposé.")).toBeInTheDocument();
  });

  it("shows a problem with a half-day next to the half-day choices", async () => {
    serveRequestForm({
      preview: (body) =>
        makePreview({
          problems: body.starts_at_midday
            ? [
                {
                  field: "starts_at_midday",
                  code: "request.half_day_on_non_working_day",
                  detail: "Le premier jour n'est pas travaillé : une demi-journée n'y est pas possible.",
                  params: {},
                },
              ]
            : [],
        }),
    });
    show(TYPES.annual);
    fillDates();
    await toggle("Commencer à midi le premier jour");
    expect(
      await screen.findByText("Le premier jour n'est pas travaillé : une demi-journée n'y est pas possible."),
    ).toBeInTheDocument();
  });

  it("refuses a single day flagged at both ends, next to the choices and without sending", async () => {
    const calls = serveRequestForm();
    show(TYPES.annual);
    fillDates("2026-11-09", "2026-11-09");
    await toggle("Commencer à midi le premier jour");
    await toggle("Finir à midi le dernier jour");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(
      await screen.findByText("Pour une seule journée, choisissez le matin ou l'après-midi, pas les deux."),
    ).toBeInTheDocument();
    expect(calls.create).toHaveLength(0);
  });

  it("refuses an end before the start without calling the server", async () => {
    const calls = serveRequestForm();
    show(TYPES.annual);
    fillDates("2026-11-11", "2026-11-09");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("La fin doit être le même jour que le début, ou après.")).toBeInTheDocument();
    expect(calls.create).toHaveLength(0);
  });

  it("a refused file leaves every other field as typed", async () => {
    const calls = serveRequestForm();
    show(TYPES.sick);
    fillDates("2026-11-09", "2026-11-10");
    setText("Commentaire (facultatif)", "Grippe");
    await pickFile("Certificat médical", new File(["notes"], "certificat.pdf.txt", { type: "text/plain" }));
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(
      await screen.findByText("Ce type de fichier n'est pas accepté. Utilisez un PDF, un JPG ou un PNG."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-10");
    expect(screen.getByLabelText("Commentaire (facultatif)")).toHaveValue("Grippe");
    expect(calls.create).toHaveLength(0);
  });

  it("keeps everything typed when the server refuses on sending, and does not create a second draft", async () => {
    const calls = serveRequestForm();
    server.use(
      http.post("/api/v1/requests/new-1/submit", () =>
        problemResponse(400, "validation", "Prévenez au moins trois jours avant.", [
          { field: "start_date", code: "request.notice", detail: "Prévenez au moins trois jours avant.", params: {} },
        ]),
      ),
    );
    const { onDone } = show(TYPES.annual);
    fillDates();
    setText("Commentaire (facultatif)", "Voyage");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("Prévenez au moins trois jours avant.")).toBeInTheDocument();
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Commentaire (facultatif)")).toHaveValue("Voyage");
    expect(onDone).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(calls.update).toHaveLength(1));
    expect(calls.create).toHaveLength(1);
    expect(calls.update[0]).toMatchObject({ version: 1, start_date: "2026-11-09" });
    expect(calls.update[0]).not.toHaveProperty("override_reason");
    // Once the draft exists, the preview names it, so that it is not held against itself.
    await waitFor(() => expect(calls.preview.at(-1)).toMatchObject({ request: "new-1" }));
  });

  it("says in plain words when the request changed elsewhere", async () => {
    serveRequestForm();
    server.use(
      http.post("/api/v1/requests/new-1/submit", () => problemResponse(409, "request.already_processed", "Déjà traité.")),
    );
    show(TYPES.annual);
    fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(
      await screen.findByText("Quelqu'un d'autre a agi avant vous. La page affiche maintenant l'état actuel."),
    ).toBeInTheDocument();
  });
});

describe("the form after the session ended (UI 3.4)", () => {
  it("restores what was typed after the page is left and reopened", async () => {
    serveRequestForm();
    const first = show(TYPES.annual);
    fillDates();
    setText("Commentaire (facultatif)", "Voyage en famille");
    first.view.unmount();

    show(TYPES.annual);
    expect(await screen.findByText("Nous avons gardé ce que vous aviez saisi. Vérifiez-le avant d'envoyer.")).toBeInTheDocument();
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-11");
    expect(screen.getByLabelText("Commentaire (facultatif)")).toHaveValue("Voyage en famille");
  });

  it("lets the user start again from an empty form", async () => {
    serveRequestForm();
    const first = show(TYPES.annual);
    fillDates();
    first.view.unmount();
    show(TYPES.annual);
    await userEvent.click(await screen.findByRole("button", { name: "Repartir d'un formulaire vide" }));
    expect(screen.getByLabelText("Début")).toHaveValue("");
    expect(screen.queryByText(/Nous avons gardé/)).not.toBeInTheDocument();
  });

  it("keeps nothing once the request is sent", async () => {
    serveRequestForm();
    const first = show(TYPES.annual);
    fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(first.onDone).toHaveBeenCalled());
    first.view.unmount();
    show(TYPES.annual);
    expect(screen.getByLabelText("Début")).toHaveValue("");
  });
});

describe("the form filled by HR for an employee (UI 7.7)", () => {
  it("offers the exception with a mandatory reason and sends both", async () => {
    const calls = serveRequestForm({ draft: { created_by_hr: true, viewer: { relation: "hr", actions: ["edit", "submit", "discard"] } } });
    const { onDone } = show(TYPES.annual, { mode: "hr", employeeId: "emp-owner", formId: "hr:emp-owner:annual" });
    expect(screen.getByText("La demande suit ensuite ses étapes normales.")).toBeInTheDocument();
    fillDates();
    await toggle("Autoriser une exception");
    await waitFor(() => expect(calls.preview.at(-1)).toMatchObject({ employee: "emp-owner", override: true }));
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("Indiquez le motif : il est obligatoire.")).toBeInTheDocument();
    expect(calls.create).toHaveLength(0);

    setText("Motif de l'exception", "Accord de la direction");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(calls.create[0]).toMatchObject({ employee: "emp-owner", override_reason: "Accord de la direction" });
  });

  it("no longer offers the exception once the request exists, and says why", async () => {
    serveRequestForm({ draft: { created_by_hr: true, has_override: true, viewer: { relation: "hr", actions: ["edit", "submit", "discard"] } } });
    server.use(
      http.post("/api/v1/requests/new-1/submit", () =>
        problemResponse(400, "validation", "Prévenez au moins trois jours avant.", [
          { field: "start_date", code: "request.notice", detail: "Prévenez au moins trois jours avant.", params: {} },
        ]),
      ),
    );
    show(TYPES.annual, { mode: "hr", employeeId: "emp-owner", formId: "hr:emp-owner:annual" });
    fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("Prévenez au moins trois jours avant.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Autoriser une exception")).not.toBeInTheDocument();
    expect(
      screen.getByText("L'exception se décide à la création de la demande : elle ne peut plus être changée ici."),
    ).toBeInTheDocument();
  });

  it("does not offer the exception to an employee, nor send one", async () => {
    const calls = serveRequestForm();
    const { onDone } = show(TYPES.annual);
    expect(screen.queryByLabelText("Autoriser une exception")).not.toBeInTheDocument();
    fillDates();
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(calls.create[0]).not.toHaveProperty("override_reason");
    expect(calls.create[0]).not.toHaveProperty("employee");
  });

  it("speaks of the employee's manager, not of yours", async () => {
    serveRequestForm();
    show(TYPES.annual, { mode: "hr", employeeId: "emp-owner", formId: "hr:emp-owner:annual" });
    fillDates();
    expect(await screen.findByText("Son responsable, Sami Ben Ali, puis les RH")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/form/RequestForm.test.tsx`

Expected: FAIL with "Failed to resolve import "./RequestForm"".

- [ ] **Step 5: Write the panel of computed values**

`frontend/src/features/requests/form/PreviewPanel.tsx`:

```tsx
import { formatDate, formatDateTime, formatDays, formatHours } from "@/lib/format";
import { useRequestsText } from "../platform";
import type { Preview, RequestTypeOut } from "../types";
import { chainSentence } from "./chain";

interface PreviewPanelProps {
  type: RequestTypeOut;
  /** Undefined until the server has something to say about the current values. */
  preview: Preview | undefined;
  mode: "me" | "hr";
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className={strong ? "text-section font-semibold" : "text-body"}>{value}</dd>
    </div>
  );
}

/** Everything the system worked out and the user is not asked for (U4). */
export function PreviewPanel({ type, preview, mode }: PreviewPanelProps) {
  const { t, lang } = useRequestsText();
  const amount = (value: string) => (type.unit === "hour" ? formatHours(value, lang) : formatDays(value, lang));
  return (
    <aside aria-label={t("form.computed")} className="self-start rounded-xl border border-border bg-card px-6 py-5">
      <h2 className="text-section font-semibold">{t("form.computed")}</h2>
      {preview ? (
        <dl className="mt-3 flex flex-col gap-3">
          <Row label={t(type.unit === "hour" ? "form.hoursCounted" : "form.daysCounted")} value={amount(preview.quantity)} strong />
          {preview.skipped_days.length > 0 && (
            <Row
              label={t("form.notCounted")}
              value={preview.skipped_days
                .map((day) => t(`form.skipped.${day.reason}`, { date: formatDate(day.date, lang) }))
                .join(" · ")}
            />
          )}
          {preview.balance && (
            <>
              <Row label={t("form.balanceNow")} value={formatDays(preview.balance.now, lang)} />
              <Row label={t("form.balanceOnStart")} value={formatDays(preview.balance.on_start, lang)} />
              <Row label={t("form.balanceAfter")} value={formatDays(preview.balance.after, lang)} />
            </>
          )}
          {preview.usage.event_days_allowed && (
            <Row label={t("form.eventAllowed")} value={formatDays(preview.usage.event_days_allowed, lang)} />
          )}
          {preview.usage.month_hours && <Row label={t("form.monthHours")} value={formatHours(preview.usage.month_hours, lang)} />}
          {preview.usage.cap && (
            <Row
              label={t(`form.cap.${preview.usage.cap.period}`)}
              value={t("form.capValue", { used: amount(preview.usage.cap.used), limit: amount(preview.usage.cap.limit) })}
            />
          )}
          {preview.certificate_due_at && (
            <Row label={t("form.certificateDue")} value={formatDateTime(preview.certificate_due_at, lang)} />
          )}
          <Row label={t("form.whoDecides")} value={chainSentence(preview.chain, t, mode)} />
        </dl>
      ) : (
        <p className="mt-2 text-body text-muted-foreground">{t("form.computedEmpty")}</p>
      )}
      {type.is_sensitive && <p className="mt-3 text-caption text-muted-foreground">{t("form.sensitiveNote")}</p>}
    </aside>
  );
}
```

- [ ] **Step 6: Write the form**

`frontend/src/features/requests/form/FieldError.tsx`:

```tsx
import { useFormState, type Control, type FieldPath, type FieldValues } from "react-hook-form";

interface FieldErrorProps<T extends FieldValues> {
  control: Control<T>;
  /** A top-level field of the form. */
  name: FieldPath<T>;
}

/**
 * The error of an input that does not show its own. Plan 01b's `SwitchField` has no error line,
 * so a problem with a switch is shown by this, next to it (U5).
 */
export function FieldError<T extends FieldValues>({ control, name }: FieldErrorProps<T>) {
  const { errors } = useFormState({ control, name });
  const message = (errors as unknown as Record<string, { message?: unknown } | undefined>)[name]?.message;
  if (typeof message !== "string" || message === "") return null;
  return <p className="text-caption font-medium text-refused">{message}</p>;
}
```

`frontend/src/features/requests/form/RequestForm.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ProblemError, type FieldProblem } from "@/api/problem";
import { DateField, FileField, FormSummary, SelectField, SwitchField, TextAreaField, TimeField } from "@/components";
import { Button } from "@/components/ui/button";
import { refreshRequests, requestsApi, useEvents, usePreview } from "../api";
import { useRequestsText, useViewer } from "../platform";
import { details, serverProblems } from "../problems";
import type { PreviewBody, RequestDetail, RequestTypeOut } from "../types";
import { useDraftKeeper } from "./draftKeeper";
import { FieldError } from "./FieldError";
import { PreviewPanel } from "./PreviewPanel";
import { fieldFor, FORM_FIELDS, type FormField } from "./problemFields";
import { buildSchema, EMPTY, fromRequest, previewReady, toFields, visibleFields, type FormValues } from "./schema";
import { useDebounced } from "./useDebounced";
import { useSingleFlight } from "./useSingleFlight";

export interface RequestFormProps {
  type: RequestTypeOut;
  /** "me": an employee for themselves. "hr": HR for an employee, with the exception choice. */
  mode: "me" | "hr";
  /** Names this form for the keeper of unsent values. Also pass it as the React `key`. */
  formId: string;
  /** In "hr" mode, the employee the request is for. */
  employeeId?: string;
  /** The request being edited: a draft, one sent back, or a pending one nobody decided. */
  existing?: RequestDetail;
  /** Pre-fills both dates (a day chosen on the calendar). */
  initialDate?: string;
  onDone: (result: { request: RequestDetail; sent: boolean }) => void;
  onCancel: () => void;
}

interface Failure {
  loose: FieldProblem[];
  codes: string[];
}

const NO_FAILURE: Failure = { loose: [], codes: [] };

interface PreviewContext {
  employeeId: string | undefined;
  /** The request these values belong to, once it exists. */
  requestId: string | undefined;
  override: boolean;
}

function previewBodyOf(values: FormValues, type: RequestTypeOut, { employeeId, requestId, override }: PreviewContext): PreviewBody {
  const fields = toFields(values, type);
  return {
    type: type.code,
    ...(employeeId ? { employee: employeeId } : {}),
    ...(requestId ? { request: requestId } : {}),
    start_date: fields.start_date,
    end_date: fields.end_date,
    starts_at_midday: fields.starts_at_midday,
    ends_at_midday: fields.ends_at_midday,
    start_time: fields.start_time,
    end_time: fields.end_time,
    exceptional_event: fields.exceptional_event,
    override,
  };
}

export function RequestForm({ type, mode, formId, employeeId, existing, initialDate, onDone, onCancel }: RequestFormProps) {
  const { t } = useRequestsText();
  const viewer = useViewer();
  const qc = useQueryClient();

  // The form starts from the request as it was when the page opened; a later refetch never overwrites typing.
  const [initial] = useState<FormValues>(() =>
    existing ? fromRequest(existing) : { ...EMPTY, start_date: initialDate ?? "", end_date: initialDate ?? "" },
  );
  const schema = useMemo(() => buildSchema(type, t), [type, t]);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initial });
  const keeper = useDraftKeeper(viewer.publicId, formId, form);
  const watched = useWatch({ control: form.control });
  const values = useMemo(() => ({ ...EMPTY, ...watched }) as FormValues, [watched]);

  const [saved, setSaved] = useState(existing ? { id: existing.public_id, version: existing.version } : null);
  const [failure, setFailure] = useState<Failure>(NO_FAILURE);

  const events = useEvents(type.uses_events);
  const offeredEvents = (events.data ?? []).filter(
    (event) => event.is_active || String(event.id) === values.exceptional_event,
  );
  const proofRequired = offeredEvents.find((event) => String(event.id) === values.exceptional_event)?.proof_required ?? false;
  const isHr = mode === "hr";
  // HR chooses the exception until the request exists; from then on it is the request's own.
  const canChooseOverride = isHr && saved === null;
  const override = existing ? existing.has_override : isHr && values.override;
  const visible = useMemo(
    () => visibleFields(type, { hr: canChooseOverride, override: values.override, proofRequired }),
    [type, canChooseOverride, values.override, proofRequired],
  );

  // ---- what the server computes for the current values
  const ready = previewReady(values, type);
  const previewKey = ready
    ? JSON.stringify(previewBodyOf(values, type, { employeeId, requestId: saved?.id, override }))
    : "";
  const settledKey = useDebounced(previewKey, 300);
  const preview = usePreview(settledKey === "" ? null : (JSON.parse(settledKey) as PreviewBody));
  const previewIsCurrent =
    previewKey !== "" && previewKey === settledKey && preview.isSuccess && !preview.isPlaceholderData;
  const previewProblems = previewIsCurrent && preview.data ? preview.data.problems : null;

  /** Puts each problem on its input and clears server problems that no longer apply. */
  const showOnFields = useCallback(
    (problems: FieldProblem[]) => {
      const shown = new Set<FormField>();
      for (const problem of problems) {
        const field = fieldFor(problem, visible);
        if (field === null) continue;
        shown.add(field);
        form.setError(field, { type: `server:${problem.code}`, message: problem.detail });
      }
      for (const field of FORM_FIELDS) {
        const kind = form.getFieldState(field).error?.type;
        if (!shown.has(field) && typeof kind === "string" && kind.startsWith("server:")) form.clearErrors(field);
      }
    },
    [form, visible],
  );

  useEffect(() => {
    if (previewProblems !== null) showOnFields(previewProblems);
  }, [previewProblems, showOnFields]);

  // A change to any value makes the last failed attempt irrelevant.
  useEffect(() => {
    const subscription = form.watch(() => setFailure(NO_FAILURE));
    return () => subscription.unsubscribe();
  }, [form]);

  const previewLoose = useMemo(
    () => (previewProblems ?? []).filter((problem) => fieldFor(problem, visible) === null),
    [previewProblems, visible],
  );
  const codes = [...failure.codes, ...(previewProblems ?? []).map((problem) => problem.code)];

  // ---- saving and sending
  function showFailure(error: unknown) {
    setFailure({
      loose: serverProblems(form, error, t, (problem) => fieldFor(problem, visible)),
      codes: error instanceof ProblemError ? error.errors.map((problem) => problem.code) : [],
    });
  }

  async function persist(current: FormValues): Promise<RequestDetail> {
    const fields = toFields(current, type);
    const reason = isHr && current.override ? { override_reason: current.override_reason.trim() } : {};
    let request = saved
      ? await requestsApi.update(saved.id, { ...fields, version: saved.version })
      : await requestsApi.create({ type: type.code, ...(employeeId ? { employee: employeeId } : {}), ...fields, ...reason });
    setSaved({ id: request.public_id, version: request.version });
    if (current.file) {
      await requestsApi.attach(request.public_id, current.file);
      form.setValue("file", null);
      request = await requestsApi.detail(request.public_id);
      setSaved({ id: request.public_id, version: request.version });
    }
    return request;
  }

  const [send, sending] = useSingleFlight(async (current: FormValues) => {
    if (previewProblems !== null && previewProblems.length > 0) {
      // The server already said these values cannot be sent: show why again, on the field, and send nothing.
      showOnFields(previewProblems);
      const first = previewProblems
        .map((problem) => fieldFor(problem, visible))
        .find((field): field is FormField => field !== null);
      if (first) form.setFocus(first);
      return;
    }
    try {
      let request = await persist(current);
      if (request.viewer.actions.includes("submit")) {
        request = await requestsApi.submit(request.public_id, request.version);
      }
      keeper.clear();
      await refreshRequests(qc);
      onDone({ request, sent: true });
    } catch (error) {
      showFailure(error);
      await refreshRequests(qc);
    }
  });

  const [saveForLater, saving] = useSingleFlight(async (current: FormValues) => {
    try {
      const request = await persist(current);
      keeper.clear();
      await refreshRequests(qc);
      onDone({ request, sent: false });
    } catch (error) {
      showFailure(error);
      await refreshRequests(qc);
    }
  });

  function startOver() {
    keeper.clear();
    form.reset(initial);
  }

  function cancel() {
    keeper.clear();
    onCancel();
  }

  const status = existing?.status;
  const primaryLabel = status === "pending" ? t("form.saveChanges") : status === "returned" ? t("form.sendAgain") : t("common.send");

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(send)}
      aria-busy={sending || saving}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
    >
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card px-6 py-5">
        {keeper.restored && (
          <p role="status" className="rounded-md border border-[var(--info-border)] bg-info-bg px-3 py-2 text-body text-info">
            {t("keeper.restored")}{" "}
            <Button type="button" variant="link" onClick={startOver}>
              {t("keeper.startOver")}
            </Button>
          </p>
        )}
        <FormSummary problems={details([...failure.loose, ...previewLoose])} />

        {type.unit === "day" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <DateField control={form.control} name="start_date" label={t("form.start")} />
              <DateField control={form.control} name="end_date" label={t("form.end")} />
            </div>
            {visible.has("starts_at_midday") && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SwitchField control={form.control} name="starts_at_midday" label={t("form.startsAtMidday")} />
                  <SwitchField control={form.control} name="ends_at_midday" label={t("form.endsAtMidday")} />
                </div>
                <FieldError control={form.control} name="starts_at_midday" />
                <FieldError control={form.control} name="ends_at_midday" />
              </>
            )}
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <DateField control={form.control} name="start_date" label={t("form.date")} />
            <TimeField control={form.control} name="start_time" label={t("form.from")} />
            <TimeField control={form.control} name="end_time" label={t("form.to")} />
          </div>
        )}

        {visible.has("exceptional_event") && (
          <SelectField
            control={form.control}
            name="exceptional_event"
            label={t("form.event")}
            placeholder={t("form.eventPlaceholder")}
            options={offeredEvents.map((event) => ({ value: String(event.id), label: event.name }))}
          />
        )}

        <TextAreaField
          control={form.control}
          name="comment"
          label={t("form.comment")}
          optional
          hint={type.is_sensitive ? t("form.commentSensitiveHint") : undefined}
        />

        {visible.has("file") && (
          <FileField
            control={form.control}
            name="file"
            label={t(type.is_sensitive ? "form.certificate" : "form.proof")}
            hint={t(type.document_rule === "required_within_deadline" ? "form.fileLaterHint" : "form.fileHint")}
            accept=".pdf,.jpg,.jpeg,.png"
          />
        )}

        {canChooseOverride && (
          <>
            <SwitchField control={form.control} name="override" label={t("form.override")} hint={t("form.overrideHint")} />
            {values.override && <TextAreaField control={form.control} name="override_reason" label={t("form.overrideReason")} />}
          </>
        )}
        {isHr && !canChooseOverride && <p className="text-caption text-muted-foreground">{t("form.overrideFixed")}</p>}
        {isHr && <p className="text-caption text-muted-foreground">{t("form.followsSteps")}</p>}

        {codes.includes("request.balance_insufficient") && (
          <p className="text-body text-text-secondary">{t(isHr ? "form.balanceHintHr" : "form.balanceHint")}</p>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" variant="primary" aria-busy={sending}>
            {sending ? t("form.sending") : primaryLabel}
          </Button>
          {status !== "pending" && (
            <Button type="button" variant="secondary" aria-busy={saving} onClick={form.handleSubmit(saveForLater)}>
              {t("form.saveForLater")}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={cancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>

      <PreviewPanel type={type} preview={ready ? preview.data : undefined} mode={mode} />
    </form>
  );
}
```

- [ ] **Step 7: Run the form tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/form/RequestForm.test.tsx`

Expected: PASS, 31 tests.

Two things to check if a test fails for a reason other than a typo:

- "a double click on Send creates one request" fails with two `POST /requests`: the guard of `useSingleFlight` must be the `busy` ref, set synchronously at the start of the call, not the `pending` state.
- "restores what was typed" shows empty inputs: `useDraftKeeper` must run after `useForm` and before the first `useWatch` read, as above, and the form must be rendered with `key={formId}`.

- [ ] **Step 8: Write the failing test of the page**

`frontend/src/features/requests/form/NewRequestPage.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeMe } from "@/test/fixtures";
import { setDate } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makeType, TYPES } from "@/features/requests/fixtures";
import { serveRequestForm } from "@/test/requestServer";
import NewRequestPage from "./NewRequestPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
  NotAvailable: () => <p>indisponible</p>,
}));

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });
const open = (route: string) => renderApp(<NewRequestPage />, { route, path: "/me/requests/new", me });

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(toast).mockClear();
});

describe("New request (UI 5.3)", () => {
  it("starts with the choice of the type", async () => {
    serveRequestForm();
    open("/me/requests/new");
    expect(screen.getByRole("heading", { name: "Quel type de demande ?" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Congé annuel/ })).toHaveAttribute("href", "/me/requests/new?type=annual");
    expect(screen.queryByRole("button", { name: "Envoyer" })).not.toBeInTheDocument();
  });

  it("keeps the day chosen on the calendar through the choice of the type", async () => {
    serveRequestForm();
    open("/me/requests/new?date=2026-11-09");
    expect(await screen.findByRole("link", { name: /Congé annuel/ })).toHaveAttribute(
      "href",
      "/me/requests/new?date=2026-11-09&type=annual",
    );
  });

  it("then shows the form of that type, with one primary action", async () => {
    serveRequestForm();
    open("/me/requests/new?type=annual&date=2026-11-09");
    expect(await screen.findByRole("heading", { name: "Congé annuel" })).toBeInTheDocument();
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-09");
    expect(screen.getAllByRole("button", { name: "Envoyer" })).toHaveLength(1);
  });

  it("is not available for a type that does not exist or is no longer offered", async () => {
    serveRequestForm({ types: [TYPES.annual, makeType("remote", { is_active: false })] });
    open("/me/requests/new?type=remote");
    expect(await screen.findByText("indisponible")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Envoyer" })).not.toBeInTheDocument();
  });

  it("goes to the request once sent and says so", async () => {
    serveRequestForm();
    open("/me/requests/new?type=annual");
    await screen.findByLabelText("Début");
    setDate("Début", "2026-11-09");
    setDate("Fin", "2026-11-11");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/new-1"));
    expect(toast).toHaveBeenCalledWith("Demande envoyée.");
  });

  it("goes back to the list once saved for later", async () => {
    serveRequestForm();
    open("/me/requests/new?type=annual");
    await screen.findByLabelText("Début");
    setDate("Début", "2026-11-09");
    setDate("Fin", "2026-11-11");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer pour plus tard" }));
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests"));
    expect(toast).toHaveBeenCalledWith("Brouillon enregistré.");
  });

  it("goes back to the list on cancel", async () => {
    serveRequestForm();
    open("/me/requests/new?type=annual");
    await userEvent.click(await screen.findByRole("button", { name: "Annuler" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests");
  });
});
```

- [ ] **Step 9: Run it to see it fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/form/NewRequestPage.test.tsx`

Expected: FAIL with "Failed to resolve import "./NewRequestPage"".

- [ ] **Step 10: Write the page and register its route**

`frontend/src/features/requests/form/NewRequestPage.tsx`:

```tsx
import { useNavigate, useSearchParams } from "react-router";
import { NotAvailable, PageHeader, toast } from "@/components";
import { useRequestTypes } from "../api";
import { Gate } from "../Gate";
import { useRequestsText } from "../platform";
import { RequestForm } from "./RequestForm";
import { TypeChoice } from "./TypeChoice";

/** /me/requests/new : step one without `?type=`, step two with it. `?date=` pre-fills the dates. */
export default function NewRequestPage() {
  const { t } = useRequestsText();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const types = useRequestTypes();
  const code = search.get("type");
  const date = search.get("date") ?? undefined;

  if (!code) {
    const hrefFor = (chosen: string) => {
      const next = new URLSearchParams(search);
      next.set("type", chosen);
      return `/me/requests/new?${next.toString()}`;
    };
    return (
      <>
        <PageHeader title={t("choice.title")} back="/me/requests" />
        <TypeChoice hrefFor={hrefFor} />
      </>
    );
  }

  return (
    <Gate query={types}>
      {(all) => {
        const type = all.find((item) => item.code === code && item.is_active);
        if (!type) return <NotAvailable />;
        const formId = `new:${type.code}`;
        return (
          <>
            <PageHeader title={t("form.title", { type: type.name })} back="/me/requests/new" />
            <RequestForm
              key={formId}
              type={type}
              mode="me"
              formId={formId}
              initialDate={date}
              onDone={({ request, sent }) => {
                toast(t(sent ? "form.sent" : "form.saved"));
                navigate(sent ? `/me/requests/${request.public_id}` : "/me/requests");
              }}
              onCancel={() => navigate("/me/requests")}
            />
          </>
        );
      }}
    </Gate>
  );
}
```

In `frontend/src/workspaces/me/routes.tsx`, add the import and append one element to the `meRoutes` array:

```tsx
import NewRequestPage from "@/features/requests/form/NewRequestPage";
```

```tsx
  { path: "requests/new", element: <NewRequestPage /> },
```

- [ ] **Step 11: Run every test of the task, the type check and the lint**

Run: `docker compose run --rm web npx vitest run src/features/requests/form src/i18n/parity.test.ts`

Expected: PASS.

Run: `docker compose run --rm web npm run typecheck` then `docker compose run --rm web npm run lint`

Expected: no error.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/features/requests/form frontend/src/test/requestServer.ts frontend/src/workspaces/me/routes.tsx frontend/src/i18n/locales
git commit -m "feat(requests): the request form with live preview, messages and safe sending"
```

---

### Task 6: Editing a draft, a request sent back, and a pending request nobody decided

UI 5.3: "The same form serves editing a draft, a request sent back (showing who sent it back and why), and a request nobody has decided yet." The page is allowed only when the API lists `edit` among `viewer.actions` (REQ-07).

**Files:**
- Create: `frontend/src/features/requests/form/EditRequestPage.tsx`
- Modify: `frontend/src/workspaces/me/routes.tsx` (append one route)
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (section `edit`)
- Test: `frontend/src/features/requests/form/EditRequestPage.test.tsx`

**Interfaces:**
- Consumes: `RequestForm` (Task 5), `useRequest`, `useRequestTypes` (Task 1), `Gate`, `serveRequestForm` (Task 5).
- Produces: `EditRequestPage({ mode?: "me" | "hr" })` (default export), mounted at `/me/requests/:id/edit` here and at `/hr/requests/:id/edit` in Task 15.

| State of the request | Primary action | Also offered | What the primary action does |
|---|---|---|---|
| `draft` | Send | Save for later, Cancel | `PATCH`, upload, `submit` |
| `returned` | Send again | Save for later, Cancel | `PATCH`, upload, `submit` (the chain restarts, REQ-06) |
| `pending`, nobody decided | Save the changes | Cancel | `PATCH`, upload |

While a request is being edited, the form asks for the preview with `request: <its public id>` (plan 03a, contract note 8), so that a request already sent does not overlap itself or count twice against a limit.

A draft is seen by the account that created it only, and a request HR entered with an exception is edited by HR, not by the employee (plan 03a, notes 17 and 18). Both arrive here through `viewer.actions`: without `edit`, the page returns to the request.

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "edit": {
    "title": "Modifier : {{type}}",
    "returnedBy": "Renvoyée par {{who}} : {{note}}",
    "returnedByNoNote": "Renvoyée par {{who}}.",
    "someone": "un approbateur",
    "typeGone": "Ce type de demande n'existe plus.",
    "typeGoneHint": "La demande ne peut plus être modifiée ici. Les RH peuvent la corriger.",
    "backToRequest": "Revenir à la demande"
  }
```

English:

```json
  "edit": {
    "title": "Edit: {{type}}",
    "returnedBy": "Sent back by {{who}}: {{note}}",
    "returnedByNoNote": "Sent back by {{who}}.",
    "someone": "an approver",
    "typeGone": "This kind of request no longer exists.",
    "typeGoneHint": "The request can no longer be edited here. HR can correct it.",
    "backToRequest": "Back to the request"
  }
```

- [ ] **Step 2: Write the failing test**

`frontend/src/features/requests/form/EditRequestPage.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeMe } from "@/test/fixtures";
import { setDate } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makePreview, problemResponse, TYPES, type DetailOverrides } from "@/features/requests/fixtures";
import { serveRequestForm } from "@/test/requestServer";
import { server } from "@/test/server";
import EditRequestPage from "./EditRequestPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
  NotAvailable: () => <p>indisponible</p>,
}));

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });
const open = () => renderApp(<EditRequestPage />, { route: "/me/requests/req-1/edit", path: "/me/requests/:id/edit", me });

const draft: DetailOverrides = { public_id: "req-1", comment: "Voyage" };
const returned: DetailOverrides = {
  public_id: "req-1",
  status: "returned",
  state: { key: "returned", waiting_on: [], last_actor: "Sami Ben Ali", note: "Décalez à la semaine suivante" },
  viewer: { actions: ["edit", "submit", "withdraw"] },
};
const pending: DetailOverrides = {
  public_id: "req-1",
  status: "pending",
  state: { key: "waiting_manager", waiting_on: ["Sami Ben Ali"] },
  viewer: { actions: ["edit", "withdraw"] },
  submitted_at: "2026-10-28T09:12:00+01:00",
};

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(toast).mockClear();
});

describe("Editing a request (UI 5.3)", () => {
  it("opens a draft with its values and sends it", async () => {
    const calls = serveRequestForm({ draft });
    open();
    expect(await screen.findByRole("heading", { name: "Modifier : Congé annuel" })).toBeInTheDocument();
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-11");
    expect(screen.getByLabelText("Commentaire (facultatif)")).toHaveValue("Voyage");

    setDate("Fin", "2026-11-12");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/req-1"));
    expect(calls.create).toHaveLength(0);
    expect(calls.update[0]).toMatchObject({ version: 1, end_date: "2026-11-12", comment: "Voyage" });
    expect(calls.submit).toEqual([{ version: 2 }]);
    expect(toast).toHaveBeenCalledWith("Demande envoyée.");
  });

  it("shows who sent the request back and why, and sends it again", async () => {
    const calls = serveRequestForm({ draft: returned });
    open();
    expect(await screen.findByText("Renvoyée par Sami Ben Ali : Décalez à la semaine suivante")).toBeInTheDocument();
    setDate("Début", "2026-11-16");
    setDate("Fin", "2026-11-18");
    await userEvent.click(screen.getByRole("button", { name: "Renvoyer" }));
    await waitFor(() => expect(calls.submit).toHaveLength(1));
    expect(calls.update[0]).toMatchObject({ start_date: "2026-11-16", end_date: "2026-11-18" });
  });

  it("saves the changes of a pending request without submitting it again", async () => {
    const calls = serveRequestForm({ draft: pending });
    open();
    await screen.findByLabelText("Début");
    expect(screen.queryByRole("button", { name: "Enregistrer pour plus tard" })).not.toBeInTheDocument();
    setDate("Fin", "2026-11-10");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/req-1"));
    expect(calls.update).toHaveLength(1);
    expect(calls.submit).toHaveLength(0);
    expect(toast).toHaveBeenCalledWith("Modifications enregistrées.");
  });

  it("asks for the preview with the request's own id, so that it does not collide with itself", async () => {
    const calls = serveRequestForm({ draft: pending });
    open();
    await screen.findByLabelText("Début");
    setDate("Fin", "2026-11-10");
    await waitFor(() => expect(calls.preview.at(-1)).toMatchObject({ request: "req-1", end_date: "2026-11-10" }));
    expect(await screen.findByText("Votre responsable, Sami Ben Ali, puis les RH")).toBeInTheDocument();
  });

  it("shows a problem of the preview on its field, as for a new request", async () => {
    serveRequestForm({
      draft: pending,
      preview: makePreview({
        problems: [
          { field: "start_date", code: "request.overlap", detail: "Ces dates chevauchent votre télétravail du 12 novembre.", params: {} },
        ],
      }),
    });
    open();
    await screen.findByLabelText("Début");
    setDate("Fin", "2026-11-12");
    expect(await screen.findByText("Ces dates chevauchent votre télétravail du 12 novembre.")).toBeInTheDocument();
  });

  it("still shows what the server refuses when the changes are saved", async () => {
    serveRequestForm({ draft: pending });
    server.use(
      http.patch("/api/v1/requests/req-1", () =>
        problemResponse(400, "validation", "Ces dates chevauchent votre télétravail du 12 novembre.", [
          { field: "start_date", code: "request.overlap", detail: "Ces dates chevauchent votre télétravail du 12 novembre.", params: {} },
        ]),
      ),
    );
    open();
    await screen.findByLabelText("Début");
    setDate("Fin", "2026-11-12");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));
    expect(await screen.findByText("Ces dates chevauchent votre télétravail du 12 novembre.")).toBeInTheDocument();
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-12");
  });

  it("goes back to the request when it can no longer be edited", async () => {
    serveRequestForm({ draft: { ...pending, viewer: { actions: ["withdraw"] } } });
    open();
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/req-1"));
  });

  it("says so when the kind of request no longer exists", async () => {
    serveRequestForm({ draft, types: [TYPES.sick] });
    open();
    expect(await screen.findByText("Ce type de demande n'existe plus.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Revenir à la demande" })).toHaveAttribute("href", "/me/requests/req-1");
  });

  it("is not available for a request outside the viewer's reach", async () => {
    serveRequestForm({ draft });
    server.use(http.get("/api/v1/requests/req-1", () => problemResponse(404, "core.not_found", "Introuvable.")));
    open();
    expect(await screen.findByText("indisponible")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/form/EditRequestPage.test.tsx`

Expected: FAIL with "Failed to resolve import "./EditRequestPage"".

- [ ] **Step 4: Write the page and register its route**

`frontend/src/features/requests/form/EditRequestPage.tsx`:

```tsx
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { EmptyState, PageHeader, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { useRequest, useRequestTypes } from "../api";
import { Gate } from "../Gate";
import { useRequestsText } from "../platform";
import { RequestForm } from "./RequestForm";

interface EditRequestPageProps {
  /** The workspace the page is mounted in: "me" for one's own request, "hr" for a draft HR entered. */
  mode?: "me" | "hr";
}

/** /<workspace>/requests/:id/edit : the form of Task 5, opened on an existing request. */
export default function EditRequestPage({ mode = "me" }: EditRequestPageProps) {
  const { t } = useRequestsText();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const request = useRequest(id);
  const types = useRequestTypes();
  const requestPage = `/${mode}/requests/${id}`;

  return (
    <Gate query={request}>
      {(current) => (
        <Gate query={types}>
          {(all) => {
            if (!current.viewer.actions.includes("edit")) return <Navigate to={requestPage} replace />;
            const type = all.find((item) => item.code === current.type.code);
            if (!type) {
              return (
                <EmptyState
                  title={t("edit.typeGone")}
                  hint={t("edit.typeGoneHint")}
                  action={
                    <Button asChild variant="secondary">
                      <Link to={requestPage}>{t("edit.backToRequest")}</Link>
                    </Button>
                  }
                />
              );
            }
            const formId = `edit:${current.public_id}`;
            const who = current.state.last_actor ?? t("edit.someone");
            return (
              <>
                <PageHeader title={t("edit.title", { type: current.type.name })} back={requestPage} />
                {current.status === "returned" && (
                  <p role="status" className="mb-4 rounded-md border border-[var(--info-border)] bg-info-bg px-3 py-2 text-body text-info">
                    {current.state.note
                      ? t("edit.returnedBy", { who, note: current.state.note })
                      : t("edit.returnedByNoNote", { who })}
                  </p>
                )}
                <RequestForm
                  key={formId}
                  type={type}
                  mode={mode}
                  formId={formId}
                  existing={current}
                  employeeId={mode === "hr" ? current.employee.public_id : undefined}
                  onDone={({ request: saved, sent }) => {
                    const message = current.status === "pending" ? "form.changed" : sent ? "form.sent" : "form.saved";
                    toast(t(message));
                    navigate(sent ? `/${mode}/requests/${saved.public_id}` : `/${mode}/requests`);
                  }}
                  onCancel={() => navigate(requestPage)}
                />
              </>
            );
          }}
        </Gate>
      )}
    </Gate>
  );
}
```

In `frontend/src/workspaces/me/routes.tsx`, add the import and append one element to `meRoutes`:

```tsx
import EditRequestPage from "@/features/requests/form/EditRequestPage";
```

```tsx
  { path: "requests/:id/edit", element: <EditRequestPage /> },
```

- [ ] **Step 5: Run the test to see it pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/form/EditRequestPage.test.tsx src/i18n/parity.test.ts`

Expected: PASS, 9 tests in the page file.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/requests/form frontend/src/workspaces/me/routes.tsx frontend/src/i18n/locales
git commit -m "feat(requests): edit a draft, a returned request and an undecided pending one"
```

---

### Task 7: My space, Requests: the list, its filters, discard with undo

**Files:**
- Create: `frontend/src/features/requests/undoable.ts`
- Create: `frontend/src/features/requests/lists/filters.tsx`
- Create: `frontend/src/features/requests/lists/RequestsList.tsx`
- Create: `frontend/src/features/requests/mine/MyRequestsPage.tsx`
- Modify: `frontend/src/workspaces/me/routes.tsx` (append one route)
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (sections `list`, `filters`, `undo`)
- Test: `frontend/src/features/requests/undoable.test.ts`
- Test: `frontend/src/features/requests/mine/MyRequestsPage.test.tsx`

**Interfaces:**
- Consumes: `useRequestList`, `useRequestTypes`, `useDepartmentOptions`, `requestsApi`, `refreshRequests`, `isConflict` (Task 1); `StatusSentence`, `TypeTag`, `describeWhen`, `describeQuantity` (Task 2); `DataTable`, `Column`, `FilterBar`, `FilterSelect`, `FilterDateRange`, `Pager`, `useListParams`, `PageHeader`, `EmptyState`, `StatusBadge`, `SomethingWentWrong`, `toast` from `@/components`; `todayISO` from `@/lib/dates`; `EmployeePicker` (plan 02).
- Produces:
  - `undoable.ts`: `type PendingKind = "discard" | "withdraw"`, `undoConfig: { delayMs: number }`, `schedule(id, kind, commit)`, `undo(id)`, `flushPending()`, `clearPending()`, `usePendingActions(): ReadonlyMap<string, PendingKind>`, `useUndoable(): { discard(request: RequestOut): void; withdraw(request: RequestOut): void }`.
  - `lists/filters.tsx`: `type FilterName = "status" | "type" | "year" | "employee" | "period" | "department" | "on_behalf" | "has_override"`, `FILTER_DEFAULTS` (the query parameters of `GET requests`: `status`, `type`, `year`, `employee`, `from`, `to`, `department`, `on_behalf`, `has_override`), `type FilterValues`, `RequestFilter({ name, values, set })`.
  - `lists/RequestsList.tsx`: `type ListColumn = "who" | "department" | "type" | "when" | "quantity" | "status"`, `RequestsList({ scope, columns, filters, moreFilters?, fixed?, empty, rowExtra?, label? })`. The first column is the button that opens the request, so it is plain text: a name, or the name of the type. Used by Tasks 12, 15, 18 and 19.
  - `MyRequestsPage` (default export) at `/me/requests`.

Undo (U6): discarding a draft and withdrawing a request are announced at once by plan 01b's `toast(message, { undo })`, which offers to take the action back for five seconds. The call to the server is made when that time has passed, or at once if the page is being left. Until then the row is hidden (discard) or reads "Withdrawn by you" (withdraw). If the server answers that it is too late, the user is told and the list shows the real state.

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "list": {
    "mine": {
      "title": "Mes demandes",
      "empty": "Aucune demande ici.",
      "emptyHint": "Changez les filtres, ou créez votre première demande avec « Nouvelle demande »."
    }
  },
  "filters": {
    "statusLabel": "Situation",
    "typeLabel": "Type",
    "yearLabel": "Année",
    "employee": "Personne",
    "period": "Période",
    "department": "Département",
    "onBehalf": "Saisies par les RH",
    "hasOverride": "Avec une exception",
    "status": {
      "draft": "Pas encore envoyées",
      "pending": "En attente",
      "returned": "Renvoyées",
      "approved": "Approuvées",
      "rejected": "Refusées",
      "withdrawn": "Retirées",
      "cancelled": "Annulées"
    }
  },
  "undo": {
    "discard": "Brouillon supprimé.",
    "withdraw": "Demande retirée.",
    "tooLate": "Trop tard : la demande avait déjà été traitée. Voici son état actuel."
  }
```

English:

```json
  "list": {
    "mine": {
      "title": "My requests",
      "empty": "No request here.",
      "emptyHint": "Change the filters, or create your first request with \"New request\"."
    }
  },
  "filters": {
    "statusLabel": "Status",
    "typeLabel": "Type",
    "yearLabel": "Year",
    "employee": "Person",
    "period": "Period",
    "department": "Department",
    "onBehalf": "Entered by HR",
    "hasOverride": "With an exception",
    "status": {
      "draft": "Not sent yet",
      "pending": "Waiting",
      "returned": "Sent back",
      "approved": "Approved",
      "rejected": "Refused",
      "withdrawn": "Withdrawn",
      "cancelled": "Cancelled"
    }
  },
  "undo": {
    "discard": "Draft discarded.",
    "withdraw": "Request withdrawn.",
    "tooLate": "Too late: the request had already been dealt with. Here is where it stands now."
  }
```

- [ ] **Step 2: Write the failing tests**

`frontend/src/features/requests/undoable.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPending, flushPending, schedule, undo, undoConfig } from "./undoable";

beforeEach(() => {
  vi.useFakeTimers();
  undoConfig.delayMs = 5000;
});

afterEach(() => {
  clearPending();
  vi.useRealTimers();
});

describe("actions that wait for an undo (U6)", () => {
  it("commits once the delay has passed", async () => {
    const commit = vi.fn(async () => undefined);
    schedule("req-1", "discard", commit);
    await vi.advanceTimersByTimeAsync(4999);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("commits nothing when undone in time", async () => {
    const commit = vi.fn(async () => undefined);
    schedule("req-1", "withdraw", commit);
    await vi.advanceTimersByTimeAsync(3000);
    undo("req-1");
    await vi.advanceTimersByTimeAsync(10000);
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits at once what is still waiting when the page is left", async () => {
    const first = vi.fn(async () => undefined);
    const second = vi.fn(async () => undefined);
    schedule("req-1", "discard", first);
    schedule("req-2", "withdraw", second);
    flushPending();
    await vi.advanceTimersByTimeAsync(0);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("flushes on pagehide", async () => {
    const commit = vi.fn(async () => undefined);
    schedule("req-1", "discard", commit);
    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(0);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("keeps one pending action per request", async () => {
    const first = vi.fn(async () => undefined);
    const second = vi.fn(async () => undefined);
    schedule("req-1", "discard", first);
    schedule("req-1", "discard", second);
    await vi.advanceTimersByTimeAsync(5000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
```

`frontend/src/features/requests/mine/MyRequestsPage.test.tsx`:

```tsx
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeMe } from "@/test/fixtures";
import { chooseOption } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makeRequest, paginated, TYPES } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import type { RequestOut } from "../types";
import { clearPending, undoConfig } from "../undoable";
import MyRequestsPage from "./MyRequestsPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });

const waiting = makeRequest();
const draft = makeRequest({
  public_id: "draft-1",
  status: "draft",
  start_date: "2026-12-01",
  end_date: "2026-12-02",
  quantity: "2.00",
  state: { key: "draft", waiting_on: [] },
  viewer: { actions: ["edit", "submit", "discard"] },
});
const remote = makeRequest({
  public_id: "req-2",
  type: { code: "remote", name: "Télétravail", calendar_label: "remote" },
  start_date: "2026-11-20",
  end_date: "2026-11-20",
  quantity: "1.00",
  status: "approved",
  state: { key: "approved", waiting_on: [] },
  viewer: { actions: ["amend"] },
});

function serve(rows: RequestOut[] = [waiting, draft, remote]) {
  const seen = { searches: [] as URLSearchParams[], deletes: [] as string[] };
  server.use(
    http.get("/api/v1/requests", ({ request }) => {
      seen.searches.push(new URL(request.url).searchParams);
      return HttpResponse.json(paginated(rows.filter((row) => !seen.deletes.includes(row.public_id))));
    }),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.delete("/api/v1/requests/:id", ({ params }) => {
      seen.deletes.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return seen;
}

const open = (route = "/me/requests") => renderApp(<MyRequestsPage />, { route, path: "/me/requests", me });

beforeEach(() => {
  undoConfig.delayMs = 30;
  vi.mocked(toast).mockClear();
});

afterEach(() => {
  clearPending();
  undoConfig.delayMs = 5000;
});

describe("My space, Requests (UI 5.2)", () => {
  it("shows each request with its type, dates, length and where it stands", async () => {
    const seen = serve();
    open();
    expect(await screen.findByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(screen.getByText("3 j")).toBeInTheDocument();
    expect(screen.getByText("En attente de Sami Ben Ali")).toBeInTheDocument();
    expect(screen.getByText("Pas encore envoyée")).toBeInTheDocument();
    expect(screen.getByText("D(2026-11-20)")).toBeInTheDocument();
    expect(screen.getByText("Approuvée")).toBeInTheDocument();
    expect(seen.searches[0].get("scope")).toBe("mine");
  });

  it("has one primary action, New request", async () => {
    serve();
    open();
    await screen.findByText("En attente de Sami Ben Ali");
    expect(screen.getByRole("link", { name: "Nouvelle demande" })).toHaveAttribute("href", "/me/requests/new");
  });

  it("filters by status, type and year", async () => {
    const seen = serve();
    open();
    await screen.findByText("En attente de Sami Ben Ali");
    await screen.findByRole("option", { name: "Télétravail" });
    await chooseOption("Situation", "Approuvées");
    await chooseOption("Type", "Télétravail");
    await chooseOption("Année", "2026");
    await waitFor(() => {
      const last = seen.searches.at(-1);
      expect(last?.get("status")).toBe("approved");
      expect(last?.get("type")).toBe("remote");
      expect(last?.get("year")).toBe("2026");
    });
  });

  it("starts from the filters carried by the address", async () => {
    const seen = serve();
    open("/me/requests?status=draft");
    await screen.findByText("Pas encore envoyée");
    expect(seen.searches[0].get("status")).toBe("draft");
    expect(screen.getByLabelText("Situation")).toHaveValue("draft");
  });

  it("opens a request", async () => {
    serve();
    open();
    await screen.findByText("R(2026-11-09..2026-11-11)");
    // The first column is the button that opens the row.
    await userEvent.click(screen.getAllByRole("button", { name: "Congé annuel" })[0]);
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/req-1");
  });

  it("offers to discard a draft only", async () => {
    serve();
    open();
    await screen.findByText("Pas encore envoyée");
    expect(screen.getAllByRole("button", { name: "Supprimer le brouillon" })).toHaveLength(1);
  });

  it("discards a draft: the row leaves at once, the server is told after the undo delay", async () => {
    const seen = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer le brouillon" }));
    expect(screen.queryByText("R(2026-12-01..2026-12-02)")).not.toBeInTheDocument();
    expect(screen.queryByTestId("elsewhere")).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith("Brouillon supprimé.", expect.objectContaining({ undo: expect.any(Function) }));
    expect(seen.deletes).toEqual([]);
    await waitFor(() => expect(seen.deletes).toEqual(["draft-1"]));
  });

  it("undo brings the draft back and nothing is deleted", async () => {
    const seen = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer le brouillon" }));
    const options = vi.mocked(toast).mock.calls[0][1];
    act(() => options?.undo?.());
    expect(await screen.findByText("R(2026-12-01..2026-12-02)")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(seen.deletes).toEqual([]);
  });

  it("says why the list is empty", async () => {
    serve([]);
    open();
    expect(await screen.findByText("Aucune demande ici.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/undoable.test.ts src/features/requests/mine`

Expected: FAIL with "Failed to resolve import "./undoable"" and "Failed to resolve import "./MyRequestsPage"".

- [ ] **Step 4: Write the undo mechanism**

`frontend/src/features/requests/undoable.ts`:

```ts
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { toast } from "@/components";
import { isConflict, refreshRequests, requestsApi } from "./api";
import { useRequestsText } from "./platform";
import type { RequestOut } from "./types";

export type PendingKind = "discard" | "withdraw";

interface Entry {
  kind: PendingKind;
  timer: ReturnType<typeof setTimeout>;
  commit: () => Promise<void>;
  running: boolean;
}

/** How long an action waits for an undo: the 5 s of `motion.duration.toast` in the design tokens. */
export const undoConfig = { delayMs: 5000 };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let snapshot: ReadonlyMap<string, PendingKind> = new Map();

function publish(): void {
  snapshot = new Map([...entries].map(([id, entry]) => [id, entry.kind]));
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function settle(id: string): Promise<void> {
  const entry = entries.get(id);
  if (!entry || entry.running) return;
  entry.running = true;
  clearTimeout(entry.timer);
  try {
    await entry.commit();
  } finally {
    entries.delete(id);
    publish();
  }
}

/** Announces `kind` for a request now and carries it out after the undo delay. A second call replaces the first. */
export function schedule(id: string, kind: PendingKind, commit: () => Promise<void>): void {
  if (entries.get(id)?.running) return;
  undo(id);
  const timer = setTimeout(() => void settle(id), undoConfig.delayMs);
  entries.set(id, { kind, timer, commit, running: false });
  publish();
}

export function undo(id: string): void {
  const entry = entries.get(id);
  if (!entry || entry.running) return;
  clearTimeout(entry.timer);
  entries.delete(id);
  publish();
}

/** Carries out at once everything still waiting. Called when the page is being left. */
export function flushPending(): void {
  for (const id of [...entries.keys()]) void settle(id);
}

/** Forgets everything still waiting without carrying it out. For tests. */
export function clearPending(): void {
  for (const entry of entries.values()) clearTimeout(entry.timer);
  entries.clear();
  publish();
}

/** The requests with an action waiting for its undo delay. */
export function usePendingActions(): ReadonlyMap<string, PendingKind> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

if (typeof window !== "undefined") window.addEventListener("pagehide", flushPending);

/** Discard a draft or withdraw a request, with an undo instead of a warning (U6). */
export function useUndoable(): { discard: (request: RequestOut) => void; withdraw: (request: RequestOut) => void } {
  const { t } = useRequestsText();
  const qc = useQueryClient();

  const start = useCallback(
    (request: RequestOut, kind: PendingKind) => {
      const id = request.public_id;
      schedule(id, kind, async () => {
        try {
          if (kind === "discard") await requestsApi.discard(id);
          else await requestsApi.withdraw(id);
        } catch (error) {
          toast(isConflict(error) ? t("undo.tooLate") : t("errors:unexpected"));
        } finally {
          await refreshRequests(qc);
        }
      });
      toast(t(`undo.${kind}`), { undo: () => undo(id) });
    },
    [qc, t],
  );

  const discard = useCallback((request: RequestOut) => start(request, "discard"), [start]);
  const withdraw = useCallback((request: RequestOut) => start(request, "withdraw"), [start]);
  return { discard, withdraw };
}
```

- [ ] **Step 5: Write the filters**

`frontend/src/features/requests/lists/filters.tsx`:

```tsx
import { FilterDateRange, FilterSelect } from "@/components";
import { EmployeePicker } from "@/features/employees/EmployeePicker";
import { todayISO } from "@/lib/dates";
import { useDepartmentOptions, useRequestTypes } from "../api";
import { useRequestsText } from "../platform";

export type FilterName =
  | "status" | "type" | "year" | "employee" | "period" | "department" | "on_behalf" | "has_override";

/** The query parameters of `GET requests` a list can filter on, empty by default. */
export const FILTER_DEFAULTS = {
  status: "",
  type: "",
  year: "",
  employee: "",
  from: "",
  to: "",
  department: "",
  on_behalf: "",
  has_override: "",
};

export type FilterValues = typeof FILTER_DEFAULTS;

const STATUSES = ["draft", "pending", "returned", "approved", "rejected", "withdrawn", "cancelled"] as const;

interface RequestFilterProps {
  name: FilterName;
  values: FilterValues;
  set: (key: keyof FilterValues, value: string) => void;
}

/** One filter of a request list, drawn with plan 01b's filter controls. The value lives in the address. */
export function RequestFilter({ name, values, set }: RequestFilterProps) {
  const { t, lang } = useRequestsText();
  const types = useRequestTypes();
  const departments = useDepartmentOptions(lang, name === "department");
  const all = { value: "", label: t("common.all") };
  const yesNo = [all, { value: "1", label: t("common.yes") }, { value: "0", label: t("common.no") }];

  switch (name) {
    case "status":
      return (
        <FilterSelect
          label={t("filters.statusLabel")}
          value={values.status}
          onChange={(value) => set("status", value)}
          options={[all, ...STATUSES.map((status) => ({ value: status, label: t(`filters.status.${status}`) }))]}
        />
      );
    case "type":
      return (
        <FilterSelect
          label={t("filters.typeLabel")}
          value={values.type}
          onChange={(value) => set("type", value)}
          options={[all, ...(types.data ?? []).map((type) => ({ value: type.code, label: type.name }))]}
        />
      );
    case "year": {
      const current = Number(todayISO().slice(0, 4));
      const years = [current + 1, current, current - 1, current - 2].map(String);
      return (
        <FilterSelect
          label={t("filters.yearLabel")}
          value={values.year}
          onChange={(value) => set("year", value)}
          options={[all, ...years.map((year) => ({ value: year, label: year }))]}
        />
      );
    }
    case "employee":
      return (
        <div className="w-full md:w-56">
          <EmployeePicker
            label={t("filters.employee")}
            value={values.employee === "" ? null : values.employee}
            onChange={(publicId) => set("employee", publicId ?? "")}
            allowNone
            noneLabel={t("common.all")}
          />
        </div>
      );
    case "period":
      return (
        <FilterDateRange
          label={t("filters.period")}
          from={values.from}
          to={values.to}
          onFrom={(value) => set("from", value)}
          onTo={(value) => set("to", value)}
        />
      );
    case "department":
      return (
        <FilterSelect
          label={t("filters.department")}
          value={values.department}
          onChange={(value) => set("department", value)}
          options={[all, ...(departments.data ?? [])]}
        />
      );
    case "on_behalf":
      return (
        <FilterSelect
          label={t("filters.onBehalf")}
          value={values.on_behalf}
          onChange={(value) => set("on_behalf", value)}
          options={yesNo}
        />
      );
    case "has_override":
      return (
        <FilterSelect
          label={t("filters.hasOverride")}
          value={values.has_override}
          onChange={(value) => set("has_override", value)}
          options={yesNo}
        />
      );
  }
}
```

- [ ] **Step 6: Write the list**

`frontend/src/features/requests/lists/RequestsList.tsx`:

```tsx
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { DataTable, FilterBar, Pager, SomethingWentWrong, StatusBadge, useListParams, type Column } from "@/components";
import { useRequestList } from "../api";
import { useRequestsText, useWorkspacePrefix } from "../platform";
import { StatusSentence } from "../StatusSentence";
import { describeQuantity, describeWhen } from "../text";
import { TypeTag } from "../TypeTag";
import type { RequestListParams, RequestOut, Scope } from "../types";
import { usePendingActions } from "../undoable";
import { FILTER_DEFAULTS, RequestFilter, type FilterName } from "./filters";

export type ListColumn = "who" | "department" | "type" | "when" | "quantity" | "status";

const PAGE_SIZE = 25;

interface RequestsListProps {
  scope: Scope;
  /** At most six (M4). The first one opens the request and is shown as plain text. */
  columns: ListColumn[];
  /** At most three (M5); the others go in `moreFilters`. */
  filters: FilterName[];
  moreFilters?: FilterName[];
  /** Parameters the page imposes, whatever the filters say (for example one employee). */
  fixed?: Partial<RequestListParams>;
  empty: ReactNode;
  /** Something to add after the status sentence of a row, such as "Discard". */
  rowExtra?: (request: RequestOut) => ReactNode;
  /** The accessible name of the table. */
  label?: string;
}

/** A filterable, paged table of requests for any scope. Opening a row stays in the current workspace. */
export function RequestsList({ scope, columns, filters, moreFilters = [], fixed, empty, rowExtra, label }: RequestsListProps) {
  const { t, lang } = useRequestsText();
  const navigate = useNavigate();
  const prefix = useWorkspacePrefix();
  const params = useListParams(FILTER_DEFAULTS);
  const pending = usePendingActions();
  const query = useRequestList({
    scope,
    ...params.filters,
    ...fixed,
    ordering: params.sort,
    page: params.page,
    page_size: PAGE_SIZE,
  });
  const lead = columns[0];

  const cells: Record<ListColumn, Column<RequestOut>> = {
    who: { key: "who", header: t("common.who"), cell: (request) => request.employee.name },
    department: { key: "department", header: t("common.department"), cell: (request) => request.employee.department },
    type: {
      key: "type",
      header: t("common.type"),
      // As the first column it is the button that opens the row: plain text there, the coloured tag elsewhere.
      cell: (request) =>
        lead === "type" ? request.type.name : <TypeTag code={request.type.code} name={request.type.name} />,
    },
    when: { key: "when", header: t("common.dates"), cell: (request) => describeWhen(request, t, lang) },
    quantity: { key: "quantity", header: t("common.quantity"), cell: (request) => describeQuantity(request, lang) },
    status: {
      key: "status",
      header: t("common.status"),
      cell: (request) => (
        <div className="flex flex-wrap items-center gap-2">
          {pending.get(request.public_id) === "withdraw" ? (
            <StatusBadge tone="neutral">{t("status.requester.withdrawn")}</StatusBadge>
          ) : (
            <StatusSentence request={request} />
          )}
          {rowExtra?.(request)}
        </div>
      ),
    },
  };

  const rows = (query.data?.results ?? []).filter((request) => pending.get(request.public_id) !== "discard");
  const filter = (name: FilterName) => (
    <RequestFilter key={name} name={name} values={params.filters} set={params.setFilter} />
  );

  return (
    <div className="flex flex-col">
      <FilterBar more={moreFilters.length > 0 ? <>{moreFilters.map(filter)}</> : undefined}>{filters.map(filter)}</FilterBar>
      {query.isError ? (
        <SomethingWentWrong />
      ) : (
        <DataTable
          label={label}
          columns={columns.map((column) => cells[column])}
          rows={rows}
          rowKey={(request) => request.public_id}
          onRowOpen={(request) => navigate(`/${prefix}/requests/${request.public_id}`)}
          empty={empty}
          isLoading={query.isPending}
        />
      )}
      <Pager page={params.page} pageSize={PAGE_SIZE} total={query.data?.count ?? 0} onPage={params.setPage} />
    </div>
  );
}
```

- [ ] **Step 7: Write the page and register its route**

`frontend/src/features/requests/mine/MyRequestsPage.tsx`:

```tsx
import { Link } from "react-router";
import { EmptyState, PageHeader } from "@/components";
import { Button } from "@/components/ui/button";
import { RequestsList } from "../lists/RequestsList";
import { useRequestsText } from "../platform";
import { useUndoable } from "../undoable";

/** /me/requests (UI 5.2). Four attributes per request, three filters, one primary action. */
export default function MyRequestsPage() {
  const { t } = useRequestsText();
  const { discard } = useUndoable();
  return (
    <>
      <PageHeader
        title={t("list.mine.title")}
        primary={
          <Button asChild variant="primary">
            <Link to="/me/requests/new">{t("common.newRequest")}</Link>
          </Button>
        }
      />
      <RequestsList
        label={t("list.mine.title")}
        scope="mine"
        columns={["type", "when", "quantity", "status"]}
        filters={["status", "type", "year"]}
        empty={<EmptyState title={t("list.mine.empty")} hint={t("list.mine.emptyHint")} />}
        rowExtra={(request) =>
          request.viewer.actions.includes("discard") ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                discard(request);
              }}
            >
              {t("common.discard")}
            </Button>
          ) : null
        }
      />
    </>
  );
}
```

In `frontend/src/workspaces/me/routes.tsx`, add the import and append one element to `meRoutes`:

```tsx
import MyRequestsPage from "@/features/requests/mine/MyRequestsPage";
```

```tsx
  { path: "requests", element: <MyRequestsPage /> },
```

The "Requests" entry of My space's navigation now appears, because its path matches a registered route (master 9.1).

- [ ] **Step 8: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/undoable.test.ts src/features/requests/mine src/i18n/parity.test.ts`

Expected: PASS (5 and 9 tests).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/requests frontend/src/workspaces/me/routes.tsx frontend/src/i18n/locales
git commit -m "feat(requests): my requests with filters and discard with undo"
```

---

### Task 8: The request page, and the request seen by its owner

**Files:**
- Create: `frontend/src/features/requests/views/parts.tsx`
- Create: `frontend/src/features/requests/RequestView.tsx`
- Create: `frontend/src/features/requests/AddFileSheet.tsx`
- Create: `frontend/src/features/requests/views/RequestMineView.tsx`
- Create: `frontend/src/features/requests/views/registry.ts`
- Create: `frontend/src/features/requests/RequestPage.tsx`
- Create: `frontend/src/features/requests/RequestRedirect.tsx`
- Modify: `frontend/src/workspaces/me/routes.tsx` (append one route)
- Modify: `frontend/src/app/sharedRoutes.tsx` (append one route)
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (sections `view`, `steps`, `files`, `mine`, `addFile`)
- Test: `frontend/src/features/requests/RequestPage.test.tsx`
- Test: `frontend/src/features/requests/RequestRedirect.test.tsx`

**Interfaces:**
- Consumes: `useRequest`, `useRequestHistory`, `useSubmitRequest`, `useWithdrawAmendment`, `useAttachFile`, `isConflict` (Task 1); `Gate`, `useViewer`, `workspaceFor`, `useWorkspacePrefix` (Task 1); `StatusSentence`, `nextStep`, `describeWhen`, `describeQuantity` (Task 2); `fileProblem` (Task 4); `serverProblems`, `byName`, `details` (Task 4); `useSingleFlight` (Task 4); `useUndoable` (Task 7); `PageHeader`, `Disclosure`, `TaskSheet`, `FileField`, `FormSummary`, `backToList`, `toast` from `@/components`; `sharedRoutes` from `@/app/sharedRoutes`.
- Produces:
  - `RequestView(props: RequestViewProps)` with `interface RequestViewProps { request: RequestDetail; back: To; context?: ReactNode; actions?: ReactNode; commentFirst?: boolean; filesFirst?: boolean; extra?: ReactNode }`: the page body every role shares (master 9.3).
  - `views/parts.tsx`: `StepList({ steps })`, `FileList({ attachments })`, `AmendmentList({ amendments, unit })`, `HistoryList({ id })`, and the two sentences they are built from, `stepWho(step, t)` and `stepOutcome(step, t, lang)`.
  - `views/registry.ts`: `VIEWS: Partial<Record<ViewerRelation, ComponentType<{ request: RequestDetail }>>>`. Tasks 12, 16 and 18 each add lines to it.
  - `RequestPage` (default export of `@/features/requests/RequestPage`, the path plan 04 imports): reads `:id`, loads the request, renders the view registered for `viewer.relation`, or the read-only `RequestView` when none is. It needs no workspace in the address: rendered at `/requests/:id` it shows the same view.
  - `RequestRedirect` (default export) at `/requests/:id`: sends the viewer to `/<workspace>/requests/:id`.
  - `AddFileSheet({ open, onOpenChange, requestId, title, label })`.
  - `RequestMineView({ request })` (default export).

The owner's actions (UI 5.4), each shown only when `viewer.actions` contains it:

| `viewer.actions` has | Control | Primary when |
|---|---|---|
| `submit` | Send | the request is a draft |
| `edit` | Edit (link to the form); "Edit and send again" when sent back | the request was sent back |
| `attach` | Add the certificate / Add the proof / Add a file (sheet) | a document is due, overdue or missing |
| `amend` | Change the dates, Cancel the request (links to Task 9's page) | never |
| `withdraw_amendment` | Withdraw the change | never |
| `withdraw` | Withdraw the request (with undo) | never |
| `discard` | Discard the draft (with undo) | never |

The summary also gives the balance today and after, when the API returns `decision_context.balance` to the owner (UI 10.2: "Balance now and after", My space). Who else is away on those days is for approvers only, and is not shown here.

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "view": {
    "summary": "Résumé de la demande",
    "steps": "Étapes",
    "myCommentAndFiles": "Mon commentaire et mes fichiers",
    "commentAndFiles": "Commentaire et fichiers",
    "files": "Fichiers",
    "comment": "Commentaire",
    "noFiles": "Aucun fichier.",
    "changes": "Modifications demandées",
    "history": "Historique complet",
    "historyEmpty": "Aucun événement.",
    "system": "Système",
    "event": "Événement : {{name}}",
    "exception": "Demande saisie avec une exception accordée par les RH.",
    "enteredByHr": "Demande saisie par les RH.",
    "amendmentKind": {
      "change": "Changement de dates",
      "cancel": "Annulation"
    },
    "amendmentStatus": {
      "pending": "en attente",
      "approved": "approuvée",
      "rejected": "refusée",
      "withdrawn": "retirée"
    },
    "amendmentNew": "Nouvelles dates : {{range}} ({{quantity}})",
    "amendmentReason": "Motif : {{reason}}"
  },
  "steps": {
    "none": "Aucune étape pour l'instant.",
    "forChange": "pour la modification",
    "round": "Envoi n° {{round}}",
    "who": {
      "hr": "RH",
      "manager": "Responsable : {{names}}",
      "managerNone": "Responsable",
      "nobody": "Personne désignée"
    },
    "status": {
      "waiting": "Pas encore à cette étape",
      "pending": "En attente de décision",
      "approved": "Approuvée par {{name}} le {{date}}",
      "rejected": "Refusée par {{name}} le {{date}}",
      "returned": "Renvoyée par {{name}} le {{date}}",
      "notified": "Pour information",
      "skipped": "Étape passée : personne à consulter"
    },
    "recorded": "Décision saisie par {{recorder}}, {{channel}}.",
    "channel": {
      "in_app": "dans l'application",
      "verbal": "donnée de vive voix",
      "paper": "donnée sur papier"
    }
  },
  "files": {
    "kind": {
      "medical": "Certificat médical",
      "proof": "Justificatif",
      "scanned_form": "Formulaire signé"
    },
    "meta": "{{kind}}, ajouté par {{by}} le {{date}}"
  },
  "mine": {
    "editAndResend": "Modifier et renvoyer",
    "changeDates": "Changer les dates",
    "cancelRequest": "Annuler la demande",
    "addCertificate": "Ajouter le certificat",
    "addProof": "Ajouter le justificatif",
    "addFile": "Ajouter un fichier",
    "withdrawChange": "Retirer la modification",
    "changeWithdrawn": "Modification retirée.",
    "balance": "Solde : {{now}} aujourd'hui, {{after}} après"
  },
  "addFile": {
    "label": "Fichier",
    "add": "Ajouter",
    "done": "Fichier ajouté.",
    "required": "Choisissez un fichier."
  }
```

English:

```json
  "view": {
    "summary": "Summary of the request",
    "steps": "Steps",
    "myCommentAndFiles": "My comment and my files",
    "commentAndFiles": "Comment and files",
    "files": "Files",
    "comment": "Comment",
    "noFiles": "No file.",
    "changes": "Changes asked for",
    "history": "Full history",
    "historyEmpty": "No event.",
    "system": "System",
    "event": "Event: {{name}}",
    "exception": "Request entered with an exception granted by HR.",
    "enteredByHr": "Request entered by HR.",
    "amendmentKind": {
      "change": "Change of dates",
      "cancel": "Cancellation"
    },
    "amendmentStatus": {
      "pending": "waiting",
      "approved": "approved",
      "rejected": "refused",
      "withdrawn": "withdrawn"
    },
    "amendmentNew": "New dates: {{range}} ({{quantity}})",
    "amendmentReason": "Reason: {{reason}}"
  },
  "steps": {
    "none": "No step yet.",
    "forChange": "for the change",
    "round": "Sending no. {{round}}",
    "who": {
      "hr": "HR",
      "manager": "Manager: {{names}}",
      "managerNone": "Manager",
      "nobody": "Named person"
    },
    "status": {
      "waiting": "Not at this step yet",
      "pending": "Waiting for a decision",
      "approved": "Approved by {{name}} on {{date}}",
      "rejected": "Refused by {{name}} on {{date}}",
      "returned": "Sent back by {{name}} on {{date}}",
      "notified": "For information",
      "skipped": "Step skipped: nobody to ask"
    },
    "recorded": "Decision entered by {{recorder}}, {{channel}}.",
    "channel": {
      "in_app": "in the application",
      "verbal": "given verbally",
      "paper": "given on paper"
    }
  },
  "files": {
    "kind": {
      "medical": "Medical certificate",
      "proof": "Proof",
      "scanned_form": "Signed form"
    },
    "meta": "{{kind}}, added by {{by}} on {{date}}"
  },
  "mine": {
    "editAndResend": "Edit and send again",
    "changeDates": "Change the dates",
    "cancelRequest": "Cancel the request",
    "addCertificate": "Add the certificate",
    "addProof": "Add the proof",
    "addFile": "Add a file",
    "withdrawChange": "Withdraw the change",
    "changeWithdrawn": "Change withdrawn.",
    "balance": "Balance: {{now}} today, {{after}} after"
  },
  "addFile": {
    "label": "File",
    "add": "Add",
    "done": "File added.",
    "required": "Choose a file."
  }
```

- [ ] **Step 2: Write the failing tests**

`frontend/src/features/requests/RequestPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeMe } from "@/test/fixtures";
import { pickFile } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makeRequestDetail, makeStep, paginated, problemResponse, type DetailOverrides } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import RequestPage from "./RequestPage";
import { clearPending, undoConfig } from "./undoable";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
  NotAvailable: () => <p>indisponible</p>,
}));

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });

function serve(overrides: DetailOverrides = {}) {
  const detail = makeRequestDetail(overrides);
  const calls = { submit: [] as unknown[], withdraw: 0, uploads: 0, history: 0, withdrawChange: 0 };
  server.use(
    http.get("/api/v1/requests/req-1", () => HttpResponse.json(detail)),
    http.get("/api/v1/requests/req-1/history", () => {
      calls.history += 1;
      return HttpResponse.json([
        { at: "2026-10-28T09:12:00+01:00", actor: "Amal Trabelsi", action: "request.submitted", summary: "Demande envoyée", changes: null },
        { at: "2026-10-29T08:00:00+01:00", actor: null, action: "step.reminder", summary: "Rappel envoyé à Sami Ben Ali", changes: null },
      ]);
    }),
    http.get("/api/v1/requests", () => HttpResponse.json(paginated([detail]))),
    http.post("/api/v1/requests/req-1/submit", async ({ request }) => {
      calls.submit.push(await request.json());
      return HttpResponse.json(makeRequestDetail());
    }),
    http.post("/api/v1/requests/req-1/withdraw", () => {
      calls.withdraw += 1;
      return HttpResponse.json(makeRequestDetail({ status: "withdrawn", state: { key: "withdrawn", waiting_on: [] }, viewer: { actions: [] } }));
    }),
    http.post("/api/v1/requests/req-1/attachments", () => {
      calls.uploads += 1;
      return HttpResponse.json(
        { public_id: "att-9", kind: "medical", name: "certificat.pdf", size: 8, uploaded_by: "Amal Trabelsi", uploaded_at: "2026-10-28T10:00:00+01:00" },
        { status: 201 },
      );
    }),
    http.post("/api/v1/amendments/am-1/withdraw", () => {
      calls.withdrawChange += 1;
      return HttpResponse.json(makeRequestDetail({ status: "approved", state: { key: "approved", waiting_on: [] }, viewer: { actions: ["amend"] } }));
    }),
  );
  return calls;
}

const open = () => renderApp(<RequestPage />, { route: "/me/requests/req-1", path: "/me/requests/:id", me });
const control = (name: string) => screen.queryByRole("button", { name }) ?? screen.queryByRole("link", { name });

const openChange = { public_id: "am-1", kind: "change" as const, status: "pending" as const, state_key: "waiting_hr" as const, waiting_on: [] };

beforeEach(() => {
  undoConfig.delayMs = 30;
  vi.mocked(toast).mockClear();
});

afterEach(() => {
  clearPending();
  undoConfig.delayMs = 5000;
});

describe("Request, my view: shown first (UI 5.4, M6)", () => {
  it("shows the type, the dates, the length, where it stands and what happens next", async () => {
    serve();
    open();
    expect(await screen.findByRole("heading", { name: "Congé annuel" })).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(within(summary).getByText("3 j")).toBeInTheDocument();
    expect(within(summary).getByText("En attente de Sami Ben Ali")).toBeInTheDocument();
    expect(within(summary).getByText("Ensuite, les RH la valident.")).toBeInTheDocument();
    expect(within(summary).queryByText("Amal Trabelsi")).not.toBeInTheDocument();
  });

  it("shows the certificate sentence beside the state of a sick leave", async () => {
    serve({
      type: { code: "sick", name: "Congé maladie" },
      state: { key: "waiting_hr", waiting_on: [], last_actor: null },
      certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" },
      viewer: { actions: ["attach", "withdraw"] },
    });
    open();
    expect(await screen.findByText("En attente des RH")).toBeInTheDocument();
    expect(screen.getByText("Certificat à fournir avant le T(2026-11-11T09:00:00+01:00)")).toBeInTheDocument();
  });

  it("shows my balance today and after, when the API gives it (UI 10.2)", async () => {
    serve({ decision_context: { balance: { now: "12.50", after: "9.50" }, teammates_away: [], cap: null } });
    open();
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).getByText("Solde : 12.5 j aujourd'hui, 9.5 j après")).toBeInTheDocument();
  });

  it("is not available for a request outside the viewer's reach", async () => {
    serve();
    server.use(http.get("/api/v1/requests/req-1", () => problemResponse(404, "core.not_found", "Introuvable.")));
    open();
    expect(await screen.findByText("indisponible")).toBeInTheDocument();
  });
});

describe("Request, my view: exactly the actions the API allows (UI 5.4, M8)", () => {
  const cases: { name: string; detail: DetailOverrides; shown: string[]; hidden: string[] }[] = [
    {
      name: "not sent yet",
      detail: { status: "draft", state: { key: "draft", waiting_on: [] }, viewer: { actions: ["edit", "submit", "discard"] } },
      shown: ["Envoyer", "Modifier", "Supprimer le brouillon"],
      hidden: ["Retirer la demande", "Changer les dates", "Modifier et renvoyer"],
    },
    {
      name: "waiting, nobody decided yet",
      detail: { viewer: { actions: ["edit", "withdraw"] } },
      shown: ["Modifier", "Retirer la demande"],
      hidden: ["Envoyer", "Supprimer le brouillon", "Changer les dates"],
    },
    {
      name: "waiting, the manager already decided",
      detail: { state: { key: "waiting_hr", waiting_on: [], last_actor: "Sami Ben Ali" }, viewer: { actions: ["withdraw"] } },
      shown: ["Retirer la demande"],
      hidden: ["Modifier", "Envoyer"],
    },
    {
      name: "sent back",
      detail: {
        status: "returned",
        state: { key: "returned", waiting_on: [], last_actor: "Sami Ben Ali", note: "Trop long" },
        viewer: { actions: ["edit", "withdraw"] },
      },
      shown: ["Modifier et renvoyer", "Retirer la demande"],
      hidden: ["Modifier", "Envoyer"],
    },
    {
      name: "approved, not started",
      detail: { status: "approved", state: { key: "approved", waiting_on: [] }, viewer: { actions: ["amend"] } },
      shown: ["Changer les dates", "Annuler la demande"],
      hidden: ["Modifier", "Retirer la demande", "Retirer la modification"],
    },
    {
      name: "sick leave, certificate due",
      detail: {
        type: { code: "sick", name: "Congé maladie" },
        state: { key: "waiting_hr", waiting_on: [], last_actor: null },
        certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" },
        viewer: { actions: ["attach", "withdraw"] },
      },
      shown: ["Ajouter le certificat", "Retirer la demande"],
      hidden: ["Ajouter un fichier", "Modifier"],
    },
    {
      name: "change waiting",
      detail: {
        status: "approved",
        state: { key: "approved", waiting_on: [] },
        amendment: openChange,
        viewer: { actions: ["withdraw_amendment"] },
      },
      shown: ["Retirer la modification"],
      hidden: ["Changer les dates", "Annuler la demande"],
    },
    {
      name: "nothing left to do",
      detail: { status: "rejected", state: { key: "rejected", waiting_on: [], note: "Effectif insuffisant" }, viewer: { actions: [] } },
      shown: [],
      hidden: ["Modifier", "Retirer la demande", "Envoyer", "Changer les dates"],
    },
  ];

  it.each(cases)("$name", async ({ detail, shown, hidden }) => {
    serve(detail);
    open();
    await screen.findByRole("region", { name: "Résumé de la demande" });
    for (const name of shown) expect(control(name), name).toBeInTheDocument();
    for (const name of hidden) expect(control(name), name).not.toBeInTheDocument();
  });

  it("shows no control at all, not a disabled one, when nothing can be done", async () => {
    serve({ status: "rejected", state: { key: "rejected", waiting_on: [], note: "Effectif insuffisant" }, viewer: { actions: [] } });
    open();
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).queryAllByRole("button")).toHaveLength(0);
    expect(within(summary).queryAllByRole("link")).toHaveLength(0);
    expect(within(summary).getByText("Refusée : Effectif insuffisant")).toBeInTheDocument();
  });

  it("links the edit and change actions to their pages", async () => {
    serve({ status: "approved", state: { key: "approved", waiting_on: [] }, viewer: { actions: ["amend"] } });
    open();
    expect(await screen.findByRole("link", { name: "Changer les dates" })).toHaveAttribute("href", "/me/requests/req-1/change?kind=change");
    expect(screen.getByRole("link", { name: "Annuler la demande" })).toHaveAttribute("href", "/me/requests/req-1/change?kind=cancel");
  });
});

describe("Request, my view: acting", () => {
  it("sends a draft from its page with its version", async () => {
    const calls = serve({ version: 4, status: "draft", state: { key: "draft", waiting_on: [] }, viewer: { actions: ["edit", "submit", "discard"] } });
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(calls.submit).toEqual([{ version: 4 }]));
    expect(toast).toHaveBeenCalledWith("Demande envoyée.");
  });

  it("shows why a draft cannot be sent", async () => {
    serve({ status: "draft", state: { key: "draft", waiting_on: [] }, viewer: { actions: ["edit", "submit", "discard"] } });
    server.use(
      http.post("/api/v1/requests/req-1/submit", () =>
        problemResponse(400, "validation", "Ces dates chevauchent une autre demande.", [
          { field: "start_date", code: "request.overlap", detail: "Ces dates chevauchent une autre demande.", params: {} },
        ]),
      ),
    );
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("Ces dates chevauchent une autre demande.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Modifier" })).toHaveAttribute("href", "/me/requests/req-1/edit");
  });

  it("withdraws with an undo and returns to the list", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Retirer la demande" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests");
    expect(toast).toHaveBeenCalledWith("Demande retirée.", expect.objectContaining({ undo: expect.any(Function) }));
    expect(calls.withdraw).toBe(0);
    await waitFor(() => expect(calls.withdraw).toBe(1));
  });

  it("a withdrawal that arrives too late says so", async () => {
    serve();
    server.use(
      http.post("/api/v1/requests/req-1/withdraw", () => problemResponse(409, "request.already_processed", "Déjà traitée.")),
    );
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Retirer la demande" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("Trop tard : la demande avait déjà été traitée. Voici son état actuel."),
    );
  });

  it("adds the certificate from a sheet", async () => {
    const calls = serve({
      type: { code: "sick", name: "Congé maladie" },
      state: { key: "waiting_hr", waiting_on: [], last_actor: null },
      certificate: { status: "due", due_at: "2026-11-11T09:00:00+01:00" },
      viewer: { actions: ["attach", "withdraw"] },
    });
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Ajouter le certificat" }));
    const sheet = screen.getByRole("dialog", { name: "Ajouter le certificat" });
    await pickFile("Certificat médical", new File(["%PDF-1.4"], "certificat.pdf", { type: "application/pdf" }), within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(calls.uploads).toBe(1));
    expect(toast).toHaveBeenCalledWith("Fichier ajouté.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Ajouter le certificat" })).not.toBeInTheDocument());
  });

  it("refuses a wrong file in the sheet without sending it", async () => {
    const calls = serve({
      type: { code: "sick", name: "Congé maladie" },
      certificate: { status: "overdue", due_at: "2026-11-11T09:00:00+01:00" },
      viewer: { actions: ["attach"] },
    });
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Ajouter le certificat" }));
    const sheet = screen.getByRole("dialog", { name: "Ajouter le certificat" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Ajouter" }));
    expect(await within(sheet).findByText("Choisissez un fichier.")).toBeInTheDocument();
    await pickFile("Certificat médical", new File(["notes"], "notes.txt", { type: "text/plain" }), within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Ajouter" }));
    expect(
      await within(sheet).findByText("Ce type de fichier n'est pas accepté. Utilisez un PDF, un JPG ou un PNG."),
    ).toBeInTheDocument();
    expect(calls.uploads).toBe(0);
  });

  it("withdraws an open change", async () => {
    const calls = serve({
      status: "approved",
      state: { key: "approved", waiting_on: [] },
      amendment: openChange,
      viewer: { actions: ["withdraw_amendment"] },
    });
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Retirer la modification" }));
    await waitFor(() => expect(calls.withdrawChange).toBe(1));
    expect(toast).toHaveBeenCalledWith("Modification retirée.");
  });
});

describe("Request, my view: one step away (M6)", () => {
  it("lists the steps with who decided, when, and their comment", async () => {
    serve({
      state: { key: "waiting_hr", waiting_on: [], last_actor: "Sami Ben Ali" },
      steps: [
        makeStep({ status: "approved", decided_by: "Sami Ben Ali", decided_at: "2026-10-29T10:00:00+01:00", comment: "Bon voyage", channel: "in_app" }),
        makeStep({ id: 8, position: 2, rule: "hr_role", status: "pending", approvers: ["Leila Gharbi"] }),
      ],
    });
    open();
    await userEvent.click(await screen.findByText("Étapes"));
    expect(await screen.findByText("Responsable : Sami Ben Ali")).toBeInTheDocument();
    expect(screen.getByText("Approuvée par Sami Ben Ali le T(2026-10-29T10:00:00+01:00)")).toBeInTheDocument();
    expect(screen.getByText("« Bon voyage »")).toBeInTheDocument();
    expect(screen.getByText("RH")).toBeInTheDocument();
    expect(screen.getByText("En attente de décision")).toBeInTheDocument();
  });

  it("says when a decision was given outside the application and who entered it", async () => {
    serve({
      steps: [
        makeStep({
          status: "approved",
          decided_by: "Sami Ben Ali",
          decided_at: "2026-10-29T10:00:00+01:00",
          recorded_by: "Leila Gharbi",
          channel: "paper",
        }),
      ],
    });
    open();
    await userEvent.click(await screen.findByText("Étapes"));
    expect(
      await screen.findByText(
        "Approuvée par Sami Ben Ali le T(2026-10-29T10:00:00+01:00) Décision saisie par Leila Gharbi, donnée sur papier.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the rounds apart after a request was sent back and sent again", async () => {
    serve({
      steps: [
        makeStep({ id: 1, round: 1, status: "returned", decided_by: "Sami Ben Ali", decided_at: "2026-10-29T10:00:00+01:00", comment: "Trop long" }),
        makeStep({ id: 3, round: 2, status: "pending" }),
      ],
    });
    open();
    await userEvent.click(await screen.findByText("Étapes"));
    expect(await screen.findByText("Envoi n° 2")).toBeInTheDocument();
    expect(screen.getByText("Envoi n° 1")).toBeInTheDocument();
  });

  it("shows my comment and my files, each as a download", async () => {
    serve({
      comment: "Voyage en famille",
      attachments: [
        { public_id: "att-1", kind: "proof", name: "billet.pdf", size: 2048, uploaded_by: "Amal Trabelsi", uploaded_at: "2026-10-28T10:00:00+01:00" },
      ],
    });
    open();
    await userEvent.click(await screen.findByText("Mon commentaire et mes fichiers"));
    expect(await screen.findByText("Voyage en famille")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "billet.pdf" });
    expect(link).toHaveAttribute("href", "/api/v1/attachments/att-1/download");
    expect(link).toHaveAttribute("download");
    expect(screen.getByText("Justificatif, ajouté par Amal Trabelsi le T(2026-10-28T10:00:00+01:00)")).toBeInTheDocument();
  });

  it("offers no comment-and-files block when there is neither", async () => {
    serve();
    open();
    await screen.findByText("Étapes");
    expect(screen.queryByText("Mon commentaire et mes fichiers")).not.toBeInTheDocument();
  });

  it("shows the changes I asked for and their outcome", async () => {
    serve({
      status: "approved",
      state: { key: "approved", waiting_on: [] },
      amendments: [
        {
          public_id: "am-0",
          kind: "change",
          status: "rejected",
          reason: "Vol décalé",
          new_start_date: "2026-11-16",
          new_end_date: "2026-11-18",
          new_quantity: "3.00",
          created_at: "2026-10-30T09:00:00+01:00",
          decided_at: "2026-10-31T09:00:00+01:00",
        },
      ],
    });
    open();
    await userEvent.click(await screen.findByText("Modifications demandées"));
    expect(await screen.findByText("Changement de dates · refusée")).toBeInTheDocument();
    expect(screen.getByText("Nouvelles dates : R(2026-11-16..2026-11-18) (3 j)")).toBeInTheDocument();
    expect(screen.getByText("Motif : Vol décalé")).toBeInTheDocument();
  });

  it("gives the full history", async () => {
    serve();
    open();
    await userEvent.click(await screen.findByText("Historique complet"));
    expect(await screen.findByText("Demande envoyée")).toBeInTheDocument();
    expect(screen.getByText("T(2026-10-28T09:12:00+01:00) · Amal Trabelsi")).toBeInTheDocument();
    expect(screen.getByText("T(2026-10-29T08:00:00+01:00) · Système")).toBeInTheDocument();
  });
});
```

`frontend/src/features/requests/RequestRedirect.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceId } from "@/app/workspaces";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { makeRequestDetail, problemResponse } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import { workspaceFor } from "./platform";
import RequestRedirect from "./RequestRedirect";
import type { ViewerRelation } from "./types";

vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  NotAvailable: () => <p>indisponible</p>,
}));

function open(relation: ViewerRelation, workspaces: WorkspaceId[]) {
  server.use(
    http.get("/api/v1/requests/req-1", () => HttpResponse.json(makeRequestDetail({ viewer: { relation, actions: [], step_id: null } }))),
  );
  renderApp(<RequestRedirect />, {
    route: "/requests/req-1",
    path: "/requests/:id",
    me: makeMe({ roles: ["employee"], workspaces }),
  });
}

describe("/requests/:id opens in the workspace matching the viewer (UI 11)", () => {
  it.each([
    ["owner", ["me", "team", "hr"], "/me/requests/req-1"],
    ["approver", ["me", "team"], "/team/requests/req-1"],
    ["team", ["me", "team"], "/team/requests/req-1"],
    ["hr", ["me", "hr"], "/hr/requests/req-1"],
    ["overview", ["me", "team", "overview"], "/overview/requests/req-1"],
    ["approver", ["me"], "/me/requests/req-1"],
    ["approver", ["me", "overview"], "/me/requests/req-1"],
  ] as const)("a viewer who is %s with %j lands on %s", async (relation, workspaces, target) => {
    open(relation, [...workspaces]);
    expect(await screen.findByTestId("elsewhere")).toHaveTextContent(target);
  });

  it("is not available when the request is outside the viewer's reach", async () => {
    server.use(http.get("/api/v1/requests/req-1", () => problemResponse(404, "core.not_found", "Introuvable.")));
    renderApp(<RequestRedirect />, {
      route: "/requests/req-1",
      path: "/requests/:id",
      me: makeMe({ roles: ["employee"], workspaces: ["me"] }),
    });
    expect(await screen.findByText("indisponible")).toBeInTheDocument();
  });
});

describe("workspaceFor", () => {
  it("never sends anyone to a workspace they do not have", () => {
    expect(workspaceFor("hr", ["me"])).toBe("me");
    expect(workspaceFor("overview", ["me"])).toBe("me");
    expect(workspaceFor("team", ["me", "hr"])).toBe("hr");
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/RequestPage.test.tsx src/features/requests/RequestRedirect.test.tsx`

Expected: FAIL with "Failed to resolve import "./RequestPage"" and "Failed to resolve import "./RequestRedirect"".

- [ ] **Step 4: Write the "one step away" blocks**

`frontend/src/features/requests/views/parts.tsx`:

```tsx
import type { Lang } from "@/i18n";
import { formatDateRange, formatDateTime, formatDays, formatHours } from "@/lib/format";
import { useRequestHistory } from "../api";
import { Gate } from "../Gate";
import { useRequestsText, type Translate } from "../platform";
import type { AmendmentOut, AttachmentOut, StepOut, Unit } from "../types";

export function stepWho(step: StepOut, t: Translate): string {
  const names = step.approvers.join(", ");
  if (step.rule === "hr_role") return t("steps.who.hr");
  if (step.rule === "line_manager") return names ? t("steps.who.manager", { names }) : t("steps.who.managerNone");
  return names || t("steps.who.nobody");
}

/** "Approved by Sami Ben Ali on ...", with how the decision was given when it was recorded by HR. */
export function stepOutcome(step: StepOut, t: Translate, lang: Lang): string {
  const decided = step.status === "approved" || step.status === "rejected" || step.status === "returned";
  if (!decided) return t(`steps.status.${step.status}`);
  const outcome = t(`steps.status.${step.status}`, {
    name: step.decided_by ?? "—",
    date: step.decided_at ? formatDateTime(step.decided_at, lang) : "—",
  });
  if (!step.recorded_by || !step.channel) return outcome;
  const how = t("steps.recorded", { recorder: step.recorded_by, channel: t(`steps.channel.${step.channel}`) });
  return `${outcome} ${how}`;
}

/** Who decided what, when, with their comment. The latest sending first when there were several. */
export function StepList({ steps }: { steps: StepOut[] }) {
  const { t, lang } = useRequestsText();
  if (steps.length === 0) return <p className="text-body text-muted-foreground">{t("steps.none")}</p>;
  const rounds = [...new Set(steps.map((step) => step.round))].sort((a, b) => b - a);
  return (
    <div className="flex flex-col gap-4">
      {rounds.map((round) => (
        <section key={round}>
          {rounds.length > 1 && (
            <h3 className="text-caption font-medium text-muted-foreground">{t("steps.round", { round })}</h3>
          )}
          <ol className="mt-1 flex flex-col gap-3">
            {steps
              .filter((step) => step.round === round)
              .sort((a, b) => a.position - b.position)
              .map((step) => (
                <li key={step.id} className="text-body">
                  <p className="font-medium">
                    {stepWho(step, t)}
                    {step.amendment_public_id ? ` (${t("steps.forChange")})` : ""}
                  </p>
                  <p className="text-text-secondary">{stepOutcome(step, t, lang)}</p>
                  {step.comment && <p className="text-text-secondary">{`« ${step.comment} »`}</p>}
                </li>
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** The files the viewer may see, each served as a download through the API. */
export function FileList({ attachments }: { attachments: AttachmentOut[] }) {
  const { t, lang } = useRequestsText();
  if (attachments.length === 0) return <p className="text-body text-muted-foreground">{t("view.noFiles")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {attachments.map((file) => (
        <li key={file.public_id} className="text-body">
          <a
            href={`/api/v1/attachments/${file.public_id}/download`}
            download
            className="font-medium text-primary underline underline-offset-2"
          >
            {file.name}
          </a>
          <span className="block text-caption text-muted-foreground">
            {t("files.meta", {
              kind: t(`files.kind.${file.kind}`),
              by: file.uploaded_by,
              date: formatDateTime(file.uploaded_at, lang),
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AmendmentList({ amendments, unit }: { amendments: AmendmentOut[]; unit: Unit }) {
  const { t, lang } = useRequestsText();
  const amount = (value: string) => (unit === "hour" ? formatHours(value, lang) : formatDays(value, lang));
  return (
    <ul className="flex flex-col gap-3">
      {amendments.map((amendment) => (
        <li key={amendment.public_id} className="text-body">
          <p className="font-medium">
            {`${t(`view.amendmentKind.${amendment.kind}`)} · ${t(`view.amendmentStatus.${amendment.status}`)}`}
          </p>
          {amendment.kind === "change" && amendment.new_start_date && amendment.new_end_date && (
            <p className="text-text-secondary">
              {t("view.amendmentNew", {
                range: formatDateRange(amendment.new_start_date, amendment.new_end_date, lang),
                quantity: amendment.new_quantity ? amount(amendment.new_quantity) : "",
              })}
            </p>
          )}
          {amendment.reason && (
            <p className="text-text-secondary">{t("view.amendmentReason", { reason: amendment.reason })}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The full history, already filtered by the server for this viewer. */
export function HistoryList({ id }: { id: string }) {
  const { t, lang } = useRequestsText();
  const history = useRequestHistory(id);
  return (
    <Gate query={history}>
      {(items) =>
        items.length === 0 ? (
          <p className="text-body text-muted-foreground">{t("view.historyEmpty")}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {items.map((item, index) => (
              <li key={`${item.at}-${index}`} className="text-body">
                <span className="block text-caption text-muted-foreground">
                  {`${formatDateTime(item.at, lang)} · ${item.actor ?? t("view.system")}`}
                </span>
                {item.summary}
              </li>
            ))}
          </ol>
        )
      }
    </Gate>
  );
}
```

- [ ] **Step 5: Write the shared page body**

`frontend/src/features/requests/RequestView.tsx`:

```tsx
import type { ReactNode } from "react";
import type { To } from "react-router";
import { Disclosure, PageHeader } from "@/components";
import { useRequestsText } from "./platform";
import { nextStep } from "./status";
import { StatusSentence } from "./StatusSentence";
import { describeQuantity, describeWhen } from "./text";
import type { RequestDetail } from "./types";
import { AmendmentList, FileList, HistoryList, StepList } from "./views/parts";

export interface RequestViewProps {
  request: RequestDetail;
  back: To;
  /** What this viewer needs in order to decide, shown in the summary. */
  context?: ReactNode;
  /** The actions available now. The first may be the page's one primary action. */
  actions?: ReactNode;
  /** Show the comment in the summary instead of one step away (manager and HR views). */
  commentFirst?: boolean;
  /** The view shows the files itself, in the summary (HR view): no files block one step away. */
  filesFirst?: boolean;
  /** Further "one step away" blocks. */
  extra?: ReactNode;
}

/**
 * The body of a request page for every role (M6): first a summary with where the request stands
 * and the actions available; steps, comment and files, changes and history one step away.
 * It renders what the API returned and nothing else: a comment or a file the viewer may not see
 * is simply absent from `request`.
 */
export function RequestView({
  request,
  back,
  context,
  actions,
  commentFirst = false,
  filesFirst = false,
  extra,
}: RequestViewProps) {
  const { t, lang } = useRequestsText();
  const mine = request.viewer.relation === "owner";
  const next = nextStep(request, t);
  const hasComment = request.comment !== null && request.comment !== "";
  const showCommentAndFiles = !filesFirst && (request.attachments.length > 0 || (hasComment && !commentFirst));
  const filesTitle = mine ? "view.myCommentAndFiles" : commentFirst ? "view.files" : "view.commentAndFiles";

  return (
    <>
      <PageHeader title={request.type.name} back={back} />
      <section aria-label={t("view.summary")} className="rounded-xl border border-border bg-card px-6 py-5">
        {!mine && (
          <p className="text-body">
            <span className="font-semibold">{request.employee.name}</span>
            <span className="text-muted-foreground">{` · ${request.employee.department}`}</span>
          </p>
        )}
        <p className="text-section font-semibold">{describeWhen(request, t, lang)}</p>
        <p className="text-body text-text-secondary">
          {describeQuantity(request, lang)}
          {request.event ? ` · ${t("view.event", { name: request.event.name })}` : ""}
        </p>
        <div className="mt-3">
          <StatusSentence request={request} detail />
        </div>
        {next && <p className="mt-2 text-body text-text-secondary">{next}</p>}
        {request.has_override && <p className="mt-2 text-caption text-muted-foreground">{t("view.exception")}</p>}
        {request.created_by_hr && !request.has_override && (
          <p className="mt-2 text-caption text-muted-foreground">{t("view.enteredByHr")}</p>
        )}
        {commentFirst && hasComment && (
          <div className="mt-3">
            <h2 className="text-caption font-medium text-muted-foreground">{t("view.comment")}</h2>
            <p className="text-body">{request.comment}</p>
          </div>
        )}
        {context}
        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
      </section>

      <div className="mt-4 flex flex-col gap-2">
        <Disclosure title={t("view.steps")}>
          <StepList steps={request.steps} />
        </Disclosure>
        {showCommentAndFiles && (
          <Disclosure title={t(filesTitle)}>
            {hasComment && !commentFirst && <p className="mb-3 text-body">{request.comment}</p>}
            <FileList attachments={request.attachments} />
          </Disclosure>
        )}
        {request.amendments.length > 0 && (
          <Disclosure title={t("view.changes")}>
            <AmendmentList amendments={request.amendments} unit={request.type.unit} />
          </Disclosure>
        )}
        <Disclosure title={t("view.history")}>
          <HistoryList id={request.public_id} />
        </Disclosure>
        {extra}
      </div>
    </>
  );
}
```

- [ ] **Step 6: Write the sheet that adds a file**

`frontend/src/features/requests/AddFileSheet.tsx`:

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { FieldProblem } from "@/api/problem";
import { FileField, FormSummary, TaskSheet, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { useAttachFile } from "./api";
import { fileProblem } from "./form/schema";
import { useSingleFlight } from "./form/useSingleFlight";
import { useRequestsText } from "./platform";
import { byName, details, serverProblems } from "./problems";

interface AddFileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  /** The title of the sheet, which is also the wording of the button that opened it. */
  title: string;
  /** The label of the file input: "Medical certificate", "Proof" or "File". */
  label: string;
}

interface Values {
  file: File | null;
}

const FILE_CODES = {
  "files.too_large": "file",
  "files.type_not_allowed": "file",
  "files.content_mismatch": "file",
  "files.empty": "file",
} as const;

/** A focused task: attach one file to a request (by its owner, or by HR on the employee's behalf). */
export function AddFileSheet({ open, onOpenChange, requestId, title, label }: AddFileSheetProps) {
  const { t } = useRequestsText();
  const attach = useAttachFile();
  const form = useForm<Values>({ defaultValues: { file: null } });
  const [loose, setLoose] = useState<FieldProblem[]>([]);

  const [add, adding] = useSingleFlight(async (values: Values) => {
    const message = values.file ? fileProblem(values.file, t) : t("addFile.required");
    if (!values.file || message) {
      form.setError("file", { type: "client", message: message ?? t("addFile.required") });
      return;
    }
    try {
      await attach.mutateAsync({ id: requestId, file: values.file });
      toast(t("addFile.done"));
      form.reset({ file: null });
      setLoose([]);
      onOpenChange(false);
    } catch (error) {
      setLoose(serverProblems(form, error, t, byName<Values>(["file"], FILE_CODES)));
    }
  });

  return (
    <TaskSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="primary" aria-busy={adding} onClick={form.handleSubmit(add)}>
            {t("addFile.add")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
        </>
      }
    >
      <form noValidate onSubmit={form.handleSubmit(add)} className="flex flex-col gap-4">
        <FormSummary problems={details(loose)} />
        <FileField control={form.control} name="file" label={label} hint={t("form.fileHint")} accept=".pdf,.jpg,.jpeg,.png" />
      </form>
    </TaskSheet>
  );
}
```

- [ ] **Step 7: Write the owner's view**

`frontend/src/features/requests/views/RequestMineView.tsx`:

```tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ProblemError, type FieldProblem } from "@/api/problem";
import { backToList, FormSummary, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { formatDays } from "@/lib/format";
import { AddFileSheet } from "../AddFileSheet";
import { isConflict, useSubmitRequest, useWithdrawAmendment } from "../api";
import { useSingleFlight } from "../form/useSingleFlight";
import { useRequestsText } from "../platform";
import { details } from "../problems";
import { RequestView } from "../RequestView";
import type { RequestAction, RequestDetail } from "../types";
import { useUndoable } from "../undoable";

/** A request seen by the person who made it (UI 5.4). Every control comes from `viewer.actions`. */
export default function RequestMineView({ request }: { request: RequestDetail }) {
  const { t, lang } = useRequestsText();
  const navigate = useNavigate();
  const { withdraw, discard } = useUndoable();
  const submit = useSubmitRequest();
  const withdrawAmendment = useWithdrawAmendment();
  const [problems, setProblems] = useState<FieldProblem[]>([]);
  const [addingFile, setAddingFile] = useState(false);

  const id = request.public_id;
  const can = (action: RequestAction) => request.viewer.actions.includes(action);
  // The owner is shown the balance when the API gives it; who else is away is not theirs to see (UI 10.2).
  const balance = request.decision_context?.balance ?? null;
  const documentStatus = request.certificate?.status;
  const documentWaiting = documentStatus === "due" || documentStatus === "overdue" || documentStatus === "missing";
  const attachTitle =
    documentStatus === "missing" ? t("mine.addProof") : documentWaiting ? t("mine.addCertificate") : t("mine.addFile");
  const attachLabel =
    documentStatus === "missing" ? t("form.proof") : documentWaiting ? t("form.certificate") : t("addFile.label");

  const primary = can("submit") && request.status === "draft"
    ? "submit"
    : can("edit") && request.status === "returned"
      ? "resend"
      : can("attach") && documentWaiting
        ? "attach"
        : null;

  const [send, sending] = useSingleFlight(async () => {
    try {
      await submit.mutateAsync({ id, version: request.version });
      setProblems([]);
      toast(t("form.sent"));
    } catch (error) {
      if (error instanceof ProblemError && error.status !== 409) setProblems(error.errors);
      else {
        const detail = t(isConflict(error) ? "common:concurrent" : "errors:unexpected");
        setProblems([{ field: null, code: "core.unexpected", detail, params: {} }]);
      }
    }
  });

  const [withdrawChange, withdrawingChange] = useSingleFlight(async () => {
    if (!request.amendment) return;
    try {
      await withdrawAmendment.mutateAsync(request.amendment.public_id);
      toast(t("mine.changeWithdrawn"));
    } catch (error) {
      toast(t(isConflict(error) ? "common:concurrent" : "errors:unexpected"));
    }
  });

  const actions = (
    <>
      {primary === "submit" && (
        <Button variant="primary" aria-busy={sending} onClick={() => void send()}>
          {t("common.send")}
        </Button>
      )}
      {primary === "resend" && (
        <Button asChild variant="primary">
          <Link to={`/me/requests/${id}/edit`}>{t("mine.editAndResend")}</Link>
        </Button>
      )}
      {primary === "attach" && (
        <Button variant="primary" onClick={() => setAddingFile(true)}>
          {attachTitle}
        </Button>
      )}
      {can("edit") && primary !== "resend" && (
        <Button asChild variant="secondary">
          <Link to={`/me/requests/${id}/edit`}>{t("common.edit")}</Link>
        </Button>
      )}
      {can("amend") && (
        <>
          <Button asChild variant="secondary">
            <Link to={`/me/requests/${id}/change?kind=change`}>{t("mine.changeDates")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={`/me/requests/${id}/change?kind=cancel`}>{t("mine.cancelRequest")}</Link>
          </Button>
        </>
      )}
      {can("attach") && primary !== "attach" && (
        <Button variant="secondary" onClick={() => setAddingFile(true)}>
          {attachTitle}
        </Button>
      )}
      {can("withdraw_amendment") && request.amendment && (
        <Button variant="secondary" aria-busy={withdrawingChange} onClick={() => void withdrawChange()}>
          {t("mine.withdrawChange")}
        </Button>
      )}
      {can("withdraw") && (
        <Button
          variant="ghost"
          onClick={() => {
            withdraw(request);
            navigate("/me/requests");
          }}
        >
          {t("common.withdraw")}
        </Button>
      )}
      {can("discard") && (
        <Button
          variant="ghost"
          onClick={() => {
            discard(request);
            navigate("/me/requests");
          }}
        >
          {t("common.discard")}
        </Button>
      )}
    </>
  );

  return (
    <>
      <RequestView
        request={request}
        back={backToList("/me/requests")}
        context={
          <>
            <FormSummary problems={details(problems)} />
            {balance && (
              <p className="mt-3 text-body text-text-secondary">
                {t("mine.balance", { now: formatDays(balance.now, lang), after: formatDays(balance.after, lang) })}
              </p>
            )}
          </>
        }
        actions={request.viewer.actions.length > 0 ? actions : undefined}
      />
      {can("attach") && (
        <AddFileSheet open={addingFile} onOpenChange={setAddingFile} requestId={id} title={attachTitle} label={attachLabel} />
      )}
    </>
  );
}
```

- [ ] **Step 8: Write the registry, the page and the redirect**

`frontend/src/features/requests/views/registry.ts`:

```ts
import type { ComponentType } from "react";
import type { RequestDetail, ViewerRelation } from "../types";
import RequestMineView from "./RequestMineView";

export type RequestViewComponent = ComponentType<{ request: RequestDetail }>;

/**
 * The view of a request for each relation of the viewer to it (R3).
 * A task adds its view by adding a line. A relation without a line gets the read-only view.
 */
export const VIEWS: Partial<Record<ViewerRelation, RequestViewComponent>> = {
  owner: RequestMineView,
};
```

`frontend/src/features/requests/RequestPage.tsx`:

```tsx
import { useParams } from "react-router";
import { backToList } from "@/components";
import { useRequest } from "./api";
import { Gate } from "./Gate";
import { useWorkspacePrefix } from "./platform";
import { RequestView } from "./RequestView";
import type { RequestDetail } from "./types";
import { VIEWS } from "./views/registry";

function ReadOnlyView({ request }: { request: RequestDetail }) {
  const prefix = useWorkspacePrefix();
  return <RequestView request={request} back={backToList(`/${prefix}/requests`)} />;
}

/** /<workspace>/requests/:id : one request, presented from the viewer's angle. */
export default function RequestPage() {
  const { id = "" } = useParams();
  const prefix = useWorkspacePrefix();
  const query = useRequest(id);
  return (
    <Gate query={query}>
      {(request) => {
        // Overview is read-only whatever the viewer could do elsewhere (UI 8): a request opened
        // there is shown with the overview's view, and decisions are taken in My team.
        const relation = prefix === "overview" ? "overview" : request.viewer.relation;
        const View = VIEWS[relation] ?? ReadOnlyView;
        return <View request={request} />;
      }}
    </Gate>
  );
}
```

`frontend/src/features/requests/RequestRedirect.tsx`:

```tsx
import { Navigate, useParams } from "react-router";
import { useRequest } from "./api";
import { Gate } from "./Gate";
import { useViewer, workspaceFor } from "./platform";

/**
 * /requests/:id : the address used by notifications and links (UI 11). It opens the request in
 * the workspace that matches the viewer, so the shell shows that workspace's navigation.
 */
export default function RequestRedirect() {
  const { id = "" } = useParams();
  const viewer = useViewer();
  const query = useRequest(id);
  return (
    <Gate query={query}>
      {(request) => (
        <Navigate to={`/${workspaceFor(request.viewer.relation, viewer.workspaces)}/requests/${id}`} replace />
      )}
    </Gate>
  );
}
```

In `frontend/src/workspaces/me/routes.tsx`, add the import and append one element to `meRoutes`:

```tsx
import RequestPage from "@/features/requests/RequestPage";
```

```tsx
  { path: "requests/:id", element: <RequestPage /> },
```

In `frontend/src/app/sharedRoutes.tsx` (plan 01b's extension point for pages inside the shell that belong to no workspace; its paths are absolute), add the import and append one element to the `sharedRoutes` array:

```tsx
import RequestRedirect from "@/features/requests/RequestRedirect";
```

```tsx
  { path: "/requests/:id", element: <RequestRedirect /> },
```

Check that it is registered: `docker compose run --rm web sh -c "grep -n 'requests/:id' src/app/sharedRoutes.tsx"` prints the line just added. `src/app/router.tsx` is not edited.

- [ ] **Step 9: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/RequestPage.test.tsx src/features/requests/RequestRedirect.test.tsx src/i18n/parity.test.ts`

Expected: PASS (28 and 9 tests).

`Disclosure` mounts its content only while open, so the history is asked for when the reader opens it and not before; the last test of the file relies on that.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/requests frontend/src/workspaces/me/routes.tsx frontend/src/app/sharedRoutes.tsx frontend/src/i18n/locales
git commit -m "feat(requests): request page, owner's view and the /requests/:id redirect"
```

---

### Task 9: Change or cancel an approved request

UI 5.5. An approved request that has not started is changed or cancelled through an amendment, which follows the same chain (REQ-08). The page is allowed only when `viewer.actions` contains `amend`.

**Files:**
- Create: `frontend/src/features/requests/dates.ts`
- Create: `frontend/src/features/requests/mine/ChangeOrCancelPage.tsx`
- Modify: `frontend/src/workspaces/me/routes.tsx` (append one route)
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (section `change`)
- Test: `frontend/src/features/requests/dates.test.ts`
- Test: `frontend/src/features/requests/mine/ChangeOrCancelPage.test.tsx`

**Interfaces:**
- Consumes: `useRequest`, `useRequestTypes`, `usePreview`, `useOpenAmendment` (Task 1); `chainSentence`, `useDebounced`, `useSingleFlight` (Task 4); `serverProblems`, `byName`, `details` (Task 4); `describeWhen`, `describeQuantity` (Task 2); `Gate`.
- Produces:
  - `dates.ts`, shared with HR's correction sheet (Task 13): `interface DateValues { start_date; end_date; starts_at_midday; ends_at_midday; start_time; end_time }`, `hhmm(time: string | null): string`, `currentDates(request: RequestOut): DateValues`, `sameAsCurrent(values: DateValues, request: RequestOut): boolean`, `datesOf(values: DateValues, hourly: boolean)` (the dates as the API takes them), `datesReady(values: DateValues, hourly: boolean): boolean`, `dateIssues(values: DateValues, hourly: boolean, t: Translate): [keyof DateValues, string][]`, `DATE_FIELD_BY_CODE: Record<string, keyof DateValues>` (the date input a server problem belongs to).
  - `ChangeOrCancelPage` (default export) at `/me/requests/:id/change`. `?kind=cancel` opens it on the cancellation.

What the page shows of the change, and where each figure comes from:

| Shown | Source |
|---|---|
| The new count | `quantity` of `requests/preview` for the new dates |
| The effect on the balance | New count minus the current `quantity`, for a type whose `balance_effect` is `deducts_annual`. It is a difference of two figures the server computed, and it reads the same whether or not balances are in service yet. |
| Who will decide | `chain` of the same preview |

The preview is asked with `request: <public id>` (plan 03a, contract note 8), so the approved request is not held against its own change. Problems of the preview are shown above the form; `POST …/amendments` validates for real and its problems are shown on their fields.

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "change": {
    "title": "Modifier une demande approuvée",
    "current": "Demande actuelle : {{when}} ({{quantity}})",
    "kindLegend": "Que voulez-vous faire ?",
    "stays": "L'original reste valable tant que la modification n'est pas approuvée.",
    "newCount": "Nouveau décompte",
    "balanceEffect": "Effet sur votre solde",
    "uses": "Utilise {{amount}} de plus.",
    "gives": "Rend {{amount}}.",
    "same": "Aucun changement.",
    "cancelGives": "Une fois approuvée, l'annulation rend {{amount}} à votre solde.",
    "reason": "Motif",
    "unchanged": "Ce sont les dates actuelles de la demande. Changez-les, ou choisissez l'annulation.",
    "sendChange": "Envoyer la modification",
    "sendCancel": "Demander l'annulation",
    "sentChange": "Modification envoyée.",
    "sentCancel": "Annulation demandée."
  }
```

English:

```json
  "change": {
    "title": "Change an approved request",
    "current": "Current request: {{when}} ({{quantity}})",
    "kindLegend": "What do you want to do?",
    "stays": "The original stays valid until the change is approved.",
    "newCount": "New count",
    "balanceEffect": "Effect on your balance",
    "uses": "Uses {{amount}} more.",
    "gives": "Gives back {{amount}}.",
    "same": "No change.",
    "cancelGives": "Once approved, the cancellation gives {{amount}} back to your balance.",
    "reason": "Reason",
    "unchanged": "These are the request's current dates. Change them, or choose the cancellation.",
    "sendChange": "Send the change",
    "sendCancel": "Ask for the cancellation",
    "sentChange": "Change sent.",
    "sentCancel": "Cancellation requested."
  }
```

- [ ] **Step 2: Write the failing tests**

`frontend/src/features/requests/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { makeRequest } from "@/features/requests/fixtures";
import { currentDates, dateIssues, datesOf, datesReady, hhmm, sameAsCurrent } from "./dates";
import type { Translate } from "./platform";

const t: Translate = (key, options) => String(i18n.t(key, { ns: "requests", lng: "fr", ...options }));
const leave = makeRequest();
const permission = makeRequest({
  type: { code: "permission", unit: "hour" },
  end_date: "2026-11-09",
  start_time: "14:00:00",
  end_time: "16:00:00",
});

describe("the dates of a change or a correction", () => {
  it("reads the current dates of a request, times without seconds", () => {
    expect(currentDates(leave)).toEqual({
      start_date: "2026-11-09",
      end_date: "2026-11-11",
      starts_at_midday: false,
      ends_at_midday: false,
      start_time: "",
      end_time: "",
    });
    expect(currentDates(permission)).toMatchObject({ start_time: "14:00", end_time: "16:00" });
    expect(hhmm(null)).toBe("");
  });

  it("knows when nothing changed", () => {
    expect(sameAsCurrent(currentDates(leave), leave)).toBe(true);
    expect(sameAsCurrent({ ...currentDates(leave), end_date: "2026-11-12" }, leave)).toBe(false);
    expect(sameAsCurrent({ ...currentDates(leave), ends_at_midday: true }, leave)).toBe(false);
    expect(sameAsCurrent(currentDates(permission), permission)).toBe(true);
    expect(sameAsCurrent({ ...currentDates(permission), end_time: "17:00" }, permission)).toBe(false);
  });

  it("gives the dates as the API takes them: a permission has one date and two times", () => {
    expect(datesOf({ ...currentDates(leave), starts_at_midday: true }, false)).toEqual({
      start_date: "2026-11-09",
      end_date: "2026-11-11",
      starts_at_midday: true,
      ends_at_midday: false,
      start_time: null,
      end_time: null,
    });
    expect(datesOf({ ...currentDates(permission), end_date: "", ends_at_midday: true }, true)).toEqual({
      start_date: "2026-11-09",
      end_date: "2026-11-09",
      starts_at_midday: false,
      ends_at_midday: false,
      start_time: "14:00",
      end_time: "16:00",
    });
  });

  it("knows when the dates are coherent enough to ask the server", () => {
    expect(datesReady(currentDates(leave), false)).toBe(true);
    expect(datesReady({ ...currentDates(leave), end_date: "2026-11-01" }, false)).toBe(false);
    expect(datesReady({ ...currentDates(leave), start_date: "" }, false)).toBe(false);
    expect(datesReady(currentDates(permission), true)).toBe(true);
    expect(datesReady({ ...currentDates(permission), end_time: "13:00" }, true)).toBe(false);
  });

  it("says what cannot be right, on the input concerned", () => {
    expect(dateIssues(currentDates(leave), false, t)).toEqual([]);
    expect(dateIssues({ ...currentDates(leave), end_date: "2026-11-01" }, false, t)).toEqual([
      ["end_date", "La fin doit être le même jour que le début, ou après."],
    ]);
    expect(
      dateIssues({ ...currentDates(leave), end_date: "2026-11-09", starts_at_midday: true, ends_at_midday: true }, false, t),
    ).toEqual([["ends_at_midday", "Pour une seule journée, choisissez le matin ou l'après-midi, pas les deux."]]);
    expect(dateIssues({ ...currentDates(permission), end_time: "14:00" }, true, t)).toEqual([
      ["end_time", "L'heure de fin doit être après l'heure de début."],
    ]);
    expect(dateIssues({ ...currentDates(leave), start_date: "", end_date: "" }, false, t)).toEqual([
      ["start_date", "Ce champ est nécessaire."],
      ["end_date", "Ce champ est nécessaire."],
    ]);
  });
});
```

`frontend/src/features/requests/mine/ChangeOrCancelPage.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeMe } from "@/test/fixtures";
import { setDate, setText, setTime, toggle } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makePreview, makeRequestDetail, problemResponse, TYPES, type DetailOverrides } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import type { Preview, PreviewBody } from "../types";
import ChangeOrCancelPage from "./ChangeOrCancelPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const me = makeMe({ roles: ["employee"], workspaces: ["me"] });
const approved: DetailOverrides = {
  status: "approved",
  state: { key: "approved", waiting_on: [] },
  viewer: { actions: ["amend"] },
};

function serve(detail: DetailOverrides = approved, preview: (body: PreviewBody) => Preview = () => makePreview()) {
  const calls = { amendments: [] as unknown[], previews: [] as PreviewBody[] };
  server.use(
    http.get("/api/v1/requests/req-1", () => HttpResponse.json(makeRequestDetail(detail))),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.post("/api/v1/requests/preview", async ({ request }) => {
      const body = (await request.json()) as PreviewBody;
      calls.previews.push(body);
      return HttpResponse.json(preview(body));
    }),
    http.post("/api/v1/requests/req-1/amendments", async ({ request }) => {
      calls.amendments.push(await request.json());
      return HttpResponse.json(makeRequestDetail(detail), { status: 201 });
    }),
  );
  return calls;
}

const open = (search = "") =>
  renderApp(<ChangeOrCancelPage />, { route: `/me/requests/req-1/change${search}`, path: "/me/requests/:id/change", me });

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("Change or cancel an approved request (UI 5.5)", () => {
  it("recalls the current request and states that it stays valid until the change is approved", async () => {
    serve();
    open();
    expect(await screen.findByText("Demande actuelle : R(2026-11-09..2026-11-11) (3 j)")).toBeInTheDocument();
    expect(screen.getByText("L'original reste valable tant que la modification n'est pas approuvée.")).toBeInTheDocument();
    expect(screen.getByLabelText("Changer les dates")).toBeChecked();
    expect(screen.getByLabelText("Début")).toHaveValue("2026-11-09");
    expect(screen.getByLabelText("Fin")).toHaveValue("2026-11-11");
  });

  it("shows the new count, the effect on the balance and who will decide, then sends the change", async () => {
    const calls = serve(approved, (body) => makePreview({ quantity: body.end_date === "2026-11-19" ? "4.00" : "3.00" }));
    open();
    await screen.findByLabelText("Début");
    setDate("Début", "2026-11-16");
    setDate("Fin", "2026-11-19");
    expect(await screen.findByText("4 j")).toBeInTheDocument();
    expect(screen.getByText("Utilise 1 j de plus.")).toBeInTheDocument();
    expect(screen.getByText("Votre responsable, Sami Ben Ali, puis les RH")).toBeInTheDocument();

    setText("Motif", "Vol décalé");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer la modification" }));
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/req-1"));
    expect(calls.amendments).toEqual([
      {
        kind: "change",
        start_date: "2026-11-16",
        end_date: "2026-11-19",
        starts_at_midday: false,
        ends_at_midday: false,
        start_time: null,
        end_time: null,
        reason: "Vol décalé",
      },
    ]);
    expect(toast).toHaveBeenCalledWith("Modification envoyée.");
  });

  it("says when a shorter leave gives days back, and when nothing changes for the balance", async () => {
    serve(approved, (body) => makePreview({ quantity: body.end_date === "2026-11-10" ? "2.00" : "3.00" }));
    open();
    await screen.findByLabelText("Début");
    setDate("Fin", "2026-11-10");
    expect(await screen.findByText("Rend 1 j.")).toBeInTheDocument();
    setDate("Début", "2026-11-16");
    setDate("Fin", "2026-11-18");
    expect(await screen.findByText("Aucun changement.")).toBeInTheDocument();
  });

  it("does not speak of the balance for a type that does not use it", async () => {
    serve({ ...approved, type: { code: "remote", name: "Télétravail", calendar_label: "remote" } });
    open();
    await screen.findByLabelText("Début");
    setDate("Fin", "2026-11-10");
    await screen.findByText("Votre responsable, Sami Ben Ali, puis les RH");
    expect(screen.queryByText("Effet sur votre solde")).not.toBeInTheDocument();
  });

  it("cannot be confirmed without a reason", async () => {
    const calls = serve();
    open();
    await screen.findByLabelText("Début");
    setDate("Fin", "2026-11-12");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer la modification" }));
    expect(await screen.findByText("Indiquez le motif : il est obligatoire.")).toBeInTheDocument();
    expect(calls.amendments).toHaveLength(0);
  });

  it("refuses to send dates that did not change", async () => {
    const calls = serve();
    open();
    await screen.findByLabelText("Début");
    setText("Motif", "Erreur");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer la modification" }));
    expect(
      await screen.findByText("Ce sont les dates actuelles de la demande. Changez-les, ou choisissez l'annulation."),
    ).toBeInTheDocument();
    expect(calls.amendments).toHaveLength(0);
  });

  it("asks for a cancellation with a reason only", async () => {
    const calls = serve();
    open("?kind=cancel");
    expect(await screen.findByLabelText("Annuler la demande")).toBeChecked();
    expect(screen.queryByLabelText("Début")).not.toBeInTheDocument();
    expect(await screen.findByText("Une fois approuvée, l'annulation rend 3 j à votre solde.")).toBeInTheDocument();
    setText("Motif", "Voyage annulé");
    await userEvent.click(screen.getByRole("button", { name: "Demander l'annulation" }));
    await waitFor(() => expect(calls.amendments).toEqual([{ kind: "cancel", reason: "Voyage annulé" }]));
    expect(toast).toHaveBeenCalledWith("Annulation demandée.");
  });

  it("switches between the change and the cancellation", async () => {
    serve();
    open();
    await userEvent.click(await screen.findByLabelText("Annuler la demande"));
    expect(screen.queryByLabelText("Début")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Demander l'annulation" })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Changer les dates"));
    expect(screen.getByLabelText("Début")).toBeInTheDocument();
  });

  it("asks for the preview with the request's own id, and shows what the server already objects to", async () => {
    const calls = serve(approved, () =>
      makePreview({
        problems: [{ field: null, code: "request.notice", detail: "Prévenez au moins trois jours avant.", params: {} }],
      }),
    );
    open();
    await screen.findByLabelText("Début");
    setDate("Fin", "2026-11-12");
    expect(await screen.findByText("Prévenez au moins trois jours avant.")).toBeInTheDocument();
    expect(calls.previews.at(-1)).toMatchObject({ request: "req-1", type: "annual", end_date: "2026-11-12" });
  });

  it("shows on its field what the server refuses when the change is sent", async () => {
    serve();
    server.use(
      http.post("/api/v1/requests/req-1/amendments", () =>
        problemResponse(400, "validation", "Ces dates chevauchent votre télétravail du 17 novembre.", [
          { field: "start_date", code: "request.overlap", detail: "Ces dates chevauchent votre télétravail du 17 novembre.", params: {} },
          { field: null, code: "request.amendment_open", detail: "Une modification est déjà en cours pour cette demande.", params: {} },
        ]),
      ),
    );
    open();
    await screen.findByLabelText("Début");
    setDate("Début", "2026-11-16");
    setDate("Fin", "2026-11-18");
    setText("Motif", "Vol décalé");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer la modification" }));
    expect(await screen.findByText("Ces dates chevauchent votre télétravail du 17 novembre.")).toBeInTheDocument();
    expect(screen.getByText("Une modification est déjà en cours pour cette demande.")).toBeInTheDocument();
    expect(screen.getByLabelText("Motif")).toHaveValue("Vol décalé");
  });

  it("changes the date and the times of a permission", async () => {
    const calls = serve({
      ...approved,
      type: { code: "permission", name: "Autorisation de sortie", unit: "hour", calendar_label: "hidden" },
      end_date: "2026-11-09",
      start_time: "14:00:00",
      end_time: "16:00:00",
      quantity: "2.00",
    });
    open();
    expect(await screen.findByLabelText("De")).toHaveValue("14:00");
    expect(screen.queryByLabelText("Fin")).not.toBeInTheDocument();
    setTime("À", "17:00");
    setText("Motif", "Rendez-vous plus long");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer la modification" }));
    await waitFor(() => expect(calls.amendments).toHaveLength(1));
    expect(calls.amendments[0]).toMatchObject({
      kind: "change",
      start_date: "2026-11-09",
      end_date: "2026-11-09",
      start_time: "14:00",
      end_time: "17:00",
    });
  });

  it("goes back to the request when it can no longer be changed", async () => {
    serve({ ...approved, viewer: { actions: [] } });
    open();
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/me/requests/req-1"));
  });

  it("refuses a single day flagged at both ends, next to the half-day choices", async () => {
    const calls = serve({ ...approved, end_date: "2026-11-09", quantity: "1.00" });
    open();
    // The half-day choices appear once the type is known to allow them.
    await screen.findByLabelText("Commencer à midi le premier jour");
    await toggle("Commencer à midi le premier jour");
    await toggle("Finir à midi le dernier jour");
    setText("Motif", "Rendez-vous déplacé");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer la modification" }));
    expect(
      await screen.findByText("Pour une seule journée, choisissez le matin ou l'après-midi, pas les deux."),
    ).toBeInTheDocument();
    expect(calls.amendments).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/dates.test.ts src/features/requests/mine/ChangeOrCancelPage.test.tsx`

Expected: FAIL with "Failed to resolve import "./dates"" and "Failed to resolve import "./ChangeOrCancelPage"".

- [ ] **Step 4: Write the date helpers, then the page, and register its route**

`frontend/src/features/requests/dates.ts`:

```ts
import type { Translate } from "./platform";
import type { RequestOut } from "./types";

/** The dates of a request as a form edits them: in an amendment by its owner, in a correction by HR. */
export interface DateValues {
  start_date: string;
  end_date: string;
  starts_at_midday: boolean;
  ends_at_midday: boolean;
  start_time: string;
  end_time: string;
}

/** The date input a server problem belongs to, by its code, when the server names no input. */
export const DATE_FIELD_BY_CODE: Record<string, keyof DateValues> = {
  "request.end_before_start": "end_date",
  "request.no_working_day": "start_date",
  "request.overlap": "start_date",
  "request.past_dates": "start_date",
  "request.notice": "start_date",
  "request.balance_insufficient": "end_date",
  "request.cap_exceeded": "start_date",
  "request.event_days_exceeded": "end_date",
  "request.permission_times": "end_time",
  "request.permission_non_working_day": "start_date",
  "request.permission_overlaps_absence": "start_date",
  "request.half_day_on_non_working_day": "starts_at_midday",
  "request.half_day_both_ends": "ends_at_midday",
  "request.dates_required": "start_date",
  "request.nothing_to_change": "start_date",
};

/** "14:00:00" -> "14:00"; null -> "". */
export const hhmm = (time: string | null) => (time ?? "").slice(0, 5);

export function currentDates(request: RequestOut): DateValues {
  return {
    start_date: request.start_date,
    end_date: request.end_date,
    starts_at_midday: request.starts_at_midday,
    ends_at_midday: request.ends_at_midday,
    start_time: hhmm(request.start_time),
    end_time: hhmm(request.end_time),
  };
}

export function sameAsCurrent(values: DateValues, request: RequestOut): boolean {
  if (request.type.unit === "hour") {
    return (
      values.start_date === request.start_date &&
      values.start_time === hhmm(request.start_time) &&
      values.end_time === hhmm(request.end_time)
    );
  }
  return (
    values.start_date === request.start_date &&
    values.end_date === request.end_date &&
    values.starts_at_midday === request.starts_at_midday &&
    values.ends_at_midday === request.ends_at_midday
  );
}

/** The dates as the API takes them; a permission has one date and two times. */
export function datesOf(values: DateValues, hourly: boolean) {
  return {
    start_date: values.start_date,
    end_date: hourly ? values.start_date : values.end_date,
    starts_at_midday: !hourly && values.starts_at_midday,
    ends_at_midday: !hourly && values.ends_at_midday,
    start_time: hourly ? values.start_time : null,
    end_time: hourly ? values.end_time : null,
  };
}

/** Whether the dates are coherent enough to ask the server what it computes. */
export function datesReady(values: DateValues, hourly: boolean): boolean {
  if (values.start_date === "") return false;
  if (hourly) return values.start_time !== "" && values.end_time > values.start_time;
  return values.end_date !== "" && values.end_date >= values.start_date;
}

/** What cannot be right, as [input, message] pairs, before anything is sent. */
export function dateIssues(values: DateValues, hourly: boolean, t: Translate): [keyof DateValues, string][] {
  const issues: [keyof DateValues, string][] = [];
  if (!values.start_date) issues.push(["start_date", t("formErrors.required")]);
  if (hourly) {
    if (!values.start_time) issues.push(["start_time", t("formErrors.required")]);
    if (!values.end_time) issues.push(["end_time", t("formErrors.required")]);
    if (values.start_time && values.end_time && values.end_time <= values.start_time) {
      issues.push(["end_time", t("formErrors.times")]);
    }
    return issues;
  }
  if (!values.end_date) issues.push(["end_date", t("formErrors.required")]);
  else if (values.start_date && values.end_date < values.start_date) {
    issues.push(["end_date", t("formErrors.endBeforeStart")]);
  }
  if (values.start_date !== "" && values.start_date === values.end_date && values.starts_at_midday && values.ends_at_midday) {
    issues.push(["ends_at_midday", t("formErrors.bothHalves")]);
  }
  return issues;
}
```

`frontend/src/features/requests/mine/ChangeOrCancelPage.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { z } from "zod";
import type { FieldProblem } from "@/api/problem";
import { DateField, FormSummary, PageHeader, SwitchField, TextAreaField, TimeField, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { formatDays, formatHours } from "@/lib/format";
import { useOpenAmendment, usePreview, useRequest, useRequestTypes } from "../api";
import { currentDates, DATE_FIELD_BY_CODE, dateIssues, datesOf, datesReady, sameAsCurrent, type DateValues } from "../dates";
import { chainSentence } from "../form/chain";
import { FieldError } from "../form/FieldError";
import { useDebounced } from "../form/useDebounced";
import { useSingleFlight } from "../form/useSingleFlight";
import { Gate } from "../Gate";
import { useRequestsText, type Translate } from "../platform";
import { byName, details, serverProblems } from "../problems";
import { describeQuantity, describeWhen } from "../text";
import type { AmendmentBody, PreviewBody, RequestDetail } from "../types";

interface ChangeValues extends DateValues {
  kind: "change" | "cancel";
  reason: string;
}

const BY_CODE: Record<string, Path<ChangeValues>> = { ...DATE_FIELD_BY_CODE, "request.reason_required": "reason" };

function buildChangeSchema(request: RequestDetail, t: Translate) {
  const hourly = request.type.unit === "hour";
  return z
    .object({
      kind: z.enum(["change", "cancel"]),
      start_date: z.string(),
      end_date: z.string(),
      starts_at_midday: z.boolean(),
      ends_at_midday: z.boolean(),
      start_time: z.string(),
      end_time: z.string(),
      reason: z.string(),
    })
    .superRefine((values, context) => {
      const issue = (path: keyof ChangeValues, message: string) => context.addIssue({ code: "custom", path: [path], message });
      if (values.reason.trim() === "") issue("reason", t("formErrors.reasonRequired"));
      if (values.kind === "cancel") return;
      for (const [path, message] of dateIssues(values, hourly, t)) issue(path, message);
      if (sameAsCurrent(values, request)) issue("start_date", t("change.unchanged"));
    });
}

function ChangeForm({ request }: { request: RequestDetail }) {
  const { t, lang } = useRequestsText();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const types = useRequestTypes();
  const openAmendment = useOpenAmendment();
  const [loose, setLoose] = useState<FieldProblem[]>([]);

  const requestPage = `/me/requests/${request.public_id}`;
  const hourly = request.type.unit === "hour";
  const type = types.data?.find((item) => item.code === request.type.code);
  const allowsHalfDay = type?.allows_half_day ?? (request.starts_at_midday || request.ends_at_midday);
  const deducts = type?.balance_effect === "deducts_annual";
  const amount = (value: string | number) => (hourly ? formatHours(value, lang) : formatDays(value, lang));

  const schema = useMemo(() => buildChangeSchema(request, t), [request, t]);
  const form = useForm<ChangeValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: search.get("kind") === "cancel" ? "cancel" : "change",
      ...currentDates(request),
      reason: "",
    },
  });
  const values = useWatch({ control: form.control }) as ChangeValues;
  const changing = values.kind === "change";

  // The preview gives the new count and the chain. For a cancellation it is asked with the
  // current dates, for the chain only.
  const ready = !changing || datesReady(values, hourly);
  const dates = datesOf(changing ? values : currentDates(request), hourly);
  const body: PreviewBody | null = ready
    ? {
        type: request.type.code,
        // The request being amended: the server then does not hold it against its own change.
        request: request.public_id,
        ...dates,
        exceptional_event: request.event?.id ?? null,
        override: false,
      }
    : null;
  const key = body ? JSON.stringify(body) : "";
  const settledKey = useDebounced(key, 300);
  const preview = usePreview(settledKey === "" ? null : (JSON.parse(settledKey) as PreviewBody));
  const computed = key !== "" && key === settledKey && preview.isSuccess && !preview.isPlaceholderData ? preview.data : undefined;
  const previewProblems = changing && computed ? computed.problems : [];
  const difference = computed ? Number(computed.quantity) - Number(request.quantity) : 0;

  const shown: Path<ChangeValues>[] = !changing
    ? ["reason"]
    : hourly
      ? ["reason", "start_date", "start_time", "end_time"]
      : allowsHalfDay
        ? ["reason", "start_date", "end_date", "starts_at_midday", "ends_at_midday"]
        : ["reason", "start_date", "end_date"];
  const resolve = (problem: FieldProblem) => {
    const field = byName<ChangeValues>(shown, BY_CODE)(problem);
    return field !== null && shown.includes(field) ? field : null;
  };

  const [send, sending] = useSingleFlight(async (current: ChangeValues) => {
    const reason = current.reason.trim();
    const amendment: AmendmentBody =
      current.kind === "cancel" ? { kind: "cancel", reason } : { kind: "change", ...datesOf(current, hourly), reason };
    try {
      await openAmendment.mutateAsync({ id: request.public_id, body: amendment });
      toast(t(current.kind === "cancel" ? "change.sentCancel" : "change.sentChange"));
      navigate(requestPage);
    } catch (error) {
      setLoose(serverProblems(form, error, t, resolve));
    }
  });

  return (
    <>
      <PageHeader title={t("change.title")} back={requestPage} />
      <form noValidate onSubmit={form.handleSubmit(send)} className="flex max-w-2xl flex-col gap-4 rounded-xl border border-border bg-card px-6 py-5">
        <p className="text-body text-text-secondary">
          {t("change.current", { when: describeWhen(request, t, lang), quantity: describeQuantity(request, lang) })}
        </p>
        <p className="text-body">{t("change.stays")}</p>

        <fieldset className="flex flex-col gap-1">
          <legend className="text-body font-medium">{t("change.kindLegend")}</legend>
          <label className="flex min-h-11 items-center gap-2 text-body">
            <input type="radio" value="change" {...form.register("kind")} />
            {t("mine.changeDates")}
          </label>
          <label className="flex min-h-11 items-center gap-2 text-body">
            <input type="radio" value="cancel" {...form.register("kind")} />
            {t("mine.cancelRequest")}
          </label>
        </fieldset>

        <FormSummary problems={details([...loose, ...previewProblems])} />

        {changing && !hourly && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <DateField control={form.control} name="start_date" label={t("form.start")} />
              <DateField control={form.control} name="end_date" label={t("form.end")} />
            </div>
            {allowsHalfDay && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SwitchField control={form.control} name="starts_at_midday" label={t("form.startsAtMidday")} />
                  <SwitchField control={form.control} name="ends_at_midday" label={t("form.endsAtMidday")} />
                </div>
                <FieldError control={form.control} name="starts_at_midday" />
                <FieldError control={form.control} name="ends_at_midday" />
              </>
            )}
          </>
        )}
        {changing && hourly && (
          <div className="grid gap-4 sm:grid-cols-3">
            <DateField control={form.control} name="start_date" label={t("form.date")} />
            <TimeField control={form.control} name="start_time" label={t("form.from")} />
            <TimeField control={form.control} name="end_time" label={t("form.to")} />
          </div>
        )}

        {computed && (
          <dl aria-label={t("form.computed")} className="flex flex-col gap-3 rounded-md bg-muted px-4 py-3">
            {changing && (
              <div>
                <dt className="text-caption text-muted-foreground">{t("change.newCount")}</dt>
                <dd className="text-section font-semibold">{amount(computed.quantity)}</dd>
              </div>
            )}
            {changing && deducts && (
              <div>
                <dt className="text-caption text-muted-foreground">{t("change.balanceEffect")}</dt>
                <dd className="text-body">
                  {difference > 0
                    ? t("change.uses", { amount: amount(difference) })
                    : difference < 0
                      ? t("change.gives", { amount: amount(-difference) })
                      : t("change.same")}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-caption text-muted-foreground">{t("form.whoDecides")}</dt>
              <dd className="text-body">{chainSentence(computed.chain, t, "me")}</dd>
            </div>
          </dl>
        )}
        {!changing && deducts && (
          <p className="text-body text-text-secondary">{t("change.cancelGives", { amount: amount(request.quantity) })}</p>
        )}

        <TextAreaField control={form.control} name="reason" label={t("change.reason")} />

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" variant="primary" aria-busy={sending}>
            {t(changing ? "change.sendChange" : "change.sendCancel")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate(requestPage)}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </>
  );
}

/** /me/requests/:id/change : change the dates of an approved request, or cancel it, through an amendment. */
export default function ChangeOrCancelPage() {
  const { id = "" } = useParams();
  const query = useRequest(id);
  return (
    <Gate query={query}>
      {(request) =>
        request.viewer.actions.includes("amend") ? (
          <ChangeForm key={request.public_id} request={request} />
        ) : (
          <Navigate to={`/me/requests/${id}`} replace />
        )
      }
    </Gate>
  );
}
```

In `frontend/src/workspaces/me/routes.tsx`, add the import and append one element to `meRoutes`:

```tsx
import ChangeOrCancelPage from "@/features/requests/mine/ChangeOrCancelPage";
```

```tsx
  { path: "requests/:id/change", element: <ChangeOrCancelPage /> },
```

- [ ] **Step 5: Run the test to see it pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/dates.test.ts src/features/requests/mine/ChangeOrCancelPage.test.tsx src/i18n/parity.test.ts`

Expected: PASS, 5 tests for the helpers and 13 in the page file.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/requests/dates.ts frontend/src/features/requests/dates.test.ts frontend/src/features/requests/mine frontend/src/workspaces/me/routes.tsx frontend/src/i18n/locales
git commit -m "feat(requests): change or cancel an approved request through an amendment"
```

---

### Task 10: Decision sheets: approve, refuse, send back

One sheet serves every approver: the manager and the delegate (Tasks 11 and 12), HR (Tasks 14 and 16). Approving states its consequence and takes an optional comment; refusing needs a reason; sending back needs a comment (REQ-05, UI 6.2).

A change to an approved request can be approved or refused, never sent back (plan 03a, contract note 11). The sheet takes the decision it is opened with; the pages that open it offer "Send back" only when the step is not that of a change (`canSendBack` below).

**Files:**
- Create: `frontend/src/features/requests/decisions/DecisionSheet.tsx`
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (section `decision`)
- Test: `frontend/src/features/requests/decisions/DecisionSheet.test.tsx`

**Interfaces:**
- Consumes: `useDecideStep`, `isConflict` (Task 1); `useSingleFlight` (Task 4); `serverProblems`, `byName` (Task 4); `describeWhen`, `describeQuantity` (Task 2); `TaskSheet`, `TextAreaField`, `FormSummary`, `toast` from `@/components`.
- Produces: `interface DecisionTarget { request: RequestOut; stepId: number; decision: Decision }`, `DecisionSheet({ target, onClose, onDone? }: { target: DecisionTarget | null; onClose: () => void; onDone?: (request: RequestDetail) => void })` and `canSendBack(request: RequestOut): boolean` (false while the step to decide is that of a change). The sheet is open while `target` is not null. It posts `{ decision, comment, version: target.request.version }` to `steps/{stepId}/decide`.

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "decision": {
    "title": {
      "approve": "Approuver la demande",
      "reject": "Refuser la demande",
      "return": "Renvoyer la demande"
    },
    "confirm": {
      "approve": "Approuver",
      "reject": "Refuser",
      "return": "Renvoyer"
    },
    "comment": {
      "approve": "Commentaire (facultatif)",
      "reject": "Motif du refus",
      "return": "Ce qu'il faut corriger"
    },
    "required": {
      "reject": "Indiquez le motif du refus : il est obligatoire.",
      "return": "Dites ce qu'il faut corriger : c'est obligatoire."
    },
    "consequence": {
      "approve": "Votre accord est enregistré et la demande passe à l'étape suivante.",
      "approveHr": "Votre validation est enregistrée. S'il ne reste aucune étape, la demande est approuvée et {{name}} en est informé.",
      "reject": "La demande est refusée et {{name}} en est informé. Cette décision est définitive.",
      "return": "La demande retourne à {{name}}, qui pourra la corriger et la renvoyer."
    },
    "done": {
      "approve": "Demande de {{name}} approuvée.",
      "reject": "Demande de {{name}} refusée.",
      "return": "Demande renvoyée à {{name}}."
    }
  }
```

English:

```json
  "decision": {
    "title": {
      "approve": "Approve the request",
      "reject": "Refuse the request",
      "return": "Send the request back"
    },
    "confirm": {
      "approve": "Approve",
      "reject": "Refuse",
      "return": "Send back"
    },
    "comment": {
      "approve": "Comment (optional)",
      "reject": "Reason for refusing",
      "return": "What needs correcting"
    },
    "required": {
      "reject": "Give the reason for refusing: it is mandatory.",
      "return": "Say what needs correcting: it is mandatory."
    },
    "consequence": {
      "approve": "Your approval is recorded and the request goes to the next step.",
      "approveHr": "Your validation is recorded. If no step remains, the request is approved and {{name}} is told.",
      "reject": "The request is refused and {{name}} is told. This decision is final.",
      "return": "The request goes back to {{name}}, who can correct it and send it again."
    },
    "done": {
      "approve": "Request of {{name}} approved.",
      "reject": "Request of {{name}} refused.",
      "return": "Request sent back to {{name}}."
    }
  }
```

- [ ] **Step 2: Write the failing test**

`frontend/src/features/requests/decisions/DecisionSheet.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeMe } from "@/test/fixtures";
import { setText } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makeApprovalItem, makeRequestDetail, paginated, problemResponse, type RequestOverrides } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import { useApprovals } from "../api";
import type { Decision } from "../types";
import { canSendBack, DecisionSheet, type DecisionTarget } from "./DecisionSheet";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const me = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });

function Harness({ decision, request }: { decision: Decision; request?: RequestOverrides }) {
  const [target, setTarget] = useState<DecisionTarget | null>(null);
  useApprovals({ queue: "mine" });
  const item = makeApprovalItem({ request: { version: 3, ...request } });
  return (
    <>
      <button onClick={() => setTarget({ request: item.request, stepId: item.step_id, decision })}>ouvrir</button>
      <DecisionSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}

function serve() {
  const calls = { decide: [] as unknown[], queue: 0 };
  server.use(
    http.get("/api/v1/approvals", () => {
      calls.queue += 1;
      return HttpResponse.json(paginated([makeApprovalItem()]));
    }),
    http.post("/api/v1/steps/7/decide", async ({ request }) => {
      calls.decide.push(await request.json());
      return HttpResponse.json(makeRequestDetail({ state: { key: "waiting_hr", waiting_on: [], last_actor: "Sami Ben Ali" } }));
    }),
  );
  return calls;
}

async function openSheet(decision: Decision, title: string, request?: RequestOverrides) {
  renderApp(<Harness decision={decision} request={request} />, { route: "/team", me });
  await userEvent.click(screen.getByRole("button", { name: "ouvrir" }));
  return screen.findByRole("dialog", { name: title });
}

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("Decision sheet (UI 6.2, REQ-05)", () => {
  it("approves with an optional comment, the version, and a stated consequence", async () => {
    const calls = serve();
    const sheet = await openSheet("approve", "Approuver la demande");
    expect(within(sheet).getByText("Amal Trabelsi")).toBeInTheDocument();
    expect(within(sheet).getByText("Congé annuel · R(2026-11-09..2026-11-11) · 3 j")).toBeInTheDocument();
    expect(within(sheet).getByText("Votre accord est enregistré et la demande passe à l'étape suivante.")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() => expect(calls.decide).toEqual([{ decision: "approve", comment: "", version: 3 }]));
    expect(toast).toHaveBeenCalledWith("Demande de Amal Trabelsi approuvée.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Approuver la demande" })).not.toBeInTheDocument());
  });

  it("refreshes the queue once the decision is recorded", async () => {
    const calls = serve();
    const sheet = await openSheet("approve", "Approuver la demande");
    const before = calls.queue;
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() => expect(calls.queue).toBeGreaterThan(before));
  });

  it("cannot refuse without a reason", async () => {
    const calls = serve();
    const sheet = await openSheet("reject", "Refuser la demande");
    expect(within(sheet).getByText("La demande est refusée et Amal Trabelsi en est informé. Cette décision est définitive.")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Refuser" }));
    expect(await within(sheet).findByText("Indiquez le motif du refus : il est obligatoire.")).toBeInTheDocument();
    expect(calls.decide).toHaveLength(0);

    setText("Motif du refus", "  Effectif insuffisant cette semaine-là  ", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Refuser" }));
    await waitFor(() =>
      expect(calls.decide).toEqual([{ decision: "reject", comment: "Effectif insuffisant cette semaine-là", version: 3 }]),
    );
    expect(toast).toHaveBeenCalledWith("Demande de Amal Trabelsi refusée.");
  });

  it("cannot send back without saying what to correct", async () => {
    const calls = serve();
    const sheet = await openSheet("return", "Renvoyer la demande");
    await userEvent.click(within(sheet).getByRole("button", { name: "Renvoyer" }));
    expect(await within(sheet).findByText("Dites ce qu'il faut corriger : c'est obligatoire.")).toBeInTheDocument();
    expect(calls.decide).toHaveLength(0);
    setText("Ce qu'il faut corriger", "Décalez à la semaine suivante", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Renvoyer" }));
    await waitFor(() => expect(calls.decide).toHaveLength(1));
    expect(toast).toHaveBeenCalledWith("Demande renvoyée à Amal Trabelsi.");
  });

  it("a double click on Confirm posts one decision", async () => {
    const calls = serve();
    const sheet = await openSheet("approve", "Approuver la demande");
    await userEvent.dblClick(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(calls.decide).toHaveLength(1);
  });

  it("tells the approver when someone else decided first, and shows the current state", async () => {
    const calls = serve();
    server.use(
      http.post("/api/v1/steps/7/decide", () => problemResponse(409, "request.already_processed", "Déjà traitée.")),
    );
    const sheet = await openSheet("approve", "Approuver la demande");
    const before = calls.queue;
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith("Quelqu'un d'autre a agi avant vous. La page affiche maintenant l'état actuel."),
    );
    expect(toast).not.toHaveBeenCalledWith("Demande de Amal Trabelsi approuvée.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Approuver la demande" })).not.toBeInTheDocument());
    await waitFor(() => expect(calls.queue).toBeGreaterThan(before));
  });

  it("shows a refusal of the server in the sheet and keeps the comment", async () => {
    serve();
    server.use(
      http.post("/api/v1/steps/7/decide", () =>
        problemResponse(400, "validation", "Le solde ne suffit plus : il manque 1 jour.", [
          { field: null, code: "request.balance_insufficient", detail: "Le solde ne suffit plus : il manque 1 jour.", params: {} },
        ]),
      ),
    );
    const sheet = await openSheet("approve", "Approuver la demande");
    setText("Commentaire (facultatif)", "Bon voyage", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    expect(await within(sheet).findByText("Le solde ne suffit plus : il manque 1 jour.")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Commentaire (facultatif)")).toHaveValue("Bon voyage");
    expect(toast).not.toHaveBeenCalled();
  });

  it("states the consequence in HR's words when HR validates", async () => {
    serve();
    const sheet = await openSheet("approve", "Approuver la demande", { viewer: { relation: "hr", actions: ["decide"], step_id: 7 } });
    expect(
      within(sheet).getByText(
        "Votre validation est enregistrée. S'il ne reste aucune étape, la demande est approuvée et Amal Trabelsi en est informé.",
      ),
    ).toBeInTheDocument();
  });

  it("knows that a change to an approved request cannot be sent back", () => {
    const waiting = makeApprovalItem().request;
    const change = makeApprovalItem({
      request: {
        status: "approved",
        state: { key: "approved", waiting_on: [] },
        amendment: { public_id: "am-1", kind: "change", status: "pending", state_key: "waiting_manager", waiting_on: ["Sami Ben Ali"] },
      },
    }).request;
    expect(canSendBack(waiting)).toBe(true);
    expect(canSendBack(change)).toBe(false);
  });

  it("cancel closes the sheet without deciding", async () => {
    const calls = serve();
    const sheet = await openSheet("reject", "Refuser la demande");
    await userEvent.click(within(sheet).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Refuser la demande" })).not.toBeInTheDocument());
    expect(calls.decide).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/decisions/DecisionSheet.test.tsx`

Expected: FAIL with "Failed to resolve import "./DecisionSheet"".

- [ ] **Step 4: Write the sheet**

`frontend/src/features/requests/decisions/DecisionSheet.tsx`:

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { FieldProblem } from "@/api/problem";
import { FormSummary, TaskSheet, TextAreaField, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { isConflict, useDecideStep } from "../api";
import { useSingleFlight } from "../form/useSingleFlight";
import { useRequestsText } from "../platform";
import { byName, details, serverProblems } from "../problems";
import { describeQuantity, describeWhen } from "../text";
import type { Decision, RequestDetail, RequestOut } from "../types";

export interface DecisionTarget {
  request: RequestOut;
  stepId: number;
  decision: Decision;
}

interface DecisionSheetProps {
  /** The decision being taken; the sheet is open while this is not null. */
  target: DecisionTarget | null;
  onClose: () => void;
  onDone?: (request: RequestDetail) => void;
}

interface Values {
  comment: string;
}

const COMMENT_CODES = { "request.comment_required": "comment", "request.reason_required": "comment" } as const;

/**
 * Whether "Send back" may be offered for the step this viewer can decide. The step belongs to a
 * change exactly when the request is approved and its change is waiting; a change is approved or
 * refused, never sent back.
 */
export function canSendBack(request: RequestOut): boolean {
  return !(request.status === "approved" && request.amendment?.status === "pending");
}

/** Approve, refuse or send back one step, as a focused task with its consequence stated (U6). */
export function DecisionSheet({ target, onClose, onDone }: DecisionSheetProps) {
  // Keep the last target so the sheet can close with its content still in place.
  const [last, setLast] = useState(target);
  if (target !== null && target !== last) setLast(target);
  if (last === null) return null;
  return (
    <DecisionBody
      key={`${last.stepId}:${last.decision}`}
      open={target !== null}
      target={last}
      onClose={onClose}
      onDone={onDone}
    />
  );
}

interface DecisionBodyProps {
  open: boolean;
  target: DecisionTarget;
  onClose: () => void;
  onDone?: (request: RequestDetail) => void;
}

function DecisionBody({ open, target, onClose, onDone }: DecisionBodyProps) {
  const { t, lang } = useRequestsText();
  const decide = useDecideStep();
  const { request, stepId, decision } = target;
  const name = request.employee.name;
  const form = useForm<Values>({ defaultValues: { comment: "" } });
  const [loose, setLoose] = useState<FieldProblem[]>([]);

  const [confirm, confirming] = useSingleFlight(async (values: Values) => {
    const comment = values.comment.trim();
    if (decision !== "approve" && comment === "") {
      form.setError("comment", { type: "client", message: t(`decision.required.${decision}`) }, { shouldFocus: true });
      return;
    }
    try {
      const updated = await decide.mutateAsync({ stepId, body: { decision, comment, version: request.version } });
      toast(t(`decision.done.${decision}`, { name }));
      onDone?.(updated);
      onClose();
    } catch (error) {
      if (isConflict(error)) {
        // Someone else acted first: say so, close, and let the refreshed lists show the current state.
        toast(t("common:concurrent"));
        onClose();
        return;
      }
      setLoose(serverProblems(form, error, t, byName<Values>(["comment"], COMMENT_CODES)));
    }
  });

  const consequence = decision === "approve" && request.viewer.relation === "hr" ? "approveHr" : decision;

  return (
    <TaskSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t(`decision.title.${decision}`)}
      footer={
        <>
          <Button
            type="button"
            variant={decision === "reject" ? "destructive" : "primary"}
            aria-busy={confirming}
            onClick={form.handleSubmit(confirm)}
          >
            {t(`decision.confirm.${decision}`)}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </>
      }
    >
      <form noValidate onSubmit={form.handleSubmit(confirm)} className="flex flex-col gap-4">
        <div>
          <p className="text-body font-semibold">{name}</p>
          <p className="text-body text-text-secondary">
            {`${request.type.name} · ${describeWhen(request, t, lang)} · ${describeQuantity(request, lang)}`}
          </p>
        </div>
        <p className="text-body">{t(`decision.consequence.${consequence}`, { name })}</p>
        <FormSummary problems={details(loose)} />
        <TextAreaField control={form.control} name="comment" label={t(`decision.comment.${decision}`)} />
      </form>
    </TaskSheet>
  );
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/decisions/DecisionSheet.test.tsx src/i18n/parity.test.ts`

Expected: PASS, 10 tests in the sheet file.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/requests/decisions frontend/src/i18n/locales
git commit -m "feat(requests): decision sheet for approving, refusing and sending back"
```

---

### Task 11: My team, To decide

UI 6.1. The queue shows, for each waiting request, what the manager needs to decide without opening it. Master 9.1 and D25: `ToDecidePage` is registered as the home of My team in this plan; plan 05 replaces the registration with a larger home that renders the same `ToDecideBlock`.

**Files:**
- Create: `frontend/src/features/requests/decisions/DecisionContext.tsx`
- Create: `frontend/src/features/requests/queues/ToDecideBlock.tsx`
- Create: `frontend/src/features/requests/queues/ToDecidePage.tsx`
- Modify: `frontend/src/app/homes.ts` (add one line)
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (sections `toDecide`, `context`)
- Test: `frontend/src/features/requests/queues/ToDecide.test.tsx`

**Interfaces:**
- Consumes: `useApprovals` (Task 1); `DecisionSheet`, `DecisionTarget` (Task 10); `TypeTag`, `describeWhen`, `describeQuantity` (Task 2); `Gate`; `PageHeader` from `@/components`; `formatDate`, `formatDateRange`, `formatDays`, `formatHours`.
- Produces:
  - `DecisionContextView({ context, unit, detailed? }: { context: DecisionContext | null; unit: Unit; detailed?: boolean })`: balance after (and now, when `detailed`), limit usage, teammates away. Renders nothing when there is nothing to say.
  - `useToDecide(): { query: UseQueryResult<Paginated<ApprovalItem>>; items: ApprovalItem[] }` (oldest first) and `ToDecideBlock({ hideTitle? }: { hideTitle?: boolean })`, named exports of `queues/ToDecideBlock.tsx`. Plan 05 imports `ToDecideBlock` from `@/features/requests/queues/ToDecideBlock`. From the list a request is approved or refused; sending back is offered on the request's page.
  - `ToDecidePage` (default export), registered as `HOMES.team`.

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "toDecide": {
    "pageTitle": "À décider",
    "title": "À décider",
    "empty": "Rien à décider.",
    "decideOldest": "Décider la plus ancienne",
    "since": "En attente depuis le {{date}}",
    "via": "Pour le compte de {{name}}",
    "itemLabel": "{{name}}, {{type}}"
  },
  "context": {
    "title": "Pour décider",
    "balanceAfter": "Solde après : {{after}}",
    "balanceNowAfter": "Solde : {{now}} aujourd'hui, {{after}} après",
    "cap": "Limite : {{used}} déjà pris sur {{limit}}",
    "away": "Déjà absents ou en télétravail ces jours-là : {{people}}",
    "nobodyAway": "Personne d'autre de l'équipe n'est absent ces jours-là.",
    "person": {
      "absent": "{{name}} (absent, {{when}})",
      "remote": "{{name}} (télétravail, {{when}})"
    }
  }
```

English:

```json
  "toDecide": {
    "pageTitle": "To decide",
    "title": "To decide",
    "empty": "Nothing to decide.",
    "decideOldest": "Decide the oldest",
    "since": "Waiting since {{date}}",
    "via": "On behalf of {{name}}",
    "itemLabel": "{{name}}, {{type}}"
  },
  "context": {
    "title": "To decide",
    "balanceAfter": "Balance after: {{after}}",
    "balanceNowAfter": "Balance: {{now}} today, {{after}} after",
    "cap": "Limit: {{used}} already taken of {{limit}}",
    "away": "Already absent or remote on those days: {{people}}",
    "nobodyAway": "Nobody else on the team is away on those days.",
    "person": {
      "absent": "{{name}} (absent, {{when}})",
      "remote": "{{name}} (remote, {{when}})"
    }
  }
```

- [ ] **Step 2: Write the failing test**

`frontend/src/features/requests/queues/ToDecide.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeMe } from "@/test/fixtures";
import { setText } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makeApprovalItem, makeRequestDetail, paginated } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import type { ApprovalItem } from "../types";
import ToDecidePage from "./ToDecidePage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const me = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });

const amal = makeApprovalItem({
  waiting_since: "2026-10-28T09:12:00+01:00",
  decision_context: {
    balance: { now: "12.50", after: "9.50" },
    teammates_away: [
      { name: "Karim Mansour", label: "absent", start_date: "2026-11-10", end_date: "2026-11-12" },
      { name: "Ines Haddad", label: "remote", start_date: "2026-11-09", end_date: "2026-11-09" },
    ],
    cap: null,
  },
});
const youssef = makeApprovalItem({
  step_id: 12,
  waiting_since: "2026-10-26T08:00:00+01:00",
  via_delegation_from: "Hatem Jlassi",
  request: {
    public_id: "req-9",
    version: 2,
    employee: { public_id: "emp-9", name: "Youssef Ayari", department: "Sinistres" },
    type: { code: "remote", name: "Télétravail", calendar_label: "remote" },
    start_date: "2026-11-03",
    end_date: "2026-11-03",
    quantity: "1.00",
  },
  decision_context: { balance: null, teammates_away: [], cap: { used: "1.00", limit: "2.00" } },
});

function serve(items: ApprovalItem[] = [amal, youssef]) {
  const calls = { searches: [] as URLSearchParams[], decide: [] as { step: string; body: unknown }[] };
  server.use(
    http.get("/api/v1/approvals", ({ request }) => {
      calls.searches.push(new URL(request.url).searchParams);
      return HttpResponse.json(paginated(items));
    }),
    http.post("/api/v1/steps/:id/decide", async ({ request, params }) => {
      calls.decide.push({ step: String(params.id), body: await request.json() });
      return HttpResponse.json(makeRequestDetail({ status: "approved" }));
    }),
  );
  return calls;
}

const open = () => renderApp(<ToDecidePage />, { route: "/team", path: "/team", me });

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("My team, To decide (UI 6.1)", () => {
  it("lists what waits for me, the oldest first, with who, type, dates, length and since when", async () => {
    const calls = serve();
    open();
    const items = await screen.findAllByRole("article");
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
      "Youssef Ayari, Télétravail",
      "Amal Trabelsi, Congé annuel",
    ]);
    const first = within(items[1]);
    expect(first.getByText("Amal Trabelsi")).toBeInTheDocument();
    expect(first.getByText("Congé annuel")).toBeInTheDocument();
    expect(first.getByText("R(2026-11-09..2026-11-11) · 3 j")).toBeInTheDocument();
    expect(first.getByText("En attente depuis le D(2026-10-28T09:12:00+01:00)")).toBeInTheDocument();
    expect(calls.searches[0].get("queue")).toBe("mine");
  });

  it("shows what is needed to decide without opening: balance after, teammates away, limit", async () => {
    serve();
    open();
    const amalItem = within(await screen.findByRole("article", { name: "Amal Trabelsi, Congé annuel" }));
    expect(amalItem.getByText("Solde après : 9.5 j")).toBeInTheDocument();
    expect(
      amalItem.getByText(
        "Déjà absents ou en télétravail ces jours-là : Karim Mansour (absent, R(2026-11-10..2026-11-12)) ; Ines Haddad (télétravail, D(2026-11-09))",
      ),
    ).toBeInTheDocument();
    const youssefItem = within(screen.getByRole("article", { name: "Youssef Ayari, Télétravail" }));
    expect(youssefItem.getByText("Limite : 1 j déjà pris sur 2 j")).toBeInTheDocument();
    expect(youssefItem.queryByText(/Solde/)).not.toBeInTheDocument();
  });

  it("says from whom a request reaches me through a delegation", async () => {
    serve();
    open();
    const youssefItem = within(await screen.findByRole("article", { name: "Youssef Ayari, Télétravail" }));
    expect(youssefItem.getByText("Pour le compte de Hatem Jlassi")).toBeInTheDocument();
    const amalItem = within(screen.getByRole("article", { name: "Amal Trabelsi, Congé annuel" }));
    expect(amalItem.queryByText(/Pour le compte de/)).not.toBeInTheDocument();
  });

  it("offers the oldest request as the page's primary action", async () => {
    serve();
    open();
    expect(await screen.findByRole("link", { name: "Décider la plus ancienne" })).toHaveAttribute("href", "/team/requests/req-9");
  });

  it("says there is nothing to decide, and then offers no primary action", async () => {
    serve([]);
    open();
    expect(await screen.findByText("Rien à décider.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Décider la plus ancienne" })).not.toBeInTheDocument();
  });

  it("approves from the list, through the sheet that states the consequence", async () => {
    const calls = serve();
    open();
    const amalItem = within(await screen.findByRole("article", { name: "Amal Trabelsi, Congé annuel" }));
    await userEvent.click(amalItem.getByRole("button", { name: "Approuver" }));
    const sheet = await screen.findByRole("dialog", { name: "Approuver la demande" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() =>
      expect(calls.decide).toEqual([{ step: "7", body: { decision: "approve", comment: "", version: 1 } }]),
    );
    expect(toast).toHaveBeenCalledWith("Demande de Amal Trabelsi approuvée.");
  });

  it("refuses from the list with a reason", async () => {
    const calls = serve();
    open();
    const youssefItem = within(await screen.findByRole("article", { name: "Youssef Ayari, Télétravail" }));
    await userEvent.click(youssefItem.getByRole("button", { name: "Refuser" }));
    const sheet = await screen.findByRole("dialog", { name: "Refuser la demande" });
    setText("Motif du refus", "Réunion d'équipe ce jour-là", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Refuser" }));
    await waitFor(() =>
      expect(calls.decide).toEqual([
        { step: "12", body: { decision: "reject", comment: "Réunion d'équipe ce jour-là", version: 2 } },
      ]),
    );
  });

  it("opens a request in the team workspace", async () => {
    serve();
    open();
    const amalItem = within(await screen.findByRole("article", { name: "Amal Trabelsi, Congé annuel" }));
    expect(amalItem.getByRole("link", { name: "Ouvrir" })).toHaveAttribute("href", "/team/requests/req-1");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/queues/ToDecide.test.tsx`

Expected: FAIL with "Failed to resolve import "./ToDecidePage"".

- [ ] **Step 4: Write the decision context**

`frontend/src/features/requests/decisions/DecisionContext.tsx`:

```tsx
import { formatDate, formatDateRange, formatDays, formatHours } from "@/lib/format";
import { useRequestsText } from "../platform";
import type { DecisionContext, Unit } from "../types";

interface DecisionContextViewProps {
  context: DecisionContext | null;
  unit: Unit;
  /** On the request page: the balance now and after, and an explicit line when nobody else is away. */
  detailed?: boolean;
}

/**
 * What an approver needs in order to decide (UI 6.1, 6.2): the balance after, the limit usage,
 * the teammates already away on those days. All of it comes from the API; a null balance (a type
 * that does not use it, or balances not yet in service) simply shows no balance line.
 */
export function DecisionContextView({ context, unit, detailed = false }: DecisionContextViewProps) {
  const { t, lang } = useRequestsText();
  if (!context) return null;
  const amount = (value: string) => (unit === "hour" ? formatHours(value, lang) : formatDays(value, lang));
  const lines: string[] = [];

  if (context.balance) {
    lines.push(
      detailed
        ? t("context.balanceNowAfter", {
            now: formatDays(context.balance.now, lang),
            after: formatDays(context.balance.after, lang),
          })
        : t("context.balanceAfter", { after: formatDays(context.balance.after, lang) }),
    );
  }
  if (context.cap) {
    lines.push(t("context.cap", { used: amount(context.cap.used), limit: amount(context.cap.limit) }));
  }
  if (context.teammates_away.length > 0) {
    const people = context.teammates_away
      .map((person) =>
        t(`context.person.${person.label}`, {
          name: person.name,
          when:
            person.start_date === person.end_date
              ? formatDate(person.start_date, lang)
              : formatDateRange(person.start_date, person.end_date, lang),
        }),
      )
      .join(" ; ");
    lines.push(t("context.away", { people }));
  } else if (detailed) {
    lines.push(t("context.nobodyAway"));
  }

  if (lines.length === 0) return null;
  return (
    <ul aria-label={t("context.title")} className="mt-3 flex flex-col gap-1 text-body text-text-secondary">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Write the block and the page, and register the home**

`frontend/src/features/requests/queues/ToDecideBlock.tsx`:

```tsx
import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useApprovals } from "../api";
import { DecisionContextView } from "../decisions/DecisionContext";
import { DecisionSheet, type DecisionTarget } from "../decisions/DecisionSheet";
import { Gate } from "../Gate";
import { useRequestsText } from "../platform";
import { describeQuantity, describeWhen } from "../text";
import { TypeTag } from "../TypeTag";
import type { ApprovalItem, Decision } from "../types";

const waitingSince = (item: ApprovalItem) => (item.waiting_since ? Date.parse(item.waiting_since) : 0);

/** The steps waiting for the signed-in person, the oldest first. Shared by the block and the page header. */
export function useToDecide() {
  const query = useApprovals({ queue: "mine", page_size: 100 });
  const items = useMemo(
    () => [...(query.data?.results ?? [])].sort((a, b) => waitingSince(a) - waitingSince(b)),
    [query.data],
  );
  return { query, items };
}

interface ToDecideBlockProps {
  /** The page that shows this block alone already carries the title. */
  hideTitle?: boolean;
}

/** "What is waiting for me?" (UI 6.1): each request with what is needed to decide it, and the decision itself. */
export function ToDecideBlock({ hideTitle = false }: ToDecideBlockProps) {
  const { t, lang } = useRequestsText();
  const { query, items } = useToDecide();
  const [target, setTarget] = useState<DecisionTarget | null>(null);
  const headingId = useId();

  const ask = (item: ApprovalItem, decision: Decision) =>
    setTarget({ request: item.request, stepId: item.step_id, decision });

  return (
    <section aria-labelledby={hideTitle ? undefined : headingId} aria-label={hideTitle ? t("toDecide.title") : undefined}>
      {!hideTitle && (
        <h2 id={headingId} className="text-section font-semibold">
          {t("toDecide.title")}
        </h2>
      )}
      <Gate query={query}>
        {() =>
          items.length === 0 ? (
            <p className="mt-2 text-body text-muted-foreground">{t("toDecide.empty")}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {items.map((item) => {
                const request = item.request;
                return (
                  <li key={item.step_id}>
                    <article
                      aria-label={t("toDecide.itemLabel", { name: request.employee.name, type: request.type.name })}
                      className="rounded-xl border border-border bg-card px-6 py-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body font-semibold">{request.employee.name}</span>
                        <TypeTag code={request.type.code} name={request.type.name} />
                      </div>
                      <p className="mt-1 text-body">{`${describeWhen(request, t, lang)} · ${describeQuantity(request, lang)}`}</p>
                      {item.waiting_since && (
                        <p className="text-caption text-muted-foreground">
                          {t("toDecide.since", { date: formatDate(item.waiting_since, lang) })}
                        </p>
                      )}
                      {item.via_delegation_from && (
                        <p className="text-caption text-muted-foreground">{t("toDecide.via", { name: item.via_delegation_from })}</p>
                      )}
                      <DecisionContextView context={item.decision_context} unit={request.type.unit} />
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => ask(item, "approve")}>
                          {t("decision.confirm.approve")}
                        </Button>
                        <Button variant="ghost" onClick={() => ask(item, "reject")}>
                          {t("decision.confirm.reject")}
                        </Button>
                        <Button asChild variant="ghost">
                          <Link to={`/team/requests/${request.public_id}`}>{t("common.open")}</Link>
                        </Button>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )
        }
      </Gate>
      <DecisionSheet target={target} onClose={() => setTarget(null)} />
    </section>
  );
}
```

`frontend/src/features/requests/queues/ToDecidePage.tsx`:

```tsx
import { Link } from "react-router";
import { PageHeader } from "@/components";
import { Button } from "@/components/ui/button";
import { useRequestsText } from "../platform";
import { ToDecideBlock, useToDecide } from "./ToDecideBlock";

/** /team : the manager's queue. Primary action: decide the oldest request (UI 6.1). */
export default function ToDecidePage() {
  const { t } = useRequestsText();
  const { items } = useToDecide();
  const oldest = items[0];
  return (
    <>
      <PageHeader
        title={t("toDecide.pageTitle")}
        primary={
          oldest ? (
            <Button asChild variant="primary">
              <Link to={`/team/requests/${oldest.request.public_id}`}>{t("toDecide.decideOldest")}</Link>
            </Button>
          ) : undefined
        }
      />
      <ToDecideBlock hideTitle />
    </>
  );
}
```

In `frontend/src/app/homes.ts`, add this line inside the `HOMES` object:

```ts
  team: lazy(() => import("@/features/requests/queues/ToDecidePage")),
```

- [ ] **Step 6: Run the test to see it pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/queues/ToDecide.test.tsx src/i18n/parity.test.ts`

Expected: PASS, 8 tests in the queue file.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/requests frontend/src/app/homes.ts frontend/src/i18n/locales
git commit -m "feat(requests): the manager's To decide queue with decisions from the list"
```

---

### Task 12: My team: the request seen by a manager, and the team's requests

**Files:**
- Create: `frontend/src/features/requests/views/RequestManagerView.tsx`
- Create: `frontend/src/features/requests/team/TeamRequestsPage.tsx`
- Create: `frontend/src/test/employeePickerMock.tsx`
- Modify: `frontend/src/features/requests/views/registry.ts` (add two lines)
- Modify: `frontend/src/workspaces/team/routes.tsx` (append two routes)
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (sections `manager`, `teamList`)
- Test: `frontend/src/features/requests/views/RequestManagerView.test.tsx`
- Test: `frontend/src/features/requests/team/TeamRequestsPage.test.tsx`

**Interfaces:**
- Consumes: `RequestView` (Task 8), `VIEWS` (Task 8), `RequestPage` (Task 8), `DecisionSheet` (Task 10), `DecisionContextView` (Task 11), `RequestsList` (Task 7), `useWorkspacePrefix`.
- Produces:
  - `RequestManagerView({ request })` (default export), registered for the relations `approver` and `team`.
  - `TeamRequestsPage` (default export) at `/team/requests`; `?view=decided` shows what the viewer already decided.
  - `employeePickerMock` in `src/test/employeePickerMock.tsx`: a stand-in for plan 02's picker in unit tests, a plain text input that reports the typed `public_id`.

What a manager sees of a request (UI 6.2, 10.2). Nothing is filtered here: the API already left out what the viewer may not see.

| Content | Shown |
|---|---|
| Who asks, type, dates, length, status sentence | In the summary |
| Balance now and after, limit usage, teammates away | In the summary, from `decision_context` |
| The requester's comment | In the summary, when the API returns it |
| Approve (primary), Refuse, Send back | When `viewer.actions` contains `decide`. A change to an approved request is approved or refused only. |
| "For information only" | When there is nothing to decide and `comment_hidden` is true (a restricted type such as sick leave) |
| Steps and history, non-medical files | One step away |
| Sick-leave comment, certificate, certificate status | Never: `comment` is null, `certificate` is null, no medical attachment is in the list |

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "manager": {
    "infoOnly": "Déclaration transmise pour information : vous n'avez aucune décision à prendre."
  },
  "teamList": {
    "title": "Demandes de l'équipe",
    "viewLabel": "Vue",
    "viewTeam": "Toute l'équipe",
    "viewDecided": "Déjà décidées par moi",
    "empty": "Aucune demande de votre équipe ici.",
    "emptyDecided": "Vous n'avez encore décidé aucune demande.",
    "emptyHint": "Changez les filtres pour en voir d'autres."
  }
```

English:

```json
  "manager": {
    "infoOnly": "Declaration passed on for information: you have no decision to make."
  },
  "teamList": {
    "title": "Team requests",
    "viewLabel": "View",
    "viewTeam": "The whole team",
    "viewDecided": "Already decided by me",
    "empty": "No request from your team here.",
    "emptyDecided": "You have not decided any request yet.",
    "emptyHint": "Change the filters to see others."
  }
```

- [ ] **Step 2: Write the stand-in for the employee picker**

`frontend/src/test/employeePickerMock.tsx`:

```tsx
interface PickerProps {
  label: string;
  value: string | null;
  onChange: (publicId: string | null) => void;
}

/**
 * Stand-in for plan 02's `EmployeePicker` in unit tests of other features: a text input in which
 * the test types a `public_id`.
 * Use: vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);
 */
export const employeePickerMock = {
  EmployeePicker: ({ label, value, onChange }: PickerProps) => (
    <label>
      {label}
      <input value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} />
    </label>
  ),
};
```

- [ ] **Step 3: Write the failing tests**

`frontend/src/features/requests/views/RequestManagerView.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceId } from "@/app/workspaces";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { makeRequestDetail, paginated, type DetailOverrides } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import RequestPage from "../RequestPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const toDecide: DetailOverrides = {
  comment: "Voyage en famille",
  viewer: { relation: "approver", actions: ["decide"], step_id: 7 },
  decision_context: {
    balance: { now: "12.50", after: "9.50" },
    teammates_away: [{ name: "Karim Mansour", label: "absent", start_date: "2026-11-10", end_date: "2026-11-12" }],
    cap: null,
  },
};

const sickDeclaration: DetailOverrides = {
  type: { code: "sick", name: "Congé maladie" },
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  comment: null,
  comment_hidden: true,
  certificate: null,
  attachments: [],
  viewer: { relation: "team", actions: [], step_id: null },
  decision_context: { balance: null, teammates_away: [], cap: null },
};

function serve(detail: DetailOverrides) {
  const calls = { decide: [] as unknown[] };
  server.use(
    http.get("/api/v1/requests/req-1", () => HttpResponse.json(makeRequestDetail(detail))),
    http.get("/api/v1/requests/req-1/history", () => HttpResponse.json([])),
    http.get("/api/v1/approvals", () => HttpResponse.json(paginated([]))),
    http.post("/api/v1/steps/7/decide", async ({ request }) => {
      calls.decide.push(await request.json());
      return HttpResponse.json(makeRequestDetail({ ...detail, viewer: { relation: "team", actions: [], step_id: null } }));
    }),
  );
  return calls;
}

function open(workspace: WorkspaceId = "team") {
  const workspaces: WorkspaceId[] = workspace === "team" ? ["me", "team"] : ["me"];
  renderApp(<RequestPage />, {
    route: `/${workspace}/requests/req-1`,
    path: `/${workspace}/requests/:id`,
    me: makeMe({ roles: ["employee", "manager"], workspaces }),
  });
}

describe("Request, manager view (UI 6.2)", () => {
  it("shows who asks, the dates, what is needed to decide and the comment", async () => {
    serve(toDecide);
    open();
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).getByText("Amal Trabelsi")).toBeInTheDocument();
    expect(within(summary).getByText(/Souscription/)).toBeInTheDocument();
    expect(within(summary).getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(within(summary).getByText("En attente de votre décision")).toBeInTheDocument();
    expect(within(summary).getByText("Solde : 12.5 j aujourd'hui, 9.5 j après")).toBeInTheDocument();
    expect(
      within(summary).getByText("Déjà absents ou en télétravail ces jours-là : Karim Mansour (absent, R(2026-11-10..2026-11-12))"),
    ).toBeInTheDocument();
    expect(within(summary).getByText("Voyage en famille")).toBeInTheDocument();
  });

  it("offers approve, refuse and send back", async () => {
    serve(toDecide);
    open();
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).getByRole("button", { name: "Approuver" })).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: "Refuser" })).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: "Renvoyer" })).toBeInTheDocument();
  });

  it("offers to approve or refuse a change to an approved request, never to send it back", async () => {
    serve({
      ...toDecide,
      status: "approved",
      state: { key: "approved", waiting_on: [] },
      amendment: { public_id: "am-1", kind: "change", status: "pending", state_key: "waiting_manager", waiting_on: ["Sami Ben Ali"] },
    });
    open();
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).getByText("Modification à décider")).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: "Approuver" })).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: "Refuser" })).toBeInTheDocument();
    expect(within(summary).queryByRole("button", { name: "Renvoyer" })).not.toBeInTheDocument();
  });

  it("says when nobody else is away", async () => {
    serve({ ...toDecide, decision_context: { balance: null, teammates_away: [], cap: null } });
    open();
    expect(await screen.findByText("Personne d'autre de l'équipe n'est absent ces jours-là.")).toBeInTheDocument();
  });

  it("approves through the sheet and returns to the queue", async () => {
    const calls = serve(toDecide);
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Approuver" }));
    const sheet = await screen.findByRole("dialog", { name: "Approuver la demande" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() => expect(calls.decide).toEqual([{ decision: "approve", comment: "", version: 1 }]));
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/team"));
  });

  it("a sick-leave declaration is information only", async () => {
    serve(sickDeclaration);
    open();
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(screen.getByRole("heading", { name: "Congé maladie" })).toBeInTheDocument();
    expect(
      within(summary).getByText("Déclaration transmise pour information : vous n'avez aucune décision à prendre."),
    ).toBeInTheDocument();
    expect(within(summary).queryAllByRole("button")).toHaveLength(0);
    expect(within(summary).queryByText("Commentaire")).not.toBeInTheDocument();
    expect(screen.queryByText(/Certificat/)).not.toBeInTheDocument();
    expect(screen.queryByText("Fichiers")).not.toBeInTheDocument();
    expect(screen.queryByText("Commentaire et fichiers")).not.toBeInTheDocument();
  });

  it("shows no decision, and no notice, for a team request that is not mine to decide", async () => {
    serve({ ...toDecide, state: { key: "waiting_hr", waiting_on: [], last_actor: "Sami Ben Ali" }, viewer: { relation: "team", actions: [], step_id: null } });
    open();
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).queryAllByRole("button")).toHaveLength(0);
    expect(within(summary).queryByText(/pour information/)).not.toBeInTheDocument();
    expect(within(summary).getByText("Approuvée par Sami Ben Ali ; en attente des RH")).toBeInTheDocument();
  });

  it("puts non-medical files one step away", async () => {
    serve({
      ...toDecide,
      attachments: [
        { public_id: "att-1", kind: "proof", name: "faire-part.pdf", size: 1024, uploaded_by: "Amal Trabelsi", uploaded_at: "2026-10-28T10:00:00+01:00" },
      ],
    });
    open();
    await userEvent.click(await screen.findByText("Fichiers"));
    expect(await screen.findByRole("link", { name: "faire-part.pdf" })).toHaveAttribute("href", "/api/v1/attachments/att-1/download");
  });

  it("gives a named approver without a team the same view under My space", async () => {
    serve(toDecide);
    open("me");
    expect(await screen.findByRole("button", { name: "Approuver" })).toBeInTheDocument();
    expect(screen.getByText("En attente de votre décision")).toBeInTheDocument();
  });
});
```

`frontend/src/features/requests/team/TeamRequestsPage.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makeMe } from "@/test/fixtures";
import { chooseOption, setDate, setText } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { makeRequest, paginated, TYPES } from "@/features/requests/fixtures";
import { server } from "@/test/server";
import TeamRequestsPage from "./TeamRequestsPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);

const me = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });
const asTeam = { relation: "team" as const, actions: [], step_id: null };

const leave = makeRequest({ viewer: { relation: "approver", actions: ["decide"], step_id: 7 } });
const sick = makeRequest({
  public_id: "req-5",
  employee: { public_id: "emp-5", name: "Karim Mansour" },
  type: { code: "sick", name: "Congé maladie" },
  start_date: "2026-11-02",
  end_date: "2026-11-03",
  quantity: "2.00",
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  comment: null,
  comment_hidden: true,
  certificate: null,
  viewer: asTeam,
});

function serve() {
  const searches: URLSearchParams[] = [];
  server.use(
    http.get("/api/v1/requests", ({ request }) => {
      searches.push(new URL(request.url).searchParams);
      return HttpResponse.json(paginated([leave, sick]));
    }),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
  );
  return searches;
}

const open = (route = "/team/requests") => renderApp(<TeamRequestsPage />, { route, path: "/team/requests", me });

describe("My team, Requests (UI 6.4)", () => {
  it("shows the team's requests with requester, type, dates, length and status", async () => {
    const searches = serve();
    open();
    expect(await screen.findByText("Amal Trabelsi")).toBeInTheDocument();
    expect(screen.getByText("En attente de votre décision")).toBeInTheDocument();
    expect(screen.getByText("Karim Mansour")).toBeInTheDocument();
    expect(screen.getByText("R(2026-11-02..2026-11-03)")).toBeInTheDocument();
    expect(screen.getByText("2 j")).toBeInTheDocument();
    expect(searches[0].get("scope")).toBe("team");
  });

  it("never shows a certificate sentence to the manager", async () => {
    serve();
    open();
    expect(await screen.findByText("En attente des RH")).toBeInTheDocument();
    expect(screen.queryByText(/Certificat/)).not.toBeInTheDocument();
  });

  it("filters by person, status and period", async () => {
    const searches = serve();
    open();
    await screen.findByText("Amal Trabelsi");
    setText("Personne", "emp-5");
    await chooseOption("Situation", "En attente");
    setDate("Du", "2026-11-01");
    setDate("Au", "2026-11-30");
    await waitFor(() => {
      const last = searches.at(-1);
      expect(last?.get("employee")).toBe("emp-5");
      expect(last?.get("status")).toBe("pending");
      expect(last?.get("from")).toBe("2026-11-01");
      expect(last?.get("to")).toBe("2026-11-30");
    });
  });

  it("has a second view: what I already decided", async () => {
    const searches = serve();
    open();
    await screen.findByText("Amal Trabelsi");
    expect(screen.getByRole("button", { name: "Toute l'équipe" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Déjà décidées par moi" }));
    await waitFor(() => expect(searches.at(-1)?.get("scope")).toBe("decided"));
    expect(screen.getByRole("button", { name: "Déjà décidées par moi" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens straight on the decided view from its address", async () => {
    const searches = serve();
    open("/team/requests?view=decided");
    await screen.findByText("Amal Trabelsi");
    expect(searches[0].get("scope")).toBe("decided");
  });

  it("opens a request in the team workspace and offers no primary action", async () => {
    serve();
    open();
    expect(screen.queryByRole("link", { name: "Nouvelle demande" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByText("Amal Trabelsi"));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/team/requests/req-1");
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/views/RequestManagerView.test.tsx src/features/requests/team`

Expected: FAIL. The manager-view file fails on its assertions (the read-only view shows no "Approuver" button and no decision context); the team file fails with "Failed to resolve import "./TeamRequestsPage"".

- [ ] **Step 5: Write the manager's view and register it**

`frontend/src/features/requests/views/RequestManagerView.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { DecisionContextView } from "../decisions/DecisionContext";
import { canSendBack, DecisionSheet, type DecisionTarget } from "../decisions/DecisionSheet";
import { useRequestsText, useWorkspacePrefix } from "../platform";
import { RequestView } from "../RequestView";
import type { Decision, RequestDetail } from "../types";

/**
 * A request seen by the requester's manager, a delegate or a named approver (UI 6.2).
 * It decides when the API lists `decide`; otherwise it only informs.
 */
export default function RequestManagerView({ request }: { request: RequestDetail }) {
  const { t } = useRequestsText();
  const navigate = useNavigate();
  const prefix = useWorkspacePrefix();
  const [target, setTarget] = useState<DecisionTarget | null>(null);

  const stepId = request.viewer.step_id;
  const canDecide = request.viewer.actions.includes("decide") && stepId !== null;
  const back = prefix === "team" ? "/team" : `/${prefix}/requests`;
  const ask = (decision: Decision) => {
    if (stepId !== null) setTarget({ request, stepId, decision });
  };

  return (
    <>
      <RequestView
        request={request}
        back={back}
        commentFirst
        context={
          <>
            <DecisionContextView context={request.decision_context} unit={request.type.unit} detailed />
            {!canDecide && request.comment_hidden && (
              <p className="mt-3 text-body text-text-secondary">{t("manager.infoOnly")}</p>
            )}
          </>
        }
        actions={
          canDecide ? (
            <>
              <Button variant="primary" onClick={() => ask("approve")}>
                {t("decision.confirm.approve")}
              </Button>
              <Button variant="secondary" onClick={() => ask("reject")}>
                {t("decision.confirm.reject")}
              </Button>
              {canSendBack(request) && (
                <Button variant="secondary" onClick={() => ask("return")}>
                  {t("decision.confirm.return")}
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      <DecisionSheet target={target} onClose={() => setTarget(null)} onDone={() => navigate(back)} />
    </>
  );
}
```

Replace the content of `frontend/src/features/requests/views/registry.ts` with:

```ts
import type { ComponentType } from "react";
import type { RequestDetail, ViewerRelation } from "../types";
import RequestManagerView from "./RequestManagerView";
import RequestMineView from "./RequestMineView";

export type RequestViewComponent = ComponentType<{ request: RequestDetail }>;

/**
 * The view of a request for each relation of the viewer to it (R3).
 * A task adds its view by adding a line. A relation without a line gets the read-only view.
 */
export const VIEWS: Partial<Record<ViewerRelation, RequestViewComponent>> = {
  owner: RequestMineView,
  approver: RequestManagerView,
  team: RequestManagerView,
};
```

- [ ] **Step 6: Write the team's list and register the routes**

`frontend/src/features/requests/team/TeamRequestsPage.tsx`:

```tsx
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { EmptyState, PageHeader } from "@/components";
import { cn } from "@/lib/utils";
import { RequestsList } from "../lists/RequestsList";
import { useRequestsText } from "../platform";

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-md px-3 text-body font-medium sm:min-h-8",
        active ? "bg-card text-foreground" : "text-text-secondary",
      )}
    >
      {children}
    </button>
  );
}

/** /team/requests (UI 6.4): the team's requests in any state, and a second view of what the viewer decided. */
export default function TeamRequestsPage() {
  const { t } = useRequestsText();
  const [search, setSearch] = useSearchParams();
  const decided = search.get("view") === "decided";
  const show = (view: "team" | "decided") => setSearch(view === "decided" ? { view: "decided" } : {});

  return (
    <>
      <PageHeader title={t("teamList.title")} />
      <div role="group" aria-label={t("teamList.viewLabel")} className="mb-4 inline-flex gap-1 rounded-md bg-accent p-1">
        <ViewButton active={!decided} onClick={() => show("team")}>
          {t("teamList.viewTeam")}
        </ViewButton>
        <ViewButton active={decided} onClick={() => show("decided")}>
          {t("teamList.viewDecided")}
        </ViewButton>
      </div>
      <RequestsList
        key={decided ? "decided" : "team"}
        label={t("teamList.title")}
        scope={decided ? "decided" : "team"}
        columns={["who", "type", "when", "quantity", "status"]}
        filters={["employee", "status", "period"]}
        empty={<EmptyState title={t(decided ? "teamList.emptyDecided" : "teamList.empty")} hint={t("teamList.emptyHint")} />}
      />
    </>
  );
}
```

In `frontend/src/workspaces/team/routes.tsx`, add the imports and append two elements to the `teamRoutes` array:

```tsx
import RequestPage from "@/features/requests/RequestPage";
import TeamRequestsPage from "@/features/requests/team/TeamRequestsPage";
```

```tsx
  { path: "requests", element: <TeamRequestsPage /> },
  { path: "requests/:id", element: <RequestPage /> },
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/views src/features/requests/team src/features/requests/RequestPage.test.tsx src/i18n/parity.test.ts`

Expected: PASS (9 tests for the manager view, 6 for the team list; the owner's tests of Task 8 still pass).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/requests frontend/src/test/employeePickerMock.tsx frontend/src/workspaces/team/routes.tsx frontend/src/i18n/locales
git commit -m "feat(requests): manager view of a request and the team's requests"
```

---

### Task 13: HR's corrective actions, as sheets

UI 7.8, "Other HR actions". Four focused tasks, each a 480px sheet: record a decision made outside the system (REQ-10), give the step to someone else (REQ-13), correct, shorten or cancel (REQ-09), count sick leave as annual leave (PRD 6.5, master D17). A fifth, small one names a delegate for the manager a request is stuck with. They are used by the queues of Task 14 and by the HR view of Task 16.

**Files:**
- Create: `frontend/src/features/requests/hr/actions/ActionSheet.tsx`
- Create: `frontend/src/features/requests/hr/actions/RecordOnBehalfSheet.tsx`
- Create: `frontend/src/features/requests/hr/actions/ReassignSheet.tsx`
- Create: `frontend/src/features/requests/hr/actions/CorrectSheet.tsx`
- Create: `frontend/src/features/requests/hr/actions/ReclassifySheet.tsx`
- Create: `frontend/src/features/requests/hr/actions/ManagerDelegateSheet.tsx`
- Modify: `frontend/src/test/employeePickerMock.tsx` (replace: the stand-in also shows the hint and the error)
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (sections `onBehalf`, `reassign`, `correct`, `reclassify`)
- Test: `frontend/src/features/requests/hr/actions/actions.test.tsx`

**Interfaces:**
- Consumes: `useRecordOnBehalf`, `useReassignStep`, `useCorrectRequest`, `useCancelRequest`, `useReclassifyRequest`, `usePreview`, `useRequestTypes`, `isConflict`, `requestsApi` (Task 1); `FieldError` (Task 5); `DateValues`, `currentDates`, `datesOf`, `datesReady`, `dateIssues`, `sameAsCurrent`, `DATE_FIELD_BY_CODE` (Task 9); `canSendBack` (Task 10); `fileProblem`, `useSingleFlight`, `useDebounced`, `serverProblems`, `byName`, `details` (Task 4); `describeWhen`, `describeQuantity` (Task 2); `EmployeePicker`, `useEmployee`, `isFullRecord` (plan 02, `@/features/employees/api`); `DelegationSheet` (plan 02); `TaskSheet`, the bound inputs, `FormSummary`, `toast` from `@/components`.
- Produces (all named exports; every sheet is open while `open` is true and starts from a fresh form each time it opens):
  - `ActionSheet({ open, onOpenChange, title, submitLabel, destructive?, children: (formId: string) => ReactNode })`, `RequestLine({ request })` and `openStep(request: RequestOut): { key: StateKey; waitingOn: string[] }` (the step open now: that of a waiting change to an approved request, else the request's own).
  - `RecordOnBehalfSheet({ open, onOpenChange, request: RequestOut, stepId: number })`
  - `ReassignSheet({ open, onOpenChange, request: RequestOut, stepId: number })`
  - `CorrectSheet({ open, onOpenChange, request: RequestOut })`: offers "correct the dates" when `viewer.actions` has `correct` and "cancel" when it has `cancel`.
  - `ReclassifySheet({ open, onOpenChange, request: RequestOut })`
  - `ManagerDelegateSheet({ open, onOpenChange, employeeId: string })`: plan 02's `DelegationSheet` for the manager of that employee.

What each sheet asks, and what it sends:

| Sheet | Asked | Shown, not asked | Call |
|---|---|---|---|
| Record a decision | Who decided (defaults to the requester's manager on a manager's step), the outcome, when, how (verbally, on paper), a mandatory note, an optional scan | Who the step is waiting for | `POST steps/{id}/record-on-behalf` (multipart) with `version` |
| Give the step to someone else | The new approver (never the requester), a mandatory reason | The current approver | `POST steps/{id}/reassign` |
| Correct or cancel | Correct the dates or cancel; the new dates; a mandatory reason | The current dates and count; the new count and the effect on the balance; who will be told | `POST …/correct` or `POST …/cancel` |
| Count as annual leave | A reason, only when the balance does not cover the days | The days concerned; the balance now and after | `POST …/reclassify` |

The preview behind "correct" is asked with `request: <public id>` and `override: true`, because HR's correction lifts limits like an HR exception but never allows an overlap (plan 03a, contract note 22). The preview behind "count as annual leave" is asked for the annual type with `request: <public id>`; of its problems only `request.balance_insufficient` matters here.

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "onBehalf": {
    "title": "Saisir une décision donnée hors de l'application",
    "who": "Qui a décidé",
    "whoHint": "Cette étape attend : {{names}}",
    "whoRequired": "Indiquez qui a pris la décision.",
    "decision": "Décision",
    "decisions": {
      "approve": "Approuvée",
      "reject": "Refusée",
      "return": "Renvoyée pour correction"
    },
    "when": "Quand la décision a été donnée",
    "whenRequired": "Indiquez quand la décision a été donnée.",
    "channel": "Comment",
    "channels": {
      "verbal": "De vive voix",
      "paper": "Sur papier"
    },
    "note": "Note",
    "noteRequired": "La note est obligatoire : dites dans quelles circonstances la décision a été donnée.",
    "scan": "Formulaire signé (scan)",
    "submit": "Enregistrer la décision",
    "done": "Décision enregistrée."
  },
  "reassign": {
    "title": "Confier l'étape à quelqu'un d'autre",
    "current": "Approbateur actuel : {{names}}",
    "currentNone": "Personne ne peut décider cette étape pour l'instant.",
    "new": "Nouvel approbateur",
    "newRequired": "Choisissez la personne qui décidera.",
    "submit": "Confier l'étape",
    "done": "Étape confiée à quelqu'un d'autre."
  },
  "correct": {
    "title": "Corriger ou annuler la demande",
    "kindLegend": "Que voulez-vous faire ?",
    "kindCorrect": "Corriger les dates",
    "kindCancel": "Annuler la demande",
    "told": "{{name}} et son responsable en seront informés.",
    "cancelGives": "Les jours déjà déduits ({{amount}}) sont rendus au solde.",
    "submitCorrect": "Corriger la demande",
    "submitCancel": "Annuler la demande",
    "doneCorrect": "Demande corrigée.",
    "doneCancel": "Demande annulée."
  },
  "reclassify": {
    "title": "Compter l'arrêt en congé annuel",
    "days": "Jours concernés : {{when}} ({{quantity}})",
    "consequence": "La demande devient un congé annuel, validé par les RH. Ces jours sont déduits du solde de {{name}}.",
    "balanceNow": "Solde aujourd'hui",
    "balanceAfter": "Solde après",
    "short": "Le solde ne couvre pas ces jours. Pour continuer, indiquez pourquoi une exception est accordée.",
    "reason": "Motif de l'exception",
    "submit": "Compter en congé annuel",
    "done": "Arrêt compté en congé annuel."
  }
```

English:

```json
  "onBehalf": {
    "title": "Record a decision given outside the application",
    "who": "Who decided",
    "whoHint": "This step is waiting for: {{names}}",
    "whoRequired": "Say who took the decision.",
    "decision": "Decision",
    "decisions": {
      "approve": "Approved",
      "reject": "Refused",
      "return": "Sent back for correction"
    },
    "when": "When the decision was given",
    "whenRequired": "Say when the decision was given.",
    "channel": "How",
    "channels": {
      "verbal": "Verbally",
      "paper": "On paper"
    },
    "note": "Note",
    "noteRequired": "The note is mandatory: say in what circumstances the decision was given.",
    "scan": "Signed form (scan)",
    "submit": "Record the decision",
    "done": "Decision recorded."
  },
  "reassign": {
    "title": "Give the step to someone else",
    "current": "Current approver: {{names}}",
    "currentNone": "Nobody can decide this step at the moment.",
    "new": "New approver",
    "newRequired": "Choose the person who will decide.",
    "submit": "Give the step",
    "done": "Step given to someone else."
  },
  "correct": {
    "title": "Correct or cancel the request",
    "kindLegend": "What do you want to do?",
    "kindCorrect": "Correct the dates",
    "kindCancel": "Cancel the request",
    "told": "{{name}} and their manager will be told.",
    "cancelGives": "The days already deducted ({{amount}}) go back to the balance.",
    "submitCorrect": "Correct the request",
    "submitCancel": "Cancel the request",
    "doneCorrect": "Request corrected.",
    "doneCancel": "Request cancelled."
  },
  "reclassify": {
    "title": "Count the sick leave as annual leave",
    "days": "Days concerned: {{when}} ({{quantity}})",
    "consequence": "The request becomes annual leave, validated by HR. These days are deducted from the balance of {{name}}.",
    "balanceNow": "Balance today",
    "balanceAfter": "Balance after",
    "short": "The balance does not cover these days. To go on, say why an exception is granted.",
    "reason": "Reason for the exception",
    "submit": "Count as annual leave",
    "done": "Sick leave counted as annual leave."
  }
```

- [ ] **Step 2: Let the stand-in for the employee picker show its hint and its error**

Replace the content of `frontend/src/test/employeePickerMock.tsx` with:

```tsx
interface PickerProps {
  label: string;
  value: string | null;
  onChange: (publicId: string | null) => void;
  hint?: string;
  error?: string;
}

/**
 * Stand-in for plan 02's `EmployeePicker` in unit tests of other features: a text input in which
 * the test types a `public_id`, followed by the hint and the error the real picker would show.
 * Use: vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);
 */
export const employeePickerMock = {
  EmployeePicker: ({ label, value, onChange, hint, error }: PickerProps) => (
    <div>
      <label>
        {label}
        <input value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} />
      </label>
      {hint && <p>{hint}</p>}
      {error && <p>{error}</p>}
    </div>
  ),
};
```

- [ ] **Step 3: Write the failing test**

`frontend/src/features/requests/hr/actions/actions.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ProblemError } from "@/api/problem";
import { toast } from "@/components";
import { makeEmployee } from "@/features/employees/testing";
import {
  makeApprovalItem, makePreview, makeRequest, makeRequestDetail, problemResponse, TYPES,
} from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { chooseOption, setDate, setText, toggle } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { requestsApi } from "../../api";
import type { Preview, PreviewBody } from "../../types";
import { CorrectSheet } from "./CorrectSheet";
import { ManagerDelegateSheet } from "./ManagerDelegateSheet";
import { ReassignSheet } from "./ReassignSheet";
import { ReclassifySheet } from "./ReclassifySheet";
import { RecordOnBehalfSheet } from "./RecordOnBehalfSheet";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));
vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);
vi.mock("@/features/delegations/DelegationSheet", () => ({
  DelegationSheet: ({ open, manager }: { open: boolean; manager?: { name: string } }) =>
    open ? <p>délégation pour {manager?.name}</p> : null,
}));

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });
const CONCURRENT = "Quelqu'un d'autre a agi avant vous. La page affiche maintenant l'état actuel.";

/** A request stuck with the manager, as HR sees it. */
const stuck = makeApprovalItem({
  request: { viewer: { relation: "hr", actions: ["record_on_behalf", "reassign", "correct", "cancel"], step_id: 7 } },
}).request;
const approved = makeRequest({
  status: "approved",
  state: { key: "approved", waiting_on: [] },
  viewer: { relation: "hr", actions: ["correct", "cancel"], step_id: null },
});
const sick = makeRequest({
  type: { code: "sick", name: "Congé maladie" },
  start_date: "2026-11-09",
  end_date: "2026-11-10",
  quantity: "2.00",
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  certificate: { status: "overdue", due_at: "2026-11-11T09:00:00+01:00" },
  viewer: { relation: "hr", actions: ["decide", "attach", "reclassify"], step_id: 8 },
});

function Opened({ children }: { children: (open: boolean, setOpen: (open: boolean) => void) => ReactNode }) {
  const [open, setOpen] = useState(true);
  return <>{children(open, setOpen)}</>;
}

const show = (sheet: (open: boolean, setOpen: (open: boolean) => void) => ReactNode) =>
  renderApp(<Opened>{sheet}</Opened>, { route: "/hr", path: "/hr", me });

function serveRequester(manager: { public_id: string; name: string } | null = { public_id: "emp-mgr", name: "Sami Ben Ali" }) {
  server.use(
    http.get("/api/v1/employees/emp-owner", () => HttpResponse.json(makeEmployee({ public_id: "emp-owner", manager }))),
  );
}

function servePreview(preview: (body: PreviewBody) => Preview = () => makePreview()) {
  const bodies: PreviewBody[] = [];
  server.use(
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.post("/api/v1/requests/preview", async ({ request }) => {
      const body = (await request.json()) as PreviewBody;
      bodies.push(body);
      return HttpResponse.json(preview(body));
    }),
  );
  return bodies;
}

const spies: MockInstance[] = [];

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

afterEach(() => {
  spies.forEach((spy) => spy.mockRestore());
  spies.length = 0;
});

describe("Record a decision made outside the system (REQ-10)", () => {
  const TITLE = "Saisir une décision donnée hors de l'application";

  it("defaults to the requester's manager and records who, what, when, how and the note", async () => {
    serveRequester();
    const record = vi.spyOn(requestsApi, "recordOnBehalf").mockResolvedValue(makeRequestDetail());
    spies.push(record);
    show((open, setOpen) => <RecordOnBehalfSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).getByText("Cette étape attend : Sami Ben Ali")).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByLabelText("Qui a décidé")).toHaveValue("emp-mgr"));
    await chooseOption("Comment", "Sur papier", within(sheet));
    setText("Note", "Signé sur le formulaire papier, remis à l'accueil", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Enregistrer la décision" }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        decided_by: "emp-mgr",
        decision: "approve",
        channel: "paper",
        note: "Signé sur le formulaire papier, remis à l'accueil",
        version: 1,
        scan: null,
        decided_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+01:00$/),
      }),
    );
    expect(toast).toHaveBeenCalledWith("Décision enregistrée.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITLE })).not.toBeInTheDocument());
  });

  it("cannot be confirmed without saying who decided, nor without a note", async () => {
    serveRequester(null);
    const record = vi.spyOn(requestsApi, "recordOnBehalf").mockResolvedValue(makeRequestDetail());
    spies.push(record);
    show((open, setOpen) => <RecordOnBehalfSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    await userEvent.click(within(sheet).getByRole("button", { name: "Enregistrer la décision" }));
    expect(await within(sheet).findByText("Indiquez qui a pris la décision.")).toBeInTheDocument();
    expect(
      within(sheet).getByText("La note est obligatoire : dites dans quelles circonstances la décision a été donnée."),
    ).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
  });

  it("offers every outcome for a request, and no sending back for a change to an approved one", async () => {
    serveRequester();
    const change = makeRequest({
      status: "approved",
      state: { key: "approved", waiting_on: [] },
      amendment: { public_id: "am-1", kind: "change", status: "pending", state_key: "waiting_manager", waiting_on: ["Sami Ben Ali"] },
      viewer: { relation: "hr", actions: ["record_on_behalf", "reassign"], step_id: 9 },
    });
    const first = show((open, setOpen) => <RecordOnBehalfSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    let sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).getByRole("option", { name: "Renvoyée pour correction" })).toBeInTheDocument();
    first.unmount();
    show((open, setOpen) => <RecordOnBehalfSheet open={open} onOpenChange={setOpen} request={change} stepId={9} />);
    sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).getByRole("option", { name: "Approuvée" })).toBeInTheDocument();
    expect(within(sheet).queryByRole("option", { name: "Renvoyée pour correction" })).not.toBeInTheDocument();
    // The step is that of the change: it names whom the change waits for, and defaults to the manager.
    expect(within(sheet).getByText("Cette étape attend : Sami Ben Ali")).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByLabelText("Qui a décidé")).toHaveValue("emp-mgr"));
  });

  it("says so and closes when someone else acted first", async () => {
    serveRequester();
    const record = vi
      .spyOn(requestsApi, "recordOnBehalf")
      .mockRejectedValue(new ProblemError({ status: 409, code: "request.already_processed", detail: "Déjà traitée." }));
    spies.push(record);
    show((open, setOpen) => <RecordOnBehalfSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    await waitFor(() => expect(within(sheet).getByLabelText("Qui a décidé")).toHaveValue("emp-mgr"));
    setText("Note", "Accord donné au téléphone", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Enregistrer la décision" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(CONCURRENT));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITLE })).not.toBeInTheDocument());
  });
});

describe("Give the step to someone else (REQ-13)", () => {
  const TITLE = "Confier l'étape à quelqu'un d'autre";

  function serveReassign() {
    const bodies: unknown[] = [];
    server.use(
      http.post("/api/v1/steps/7/reassign", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(makeRequestDetail());
      }),
    );
    return bodies;
  }

  it("names the current approver and sends the new one with the reason", async () => {
    const bodies = serveReassign();
    show((open, setOpen) => <ReassignSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).getByText("Approbateur actuel : Sami Ben Ali")).toBeInTheDocument();
    setText("Nouvel approbateur", "emp-9", within(sheet));
    setText("Motif", "Sami est en déplacement jusqu'à la fin du mois", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Confier l'étape" }));
    await waitFor(() =>
      expect(bodies).toEqual([{ new_approver: "emp-9", reason: "Sami est en déplacement jusqu'à la fin du mois" }]),
    );
    expect(toast).toHaveBeenCalledWith("Étape confiée à quelqu'un d'autre.");
  });

  it("needs a person and a reason", async () => {
    const bodies = serveReassign();
    show((open, setOpen) => <ReassignSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    await userEvent.click(within(sheet).getByRole("button", { name: "Confier l'étape" }));
    expect(await within(sheet).findByText("Choisissez la personne qui décidera.")).toBeInTheDocument();
    expect(within(sheet).getByText("Indiquez le motif : il est obligatoire.")).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("shows on the person what the server refuses", async () => {
    server.use(
      http.post("/api/v1/steps/7/reassign", () =>
        problemResponse(400, "validation", "Cette personne n'a pas de compte.", [
          { field: "new_approver", code: "request.approver_without_account", detail: "Cette personne n'a pas de compte : elle ne pourrait pas décider." },
        ]),
      ),
    );
    show((open, setOpen) => <ReassignSheet open={open} onOpenChange={setOpen} request={stuck} stepId={7} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    setText("Nouvel approbateur", "emp-9", within(sheet));
    setText("Motif", "Remplacement", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Confier l'étape" }));
    expect(await within(sheet).findByText("Cette personne n'a pas de compte : elle ne pourrait pas décider.")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Motif")).toHaveValue("Remplacement");
  });
});

describe("Correct, shorten or cancel (REQ-09)", () => {
  const TITLE = "Corriger ou annuler la demande";

  function serveCorrect() {
    const calls = { correct: [] as unknown[], cancel: [] as unknown[] };
    server.use(
      http.post("/api/v1/requests/req-1/correct", async ({ request }) => {
        calls.correct.push(await request.json());
        return HttpResponse.json(makeRequestDetail({ status: "approved" }));
      }),
      http.post("/api/v1/requests/req-1/cancel", async ({ request }) => {
        calls.cancel.push(await request.json());
        return HttpResponse.json(makeRequestDetail({ status: "cancelled" }));
      }),
    );
    return calls;
  }

  it("corrects the dates: shows the new count and its effect, says who will be told, sends dates and reason", async () => {
    const calls = serveCorrect();
    const previews = servePreview((body) => makePreview({ quantity: body.end_date === "2026-11-12" ? "4.00" : "3.00" }));
    show((open, setOpen) => <CorrectSheet open={open} onOpenChange={setOpen} request={approved} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).getByText("Demande actuelle : R(2026-11-09..2026-11-11) (3 j)")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Corriger les dates")).toBeChecked();
    expect(within(sheet).getByText("Amal Trabelsi et son responsable en seront informés.")).toBeInTheDocument();
    setDate("Fin", "2026-11-12", within(sheet));
    expect(await within(sheet).findByText("4 j")).toBeInTheDocument();
    expect(within(sheet).getByText("Utilise 1 j de plus.")).toBeInTheDocument();
    expect(previews.at(-1)).toMatchObject({
      type: "annual",
      employee: "emp-owner",
      request: "req-1",
      end_date: "2026-11-12",
      override: true,
    });
    setText("Motif", "Retour décalé d'un jour, convenu avec le responsable", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Corriger la demande" }));
    await waitFor(() =>
      expect(calls.correct).toEqual([
        {
          start_date: "2026-11-09",
          end_date: "2026-11-12",
          starts_at_midday: false,
          ends_at_midday: false,
          start_time: null,
          end_time: null,
          reason: "Retour décalé d'un jour, convenu avec le responsable",
        },
      ]),
    );
    expect(toast).toHaveBeenCalledWith("Demande corrigée.");
  });

  it("cannot be confirmed without a reason, nor with the dates it already has", async () => {
    const calls = serveCorrect();
    servePreview();
    show((open, setOpen) => <CorrectSheet open={open} onOpenChange={setOpen} request={approved} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    await userEvent.click(within(sheet).getByRole("button", { name: "Corriger la demande" }));
    expect(await within(sheet).findByText("Indiquez le motif : il est obligatoire.")).toBeInTheDocument();
    expect(
      within(sheet).getByText("Ce sont les dates actuelles de la demande. Changez-les, ou choisissez l'annulation."),
    ).toBeInTheDocument();
    expect(calls.correct).toHaveLength(0);
  });

  it("refuses a single day flagged at both ends, next to the half-day choices", async () => {
    const calls = serveCorrect();
    servePreview();
    const oneDay = makeRequest({
      status: "approved",
      end_date: "2026-11-09",
      quantity: "1.00",
      state: { key: "approved", waiting_on: [] },
      viewer: { relation: "hr", actions: ["correct", "cancel"], step_id: null },
    });
    show((open, setOpen) => <CorrectSheet open={open} onOpenChange={setOpen} request={oneDay} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    // The half-day choices appear once the type is known to allow them.
    await within(sheet).findByLabelText("Commencer à midi le premier jour");
    await toggle("Commencer à midi le premier jour", within(sheet));
    await toggle("Finir à midi le dernier jour", within(sheet));
    setText("Motif", "Demi-journée seulement", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Corriger la demande" }));
    expect(
      await within(sheet).findByText("Pour une seule journée, choisissez le matin ou l'après-midi, pas les deux."),
    ).toBeInTheDocument();
    expect(calls.correct).toHaveLength(0);
  });

  it("cancels with a reason", async () => {
    const calls = serveCorrect();
    servePreview();
    show((open, setOpen) => <CorrectSheet open={open} onOpenChange={setOpen} request={approved} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    await userEvent.click(within(sheet).getByLabelText("Annuler la demande"));
    expect(within(sheet).queryByLabelText("Fin")).not.toBeInTheDocument();
    expect(await within(sheet).findByText("Les jours déjà déduits (3 j) sont rendus au solde.")).toBeInTheDocument();
    setText("Motif", "Mission annulée par le client", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Annuler la demande" }));
    await waitFor(() => expect(calls.cancel).toEqual([{ reason: "Mission annulée par le client" }]));
    expect(toast).toHaveBeenCalledWith("Demande annulée.");
  });

  it("offers only what the API allows", async () => {
    serveCorrect();
    servePreview();
    const cancelOnly = makeRequest({ viewer: { relation: "hr", actions: ["cancel"], step_id: null } });
    show((open, setOpen) => <CorrectSheet open={open} onOpenChange={setOpen} request={cancelOnly} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).queryByLabelText("Corriger les dates")).not.toBeInTheDocument();
    expect(within(sheet).queryByLabelText("Début")).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Annuler la demande" })).toBeInTheDocument();
  });

  it("shows on its field what the server refuses, and keeps the reason", async () => {
    servePreview();
    server.use(
      http.post("/api/v1/requests/req-1/correct", () =>
        problemResponse(400, "validation", "Ces dates chevauchent son télétravail du 12 novembre.", [
          { field: null, code: "request.overlap", detail: "Ces dates chevauchent son télétravail du 12 novembre." },
        ]),
      ),
    );
    show((open, setOpen) => <CorrectSheet open={open} onOpenChange={setOpen} request={approved} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    setDate("Fin", "2026-11-12", within(sheet));
    setText("Motif", "Retour décalé", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Corriger la demande" }));
    expect(await within(sheet).findByText("Ces dates chevauchent son télétravail du 12 novembre.")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Motif")).toHaveValue("Retour décalé");
  });
});

describe("Count sick leave as annual leave (PRD 6.5)", () => {
  const TITLE = "Compter l'arrêt en congé annuel";
  const short = { field: null, code: "request.balance_insufficient", detail: "Il manque 1,5 jour au solde.", params: { shortfall: 1.5 } };

  function serveReclassify() {
    const bodies: unknown[] = [];
    server.use(
      http.post("/api/v1/requests/req-1/reclassify", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(makeRequestDetail({ status: "approved" }));
      }),
    );
    return bodies;
  }

  it("states the consequence, shows the balance now and after, and reclassifies", async () => {
    const bodies = serveReclassify();
    const previews = servePreview(() => makePreview({ quantity: "2.00", balance: { now: "5.00", on_start: "5.00", after: "3.00" } }));
    show((open, setOpen) => <ReclassifySheet open={open} onOpenChange={setOpen} request={sick} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).getByText("Jours concernés : R(2026-11-09..2026-11-10) (2 j)")).toBeInTheDocument();
    expect(
      within(sheet).getByText(
        "La demande devient un congé annuel, validé par les RH. Ces jours sont déduits du solde de Amal Trabelsi.",
      ),
    ).toBeInTheDocument();
    expect(await within(sheet).findByText("5 j")).toBeInTheDocument();
    expect(within(sheet).getByText("3 j")).toBeInTheDocument();
    expect(previews.at(-1)).toMatchObject({ type: "annual", employee: "emp-owner", request: "req-1", override: false });
    expect(within(sheet).queryByLabelText("Motif de l'exception")).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Compter en congé annuel" }));
    await waitFor(() => expect(bodies).toEqual([{}]));
    expect(toast).toHaveBeenCalledWith("Arrêt compté en congé annuel.");
  });

  it("asks for the reason of the exception when the balance does not cover the days", async () => {
    const bodies = serveReclassify();
    servePreview(() => makePreview({ quantity: "2.00", balance: { now: "0.50", on_start: "0.50", after: "-1.50" }, problems: [short] }));
    show((open, setOpen) => <ReclassifySheet open={open} onOpenChange={setOpen} request={sick} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(
      await within(sheet).findByText("Le solde ne couvre pas ces jours. Pour continuer, indiquez pourquoi une exception est accordée."),
    ).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Compter en congé annuel" }));
    expect(await within(sheet).findByText("Indiquez le motif : il est obligatoire.")).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
    setText("Motif de l'exception", "Certificat jamais fourni, accord de la direction", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Compter en congé annuel" }));
    await waitFor(() => expect(bodies).toEqual([{ override_reason: "Certificat jamais fourni, accord de la direction" }]));
  });

  it("asks for the reason when it is the server that finds the balance short", async () => {
    servePreview(() => makePreview({ quantity: "2.00", balance: null }));
    server.use(http.post("/api/v1/requests/req-1/reclassify", () => problemResponse(400, "validation", short.detail, [short])));
    show((open, setOpen) => <ReclassifySheet open={open} onOpenChange={setOpen} request={sick} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    await userEvent.click(within(sheet).getByRole("button", { name: "Compter en congé annuel" }));
    expect(await within(sheet).findByLabelText("Motif de l'exception")).toBeInTheDocument();
    expect(within(sheet).getByText("Il manque 1,5 jour au solde.")).toBeInTheDocument();
  });

  it("ignores what the annual type would object to a leave already taken", async () => {
    servePreview(() =>
      makePreview({
        quantity: "2.00",
        problems: [{ field: "start_date", code: "request.past_dates", detail: "Les dates passées ne sont pas autorisées.", params: {} }],
      }),
    );
    show((open, setOpen) => <ReclassifySheet open={open} onOpenChange={setOpen} request={sick} />);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    await within(sheet).findByText("Jours concernés : R(2026-11-09..2026-11-10) (2 j)");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(within(sheet).queryByText("Les dates passées ne sont pas autorisées.")).not.toBeInTheDocument();
    expect(within(sheet).queryByLabelText("Motif de l'exception")).not.toBeInTheDocument();
  });
});

describe("Name a delegate for the manager a request is stuck with (UI 7.4)", () => {
  it("opens plan 02's delegation sheet for the requester's manager", async () => {
    serveRequester({ public_id: "emp-mgr", name: "Sami Ben Ali" });
    show((open, setOpen) => <ManagerDelegateSheet open={open} onOpenChange={setOpen} employeeId="emp-owner" />);
    expect(await screen.findByText("délégation pour Sami Ben Ali")).toBeInTheDocument();
  });

  it("opens nothing for someone who has no manager", async () => {
    serveRequester(null);
    show((open, setOpen) => <ManagerDelegateSheet open={open} onOpenChange={setOpen} employeeId="emp-owner" />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByText(/délégation pour/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/hr/actions/actions.test.tsx`

Expected: FAIL with "Failed to resolve import "./CorrectSheet"" (and the four other sheets).

- [ ] **Step 5: Write the frame every sheet shares**

`frontend/src/features/requests/hr/actions/ActionSheet.tsx`:

```tsx
import { useId, type ReactNode } from "react";
import { TaskSheet } from "@/components";
import { Button } from "@/components/ui/button";
import { useRequestsText } from "../../platform";
import { describeQuantity, describeWhen } from "../../text";
import type { RequestOut, StateKey } from "../../types";

/**
 * The step that is open now: that of a waiting change to an approved request, else the request's
 * own. It says whom the step waits for and whether it is a manager's.
 */
export function openStep(request: RequestOut): { key: StateKey; waitingOn: string[] } {
  const change = request.status === "approved" && request.amendment?.status === "pending" ? request.amendment : null;
  return change
    ? { key: change.state_key, waitingOn: change.waiting_on }
    : { key: request.state.key, waitingOn: request.state.waiting_on };
}

interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  destructive?: boolean;
  /** The form of the task. It carries `id={formId}` so that the button of the footer submits it. */
  children: (formId: string) => ReactNode;
}

/**
 * A focused HR task: plan 01b's sheet with one confirming button and Cancel. The form is mounted
 * only while the sheet is open, so every opening starts from a fresh form.
 */
export function ActionSheet({ open, onOpenChange, title, submitLabel, destructive = false, children }: ActionSheetProps) {
  const { t } = useRequestsText();
  const formId = useId();
  return (
    <TaskSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button type="submit" form={formId} variant={destructive ? "destructive" : "primary"}>
            {submitLabel}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
        </>
      }
    >
      {open ? children(formId) : null}
    </TaskSheet>
  );
}

/** Who and what the task is about, at the top of a sheet. */
export function RequestLine({ request }: { request: RequestOut }) {
  const { t, lang } = useRequestsText();
  return (
    <div>
      <p className="text-body font-semibold">{request.employee.name}</p>
      <p className="text-body text-text-secondary">
        {`${request.type.name} · ${describeWhen(request, t, lang)} · ${describeQuantity(request, lang)}`}
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Write "record a decision" and "give the step to someone else"**

`frontend/src/features/requests/hr/actions/RecordOnBehalfSheet.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useController, useForm } from "react-hook-form";
import type { FieldProblem } from "@/api/problem";
import { FileField, FormSummary, SelectField, TextAreaField, TextField, toast } from "@/components";
import { isFullRecord, useEmployee } from "@/features/employees/api";
import { EmployeePicker } from "@/features/employees/EmployeePicker";
import { isConflict, useRecordOnBehalf } from "../../api";
import { canSendBack } from "../../decisions/DecisionSheet";
import { fileProblem } from "../../form/schema";
import { useSingleFlight } from "../../form/useSingleFlight";
import { useRequestsText } from "../../platform";
import { byName, details, serverProblems } from "../../problems";
import type { Decision, RequestOut } from "../../types";
import { ActionSheet, openStep, RequestLine } from "./ActionSheet";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: RequestOut;
  /** The step the decision is recorded for: `request.viewer.step_id`. */
  stepId: number;
}

interface Values {
  decided_by: string;
  decision: Decision;
  decided_at: string;
  channel: "verbal" | "paper";
  note: string;
  scan: File | null;
}

const FIELDS = ["decided_by", "decision", "decided_at", "channel", "note", "scan"] as const;
const BY_CODE = {
  "request.decided_at_future": "decided_at",
  "request.channel_invalid": "channel",
  "request.reason_required": "note",
  "request.comment_required": "note",
  "request.own_request": "decided_by",
  "request.amendment_cannot_return": "decision",
  "files.too_large": "scan",
  "files.type_not_allowed": "scan",
  "files.content_mismatch": "scan",
  "files.empty": "scan",
} as const;

/** Now in Tunis, as a `datetime-local` input takes it: "2026-11-05T10:30". */
function nowInTunis(): string {
  const text = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Tunis", dateStyle: "short", timeStyle: "short" }).format(new Date());
  return text.replace(" ", "T");
}

/** Tunis is at UTC+1 all year, so a local time there always carries the same offset. */
const asInstant = (local: string) => `${local}:00+01:00`;

/** UI 7.8: record a decision an approver gave verbally or on paper (REQ-10). */
export function RecordOnBehalfSheet({ open, onOpenChange, request, stepId }: SheetProps) {
  const { t } = useRequestsText();
  return (
    <ActionSheet open={open} onOpenChange={onOpenChange} title={t("onBehalf.title")} submitLabel={t("onBehalf.submit")}>
      {(formId) => <RecordForm formId={formId} request={request} stepId={stepId} onDone={() => onOpenChange(false)} />}
    </ActionSheet>
  );
}

function RecordForm({ formId, request, stepId, onDone }: { formId: string; request: RequestOut; stepId: number; onDone: () => void }) {
  const { t } = useRequestsText();
  const record = useRecordOnBehalf();
  const form = useForm<Values>({
    defaultValues: { decided_by: "", decision: "approve", decided_at: nowInTunis(), channel: "verbal", note: "", scan: null },
  });
  const who = useController({ control: form.control, name: "decided_by" });
  const [loose, setLoose] = useState<FieldProblem[]>([]);

  // "Who decided" defaults to the step's approver: on a manager's step, the requester's manager.
  const requester = useEmployee(request.employee.public_id);
  const managerId = requester.data && isFullRecord(requester.data) ? (requester.data.manager?.public_id ?? "") : "";
  const step = openStep(request);
  const onManagerStep = step.key === "waiting_manager";
  useEffect(() => {
    if (managerId !== "" && onManagerStep && form.getValues("decided_by") === "") form.setValue("decided_by", managerId);
  }, [managerId, onManagerStep, form]);

  const decisions: Decision[] = canSendBack(request) ? ["approve", "reject", "return"] : ["approve", "reject"];
  const waitingOn = step.waitingOn.join(", ");

  const [save] = useSingleFlight(async (values: Values) => {
    const note = values.note.trim();
    const scanMessage = values.scan ? fileProblem(values.scan, t) : null;
    if (values.decided_by === "") form.setError("decided_by", { type: "client", message: t("onBehalf.whoRequired") });
    if (values.decided_at === "") form.setError("decided_at", { type: "client", message: t("onBehalf.whenRequired") });
    if (note === "") form.setError("note", { type: "client", message: t("onBehalf.noteRequired") });
    if (scanMessage) form.setError("scan", { type: "client", message: scanMessage });
    if (values.decided_by === "" || values.decided_at === "" || note === "" || scanMessage) return;
    try {
      await record.mutateAsync({
        stepId,
        input: {
          decided_by: values.decided_by,
          decision: values.decision,
          decided_at: asInstant(values.decided_at),
          channel: values.channel,
          note,
          version: request.version,
          scan: values.scan,
        },
      });
      toast(t("onBehalf.done"));
      onDone();
    } catch (error) {
      if (isConflict(error)) {
        toast(t("common:concurrent"));
        onDone();
        return;
      }
      setLoose(serverProblems(form, error, t, byName<Values>(FIELDS, BY_CODE)));
    }
  });

  return (
    <form id={formId} noValidate onSubmit={form.handleSubmit(save)} className="flex flex-col gap-4">
      <RequestLine request={request} />
      <FormSummary problems={details(loose)} />
      <EmployeePicker
        label={t("onBehalf.who")}
        value={who.field.value === "" ? null : who.field.value}
        onChange={(publicId) => who.field.onChange(publicId ?? "")}
        exclude={[request.employee.public_id]}
        hint={waitingOn === "" ? undefined : t("onBehalf.whoHint", { names: waitingOn })}
        error={who.fieldState.error?.message}
      />
      <SelectField
        control={form.control}
        name="decision"
        label={t("onBehalf.decision")}
        options={decisions.map((decision) => ({ value: decision, label: t(`onBehalf.decisions.${decision}`) }))}
      />
      <TextField control={form.control} name="decided_at" label={t("onBehalf.when")} type="datetime-local" max={nowInTunis()} />
      <SelectField
        control={form.control}
        name="channel"
        label={t("onBehalf.channel")}
        options={[
          { value: "verbal", label: t("onBehalf.channels.verbal") },
          { value: "paper", label: t("onBehalf.channels.paper") },
        ]}
      />
      <TextAreaField control={form.control} name="note" label={t("onBehalf.note")} />
      <FileField control={form.control} name="scan" label={t("onBehalf.scan")} optional hint={t("form.fileHint")} />
    </form>
  );
}
```

`frontend/src/features/requests/hr/actions/ReassignSheet.tsx`:

```tsx
import { useState } from "react";
import { useController, useForm } from "react-hook-form";
import type { FieldProblem } from "@/api/problem";
import { FormSummary, TextAreaField, toast } from "@/components";
import { EmployeePicker } from "@/features/employees/EmployeePicker";
import { isConflict, useReassignStep } from "../../api";
import { useSingleFlight } from "../../form/useSingleFlight";
import { useRequestsText } from "../../platform";
import { byName, details, serverProblems } from "../../problems";
import type { RequestOut } from "../../types";
import { ActionSheet, openStep, RequestLine } from "./ActionSheet";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: RequestOut;
  stepId: number;
}

interface Values {
  new_approver: string;
  reason: string;
}

const BY_CODE = {
  "request.approver_without_account": "new_approver",
  "request.own_request": "new_approver",
  "request.reason_required": "reason",
} as const;

/** UI 7.8: give the step to another active employee, never the requester (REQ-13). */
export function ReassignSheet({ open, onOpenChange, request, stepId }: SheetProps) {
  const { t } = useRequestsText();
  return (
    <ActionSheet open={open} onOpenChange={onOpenChange} title={t("reassign.title")} submitLabel={t("reassign.submit")}>
      {(formId) => <ReassignForm formId={formId} request={request} stepId={stepId} onDone={() => onOpenChange(false)} />}
    </ActionSheet>
  );
}

function ReassignForm({ formId, request, stepId, onDone }: { formId: string; request: RequestOut; stepId: number; onDone: () => void }) {
  const { t } = useRequestsText();
  const reassign = useReassignStep();
  const form = useForm<Values>({ defaultValues: { new_approver: "", reason: "" } });
  const approver = useController({ control: form.control, name: "new_approver" });
  const [loose, setLoose] = useState<FieldProblem[]>([]);
  const current = openStep(request).waitingOn.join(", ");

  const [save] = useSingleFlight(async (values: Values) => {
    const reason = values.reason.trim();
    if (values.new_approver === "") form.setError("new_approver", { type: "client", message: t("reassign.newRequired") });
    if (reason === "") form.setError("reason", { type: "client", message: t("formErrors.reasonRequired") });
    if (values.new_approver === "" || reason === "") return;
    try {
      await reassign.mutateAsync({ stepId, body: { new_approver: values.new_approver, reason } });
      toast(t("reassign.done"));
      onDone();
    } catch (error) {
      if (isConflict(error)) {
        toast(t("common:concurrent"));
        onDone();
        return;
      }
      setLoose(serverProblems(form, error, t, byName<Values>(["new_approver", "reason"], BY_CODE)));
    }
  });

  return (
    <form id={formId} noValidate onSubmit={form.handleSubmit(save)} className="flex flex-col gap-4">
      <RequestLine request={request} />
      <p className="text-body">{current === "" ? t("reassign.currentNone") : t("reassign.current", { names: current })}</p>
      <FormSummary problems={details(loose)} />
      <EmployeePicker
        label={t("reassign.new")}
        value={approver.field.value === "" ? null : approver.field.value}
        onChange={(publicId) => approver.field.onChange(publicId ?? "")}
        exclude={[request.employee.public_id]}
        error={approver.fieldState.error?.message}
      />
      <TextAreaField control={form.control} name="reason" label={t("common.reason")} />
    </form>
  );
}
```

- [ ] **Step 7: Write "correct or cancel"**

`frontend/src/features/requests/hr/actions/CorrectSheet.tsx`:

```tsx
import { useState } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";
import type { FieldProblem } from "@/api/problem";
import { DateField, FormSummary, SwitchField, TextAreaField, TimeField, toast } from "@/components";
import { formatDays, formatHours } from "@/lib/format";
import { isConflict, useCancelRequest, useCorrectRequest, usePreview, useRequestTypes } from "../../api";
import { currentDates, DATE_FIELD_BY_CODE, dateIssues, datesOf, datesReady, sameAsCurrent, type DateValues } from "../../dates";
import { FieldError } from "../../form/FieldError";
import { useDebounced } from "../../form/useDebounced";
import { useSingleFlight } from "../../form/useSingleFlight";
import { useRequestsText } from "../../platform";
import { byName, details, serverProblems } from "../../problems";
import { describeQuantity, describeWhen } from "../../text";
import type { PreviewBody, RequestOut } from "../../types";
import { ActionSheet } from "./ActionSheet";

type Kind = "correct" | "cancel";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: RequestOut;
}

interface Values extends DateValues {
  reason: string;
}

const BY_CODE: Record<string, Path<Values>> = { ...DATE_FIELD_BY_CODE, "request.reason_required": "reason" };

/** UI 7.8: correct, shorten or cancel any request directly, with a mandatory reason (REQ-09). */
export function CorrectSheet({ open, onOpenChange, request }: SheetProps) {
  const { t } = useRequestsText();
  const canCorrect = request.viewer.actions.includes("correct");
  const canCancel = request.viewer.actions.includes("cancel");
  const [kind, setKind] = useState<Kind>(canCorrect ? "correct" : "cancel");
  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("correct.title")}
      submitLabel={t(kind === "correct" ? "correct.submitCorrect" : "correct.submitCancel")}
      destructive={kind === "cancel"}
    >
      {(formId) => (
        <CorrectForm
          formId={formId}
          request={request}
          kind={kind}
          onKind={canCorrect && canCancel ? setKind : undefined}
          onDone={() => onOpenChange(false)}
        />
      )}
    </ActionSheet>
  );
}

interface CorrectFormProps {
  formId: string;
  request: RequestOut;
  kind: Kind;
  /** Given when both actions are allowed: the choice between them is then offered. */
  onKind?: (kind: Kind) => void;
  onDone: () => void;
}

function CorrectForm({ formId, request, kind, onKind, onDone }: CorrectFormProps) {
  const { t, lang } = useRequestsText();
  const types = useRequestTypes();
  const correct = useCorrectRequest();
  const cancel = useCancelRequest();
  const form = useForm<Values>({ defaultValues: { ...currentDates(request), reason: "" } });
  const values = useWatch({ control: form.control }) as Values;
  const [loose, setLoose] = useState<FieldProblem[]>([]);

  const correcting = kind === "correct";
  const hourly = request.type.unit === "hour";
  const type = types.data?.find((item) => item.code === request.type.code);
  const allowsHalfDay = type?.allows_half_day ?? (request.starts_at_midday || request.ends_at_midday);
  const deducts = type?.balance_effect === "deducts_annual";
  const amount = (value: string | number) => (hourly ? formatHours(value, lang) : formatDays(value, lang));

  // HR's correction lifts limits like an HR exception, and the request must not collide with itself.
  const body: PreviewBody | null =
    correcting && datesReady(values, hourly)
      ? {
          type: request.type.code,
          employee: request.employee.public_id,
          request: request.public_id,
          ...datesOf(values, hourly),
          exceptional_event: request.event?.id ?? null,
          override: true,
        }
      : null;
  const key = body ? JSON.stringify(body) : "";
  const settledKey = useDebounced(key, 300);
  const preview = usePreview(settledKey === "" ? null : (JSON.parse(settledKey) as PreviewBody));
  const computed = key !== "" && key === settledKey && preview.isSuccess && !preview.isPlaceholderData ? preview.data : undefined;
  const difference = computed ? Number(computed.quantity) - Number(request.quantity) : 0;

  const shown: Path<Values>[] = !correcting
    ? ["reason"]
    : hourly
      ? ["reason", "start_date", "start_time", "end_time"]
      : allowsHalfDay
        ? ["reason", "start_date", "end_date", "starts_at_midday", "ends_at_midday"]
        : ["reason", "start_date", "end_date"];
  const resolve = (problem: FieldProblem) => {
    const field = byName<Values>(shown, BY_CODE)(problem);
    return field !== null && shown.includes(field) ? field : null;
  };

  const [save] = useSingleFlight(async (current: Values) => {
    const reason = current.reason.trim();
    const issues = correcting ? dateIssues(current, hourly, t) : [];
    if (correcting && issues.length === 0 && sameAsCurrent(current, request)) issues.push(["start_date", t("change.unchanged")]);
    for (const [path, message] of issues) form.setError(path, { type: "client", message });
    if (reason === "") form.setError("reason", { type: "client", message: t("formErrors.reasonRequired") });
    if (issues.length > 0 || reason === "") return;
    try {
      if (correcting) await correct.mutateAsync({ id: request.public_id, body: { ...datesOf(current, hourly), reason } });
      else await cancel.mutateAsync({ id: request.public_id, reason });
      toast(t(correcting ? "correct.doneCorrect" : "correct.doneCancel"));
      onDone();
    } catch (error) {
      if (isConflict(error)) {
        toast(t("common:concurrent"));
        onDone();
        return;
      }
      setLoose(serverProblems(form, error, t, resolve));
    }
  });

  return (
    <form id={formId} noValidate onSubmit={form.handleSubmit(save)} className="flex flex-col gap-4">
      <p className="text-body font-semibold">{request.employee.name}</p>
      <p className="text-body text-text-secondary">
        {t("change.current", { when: describeWhen(request, t, lang), quantity: describeQuantity(request, lang) })}
      </p>

      {onKind && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-body font-medium">{t("correct.kindLegend")}</legend>
          <label className="flex min-h-11 items-center gap-2 text-body">
            <input type="radio" name={`${formId}-kind`} checked={correcting} onChange={() => onKind("correct")} />
            {t("correct.kindCorrect")}
          </label>
          <label className="flex min-h-11 items-center gap-2 text-body">
            <input type="radio" name={`${formId}-kind`} checked={!correcting} onChange={() => onKind("cancel")} />
            {t("correct.kindCancel")}
          </label>
        </fieldset>
      )}

      <FormSummary problems={details([...loose, ...(computed?.problems ?? [])])} />

      {correcting && !hourly && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField control={form.control} name="start_date" label={t("form.start")} />
            <DateField control={form.control} name="end_date" label={t("form.end")} />
          </div>
          {allowsHalfDay && (
            <>
              <SwitchField control={form.control} name="starts_at_midday" label={t("form.startsAtMidday")} />
              <SwitchField control={form.control} name="ends_at_midday" label={t("form.endsAtMidday")} />
              <FieldError control={form.control} name="starts_at_midday" />
              <FieldError control={form.control} name="ends_at_midday" />
            </>
          )}
        </>
      )}
      {correcting && hourly && (
        <div className="grid gap-4 sm:grid-cols-3">
          <DateField control={form.control} name="start_date" label={t("form.date")} />
          <TimeField control={form.control} name="start_time" label={t("form.from")} />
          <TimeField control={form.control} name="end_time" label={t("form.to")} />
        </div>
      )}

      {correcting && computed && (
        <dl aria-label={t("form.computed")} className="flex flex-col gap-3 rounded-md bg-muted px-4 py-3">
          <div>
            <dt className="text-caption text-muted-foreground">{t("change.newCount")}</dt>
            <dd className="text-section font-semibold">{amount(computed.quantity)}</dd>
          </div>
          {deducts && (
            <div>
              <dt className="text-caption text-muted-foreground">{t("change.balanceEffect")}</dt>
              <dd className="text-body">
                {difference > 0
                  ? t("change.uses", { amount: amount(difference) })
                  : difference < 0
                    ? t("change.gives", { amount: amount(-difference) })
                    : t("change.same")}
              </dd>
            </div>
          )}
        </dl>
      )}
      {!correcting && deducts && request.status === "approved" && (
        <p className="text-body text-text-secondary">{t("correct.cancelGives", { amount: amount(request.quantity) })}</p>
      )}

      <TextAreaField control={form.control} name="reason" label={t("common.reason")} />
      <p className="text-caption text-muted-foreground">{t("correct.told", { name: request.employee.name })}</p>
    </form>
  );
}
```

- [ ] **Step 8: Write "count as annual leave" and "name a delegate for the manager"**

`frontend/src/features/requests/hr/actions/ReclassifySheet.tsx`:

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ProblemError, type FieldProblem } from "@/api/problem";
import { FormSummary, TextAreaField, toast } from "@/components";
import { formatDays } from "@/lib/format";
import { isConflict, usePreview, useReclassifyRequest } from "../../api";
import { currentDates, datesOf } from "../../dates";
import { useSingleFlight } from "../../form/useSingleFlight";
import { useRequestsText } from "../../platform";
import { byName, details, serverProblems } from "../../problems";
import { describeQuantity, describeWhen } from "../../text";
import type { RequestOut } from "../../types";
import { ActionSheet } from "./ActionSheet";

/** The seeded code of annual leave (master 7.9), the type a reclassified sick leave becomes. */
const ANNUAL = "annual";
const SHORT = "request.balance_insufficient";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: RequestOut;
}

interface Values {
  override_reason: string;
}

/** UI 7.8: count a sick leave as annual leave; it is HR's decision on the request (PRD 6.5, master D17). */
export function ReclassifySheet({ open, onOpenChange, request }: SheetProps) {
  const { t } = useRequestsText();
  return (
    <ActionSheet open={open} onOpenChange={onOpenChange} title={t("reclassify.title")} submitLabel={t("reclassify.submit")}>
      {(formId) => <ReclassifyForm formId={formId} request={request} onDone={() => onOpenChange(false)} />}
    </ActionSheet>
  );
}

function ReclassifyForm({ formId, request, onDone }: { formId: string; request: RequestOut; onDone: () => void }) {
  const { t, lang } = useRequestsText();
  const reclassify = useReclassifyRequest();
  const form = useForm<Values>({ defaultValues: { override_reason: "" } });
  const [loose, setLoose] = useState<FieldProblem[]>([]);
  const [refused, setRefused] = useState(false);

  // What the same days would mean as annual leave. Only the balance matters: the other rules of
  // the annual type (notice, past dates) do not apply to a leave that was already taken.
  const preview = usePreview({
    type: ANNUAL,
    employee: request.employee.public_id,
    request: request.public_id,
    ...datesOf(currentDates(request), false),
    exceptional_event: null,
    override: false,
  });
  const balance = preview.data?.balance ?? null;
  const shortInPreview = (preview.data?.problems ?? []).find((problem) => problem.code === SHORT);
  const needsReason = refused || shortInPreview !== undefined;

  const [save] = useSingleFlight(async (values: Values) => {
    const reason = values.override_reason.trim();
    if (needsReason && reason === "") {
      form.setError("override_reason", { type: "client", message: t("formErrors.reasonRequired") }, { shouldFocus: true });
      return;
    }
    try {
      await reclassify.mutateAsync({ id: request.public_id, overrideReason: needsReason ? reason : "" });
      toast(t("reclassify.done"));
      onDone();
    } catch (error) {
      if (isConflict(error)) {
        toast(t("common:concurrent"));
        onDone();
        return;
      }
      if (error instanceof ProblemError && error.errors.some((problem) => problem.code === SHORT)) setRefused(true);
      setLoose(serverProblems(form, error, t, byName<Values>(["override_reason"], { "request.reason_required": "override_reason" })));
    }
  });

  return (
    <form id={formId} noValidate onSubmit={form.handleSubmit(save)} className="flex flex-col gap-4">
      <p className="text-body font-semibold">{request.employee.name}</p>
      <p className="text-body">
        {t("reclassify.days", { when: describeWhen(request, t, lang), quantity: describeQuantity(request, lang) })}
      </p>
      <p className="text-body">{t("reclassify.consequence", { name: request.employee.name })}</p>
      {balance && (
        <dl className="flex gap-6 rounded-md bg-muted px-4 py-3">
          <div>
            <dt className="text-caption text-muted-foreground">{t("reclassify.balanceNow")}</dt>
            <dd className="text-body font-semibold">{formatDays(balance.now, lang)}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">{t("reclassify.balanceAfter")}</dt>
            <dd className="text-body font-semibold">{formatDays(balance.after, lang)}</dd>
          </div>
        </dl>
      )}
      <FormSummary problems={details(loose.length > 0 ? loose : shortInPreview ? [shortInPreview] : [])} />
      {needsReason && (
        <>
          <p className="text-body text-text-secondary">{t("reclassify.short")}</p>
          <TextAreaField control={form.control} name="override_reason" label={t("reclassify.reason")} />
        </>
      )}
    </form>
  );
}
```

`frontend/src/features/requests/hr/actions/ManagerDelegateSheet.tsx`:

```tsx
import { DelegationSheet } from "@/features/delegations/DelegationSheet";
import { isFullRecord, useEmployee } from "@/features/employees/api";

interface ManagerDelegateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The requester whose request is stuck: the delegate is named for their manager. */
  employeeId: string;
}

/**
 * UI 7.4: name a delegate for the manager a request is stuck with. A queue item carries the
 * manager's name only, so the manager is read from the requester's record, which HR may open.
 */
export function ManagerDelegateSheet({ open, onOpenChange, employeeId }: ManagerDelegateSheetProps) {
  const requester = useEmployee(open ? employeeId : undefined);
  const manager = requester.data && isFullRecord(requester.data) ? requester.data.manager : null;
  if (!open || !manager) return null;
  return <DelegationSheet open onOpenChange={onOpenChange} manager={manager} />;
}
```

- [ ] **Step 9: Run the test to see it pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/hr/actions/actions.test.tsx src/features/requests/team src/i18n/parity.test.ts`

Expected: PASS: 19 tests for the sheets; the team list of Task 12, which uses the same picker stand-in, still passes.

If a click on the confirming button does nothing in the test, check that the form carries `id={formId}` and the button `form={formId}`: plan 01b's `TaskSheet` draws the footer outside the form, and the button reaches it through that attribute.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/requests/hr frontend/src/test/employeePickerMock.tsx frontend/src/i18n/locales
git commit -m "feat(requests): HR's corrective actions as sheets"
```

---

### Task 14: The HR desk and its three queues

UI 7.1 to 7.4. The desk answers four questions at a glance and leads to the oldest thing to do; each queue page lists everything that waits and lets HR act on a row without opening it. The fourth queue, profile changes, is plan 02's page: the desk shows its count and links to it, because `/hr/profile-changes` has no entry in the navigation (plan 02, contract notes).

**Files:**
- Create: `frontend/src/features/requests/DocumentStatus.tsx`
- Create: `frontend/src/features/requests/queues/QueueTable.tsx`
- Create: `frontend/src/features/requests/queues/ToValidatePage.tsx`
- Create: `frontend/src/features/requests/queues/CertificatesPage.tsx`
- Create: `frontend/src/features/requests/queues/StuckPage.tsx`
- Create: `frontend/src/features/home/HrDeskPage.tsx`
- Modify: `frontend/src/app/homes.ts` (add one line)
- Modify: `frontend/src/workspaces/hr/routes.tsx` (append three routes)
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (sections `document`, `queues`, `desk`)
- Test: `frontend/src/features/requests/queues/HrQueues.test.tsx`
- Test: `frontend/src/features/home/HrDeskPage.test.tsx`

**Interfaces:**
- Consumes: `useApprovals`, `useRequestTypes`, `useDepartmentOptions` (Task 1); `Gate`; `TypeTag`, `describeWhen`, `describeQuantity` (Task 2); `AddFileSheet` (Task 8); `DecisionSheet`, `DecisionTarget`, `canSendBack` (Task 10); `RecordOnBehalfSheet`, `ReassignSheet`, `ReclassifySheet`, `ManagerDelegateSheet`, `openStep` (Task 13); `useProfileChanges` from `@/features/profile/api` (plan 02); `Block`, `DataTable`, `Column`, `FilterBar`, `FilterSelect`, `useListParams`, `PageHeader`, `EmptyState`, `StatusBadge`, `SomethingWentWrong` from `@/components`.
- Produces:
  - `DocumentStatus({ request })`: where the document of a request stands, as a status sentence. Nothing when `certificate` is null.
  - `queues/QueueTable.tsx`: `type QueueColumn = "who" | "department" | "type" | "when" | "quantity" | "document" | "due" | "overdue" | "waitingOn" | "since"`, `QUEUE_PAGE_SIZE` (100), `overdueBy(dueAt, now, lang): string`, `RowButton({ onClick, children })`, `QueueTable({ label, query, items?, columns, actions, empty })`. The first column is the requester's name and opens `/hr/requests/:id`; the row's actions sit under its last value, so a queue never has more than six columns (M4).
  - `ToValidatePage`, `CertificatesPage`, `StuckPage` (default exports) at `/hr/validate`, `/hr/certificates`, `/hr/stuck`.
  - `HrDeskPage` (default export of `@/features/home/HrDeskPage`), registered as `HOMES.hr`.

What each queue shows and offers. Every action appears only when `viewer.actions` of the row's request contains it.

| Queue (`GET approvals?queue=`) | Per row | Filters | Actions (`viewer.actions`) |
|---|---|---|---|
| To validate (`hr`) | who, department, type, dates, length, document status | type and department (asked of the server), document status (applied to the rows received) | Approve, Refuse, Send back (`decide`; no Send back for a change) |
| Certificates (`certificates`) | who, dates, due date, overdue by | none | Add the certificate (`attach`), Count as annual leave (`reclassify`), Refuse (`decide`) |
| Stuck with a manager (`stuck`) | who, type, dates, whom it waits for (the manager and any delegate), since when | none | Record the decision (`record_on_behalf`), Give to someone else (`reassign`), Name a delegate (a manager's step) |

A queue asks for its hundred oldest rows in one call and says so when more are waiting. "Overdue by" is the time elapsed since `certificate.due_at`; that a certificate is overdue is the server's statement (`certificate.status`), never this page's.

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "document": {
    "not_needed": "Aucun document requis",
    "attached": "Document fourni",
    "due": "À fournir avant le {{date}}",
    "overdue": "En retard, attendu le {{date}}",
    "missing": "Justificatif pas encore fourni"
  },
  "queues": {
    "columns": {
      "document": "Document",
      "due": "À fournir avant le",
      "overdue": "Retard",
      "waitingOn": "En attente de",
      "since": "Depuis le"
    },
    "documentOption": {
      "attached": "Fourni",
      "due": "À fournir",
      "overdue": "En retard",
      "missing": "Manquant",
      "not_needed": "Non requis"
    },
    "onTime": "Dans les délais",
    "nobody": "Personne ne peut décider",
    "truncated": "Seules les {{n}} demandes les plus anciennes sont affichées.",
    "emptyHint": "Changez les filtres pour en voir d'autres.",
    "validate": {
      "title": "À valider",
      "empty": "Aucune demande n'attend la validation des RH.",
      "documentFilter": "Document"
    },
    "certificates": {
      "title": "Certificats",
      "empty": "Aucun arrêt maladie n'attend son certificat.",
      "attach": "Ajouter le certificat",
      "attachTitle": "Ajouter le certificat de {{name}}",
      "reclassify": "Compter en congé annuel"
    },
    "stuck": {
      "title": "Bloquées chez un responsable",
      "empty": "Aucune demande n'est bloquée chez un responsable.",
      "record": "Saisir la décision",
      "reassign": "Confier à quelqu'un d'autre",
      "delegate": "Nommer un délégué"
    }
  },
  "desk": {
    "title": "Bureau RH",
    "next": "Traiter le plus ancien",
    "seeAll": "Tout voir : {{queue}}",
    "validate": {
      "title": "À valider",
      "count": "En attente de validation : {{n}}",
      "empty": "Aucune demande à valider."
    },
    "certificates": {
      "title": "Certificats",
      "count": "En retard : {{overdue}} · À fournir : {{due}}",
      "empty": "Aucun certificat en attente."
    },
    "stuck": {
      "title": "Bloquées chez un responsable",
      "count": "Sans décision : {{n}}",
      "empty": "Aucune demande bloquée.",
      "item": "En attente de {{who}} depuis le {{date}}",
      "itemNobody": "Personne ne peut décider, depuis le {{date}}"
    },
    "profile": {
      "title": "Modifications de profil",
      "count": "À traiter : {{n}}",
      "empty": "Aucune modification de profil à traiter.",
      "item": "Proposée le {{date}}"
    }
  }
```

English:

```json
  "document": {
    "not_needed": "No document needed",
    "attached": "Document provided",
    "due": "Due by {{date}}",
    "overdue": "Overdue, was due {{date}}",
    "missing": "Proof not provided yet"
  },
  "queues": {
    "columns": {
      "document": "Document",
      "due": "Due by",
      "overdue": "Overdue by",
      "waitingOn": "Waiting for",
      "since": "Since"
    },
    "documentOption": {
      "attached": "Provided",
      "due": "Due",
      "overdue": "Overdue",
      "missing": "Missing",
      "not_needed": "Not needed"
    },
    "onTime": "On time",
    "nobody": "Nobody can decide",
    "truncated": "Only the {{n}} oldest requests are shown.",
    "emptyHint": "Change the filters to see others.",
    "validate": {
      "title": "To validate",
      "empty": "No request is waiting for HR's validation.",
      "documentFilter": "Document"
    },
    "certificates": {
      "title": "Certificates",
      "empty": "No sick leave is waiting for its certificate.",
      "attach": "Add the certificate",
      "attachTitle": "Add the certificate of {{name}}",
      "reclassify": "Count as annual leave"
    },
    "stuck": {
      "title": "Stuck with a manager",
      "empty": "No request is stuck with a manager.",
      "record": "Record the decision",
      "reassign": "Give to someone else",
      "delegate": "Name a delegate"
    }
  },
  "desk": {
    "title": "HR desk",
    "next": "Deal with the oldest",
    "seeAll": "See all: {{queue}}",
    "validate": {
      "title": "To validate",
      "count": "Waiting for validation: {{n}}",
      "empty": "No request to validate."
    },
    "certificates": {
      "title": "Certificates",
      "count": "Overdue: {{overdue}} · Due: {{due}}",
      "empty": "No certificate is awaited."
    },
    "stuck": {
      "title": "Stuck with a manager",
      "count": "Without a decision: {{n}}",
      "empty": "No request is stuck.",
      "item": "Waiting for {{who}} since {{date}}",
      "itemNobody": "Nobody can decide, since {{date}}"
    },
    "profile": {
      "title": "Profile changes",
      "count": "To deal with: {{n}}",
      "empty": "No profile change to deal with.",
      "item": "Proposed on {{date}}"
    }
  }
```

- [ ] **Step 2: Write the failing tests**

`frontend/src/features/requests/queues/HrQueues.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeEmployee } from "@/features/employees/testing";
import { makeApprovalItem, makePreview, makeRequestDetail, paginated, TYPES } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { chooseOption, pickFile, setText } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import type { ApprovalItem } from "../types";
import CertificatesPage from "./CertificatesPage";
import { overdueBy } from "./QueueTable";
import StuckPage from "./StuckPage";
import ToValidatePage from "./ToValidatePage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));
vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);
vi.mock("@/features/delegations/DelegationSheet", () => ({
  DelegationSheet: ({ open, manager }: { open: boolean; manager?: { name: string } }) =>
    open ? <p>délégation pour {manager?.name}</p> : null,
}));

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });
const hours = (count: number) => new Date(Date.now() + count * 3_600_000).toISOString();
const LATE = hours(-50);
const SOON = hours(20);

/** A leave the manager approved, now waiting for HR. */
const leave = makeApprovalItem({
  step_id: 8,
  request: {
    state: { key: "waiting_hr", waiting_on: [], last_actor: "Sami Ben Ali" },
    viewer: { relation: "hr", actions: ["decide", "attach", "correct", "cancel"], step_id: 8 },
  },
});
const sickLate = makeApprovalItem({
  step_id: 21,
  request: {
    public_id: "req-5",
    employee: { public_id: "emp-5", name: "Karim Mansour", department: "Sinistres" },
    type: { code: "sick", name: "Congé maladie" },
    start_date: "2026-11-02",
    end_date: "2026-11-03",
    quantity: "2.00",
    state: { key: "waiting_hr", waiting_on: [], last_actor: null },
    certificate: { status: "overdue", due_at: LATE },
    viewer: { relation: "hr", actions: ["decide", "attach", "reclassify", "correct", "cancel"], step_id: 21 },
  },
});
const sickSoon = makeApprovalItem({
  step_id: 22,
  request: {
    public_id: "req-6",
    employee: { public_id: "emp-6", name: "Ines Haddad" },
    type: { code: "sick", name: "Congé maladie" },
    start_date: "2026-11-05",
    end_date: "2026-11-05",
    quantity: "1.00",
    state: { key: "waiting_hr", waiting_on: [], last_actor: null },
    certificate: { status: "due", due_at: SOON },
    viewer: { relation: "hr", actions: ["decide", "attach"], step_id: 22 },
  },
});
const stuck = makeApprovalItem({
  step_id: 30,
  waiting_since: "2026-10-20T09:00:00+01:00",
  request: {
    public_id: "req-7",
    employee: { public_id: "emp-9", name: "Youssef Ayari", department: "Sinistres" },
    state: { key: "waiting_manager", waiting_on: ["Hatem Jlassi", "Nadia Karoui"] },
    viewer: { relation: "hr", actions: ["record_on_behalf", "reassign", "correct", "cancel"], step_id: 30 },
  },
});

function serve(items: ApprovalItem[]) {
  const calls = { searches: [] as URLSearchParams[], decide: [] as { step: string; body: unknown }[], uploads: [] as string[] };
  server.use(
    http.get("/api/v1/approvals", ({ request }) => {
      calls.searches.push(new URL(request.url).searchParams);
      return HttpResponse.json(paginated(items));
    }),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.get("/api/v1/departments", () =>
      HttpResponse.json([
        { id: 3, name: "Souscription" },
        { id: 4, name: "Sinistres" },
      ]),
    ),
    http.post("/api/v1/steps/:id/decide", async ({ request, params }) => {
      calls.decide.push({ step: String(params.id), body: await request.json() });
      return HttpResponse.json(makeRequestDetail({ status: "approved" }));
    }),
    http.post("/api/v1/requests/:id/attachments", ({ params }) => {
      calls.uploads.push(String(params.id));
      return HttpResponse.json(
        { public_id: "att-1", kind: "medical", name: "certificat.pdf", size: 8, uploaded_by: "Leila Gharbi", uploaded_at: "2026-11-04T10:00:00+01:00" },
        { status: 201 },
      );
    }),
    http.post("/api/v1/requests/preview", () => HttpResponse.json(makePreview({ quantity: "2.00" }))),
    http.get("/api/v1/employees/:id", ({ params }) =>
      HttpResponse.json(makeEmployee({ public_id: String(params.id), manager: { public_id: "emp-mgr", name: "Hatem Jlassi" } })),
    ),
  );
  return calls;
}

const openValidate = (route = "/hr/validate") => renderApp(<ToValidatePage />, { route, path: "/hr/validate", me });
const openCertificates = () => renderApp(<CertificatesPage />, { route: "/hr/certificates", path: "/hr/certificates", me });
const openStuck = () => renderApp(<StuckPage />, { route: "/hr/stuck", path: "/hr/stuck", me });
const rowOf = async (name: RegExp) => within(await screen.findByRole("row", { name }));

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("HR desk, To validate (UI 7.2)", () => {
  it("lists who, department, type, dates, length and where the document stands", async () => {
    const calls = serve([leave, sickLate]);
    openValidate();
    const row = await rowOf(/Amal Trabelsi/);
    expect(row.getByText("Souscription")).toBeInTheDocument();
    expect(row.getByText("Congé annuel")).toBeInTheDocument();
    expect(row.getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(row.getByText("3 j")).toBeInTheDocument();
    expect(row.getByText("Aucun document requis")).toBeInTheDocument();
    const late = await rowOf(/Karim Mansour/);
    expect(late.getByText(`En retard, attendu le T(${LATE})`)).toBeInTheDocument();
    expect(calls.searches[0].get("queue")).toBe("hr");
    expect(calls.searches[0].get("page_size")).toBe("100");
  });

  it("filters by type and department on the server, by document status on the page", async () => {
    const calls = serve([leave, sickLate, sickSoon]);
    openValidate();
    await rowOf(/Amal Trabelsi/);
    await screen.findByRole("option", { name: "Congé maladie" });
    await screen.findByRole("option", { name: "Sinistres" });
    await chooseOption("Type", "Congé maladie");
    await chooseOption("Département", "Sinistres");
    await waitFor(() => {
      expect(calls.searches.at(-1)?.get("type")).toBe("sick");
      expect(calls.searches.at(-1)?.get("department")).toBe("4");
    });
    await chooseOption("Document", "En retard");
    expect(await screen.findByRole("row", { name: /Karim Mansour/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Ines Haddad/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Amal Trabelsi/ })).not.toBeInTheDocument();
    expect(calls.searches.at(-1)?.has("document")).toBe(false);
  });

  it("approves from the list, stating what HR's validation does", async () => {
    const calls = serve([leave]);
    openValidate();
    const row = await rowOf(/Amal Trabelsi/);
    await userEvent.click(row.getByRole("button", { name: "Approuver" }));
    const sheet = await screen.findByRole("dialog", { name: "Approuver la demande" });
    expect(
      within(sheet).getByText(
        "Votre validation est enregistrée. S'il ne reste aucune étape, la demande est approuvée et Amal Trabelsi en est informé.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() =>
      expect(calls.decide).toEqual([{ step: "8", body: { decision: "approve", comment: "", version: 1 } }]),
    );
    expect(toast).toHaveBeenCalledWith("Demande de Amal Trabelsi approuvée.");
  });

  it("offers to send back, except for a change to an approved request", async () => {
    const change = makeApprovalItem({
      step_id: 9,
      request: {
        public_id: "req-2",
        employee: { public_id: "emp-2", name: "Nour Chaabane" },
        status: "approved",
        state: { key: "approved", waiting_on: [] },
        amendment: { public_id: "am-1", kind: "change", status: "pending", state_key: "waiting_hr", waiting_on: [] },
        viewer: { relation: "hr", actions: ["decide"], step_id: 9 },
      },
    });
    serve([leave, change]);
    openValidate();
    const row = await rowOf(/Amal Trabelsi/);
    expect(row.getByRole("button", { name: "Refuser" })).toBeInTheDocument();
    expect(row.getByRole("button", { name: "Renvoyer" })).toBeInTheDocument();
    const changeRow = await rowOf(/Nour Chaabane/);
    expect(changeRow.getByText("Changement de dates")).toBeInTheDocument();
    expect(changeRow.getByRole("button", { name: "Approuver" })).toBeInTheDocument();
    expect(changeRow.queryByRole("button", { name: "Renvoyer" })).not.toBeInTheDocument();
  });

  it("opens the request on the HR desk", async () => {
    serve([leave]);
    openValidate();
    await userEvent.click(await screen.findByRole("button", { name: "Amal Trabelsi" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/hr/requests/req-1");
  });

  it("says when nothing waits, and when the filters leave nothing", async () => {
    serve([]);
    const first = openValidate();
    expect(await screen.findByText("Aucune demande n'attend la validation des RH.")).toBeInTheDocument();
    expect(screen.queryByText("Changez les filtres pour en voir d'autres.")).not.toBeInTheDocument();
    first.unmount();
    openValidate("/hr/validate?document=overdue");
    expect(await screen.findByText("Changez les filtres pour en voir d'autres.")).toBeInTheDocument();
  });
});

describe("HR desk, Certificates (UI 7.3)", () => {
  it("lists each sick leave without its certificate: who, dates, due date, overdue by", async () => {
    const calls = serve([sickLate, sickSoon]);
    openCertificates();
    const late = await rowOf(/Karim Mansour/);
    expect(late.getByText("R(2026-11-02..2026-11-03)")).toBeInTheDocument();
    expect(late.getByText(`T(${LATE})`)).toBeInTheDocument();
    expect(late.getByText("2 j")).toBeInTheDocument();
    const soon = await rowOf(/Ines Haddad/);
    expect(soon.getByText(`T(${SOON})`)).toBeInTheDocument();
    expect(soon.getByText("Dans les délais")).toBeInTheDocument();
    expect(calls.searches[0].get("queue")).toBe("certificates");
  });

  it("attaches the certificate for the employee", async () => {
    const calls = serve([sickLate]);
    openCertificates();
    const row = await rowOf(/Karim Mansour/);
    await userEvent.click(row.getByRole("button", { name: "Ajouter le certificat" }));
    const sheet = await screen.findByRole("dialog", { name: "Ajouter le certificat de Karim Mansour" });
    await pickFile("Certificat médical", new File(["%PDF-1.4"], "certificat.pdf", { type: "application/pdf" }), within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(calls.uploads).toEqual(["req-5"]));
    expect(toast).toHaveBeenCalledWith("Fichier ajouté.");
  });

  it("opens the sheet that counts the leave as annual leave", async () => {
    serve([sickLate]);
    openCertificates();
    const row = await rowOf(/Karim Mansour/);
    await userEvent.click(row.getByRole("button", { name: "Compter en congé annuel" }));
    const sheet = await screen.findByRole("dialog", { name: "Compter l'arrêt en congé annuel" });
    expect(within(sheet).getByText("Jours concernés : R(2026-11-02..2026-11-03) (2 j)")).toBeInTheDocument();
  });

  it("refuses with a reason", async () => {
    const calls = serve([sickLate]);
    openCertificates();
    const row = await rowOf(/Karim Mansour/);
    await userEvent.click(row.getByRole("button", { name: "Refuser" }));
    const sheet = await screen.findByRole("dialog", { name: "Refuser la demande" });
    setText("Motif du refus", "Certificat jamais reçu", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Refuser" }));
    await waitFor(() =>
      expect(calls.decide).toEqual([
        { step: "21", body: { decision: "reject", comment: "Certificat jamais reçu", version: 1 } },
      ]),
    );
  });

  it("offers only what the API allows on each row", async () => {
    serve([sickLate, sickSoon]);
    openCertificates();
    const soon = await rowOf(/Ines Haddad/);
    expect(soon.getByRole("button", { name: "Ajouter le certificat" })).toBeInTheDocument();
    expect(soon.queryByRole("button", { name: "Compter en congé annuel" })).not.toBeInTheDocument();
  });
});

describe("HR desk, Stuck with a manager (UI 7.4)", () => {
  it("lists who, type, dates, whom it waits for and since when", async () => {
    const calls = serve([stuck]);
    openStuck();
    const row = await rowOf(/Youssef Ayari/);
    expect(row.getByText("Congé annuel")).toBeInTheDocument();
    expect(row.getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(row.getByText("Hatem Jlassi, Nadia Karoui")).toBeInTheDocument();
    expect(row.getByText("D(2026-10-20T09:00:00+01:00)")).toBeInTheDocument();
    expect(calls.searches[0].get("queue")).toBe("stuck");
  });

  it("records the manager's decision from the row", async () => {
    serve([stuck]);
    openStuck();
    const row = await rowOf(/Youssef Ayari/);
    await userEvent.click(row.getByRole("button", { name: "Saisir la décision" }));
    const sheet = await screen.findByRole("dialog", { name: "Saisir une décision donnée hors de l'application" });
    expect(within(sheet).getByText("Cette étape attend : Hatem Jlassi, Nadia Karoui")).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByLabelText("Qui a décidé")).toHaveValue("emp-mgr"));
  });

  it("gives the step to someone else from the row", async () => {
    serve([stuck]);
    openStuck();
    const row = await rowOf(/Youssef Ayari/);
    await userEvent.click(row.getByRole("button", { name: "Confier à quelqu'un d'autre" }));
    const sheet = await screen.findByRole("dialog", { name: "Confier l'étape à quelqu'un d'autre" });
    expect(within(sheet).getByText("Approbateur actuel : Hatem Jlassi, Nadia Karoui")).toBeInTheDocument();
  });

  it("names a delegate for the manager, on a manager's step only", async () => {
    const named = makeApprovalItem({
      step_id: 31,
      request: {
        public_id: "req-8",
        employee: { public_id: "emp-8", name: "Selim Gharsalli" },
        state: { key: "waiting_person", waiting_on: ["Rim Ben Salah"] },
        viewer: { relation: "hr", actions: ["record_on_behalf", "reassign"], step_id: 31 },
      },
    });
    serve([stuck, named]);
    openStuck();
    const other = await rowOf(/Selim Gharsalli/);
    expect(other.queryByRole("button", { name: "Nommer un délégué" })).not.toBeInTheDocument();
    const row = await rowOf(/Youssef Ayari/);
    await userEvent.click(row.getByRole("button", { name: "Nommer un délégué" }));
    expect(await screen.findByText("délégation pour Hatem Jlassi")).toBeInTheDocument();
  });
});

describe("how long a certificate has been overdue", () => {
  const now = new Date("2026-11-10T12:00:00+01:00");

  it("counts hours under two days and whole days beyond", () => {
    expect(overdueBy("2026-11-10T09:30:00+01:00", now, "fr")).toBe("2 h");
    expect(overdueBy("2026-11-08T13:00:00+01:00", now, "fr")).toBe("47 h");
    expect(overdueBy("2026-11-07T09:00:00+01:00", now, "fr")).toBe("3 j");
  });

  it("is never negative", () => {
    expect(overdueBy("2026-11-11T09:00:00+01:00", now, "fr")).toBe("0 h");
  });
});
```

`frontend/src/features/home/HrDeskPage.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makeProfileChange } from "@/features/profile/testing";
import { makeApprovalItem, paginated } from "@/features/requests/fixtures";
import type { ApprovalItem } from "@/features/requests/types";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import HrDeskPage from "./HrDeskPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });
const DUE = "2026-11-06T09:00:00+01:00";

const leave = makeApprovalItem({
  step_id: 8,
  request: {
    state: { key: "waiting_hr", waiting_on: [], last_actor: "Sami Ben Ali" },
    viewer: { relation: "hr", actions: ["decide"], step_id: 8 },
  },
});

function sick(id: string, name: string, status: "due" | "overdue"): ApprovalItem {
  return makeApprovalItem({
    step_id: Number(id.replace(/\D/g, "")),
    request: {
      public_id: id,
      employee: { public_id: `emp-${id}`, name },
      type: { code: "sick", name: "Congé maladie" },
      start_date: "2026-11-02",
      end_date: "2026-11-03",
      quantity: "2.00",
      state: { key: "waiting_hr", waiting_on: [], last_actor: null },
      certificate: { status, due_at: DUE },
      viewer: { relation: "hr", actions: ["decide", "attach", "reclassify"], step_id: Number(id.replace(/\D/g, "")) },
    },
  });
}

const stuck = makeApprovalItem({
  step_id: 30,
  waiting_since: "2026-10-20T09:00:00+01:00",
  request: {
    public_id: "req-7",
    employee: { public_id: "emp-9", name: "Youssef Ayari" },
    state: { key: "waiting_manager", waiting_on: ["Hatem Jlassi"] },
    viewer: { relation: "hr", actions: ["record_on_behalf", "reassign"], step_id: 30 },
  },
});

interface Queues {
  hr?: ApprovalItem[];
  certificates?: ApprovalItem[];
  stuck?: ApprovalItem[];
  changes?: unknown[];
}

function serve(queues: Queues = {}) {
  const seen = { profile: [] as string[] };
  server.use(
    http.get("/api/v1/approvals", ({ request }) => {
      const queue = new URL(request.url).searchParams.get("queue") as "hr" | "certificates" | "stuck";
      return HttpResponse.json(paginated(queues[queue] ?? []));
    }),
    http.get("/api/v1/profile-changes", ({ request }) => {
      const params = new URL(request.url).searchParams;
      seen.profile.push(`${params.get("scope")}:${params.get("status")}`);
      return HttpResponse.json(paginated(queues.changes ?? []));
    }),
  );
  return seen;
}

const open = () => renderApp(<HrDeskPage />, { route: "/hr", path: "/hr", me });
const block = async (name: string) => within(await screen.findByRole("region", { name }));

describe("HR desk (UI 7.1)", () => {
  it("answers the four questions: what waits for HR, which certificates, what is stuck, which profile changes", async () => {
    const seen = serve({
      hr: [leave],
      certificates: [sick("req-21", "Karim Mansour", "overdue"), sick("req-22", "Ines Haddad", "due")],
      stuck: [stuck],
      changes: [makeProfileChange()],
    });
    open();
    expect(await screen.findByRole("heading", { level: 1, name: "Bureau RH" })).toBeInTheDocument();

    const validate = await block("À valider");
    expect(await validate.findByText("En attente de validation : 1")).toBeInTheDocument();
    expect(validate.getByText("Amal Trabelsi")).toBeInTheDocument();
    expect(validate.getByText("Congé annuel · R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(validate.getByText("Aucun document requis")).toBeInTheDocument();

    const certificates = await block("Certificats");
    expect(await certificates.findByText("En retard : 1 · À fournir : 1")).toBeInTheDocument();
    expect(certificates.getByText("Karim Mansour")).toBeInTheDocument();
    expect(certificates.getByText(`En retard, attendu le T(${DUE})`)).toBeInTheDocument();

    const stuckBlock = await block("Bloquées chez un responsable");
    expect(await stuckBlock.findByText("Sans décision : 1")).toBeInTheDocument();
    expect(stuckBlock.getByText("Youssef Ayari")).toBeInTheDocument();
    expect(stuckBlock.getByText("En attente de Hatem Jlassi depuis le D(2026-10-20T09:00:00+01:00)")).toBeInTheDocument();

    const profile = await block("Modifications de profil");
    expect(await profile.findByText("À traiter : 1")).toBeInTheDocument();
    expect(profile.getByText("Amal Employee")).toBeInTheDocument();
    expect(profile.getByText("Proposée le D(2026-10-20T09:30:00+01:00)")).toBeInTheDocument();
    expect(seen.profile).toContain("all:pending");
  });

  it("says in one line that a queue is empty, and then offers no primary action", async () => {
    serve();
    open();
    expect(await screen.findByText("Aucune demande à valider.")).toBeInTheDocument();
    expect(await screen.findByText("Aucun certificat en attente.")).toBeInTheDocument();
    expect(await screen.findByText("Aucune demande bloquée.")).toBeInTheDocument();
    expect(await screen.findByText("Aucune modification de profil à traiter.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Traiter le plus ancien" })).not.toBeInTheDocument();
  });

  it("offers the oldest item of the first queue that is not empty", async () => {
    serve({ hr: [leave], certificates: [sick("req-21", "Karim Mansour", "overdue")], stuck: [stuck] });
    open();
    expect(await screen.findByRole("link", { name: "Traiter le plus ancien" })).toHaveAttribute("href", "/hr/requests/req-1");
  });

  it("passes over an empty queue to the next one", async () => {
    serve({ certificates: [sick("req-21", "Karim Mansour", "overdue"), sick("req-22", "Ines Haddad", "due")], stuck: [stuck] });
    open();
    expect(await screen.findByRole("link", { name: "Traiter le plus ancien" })).toHaveAttribute("href", "/hr/requests/req-21");
  });

  it("leads to the profile changes when only those wait", async () => {
    serve({ changes: [makeProfileChange()] });
    open();
    expect(await screen.findByRole("link", { name: "Traiter le plus ancien" })).toHaveAttribute("href", "/hr/profile-changes");
  });

  it("links each block to its page, the profile changes included", async () => {
    serve();
    open();
    expect(await screen.findByRole("link", { name: "Tout voir : À valider" })).toHaveAttribute("href", "/hr/validate");
    expect(screen.getByRole("link", { name: "Tout voir : Certificats" })).toHaveAttribute("href", "/hr/certificates");
    expect(screen.getByRole("link", { name: "Tout voir : Bloquées chez un responsable" })).toHaveAttribute("href", "/hr/stuck");
    expect(screen.getByRole("link", { name: "Tout voir : Modifications de profil" })).toHaveAttribute("href", "/hr/profile-changes");
  });

  it("shows the three oldest items of a queue and how many wait in all", async () => {
    serve({
      certificates: [
        sick("req-21", "Karim Mansour", "overdue"),
        sick("req-22", "Ines Haddad", "overdue"),
        sick("req-23", "Nour Chaabane", "due"),
        sick("req-24", "Selim Gharsalli", "due"),
      ],
    });
    open();
    const certificates = await block("Certificats");
    expect(await certificates.findByText("En retard : 2 · À fournir : 2")).toBeInTheDocument();
    expect(certificates.getByText("Nour Chaabane")).toBeInTheDocument();
    expect(certificates.queryByText("Selim Gharsalli")).not.toBeInTheDocument();
    expect(certificates.getByRole("link", { name: /Karim Mansour/ })).toHaveAttribute("href", "/hr/requests/req-21");
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/queues/HrQueues.test.tsx src/features/home/HrDeskPage.test.tsx`

Expected: FAIL with "Failed to resolve import "./CertificatesPage"" and "Failed to resolve import "./HrDeskPage"".

- [ ] **Step 4: Write the document status and the queue table**

`frontend/src/features/requests/DocumentStatus.tsx`:

```tsx
import { StatusBadge } from "@/components";
import { formatDateTime } from "@/lib/format";
import { useRequestsText } from "./platform";
import type { Tone } from "./status";
import type { CertificateStatus, RequestOut } from "./types";

const TONES: Record<CertificateStatus, Tone> = {
  not_needed: "neutral",
  attached: "approved",
  due: "waiting",
  overdue: "refused",
  missing: "waiting",
};

/**
 * Where the document of a request stands (UI 7.2): not needed, provided, due by, overdue.
 * Renders nothing when the API does not tell this viewer (`certificate` is null).
 */
export function DocumentStatus({ request }: { request: Pick<RequestOut, "certificate"> }) {
  const { t, lang } = useRequestsText();
  const certificate = request.certificate;
  if (!certificate) return null;
  const date = certificate.due_at ? formatDateTime(certificate.due_at, lang) : "";
  return <StatusBadge tone={TONES[certificate.status]}>{t(`document.${certificate.status}`, { date })}</StatusBadge>;
}
```

`frontend/src/features/requests/queues/QueueTable.tsx`:

```tsx
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { DataTable, SomethingWentWrong, type Column } from "@/components";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/i18n";
import { formatDate, formatDateTime, formatDays, formatHours } from "@/lib/format";
import { canSendBack } from "../decisions/DecisionSheet";
import { DocumentStatus } from "../DocumentStatus";
import { openStep } from "../hr/actions/ActionSheet";
import { useRequestsText, type Paginated } from "../platform";
import { describeQuantity, describeWhen } from "../text";
import { TypeTag } from "../TypeTag";
import type { ApprovalItem } from "../types";

export type QueueColumn =
  | "who" | "department" | "type" | "when" | "quantity" | "document" | "due" | "overdue" | "waitingOn" | "since";

/** A queue is read in one call: its hundred oldest rows. */
export const QUEUE_PAGE_SIZE = 100;

/** How long ago a certificate was due: whole hours under two days, whole days beyond. */
export function overdueBy(dueAt: string, now: Date, lang: Lang): string {
  const hours = Math.max(0, Math.floor((now.getTime() - Date.parse(dueAt)) / 3_600_000));
  return hours < 48 ? formatHours(hours, lang) : formatDays(Math.floor(hours / 24), lang);
}

/** An action on a row of a queue. */
export function RowButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      {children}
    </Button>
  );
}

interface QueueTableProps {
  /** The accessible name of the table. */
  label: string;
  query: UseQueryResult<Paginated<ApprovalItem>>;
  /** The rows to show, when the page narrows what the server returned. */
  items?: ApprovalItem[];
  /** At most six (M4), "who" first: it opens the request. */
  columns: QueueColumn[];
  /** The actions of a row, shown under its last value. */
  actions: (item: ApprovalItem) => ReactNode;
  empty: ReactNode;
}

/** One of HR's queues as a table: what waits, with the actions that deal with it. */
export function QueueTable({ label, query, items, columns, actions, empty }: QueueTableProps) {
  const { t, lang } = useRequestsText();
  const navigate = useNavigate();
  if (query.isError) return <SomethingWentWrong />;

  const received = query.data?.results ?? [];
  const now = new Date();

  const cells: Record<QueueColumn, { header: string; cell: (item: ApprovalItem) => ReactNode }> = {
    who: { header: t("common.who"), cell: (item) => item.request.employee.name },
    department: { header: t("common.department"), cell: (item) => item.request.employee.department },
    type: {
      header: t("common.type"),
      cell: ({ request }) => (
        <div className="flex flex-col items-start gap-1">
          <TypeTag code={request.type.code} name={request.type.name} />
          {/* The step waits on a change to an approved request: say which. */}
          {!canSendBack(request) && request.amendment && (
            <span className="text-caption text-muted-foreground">{t(`view.amendmentKind.${request.amendment.kind}`)}</span>
          )}
        </div>
      ),
    },
    when: { header: t("common.dates"), cell: (item) => describeWhen(item.request, t, lang) },
    quantity: { header: t("common.quantity"), cell: (item) => describeQuantity(item.request, lang) },
    document: { header: t("queues.columns.document"), cell: (item) => <DocumentStatus request={item.request} /> },
    due: {
      header: t("queues.columns.due"),
      cell: ({ request }) => (request.certificate?.due_at ? formatDateTime(request.certificate.due_at, lang) : "—"),
    },
    overdue: {
      header: t("queues.columns.overdue"),
      cell: ({ request }) =>
        request.certificate?.status === "overdue" && request.certificate.due_at
          ? overdueBy(request.certificate.due_at, now, lang)
          : t("queues.onTime"),
    },
    waitingOn: {
      header: t("queues.columns.waitingOn"),
      cell: (item) => openStep(item.request).waitingOn.join(", ") || t("queues.nobody"),
    },
    since: {
      header: t("queues.columns.since"),
      cell: (item) => (item.waiting_since ? formatDate(item.waiting_since, lang) : "—"),
    },
  };

  const last = columns[columns.length - 1];
  const tableColumns: Column<ApprovalItem>[] = columns.map((name) => ({
    key: name,
    header: cells[name].header,
    cell: (item) =>
      name === last ? (
        <div className="flex flex-col items-start gap-1 py-2">
          <div>{cells[name].cell(item)}</div>
          <div className="flex flex-wrap gap-1">{actions(item)}</div>
        </div>
      ) : (
        cells[name].cell(item)
      ),
  }));

  return (
    <>
      <DataTable
        label={label}
        columns={tableColumns}
        rows={items ?? received}
        rowKey={(item) => String(item.step_id)}
        onRowOpen={(item) => navigate(`/hr/requests/${item.request.public_id}`)}
        empty={empty}
        isLoading={query.isPending}
      />
      {(query.data?.count ?? 0) > received.length && (
        <p className="mt-2 text-caption text-muted-foreground">{t("queues.truncated", { n: received.length })}</p>
      )}
    </>
  );
}
```

- [ ] **Step 5: Write the three queue pages**

`frontend/src/features/requests/queues/ToValidatePage.tsx`:

```tsx
import { useState } from "react";
import { EmptyState, FilterBar, FilterSelect, PageHeader, useListParams } from "@/components";
import { useApprovals, useDepartmentOptions, useRequestTypes } from "../api";
import { canSendBack, DecisionSheet, type DecisionTarget } from "../decisions/DecisionSheet";
import { useRequestsText } from "../platform";
import type { ApprovalItem, CertificateStatus, Decision } from "../types";
import { QUEUE_PAGE_SIZE, QueueTable, RowButton } from "./QueueTable";

const DOCUMENT_STATUSES: CertificateStatus[] = ["attached", "due", "overdue", "missing", "not_needed"];

/** /hr/validate (UI 7.2): the requests waiting for HR, decided from the row or opened. */
export default function ToValidatePage() {
  const { t, lang } = useRequestsText();
  const params = useListParams({ type: "", department: "", document: "" });
  const types = useRequestTypes();
  const departments = useDepartmentOptions(lang);
  const query = useApprovals({
    queue: "hr",
    type: params.filters.type,
    department: params.filters.department,
    page_size: QUEUE_PAGE_SIZE,
  });
  const [target, setTarget] = useState<DecisionTarget | null>(null);

  // The API filters a queue by type and department; the document status is read from the rows.
  const wanted = params.filters.document;
  const items = (query.data?.results ?? []).filter(
    (item) => wanted === "" || item.request.certificate?.status === wanted,
  );
  const filtered = Object.values(params.filters).some((value) => value !== "");
  const all = { value: "", label: t("common.all") };
  const ask = (item: ApprovalItem, decision: Decision) =>
    setTarget({ request: item.request, stepId: item.step_id, decision });

  return (
    <>
      <PageHeader title={t("queues.validate.title")} back="/hr" />
      <FilterBar>
        <FilterSelect
          label={t("filters.typeLabel")}
          value={params.filters.type}
          onChange={(value) => params.setFilter("type", value)}
          options={[all, ...(types.data ?? []).map((type) => ({ value: type.code, label: type.name }))]}
        />
        <FilterSelect
          label={t("filters.department")}
          value={params.filters.department}
          onChange={(value) => params.setFilter("department", value)}
          options={[all, ...(departments.data ?? [])]}
        />
        <FilterSelect
          label={t("queues.validate.documentFilter")}
          value={wanted}
          onChange={(value) => params.setFilter("document", value)}
          options={[all, ...DOCUMENT_STATUSES.map((status) => ({ value: status, label: t(`queues.documentOption.${status}`) }))]}
        />
      </FilterBar>
      <QueueTable
        label={t("queues.validate.title")}
        query={query}
        items={items}
        columns={["who", "department", "type", "when", "quantity", "document"]}
        actions={(item) =>
          item.request.viewer.actions.includes("decide") ? (
            <>
              <RowButton onClick={() => ask(item, "approve")}>{t("decision.confirm.approve")}</RowButton>
              <RowButton onClick={() => ask(item, "reject")}>{t("decision.confirm.reject")}</RowButton>
              {canSendBack(item.request) && (
                <RowButton onClick={() => ask(item, "return")}>{t("decision.confirm.return")}</RowButton>
              )}
            </>
          ) : null
        }
        empty={<EmptyState title={t("queues.validate.empty")} hint={filtered ? t("queues.emptyHint") : undefined} />}
      />
      <DecisionSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}
```

`frontend/src/features/requests/queues/CertificatesPage.tsx`:

```tsx
import { useState } from "react";
import { EmptyState, PageHeader } from "@/components";
import { AddFileSheet } from "../AddFileSheet";
import { useApprovals } from "../api";
import { DecisionSheet, type DecisionTarget } from "../decisions/DecisionSheet";
import { ReclassifySheet } from "../hr/actions/ReclassifySheet";
import { useRequestsText } from "../platform";
import type { ApprovalItem, RequestAction, RequestOut } from "../types";
import { QUEUE_PAGE_SIZE, QueueTable, RowButton } from "./QueueTable";

type Task = "attach" | "reclassify";

/** /hr/certificates (UI 7.3): the sick leaves still without their certificate. */
export default function CertificatesPage() {
  const { t } = useRequestsText();
  const query = useApprovals({ queue: "certificates", page_size: QUEUE_PAGE_SIZE });
  // The request a sheet is about stays in place while the sheet closes.
  const [subject, setSubject] = useState<RequestOut | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [target, setTarget] = useState<DecisionTarget | null>(null);

  const can = (item: ApprovalItem, action: RequestAction) => item.request.viewer.actions.includes(action);
  const start = (item: ApprovalItem, next: Task) => {
    setSubject(item.request);
    setTask(next);
  };
  const close = (open: boolean) => {
    if (!open) setTask(null);
  };

  return (
    <>
      <PageHeader title={t("queues.certificates.title")} back="/hr" />
      <QueueTable
        label={t("queues.certificates.title")}
        query={query}
        columns={["who", "when", "due", "overdue"]}
        actions={(item) => (
          <>
            {can(item, "attach") && (
              <RowButton onClick={() => start(item, "attach")}>{t("queues.certificates.attach")}</RowButton>
            )}
            {can(item, "reclassify") && (
              <RowButton onClick={() => start(item, "reclassify")}>{t("queues.certificates.reclassify")}</RowButton>
            )}
            {can(item, "decide") && (
              <RowButton onClick={() => setTarget({ request: item.request, stepId: item.step_id, decision: "reject" })}>
                {t("decision.confirm.reject")}
              </RowButton>
            )}
          </>
        )}
        empty={<EmptyState title={t("queues.certificates.empty")} />}
      />
      {subject && (
        <>
          <AddFileSheet
            key={subject.public_id}
            open={task === "attach"}
            onOpenChange={close}
            requestId={subject.public_id}
            title={t("queues.certificates.attachTitle", { name: subject.employee.name })}
            label={t("form.certificate")}
          />
          <ReclassifySheet open={task === "reclassify"} onOpenChange={close} request={subject} />
        </>
      )}
      <DecisionSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}
```

`frontend/src/features/requests/queues/StuckPage.tsx`:

```tsx
import { useState } from "react";
import { EmptyState, PageHeader } from "@/components";
import { useApprovals } from "../api";
import { ManagerDelegateSheet } from "../hr/actions/ManagerDelegateSheet";
import { openStep } from "../hr/actions/ActionSheet";
import { ReassignSheet } from "../hr/actions/ReassignSheet";
import { RecordOnBehalfSheet } from "../hr/actions/RecordOnBehalfSheet";
import { useRequestsText } from "../platform";
import type { ApprovalItem, RequestAction } from "../types";
import { QUEUE_PAGE_SIZE, QueueTable, RowButton } from "./QueueTable";

type Task = "record" | "reassign" | "delegate";

/** /hr/stuck (UI 7.4): the steps HR was alerted about because nobody decides them. */
export default function StuckPage() {
  const { t } = useRequestsText();
  const query = useApprovals({ queue: "stuck", page_size: QUEUE_PAGE_SIZE });
  const [subject, setSubject] = useState<ApprovalItem | null>(null);
  const [task, setTask] = useState<Task | null>(null);

  const can = (item: ApprovalItem, action: RequestAction) => item.request.viewer.actions.includes(action);
  const start = (item: ApprovalItem, next: Task) => {
    setSubject(item);
    setTask(next);
  };
  const close = (open: boolean) => {
    if (!open) setTask(null);
  };

  return (
    <>
      <PageHeader title={t("queues.stuck.title")} back="/hr" />
      <QueueTable
        label={t("queues.stuck.title")}
        query={query}
        columns={["who", "type", "when", "waitingOn", "since"]}
        actions={(item) => (
          <>
            {can(item, "record_on_behalf") && (
              <RowButton onClick={() => start(item, "record")}>{t("queues.stuck.record")}</RowButton>
            )}
            {can(item, "reassign") && (
              <RowButton onClick={() => start(item, "reassign")}>{t("queues.stuck.reassign")}</RowButton>
            )}
            {/* A delegate is named for a manager; a step that waits for a named person is given to someone else. */}
            {openStep(item.request).key === "waiting_manager" && (
              <RowButton onClick={() => start(item, "delegate")}>{t("queues.stuck.delegate")}</RowButton>
            )}
          </>
        )}
        empty={<EmptyState title={t("queues.stuck.empty")} />}
      />
      {subject && (
        <>
          <RecordOnBehalfSheet
            open={task === "record"}
            onOpenChange={close}
            request={subject.request}
            stepId={subject.step_id}
          />
          <ReassignSheet open={task === "reassign"} onOpenChange={close} request={subject.request} stepId={subject.step_id} />
          <ManagerDelegateSheet
            open={task === "delegate"}
            onOpenChange={close}
            employeeId={subject.request.employee.public_id}
          />
        </>
      )}
    </>
  );
}
```

- [ ] **Step 6: Write the desk, register it as the home of the HR desk, and register the routes**

`frontend/src/features/home/HrDeskPage.tsx`:

```tsx
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Block, PageHeader } from "@/components";
import { Button } from "@/components/ui/button";
import { useProfileChanges } from "@/features/profile/api";
import { useApprovals } from "@/features/requests/api";
import { DocumentStatus } from "@/features/requests/DocumentStatus";
import { Gate } from "@/features/requests/Gate";
import { openStep } from "@/features/requests/hr/actions/ActionSheet";
import { useRequestsText } from "@/features/requests/platform";
import { QUEUE_PAGE_SIZE } from "@/features/requests/queues/QueueTable";
import { describeWhen } from "@/features/requests/text";
import type { ApprovalItem } from "@/features/requests/types";
import { formatDate } from "@/lib/format";

/** How many of a queue's oldest items the desk shows; the queue's page shows them all. */
const SHOWN = 3;

const requestPage = (item: ApprovalItem) => `/hr/requests/${item.request.public_id}`;

function DeskBlock({ title, to, children }: { title: string; to: string; children: ReactNode }) {
  const { t } = useRequestsText();
  return (
    <Block
      title={title}
      action={
        <Link
          to={to}
          aria-label={t("desk.seeAll", { queue: title })}
          className="inline-flex min-h-11 items-center text-body font-medium text-primary hover:underline md:min-h-0"
        >
          {t("common.seeAll")}
        </Link>
      }
    >
      {children}
    </Block>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-body text-muted-foreground">{children}</p>;
const Count = ({ children }: { children: ReactNode }) => <p className="text-body font-semibold">{children}</p>;

function Item({ to, name, children }: { to: string; name: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} className="-mx-2 flex min-h-11 flex-col items-start justify-center gap-1 rounded-md px-2 py-1 hover:bg-muted">
        <span className="text-body font-medium text-primary">{name}</span>
        <span className="flex flex-wrap items-center gap-2 text-caption text-text-secondary">{children}</span>
      </Link>
    </li>
  );
}

const Items = ({ children }: { children: ReactNode }) => <ul className="mt-2 flex flex-col gap-1">{children}</ul>;

/** /hr (UI 7.1): what waits for HR, queue by queue, and the oldest thing to deal with. */
export default function HrDeskPage() {
  const { t, lang } = useRequestsText();
  const validate = useApprovals({ queue: "hr", page_size: QUEUE_PAGE_SIZE });
  const certificates = useApprovals({ queue: "certificates", page_size: QUEUE_PAGE_SIZE });
  const stuck = useApprovals({ queue: "stuck", page_size: QUEUE_PAGE_SIZE });
  const changes = useProfileChanges({ scope: "all", status: "pending" });

  // The primary action: the oldest item of the first queue that is not empty, once every queue has answered.
  const settled = !validate.isPending && !certificates.isPending && !stuck.isPending && !changes.isPending;
  const oldest = validate.data?.results[0] ?? certificates.data?.results[0] ?? stuck.data?.results[0];
  const next = !settled ? null : oldest ? requestPage(oldest) : (changes.data?.count ?? 0) > 0 ? "/hr/profile-changes" : null;

  return (
    <>
      <PageHeader
        title={t("desk.title")}
        primary={
          next ? (
            <Button asChild variant="primary">
              <Link to={next}>{t("desk.next")}</Link>
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <DeskBlock title={t("desk.validate.title")} to="/hr/validate">
          <Gate query={validate}>
            {(page) =>
              page.count === 0 ? (
                <Empty>{t("desk.validate.empty")}</Empty>
              ) : (
                <>
                  <Count>{t("desk.validate.count", { n: page.count })}</Count>
                  <Items>
                    {page.results.slice(0, SHOWN).map((item) => (
                      <Item key={item.step_id} to={requestPage(item)} name={item.request.employee.name}>
                        <span>{`${item.request.type.name} · ${describeWhen(item.request, t, lang)}`}</span>
                        <DocumentStatus request={item.request} />
                      </Item>
                    ))}
                  </Items>
                </>
              )
            }
          </Gate>
        </DeskBlock>

        <DeskBlock title={t("desk.certificates.title")} to="/hr/certificates">
          <Gate query={certificates}>
            {(page) => {
              if (page.count === 0) return <Empty>{t("desk.certificates.empty")}</Empty>;
              const overdue = page.results.filter((item) => item.request.certificate?.status === "overdue").length;
              return (
                <>
                  <Count>{t("desk.certificates.count", { overdue, due: page.count - overdue })}</Count>
                  <Items>
                    {page.results.slice(0, SHOWN).map((item) => (
                      <Item key={item.step_id} to={requestPage(item)} name={item.request.employee.name}>
                        <span>{describeWhen(item.request, t, lang)}</span>
                        <DocumentStatus request={item.request} />
                      </Item>
                    ))}
                  </Items>
                </>
              );
            }}
          </Gate>
        </DeskBlock>

        <DeskBlock title={t("desk.stuck.title")} to="/hr/stuck">
          <Gate query={stuck}>
            {(page) =>
              page.count === 0 ? (
                <Empty>{t("desk.stuck.empty")}</Empty>
              ) : (
                <>
                  <Count>{t("desk.stuck.count", { n: page.count })}</Count>
                  <Items>
                    {page.results.slice(0, SHOWN).map((item) => {
                      const who = openStep(item.request).waitingOn.join(", ");
                      const date = item.waiting_since ? formatDate(item.waiting_since, lang) : "—";
                      return (
                        <Item key={item.step_id} to={requestPage(item)} name={item.request.employee.name}>
                          <span>{who ? t("desk.stuck.item", { who, date }) : t("desk.stuck.itemNobody", { date })}</span>
                        </Item>
                      );
                    })}
                  </Items>
                </>
              )
            }
          </Gate>
        </DeskBlock>

        <DeskBlock title={t("desk.profile.title")} to="/hr/profile-changes">
          <Gate query={changes}>
            {(page) => {
              const rows = page.results ?? [];
              const count = page.count ?? rows.length;
              if (count === 0) return <Empty>{t("desk.profile.empty")}</Empty>;
              return (
                <>
                  <Count>{t("desk.profile.count", { n: count })}</Count>
                  <Items>
                    {rows.slice(0, SHOWN).map((change) => (
                      <Item key={change.public_id} to="/hr/profile-changes" name={change.employee.name}>
                        <span>{t("desk.profile.item", { date: formatDate(change.created_at, lang) })}</span>
                      </Item>
                    ))}
                  </Items>
                </>
              );
            }}
          </Gate>
        </DeskBlock>
      </div>
    </>
  );
}
```

In `frontend/src/app/homes.ts`, add this line inside the `HOMES` object:

```ts
  hr: lazy(() => import("@/features/home/HrDeskPage")),
```

In `frontend/src/workspaces/hr/routes.tsx`, add the imports and append three elements to the `hrRoutes` array:

```tsx
import CertificatesPage from "@/features/requests/queues/CertificatesPage";
import StuckPage from "@/features/requests/queues/StuckPage";
import ToValidatePage from "@/features/requests/queues/ToValidatePage";
```

```tsx
  { path: "validate", element: <ToValidatePage /> },
  { path: "certificates", element: <CertificatesPage /> },
  { path: "stuck", element: <StuckPage /> },
```

The "Bureau" entry of the HR desk's navigation now leads to the desk instead of the first page that had a route.

- [ ] **Step 7: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/queues src/features/home/HrDeskPage.test.tsx src/i18n/parity.test.ts`

Expected: PASS (17 tests for HR's queues, 7 for the desk; the manager's queue of Task 11 still passes).

If the type check objects to `page.results` or `change.created_at` in the profile block, read `ProfileChange` in `frontend/src/features/profile/api.ts` (plan 02): the desk reads `count`, and of each row `public_id`, `employee.name` and `created_at`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/requests frontend/src/features/home frontend/src/app/homes.ts frontend/src/workspaces/hr/routes.tsx frontend/src/i18n/locales
git commit -m "feat(requests): HR desk with the to-validate, certificates and stuck queues"
```

---

### Task 15: HR desk: every request, and a new request for an employee

UI 7.6 and 7.7 (REQ-02). The list is `RequestsList` of Task 7 with the scope `all`; the new request is the form of Task 5 in its HR mode, preceded by the choice of the employee.

**Files:**
- Create: `frontend/src/features/requests/hr/HrRequestsPage.tsx`
- Create: `frontend/src/features/requests/hr/HrNewRequestPage.tsx`
- Modify: `frontend/src/workspaces/hr/routes.tsx` (append four routes)
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (sections `hrList`, `hrNew`)
- Test: `frontend/src/features/requests/hr/HrRequestsPage.test.tsx`
- Test: `frontend/src/features/requests/hr/HrNewRequestPage.test.tsx`

**Interfaces:**
- Consumes: `RequestsList` (Task 7); `RequestForm` (Task 5), `TypeChoice` (Task 3), `EditRequestPage` (Task 6), `RequestPage` (Task 8); `useRequestTypes`, `Gate`; `EmployeePicker`, `useEmployee` (plan 02); `serveRequestForm` (Task 5); `PageHeader`, `EmptyState`, `NotAvailable`, `backToList`, `toast` from `@/components`.
- Produces:
  - `HrRequestsPage` (default export) at `/hr/requests`: who, department, type, dates, length, status; filters employee, status, period; one step away: department, type, entered by HR, with an exception.
  - `HrNewRequestPage` (default export) at `/hr/requests/new`. The address carries the progress: nothing (choose the employee), `?employee=<public id>` (choose the type), `?employee=…&type=<code>` (the form). The record of an employee links to the second (Task 19).
  - Routes `requests`, `requests/new`, `requests/:id` and `requests/:id/edit` of the HR desk.

The exception (REQ-02): the form offers "Allow an exception" with a mandatory reason, sends `override_reason` when the request is created, asks the preview with `override: true`, and states that the request then follows its normal steps. All of that is Task 5's form in `mode="hr"`; this task gives it the employee.

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "hrList": {
    "title": "Demandes",
    "new": "Nouvelle demande pour un employé",
    "empty": "Aucune demande ici.",
    "emptyHint": "Changez les filtres, ou saisissez une demande pour un employé."
  },
  "hrNew": {
    "title": "Nouvelle demande pour un employé",
    "employee": "Employé",
    "employeeHint": "La demande sera faite en son nom.",
    "titleFor": "Nouvelle demande pour {{name}}",
    "formTitle": "{{type}} pour {{name}}"
  }
```

English:

```json
  "hrList": {
    "title": "Requests",
    "new": "New request for an employee",
    "empty": "No request here.",
    "emptyHint": "Change the filters, or enter a request for an employee."
  },
  "hrNew": {
    "title": "New request for an employee",
    "employee": "Employee",
    "employeeHint": "The request will be made in their name.",
    "titleFor": "New request for {{name}}",
    "formTitle": "{{type}} for {{name}}"
  }
```

- [ ] **Step 2: Write the failing tests**

`frontend/src/features/requests/hr/HrRequestsPage.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makeRequest, paginated, TYPES } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { chooseOption, setDate, setText } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import HrRequestsPage from "./HrRequestsPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

const leave = makeRequest({ viewer: { relation: "hr", actions: ["record_on_behalf", "reassign", "correct", "cancel"], step_id: 7 } });
const sick = makeRequest({
  public_id: "req-5",
  employee: { public_id: "emp-5", name: "Karim Mansour", department: "Sinistres" },
  type: { code: "sick", name: "Congé maladie" },
  start_date: "2026-11-02",
  end_date: "2026-11-03",
  quantity: "2.00",
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  certificate: { status: "due", due_at: "2026-11-04T09:00:00+01:00" },
  viewer: { relation: "hr", actions: ["decide", "attach", "reclassify"], step_id: 21 },
});

function serve() {
  const searches: URLSearchParams[] = [];
  server.use(
    http.get("/api/v1/requests", ({ request }) => {
      searches.push(new URL(request.url).searchParams);
      return HttpResponse.json(paginated([leave, sick]));
    }),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.get("/api/v1/departments", () =>
      HttpResponse.json([
        { id: 3, name: "Souscription" },
        { id: 4, name: "Sinistres" },
      ]),
    ),
  );
  return searches;
}

const open = () => renderApp(<HrRequestsPage />, { route: "/hr/requests", path: "/hr/requests", me });

describe("HR desk, Requests (UI 7.6)", () => {
  it("lists every request with who, department, type, dates, length and where it stands", async () => {
    const searches = serve();
    open();
    expect(await screen.findByText("Amal Trabelsi")).toBeInTheDocument();
    expect(screen.getByText("Souscription")).toBeInTheDocument();
    expect(screen.getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(screen.getByText("3 j")).toBeInTheDocument();
    expect(screen.getByText("En attente de Sami Ben Ali")).toBeInTheDocument();
    expect(screen.getByText("Karim Mansour")).toBeInTheDocument();
    // HR is told where the certificate stands.
    expect(screen.getByText("Certificat à fournir avant le T(2026-11-04T09:00:00+01:00)")).toBeInTheDocument();
    expect(searches[0].get("scope")).toBe("all");
  });

  it("has one primary action, New request for an employee", async () => {
    serve();
    open();
    await screen.findByText("Amal Trabelsi");
    expect(screen.getByRole("link", { name: "Nouvelle demande pour un employé" })).toHaveAttribute("href", "/hr/requests/new");
  });

  it("filters by employee, status and period", async () => {
    const searches = serve();
    open();
    await screen.findByText("Amal Trabelsi");
    setText("Personne", "emp-5");
    await chooseOption("Situation", "Approuvées");
    setDate("Du", "2026-11-01");
    setDate("Au", "2026-11-30");
    await waitFor(() => {
      const last = searches.at(-1);
      expect(last?.get("employee")).toBe("emp-5");
      expect(last?.get("status")).toBe("approved");
      expect(last?.get("from")).toBe("2026-11-01");
      expect(last?.get("to")).toBe("2026-11-30");
    });
  });

  it("keeps department, type, entered by HR and with an exception one step away", async () => {
    const searches = serve();
    open();
    await screen.findByText("Amal Trabelsi");
    expect(screen.queryByLabelText("Saisies par les RH")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Plus de filtres" }));
    await screen.findByRole("option", { name: "Sinistres" });
    await screen.findByRole("option", { name: "Télétravail" });
    await chooseOption("Département", "Sinistres");
    await chooseOption("Type", "Télétravail");
    await chooseOption("Saisies par les RH", "Oui");
    await chooseOption("Avec une exception", "Non");
    await waitFor(() => {
      const last = searches.at(-1);
      expect(last?.get("department")).toBe("4");
      expect(last?.get("type")).toBe("remote");
      expect(last?.get("on_behalf")).toBe("1");
      expect(last?.get("has_override")).toBe("0");
    });
  });

  it("opens a request on the HR desk", async () => {
    serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Amal Trabelsi" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/hr/requests/req-1");
  });
});
```

`frontend/src/features/requests/hr/HrNewRequestPage.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeEmployee } from "@/features/employees/testing";
import { problemResponse, TYPES } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { setDate, setText, toggle } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { serveRequestForm } from "@/test/requestServer";
import { server } from "@/test/server";
import HrNewRequestPage from "./HrNewRequestPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
  NotAvailable: () => <p>indisponible</p>,
}));
vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });
const open = (route: string) => renderApp(<HrNewRequestPage />, { route, path: "/hr/requests/new", me });

function serve(options: Parameters<typeof serveRequestForm>[0] = {}) {
  const calls = serveRequestForm(options);
  server.use(
    http.get("/api/v1/employees/emp-owner", () =>
      HttpResponse.json(makeEmployee({ public_id: "emp-owner", name: "Amal Trabelsi" })),
    ),
  );
  return calls;
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(toast).mockClear();
});

describe("New request for an employee (UI 7.7)", () => {
  it("starts with the choice of the employee, then of the type", async () => {
    serve();
    open("/hr/requests/new");
    expect(screen.getByRole("heading", { name: "Nouvelle demande pour un employé" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Congé annuel/ })).not.toBeInTheDocument();
    setText("Employé", "emp-owner");
    expect(await screen.findByRole("heading", { name: "Nouvelle demande pour Amal Trabelsi" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Congé annuel/ })).toHaveAttribute(
      "href",
      "/hr/requests/new?employee=emp-owner&type=annual",
    );
  });

  it("opens on the employee the address carries, as when it comes from the employee's record", async () => {
    serve();
    open("/hr/requests/new?employee=emp-owner");
    expect(await screen.findByRole("heading", { name: "Nouvelle demande pour Amal Trabelsi" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Congé maladie/ })).toHaveAttribute(
      "href",
      "/hr/requests/new?employee=emp-owner&type=sick",
    );
  });

  it("shows the form with the exception choice and says the request follows its normal steps", async () => {
    serve();
    open("/hr/requests/new?employee=emp-owner&type=annual");
    expect(await screen.findByRole("heading", { name: "Congé annuel pour Amal Trabelsi" })).toBeInTheDocument();
    expect(screen.getByLabelText("Autoriser une exception")).toBeInTheDocument();
    expect(screen.queryByLabelText("Motif de l'exception")).not.toBeInTheDocument();
    expect(screen.getByText("La demande suit ensuite ses étapes normales.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Envoyer" })).toHaveLength(1);
  });

  it("creates the request for the employee with the exception and its reason, then opens it", async () => {
    const calls = serve();
    open("/hr/requests/new?employee=emp-owner&type=annual");
    await screen.findByLabelText("Début");
    setDate("Début", "2026-11-09");
    setDate("Fin", "2026-11-11");
    await toggle("Autoriser une exception");
    setText("Motif de l'exception", "Solde épuisé, accord de la direction");
    await waitFor(() => expect(calls.preview.at(-1)).toMatchObject({ employee: "emp-owner", override: true }));
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(screen.getByTestId("elsewhere")).toHaveTextContent("/hr/requests/new-1"));
    expect(calls.create).toHaveLength(1);
    expect(calls.create[0]).toMatchObject({
      type: "annual",
      employee: "emp-owner",
      start_date: "2026-11-09",
      end_date: "2026-11-11",
      override_reason: "Solde épuisé, accord de la direction",
    });
    expect(calls.submit).toHaveLength(1);
    expect(toast).toHaveBeenCalledWith("Demande envoyée.");
  });

  it("sends no exception when none was allowed", async () => {
    const calls = serve();
    open("/hr/requests/new?employee=emp-owner&type=annual");
    await screen.findByLabelText("Début");
    setDate("Début", "2026-11-09");
    setDate("Fin", "2026-11-11");
    await waitFor(() => expect(calls.preview.at(-1)).toMatchObject({ employee: "emp-owner", override: false }));
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(calls.create).toHaveLength(1));
    expect(calls.create[0]).toMatchObject({ type: "annual", employee: "emp-owner" });
    expect(calls.create[0]).not.toHaveProperty("override_reason");
  });

  it("is not available for an employee outside reach, nor for a type no longer offered", async () => {
    serve({ types: [TYPES.annual] });
    server.use(http.get("/api/v1/employees/emp-x", () => problemResponse(404, "core.not_found", "Introuvable.")));
    const first = open("/hr/requests/new?employee=emp-x");
    expect(await screen.findByText("indisponible")).toBeInTheDocument();
    first.unmount();
    open("/hr/requests/new?employee=emp-owner&type=remote");
    expect(await screen.findByText("indisponible")).toBeInTheDocument();
  });

  it("goes back to the list on cancel", async () => {
    serve();
    open("/hr/requests/new?employee=emp-owner&type=annual");
    await userEvent.click(await screen.findByRole("button", { name: "Annuler" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/hr/requests");
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/hr/HrRequestsPage.test.tsx src/features/requests/hr/HrNewRequestPage.test.tsx`

Expected: FAIL with "Failed to resolve import "./HrRequestsPage"" and "Failed to resolve import "./HrNewRequestPage"".

- [ ] **Step 4: Write the two pages and register the routes**

`frontend/src/features/requests/hr/HrRequestsPage.tsx`:

```tsx
import { Link } from "react-router";
import { EmptyState, PageHeader } from "@/components";
import { Button } from "@/components/ui/button";
import { RequestsList } from "../lists/RequestsList";
import { useRequestsText } from "../platform";

/** /hr/requests (UI 7.6): every request. Six attributes, three filters, four more one step away. */
export default function HrRequestsPage() {
  const { t } = useRequestsText();
  return (
    <>
      <PageHeader
        title={t("hrList.title")}
        primary={
          <Button asChild variant="primary">
            <Link to="/hr/requests/new">{t("hrList.new")}</Link>
          </Button>
        }
      />
      <RequestsList
        label={t("hrList.title")}
        scope="all"
        columns={["who", "department", "type", "when", "quantity", "status"]}
        filters={["employee", "status", "period"]}
        moreFilters={["department", "type", "on_behalf", "has_override"]}
        empty={<EmptyState title={t("hrList.empty")} hint={t("hrList.emptyHint")} />}
      />
    </>
  );
}
```

`frontend/src/features/requests/hr/HrNewRequestPage.tsx`:

```tsx
import { useNavigate, useSearchParams } from "react-router";
import { backToList, NotAvailable, PageHeader, toast } from "@/components";
import { useEmployee } from "@/features/employees/api";
import { EmployeePicker } from "@/features/employees/EmployeePicker";
import { useRequestTypes } from "../api";
import { RequestForm } from "../form/RequestForm";
import { TypeChoice } from "../form/TypeChoice";
import { Gate } from "../Gate";
import { useRequestsText } from "../platform";

const NEW = "/hr/requests/new";

/**
 * /hr/requests/new (UI 7.7): the form of a new request, preceded by the choice of the employee.
 * The address carries the progress, so the browser's Back button goes one choice back.
 */
export default function HrNewRequestPage() {
  const { t } = useRequestsText();
  const [search, setSearch] = useSearchParams();
  const employeeId = search.get("employee");

  if (!employeeId) {
    return (
      <>
        <PageHeader title={t("hrNew.title")} back={backToList("/hr/requests")} />
        <div className="max-w-md rounded-xl border border-border bg-card px-6 py-5">
          <EmployeePicker
            label={t("hrNew.employee")}
            hint={t("hrNew.employeeHint")}
            value={null}
            onChange={(publicId) => {
              if (publicId) setSearch({ employee: publicId });
            }}
          />
        </div>
      </>
    );
  }
  return <ForEmployee employeeId={employeeId} code={search.get("type")} />;
}

function ForEmployee({ employeeId, code }: { employeeId: string; code: string | null }) {
  const { t } = useRequestsText();
  const navigate = useNavigate();
  const employee = useEmployee(employeeId);
  const types = useRequestTypes();
  const chooseType = `${NEW}?employee=${encodeURIComponent(employeeId)}`;

  return (
    <Gate query={employee}>
      {(person) =>
        code === null ? (
          <>
            <PageHeader title={t("hrNew.titleFor", { name: person.name })} back={NEW} />
            <TypeChoice hrefFor={(chosen) => `${chooseType}&type=${chosen}`} />
          </>
        ) : (
          <Gate query={types}>
            {(all) => {
              const type = all.find((item) => item.code === code && item.is_active);
              if (!type) return <NotAvailable />;
              const formId = `hr:${employeeId}:${type.code}`;
              return (
                <>
                  <PageHeader title={t("hrNew.formTitle", { type: type.name, name: person.name })} back={chooseType} />
                  <RequestForm
                    key={formId}
                    type={type}
                    mode="hr"
                    formId={formId}
                    employeeId={employeeId}
                    onDone={({ request, sent }) => {
                      toast(t(sent ? "form.sent" : "form.saved"));
                      navigate(sent ? `/hr/requests/${request.public_id}` : "/hr/requests");
                    }}
                    onCancel={() => navigate("/hr/requests")}
                  />
                </>
              );
            }}
          </Gate>
        )
      }
    </Gate>
  );
}
```

In `frontend/src/workspaces/hr/routes.tsx`, add the imports and append four elements to the `hrRoutes` array:

```tsx
import EditRequestPage from "@/features/requests/form/EditRequestPage";
import HrNewRequestPage from "@/features/requests/hr/HrNewRequestPage";
import HrRequestsPage from "@/features/requests/hr/HrRequestsPage";
import RequestPage from "@/features/requests/RequestPage";
```

```tsx
  { path: "requests", element: <HrRequestsPage /> },
  { path: "requests/new", element: <HrNewRequestPage /> },
  { path: "requests/:id", element: <RequestPage /> },
  { path: "requests/:id/edit", element: <EditRequestPage mode="hr" /> },
```

The "Demandes" entry of the HR desk's navigation now appears. A draft HR saved for later is seen by the HR holder who created it only (plan 03a, contract note 17); it is in that person's list, and its page offers to edit it at `/hr/requests/:id/edit` (Task 16).

- [ ] **Step 5: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/hr src/features/requests/form src/i18n/parity.test.ts`

Expected: PASS (5 tests for the list, 7 for the new request; the sheets of Task 13 and the form of Task 5 still pass).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/requests/hr frontend/src/workspaces/hr/routes.tsx frontend/src/i18n/locales
git commit -m "feat(requests): HR's list of every request and a new request for an employee"
```

---

### Task 16: The request seen by HR

UI 7.8 and the HR column of UI 10.2. HR sees everything the requester sees, the sick-leave comment and the certificate included, plus what an approver needs. Its decision is the page's primary action; the corrective actions of Task 13 are one step away.

**Files:**
- Create: `frontend/src/features/requests/views/RequestHrView.tsx`
- Modify: `frontend/src/features/requests/views/registry.ts` (add one line)
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (section `hrView`)
- Test: `frontend/src/features/requests/views/RequestHrView.test.tsx`

**Interfaces:**
- Consumes: `RequestView` (Task 8) with `commentFirst` and `filesFirst`; `FileList`, `stepWho`, `stepOutcome` (Task 8); `DocumentStatus` (Task 14); `DecisionContextView` (Task 11); `DecisionSheet`, `canSendBack` (Task 10); the five sheets and `openStep` of Task 13; `AddFileSheet` (Task 8); `useSubmitRequest`, `isConflict`; `useUndoable` (Task 7); `useSingleFlight`; `Disclosure`, `FormSummary`, `backToList`, `toast`.
- Produces: `RequestHrView({ request })` (default export), registered for the relation `hr`.

| Shown first | From |
|---|---|
| Who, department, type, dates, length, the status sentences | `RequestView` |
| The requester's comment | `comment` (HR receives it for every type) |
| Document status, with the files | `certificate`, `attachments` |
| The decision taken before HR's, with its comment | the latest decided step that is not an HR step |
| Balance now and after, limit usage, teammates away | `decision_context` |
| Approve (primary), Refuse, Send back | `viewer.actions` has `decide`; no Send back for a change |
| Send (primary), Edit, Discard | a draft this HR holder prepared: `submit`, `edit`, `discard` |

| One step away | When |
|---|---|
| Steps, changes asked for, full history | always (`RequestView`) |
| Other HR actions: record a decision, give the step to someone else, name a delegate for the manager, correct or cancel, count as annual leave, add a file | each when `viewer.actions` has `record_on_behalf`, `reassign`, `reassign` on a manager's step, `correct` or `cancel`, `reclassify`, `attach` |

After a decision or a corrective action the page stays where it is and shows the new state (U7): the queries are refreshed by the mutation.

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "hrView": {
    "document": "Document",
    "otherActions": "Autres actions RH",
    "attachTitle": "Ajouter un fichier pour {{name}}",
    "actions": {
      "record": "Saisir une décision donnée hors de l'application",
      "reassign": "Confier l'étape à quelqu'un d'autre",
      "delegate": "Nommer un délégué pour le responsable",
      "correct": "Corriger ou annuler",
      "reclassify": "Compter en congé annuel",
      "attach": "Ajouter un fichier"
    }
  }
```

English:

```json
  "hrView": {
    "document": "Document",
    "otherActions": "Other HR actions",
    "attachTitle": "Add a file for {{name}}",
    "actions": {
      "record": "Record a decision given outside the application",
      "reassign": "Give the step to someone else",
      "delegate": "Name a delegate for the manager",
      "correct": "Correct or cancel",
      "reclassify": "Count as annual leave",
      "attach": "Add a file"
    }
  }
```

- [ ] **Step 2: Write the failing test**

`frontend/src/features/requests/views/RequestHrView.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeEmployee } from "@/features/employees/testing";
import {
  makePreview, makeRequestDetail, makeStep, paginated, TYPES, type DetailOverrides,
} from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import RequestPage from "../RequestPage";
import { clearPending, undoConfig } from "../undoable";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));
vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);
vi.mock("@/features/delegations/DelegationSheet", () => ({
  DelegationSheet: ({ open, manager }: { open: boolean; manager?: { name: string } }) =>
    open ? <p>délégation pour {manager?.name}</p> : null,
}));

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

/** An annual leave the manager approved, waiting for HR. */
const toValidate: DetailOverrides = {
  comment: "Voyage en famille",
  state: { key: "waiting_hr", waiting_on: [], last_actor: "Sami Ben Ali" },
  viewer: { relation: "hr", actions: ["decide", "attach", "correct", "cancel"], step_id: 8 },
  steps: [
    makeStep({ status: "approved", decided_by: "Sami Ben Ali", decided_at: "2026-10-29T10:00:00+01:00", comment: "Bon voyage", channel: "in_app" }),
    makeStep({ id: 8, position: 2, rule: "hr_role", status: "pending", approvers: ["Leila Gharbi"] }),
  ],
  decision_context: { balance: { now: "12.50", after: "9.50" }, teammates_away: [], cap: null },
};

/** A sick leave with its certificate: HR sees the comment and the file. */
const sickWithCertificate: DetailOverrides = {
  type: { code: "sick", name: "Congé maladie" },
  comment: "Fièvre depuis hier",
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  certificate: { status: "attached", due_at: "2026-11-11T09:00:00+01:00" },
  attachments: [
    { public_id: "att-1", kind: "medical", name: "certificat.pdf", size: 2048, uploaded_by: "Amal Trabelsi", uploaded_at: "2026-11-09T18:00:00+01:00" },
  ],
  steps: [
    makeStep({ mode: "notify", status: "notified" }),
    makeStep({ id: 8, position: 2, rule: "hr_role", status: "pending", approvers: ["Leila Gharbi"] }),
  ],
  viewer: { relation: "hr", actions: ["decide", "attach", "reclassify", "correct", "cancel"], step_id: 8 },
};

/** A leave nobody decides: HR was alerted. */
const stuckWithManager: DetailOverrides = {
  viewer: { relation: "hr", actions: ["record_on_behalf", "reassign", "correct", "cancel"], step_id: 7 },
};

function serve(detail: DetailOverrides) {
  const calls = { decide: [] as unknown[], submit: [] as unknown[], discards: 0 };
  server.use(
    http.get("/api/v1/requests/req-1", () => HttpResponse.json(makeRequestDetail(detail))),
    http.get("/api/v1/requests/req-1/history", () => HttpResponse.json([])),
    http.get("/api/v1/requests", () => HttpResponse.json(paginated([]))),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.post("/api/v1/requests/preview", () => HttpResponse.json(makePreview())),
    http.get("/api/v1/employees/emp-owner", () =>
      HttpResponse.json(makeEmployee({ public_id: "emp-owner", manager: { public_id: "emp-mgr", name: "Sami Ben Ali" } })),
    ),
    http.post("/api/v1/steps/8/decide", async ({ request }) => {
      calls.decide.push(await request.json());
      return HttpResponse.json(makeRequestDetail({ ...detail, status: "approved" }));
    }),
    http.post("/api/v1/requests/req-1/submit", async ({ request }) => {
      calls.submit.push(await request.json());
      return HttpResponse.json(makeRequestDetail());
    }),
    http.delete("/api/v1/requests/req-1", () => {
      calls.discards += 1;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

const open = () => renderApp(<RequestPage />, { route: "/hr/requests/req-1", path: "/hr/requests/:id", me });
const summary = async () => within(await screen.findByRole("region", { name: "Résumé de la demande" }));
const others = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Autres actions RH" }));
};

beforeEach(() => {
  undoConfig.delayMs = 30;
  vi.mocked(toast).mockClear();
});

afterEach(() => {
  clearPending();
  undoConfig.delayMs = 5000;
});

describe("Request, HR view: shown first (UI 7.8)", () => {
  it("shows who asks, the comment, the earlier decision with its comment, and the balance now and after", async () => {
    serve(toValidate);
    open();
    const region = await summary();
    expect(region.getByText("Amal Trabelsi")).toBeInTheDocument();
    expect(region.getByText(/Souscription/)).toBeInTheDocument();
    expect(region.getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(region.getByText("À valider")).toBeInTheDocument();
    expect(region.getByText("Voyage en famille")).toBeInTheDocument();
    expect(region.getByText("Aucun document requis")).toBeInTheDocument();
    expect(region.getByText("Responsable : Sami Ben Ali")).toBeInTheDocument();
    expect(region.getByText("Approuvée par Sami Ben Ali le T(2026-10-29T10:00:00+01:00)")).toBeInTheDocument();
    expect(region.getByText("« Bon voyage »")).toBeInTheDocument();
    expect(region.getByText("Solde : 12.5 j aujourd'hui, 9.5 j après")).toBeInTheDocument();
  });

  it("shows the sick-leave comment and the certificate, which HR may see", async () => {
    serve(sickWithCertificate);
    open();
    const region = await summary();
    expect(region.getByText("Fièvre depuis hier")).toBeInTheDocument();
    expect(region.getByText("Document fourni")).toBeInTheDocument();
    expect(region.getByRole("link", { name: "certificat.pdf" })).toHaveAttribute("href", "/api/v1/attachments/att-1/download");
    expect(region.getByText("Certificat médical, ajouté par Amal Trabelsi le T(2026-11-09T18:00:00+01:00)")).toBeInTheDocument();
    // The manager was only informed: there is no earlier decision to show.
    expect(region.queryByText(/Responsable/)).not.toBeInTheDocument();
    // The files are in the summary, not a second time one step away.
    expect(screen.queryByRole("button", { name: "Fichiers" })).not.toBeInTheDocument();
  });
});

describe("Request, HR view: deciding", () => {
  it("offers approve, refuse and send back, and stays on the request once decided", async () => {
    const calls = serve(toValidate);
    open();
    const region = await summary();
    expect(region.getByRole("button", { name: "Refuser" })).toBeInTheDocument();
    expect(region.getByRole("button", { name: "Renvoyer" })).toBeInTheDocument();
    await userEvent.click(region.getByRole("button", { name: "Approuver" }));
    const sheet = await screen.findByRole("dialog", { name: "Approuver la demande" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Approuver" }));
    await waitFor(() => expect(calls.decide).toEqual([{ decision: "approve", comment: "", version: 1 }]));
    expect(toast).toHaveBeenCalledWith("Demande de Amal Trabelsi approuvée.");
    expect(screen.queryByTestId("elsewhere")).not.toBeInTheDocument();
  });

  it("approves or refuses a change, and never sends it back", async () => {
    serve({
      ...toValidate,
      status: "approved",
      state: { key: "approved", waiting_on: [] },
      amendment: { public_id: "am-1", kind: "change", status: "pending", state_key: "waiting_hr", waiting_on: [] },
    });
    open();
    const region = await summary();
    expect(region.getByText("Modification à décider")).toBeInTheDocument();
    expect(region.getByRole("button", { name: "Approuver" })).toBeInTheDocument();
    expect(region.queryByRole("button", { name: "Renvoyer" })).not.toBeInTheDocument();
  });

  it("shows no decision when it is not HR's turn", async () => {
    serve(stuckWithManager);
    open();
    const region = await summary();
    expect(region.getByText("En attente de Sami Ben Ali")).toBeInTheDocument();
    expect(region.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("Request, HR view: other HR actions, one step away", () => {
  it("offers exactly the actions the API allows", async () => {
    serve(stuckWithManager);
    open();
    await others();
    for (const name of [
      "Saisir une décision donnée hors de l'application",
      "Confier l'étape à quelqu'un d'autre",
      "Nommer un délégué pour le responsable",
      "Corriger ou annuler",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Compter en congé annuel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter un fichier" })).not.toBeInTheDocument();
  });

  it("has no such block once nothing can be done", async () => {
    serve({ status: "rejected", state: { key: "rejected", waiting_on: [], note: null }, viewer: { relation: "hr", actions: [], step_id: null } });
    open();
    await summary();
    expect(screen.queryByRole("button", { name: "Autres actions RH" })).not.toBeInTheDocument();
  });

  it.each([
    [stuckWithManager, "Saisir une décision donnée hors de l'application", "Saisir une décision donnée hors de l'application"],
    [stuckWithManager, "Confier l'étape à quelqu'un d'autre", "Confier l'étape à quelqu'un d'autre"],
    [stuckWithManager, "Corriger ou annuler", "Corriger ou annuler la demande"],
    [sickWithCertificate, "Compter en congé annuel", "Compter l'arrêt en congé annuel"],
    [sickWithCertificate, "Ajouter un fichier", "Ajouter un fichier pour Amal Trabelsi"],
  ] as const)("opens the sheet of an action (%#)", async (detail, action, title) => {
    serve(detail);
    open();
    await others();
    await userEvent.click(screen.getByRole("button", { name: action }));
    expect(await screen.findByRole("dialog", { name: title })).toBeInTheDocument();
  });

  it("names a delegate for the manager a request is stuck with", async () => {
    serve(stuckWithManager);
    open();
    await others();
    await userEvent.click(screen.getByRole("button", { name: "Nommer un délégué pour le responsable" }));
    expect(await screen.findByText("délégation pour Sami Ben Ali")).toBeInTheDocument();
  });
});

describe("Request, HR view: a draft this HR holder prepared", () => {
  const draft: DetailOverrides = {
    version: 3,
    status: "draft",
    state: { key: "draft", waiting_on: [] },
    created_by_hr: true,
    viewer: { relation: "hr", actions: ["edit", "submit", "discard"], step_id: null },
  };

  it("can be sent, edited or discarded", async () => {
    const calls = serve(draft);
    open();
    const region = await summary();
    expect(region.getByRole("link", { name: "Modifier" })).toHaveAttribute("href", "/hr/requests/req-1/edit");
    expect(region.getByRole("button", { name: "Supprimer le brouillon" })).toBeInTheDocument();
    await userEvent.click(region.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(calls.submit).toEqual([{ version: 3 }]));
    expect(toast).toHaveBeenCalledWith("Demande envoyée.");
  });

  it("is discarded with an undo, from the list it returns to", async () => {
    const calls = serve(draft);
    open();
    const region = await summary();
    await userEvent.click(region.getByRole("button", { name: "Supprimer le brouillon" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/hr/requests");
    expect(toast).toHaveBeenCalledWith("Brouillon supprimé.", expect.objectContaining({ undo: expect.any(Function) }));
    await waitFor(() => expect(calls.discards).toBe(1));
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/views/RequestHrView.test.tsx`

Expected: FAIL on the assertions: with no view registered for `hr`, the page shows the read-only view, which has no document status, no "Approuver" button and no "Autres actions RH".

- [ ] **Step 4: Write the view and register it**

`frontend/src/features/requests/views/RequestHrView.tsx`:

```tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ProblemError, type FieldProblem } from "@/api/problem";
import { backToList, Disclosure, FormSummary, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { AddFileSheet } from "../AddFileSheet";
import { isConflict, useSubmitRequest } from "../api";
import { DecisionContextView } from "../decisions/DecisionContext";
import { canSendBack, DecisionSheet, type DecisionTarget } from "../decisions/DecisionSheet";
import { DocumentStatus } from "../DocumentStatus";
import { useSingleFlight } from "../form/useSingleFlight";
import { openStep } from "../hr/actions/ActionSheet";
import { CorrectSheet } from "../hr/actions/CorrectSheet";
import { ManagerDelegateSheet } from "../hr/actions/ManagerDelegateSheet";
import { ReassignSheet } from "../hr/actions/ReassignSheet";
import { ReclassifySheet } from "../hr/actions/ReclassifySheet";
import { RecordOnBehalfSheet } from "../hr/actions/RecordOnBehalfSheet";
import { useRequestsText } from "../platform";
import { details } from "../problems";
import { RequestView } from "../RequestView";
import type { Decision, RequestAction, RequestDetail, StepOut } from "../types";
import { useUndoable } from "../undoable";
import { FileList, stepOutcome, stepWho } from "./parts";

type Task = "record" | "reassign" | "delegate" | "correct" | "reclassify" | "attach";

/** The latest decision someone other than HR took, for HR to read before its own. */
function earlierDecision(steps: StepOut[]): StepOut | null {
  const decided = steps.filter((step) => step.rule !== "hr_role" && step.decided_at !== null);
  decided.sort((a, b) => Date.parse(b.decided_at ?? "") - Date.parse(a.decided_at ?? ""));
  return decided[0] ?? null;
}

/** A request seen by HR (UI 7.8): everything, the decision, and the corrective actions one step away. */
export default function RequestHrView({ request }: { request: RequestDetail }) {
  const { t, lang } = useRequestsText();
  const navigate = useNavigate();
  const { discard } = useUndoable();
  const submit = useSubmitRequest();
  const [target, setTarget] = useState<DecisionTarget | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [problems, setProblems] = useState<FieldProblem[]>([]);

  const id = request.public_id;
  const name = request.employee.name;
  const stepId = request.viewer.step_id;
  const can = (action: RequestAction) => request.viewer.actions.includes(action);
  const canDecide = can("decide") && stepId !== null;
  const canCorrect = can("correct") || can("cancel");
  const earlier = earlierDecision(request.steps);
  const documentStatus = request.certificate?.status;
  const attachLabel =
    documentStatus === "due" || documentStatus === "overdue"
      ? t("form.certificate")
      : documentStatus === "missing"
        ? t("form.proof")
        : t("addFile.label");

  const ask = (decision: Decision) => {
    if (stepId !== null) setTarget({ request, stepId, decision });
  };
  const close = (open: boolean) => {
    if (!open) setTask(null);
  };

  const [send, sending] = useSingleFlight(async () => {
    try {
      await submit.mutateAsync({ id, version: request.version });
      setProblems([]);
      toast(t("form.sent"));
    } catch (error) {
      if (error instanceof ProblemError && error.status !== 409) setProblems(error.errors);
      else {
        const detail = t(isConflict(error) ? "common:concurrent" : "errors:unexpected");
        setProblems([{ field: null, code: "core.unexpected", detail, params: {} }]);
      }
    }
  });

  const others: { task: Task; label: string }[] = [];
  if (can("record_on_behalf") && stepId !== null) others.push({ task: "record", label: t("hrView.actions.record") });
  if (can("reassign") && stepId !== null) {
    others.push({ task: "reassign", label: t("hrView.actions.reassign") });
    // A delegate is named for a manager; a named person's step is given to someone else instead.
    if (openStep(request).key === "waiting_manager") others.push({ task: "delegate", label: t("hrView.actions.delegate") });
  }
  if (canCorrect) others.push({ task: "correct", label: t("hrView.actions.correct") });
  if (can("reclassify")) others.push({ task: "reclassify", label: t("hrView.actions.reclassify") });
  if (can("attach")) others.push({ task: "attach", label: t("hrView.actions.attach") });

  const hasActions = canDecide || can("submit") || can("edit") || can("discard");
  const actions = (
    <>
      {can("submit") && (
        <Button variant="primary" aria-busy={sending} onClick={() => void send()}>
          {t("common.send")}
        </Button>
      )}
      {canDecide && (
        <>
          <Button variant="primary" onClick={() => ask("approve")}>
            {t("decision.confirm.approve")}
          </Button>
          <Button variant="secondary" onClick={() => ask("reject")}>
            {t("decision.confirm.reject")}
          </Button>
          {canSendBack(request) && (
            <Button variant="secondary" onClick={() => ask("return")}>
              {t("decision.confirm.return")}
            </Button>
          )}
        </>
      )}
      {can("edit") && (
        <Button asChild variant="secondary">
          <Link to={`/hr/requests/${id}/edit`}>{t(request.status === "returned" ? "mine.editAndResend" : "common.edit")}</Link>
        </Button>
      )}
      {can("discard") && (
        <Button
          variant="ghost"
          onClick={() => {
            discard(request);
            navigate("/hr/requests");
          }}
        >
          {t("common.discard")}
        </Button>
      )}
    </>
  );

  return (
    <>
      <RequestView
        request={request}
        back={backToList("/hr/requests")}
        commentFirst
        filesFirst
        context={
          <>
            <FormSummary problems={details(problems)} />
            <div className="mt-3 flex flex-col items-start gap-2">
              <h2 className="text-caption font-medium text-muted-foreground">{t("hrView.document")}</h2>
              <DocumentStatus request={request} />
              {request.attachments.length > 0 && <FileList attachments={request.attachments} />}
            </div>
            {earlier && (
              <div className="mt-3">
                <h2 className="text-caption font-medium text-muted-foreground">{stepWho(earlier, t)}</h2>
                <p className="text-body">{stepOutcome(earlier, t, lang)}</p>
                {earlier.comment && <p className="text-body text-text-secondary">{`« ${earlier.comment} »`}</p>}
              </div>
            )}
            <DecisionContextView context={request.decision_context} unit={request.type.unit} detailed />
          </>
        }
        actions={hasActions ? actions : undefined}
        extra={
          others.length > 0 ? (
            <Disclosure title={t("hrView.otherActions")}>
              <div className="flex flex-wrap gap-2">
                {others.map((other) => (
                  <Button key={other.task} variant="secondary" onClick={() => setTask(other.task)}>
                    {other.label}
                  </Button>
                ))}
              </div>
            </Disclosure>
          ) : undefined
        }
      />

      <DecisionSheet target={target} onClose={() => setTarget(null)} />
      {stepId !== null && can("record_on_behalf") && (
        <RecordOnBehalfSheet open={task === "record"} onOpenChange={close} request={request} stepId={stepId} />
      )}
      {stepId !== null && can("reassign") && (
        <>
          <ReassignSheet open={task === "reassign"} onOpenChange={close} request={request} stepId={stepId} />
          <ManagerDelegateSheet open={task === "delegate"} onOpenChange={close} employeeId={request.employee.public_id} />
        </>
      )}
      {canCorrect && <CorrectSheet open={task === "correct"} onOpenChange={close} request={request} />}
      {can("reclassify") && <ReclassifySheet open={task === "reclassify"} onOpenChange={close} request={request} />}
      {can("attach") && (
        <AddFileSheet
          open={task === "attach"}
          onOpenChange={close}
          requestId={id}
          title={t("hrView.attachTitle", { name })}
          label={attachLabel}
        />
      )}
    </>
  );
}
```

In `frontend/src/features/requests/views/registry.ts`, add the import and one line to `VIEWS`:

```ts
import RequestHrView from "./RequestHrView";
```

```ts
  hr: RequestHrView,
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/views src/features/requests/RequestPage.test.tsx src/i18n/parity.test.ts`

Expected: PASS (15 tests for the HR view; the owner's and the manager's views still pass).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/requests/views frontend/src/i18n/locales
git commit -m "feat(requests): the request seen by HR, with its corrective actions one step away"
```

---

### Task 17: HR settings: request types, steps, events, public holidays, parameters

UI 7.12 (ADM-01 to ADM-05). Five subjects join plan 02's settings index: four pages of this feature and the HR group of plan 01b's parameters page. Each page of this feature takes `readOnly`; plan 06 mounts them with it under Overview, Oversight (master 9.3).

**Files:**
- Create: `frontend/src/features/requests/settings/RequestTypesPage.tsx`
- Create: `frontend/src/features/requests/settings/TypeStepsPage.tsx`
- Create: `frontend/src/features/requests/settings/EventsPage.tsx`
- Create: `frontend/src/features/requests/settings/HolidaysPage.tsx`
- Modify: `frontend/src/features/settings/hrSubjects.ts` (append five subjects)
- Modify: `frontend/src/workspaces/hr/routes.tsx` (append five routes)
- Modify: `frontend/src/i18n/locales/fr/settings.json`, `frontend/src/i18n/locales/en/settings.json` (three labels)
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (sections `settingsIndex`, `settingsForm`, `settingsTypes`, `settingsSteps`, `settingsEvents`, `settingsHolidays`)
- Test: `frontend/src/features/requests/settings/RequestTypesPage.test.tsx`
- Test: `frontend/src/features/requests/settings/TypeStepsPage.test.tsx`
- Test: `frontend/src/features/requests/settings/EventsPage.test.tsx`
- Test: `frontend/src/features/requests/settings/HolidaysPage.test.tsx`
- Test: `frontend/src/features/requests/settings/subjects.test.ts`

**Interfaces:**
- Consumes: `useRequestTypes`, `useSaveType`, `useTypeSteps`, `useSaveTypeSteps`, `useChainPreview`, `useEvents`, `useSaveEvent`, `useHolidays`, `useSaveHoliday`, `useDeleteHoliday`, `useCopyHolidays`, `useHolidayImpact` (Task 1); `Gate`; `chainSentence`, `useSingleFlight`, `serverProblems`, `byName`, `details` (Task 4); `ActionSheet` (Task 13); `EmployeePicker` (plan 02); `HR_SETTINGS_SUBJECTS` (plan 02); `SettingsGroupPage` (plan 01b, default export of `@/features/settings/SettingsGroupPage`); `DataTable`, `Column`, `TaskSheet`, `ConfirmDialog`, `FilterSelect`, the bound inputs, `FormSummary`, `PageHeader`, `EmptyState`, `StatusBadge`, `toast` from `@/components`; `todayISO` from `@/lib/dates`.
- Produces: `RequestTypesPage`, `TypeStepsPage`, `EventsPage`, `HolidaysPage`, each a default export taking `{ readOnly?: boolean }`, at `/hr/settings/request-types`, `/hr/settings/steps` (`?type=<id>`), `/hr/settings/events`, `/hr/settings/holidays` (`?year=`); the route `/hr/settings/parameters`; five entries of the settings index (orders 10 to 50, before plan 02's departments at 60).

| Subject | Lists | Edits (never when `readOnly`) |
|---|---|---|
| Request types | name, counted in, uses the balance, document, limit, state | Every attribute of UI 7.12 in a sheet. The code and the unit are asked when the type is created and never again (plan 03a: `request.type_fixed`). With `readOnly`, opening a type shows its attributes. |
| Steps of a type | the ordered steps of the chosen type | Who acts, decides or is only informed, reminder delay, delay before HR is alerted; add, remove, move; "at least one step must decide"; a preview of the saved steps for a chosen employee |
| Exceptional-leave events | name, days allowed, proof required, state | The same, with both names |
| Public holidays | by year: date, name, recurrence | Add, change, remove; copy the fixed-date ones to the next year; a warning that lists the approved requests covering a date being added, moved or removed |
| Parameters | plan 01b's page for the HR group | Working days of the week, certificate deadline and advance warning (the other keys of UI 7.12 are registered and labelled by plans 04 and 06) |

Two rules shape the forms. A problem the server reports on a switch has no error line to land on (plan 01b's `SwitchField`), so only text and select inputs are mapped to server fields and every other problem goes to the summary above the form. And "a change to a type or its steps applies to requests sent afterwards; the page says so" (UI 7.12): both pages carry that sentence.

- [ ] **Step 1: Add the texts to both translation files**

French (`fr/requests.json`):

```json
  "settingsIndex": {
    "types": {
      "title": "Types de demande",
      "description": "Ce que chaque type demande, compte et autorise."
    },
    "steps": {
      "title": "Étapes d'un type",
      "description": "Qui décide ou est informé, dans quel ordre et sous quels délais."
    },
    "events": {
      "title": "Événements de congé exceptionnel",
      "description": "Les événements familiaux et les jours qu'ils accordent."
    },
    "holidays": {
      "title": "Jours fériés",
      "description": "Les jours fériés de chaque année, jamais comptés dans une demande."
    },
    "parameters": {
      "title": "Paramètres",
      "description": "Semaine de travail, délai du certificat médical et autres réglages."
    }
  },
  "settingsForm": {
    "appliesLater": "Une modification s'applique aux demandes envoyées ensuite ; les demandes déjà envoyées ne changent pas.",
    "active": "Actif",
    "inactive": "Inactif",
    "whole": "Saisissez un nombre entier, zéro ou plus.",
    "positive": "Saisissez un nombre supérieur à zéro."
  },
  "settingsTypes": {
    "title": "Types de demande",
    "new": "Nouveau type",
    "empty": "Aucun type de demande.",
    "columns": {
      "name": "Nom",
      "unit": "Compté en",
      "balance": "Solde annuel",
      "document": "Document",
      "limit": "Limite",
      "state": "État"
    },
    "unit": {
      "day": "Jours",
      "hour": "Heures"
    },
    "documentRequired": "Requis",
    "documentWithin": "Requis sous {{hours}} h",
    "noLimit": "Aucune",
    "limitPer": {
      "week": "{{quantity}} par semaine",
      "month": "{{quantity}} par mois"
    },
    "sheetNew": "Nouveau type de demande",
    "sheetEdit": "Modifier : {{name}}",
    "saved": "Type enregistré.",
    "stepsLink": "Voir les étapes de ce type",
    "fields": {
      "code": "Code",
      "codeHint": "Un mot court en minuscules, sans espace. Il ne pourra plus être changé.",
      "name_fr": "Nom en français",
      "name_en": "Nom en anglais",
      "description_fr": "Description en français",
      "description_en": "Description en anglais",
      "descriptionHint": "Une ligne qui dit à quoi sert ce type, montrée au moment de choisir.",
      "unit": "Compté en",
      "unitHint": "Ne pourra plus être changé.",
      "allows_half_day": "Demi-journées autorisées",
      "deducts": "Déduit du solde de congé annuel",
      "document_required": "Un document est requis",
      "document_deadline_hours": "Délai pour le fournir (heures)",
      "documentDeadlineHint": "Laissez vide pour appliquer le délai général des paramètres.",
      "allows_past_dates": "Dates passées autorisées",
      "notice_days": "Préavis (jours)",
      "cap_period": "Limite",
      "cap_quantity": "Quantité maximale par période",
      "reduces_meal_tickets": "Réduit les tickets restaurant",
      "calendar_label": "Sur le calendrier des collègues",
      "is_sensitive": "Commentaire et fichiers réservés aux RH",
      "uses_events": "Un événement doit être choisi",
      "is_active": "Proposé aux employés",
      "sort_order": "Ordre d'affichage"
    },
    "capPeriod": {
      "none": "Aucune limite",
      "week": "Par semaine",
      "month": "Par mois"
    },
    "calendarLabel": {
      "absent": "Absent",
      "remote": "Télétravail",
      "hidden": "Non affiché"
    }
  },
  "settingsSteps": {
    "title": "Étapes d'un type",
    "type": "Type de demande",
    "step": "Étape {{n}}",
    "who": "Qui agit",
    "rule": {
      "line_manager": "Le responsable",
      "hr_role": "Les RH",
      "named_person": "Une personne désignée"
    },
    "person": "Personne",
    "personRequired": "Choisissez la personne.",
    "role": "Rôle",
    "mode": {
      "approve": "Décide",
      "notify": "Est seulement informé"
    },
    "reminder": "Rappel après (jours ouvrés)",
    "flag": "Alerte aux RH après (jours ouvrés)",
    "flagHint": "Laissez vide pour ne jamais alerter les RH.",
    "delayInvalid": "Saisissez un nombre entier de jours, entre 1 et 60.",
    "up": "Monter",
    "down": "Descendre",
    "remove": "Retirer",
    "add": "Ajouter une étape",
    "save": "Enregistrer les étapes",
    "saved": "Étapes enregistrées.",
    "needsDecider": "Au moins une étape doit décider.",
    "none": "Ce type n'a aucune étape : les RH décident.",
    "preview": "Aperçu pour un employé",
    "previewHint": "L'aperçu montre les étapes enregistrées, pas vos modifications en cours.",
    "readReminder": "Rappel après {{reminder}} jours ouvrés",
    "readFlag": "alerte aux RH après {{flag}} jours ouvrés"
  },
  "settingsEvents": {
    "title": "Événements de congé exceptionnel",
    "new": "Nouvel événement",
    "empty": "Aucun événement.",
    "columns": {
      "name": "Événement",
      "days": "Jours accordés",
      "proof": "Justificatif requis",
      "state": "État"
    },
    "sheetNew": "Nouvel événement",
    "sheetEdit": "Modifier : {{name}}",
    "saved": "Événement enregistré.",
    "fields": {
      "name_fr": "Nom en français",
      "name_en": "Nom en anglais",
      "days_allowed": "Jours accordés",
      "proof_required": "Un justificatif est requis",
      "is_active": "Proposé aux employés"
    }
  },
  "settingsHolidays": {
    "title": "Jours fériés",
    "year": "Année",
    "new": "Nouveau jour férié",
    "copy": "Copier les jours à date fixe vers {{year}}",
    "copied": "Jours fériés copiés vers {{year}} : {{n}}.",
    "empty": "Aucun jour férié pour {{year}}.",
    "columns": {
      "date": "Date",
      "name": "Nom",
      "recurs": "Récurrence"
    },
    "everyYear": "Chaque année, à la même date",
    "thisYearOnly": "Cette année seulement",
    "sheetNew": "Nouveau jour férié",
    "sheetEdit": "Modifier : {{name}}",
    "saved": "Jour férié enregistré.",
    "fields": {
      "date": "Date",
      "name_fr": "Nom en français",
      "name_en": "Nom en anglais",
      "recurs_yearly": "Revient chaque année à la même date"
    },
    "impactNew": "Des demandes déjà approuvées couvrent ce jour. Leur décompte ne change pas :",
    "impactOld": "Des demandes déjà approuvées couvrent l'ancienne date. Leur décompte ne change pas :",
    "delete": "Supprimer",
    "deleteTitle": "Supprimer ce jour férié ?",
    "deleteConsequence": "Le {{date}} redevient un jour ouvré pour les demandes à venir.",
    "deleteImpact": "Des demandes déjà approuvées couvrent ce jour et leur décompte ne change pas : {{people}}.",
    "deleteConfirm": "Supprimer le jour férié",
    "deleted": "Jour férié supprimé."
  }
```

English (`en/requests.json`):

```json
  "settingsIndex": {
    "types": {
      "title": "Request types",
      "description": "What each type asks for, counts and allows."
    },
    "steps": {
      "title": "Steps of a type",
      "description": "Who decides or is informed, in what order and within what delays."
    },
    "events": {
      "title": "Exceptional-leave events",
      "description": "Family events and the days they give."
    },
    "holidays": {
      "title": "Public holidays",
      "description": "The public holidays of each year, never counted in a request."
    },
    "parameters": {
      "title": "Parameters",
      "description": "Working week, medical certificate deadline and other settings."
    }
  },
  "settingsForm": {
    "appliesLater": "A change applies to requests sent afterwards; requests already sent do not change.",
    "active": "Active",
    "inactive": "Inactive",
    "whole": "Enter a whole number, zero or more.",
    "positive": "Enter a number greater than zero."
  },
  "settingsTypes": {
    "title": "Request types",
    "new": "New type",
    "empty": "No request type.",
    "columns": {
      "name": "Name",
      "unit": "Counted in",
      "balance": "Annual balance",
      "document": "Document",
      "limit": "Limit",
      "state": "State"
    },
    "unit": {
      "day": "Days",
      "hour": "Hours"
    },
    "documentRequired": "Required",
    "documentWithin": "Required within {{hours}} h",
    "noLimit": "None",
    "limitPer": {
      "week": "{{quantity}} a week",
      "month": "{{quantity}} a month"
    },
    "sheetNew": "New request type",
    "sheetEdit": "Edit: {{name}}",
    "saved": "Type saved.",
    "stepsLink": "See the steps of this type",
    "fields": {
      "code": "Code",
      "codeHint": "A short word in lower case, without spaces. It cannot be changed later.",
      "name_fr": "Name in French",
      "name_en": "Name in English",
      "description_fr": "Description in French",
      "description_en": "Description in English",
      "descriptionHint": "One line saying what this type is for, shown when choosing.",
      "unit": "Counted in",
      "unitHint": "Cannot be changed later.",
      "allows_half_day": "Half-days allowed",
      "deducts": "Deducted from the annual leave balance",
      "document_required": "A document is required",
      "document_deadline_hours": "Time allowed to provide it (hours)",
      "documentDeadlineHint": "Leave empty to apply the general deadline of the parameters.",
      "allows_past_dates": "Past dates allowed",
      "notice_days": "Notice (days)",
      "cap_period": "Limit",
      "cap_quantity": "Largest quantity per period",
      "reduces_meal_tickets": "Reduces meal tickets",
      "calendar_label": "On colleagues' calendars",
      "is_sensitive": "Comment and files restricted to HR",
      "uses_events": "An event must be chosen",
      "is_active": "Offered to employees",
      "sort_order": "Display order"
    },
    "capPeriod": {
      "none": "No limit",
      "week": "Per week",
      "month": "Per month"
    },
    "calendarLabel": {
      "absent": "Absent",
      "remote": "Remote",
      "hidden": "Not shown"
    }
  },
  "settingsSteps": {
    "title": "Steps of a type",
    "type": "Request type",
    "step": "Step {{n}}",
    "who": "Who acts",
    "rule": {
      "line_manager": "The manager",
      "hr_role": "HR",
      "named_person": "A named person"
    },
    "person": "Person",
    "personRequired": "Choose the person.",
    "role": "Role",
    "mode": {
      "approve": "Decides",
      "notify": "Is only informed"
    },
    "reminder": "Reminder after (working days)",
    "flag": "Alert to HR after (working days)",
    "flagHint": "Leave empty to never alert HR.",
    "delayInvalid": "Enter a whole number of days, between 1 and 60.",
    "up": "Move up",
    "down": "Move down",
    "remove": "Remove",
    "add": "Add a step",
    "save": "Save the steps",
    "saved": "Steps saved.",
    "needsDecider": "At least one step must decide.",
    "none": "This type has no step: HR decides.",
    "preview": "Preview for an employee",
    "previewHint": "The preview shows the saved steps, not the changes you are making.",
    "readReminder": "Reminder after {{reminder}} working days",
    "readFlag": "alert to HR after {{flag}} working days"
  },
  "settingsEvents": {
    "title": "Exceptional-leave events",
    "new": "New event",
    "empty": "No event.",
    "columns": {
      "name": "Event",
      "days": "Days allowed",
      "proof": "Proof required",
      "state": "State"
    },
    "sheetNew": "New event",
    "sheetEdit": "Edit: {{name}}",
    "saved": "Event saved.",
    "fields": {
      "name_fr": "Name in French",
      "name_en": "Name in English",
      "days_allowed": "Days allowed",
      "proof_required": "Proof is required",
      "is_active": "Offered to employees"
    }
  },
  "settingsHolidays": {
    "title": "Public holidays",
    "year": "Year",
    "new": "New public holiday",
    "copy": "Copy the fixed-date holidays to {{year}}",
    "copied": "Public holidays copied to {{year}}: {{n}}.",
    "empty": "No public holiday for {{year}}.",
    "columns": {
      "date": "Date",
      "name": "Name",
      "recurs": "Recurrence"
    },
    "everyYear": "Every year, on the same date",
    "thisYearOnly": "This year only",
    "sheetNew": "New public holiday",
    "sheetEdit": "Edit: {{name}}",
    "saved": "Public holiday saved.",
    "fields": {
      "date": "Date",
      "name_fr": "Name in French",
      "name_en": "Name in English",
      "recurs_yearly": "Comes back every year on the same date"
    },
    "impactNew": "Requests already approved cover this day. Their count does not change:",
    "impactOld": "Requests already approved cover the former date. Their count does not change:",
    "delete": "Remove",
    "deleteTitle": "Remove this public holiday?",
    "deleteConsequence": "{{date}} becomes a working day again for requests to come.",
    "deleteImpact": "Requests already approved cover this day and their count does not change: {{people}}.",
    "deleteConfirm": "Remove the public holiday",
    "deleted": "Public holiday removed."
  }
```

- [ ] **Step 2: Write the failing test of the request types**

`frontend/src/features/requests/settings/RequestTypesPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { problemResponse, TYPES } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { chooseOption, setText, toggle } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import RequestTypesPage from "./RequestTypesPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

function serve() {
  const calls = { created: [] as Record<string, unknown>[], updated: [] as { id: string; body: Record<string, unknown> }[] };
  server.use(
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.post("/api/v1/request-types", async ({ request }) => {
      calls.created.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({ ...TYPES.annual, id: 9, code: "formation" }, { status: 201 });
    }),
    http.patch("/api/v1/request-types/:id", async ({ request, params }) => {
      calls.updated.push({ id: String(params.id), body: (await request.json()) as Record<string, unknown> });
      return HttpResponse.json(TYPES.remote);
    }),
  );
  return calls;
}

const open = (readOnly = false) =>
  renderApp(<RequestTypesPage readOnly={readOnly} />, {
    route: "/hr/settings/request-types",
    path: "/hr/settings/request-types",
    me,
  });
const rowOf = async (name: RegExp) => within(await screen.findByRole("row", { name }));

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("Settings, request types (UI 7.12, ADM-01)", () => {
  it("lists each type with what it counts, requires and limits", async () => {
    serve();
    open();
    const annual = await rowOf(/Congé annuel/);
    expect(annual.getByText("Jours")).toBeInTheDocument();
    expect(annual.getByText("Oui")).toBeInTheDocument();
    expect(annual.getByText("Aucune")).toBeInTheDocument();
    expect(annual.getByText("Actif")).toBeInTheDocument();
    expect((await rowOf(/Congé maladie/)).getByText("Requis")).toBeInTheDocument();
    expect((await rowOf(/Autorisation de sortie/)).getByText("Heures")).toBeInTheDocument();
    expect((await rowOf(/Télétravail/)).getByText("2 j par semaine")).toBeInTheDocument();
    // In the order HR gave them.
    const table = screen.getByRole("table", { name: "Types de demande" });
    expect(within(table).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Congé annuel",
      "Congé maladie",
      "Congé exceptionnel",
      "Autorisation de sortie",
      "Télétravail",
    ]);
  });

  it("says that a change applies to requests sent afterwards", async () => {
    serve();
    open();
    expect(
      await screen.findByText(
        "Une modification s'applique aux demandes envoyées ensuite ; les demandes déjà envoyées ne changent pas.",
      ),
    ).toBeInTheDocument();
  });

  it("changes a type without sending its code or its unit again", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Télétravail" }));
    const sheet = await screen.findByRole("dialog", { name: "Modifier : Télétravail" });
    expect(within(sheet).queryByLabelText("Code")).not.toBeInTheDocument();
    expect(within(sheet).getByLabelText("Nom en français")).toHaveValue("Télétravail");
    expect(within(sheet).getByLabelText("Quantité maximale par période")).toHaveValue("2");
    expect(within(sheet).getByRole("link", { name: "Voir les étapes de ce type" })).toHaveAttribute(
      "href",
      "/hr/settings/steps?type=5",
    );
    setText("Quantité maximale par période", "3", within(sheet));
    await toggle("Proposé aux employés", within(sheet));
    await userEvent.click(within(sheet).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(calls.updated).toHaveLength(1));
    expect(calls.updated[0].id).toBe("5");
    expect(calls.updated[0].body).toMatchObject({
      name_fr: "Télétravail",
      name_en: "Remote work",
      cap_period: "week",
      cap_quantity: "3",
      is_active: false,
      balance_effect: "none",
    });
    expect(calls.updated[0].body).not.toHaveProperty("code");
    expect(calls.updated[0].body).not.toHaveProperty("unit");
    expect(toast).toHaveBeenCalledWith("Type enregistré.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Modifier : Télétravail" })).not.toBeInTheDocument());
  });

  it("creates a type, with its code and unit, and only the fields that apply", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau type" }));
    const sheet = await screen.findByRole("dialog", { name: "Nouveau type de demande" });
    const inSheet = within(sheet);
    // A document deadline is asked only when a document is required, a quantity only with a period (M7).
    expect(inSheet.queryByLabelText("Délai pour le fournir (heures) (facultatif)")).not.toBeInTheDocument();
    expect(inSheet.queryByLabelText("Quantité maximale par période")).not.toBeInTheDocument();
    expect(inSheet.getByLabelText("Demi-journées autorisées")).toBeInTheDocument();

    setText("Code", "formation", inSheet);
    setText("Nom en français", "Formation", inSheet);
    setText("Nom en anglais", "Training", inSheet);
    setText("Description en français", "Une journée de formation.", inSheet);
    setText("Description en anglais", "A training day.", inSheet);
    await chooseOption("Compté en", "Heures", inSheet);
    expect(inSheet.queryByLabelText("Demi-journées autorisées")).not.toBeInTheDocument();
    await toggle("Un document est requis", inSheet);
    setText("Délai pour le fournir (heures) (facultatif)", "72", inSheet);
    await chooseOption("Limite", "Par mois", inSheet);
    setText("Quantité maximale par période", "8", inSheet);
    await chooseOption("Sur le calendrier des collègues", "Non affiché", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(calls.created).toHaveLength(1));
    expect(calls.created[0]).toEqual({
      code: "formation",
      name_fr: "Formation",
      name_en: "Training",
      description_fr: "Une journée de formation.",
      description_en: "A training day.",
      unit: "hour",
      allows_half_day: false,
      balance_effect: "none",
      document_rule: "required_within_deadline",
      document_deadline_hours: 72,
      allows_past_dates: false,
      notice_days: 0,
      cap_quantity: "8",
      cap_period: "month",
      reduces_meal_tickets: false,
      calendar_label: "hidden",
      is_sensitive: false,
      uses_events: false,
      is_active: true,
      sort_order: 100,
    });
  });

  it("refuses what cannot be right before anything is sent, on the field concerned", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau type" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Nouveau type de demande" }));
    setText("Préavis (jours)", "deux", inSheet);
    await chooseOption("Limite", "Par semaine", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    expect(await inSheet.findAllByText("Ce champ est nécessaire.")).toHaveLength(3);
    expect(inSheet.getByText("Saisissez un nombre entier, zéro ou plus.")).toBeInTheDocument();
    expect(inSheet.getByText("Saisissez un nombre supérieur à zéro.")).toBeInTheDocument();
    expect(calls.created).toHaveLength(0);
  });

  it("shows what the server refuses on its field and keeps what was typed", async () => {
    serve();
    server.use(
      http.post("/api/v1/request-types", () =>
        problemResponse(400, "validation", "Un autre type de demande utilise déjà ce code.", [
          { field: "code", code: "request.type_code_taken", detail: "Un autre type de demande utilise déjà ce code. Choisissez un code différent." },
        ]),
      ),
    );
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau type" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Nouveau type de demande" }));
    setText("Code", "annual", inSheet);
    setText("Nom en français", "Autre congé", inSheet);
    setText("Nom en anglais", "Other leave", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    expect(
      await inSheet.findByText("Un autre type de demande utilise déjà ce code. Choisissez un code différent."),
    ).toBeInTheDocument();
    expect(inSheet.getByLabelText("Nom en français")).toHaveValue("Autre congé");
  });

  it("read-only: no action, and the attributes of a type can still be read", async () => {
    serve();
    open(true);
    await rowOf(/Congé maladie/);
    expect(screen.queryByRole("button", { name: "Nouveau type" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Une modification s'applique/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Congé maladie" }));
    const sheet = await screen.findByRole("dialog", { name: "Congé maladie" });
    expect(within(sheet).getByText("Commentaire et fichiers réservés aux RH")).toBeInTheDocument();
    expect(within(sheet).getByText("Sick leave")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Enregistrer" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("switch")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/settings/RequestTypesPage.test.tsx`

Expected: FAIL with "Failed to resolve import "./RequestTypesPage"".

- [ ] **Step 4: Write the page of the request types**

`frontend/src/features/requests/settings/RequestTypesPage.tsx`:

```tsx
import { useState } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";
import { Link } from "react-router";
import type { FieldProblem } from "@/api/problem";
import {
  DataTable, EmptyState, FormSummary, PageHeader, SelectField, StatusBadge, SwitchField, TaskSheet, TextField, toast,
  type Column,
} from "@/components";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/i18n";
import { formatDays, formatHours } from "@/lib/format";
import { useRequestTypes, useSaveType } from "../api";
import { useSingleFlight } from "../form/useSingleFlight";
import { Gate } from "../Gate";
import { ActionSheet } from "../hr/actions/ActionSheet";
import { useRequestsText, type Translate } from "../platform";
import { byName, details, serverProblems } from "../problems";
import type { CalendarLabel, RequestTypeInput, RequestTypeOut, Unit } from "../types";

type CapPeriod = RequestTypeOut["cap_period"];

/** A type as its form edits it: numbers as text, the two "none or something" attributes as switches. */
interface TypeValues {
  code: string;
  name_fr: string;
  name_en: string;
  description_fr: string;
  description_en: string;
  unit: Unit;
  allows_half_day: boolean;
  deducts: boolean;
  document_required: boolean;
  document_deadline_hours: string;
  allows_past_dates: boolean;
  notice_days: string;
  cap_period: CapPeriod;
  cap_quantity: string;
  reduces_meal_tickets: boolean;
  calendar_label: CalendarLabel;
  is_sensitive: boolean;
  uses_events: boolean;
  is_active: boolean;
  sort_order: string;
}

const NEW_TYPE: TypeValues = {
  code: "",
  name_fr: "",
  name_en: "",
  description_fr: "",
  description_en: "",
  unit: "day",
  allows_half_day: false,
  deducts: false,
  document_required: false,
  document_deadline_hours: "",
  allows_past_dates: false,
  notice_days: "0",
  cap_period: "none",
  cap_quantity: "",
  reduces_meal_tickets: false,
  calendar_label: "absent",
  is_sensitive: false,
  uses_events: false,
  is_active: true,
  sort_order: "100",
};

function toValues(type: RequestTypeOut): TypeValues {
  return {
    code: type.code,
    name_fr: type.name_fr,
    name_en: type.name_en,
    description_fr: type.description_fr,
    description_en: type.description_en,
    unit: type.unit,
    allows_half_day: type.allows_half_day,
    deducts: type.balance_effect === "deducts_annual",
    document_required: type.document_rule === "required_within_deadline",
    document_deadline_hours: type.document_deadline_hours === null ? "" : String(type.document_deadline_hours),
    allows_past_dates: type.allows_past_dates,
    notice_days: String(type.notice_days),
    cap_period: type.cap_period,
    cap_quantity: type.cap_quantity === null ? "" : String(Number(type.cap_quantity)),
    reduces_meal_tickets: type.reduces_meal_tickets,
    calendar_label: type.calendar_label,
    is_sensitive: type.is_sensitive,
    uses_events: type.uses_events,
    is_active: type.is_active,
    sort_order: String(type.sort_order),
  };
}

/** What is sent. An attribute whose input is hidden takes its neutral value (M7). */
function toInput(values: TypeValues): RequestTypeInput {
  const deadline = values.document_deadline_hours.trim();
  return {
    code: values.code.trim(),
    name_fr: values.name_fr.trim(),
    name_en: values.name_en.trim(),
    description_fr: values.description_fr.trim(),
    description_en: values.description_en.trim(),
    unit: values.unit,
    allows_half_day: values.unit === "day" && values.allows_half_day,
    balance_effect: values.deducts ? "deducts_annual" : "none",
    document_rule: values.document_required ? "required_within_deadline" : "none",
    document_deadline_hours: values.document_required && deadline !== "" ? Number(deadline) : null,
    allows_past_dates: values.allows_past_dates,
    notice_days: Number(values.notice_days),
    cap_quantity: values.cap_period === "none" ? null : values.cap_quantity.trim().replace(",", "."),
    cap_period: values.cap_period,
    reduces_meal_tickets: values.reduces_meal_tickets,
    calendar_label: values.calendar_label,
    is_sensitive: values.is_sensitive,
    uses_events: values.uses_events,
    is_active: values.is_active,
    sort_order: Number(values.sort_order),
  };
}

const WHOLE = /^\d+$/;

/** What cannot be right, as [input, message] pairs, before anything is sent. */
function issuesOf(values: TypeValues, isNew: boolean, t: Translate): [Path<TypeValues>, string][] {
  const issues: [Path<TypeValues>, string][] = [];
  const required = t("formErrors.required");
  if (isNew && values.code.trim() === "") issues.push(["code", required]);
  if (values.name_fr.trim() === "") issues.push(["name_fr", required]);
  if (values.name_en.trim() === "") issues.push(["name_en", required]);
  if (!WHOLE.test(values.notice_days.trim())) issues.push(["notice_days", t("settingsForm.whole")]);
  if (!WHOLE.test(values.sort_order.trim())) issues.push(["sort_order", t("settingsForm.whole")]);
  const deadline = values.document_deadline_hours.trim();
  if (values.document_required && deadline !== "" && !(WHOLE.test(deadline) && Number(deadline) > 0)) {
    issues.push(["document_deadline_hours", t("settingsForm.positive")]);
  }
  if (values.cap_period !== "none" && !(Number(values.cap_quantity.trim().replace(",", ".")) > 0)) {
    issues.push(["cap_quantity", t("settingsForm.positive")]);
  }
  return issues;
}

/** The inputs that have an error line of their own. A problem on any other field goes to the summary. */
const SHOWN: Path<TypeValues>[] = [
  "code", "name_fr", "name_en", "description_fr", "description_en", "unit", "document_deadline_hours", "notice_days",
  "cap_period", "cap_quantity", "calendar_label", "sort_order",
];
const BY_CODE: Record<string, Path<TypeValues>> = {
  "request.type_code_taken": "code",
  "request.type_cap_incomplete": "cap_quantity",
};

function documentText(type: RequestTypeOut, t: Translate): string {
  if (type.document_rule === "none") return t("common.no");
  return type.document_deadline_hours === null
    ? t("settingsTypes.documentRequired")
    : t("settingsTypes.documentWithin", { hours: type.document_deadline_hours });
}

function limitText(type: RequestTypeOut, t: Translate, lang: Lang): string {
  if (type.cap_period === "none" || type.cap_quantity === null) return t("settingsTypes.noLimit");
  const quantity = type.unit === "hour" ? formatHours(type.cap_quantity, lang) : formatDays(type.cap_quantity, lang);
  return t(`settingsTypes.limitPer.${type.cap_period}`, { quantity });
}

function TypeForm({ formId, type, onDone }: { formId: string; type: RequestTypeOut | null; onDone: () => void }) {
  const { t } = useRequestsText();
  const save = useSaveType();
  const form = useForm<TypeValues>({ defaultValues: type ? toValues(type) : NEW_TYPE });
  const values = useWatch({ control: form.control }) as TypeValues;
  const [loose, setLoose] = useState<FieldProblem[]>([]);
  const isNew = type === null;
  const label = (name: string) => t(`settingsTypes.fields.${name}`);

  const [submit] = useSingleFlight(async (current: TypeValues) => {
    const issues = issuesOf(current, isNew, t);
    for (const [path, message] of issues) form.setError(path, { type: "client", message });
    if (issues.length > 0) return;
    try {
      await save.mutateAsync({ id: type?.id ?? null, body: toInput(current) });
      toast(t("settingsTypes.saved"));
      onDone();
    } catch (error) {
      setLoose(serverProblems(form, error, t, byName<TypeValues>(SHOWN, BY_CODE)));
    }
  });

  return (
    <form id={formId} noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4">
      <FormSummary problems={details(loose)} />
      {isNew && <TextField control={form.control} name="code" label={label("code")} hint={label("codeHint")} />}
      <TextField control={form.control} name="name_fr" label={label("name_fr")} />
      <TextField control={form.control} name="name_en" label={label("name_en")} />
      <TextField control={form.control} name="description_fr" label={label("description_fr")} hint={label("descriptionHint")} />
      <TextField control={form.control} name="description_en" label={label("description_en")} />
      {isNew ? (
        <SelectField
          control={form.control}
          name="unit"
          label={label("unit")}
          hint={label("unitHint")}
          options={[
            { value: "day", label: t("settingsTypes.unit.day") },
            { value: "hour", label: t("settingsTypes.unit.hour") },
          ]}
        />
      ) : (
        <p className="text-body text-text-secondary">{`${label("unit")} : ${t(`settingsTypes.unit.${values.unit}`)}`}</p>
      )}
      {values.unit === "day" && <SwitchField control={form.control} name="allows_half_day" label={label("allows_half_day")} />}
      <SwitchField control={form.control} name="deducts" label={label("deducts")} />
      <SwitchField control={form.control} name="document_required" label={label("document_required")} />
      {values.document_required && (
        <TextField
          control={form.control}
          name="document_deadline_hours"
          label={label("document_deadline_hours")}
          hint={label("documentDeadlineHint")}
          optional
          inputMode="numeric"
        />
      )}
      <SwitchField control={form.control} name="allows_past_dates" label={label("allows_past_dates")} />
      <TextField control={form.control} name="notice_days" label={label("notice_days")} inputMode="numeric" />
      <SelectField
        control={form.control}
        name="cap_period"
        label={label("cap_period")}
        options={(["none", "week", "month"] as const).map((period) => ({
          value: period,
          label: t(`settingsTypes.capPeriod.${period}`),
        }))}
      />
      {values.cap_period !== "none" && (
        <TextField control={form.control} name="cap_quantity" label={label("cap_quantity")} inputMode="decimal" />
      )}
      <SwitchField control={form.control} name="reduces_meal_tickets" label={label("reduces_meal_tickets")} />
      <SelectField
        control={form.control}
        name="calendar_label"
        label={label("calendar_label")}
        options={(["absent", "remote", "hidden"] as const).map((value) => ({
          value,
          label: t(`settingsTypes.calendarLabel.${value}`),
        }))}
      />
      <SwitchField control={form.control} name="is_sensitive" label={label("is_sensitive")} />
      <SwitchField control={form.control} name="uses_events" label={label("uses_events")} />
      <SwitchField control={form.control} name="is_active" label={label("is_active")} />
      <TextField control={form.control} name="sort_order" label={label("sort_order")} inputMode="numeric" />
      {type && (
        <Link to={`/hr/settings/steps?type=${type.id}`} className="text-body font-medium text-primary underline underline-offset-2">
          {t("settingsTypes.stepsLink")}
        </Link>
      )}
    </form>
  );
}

/** Every attribute of a type, to read. */
function TypeDetails({ type }: { type: RequestTypeOut }) {
  const { t, lang } = useRequestsText();
  const label = (name: string) => t(`settingsTypes.fields.${name}`);
  const yesNo = (value: boolean) => t(value ? "common.yes" : "common.no");
  const rows: [string, string][] = [
    [label("code"), type.code],
    [label("name_fr"), type.name_fr],
    [label("name_en"), type.name_en],
    [label("description_fr"), type.description_fr || "—"],
    [label("description_en"), type.description_en || "—"],
    [label("unit"), t(`settingsTypes.unit.${type.unit}`)],
    [label("allows_half_day"), yesNo(type.allows_half_day)],
    [label("deducts"), yesNo(type.balance_effect === "deducts_annual")],
    [t("settingsTypes.columns.document"), documentText(type, t)],
    [label("allows_past_dates"), yesNo(type.allows_past_dates)],
    [label("notice_days"), String(type.notice_days)],
    [t("settingsTypes.columns.limit"), limitText(type, t, lang)],
    [label("reduces_meal_tickets"), yesNo(type.reduces_meal_tickets)],
    [label("calendar_label"), t(`settingsTypes.calendarLabel.${type.calendar_label}`)],
    [label("is_sensitive"), yesNo(type.is_sensitive)],
    [label("uses_events"), yesNo(type.uses_events)],
    [label("is_active"), yesNo(type.is_active)],
    [label("sort_order"), String(type.sort_order)],
  ];
  return (
    <dl className="flex flex-col gap-3">
      {rows.map(([name, value]) => (
        <div key={name}>
          <dt className="text-caption text-muted-foreground">{name}</dt>
          <dd className="m-0 text-body">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Settings, request types (UI 7.12). With `readOnly`, a list and each type's attributes, and no action. */
export default function RequestTypesPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t, lang } = useRequestsText();
  const types = useRequestTypes();
  const [open, setOpen] = useState(false);
  // The type the sheet is about; null while the sheet is that of a new type.
  const [selected, setSelected] = useState<RequestTypeOut | null>(null);

  const show = (type: RequestTypeOut | null) => {
    setSelected(type);
    setOpen(true);
  };

  const columns: Column<RequestTypeOut>[] = [
    { key: "name", header: t("settingsTypes.columns.name"), cell: (type) => type.name },
    { key: "unit", header: t("settingsTypes.columns.unit"), cell: (type) => t(`settingsTypes.unit.${type.unit}`) },
    {
      key: "balance",
      header: t("settingsTypes.columns.balance"),
      cell: (type) => t(type.balance_effect === "deducts_annual" ? "common.yes" : "common.no"),
    },
    { key: "document", header: t("settingsTypes.columns.document"), cell: (type) => documentText(type, t) },
    { key: "limit", header: t("settingsTypes.columns.limit"), cell: (type) => limitText(type, t, lang) },
    {
      key: "state",
      header: t("settingsTypes.columns.state"),
      cell: (type) => (
        <StatusBadge tone={type.is_active ? "approved" : "neutral"}>
          {t(type.is_active ? "settingsForm.active" : "settingsForm.inactive")}
        </StatusBadge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("settingsTypes.title")}
        back={readOnly ? undefined : "/hr/settings"}
        primary={
          readOnly ? undefined : (
            <Button variant="primary" onClick={() => show(null)}>
              {t("settingsTypes.new")}
            </Button>
          )
        }
      />
      {!readOnly && <p className="mb-4 max-w-2xl text-body text-text-secondary">{t("settingsForm.appliesLater")}</p>}
      <Gate query={types}>
        {(all) => (
          <DataTable
            label={t("settingsTypes.title")}
            columns={columns}
            rows={[...all].sort((a, b) => a.sort_order - b.sort_order)}
            rowKey={(type) => String(type.id)}
            onRowOpen={show}
            empty={<EmptyState title={t("settingsTypes.empty")} />}
          />
        )}
      </Gate>
      {readOnly ? (
        <TaskSheet open={open} onOpenChange={setOpen} title={selected?.name ?? ""}>
          {selected && <TypeDetails type={selected} />}
        </TaskSheet>
      ) : (
        <ActionSheet
          open={open}
          onOpenChange={setOpen}
          title={selected ? t("settingsTypes.sheetEdit", { name: selected.name }) : t("settingsTypes.sheetNew")}
          submitLabel={t("common.save")}
        >
          {(formId) => <TypeForm formId={formId} type={selected} onDone={() => setOpen(false)} />}
        </ActionSheet>
      )}
    </>
  );
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/settings/RequestTypesPage.test.tsx src/i18n/parity.test.ts`

Expected: PASS, 7 tests.

- [ ] **Step 6: Write the failing test of the steps**

`frontend/src/features/requests/settings/TypeStepsPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { problemResponse, TYPES } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { chooseOption, setText } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import type { ChainStepOut } from "../types";
import TypeStepsPage from "./TypeStepsPage";

vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));
vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

const MANAGER_THEN_HR: ChainStepOut[] = [
  { id: 1, position: 1, approver_rule: "line_manager", named_person: null, mode: "approve", reminder_after_days: 2, flag_after_days: 4 },
  { id: 2, position: 2, approver_rule: "hr_role", named_person: null, mode: "approve", reminder_after_days: 2, flag_after_days: null },
];

function serve(steps: ChainStepOut[] = MANAGER_THEN_HR) {
  const calls = { asked: [] as string[], saved: [] as { id: string; body: unknown }[], previews: [] as string[] };
  server.use(
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.get("/api/v1/request-types/:id/steps", ({ params }) => {
      calls.asked.push(String(params.id));
      return HttpResponse.json(steps);
    }),
    http.put("/api/v1/request-types/:id/steps", async ({ request, params }) => {
      calls.saved.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json(steps);
    }),
    http.get("/api/v1/request-types/:id/chain-preview", ({ request, params }) => {
      calls.previews.push(`${String(params.id)}:${new URL(request.url).searchParams.get("employee")}`);
      return HttpResponse.json([
        { position: 1, rule: "line_manager", mode: "approve", approvers: ["Sami Ben Ali"] },
        { position: 2, rule: "hr_role", mode: "approve", approvers: ["Leila Gharbi"] },
      ]);
    }),
  );
  return calls;
}

const open = (route = "/hr/settings/steps", readOnly = false) =>
  renderApp(<TypeStepsPage readOnly={readOnly} />, { route, path: "/hr/settings/steps", me });
const step = async (n: number) => within(await screen.findByRole("group", { name: `Étape ${n}` }));

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("Settings, steps of a type (UI 7.12, ADM-02)", () => {
  it("shows the ordered steps of the first type: who acts, the role, the delays", async () => {
    const calls = serve();
    open();
    const first = await step(1);
    expect(first.getByLabelText("Qui agit")).toHaveValue("line_manager");
    expect(first.getByLabelText("Rôle")).toHaveValue("approve");
    expect(first.getByLabelText("Rappel après (jours ouvrés)")).toHaveValue("2");
    expect(first.getByLabelText("Alerte aux RH après (jours ouvrés) (facultatif)")).toHaveValue("4");
    const second = await step(2);
    expect(second.getByLabelText("Qui agit")).toHaveValue("hr_role");
    // HR is reminded, never alerted about itself.
    expect(second.queryByLabelText(/Alerte aux RH/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Type de demande")).toHaveValue("1");
    expect(calls.asked).toEqual(["1"]);
    expect(
      screen.getByText("Une modification s'applique aux demandes envoyées ensuite ; les demandes déjà envoyées ne changent pas."),
    ).toBeInTheDocument();
  });

  it("opens on the type the address names, and changes type from the list", async () => {
    const calls = serve();
    open("/hr/settings/steps?type=2");
    await step(1);
    expect(screen.getByLabelText("Type de demande")).toHaveValue("2");
    await chooseOption("Type de demande", "Télétravail");
    await waitFor(() => expect(calls.asked).toEqual(["2", "5"]));
    expect(screen.getByLabelText("Type de demande")).toHaveValue("5");
  });

  it("adds a step for a named person, moves it up, and saves the steps in their order", async () => {
    const calls = serve();
    open();
    await step(2);
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une étape" }));
    const added = await step(3);
    await chooseOption("Qui agit", "Une personne désignée", added);
    setText("Personne", "emp-9", added);
    setText("Rappel après (jours ouvrés)", "3", added);
    await userEvent.click(added.getByRole("button", { name: "Monter" }));
    expect((await step(2)).getByLabelText("Qui agit")).toHaveValue("named_person");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les étapes" }));
    await waitFor(() => expect(calls.saved).toHaveLength(1));
    expect(calls.saved[0]).toEqual({
      id: "1",
      body: {
        steps: [
          { approver_rule: "line_manager", named_person: null, mode: "approve", reminder_after_days: 2, flag_after_days: 4 },
          { approver_rule: "named_person", named_person: "emp-9", mode: "approve", reminder_after_days: 3, flag_after_days: 4 },
          { approver_rule: "hr_role", named_person: null, mode: "approve", reminder_after_days: 2, flag_after_days: null },
        ],
      },
    });
    expect(toast).toHaveBeenCalledWith("Étapes enregistrées.");
  });

  it("refuses steps of which none decides", async () => {
    const calls = serve();
    open();
    await chooseOption("Rôle", "Est seulement informé", await step(1));
    await chooseOption("Rôle", "Est seulement informé", await step(2));
    // A step that only informs has no delay to set.
    expect((await step(1)).queryByLabelText("Rappel après (jours ouvrés)")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les étapes" }));
    expect(await screen.findByText("Au moins une étape doit décider.")).toBeInTheDocument();
    expect(calls.saved).toHaveLength(0);
  });

  it("refuses a named-person step without its person, and a delay that is not a number of days", async () => {
    const calls = serve();
    open();
    const first = await step(1);
    await chooseOption("Qui agit", "Une personne désignée", first);
    setText("Rappel après (jours ouvrés)", "0", first);
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les étapes" }));
    expect(await first.findByText("Choisissez la personne.")).toBeInTheDocument();
    expect(first.getByText("Saisissez un nombre entier de jours, entre 1 et 60.")).toBeInTheDocument();
    expect(calls.saved).toHaveLength(0);
  });

  it("removes a step, and offers no way up from the first nor down from the last", async () => {
    serve();
    open();
    const first = await step(1);
    expect(first.queryByRole("button", { name: "Monter" })).not.toBeInTheDocument();
    expect(first.getByRole("button", { name: "Descendre" })).toBeInTheDocument();
    expect((await step(2)).queryByRole("button", { name: "Descendre" })).not.toBeInTheDocument();
    await userEvent.click(first.getByRole("button", { name: "Retirer" }));
    expect((await step(1)).getByLabelText("Qui agit")).toHaveValue("hr_role");
    expect(screen.queryByRole("group", { name: "Étape 2" })).not.toBeInTheDocument();
  });

  it("previews the saved steps for a chosen employee", async () => {
    const calls = serve();
    open();
    await step(1);
    setText("Aperçu pour un employé", "emp-owner");
    expect(await screen.findByText("Son responsable, Sami Ben Ali, puis les RH")).toBeInTheDocument();
    expect(calls.previews).toEqual(["1:emp-owner"]);
    expect(screen.getByText("L'aperçu montre les étapes enregistrées, pas vos modifications en cours.")).toBeInTheDocument();
  });

  it("shows what the server refuses, and keeps the steps as edited", async () => {
    serve();
    server.use(
      http.put("/api/v1/request-types/:id/steps", () =>
        problemResponse(400, "request.step_delay_invalid", "Les délais se comptent en jours ouvrés et doivent être d'au moins 1."),
      ),
    );
    open();
    setText("Rappel après (jours ouvrés)", "5", await step(1));
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer les étapes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Les délais se comptent en jours ouvrés et doivent être d'au moins 1.",
    );
    expect((await step(1)).getByLabelText("Rappel après (jours ouvrés)")).toHaveValue("5");
  });

  it("read-only: the steps as sentences, and nothing to change", async () => {
    serve();
    open("/hr/settings/steps?type=1", true);
    const list = await screen.findByRole("list", { name: "Étapes d'un type" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Le responsable · Décide");
    expect(items[0]).toHaveTextContent("Rappel après 2 jours ouvrés, alerte aux RH après 4 jours ouvrés");
    expect(items[1]).toHaveTextContent("Les RH · Décide");
    expect(screen.queryByRole("button", { name: "Enregistrer les étapes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter une étape" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Aperçu pour un employé")).not.toBeInTheDocument();
    expect(screen.queryByText(/Une modification s'applique/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run it to see it fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/settings/TypeStepsPage.test.tsx`

Expected: FAIL with "Failed to resolve import "./TypeStepsPage"".

- [ ] **Step 8: Write the page of the steps**

`frontend/src/features/requests/settings/TypeStepsPage.tsx`:

```tsx
import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { useSearchParams } from "react-router";
import type { FieldProblem } from "@/api/problem";
import { EmptyState, FilterSelect, FormSummary, PageHeader, SelectField, TextField, toast } from "@/components";
import { Button } from "@/components/ui/button";
import { EmployeePicker } from "@/features/employees/EmployeePicker";
import { useChainPreview, useRequestTypes, useSaveTypeSteps, useTypeSteps } from "../api";
import { chainSentence } from "../form/chain";
import { useSingleFlight } from "../form/useSingleFlight";
import { Gate } from "../Gate";
import { useRequestsText } from "../platform";
import { details, serverProblems } from "../problems";
import type { ApproverRule, ChainStepInput, ChainStepOut, RequestTypeOut, StepMode } from "../types";

/** A step as the editor holds it: delays as text, the named person as a `public_id` or "". */
interface StepDraft {
  approver_rule: ApproverRule;
  named_person: string;
  mode: StepMode;
  reminder_after_days: string;
  flag_after_days: string;
}

interface StepsValues {
  steps: StepDraft[];
}

const RULES: ApproverRule[] = ["line_manager", "hr_role", "named_person"];
const MODES: StepMode[] = ["approve", "notify"];
const NEW_STEP: StepDraft = { approver_rule: "hr_role", named_person: "", mode: "approve", reminder_after_days: "2", flag_after_days: "4" };

const toDraft = (step: ChainStepOut): StepDraft => ({
  approver_rule: step.approver_rule,
  named_person: step.named_person?.public_id ?? "",
  mode: step.mode,
  reminder_after_days: String(step.reminder_after_days),
  flag_after_days: step.flag_after_days === null ? "" : String(step.flag_after_days),
});

/** HR is reminded but never alerted about itself; a step that only informs waits for nobody. */
const hasFlag = (step: StepDraft) => step.mode === "approve" && step.approver_rule !== "hr_role";

function toInput(step: StepDraft): ChainStepInput {
  const deciding = step.mode === "approve";
  return {
    approver_rule: step.approver_rule,
    named_person: step.approver_rule === "named_person" ? step.named_person : null,
    mode: step.mode,
    reminder_after_days: deciding ? Number(step.reminder_after_days) : 2,
    flag_after_days: hasFlag(step) && step.flag_after_days.trim() !== "" ? Number(step.flag_after_days) : null,
  };
}

const isDelay = (text: string) => /^\d+$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 60;

function StepsEditor({ type, saved }: { type: RequestTypeOut; saved: ChainStepOut[] }) {
  const { t } = useRequestsText();
  const save = useSaveTypeSteps();
  const form = useForm<StepsValues>({ defaultValues: { steps: saved.map(toDraft) } });
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "steps" });
  const steps = (useWatch({ control: form.control, name: "steps" }) ?? []) as StepDraft[];
  const [problems, setProblems] = useState<string[]>([]);
  const [loose, setLoose] = useState<FieldProblem[]>([]);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const preview = useChainPreview(type.id, previewFor);

  const [submit] = useSingleFlight(async (values: StepsValues) => {
    let wrong = false;
    values.steps.forEach((step, index) => {
      if (step.approver_rule === "named_person" && step.named_person === "") {
        form.setError(`steps.${index}.named_person`, { type: "client", message: t("settingsSteps.personRequired") });
        wrong = true;
      }
      if (step.mode === "approve" && !isDelay(step.reminder_after_days)) {
        form.setError(`steps.${index}.reminder_after_days`, { type: "client", message: t("settingsSteps.delayInvalid") });
        wrong = true;
      }
      if (hasFlag(step) && step.flag_after_days.trim() !== "" && !isDelay(step.flag_after_days)) {
        form.setError(`steps.${index}.flag_after_days`, { type: "client", message: t("settingsSteps.delayInvalid") });
        wrong = true;
      }
    });
    const decides = values.steps.some((step) => step.mode === "approve");
    setProblems(decides ? [] : [t("settingsSteps.needsDecider")]);
    setLoose([]);
    if (wrong || !decides) return;
    try {
      await save.mutateAsync({ typeId: type.id, steps: values.steps.map(toInput) });
      toast(t("settingsSteps.saved"));
    } catch (error) {
      // The API reports a problem of the steps as a whole: it is shown above them.
      setLoose(serverProblems(form, error, t, () => null));
    }
  });

  return (
    <>
      <p className="mb-4 max-w-2xl text-body text-text-secondary">{t("settingsForm.appliesLater")}</p>
      <form noValidate onSubmit={form.handleSubmit(submit)} className="flex max-w-2xl flex-col gap-4">
        <FormSummary problems={[...problems, ...details(loose)]} />
        {fields.length === 0 && <p className="text-body text-muted-foreground">{t("settingsSteps.none")}</p>}
        {fields.map((field, index) => {
          const current = steps[index] ?? NEW_STEP;
          return (
            <fieldset key={field.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card px-6 py-5">
              <legend className="px-1 text-section font-semibold">{t("settingsSteps.step", { n: index + 1 })}</legend>
              <SelectField
                control={form.control}
                name={`steps.${index}.approver_rule`}
                label={t("settingsSteps.who")}
                options={RULES.map((rule) => ({ value: rule, label: t(`settingsSteps.rule.${rule}`) }))}
              />
              {current.approver_rule === "named_person" && (
                <Controller
                  control={form.control}
                  name={`steps.${index}.named_person`}
                  render={({ field: person, fieldState }) => (
                    <EmployeePicker
                      label={t("settingsSteps.person")}
                      value={person.value === "" ? null : person.value}
                      onChange={(publicId) => person.onChange(publicId ?? "")}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              )}
              <SelectField
                control={form.control}
                name={`steps.${index}.mode`}
                label={t("settingsSteps.role")}
                options={MODES.map((mode) => ({ value: mode, label: t(`settingsSteps.mode.${mode}`) }))}
              />
              {current.mode === "approve" && (
                <TextField
                  control={form.control}
                  name={`steps.${index}.reminder_after_days`}
                  label={t("settingsSteps.reminder")}
                  inputMode="numeric"
                />
              )}
              {hasFlag(current) && (
                <TextField
                  control={form.control}
                  name={`steps.${index}.flag_after_days`}
                  label={t("settingsSteps.flag")}
                  hint={t("settingsSteps.flagHint")}
                  optional
                  inputMode="numeric"
                />
              )}
              <div className="flex flex-wrap gap-1">
                {index > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => move(index, index - 1)}>
                    {t("settingsSteps.up")}
                  </Button>
                )}
                {index < fields.length - 1 && (
                  <Button variant="ghost" size="sm" onClick={() => move(index, index + 1)}>
                    {t("settingsSteps.down")}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => remove(index)}>
                  {t("settingsSteps.remove")}
                </Button>
              </div>
            </fieldset>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary">
            {t("settingsSteps.save")}
          </Button>
          <Button variant="secondary" onClick={() => append({ ...NEW_STEP })}>
            {t("settingsSteps.add")}
          </Button>
        </div>
      </form>

      <section className="mt-8 max-w-2xl">
        <EmployeePicker
          label={t("settingsSteps.preview")}
          hint={t("settingsSteps.previewHint")}
          value={previewFor}
          onChange={setPreviewFor}
          allowNone
        />
        {previewFor !== null && (
          <Gate query={preview}>{(chain) => <p className="mt-3 text-body font-medium">{chainSentence(chain, t, "hr")}</p>}</Gate>
        )}
      </section>
    </>
  );
}

function StepsRead({ saved }: { saved: ChainStepOut[] }) {
  const { t } = useRequestsText();
  if (saved.length === 0) return <p className="text-body text-muted-foreground">{t("settingsSteps.none")}</p>;
  return (
    <ol aria-label={t("settingsSteps.title")} className="flex max-w-2xl flex-col gap-3">
      {saved.map((step) => {
        const who =
          step.approver_rule === "named_person" && step.named_person
            ? step.named_person.name
            : t(`settingsSteps.rule.${step.approver_rule}`);
        const delays = [
          t("settingsSteps.readReminder", { reminder: step.reminder_after_days }),
          ...(step.flag_after_days === null ? [] : [t("settingsSteps.readFlag", { flag: step.flag_after_days })]),
        ].join(", ");
        return (
          <li key={step.id} className="rounded-xl border border-border bg-card px-6 py-4 text-body">
            <p className="font-medium">{`${who} · ${t(`settingsSteps.mode.${step.mode}`)}`}</p>
            {step.mode === "approve" && <p className="text-text-secondary">{delays}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function StepsOfType({ type, readOnly }: { type: RequestTypeOut; readOnly: boolean }) {
  const steps = useTypeSteps(type.id);
  return (
    <Gate query={steps}>
      {(saved) => {
        const ordered = [...saved].sort((a, b) => a.position - b.position);
        return readOnly ? <StepsRead saved={ordered} /> : <StepsEditor type={type} saved={ordered} />;
      }}
    </Gate>
  );
}

/** Settings, steps of a type (UI 7.12). `?type=<id>` names the type; the first one otherwise. */
export default function TypeStepsPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useRequestsText();
  const [search, setSearch] = useSearchParams();
  const types = useRequestTypes();

  return (
    <>
      <PageHeader title={t("settingsSteps.title")} back={readOnly ? undefined : "/hr/settings"} />
      <Gate query={types}>
        {(all) => {
          const sorted = [...all].sort((a, b) => a.sort_order - b.sort_order);
          const type = sorted.find((item) => String(item.id) === search.get("type")) ?? sorted[0];
          if (!type) return <EmptyState title={t("settingsTypes.empty")} />;
          return (
            <>
              <div className="mb-4">
                <FilterSelect
                  label={t("settingsSteps.type")}
                  value={String(type.id)}
                  onChange={(value) => setSearch({ type: value })}
                  options={sorted.map((item) => ({ value: String(item.id), label: item.name }))}
                />
              </div>
              {/* The key gives each type its own editor: nothing typed for one type follows to another. */}
              <StepsOfType key={type.id} type={type} readOnly={readOnly} />
            </>
          );
        }}
      </Gate>
    </>
  );
}
```

- [ ] **Step 9: Run the test to see it pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/settings/TypeStepsPage.test.tsx src/i18n/parity.test.ts`

Expected: PASS, 9 tests.

The editor reads the steps once, when it mounts; the refetch that follows a save does not overwrite what is on screen. That is intended: what is on screen is what was just saved.

- [ ] **Step 10: Write the failing tests of the events and of the public holidays**

`frontend/src/features/requests/settings/EventsPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeEvent, problemResponse } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { setText, toggle } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import EventsPage from "./EventsPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

function serve() {
  const calls = { created: [] as unknown[], updated: [] as { id: string; body: unknown }[] };
  server.use(
    http.get("/api/v1/exceptional-events", () =>
      HttpResponse.json([
        makeEvent(),
        makeEvent({ id: 2, name: "Pèlerinage", name_fr: "Pèlerinage", name_en: "Pilgrimage", days_allowed: "10.00", proof_required: false, is_active: false }),
      ]),
    ),
    http.post("/api/v1/exceptional-events", async ({ request }) => {
      calls.created.push(await request.json());
      return HttpResponse.json(makeEvent({ id: 3 }), { status: 201 });
    }),
    http.patch("/api/v1/exceptional-events/:id", async ({ request, params }) => {
      calls.updated.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json(makeEvent());
    }),
  );
  return calls;
}

const open = (readOnly = false) =>
  renderApp(<EventsPage readOnly={readOnly} />, { route: "/hr/settings/events", path: "/hr/settings/events", me });
const rowOf = async (name: RegExp) => within(await screen.findByRole("row", { name }));

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("Settings, exceptional-leave events (UI 7.12, ADM-03)", () => {
  it("lists each event with the days it gives, whether proof is required, and its state", async () => {
    serve();
    open();
    const marriage = await rowOf(/Mariage/);
    expect(marriage.getByText("3 j")).toBeInTheDocument();
    expect(marriage.getByText("Oui")).toBeInTheDocument();
    expect(marriage.getByText("Actif")).toBeInTheDocument();
    const pilgrimage = await rowOf(/Pèlerinage/);
    expect(pilgrimage.getByText("10 j")).toBeInTheDocument();
    expect(pilgrimage.getByText("Non")).toBeInTheDocument();
    expect(pilgrimage.getByText("Inactif")).toBeInTheDocument();
  });

  it("creates an event", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouvel événement" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Nouvel événement" }));
    setText("Nom en français", "Déménagement", inSheet);
    setText("Nom en anglais", "Moving house", inSheet);
    setText("Jours accordés", "1", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(calls.created).toEqual([
        { name_fr: "Déménagement", name_en: "Moving house", days_allowed: "1", proof_required: false, is_active: true },
      ]),
    );
    expect(toast).toHaveBeenCalledWith("Événement enregistré.");
  });

  it("changes an event", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Mariage" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Modifier : Mariage" }));
    expect(inSheet.getByLabelText("Jours accordés")).toHaveValue("3");
    setText("Jours accordés", "4", inSheet);
    await toggle("Un justificatif est requis", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(calls.updated).toEqual([
        { id: "1", body: { name_fr: "Mariage", name_en: "Marriage", days_allowed: "4", proof_required: false, is_active: true } },
      ]),
    );
  });

  it("refuses missing names and zero days before sending, and shows the server's refusal on its field", async () => {
    const calls = serve();
    server.use(
      http.post("/api/v1/exceptional-events", () =>
        problemResponse(400, "validation", "Le nombre de jours accordés doit être supérieur à zéro.", [
          { field: "days_allowed", code: "request.event_days_invalid", detail: "Le nombre de jours accordés doit être supérieur à zéro." },
        ]),
      ),
    );
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouvel événement" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Nouvel événement" }));
    setText("Jours accordés", "0", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    expect(await inSheet.findAllByText("Ce champ est nécessaire.")).toHaveLength(2);
    expect(inSheet.getByText("Saisissez un nombre supérieur à zéro.")).toBeInTheDocument();
    expect(calls.created).toHaveLength(0);

    setText("Nom en français", "Déménagement", inSheet);
    setText("Nom en anglais", "Moving house", inSheet);
    setText("Jours accordés", "0,5", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    expect(await inSheet.findByText("Le nombre de jours accordés doit être supérieur à zéro.")).toBeInTheDocument();
    expect(inSheet.getByLabelText("Nom en français")).toHaveValue("Déménagement");
  });

  it("read-only: the list, and nothing to open or add", async () => {
    serve();
    open(true);
    await rowOf(/Mariage/);
    expect(screen.queryByRole("button", { name: "Nouvel événement" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mariage" })).not.toBeInTheDocument();
  });
});
```

`frontend/src/features/requests/settings/HolidaysPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components";
import { makeHoliday, problemResponse } from "@/features/requests/fixtures";
import { todayISO } from "@/lib/dates";
import { makeMe } from "@/test/fixtures";
import { chooseOption, setDate, setText } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import type { HolidayImpact } from "../types";
import HolidaysPage from "./HolidaysPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  toast: vi.fn(),
}));

const me = makeMe({ roles: ["employee", "hr"], workspaces: ["me", "hr"] });

const COVERED: HolidayImpact[] = [
  { public_id: "req-1", employee: "Amal Trabelsi", type: "Congé annuel", start_date: "2026-11-09", end_date: "2026-11-11", quantity: "3.00" },
];
const WARNING = "Des demandes déjà approuvées couvrent ce jour. Leur décompte ne change pas :";

function serve(impact: HolidayImpact[] = []) {
  const calls = {
    years: [] as string[],
    impactDates: [] as string[],
    created: [] as unknown[],
    updated: [] as { id: string; body: unknown }[],
    deleted: [] as string[],
    copied: [] as unknown[],
  };
  server.use(
    http.get("/api/v1/holidays", ({ request }) => {
      calls.years.push(new URL(request.url).searchParams.get("year") ?? "");
      return HttpResponse.json([
        makeHoliday({ id: 3, date: "2026-03-31", name: "Aïd el-Fitr", name_fr: "Aïd el-Fitr", name_en: "Eid al-Fitr", recurs_yearly: false }),
        makeHoliday(),
      ]);
    }),
    http.get("/api/v1/holidays/impact", ({ request }) => {
      calls.impactDates.push(new URL(request.url).searchParams.get("date") ?? "");
      return HttpResponse.json(impact);
    }),
    http.post("/api/v1/holidays", async ({ request }) => {
      calls.created.push(await request.json());
      return HttpResponse.json(makeHoliday({ id: 9 }), { status: 201 });
    }),
    http.patch("/api/v1/holidays/:id", async ({ request, params }) => {
      calls.updated.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json(makeHoliday());
    }),
    http.delete("/api/v1/holidays/:id", ({ params }) => {
      calls.deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("/api/v1/holidays/copy", async ({ request }) => {
      calls.copied.push(await request.json());
      return HttpResponse.json([makeHoliday({ id: 11, date: "2027-05-01" }), makeHoliday({ id: 12, date: "2027-07-25" })], { status: 201 });
    }),
  );
  return calls;
}

const open = (route = "/hr/settings/holidays?year=2026", readOnly = false) =>
  renderApp(<HolidaysPage readOnly={readOnly} />, { route, path: "/hr/settings/holidays", me });
const rowOf = async (name: RegExp) => within(await screen.findByRole("row", { name }));

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("Settings, public holidays (UI 7.12, ADM-04)", () => {
  it("lists the holidays of the year with their date, name and recurrence", async () => {
    const calls = serve();
    open();
    const labour = await rowOf(/Fête du travail/);
    expect(labour.getByText("D(2026-05-01)")).toBeInTheDocument();
    expect(labour.getByText("Chaque année, à la même date")).toBeInTheDocument();
    expect((await rowOf(/Aïd el-Fitr/)).getByText("Cette année seulement")).toBeInTheDocument();
    expect(screen.getByLabelText("Année")).toHaveValue("2026");
    expect(calls.years).toEqual(["2026"]);
  });

  it("starts on the current year and changes year", async () => {
    const calls = serve();
    open("/hr/settings/holidays");
    const thisYear = Number(todayISO().slice(0, 4));
    await rowOf(/Fête du travail/);
    expect(calls.years).toEqual([String(thisYear)]);
    await chooseOption("Année", String(thisYear + 1));
    await waitFor(() => expect(calls.years.at(-1)).toBe(String(thisYear + 1)));
  });

  it("adds a holiday, and warns about the approved requests that cover the day", async () => {
    const calls = serve(COVERED);
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau jour férié" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Nouveau jour férié" }));
    setDate("Date", "2026-11-10", inSheet);
    expect(await inSheet.findByText(WARNING)).toBeInTheDocument();
    expect(inSheet.getByText("Amal Trabelsi · Congé annuel · R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(calls.impactDates).toEqual(["2026-11-10"]);
    setText("Nom en français", "Jour exceptionnel", inSheet);
    setText("Nom en anglais", "Special day", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(calls.created).toEqual([
        { date: "2026-11-10", name_fr: "Jour exceptionnel", name_en: "Special day", recurs_yearly: false },
      ]),
    );
    expect(toast).toHaveBeenCalledWith("Jour férié enregistré.");
  });

  it("shows no warning when no approved request covers the day", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau jour férié" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Nouveau jour férié" }));
    setDate("Date", "2026-11-10", inSheet);
    await waitFor(() => expect(calls.impactDates).toEqual(["2026-11-10"]));
    expect(inSheet.queryByRole("status")).not.toBeInTheDocument();
  });

  it("changes a holiday; a moved date warns about the new day and about the former one", async () => {
    const calls = serve(COVERED);
    open();
    await userEvent.click(await screen.findByRole("button", { name: "D(2026-05-01)" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Modifier : Fête du travail" }));
    expect(inSheet.getByLabelText("Nom en anglais")).toHaveValue("Labour Day");
    // Nothing changes yet: nothing to warn about.
    expect(inSheet.queryByRole("status")).not.toBeInTheDocument();
    setDate("Date", "2026-05-04", inSheet);
    expect(await inSheet.findByText(WARNING)).toBeInTheDocument();
    expect(
      await inSheet.findByText("Des demandes déjà approuvées couvrent l'ancienne date. Leur décompte ne change pas :"),
    ).toBeInTheDocument();
    expect([...calls.impactDates].sort()).toEqual(["2026-05-01", "2026-05-04"]);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(calls.updated).toEqual([
        { id: "1", body: { date: "2026-05-04", name_fr: "Fête du travail", name_en: "Labour Day", recurs_yearly: true } },
      ]),
    );
  });

  it("removes a holiday after stating the consequence and who is affected", async () => {
    const calls = serve(COVERED);
    open();
    const labour = await rowOf(/Fête du travail/);
    await userEvent.click(labour.getByRole("button", { name: "Supprimer" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Supprimer ce jour férié ?" });
    expect(
      await within(dialog).findByText(
        "Le D(2026-05-01) redevient un jour ouvré pour les demandes à venir. Des demandes déjà approuvées couvrent ce jour et leur décompte ne change pas : Amal Trabelsi.",
      ),
    ).toBeInTheDocument();
    expect(calls.deleted).toEqual([]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Supprimer le jour férié" }));
    await waitFor(() => expect(calls.deleted).toEqual(["1"]));
    expect(toast).toHaveBeenCalledWith("Jour férié supprimé.");
  });

  it("copies the fixed-date holidays to the next year", async () => {
    const calls = serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Copier les jours à date fixe vers 2027" }));
    await waitFor(() => expect(calls.copied).toEqual([{ from_year: 2026, to_year: 2027 }]));
    expect(toast).toHaveBeenCalledWith("Jours fériés copiés vers 2027 : 2.");
  });

  it("shows on the date what the server refuses, and keeps the names", async () => {
    serve();
    server.use(
      http.post("/api/v1/holidays", () =>
        problemResponse(400, "validation", "Un jour férié existe déjà à cette date.", [
          { field: "date", code: "calendar.holiday_exists", detail: "Un jour férié existe déjà à cette date." },
        ]),
      ),
    );
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Nouveau jour férié" }));
    const inSheet = within(await screen.findByRole("dialog", { name: "Nouveau jour férié" }));
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    expect(await inSheet.findAllByText("Ce champ est nécessaire.")).toHaveLength(3);
    setDate("Date", "2026-05-01", inSheet);
    setText("Nom en français", "Fête du travail", inSheet);
    setText("Nom en anglais", "Labour Day", inSheet);
    await userEvent.click(inSheet.getByRole("button", { name: "Enregistrer" }));
    expect(await inSheet.findByText("Un jour férié existe déjà à cette date.")).toBeInTheDocument();
    expect(inSheet.getByLabelText("Nom en français")).toHaveValue("Fête du travail");
  });

  it("read-only: the list of the year, and nothing to add, change, copy or remove", async () => {
    serve();
    open("/hr/settings/holidays?year=2026", true);
    await rowOf(/Fête du travail/);
    expect(screen.getByLabelText("Année")).toHaveValue("2026");
    expect(screen.queryByRole("button", { name: "Nouveau jour férié" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copier/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "D(2026-05-01)" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 11: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/settings/EventsPage.test.tsx src/features/requests/settings/HolidaysPage.test.tsx`

Expected: FAIL with "Failed to resolve import "./EventsPage"" and "Failed to resolve import "./HolidaysPage"".

- [ ] **Step 12: Write the pages of the events and of the public holidays**

`frontend/src/features/requests/settings/EventsPage.tsx`:

```tsx
import { useState } from "react";
import { useForm, type Path } from "react-hook-form";
import type { FieldProblem } from "@/api/problem";
import {
  DataTable, EmptyState, FormSummary, PageHeader, StatusBadge, SwitchField, TextField, toast, type Column,
} from "@/components";
import { Button } from "@/components/ui/button";
import { formatDays } from "@/lib/format";
import { useEvents, useSaveEvent } from "../api";
import { useSingleFlight } from "../form/useSingleFlight";
import { Gate } from "../Gate";
import { ActionSheet } from "../hr/actions/ActionSheet";
import { useRequestsText } from "../platform";
import { byName, details, serverProblems } from "../problems";
import type { ExceptionalEventOut } from "../types";

interface EventValues {
  name_fr: string;
  name_en: string;
  days_allowed: string;
  proof_required: boolean;
  is_active: boolean;
}

const NEW_EVENT: EventValues = { name_fr: "", name_en: "", days_allowed: "", proof_required: false, is_active: true };
const SHOWN: Path<EventValues>[] = ["name_fr", "name_en", "days_allowed"];
const BY_CODE: Record<string, Path<EventValues>> = { "request.event_days_invalid": "days_allowed" };

function EventForm({ formId, event, onDone }: { formId: string; event: ExceptionalEventOut | null; onDone: () => void }) {
  const { t } = useRequestsText();
  const save = useSaveEvent();
  const form = useForm<EventValues>({
    defaultValues: event
      ? {
          name_fr: event.name_fr,
          name_en: event.name_en,
          days_allowed: String(Number(event.days_allowed)),
          proof_required: event.proof_required,
          is_active: event.is_active,
        }
      : NEW_EVENT,
  });
  const [loose, setLoose] = useState<FieldProblem[]>([]);
  const label = (name: string) => t(`settingsEvents.fields.${name}`);

  const [submit] = useSingleFlight(async (values: EventValues) => {
    const days = values.days_allowed.trim().replace(",", ".");
    const nameFr = values.name_fr.trim();
    const nameEn = values.name_en.trim();
    if (nameFr === "") form.setError("name_fr", { type: "client", message: t("formErrors.required") });
    if (nameEn === "") form.setError("name_en", { type: "client", message: t("formErrors.required") });
    if (!(Number(days) > 0)) form.setError("days_allowed", { type: "client", message: t("settingsForm.positive") });
    if (nameFr === "" || nameEn === "" || !(Number(days) > 0)) return;
    try {
      await save.mutateAsync({
        id: event?.id ?? null,
        body: { name_fr: nameFr, name_en: nameEn, days_allowed: days, proof_required: values.proof_required, is_active: values.is_active },
      });
      toast(t("settingsEvents.saved"));
      onDone();
    } catch (error) {
      setLoose(serverProblems(form, error, t, byName<EventValues>(SHOWN, BY_CODE)));
    }
  });

  return (
    <form id={formId} noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4">
      <FormSummary problems={details(loose)} />
      <TextField control={form.control} name="name_fr" label={label("name_fr")} />
      <TextField control={form.control} name="name_en" label={label("name_en")} />
      <TextField control={form.control} name="days_allowed" label={label("days_allowed")} inputMode="decimal" />
      <SwitchField control={form.control} name="proof_required" label={label("proof_required")} />
      <SwitchField control={form.control} name="is_active" label={label("is_active")} />
    </form>
  );
}

/** Settings, exceptional-leave events (UI 7.12). With `readOnly`, the list alone. */
export default function EventsPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t, lang } = useRequestsText();
  const events = useEvents();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ExceptionalEventOut | null>(null);

  const show = (event: ExceptionalEventOut | null) => {
    setSelected(event);
    setOpen(true);
  };

  const columns: Column<ExceptionalEventOut>[] = [
    { key: "name", header: t("settingsEvents.columns.name"), cell: (event) => event.name },
    { key: "days", header: t("settingsEvents.columns.days"), cell: (event) => formatDays(event.days_allowed, lang) },
    {
      key: "proof",
      header: t("settingsEvents.columns.proof"),
      cell: (event) => t(event.proof_required ? "common.yes" : "common.no"),
    },
    {
      key: "state",
      header: t("settingsEvents.columns.state"),
      cell: (event) => (
        <StatusBadge tone={event.is_active ? "approved" : "neutral"}>
          {t(event.is_active ? "settingsForm.active" : "settingsForm.inactive")}
        </StatusBadge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("settingsEvents.title")}
        back={readOnly ? undefined : "/hr/settings"}
        primary={
          readOnly ? undefined : (
            <Button variant="primary" onClick={() => show(null)}>
              {t("settingsEvents.new")}
            </Button>
          )
        }
      />
      <Gate query={events}>
        {(all) => (
          <DataTable
            label={t("settingsEvents.title")}
            columns={columns}
            rows={[...all].sort((a, b) => a.name.localeCompare(b.name, lang))}
            rowKey={(event) => String(event.id)}
            onRowOpen={readOnly ? undefined : show}
            empty={<EmptyState title={t("settingsEvents.empty")} />}
          />
        )}
      </Gate>
      {!readOnly && (
        <ActionSheet
          open={open}
          onOpenChange={setOpen}
          title={selected ? t("settingsEvents.sheetEdit", { name: selected.name }) : t("settingsEvents.sheetNew")}
          submitLabel={t("common.save")}
        >
          {(formId) => <EventForm formId={formId} event={selected} onDone={() => setOpen(false)} />}
        </ActionSheet>
      )}
    </>
  );
}
```

`frontend/src/features/requests/settings/HolidaysPage.tsx`:

```tsx
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useSearchParams } from "react-router";
import { ProblemError, type FieldProblem } from "@/api/problem";
import {
  ConfirmDialog, DataTable, DateField, EmptyState, FilterSelect, FormSummary, PageHeader, SwitchField, TextField, toast,
  type Column,
} from "@/components";
import { Button } from "@/components/ui/button";
import { todayISO } from "@/lib/dates";
import { formatDate, formatDateRange } from "@/lib/format";
import { useCopyHolidays, useDeleteHoliday, useHolidayImpact, useHolidays, useSaveHoliday } from "../api";
import { useSingleFlight } from "../form/useSingleFlight";
import { Gate } from "../Gate";
import { ActionSheet } from "../hr/actions/ActionSheet";
import { useRequestsText, type Translate } from "../platform";
import { byName, details, serverProblems } from "../problems";
import type { HolidayOut } from "../types";

interface HolidayValues {
  date: string;
  name_fr: string;
  name_en: string;
  recurs_yearly: boolean;
}

const NEW_HOLIDAY: HolidayValues = { date: "", name_fr: "", name_en: "", recurs_yearly: false };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const failure = (error: unknown, t: Translate) =>
  error instanceof ProblemError && error.detail ? error.detail : t("errors:unexpected");

/**
 * The approved requests that cover a day about to become, or to stop being, a public holiday.
 * They are reported, not recalculated: a request already sent keeps its count (master D22).
 */
function Impact({ date, title }: { date: string; title: string }) {
  const { lang } = useRequestsText();
  const impact = useHolidayImpact(ISO_DATE.test(date) ? date : "");
  const rows = impact.data ?? [];
  if (rows.length === 0) return null;
  return (
    <div role="status" className="rounded-md border border-[var(--info-border)] bg-info-bg px-3 py-2 text-body text-info">
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-disc pl-5">
        {rows.map((row) => (
          <li key={row.public_id}>{`${row.employee} · ${row.type} · ${formatDateRange(row.start_date, row.end_date, lang)}`}</li>
        ))}
      </ul>
    </div>
  );
}

function HolidayForm({ formId, holiday, onDone }: { formId: string; holiday: HolidayOut | null; onDone: () => void }) {
  const { t } = useRequestsText();
  const save = useSaveHoliday();
  const form = useForm<HolidayValues>({
    defaultValues: holiday
      ? { date: holiday.date, name_fr: holiday.name_fr, name_en: holiday.name_en, recurs_yearly: holiday.recurs_yearly }
      : NEW_HOLIDAY,
  });
  const date = useWatch({ control: form.control, name: "date" });
  const [loose, setLoose] = useState<FieldProblem[]>([]);
  const label = (name: string) => t(`settingsHolidays.fields.${name}`);
  const moved = holiday !== null && date !== holiday.date;

  const [submit] = useSingleFlight(async (values: HolidayValues) => {
    const nameFr = values.name_fr.trim();
    const nameEn = values.name_en.trim();
    const required = t("formErrors.required");
    if (!ISO_DATE.test(values.date)) form.setError("date", { type: "client", message: required });
    if (nameFr === "") form.setError("name_fr", { type: "client", message: required });
    if (nameEn === "") form.setError("name_en", { type: "client", message: required });
    if (!ISO_DATE.test(values.date) || nameFr === "" || nameEn === "") return;
    try {
      await save.mutateAsync({
        id: holiday?.id ?? null,
        body: { date: values.date, name_fr: nameFr, name_en: nameEn, recurs_yearly: values.recurs_yearly },
      });
      toast(t("settingsHolidays.saved"));
      onDone();
    } catch (error) {
      setLoose(serverProblems(form, error, t, byName<HolidayValues>(["date", "name_fr", "name_en"])));
    }
  });

  return (
    <form id={formId} noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4">
      <FormSummary problems={details(loose)} />
      <DateField control={form.control} name="date" label={label("date")} />
      {(holiday === null || moved) && <Impact date={date} title={t("settingsHolidays.impactNew")} />}
      {moved && holiday && <Impact date={holiday.date} title={t("settingsHolidays.impactOld")} />}
      <TextField control={form.control} name="name_fr" label={label("name_fr")} />
      <TextField control={form.control} name="name_en" label={label("name_en")} />
      <SwitchField control={form.control} name="recurs_yearly" label={label("recurs_yearly")} />
    </form>
  );
}

/** Settings, public holidays by year (UI 7.12). `?year=` names the year; the current one otherwise. */
export default function HolidaysPage({ readOnly = false }: { readOnly?: boolean }) {
  const { t, lang } = useRequestsText();
  const [search, setSearch] = useSearchParams();
  const thisYear = Number(todayISO().slice(0, 4));
  const asked = Number(search.get("year"));
  const year = Number.isInteger(asked) && asked >= 1900 && asked <= 2200 ? asked : thisYear;
  const years = [...new Set([thisYear - 1, thisYear, thisYear + 1, thisYear + 2, year])].sort((a, b) => a - b);

  const holidays = useHolidays(year);
  const remove = useDeleteHoliday();
  const copy = useCopyHolidays();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<HolidayOut | null>(null);
  // The holiday being removed, while its confirmation is open.
  const [doomed, setDoomed] = useState<HolidayOut | null>(null);
  const doomedImpact = useHolidayImpact(doomed?.date ?? "");

  const show = (holiday: HolidayOut | null) => {
    setSelected(holiday);
    setOpen(true);
  };

  const [copyNext] = useSingleFlight(async () => {
    try {
      const created = await copy.mutateAsync({ fromYear: year, toYear: year + 1 });
      toast(t("settingsHolidays.copied", { year: year + 1, n: created.length }));
    } catch (error) {
      toast(failure(error, t));
    }
  });

  const [confirmRemoval] = useSingleFlight(async (holiday: HolidayOut) => {
    try {
      await remove.mutateAsync(holiday.id);
      toast(t("settingsHolidays.deleted"));
    } catch (error) {
      toast(failure(error, t));
    } finally {
      setDoomed(null);
    }
  });

  const affected = (doomedImpact.data ?? []).map((row) => row.employee);
  const consequence = doomed
    ? [
        t("settingsHolidays.deleteConsequence", { date: formatDate(doomed.date, lang) }),
        ...(affected.length > 0 ? [t("settingsHolidays.deleteImpact", { people: [...new Set(affected)].join(", ") })] : []),
      ].join(" ")
    : "";

  const columns: Column<HolidayOut>[] = [
    { key: "date", header: t("settingsHolidays.columns.date"), cell: (holiday) => formatDate(holiday.date, lang) },
    { key: "name", header: t("settingsHolidays.columns.name"), cell: (holiday) => holiday.name },
    {
      key: "recurs",
      header: t("settingsHolidays.columns.recurs"),
      cell: (holiday) => (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{t(holiday.recurs_yearly ? "settingsHolidays.everyYear" : "settingsHolidays.thisYearOnly")}</span>
          {!readOnly && (
            <Button variant="ghost" size="sm" onClick={() => setDoomed(holiday)}>
              {t("settingsHolidays.delete")}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("settingsHolidays.title")}
        back={readOnly ? undefined : "/hr/settings"}
        primary={
          readOnly ? undefined : (
            <Button variant="primary" onClick={() => show(null)}>
              {t("settingsHolidays.new")}
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FilterSelect
          label={t("settingsHolidays.year")}
          value={String(year)}
          onChange={(value) => setSearch({ year: value })}
          options={years.map((value) => ({ value: String(value), label: String(value) }))}
        />
        {!readOnly && (
          <Button variant="secondary" onClick={() => void copyNext()}>
            {t("settingsHolidays.copy", { year: year + 1 })}
          </Button>
        )}
      </div>
      <Gate query={holidays}>
        {(all) => (
          <DataTable
            label={t("settingsHolidays.title")}
            columns={columns}
            rows={[...all].sort((a, b) => a.date.localeCompare(b.date))}
            rowKey={(holiday) => String(holiday.id)}
            onRowOpen={readOnly ? undefined : show}
            empty={<EmptyState title={t("settingsHolidays.empty", { year })} />}
          />
        )}
      </Gate>
      {!readOnly && (
        <>
          <ActionSheet
            open={open}
            onOpenChange={setOpen}
            title={selected ? t("settingsHolidays.sheetEdit", { name: selected.name }) : t("settingsHolidays.sheetNew")}
            submitLabel={t("common.save")}
          >
            {(formId) => <HolidayForm formId={formId} holiday={selected} onDone={() => setOpen(false)} />}
          </ActionSheet>
          <ConfirmDialog
            open={doomed !== null}
            onOpenChange={(next) => {
              if (!next) setDoomed(null);
            }}
            title={t("settingsHolidays.deleteTitle")}
            consequence={consequence}
            confirmLabel={t("settingsHolidays.deleteConfirm")}
            destructive
            onConfirm={() => {
              if (doomed) void confirmRemoval(doomed);
            }}
          />
        </>
      )}
    </>
  );
}
```

- [ ] **Step 13: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/settings src/i18n/parity.test.ts`

Expected: PASS (7 tests for the types, 9 for the steps, 5 for the events, 9 for the holidays).

- [ ] **Step 14: Write the failing test of the settings index and of the parameter labels**

`frontend/src/features/requests/settings/subjects.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HR_SETTINGS_SUBJECTS } from "@/features/settings/hrSubjects";
import i18n from "@/i18n";

const LANGUAGES = ["fr", "en"] as const;

describe("the request engine in the HR settings (UI 7.12)", () => {
  it("adds its five subjects before departments, in the order of the UI", () => {
    const ordered = [...HR_SETTINGS_SUBJECTS].sort((a, b) => a.order - b.order);
    expect(ordered.slice(0, 5).map((subject) => [subject.id, subject.path])).toEqual([
      ["request-types", "/hr/settings/request-types"],
      ["steps", "/hr/settings/steps"],
      ["events", "/hr/settings/events"],
      ["holidays", "/hr/settings/holidays"],
      ["parameters", "/hr/settings/parameters"],
    ]);
    expect(ordered.map((subject) => subject.id)).toContain("departments");
  });

  it("gives each subject a title and a description in both languages", () => {
    for (const subject of HR_SETTINGS_SUBJECTS) {
      for (const lng of LANGUAGES) {
        expect(i18n.exists(subject.titleKey, { lng }), `${subject.titleKey} (${lng})`).toBe(true);
        expect(i18n.exists(subject.descriptionKey, { lng }), `${subject.descriptionKey} (${lng})`).toBe(true);
      }
    }
  });

  it("labels the three parameters of the request engine in both languages", () => {
    for (const key of ["working_week", "certificate_deadline_hours", "certificate_warning_hours"]) {
      for (const lng of LANGUAGES) {
        expect(i18n.exists(`settings:${key}.label`, { lng }), `${key}.label (${lng})`).toBe(true);
        expect(i18n.exists(`settings:${key}.hint`, { lng }), `${key}.hint (${lng})`).toBe(true);
      }
    }
  });
});
```

Run: `docker compose run --rm web npx vitest run src/features/requests/settings/subjects.test.ts`

Expected: FAIL. The first test finds only `departments`; the third finds no label.

- [ ] **Step 15: Register the subjects and the routes, and label the parameters**

At the end of `frontend/src/features/settings/hrSubjects.ts`, as the last statement of the file:

```ts
// The subjects of the request engine (plan 03b), before departments (60).
HR_SETTINGS_SUBJECTS.push(
  {
    id: "request-types",
    path: "/hr/settings/request-types",
    titleKey: "requests:settingsIndex.types.title",
    descriptionKey: "requests:settingsIndex.types.description",
    order: 10,
  },
  {
    id: "steps",
    path: "/hr/settings/steps",
    titleKey: "requests:settingsIndex.steps.title",
    descriptionKey: "requests:settingsIndex.steps.description",
    order: 20,
  },
  {
    id: "events",
    path: "/hr/settings/events",
    titleKey: "requests:settingsIndex.events.title",
    descriptionKey: "requests:settingsIndex.events.description",
    order: 30,
  },
  {
    id: "holidays",
    path: "/hr/settings/holidays",
    titleKey: "requests:settingsIndex.holidays.title",
    descriptionKey: "requests:settingsIndex.holidays.description",
    order: 40,
  },
  {
    id: "parameters",
    path: "/hr/settings/parameters",
    titleKey: "requests:settingsIndex.parameters.title",
    descriptionKey: "requests:settingsIndex.parameters.description",
    order: 50,
  },
);
```

In `frontend/src/workspaces/hr/routes.tsx`, add the imports and append five elements to the `hrRoutes` array:

```tsx
import EventsPage from "@/features/requests/settings/EventsPage";
import HolidaysPage from "@/features/requests/settings/HolidaysPage";
import RequestTypesPage from "@/features/requests/settings/RequestTypesPage";
import TypeStepsPage from "@/features/requests/settings/TypeStepsPage";
import SettingsGroupPage from "@/features/settings/SettingsGroupPage";
```

```tsx
  { path: "settings/request-types", element: <RequestTypesPage /> },
  { path: "settings/steps", element: <TypeStepsPage /> },
  { path: "settings/events", element: <EventsPage /> },
  { path: "settings/holidays", element: <HolidaysPage /> },
  { path: "settings/parameters", element: <SettingsGroupPage group="hr" /> },
```

In `frontend/src/i18n/locales/fr/settings.json`, add three top-level keys:

```json
  "working_week": {
    "label": "Jours travaillés de la semaine",
    "hint": "Seuls ces jours sont comptés dans une demande. Un changement ne modifie pas les demandes déjà envoyées."
  },
  "certificate_deadline_hours": {
    "label": "Délai pour fournir le certificat médical (heures)",
    "hint": "Compté à partir de l'envoi de la déclaration de maladie. Un type de demande peut fixer son propre délai."
  },
  "certificate_warning_hours": {
    "label": "Rappel avant l'échéance du certificat (heures)",
    "hint": "L'employé est prévenu ce nombre d'heures avant l'échéance."
  }
```

In `frontend/src/i18n/locales/en/settings.json`:

```json
  "working_week": {
    "label": "Working days of the week",
    "hint": "Only these days are counted in a request. A change does not alter requests already sent."
  },
  "certificate_deadline_hours": {
    "label": "Time allowed to provide the medical certificate (hours)",
    "hint": "Counted from the moment the sick leave is reported. A request type can set its own."
  },
  "certificate_warning_hours": {
    "label": "Reminder before the certificate is due (hours)",
    "hint": "The employee is warned this many hours before the deadline."
  }
```

- [ ] **Step 16: Run every test of the task, the type check and the lint**

Run: `docker compose run --rm web npx vitest run src/features/requests/settings src/features/settings src/i18n/parity.test.ts`

Expected: PASS: 3 tests for the subjects with the 30 above, and plan 01b's and plan 02's tests of the settings pages still pass. If plan 02's test of the index counts its entries, it now finds six: change that count in its test and nothing else.

Run: `docker compose run --rm web npm run typecheck` then `docker compose run --rm web npm run lint`

Expected: no error.

- [ ] **Step 17: Commit**

```bash
git add frontend/src/features/requests/settings frontend/src/features/settings/hrSubjects.ts frontend/src/workspaces/hr/routes.tsx frontend/src/i18n/locales
git commit -m "feat(requests): HR settings for request types, steps, events, public holidays and parameters"
```

---

### Task 18: Overview: every request, read-only

UI 8.3 and the Overview column of UI 10.2. "The whole workspace is read-only: it contains no editing action at all, so nothing appears disabled." An executive who must decide a request (a direct report's, or an HR step that falls back to them) does it in My team or My space; here the request only says so and links there.

**Files:**
- Create: `frontend/src/features/requests/overview/OverviewRequestsPage.tsx`
- Create: `frontend/src/features/requests/views/RequestOverviewView.tsx`
- Modify: `frontend/src/features/requests/views/registry.ts` (add one line)
- Modify: `frontend/src/workspaces/overview/routes.tsx` (append two routes)
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (sections `overviewList`, `overviewView`)
- Test: `frontend/src/features/requests/overview/OverviewRequestsPage.test.tsx`
- Test: `frontend/src/features/requests/views/RequestOverviewView.test.tsx`

**Interfaces:**
- Consumes: `RequestsList` (Task 7); `RequestView`, `RequestPage`, `VIEWS` (Task 8), where `RequestPage` already shows the `overview` view for every request opened under `/overview`; `DecisionContextView` (Task 11); `useViewer`, `workspaceFor` (Task 1), which never sends an approver to Overview; `backToList`.
- Produces: `OverviewRequestsPage` (default export) at `/overview/requests`; `RequestOverviewView({ request })` (default export), registered for the relation `overview`; routes `requests` and `requests/:id` of Overview.

| Content (UI 10.2, Overview) | Shown |
|---|---|
| Who, type, dates, length, status sentence | In the summary |
| Comment | In the summary, when the API returns it (never for sick leave) |
| Balance now and after, teammates away | In the summary, from `decision_context` |
| Steps and history, non-medical files | One step away |
| Certificate, certificate status, sick-leave comment | Never: the API returns none of them to this viewer |
| Any action | None. A viewer who can decide gets a sentence and a link to the workspace where the decision is taken. |

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "overviewList": {
    "title": "Demandes",
    "empty": "Aucune demande ici.",
    "emptyHint": "Changez les filtres pour en voir d'autres."
  },
  "overviewView": {
    "decideElsewhere": "Cette demande attend votre décision. La vue d'ensemble est en lecture seule : la décision se prend ailleurs.",
    "openToDecide": "Ouvrir pour décider"
  }
```

English:

```json
  "overviewList": {
    "title": "Requests",
    "empty": "No request here.",
    "emptyHint": "Change the filters to see others."
  },
  "overviewView": {
    "decideElsewhere": "This request is waiting for your decision. Overview is read-only: the decision is taken elsewhere.",
    "openToDecide": "Open to decide"
  }
```

- [ ] **Step 2: Write the failing tests**

`frontend/src/features/requests/overview/OverviewRequestsPage.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makeRequest, paginated, TYPES } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { chooseOption } from "@/test/formActions";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import OverviewRequestsPage from "./OverviewRequestsPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));
vi.mock("@/features/employees/EmployeePicker", async () => (await import("@/test/employeePickerMock")).employeePickerMock);

const me = makeMe({ roles: ["employee", "exec"], workspaces: ["me", "overview"] });
const asObserver = { relation: "overview" as const, actions: [], step_id: null };

const leave = makeRequest({ viewer: asObserver });
const sentBack = makeRequest({
  public_id: "req-3",
  employee: { public_id: "emp-3", name: "Nour Chaabane" },
  status: "returned",
  state: { key: "returned", waiting_on: [], last_actor: "Sami Ben Ali", note: "Trop long" },
  viewer: asObserver,
});
const sick = makeRequest({
  public_id: "req-5",
  employee: { public_id: "emp-5", name: "Karim Mansour", department: "Sinistres" },
  type: { code: "sick", name: "Congé maladie" },
  start_date: "2026-11-02",
  end_date: "2026-11-03",
  quantity: "2.00",
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  comment: null,
  comment_hidden: true,
  certificate: null,
  viewer: asObserver,
});

function serve() {
  const searches: URLSearchParams[] = [];
  server.use(
    http.get("/api/v1/requests", ({ request }) => {
      searches.push(new URL(request.url).searchParams);
      return HttpResponse.json(paginated([leave, sentBack, sick]));
    }),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    http.get("/api/v1/departments", () => HttpResponse.json([{ id: 4, name: "Sinistres" }])),
  );
  return searches;
}

const open = () => renderApp(<OverviewRequestsPage />, { route: "/overview/requests", path: "/overview/requests", me });

describe("Overview, Requests (UI 8.3)", () => {
  it("lists every request with who, department, type, dates, length and where it stands", async () => {
    const searches = serve();
    open();
    expect(await screen.findByText("Amal Trabelsi")).toBeInTheDocument();
    expect(screen.getByText("En attente de Sami Ben Ali")).toBeInTheDocument();
    expect(screen.getByText("Renvoyée à Nour Chaabane")).toBeInTheDocument();
    expect(screen.getByText("Karim Mansour")).toBeInTheDocument();
    expect(screen.getByText("R(2026-11-02..2026-11-03)")).toBeInTheDocument();
    expect(searches[0].get("scope")).toBe("all");
  });

  it("shows the dates and the status of a sick leave, never a word about its certificate", async () => {
    serve();
    open();
    expect(await screen.findByText("En attente des RH")).toBeInTheDocument();
    expect(screen.queryByText(/Certificat/)).not.toBeInTheDocument();
  });

  it("contains no action at all: nothing to create, nothing on a row but opening it", async () => {
    serve();
    open();
    await screen.findByText("Amal Trabelsi");
    expect(screen.queryByRole("link", { name: /Nouvelle demande/ })).not.toBeInTheDocument();
    const buttons = screen.getAllByRole("button").map((button) => button.textContent);
    expect(buttons).toEqual(["Plus de filtres", "Amal Trabelsi", "Nour Chaabane", "Karim Mansour"]);
  });

  it("filters like the HR list, with the same filters one step away", async () => {
    const searches = serve();
    open();
    await screen.findByText("Amal Trabelsi");
    await chooseOption("Situation", "En attente");
    await userEvent.click(screen.getByRole("button", { name: "Plus de filtres" }));
    await chooseOption("Avec une exception", "Oui");
    await waitFor(() => {
      expect(searches.at(-1)?.get("status")).toBe("pending");
      expect(searches.at(-1)?.get("has_override")).toBe("1");
    });
  });

  it("opens a request inside Overview", async () => {
    serve();
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Karim Mansour" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/overview/requests/req-5");
  });
});
```

`frontend/src/features/requests/views/RequestOverviewView.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceId } from "@/app/workspaces";
import { makeRequestDetail, makeStep, type DetailOverrides } from "@/features/requests/fixtures";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import RequestPage from "../RequestPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

const asObserver = { relation: "overview" as const, actions: [], step_id: null };

const leave: DetailOverrides = {
  comment: "Voyage en famille",
  viewer: asObserver,
  decision_context: {
    balance: { now: "12.50", after: "9.50" },
    teammates_away: [{ name: "Karim Mansour", label: "absent", start_date: "2026-11-10", end_date: "2026-11-12" }],
    cap: null,
  },
  attachments: [
    { public_id: "att-1", kind: "proof", name: "faire-part.pdf", size: 1024, uploaded_by: "Amal Trabelsi", uploaded_at: "2026-10-28T10:00:00+01:00" },
  ],
};

/** A sick leave as the API gives it to anyone but the requester and HR. */
const sick: DetailOverrides = {
  type: { code: "sick", name: "Congé maladie" },
  state: { key: "waiting_hr", waiting_on: [], last_actor: null },
  comment: null,
  comment_hidden: true,
  certificate: null,
  attachments: [],
  steps: [
    makeStep({ mode: "notify", status: "notified" }),
    makeStep({ id: 8, position: 2, rule: "hr_role", status: "pending", approvers: ["Leila Gharbi"] }),
  ],
  viewer: asObserver,
  decision_context: { balance: null, teammates_away: [], cap: null },
};

function serve(detail: DetailOverrides) {
  server.use(
    http.get("/api/v1/requests/req-1", () => HttpResponse.json(makeRequestDetail(detail))),
    http.get("/api/v1/requests/req-1/history", () => HttpResponse.json([])),
  );
}

function open(workspaces: WorkspaceId[] = ["me", "overview"]) {
  renderApp(<RequestPage />, {
    route: "/overview/requests/req-1",
    path: "/overview/requests/:id",
    me: makeMe({ roles: ["employee", "exec"], workspaces }),
  });
}

const summary = async () => within(await screen.findByRole("region", { name: "Résumé de la demande" }));

describe("Request, overview view (UI 8.3, 10.2)", () => {
  it("shows who, the dates, the status, the comment and what an approver would see", async () => {
    serve(leave);
    open();
    const region = await summary();
    expect(region.getByText("Amal Trabelsi")).toBeInTheDocument();
    expect(region.getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(region.getByText("3 j")).toBeInTheDocument();
    expect(region.getByText("En attente de Sami Ben Ali")).toBeInTheDocument();
    expect(region.getByText("Voyage en famille")).toBeInTheDocument();
    expect(region.getByText("Solde : 12.5 j aujourd'hui, 9.5 j après")).toBeInTheDocument();
    expect(
      region.getByText("Déjà absents ou en télétravail ces jours-là : Karim Mansour (absent, R(2026-11-10..2026-11-12))"),
    ).toBeInTheDocument();
  });

  it("contains no action", async () => {
    serve(leave);
    open();
    const region = await summary();
    expect(region.queryAllByRole("button")).toHaveLength(0);
    expect(region.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Autres actions RH" })).not.toBeInTheDocument();
  });

  it("never shows the comment or the certificate", async () => {
    serve(sick);
    open();
    const region = await summary();
    expect(screen.getByRole("heading", { name: "Congé maladie" })).toBeInTheDocument();
    expect(region.getByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(region.getByText("En attente des RH")).toBeInTheDocument();
    expect(region.queryByText("Commentaire")).not.toBeInTheDocument();
    expect(screen.queryByText(/Certificat/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Document/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fichiers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Commentaire et fichiers" })).not.toBeInTheDocument();
    expect(region.queryAllByRole("button")).toHaveLength(0);
    // The steps are there, and say nothing either.
    await userEvent.click(screen.getByRole("button", { name: "Étapes" }));
    expect(await screen.findByText("Pour information")).toBeInTheDocument();
    expect(screen.queryByText(/«/)).not.toBeInTheDocument();
  });

  it("keeps the steps, the history and the non-medical files one step away", async () => {
    serve(leave);
    open();
    await summary();
    await userEvent.click(screen.getByRole("button", { name: "Étapes" }));
    expect(await screen.findByText("Responsable : Sami Ben Ali")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fichiers" }));
    expect(await screen.findByRole("link", { name: "faire-part.pdf" })).toHaveAttribute(
      "href",
      "/api/v1/attachments/att-1/download",
    );
    expect(screen.getByRole("button", { name: "Historique complet" })).toBeInTheDocument();
  });

  it("stays read-only for someone who could decide, and says where the decision is taken", async () => {
    serve({ ...leave, viewer: { relation: "approver", actions: ["decide"], step_id: 7 } });
    open(["me", "team", "overview"]);
    const region = await summary();
    expect(region.queryByRole("button", { name: "Approuver" })).not.toBeInTheDocument();
    expect(region.queryAllByRole("button")).toHaveLength(0);
    expect(
      region.getByText("Cette demande attend votre décision. La vue d'ensemble est en lecture seule : la décision se prend ailleurs."),
    ).toBeInTheDocument();
    expect(region.getByRole("link", { name: "Ouvrir pour décider" })).toHaveAttribute("href", "/team/requests/req-1");
  });

  it("sends an approver without a team to My space to decide", async () => {
    serve({ ...leave, viewer: { relation: "approver", actions: ["decide"], step_id: 7 } });
    open(["me", "overview"]);
    const region = await summary();
    expect(region.getByRole("link", { name: "Ouvrir pour décider" })).toHaveAttribute("href", "/me/requests/req-1");
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/overview src/features/requests/views/RequestOverviewView.test.tsx`

Expected: FAIL. The list file fails with "Failed to resolve import "./OverviewRequestsPage"". The view file fails on what only the view provides: the comment and the balance in the summary, the "Fichiers" block, and the sentence for a viewer who could decide. (With no view registered for `overview`, the page falls back to the bare read-only view.)

- [ ] **Step 4: Write the list and the view, and register them**

`frontend/src/features/requests/overview/OverviewRequestsPage.tsx`:

```tsx
import { EmptyState, PageHeader } from "@/components";
import { RequestsList } from "../lists/RequestsList";
import { useRequestsText } from "../platform";

/** /overview/requests (UI 8.3): every request, as HR lists them, with no action at all. */
export default function OverviewRequestsPage() {
  const { t } = useRequestsText();
  return (
    <>
      <PageHeader title={t("overviewList.title")} />
      <RequestsList
        label={t("overviewList.title")}
        scope="all"
        columns={["who", "department", "type", "when", "quantity", "status"]}
        filters={["employee", "status", "period"]}
        moreFilters={["department", "type", "on_behalf", "has_override"]}
        empty={<EmptyState title={t("overviewList.empty")} hint={t("overviewList.emptyHint")} />}
      />
    </>
  );
}
```

`frontend/src/features/requests/views/RequestOverviewView.tsx`:

```tsx
import { Link } from "react-router";
import { backToList } from "@/components";
import { DecisionContextView } from "../decisions/DecisionContext";
import { useRequestsText, useViewer, workspaceFor } from "../platform";
import { RequestView } from "../RequestView";
import type { RequestDetail } from "../types";

/**
 * A request seen from Overview (UI 8.3): everything an executive may read, and no action.
 * `RequestPage` shows this view for every request opened under /overview, whatever the viewer
 * could do with it elsewhere; one who can decide is told where.
 */
export default function RequestOverviewView({ request }: { request: RequestDetail }) {
  const { t } = useRequestsText();
  const viewer = useViewer();
  const decides = request.viewer.actions.includes("decide");
  const elsewhere = workspaceFor("approver", viewer.workspaces);

  return (
    <RequestView
      request={request}
      back={backToList("/overview/requests")}
      commentFirst
      context={
        <>
          <DecisionContextView context={request.decision_context} unit={request.type.unit} detailed />
          {decides && (
            <p className="mt-3 text-body text-text-secondary">
              {t("overviewView.decideElsewhere")}{" "}
              <Link
                to={`/${elsewhere}/requests/${request.public_id}`}
                className="font-medium text-primary underline underline-offset-2"
              >
                {t("overviewView.openToDecide")}
              </Link>
            </p>
          )}
        </>
      }
    />
  );
}
```

In `frontend/src/features/requests/views/registry.ts`, add the import and one line to `VIEWS`:

```ts
import RequestOverviewView from "./RequestOverviewView";
```

```ts
  overview: RequestOverviewView,
```

In `frontend/src/workspaces/overview/routes.tsx`, add the imports and append two elements to the `overviewRoutes` array:

```tsx
import OverviewRequestsPage from "@/features/requests/overview/OverviewRequestsPage";
import RequestPage from "@/features/requests/RequestPage";
```

```tsx
  { path: "requests", element: <OverviewRequestsPage /> },
  { path: "requests/:id", element: <RequestPage /> },
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/overview src/features/requests/views src/features/requests/RequestPage.test.tsx src/i18n/parity.test.ts`

Expected: PASS (5 tests for the list, 6 for the overview view; the three other views still pass).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/requests frontend/src/workspaces/overview/routes.tsx frontend/src/i18n/locales
git commit -m "feat(requests): Overview's read-only list and view of every request"
```

---

### Task 19: Requests on the employee record and in the People list, and the delegation offer

Three places outside this feature's own pages where a request must show: the "Requests" block of the employee record (UI 7.9, and "their requests" of UI 6.3), the "requests waiting" attribute of My team, People (UI 6.3), and the offer made to a manager whose own leave is approved (UI 6.6, "Prompt"; REQ-12). The first two go through plan 02's extension points.

**Files:**
- Create: `frontend/src/features/requests/EmployeeRequestsBlock.tsx`
- Create: `frontend/src/features/requests/WaitingCount.tsx`
- Create: `frontend/src/features/requests/DelegationOffer.tsx`
- Modify: `frontend/src/features/employees/recordBlocks.tsx` (append one block)
- Modify: `frontend/src/features/employees/peopleColumns.tsx` (append one column)
- Modify: `frontend/src/features/requests/views/RequestMineView.tsx` (the `context` of the view)
- Modify: `frontend/src/i18n/locales/fr/requests.json`, `frontend/src/i18n/locales/en/requests.json` (sections `recordBlock`, `people`, `delegationOffer`)
- Test: `frontend/src/features/requests/EmployeeRequestsBlock.test.tsx`
- Test: `frontend/src/features/requests/WaitingCount.test.tsx`
- Test: `frontend/src/features/requests/DelegationOffer.test.tsx`

**Interfaces:**
- Consumes: `RequestsList` (Task 7), `useRequestList` (Task 1), `useViewer` (Task 1), `RequestMineView` (Task 8); `RECORD_BLOCKS`, `RecordMode` from `@/features/employees/recordBlocks` and `PEOPLE_COLUMNS` from `@/features/employees/peopleColumns` (plan 02); plan 02's `/team/delegations?from=&to=`, which opens the delegation sheet with those dates; `todayISO` from `@/lib/dates`.
- Produces:
  - `EmployeeRequestsBlock({ employeeId, mode })`, registered in `RECORD_BLOCKS` as `requests` (order 40) for the modes `hr`, `team` and `overview`. In `hr` mode it offers "New request for this employee", which leads to `/hr/requests/new?employee=<id>` (Task 15).
  - `WaitingCount({ employeeId, name })`, registered in `PEOPLE_COLUMNS` as `waiting` (order 50).
  - `DelegationOffer({ request })`, shown by the owner's view of a request.

| Where | What is asked of the API | Opens |
|---|---|---|
| Record, HR desk and Overview | `GET requests?scope=all&employee=<id>` | the request in the same workspace |
| Record, My team | `GET requests?scope=team&employee=<id>` | `/team/requests/:id` |
| People list, per person | `GET requests?scope=team&employee=<id>&status=pending&page_size=1`, for its `count` | `/team/requests?employee=<id>&status=pending` |

The offer is made when the viewer has the My team workspace, the request is approved, its type shows as "absent" on colleagues' calendars, and it has not ended. It links to plan 02's page with the dates of the leave, from today when the leave has begun.

- [ ] **Step 1: Add the texts to both translation files**

French:

```json
  "recordBlock": {
    "title": "Demandes",
    "new": "Nouvelle demande pour cet employé",
    "empty": "Aucune demande."
  },
  "people": {
    "waiting": "Demandes en attente",
    "none": "Aucune",
    "waitingFor": "Demandes en attente de {{name}} : {{n}}"
  },
  "delegationOffer": {
    "text": "Pendant cette absence, les demandes de votre équipe peuvent être décidées par un délégué.",
    "action": "Nommer un délégué pour ces dates"
  }
```

English:

```json
  "recordBlock": {
    "title": "Requests",
    "new": "New request for this employee",
    "empty": "No request."
  },
  "people": {
    "waiting": "Requests waiting",
    "none": "None",
    "waitingFor": "Requests waiting for {{name}}: {{n}}"
  },
  "delegationOffer": {
    "text": "During this absence, a delegate can decide your team's requests.",
    "action": "Name a delegate for these dates"
  }
```

- [ ] **Step 2: Write the failing tests**

`frontend/src/features/requests/EmployeeRequestsBlock.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { RECORD_BLOCKS, type RecordMode } from "@/features/employees/recordBlocks";
import { makeRequest, paginated, TYPES } from "@/features/requests/fixtures";
import i18n from "@/i18n";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { EmployeeRequestsBlock } from "./EmployeeRequestsBlock";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

const RECORDS: Record<RecordMode, string> = {
  hr: "/hr/employees/emp-1",
  team: "/team/people/emp-1",
  overview: "/overview/people/emp-1",
};

function serve() {
  const searches: URLSearchParams[] = [];
  server.use(
    http.get("/api/v1/requests", ({ request }) => {
      searches.push(new URL(request.url).searchParams);
      return HttpResponse.json(paginated([makeRequest({ viewer: { relation: "hr", actions: [], step_id: null } })]));
    }),
    http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
  );
  return searches;
}

function open(mode: RecordMode) {
  const route = RECORDS[mode];
  return renderApp(<EmployeeRequestsBlock employeeId="emp-1" mode={mode} />, {
    route,
    path: route.replace("emp-1", ":id"),
    me: makeMe({ roles: ["employee", "manager", "hr", "exec"], workspaces: ["me", "team", "hr", "overview"] }),
  });
}

describe("the Requests block of the employee record (UI 7.9, 6.3)", () => {
  it("is registered between the documents and the balance, for the three kinds of record", () => {
    const block = RECORD_BLOCKS.find((item) => item.id === "requests");
    expect(block).toMatchObject({ order: 40, modes: ["hr", "team", "overview"], titleKey: "requests:recordBlock.title" });
    expect(i18n.t("requests:recordBlock.title", { lng: "fr" })).toBe("Demandes");
    expect(i18n.t("requests:recordBlock.title", { lng: "en" })).toBe("Requests");
  });

  it("on the HR desk: lists the employee's requests and offers a new one for them", async () => {
    const searches = serve();
    open("hr");
    expect(await screen.findByText("R(2026-11-09..2026-11-11)")).toBeInTheDocument();
    expect(searches[0].get("scope")).toBe("all");
    expect(searches[0].get("employee")).toBe("emp-1");
    expect(screen.getByRole("link", { name: "Nouvelle demande pour cet employé" })).toHaveAttribute(
      "href",
      "/hr/requests/new?employee=emp-1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Congé annuel" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/hr/requests/req-1");
  });

  it("in My team: lists what the manager may see of the person, with nothing to create", async () => {
    const searches = serve();
    open("team");
    await screen.findByText("R(2026-11-09..2026-11-11)");
    expect(searches[0].get("scope")).toBe("team");
    expect(searches[0].get("employee")).toBe("emp-1");
    expect(screen.queryByRole("link", { name: "Nouvelle demande pour cet employé" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Congé annuel" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/team/requests/req-1");
  });

  it("in Overview: lists the requests, read-only", async () => {
    const searches = serve();
    open("overview");
    await screen.findByText("R(2026-11-09..2026-11-11)");
    expect(searches[0].get("scope")).toBe("all");
    expect(screen.queryByRole("link", { name: "Nouvelle demande pour cet employé" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Congé annuel" }));
    expect(screen.getByTestId("elsewhere")).toHaveTextContent("/overview/requests/req-1");
  });

  it("says when the person has no request", async () => {
    server.use(
      http.get("/api/v1/requests", () => HttpResponse.json(paginated([]))),
      http.get("/api/v1/request-types", () => HttpResponse.json(Object.values(TYPES))),
    );
    open("hr");
    expect(await screen.findByText("Aucune demande.")).toBeInTheDocument();
  });
});
```

`frontend/src/features/requests/WaitingCount.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { PEOPLE_COLUMNS } from "@/features/employees/peopleColumns";
import { makeRequest, paginated } from "@/features/requests/fixtures";
import i18n from "@/i18n";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { WaitingCount } from "./WaitingCount";

const me = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });
const open = () => renderApp(<WaitingCount employeeId="emp-1" name="Amal Employee" />, { route: "/team/people", path: "/team/people", me });

describe("requests waiting, in My team, People (UI 6.3)", () => {
  it("is the column registered last, after the balance", () => {
    const column = PEOPLE_COLUMNS.find((item) => item.id === "waiting");
    expect(column).toMatchObject({ order: 50, headerKey: "requests:people.waiting" });
    expect(i18n.t("requests:people.waiting", { lng: "fr" })).toBe("Demandes en attente");
    expect(i18n.t("requests:people.waiting", { lng: "en" })).toBe("Requests waiting");
  });

  it("gives the number of the person's pending requests, as a link to them", async () => {
    let search = new URLSearchParams();
    server.use(
      http.get("/api/v1/requests", ({ request }) => {
        search = new URL(request.url).searchParams;
        return HttpResponse.json(paginated([makeRequest()], 2));
      }),
    );
    open();
    const link = await screen.findByRole("link", { name: "Demandes en attente de Amal Employee : 2" });
    expect(link).toHaveTextContent("2");
    expect(link).toHaveAttribute("href", "/team/requests?employee=emp-1&status=pending");
    expect(Object.fromEntries(search)).toEqual({ scope: "team", employee: "emp-1", status: "pending", page_size: "1" });
  });

  it("says so when nothing waits, without a link", async () => {
    server.use(http.get("/api/v1/requests", () => HttpResponse.json(paginated([]))));
    open();
    expect(await screen.findByText("Aucune")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
```

`frontend/src/features/requests/DelegationOffer.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makeRequest, makeRequestDetail, type RequestOverrides } from "@/features/requests/fixtures";
import { todayISO } from "@/lib/dates";
import { makeMe } from "@/test/fixtures";
import { renderApp } from "@/test/render";
import { server } from "@/test/server";
import { DelegationOffer } from "./DelegationOffer";
import RequestPage from "./RequestPage";

vi.mock("@/lib/format", async (importOriginal) => (await import("@/test/formatMock")).mockedFormat(importOriginal));

/** A day counted from today, as the API writes dates. */
function day(offset: number): string {
  const date = new Date(`${todayISO()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

const manager = makeMe({ roles: ["employee", "manager"], workspaces: ["me", "team"] });
const employee = makeMe({ roles: ["employee"], workspaces: ["me"] });

const approved: RequestOverrides = {
  status: "approved",
  state: { key: "approved", waiting_on: [] },
  start_date: day(5),
  end_date: day(7),
  viewer: { actions: ["amend"] },
};

const show = (overrides: RequestOverrides = {}, me = manager) =>
  renderApp(<DelegationOffer request={makeRequest({ ...approved, ...overrides })} />, { route: "/me", path: "/me", me });
const offer = () => screen.queryByRole("link", { name: "Nommer un délégué pour ces dates" });

describe("the delegation offer (UI 6.6)", () => {
  it("offers a manager whose leave is approved to name a delegate for those dates", () => {
    show();
    expect(offer()).toHaveAttribute("href", `/team/delegations?from=${day(5)}&to=${day(7)}`);
    expect(
      screen.getByText("Pendant cette absence, les demandes de votre équipe peuvent être décidées par un délégué."),
    ).toBeInTheDocument();
  });

  it("starts the delegation today when the leave has begun", () => {
    show({ start_date: day(-1), end_date: day(2) });
    expect(offer()).toHaveAttribute("href", `/team/delegations?from=${todayISO()}&to=${day(2)}`);
  });

  it("offers nothing to someone who has no team", () => {
    show({}, employee);
    expect(offer()).not.toBeInTheDocument();
  });

  const NOT_OFFERED: [string, RequestOverrides][] = [
    ["the leave is not approved yet", { status: "pending", state: { key: "waiting_hr", waiting_on: [] } }],
    ["the request is remote work", { type: { code: "remote", name: "Télétravail", calendar_label: "remote" } }],
    ["the leave is over", { start_date: day(-9), end_date: day(-7) }],
  ];

  it.each(NOT_OFFERED)("offers nothing when %s", (_name, overrides) => {
    show(overrides);
    expect(offer()).not.toBeInTheDocument();
  });

  it("appears on the manager's own request, in its summary", async () => {
    server.use(
      http.get("/api/v1/requests/req-1", () => HttpResponse.json(makeRequestDetail(approved))),
      http.get("/api/v1/requests/req-1/history", () => HttpResponse.json([])),
    );
    renderApp(<RequestPage />, { route: "/me/requests/req-1", path: "/me/requests/:id", me: manager });
    const summary = await screen.findByRole("region", { name: "Résumé de la demande" });
    expect(within(summary).getByRole("link", { name: "Nommer un délégué pour ces dates" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `docker compose run --rm web npx vitest run src/features/requests/EmployeeRequestsBlock.test.tsx src/features/requests/WaitingCount.test.tsx src/features/requests/DelegationOffer.test.tsx`

Expected: FAIL with "Failed to resolve import "./EmployeeRequestsBlock"", "./WaitingCount" and "./DelegationOffer".

- [ ] **Step 4: Write the three components**

`frontend/src/features/requests/EmployeeRequestsBlock.tsx`:

```tsx
import { Link } from "react-router";
import { EmptyState } from "@/components";
import { Button } from "@/components/ui/button";
import type { RecordMode } from "@/features/employees/recordBlocks";
import { RequestsList } from "./lists/RequestsList";
import { useRequestsText } from "./platform";

interface EmployeeRequestsBlockProps {
  employeeId: string;
  mode: RecordMode;
}

/**
 * The requests of one person, inside their record. HR and executives see every request of the
 * person; a manager sees what `scope=team` gives. A request opens in the workspace of the record.
 */
export function EmployeeRequestsBlock({ employeeId, mode }: EmployeeRequestsBlockProps) {
  const { t } = useRequestsText();
  return (
    <div className="flex flex-col gap-3">
      {mode === "hr" && (
        <div>
          <Button asChild variant="secondary">
            <Link to={`/hr/requests/new?employee=${encodeURIComponent(employeeId)}`}>{t("recordBlock.new")}</Link>
          </Button>
        </div>
      )}
      <RequestsList
        label={t("recordBlock.title")}
        scope={mode === "team" ? "team" : "all"}
        columns={["type", "when", "quantity", "status"]}
        filters={["status", "type", "year"]}
        fixed={{ employee: employeeId }}
        empty={<EmptyState title={t("recordBlock.empty")} />}
      />
    </div>
  );
}
```

`frontend/src/features/requests/WaitingCount.tsx`:

```tsx
import { Link } from "react-router";
import { useRequestList } from "./api";
import { useRequestsText } from "./platform";

interface WaitingCountProps {
  employeeId: string;
  /** The person's name, for the accessible name of the link. */
  name: string;
}

/** How many requests of one person are waiting, for the People list of My team (UI 6.3). */
export function WaitingCount({ employeeId, name }: WaitingCountProps) {
  const { t } = useRequestsText();
  // One row is asked for: only the count is read.
  const waiting = useRequestList({ scope: "team", employee: employeeId, status: "pending", page_size: 1 });
  if (!waiting.isSuccess) return null;
  const count = waiting.data.count;
  if (count === 0) return <span className="text-muted-foreground">{t("people.none")}</span>;
  return (
    <Link
      to={`/team/requests?employee=${encodeURIComponent(employeeId)}&status=pending`}
      aria-label={t("people.waitingFor", { name, n: count })}
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      {count}
    </Link>
  );
}
```

`frontend/src/features/requests/DelegationOffer.tsx`:

```tsx
import { Link } from "react-router";
import { todayISO } from "@/lib/dates";
import { useRequestsText, useViewer } from "./platform";
import type { RequestOut } from "./types";

/**
 * The offer made to a manager whose own leave is approved (UI 6.6): name a delegate for those
 * dates. It leads to plan 02's delegations page, which opens its sheet with the dates filled in.
 */
export function DelegationOffer({ request }: { request: RequestOut }) {
  const { t } = useRequestsText();
  const viewer = useViewer();
  const today = todayISO();
  const offered =
    viewer.workspaces.includes("team") &&
    request.status === "approved" &&
    request.type.calendar_label === "absent" &&
    request.end_date >= today;
  if (!offered) return null;
  const from = request.start_date < today ? today : request.start_date;
  return (
    <p className="mt-3 rounded-md border border-[var(--info-border)] bg-info-bg px-3 py-2 text-body text-info">
      {t("delegationOffer.text")}{" "}
      <Link to={`/team/delegations?from=${from}&to=${request.end_date}`} className="font-medium underline underline-offset-2">
        {t("delegationOffer.action")}
      </Link>
    </p>
  );
}
```

- [ ] **Step 5: Register the block and the column, and show the offer on the owner's view**

At the end of `frontend/src/features/employees/recordBlocks.tsx`, add the import with the other imports and the registration as the last statement of the file:

```tsx
import { EmployeeRequestsBlock } from "@/features/requests/EmployeeRequestsBlock";
```

```tsx
RECORD_BLOCKS.push({
  id: "requests",
  titleKey: "requests:recordBlock.title",
  order: 40,
  modes: ["hr", "team", "overview"],
  render: (employee, mode) => <EmployeeRequestsBlock employeeId={employee.public_id} mode={mode} />,
});
```

At the end of `frontend/src/features/employees/peopleColumns.tsx`, the same way:

```tsx
import { WaitingCount } from "@/features/requests/WaitingCount";
```

```tsx
PEOPLE_COLUMNS.push({
  id: "waiting",
  headerKey: "requests:people.waiting",
  order: 50,
  cell: (row) => <WaitingCount employeeId={row.public_id} name={row.name} />,
});
```

Each row of the People table now asks for its count, and the test server refuses a request nobody answers. Give the route a default answer, as plan 02 did for its own: append this element to the `handlers` array of `frontend/src/test/handlers.ts`:

```ts
  http.get("/api/v1/requests", () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
```

A test that needs particular requests still declares its own answer with `server.use`, which takes precedence.

In `frontend/src/features/requests/views/RequestMineView.tsx`, add the import:

```tsx
import { DelegationOffer } from "../DelegationOffer";
```

and add the offer as the last element of the fragment given as `context` to the `RequestView` element, which then reads:

```tsx
        context={
          <>
            <FormSummary problems={details(problems)} />
            {balance && (
              <p className="mt-3 text-body text-text-secondary">
                {t("mine.balance", { now: formatDays(balance.now, lang), after: formatDays(balance.after, lang) })}
              </p>
            )}
            <DelegationOffer request={request} />
          </>
        }
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `docker compose run --rm web npx vitest run src/features/requests/EmployeeRequestsBlock.test.tsx src/features/requests/WaitingCount.test.tsx src/features/requests/DelegationOffer.test.tsx src/features/requests/RequestPage.test.tsx src/features/employees src/i18n/parity.test.ts`

Expected: PASS (5, 3 and 7 tests; the owner's view still passes). In plan 02's tests of `src/features/employees`, the record of a person now also lists the closed block "Demandes" and the People table has a third header, "Demandes en attente". Where one of those tests compares the exact list of blocks or of column headers, add the new name to its expected list and change nothing else. The People table's rows are answered by the default added to `handlers.ts` in Step 5.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/requests frontend/src/features/employees frontend/src/test/handlers.ts frontend/src/i18n/locales
git commit -m "feat(requests): requests on the employee record and in the People list, and the delegation offer"
```

---

### Task 20: The browser journeys

Eight journeys of UI section 12 belong to this plan. They run against the development stack in the two projects of plan 01b (`desktop`, `phone`), which share one database and run one after the other. Every request a journey creates is on a day of a week no other journey uses, so the same person can go through all of them, twice, without two requests overlapping.

**Files:**
- Create: `frontend/e2e/requests.ts`
- Test: `frontend/e2e/ask-for-leave.spec.ts`, `frontend/e2e/decide-a-request.spec.ts`, `frontend/e2e/validate-a-request.spec.ts`, `frontend/e2e/report-sickness.spec.ts`, `frontend/e2e/handle-a-missing-certificate.spec.ts`, `frontend/e2e/change-approved-dates.spec.ts`, `frontend/e2e/go-on-leave-as-a-manager.spec.ts`, `frontend/e2e/unblock-a-stuck-request.spec.ts`

**Interfaces:**
- Consumes: `PASSWORD`, `signIn`, `signOut` of `e2e/helpers.ts` (plan 01b); `HR`, `MANAGER`, `OTHER_MANAGER`, `EMPLOYEE`, `landed` of `e2e/people.ts` (plan 02); the demo data of plans 02 and 03a after `e2e_reset`: Amal Employee and Bilel Employee report to Mounir Manager, Chokri Employee to Nadia Manager (department "Sinistres"); the five seeded types, each decided by the manager then HR, sick leave by HR alone; fixed-date public holidays for this year and the next; an approved annual leave of Mounir Manager about three weeks ahead; `apps.requests.services.send_reminders_and_flags(now=…)` (plan 03a).
- Produces: `e2e/requests.ts` with `OUTSIDER`, `PDF`, `tuesday(weeks)`, `ownWeek(testInfo, journey)`, `pastWeek(testInfo, journey)`, `frDate(day)`, `row(page, text, day)`, `toDecide(page, name, day)`, `become(page, from, to)`, `askFor(page, type, day)`, `approveAsManager(page, name, day)`, `validateAsHr(page, name, day)`, `letTenDaysPass()`.
- As in plans 01b and 02, these specs are written after the pages they exercise and are expected to pass at once. Step 3 shows that one can fail.

| Journey (UI 12) | Path played | Spec |
|---|---|---|
| Ask for leave | My space, Requests, New request, Send | `ask-for-leave` |
| Decide a request | My team (To decide), Approve, without opening | `decide-a-request` |
| Validate a request | HR desk, To validate, Approve | `validate-a-request` |
| Report sickness, add the certificate later | New request; later Requests, the request, Add the certificate | `report-sickness` |
| Handle a missing certificate | HR desk, Certificates, Count as annual leave | `handle-a-missing-certificate` |
| Change approved dates | Requests, the request, Change the dates | `change-approved-dates` |
| Go on leave as a manager | The request, the delegation offer, Confirm | `go-on-leave-as-a-manager` |
| Unblock a stuck request | HR desk, Stuck with a manager, Record the decision | `unblock-a-stuck-request` |

My space has no home page until plan 05: the journeys that the UI starts on "Home" start on Requests.

- [ ] **Step 1: Write the helpers**

`frontend/e2e/requests.ts`:

```ts
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { PASSWORD, signIn, signOut } from "./helpers";
import { landed } from "./people";

/** Chokri Employee reports to Nadia Manager, in the other department. */
export const OUTSIDER = { email: "employee.b1@impactrisks.com", name: "Chokri Employee" };

export const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

/** The demo public holidays (`apps/calendar/seed.py`), as month and day. */
const DEMO_HOLIDAYS = ["01-01", "03-20", "04-09", "05-01", "07-25", "08-13", "10-15", "12-17"];

const iso = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The Tuesday `weeks` weeks after the coming one (before it when negative), as the date inputs
 * take it. When that Tuesday is a demo holiday, the Wednesday: every journey needs a working day.
 */
export function tuesday(weeks: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + ((9 - date.getUTCDay()) % 7) + weeks * 7);
  if (DEMO_HOLIDAYS.includes(iso(date).slice(5))) date.setUTCDate(date.getUTCDate() + 1);
  return iso(date);
}

const second = (testInfo: TestInfo) => (testInfo.project.name === "phone" ? 1 : 0);

/** A future week of its own for a journey and a project, beyond the weeks the demo data uses. */
export function ownWeek(testInfo: TestInfo, journey: number): number {
  return 6 + 2 * journey + second(testInfo);
}

/** A past week of its own, for a sick leave: `tuesday(-1)` is always behind us. */
export function pastWeek(testInfo: TestInfo, journey: number): number {
  return -(1 + 2 * journey + second(testInfo));
}

/** A date as the pages write it in French (`formatDate` of `src/lib/format.ts`): "17 nov. 2026". */
export function frDate(day: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/** The row of a table, or its card on a phone, that carries this text and this day. */
export function row(page: Page, text: string, day: string): Locator {
  return page
    .getByRole("main")
    .locator("tbody tr, ul[aria-label] > li")
    .filter({ hasText: text })
    .filter({ hasText: frDate(day) });
}

/** The item of the To decide list about this person's request for this day. */
export function toDecide(page: Page, name: string, day: string): Locator {
  return page.getByRole("main").getByRole("article").filter({ hasText: name }).filter({ hasText: frDate(day) });
}

/** Leaves the current account, if any, and signs in as someone else, in French. */
export async function become(page: Page, from: { name: string } | null, to: { email: string }): Promise<void> {
  if (from) await signOut(page, from.name, "fr");
  await signIn(page, to.email, PASSWORD, "fr");
  await landed(page);
}

/** As the signed-in employee: asks for one day of a type from My space, and ends on the request sent. */
export async function askFor(page: Page, type: string, day: string): Promise<void> {
  await page.goto("/me/requests");
  await page.getByRole("link", { name: "Nouvelle demande", exact: true }).click();
  await page.getByRole("link", { name: new RegExp(`^${type}`) }).click();
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  // The server counted one working day: the day is neither a weekend nor a holiday.
  await expect(page.getByRole("complementary", { name: "Calculé pour vous" }).getByText("1 jour", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByText("Demande envoyée.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Résumé de la demande" })).toBeVisible();
}

async function confirmApproval(page: Page, name: string): Promise<void> {
  const sheet = page.getByRole("dialog", { name: "Approuver la demande" });
  await sheet.getByRole("button", { name: "Approuver", exact: true }).click();
  await expect(page.getByText(`Demande de ${name} approuvée.`)).toBeVisible();
}

/** As the signed-in manager: approves this person's request for this day from the To decide list. */
export async function approveAsManager(page: Page, name: string, day: string): Promise<void> {
  await page.goto("/team");
  const item = toDecide(page, name, day);
  await item.getByRole("button", { name: "Approuver", exact: true }).click();
  await confirmApproval(page, name);
  await expect(item).toHaveCount(0);
}

/** As signed-in HR: approves this person's request for this day from the To validate queue. */
export async function validateAsHr(page: Page, name: string, day: string): Promise<void> {
  await page.goto("/hr/validate");
  const line = row(page, name, day);
  await line.getByRole("button", { name: "Approuver", exact: true }).click();
  await confirmApproval(page, name);
  await expect(line).toHaveCount(0);
}

/**
 * Runs the reminders job as if ten days had passed: every manager's step left undecided is then
 * flagged to HR (REQ-13). It touches nothing else.
 */
export function letTenDaysPass(): void {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const code =
    "from datetime import timedelta; from django.utils import timezone; from apps.requests import services; " +
    "services.send_reminders_and_flags(now=timezone.now() + timedelta(days=10))";
  execFileSync("docker", ["compose", "exec", "-T", "app", "python", "manage.py", "shell", "-c", code], {
    cwd: root,
    stdio: "inherit",
  });
}
```

- [ ] **Step 2: Write the eight journeys**

`frontend/e2e/ask-for-leave.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { EMPLOYEE, MANAGER } from "./people";
import { become, ownWeek, row, tuesday } from "./requests";

test("an employee asks for a day of leave and sees who will decide", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 1));

  await become(page, null, EMPLOYEE);
  await page.goto("/me/requests");
  await page.getByRole("link", { name: "Nouvelle demande", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Quel type de demande ?", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /^Congé annuel/ }).click();

  // Two dates are asked; the count and the approvers are worked out and shown.
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  const computed = page.getByRole("complementary", { name: "Calculé pour vous" });
  await expect(computed.getByText("1 jour", { exact: true })).toBeVisible();
  await expect(computed.getByText(`Votre responsable, ${MANAGER.name}, puis les RH`)).toBeVisible();
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByText("Demande envoyée.")).toBeVisible();

  // The request says where it stands, what happens next, and what can still be done.
  const summary = page.getByRole("region", { name: "Résumé de la demande" });
  await expect(summary.getByText(`En attente de ${MANAGER.name}`)).toBeVisible();
  await expect(summary.getByText("Ensuite, les RH la valident.")).toBeVisible();
  await expect(summary.getByRole("link", { name: "Modifier", exact: true })).toBeVisible();
  await expect(summary.getByRole("button", { name: "Retirer la demande", exact: true })).toBeVisible();

  await page.goto("/me/requests");
  await expect(row(page, "Congé annuel", day)).toContainText(`En attente de ${MANAGER.name}`);
});
```

`frontend/e2e/decide-a-request.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { EMPLOYEE, MANAGER } from "./people";
import { askFor, become, ownWeek, row, toDecide, tuesday } from "./requests";

test("a manager approves a request from the To decide list, without opening it", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 2));

  await become(page, null, EMPLOYEE);
  await askFor(page, "Télétravail", day);

  // My team opens on what waits for the manager.
  await become(page, EMPLOYEE, MANAGER);
  await page.goto("/team");
  await expect(page.getByRole("heading", { level: 1, name: "À décider", exact: true })).toBeVisible();
  const item = toDecide(page, EMPLOYEE.name, day);
  await expect(item).toContainText("Télétravail");
  await expect(item).toContainText("1 jour");
  await item.getByRole("button", { name: "Approuver", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Approuver la demande" });
  await expect(sheet.getByText("Votre accord est enregistré et la demande passe à l'étape suivante.")).toBeVisible();
  await sheet.getByRole("button", { name: "Approuver", exact: true }).click();
  await expect(page.getByText(`Demande de ${EMPLOYEE.name} approuvée.`)).toBeVisible();
  await expect(item).toHaveCount(0);

  // It is now among what the manager decided, and waits for HR.
  await page.goto("/team/requests?view=decided");
  await expect(row(page, EMPLOYEE.name, day)).toContainText("en attente des RH");
});
```

`frontend/e2e/validate-a-request.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { EMPLOYEE, HR, MANAGER } from "./people";
import { approveAsManager, askFor, become, ownWeek, row, tuesday } from "./requests";

test("HR validates, from its desk, a request the manager approved", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 3));

  await become(page, null, EMPLOYEE);
  await askFor(page, "Télétravail", day);
  await become(page, EMPLOYEE, MANAGER);
  await approveAsManager(page, EMPLOYEE.name, day);

  // The desk says something waits, and leads to it.
  await become(page, MANAGER, HR);
  await page.goto("/hr");
  await expect(page.getByRole("heading", { level: 1, name: "Bureau RH", exact: true })).toBeVisible();
  const block = page.getByRole("region", { name: "À valider" });
  await expect(block.getByText(/En attente de validation : \d+/)).toBeVisible();
  await block.getByRole("link", { name: "Tout voir : À valider", exact: true }).click();
  await expect(page).toHaveURL(/\/hr\/validate$/);

  const line = row(page, EMPLOYEE.name, day);
  await expect(line).toContainText("Télétravail");
  await expect(line).toContainText("Aucun document requis");
  await line.getByRole("button", { name: "Approuver", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Approuver la demande" });
  await expect(sheet.getByText(/Votre validation est enregistrée\./)).toBeVisible();
  await sheet.getByRole("button", { name: "Approuver", exact: true }).click();
  await expect(page.getByText(`Demande de ${EMPLOYEE.name} approuvée.`)).toBeVisible();
  await expect(line).toHaveCount(0);

  // The employee finds the request approved.
  await become(page, HR, EMPLOYEE);
  await page.goto("/me/requests");
  await expect(row(page, "Télétravail", day)).toContainText("Approuvée");
});
```

`frontend/e2e/report-sickness.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { EMPLOYEE, MANAGER } from "./people";
import { become, pastWeek, PDF, row, tuesday } from "./requests";

test("an employee reports a sick day, adds the certificate later, and the manager sees neither comment nor certificate", async ({ page }, testInfo) => {
  const day = tuesday(pastWeek(testInfo, 0));

  await become(page, null, EMPLOYEE);
  await page.goto("/me/requests/new");
  await page.getByRole("link", { name: /^Congé maladie/ }).click();
  await page.getByLabel("Début", { exact: true }).fill(day);
  await page.getByLabel("Fin", { exact: true }).fill(day);
  await page.getByLabel("Commentaire (facultatif)", { exact: true }).fill("Forte fièvre");
  const computed = page.getByRole("complementary", { name: "Calculé pour vous" });
  await expect(computed.getByText("1 jour", { exact: true })).toBeVisible();
  await expect(computed.getByText("Votre commentaire et votre certificat ne sont vus que par les RH.")).toBeVisible();
  // The certificate can follow: the declaration is sent without it.
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByText("Demande envoyée.")).toBeVisible();
  const summary = page.getByRole("region", { name: "Résumé de la demande" });
  await expect(summary.getByText("En attente des RH")).toBeVisible();
  await expect(summary.getByText(/Certificat à fournir avant le/)).toBeVisible();

  // Later: the list says what is expected, and the request offers it first.
  await page.goto("/me/requests");
  const line = row(page, "Congé maladie", day);
  await expect(line).toContainText("Certificat à fournir avant le");
  await line.getByRole("button", { name: "Congé maladie", exact: true }).click();
  await summary.getByRole("button", { name: "Ajouter le certificat", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Ajouter le certificat" });
  await sheet.getByLabel("Certificat médical", { exact: true }).setInputFiles({
    name: "certificat.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await sheet.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText("Fichier ajouté.")).toBeVisible();
  await expect(summary.getByText(/Certificat à fournir/)).toHaveCount(0);
  await page.getByRole("button", { name: "Mon commentaire et mes fichiers", exact: true }).click();
  await expect(page.getByRole("link", { name: "certificat.pdf", exact: true })).toBeVisible();
  await expect(page.getByText("Forte fièvre")).toBeVisible();

  // The manager is informed of the absence, and of nothing medical.
  await become(page, EMPLOYEE, MANAGER);
  await page.goto("/team/requests");
  await row(page, EMPLOYEE.name, day).getByRole("button", { name: EMPLOYEE.name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Congé maladie", exact: true })).toBeVisible();
  await expect(
    page.getByText("Déclaration transmise pour information : vous n'avez aucune décision à prendre."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Approuver", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Étapes", exact: true }).click();
  await page.getByRole("button", { name: "Historique complet", exact: true }).click();
  await expect(page.getByText("Forte fièvre")).toHaveCount(0);
  await expect(page.getByText(/certificat/i)).toHaveCount(0);
});
```

`frontend/e2e/handle-a-missing-certificate.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { EMPLOYEE, HR } from "./people";
import { askFor, become, pastWeek, row, tuesday } from "./requests";

test("HR counts a sick day without certificate as annual leave", async ({ page }, testInfo) => {
  const day = tuesday(pastWeek(testInfo, 1));

  await become(page, null, EMPLOYEE);
  await askFor(page, "Congé maladie", day);

  await become(page, EMPLOYEE, HR);
  await page.goto("/hr");
  const block = page.getByRole("region", { name: "Certificats" });
  await expect(block.getByText(/En retard : \d+ · À fournir : \d+/)).toBeVisible();
  await block.getByRole("link", { name: "Tout voir : Certificats", exact: true }).click();
  await expect(page).toHaveURL(/\/hr\/certificates$/);

  const line = row(page, EMPLOYEE.name, day);
  await expect(line).toContainText("Dans les délais");
  await line.getByRole("button", { name: "Compter en congé annuel", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Compter l'arrêt en congé annuel" });
  await expect(
    sheet.getByText(`La demande devient un congé annuel, validé par les RH. Ces jours sont déduits du solde de ${EMPLOYEE.name}.`),
  ).toBeVisible();

  // When the balance does not cover the day, the sheet asks why an exception is granted.
  const confirm = sheet.getByRole("button", { name: "Compter en congé annuel", exact: true });
  const reason = sheet.getByLabel("Motif de l'exception", { exact: true });
  const done = page.getByText("Arrêt compté en congé annuel.");
  await confirm.click();
  await expect(done.or(reason)).toBeVisible();
  if (await reason.isVisible()) {
    await reason.fill("Certificat jamais fourni");
    await confirm.click();
  }
  await expect(done).toBeVisible();
  await expect(line).toHaveCount(0);

  // The same request is now an approved annual leave.
  await page.goto("/hr/requests");
  const request = row(page, EMPLOYEE.name, day);
  await expect(request).toContainText("Congé annuel");
  await expect(request).toContainText("Approuvée");
});
```

`frontend/e2e/change-approved-dates.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { EMPLOYEE, HR, MANAGER } from "./people";
import { approveAsManager, askFor, become, frDate, ownWeek, row, tuesday, validateAsHr } from "./requests";

test("an employee changes the date of an approved request; the original stays until the change is approved", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 6));
  const newDay = tuesday(ownWeek(testInfo, 6) + 20);

  // An approved day of remote work.
  await become(page, null, EMPLOYEE);
  await askFor(page, "Télétravail", day);
  await become(page, EMPLOYEE, MANAGER);
  await approveAsManager(page, EMPLOYEE.name, day);
  await become(page, MANAGER, HR);
  await validateAsHr(page, EMPLOYEE.name, day);

  // Requests, the request, Change the dates.
  await become(page, HR, EMPLOYEE);
  await page.goto("/me/requests");
  await row(page, "Télétravail", day).getByRole("button", { name: "Télétravail", exact: true }).click();
  const summary = page.getByRole("region", { name: "Résumé de la demande" });
  await summary.getByRole("link", { name: "Changer les dates", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Modifier une demande approuvée", exact: true })).toBeVisible();
  await expect(page.getByText("L'original reste valable tant que la modification n'est pas approuvée.")).toBeVisible();
  await page.getByLabel("Fin", { exact: true }).fill(newDay);
  await page.getByLabel("Début", { exact: true }).fill(newDay);
  await expect(page.getByText("Nouveau décompte")).toBeVisible();
  await page.getByLabel("Motif", { exact: true }).fill("Réunion déplacée");
  await page.getByRole("button", { name: "Envoyer la modification", exact: true }).click();
  await expect(page.getByText("Modification envoyée.")).toBeVisible();

  // Nothing has changed yet: the request is approved for its first date, and the change waits.
  await expect(summary.getByText("Approuvée", { exact: true })).toBeVisible();
  await expect(summary.getByText(`Votre modification attend ${MANAGER.name}`)).toBeVisible();
  await expect(summary.getByText(frDate(day))).toBeVisible();

  // The change follows the same steps.
  await become(page, EMPLOYEE, MANAGER);
  await approveAsManager(page, EMPLOYEE.name, day);
  await become(page, MANAGER, HR);
  await page.goto("/hr/validate");
  await expect(row(page, EMPLOYEE.name, day)).toContainText("Changement de dates");
  await validateAsHr(page, EMPLOYEE.name, day);

  // The request now carries the new date.
  await become(page, HR, EMPLOYEE);
  await page.goto("/me/requests");
  await expect(row(page, "Télétravail", newDay)).toContainText("Approuvée");
  await expect(row(page, "Télétravail", day)).toHaveCount(0);
});
```

`frontend/e2e/go-on-leave-as-a-manager.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { MANAGER, OTHER_MANAGER } from "./people";
import { become } from "./requests";

test("a manager whose leave is approved names a delegate for those dates", async ({ page }) => {
  // The demo data holds an approved annual leave of this manager, about three weeks ahead.
  await become(page, null, MANAGER);
  await page.goto("/me/requests?status=approved&type=annual");
  await page.getByRole("button", { name: "Congé annuel", exact: true }).first().click();
  const summary = page.getByRole("region", { name: "Résumé de la demande" });
  await expect(summary.getByText("Approuvée", { exact: true })).toBeVisible();

  // The offer leads to the delegation, with the dates of the leave already filled in.
  await summary.getByRole("link", { name: "Nommer un délégué pour ces dates", exact: true }).click();
  await expect(page).toHaveURL(/\/team\/delegations\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
  const dates = new URL(page.url()).searchParams;
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByLabel("Premier jour", { exact: true })).toHaveValue(dates.get("from") ?? "");
  await expect(sheet.getByLabel("Dernier jour", { exact: true })).toHaveValue(dates.get("to") ?? "");
  await sheet.getByLabel("Délégué", { exact: true }).selectOption({ label: `${OTHER_MANAGER.name} · Sinistres` });
  await sheet.getByRole("button", { name: "Nommer le délégué", exact: true }).click();
  await expect(page.getByText("Délégué nommé.")).toBeVisible();

  // Left as found, for the other project and for plan 02's own delegation journey.
  await page.getByRole("button", { name: "Annuler la délégation", exact: true }).click();
  await page.getByRole("button", { name: "Oui, annuler", exact: true }).click();
  await expect(page.getByText("Délégation terminée.")).toBeVisible();
});
```

`frontend/e2e/unblock-a-stuck-request.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { HR, OTHER_MANAGER } from "./people";
import { askFor, become, letTenDaysPass, OUTSIDER, ownWeek, row, tuesday } from "./requests";

test("HR records, for a request nobody decides, the decision its manager gave on paper", async ({ page }, testInfo) => {
  const day = tuesday(ownWeek(testInfo, 8));

  await become(page, null, OUTSIDER);
  await askFor(page, "Télétravail", day);
  // Nobody decides: after the delay set on the step, HR is alerted.
  letTenDaysPass();

  await become(page, OUTSIDER, HR);
  await page.goto("/hr");
  const block = page.getByRole("region", { name: "Bloquées chez un responsable" });
  await expect(block.getByText(/Sans décision : \d+/)).toBeVisible();
  await block.getByRole("link", { name: "Tout voir : Bloquées chez un responsable", exact: true }).click();
  await expect(page).toHaveURL(/\/hr\/stuck$/);

  const line = row(page, OUTSIDER.name, day);
  await expect(line).toContainText(OTHER_MANAGER.name);
  await line.getByRole("button", { name: "Saisir la décision", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Saisir une décision donnée hors de l'application" });
  // Who decided defaults to the manager the step waits for.
  await expect(sheet.getByLabel("Qui a décidé", { exact: true }).locator("option:checked")).toHaveText(
    `${OTHER_MANAGER.name} · Sinistres`,
  );
  await sheet.getByLabel("Comment", { exact: true }).selectOption({ label: "Sur papier" });

  // The note is mandatory.
  const record = sheet.getByRole("button", { name: "Enregistrer la décision", exact: true });
  await record.click();
  await expect(
    sheet.getByText("La note est obligatoire : dites dans quelles circonstances la décision a été donnée."),
  ).toBeVisible();
  await sheet.getByLabel("Note", { exact: true }).fill("Accord signé sur le formulaire papier");
  await record.click();
  await expect(page.getByText("Décision enregistrée.")).toBeVisible();
  await expect(line).toHaveCount(0);

  // The request moved on to HR, and its steps say how the decision was given and who entered it.
  await page.goto("/hr/validate");
  await row(page, OUTSIDER.name, day).getByRole("button", { name: OUTSIDER.name, exact: true }).click();
  await page.getByRole("button", { name: "Étapes", exact: true }).click();
  await expect(page.getByText(new RegExp(`Décision saisie par ${HR.name}, donnée sur papier\\.`))).toBeVisible();
});
```

- [ ] **Step 3: Run the journeys, and show that one can fail**

The stack must be running (`docker compose up -d`). **The run empties the development database** and loads the demo data again.

Run (from `frontend/`): `npx playwright test e2e/ask-for-leave.spec.ts e2e/decide-a-request.spec.ts e2e/validate-a-request.spec.ts e2e/report-sickness.spec.ts e2e/handle-a-missing-certificate.spec.ts e2e/change-approved-dates.spec.ts e2e/go-on-leave-as-a-manager.spec.ts e2e/unblock-a-stuck-request.spec.ts`

Expected: `16 passed` (eight journeys in two projects).

In `frontend/e2e/report-sickness.spec.ts`, change `"Forte fièvre"` in the last block (`await expect(page.getByText("Forte fièvre")).toHaveCount(0);`) to `"Congé maladie"` and run `npx playwright test e2e/report-sickness.spec.ts --project=desktop`.

Expected: `1 failed`: the page of the manager does show "Congé maladie", so a count of zero is refused. Put the line back and run the command again: `1 passed`.

If a journey fails on a date, read the failure before changing anything: `frDate` must write a day exactly as `formatDate` of `src/lib/format.ts` does, and `DEMO_HOLIDAYS` must list the days of `backend/apps/calendar/seed.py`.

- [ ] **Step 4: Check the whole step**

Run: `docker compose run --rm web npx vitest run`

Expected: every test file passes, those of plans 01b and 02 included.

Run: `docker compose run --rm web npm run typecheck` then `docker compose run --rm web npm run lint` then `docker compose run --rm web npm run build`

Expected: no error; the build ends with the list of its files.

Run (from `frontend/`): `npx playwright test`

Expected: every journey of plans 01b, 02 and 03b passes in both projects.

Open `http://localhost:5173` as `hr@impactrisks.com` and read the desk on a phone-sized window and on a wide one. Expected: four blocks, one primary action, no horizontal scrolling at 360px; the navigation shows "Bureau", "Demandes", "Employés" and "Configuration", and "Configuration" lists six subjects with "Types de demande" first.

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e
git commit -m "test(requests): browser journeys for asking, deciding, validating, sickness, changes, delegation and stuck requests"
```

---

## Spec coverage

Every item of this plan's scope, and the task that delivers it.

| UI document | Delivered by |
|---|---|
| 3.4 Mandatory reasons | Tasks 9 (change, cancel), 10 (refuse, send back), 13 (HR actions) |
| 3.4 Not allowed: "not available" | Task 1 (`Gate`), tested in Tasks 5, 6, 8, 15 |
| 3.4 Session end: nothing typed is lost | Tasks 4 (`useDraftKeeper`), 5 |
| 3.4 Concurrent action | Tasks 8, 10, 13 (409 says so and shows the current state) |
| 3.4 Sensitive content | Tasks 12 and 18 (views and lists), 16 (what HR alone sees), 20 (journey "report sickness") |
| 3.5 How a request's status reads | Task 2 |
| 5.2 Requests | Task 7 |
| 5.3 New request, both steps, and the same form for editing | Tasks 3, 4, 5, 6 |
| 5.4 Request (my view) | Task 8 |
| 5.5 Change or cancel an approved request | Task 9 |
| 6.1 To decide (the queue block; "Who is out" and "Delegation" are plan 05's) | Task 11 |
| 6.2 Request (manager view) and its decisions | Tasks 10, 12 |
| 6.3 People: requests waiting; a person's requests | Task 19 |
| 6.4 Requests (My team), with the "already decided" view | Task 12 |
| 6.6 Delegations: the prompt when the manager's own leave is approved | Task 19 |
| 7.1 Desk | Task 14 |
| 7.2 To validate, 7.3 Certificates, 7.4 Stuck with a manager | Task 14 |
| 7.6 Requests (HR desk) | Task 15 |
| 7.7 New request for an employee | Tasks 5 (the form's HR mode), 15 |
| 7.8 Request (HR view) and the other HR actions | Tasks 13, 16 |
| 7.9 Employee record: the Requests block | Task 19 |
| 7.12 Settings: request types, steps, events, public holidays, parameters | Task 17 |
| 8.3 Requests and the request (overview view) | Task 18 |
| 10.2 What each workspace sees of a request | Tasks 8 (own), 12 (My team), 16 (HR desk), 18 (Overview) |
| 11 `/requests/:id` opens in the workspace matching the viewer | Task 8 |
| 12 Eight journeys | Task 20 |

| Requirement | Delivered by |
|---|---|
| REQ-01 create, save as a draft, send; quantity computed by the server | Tasks 5, 7 |
| REQ-02 HR creates for an employee, with an exception and its reason | Tasks 5, 15 |
| REQ-03 each failure with its own message, on its field | Tasks 4, 5 |
| REQ-04 a change of configuration applies to requests sent afterwards (said on the pages) | Task 17 |
| REQ-05 approve, refuse with a reason, send back with a comment | Tasks 10, 11, 12, 14, 16 |
| REQ-06 a returned request is edited and sent again | Tasks 6, 8 |
| REQ-07 edit or withdraw until the first decision, withdraw after | Tasks 6, 7, 8 (driven by `viewer.actions`) |
| REQ-08 change or cancel through an amendment; the original stays in force | Tasks 9, 8 (withdraw the change), 10 to 16 (decide it) |
| REQ-09 HR corrects, shortens or cancels with a reason | Tasks 13, 16 |
| REQ-10 HR records a decision given outside the system | Tasks 13, 14, 16 |
| REQ-12 the prompt to name a delegate | Task 19 |
| REQ-13 (pages) a stuck step: record the decision or give it to someone else | Tasks 13, 14 |
| REQ-16 files: PDF, JPG, PNG up to 10 MB, by the requester or HR | Tasks 4, 5, 8, 14, 16 |
| REQ-17 full history | Task 8 |
| REQ-18 "already processed" | Tasks 8, 10, 13 |
| ADM-01 request types | Task 17 |
| ADM-02 steps of a type | Task 17 |
| ADM-03 exceptional-leave events | Task 17 |
| ADM-04 public holidays | Task 17 |
| ADM-05 HR parameters (working week, certificate deadline and warning) | Task 17 |
| NFR-05 no training needed; every message says what to do | Tasks 2, 4, 5 and the texts of every task |

Outside this plan, by the master's split: REQ-11 (plan 02), REQ-14 and REQ-15 (plan 03a), the balance pages (plan 04), the homes of My space and Overview, the blocks around the manager's queue and the calendars (plan 05), reports (plan 06).

## Contract notes

Choices made where the specs or the other plans are silent, and the places where this plan departs from a convention. Each matters to a later plan or to whoever integrates the set.

**Departures from plan 01b's conventions (its contract note 8)**

1. **Types are written by hand.** `features/requests/types.ts` restates master 7.8 and 7.9, and `types.contract.ts` fails the type check when the generated schema lacks a field this feature reads. The plan was written before the generated names existed, and the request shapes are large. The way back is mechanical: replace each interface by the type derived in `@/api/types`, then delete `types.contract.ts` and the three casts of `api.ts` (`shaped`, `compact`, `json`).
2. **`Gate` instead of throwing to the shell.** A query's loading, "not available" and "something went wrong" states are shown in place, with plan 01b's own pages. The same component serves a block inside a page (the desk, a sheet, the history) and a page rendered alone in a test.
3. **`serverProblems` and `byName` instead of `useProblemForm`.** The request API reports several problems by code without naming a field (`request.overlap`, `request.balance_insufficient`), so a table from code to input is needed; a 409 becomes plan 01b's sentence `common:concurrent`.
4. **`FieldError`.** Plan 01b's `SwitchField` has no error line. The half-day switches get theirs from `form/FieldError.tsx`; in the settings forms a problem the server reports on a switch goes to the summary above the form. If `SwitchField` learns to show its error, `FieldError` can go.
5. `useRequestsText()` calls `useTranslation("requests")`, as plan 02 does for its namespaces. Keys of other namespaces are written `namespace:key`.

**What later plans import from this one**

6. Default exports: `@/features/requests/RequestPage` (the path plan 04 assumes; it shows `decision_context.balance` in the manager's, HR's, Overview's and the owner's views), `@/features/requests/queues/ToDecidePage`, `@/features/home/HrDeskPage`, and the settings pages `@/features/requests/settings/RequestTypesPage`, `TypeStepsPage`, `EventsPage`, `HolidaysPage`, each taking `readOnly`. Named exports: `StatusSentence` (`@/features/requests/StatusSentence`), `ToDecideBlock` and `useToDecide` (`@/features/requests/queues/ToDecideBlock`), `DocumentStatus`, `DecisionContextView`, `RequestsList`, `TypeTag`, and the test data of `@/features/requests/fixtures`.
7. `AFFECTED_KEYS` in `features/requests/api.ts` lists the query keys refetched after every change to a request. Plans 04 and 05 push theirs (balances, home blocks, switcher counts) so those refresh without a reload.
8. `VIEWS` in `views/registry.ts` maps `viewer.relation` to a view. Under `/overview` the page always shows the overview's view, whatever the relation, and `workspaceFor` never sends an approver to Overview: a decision is taken in My team, the HR desk or My space.
9. `src/test/` gains `formActions.ts` (how the shared inputs are operated in a test), `formatMock.ts`, `requestServer.ts` and `employeePickerMock.tsx`. They are free for later plans to use.

**Changes to files of other plans, beyond their extension points**

10. Task 19 makes two of plan 02's tests see more: the record of a person lists one more block ("Demandes") and the People table one more column, each row of which asks `GET requests` for a count. Where plan 02's tests compare exact lists, or render the People table with rows, they need the added name and one more handler. The same will happen when plans 04 and 05 register theirs.
11. Task 17 appends five subjects to plan 02's settings index and three labels to plan 01b's `settings.json`. The other parameters of UI 7.12 (monthly credit, meal tickets, payroll cut-off day) appear on the same page when plans 04 and 06 register and label them.

**Behaviour chosen where the specs are silent**

12. **Undo.** Discarding a draft and withdrawing a request are announced at once and sent five seconds later, or at once when the page is left (`pagehide`). If the browser dies in those five seconds, nothing was sent: the request is still there.
13. **Unsent text.** What is typed in a request form is kept in the tab's session storage, per account and per form, never the file; it is removed when the request is saved and when another account signs in in the same tab. This is how "the session ends, nothing is lost" holds for a form that was never saved.
14. **Preview.** The form asks `requests/preview` 300 ms after the last change, with `request` when it edits, amends, corrects or reclassifies an existing request, and does not send while the last preview reports a problem. HR's correction asks with `override: true`; "count as annual leave" asks for the type `annual` (the seeded code) and looks only at `request.balance_insufficient`.
15. **Active types and events** are filtered on the page from the one cached list, not asked with `?active=1`: the same list serves the forms and the settings, and an event that was deactivated stays selectable on the request that already carries it.
16. **A comment** is offered for every type, exceptional leave and remote work included. The PRD lists it for three types and forbids it for none.
17. **HR's queues** are read in one call of a hundred rows, the oldest first, without pages; the page says so when more are waiting. The API filters a queue by type and department only, so the document-status filter of "To validate" is applied to the rows received. "Overdue by" is the time since `certificate.due_at`; that a certificate is overdue is always the server's statement.
18. **Who the manager is.** A queue item and a step carry approvers' names, not their ids. The default of "who decided" and "name a delegate for the manager" therefore read the requester's record (`GET employees/{id}`, which HR may open). A step that waits for a named person has no default, and no delegate is offered for it.
19. **When a decision was given** is typed as a local time and sent with the offset `+01:00`: Tunisia keeps the same offset all year.
20. **After an action**, the manager's view returns to the queue; HR's view stays on the request and shows its new state; a sheet closes. HR is not stopped on the page from entering a request for itself: the server refuses what it must (plan 03a, note 18) and the form shows the refusal.
21. **Settings.** The code and the unit of a type are asked when it is created and not sent again. The steps of a type are saved as a whole; a step that only informs is sent with the default reminder and no alert delay. The preview of a chain shows the saved steps. A holiday added, moved or removed lists the approved requests that cover the day and says their count does not change (master D22); nothing is recalculated.
22. **Read-only pages** (`readOnly`) contain no action. `RequestTypesPage` still opens a type, to read its attributes; `TypeStepsPage` shows the steps as sentences and offers no preview.
23. **The People list** asks for one count per person on the page (25 at most). An endpoint returning the counts together would be better; plan 04's note 17 says the same of the balance column.
24. **The delegation offer** is shown on the manager's approved request while it has not ended, for a type that shows as "absent". It relies on plan 02's page opening its sheet from `?from=&to=`, the address plan 03a's `delegation.prompt` notification also uses.

**Browser journeys**

25. The journeys start on Requests where the UI says Home, because My space has no home until plan 05. "Go on leave as a manager" uses the approved leave of the demo data and cancels its delegation at the end. "Unblock a stuck request" runs `services.send_reminders_and_flags` ten days ahead through `manage.py shell`; the steps it flags stay flagged for the rest of the run, which no other journey depends on.
26. `e2e/requests.ts` repeats two things it cannot read from the application: the demo holidays of `backend/apps/calendar/seed.py` (to choose working days) and the format of `formatDate` (to find a row by its date). Each is named in the file.

**For the project owner**

27. Three things the UI document describes are only partly reachable until later plans land: the certificate reminder on the home of My space ("Needs you", plan 05), the annual balance beside "requests waiting" in the People list (plan 04's note 17), and the remaining HR parameters (note 11). Nothing in this plan has to change when they arrive.

