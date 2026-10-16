# IRIS HR Platform: Product Requirements and Architecture

| | |
|---|---|
| Status | Draft for review |
| Date | 2026-10-05 |
| Owner | Aymen Mathlouthi |
| Sources | `docs/` (requirements register and scope statement, actor catalogue and RBAC matrix, use-case specifications, DBML schema and ERD, as-is and to-be process diagrams, strategy decks) and the decision rounds of 2026-10-05 |

Where this document and an earlier document in `docs/` disagree, this document wins. Section 18 lists what it supersedes.

Companion document: `2026-10-05-iris-hr-platform-ui-design.md` defines the interface principles, the workspace of each role, and every page with its content.

---

## 1. Summary

IRIS (Impact Risks & Insurance Solutions) is a Tunisian company of about 40 people in four departments under a CEO and Deputy CEO. Leave and absence are tracked today in one Excel file and on paper forms that HR carries to management for a decision.

This product replaces that with an internal web application in which employees submit requests, line managers and HR approve them in the system, balances are computed automatically, and HR exports the monthly absence figures for the payroll provider (KPMG Tunisia).

The first build covers employee records, a configurable request engine with five request types, leave balances, a department calendar, in-app notifications, reports, the KPMG export, administration and audit. It is built by one developer with AI assistance, runs in Docker on an Ubuntu server on IRIS premises, and is reachable from the office network only.

## 2. Goals, non-goals and success criteria

### Goals

1. Remove the Excel file and paper form from the leave process.
2. Make every decision traceable: who asked, who decided, when, and on what basis.
3. Compute leave balances automatically and show each employee their own.
4. Produce the monthly absence figures for KPMG from one export action.
5. Provide a platform that later HR modules can be added to without a rewrite.

### Non-goals

- Payroll calculation. KPMG calculates; this system only supplies absence figures.
- Access from outside the office network (first build).
- Email (first build).
- Importing historical data.
- Serving any company other than IRIS.

### Success criteria

- An employee can submit a leave request in under one minute without training.
- A request that is approved shows who approved each step and when, with no manual transcription by HR.
- The balance shown for any employee on any date can be explained entry by entry from the ledger.
- HR produces the monthly KPMG file with one filtered export.
- No role can read data outside its reach; this is proven by an automated permission test on every endpoint.

## 3. Users and roles

Roles add up: a person can hold several. Every account linked to an employee record has the Employee role. Manager is derived from the organisation chart and is never assigned by hand.

| Role | Who | How obtained |
|---|---|---|
| Employee | Every staff member | Automatic, from the linked employee record |
| Manager | Anyone who is the line manager of at least one active employee, or an active delegate of such a person | Derived |
| HR | The HR Responsible and any other holder IRIS names | Assigned by the System Administrator |
| Executive Management | CEO, Deputy CEO | Assigned by the System Administrator |
| System Administrator | The technical maintainer | Assigned at installation; further holders by an existing administrator |

Constraints:

- One account cannot hold both HR and System Administrator.
- A System Administrator account may exist without an employee record.
- Nobody acts on their own request, in any role.

## 4. Scope

### First build

| Module | Content |
|---|---|
| Accounts | Local accounts, sign-in, password policy, lock-out, administrator-issued temporary passwords, roles |
| Organisation | Departments, positions, employee records, employee documents, profile-change proposals |
| Requests | Configurable request types and approval chains, lifecycle, delegation, decisions recorded on behalf, amendments, attachments |
| Balances | Annual-leave ledger, month-end credit, projection, adjustments |
| Calendar | Public holidays, department absence calendar |
| Notifications | In-app notification list |
| Reports | Absence, balance and approval reports; KPMG export |
| Administration | HR settings, system settings |
| Audit | Business and security audit trail |

### Later builds, in order

1. HR document requests (employment and salary certificates) on the same request engine.
2. Onboarding and offboarding checklists.
3. Performance reviews.
4. Confidential employee-relations cases.

Deferred platform features, each addable without a rebuild: email delivery (and with it self-service password reset and approval links), off-site cloud backups, second-factor sign-in, access from outside the office.

### Excluded

- Training and development (dropped).
- Recruitment and candidate records (out of scope for now).
- Unpaid leave as a request type.
- Payroll calculation, compensation data, benefits.
- Interns (not in the employee population or the user base).

## 5. Functional requirements

### 5.1 Accounts and sign-in

| ID | Requirement |
|---|---|
| ACC-01 | The login identifier is the employee's professional email. Only addresses ending in `@impactrisks.com` are accepted, compared case-insensitively. |
| ACC-02 | Passwords have at least 12 characters, are rejected if found in a common-password list or if similar to the user's name or email, and are stored with Argon2. There is no forced periodic change. |
| ACC-03 | After 5 consecutive failed sign-ins an account is locked for 15 minutes. Sign-in attempts are also rate-limited per network address. Both numbers are settings. |
| ACC-04 | A session ends after 2 hours of inactivity (a setting) and when the browser closes. Disabling an account ends its sessions immediately. |
| ACC-05 | The System Administrator creates an account for an existing employee record. The system generates a temporary password, shows it once to the administrator, and it expires after 24 hours. The user must choose a new password at first sign-in. |
| ACC-06 | Password reset works the same way as ACC-05. The administrator never chooses or sees a permanent password. |
| ACC-07 | After sign-in the user sees the date and time of their previous sign-in and, if applicable, that their password was reset and by whom. |
| ACC-08 | A signed-in user can change their own password by supplying the current one. |
| ACC-09 | The System Administrator assigns and removes the HR, Executive Management and System Administrator roles. Every change is audited. |
| ACC-10 | Archiving an employee disables the linked account. |
| ACC-11 | Each user chooses French or English; the choice is stored on the account. |

### 5.2 Organisation and employee records

