#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${NAV_STUB_TEST_PORT:-9798}"
work="$(mktemp -d)"
pid=""
cleanup() {
  if [ -n "${pid}" ]; then
    kill "${pid}" 2>/dev/null || true
    wait "${pid}" 2>/dev/null || true
  fi
  rm -rf "${work}"
}
trap cleanup EXIT

python3 "${root}/scripts/nav_stub.py" --port "${port}" > "${work}/stub.log" 2>&1 &
pid=$!
base="http://127.0.0.1:${port}"
attempt=0
while [ "${attempt}" -lt 30 ]; do
  curl --fail --silent "${base}/__health" >/dev/null 2>&1 && break
  kill -0 "${pid}" 2>/dev/null || { cat "${work}/stub.log" >&2; exit 1; }
  attempt=$((attempt + 1))
  sleep 0.1
done

curl --fail --silent "${base}/api/publicToken" > "${work}/token.txt"
grep -Eq '[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' "${work}/token.txt"

curl --fail --silent -H 'content-type: application/json' \
  -X POST "${base}/__control" --data '{"scenario":"happy"}' >/dev/null
curl --fail --silent -H 'Authorization: Bearer test' \
  "${base}/api/v1/feed?last=true" > "${work}/feed.json"
python3 - "${work}/feed.json" <<'PY'
import json, pathlib, sys
page = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert page["next_url"] == "/api/v1/feed?page=2", page
assert page["items"][0]["_feed_entry"]["uuid"] == "stub-active-1", page
PY

curl --fail --silent -H 'Authorization: Bearer test' \
  "${base}/api/v1/feedentry/stub-active-1" > "${work}/detail.json"
python3 - "${work}/detail.json" <<'PY'
import json, pathlib, sys
value = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert value["ad_content"]["uuid"] == "stub-active-1", value
PY

curl --fail --silent -H 'content-type: application/json' \
  -X POST "${base}/__control" --data '{"scenario":"rate_limit"}' >/dev/null
status="$(curl --silent -D "${work}/headers" -o /dev/null -w '%{http_code}' \
  -H 'Authorization: Bearer test' "${base}/api/v1/feed?last=true")"
[ "${status}" = "429" ]
grep -qi '^Retry-After: 7' "${work}/headers"

curl --fail --silent -H 'content-type: application/json' \
  -X POST "${base}/__control" --data '{"scenario":"happy"}' >/dev/null
curl --fail --silent -H 'content-type: application/json' \
  -X POST "${base}/webhook" --data '{"event":"probe"}' >/dev/null
curl --fail --silent "${base}/__webhooks" > "${work}/webhooks.json"
python3 - "${work}/webhooks.json" <<'PYWEB'
import json, pathlib, sys
value = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert value["requests"] == 1, value
assert value["payloads"] == [{"event": "probe"}], value
PYWEB

echo "NAV stub contract checks passed."
