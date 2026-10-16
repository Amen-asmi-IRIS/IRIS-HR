#!/usr/bin/env bash
# Runs the browser journeys with Playwright and its browser in a container, against the running
# development stack. For a machine where a browser started on the host does not behave, or where
# "npm ci" in a synced folder is too slow: it needs no packages on the host, it uses those of the
# web service. The standard way stays "cd frontend; npx playwright test".
#
# Like the standard way, it empties the development database first.
#
# Usage, from Git Bash or a Linux shell:  bash scripts/e2e-container.sh [playwright test arguments]
#        bash scripts/e2e-container.sh sign-in --project=phone
#        E2E_BROWSER=firefox bash scripts/e2e-container.sh   (chromium by default; the image has no Microsoft Edge)
set -euo pipefail

# Git Bash on Windows rewrites arguments that look like paths; Docker needs them as written.
docker() { MSYS_NO_PATHCONV=1 command docker "$@"; }
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

web="$(docker compose ps --quiet --status running web)"
if [ -z "$web" ]; then
  echo "The development stack is not running. Start it with: docker compose up -d" >&2
  exit 1
fi

# The image must carry the browser of the Playwright version the project installed.
version="$(docker compose exec -T web node -p "require('@playwright/test/package.json').version")"
# The volume that holds the frontend packages, as the web service mounts it.
packages="$(docker inspect "$web" --format '{{range .Mounts}}{{if eq .Destination "/app/node_modules"}}{{.Name}}{{end}}{{end}}')"

docker compose exec -T app python manage.py e2e_reset

# In the network of the web container, 127.0.0.1:5173 is the Vite server, as on the host.
# Playwright records a trace of every journey while it runs. It writes it inside the container, not in the
# mounted folder, where each small file is slow; what is left at the end (the report, and the traces of the
# journeys that failed) is then copied to frontend/, where the standard way puts it.
# shellcheck disable=SC2016  # the script below runs in the container: its variables are the container's
docker run --rm --init --ipc=host --network "container:$web" \
  --volume "$(native "$ROOT/frontend"):/app" --volume "$packages:/app/node_modules" --workdir /app \
  --env E2E_SKIP_RESET=1 --env CI --env E2E_BROWSER --env PLAYWRIGHT_HTML_OUTPUT_DIR=/tmp/e2e/playwright-report \
  "mcr.microsoft.com/playwright:v$version-noble" sh -c '
    npx playwright test --output /tmp/e2e/test-results "$@"
    code=$?
    rm -rf /app/test-results /app/playwright-report
    cp -r /tmp/e2e/test-results /app/test-results 2>/dev/null
    cp -r /tmp/e2e/playwright-report /app/playwright-report 2>/dev/null
    exit "$code"
  ' journeys "$@"