| ID | Requirement |
|---|---|
| ORG-01 | HR creates, edits and deactivates departments and positions. A department or position in use cannot be removed, only deactivated. |
| ORG-02 | HR creates and edits employee records with the fields in section 8.2. Employee number and professional email are unique. |
| ORG-03 | Each employee has at most one line manager, who is another employee. The system rejects a change that would create a loop in the reporting line. |
| ORG-04 | Employee records are never deleted. HR archives a leaver with a date and reason; archived records leave normal lists and remain searchable by HR. |
| ORG-05 | HR attaches documents to an employee record (for example a contract) and marks each as visible to the employee or not. |
| ORG-06 | An employee views their own record and proposes changes to personal fields: name, date of birth, gender, personal email, phone, address, emergency contact. Contractual fields cannot be proposed. |
| ORG-07 | HR accepts or rejects each proposal with an optional comment. On acceptance the record is updated. The employee is notified either way. |
| ORG-08 | Go-live data is entered manually by HR. There is no import. |

### 5.3 Request engine

#### Request types

Each type is a configuration row. HR can add, edit and deactivate types without a release.

| Type | Unit | Half-day | Balance effect | Document | Chain | Limit | Shown to peers as |
|---|---|---|---|---|---|---|---|
| Annual leave | Day | Yes | Deducts from annual balance | None | Manager approves, then HR approves | Refused if the projected balance would go below zero | Absent |
| Sick leave | Day | Yes | None | Medical certificate within 48 hours | Manager notified, then HR approves | None | Absent |
| Exceptional leave | Day | No | None; fixed days per event | Proof | Manager approves, then HR approves | Days allowed for the chosen event | Absent |
| Hourly permission | Hour | n/a | None; monthly totals reported | None | Manager approves, then HR approves | None | Not shown |
| Remote work | Day | Yes | None | None | Manager approves, then HR approves | 2 days per week (a setting) | Remote |

Half-day is an option on day-based types (morning or afternoon), not a type of its own.

| ID | Requirement |
|---|---|
| REQ-01 | An employee creates a request for themselves, saves it as a draft, and submits it. The quantity (days or hours) is always computed by the server. |
| REQ-02 | HR creates a request for any employee. Only HR can create a request that exceeds a limit (balance, cap, event days) or, other than sick leave, one dated in the past; a reason is mandatory. The request then follows its normal chain. |
| REQ-03 | On submission the system validates dates, overlap, notice period, limits and document rules (section 6). Each failure returns a specific, translated message. |
| REQ-04 | At submission the request's chain is copied from the type's configuration. Later changes to the configuration do not affect requests already submitted. |
| REQ-05 | At an approval step the approver approves, rejects (reason mandatory) or returns the request for correction (comment mandatory). |
| REQ-06 | A returned request goes back to the employee, who edits and resubmits it. The chain restarts at the first step. |
| REQ-07 | Until the first decision, the employee can edit or withdraw the request. After the first decision and before final approval the employee can withdraw but not edit. |
| REQ-08 | After final approval, the employee changes or cancels a request that has not yet started by submitting an amendment, which follows the same chain. The original stays in force, and the balance is unchanged, until the amendment is approved. One amendment can be open per request. |
| REQ-09 | HR can correct, shorten or cancel any request directly, including one that has started or ended, with a mandatory reason. The employee and manager are notified. |
| REQ-10 | HR records a decision on behalf of an approver who gave it outside the system. The record holds who decided, when, the channel (verbal or paper), a mandatory note, and optionally a scan of the signed form. |
| REQ-11 | A manager names a delegate for a date range. During that range both the manager and the delegate can act on the manager's steps and see what the manager sees. HR can create and end delegations for any manager. |
| REQ-12 | When a manager's own leave is approved, the system prompts them to name a delegate for that period. |
| REQ-13 | A step pending for 2 working days sends a reminder to its approver. A manager step pending for 4 working days is flagged to HR, who decides on the manager's behalf (REQ-10) or reassigns the step. Delays are settings per step. |
| REQ-14 | No request is ever approved automatically. |
| REQ-15 | The HR step is assigned to the HR role, not a named person: any HR holder other than the requester can act. |
| REQ-16 | Files are attached to a request by the requester or HR. Accepted formats are PDF, JPG and PNG up to 10 MB each. |
| REQ-17 | Every request shows its full history: creation, edits, each step with actor and time, amendments, HR corrections. |
| REQ-18 | Two approvers acting on the same step at the same moment cannot both succeed; the second receives "already processed". |

#### Lifecycle

```
            submit                all steps approved
  DRAFT ------------> PENDING ----------------------> APPROVED
    ^                  |  |  \                            |
    | edit, resubmit   |  |   \ a step rejects            | amendment (cancel) approved,
    |                  |  |    +---------> REJECTED       | or HR cancels
  RETURNED <-----------+  |                               v
   a step returns         | employee withdraws        CANCELLED
                          +---------------> WITHDRAWN
```

A draft that was never submitted can be discarded by its owner. HR's direct cancellation (REQ-09) moves a pending or an approved request to CANCELLED.

Step statuses: waiting, pending, approved, rejected, returned, notified, skipped.
Amendment statuses: pending, approved, rejected, withdrawn.

### 5.4 Balances

| ID | Requirement |
|---|---|
| BAL-01 | The annual-leave balance of an employee is the sum of their ledger entries. Entries are never edited or deleted; a correction is a new entry. |
| BAL-02 | Entry kinds: opening balance, month-end credit, leave taken, restoration, adjustment. |
| BAL-03 | On the last day of each month every active employee is credited 2.5 days (a setting). The credit is pro-rated in the month of joining and of leaving. It cannot be posted twice for the same employee and month, and months missed while the server was down are posted on the next run. |
| BAL-04 | Balances carry over indefinitely. There is no year-end reset, cap or expiry. |
| BAL-05 | HR adjusts a balance by posting a positive or negative entry with a mandatory reason. The employee is notified and sees the entry. |
| BAL-06 | HR enters each employee's opening balance at go-live as an opening entry. |
| BAL-07 | An employee sees their current balance, days in pending requests, days in approved future leave, and the full ledger. Managers see the same for their reports; HR and Executive Management for everyone. |

### 5.5 Calendar

