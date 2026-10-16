# Runbook: update a stack

For the person who moves a stack to a new version. Always update the test stack first, use it for a day, then
update production outside business hours.

Time: about 10 minutes, of which 1 to 3 minutes without service.

## 1. Before

- Read the entry of the version in `CHANGELOG.md`. An entry that says "new variable" lists what to add to `.env`.
- Check that last night's backup exists: Administration, Status, "Backup". If it is older than a day, see
  `restore.md`, section 5, before going further.

## 2. Update

```bash
cd /opt/iris-hr/<test or prod>
sha256sum .env > /tmp/env.before
scripts/server/update.sh vX.Y.Z
sha256sum --check /tmp/env.before
```

Expected: seven numbered steps, then `Update to vX.Y.Z complete.` and `.env: OK`.

What the command does: it fetches the version, compares your `.env` with the `.env.example` of that version,
dumps the database into the backup volume (`/data/backups/pre-update/`), pulls the two images, applies the
database migrations, restarts the containers and waits for `/api/v1/health`. It never writes to `.env`.

## 3. When it stops at step 2

```
The .env lacks variables that this version needs:
  NEW_VARIABLE
Nothing was changed.
```

Open `.env.example` of the new version (`git show vX.Y.Z:.env.example`), read what the variable means, add it to
`.env`, and run the command again. The stack was not touched.

## 4. When it stops at step 7

The new version did not become healthy. The command prints three lines: how to read the logs, how to return to
the previous version, and where the dump taken before the update is.

```bash
APP_VERSION=vX.Y.Z docker compose logs --tail 100 app worker proxy      # the one place where plain docker compose is right: the version is not recorded yet
scripts/server/update.sh <previous version>
```

Returning to the previous version restarts the previous images. A migration that the new version applied stays
applied; versions are written so that the previous one still runs on it (a column is never removed in the version
that stops using it). If the previous version does not become healthy either, restore the dump taken before the
update: `restore.md`, section 3, with the file the update printed.

## 5. After

```bash
scripts/server/compose.sh ps
scripts/server/check-headers.sh https://<SITE_HOSTNAME>:<HTTPS_PORT> <HTTP_PORT>
```

- Sign in, open Administration, Status: every part healthy, the new version, every scheduled job with a recent run.
- Tell HR the update is done and what the changelog says changed for them.

## 6. Every month

- Operating-system patches on the server: `sudo apt update && sudo apt upgrade`, then reboot outside business
  hours. The stacks start again by themselves; check Status afterwards.
- Dependency updates arrive as a new version of the application. Install it as above.
