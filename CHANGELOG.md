# Changelog

Versions follow semantic versioning. Each version is a tag `vX.Y.Z`; its two images are published under the same tag.

## v0.1.0

Build step 1, Foundation.

- Sign-in with the professional email, lock-out, temporary passwords, forced change at first sign-in.
- Roles and the five workspaces; Administration with status, accounts, parameters and the security log.
- In-app notifications; French and English throughout.
- Audit trail of every sign-in, account, role and parameter change.
- Development stack in Docker, pipeline on every push, server update in one command.

## v1.0.0 (not released)

The first release: build steps 1 to 7 of the specification. Not tagged yet: it is tagged after the go-live
rehearsal on the office server (master plan D43), which has not taken place.

- Employee records, departments, positions, documents, profile changes decided by HR, departures.
- Five request types (annual, sick, exceptional leave, hourly permission, remote work) through configurable
  approval steps: line manager, then HR; delegation; decisions recorded on behalf; changes after approval.
- Annual-leave balance as a ledger: opening balance, month-end credit, leave taken, days given back, adjustments.
- Department, team and company calendars following HR's working week; a home for each role; in-app notifications.
- Six reports and the KPMG export; activity log and security log.
- Nightly encrypted backup with a restore command; `scripts/server/restore.sh`, `scripts/server/check-headers.sh`.
- Every paginated list can be sorted (`ordering`); the large tables sort from their column headers.
- French and English throughout; checked for WCAG 2.1 AA on every page; Chrome and Firefox checked automatically,
  Edge and phones at the rehearsal.
- The pipeline runs by hand, on pull requests and for a release, no longer on every push (D51).

No new variable in `.env` since v0.1.0.
