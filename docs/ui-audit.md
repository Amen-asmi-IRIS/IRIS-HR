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
| 2026-10-14 | before v1.0.0 | The browser suite only (automatic rules) | A sheet or a confirmation left the focus on the page body when it closed; the unselected tab of a segmented control was under AA contrast; a switch was a 24px touch target on a phone | `1ff439e`, `ae3dd31`, `edc3edc`, `eaf824a` |

The boxes above that are not "auto" have not been ticked yet: nobody has walked the checklist by hand (no browser is opened on the developer machine). It is done at the rehearsal, signed in as each of the five people, in both languages, on a desktop and on a phone.
```
