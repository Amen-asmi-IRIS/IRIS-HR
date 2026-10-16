#!/usr/bin/env bash
# Tests scripts/server/update.sh with stand-ins for git, docker, curl and sleep.
# Run: bash scripts/server/tests/update.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPDATE="$HERE/../update.sh"

failures=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
is() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got '$2', expected '$3')"; fi; }
contains() { if grep -q -- "$3" <<<"$2"; then pass "$1"; else fail "$1"; fi; }
lacks() { if grep -q -- "$3" <<<"$2"; then fail "$1"; else pass "$1"; fi; }
line_of() { grep -n -m 1 -- "$1" "$BOX/calls.log" | cut -d: -f1; }
in_order() { # description, then patterns that must appear in calls.log in this order
  local description="$1" last=0 line; shift
  for pattern in "$@"; do
    line="$(line_of "$pattern")"
    if [ -z "$line" ] || [ "$line" -le "$last" ]; then fail "$description (at: $pattern)"; return; fi
    last="$line"
  done
  pass "$description"
}

stub() { # name, body lines...
  local name="$1"; shift
  { echo '#!/usr/bin/env bash'; printf '%s\n' "$@"; } > "$BOX/bin/$name"
  chmod +x "$BOX/bin/$name"
}

# A stack directory with a server .env, and stand-ins that record every call.
new_box() {
  BOX="$(mktemp -d)"
  mkdir -p "$BOX/bin" "$BOX/scripts/server/state"
  printf '%s\n' \
    'COMPOSE_PATH_SEPARATOR=:' 'COMPOSE_FILE=compose.yaml:compose.server.yaml' 'APP_VERSION=v1.0.0' \
    'SITE_HOSTNAME=hr.test.local' 'HTTPS_PORT=8443' 'POSTGRES_DB=iris_hr' > "$BOX/.env"
  cp "$BOX/.env" "$BOX/next.env.example"     # what "git show <version>:.env.example" prints
  : > "$BOX/calls.log"
  echo ok > "$BOX/health"
  stub git 'echo "git $*" >> "$IRIS_ROOT/calls.log"' 'case " $* " in *" show "*) cat "$IRIS_ROOT/next.env.example" ;; esac' 'exit 0'
  stub docker 'echo "docker[APP_VERSION=${APP_VERSION:-}] $*" >> "$IRIS_ROOT/calls.log"' 'exit 0'
  stub curl 'echo "curl $*" >> "$IRIS_ROOT/calls.log"' '[ "$(cat "$IRIS_ROOT/health")" = ok ]'
  stub sleep 'exit 0'
  ENV_SUM="$(cksum < "$BOX/.env")"
}
run_update() { IRIS_ROOT="$BOX" IRIS_HEALTH_TRIES=2 PATH="$BOX/bin:$PATH" bash "$UPDATE" "$@" 2>&1; }
calls() { cat "$BOX/calls.log"; }

# 1. A wrong argument changes nothing.
new_box
out="$(run_update)"; code=$?
is "no version: exit code 2" "$code" "2"
contains "no version: shows the usage" "$out" "Usage: scripts/server/update.sh vX.Y.Z"
out="$(run_update 1.2.0)"; code=$?
is "a version without the v: exit code 2" "$code" "2"
is "a wrong argument calls nothing" "$(calls)" ""
rm -rf "$BOX"

# 2. It refuses to run on a development stack.
new_box
sed -i 's/compose.server.yaml/compose.dev.yaml/' "$BOX/.env"
out="$(run_update v1.2.0)"; code=$?
is "a development .env: exit code 1" "$code" "1"
contains "a development .env: says why" "$out" "not a server stack"
is "a development .env: calls nothing" "$(calls)" ""
rm -rf "$BOX"

