#!/usr/bin/env bash
# Deploys the TypeScript service to its own Cloudflare stage.
#
# Not a cutover. `staging` and `production` keep running the Rust worker; this
# publishes the replacement beside them, with its own Worker name and its own
# D1, so it can be exercised against real Cloudflare without touching what
# serves today.
#
# The bundle is built by the same command `scripts/preview.sh` uses locally,
# so what deploys is what was run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STAGE="preview"

echo "==> building the interface"
(cd apps/web && bun run build)

echo "==> bundling the worker for workerd"
mkdir -p .preview
bun build apps/worker/src/index.ts \
  --outfile=.preview/worker.js \
  --target=browser --format=esm \
  --conditions=workerd --conditions=worker \
  --external "cloudflare:*"

echo "==> applying infrastructure"
(cd infra && ALCHEMY_STAGE="$STAGE" bun alchemy deploy --stage "$STAGE" --yes)

DB_NAME="job-index-${STAGE}-db"

# The schema is a single generated snapshot rather than a migration series:
# this database is new and nothing is back-filled, so there is no earlier shape
# to move it from. Incremental migrations resume once a deployment exists whose
# shape must be preserved. `IF NOT EXISTS` throughout makes re-running safe.
echo "==> applying the generated schema to ${DB_NAME}"
wrangler d1 execute "$DB_NAME" --remote --file db/schema.sql --yes >/dev/null

echo "==> done"
