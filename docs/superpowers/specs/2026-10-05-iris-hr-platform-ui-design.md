# IRIS HR Platform: UI Design

| | |
|---|---|
| Status | Draft for review (revised 2026-10-06) |
| Companion to | `2026-10-05-iris-hr-platform-prd-design.md` (rules, permissions and data are defined there) |

## 1. What this document covers

This document describes the interface: its principles, its structure, every page, who can open it, what it contains and what can be done on it.

**Fixed here**

- Three principles: the interface is user friendly, minimal, and specific to each type of user (section 2).
- The structure that follows from them: one workspace per role (section 3).
- The pages of each workspace, their content and their actions (sections 4 to 10).

**Left open**

Appearance is a matter of taste and is not prescribed: colours, typography, spacing, icons, imagery, component style, and whether a piece of content is a tab, an accordion, a dialog, a panel or a page of its own. Where this document says "block", "list" or "dialog", read it as "a distinct piece of content", not as a layout instruction. Workspace and page names are suggestions.

"Minimal" in this document constrains how much is shown and asked. It does not impose a visual style.

Role names, statuses and rule references (such as REQ-07) are those of the PRD.

## 2. Design principles

Each rule is written so that a page can be checked against it.

### 2.1 User friendly

| # | Rule |
|---|---|
| U1 | The most frequent task of a workspace starts from its home in one step. |
| U2 | Every request says in plain words where it stands, who it is waiting on, and what happens next. |
| U3 | Plain language. An everyday word is used wherever one exists; internal codes and status names are never shown. One word means one thing everywhere. |
| U4 | The system does the work it can. Quantities, balances, limits and approvers are computed and shown, never asked for. |
| U5 | An error appears next to its cause, says what is wrong and what to do about it. What the user typed is never lost. |
| U6 | Nothing irreversible happens without a confirmation that states the consequence. Where something can be undone (withdraw, discard), the interface offers the undo instead of a warning. |
| U7 | Every action is acknowledged, and the page shows the new state without a manual refresh. |
| U8 | Every page works on a phone, with a keyboard alone and with a screen reader. Target: WCAG 2.1 AA. |
| U9 | French and English are complete and equal. No screen mixes the two. |

### 2.2 Minimal

| # | Rule |
|---|---|
| M1 | One primary action per page. Every other action is visibly secondary. |
| M2 | A workspace has at most six navigation entries. |
| M3 | A home has at most four blocks, each answering a question that role asks every day. A block with nothing to show shrinks to one line or disappears. |
| M4 | A list shows at most six attributes per item. The rest is inside the item. |
| M5 | At most three filters are visible. Others are one step away. |
| M6 | A detail page opens on a summary and the actions available. History, step-by-step detail and technical information are one step away. |
| M7 | A form shows only the fields that apply to the choice made. |
| M8 | Nothing is shown that the user cannot use: no disabled menu entries, no greyed-out actions for another role, no empty columns. |
| M9 | Nothing is shown that carries no information or leads to no action: no chart where a number is enough, no counter nobody acts on. |
| M10 | The figure a person came for is shown first and alone. An employee sees one balance, not a table of balances. |

### 2.3 Specific to each user type

| # | Rule |
|---|---|
| R1 | Each role has its own workspace, with its own home, navigation, primary action and vocabulary. |
| R2 | A workspace contains only what that role does. It is designed for the role, not produced by hiding parts of a general menu. |
| R3 | The same item is presented from the viewer's angle. A request is "mine" to the employee, "to decide" to the manager, "to validate" to HR, and "to oversee" to an executive. |
| R4 | A person with several roles switches workspace explicitly. Workspaces are never merged into one screen. |
| R5 | Personal matters (own leave, own profile) live in My space for everybody, including HR, executives and managers. |

## 3. Workspaces

### 3.1 The five workspaces