# 3. A variable missing from .env stops the update before anything changes.
new_box
echo v1.1.0 > "$BOX/scripts/server/state/release"
echo 'NEW_VARIABLE=1' >> "$BOX/next.env.example"
out="$(run_update v1.2.0)"; code=$?
is "missing variable: exit code 1" "$code" "1"
contains "missing variable: it is named" "$out" "^  NEW_VARIABLE$"
contains "missing variable: says nothing was changed" "$out" "Nothing was changed"
lacks "missing variable: the version is not checked out" "$(calls)" "checkout"
lacks "missing variable: docker is not called" "$(calls)" "^docker"
is "missing variable: .env is untouched" "$(cksum < "$BOX/.env")" "$ENV_SUM"
is "missing variable: the recorded version is unchanged" "$(cat "$BOX/scripts/server/state/release")" "v1.1.0"
rm -rf "$BOX"

# 4. A first installation: no dump, then pull, migrate, restart, health.
new_box
out="$(run_update v1.2.0)"; code=$?
is "first installation: exit code 0" "$code" "0"
in_order "first installation: the steps run in order" \
  "git .*fetch" "git .*show v1.2.0:.env.example" "git .*checkout .*v1.2.0" \
  "docker\[APP_VERSION=v1.2.0\] compose pull" "docker\[APP_VERSION=v1.2.0\] compose run .*migrate" \
  "docker\[APP_VERSION=v1.2.0\] compose up -d" "curl .*https://hr.test.local:8443/api/v1/health"
lacks "first installation: nothing is dumped" "$(calls)" "pg_dump"
contains "first installation: says so" "$out" "no database to dump"
is "first installation: the version is recorded" "$(cat "$BOX/scripts/server/state/release")" "v1.2.0"
is "first installation: .env is untouched" "$(cksum < "$BOX/.env")" "$ENV_SUM"
contains "first installation: points to compose.sh" "$out" "scripts/server/compose.sh"
rm -rf "$BOX"

# 5. An update: the database is dumped with the running version, before the new images are pulled.
new_box
echo v1.1.0 > "$BOX/scripts/server/state/release"
out="$(run_update v1.2.0)"; code=$?
is "update: exit code 0" "$code" "0"
in_order "update: dump, then pull, migrate, restart, health" \
  "git .*checkout .*v1.2.0" "docker\[APP_VERSION=v1.1.0\] compose run .*app bash" "pg_dump" \
  "docker\[APP_VERSION=v1.2.0\] compose pull" "docker\[APP_VERSION=v1.2.0\] compose run .*migrate" \
  "docker\[APP_VERSION=v1.2.0\] compose up -d --no-build" "curl "
contains "update: the dump is encrypted" "$(calls)" "gpg .*--symmetric"
contains "update: says where the dump is" "$out" "/data/backups/pre-update/.*before-v1.2.0.dump.gpg"
is "update: the new version is recorded" "$(cat "$BOX/scripts/server/state/release")" "v1.2.0"
is "update: the one before is recorded" "$(cat "$BOX/scripts/server/state/previous")" "v1.1.0"
is "update: .env is untouched" "$(cksum < "$BOX/.env")" "$ENV_SUM"
rm -rf "$BOX"

# 6. A version that does not become healthy: the way back is printed, nothing is recorded.
new_box
echo v1.1.0 > "$BOX/scripts/server/state/release"
echo down > "$BOX/health"
out="$(run_update v1.2.0)"; code=$?
is "unhealthy: exit code 1" "$code" "1"
contains "unhealthy: says so" "$out" "v1.2.0 did not become healthy"
contains "unhealthy: prints the command to return to the previous version" "$out" "scripts/server/update.sh v1.1.0"
contains "unhealthy: prints where the dump is" "$out" "/data/backups/pre-update/"
is "unhealthy: it tried as often as it was told" "$(grep -c '^curl ' "$BOX/calls.log")" "2"
is "unhealthy: the recorded version is unchanged" "$(cat "$BOX/scripts/server/state/release")" "v1.1.0"
rm -rf "$BOX"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "update.test.sh: all passed"
