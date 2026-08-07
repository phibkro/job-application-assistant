#!/usr/bin/env bash
# Non-destructive production smoke: the two routes apps/worker/src/index.ts
# deliberately mirrors byte-for-byte across the cutover (see its
# `operationalRoutes` comment), plus a read against the public jobs feed.
#
# This used to also assert the Rust worker's demo/NAV-operational/maintenance
# routes returned 403 and that /api/jobs (legacy unbounded) was disabled. Those
# routes do not exist in the TypeScript service — there is nothing to disable
# because nothing exposes them — so those checks went with the crate that
# served them rather than being ported. See the cutover report for what that
# gives up: production has no automated proof yet that a future admin/
# maintenance surface, if one is built, defaults closed.
set -euo pipefail

BASE_URL="${1:?usage: smoke-production.sh <base-url>}"
OUTPUT_DIR="${SMOKE_OUTPUT_DIR:-.artifacts/production-smoke}"
mkdir -p "${OUTPUT_DIR}"

curl --fail --silent --show-error "${BASE_URL}/api/health" > "${OUTPUT_DIR}/health.json"
curl --fail --silent --show-error "${BASE_URL}/api/about" > "${OUTPUT_DIR}/about.json"
curl --fail --silent --show-error "${BASE_URL}/api/v1/jobs?limit=1" > "${OUTPUT_DIR}/v1-jobs.json"

python3 - "${OUTPUT_DIR}" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
health = json.loads((root / "health.json").read_text())
about = json.loads((root / "about.json").read_text())
v1_jobs = json.loads((root / "v1-jobs.json").read_text())

assert health["status"] == "ok", health
assert health["service"] == "job-index", health
assert health["environment"] == "production", health
assert about["service"] == "job-index", about
assert about["license"] == "proprietary", about
assert about["environment"] == "production", about
assert isinstance(v1_jobs["data"], list), v1_jobs

print("Production smoke assertions passed:")
print("  health and about respond with the mirrored production shape")
print("  the public jobs feed answers")
print("  no production data was mutated")
PY