| ID | Requirement |
|---|---|
| CAL-01 | HR maintains the list of public holidays (date, French name, English name). |
| CAL-02 | The calendar has month and week views and shows public holidays. |
| CAL-03 | An employee sees approved absences and remote days of people in their own department, labelled only "Absent" or "Remote". Hourly permissions are not shown. |
| CAL-04 | A manager sees their reports' requests with the type, including pending ones. |
| CAL-05 | HR and Executive Management see the whole company with the type. |
| CAL-06 | A pending request is visible only to the requester, their manager or delegate, HR and Executive Management. |

### 5.6 Notifications

| ID | Requirement |
|---|---|
| NOT-01 | Each user has an in-app notification list with an unread count, mark-as-read and mark-all-as-read. |
| NOT-02 | Events: step to decide; reminder; request decided; request returned; request withdrawn or cancelled (to approvers); amendment submitted or decided; step flagged to HR; sick leave declared (to manager); certificate due soon (to employee); certificate overdue (to HR); delegation started or ended; prompt to name a delegate; profile change proposed (to HR) or decided (to employee); balance adjusted; password reset by administrator. |
| NOT-03 | A notification links to its item. Its text never contains a sick-leave comment or any detail of a medical document. |
| NOT-04 | Notifications are rendered in the recipient's language. |
| NOT-05 | Delivery goes through one interface so that an email channel can be added later without changing the modules that raise events. |

There are no per-user notification preferences in the first build.

### 5.7 Home screens

| Role | Content |
|---|---|
| Employee | Balance, pending requests and their current step, upcoming approved absences, unread notifications, "New request" |
| Manager | Steps awaiting decision, team calendar, team balances, current delegation |
| HR | Validation queue, overdue certificates, steps flagged as stuck, profile changes to decide, link to export |
| Executive Management | Who is out today and this week, absence rate by department, balances by department |

Each role has its own workspace with its own home and navigation. A user with several roles switches between workspaces; they are never merged into one screen. The UI document defines the workspaces and the three interface principles: user friendly, minimal, specific to each user type.

### 5.8 Reports and KPMG export

| ID | Requirement |
|---|---|
| REP-01 | Reports, each filterable by period, department, employee and type, and exportable to Excel: absences taken; balances at a date; pending approvals with age; monthly permission hours; monthly remote days; outstanding certificates. |
| REP-02 | Managers run reports limited to their reports. HR and Executive Management run them for everyone. |
| REP-03 | KPMG export: HR sets filters (period, department, employee, type) and downloads one Excel file. There is no preview, approval or versioning step. |
| REP-04 | The export has one row per employee: employee number, name, department, annual-leave days, sick-leave days, exceptional-leave days, permission hours, remote days, annual balance at period end, meal tickets. |
| REP-05 | Only approved requests count. A request that crosses the period boundary contributes only the days inside the period. |
| REP-06 | Meal tickets = base per month (21, a setting) minus one for each full working day absent on a type flagged as reducing tickets. Half-days do not reduce tickets. Default flags: annual, sick and exceptional leave reduce; remote work and permissions do not. |
| REP-07 | The default period is the calendar month. If a cut-off day is set, the default period runs from the day after the previous cut-off to the cut-off. |
| REP-08 | The export contains no comment and no medical detail. Each export is written to the audit trail with its filters. |

The column layout will be aligned with the file HR sends KPMG today once a sample is available (open item 2).

### 5.9 Administration

| ID | Requirement | Who |
|---|---|---|
| ADM-01 | Request types: all attributes in section 8.4, including activation | HR |
| ADM-02 | Approval chain per type: ordered steps, approver rule, approve or notify, reminder and flag delays | HR |
| ADM-03 | Exceptional-leave events: names, days allowed, proof required | HR |
| ADM-04 | Public holidays | HR |
| ADM-05 | HR settings: monthly credit, working week, certificate deadline, meal-ticket base, export cut-off day | HR |
| ADM-06 | System settings: session timeout, lock-out thresholds, temporary-password lifetime, upload limits | System Administrator |
| ADM-07 | Accounts and roles (5.1) | System Administrator |

Every settings change is audited with the previous and new value.

### 5.10 Audit

| ID | Requirement |
|---|---|
| AUD-01 | The audit trail is append-only. The application's database account can insert and read audit rows but cannot change or delete them. |
| AUD-02 | Business events: every create, update and archive of business data with before and after values; every decision, including on-behalf decisions; every view or download of a medical attachment or employee document; every report export; every settings change. |
| AUD-03 | Security events: sign-in, failed sign-in, lock-out, sign-out, password change, password reset, account creation and disabling, role change. |
| AUD-04 | Each event records the actor (or "system"), time, network address, the item, and a request identifier that also appears in the application logs. |
| AUD-05 | The content of sick-leave comments is not copied into the audit trail; the event records only that the field changed. |
| AUD-06 | HR and Executive Management read business events. The System Administrator and Executive Management read security events. Both views are filterable by actor, item, action and period. |

## 6. Business rules

### 6.1 Working days

- The working week is Monday to Friday (a setting).
- A working day is a day of the working week that is not a public holiday.
- The quantity of a day-based request is the number of working days from start to end inclusive, minus 0.5 if it starts at midday and minus 0.5 if it ends at midday.
- A single-day request can be a full day, a morning or an afternoon.
- A request containing no working day is refused.

### 6.2 Month-end credit

- Credit for a full month = 2.5 days.
- For a month in which the employee joins or leaves: 2.5 x (calendar days employed in the month / calendar days in the month), rounded to the nearest 0.5.
- The entry is dated the last day of the month.
- Eligible: every employee whose status is active or suspended on that date. Archived employees are not credited after their leaving date.

### 6.3 Balance check for annual leave

Definitions, for a date *d*:

- **Posted(d)** = sum of ledger entries dated on or before *d*.
- **Projected credits(d)** = future month-end credits dated on or before *d*, at the current rate.
- **Reserved(d)** = days of the employee's pending annual-leave requests and pending amendments that fall on or before *d*.
- **Projected balance(d)** = Posted(d) + Projected credits(d) - Reserved(d).

A new annual-leave request is accepted only if, with its days included, the projected balance is zero or more on every date from its first day up to the last date on which the employee has any posted or reserved leave. This allows booking leave that will have been earned by the time it starts, and prevents a new request from making already-approved later leave unaffordable.

