#!/usr/bin/env bash
# Builds the index client (apps/index-web, WS-0025) into apps/index-web/dist,
# the directory the Worker serves as its static assets in every stage
# (infra/alchemy.run.ts, dev/preview.wrangler.jsonc). A clean output each time,
# so a deploy never ships files left by an earlier build.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/index-web"
./node_modules/.bin/vite build --logLevel warn
test -f dist/index.html
