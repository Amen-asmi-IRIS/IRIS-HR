#!/usr/bin/env bash
# Creates a throwaway .env for the pipeline from .env.example, with generated secrets.
# It never overwrites a file. A developer machine uses scripts/dev.ps1 init instead.
#
# Usage: bash .github/scripts/make-env.sh [path/to/.env.example] [path/to/.env]
set -euo pipefail

example="${1:-.env.example}"
target="${2:-.env}"

if [ ! -f "$example" ]; then
  echo "ERROR: $example does not exist." >&2
  exit 2
fi
if [ -e "$target" ]; then
  echo "ERROR: $target already exists and is never overwritten." >&2
  exit 1
fi

hex() { openssl rand -hex "$1"; }
# 32 random bytes as URL-safe base64 with its padding: the format of a Fernet key.
fernet() { openssl rand -base64 32 | tr '+/' '-_' | tr -d '\n'; }

sed -e 's/\r$//' \
  -e "s|^DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=$(hex 32)|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(hex 24)|" \
  -e "s|^FILE_ENCRYPTION_KEY=.*|FILE_ENCRYPTION_KEY=$(fernet)|" \
  -e "s|^BACKUP_PASSPHRASE=.*|BACKUP_PASSPHRASE=$(hex 24)|" \
  "$example" > "$target"

echo "Created $target with generated secrets."