The check runs at submission and again at final approval, under a lock on the employee so that two simultaneous requests cannot both pass. A request returned for correction reserves nothing; it is checked again when resubmitted.

When a request is finally approved, one "leave taken" entry is posted per calendar month the leave touches, dated the first leave day in that month, for the days in that month. Cancelling or shortening posts matching restoration entries.

### 6.4 Overlap

- Day-based requests of one employee cannot overlap at half-day granularity, across all types, while in status pending, returned or approved. A morning of annual leave and an afternoon of remote work on the same day are allowed.
- An hourly permission must fall on a working day and cannot be on a half-day already covered by an absence.
- The check runs under the same employee lock as 6.3.

### 6.5 Sick leave

- The employee declares the absence on the day or afterwards; past dates are allowed. HR can declare for them.
- The first step notifies the manager and completes immediately. The request then waits for HR.
- The certificate can be attached at declaration or later. It is due 48 hours after submission (a setting).
- 12 hours before the deadline the employee is notified if none is attached. At the deadline HR is notified.
- HR approves once satisfied, rejects, or reclassifies the days as annual leave. Reclassification runs the balance check, which HR may override with a reason.
- An extension is a new adjacent request.
- The comment and attachments are visible only to the employee and HR.

### 6.6 Exceptional leave

- The employee picks an event from the list HR maintains.
- The request cannot exceed the days allowed for that event.
- Proof is required if the event says so; it can be attached after submission, and HR sees whether it is present before approving.

### 6.7 Hourly permission

- One date, a start time and an end time; quantity in hours, in quarter-hour steps.
- No cap and no balance effect. Totals per employee and month appear in reports and in the export.

### 6.8 Remote work

- Counted in days with optional half-days.
- Limit: 2 days per calendar week (Monday to Sunday), counting approved and pending requests. A setting on the type.

### 6.9 Approver resolution

When a step becomes active:

| Rule | Resolves to |
|---|---|
| Line manager | The requester's manager, plus that manager's active delegate. If the requester has no manager, the step is skipped and recorded as skipped. If the delegate is the requester, only the manager can act. |
| HR role | Every HR holder except the requester. If there is none, every Executive Management holder except the requester. If there is still none, the step stays pending and System Administrators are notified. |
| Named person | That person, unless they are the requester, in which case the step is treated as an HR role step. |

Working-day delays for reminders and flags use the calendar of 6.1.

## 7. Permission matrix

Reach: **Own** = the user's own data. **Team** = direct reports, and reports of anyone who delegated to the user, for the delegation period. **Dept** = the user's department. **All** = everyone.

| Capability | Employee | Manager | HR | Executive | Sys. Admin |
|---|---|---|---|---|---|
| View employee record | Own | Team (name, department, position, contact) | All | All | Name, email, account status only |
| Create, edit, archive employee | No | No | All | No | No |
| Propose own profile change | Own | Own | Own | Own | No |
| Decide profile change | No | No | All | No | No |
| Employee documents | Own, if shared | No | All | All | No |
| Create request | Own | Own | All (on behalf) | Own | No |
| View request | Own | Team | All | All | No |
| Sick-leave comment and medical attachment | Own | No | All | No | No |
| Other attachments (proof, scanned form) | Own | Team | All | All | No |
| Decide manager step | No | Team | On behalf, or when flagged | Team | No |
| Decide HR step | No | No | All except own | Only if no other HR holder | No |
| Correct or cancel directly | No | No | All | No | No |
| Delegations | No | Own | All | Own | No |
| Balance and ledger | Own | Team | All | All | No |
| Adjust balance | No | No | All | No | No |
| Calendar | Dept, type hidden | Team with type | All with type | All with type | No |
| Reports | No | Team | All | All | No |
| KPMG export | No | No | Yes | No | No |
| HR settings | No | No | Yes | Read | No |
| System settings, accounts, roles | No | No | No | Read | Yes |
| Business audit | No | No | Read | Read | No |
| Security audit | No | No | No | Read | Read |

Executive Management's manager capabilities apply to their own direct reports, like any manager.

## 8. Data model

PostgreSQL. One Django app per module owns its tables. Every table has a numeric primary key. Entities that appear in links also carry a random public identifier, so record numbers cannot be guessed. Timestamps are stored with time zone and shown in Africa/Tunis time. Names shown to users are stored in French and English.

### 8.1 accounts

**User**: email (unique, lower case, `@impactrisks.com`), password hash, is_active, must_change_password, temp_password_expires_at, failed_attempts, locked_until, last_login_at, previous_login_at, password_reset_by, language, employee (optional, unique), created_at, created_by.

**RoleAssignment**: user, role (HR, EXEC, SYSADMIN), assigned_by, assigned_at. Unique on user and role.

### 8.2 organisation

**Department**: code (unique), name, is_active.

**Position**: code (unique), title, grade, is_active.

**Employee**: employee_number (unique), first_name, last_name, date_of_birth, gender, professional_email (unique), personal_email, phone, address, hire_date, contract_start_date, contract_end_date, contract_type (permanent, fixed_term, temporary, consultant), status (active, suspended, archived), department, position, manager (optional, self-reference), emergency_contact_name, emergency_contact_phone, archived_at, archive_reason, created_at, updated_at.

**EmployeeDocument**: employee, attachment, label, visible_to_employee.

**ProfileChange**: employee, changes (field, old value, new value), status (pending, accepted, rejected, withdrawn), decided_by, decided_at, comment, created_at.

### 8.3 calendar

**PublicHoliday**: date (unique), name_fr, name_en.

### 8.4 requests

**RequestType**: code (unique), name_fr, name_en, unit (day, hour), allows_half_day, balance_effect (deducts_annual, none), document_rule (none, required_within_deadline), document_deadline_hours, allows_past_dates, notice_days, cap_quantity, cap_period (none, week, month), reduces_meal_tickets, calendar_label (absent, remote, hidden), is_sensitive, uses_events, is_active, sort_order.

**ChainStep**: request_type, position, approver_rule (line_manager, hr_role, named_person), named_person, mode (approve, notify), reminder_after_days, flag_after_days.

**ExceptionalEvent**: name_fr, name_en, days_allowed, proof_required, is_active.

