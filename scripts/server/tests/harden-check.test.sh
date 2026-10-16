#!/usr/bin/env bash
# Tests the parts of scripts/server/harden-check.sh that do not need a real server:
# the .env rules. Run: bash scripts/server/tests/harden-check.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$HERE/../harden-check.sh"

failures=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
is() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got '$2', expected '$3')"; fi; }
contains() { if grep -q -- "$3" <<<"$2"; then pass "$1"; else fail "$1"; fi; }
lacks() { if grep -q -- "$3" <<<"$2"; then fail "$1"; else pass "$1"; fi; }

# The rules on file modes need a file system that has them (Linux, the pipeline). Git Bash on Windows has none.
probe="$(mktemp)"; chmod 600 "$probe"
if [ "$(stat -c '%a' "$probe" 2>/dev/null)" != "600" ]; then
  rm -f "$probe"
  echo "skipped: this file system has no permission bits; the pipeline runs this test on Linux"
  exit 0
fi
rm -f "$probe"

new_box() {
  BASE="$(mktemp -d)"
  BOX="$BASE/prod"
  mkdir -p "$BOX/bin" "$BASE/test"
  printf '%s\n' \
    'COMPOSE_PATH_SEPARATOR=:' 'COMPOSE_FILE=compose.yaml:compose.server.yaml' 'ENVIRONMENT=production' \
    'APP_VERSION=v0.9.0' 'SITE_HOSTNAME=hr.impactrisks.lan' 'DJANGO_ALLOWED_HOSTS=hr.impactrisks.lan' \
    'HTTPS_PORT=443' 'HTTP_PORT=80' 'DJANGO_SECRET_KEY=prod-secret-0123456789abcdef0123456789abcdef' \
    'POSTGRES_PASSWORD=prod-database-password' 'FILE_ENCRYPTION_KEY=prod-file-key-0123456789' 'BACKUP_PASSPHRASE=prod-passphrase-0123456789' \
    > "$BOX/.env"
  chmod 600 "$BOX/.env"
  printf '%s\n' \
    'DJANGO_SECRET_KEY=change-me' 'POSTGRES_PASSWORD=change-me' 'FILE_ENCRYPTION_KEY=change-me' 'BACKUP_PASSPHRASE=change-me' \
    > "$BOX/.env.example"
  sed -e 's/prod-/test-/g' -e 's/ENVIRONMENT=production/ENVIRONMENT=test/' -e 's/=443/=8443/' -e 's/=80$/=8080/' \
      -e 's/hr.impactrisks.lan/hr-test.impactrisks.lan/g' "$BOX/.env" > "$BASE/test/.env"
  chmod 600 "$BASE/test/.env"
}
# Only the .env rules are run: the checks of the machine itself are skipped with IRIS_ENV_ONLY=1.
run_check() { IRIS_ROOT="$BOX" IRIS_ENV_ONLY=1 bash "$CHECK" 2>&1; }

# 1. A sound .env passes.
new_box
out="$(run_check)"; code=$?
is "a sound .env: exit code 0" "$code" "0"
lacks "a sound .env: no failure" "$out" "^FAIL"
rm -rf "$BASE"

# 2. A .env that others can read fails.
new_box
chmod 644 "$BOX/.env"
out="$(run_check)"; code=$?
is "a readable .env: exit code 1" "$code" "1"
contains "a readable .env: says so" "$out" "FAIL  .env is readable by others"
rm -rf "$BASE"

# 3. A value left as in .env.example fails, and the value is not printed.
new_box
sed -i 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=change-me/' "$BOX/.env"
out="$(run_check)"; code=$?
is "an example value: exit code 1" "$code" "1"
contains "an example value: names the variable" "$out" "FAIL  POSTGRES_PASSWORD still has the value of .env.example"
lacks "an example value: never prints a secret" "$out" "prod-secret"
rm -rf "$BASE"

# 4. A secret shared with the other stack fails.
new_box
sed -i 's/^FILE_ENCRYPTION_KEY=.*/FILE_ENCRYPTION_KEY=test-file-key-0123456789/' "$BOX/.env"
out="$(run_check)"; code=$?
is "a shared secret: exit code 1" "$code" "1"
contains "a shared secret: names the variable" "$out" "FAIL  FILE_ENCRYPTION_KEY is the same in the stack 'test'"
rm -rf "$BASE"

# 5. Allowed hosts that differ from the site name fail; so does a development environment.
new_box
sed -i 's/^DJANGO_ALLOWED_HOSTS=.*/DJANGO_ALLOWED_HOSTS=*/' "$BOX/.env"
sed -i 's/^ENVIRONMENT=.*/ENVIRONMENT=development/' "$BOX/.env"
out="$(run_check)"; code=$?
is "wrong hosts and environment: exit code 1" "$code" "1"
contains "wrong hosts: says so" "$out" "FAIL  DJANGO_ALLOWED_HOSTS must be exactly SITE_HOSTNAME"
contains "wrong environment: says so" "$out" "FAIL  ENVIRONMENT must be test or production"
rm -rf "$BASE"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "harden-check.test.sh: all passed"
