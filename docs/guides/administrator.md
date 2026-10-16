# Guide for the System Administrator

You keep the platform running and decide who can sign in. You do not see requests, balances, documents or any
detail of an employee beyond their name and professional address: the Administration workspace holds none of it,
and the application refuses it to your role.

## What you open every morning: Status

| Block | What it tells you | What to do |
|---|---|---|
| Health | One line when everything works; otherwise which part fails (application, database, background jobs), with the version and the environment | See "When something is wrong" below |
| Accounts needing attention | Locked accounts; temporary passwords never used or expired; employees with no account yet | Unlock, reset, or create the account |
| Scheduled work | Each job, its last run and its result; failures first | A job that failed three times in a row also sends you a notification |
| Backup | Time and size of last night's backup, space used | Older than a day: `docs/runbook/restore.md`, section 5 |

## Create an account

1. Status or Accounts, then "Create account".
2. Choose the employee from the list of employees who have none. Their name and professional address come from
   the record HR entered. For an administrator who is not an employee, type a name and an address instead.
3. Tick the roles, if any (see below), and create.
4. The temporary password is shown **once**. Hand it over in person. It expires after 24 hours; the person must
   choose their own password at first sign-in.

Only addresses ending in `@impactrisks.com` are accepted.

## Roles

| Role | Give it to | Effect |
|---|---|---|
| HR | The HR Responsible and anyone IRIS names | The HR desk: all employees, all requests, medical certificates, settings |
| Executive Management | The CEO and the Deputy CEO | Overview: everything in read-only, except medical content; the security log |
| System Administrator | The technical maintainer | This workspace |

Employee and Manager are never given by hand: an account linked to an employee record is an employee, and
whoever has people reporting to them, or stands in for such a person, is a manager.

One account cannot be both HR and System Administrator. You cannot change your own roles, reset or disable your
own account, and the last administrator cannot be removed: ask another administrator.

## Passwords and locked accounts

- **Forgotten password.** Open the account, "Reset password", hand over the new temporary password in person.
  The person is told at next sign-in that their password was reset, and by whom. There is no "forgot password"
  link: you are the only way.
- **Locked account.** Five wrong passwords lock an account for 15 minutes. It unlocks by itself; "Unlock" does it
  at once. Ask the person first whether the attempts were theirs. The security log shows the address they came from.
- **Someone leaves.** HR records the departure; the account is disabled at that moment and every session of the
  person ends. You have nothing to do. The account of someone who left cannot be enabled again ("Enable" is not
  offered, and the account page says why); if the person returns, HR enters a new record and you create a new
  account under another address.
- **Disable an account** yourself only for an account with no employee record, or in an emergency.

## Parameters

| Parameter | Default | Meaning |
|---|---|---|
| Inactivity limit | 120 minutes | A session ends after this long without activity, and when the browser closes |
| Failed attempts before lock-out | 5 | |
| Lock-out duration | 15 minutes | Also the window of the per-address limit |
| Failed attempts per network address | 20 | Sign-in is refused from an address that failed this often in the window |
| Temporary-password lifetime | 24 hours | |
| Maximum upload size | 10 MB | |
| Accepted file types | PDF, JPG, PNG | |

Each line shows who changed it last and when. Every change is in the security log with the value before and after.

## Security log

Sign-ins, failed sign-ins, lock-outs, sign-outs, password changes and resets, accounts created and disabled,
role changes, parameter changes; each with the account, the time and the network address. Filter by period,
account and kind of event; a column header sorts; "Export" downloads what is shown. Executive Management reads
the same log.

Look at it when Status lists a locked account, and once a week for failed sign-ins from an address you do not know.

## When something is wrong

| You see | Do |
|---|---|
| Health: background jobs fail | On the server: `scripts/server/compose.sh logs --tail 100 worker`, then `scripts/server/compose.sh restart worker` |
| Health: database fails | `scripts/server/compose.sh ps`; the logs of `db`; the disk may be full: `df -h` |
| The page "being updated" outside an update | `scripts/server/compose.sh ps`, then `scripts/server/compose.sh up -d` |
| A user quotes a reference from "Something went wrong" | You received a notification with the same reference; search the logs for it: `scripts/server/compose.sh logs app \| grep <reference>` |
| No backup since yesterday | `docs/runbook/restore.md`, section 5 |

## Your recurring tasks

| When | What | Where |
|---|---|---|
| Every morning | Status | Administration |
| Every week | Failed sign-ins in the security log; copy of the backup volume to the external disk | `docs/runbook/restore.md`, section 1 |
| Every month | Operating-system patches; the new version of the application if there is one | `docs/runbook/update.md` |
| Every quarter | Restore test | `docs/runbook/restore.md`, section 4 |

## What you can technically reach, and must not

With a shell on the server you could read the database. The application cannot prevent that. Server logins are
personal and recorded by the operating system; the key that decrypts medical certificates is kept apart from the
data. Never copy the database or the backups off the server except as the restore runbook says.
