#!/bin/sh
# Chooses the certificate: the one supplied in /certs when both files are there,
# Caddy's internal authority otherwise. Writes where HTTP is sent. Then starts Caddy.
set -eu

if [ -s /certs/site.crt ] && [ -s /certs/site.key ]; then
  printf 'tls /certs/site.crt /certs/site.key\n' > /etc/caddy/tls.caddy
else
  printf 'tls internal\n' > /etc/caddy/tls.caddy
fi

# HTTP goes to HTTPS on the port people use: named only when it is not the standard one.
if [ "${HTTPS_PORT:-443}" = "443" ]; then
  printf 'redir https://{host}{uri} 308\n' > /etc/caddy/redirect.caddy
else
  printf 'redir https://{host}:%s{uri} 308\n' "$HTTPS_PORT" > /etc/caddy/redirect.caddy
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
