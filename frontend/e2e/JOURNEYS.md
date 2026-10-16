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
