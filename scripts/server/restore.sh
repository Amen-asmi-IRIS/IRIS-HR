#!/usr/bin/env bash
# Restores a backup on this stack, or proves that a backup restores.
#
# Usage: scripts/server/restore.sh --check [db-file]
#            restores into a scratch database, counts the rows, drops it; changes nothing
#        scripts/server/restore.sh --replace [db-file] [files-file]
#            replaces the database and the files of this stack
#
# File names are relative to /data/backups in the backup volume: a nightly pair
# (db-YYYYMMDD-HHMMSS.dump.gpg, files-YYYYMMDD-HHMMSS.tar.gz.gpg) or a dump made by dump.sh
# (pre-update/<UTC time>-<label>.dump.gpg, database only). Without a name: the newest nightly pair.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# /health answers 503 until the worker's first heartbeat: 36 tries, 5 seconds apart.
HEALTH_TRIES="${IRIS_HEALTH_TRIES:-36}"

usage() {
  log "Usage: scripts/server/restore.sh --check [db-file]"
  log "       scripts/server/restore.sh --replace [db-file] [files-file]"
  exit 2
}

# The work is done inside the backend image, which carries pg_restore and gpg.
manage() { compose run --rm -T app python manage.py "$@"; }

wait_for_health() {
  local host port
  host="$(env_value SITE_HOSTNAME)"
  port="$(env_value HTTPS_PORT)"
  port="${port:-443}"
  for _ in $(seq 1 "$HEALTH_TRIES"); do
    if curl --fail --silent --insecure --max-time 5 --output /dev/null \
      --resolve "$host:$port:127.0.0.1" "https://$host:$port/api/v1/health"; then
      return 0
    fi
    sleep 5
  done
  return 1
}

main() {
  local mode="${1:-}" db_file="${2:-}" files_file="${3:-}" stack answer
  case "$mode" in
    --check | --replace) ;;
    *) usage ;;
  esac
  require_server_stack

  if [ "$mode" = "--check" ]; then
    if [ -n "$db_file" ]; then
      manage restore_backup --scratch --db "$db_file"
    else
      manage restore_backup --scratch
    fi
    return 0
  fi

  stack="$(basename "$ROOT")"
  log "This REPLACES the database and the files of the stack '$stack' ($(env_value SITE_HOSTNAME))."
  log "A backup of the current state is taken first."
  read -r -p "Type the stack name to continue: " answer || answer=""
  [ "$answer" = "$stack" ] || die "Aborted. Nothing was changed."

  log ""
  log "[1/5] Backing up the current state"
  manage backup_now >&2

  log "[2/5] Stopping proxy, app and worker"
  compose stop proxy app worker

  log "[3/5] Restoring"
  local arguments=(restore_backup --in-place --yes)
  if [ -n "$db_file" ]; then arguments+=(--db "$db_file"); fi
  if [ -n "$files_file" ]; then arguments+=(--files "$files_file"); fi
  manage "${arguments[@]}"

  log "[4/5] Applying the migrations of the deployed version ($(deployed_version))"
  manage migrate --noinput

  log "[5/5] Starting, then waiting for /health, up to $((HEALTH_TRIES * 5)) seconds"
  compose up -d --no-build
  if wait_for_health; then
    log ""
    log "Restore complete."
    return 0
  fi
  die "The stack did not become healthy. See: scripts/server/compose.sh logs --tail 100 app worker proxy"
}

main "$@"
