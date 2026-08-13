#!/usr/bin/env bash
# Deploys either the shared preview stage or an isolated pull-request stage.
#
# `preview` keeps the operator-controlled shared preview. A pull request number
# or `pr-N` selects a disposable stage with seeded data and no live ingestion.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

case "${1:-preview}" in
  preview)
    STAGE="preview"
    ;;
  [1-9]*)
    case "$1" in
      *[!0-9]*)
        echo "preview stage must be preview, a positive PR number, or pr-N" >&2
        exit 2
        ;;
    esac
    STAGE="pr-$1"
    ;;
  pr-[1-9]*)
    case "${1#pr-}" in
      *[!0-9]*)
        echo "preview stage must be preview, a positive PR number, or pr-N" >&2
        exit 2
        ;;
    esac
    STAGE="$1"
    ;;
  *)
    echo "preview stage must be preview, a positive PR number, or pr-N" >&2
    exit 2
    ;;
esac

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
(cd infra && ALCHEMY_STAGE="$STAGE" bun run alchemy deploy --stage "$STAGE" --yes)

read_stack_output() {
  python3 - "$1" "$STAGE" <<'PYOUT'
import json
import pathlib
import sys

key, stage = sys.argv[1:]
state = sorted(pathlib.Path("infra/.alchemy/state/JobIndex").glob(f"{stage}/**/__stack_output__.json"))
if not state:
    raise SystemExit("")
value = json.loads(state[-1].read_text())
for candidate in ("output", "value", "data"):
    if isinstance(value, dict) and candidate in value:
        value = value[candidate]
print(value.get(key, "") if isinstance(value, dict) else "")
PYOUT
}

DB_NAME="$(read_stack_output database)"
DB_ID="$(read_stack_output databaseId)"
DEPLOYMENT_URL="$(read_stack_output url)"
if [ -z "$DB_NAME" ] || [ -z "$DB_ID" ] || [ -z "$DEPLOYMENT_URL" ]; then
  echo "Alchemy did not report the isolated preview resources." >&2
  exit 1
fi

DATABASE_CONFIG="$(mktemp --suffix=.jsonc)"
trap 'rm -f "$DATABASE_CONFIG"' EXIT
cat >"$DATABASE_CONFIG" <<JSON
{
  "name": "job-index-preview-database-apply",
  "compatibility_date": "2026-05-25",
  "d1_databases": [{
    "binding": "DB",
    "database_name": "$DB_NAME",
    "database_id": "$DB_ID"
  }]
}
JSON

echo "==> applying schema and seed data to ${DB_NAME}"
CI=1 wrangler d1 execute "$DB_NAME" --remote --config "$DATABASE_CONFIG" --file db/schema.sql --yes >/dev/null
./scripts/migrate-d1.sh remote "$DB_NAME" "$DB_ID"
CI=1 wrangler d1 execute "$DB_NAME" --remote --config "$DATABASE_CONFIG" --file db/catalog-seed.sql --yes >/dev/null
if [ "$STAGE" != "preview" ]; then
  CI=1 wrangler d1 execute "$DB_NAME" --remote --config "$DATABASE_CONFIG" --file dev/preview-seed.sql --yes >/dev/null
fi

echo "==> preview ready: ${DEPLOYMENT_URL}"
