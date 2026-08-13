#!/usr/bin/env bash
set -euo pipefail

required=(bun wrangler just curl python3 sqlite3 jq shellcheck)
for command in "${required[@]}"; do
  command -v "${command}" >/dev/null 2>&1 || {
    echo "Pinned Nix environment is missing '${command}'." >&2
    exit 1
  }
done

bun install --frozen-lockfile

bun install --cwd infra --frozen-lockfile --force

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  ./scripts/install-hooks.sh
fi


printf '%s\n' \
  "Pinned setup ready." \
  "  $(bun --version | sed 's/^/bun /')" \
  "  $(wrangler --version | head -n 1)"
