#!/usr/bin/env bash
# docker compose for this stack, pinned to the version the last update deployed.
# On the server, use it instead of plain "docker compose": a plain command would read
# APP_VERSION from .env, which an update never rewrites.
#
# Usage: scripts/server/compose.sh ps
#        scripts/server/compose.sh logs --tail 100 app
#        scripts/server/compose.sh exec app python manage.py create_sysadmin --email <address> --name <name>
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_server_stack
compose "$@"
