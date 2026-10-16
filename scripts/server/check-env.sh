#!/usr/bin/env bash
# Compares a .env with a .env.example and lists the variables the .env lacks.
# It reads both files and writes nothing.
#
# Usage: scripts/server/check-env.sh [path/to/.env] [path/to/.env.example]
# Exit:  0 the .env is complete   1 variables are missing   2 a file is absent
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

main() {
  local env_file="${1:-$ENV_FILE}" example="${2:-$ROOT/.env.example}" missing name
  if [ ! -f "$env_file" ]; then
    log "ERROR: $env_file does not exist. Copy .env.example to .env and fill in every value."
    exit 2
  fi
  if [ ! -f "$example" ]; then
    log "ERROR: $example does not exist."
    exit 2
  fi
  # Lines that are in the example and not in the .env.
  missing="$(LC_ALL=C comm -13 <(env_keys "$env_file") <(env_keys "$example"))"
  if [ -n "$missing" ]; then
    log "The .env lacks variables that this version needs:"
    while IFS= read -r name; do log "  $name"; done <<<"$missing"
    log "See .env.example for what each one means, add them to $env_file, then run the command again."
    exit 1
  fi
  log "The .env is complete."
}

main "$@"
