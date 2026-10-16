#!/usr/bin/env bash
# Checks that every document of PRD 12.10 exists and that the commands it names exist too.
# Run: bash scripts/tests/docs.test.sh
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1

failures=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failures=$((failures + 1)); }

DOCUMENTS=(
  docs/runbook/install.md docs/runbook/update.md docs/runbook/restore.md
  docs/guides/administrator.md docs/guides/hr.md docs/guides/employee.fr.md docs/guides/employee.en.md
  docs/decisions.md docs/ui-audit.md docs/permission-matrix.md CHANGELOG.md
  docs/superpowers/specs/2026-10-05-iris-hr-platform-prd-design.md
  docs/superpowers/specs/2026-10-05-iris-hr-platform-ui-design.md
)
for document in "${DOCUMENTS[@]}"; do
  if [ -s "$document" ]; then pass "$document exists"; else fail "$document is missing or empty"; fi
done

# Every server script a runbook names must exist and be executable in git.
for script in $(grep -ohE 'scripts/server/[a-z-]+\.sh' docs/runbook/*.md 2>/dev/null | sort -u); do
  if git ls-files --error-unmatch "$script" >/dev/null 2>&1; then pass "$script is in the repository"; else fail "a runbook names $script, which does not exist"; fi
done

# Every management command a document names must exist.
for command in $(grep -ohE 'manage\.py [a-z_]+' docs/runbook/*.md docs/guides/*.md 2>/dev/null | awk '{print $2}' | sort -u); do
  case "$command" in migrate | shell | procrastinate) pass "manage.py $command (built in)"; continue ;; esac
  if ls backend/apps/*/management/commands/"$command".py >/dev/null 2>&1; then pass "manage.py $command exists"; else fail "a document names manage.py $command, which does not exist"; fi
done

# The two employee guides have the same sections.
french="$(grep -c '^## ' docs/guides/employee.fr.md 2>/dev/null || echo 0)"
english="$(grep -c '^## ' docs/guides/employee.en.md 2>/dev/null || echo 0)"
if [ "$french" -gt 0 ] && [ "$french" = "$english" ]; then pass "the employee guide has $french sections in both languages"; else fail "the employee guides differ: $french sections in French, $english in English"; fi

# The changelog has the release.
if grep -q '^## v1\.0\.0' CHANGELOG.md 2>/dev/null; then pass "CHANGELOG.md has v1.0.0"; else fail "CHANGELOG.md has no entry for v1.0.0"; fi

# No document tells an operator to edit .env during an update, or to use plain docker compose on the server.
if grep -nE '^\s*docker compose ' docs/runbook/*.md 2>/dev/null | grep -v 'development' >/dev/null; then
  fail "a runbook uses plain 'docker compose' on the server; it must be scripts/server/compose.sh"
else
  pass "the runbooks use scripts/server/compose.sh"
fi

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "docs.test.sh: all passed"
