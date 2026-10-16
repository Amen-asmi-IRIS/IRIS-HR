#!/usr/bin/env bash
# Moves this stack to a version, in the seven steps of the specification:
#   1 fetch the version    2 check .env    3 dump the database    4 pull the images
#   5 apply migrations     6 restart       7 check /health
# It never writes to .env. If .env lacks a variable the version needs, it stops before changing anything.
#
# Usage: scripts/server/update.sh vX.Y.Z
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# /health answers 503 until the worker's first heartbeat, up to about 90 seconds after a restart:
# 36 tries, 5 seconds apart, give it three minutes.
HEALTH_TRIES="${IRIS_HEALTH_TRIES:-36}"

step() { log ""; log "[$1/7] $2"; }

wait_for_health() {
  local host port
  host="$(env_value SITE_HOSTNAME)"
  port="$(env_value HTTPS_PORT)"
  port="${port:-443}"
  for _ in $(seq 1 "$HEALTH_TRIES"); do
    # Asked through the proxy, as a browser would. --insecure because the certificate may come from
    # Caddy's own authority, which this machine need not trust to probe itself.
    if curl --fail --silent --insecure --max-time 5 --output /dev/null \
      --resolve "$host:$port:127.0.0.1" "https://$host:$port/api/v1/health"; then
      return 0
    fi
    sleep 5
  done
  return 1
}

fetch_and_check() {
  local version="$1" example
  step 1 "Fetching $version"
  git -C "$ROOT" fetch --tags --force --quiet origin
  git -C "$ROOT" rev-parse --quiet --verify "refs/tags/$version^{commit}" >/dev/null || die "There is no version $version."

  step 2 "Checking .env against the .env.example of $version"
  example="$(mktemp)"
  git -C "$ROOT" show "$version:.env.example" > "$example"
  if ! bash "$HERE/check-env.sh" "$ENV_FILE" "$example"; then
    rm -f "$example"
    die "Nothing was changed."
  fi
  rm -f "$example"

  # Only now do the compose files and scripts of the version replace the ones in place.
  git -C "$ROOT" checkout --quiet --detach "$version"
}

apply() {
  local version="$1" previous="" dump=""
  if [ -s "$STATE/release" ]; then previous="$(cat "$STATE/release")"; fi

  if [ -n "$previous" ]; then
    step 3 "Dumping the database, with the version in place ($previous)"
    dump="$(APP_VERSION="$previous" bash "$HERE/dump.sh" "before-$version")"
    log "Dump: $dump"
  else
    step 3 "First installation: there is no database to dump"
  fi

  # From here on every compose command uses the new version. This overrides APP_VERSION from .env
  # for this run only; .env itself is not touched.
  export APP_VERSION="$version"

  step 4 "Pulling the images of $version"
  compose pull --quiet

  step 5 "Applying database migrations"
  compose run --rm -T app python manage.py migrate --noinput

  step 6 "Restarting the containers"
  compose up -d --no-build --remove-orphans

  step 7 "Waiting for /health, up to $((HEALTH_TRIES * 5)) seconds"
  if wait_for_health; then
    mkdir -p "$STATE"
    printf '%s\n' "$previous" > "$STATE/previous"
    printf '%s\n' "$version" > "$STATE/release"
    log ""
    log "Update to $version complete."
    log "For any later command use scripts/server/compose.sh, which stays on $version."
    return 0
  fi

  log ""
  log "ERROR: $version did not become healthy."
  log "What it says:                 APP_VERSION=$version docker compose logs --tail 100 app worker proxy"
  if [ -n "$previous" ]; then
    log "Return to the previous one:   scripts/server/update.sh $previous"
    log "Database dump taken before:   $dump (in the backup volume)"
  fi
  exit 1
}

main() {
  local version="${1:-}"
  if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    log "Usage: scripts/server/update.sh vX.Y.Z"
    exit 2
  fi
  require_server_stack
  if [ "${IRIS_UPDATE_STAGE:-fetch}" = "fetch" ]; then
    fetch_and_check "$version"
    # The checkout may have replaced this very file: carry on with the script of the new version.
    IRIS_UPDATE_STAGE=apply exec bash "$HERE/update.sh" "$version"
  fi
  apply "$version"
}

main "$@"
