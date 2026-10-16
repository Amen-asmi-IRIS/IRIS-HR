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

## F. What the automated checks could not cover (observer, from the hardening of plan 07)

The browser suite ran in a container on the developer machine, on Chromium (desktop and phone) and Firefox
(desktop). These were not seen by a person, nor run on the server.

| # | Step | Done | Notes |
|---|---|---|---|
| F1 | The whole browser suite on Edge (`E2E_BROWSER=edge`), and C11 by hand on Edge | [ ] | |
| F2 | `docs/ui-audit.md`: every box that is not "auto", as each of the five people, in both languages, desktop and phone | [ ] | |
| F3 | Pages at 360 px on a real phone (the suite emulates a Pixel 7 at 412 px) | [ ] | |
| F4 | On a calendar, "Nouvelle demande" on a working day opens the form with that day; with HR's working week set to Sunday to Thursday, Friday and Saturday are greyed and Sunday offers a request; the setting is put back | [ ] | |
| F5 | `scripts/server/check-headers.sh` against the test and the production stack: every line `ok` | [ ] | |
| F6 | Closing a task sheet with Escape returns the focus to its button; deciding a request from To decide leaves the focus on the page | [ ] | |
| F7 | One journey with a screen reader (NVDA on Windows) | [ ] | |

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

