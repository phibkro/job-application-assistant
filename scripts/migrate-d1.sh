#!/usr/bin/env bash
# Applies the ordered TypeScript-era D1 migrations. The generated schema runs
# first: on a new database it records migrations whose target shape is already
# present; on an existing database it leaves missing migrations for Wrangler.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mode="${1:-}"
database_name="${2:-}"

case "$mode" in
  local)
    config="${3:-dev/preview.wrangler.jsonc}"
    persist_args=()
    if [ -n "${WRANGLER_D1_PERSIST_TO:-}" ]; then
      persist_args=(--persist-to "$WRANGLER_D1_PERSIST_TO")
    fi
    CI=1 wrangler d1 migrations apply "$database_name" --local --config "$config" "${persist_args[@]}"
    ;;
  remote)
    database_id="$(wrangler d1 list --json | jq -r --arg name "$database_name" '.[] | select(.name == $name) | .uuid')"
    if [ -z "$database_id" ] || [ "$database_id" = "null" ]; then
      echo "Could not resolve D1 database id for ${database_name}." >&2
      exit 1
    fi

    config="$(mktemp)"
    trap 'rm -f "$config"' EXIT
    cat >"$config" <<JSON
{
  "name": "job-index-migrations",
  "compatibility_date": "2026-05-25",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "${database_name}",
      "database_id": "${database_id}",
      "migrations_dir": "${ROOT}/db/migrations"
    }
  ]
}
JSON
    CI=1 wrangler d1 migrations apply "$database_name" --remote --config "$config"
    ;;
  *)
    echo "Usage: scripts/migrate-d1.sh local DB_NAME [WRANGLER_CONFIG]" >&2
    echo "       scripts/migrate-d1.sh remote DB_NAME" >&2
    exit 2
    ;;
esac
