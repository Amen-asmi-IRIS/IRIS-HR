# IRIS HR

The internal HR platform of IRIS (Impact Risks & Insurance Solutions): leave and absence requests, approvals, balances, and the monthly figures for payroll.

- What it must do: `docs/superpowers/specs/2026-10-05-iris-hr-platform-prd-design.md`
- What it looks like, page by page: `docs/superpowers/specs/2026-10-05-iris-hr-platform-ui-design.md`
- How it is built, step by step: `docs/superpowers/plans/` (start with the master plan)

## What runs where

| Where | What |
|---|---|
| This machine (Windows 11, Docker Desktop) | The development stack: database, API, worker and the Vite server, with live reload |
| GitHub (private repository) | The code, the pipeline, the two images of each version. Never data, never secrets |
| The office server (Ubuntu, Docker) | The test stack, and the production stack at go-live. Each has its own `.env`, database and port |

## First run

You need Git, Docker Desktop and Node 24.

```powershell
git clone https://github.com/Aymen53M/IRIS-HR.git iris-hr
cd iris-hr
powershell -File scripts/dev.ps1 init      # creates .env with generated secrets, builds, migrates
docker compose up -d
docker compose exec app python manage.py seed_demo
```

Open http://localhost:5173 and sign in as `sysadmin@impactrisks.com` with `Correct-Horse-42!`. The other demo accounts use the same password: `ceo@`, `hr@`, `manager.a@`, `employee.a1@`, `employee.a2@`, `manager.b@`, `employee.b1@`, all at `impactrisks.com`.

If the folder is synced by OneDrive and git or Docker reports a locked or missing file, pause the synchronisation and retry.

## Every day

```powershell
powershell -File scripts/dev.ps1 update    # git pull, checks .env, rebuilds, migrates, restarts
```

The script never writes to your `.env`. When a version adds a variable to `.env.example`, it stops and names it: add it to `.env` by hand, then run the command again.

| To do this | Run this |
|---|---|
| Start or stop the stack | `docker compose up -d`, `docker compose down` |
| See what the API says | `docker compose logs -f app` |
| Start again from an empty database | `powershell -File scripts/dev.ps1 reset -Yes` |
| Regenerate the API description and its TypeScript types | `powershell -File scripts/dev.ps1 openapi` |

## Tests

| What | Command |
|---|---|
| Backend | `docker compose run --rm app pytest -q` |
| Backend, one test | `docker compose run --rm app pytest apps/accounts/tests/test_auth.py::test_name -v` |
| Backend lint | `docker compose run --rm app ruff check .` and `docker compose run --rm app ruff format --check .` |
| Frontend | `docker compose run --rm web npm test` |
| Frontend, one file | `docker compose run --rm web npx vitest run src/features/accounts` |
| Frontend lint and types | `docker compose run --rm web npm run lint` and `docker compose run --rm web npm run typecheck` |
| Server scripts | `bash scripts/server/tests/check-env.test.sh` and `bash scripts/server/tests/update.test.sh` |
| Proxy image | `bash proxy/tests/smoke.sh` |
| Browser journeys | `cd frontend; npx playwright test` |
| Browser journeys, in a container | `bash scripts/e2e-container.sh` |

The browser journeys run on this machine, not in a container, against the running stack. Install them once with `cd frontend; npm ci; npx playwright install chromium`. **They empty the development database** before they start, then load the demo accounts.

There is a second way, with Playwright and its browser in a container: `bash scripts/e2e-container.sh` (from Git Bash; it takes the same arguments, for example `sign-in --project=phone`). It needs no `npm ci` on this machine, it also empties the development database first, and it leaves the report in `frontend/playwright-report` as the first way does. Use it where the first way misbehaves: on a Windows machine whose project folder is synced by OneDrive, `npm ci` in `frontend/` slows every file access for a long time, and a browser started on the host was seen not to finish closing, so that the run never ends although every journey has passed.

Frontend tests run in French, so they look for French labels. A missing translation key fails the test that meets it, and `src/i18n/parity.test.ts` fails when French and English do not have the same keys.

## When the API changes

The frontend never writes an API type by hand. After changing a serializer or a view:

```powershell
powershell -File scripts/dev.ps1 openapi
```

This rewrites `backend/openapi.yaml` and `frontend/src/api/schema.d.ts`. Commit both. The pipeline fails when either is stale.

## Adding a page

1. Write the page in `frontend/src/features/<feature>/` with its test next to it.
2. Put its texts in `frontend/src/i18n/locales/fr/<feature>.json` and `en/<feature>.json`.
3. Append its route to `frontend/src/workspaces/<workspace>/routes.tsx` (or to `frontend/src/app/sharedRoutes.tsx` for a page that belongs to no workspace).

The navigation entry of the workspace appears by itself once a route has its path. Nothing in `frontend/src/app/workspaces.ts` or `router.tsx` needs to change.

## From a commit to the server

1. Every push runs the checks: Ruff, ESLint, `tsc`, backend tests against PostgreSQL, frontend tests, the API description, dependency vulnerabilities, both image builds and the browser journeys.
2. A version is a tag: `git tag v1.2.0; git push origin v1.2.0`. The same checks run, then GitHub publishes `ghcr.io/aymen53m/iris-hr-backend:v1.2.0` and `ghcr.io/aymen53m/iris-hr-proxy:v1.2.0`.
3. On the server, in the directory of the stack to update:

   ```bash
   scripts/server/update.sh v1.2.0
   ```

   It fetches the version, checks `.env` against that version's `.env.example` (and stops, having changed nothing, if a variable is missing), dumps the database, pulls the two images, applies the migrations, restarts the containers and waits for `/api/v1/health`. If the version does not become healthy it prints the command that returns to the previous one and where the dump is.

Three things to know about the server:

- `update.sh` never writes to `.env`. The version in use is recorded in `scripts/server/state/release`, so on the server use `scripts/server/compose.sh` wherever you would type `docker compose`: it stays on the deployed version.
- In a server `.env`: `COMPOSE_FILE=compose.yaml:compose.server.yaml`, `IMAGE_PREFIX=ghcr.io/aymen53m/iris-hr`, `SITE_HOSTNAME` is the name people type, and `DJANGO_ALLOWED_HOSTS` contains that same name. The test stack and the production stack differ by `ENVIRONMENT`, `SITE_HOSTNAME`, `HTTPS_PORT` and `HTTP_PORT`.
- HTTPS uses Caddy's own certificate authority unless `proxy/certs/site.crt` and `proxy/certs/site.key` exist in the stack directory.

The full installation, update and restore runbook is `docs/runbook.md` (written in the last build step).

## Documents

| For | Document |
|---|---|
| Installing a stack | `docs/runbook/install.md` |
| Updating a stack | `docs/runbook/update.md` |
| Backups and restore | `docs/runbook/restore.md` |
| The System Administrator | `docs/guides/administrator.md` |
| HR | `docs/guides/hr.md` |
| Every employee | `docs/guides/employee.fr.md`, `docs/guides/employee.en.md` |
| What was decided, and why | `docs/superpowers/specs/` (before the build), `docs/decisions.md` (since) |
| Who may call what | `docs/permission-matrix.md` |
| Checking the interface | `docs/ui-audit.md` |
| Versions | `CHANGELOG.md` |
