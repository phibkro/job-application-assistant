#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"

environment="${1:-staging}"
case "${environment}" in
  staging|production) ;;
  *)
    echo "usage: scripts/deploy.sh [staging|production]" >&2
    exit 2
    ;;
esac

# What the deployment is described by, for the evidence record. The Worker and
# database themselves are declared in infra/alchemy.run.ts.
config="infra/alchemy.run.ts"
state_dir=".deploy"
log_dir=".artifacts/deploy/${environment}"
database_name="${JOB_INDEX_D1_NAME:-job-index-${environment}-db}"
mkdir -p "${state_dir}" "${log_dir}"

dev_vars_file="${JOB_INDEX_DEV_VARS_FILE:-.dev.vars}"

read_dev_var() {
  local key="$1"
  python3 - "${key}" "${dev_vars_file}" <<'PY'
import pathlib, sys
key = sys.argv[1]
path = pathlib.Path(sys.argv[2])
if not path.exists():
    raise SystemExit(0)
for raw in path.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    name, value = line.split("=", 1)
    if name.strip() == key:
        print(value.strip().strip('"').strip("'"))
        break
PY
}

private_nav_token="${NAV_PRIVATE_API_TOKEN:-}"
if [ -z "${private_nav_token}" ] && [ "$(read_dev_var NAV_TOKEN_SOURCE || true)" = "private" ]; then
  private_nav_token="$(read_dev_var NAV_API_TOKEN || true)"
fi
admin_token="${ADMIN_SYNC_TOKEN:-$(read_dev_var ADMIN_SYNC_TOKEN || true)}"
source_code_url="${JOB_INDEX_SOURCE_CODE_URL:-$(read_dev_var SOURCE_CODE_URL || true)}"

if [ "${environment}" = "production" ]; then
  if [ -z "${private_nav_token}" ]; then
    echo "Production requires a NAV-issued private consumer token." >&2
    echo "Run just nav-key or provide NAV_PRIVATE_API_TOKEN." >&2
    exit 1
  fi
  if ! python3 - "${private_nav_token}" <<'PYTOKEN'
import base64
import json
import sys
import time

try:
    header, payload, signature = sys.argv[1].split(".")
    if not header or not payload or not signature:
        raise ValueError("empty JWT segment")
    payload += "=" * (-len(payload) % 4)
    claims = json.loads(base64.urlsafe_b64decode(payload))
    expires = claims.get("exp")
    if expires is not None and int(expires) <= int(time.time()):
        raise ValueError("token is expired")
except Exception as exc:
    raise SystemExit(f"Production NAV token is not a usable JWT: {exc}")
PYTOKEN
  then
    exit 1
  fi
  if [ -z "${admin_token}" ]; then
    echo "Production requires ADMIN_SYNC_TOKEN." >&2
    echo "Run just admin-key or provide ADMIN_SYNC_TOKEN." >&2
    exit 1
  fi
  if [ "${#admin_token}" -lt 32 ]; then
    echo "Production ADMIN_SYNC_TOKEN must contain at least 32 characters." >&2
    exit 1
  fi
  # A corresponding-source URL used to be required here: the AGPL obliges a
  # network deployment to offer its source. The licence is proprietary now, so
  # the obligation is gone and advertising a source URL would point at source
  # that is not published. If SOURCE_CODE_URL is still set it is passed through
  # untouched — some deployments may want to link an internal repository — but
  # nothing requires it.
fi

# A browser login is opened only when no API token or OAuth session exists.
if ! wrangler whoami >/dev/null 2>&1; then
  echo "Cloudflare authentication is required; opening Wrangler login..."
  wrangler login
fi

strip_ansi() {
  python3 -c 'import re,sys; print(re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", sys.stdin.read()), end="")'
}

run_logged() {
  local name="$1"
  shift
  "$@" 2>&1 | tee "${log_dir}/${name}.log"
}

# Alchemy declares the D1 database, Worker, bindings, and cron triggers in
# infra/alchemy.run.ts. This script runs the gates, deploys that stack, applies
# the generated database files, and records smoke evidence.
#
# Secrets are passed through the environment because the Worker's binding set
# is declared in full on each deploy — uploading them separately afterwards
# would leave them to be dropped by the next one.
deploy_stack() {
  local phase="$1"
  (
    cd infra
    ALCHEMY_STAGE="${environment}" \
    JOB_INDEX_ACTIVATE_SCHEDULES="${phase}" \
    NAV_API_TOKEN="${private_nav_token}" \
    ADMIN_SYNC_TOKEN="${admin_token}" \
    bun alchemy deploy --stage "${environment}" --yes
  )
}

if [ ! -d infra/node_modules ]; then
  echo "Installing infra dependencies..."
  run_logged infra-install bash -c "cd infra && bun install"
