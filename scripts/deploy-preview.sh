#!/usr/bin/env bash
# Deploys the TypeScript service to its own Cloudflare stage.
#
# The preview stage has its own Worker name and D1 database. It exercises the
# same TypeScript bundle without changing staging or production.
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

# The generated snapshot is the current shape. Wrangler then applies any
# ordered migration that an existing preview database still lacks; a new
# database is already marked current by the snapshot.
echo "==> applying the generated schema, ordered migrations, and researched catalogue to ${DB_NAME}"
wrangler d1 execute "$DB_NAME" --remote --file db/schema.sql --yes >/dev/null
./scripts/migrate-d1.sh remote "$DB_NAME"
wrangler d1 execute "$DB_NAME" --remote --file db/catalog-seed.sql --yes >/dev/null

echo "==> done"