**Request**: public_id, employee, request_type, start_date, end_date, starts_at_midday, ends_at_midday, start_time, end_time, quantity, exceptional_event, comment, status, created_by, override_reason, certificate_due_at, submitted_at, decided_at, version, created_at, updated_at.

**Amendment**: request, kind (cancel, change), new_start_date, new_end_date, new_starts_at_midday, new_ends_at_midday, previous values, reason, status, requested_by, created_at, decided_at.

**RequestStep**: request, amendment (optional), position, approver_rule, mode, named_person, status, activated_at, reminded_at, flagged_at, decided_by, decided_at, recorded_by, channel (in_app, verbal, paper), comment.

**Delegation**: manager, delegate, start_date, end_date, created_by, ended_at.

**Attachment**: public_id, kind (medical, proof, scanned_form, employee_document), request (optional), original_name, content_type, size, sha256, storage_path, is_encrypted, uploaded_by, uploaded_at.

### 8.5 balances

**LedgerEntry**: employee, kind (opening, credit, taken, restored, adjustment), amount (signed), effective_date, period (for credits, `YYYY-MM`), request (optional), reason, created_by (empty for system), created_at. Unique on employee and period where kind is credit. No update or delete.

### 8.6 notifications

**Notification**: user, event_code, parameters, target_type, target_public_id, created_at, read_at.

### 8.7 audit

**AuditEvent**: at, actor (optional), category (business, security), action, object_type, object_id, object_label, changes (before and after), ip_address, request_id. Insert and select only.

### 8.8 settings

**Setting**: key (unique), value, updated_by, updated_at.

### 8.9 Changes from the documented schema

| Documented | Here | Reason |
|---|---|---|
| Yearly balance counters | Ledger | Unlimited carry-over; full history; auditable |
| One decision per request | One row per step, plus amendments | Two-step chain, delegation, on-behalf decisions, changes after approval |
| Leave type with annual entitlement | Request type with rules, chain steps, events | Types and chains are configuration |
| File-path columns | Attachment table | Several files per item; access by kind |
| Username, generic permission tables | Email login, three assignable roles, rules in code | Five roles do not need a permission editor |
| Field-level audit rows | Event with before and after, plus views, exports, sign-ins | Access logging is required |
| Employment status active, inactive, suspended, on_leave | active, suspended, archived | "On leave" is derived from requests; "inactive" duplicated archiving |
| Training, recruitment, export tables | Removed | Out of scope; the export is a query |

## 9. Architecture

### 9.1 Shape

A modular monolith: one backend, one database, one frontend, one worker. Splitting into services would add operational work with no benefit at this scale and with one developer.

```
 Browser (office network)
        |
        | HTTPS
        v
 +----------------+      +-------------------+      +--------------+
 | Reverse proxy  | ---> | Django application| ---> | PostgreSQL   |
 | + React build  |      | REST API /api/v1  |      |              |
 +----------------+      +-------------------+      +--------------+
                                  |                        ^
                                  v                        |
                          +---------------+        +---------------+
                          | File volume   |        | Job worker    |
                          | (encrypted)   |        | (same image)  |
                          +---------------+        +---------------+
```

### 9.2 Backend

- Python 3.13, Django 5.2 LTS, Django REST Framework, PostgreSQL 17.
- Django apps: `accounts`, `organisation`, `requests`, `balances`, `calendar`, `notifications`, `reports`, `audit`, `settings`, plus `core` for shared utilities.
- Each app exposes a service layer of plain functions. Views, jobs and other apps call services; they do not query another app's tables. Business rules live in services, never in views or serializers.
- A new module is a new app that reuses the request engine, notifications, attachments and audit.

### 9.3 API

- REST and JSON under `/api/v1`. An OpenAPI description is generated from the code and checked in the build.
- Authentication: server-side session in a cookie marked HttpOnly, Secure and SameSite=Lax, with CSRF protection. No tokens in browser storage.
- Lists are paginated, filterable and sortable. Dates use ISO 8601.
- Errors use one problem-details format: type, title, status, translated detail, per-field errors, request identifier.
- State-changing actions are explicit sub-resources, not generic updates.
- Concurrent decisions are rejected with 409 using the request's version number.

Resource outline:

