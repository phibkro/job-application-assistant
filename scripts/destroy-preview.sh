#!/usr/bin/env bash
# Destroys one disposable pull-request stage. Shared stages are never accepted.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

case "${1:-}" in
  [1-9]*)
    case "$1" in
      *[!0-9]*)
        echo "destroy-preview requires a positive PR number or pr-N" >&2
        exit 2
        ;;
    esac
    STAGE="pr-$1"
    ;;
  pr-[1-9]*)
    case "${1#pr-}" in
      *[!0-9]*)
        echo "destroy-preview requires a positive PR number or pr-N" >&2
        exit 2
        ;;
    esac
    STAGE="$1"
    ;;
  *)
    echo "destroy-preview requires a positive PR number or pr-N" >&2
    exit 2
    ;;
esac

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"

WORKER="job-index-${STAGE}"
DATABASE="job-index-${STAGE}-typescript-db"
API="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}"
AUTH="Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"

# PR deployments use runner-local Alchemy state. A close event runs on a fresh
# runner and therefore cannot use `alchemy destroy`; delete the deterministic
# physical resources through Cloudflare instead.
worker_status="$(curl -sS -o /dev/null -w '%{http_code}' -H "$AUTH" "${API}/workers/scripts/${WORKER}/settings")"
case "$worker_status" in
  200)
    curl -fsS -X DELETE -H "$AUTH" "${API}/workers/scripts/${WORKER}" >/dev/null
    echo "Deleted Worker ${WORKER}."
    ;;
  404) echo "Worker ${WORKER} is already absent." ;;
  *)
    echo "Could not inspect Worker ${WORKER}: Cloudflare returned HTTP ${worker_status}." >&2
    exit 1
    ;;
esac

database_id="$(
  curl -fsS -H "$AUTH" "${API}/d1/database?name=${DATABASE}" |
    jq -r --arg name "$DATABASE" '.result[] | select(.name == $name) | .uuid' |
    head -n 1
)"
if [ -n "$database_id" ]; then
  curl -fsS -X DELETE -H "$AUTH" "${API}/d1/database/${database_id}" >/dev/null
  echo "Deleted D1 database ${DATABASE}."
else
  echo "D1 database ${DATABASE} is already absent."
fi

# Deleting the Worker removes its script-owned Durable Object namespace. Check
# all three externally visible resources so a false-success close job cannot
# leak account capacity.
worker_status="$(curl -sS -o /dev/null -w '%{http_code}' -H "$AUTH" "${API}/workers/scripts/${WORKER}/settings")"
database_count="$(curl -fsS -H "$AUTH" "${API}/d1/database?name=${DATABASE}" | jq --arg name "$DATABASE" '[.result[] | select(.name == $name)] | length')"
namespace_count="$(curl -fsS -H "$AUTH" "${API}/workers/durable_objects/namespaces?per_page=100" | jq --arg script "$WORKER" '[.result[] | select(.script == $script)] | length')"
if [ "$worker_status" != "404" ] || [ "$database_count" != "0" ] || [ "$namespace_count" != "0" ]; then
  echo "Preview teardown incomplete: worker HTTP ${worker_status}, databases ${database_count}, namespaces ${namespace_count}." >&2
  exit 1
fi

echo "Destroyed preview stage ${STAGE}."
