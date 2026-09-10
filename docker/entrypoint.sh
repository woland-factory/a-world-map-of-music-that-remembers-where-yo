#!/bin/sh
# Regenerate the runtime config from environment before nginx starts, so a
# single image toggles behavior (SEED_DEMO, analytics, error tracking)
# without a rebuild. Runs inside nginx:alpine's docker-entrypoint.d hook.
set -eu

export SEED_DEMO="${SEED_DEMO:-}"
export SENTRY_DSN="${SENTRY_DSN:-}"
export UMAMI_URL="${UMAMI_URL:-}"
export UMAMI_WEBSITE_ID="${UMAMI_WEBSITE_ID:-}"

envsubst '${SEED_DEMO} ${SENTRY_DSN} ${UMAMI_URL} ${UMAMI_WEBSITE_ID}' \
  < /etc/atlas/env.js.template \
  > /usr/share/nginx/html/env.js

echo "atlas: wrote env.js (SEED_DEMO=${SEED_DEMO})"
