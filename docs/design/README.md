# IRIS HR — design

The full screen design lives on the **IRIS HR — Clean Light** design canvas in Claude (private until you share it). It has one page per workspace:

| Canvas page | What it holds |
|---|---|
| System | Colour and type sheet; component library with every state |
| Sign in & shared | Sign in (with error and locked states), new password, after-sign-in notice, change password, user menu, workspace switcher, notifications page and popover, not available, error, being updated, phone sign-in |
| My space | Home, requests, new request (type choice + one form per type, error state), sent back, request detail and history, change or cancel, balance, calendar, profile, documents, propose a change, 4 phone screens |
| My team | To decide, request detail, refuse, send back, sick-leave info, people, person, requests, calendar, delegations, name a delegate, reports, absences report, phone To decide |
| HR desk | Desk, to validate, certificates, count as annual leave, stuck with a manager, record a decision, profile changes, requests, new request for an employee, request (HR view, more actions), correct a request, employees, employee record, documents, new employee, adjust balance, record a departure, calendar, reports, KPMG export, balances report, activity log, settings (types, steps, holidays, parameters, departments) |
| Overview | Overview home, people, person, requests, request, oversight, security log, phone overview |
| Administration | Status (healthy and failing), accounts, create account, temporary password, account, parameters, security log |

Focused tasks (decisions, HR actions, balance adjustment, departure, delegation) are drawn as a 480px right sheet — full screen on phone.

## Files here

- `iris-hr-design-tokens.json` — W3C design-token format; the source of truth.
- `iris-hr-tokens.css` — the same tokens for Tailwind CSS v4 + shadcn/ui (`:root`, `.dark`, `@theme inline`). Import after `@import "tailwindcss";`.

## Rules the screens follow

- One primary button per page; no disabled controls — what a role can't use is not shown.
- Statuses are sentences from the viewer's angle, with a coloured dot.
- Logo cyan `#0AA2D0` is for the logo and graphics only; IRIS blue `#0070B0` carries text and buttons.
- Every text/background pair meets WCAG 2.1 AA; touch targets are 44px on phone.
- Sick-leave comments and certificates appear only to the requester and HR.

Sample people, departments and figures on the canvas are placeholders.