| Workspace (French) | For | The question it answers | Primary action | Navigation |
|---|---|---|---|---|
| **My space** (Mon espace) | Everyone with an employee record | How much leave do I have, and where are my requests? | New request | Home, Requests, Calendar, Balance, Profile |
| **My team** (Mon équipe) | Managers and active delegates | What is waiting for me, and who is in? | Decide | To decide, People, Requests, Calendar, Delegations, Reports |
| **HR desk** (Espace RH) | HR | What needs HR today? | Process the next item | Desk, Requests, Employees, Calendar, Reports, Settings |
| **Overview** (Vue d'ensemble) | Executive Management | How is the company doing on absence, and is everything in order? | None; read-only | Overview, People, Requests, Calendar, Reports, Oversight |
| **Administration** | System Administrator | Is the system healthy, and who needs access? | Create account | Status, Accounts, Parameters, Security log |

Who has what:

| Person | Workspaces |
|---|---|
| Employee | My space |
| Manager | My space, My team |
| HR Responsible | My space, HR desk (and My team if they manage people) |
| CEO, Deputy CEO | My space, Overview, My team |
| System Administrator | Administration (and My space if linked to an employee record) |

### 3.2 Moving between workspaces

- A workspace switcher appears only for a person with more than one workspace.
- The switcher shows, per workspace, how many things are waiting there (for example "My team: 3").
- After sign-in the user lands on the workspace they used last. On first sign-in they land on their most specific one, in this order: Administration, HR desk, Overview, My team, My space.
- Opening a link or a notification switches to the workspace the item belongs to.

### 3.3 Present on every page

| Element | Content |
|---|---|
| Workspace switcher | As 3.2. Absent for single-workspace users. |
| Navigation | The entries of the current workspace only. The current entry is identifiable. |
| Notifications | Unread count across all workspaces. Opens the latest ones, with a link to the full list. |
| Language | French or English. Changes at once and is remembered. |
| User menu | Name, change password, sign out. |
| Environment marker | On the test stack only: a visible indication that this is not production. |

### 3.4 Behaviour common to all pages

| Topic | Rule |
|---|---|
| Lists | Filterable, sortable, paged. Filters are kept when the user opens an item and comes back. |
| Empty lists | Say why they are empty and, where relevant, offer the action that would fill them. |
| Forms | Per-field errors from the server, translated. A failed submission keeps what was typed. |
| Mandatory reasons | Where the PRD requires a reason, the action cannot be confirmed without one. |
| Not allowed | A page or item outside the user's reach shows "not available", without revealing whether it exists. |
| Session end | After 2 hours of inactivity the user returns to Sign in and then to the page they were on. A request saved as a draft is not lost. |
| Concurrent action | If someone else acted first, the user is told and sees the current state. |
| Dates and numbers | In the user's language format, Tunis time. Days allow halves; hours allow quarters. |
| Sensitive content | Sick-leave comments and medical attachments appear only to the requester and HR, on every page, list, history and notification. |

### 3.5 How a request's status reads

Statuses are shown as sentences, from the viewer's angle (U2, R3).

| State | To the requester | To the person who must act |
|---|---|---|
| Draft | Not sent yet | |
| Waiting on the manager | Waiting for *manager's name* | Waiting for your decision |
| Waiting on HR | Approved by *manager's name*; waiting for HR | To validate |
| Returned | Sent back to you: *comment* | Sent back to *requester* |
| Approved | Approved | Approved |
| Rejected | Refused: *reason* | Refused |
| Withdrawn | Withdrawn by you | Withdrawn by *requester* |
| Cancelled | Cancelled | Cancelled |
| Sick leave without certificate | Certificate due by *date* | Certificate due by *date* (HR only) |
| Amendment open | Your change is waiting for *who* | Change to decide |

## 4. Signing in

### 4.1 Sign in

- **Content:** email, password, language.
- **Messages:**
  - Wrong email or password: one message that does not say which.
  - Address not ending in `@impactrisks.com`: refused, with the reason.
  - Account locked: says so, and when it unlocks.
  - Account disabled: says to contact the administrator.
  - Temporary password expired: says to ask the administrator for a new one.
- **Note:** there is no "forgot password" link in the first build. The page says that the System Administrator resets passwords.

### 4.2 Choose a new password

- **Who:** a user who signed in with a temporary password. Nothing else is reachable until it is done.
- **Content:** new password, confirmation, the rules in one sentence.

### 4.3 After sign-in

- Shown once per sign-in: date and time of the previous sign-in. If the password was reset since then, by whom and when.

### 4.4 Change password

- From the user menu. Current password, new password, confirmation.

## 5. My space (every employee)

Navigation: Home, Requests, Calendar, Balance, Profile.

### 5.1 Home

**Primary action:** New request.

| Block | Answers | Content |
|---|---|---|
| Balance | How much leave do I have? | The current annual balance as the one prominent figure. Secondary: days held by pending requests; days already approved and upcoming. |
| Needs you | Is something waiting for me? | Requests sent back with the comment; certificates due with the deadline. Absent when empty. |
| In progress | Where are my requests? | Requests not yet decided, each with type, dates and its status sentence (3.5). |
| Coming up | When am I off next? | Next approved absences and remote days. |

### 5.2 Requests

- **Primary action:** New request.
- **Shown per request:** type, dates (with half-day or times), quantity, status sentence.
- **Filters:** status, type, year.
- **Other actions:** open; discard a draft.

### 5.3 New request

**Step one: what kind?** The active request types, each with one line saying what it is for.

**Step two: the form.** Only the fields of the chosen type (M7).

| Type | Asked | Shown, not asked |
|---|---|---|
| Annual leave | Start, end, half-day at start or end, comment (optional) | Working days counted; days skipped as weekends or holidays; balance now, on the first day, and after |
| Sick leave | Start, end, half-day at start or end, comment (optional), certificate (now or later). Past dates allowed. | Working days counted; that comment and certificate are seen by HR only; the date and time the certificate is due |
| Exceptional leave | Event, start, end, proof if required | Days allowed for the event; working days counted |
| Hourly permission | Date, from, to, comment (optional) | Hours counted; hours already taken this month |
| Remote work | Start, end, half-day at start or end | Days counted; remote days already taken in each week touched; the weekly limit |

On every type the form also shows **who will decide**, in order and by name (for example "Your manager, *name*, then HR").

- **Primary action:** Send.
- **Other actions:** save for later; cancel.
- **Messages to cover:** end before start; no working day in the range; overlaps another request (which one); past dates not allowed; notice not respected; balance insufficient (by how much, and that HR can be asked for an exception); weekly limit exceeded; more days than the event allows; permission outside a working day; file type or size refused.

The same form serves editing a draft, a request sent back (showing who sent it back and why), and a request nobody has decided yet.

### 5.4 Request (my view)

**Shown first**

- Type, dates, quantity.
- The status sentence, and what happens next.
- The actions available now.

**One step away**

- Steps: who decided what, when, with their comment.
- My comment and my files.
- Changes I asked for, and their outcome.
- Full history.

| State | Primary action | Other actions |
|---|---|---|
| Not sent yet | Send | Edit, discard |
| Waiting, nobody decided yet | None | Edit, withdraw |
| Waiting, manager already decided | None | Withdraw |
| Sent back | Edit and send again | Withdraw |
| Approved, not started | None | Change dates, cancel |
| Sick leave, certificate due | Add certificate | |
| Change waiting | None | Withdraw the change |

### 5.5 Change or cancel an approved request

- **Content:** change dates or cancel; for a change, the new dates with the new count and balance effect; a reason; who will decide.
- **Stated plainly:** the original stays valid until the change is approved.

### 5.6 Balance

- **Shown first:** the current balance; days held by pending requests; days approved and upcoming; the next monthly credit (amount and date).
- **One step away:** the balance on a date of the user's choice; the history, entry by entry: date, what it was (opening, monthly credit, leave taken, restored, adjusted by HR), amount, balance after, and the request or reason behind it.

### 5.7 Calendar

- **Shows:** the user's department. Colleagues appear as "Absent" or "Remote" with their name, nothing more. Public holidays. The user's own requests, including pending ones.
- **Views:** month, week.
- **Not shown:** types, reasons, hourly permissions.
- **Action:** start a new request from a day.

### 5.8 Profile

- **Shown first:** the user's own details, read-only: identity, contact, emergency contact, department, position, manager.
- **One step away:** documents HR shared; past change proposals with their outcome; previous sign-in.
- **Primary action:** Propose a change.

### 5.9 Propose a change

- **Content:** the personal fields with current values (name, date of birth, gender, personal email, phone, address, emergency contact); the user edits what should change; optional note to HR.
- **Stated plainly:** the change applies once HR accepts it.

## 6. My team (managers and delegates)

Navigation: To decide, People, Requests, Calendar, Delegations, Reports.

### 6.1 To decide (home)

**Primary action:** decide the oldest request.

| Block | Answers | Content |
|---|---|---|
| To decide | What is waiting for me? | Each waiting request: who, type, dates, quantity, waiting since. With what is needed to decide without opening it: the balance after (annual leave), and teammates already absent or remote on those days. Approve and refuse are available on each item. Requests reaching the user through a delegation say from whom. |
| Who is out | Who is in this week? | Team members absent or remote today and over the next seven days. |
| Delegation | Is someone covering for me, or am I covering? | One line: active delegation given or received, with dates. Absent when there is none. |

Empty state for the first block: "Nothing to decide."

### 6.2 Request (manager view)

**Shown first**

- Who is asking; type, dates, quantity.
- What is needed to decide: balance now and after (annual leave); teammates absent or remote on the same days; whether the weekly remote limit is reached.
- The requester's comment (never for sick leave).
- Approve, Refuse, Send back.

**One step away:** steps and history; non-medical attachments.

**Never shown:** sick-leave comment or certificate. A sick-leave declaration appears as information only, with no decision to make.

**Decision:** approve (comment optional); refuse (reason required); send back (comment required).

### 6.3 People

- **Shown per person:** name, position, today (in, absent, remote), annual balance, requests waiting.
- **Open a person:** name, department, position, contact; their requests; their balance and its history.

### 6.4 Requests

- The team's requests in any state, each with requester, type, dates, quantity and status sentence.
- **Filters:** person, status, period.
- A second view: what the user already decided.

### 6.5 Calendar

- **Shows:** the team, with the request type, including pending requests, and public holidays.
- **Views:** month, week.
- **Filters:** person, type.

### 6.6 Delegations

- **Primary action:** Name a delegate.
- **Content:** delegations given (to whom, from, to, upcoming, active or ended) and received.
- **Create:** the delegate, start date, end date.
- **Other actions:** end early; cancel an upcoming one.
- **Prompt:** when the manager's own leave is approved, an offer to name a delegate for those dates, already filled in.

### 6.7 Reports

The team-scoped versions of: absences taken, balances at a date, requests waiting, permission hours by month, remote days by month (definitions in 10.3).

## 7. HR desk

Navigation: Desk, Requests, Employees, Calendar, Reports, Settings.

### 7.1 Desk (home)

**Primary action:** open the oldest item of the first non-empty queue.

| Block | Answers | Content |
|---|---|---|
| To validate | Which requests wait for HR? | Count, and the oldest items: who, type, dates, document status. |
| Certificates | Which sick leaves have no certificate? | Count overdue and count due soon, with the oldest. |
| Stuck with a manager | Which requests is nobody deciding? | Count, and the items: who, waiting on whom, since when. |
| Profile changes | Which changes do employees ask for? | Count, and the oldest. |

A queue with nothing in it shows a single line saying so.

### 7.2 To validate

- **Shown per request:** who, department, type, dates, quantity, document status (not needed, attached, due by, overdue).
- **Filters:** type, department, document status.
- **Actions on each:** approve, refuse, send back, open.
- An HR holder's own requests are not in their queue.

### 7.3 Certificates

- **Shown per sick leave:** who, dates, due date, overdue by.
- **Actions:** attach for the employee; count as annual leave instead (7.8); refuse; open.

### 7.4 Stuck with a manager

- **Shown per request:** who, type, dates, the manager, the delegate if any, waiting since.
- **Actions:** record the manager's decision or give it to someone else (7.8); name a delegate for that manager (7.9); open.

### 7.5 Profile changes

- **Shown per proposal:** who, which fields, when.
- **Open:** each field with the current and the proposed value.
- **Actions:** accept; refuse; optional comment.
- A second view: decided proposals.

### 7.6 Requests

- **Primary action:** New request for an employee.
- **Shown per request:** who, department, type, dates, quantity, status sentence.
- **Filters:** employee, status, period. One step away: department, type, entered by HR, with an exception.

### 7.7 New request for an employee

- The form of 5.3, preceded by the choice of employee.
- An "allow an exception" choice with a mandatory reason, which lifts the balance, limit, event-days and past-date checks.
- States that the request then follows its normal steps.

### 7.8 Request (HR view)

**Shown first**

- Who; type, dates, quantity; status sentence.
- Document status, with the files.
- The requester's comment.
- What is needed to decide: balance now and after; the manager's decision and comment.
- Approve, Refuse, Send back.

**One step away:** steps and history; changes asked for; other HR actions.

**Other HR actions**

| Action | Content |
|---|---|
| Record a decision made outside the system | Who decided (defaults to the step's approver); the outcome; when it was given; how (verbally, on paper); a mandatory note; optional scan of the signed form |
| Give the step to someone else | Current approver; the new one (any active employee other than the requester); reason |
| Correct, shorten or cancel | Current dates and count; the new dates with new count and balance effect, or cancellation; mandatory reason; who will be told |
| Count sick leave as annual leave | The days concerned; balance now and after; if the balance is insufficient, an exception with a mandatory reason |
| Add a file | On the employee's behalf |

### 7.9 Employees

**Directory**

- **Primary action:** New employee.
- **Shown per employee:** name, number, department, position, manager, status.
- **Filters:** search by name, number or email; department; status. People who left are hidden unless asked for.

**Employee record**

Shown first: name and number; department, position, manager; contract type and dates; status; current annual balance; whether an account exists.

One step away, each as its own block:

| Block | Content | HR actions |
|---|---|---|
| Personal details | Date of birth, gender, emails, phone, address, emergency contact | Edit |
| Team | Direct reports; current delegation | Change manager; name a delegate |
| Documents | Label, file, added by and when, shared with the employee or not | Add; change sharing |
| Requests | The employee's requests | New request for this employee |
| Balance | History, entry by entry | Adjust |
| Change proposals | Proposals and outcomes | Decide |
| History | What changed on the record, from what to what, by whom, when | |

- **Primary action:** Edit.
- **Messages to cover:** number or professional email already used; professional email not on the company domain; contract end before start; manager loop; mandatory field missing.

**Adjust a balance:** current balance; days to add or remove; effective date; mandatory reason; resulting balance. The same form records the opening balance at go-live.

**Record a departure:** leaving date; reason. Before confirming, the page lists the consequences: account disabled; no further monthly credit; requests and steps left open (listed); people who reported to this employee and need a new manager (listed).

### 7.10 Calendar

- **Shows:** the whole company with the request type, including pending requests, and public holidays.
- **Filters:** department, person. One step away: type, status.

### 7.11 Reports

- **Primary action:** KPMG export.
- **Content:** the KPMG export; the six reports (10.3); the activity log.

**KPMG export**

- **Asked:** period (the month, or the payroll period if a cut-off day is set); optionally department, employee, type.
- **Shown:** the columns the file will contain and, in one sentence each, the rules applied (approved requests only; days outside the period excluded; how meal tickets are counted).
- **Action:** Export to Excel.
- **State:** nothing to export for this selection.

**Activity log (business audit)**

- **Shown per event:** when, who, what they did, on what.
- **Filters:** period, person, a specific employee or request. One step away: kind of action, kind of item.
- **Open an event:** values before and after. Sick-leave comment content appears as "changed" only.
- **Action:** export the filtered list.

### 7.12 Settings

One entry per subject. Each opens a short list and a short form.

| Subject | Content |
|---|---|
| Request types | Names in both languages; counted in days or hours; half-days allowed; whether it uses the annual balance; whether a document is required and within how long; past dates allowed; notice; limit and its period; whether it reduces meal tickets; how it appears on colleagues' calendars; whether comment and files are restricted to HR; whether an event must be chosen; active; order |
| Steps of a type | The ordered steps: who acts (the manager, HR, a named person); decides or is only informed; reminder delay; delay before HR is alerted. A preview for a chosen employee. At least one step must decide. |
| Exceptional-leave events | Names in both languages; days allowed; proof required; active |
| Public holidays | By year: date and names. Copy fixed-date holidays to next year. A warning when a change affects requests already approved, listing them. |
| Parameters | Monthly credit; working days of the week; certificate deadline and advance warning; meal tickets per month; payroll cut-off day. Each with who last changed it and when. |
| Departments and positions | Code, name or title, active, number of employees. An item in use can be deactivated, not removed. |

A change to a type or its steps applies to requests sent afterwards; the page says so.

## 8. Overview (Executive Management)

Navigation: Overview, People, Requests, Calendar, Reports, Oversight.

The whole workspace is read-only (R2): it contains no editing action at all, so nothing appears disabled (M8). Deciding on direct reports' requests happens in My team.

### 8.1 Overview (home)

| Block | Answers | Content |
|---|---|---|
| Out now | Who is away? | People absent or remote today and this week, by department. |
| Absence this month | How much absence, and where? | Days of absence per department for the current month, against the previous month. |
| Leave owed | How much leave has built up? | Total annual balance per department, and the largest individual balances. |
| Waiting | Is anything stuck? | Requests undecided for longest: who, waiting on whom, since when. |

### 8.2 People

- The directory and employee record of 7.9, read-only, without edit actions.
- Documents are visible. Medical files are not.

### 8.3 Requests

- Every request, as 7.6, read-only.
- **Request (overview view):** who, type, dates, quantity, status sentence, steps and history. Sick leave shows its dates and status, never the comment or certificate.

### 8.4 Calendar

- As 7.10.

### 8.5 Reports

- The six reports (10.3) for the whole company. No KPMG export.

### 8.6 Oversight

| Entry | Content |
|---|---|
| Activity log | As in 7.11 |
| Security log | As in 9.6 |
| HR settings | The settings of 7.12, read-only |
| Accounts and system | Accounts, parameters and status of section 9, read-only |

## 9. Administration (System Administrator)

Navigation: Status, Accounts, Parameters, Security log.

This workspace contains no business data: no requests, balances, documents or employee details beyond name and email.

### 9.1 Status (home)

**Primary action:** Create account.

| Block | Answers | Content |
|---|---|---|
| Health | Is the system working? | One line when everything is fine. When not: which part fails (application, database, background jobs). Version and environment. |
| Accounts needing attention | Who cannot get in? | Locked accounts; accounts whose temporary password was never used or has expired; employees with no account yet. |
| Scheduled work | Did the nightly and monthly work run? | Each job: last run, result, next run. Failures first. |
| Backup | Is there a recent backup? | Time and size of the last backup; storage used. |

### 9.2 Accounts

- **Primary action:** Create account.
- **Shown per account:** name, email, state (active, awaiting first sign-in, locked, disabled), roles, last sign-in.
- **Filters:** search by name or email; state; role.

### 9.3 Create account

- **Asked:** the employee (from those without an account), or a name and email for an administrator account; roles.
- **Result:** the temporary password, shown once, with its expiry and a reminder to hand it over in person.
- **Messages to cover:** email not on the company domain; employee already has an account; HR and System Administrator cannot be combined.

### 9.4 Account

- **Shown first:** name, email, state, roles, last sign-in.
- **One step away:** who assigned each role and when; previous sign-in; failed attempts; recent security events of this account.
- **Actions:** reset password (shows a new temporary password once); unlock; disable or enable; add or remove a role.

### 9.5 Parameters

- Inactivity limit; failed attempts before lock-out; lock-out duration; temporary-password lifetime; maximum upload size; accepted file types.
- Each with who last changed it and when.

### 9.6 Security log

- **Shown per event:** when, which account, what happened (signed in, failed sign-in, locked, signed out, password changed, password reset, account created or disabled, role changed), network address.
- **Filters:** period, account, kind of event.
- **Action:** export the filtered list.

## 10. Shared content

### 10.1 Notifications

- One list for the person, across all their workspaces.
- **Shown per notification:** what happened, about what, when, read or not.
- **Filter:** unread only.
- **Actions:** open the item (switching workspace if needed); mark as read; mark all as read.
- **Kinds:** as PRD NOT-02. A notification never contains a sick-leave comment or anything from a medical document.

### 10.2 What each workspace sees of a request

| Content | My space (own) | My team | HR desk | Overview |
|---|---|---|---|---|
| Type, dates, quantity, status | Yes | Yes | Yes | Yes |
| Comment | Yes | Yes, except sick leave | Yes | Yes, except sick leave |
| Medical certificate | Yes | No | Yes | No |
| Other files (proof, signed form) | Yes | Yes | Yes | Yes |
| Certificate status | Yes | No | Yes | No |
| Balance now and after | Yes | Yes | Yes | Yes |
| Teammates away on the same days | No | Yes | Yes | Yes |
| Steps and history | Yes | Yes | Yes | Yes |
| Decide | Never on own request | Own step | HR step | No |

### 10.3 Reports

Each report has its filters, a result table, totals where meaningful, and an Excel export of what is shown.

| Report | Asked | Shown | Workspaces |
|---|---|---|---|
| Absences taken | Period; optionally department, employee, type | Employee, department, type, dates, days or hours; totals per employee and per type | My team, HR desk, Overview |
| Balances at a date | Date; optionally department, employee | Employee, department, balance on the date, days pending, days approved and upcoming | My team, HR desk, Overview |
| Requests waiting | Optionally department, type, step | Requester, type, dates, waiting on, since, reminded, alerted | My team, HR desk, Overview |
| Permission hours by month | Year; optionally department, employee | Employee, hours per month, total | My team, HR desk, Overview |
| Remote days by month | Year; optionally department, employee | Employee, days per month, total | My team, HR desk, Overview |
| Certificates outstanding | Optionally department | Employee, sick-leave dates, due date, overdue by | HR desk |

In My team every report is limited to the manager's team and has no department filter.

### 10.4 Other pages

| Page | When | Content |
|---|---|---|
| Not available | The page or item does not exist or is outside the user's reach | A short message and a way back to the workspace home |
| Something went wrong | Unexpected error | A short message, the reference to quote to the administrator, a way back |
| Being updated | During an upgrade | That the application will be back shortly |

## 11. Page inventory

Addresses are a suggestion, grouped by workspace.

| Workspace | Page | Address |
|---|---|---|
| None | Sign in | `/login` |
| None | Choose a new password | `/password/new` |
| Any | Change password | `/password` |
| Any | Notifications | `/notifications` |
| Any | Request (opens in the workspace matching the viewer) | `/requests/:id` |
| My space | Home | `/me` |
| My space | Requests | `/me/requests` |
| My space | New request, edit request | `/me/requests/new`, `/me/requests/:id/edit` |
| My space | Change or cancel | `/me/requests/:id/change` |
| My space | Calendar | `/me/calendar` |
| My space | Balance | `/me/balance` |
| My space | Profile | `/me/profile` |
| My space | Propose a change | `/me/profile/change` |
| My team | To decide | `/team` |
| My team | People, person | `/team/people`, `/team/people/:id` |
| My team | Requests | `/team/requests` |
| My team | Calendar | `/team/calendar` |
| My team | Delegations | `/team/delegations` |
| My team | Reports | `/team/reports`, `/team/reports/:name` |
| HR desk | Desk | `/hr` |
| HR desk | To validate | `/hr/validate` |
| HR desk | Certificates | `/hr/certificates` |
| HR desk | Stuck with a manager | `/hr/stuck` |
| HR desk | Profile changes | `/hr/profile-changes` |
| HR desk | Requests, new request for an employee | `/hr/requests`, `/hr/requests/new` |
| HR desk | Employees, employee record | `/hr/employees`, `/hr/employees/:id` |
| HR desk | Calendar | `/hr/calendar` |
| HR desk | Reports, report | `/hr/reports`, `/hr/reports/:name` |
| HR desk | KPMG export | `/hr/reports/kpmg` |
| HR desk | Activity log | `/hr/reports/activity` |
| HR desk | Settings and each subject | `/hr/settings`, `/hr/settings/:subject` |
| Overview | Overview | `/overview` |
| Overview | People, person | `/overview/people`, `/overview/people/:id` |
| Overview | Requests | `/overview/requests` |
| Overview | Calendar | `/overview/calendar` |
| Overview | Reports, report | `/overview/reports`, `/overview/reports/:name` |
| Overview | Oversight and each entry | `/overview/oversight`, `/overview/oversight/:entry` |
| Administration | Status | `/admin` |
| Administration | Accounts, create, account | `/admin/accounts`, `/admin/accounts/new`, `/admin/accounts/:id` |
| Administration | Parameters | `/admin/parameters` |
| Administration | Security log | `/admin/security-log` |

Decisions, the HR actions of 7.8, balance adjustment and recording a departure are focused tasks started from another page. Whether each is a dialog, a panel or a page of its own is a design choice.

## 12. Main journeys

The paths the pages must keep short. They are also the browser tests of the PRD (12.8).

| Journey | Workspace | Path |
|---|---|---|
| Ask for leave | My space | Home, New request, Send |
| Decide a request | My team | To decide, Approve (without opening when the list shows enough) |
| Validate a request | HR desk | Desk, To validate, Approve |
| Report sickness, add the certificate later | My space | New request; later: Home ("Needs you"), Add certificate |
| Handle a missing certificate | HR desk | Desk, Certificates, Count as annual leave |
| Change approved dates | My space | Requests, the request, Change dates |
| Go on leave as a manager | My team | The delegation offer when the leave is approved, Confirm |
| Unblock a stuck request | HR desk | Desk, Stuck with a manager, Record the decision |
| Correct an address | My space, then HR desk | Profile, Propose a change; Desk, Profile changes, Accept |
| Prepare the month for KPMG | HR desk | Reports, KPMG export, Export |
| Welcome a new employee | HR desk, then Administration | Employees, New employee; Status, Create account |
| Record a departure | HR desk | Employees, the record, Record a departure |
| Check that nothing is stuck | Overview | Overview ("Waiting") |
| Check the system | Administration | Status |
