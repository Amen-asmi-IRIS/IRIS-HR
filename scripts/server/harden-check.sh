#!/usr/bin/env bash
# Checks how a stack and its server are set up (PRD section 10 and 12.3).
# It reads; it changes nothing and prints no secret.
#
# Usage: scripts/server/harden-check.sh        run in the stack directory, as the service account
# Exit:  0 no check failed   1 at least one failed
# Lines: "ok" passed, "FAIL" must be fixed, "hand" cannot be read from here and must be checked by a person.
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

FAILED=0
ok() { echo "ok    $1"; }
bad() { echo "FAIL  $1"; FAILED=1; }
hand() { echo "hand  $1"; }

SECRETS="DJANGO_SECRET_KEY POSTGRES_PASSWORD FILE_ENCRYPTION_KEY BACKUP_PASSPHRASE"

value_in() { # file, name
  sed -e 's/\r$//' "$1" | { grep -E "^$2=" || true; } | tail -n 1 | cut -d= -f2-
}

check_env() {
  local mode name mine other stack
  [ -f "$ENV_FILE" ] || { bad "there is no .env in $ROOT"; return; }

  mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo unknown)"
  case "$mode" in
    600 | 400) ok ".env is readable by its owner only" ;;
    *) bad ".env is readable by others (mode $mode); run: chmod 600 .env" ;;
  esac
  if git -C "$ROOT" ls-files --error-unmatch .env >/dev/null 2>&1; then bad ".env is tracked by git"; else ok ".env is not in git"; fi

  case "$(env_value COMPOSE_FILE)" in
    *compose.server.yaml*) ok "COMPOSE_FILE names compose.server.yaml" ;;
    *) bad "COMPOSE_FILE does not name compose.server.yaml" ;;
  esac
  case "$(env_value ENVIRONMENT)" in
    test | production) ok "ENVIRONMENT is $(env_value ENVIRONMENT)" ;;
    *) bad "ENVIRONMENT must be test or production" ;;
  esac
  if [ "$(env_value DJANGO_ALLOWED_HOSTS)" = "$(env_value SITE_HOSTNAME)" ] && [ -n "$(env_value SITE_HOSTNAME)" ]; then
    ok "DJANGO_ALLOWED_HOSTS is SITE_HOSTNAME"
  else
    bad "DJANGO_ALLOWED_HOSTS must be exactly SITE_HOSTNAME"
  fi

  for name in $SECRETS; do
    mine="$(env_value "$name")"
    if [ -z "$mine" ]; then bad "$name is empty"; continue; fi
    if [ -f "$ROOT/.env.example" ] && [ "$mine" = "$(value_in "$ROOT/.env.example" "$name")" ]; then
      bad "$name still has the value of .env.example"
      continue
    fi
    if [ "${#mine}" -lt 16 ]; then bad "$name is shorter than 16 characters"; continue; fi
    ok "$name is set"
    # No secret may be shared with another stack on this server.
    for other in "$ROOT"/../*/.env; do
      [ -f "$other" ] || continue
      [ "$(cd "$(dirname "$other")" && pwd)" = "$ROOT" ] && continue
      stack="$(basename "$(dirname "$other")")"
      if [ "$mine" = "$(value_in "$other" "$name")" ]; then bad "$name is the same in the stack '$stack'"; fi
    done
  done
}

check_machine() {
  local file exposed
  if [ "$(id -u)" = "0" ]; then bad "this is run as root; use the service account"; else ok "run as $(id -un), not root"; fi
  if id -nG | tr ' ' '\n' | grep -qx docker; then ok "the account is in the docker group"; else bad "the account is not in the docker group"; fi

  for file in "$HOME/.git-credentials" "$HOME/.docker/config.json"; do
    [ -f "$file" ] || continue
    case "$(stat -c '%a' "$file")" in
      600 | 400) ok "$file is readable by its owner only" ;;
      *) bad "$file is readable by others; run: chmod 600 $file" ;;
    esac
  done

  if lsblk -o TYPE 2>/dev/null | grep -q crypt; then ok "a disk is encrypted (LUKS)"; else bad "no encrypted disk found: full-disk encryption is required"; fi

  if grep -Eqs '^\s*PermitRootLogin\s+no' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf; then
    ok "root cannot sign in over SSH"
  else
    bad "PermitRootLogin is not 'no' in the SSH configuration: logins must be personal"
  fi
  if grep -Eqs '^\s*PasswordAuthentication\s+no' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf; then
    ok "SSH accepts keys only"
  else
    hand "SSH still accepts passwords; prefer keys (PasswordAuthentication no)"
  fi

  if command -v ufw >/dev/null 2>&1 && sudo -n ufw status 2>/dev/null | grep -q '^Status: active'; then
    ok "the firewall is active"
    hand "read 'sudo ufw status': ports $(env_value HTTPS_PORT) and $(env_value HTTP_PORT) open to the office network only, SSH to the administrators' addresses only"
  else
    hand "the firewall could not be read without a password; run 'sudo ufw status' and check that it is active and limited to the office network"
  fi

  exposed="$(compose ps --format '{{.Service}} {{.Ports}}' 2>/dev/null | grep -v '^proxy ' | grep -- '->' || true)"
  if [ -z "$exposed" ]; then ok "only the proxy publishes ports"; else bad "a container other than the proxy publishes a port: $exposed"; fi

  if compose exec -T app sh -c 'ls /data/backups/db-*.dump.gpg >/dev/null 2>&1'; then
    ok "at least one nightly backup exists"
  else
    bad "no nightly backup yet; run: scripts/server/compose.sh exec app python manage.py backup_now"
  fi

  hand "the .env of this stack is in the password safe, apart from this server"
  hand "the operating system installs security updates (unattended-upgrades), and the last reboot is less than a month old: $(uptime -s 2>/dev/null || echo unknown)"
}

check_env
if [ "${IRIS_ENV_ONLY:-}" != "1" ]; then
  require_server_stack
  check_machine
fi

echo
if [ "$FAILED" -eq 0 ]; then echo "No check failed. Read the 'hand' lines."; else echo "At least one check failed."; fi
exit "$FAILED"
