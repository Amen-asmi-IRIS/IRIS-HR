#!/usr/bin/env bash
# Tests .github/scripts/make-env.sh.   Run from the repository root: bash .github/scripts/make-env.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

failures=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
is() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got '$2', expected '$3')"; fi; }
value() { grep -E "^$1=" "$TMP/.env" | cut -d= -f2-; }

# 1. From the real example: every variable is there, no placeholder is left, the secrets have the right shape.
bash "$HERE/make-env.sh" "$ROOT/.env.example" "$TMP/.env" >/dev/null 2>&1; code=$?
is "creates the file" "$code" "0"
bash "$ROOT/scripts/server/check-env.sh" "$TMP/.env" "$ROOT/.env.example" >/dev/null 2>&1; code=$?
is "defines every variable of .env.example" "$code" "0"
if grep -q 'change-me' "$TMP/.env"; then fail "leaves no placeholder"; else pass "leaves no placeholder"; fi
if [ "$(value DJANGO_SECRET_KEY | wc -c)" -ge 51 ]; then pass "the Django secret has at least 50 characters"; else fail "the Django secret has at least 50 characters"; fi
if [[ "$(value FILE_ENCRYPTION_KEY)" =~ ^[A-Za-z0-9_-]{43}=$ ]]; then pass "the file key is a Fernet key"; else fail "the file key is a Fernet key"; fi
if [ "$(value POSTGRES_PASSWORD | wc -c)" -ge 13 ]; then pass "the database password has at least 12 characters"; else fail "the database password has at least 12 characters"; fi
if [ "$(value BACKUP_PASSPHRASE | wc -c)" -ge 17 ]; then pass "the backup passphrase has at least 16 characters"; else fail "the backup passphrase has at least 16 characters"; fi
is "keeps the time zone the tests rely on" "$(value TIME_ZONE)" "Africa/Tunis"
is "keeps the email domain the tests rely on" "$(value ALLOWED_EMAIL_DOMAIN)" "impactrisks.com"
is "loads the development stack" "$(value COMPOSE_FILE)" "compose.yaml:compose.dev.yaml"

# 2. It never overwrites a .env.
before="$(cksum < "$TMP/.env")"
bash "$HERE/make-env.sh" "$ROOT/.env.example" "$TMP/.env" >/dev/null 2>&1; code=$?
is "refuses to overwrite an existing file" "$code" "1"
is "and leaves it as it was" "$(cksum < "$TMP/.env")" "$before"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "make-env.test.sh: all passed"