| Area | Endpoints |
|---|---|
| Session | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password` |
| Accounts | `/accounts`, `/accounts/{id}/reset-password`, `/accounts/{id}/roles`, `/accounts/{id}/disable` |
| Organisation | `/departments`, `/positions`, `/employees`, `/employees/{id}/archive`, `/employees/{id}/documents`, `/profile-changes`, `/profile-changes/{id}/decide` |
| Configuration | `/request-types`, `/request-types/{id}/steps`, `/exceptional-events`, `/holidays`, `/settings` |
| Requests | `/requests` (scope: mine, team, all), `/requests/preview` (computed quantity, balance effect, resolved chain and validation messages for a form not yet saved), `/requests/{id}`, `/requests/{id}/submit`, `/withdraw`, `/attachments`, `/amendments`, `/correct`, `/cancel`, `/reclassify`, `/history` |
| Decisions | `/approvals` (my queue), `/steps/{id}/decide`, `/steps/{id}/record-on-behalf`, `/steps/{id}/reassign` |
| Delegations | `/delegations` |
| Balances | `/balances/{employee}`, `/balances/{employee}/ledger`, `/balances/{employee}/adjustments` |
| Calendar | `/calendar?from=&to=&scope=` |
| Notifications | `/notifications`, `/notifications/{id}/read`, `/notifications/read-all` |
| Reports | `/reports/{name}`, `/exports/kpmg` |
| Audit | `/audit/business`, `/audit/security` |
| Files | `/attachments/{public_id}/download` |
| Operations | `/health` |

### 9.4 Frontend

- React 19 and TypeScript, built with Vite. Single-page app served as static files by the reverse proxy.
- API client and types generated from the OpenAPI description.
- Server data through TanStack Query; routing through React Router; forms validated with a schema library and again on the server.
- Components from shadcn/ui on Tailwind CSS.
- All text in French and English translation files (`react-i18next`); dates and numbers formatted for the chosen language.
- Routes are grouped by role workspace (`me`, `team`, `hr`, `overview`, `admin`), as defined in the UI document. Code shared between workspaces (request form, request view, calendar, report tables, notifications) lives in feature folders that the workspaces compose.
- Responsive from phone to desktop. Keyboard-accessible, with WCAG 2.1 AA as the target.
- The interface hides what a role cannot do, but every rule is enforced by the API.

### 9.5 Background jobs

One worker process using Procrastinate, a PostgreSQL-backed queue with scheduled tasks. No separate broker.

| Job | Schedule | Idempotency |
|---|---|---|
| Month-end credit | Daily; posts any missing month | Unique constraint on employee and period |
| Step reminders and HR flags | Hourly | `reminded_at` and `flagged_at` on the step |
| Certificate deadlines | Hourly | Notification recorded per request and event |
| Delegation start and end | Daily | State derived from dates |
| Session and temporary-password clean-up | Daily | Safe to repeat |
| Database and file dump | Nightly | New file per run |

A failed job is retried with back-off and, if it still fails, raises an in-app notification to System Administrators and an error in the logs.

### 9.6 Files

- Stored on a dedicated volume outside the web root, under generated names.
- Downloaded only through the API after a permission check; every medical or employee-document download is audited.
- Medical attachments are encrypted per file with a key from the environment, not the database.
- The declared type is checked against the file's content. Files are served as downloads with safe headers and are never executed or rendered inline from the application's origin.
- Access goes through Django's storage interface, so the volume can be swapped for object storage later.
- No antivirus scanning in the first build.

### 9.7 Configuration, errors, logging

- Infrastructure values and secrets come from environment variables, validated at start-up; the application refuses to start with a missing or malformed value.
- Business settings live in the `settings` table, cached in process.
- No cache server. The load does not justify one.
- Logs are structured JSON on standard output, collected by Docker with rotation. Each line carries the request identifier and user identifier, never passwords, comments or file contents.
- `/health` reports application, database and worker status.
- Unexpected errors show the user a generic message with the request identifier, and notify System Administrators in-app.
- No external monitoring service.

## 10. Security and privacy

| Area | Measure |
|---|---|
| Authorisation | Each endpoint declares allowed roles and filters rows by reach (section 7). Field-level rules hide sick-leave comments and medical attachments on the server. |
| Proof | An automated test calls every endpoint as every role and asserts the expected result. A new endpoint without an entry fails the build. |
| Accounts | Section 5.1. Password only; a second factor can be switched on later. |
| Transport | HTTPS on the office network with a certificate for an internal hostname. HSTS enabled. |
| At rest | Full-disk encryption on the server. Medical files encrypted individually. Dumps encrypted. |
| Web | CSRF protection, strict content-security policy, secure cookie flags, clickjacking protection, server-side validation of all input, parameterised queries through the ORM. |
| Uploads | Type and size checks, generated names, download-only. |
| Supply chain | Pinned dependencies, vulnerability scan in the build, monthly updates. |
| Audit | Section 5.10. |
| Network | Reachable from the office network only. The server needs outbound access only during an upgrade. |
| Separation of duties | HR cannot manage accounts. The System Administrator cannot open business data. No account holds both. |
| Privacy | Peers see "Absent", never the type. Exports and notifications carry no medical detail. All data stays on IRIS premises. |

**Known limit.** The System Administrator role is blocked from business data inside the application, but anyone with operating-system or database access to the server can technically read it. Mitigations: the file-encryption key is stored apart from the data, server logins are restricted to named people, and those logins are logged by the operating system.

**Outside the software.** IRIS is responsible for the regulator declaration for processing employee and health data under Law 2004-63, and for a legal check of the decision to keep archived data indefinitely.

## 11. Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-01 | Capacity | 100 users, 20 concurrent, on one server with 4 cores, 8 GB of memory and SSD storage |
| NFR-02 | Performance | 95% of API calls answer in under 500 ms; pages are usable within 2 seconds on the office network |
| NFR-03 | Availability | 99% during business hours; upgrades outside business hours |
| NFR-04 | Recoverability | Nightly dump kept 14 days on the server. Recovery point 24 hours and recovery time 4 hours apply once off-site backup exists (open item 4) |
| NFR-05 | Usability | An employee submits a request without training; every error message says what to do next |
| NFR-06 | Languages | French and English throughout: interface, notifications, exports |
| NFR-07 | Browsers | Current Chrome, Edge and Firefox, on desktop and phone |
| NFR-08 | Accessibility | WCAG 2.1 AA as the target |
| NFR-09 | Maintainability | Rules and permission code fully covered by tests; no business rule in views or interface code |
| NFR-10 | Extensibility | A new request type needs no code. A new module needs no change to existing modules' tables |
| NFR-11 | Auditability | Every state change and every access to sensitive content is traceable to a person and time |
| NFR-12 | Data location | All data and backups stay on IRIS premises until a backup destination is approved |

## 12. Deployment and engineering

### 12.1 Places

| Where | What runs | How it updates |
|---|---|---|
| Developer machine (Windows 11, Docker Desktop) | Development stack: live reload, fake data, local database volume | `git pull`, then the update command |
| GitHub (private repository) | Code, pipeline, container registry. Never data or secrets | Push |
| Office server (Ubuntu, Docker) | Test stack now. A separate production stack at go-live, with its own database, volumes, hostname and `.env` | The update command pulls a version from GitHub |

### 12.2 Containers

| Container | Image | Role |
|---|---|---|
| `proxy` | Caddy with the React build | HTTPS, static files, forwards `/api` |
| `app` | Backend image, Gunicorn | API |
| `worker` | Backend image, worker command | Jobs |
| `db` | PostgreSQL 17, pinned | Database |

Compose files: `compose.yaml` (shared), `compose.dev.yaml` (source mounted, ports open, live reload), `compose.server.yaml` (restart policies, HTTPS, registry images). Test and production are separate Compose projects on the same server.

### 12.3 Environment files

- `.env.example` is committed and documents every variable with a safe example value.
- Real `.env` files are git-ignored and exist only on the machine they belong to.
- On the developer machine, `.env` is generated from the example on first run.
- On the server, each stack's `.env` holds its real secrets and is readable by the service account only.
- An update never writes to a `.env`. Before changing anything it compares the `.env` with the new `.env.example` and stops with the list of missing variables.
- The application validates the same variables at start-up.
- The server `.env` files are backed up separately from the data. Without the file-encryption key, medical attachments cannot be read.

Variables: `ENVIRONMENT`, `APP_VERSION`, `SITE_HOSTNAME`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `FILE_ENCRYPTION_KEY`, `BACKUP_PASSPHRASE`, `ALLOWED_EMAIL_DOMAIN`, `TIME_ZONE`, `DEFAULT_LANGUAGE`, `LOG_LEVEL`.

### 12.4 Pipeline

On every push and pull request: formatting and lint (Ruff, ESLint), type checks (`tsc`), backend tests against PostgreSQL, frontend tests, OpenAPI check, dependency vulnerability scan, image build.

On a version tag `vX.Y.Z`: the same checks, then the two images are published to GitHub's container registry under that tag.

### 12.5 Server update

The server holds a read-only GitHub token for the registry and repository. One command, given a version:

1. Fetch that version's compose files and `.env.example`.
2. Check the `.env` (12.3). Stop if anything is missing.
3. Dump the database.
4. Pull the images for that version.
5. Apply database migrations.
6. Restart the containers.
7. Call `/health`. On failure, print the command to return to the previous version and the dump.

Shell scripts are stored with Unix line endings (`.gitattributes`), because development is on Windows and the server is Ubuntu.

### 12.6 Database changes

Django migrations, applied forwards only by the update command, after the dump. A change that removes or renames a column is split across two versions so that a rollback of the application alone still works.

### 12.7 Backups

A nightly job writes an encrypted dump of the database and an encrypted archive of the file volume to a backup volume on the server, and keeps 14 days. The destination for off-site copies will be a cloud service; its design is deferred (open item 4). Until then, loss of the server means loss of the data.

### 12.8 Testing

| Level | Covers |
|---|---|
| Unit, written first | Working-day counting, month-end credit and pro-rating, balance projection, overlap, chain engine, approver resolution, amendments, meal-ticket formula |
| API | Every endpoint, including error cases and concurrent decisions |
| Permission matrix | Every endpoint as every role |
| Browser (Playwright) | Submit, approve, validate; sick leave with a late certificate; amendment; delegation; on-behalf decision; export |
| Job | Each job run twice produces the same result as once |

### 12.9 Go-live

1. Install the production stack and create the first System Administrator.
2. HR enters settings, public holidays, departments and positions.
3. HR enters employees with their managers.
4. HR enters each opening balance.
5. The System Administrator creates accounts and hands out temporary passwords.

The whole sequence is rehearsed on the test stack first.

### 12.10 Documentation and maintenance

- Documents: installation, update and restore runbook; administrator guide; HR guide; employee guide in French and English; this specification; a record of later decisions.
- Semantic versioning with a changelog.
- Monthly dependency updates; operating-system patches on the server; Django long-term-support releases.
- A restore from the latest dump is tested every quarter on the test stack.

## 13. Build order and roadmap

The go-live date is decided separately. The order below is the build order for the first build.

| Step | Content | Done when |
|---|---|---|
| 1. Foundation | Repository, containers, pipeline, update command, accounts and roles, sessions, audit, settings, translations, application shell | A user can sign in on the test stack in both languages and every action is audited |
| 2. Organisation | Departments, positions, employees, documents, profile-change proposals | HR can enter the whole company and an employee can propose a change |
| 3. Request engine | Types, chains, lifecycle, steps, delegation, on-behalf, amendments, attachments, holidays, day counting | All five types run end to end without balances |
| 4. Balances | Ledger, month-end credit, projection check, adjustments | The balance of a test employee matches a hand calculation across a year |
| 5. Calendar, notifications, home screens | Department calendar, in-app notification list, the four home screens | Each role's home screen shows its real work |
| 6. Reports and KPMG export | The six reports, the filtered KPMG download | HR exports a month that matches a hand calculation |
| 7. Hardening | Permission-matrix tests complete, browser tests, runbook, go-live rehearsal | The rehearsal completes from an empty server using only the runbook |

Each step gets its own implementation plan.

After the first build: email and self-service password reset; off-site backups; then the later modules in the order of section 4.

## 14. Decision log

| # | Decision | Alternatives set aside |
|---|---|---|
| 1 | Approval happens in the system; HR can record a decision on an approver's behalf | Off-system approval as in the scope statement |
| 2 | Chain: line manager, then HR, on every request | Manager final for ordinary leave; executive approval |
| 3 | Types: annual, sick, exceptional, hourly permission, remote work; half-day as an option | Unpaid leave (removed) |
| 4 | Built in ordered steps, requests first | Single undifferentiated release |
| 5 | Roadmap covers documents, onboarding and offboarding, performance, employee relations; payroll calculation never | Exclusions of the scope statement |
| 6 | KPMG export is one filtered Excel download with absence-derived columns including meal tickets | Preview, correction and versioning workflow; leave figures only |
| 7 | IRIS only, one installation | Multi-entity or multi-tenant |
| 8 | Sized for 40 users with growth | |
| 9 | One developer with AI assistance | |
| 10 | Build as fast as possible; go-live date decided later | |
| 11 | Local accounts only, restricted to `@impactrisks.com` | Microsoft 365 single sign-on |
| 12 | Training dropped; recruitment out of scope for now | Four modules of the scope statement |
| 13 | 2.5 days credited per month, same for everyone | Per-person rates; annual grant |
| 14 | Balances carry over without limit | Cap with expiry; annual reset |
| 15 | Days counted Monday to Friday, excluding public holidays | |
| 16 | Annual leave refused beyond the projected balance; HR can override | Negative balance; automatic unpaid split |
| 17 | Hourly permissions are recorded with monthly totals; no cap, no deduction | Monthly cap; deduction from leave |
| 18 | Sick leave: declare first, certificate within a deadline, manager notified, HR validates | Certificate required to submit; standard chain |
| 19 | Free edit and withdrawal before the first decision; amendment through the chain after approval | Free cancellation; HR-only changes |
| 20 | The HR step is assigned to the role and is never unattended | Named backup |
| 21 | Absent manager: delegation, reminders, then HR fallback | Escalation up the hierarchy; automatic approval |
| 22 | Calendar: own department, type hidden | Company-wide; none |
| 23 | Executive Management reads everything except medical content | Reports only; full access |
| 24 | Remote work: full chain with a weekly cap | Manager only |
| 25 | Notifications in-app only; email deferred | Email and in-app |
| 26 | French and English | |
| 27 | Profile changes are proposed by the employee and decided by HR | Direct edit of contact details; read-only |
| 28 | Go-live data entered manually | Excel import |
| 29 | Hosted on a server on IRIS premises | Tunisian hosting provider; foreign cloud |
| 30 | Reachable from the office network only | VPN; internet |
| 31 | Django and Django REST Framework, React and TypeScript, PostgreSQL | NestJS; ASP.NET Core; server-rendered Django |
| 32 | Password only | Authenticator app for privileged roles |
| 33 | Separate System Administrator with no access to business data | HR as administrator; super-user |
| 34 | Archived data is kept indefinitely | Timed purge |
| 35 | Backups go to a cloud destination; design deferred | Second device in the office |
| 36 | Approval chains are configuration run by an engine in the application | Workflow product; fixed flows in code |
| 37 | Sessions end after 2 hours of inactivity | 8 hours |
| 38 | Develop on Windows with Docker, push to GitHub, server pulls images built by GitHub | Build on the server |
| 39 | Balance as a ledger; one decision row per step; five fixed roles; event-based audit | Documented schema |

## 15. Assumptions to confirm

These were proposed and not objected to. Each is a setting or a small rule and can change without affecting the design.

| # | Assumption |
|---|---|
| A1 | The month-end credit is pro-rated by calendar days and rounded to the nearest half day |
| A2 | Every employee in the system earns the credit, whatever the contract type, including during sick leave |
| A3 | Reminder after 2 working days; flag to HR after 4 |
| A4 | Certificate deadline 48 hours; employee warned 12 hours before |
| A5 | Remote-work limit of 2 days per week |
| A6 | Meal tickets: 21 per month minus one per full day of annual, sick or exceptional leave; half-days and remote days do not reduce |
| A7 | Export default period is the calendar month unless a cut-off day is set |
| A8 | After the first decision and before final approval, the employee can withdraw but not edit |
| A9 | Hourly permissions are not shown on colleagues' calendars |
| A10 | Lock-out for 15 minutes after 5 failures; temporary passwords valid 24 hours; 12-character minimum |
| A11 | Uploads limited to PDF, JPG and PNG, 10 MB; no antivirus scanning |
| A12 | The employee fields of the documented schema are sufficient |
| A13 | Test and production stacks share the office server |

## 16. Open items

None blocks the start of the build.

| # | Item | Owner | Needed by step |
|---|---|---|---|
| 1 | Sponsor agreement to in-system approval, which reverses the scope statement | Project owner | Before go-live |
| 2 | Sample of the file HR sends KPMG each month | HR | 6 |
| 3 | Confirmation of A2, A5 and A6; list of exceptional-leave events and days; public holidays | HR | 3 to 6 |
| 4 | Cloud backup destination and design | Project owner | Before go-live |
| 5 | Email delivery and self-service password reset | Deferred | After first build |
| 6 | Regulator declaration; legal check of indefinite retention | IRIS | Before go-live |
| 7 | Server hardware, internal hostname, certificate | IT | 1 |
| 8 | Names of the HR holders and System Administrator; comparison of A12 with the current Excel columns | Project owner | 2 |

## 17. Accepted risks

| Risk | Consequence | Mitigation in place |
|---|---|---|
| One server, no off-site backup yet | Fire, theft or hardware failure loses all data | Nightly local dump; open item 4 must close before go-live |
| Office network only | Nobody can submit or approve from home, including on a remote-work day | HR can record decisions on behalf; proxy design allows opening access later |
| No email | People learn of pending work only by opening the application; password resets need the administrator | Home-screen queues and unread count; reminders; notification interface ready for email |
| Password only for privileged accounts | One leaked HR password exposes all employee data | Lock-out, strong password policy, previous sign-in shown, audit of every sensitive view; second factor can be enabled later |
| Indefinite retention | Health data of former employees stays on the server | Access restricted to HR and audited; open item 6 |
| HR is the final step on every request | HR workload grows with headcount | HR role can have several holders; chains are configurable per type |
| One developer | Knowledge sits with one person | Mainstream stack, tests, runbook, this specification |
| Maintainer has server access | Technical access to all data | Separate encryption key, named logins, operating-system login logs |

## 18. What this supersedes in the existing documents

| Document | Statement | Now |
|---|---|---|
| Scope statement | Management approval happens outside the system | In-system approval (decision 1) |
| Scope statement | Three roles only | Five roles (section 3) |
| Scope statement | Single release, four modules | Ordered build; training and recruitment out |
| Scope statement | Performance, disciplinary, offboarding excluded | On the roadmap as later builds |
| Scope statement | Roughly two dozen people | About 40 |
| Requirements register | Recruitment, training, payroll and performance requirements | Not in the first build; payroll calculation never |
| Requirements register | NFR-INT-02 spreadsheet import | Manual entry |
| Requirements register | NFR-COMP-02 configurable deletion | Archive indefinitely |
| Requirements register | NFR-SUP-01 vendor service agreement | Not applicable to an in-house build |
| RBAC matrix | Employees see own data only | Department calendar with type hidden |
| RBAC matrix | Employees cannot change their profile | Proposals decided by HR |
| RBAC matrix | Executive Management reads all leave data | All except medical content |
| Use cases | Status "Pending HR Review"; one HR actor | Statuses and chain of section 5.3 |
| Use cases | Export preview, generate, transmit | One filtered download |
| DBML schema | Tables as documented | Section 8.9 |
| To-be diagrams | Cloud engine, KPMG interface, career portal, payslips | On-premises; file export; not planned |
| Strategy deck | Local infrastructure | Confirmed: on premises |
