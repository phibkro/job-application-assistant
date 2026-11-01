#!/usr/bin/env bash
# Deploys either the shared preview stage or a pull-request Worker Preview.
#
# `preview` keeps the operator-controlled shared preview (its own Worker and
# D1). A pull request number or `pr-N` selects a Cloudflare Worker Preview of
# the `pr-previews` host Worker (WS-0029@2 pass B): seeded data, no live
# ingestion, bound to the shared preview D1, private behind Cloudflare Access.
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
# The shared D1 and the parent Worker belong to this stage. A PR Preview
# reads them; only scripts/deploy-preview-host.sh deploys them.
HOST_STAGE="pr-previews"

echo "==> building the index client (apps/index-web/dist)"
bash scripts/build-index-web.sh

echo "==> bundling the worker for workerd"
mkdir -p .preview
bun build apps/worker/src/index.ts \
  --outfile=.preview/worker.js \
  --target=browser --format=esm \
  --conditions=workerd --conditions=worker \
  --external "cloudflare:*"

# `alchemy state read` prints the whole resource, Redacted secrets included
# (WS-0029 L5): pipe it straight into the parser, never to the log.
read_resource_attribute() {
  local stage="$1"
  local resource="$2"
  local attribute="$3"
  (
    cd infra
    ALCHEMY_STAGE="$stage" bun run alchemy state read "JobIndex/$stage/$resource"
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

if [ "$STAGE" = "preview" ]; then
  echo "==> applying infrastructure"
  (cd infra && ALCHEMY_STAGE="$STAGE" bun run alchemy deploy --stage "$STAGE" --yes)

  DB_NAME="$(read_resource_attribute "$STAGE" TypeScriptDb databaseName)"
  DB_ID="$(read_resource_attribute "$STAGE" TypeScriptDb databaseId)"
  DEPLOYMENT_URL="$(read_resource_attribute "$STAGE" Api url)"
  if [ -z "$DB_NAME" ] || [ -z "$DB_ID" ] || [ -z "$DEPLOYMENT_URL" ]; then
    echo "Alchemy did not report the preview resources." >&2
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

  echo "==> preview ready: ${DEPLOYMENT_URL}"
  exit 0
fi

echo "==> reading the preview host (${HOST_STAGE})"
DB_NAME="$(read_resource_attribute "$HOST_STAGE" TypeScriptDb databaseName)" || DB_NAME=""
DB_ID="$(read_resource_attribute "$HOST_STAGE" TypeScriptDb databaseId)" || DB_ID=""
if [ -z "$DB_NAME" ] || [ -z "$DB_ID" ]; then
  echo "The preview host is not deployed: the owner runs scripts/deploy-preview-host.sh first." >&2
  exit 1
fi

# The shared schema and seed (dev/preview-seed.sql, as INSERT OR IGNORE)
# first, so the Preview never starts against an older schema.
./scripts/seed-preview-db.sh "$DB_NAME" "$DB_ID" "$STAGE" refuse

echo "==> deploying Worker Preview ${STAGE}"
(cd infra && ALCHEMY_STAGE="$STAGE" bun run alchemy deploy --stage "$STAGE" --yes)

DEPLOYMENT_URL="$(read_resource_attribute "$STAGE" Api url)"
if [ -z "$DEPLOYMENT_URL" ]; then
  echo "Alchemy did not report the Worker Preview URL." >&2
  exit 1
fi

echo "==> Worker Preview deployed: ${DEPLOYMENT_URL}"
./scripts/smoke-preview.sh deployed "$DEPLOYMENT_URL" "$STAGE"
