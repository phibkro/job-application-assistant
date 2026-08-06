#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8787}"
NAV_STUB_PORT="${NAV_STUB_PORT:-9797}"
PERSIST_DIR="${PERSIST_DIR:-.wrangler/test-state}"
WRANGLER_CONFIG="${WRANGLER_CONFIG:-wrangler.test.jsonc}"
LOG_DIR=".artifacts/local"
mkdir -p "${LOG_DIR}"
rm -rf "${PERSIST_DIR}"

python3 scripts/nav_stub.py --port "${NAV_STUB_PORT}" > "${LOG_DIR}/nav-stub.log" 2>&1 &
stub_pid=$!
server_pid=""
cleanup() {
  if [ -n "${server_pid}" ]; then
    kill "${server_pid}" 2>/dev/null || true
    wait "${server_pid}" 2>/dev/null || true
  fi
  kill "${stub_pid}" 2>/dev/null || true
  wait "${stub_pid}" 2>/dev/null || true
}
trap cleanup EXIT

stub_url="http://127.0.0.1:${NAV_STUB_PORT}"
_attempt=0
while [ "${_attempt}" -lt 30 ]; do
  if curl --fail --silent "${stub_url}/__health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "${stub_pid}" 2>/dev/null; then
    cat "${LOG_DIR}/nav-stub.log" >&2
    exit 1
  fi
  _attempt=$((_attempt + 1))
  sleep 0.2
done
curl --fail --silent "${stub_url}/__health" >/dev/null

PERSIST_DIR="${PERSIST_DIR}" WRANGLER_CONFIG="${WRANGLER_CONFIG}" ./scripts/migrate-local.sh

wrangler dev \
  --config "${WRANGLER_CONFIG}" \
  --local \
  --persist-to "${PERSIST_DIR}" \
  --port "${PORT}" \
  --log-level warn > "${LOG_DIR}/wrangler.log" 2>&1 &
server_pid=$!

base_url="http://127.0.0.1:${PORT}"
attempt=0
while [ "${attempt}" -lt 90 ]; do
  if curl --fail --silent "${base_url}/api/health" >/dev/null 2>&1; then
    NAV_STUB_URL="${stub_url}" \
      SMOKE_OUTPUT_DIR="${LOG_DIR}/smoke" ./scripts/smoke.sh "${base_url}"
    NAV_STUB_URL="${stub_url}" \
      SMOKE_OUTPUT_DIR="${LOG_DIR}/nav-contract" \
      ./scripts/smoke-nav-stub.sh "${base_url}"
    echo "Demo UI: ${base_url}/"
    exit 0
  fi
  if ! kill -0 "${server_pid}" 2>/dev/null; then
    cat "${LOG_DIR}/wrangler.log" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done

cat "${LOG_DIR}/wrangler.log" >&2
echo "Worker did not become healthy within 90 seconds" >&2
exit 1
