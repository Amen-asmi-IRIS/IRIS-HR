#!/usr/bin/env bash
# Tests scripts/server/restore.sh with stand-ins for docker, curl and sleep.
# Run: bash scripts/server/tests/restore.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESTORE="$HERE/../restore.sh"

failures=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
is() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got '$2', expected '$3')"; fi; }
contains() { if grep -q -- "$3" <<<"$2"; then pass "$1"; else fail "$1"; fi; }
lacks() { if grep -q -- "$3" <<<"$2"; then fail "$1"; else pass "$1"; fi; }
line_of() { grep -n -m 1 -- "$1" "$BOX/calls.log" | cut -d: -f1; }
in_order() {
  local description="$1" last=0 line; shift
  for pattern in "$@"; do
    line="$(line_of "$pattern")"
    if [ -z "$line" ] || [ "$line" -le "$last" ]; then fail "$description (at: $pattern)"; return; fi
    last="$line"
  done
  pass "$description"
}
stub() {
  local name="$1"; shift
  { echo '#!/usr/bin/env bash'; printf '%s\n' "$@"; } > "$BOX/bin/$name"
  chmod +x "$BOX/bin/$name"
}
new_box() {
  BOX="$(mktemp -d)"
  mkdir -p "$BOX/bin" "$BOX/scripts/server/state"
  printf '%s\n' \
    'COMPOSE_PATH_SEPARATOR=:' 'COMPOSE_FILE=compose.yaml:compose.server.yaml' 'APP_VERSION=v1.0.0' \
    'SITE_HOSTNAME=hr.test.local' 'HTTPS_PORT=8443' 'POSTGRES_DB=iris_hr' > "$BOX/.env"
  echo v1.1.0 > "$BOX/scripts/server/state/release"
  : > "$BOX/calls.log"
  echo ok > "$BOX/health"
  stub docker 'echo "docker[APP_VERSION=${APP_VERSION:-}] $*" >> "$IRIS_ROOT/calls.log"' 'exit 0'
  stub curl 'echo "curl $*" >> "$IRIS_ROOT/calls.log"' '[ "$(cat "$IRIS_ROOT/health")" = ok ]'
  stub sleep 'exit 0'
  STACK="$(basename "$BOX")"
}
run_restore() { env -u APP_VERSION IRIS_ROOT="$BOX" IRIS_HEALTH_TRIES=2 PATH="$BOX/bin:$PATH" bash "$RESTORE" "$@" 2>&1; }
calls() { cat "$BOX/calls.log"; }

# 1. Without a mode it changes nothing.
new_box
out="$(run_restore)"; code=$?
is "no mode: exit code 2" "$code" "2"
contains "no mode: shows the usage" "$out" "Usage: scripts/server/restore.sh --check"
out="$(run_restore db-20261102-233000.dump.gpg)"; code=$?
is "a file without a mode: exit code 2" "$code" "2"
is "a wrong argument calls nothing" "$(calls)" ""
rm -rf "$BOX"

# 2. It refuses to run on a development stack.
new_box
sed -i 's/compose.server.yaml/compose.dev.yaml/' "$BOX/.env"
out="$(run_restore --check)"; code=$?
is "a development .env: exit code 1" "$code" "1"
contains "a development .env: says why" "$out" "not a server stack"
is "a development .env: calls nothing" "$(calls)" ""
rm -rf "$BOX"

# 3. --check restores into a scratch database and stops nothing.
new_box
out="$(run_restore --check)"; code=$?
is "check: exit code 0" "$code" "0"
contains "check: asks for the scratch restore" "$(calls)" "docker\[APP_VERSION=v1.1.0\] compose run .*app python manage.py restore_backup --scratch$"
lacks "check: stops nothing" "$(calls)" "compose stop"
lacks "check: starts nothing" "$(calls)" "compose up"
rm -rf "$BOX"

# 4. --check with a file names it.
new_box
out="$(run_restore --check pre-update/20261102T220000Z-before-v1.2.0.dump.gpg)"; code=$?
is "check a named dump: exit code 0" "$code" "0"
contains "check a named dump: the file is passed" "$(calls)" "restore_backup --scratch --db pre-update/20261102T220000Z-before-v1.2.0.dump.gpg$"
rm -rf "$BOX"

# 5. --replace asks for the stack name and stops when it is not typed.
new_box
out="$(run_restore --replace <<<"wrong-name")"; code=$?
is "wrong name: exit code 1" "$code" "1"
contains "wrong name: says nothing was changed" "$out" "Nothing was changed"
is "wrong name: calls nothing" "$(calls)" ""
rm -rf "$BOX"

# 6. --replace: back up, stop, restore, migrate, start, health; on the deployed version.
new_box
env_sum="$(cksum < "$BOX/.env")"
out="$(run_restore --replace <<<"$STACK")"; code=$?
is "replace: exit code 0" "$code" "0"
is "replace: .env is untouched" "$(cksum < "$BOX/.env")" "$env_sum"
in_order "replace: the steps run in order" \
  "compose run .*manage.py backup_now" "compose stop proxy app worker" \
  "compose run .*manage.py restore_backup --in-place --yes$" "compose run .*manage.py migrate --noinput" \
  "compose up -d --no-build" "curl .*https://hr.test.local:8443/api/v1/health"
lacks "replace: never the version of .env" "$(calls)" "APP_VERSION=v1.0.0"
contains "replace: says it is complete" "$out" "Restore complete"
rm -rf "$BOX"

# 7. --replace with named files passes both.
new_box
out="$(run_restore --replace db-20261102-233000.dump.gpg files-20261102-233000.tar.gz.gpg <<<"$STACK")"; code=$?
is "replace named files: exit code 0" "$code" "0"
contains "replace named files: both are passed" "$(calls)" \
  "restore_backup --in-place --yes --db db-20261102-233000.dump.gpg --files files-20261102-233000.tar.gz.gpg$"
rm -rf "$BOX"

# 8. A stack that does not come back: say so, exit 1.
new_box
echo down > "$BOX/health"
out="$(run_restore --replace <<<"$STACK")"; code=$?
is "unhealthy: exit code 1" "$code" "1"
contains "unhealthy: says so" "$out" "did not become healthy"
is "unhealthy: it tried as often as it was told" "$(grep -c '^curl ' "$BOX/calls.log")" "2"
rm -rf "$BOX"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "restore.test.sh: all passed"
