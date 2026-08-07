#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:?usage: smoke-production.sh <base-url>}"
EXPECTED_SOURCE_URL="${2:?usage: smoke-production.sh <base-url> <source-code-url>}"
OUTPUT_DIR="${SMOKE_OUTPUT_DIR:-.artifacts/production-smoke}"
mkdir -p "${OUTPUT_DIR}"

curl --fail --silent --show-error "${BASE_URL}/" > "${OUTPUT_DIR}/index.html"
curl --fail --silent --show-error "${BASE_URL}/api/health" > "${OUTPUT_DIR}/health.json"
curl --fail --silent --show-error "${BASE_URL}/api/about" > "${OUTPUT_DIR}/about.json"
curl --fail --silent --show-error "${BASE_URL}/api/v1/jobs?limit=1" > "${OUTPUT_DIR}/v1-jobs.json"
curl --fail --silent --show-error "${BASE_URL}/api/v1/changes?limit=1" > "${OUTPUT_DIR}/v1-changes.json"

legacy_jobs_status="$(curl --silent --show-error \
  "${BASE_URL}/api/jobs" \
  -o "${OUTPUT_DIR}/legacy-jobs-disabled.json" \
  -w '%{http_code}')"
demo_status="$(curl --silent --show-error \
  -X POST "${BASE_URL}/api/demo/reset" \
  -o "${OUTPUT_DIR}/demo-reset.json" \
  -w '%{http_code}')"
nav_status="$(curl --silent --show-error \
  -X POST "${BASE_URL}/api/sources/nav/sync" \
  -o "${OUTPUT_DIR}/nav-unauthorized.json" \
  -w '%{http_code}')"
failure_status="$(curl --silent --show-error \
  "${BASE_URL}/api/sources/nav/failures" \
  -o "${OUTPUT_DIR}/failures-unauthorized.json" \
  -w '%{http_code}')"
search_status="$(curl --silent --show-error \
  "${BASE_URL}/api/v1/searches" \
  -o "${OUTPUT_DIR}/searches-unauthorized.json" \
  -w '%{http_code}')"
maintenance_status="$(curl --silent --show-error \
  "${BASE_URL}/api/admin/maintenance/audit" \
  -o "${OUTPUT_DIR}/maintenance-unauthorized.json" \
  -w '%{http_code}')"
outbox_status="$(curl --silent --show-error \
  -X POST "${BASE_URL}/api/admin/outbox/deliver" \
  -o "${OUTPUT_DIR}/outbox-unauthorized.json" \
  -w '%{http_code}')"

python3 - "${OUTPUT_DIR}" "${EXPECTED_SOURCE_URL}" "${legacy_jobs_status}" "${demo_status}" "${nav_status}" "${failure_status}" "${search_status}" "${maintenance_status}" "${outbox_status}" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
expected_source = sys.argv[2]
legacy_jobs_status, demo_status, nav_status, failure_status, search_status, maintenance_status, outbox_status = sys.argv[3:]
index_html = (root / "index.html").read_text()
health = json.loads((root / "health.json").read_text())
about = json.loads((root / "about.json").read_text())
v1_jobs = json.loads((root / "v1-jobs.json").read_text())
v1_changes = json.loads((root / "v1-changes.json").read_text())

assert "Job Index API" in index_html, index_html
assert "Reset D1 demo" not in index_html, index_html
assert health == {
    "status": "ok",
    "service": "job-index",
    "environment": "production",
}, health
assert about["service"] == "job-index", about
assert about["license"] == "proprietary", about
assert about["environment"] == "production", about
assert about["source_code_url"] == expected_source, about
assert isinstance(v1_jobs["data"], list), v1_jobs
assert isinstance(v1_changes["data"], list), v1_changes
assert legacy_jobs_status == "403", legacy_jobs_status
assert demo_status == "403", demo_status
assert nav_status == "403", nav_status
assert failure_status == "403", failure_status
assert search_status == "401", search_status
assert maintenance_status == "403", maintenance_status
assert outbox_status == "403", outbox_status

print("Production smoke assertions passed:")
print("  production landing page, health, and read API respond")
print("  legacy unbounded reads and demo mutations are disabled")
print("  operational NAV routes require authentication")
print("  owned searches require an API principal")
print("  maintenance and outbox operations require administrator authorization")
print("  no production data was mutated")
PY
