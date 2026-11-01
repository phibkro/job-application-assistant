#!/usr/bin/env bash
# Brings the shared pull-request preview D1 up to this tree's schema and seed.
#
# WS-0029@2 pass B: every Worker Preview binds one D1 owned by the
# `pr-previews` host stage. Pull requests run concurrently, so this script
# must be safe to run while other previews read the database and while
# another run of this script is in progress:
#
# - Writers are serialised by a lease row in the database itself
#   (`preview_seed_lease`, one row, id = 1). A run takes it with one atomic
#   upsert that succeeds only when the row is free or older than the lease
#   time, then reads back the holder. GitHub `concurrency` cannot do this:
#   it cancels all but one pending run in a group.
# - Readers are never shown an empty corpus: the seed is applied as
#   `INSERT OR IGNORE` with the fixture's `DELETE` lines removed, so a run
#   only adds missing fixture rows and never wipes rows another preview uses.
# - Schema and catalogue are idempotent already (`CREATE ... IF NOT EXISTS`,
#   `INSERT OR IGNORE`, `INSERT OR REPLACE`), and Wrangler records each
#   applied migration, so a run after another one is a no-op.
#
# Usage: scripts/seed-preview-db.sh DB_NAME DB_ID HOLDER
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_NAME="${1:-}"
DB_ID="${2:-}"
HOLDER="${3:-}"
if [ -z "$DB_NAME" ] || [ -z "$DB_ID" ] || [ -z "$HOLDER" ]; then
  echo "Usage: scripts/seed-preview-db.sh DB_NAME DB_ID HOLDER" >&2
  exit 2
fi
# The holder is interpolated into SQL: accept only a plain slug.
case "$HOLDER" in
  *[!a-z0-9-]*)
    echo "seed holder must contain only lowercase letters, digits and dashes" >&2
    exit 2
    ;;
esac
# Never the staging or production database (WS-0029@2 pass B).
case "$DB_NAME" in
  job-index-pr-previews-typescript-db) ;;
  *)
    echo "seed-preview-db only seeds the shared preview D1 (job-index-pr-previews-typescript-db)" >&2
    exit 2
    ;;
esac

LEASE_SECONDS=600
WAIT_ATTEMPTS=30
WAIT_SECONDS=10

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
config="$work/database.jsonc"
cat >"$config" <<JSON
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

d1() {
  CI=1 wrangler d1 execute "$DB_NAME" --remote --config "$config" "$@"
}

lease_holder() {
  d1 --json --command "SELECT holder FROM preview_seed_lease WHERE id = 1" | python3 -c '
import json
import sys

rows = json.load(sys.stdin)[0].get("results", [])
print(rows[0]["holder"] if rows else "")
'
}

d1 --command "CREATE TABLE IF NOT EXISTS preview_seed_lease (id INTEGER PRIMARY KEY CHECK (id = 1), holder TEXT NOT NULL, acquiredAt INTEGER NOT NULL)" >/dev/null

acquired=0
for _ in $(seq 1 "$WAIT_ATTEMPTS"); do
  d1 --command "INSERT INTO preview_seed_lease (id, holder, acquiredAt) VALUES (1, '$HOLDER', unixepoch()) ON CONFLICT(id) DO UPDATE SET holder = excluded.holder, acquiredAt = excluded.acquiredAt WHERE preview_seed_lease.acquiredAt < unixepoch() - $LEASE_SECONDS" >/dev/null
  if [ "$(lease_holder)" = "$HOLDER" ]; then
    acquired=1
    break
  fi
  echo "==> shared preview D1 is being seeded by another run; waiting ${WAIT_SECONDS}s"
  sleep "$WAIT_SECONDS"
done
if [ "$acquired" -ne 1 ]; then
  echo "Could not take the shared preview D1 seed lease." >&2
  exit 1
fi
trap 'd1 --command "DELETE FROM preview_seed_lease WHERE id = 1 AND holder = '"'"'$HOLDER'"'"'" >/dev/null || true; rm -rf "$work"' EXIT

echo "==> applying schema, migrations and seed data to ${DB_NAME} (lease ${HOLDER})"
d1 --file db/schema.sql --yes >/dev/null
./scripts/migrate-d1.sh remote "$DB_NAME" "$DB_ID"
d1 --file db/catalog-seed.sql --yes >/dev/null
# The local fixture resets its tables; the shared database must not.
grep -v '^DELETE FROM ' dev/preview-seed.sql | sed 's/^INSERT INTO /INSERT OR IGNORE INTO /' >"$work/preview-seed.sql"
d1 --file "$work/preview-seed.sql" --yes >/dev/null
echo "==> shared preview D1 is current"
