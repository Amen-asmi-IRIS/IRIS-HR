# shellcheck shell=bash
# Shared by the server scripts. Source it: it defines names and runs nothing.

# The stack directory, where .env and the compose files are. The tests point IRIS_ROOT elsewhere.
ROOT="${IRIS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
STATE="$ROOT/scripts/server/state"
ENV_FILE="$ROOT/.env"

log() { printf '%s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# The names of the variables a file defines, sorted, one per line.
env_keys() {
  sed -e 's/\r$//' "$1" | { grep -E '^[A-Za-z_][A-Za-z0-9_]*=' || true; } | cut -d= -f1 | LC_ALL=C sort -u
}

# The value of one variable of the stack's .env, without surrounding quotes.
env_value() {
  local line
  line="$(sed -e 's/\r$//' "$ENV_FILE" | { grep -E "^$1=" || true; } | tail -n 1)"
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

# The version this stack runs: the one the last successful update recorded, else the one in .env.
deployed_version() {
  if [ -s "$STATE/release" ]; then cat "$STATE/release"; else env_value APP_VERSION; fi
}

# docker compose for this stack, at the deployed version unless the caller exported another one.
# A variable exported in the shell wins over the same variable in .env, which is how a version
# is changed without writing to .env.
compose() {
  (cd "$ROOT" && APP_VERSION="${APP_VERSION:-$(deployed_version)}" docker compose "$@")
}

require_server_stack() {
  [ -f "$ENV_FILE" ] || die "There is no .env in $ROOT. Run this in the stack directory on the server."
  case "$(env_value COMPOSE_FILE)" in
    *compose.server.yaml*) ;;
    *) die "COMPOSE_FILE in .env does not name compose.server.yaml: this is not a server stack." ;;
  esac
}
