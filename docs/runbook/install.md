# Runbook: install a stack

For the person who installs the IRIS HR platform on the office server. It creates one stack: the test stack,
or the production stack. The two live side by side on the same server, each in its own folder with its own
database, files, address and `.env`.

Time: about 45 minutes. You need: a shell on the server as the service account, the GitHub token of step 2,
and the address the stack will answer on.

| | Test stack | Production stack |
|---|---|---|
| Folder | `/opt/iris-hr/test` | `/opt/iris-hr/prod` |
| `ENVIRONMENT` | `test` | `production` |
| `HTTPS_PORT`, `HTTP_PORT` | `8443`, `8080` | `443`, `80` |
| `SITE_HOSTNAME` | for example `hr-test.impactrisks.lan` | for example `hr.impactrisks.lan` |

Rule for every command below: on the server, never type `docker compose` directly. Use
`scripts/server/compose.sh`, which stays on the version the last update deployed.

## 1. Check the server

- Ubuntu LTS, 4 cores, 8 GB of memory, SSD, full-disk encryption switched on at installation.
- The name of the stack resolves, from an office machine, to the server's address (ask whoever runs the office DNS).
- The firewall lets the office network reach the two ports of the stack, and nothing else from outside the office.

```bash
docker --version && docker compose version && git --version && curl --version | head -n 1
lsblk -o NAME,TYPE,FSTYPE | grep -c crypt
```

Expected: four version lines, then a number above zero (the disk is encrypted).

## 2. Give the service account read access to the code and the images

Create, on GitHub, a token with only "Contents: read" on the repository and "Packages: read". Then, as the
service account (a member of the `docker` group, not `root`):

```bash
git config --global credential.helper store
git clone https://github.com/Aymen53M/IRIS-HR.git /opt/iris-hr/<test or prod>
docker login ghcr.io --username <github user>
chmod 600 ~/.git-credentials ~/.docker/config.json
```

Expected: `Resolving deltas: 100%`, then `Login Succeeded`.

## 3. Write the `.env` of the stack

```bash
cd /opt/iris-hr/<test or prod>
cp .env.example .env
chmod 600 .env
openssl rand -hex 32                           # DJANGO_SECRET_KEY
openssl rand -hex 24                           # POSTGRES_PASSWORD
openssl rand -hex 24                           # BACKUP_PASSPHRASE
openssl rand -base64 32 | tr '+/' '-_'         # FILE_ENCRYPTION_KEY
```

Edit `.env`. Set the values of the table at the top, and:

| Variable | Value |
|---|---|
| `COMPOSE_FILE` | `compose.yaml:compose.server.yaml` |
| `APP_VERSION` | the version you install, for example `v1.0.0` |
| `IMAGE_PREFIX` | `ghcr.io/aymen53m/iris-hr` (lower case) |
| `DJANGO_ALLOWED_HOSTS` | the same name as `SITE_HOSTNAME` |
| `DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD`, `BACKUP_PASSPHRASE`, `FILE_ENCRYPTION_KEY` | the four values generated above; never reuse those of the other stack |

```bash
scripts/server/check-env.sh
```

Expected: `The .env is complete.`

**Keep a copy of this `.env` somewhere that is not this server** (the company's password safe). Without
`FILE_ENCRYPTION_KEY`, medical certificates cannot be read after a restore. Without `BACKUP_PASSPHRASE`, no
backup can be read at all.

## 4. Install the version

```bash
sha256sum .env > /tmp/env.before
scripts/server/update.sh v1.0.0
sha256sum --check /tmp/env.before
scripts/server/compose.sh ps
```

Expected: the seven steps, `First installation: there is no database to dump` at step 3, then
`Update to v1.0.0 complete.`; `.env: OK`; `app`, `db`, `proxy` and `worker` running, and only `proxy` with
published ports.

If step 7 fails: `DJANGO_ALLOWED_HOSTS` does not contain `SITE_HOSTNAME` (the API answers 400), or the registry
refuses the pull (`denied`: the token lacks "Packages: read", or `IMAGE_PREFIX` has an upper-case letter).

## 5. Let office machines trust the certificate

If the company supplies a certificate for the name, put its two files in `proxy/certs/` as the comment in
`proxy/Caddyfile` says, and run `scripts/server/compose.sh restart proxy`. Otherwise the stack uses Caddy's own
authority; export its root certificate and install it on the office machines ("Trusted Root Certification
Authorities" on Windows):

```bash
scripts/server/compose.sh exec -T proxy cat /data/caddy/pki/authorities/local/root.crt > iris-hr-root.crt
```

## 6. Check the stack from the outside

```bash
scripts/server/check-headers.sh https://<SITE_HOSTNAME>:<HTTPS_PORT> <HTTP_PORT>
```

Expected: every line starts with `ok`, the last line is `All checks passed.`

## 7. Create the first System Administrator

```bash
scripts/server/compose.sh exec app python manage.py create_sysadmin --email <first.last>@impactrisks.com --name "<First Last>"
```

Expected: a line `Temporary password: …`. It is shown once and expires after 24 hours. Hand it over in person.

## 8. Take the first backup and prove that it restores

```bash
scripts/server/compose.sh exec app python manage.py backup_now
scripts/server/restore.sh --check
```

Expected: two file names and a byte count, then a row count per table and `Restore check passed`. From now on a
backup is written every night at 23:30 and kept 14 days; the Status page of the Administration workspace shows
the last one.

## 9. Enter the company (production stack only)

This is the go-live sequence. Rehearse it on the test stack first.

| Step | Who | Where |
|---|---|---|
| 1. Give the HR role to the HR Responsible, the Executive role to the CEO and the Deputy CEO | System Administrator | Administration, Accounts, Create account |
| 2. Parameters: monthly credit, working days, certificate deadline, meal tickets, cut-off day. Leave "credits start on" empty for now | HR | HR desk, Settings, Parameters |
| 3. Public holidays of the year; exceptional-leave events and their days | HR | HR desk, Settings |
| 4. Departments and positions | HR | HR desk, Settings, Departments and positions |
| 5. Employees, managers first so that each employee can be given a manager | HR | HR desk, Employees, New employee |
| 6. The opening balance of each employee, dated the day before go-live (the sheet proposes that date) | HR | The employee's record, Balance |
| 7. "Credits start on": the first day of the go-live month | HR | HR desk, Settings, Parameters |
| 8. An account for each employee; hand over each temporary password in person | System Administrator | Administration, Status, "Employees with no account" |

After step 7 the month-end credit of each month is posted in the first hour after its last day (at 01:00 on
the 1st, Tunis time), dated that last day. Before step 7, nothing is credited, so the opening balances can be
entered over several days. Someone hired on or after the date of step 7 gets no opening balance: their monthly
credits are their balance, and days they bring from elsewhere are entered as an adjustment.

Two limits to know from the first day:

- A person who left and comes back needs a new employee record and a new account under another address: the old
  account cannot be enabled again, and the old address stays with the archived record.
- Production starts with no public holiday and no exceptional-leave event: HR enters them at step 3.

## 10. Hand over

- [ ] The `.env` is in the password safe, apart from the server.
- [ ] The System Administrator and HR have their guides (`docs/guides/`).
- [ ] The date of the next quarterly restore test is in the administrator's calendar (`restore.md`, section 4).