fi

read_stack_output() {
  python3 - "$1" <<'PYOUT'
import json
import pathlib
import sys

key = sys.argv[1]
state = sorted(pathlib.Path("infra/.alchemy/state").rglob("__stack_output__.json"))
if not state:
    raise SystemExit("")
payload = json.loads(state[-1].read_text())
value = payload
for candidate in ("output", "value", "data"):
    if isinstance(value, dict) and candidate in value:
        value = value[candidate]
print(value.get(key, "") if isinstance(value, dict) else "")
PYOUT
}

apply_database() {
  local database_id database_name database_config
  database_id="$(read_stack_output databaseId)"
  database_name="$(read_stack_output database)"
  if [ -z "${database_id}" ] || [ -z "${database_name}" ]; then
    echo "Alchemy did not report the D1 database." >&2
    exit 1
  fi

  # A newly created D1 can take time to appear in Wrangler's account listing.
  # Address the exact resource Alchemy returned instead of rediscovering it by
  # name; this also prevents a similarly named legacy database from matching.
  database_config="$(mktemp)"
  trap 'rm -f "${database_config}"' EXIT
  cat >"${database_config}" <<JSON
{
  "name": "job-index-database-apply",
  "compatibility_date": "2026-05-25",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "${database_name}",
      "database_id": "${database_id}"
    }
  ]
}
JSON

  # The snapshot creates new databases at the current shape. On an existing
  # database it leaves earlier tables in place; Wrangler then applies only the
  # ordered migrations whose target shape the snapshot could not mark current.
  echo "Applying the generated schema, ordered migrations, and researched catalogue to ${database_name}..."
  CI=1 wrangler d1 execute DB --remote --config "${database_config}" --file db/schema.sql --yes >/dev/null
  ./scripts/migrate-d1.sh remote "${database_name}" "${database_id}"
  CI=1 wrangler d1 execute DB --remote --config "${database_config}" --file db/catalog-seed.sql --yes >/dev/null

  rm -f "${database_config}"
  trap - EXIT
}

# Production publishes without cron triggers, upgrades the database, and only
# then publishes the cron-enabled version. A scheduled ingestion can therefore
# never reach a table shape from the previous release.
if [ "${environment}" = "production" ]; then
  run_logged bootstrap-publish deploy_stack 0
  apply_database
  run_logged publish deploy_stack 1
else
  run_logged publish deploy_stack 0
  apply_database
fi

nav_auth_mode="public-runtime"
if [ -n "${private_nav_token}" ]; then
  nav_auth_mode="private-secret"
fi
unset private_nav_token admin_token

deployment_url="$(read_stack_output url)"

if [ -z "${deployment_url}" ]; then
  echo "Alchemy did not report a deployed URL." >&2
  echo "Inspect ${log_dir}/publish.log." >&2
  exit 1
fi

# A freshly published Worker is not immediately answering everywhere. Smoking
# it straight away reports a 404 that means "not propagated yet", which is
# indistinguishable in the log from a genuinely missing route.
echo "Waiting for ${deployment_url} to answer..."
attempt=0
until curl --fail --silent --show-error --max-time 10 "${deployment_url}/api/health" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 30 ]; then
    echo "Deployment did not become healthy within 60 seconds." >&2
    exit 1
  fi
  sleep 2
done

# The retired Rust worker's destructive journey exercised routes that no
# longer exist. The current smoke is deliberately non-destructive: it proves
# health, service identity, and a public corpus read. It is deployment evidence
# for those paths only, not full production qualification.
SMOKE_OUTPUT_DIR="${log_dir}/smoke" ./scripts/smoke-production.sh "${deployment_url}"

python3 - "${environment}" "${deployment_url}" "${config}" "${database_name}" "${database_id}" "${nav_auth_mode}" "${source_code_url}" > "${state_dir}/${environment}.json" <<'PY'
import hashlib
import json
import pathlib
import sys
from datetime import datetime, timezone

environment, url, config_path, database_name, database_id, nav_auth_mode, source_code_url = sys.argv[1:]
config = pathlib.Path(config_path)
print(json.dumps({
    "environment": environment,
    "url": url,
    "deployed_at": datetime.now(timezone.utc).isoformat(),
    "database_name": database_name,
    "database_id": database_id,
    "nav_auth_mode": nav_auth_mode,
    "source_code_url": source_code_url or None,
    "smoke_mode": "non-destructive",
    "config_sha256": hashlib.sha256(config.read_bytes()).hexdigest(),
}, indent=2))
PY

printf '\n%s deployment ready: %s\n' "${environment}" "${deployment_url}"
printf 'D1 database: %s (%s)\n' "${database_name}" "${database_id}"
printf 'Evidence: %s/%s.json\n' "${state_dir}" "${environment}"
