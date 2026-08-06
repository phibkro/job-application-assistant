#!/usr/bin/env bash
set -euo pipefail

required=(cargo rustc rustfmt cargo-clippy cargo-audit cc worker-build wrangler just curl python3 sqlite3 jq sha256sum)
for command in "${required[@]}"; do
  command -v "${command}" >/dev/null 2>&1 || {
    echo "Pinned Nix environment is missing '${command}'." >&2
    exit 1
  }
done

[ "$(rustc --version | awk '{print $2}')" = "1.97.1" ] || {
  echo "Expected Rust 1.97.1; found $(rustc --version)." >&2
  exit 1
}

worker-build --version | grep -q '0.8.5' || {
  echo "Expected worker-build 0.8.5; found $(worker-build --version)." >&2
  exit 1
}


wrangler --version | grep -q '4.93.0' || {
  echo "Expected Wrangler 4.93.0; found $(wrangler --version | head -n 1)." >&2
  exit 1
}

rustc --print target-libdir --target wasm32-unknown-unknown >/dev/null

if [ ! -f Cargo.lock ]; then
  cargo generate-lockfile
fi
cargo fetch --locked
mkdir -p .deploy
sha256sum Cargo.lock > .deploy/Cargo.lock.sha256

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  ./scripts/install-hooks.sh
fi

if [ "${JOB_INDEX_SKIP_NAV_TOKEN_SETUP:-0}" != "1" ]; then
  ./scripts/refresh-nav-token.sh --optional
fi

printf '%s\n' \
  "Pinned setup ready." \
  "  $(rustc --version)" \
  "  $(worker-build --version)" \
  "  $(wrangler --version | head -n 1)"
