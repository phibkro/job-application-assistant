#!/usr/bin/env bash
# Deploys the pull-request preview host: the parent Worker every PR Preview
# belongs to (`job-index-pr-previews`) and the shared preview D1 they all bind
# (`job-index-pr-previews-typescript-db`), then brings that D1 to this tree's
# schema and seed.
#
# WS-0029@2 pass B. Run only by the owner, inside `devenv shell`
# (`vp run deploy-preview-host`):
# - the first time from the pass B PR branch, because that PR's own preview
#   CI needs the host before it can go green;
# - afterwards from `main`, whenever the parent or the shared schema should
#   move on;
# - from a PR branch that adds a D1 migration, after reviewing it: this is
#   the only path that applies migrations to the shared preview D1.
# Pull requests never deploy this stage. The parent serves no URL of its own
# (workers.dev stable URL off, Preview URLs on) and binds no secret
# (`secretBindings()` is empty for this stage). Cloudflare Access is enabled
# on it in the dashboard, not here.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ "$#" -ne 0 ]; then
  echo "deploy-preview-host takes no arguments; it deploys only the pr-previews stage" >&2
  exit 2
fi
STAGE="pr-previews"

echo "==> building the index client (apps/index-web/dist)"
bash scripts/build-index-web.sh

echo "==> bundling the worker for workerd"
mkdir -p .preview
bun build apps/worker/src/index.ts \
  --outfile=.preview/worker.js \
  --target=browser --format=esm \
  --conditions=workerd --conditions=worker \
  --external "cloudflare:*"

echo "==> applying the preview host infrastructure"
(cd infra && ALCHEMY_STAGE="$STAGE" bun run alchemy deploy --stage "$STAGE" --yes)

# `alchemy state read` prints the whole resource, Redacted secrets included
# (WS-0029 L5): pipe it straight into the parser, never to the log.
read_resource_attribute() {
  local resource="$1"
  local attribute="$2"
  (
    cd infra
    ALCHEMY_STAGE="$STAGE" bun run alchemy state read "JobIndex/$STAGE/$resource"
  ) | python3 -c '
import json
import sys

attribute = sys.argv[1]
text = sys.stdin.read()
start = text.find("{")
if start < 0:
    raise SystemExit("")
value = json.loads(text[start:]).get("attr", {}).get(attribute, "")
print(value if isinstance(value, str) else "")
' "$attribute"
}

DB_NAME="$(read_resource_attribute TypeScriptDb databaseName)"
DB_ID="$(read_resource_attribute TypeScriptDb databaseId)"
WORKER="$(read_resource_attribute Api workerName)"
if [ -z "$DB_NAME" ] || [ -z "$DB_ID" ] || [ -z "$WORKER" ]; then
  echo "Alchemy did not report the preview host resources." >&2
  exit 1
fi

./scripts/seed-preview-db.sh "$DB_NAME" "$DB_ID" "host" apply

echo "==> preview host ready: Worker ${WORKER}, shared D1 ${DB_NAME}"
echo "    Enable Cloudflare Access on ${WORKER} (Previews only) before the first PR Preview."
