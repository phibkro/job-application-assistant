#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8787}"
STUB_URL="${NAV_STUB_URL:-http://127.0.0.1:9797}"
OUTPUT_DIR="${SMOKE_OUTPUT_DIR:-.artifacts/nav-stub-smoke}"
mkdir -p "${OUTPUT_DIR}"

control() {
  local scenario="$1"
  curl --fail --silent --show-error \
    -H 'content-type: application/json' \
    -X POST "${STUB_URL}/__control" \
    --data "{\"scenario\":\"${scenario}\"}" \
    > "${OUTPUT_DIR}/stub-${scenario}.json"
}

reset() {
  curl --fail --silent --show-error \
    -X POST "${BASE_URL}/api/demo/reset" > /dev/null
}

post_json() {
  local path="$1"
  local output="$2"
  curl --silent --show-error \
    -H 'content-type: application/json' \
    -X POST "${BASE_URL}${path}" \
    -o "${output}" \
    -w '%{http_code}'
}

# Happy bounded backfill and conditional tail polling.
reset
control happy
status="$(post_json /api/sources/nav/sync "${OUTPUT_DIR}/happy.json")"
[ "${status}" = "200" ]
status="$(post_json /api/sources/nav/sync "${OUTPUT_DIR}/happy-tail.json")"
[ "${status}" = "200" ]
curl --fail --silent --show-error "${STUB_URL}/__state" > "${OUTPUT_DIR}/happy-stub-state.json"

# Detail 404 is isolated to one observation and falls back to the feed summary.
reset
control detail_404
status="$(post_json /api/sources/nav/sync "${OUTPUT_DIR}/detail-404.json")"
[ "${status}" = "200" ]

# Rate limiting persists Retry-After and defers the immediate retry.
reset
control rate_limit
status="$(post_json /api/sources/nav/sync "${OUTPUT_DIR}/rate-limit-error.json")"
[ "${status}" = "502" ]
curl --fail --silent --show-error "${BASE_URL}/api/sources/nav/status" > "${OUTPUT_DIR}/rate-limit-status.json"
curl --fail --silent --show-error "${BASE_URL}/api/sources/nav/failures" > "${OUTPUT_DIR}/rate-limit-failures.json"
status="$(post_json /api/sources/nav/sync "${OUTPUT_DIR}/rate-limit-deferred.json")"
[ "${status}" = "200" ]

# Retryable upstream failures preserve the cursor; bounded pages fail closed.
reset
control upstream
status="$(post_json /api/sources/nav/sync "${OUTPUT_DIR}/upstream-error.json")"
[ "${status}" = "502" ]
curl --fail --silent --show-error "${BASE_URL}/api/sources/nav/status" > "${OUTPUT_DIR}/upstream-status.json"
curl --fail --silent --show-error "${BASE_URL}/api/sources/nav/failures" > "${OUTPUT_DIR}/upstream-failures.json"

reset
control oversized
status="$(post_json /api/sources/nav/sync "${OUTPUT_DIR}/oversized-error.json")"
[ "${status}" = "502" ]
curl --fail --silent --show-error "${BASE_URL}/api/sources/nav/status" > "${OUTPUT_DIR}/oversized-status.json"

# Authentication failures at either the feed or detail endpoint stop automatic retries.
reset
control detail_auth
status="$(post_json /api/sources/nav/sync "${OUTPUT_DIR}/detail-auth-error.json")"
[ "${status}" = "502" ]
curl --fail --silent --show-error "${BASE_URL}/api/sources/nav/status" > "${OUTPUT_DIR}/detail-auth-status.json"

# Malformed pages and authentication failures stop automatic retries.
reset
control malformed
status="$(post_json /api/sources/nav/sync "${OUTPUT_DIR}/malformed-error.json")"
[ "${status}" = "502" ]
curl --fail --silent --show-error "${BASE_URL}/api/sources/nav/status" > "${OUTPUT_DIR}/malformed-status.json"

reset
control auth
status="$(post_json /api/sources/nav/sync "${OUTPUT_DIR}/auth-error.json")"
[ "${status}" = "502" ]
curl --fail --silent --show-error "${BASE_URL}/api/sources/nav/status" > "${OUTPUT_DIR}/auth-status.json"

# Actual concurrent HTTP requests prove the D1 lease, not only the fixture probe.
reset
control slow_happy
curl --silent --show-error -X POST "${BASE_URL}/api/sources/nav/sync" \
  > "${OUTPUT_DIR}/concurrent-first.json" &
first_pid=$!
sleep 0.2
status="$(post_json /api/sources/nav/sync "${OUTPUT_DIR}/concurrent-second.json")"
[ "${status}" = "200" ]
wait "${first_pid}"

# Pause, resume and historical restart are executable operator controls.
reset
control happy
status="$(post_json /api/sources/nav/pause "${OUTPUT_DIR}/paused-state.json")"
[ "${status}" = "200" ]
status="$(post_json /api/sources/nav/sync "${OUTPUT_DIR}/paused-sync.json")"
[ "${status}" = "200" ]
status="$(post_json /api/sources/nav/resume "${OUTPUT_DIR}/resumed-state.json")"
[ "${status}" = "200" ]
# Restart from the tail page with an explicit JSON body.
status="$(curl --silent --show-error \
  -H 'content-type: application/json' \
  -X POST "${BASE_URL}/api/sources/nav/restart" \
  --data '{"cursor":"/api/v1/feed?page=2"}' \
  -o "${OUTPUT_DIR}/restart-state.json" \
  -w '%{http_code}')"
