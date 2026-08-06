#!/usr/bin/env bash
set -euo pipefail
PERSIST_DIR="${PERSIST_DIR:-.wrangler/state}"
WRANGLER_CONFIG="${WRANGLER_CONFIG:-wrangler.local.jsonc}"
mkdir -p "${PERSIST_DIR}"
CI=1 wrangler d1 migrations apply DB \
  --config "${WRANGLER_CONFIG}" \
  --local \
  --persist-to "${PERSIST_DIR}"
