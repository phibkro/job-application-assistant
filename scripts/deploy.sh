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

template="wrangler.${environment}.jsonc"
config="wrangler.${environment}.deploy.jsonc"
state_dir=".deploy"
log_dir=".artifacts/deploy/${environment}"
database_name="${JOB_INDEX_D1_NAME:-job-index-${environment}-db}"
database_location="${JOB_INDEX_D1_LOCATION:-weur}"
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
  if [[ ! "${source_code_url}" =~ ^https:// ]]; then
    echo "Production requires JOB_INDEX_SOURCE_CODE_URL or SOURCE_CODE_URL in .dev.vars." >&2
    echo "The URL must use https:// and expose the corresponding AGPL source." >&2
    exit 1
  fi
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

find_database_id() {
  local output
  output="$(wrangler d1 list --json 2>"${log_dir}/d1-list.stderr.log")"
  printf '%s' "${output}" | python3 -c '
import json, sys
name = sys.argv[1]
text = sys.stdin.read()
start = text.find("[")
end = text.rfind("]")
if start < 0 or end < start:
    raise SystemExit("wrangler d1 list did not return a JSON array")
rows = json.loads(text[start:end + 1])
for row in rows:
    if row.get("name") == name:
        print(row.get("uuid") or row.get("id") or "")
        break
' "${database_name}"
}

database_id="$(find_database_id)"
if [ -z "${database_id}" ]; then
  echo "Creating ${environment} D1 database ${database_name} in ${database_location}..."
  if ! run_logged create-d1 wrangler d1 create "${database_name}" --location "${database_location}"; then
    echo "Create returned an error; rechecking in case another deployment created it." >&2
  fi
  attempt=0
  while [ "${attempt}" -lt 10 ]; do
    database_id="$(find_database_id)"
    [ -n "${database_id}" ] && break
    attempt=$((attempt + 1))
    sleep 2
  done
fi

if [ -z "${database_id}" ]; then
  echo "D1 database ${database_name} could not be resolved after creation." >&2
  exit 1
fi

python3 - "${template}" "${config}" "${database_name}" "${database_id}" "${source_code_url}" <<'PY'
import json
import pathlib
import sys

template, target, name, database_id, source_code_url = sys.argv[1:]
config = json.loads(pathlib.Path(template).read_text())
if source_code_url:
    config.setdefault("vars", {})["SOURCE_CODE_URL"] = source_code_url
for binding in config.get("d1_databases", []):
    if binding.get("binding") == "DB":
        binding["database_name"] = name
        binding["database_id"] = database_id
        break
else:
    raise SystemExit("source config has no DB binding")
pathlib.Path(target).write_text(json.dumps(config, indent=2) + "\n")
PY

run_logged migrations env CI=1 wrangler d1 migrations apply DB --remote --config "${config}"

# Production is published in two phases so a new cron-enabled version can never
# run before its credentials exist. The bootstrap version has the same code and
# database binding but disables synchronization and omits scheduled triggers.
secret_config="${config}"
if [ "${environment}" = "production" ]; then
  bootstrap_config="${log_dir}/bootstrap.jsonc"
  python3 - "${config}" "${bootstrap_config}" <<'PYBOOTSTRAP'
import json
import pathlib
import sys

source, target = map(pathlib.Path, sys.argv[1:])
config = json.loads(source.read_text())
config.setdefault("vars", {})["NAV_SYNC_ENABLED"] = "false"
config.pop("triggers", None)
target.write_text(json.dumps(config, indent=2) + "\n")
PYBOOTSTRAP
  run_logged bootstrap-publish env CI=1 wrangler deploy --config "${bootstrap_config}"
  secret_config="${bootstrap_config}"
else
  run_logged publish env CI=1 wrangler deploy --config "${config}"
fi

nav_auth_mode="public-fallback"
if [ -n "${private_nav_token}" ]; then
  echo "Uploading configured NAV private consumer token..."
  printf '%s\n' "${private_nav_token}" \
    | env CI=1 wrangler secret put NAV_API_TOKEN --config "${secret_config}" \
      2>&1 | tee "${log_dir}/nav-secret.log"
  nav_auth_mode="private-secret"
fi
if [ -n "${admin_token}" ]; then
  echo "Uploading administrative sync token..."
  printf '%s\n' "${admin_token}" \
    | env CI=1 wrangler secret put ADMIN_SYNC_TOKEN --config "${secret_config}" \
      2>&1 | tee "${log_dir}/admin-secret.log"
fi
unset private_nav_token admin_token

if [ "${environment}" = "production" ]; then
  run_logged publish env CI=1 wrangler deploy --config "${config}"
fi

deployment_url="$(
  cat "${log_dir}/publish.log" \
    | strip_ansi \
    | grep -Eo 'https://[^[:space:]]+\.workers\.dev' \
    | tail -n 1 \
    || true
)"

if [ -z "${deployment_url}" ]; then
  echo "Could not determine the deployed workers.dev URL." >&2
  echo "Inspect ${log_dir}/publish.log." >&2
  exit 1
fi

if [ "${environment}" = "production" ]; then
  SMOKE_OUTPUT_DIR="${log_dir}/smoke" \
    ./scripts/smoke-production.sh "${deployment_url}" "${source_code_url}"
else
  SMOKE_OUTPUT_DIR="${log_dir}/smoke" ./scripts/smoke.sh "${deployment_url}"
fi

python3 - "${environment}" "${deployment_url}" "${config}" "${database_name}" "${database_id}" "${nav_auth_mode}" "${source_code_url}" > "${state_dir}/${environment}.json" <<'PY'
import hashlib
import json
import pathlib
import sys
from datetime import datetime, timezone

environment, url, config_path, database_name, database_id, nav_auth_mode, source_code_url = sys.argv[1:]
config = pathlib.Path(config_path)
lock = pathlib.Path("Cargo.lock")
print(json.dumps({
    "environment": environment,
    "url": url,
    "deployed_at": datetime.now(timezone.utc).isoformat(),
    "database_name": database_name,
    "database_id": database_id,
    "nav_auth_mode": nav_auth_mode,
    "source_code_url": source_code_url or None,
    "smoke_mode": "non-destructive" if environment == "production" else "destructive-staging",
    "config_sha256": hashlib.sha256(config.read_bytes()).hexdigest(),
    "cargo_lock_sha256": hashlib.sha256(lock.read_bytes()).hexdigest(),
}, indent=2))
PY

printf '\n%s deployment ready: %s\n' "${environment}" "${deployment_url}"
printf 'D1 database: %s (%s)\n' "${database_name}" "${database_id}"
printf 'Evidence: %s/%s.json\n' "${state_dir}" "${environment}"
