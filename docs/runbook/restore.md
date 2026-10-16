# Runbook: backups and restore

## 1. What is backed up, and what is not

Every night at 23:30 the worker writes two files to the backup volume of the stack (`/data/backups`):

| File | Content |
|---|---|
| `db-YYYYMMDD-HHMMSS.dump.gpg` | The whole database |
| `files-YYYYMMDD-HHMMSS.tar.gz.gpg` | Every uploaded file (medical certificates stay encrypted inside it) |

Both are encrypted with `BACKUP_PASSPHRASE`. Fourteen days are kept. Each update also leaves a database dump in
`/data/backups/pre-update/` (the ten newest are kept).

**Not in the backup: the `.env` of the stack.** Keep it in the password safe. Without `BACKUP_PASSPHRASE` no
backup can be read; without `FILE_ENCRYPTION_KEY` the medical certificates inside a restored backup cannot be read.

**Known limit.** The backups are on the same server as the data. A fire, a theft or a failed disk loses both,
until an off-site destination is chosen (PRD, open item 4). Until then, copy the backup volume to an encrypted
external disk once a week and keep the disk in another building:

```bash
sudo rsync -a --delete "$(docker volume inspect -f '{{ .Mountpoint }}' <test or prod>_backup_data)/" /media/<disk>/iris-hr-<test or prod>/
```

## 2. See the backups

```bash
cd /opt/iris-hr/<test or prod>
scripts/server/compose.sh exec app ls -lh /data/backups /data/backups/pre-update
```

The Status page of the Administration workspace shows the time and size of the last backup and the space used.
A backup that failed three times in a row raises a notification to every System Administrator.

## 3. Restore a stack

This replaces the database and the files of the stack with those of a backup. Everything entered since that
backup is lost. The command takes a fresh backup of the current state first, so a wrong restore can be undone.

```bash
cd /opt/iris-hr/<test or prod>
scripts/server/restore.sh --replace                                   # the newest nightly pair
scripts/server/restore.sh --replace db-20261102-233000.dump.gpg files-20261102-233000.tar.gz.gpg
scripts/server/restore.sh --replace pre-update/<file>.dump.gpg        # a dump taken before an update: database only
```

It asks you to type the name of the stack (`test` or `prod`), then prints five steps and `Restore complete.`
About five minutes without service.

Afterwards: sign in, open Status, and tell HR which day the data is from.

## 4. Every quarter: prove that a backup restores

On the production stack, in the first week of January, April, July and October (the check changes nothing and the stack keeps running):

```bash
cd /opt/iris-hr/prod
scripts/server/restore.sh --check
```

Expected: `Restoring db-… into iris_restore_check_…`, one line per table with its number of rows, then
`Restore check passed`. The check restores into a scratch database, counts, and drops it; the stack keeps running.

The check proves the database. Once a year, prove the whole path, files included, on the test stack with production's backup:

1. Copy the newest pair from the production backup volume into the test backup volume.
2. Put production's `BACKUP_PASSPHRASE` and `FILE_ENCRYPTION_KEY` in the test stack's `.env` for the duration of the test, and restart it: `scripts/server/compose.sh up -d`.
3. `scripts/server/restore.sh --replace <db file> <files file>` on the test stack.
4. Sign in as HR on the test stack, open an employee's record and download a medical certificate: it must open.
5. Put the test stack's own two values back in its `.env` and reinstall it (`install.md`, from section 4).

Record each test:

| Date | Stack | Backup file | Result | By |
|---|---|---|---|---|
| | | | | |

## 5. When there is no recent backup

Status shows the backup job among the failures, or a last backup older than a day.

```bash
scripts/server/compose.sh logs --tail 100 worker
scripts/server/compose.sh exec app python manage.py backup_now
scripts/server/compose.sh exec app df -h /data/backups
```

- `BACKUP_PASSPHRASE is empty`: the variable is missing from `.env`. Put it back from the password safe.
- `No space left on device`: the volume is full. Fourteen days of backups of this system need a few gigabytes; find what else filled the disk.
- `pg_dump failed`: the database is not answering; `scripts/server/compose.sh ps` and the logs of `db`.

## 6. The server is lost

1. Install a new server and a stack with `install.md`, sections 1 to 4, using the `.env` from the password safe.
2. Copy the newest pair of backup files from the external disk into the new stack's backup volume.
3. `scripts/server/restore.sh --replace <db file> <files file>`.
4. `install.md`, sections 5 and 6.

What was entered after the last backup that left the building is lost. That is the recovery point of this
installation until an off-site destination exists.
