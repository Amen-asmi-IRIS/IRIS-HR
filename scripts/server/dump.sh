#!/usr/bin/env bash
# Writes an encrypted dump of the database to the backup volume and prints its path.
# The dump is made inside the backend image, which carries pg_dump and gpg, and encrypted
# with BACKUP_PASSPHRASE. The ten newest dumps of this kind are kept.
#
# Usage: scripts/server/dump.sh [label]
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

main() {
  local label="${1:-manual}" name
  [[ "$label" =~ ^[A-Za-z0-9._-]+$ ]] || die "The label may hold letters, digits, dots, dashes and underscores only."
  require_server_stack
  name="$(date -u +%Y%m%dT%H%M%SZ)-$label.dump.gpg"
  # The script below runs in the container: its variables are the container's, hence the single quotes.
  # shellcheck disable=SC2016
  compose run --rm -T app bash -c '
    set -euo pipefail
    umask 077
    mkdir -p /data/backups/pre-update
    out="/data/backups/pre-update/$1"
    trap "rm -f \"$out.part\"" EXIT
    PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --host db --username "$POSTGRES_USER" --format custom "$POSTGRES_DB" \
      | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 --output "$out.part" 3<<<"$BACKUP_PASSPHRASE"
    mv "$out.part" "$out"
    ls -1t /data/backups/pre-update/*.dump.gpg | tail -n +11 | xargs -r rm -f --
  ' dump "$name" >&2
  printf '/data/backups/pre-update/%s\n' "$name"
}

main "$@"
