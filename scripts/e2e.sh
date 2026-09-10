#!/usr/bin/env bash
set -euo pipefail
# Run the Playwright suite inside the official container whose tag matches
# the pinned @playwright/test version. This app is DB-less, so there is no
# database step. PW_VERSION MUST equal the installed @playwright/test.
PW_VERSION="1.61.1"
# Run-scoped port so concurrent runs on a shared host never collide.
E2E_PORT="${E2E_PORT:-$((3100 + RANDOM % 800))}"
cd "$(dirname "$0")/.."

docker run --rm --init --ipc=host --network host \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  -e CI=1 -e E2E_PORT="$E2E_PORT" -v "$PWD":/work -w /work \
  "mcr.microsoft.com/playwright:v${PW_VERSION}-noble" \
  sh -c 'npm ci && npm run test:e2e'
