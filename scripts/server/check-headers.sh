#!/usr/bin/env bash
# Check the security headers, redirects and exposed ports of a deployed stack.
#
#   scripts/server/check-headers.sh https://hr-test.iris.local:8443 [http-port]
#
# Optional: CHECK_EMAIL and CHECK_PASSWORD of any account, to check the session cookie too.
set -uo pipefail

BASE="${1:?usage: check-headers.sh https://host[:port] [http-port]}"
HTTP_PORT="${2:-80}"
HOSTPORT="${BASE#https://}"
HOST="${HOSTPORT%%:*}"
FAILED=0

pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; FAILED=1; }
want() { if grep -Eiq -- "$3" <<<"$2"; then pass "$1"; else fail "$1"; fi; }
reject() { if grep -Eiq -- "$3" <<<"$2"; then fail "$1"; else pass "$1"; fi; }
head_of() { curl -sk --max-time 10 -D - -o /dev/null "$1" | tr -d '\r'; }

PAGE="$(head_of "$BASE/")"
API="$(head_of "$BASE/api/v1/health")"
CSP="$(grep -i '^content-security-policy:' <<<"$PAGE" || true)"

want   "page answers 200"                         "$PAGE" '^HTTP/[0-9.]+ 200'
want   "HSTS on the page, at least six months"    "$PAGE" '^strict-transport-security: .*max-age=(1[5-9][0-9]{6}|[2-9][0-9]{7}|[0-9]{9,})'
want   "HSTS on the API"                          "$API"  '^strict-transport-security: '
want   "content-security-policy present"          "$CSP"  "default-src 'self'"
reject "no unsafe script source"                  "$CSP"  "script-src[^;]*'unsafe-(inline|eval)'"
reject "no wildcard source"                       "$CSP"  "(default|script|connect|img|font)-src[^;]* \*( |;|$)"
want   "framing forbidden"                        "$PAGE" "(frame-ancestors 'none'|^x-frame-options: deny)"
want   "nosniff on the page"                      "$PAGE" '^x-content-type-options: nosniff'
want   "nosniff on the API"                       "$API"  '^x-content-type-options: nosniff'
want   "referrer policy set"                      "$PAGE" '^referrer-policy: (no-referrer|same-origin|strict-origin)'
reject "no framework banner"                      "$API"  '^(server|x-powered-by): .*(gunicorn|python|wsgi|django)'
want   "API health is ok"                         "$(curl -sk --max-time 10 "$BASE/api/v1/health")" '"status": ?"ok"'

REDIRECT="$(curl -s --max-time 10 -o /dev/null -w '%{http_code} %{redirect_url}' "http://$HOST:$HTTP_PORT/" || true)"
want   "plain HTTP redirects to HTTPS"            "$REDIRECT" '^30[18] https://'

CSRF="$(head_of "$BASE/api/v1/auth/csrf")"
want   "CSRF cookie is Secure"                    "$CSRF" '^set-cookie: csrftoken=[^;]+;.*secure'
want   "CSRF cookie is SameSite=Lax"              "$CSRF" '^set-cookie: csrftoken=[^;]+;.*samesite=lax'

if [[ -n "${CHECK_EMAIL:-}" && -n "${CHECK_PASSWORD:-}" ]]; then
  # Sign-in needs the CSRF token like every unsafe call (plan 01a, contract note 10).
  JAR="$(mktemp)"
  TOKEN="$(curl -sk --max-time 10 -c "$JAR" "$BASE/api/v1/auth/csrf" | sed -E 's/.*"csrf_token": ?"([^"]+)".*/\1/')"
  LOGIN="$(curl -sk --max-time 10 -b "$JAR" -D - -o /dev/null -H 'Content-Type: application/json' \
            -H "X-CSRFToken: $TOKEN" -H "Origin: $BASE" -H "Referer: $BASE/login" \
            -d "{\"email\":\"$CHECK_EMAIL\",\"password\":\"$CHECK_PASSWORD\"}" "$BASE/api/v1/auth/login" | tr -d '\r')"
  rm -f "$JAR"
  SESSION="$(grep -i '^set-cookie: sessionid=' <<<"$LOGIN" || true)"
  want   "sign-in succeeded"                      "$LOGIN"   '^HTTP/[0-9.]+ 200'
  want   "session cookie is Secure"               "$SESSION" 'secure'
  want   "session cookie is HttpOnly"             "$SESSION" 'httponly'
  want   "session cookie is SameSite=Lax"         "$SESSION" 'samesite=lax'
  reject "session cookie ends with the browser"   "$SESSION" '(max-age|expires)='
else
  echo "skip  session cookie (set CHECK_EMAIL and CHECK_PASSWORD to check it)"
fi

for PORT in 8000 5432; do
  if (exec 3<>"/dev/tcp/$HOST/$PORT") 2>/dev/null; then
    fail "port $PORT is reachable from here; only the proxy may be published"
  else
    pass "port $PORT is closed"
  fi
done

if [[ "$FAILED" -eq 0 ]]; then echo "All checks passed."; else echo "Some checks failed."; fi
exit "$FAILED"