[ "${status}" = "200" ]
status="$(post_json /api/sources/nav/sync "${OUTPUT_DIR}/restart-sync.json")"
[ "${status}" = "200" ]

python3 - "${OUTPUT_DIR}" <<'PY'
from __future__ import annotations

import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
load = lambda name: json.loads((root / name).read_text())

happy = load("happy.json")
happy_tail = load("happy-tail.json")
happy_stub = load("happy-stub-state.json")
detail_404 = load("detail-404.json")
rate_status = load("rate-limit-status.json")["data"]
rate_failures = load("rate-limit-failures.json")["data"]
rate_deferred = load("rate-limit-deferred.json")
upstream = load("upstream-status.json")["data"]
upstream_failures = load("upstream-failures.json")["data"]
oversized = load("oversized-status.json")["data"]
detail_auth = load("detail-auth-status.json")["data"]
malformed = load("malformed-status.json")["data"]
auth = load("auth-status.json")["data"]
concurrent = [load("concurrent-first.json"), load("concurrent-second.json")]
paused_sync = load("paused-sync.json")
restart_sync = load("restart-sync.json")

assert happy["outcome"] == "completed", happy
assert happy["pages"] == 2, happy
assert happy["observations"] == 2, happy
assert happy["new_canonical_jobs"] == 2, happy
assert happy["mode_after"] == "tail", happy
assert happy["stopped_reason"] == "reached_tail", happy
assert happy_tail["not_modified"] is True, happy_tail
assert happy_tail["pages"] == 0, happy_tail
assert happy_tail["stopped_reason"] == "not_modified", happy_tail
assert happy_stub["last_if_none_match"] == '"stub-tail-v1"', happy_stub

assert detail_404["outcome"] == "completed", detail_404
assert detail_404["detail_fetches"] == 1, detail_404
assert detail_404["detail_fallbacks"] == 1, detail_404
assert detail_404["new_canonical_jobs"] == 1, detail_404

assert rate_status["cursor"] == "/api/v1/feed?last=true", rate_status
assert rate_status["last_failure_class"] == "rate_limited", rate_status
assert rate_status["retry_after_at"] is not None, rate_status
assert rate_status["consecutive_failures"] == 1, rate_status
assert rate_failures[0]["failure_class"] == "rate_limited", rate_failures
assert rate_failures[0]["retryable"] == 1, rate_failures
assert rate_deferred["outcome"] == "deferred", rate_deferred
assert rate_deferred["stopped_reason"] == "retry_backoff", rate_deferred

assert upstream["cursor"] == "/api/v1/feed?last=true", upstream
assert upstream["last_failure_class"] == "upstream", upstream
assert upstream["retry_after_at"] is not None, upstream
assert upstream_failures[0]["failure_class"] == "upstream", upstream_failures
assert upstream_failures[0]["retryable"] == 1, upstream_failures
assert oversized["mode"] == "failed", oversized
assert oversized["last_failure_class"] == "bounded_limit", oversized
assert oversized["cursor"] == "/api/v1/feed?last=true", oversized
assert detail_auth["mode"] == "failed", detail_auth
assert detail_auth["last_failure_class"] == "authentication", detail_auth
assert detail_auth["cursor"] == "/api/v1/feed?last=true", detail_auth

assert malformed["mode"] == "failed", malformed
assert malformed["last_failure_class"] == "malformed_page", malformed
assert malformed["cursor"] == "/api/v1/feed?last=true", malformed
assert auth["mode"] == "failed", auth
assert auth["last_failure_class"] == "authentication", auth
assert auth["cursor"] == "/api/v1/feed?last=true", auth

outcomes = {item["outcome"] for item in concurrent}
assert outcomes == {"completed", "busy"}, concurrent
assert any(item["stopped_reason"] == "lease_contended" for item in concurrent), concurrent
assert paused_sync["outcome"] == "paused", paused_sync
assert paused_sync["stopped_reason"] == "source_paused", paused_sync
assert restart_sync["pages"] == 1, restart_sync
assert restart_sync["cursor_before"] == "/api/v1/feed?page=2", restart_sync
assert restart_sync["mode_after"] == "tail", restart_sync

print("NAV contract smoke assertions passed:")
print("  bounded two-page backfill reaches tail")
print("  ETag tail replay returns 304 without observations")
print("  detail 404 falls back to summary")
print("  429 Retry-After is persisted and immediate retry is deferred")
print("  retryable upstream failures preserve the cursor")
print("  oversized pages fail closed before observation processing")
print("  feed and detail authentication failures stop automatic retries")
print("  malformed pages stop automatic retries")
print("  concurrent HTTP requests are serialized by the D1 lease")
print("  pause, resume, and cursor restart controls execute")
PY
