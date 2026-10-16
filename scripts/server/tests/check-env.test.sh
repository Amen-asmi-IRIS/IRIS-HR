#!/usr/bin/env bash
# Tests scripts/server/check-env.sh.   Run: bash scripts/server/tests/check-env.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$HERE/../check-env.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

failures=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }
is() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got '$2', expected '$3')"; fi; }
contains() { if grep -q -- "$3" <<<"$2"; then pass "$1"; else fail "$1"; fi; }
lacks() { if grep -q -- "$3" <<<"$2"; then fail "$1"; else pass "$1"; fi; }

printf 'A=1\nB=2\n# C arrived in this version\nC=3\nD=4\n' > "$TMP/example"

# 1. A complete .env passes; a variable the example does not know is not a problem.
printf 'A=x\nB=y\nC=\nD=w\nEXTRA=1\n' > "$TMP/env"
out="$(bash "$CHECK" "$TMP/env" "$TMP/example" 2>&1)"; code=$?
is "a complete .env passes" "$code" "0"
lacks "an extra variable is not reported" "$out" "EXTRA"

# 2. Missing variables are named, and nothing is written.
printf 'A=x\nB=y\n' > "$TMP/env"
before="$(cksum < "$TMP/env")"; listing="$(ls -A "$TMP")"
out="$(bash "$CHECK" "$TMP/env" "$TMP/example" 2>&1)"; code=$?
is "an incomplete .env fails with exit code 1" "$code" "1"
contains "the first missing variable is named" "$out" "^  C$"
contains "the second missing variable is named" "$out" "^  D$"
lacks "a variable that is present is not named" "$out" "^  A$"
is "the .env is left byte for byte as it was" "$(cksum < "$TMP/env")" "$before"
is "no file is created beside it" "$(ls -A "$TMP")" "$listing"

# 3. A variable that is only commented out is missing.
printf 'A=x\nB=y\n# C=3\nD=w\n' > "$TMP/env"
out="$(bash "$CHECK" "$TMP/env" "$TMP/example" 2>&1)"; code=$?
is "a commented-out variable counts as missing" "$code" "1"
contains "and is named" "$out" "^  C$"

# 4. A .env saved with Windows line endings is read all the same.
printf 'A=x\r\nB=y\r\nC=z\r\nD=w\r\n' > "$TMP/env"
bash "$CHECK" "$TMP/env" "$TMP/example" >/dev/null 2>&1; code=$?
is "Windows line endings are accepted" "$code" "0"

# 5. No .env at all.
out="$(bash "$CHECK" "$TMP/absent" "$TMP/example" 2>&1)"; code=$?
is "a missing .env fails with exit code 2" "$code" "2"
contains "and says what to do" "$out" "does not exist"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "check-env.test.sh: all passed"
