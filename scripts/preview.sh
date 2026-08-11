#!/usr/bin/env bash
# Runs the TypeScript service locally: the Worker serving the API on workerd,
# with the built interface beside it as static assets, over a local D1 holding
# the generated schema and a small seed.
#
# This is the whole stack talking to itself — the same bundle, schema, and
# routing a deploy would use, minus the deploy. It exists because "it compiles"
# and "it serves" have been different answers in this repository more than once.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-8799}"
CONFIG="dev/preview.wrangler.jsonc"
STATE_DIR=".preview/state"

echo "==> building the interface"
(cd apps/web && bun run build)

echo "==> bundling the worker for workerd"
rm -rf "$STATE_DIR"
mkdir -p "$STATE_DIR"
bun build apps/worker/src/index.ts \
  --outfile=.preview/worker.js \
  --target=browser --format=esm \
  --conditions=workerd --conditions=worker \
  --external "cloudflare:*"

echo "==> applying the generated schema, ordered migrations, researched catalogue, and seed"
wrangler d1 execute job-index-preview --local --config "$CONFIG" --persist-to "$STATE_DIR" --file db/schema.sql >/dev/null
WRANGLER_D1_PERSIST_TO="$STATE_DIR" ./scripts/migrate-d1.sh local job-index-preview "$CONFIG" >/dev/null
wrangler d1 execute job-index-preview --local --config "$CONFIG" --persist-to "$STATE_DIR" --file db/catalog-seed.sql >/dev/null
wrangler d1 execute job-index-preview --local --config "$CONFIG" --persist-to "$STATE_DIR" --file dev/preview-seed.sql >/dev/null

cat <<BANNER

  Job Index preview: http://127.0.0.1:${PORT}
  Sign in with the token  demo-token  to see the feed and the profile.

BANNER

exec wrangler dev --config "$CONFIG" --port "$PORT" --local --persist-to "$STATE_DIR"
