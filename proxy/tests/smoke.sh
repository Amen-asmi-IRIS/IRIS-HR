#!/usr/bin/env bash
# Builds the proxy image and probes it over HTTPS.
# Run from the repository root:  bash proxy/tests/smoke.sh
set -euo pipefail

# Git Bash on Windows rewrites arguments that look like paths. Docker needs them as written
# ("container:/certs/site.crt"); curl and openssl need the rewriting (/dev/null, the temporary folder).
docker() { MSYS_NO_PATHCONV=1 command docker "$@"; }
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

IMAGE="iris-hr-proxy:smoke"
NET="iris-proxy-smoke"
HOST="hr.smoke.test"
HTTPS=18443
HTTP=18080
TMP="$(mktemp -d)"

cleanup() {
  docker rm -f iris-proxy-smoke iris-proxy-certs iris-proxy-upstream iris-proxy-standard >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT
docker rm -f iris-proxy-smoke iris-proxy-certs iris-proxy-upstream iris-proxy-standard >/dev/null 2>&1 || true
docker network rm "$NET" >/dev/null 2>&1 || true

echo "building $IMAGE ..."
docker build --quiet -f proxy/Dockerfile -t "$IMAGE" . >/dev/null
docker network create "$NET" >/dev/null

run_proxy() { # name
  docker create --name "$1" --network "$NET" \
    -e SITE_HOSTNAME="$HOST" -e HTTPS_PORT="$HTTPS" -e HTTP_PORT="$HTTP" \
    -p "127.0.0.1:$HTTPS:$HTTPS" -p "127.0.0.1:$HTTP:$HTTP" "$IMAGE" >/dev/null
}
get() { curl --silent --max-time 5 --resolve "$HOST:$HTTPS:127.0.0.1" --resolve "$HOST:$HTTP:127.0.0.1" "$@"; }
wait_up() { for _ in $(seq 1 40); do get --insecure -o /dev/null "https://$HOST:$HTTPS/" && return 0; sleep 1; done; echo "the proxy did not start"; docker logs "$1" || true; exit 1; }

failures=0
check() { # description, command...
  local description="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "ok    $description"; else echo "FAIL  $description"; failures=$((failures + 1)); fi
}
has() { grep -qi -- "$2" <<<"$1"; }
lacks() { ! grep -qi -- "$2" <<<"$1"; }

# --- 1. the internal authority, no application behind ---
run_proxy iris-proxy-smoke
docker start iris-proxy-smoke >/dev/null
wait_up iris-proxy-smoke

home="$(get --insecure "https://$HOST:$HTTPS/")"
deep="$(get --insecure "https://$HOST:$HTTPS/admin/accounts/abc")"
headers="$(get --insecure -o /dev/null -D - "https://$HOST:$HTTPS/")"
asset_status="$(get --insecure -o /dev/null -w '%{http_code}' "https://$HOST:$HTTPS/assets/does-not-exist.js")"
down_status="$(get --insecure -o /dev/null -w '%{http_code}' "https://$HOST:$HTTPS/api/v1/health")"
down_body="$(get --insecure "https://$HOST:$HTTPS/api/v1/health")"
down_headers="$(get --insecure -o /dev/null -D - "https://$HOST:$HTTPS/api/v1/health")"
asset_headers="$(get --insecure -o /dev/null -D - "https://$HOST:$HTTPS/assets/does-not-exist.js")"
redirect="$(get -o /dev/null -w '%{http_code} %{redirect_url}' "http://$HOST:$HTTP/admin?x=1")"
redirect_headers="$(get -o /dev/null -D - "http://$HOST:$HTTP/admin?x=1")"

check "serves the application at the root"                  has "$home" '<div id="root">'
check "serves the application for a deep link"              has "$deep" '<div id="root">'
check "sends HSTS"                                           has "$headers" 'strict-transport-security: max-age=31536000'
check "sends a content-security policy without inline scripts" has "$headers" "content-security-policy: default-src 'self'; script-src 'self';"
check "forbids framing"                                      has "$headers" 'x-frame-options: DENY'
check "forbids content sniffing"                             has "$headers" 'x-content-type-options: nosniff'
check "does not name the server software"                    lacks "$headers" '^server:'
check "does not cache the page itself"                       has "$headers" 'cache-control: no-cache'
check "answers 404 for a missing asset, not the application" test "$asset_status" = "404"
check "answers 503 while the application is away"            test "$down_status" = "503"
check "explains it in French"                                has "$down_body" 'Mise à jour en cours'
check "explains it in English"                               has "$down_body" 'Being updated'
check "says when to try again"                               has "$down_headers" 'retry-after: 15'
# An error answer does not pass through the directives of the site: it must carry the same headers.
check "does not name the server software while the application is away" lacks "$down_headers" '^server:'
check "sends HSTS while the application is away"             has "$down_headers" 'strict-transport-security: max-age=31536000'
check "forbids framing while the application is away"        has "$down_headers" 'x-frame-options: DENY'
check "does not name the server software for a missing asset" lacks "$asset_headers" '^server:'
check "does not let the answer for a missing asset be kept"  has "$asset_headers" 'cache-control: no-store'
check "redirects HTTP to HTTPS on the published port"        test "$redirect" = "308 https://$HOST:$HTTPS/admin?x=1"
check "does not name the server software when redirecting"   lacks "$redirect_headers" '^server:'

# On the standard ports the redirect names no port. Nothing is published: the probe runs inside the container.
docker run -d --name iris-proxy-standard --network "$NET" -e SITE_HOSTNAME="$HOST" "$IMAGE" >/dev/null
sleep 3
standard="$(docker exec iris-proxy-standard wget -q -S -O /dev/null --header "Host: $HOST" "http://127.0.0.1/admin?x=1" 2>&1 || true)"
check "redirects without a port on the standard ports"       has "$standard" "location: https://$HOST/admin?x=1"
docker rm -f iris-proxy-standard >/dev/null

# --- 2. with an application behind ---
docker run -d --name iris-proxy-upstream --network "$NET" --network-alias app --entrypoint caddy "$IMAGE" \
  respond --listen :8000 --body '{"status":"ok"}' >/dev/null
sleep 2
up_body="$(get --insecure "https://$HOST:$HTTPS/api/v1/health")"
up_headers="$(get --insecure -o /dev/null -D - "https://$HOST:$HTTPS/api/v1/health")"
check "forwards /api to the application"                     test "$up_body" = '{"status":"ok"}'
check "does not name the server software on a forwarded answer" lacks "$up_headers" '^server:'
check "does not name itself as the relay of a forwarded answer" lacks "$up_headers" '^via:'

# The largest upload the application can be set to accept is 50 MB; the limit of the proxy is 64 MiB.
send() { head -c "$1" /dev/zero | get --insecure --max-time 120 -o /dev/null -w '%{http_code}' --data-binary @- "https://$HOST:$HTTPS/api/v1/employees/x/documents"; }
within="$(send $((51 * 1024 * 1024)) || true)"
beyond="$(send $((64 * 1024 * 1024 + 1)) || true)"
check "passes on a body of the largest size an upload can have" test "$within" = "200"
check "refuses a larger body itself, with 413"                  test "$beyond" = "413"

# --- 3. a supplied certificate ---
docker rm -f iris-proxy-smoke >/dev/null
# The subject is given in a file: on the command line Git Bash would rewrite "/CN=..." as a path.
cat > "$TMP/openssl.cnf" <<EOF
[req]
distinguished_name = subject
x509_extensions = extensions
prompt = no
[subject]
CN = $HOST
[extensions]
subjectAltName = DNS:$HOST
EOF
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -config "$TMP/openssl.cnf" \
  -keyout "$TMP/site.key" -out "$TMP/site.crt" >/dev/null 2>&1
run_proxy iris-proxy-certs
docker cp "$(native "$TMP/site.crt")" iris-proxy-certs:/certs/site.crt
docker cp "$(native "$TMP/site.key")" iris-proxy-certs:/certs/site.key
docker start iris-proxy-certs >/dev/null
wait_up iris-proxy-certs
check "uses the supplied certificate when there is one"      get --fail --cacert "$TMP/site.crt" -o /dev/null "https://$HOST:$HTTPS/"

echo
if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "proxy smoke test: all passed"
